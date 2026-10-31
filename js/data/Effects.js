// Ship Hull: local points (x forward, y sideways), rotated by heading
const HULL_POINTS = [[3.5, 0], [-2.5, -2.0], [-1.0, 0], [-2.5, 2.0]];

// ---------- Laser Beam ----------
const LASER_WIDTH = 2.0;
const LASER_MUZZLE_OFFSET = 3.5;   // px in front of the ship center

// ---------- Neutral Claim Bar ----------
const CLAIM_BAR_PIECE_W = 7;      // screen px, like the label text
const CLAIM_BAR_PIECE_H = 5;
const CLAIM_BAR_GAP = 2;
const CLAIM_BAR_OUTLINE = '#000000';

// ---------- Thruster Flame ----------
const THRUSTER_OFFSET = 3.0;       // px behind the ship center
const THRUSTER_MIN_RADIUS = 0.8;
const THRUSTER_RADIUS_GAIN = 1.0;  // added at full thrust
const THRUSTER_MIN_THRUST = 0.05;  // below this, no flame is drawn
const THRUSTER_COLOR = '#FF8C1A';  // orange for now

// ---------- Ship Explosion ----------
const EXPLOSION_ATMOSPHERE = 10.0; // px above the planet surface where clouds feel drag
const EXPLOSION_ATMO_DRAG = 16.0;  // higher = clouds stop sooner inside that band

// ---------- Explosion Flash ----------
const FLASH_SECONDS = 0.2;        // how fast the white flash dies out
const FLASH_RADIUS = 12.0;         // never shrinks, only fades

// ---------- Fireball & Fade ----------
const FIREBALL_START_RADIUS = 2.0; // size at the moment of the blast
const FIREBALL_END_RADIUS = 12.0;
const FIREBALL_SOFT_CORE = 0.6;    // how far out the solid center reaches (0 = all soft, 1 = hard edge)
const FIREBALL_ALPHA = 1.0;
const FIREBALL_HOT_RGB = [255, 210, 70];   // yellow at first
const FIREBALL_COOL_RGB = [255, 140, 26];  // settles to thruster orange
const FIREBALL_BROWN_RGB = [100, 45, 15];  // burnt-out fire
const FIREBALL_SMOKE_RGB = [30, 20, 15];   // near-black smoke at the end
const FIREBALL_COOL_AT = 0.15;             // fraction of the life when yellow has settled to orange
const FIREBALL_BROWN_AT = 0.6;             // fraction of the life when it has turned brown

// ---------- Ship debris ----------
const DEBRIS_MIN = 4;                // chunks per explosion
const DEBRIS_MAX = 8;
const DEBRIS_SPEED = 8.0;            // px/s outward push on top of the ship's own velocity
const DEBRIS_SPEED_SPREAD = 0.6;     // random +/- share of that speed
const DEBRIS_LIFE = 2.0;             // seconds until the chunks have faded out
const DEBRIS_CELL = 1;               // world px per chunk cell
const DEBRIS_MAX_CELLS = 7;          // biggest chunk (inside a 3x3 grid, never all 9)
const DEBRIS_SHAPE_POOL = 24;        // random shapes made once at startup
const DEBRIS_GLINT_RATE_MIN = 10;    // flicker speed range
const DEBRIS_GLINT_RATE_MAX = 14;
const DEBRIS_GLINT_LEVEL = 0.99;     // higher = rarer glints (0.85 is roughly one moment in six)
const DEBRIS_GLINT_COLOR = '#FFFFFF';

// Random jagged chunk shapes, made once. Each is a list of [x, y] cell offsets around the chunk center.
const DEBRIS_SHAPES = (() => {
    const shapes = [];
    for (let n = 0; n < DEBRIS_SHAPE_POOL; n++) {
        const size = 1 + Math.floor(Math.random() * DEBRIS_MAX_CELLS);
        const cells = [[Math.floor(Math.random() * 3), Math.floor(Math.random() * 3)]];
        while (cells.length < size) {
            const base = cells[Math.floor(Math.random() * cells.length)];
            const dir = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(Math.random() * 4)];
            const nx = base[0] + dir[0], ny = base[1] + dir[1];
            if (nx < 0 || nx > 2 || ny < 0 || ny > 2) continue;
            if (cells.some(c => c[0] === nx && c[1] === ny)) continue;
            cells.push([nx, ny]);
        }
        shapes.push(cells.map(c => [c[0] - 1, c[1] - 1]));
    }
    return shapes;
})();
