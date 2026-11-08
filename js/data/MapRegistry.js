const GAME_MAPS = [
    {
        id: 1,
        name: "Central Fortress",
        description: "Classic layout with a contested centerpiece planet flanked by outlying outposts.",
        planets: [
            { nx: 0.06, ny: 0.50, level: 1, owner: 1 }, // Player Base
            { nx: 0.28, ny: 0.18, level: 1, owner: 0 }, // Neutral North
            { nx: 0.28, ny: 0.82, level: 1, owner: 0 }, // Neutral South
            { nx: 0.50, ny: 0.50, level: 1, owner: 0 }, // Center Fortress
            { nx: 0.72, ny: 0.18, level: 1, owner: 0 }, // Neutral North
            { nx: 0.72, ny: 0.82, level: 1, owner: 0 }, // Neutral South
            { nx: 0.94, ny: 0.50, level: 1, owner: 2 }  // AI Base
        ]
    },
    {
        id: 2,
        name: "Twin Lanes",
        description: "Two separate lanes, top and bottom, with an empty middle. Pick a lane or split your fleet.",
        planets: [
            { nx: 0.06, ny: 0.50, level: 1, owner: 1 }, // Player Base
            { nx: 0.28, ny: 0.15, level: 1, owner: 0 }, // Top Lane West
            { nx: 0.50, ny: 0.15, level: 1, owner: 0 }, // Top Lane Mid
            { nx: 0.72, ny: 0.15, level: 1, owner: 0 }, // Top Lane East
            { nx: 0.28, ny: 0.85, level: 1, owner: 0 }, // Bottom Lane West
            { nx: 0.50, ny: 0.85, level: 1, owner: 0 }, // Bottom Lane Mid
            { nx: 0.72, ny: 0.85, level: 1, owner: 0 }, // Bottom Lane East
            { nx: 0.94, ny: 0.50, level: 1, owner: 2 }  // AI Base
        ]
    },
    {
        id: 3,
        name: "The Diamond",
        description: "Four planets in a diamond around an empty center. Whoever holds the tips controls the fight.",
        planets: [
            { nx: 0.06, ny: 0.50, level: 1, owner: 1 }, // Player Base
            { nx: 0.30, ny: 0.50, level: 1, owner: 0 }, // West Tip
            { nx: 0.50, ny: 0.12, level: 1, owner: 0 }, // North Tip
            { nx: 0.50, ny: 0.88, level: 1, owner: 0 }, // South Tip
            { nx: 0.70, ny: 0.50, level: 1, owner: 0 }, // East Tip
            { nx: 0.94, ny: 0.50, level: 1, owner: 2 }  // AI Base
        ]
    },
    {
        id: 4,
        name: "Spiral Galaxy",
        description: "A pinwheel layout forcing long rotational movement around the center.",
        planets: [
            { nx: 0.06, ny: 0.50, level: 1, owner: 1 }, // Player Base
            { nx: 0.25, ny: 0.20, level: 1, owner: 0 }, // Pinwheel West-North
            { nx: 0.40, ny: 0.80, level: 1, owner: 0 }, // Pinwheel South-West
            { nx: 0.50, ny: 0.50, level: 1, owner: 0 }, // Spiral Core
            { nx: 0.60, ny: 0.20, level: 1, owner: 0 }, // Pinwheel North-East
            { nx: 0.75, ny: 0.80, level: 1, owner: 0 }, // Pinwheel East-South
            { nx: 0.94, ny: 0.50, level: 1, owner: 2 }  // AI Base
        ]
    },
    {
        id: 5,
        name: "Asymmetric Offset",
        description: "Diagonally opposite bases with irregular, staggered expansion routes.",
        planets: [
            { nx: 0.08, ny: 0.15, level: 1, owner: 1 }, // Player Base (Top Left)
            { nx: 0.25, ny: 0.45, level: 1, owner: 0 }, // Player Mid Pocket
            { nx: 0.40, ny: 0.85, level: 1, owner: 0 }, // South Buffer
            { nx: 0.60, ny: 0.15, level: 1, owner: 0 }, // North Buffer
            { nx: 0.75, ny: 0.55, level: 1, owner: 0 }, // AI Mid Pocket
            { nx: 0.92, ny: 0.85, level: 1, owner: 2 }  // AI Base (Bottom Right)
        ]
    },
    {
        id: 6,
        name: "The Pocket & Cluster",
        description: "Safe rear pockets contrasted with an immediate, volatile frontline cluster.",
        planets: [
            { nx: 0.06, ny: 0.85, level: 1, owner: 1 }, // Player Base
            { nx: 0.12, ny: 0.20, level: 1, owner: 0 }, // Safe Rear Pocket
            { nx: 0.42, ny: 0.42, level: 1, owner: 0 }, // Cluster West
            { nx: 0.50, ny: 0.58, level: 1, owner: 0 }, // Cluster Center
            { nx: 0.58, ny: 0.42, level: 1, owner: 0 }, // Cluster East
            { nx: 0.88, ny: 0.80, level: 1, owner: 0 }, // AI Rear Pocket
            { nx: 0.94, ny: 0.15, level: 1, owner: 2 }  // AI Base
        ]
    },
    {
        id: 7,
        name: "The Iron Spine",
        description: "A staggered 4-planet vertical spine driving intense mid-map competition.",
        planets: [
            { nx: 0.06, ny: 0.50, level: 1, owner: 1 }, // Player Base
            { nx: 0.46, ny: 0.10, level: 1, owner: 0 }, // Spine 1 (Top)
            { nx: 0.54, ny: 0.37, level: 1, owner: 0 }, // Spine 2
            { nx: 0.46, ny: 0.63, level: 1, owner: 0 }, // Spine 3
            { nx: 0.54, ny: 0.90, level: 1, owner: 0 }, // Spine 4 (Bottom)
            { nx: 0.94, ny: 0.50, level: 1, owner: 2 }  // AI Base
        ]
    },
    {
        id: 8,
        name: "Staggered Chevron",
        description: "Zigzagged planet placement preventing straight line pushes.",
        planets: [
            { nx: 0.06, ny: 0.50, level: 1, owner: 1 }, // Player Base
            { nx: 0.28, ny: 0.25, level: 1, owner: 0 }, // Chevron 1 Up
            { nx: 0.42, ny: 0.75, level: 1, owner: 0 }, // Chevron 2 Down
            { nx: 0.58, ny: 0.25, level: 1, owner: 0 }, // Chevron 3 Up
            { nx: 0.72, ny: 0.75, level: 1, owner: 0 }, // Chevron 4 Down
            { nx: 0.94, ny: 0.50, level: 1, owner: 2 }  // AI Base
        ]
    },
    {
        id: 9,
        name: "Crescent Bay",
        description: "Planets arc downwards, creating a tight southern corridor and empty northern space.",
        planets: [
            { nx: 0.06, ny: 0.25, level: 1, owner: 1 }, // Player Base
            { nx: 0.20, ny: 0.60, level: 1, owner: 0 }, // West Bay Rim
            { nx: 0.38, ny: 0.85, level: 1, owner: 0 }, // Southwest Apex
            { nx: 0.62, ny: 0.85, level: 1, owner: 0 }, // Southeast Apex
            { nx: 0.80, ny: 0.60, level: 1, owner: 0 }, // East Bay Rim
            { nx: 0.94, ny: 0.25, level: 1, owner: 2 }  // AI Base
        ]
    },
    {
        id: 10,
        name: "The Bowtie",
        description: "Two triangles of planets pinched together at the center, one per side.",
        planets: [
            { nx: 0.06, ny: 0.50, level: 1, owner: 1 }, // Player Base
            { nx: 0.26, ny: 0.22, level: 1, owner: 0 }, // West Triangle North
            { nx: 0.26, ny: 0.78, level: 1, owner: 0 }, // West Triangle South
            { nx: 0.42, ny: 0.50, level: 1, owner: 0 }, // West Triangle Point
            { nx: 0.58, ny: 0.50, level: 1, owner: 0 }, // East Triangle Point
            { nx: 0.74, ny: 0.22, level: 1, owner: 0 }, // East Triangle North
            { nx: 0.74, ny: 0.78, level: 1, owner: 0 }, // East Triangle South
            { nx: 0.94, ny: 0.50, level: 1, owner: 2 }  // AI Base
        ]
    }
];

class MapRegistry {
    constructor() {
        this.maps = GAME_MAPS;
    }

    getAllMaps() {
        return this.maps;
    }

    getMap(slotNum) {
        return this.maps[slotNum - 1];
    }

    getScaledMap(slotNum, width, height) {
        const rawMap = this.getMap(slotNum);

        const edgePad = 70;    // px from world edge to outermost planet centers
        const marginY = 40;
        const usableWidth = width - edgePad * 2;
        const usableHeight = height - marginY * 2;

        const xs = rawMap.planets.map(p => p.nx);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);

        return {
            ...rawMap,
            planets: rawMap.planets.map(p => ({
                x: Math.round(edgePad + ((p.nx - minX) / (maxX - minX)) * usableWidth),
                y: Math.round(marginY + p.ny * usableHeight),
                level: 1, // Strictly enforces starting level 1
                owner: p.owner
            })),
        };
    }
}