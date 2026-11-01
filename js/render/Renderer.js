class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.starCanvas = null;
        this.starKey = '';
    }

    render(gameManager, controls) {
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.drawStars(gameManager);
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
            const color = FactionManager.getColor(planet.owner, gameManager);

            // Atmosphere haze (white, so it never clashes with a takeover in progress)
            const haze = ctx.createRadialGradient(planet.x, planet.y, planet.radius, planet.x, planet.y, planet.radius + ATMOSPHERE_HEIGHT);
            haze.addColorStop(0, `rgba(200,200,200,${ATMOSPHERE_HAZE_ALPHA})`);
            haze.addColorStop(1, 'rgba(200,200,200,0)');
            ctx.fillStyle = haze;
            ctx.beginPath();
            ctx.arc(planet.x, planet.y, planet.radius + ATMOSPHERE_HEIGHT, 0, Math.PI * 2);
            ctx.fill();

            // Planet body (a freshly claimed neutral keeps its old color while the new color wipes in)
            const wiping = planet.owner !== 0 && planet.captureFromNeutral && planet.captureWaveAge < CAPTURE_WAVE_SECONDS;
            ctx.beginPath();
            ctx.arc(planet.x, planet.y, planet.radius, 0, Math.PI * 2);
            ctx.fillStyle = wiping ? FactionManager.getColor(0, gameManager) : color;
            ctx.fill();
            if (wiping) this.drawColorWipe(planet, color, planet.captureWaveAge / CAPTURE_WAVE_SECONDS);

            // Takeover: the attacker's color creeps in from the rim as HP drops
            if (planet.owner !== 0 && planet.lastAttacker !== 0 && planet.lastAttacker !== planet.owner && planet.damageShown > 0.01) {
                this.drawTakeover(planet, FactionManager.getColor(planet.lastAttacker, gameManager));
            }

            // Capture wave: glow grows from the center, then the center clears out to the rim
            if (planet.owner !== 0 && planet.captureWaveAge < CAPTURE_WAVE_SECONDS) {
                this.drawCaptureWave(planet, FactionManager.getPalette(planet.owner, gameManager).light, planet.captureWaveAge / CAPTURE_WAVE_SECONDS);
            }

            // Upgrade pulse: rings travelling outward in the owner's color
            if (planet.owner !== 0 && planet.upgradePulseAge < UPGRADE_PULSE_TOTAL) {
                this.drawUpgradePulse(planet, color);
            }
        }
    }

    // The new owner's color spreading from the center to the rim, riding just behind the wave's leading edge
    drawColorWipe(planet, color, u) {
        const ctx = this.ctx;
        const rgb = this.hexToRgb(color);
        const s = Math.max(0.001, CAPTURE_WAVE_SOFT || 0);
        const front = Math.min(1 + s, u * 2 * (1 + s));   // runs past the rim, so the rim ends fully covered

        const g = ctx.createRadialGradient(planet.x, planet.y, 0, planet.x, planet.y, planet.radius);
        const stops = [0, front - s, front, 1].map(x => Math.max(0, Math.min(1, x))).sort((a, b) => a - b);
        for (const x of stops) {
            const a = Math.max(0, Math.min(1, (front - x) / s));
            g.addColorStop(x, `rgba(${rgb},${a})`);
        }
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(planet.x, planet.y, planet.radius, 0, Math.PI * 2);
        ctx.fill();
    }

    drawCaptureWave(planet, lightColor, u) {
        const ctx = this.ctx;
        const rgb = this.hexToRgb(lightColor);
        const outer = Math.min(1, u * 2);
        const inner = Math.max(0, u * 2 - 1);
        const s = Math.max(0.001, CAPTURE_WAVE_SOFT || 0);   // 0 means crisp, never divide by zero

        const alphaAt = (x) => {
            const fromOuter = Math.max(0, Math.min(1, (outer - x) / s));
            const fromInner = inner <= 0 ? 1 : Math.max(0, Math.min(1, (x - inner) / s));
            const a = CAPTURE_WAVE_ALPHA * fromOuter * fromInner;
            return Number.isFinite(a) ? a : 0;
        };

        // Stops sit exactly on the edges of the wave, so a crisp edge stays crisp
        const points = [0, 1, outer - s, outer, inner, inner + s]
            .map(x => Math.max(0, Math.min(1, x)))
            .sort((a, b) => a - b);

        const g = ctx.createRadialGradient(planet.x, planet.y, 0, planet.x, planet.y, planet.radius);
        for (const x of points) g.addColorStop(x, `rgba(${rgb},${alphaAt(x)})`);

        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(planet.x, planet.y, planet.radius, 0, Math.PI * 2);
        ctx.fill();
    }

    drawUpgradePulse(planet, color) {
        const ctx = this.ctx;
        ctx.strokeStyle = color;
        ctx.lineWidth = UPGRADE_RING_WIDTH;
        for (let i = 0; i < UPGRADE_RING_COUNT; i++) {
            const t = (planet.upgradePulseAge - i * UPGRADE_RING_GAP) / UPGRADE_RING_SECONDS;
            if (t <= 0 || t >= 1) continue;
            ctx.globalAlpha = UPGRADE_RING_ALPHA * (1 - t);
            ctx.beginPath();
            ctx.arc(planet.x, planet.y, planet.radius + 1 + t * UPGRADE_RING_REACH, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
    }

    drawUpgradePulse(planet, color) {
        const ctx = this.ctx;
        ctx.strokeStyle = color;
        ctx.lineWidth = UPGRADE_RING_WIDTH;
        for (let i = 0; i < UPGRADE_RING_COUNT; i++) {
            const t = (planet.upgradePulseAge - i * UPGRADE_RING_GAP) / UPGRADE_RING_SECONDS;
            if (t <= 0 || t >= 1) continue;
            ctx.globalAlpha = UPGRADE_RING_ALPHA * (1 - t);
            ctx.beginPath();
            ctx.arc(planet.x, planet.y, planet.radius + 1 + t * UPGRADE_RING_REACH, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
    }

    // Soft-edged circle of the attacker's color, shrinking toward the center as damage grows
    drawTakeover(planet, attackerColor) {
        const ctx = this.ctx;
        const rgb = this.hexToRgb(attackerColor);
        const soft = Math.max(0.01, TAKEOVER_EDGE_SOFT);
        const cover = Math.min(1, planet.damageShown);
        const center = 1 + soft - cover * (1 + 2 * soft);   // where the soft edge sits, as a fraction of the radius
        const lo = center - soft, hi = center + soft;
        const alphaAt = (x) => Math.max(0, Math.min(1, (x - lo) / (hi - lo)));

        const g = ctx.createRadialGradient(planet.x, planet.y, 0, planet.x, planet.y, planet.radius);
        g.addColorStop(0, `rgba(${rgb},${alphaAt(0)})`);
        if (lo > 0 && lo < 1) g.addColorStop(lo, `rgba(${rgb},0)`);
        if (hi > 0 && hi < 1) g.addColorStop(hi, `rgba(${rgb},1)`);
        g.addColorStop(1, `rgba(${rgb},${alphaAt(1)})`);

        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(planet.x, planet.y, planet.radius, 0, Math.PI * 2);
        ctx.fill();
    }

    hexToRgb(hex) {
        const n = parseInt(hex.slice(1), 16);
        return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
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

    // Builds the star image once per map and window size
    buildStars(mapId) {
        const w = this.canvas.width, h = this.canvas.height;
        const key = w + 'x' + h + ':' + mapId;
        if (this.starKey === key) return;
        this.starKey = key;

        this.starCanvas = document.createElement('canvas');
        this.starCanvas.width = w;
        this.starCanvas.height = h;
        const g = this.starCanvas.getContext('2d');

        const dpr = Viewport.dpr;
        const size = Math.max(1, Math.round(dpr));
        const count = Math.round((w / dpr) * (h / dpr) / 1e6 * STAR_DENSITY);

        let a = STAR_SEED + mapId * 7919;   // each map gets its own sky
        const rand = () => {
            a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
        const totalW = STAR_COLORS.reduce((sum, c) => sum + c.w, 0);

        for (let i = 0; i < count; i++) {
            let pick = rand() * totalW;
            let col = STAR_COLORS[0];
            for (const c of STAR_COLORS) {
                if ((pick -= c.w) < 0) { col = c; break; }
            }
            const alpha = STAR_MIN_ALPHA + rand() * rand() * (STAR_MAX_ALPHA - STAR_MIN_ALPHA);
            g.fillStyle = `rgba(${col.rgb[0]},${col.rgb[1]},${col.rgb[2]},${alpha})`;
            g.fillRect(Math.floor(rand() * w), Math.floor(rand() * h), size, size);
        }
    }

    drawStars(gameManager) {
        this.buildStars(gameManager.mapId);
        this.ctx.drawImage(this.starCanvas, 0, 0);
    }
}