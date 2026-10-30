class GameManager {
    constructor() {
        this.planets = [];
        this.ships = [];
        this.explosions = [];
        this.frameStats = { orbiting: new Map(), teamShips: {} };
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
        this.frameStats = { orbiting: new Map(), teamShips: {} };
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

    spawnExplosion(x, y, vx, vy) {
        this.explosions.push({ x, y, vx, vy, age: 0 });
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
            const key = this.gridKey(Math.floor(s.x / cell), Math.floor(s.y / cell));
            let bucket = grid.get(key);
            if (!bucket) { bucket = []; grid.set(key, bucket); }
            bucket.push(s);
        }
        this.frameStats = { orbiting, teamShips };
        this.shipGrid = grid;
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

        const cfg = window.GAME_CONFIG;
        for (const e of this.explosions) {
            e.age += dt;
            for (const p of this.planets) {
                const dx = p.x - e.x, dy = p.y - e.y;
                const d2 = Math.max(dx * dx + dy * dy, 1);
                const d = Math.sqrt(d2);
                if (d >= cfg.PHYSICS.SOI_RADIUS) continue;

                if (d <= p.radius) {            // reached the surface: stop dead
                    e.vx = 0; e.vy = 0;
                    break;
                }
                const a = cfg.PHYSICS.GRAV_CONST / d2;
                e.vx += (dx / d) * a * dt;
                e.vy += (dy / d) * a * dt;

                if (d < p.radius + EXPLOSION_ATMOSPHERE) {   // thin atmosphere band
                    const drag = Math.exp(-EXPLOSION_ATMO_DRAG * dt);
                    e.vx *= drag;
                    e.vy *= drag;
                }
            }
            e.x += e.vx * dt;
            e.y += e.vy * dt;
        }
        this.explosions = this.explosions.filter(e => e.age < window.GAME_CONFIG.EXPLOSION_SECONDS);

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