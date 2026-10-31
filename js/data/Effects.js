// Ship hull: local points (x forward, y sideways), rotated by heading
const HULL_POINTS = [[3.5, 0], [-2.5, -2.0], [-1.0, 0], [-2.5, 2.0]];

const LASER_WIDTH = 2.0;
const LASER_MUZZLE_OFFSET = 3.5;   // px in front of the ship center

// ---------- Neutral claim bar (one piece per ship needed) ----------
const CLAIM_BAR_PIECE_W = 7;      // screen px, like the label text
const CLAIM_BAR_PIECE_H = 5;
const CLAIM_BAR_GAP = 2;
const CLAIM_BAR_OUTLINE = '#000000';

// ---------- Thruster flame ----------
const THRUSTER_OFFSET = 3.0;       // px behind the ship center
const THRUSTER_MIN_RADIUS = 0.8;
const THRUSTER_RADIUS_GAIN = 1.0;  // added at full thrust
const THRUSTER_MIN_THRUST = 0.05;  // below this, no flame is drawn
const THRUSTER_COLOR = '#FF8C1A';  // orange for now

// ---------- Ship explosion ----------
const EXPLOSION_ATMOSPHERE = 10.0; // px above the planet surface where clouds feel drag
const EXPLOSION_ATMO_DRAG = 16.0;  // higher = clouds stop sooner inside that band

const FLASH_SECONDS = 0.2;        // how fast the white flash dies out
const FLASH_RADIUS = 8.0;         // never shrinks, only fades

const FIREBALL_START_RADIUS = 2.0; // size at the moment of the blast
const FIREBALL_END_RADIUS = 8.0;
const FIREBALL_ALPHA = 1.0;
const FIREBALL_HOT_RGB = [255, 210, 70];   // yellow at first
const FIREBALL_COOL_RGB = [255, 140, 26];  // settles to thruster orange
const FIREBALL_BROWN_RGB = [100, 45, 15];  // burnt-out fire
const FIREBALL_SMOKE_RGB = [30, 20, 15];   // near-black smoke at the end
const FIREBALL_COOL_AT = 0.15;              // fraction of the life when yellow has settled to orange
const FIREBALL_BROWN_AT = 0.6;             // fraction of the life when it has turned brown

const SHARD_SPEED = 10.0;          // px/s outward push on top of the ship's own velocity
const SHARD_LIFE = 2.0;            // seconds until the specks have faded out

