class GameManager {
    constructor() {
        this.planets = [];
        this.ships = [];
        this.explosions = [];
        this.frameStats = { orbiting: new Map(), teamShips: {}, landing: new Map() };
        this.shipGrid = new Map();
        this.telemetry = new TelemetryCollector();
        this.gameMode = 'PLAYER_VS_CPU';

        this.factionMap = {
            0: 'NEUTRAL',
            1: 'REMNANTS',
            2: 'PROTOCOL'
        };

        this.canvas = document.getElementById('game');
        this.renderer = new Renderer(this.canvas);
        this.controls = null;
        this.aiController1 = null;
        this.aiController2 = null;

        this.isRunning = false;
        this.gameTime = 0;
        this.accumulator = 0;
        this.gameSpeed = window.GAME_CONFIG.DEFAULT_SPEED;

        this.onGameOver = null; // the UI sets this to show the game-over popup
    }

    setFactionMap(team1FactionKey, team2FactionKey) {
        this.factionMap = {
            0: 'NEUTRAL',
            1: team1FactionKey,
            2: team2FactionKey
        };
    }

    setSpeed(speed) {
        this.gameSpeed = speed;
    }

    start(mapData, team1FactionKey, team2FactionKey, gameMode = 'PLAYER_VS_CPU') {
        this.reset();
        this.gameMode = gameMode;
        this.setFactionMap(team1FactionKey, team2FactionKey);

        if (this.gameMode === 'CPU_VS_CPU') {
            this.aiController1 = new AIController(this, 1);
            this.aiController2 = new AIController(this, 2);
        } else {
            this.aiController1 = null;
            this.aiController2 = new AIController(this, 2);
        }
        this.setupControls();

        this.loadMap(mapData);
        this.isRunning = true;
        this.setSpeed(window.GAME_CONFIG.DEFAULT_SPEED);
    }

    setupControls() {
        if (!this.controls) this.controls = new Controls(this.canvas, this, 1);
        this.controls.reset();
        this.controls.enabled = (this.gameMode !== 'CPU_VS_CPU');
    }

    stop() {
        this.isRunning = false;
    }

    reset() {
        this.planets = [];
        this.ships = [];
        this.explosions = [];
        this.frameStats = { orbiting: new Map(), teamShips: {}, landing: new Map() };
        this.shipGrid = new Map();
        this.gameTime = 0;
        this.accumulator = 0;
        this.telemetry.reset();
    }

    loadMap(mapData) {
        this.ships = [];
        this.planets = mapData.planets.map(p => new Planet(p.x, p.y, p.level, p.owner, this));
    }

    playSound(id, opts) {
        AudioManager.play(id, opts);
    }

    log(type, teamId, details) {
        this.telemetry.logEvent(type, teamId, details);
    }

    spawnShip(sourcePlanet, targetPlanet) {
        const ship = new Ship(sourcePlanet, targetPlanet, this);
        this.ships.push(ship);

        if (sourcePlanet.owner) this.log('SHIP_SPAWN', sourcePlanet.owner);

        return ship;
    }

    spawnExplosion(ship) {
        const c = Math.cos(ship.heading), n = Math.sin(ship.heading);
        const shards = [];
        for (let i = 0; i < HULL_POINTS.length; i++) {
            const a = HULL_POINTS[i];
            const b = HULL_POINTS[(i + 1) % HULL_POINTS.length];
            const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
            const ox = mx * c - my * n, oy = mx * n + my * c;
            const len = Math.sqrt(ox * ox + oy * oy) || 1;
            const push = SHARD_SPEED * (0.6 + Math.random() * 0.8);
            shards.push({
                x: ship.x + ox, y: ship.y + oy,
                vx: ship.vx + (ox / len) * push, vy: ship.vy + (oy / len) * push
            });
        }
        this.explosions.push({ x: ship.x, y: ship.y, vx: ship.vx, vy: ship.vy, age: 0, color: ship.color, shards });
    }

    // Moves any loose object (cloud, shard): planet gravity inside SOIs, drag in the thin
    // atmosphere band, stops dead on the surface
    driftInSpace(o, dt) {
        const cfg = window.GAME_CONFIG;
        for (const p of this.planets) {
            const dx = p.x - o.x, dy = p.y - o.y;
            const d2 = Math.max(dx * dx + dy * dy, 1);
            const d = Math.sqrt(d2);
            if (d >= cfg.PHYSICS.SOI_RADIUS) continue;
            if (d <= p.radius) { o.vx = 0; o.vy = 0; break; }
            const a = cfg.PHYSICS.GRAV_CONST / d2;
            o.vx += (dx / d) * a * dt;
            o.vy += (dy / d) * a * dt;
            if (d < p.radius + EXPLOSION_ATMOSPHERE) {
                const drag = Math.exp(-EXPLOSION_ATMO_DRAG * dt);
                o.vx *= drag;
                o.vy *= drag;
            }
        }
        o.x += o.vx * dt;
        o.y += o.vy * dt;
    }

    dispatchFleet(sourcePlanet, targetPlanet, ratio) {
        if (!sourcePlanet || !targetPlanet || sourcePlanet === targetPlanet) return;

        const availableShips = this.ships.filter(s =>
            !s.dead &&
            s.owner === sourcePlanet.owner &&
            (s.targetPlanet === sourcePlanet || s.orbitPlanet === sourcePlanet) &&
            (s.state === 'orbit' || s.state === 'surface_launch')
        );

        if (availableShips.length === 0) return;

        const count = Math.max(1, Math.floor(availableShips.length * ratio));
        const fleet = availableShips.slice(0, count);

        fleet.forEach(ship => {
            ship.orbitPlanet = sourcePlanet;
            ship.targetPlanet = targetPlanet;
            ship.state = 'launching';
            ship.launchProgress = 0;
        });
    }

    gridKey(cx, cy) {
        return (cx + 100) * 1024 + (cy + 100);
    }

    refreshFrameStats() {
        const orbiting = new Map();
        const landing = new Map();   // planet -> { owner: ships landing to claim/attack it }
        const teamShips = {};
        const grid = new Map();
        const cell = window.GAME_CONFIG.SHIP_GRID_CELL;
        for (let i = 0; i < this.ships.length; i++) {
            const s = this.ships[i];
            if (s.dead) continue;
            teamShips[s.owner] = (teamShips[s.owner] || 0) + 1;
            if (s.state === 'orbit' && s.targetPlanet) {
                orbiting.set(s.targetPlanet, (orbiting.get(s.targetPlanet) || 0) + 1);
            }
            if (s.state === 'landing' && !s.upgrading && s.targetPlanet) {
                let m = landing.get(s.targetPlanet);
                if (!m) { m = {}; landing.set(s.targetPlanet, m); }
                m[s.owner] = (m[s.owner] || 0) + 1;
            }
            const key = this.gridKey(Math.floor(s.x / cell), Math.floor(s.y / cell));
            let bucket = grid.get(key);
            if (!bucket) { bucket = []; grid.set(key, bucket); }
            bucket.push(s);
        }
        this.frameStats = { orbiting, teamShips, landing };
        this.shipGrid = grid;
    }

    // Ships of one owner currently landing on a planet (upgrade landers not counted)
    landersFor(planet, owner) {
        const m = this.frameStats.landing.get(planet);
        return m ? (m[owner] || 0) : 0;
    }

    // Called the moment a ship commits to landing, so ships deciding later this step see it
    addLander(planet, owner) {
        let m = this.frameStats.landing.get(planet);
        if (!m) { m = {}; this.frameStats.landing.set(planet, m); }
        m[owner] = (m[owner] || 0) + 1;
    }

    update(deltaTime) {
        if (!this.isRunning) return;

        if (this.gameSpeed > 0) {
            this.gameTime += deltaTime; // real-time clock, unchanged

            const cfg = window.GAME_CONFIG;
            this.accumulator += Math.min(deltaTime, 0.25) * this.gameSpeed;

            let steps = 0;
            while (this.accumulator >= cfg.SIM_STEP && this.isRunning && steps < cfg.MAX_STEPS_PER_FRAME) {
                this.step(cfg.SIM_STEP);
                this.accumulator -= cfg.SIM_STEP;
                steps++;
            }
            if (steps >= cfg.MAX_STEPS_PER_FRAME) this.accumulator = 0;
        }

        this.renderer.render(this, this.controls);

    }

    step(dt) {
        this.planets.forEach(p => p.update(dt, this));
        this.ships.forEach(s => s.update(dt, this));

        if (this.aiController1) this.aiController1.update(dt);
        if (this.aiController2) this.aiController2.update(dt);

        for (const e of this.explosions) {
            e.age += dt;
            this.driftInSpace(e, dt);
            if (e.age < SHARD_LIFE) {
                for (const s of e.shards) this.driftInSpace(s, dt);
            }
        }
        this.explosions = this.explosions.filter(e =>
            e.age < Math.max(window.GAME_CONFIG.EXPLOSION_SECONDS, SHARD_LIFE));

        this.ships = this.ships.filter(s => !s.dead);
        this.refreshFrameStats();
        this.checkWinCondition();
    }

    checkWinCondition() {
        if (!this.isRunning) return;

        const team1Planets = this.planets.filter(p => p.owner === 1).length;
        const team1Ships = this.frameStats.teamShips[1] || 0;

        const team2Planets = this.planets.filter(p => p.owner === 2).length;
        const team2Ships = this.frameStats.teamShips[2] || 0;

        const team1Alive = team1Planets > 0 || team1Ships > 0;
        const team2Alive = team2Planets > 0 || team2Ships > 0;

        if (!team2Alive && team1Alive) {
            this.endGame(1);
        } else if (!team1Alive && team2Alive) {
            this.endGame(2);
        }
    }

    // The sim only records the result. Showing it on screen is the UI's job (onGameOver).
    endGame(winningTeam) {
        this.isRunning = false;
        if (this.onGameOver) this.onGameOver(winningTeam);
    }
}