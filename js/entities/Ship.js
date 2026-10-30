const TRANSIT_SOI_RADIUS = window.GAME_CONFIG.PHYSICS.SOI_RADIUS;

function hasLineOfSight(p1, p2, planets) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const lineLenSq = dx * dx + dy * dy;
    if (lineLenSq === 0) return true;

    for (let i = 0; i < planets.length; i++) {
        const planet = planets[i];

        const pdx = planet.x - p1.x;
        const pdy = planet.y - p1.y;
        const u = Math.max(0, Math.min(1, (pdx * dx + pdy * dy) / lineLenSq));

        const closestX = p1.x + u * dx;
        const closestY = p1.y + u * dy;
        const cdx = planet.x - closestX;
        const cdy = planet.y - closestY;
        const distSq = cdx * cdx + cdy * cdy;
        const blockRadius = planet.radius + 2;

        if (distSq < blockRadius * blockRadius) {
            return false;
        }
    }
    return true;
}

class Ship {
    constructor(sourcePlanet, targetPlanet, gameManager) {
        this.owner = sourcePlanet.owner;
        this.orbitPlanet = sourcePlanet;
        this.targetPlanet = targetPlanet;

        const faction = FactionManager.getFaction(this.owner, gameManager);
        this.color = faction.color;
        this.hp = faction.hp;
        this.laserDamage = faction.laserDamage;
        this.shootCooldown = 0;
        this.laserRange = faction.laserRange;
        this.laserCooldownMax = faction.laserCooldown;
        this.maxSpeed = faction.maxSpeed;
        this.enginePower = faction.enginePower;
        this.transitTurnRate = faction.transitTurnRate;
        this.combatTurnRate = faction.combatTurnRate;

        const baseRadius = sourcePlanet.radius;
        const spawnAngle = Math.random() * Math.PI * 2;
        const minOrbitOffset = 14;
        const maxOrbitSpread = 14;
        this.targetOrbitRadius = baseRadius + minOrbitOffset + Math.random() * maxOrbitSpread;

        this.gravConst = window.GAME_CONFIG.PHYSICS.GRAV_CONST;
        this.mass = 1.0;

        this.shootCooldown = Math.random() * 0.4;
        this.laserTarget = null;
        this.laserTimer = 0;

        this.orbitDir = Math.random() < 0.5 ? 1 : -1;
        this.launchStartAngle = spawnAngle;
        this.orbitAngle = spawnAngle;

        this.launchProgress = 0;
        this.launchDuration = 2.0;
        this.landingProgress = 0;
        this.landingDuration = 4.0;
        this.orbitTimer = 0;

        this.upgrading = false;   // true when landing on purpose to feed an upgrade
        this.aborting = false;    // true when climbing back up because the planet is already ours

        this.x = sourcePlanet.x + Math.cos(spawnAngle) * (baseRadius + 2);
        this.y = sourcePlanet.y + Math.sin(spawnAngle) * (baseRadius + 2);

        this.vx = 0;
        this.vy = 0;
        this.heading = spawnAngle;

        this.state = 'surface_launch';
        this.postLaunchState = sourcePlanet === targetPlanet ? 'orbit' : 'launching';

        this.dead = false;
        this.thrustRatio = 0;

        // Transit state (burn-based transfers)
        this.originPlanet = null;
        this.burning = false;
        this.burnSpeed = 0;
        this.departTpl = null;
    }

    // ================= HELPERS =================

    // Gravity from a planet, but only inside its sphere of influence
    addSOIGravity(planet, force) {
        if (!planet) return;
        const dx = planet.x - this.x;
        const dy = planet.y - this.y;
        const d2 = Math.max(dx * dx + dy * dy, 1);
        const d = Math.sqrt(d2);
        if (d >= TRANSIT_SOI_RADIUS) return;
        const a = this.gravConst / d2;
        force.x += (dx / d) * a;
        force.y += (dy / d) * a;
    }

    get currentTurnRate() {
        return (this.state === 'insertion' || this.state === 'orbit') ? this.combatTurnRate : this.transitTurnRate;
    }

    rotateTowards(targetHeading, dt) {
        let diff = targetHeading - this.heading;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));

        const maxTurn = this.currentTurnRate * dt;
        if (Math.abs(diff) <= maxTurn) {
            this.heading = targetHeading;
        } else {
            this.heading += Math.sign(diff) * maxTurn;
        }
    }

    // Eased turn: the turn speed ramps up and down instead of switching on and off
    rotateEased(targetHeading, dt) {
        const MAX_RATE = this.currentTurnRate;   // rad/s, top turn speed
        const GAIN = 8;                          // higher = turns harder toward the target
        const ACCEL = 50;                        // rad/s^2, how fast the turn speeds up / slows down

        const diff = Math.atan2(Math.sin(targetHeading - this.heading), Math.cos(targetHeading - this.heading));
        const want = Math.max(-MAX_RATE, Math.min(MAX_RATE, diff * GAIN));

        let v = this.turnVel || 0;
        const dv = want - v;
        const maxDv = ACCEL * dt;
        v += Math.abs(dv) <= maxDv ? dv : Math.sign(dv) * maxDv;

        this.turnVel = v;
        this.heading += v * dt;
    }

    // ================= COMBAT =================
    takeDamage(amount, gameManager, attackerOwner = null) {
        if (this.dead) return;

        this.hp -= amount;

        gameManager.log('DAMAGE_RECEIVED', this.owner, { amount });
        if (attackerOwner) gameManager.log('DAMAGE_DEALT', attackerOwner, { amount });

        if (this.hp <= 0) {
            this.dead = true;
            gameManager.spawnExplosion(this.x, this.y, this.vx, this.vy);
            gameManager.playSound('ship_explotion');
            gameManager.log('SHIP_DESTROYED', this.owner);
            if (attackerOwner && attackerOwner !== this.owner) {
                gameManager.log('SHIP_KILLED', attackerOwner);
            }
        }
    }

    findNearestEnemy(gameManager) {
        let nearestEnemy = null;
        let minDist = this.laserRange;
        const planets = gameManager.planets;
        const cell = window.GAME_CONFIG.SHIP_GRID_CELL;
        const cx = Math.floor(this.x / cell);
        const cy = Math.floor(this.y / cell);

        for (let gx = cx - 1; gx <= cx + 1; gx++) {
            for (let gy = cy - 1; gy <= cy + 1; gy++) {
                const bucket = gameManager.shipGrid.get(gameManager.gridKey(gx, gy));
                if (!bucket) continue;
                for (let i = 0; i < bucket.length; i++) {
                    const other = bucket[i];
                    if (other === this || other.dead || other.owner === this.owner) continue;

                    const edx = other.x - this.x;
                    const edy = other.y - this.y;
                    const edist = Math.sqrt(edx * edx + edy * edy);
                    if (edist < minDist && hasLineOfSight(this, other, planets)) {
                        minDist = edist;
                        nearestEnemy = other;
                    }
                }
            }
        }
        return nearestEnemy;
    }

    // The target always comes from findNearestEnemy, which already checked range and line of sight
    fireLaser(target, gameManager) {
        if (this.shootCooldown > 0 || target.dead) return;        

        target.takeDamage(this.laserDamage, gameManager, this.owner);
        gameManager.playSound('laser');
        this.laserTarget = { x: target.x, y: target.y };
        this.laserTimer = 0.08;
        this.shootCooldown = this.laserCooldownMax;
    }

    // ================= UPDATE =================

    update(dt, gameManager) {
        if (this.dead) return;

        if (this.laserTimer > 0) this.laserTimer -= dt;
        if (this.shootCooldown > 0) this.shootCooldown -= dt;

        switch (this.state) {
            case 'surface_launch': this.updateSurfaceLaunch(dt); break;
            case 'orbit':          this.updateOrbit(dt, gameManager); break;
            case 'landing':        this.updateLanding(dt, gameManager); break;
            case 'abort':          this.updateAbort(dt, gameManager); break;
            default:               this.updateTransit(dt, gameManager); break; // launching, moving, insertion
        }
    }

    // 1. Lifting off the surface into a parking orbit
    updateSurfaceLaunch(dt) {
        const planet = this.orbitPlanet;

        this.launchProgress += dt / this.launchDuration;
        const p = Math.min(1.0, this.launchProgress);

        const safeR = Math.max(1, this.targetOrbitRadius);
        const vCirc = Math.sqrt(this.gravConst / safeR);
        const omegaBase = vCirc / safeR;
        const angularVelocity = omegaBase * this.orbitDir;

        const pRad = planet.radius;
        const currentR = pRad + 2.0 + (safeR - pRad - 2.0) * Math.sin(p * Math.PI / 2);
        const turnFactor = Math.pow(p, 1.5);
        this.orbitAngle = this.launchStartAngle + angularVelocity * (this.launchDuration * 0.8) * turnFactor;

        const drdt = (safeR - pRad - 2.0) * (Math.PI / (2 * this.launchDuration)) * Math.cos(p * Math.PI / 2);
        const dthetadt = angularVelocity * 1.2 * Math.sqrt(p);

        this.x = planet.x + Math.cos(this.orbitAngle) * currentR;
        this.y = planet.y + Math.sin(this.orbitAngle) * currentR;

        this.vx = drdt * Math.cos(this.orbitAngle) - currentR * Math.sin(this.orbitAngle) * dthetadt;
        this.vy = drdt * Math.sin(this.orbitAngle) + currentR * Math.cos(this.orbitAngle) * dthetadt;

        this.heading = Math.atan2(this.vy, this.vx);
        this.thrustRatio = Math.max(0, 1.0 - Math.pow(p, 4));

        if (p >= 1.0) {
            this.thrustRatio = 0;
            this.state = this.postLaunchState;
            this.orbitTimer = 0;
        }
    }

    // 2. Circling a planet, fighting, and deciding when to land
    updateOrbit(dt, gameManager) {
        const planet = this.targetPlanet;

        const safeR = Math.max(1, this.targetOrbitRadius);
        const vCirc = Math.sqrt(this.gravConst / safeR);
        const angularVelocity = (vCirc / safeR) * this.orbitDir;

        this.orbitTimer += dt;
        this.orbitAngle += angularVelocity * dt;
        this.x = planet.x + Math.cos(this.orbitAngle) * safeR;
        this.y = planet.y + Math.sin(this.orbitAngle) * safeR;

        this.vx = -Math.sin(this.orbitAngle) * vCirc * this.orbitDir;
        this.vy = Math.cos(this.orbitAngle) * vCirc * this.orbitDir;
        this.thrustRatio = 0;

        const enemy = this.findNearestEnemy(gameManager);
        if (enemy) {
            const aimHeading = Math.atan2(enemy.y - this.y, enemy.x - this.x);
            this.rotateEased(aimHeading, dt);
            const angleDiff = Math.abs(Math.atan2(Math.sin(aimHeading - this.heading), Math.cos(aimHeading - this.heading)));
            if (angleDiff < 0.4) {
                this.fireLaser(enemy, gameManager);
            }
            return;
        }

        this.rotateEased(Math.atan2(this.vy, this.vx), dt);

        if (this.orbitTimer > 0.5) {
            const isUnclaimed = (planet.owner === 0);
            const isEnemyPlanet = (planet.owner !== 0 && planet.owner !== this.owner);

            if (isUnclaimed || isEnemyPlanet) {
                this.state = 'landing';
                this.landingProgress = 0;
            }
        }
    }

    // 3. Descending to the surface; the ship is consumed on touchdown
    updateLanding(dt, gameManager) {
        const planet = this.targetPlanet;

        if (this.shootCooldown <= 0) {
            const enemy = this.findNearestEnemy(gameManager);
            if (enemy) this.fireLaser(enemy, gameManager);
        }

        if (!this.upgrading && planet.owner === this.owner) {
            this.state = 'abort';
            return;
        }
        this.landingProgress += dt / this.landingDuration;
        const p = Math.min(1.0, this.landingProgress);

        const safeR = Math.max(1, this.targetOrbitRadius);
        const vCirc = Math.sqrt(this.gravConst / safeR);
        const omegaCirc = (vCirc / safeR) * this.orbitDir;

        const pRad = planet.radius;
        const dropDist = safeR - pRad - 1.5;
        const DESCENT_CURVE = 2.0;  // higher = gentler start, steeper finish
        const SLIDE_FADE = 2.0;     // higher = sideways drift dies off sooner

        // Radius: slow at first, then accelerating straight down
        const currentR = safeR - dropDist * Math.pow(p, DESCENT_CURVE);
        const drdt = -dropDist * DESCENT_CURVE * Math.pow(p, DESCENT_CURVE - 1) / this.landingDuration;

        // Sideways drift fades to zero at touchdown
        const dthetadt = omegaCirc * Math.pow(1.0 - p, SLIDE_FADE);
        this.orbitAngle += dthetadt * dt;

        this.x = planet.x + Math.cos(this.orbitAngle) * currentR;
        this.y = planet.y + Math.sin(this.orbitAngle) * currentR;

        this.vx = drdt * Math.cos(this.orbitAngle) - currentR * Math.sin(this.orbitAngle) * dthetadt;
        this.vy = drdt * Math.sin(this.orbitAngle) + currentR * Math.cos(this.orbitAngle) * dthetadt;

        // Always point retrograde. As the velocity turns vertical, the nose ends up
        // pointing straight up, so there's no separate rotation to fight the motion.
        this.rotateTowards(Math.atan2(-this.vy, -this.vx), dt);

        this.thrustRatio = Math.sin(p * Math.PI) * 0.85;

        if (this.aborting && p <= 0) {
            this.aborting = false;
            this.state = 'orbit';
            this.orbitTimer = 0;
            this.thrustRatio = 0;
            return;
        }

        if (p >= 1.0) {
            this.dead = true;
            planet.onShipTouchdown(this, gameManager);
        }
    }

    // 3b. Landing aborted (the planet is already ours): plan one smooth path from the
    //     ship's current position and velocity to a circular orbit, and fly it
    updateAbort(dt, gameManager) {
        const planet = this.targetPlanet;

        if (this.shootCooldown <= 0) {
            const enemy = this.findNearestEnemy(gameManager);
            if (enemy) this.fireLaser(enemy, gameManager);
        }

        const MIN_T = 0.4;           // seconds, hardest possible arc
        const SAFE_GAP = 1.0;        // px the arc must stay above the surface
        const HOLD_THRUST = 12;      // below this much thrust the nose follows the velocity
        const TURN = 4;             // rad/s nose turn rate
        const LOCK_BLEND = 0.3;      // last share of the arc where the nose settles onto the orbit path
        const THRUST_SCALE = 100;    // thrust that shows as a full plume

        const mu = this.gravConst;
        const safeR = Math.max(1, this.targetOrbitRadius);
        const pRad = planet.radius;
        const surfaceR = pRad + 1.5;
        const vCirc = Math.sqrt(mu / safeR);
        const wEnd = (vCirc / safeR) * this.orbitDir;   // angular speed of the finished orbit

        // ---------- Plan the arc once, from this ship's own state ----------
        if (!this.abortActive) {
            const dx = this.x - planet.x;
            const dy = this.y - planet.y;
            const r0 = Math.max(1, Math.sqrt(dx * dx + dy * dy));
            const ux = dx / r0, uy = dy / r0;

            this.abortR0 = r0;
            this.abortA0 = Math.atan2(dy, dx);
            this.abortVr0 = this.vx * ux + this.vy * uy;          // climb speed (negative = sinking)
            this.abortW0 = (-this.vx * uy + this.vy * ux) / r0;   // current angular speed
            this.abortX = 0;

            // Longest (smoothest) duration whose arc never dips into the planet
            const fullDist = Math.max(1, safeR - pRad - 2.0);
            const frac = Math.min(1, Math.max(0, safeR - r0) / fullDist);
            const R0 = r0, V0 = this.abortVr0;
            const lowest = (T) => {
                let m = Infinity;
                for (let i = 0; i <= 30; i++) {
                    const x = i / 30;
                    const h00 = 2 * x * x * x - 3 * x * x + 1;
                    const h10 = x * x * x - 2 * x * x + x;
                    const h01 = -2 * x * x * x + 3 * x * x;
                    m = Math.min(m, h00 * R0 + h10 * T * V0 + h01 * safeR);
                }
                return m;
            };
            let T = MIN_T;
            for (let c = 0.8 + 1.6 * frac; c >= MIN_T; c -= 0.1) {
                if (lowest(c) >= surfaceR + SAFE_GAP) { T = c; break; }
            }
            this.abortT = T;
            this.abortActive = true;
        }

        // ---------- Fly the arc ----------
        const T = this.abortT;
        const R0 = this.abortR0, V0 = this.abortVr0, W0 = this.abortW0;
        this.abortX = Math.min(1, this.abortX + dt / T);
        const x = this.abortX;
        const t = x * T;

        // Height: cubic Hermite from (R0, V0) to (safeR, 0)
        const h00 = 2 * x * x * x - 3 * x * x + 1;
        const h10 = x * x * x - 2 * x * x + x;
        const h01 = -2 * x * x * x + 3 * x * x;
        const r = h00 * R0 + h10 * T * V0 + h01 * safeR;
        const rd = ((6 * x * x - 6 * x) / T) * R0 + (3 * x * x - 4 * x + 1) * V0 + ((-6 * x * x + 6 * x) / T) * safeR;
        const rdd = ((12 * x - 6) / (T * T)) * R0 + ((6 * x - 4) / T) * V0 + ((6 - 12 * x) / (T * T)) * safeR;

        // Angle: angular speed eases from the ship's current value to orbital value
        const dW = wEnd - W0;
        const ang = this.abortA0 + W0 * t + dW * T * (x * x * x - 0.5 * x * x * x * x);
        const thd = W0 + dW * (3 * x * x - 2 * x * x * x);
        const thdd = dW * (6 * x - 6 * x * x) / T;

        const cs = Math.cos(ang), sn = Math.sin(ang);
        this.orbitAngle = ang;
        this.x = planet.x + cs * r;
        this.y = planet.y + sn * r;
        this.vx = rd * cs - r * sn * thd;
        this.vy = rd * sn + r * cs * thd;

        // Hard floor: never below the surface
        const ndx = this.x - planet.x;
        const ndy = this.y - planet.y;
        const nr = Math.max(0.001, Math.sqrt(ndx * ndx + ndy * ndy));
        if (nr < surfaceR) {
            this.x = planet.x + (ndx / nr) * surfaceR;
            this.y = planet.y + (ndy / nr) * surfaceR;
        }

        // Thrust the path needs: path acceleration plus the gravity the engine has to cancel
        const g = mu / (r * r);
        const tr = (rdd - r * thd * thd) + g;       // outward part
        const tt = r * thdd + 2 * rd * thd;         // sideways part
        const aimR = Math.max(0, tr);               // never aim the nose at the planet
        const ax = cs * aimR - sn * tt;
        const ay = sn * aimR + cs * tt;
        const am = Math.sqrt(ax * ax + ay * ay);

        const sp = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
        const vdx = sp > 0.5 ? this.vx / sp : Math.cos(this.heading);
        const vdy = sp > 0.5 ? this.vy / sp : Math.sin(this.heading);
        const adx = am > 0.001 ? ax / am : vdx;
        const ady = am > 0.001 ? ay / am : vdy;

        const w = Math.min(1, am / HOLD_THRUST);
        let wantX = adx * w + vdx * (1 - w);
        let wantY = ady * w + vdy * (1 - w);

        // Last part of the arc: nose settles fully onto the orbit path
        let c = Math.max(0, Math.min(1, (x - (1 - LOCK_BLEND)) / LOCK_BLEND));
        c = c * c * (3 - 2 * c);
        wantX = wantX * (1 - c) + vdx * c;
        wantY = wantY * (1 - c) + vdy * c;

        if (wantX * wantX + wantY * wantY > 0.0001) {
            const want = Math.atan2(wantY, wantX);
            const diff = Math.atan2(Math.sin(want - this.heading), Math.cos(want - this.heading));
            const maxTurn = TURN * dt;
            this.heading += Math.abs(diff) <= maxTurn ? diff : Math.sign(diff) * maxTurn;
        }

        const thrustMag = Math.sqrt(aimR * aimR + tt * tt);
        this.thrustRatio = Math.min(1, thrustMag / THRUST_SCALE) * (1 - c);

        // Arrived: hand over to the normal orbit
        if (x >= 1) {
            this.abortActive = false;
            this.thrustRatio = 0;
            this.orbitTimer = 0;
            this.state = 'orbit';
        }
    }

    // 4. Transit: departure burn, straight coast, capture burn
    //    (planets only pull inside their sphere of influence)
    updateTransit(dt, gameManager) {
        const target = this.targetPlanet;

        if (this.shootCooldown <= 0) {
            const enemy = this.findNearestEnemy(gameManager);
            if (enemy) this.fireLaser(enemy, gameManager);
        }

        const R = TRANSIT_SOI_RADIUS;
        const mu = this.gravConst;
        const simStep = window.GAME_CONFIG.SIM_STEP;
        const force = { x: 0, y: 0 };
        this.thrustRatio = 0;

        // Departure plan, built once per trip
        if (this.state === 'launching' && !this.departTpl && this.orbitPlanet) {
            this.targetOrbitRadius = Math.max(1, Math.round(this.targetOrbitRadius * 2) / 2);
            this.departTpl = OrbitalMath.departureTemplate(
                this.targetOrbitRadius, this.orbitDir, mu, R, this.enginePower, this.maxSpeed, simStep);
            if (!this.departTpl) {
                this.state = 'orbit';
                this.targetPlanet = this.orbitPlanet;
                return;
            }
        }
        const tpl = this.departTpl;
        const safeR = Math.max(1, this.targetOrbitRadius);
        const vCirc = Math.sqrt(mu / safeR);

        // Gravity: only the planets whose SOI we are inside
        this.addSOIGravity(this.orbitPlanet, force);
        if (this.originPlanet && this.originPlanet !== this.orbitPlanet) this.addSOIGravity(this.originPlanet, force);
        if (target !== this.orbitPlanet) this.addSOIGravity(target, force);

        if (this.state === 'launching') {
            // Returns false when the ship was placed directly (no physics step this tick)
            if (!this.stepLaunching(dt, force, tpl, target, safeR, vCirc)) return;
        } else if (this.state === 'moving') {
            this.stepMoving(dt, tpl, target);
        } else if (this.state === 'insertion') {
            this.stepInsertion(dt, force, target, mu);
        }

        this.integrateMotion(dt, force);
    }

    stepLaunching(dt, force, tpl, target, safeR, vCirc) {
        const planet = this.orbitPlanet;
        if (!planet || !tpl) return false;

        const dx = this.x - planet.x;
        const dy = this.y - planet.y;
        const r = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        const s = this.orbitDir;

        if (!this.burning) {
            // Parking orbit (on rails) until the departure window opens
            const angPrev = Math.atan2(dy, dx);
            let ang = angPrev + (vCirc / safeR) * s * dt;
            const rNew = r + (safeR - r) * Math.min(1, dt * 4);

            // Window: the orbit position whose pre-simulated escape leaves along
            // a line through the midpoint between the planets (the S-curve)
            const abx = target.x - planet.x;
            const aby = target.y - planet.y;
            const D = Math.max(1, Math.sqrt(abx * abx + aby * aby));
            const alpha = Math.asin(Math.min(1, (2 * tpl.h) / D));
            const exitDir = Math.atan2(aby, abx) + s * alpha;
            const startAng = exitDir - Math.atan2(tpl.dirY, tpl.dirX);

            const dPrev = s * Math.atan2(Math.sin(angPrev - startAng), Math.cos(angPrev - startAng));
            const dNew = s * Math.atan2(Math.sin(ang - startAng), Math.cos(ang - startAng));
            const crossing = dPrev < 0 && dNew >= 0 && dNew < 0.5 && Math.abs(rNew - safeR) < 0.05;
            if (crossing) ang = startAng;

            const rr = crossing ? safeR : rNew;
            this.orbitAngle = ang;
            this.x = planet.x + Math.cos(ang) * rr;
            this.y = planet.y + Math.sin(ang) * rr;
            this.vx = -Math.sin(ang) * vCirc * s;
            this.vy = Math.cos(ang) * vCirc * s;
            this.heading = Math.atan2(this.vy, this.vx);

            if (crossing) {
                this.burning = true;
                this.burnSpeed = tpl.vStop;
            }
            return false;
        }

        // Prograde departure burn, heading locked to velocity
        const speed = Math.max(0.001, Math.sqrt(this.vx * this.vx + this.vy * this.vy));
        if (speed >= this.burnSpeed) {
            this.burning = false;
            this.originPlanet = planet;
            this.orbitPlanet = null;
            this.state = 'moving';
        } else {
            this.heading = Math.atan2(this.vy, this.vx);
            this.thrustRatio = 1;
            force.x += (this.vx / speed) * this.enginePower;
            force.y += (this.vy / speed) * this.enginePower;
        }
        return true;
    }

    // Straight coast. Inside the target's SOI, face retrograde and wait for the capture point.
    stepMoving(dt, tpl, target) {
        const R = TRANSIT_SOI_RADIUS;
        const tdx = target.x - this.x;
        const tdy = target.y - this.y;
        const dT = Math.max(0.001, Math.sqrt(tdx * tdx + tdy * tdy));

        if (dT < R) {
            this.rotateTowards(Math.atan2(-this.vy, -this.vx), dt);
            const vr = -(tdx * this.vx + tdy * this.vy) / dT; // > 0 means moving away
            if (tpl && (dT <= tpl.rb || vr >= 0)) {
                this.state = 'insertion';
                this.orbitPlanet = target;
                this.burning = true;
            }
        } else {
            // Outside the SOI: swing retrograde early enough to be facing back when the burn starts
            const spd = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
            const flipAt = tpl ? tpl.rb + spd * (Math.PI / this.transitTurnRate) * 1.3 : R;
            const wantRetro = dT <= flipAt;
            this.rotateTowards(Math.atan2(wantRetro ? -this.vy : this.vy, wantRetro ? -this.vx : this.vx), dt);
        }
    }

    // Capture burn: the exit burn run backward, ending in a circular orbit
    stepInsertion(dt, force, target, mu) {
        const dxPos = this.x - target.x;
        const dyPos = this.y - target.y;
        const rr = Math.max(1, Math.sqrt(dxPos * dxPos + dyPos * dyPos));
        const speed = Math.max(0.001, Math.sqrt(this.vx * this.vx + this.vy * this.vy));

        if (speed > Math.sqrt(mu / rr)) {
            this.rotateTowards(Math.atan2(-this.vy, -this.vx), dt);
            this.thrustRatio = 1;
            force.x -= (this.vx / speed) * this.enginePower;
            force.y -= (this.vy / speed) * this.enginePower;
        } else {
            // Circular speed reached: settle in at this radius, in the sense we are travelling
            this.burning = false;
            this.departTpl = null;
            this.originPlanet = null;
            this.orbitDir = (dxPos * this.vy - dyPos * this.vx) >= 0 ? 1 : -1;
            this.targetOrbitRadius = Math.max(rr, target.radius + 14);
            this.orbitAngle = Math.atan2(dyPos, dxPos);
            this.orbitTimer = 0;

            // Neutral or enemy planet: land straight away (no flip). Friendly: orbit.
            if (target.owner !== this.owner) {
                this.state = 'landing';
                this.landingProgress = 0;
            } else {
                this.state = 'orbit';
            }
        }
    }

    integrateMotion(dt, force) {
        this.vx += (force.x / this.mass) * dt;
        this.vy += (force.y / this.mass) * dt;

        // Safety cap only
        const currentSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
        const speedCap = this.maxSpeed * 3.0;
        if (currentSpeed > speedCap) {
            this.vx = (this.vx / currentSpeed) * speedCap;
            this.vy = (this.vy / currentSpeed) * speedCap;
        }

        this.x += this.vx * dt;
        this.y += this.vy * dt;
    }
}