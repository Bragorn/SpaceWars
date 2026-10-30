class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
    }

    render(gameManager, controls) {
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        Viewport.apply(this.ctx);

        controls.draw(this.ctx);

        this.drawPlanets(gameManager);
        this.drawShips(gameManager.ships, gameManager);
        this.drawExplosions(gameManager);
        this.drawPlanetLabels(gameManager);
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    // ================= PLANETS =================

    drawPlanets(gameManager) {
        const ctx = this.ctx;

        for (const planet of gameManager.planets) {
            ctx.beginPath();
            ctx.arc(planet.x, planet.y, planet.radius, 0, Math.PI * 2);
            ctx.fillStyle = FactionManager.getColor(planet.owner, gameManager);
            ctx.fill();
        }
    }

    // Labels are drawn in screen space at a fixed size so the text stays crisp at any zoom
    drawPlanetLabels(gameManager) {
        const dpr = Viewport.dpr;
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        for (const planet of gameManager.planets) {
            const p = Viewport.toScreen(planet.x, planet.y);
            this.drawPlanetLabel(planet, gameManager, Math.round(p.x * dpr) / dpr, Math.round(p.y * dpr) / dpr);
        }
    }

    drawPlanetLabel(planet, gameManager, sx, sy) {
        const ctx = this.ctx;
        const maxTier = planet.getMaxTier();

        const lines = [
            `Ships: ${planet.getOrbitingShipsCount(gameManager)}`,
            `Lvl: ${planet.level}/${maxTier}`
        ];

        if (planet.owner !== 0) {
            lines.push(`HP: ${Math.ceil(planet.hp)}/${planet.maxHp}`);
            const upgCost = planet.getUpgradeCost();
            if (planet.level < maxTier && upgCost > 0) {
                lines.push(`Upg: ${Math.floor(planet.upgradeProgress)}/${upgCost}`);
            }
        } else {
            lines.push(`Cap: ${Math.floor(planet.upgradeProgress)}/${planet.claimCost}`);
        }

        const fontSize = 9;
        const lineHeight = 11;
        const startY = sy - (lines.length * lineHeight) / 2 + fontSize / 2;

        ctx.save();
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#000000';
        for (let i = 0; i < lines.length; i++) {
            ctx.fillText(lines[i], Math.round(sx), Math.round(startY + i * lineHeight));
        }
        ctx.restore();
    }

    // ================= SHIPS =================

    // Adds one ship hull to the current path, rotated by its heading
    addHullPath(s) {
        const ctx = this.ctx;
        const c = Math.cos(s.heading);
        const n = Math.sin(s.heading);
        for (let i = 0; i < HULL_POINTS.length; i++) {
            const lx = HULL_POINTS[i][0];
            const ly = HULL_POINTS[i][1];
            const x = s.x + lx * c - ly * n;
            const y = s.y + lx * n + ly * c;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
    }

    drawShips(ships, gameManager) {
        if (ships.length === 0) return;
        const ctx = this.ctx;

        // Group live ships by faction color
        const byColor = new Map();
        for (let i = 0; i < ships.length; i++) {
            const s = ships[i];
            if (s.dead) continue;
            let list = byColor.get(s.color);
            if (!list) { list = []; byColor.set(s.color, list); }
            list.push(s);
        }

        // Lasers: one stroke per faction
        ctx.lineWidth = LASER_WIDTH;
        for (const [color, list] of byColor) {
            let any = false;
            ctx.beginPath();
            for (let i = 0; i < list.length; i++) {
                const s = list[i];
                if (s.laserTimer > 0 && s.laserTarget) {
                    ctx.moveTo(s.x + Math.cos(s.heading) * LASER_MUZZLE_OFFSET, s.y + Math.sin(s.heading) * LASER_MUZZLE_OFFSET);
                    ctx.lineTo(s.laserTarget.x, s.laserTarget.y);
                    any = true;
                }
            }
            if (any) {
                ctx.strokeStyle = color;
                ctx.stroke();
            }
        }

        // Queued-to-depart outline: steady thin white outline around the hull while waiting for the window.
        // Shown for your own ships (both teams in spectator mode).
        const showAll = gameManager.gameMode === 'CPU_VS_CPU';
        let anyQueued = false;
        ctx.beginPath();
        for (const list of byColor.values()) {
            for (let i = 0; i < list.length; i++) {
                const s = list[i];
                if (s.state !== 'launching' || s.burning) continue;
                if (!showAll && s.owner !== 1) continue;
                this.addHullPath(s);
                anyQueued = true;
            }
        }
        if (anyQueued) {
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 2.4;
            ctx.lineJoin = 'round';
            ctx.stroke();
        }

        // Hulls: one fill per faction
        for (const [color, list] of byColor) {
            ctx.fillStyle = color;
            ctx.beginPath();
            for (let i = 0; i < list.length; i++) {
                this.addHullPath(list[i]);
            }
            ctx.fill();
        }

        // Thruster plumes: one fill, same bright orange for every faction
        let anyPlume = false;
        ctx.beginPath();
        for (const list of byColor.values()) {
            for (let i = 0; i < list.length; i++) {
                const s = list[i];
                if (s.thrustRatio <= THRUSTER_MIN_THRUST) continue;
                const px = s.x - Math.cos(s.heading) * THRUSTER_OFFSET;
                const py = s.y - Math.sin(s.heading) * THRUSTER_OFFSET;
                const r = THRUSTER_MIN_RADIUS + s.thrustRatio * THRUSTER_RADIUS_GAIN;
                ctx.moveTo(px + r, py);
                ctx.arc(px, py, r, 0, Math.PI * 2);
                anyPlume = true;
            }
        }
        if (anyPlume) {
            ctx.fillStyle = THRUSTER_COLOR;
            ctx.fill();
        }
    }

    // ================= SHIP EXPLOSIONS =================

    drawExplosions(gameManager) {
        const list = gameManager.explosions;
        if (list.length === 0) return;
        const ctx = this.ctx;
        const dur = window.GAME_CONFIG.EXPLOSION_SECONDS;

        // Debris: single-pixel specks in the ship's color
        for (const e of list) {
            if (e.age >= SHARD_LIFE) continue;
            ctx.globalAlpha = 1 - e.age / SHARD_LIFE;
            ctx.fillStyle = e.color;
            for (const s of e.shards) ctx.fillRect(s.x - 0.5, s.y - 0.5, 1, 1);
        }

        // Plume: runs from the first frame, grows fast then eases out, fades as it goes
        for (const e of list) {
            const t = Math.min(1, e.age / dur);
            const grow = 1 - (1 - t) * (1 - t) * (1 - t);
            const r = FIREBALL_START_RADIUS + (FIREBALL_END_RADIUS - FIREBALL_START_RADIUS) * grow;
            
            // yellow -> orange -> brown -> smoke
            let from, to, k;
            if (t < FIREBALL_COOL_AT) {
                from = FIREBALL_HOT_RGB; to = FIREBALL_COOL_RGB; k = t / FIREBALL_COOL_AT;
            } else if (t < FIREBALL_BROWN_AT) {
                from = FIREBALL_COOL_RGB; to = FIREBALL_BROWN_RGB; k = (t - FIREBALL_COOL_AT) / (FIREBALL_BROWN_AT - FIREBALL_COOL_AT);
            } else {
                from = FIREBALL_BROWN_RGB; to = FIREBALL_SMOKE_RGB; k = (t - FIREBALL_BROWN_AT) / (1 - FIREBALL_BROWN_AT);
            }
            const c = (i) => Math.round(from[i] + (to[i] - from[i]) * k);

            ctx.globalAlpha = FIREBALL_ALPHA * (1 - t * t);
            ctx.fillStyle = `rgb(${c(0)},${c(1)},${c(2)})`;            
            ctx.beginPath();
            ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
            ctx.fill();
        }

        // Flash: drawn on top, fixed size, only fades (fast), so the fire shows through as it goes
        ctx.fillStyle = '#FFFFFF';
        for (const e of list) {
            if (e.age >= FLASH_SECONDS) continue;
            const f = 1 - e.age / FLASH_SECONDS;
            ctx.globalAlpha = f * f;
            ctx.beginPath();
            ctx.arc(e.x, e.y, FLASH_RADIUS, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }
}