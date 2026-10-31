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
        this.drawAllPlanetInfo(gameManager);
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

    // Planet info is drawn in screen space at a fixed size so the text stays crisp at any zoom
    drawAllPlanetInfo(gameManager) {
        const dpr = Viewport.dpr;
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        for (const planet of gameManager.planets) {
            const p = Viewport.toScreen(planet.x, planet.y);
            this.drawPlanetInfo(planet, gameManager, Math.round(p.x * dpr) / dpr, Math.round(p.y * dpr) / dpr);
        }
    }

    // One planet: the claim bar if neutral, the text lines if owned
    drawPlanetInfo(planet, gameManager, sx, sy) {
        if (planet.owner === 0) {
            this.drawClaimBar(planet, gameManager, sx, sy);
            return;
        }

        const ctx = this.ctx;
        const maxTier = planet.getMaxTier();

        const lines = [
            `Ships: ${planet.getOrbitingShipsCount(gameManager)}`,
            `Lvl: ${planet.level}/${maxTier}`,
            `HP: ${Math.ceil(planet.hp)}/${planet.maxHp}`
        ];
        const upgCost = planet.getUpgradeCost();
        if (planet.level < maxTier && upgCost > 0) {
            lines.push(`Upg: ${Math.floor(planet.upgradeProgress)}/${upgCost}`);
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

    // Neutral planets: a tug-of-war bar. Team 1 fills from the left, team 2 from the right.
    drawClaimBar(planet, gameManager, sx, sy) {
        const ctx = this.ctx;
        const n = planet.claimCost;
        const filled = planet.claimOwner === 0 ? 0 : Math.max(0, Math.min(n, Math.floor(planet.upgradeProgress)));
        const color = planet.claimOwner === 0 ? null : FactionManager.getColor(planet.claimOwner, gameManager);
        const fromLeft = planet.claimOwner === 1;

        const w = CLAIM_BAR_PIECE_W, h = CLAIM_BAR_PIECE_H, gap = CLAIM_BAR_GAP;
        const x0 = Math.round(sx - (n * w + (n - 1) * gap) / 2);
        const y0 = Math.round(sy - h / 2);

        ctx.save();
        ctx.lineWidth = 1;
        ctx.strokeStyle = CLAIM_BAR_OUTLINE;
        for (let i = 0; i < n; i++) {
            const px = x0 + i * (w + gap);
            const isFilled = fromLeft ? i < filled : i >= n - filled;
            if (isFilled) {
                ctx.fillStyle = color;
                ctx.fillRect(px, y0, w, h);
            }
            ctx.strokeRect(px + 0.5, y0 + 0.5, w - 1, h - 1);
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

        // Debris: jagged pixel chunks that drift, fade, and sometimes catch a glint of light
        const cell = DEBRIS_CELL;
        for (const e of list) {
            if (e.age >= DEBRIS_LIFE) continue;
            ctx.globalAlpha = 1 - e.age / DEBRIS_LIFE;

            ctx.beginPath();   // normal chunks
            for (const d of e.debris) {
                if (Math.sin(e.age * d.glintRate + d.glintPhase) > DEBRIS_GLINT_LEVEL) continue;
                for (const c of d.shape) ctx.rect(d.x + c[0] * cell - cell / 2, d.y + c[1] * cell - cell / 2, cell, cell);
            }
            ctx.fillStyle = e.color;
            ctx.fill();

            ctx.beginPath();   // chunks catching the light
            for (const d of e.debris) {
                if (Math.sin(e.age * d.glintRate + d.glintPhase) <= DEBRIS_GLINT_LEVEL) continue;
                for (const c of d.shape) ctx.rect(d.x + c[0] * cell - cell / 2, d.y + c[1] * cell - cell / 2, cell, cell);
            }
            ctx.fillStyle = DEBRIS_GLINT_COLOR;
            ctx.fill();
        }

        // Plume: runs from the first frame, grows fast then eases out, fades as it goes
        for (const e of list) {
            const t = Math.min(1, e.age / dur);
            const grow = Math.sqrt(t);
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

            const rgb = `${c(0)},${c(1)},${c(2)}`;
            const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, r);
            g.addColorStop(0, `rgba(${rgb},1)`);
            g.addColorStop(FIREBALL_SOFT_CORE, `rgba(${rgb},0.75)`);
            g.addColorStop(1, `rgba(${rgb},0)`);

            ctx.globalAlpha = FIREBALL_ALPHA * (1 - t * t);
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
            ctx.fill();
        }

        // Flash: drawn on top, fixed size, only fades (fast), so the fire shows through as it goes
        ctx.fillStyle = '#FFFFFF';
        for (const e of list) {
            if (e.age >= FLASH_SECONDS) continue;
            const f = 1 - e.age / FLASH_SECONDS;
            const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, FLASH_RADIUS);
            g.addColorStop(0, 'rgba(255,255,255,1)');
            g.addColorStop(0.3, 'rgba(255,255,255,0.8)');
            g.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.globalAlpha = f * f;
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(e.x, e.y, FLASH_RADIUS, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }
}