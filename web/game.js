// --- Chunk-based endless dungeon ---
class DungeonChunk {
    constructor(chunkX, chunkY, chunkSize) {
        this.chunkX = chunkX;
        this.chunkY = chunkY;
        this.chunkSize = chunkSize;
        this.grid = Array(chunkSize).fill().map(() => Array(chunkSize).fill(1));
        this.generate();
    }

    generate() {
        // Simple random room/corridor generation for each chunk
        const numRooms = Math.floor(Math.random() * 4) + 2; // 2-5 rooms per chunk
        for (let i = 0; i < numRooms; i++) {
            const roomWidth = Math.floor(Math.random() * 4) + 3; // 3-6
            const roomHeight = Math.floor(Math.random() * 4) + 3; // 3-6
            const x = Math.floor(Math.random() * (this.chunkSize - roomWidth - 2)) + 1;
            const y = Math.floor(Math.random() * (this.chunkSize - roomHeight - 2)) + 1;
            for (let dy = 0; dy < roomHeight; dy++) {
                for (let dx = 0; dx < roomWidth; dx++) {
                    this.grid[y + dy][x + dx] = 0;
                }
            }
        }
    }

    isWall(localX, localY) {
        if (localX < 0 || localX >= this.chunkSize || localY < 0 || localY >= this.chunkSize) return true;
        return this.grid[localY][localX] === 1;
    }
}

class EndlessDungeon {
    constructor(chunkSize) {
        this.chunkSize = chunkSize;
        this.chunks = new Map(); // key: `${chunkX},${chunkY}`
    }

    getChunk(chunkX, chunkY) {
        const key = `${chunkX},${chunkY}`;
        if (!this.chunks.has(key)) {
            this.chunks.set(key, new DungeonChunk(chunkX, chunkY, this.chunkSize));
        }
        return this.chunks.get(key);
    }

    isWallAtPixel(px, py, tileSize) {
        const gx = Math.floor(px / tileSize);
        const gy = Math.floor(py / tileSize);
        const chunkX = Math.floor(gx / this.chunkSize);
        const chunkY = Math.floor(gy / this.chunkSize);
        const localX = ((gx % this.chunkSize) + this.chunkSize) % this.chunkSize;
        const localY = ((gy % this.chunkSize) + this.chunkSize) % this.chunkSize;
        return this.getChunk(chunkX, chunkY).isWall(localX, localY);
    }

    forEachVisibleTile(centerPx, centerPy, tileSize, screenW, screenH, callback) {
        // Calculate visible grid bounds
        const halfTilesX = Math.ceil(screenW / (2 * tileSize)) + 2;
        const halfTilesY = Math.ceil(screenH / (2 * tileSize)) + 2;
        const centerGx = Math.floor(centerPx / tileSize);
        const centerGy = Math.floor(centerPy / tileSize);
        for (let gy = centerGy - halfTilesY; gy <= centerGy + halfTilesY; gy++) {
            for (let gx = centerGx - halfTilesX; gx <= centerGx + halfTilesX; gx++) {
                const chunkX = Math.floor(gx / this.chunkSize);
                const chunkY = Math.floor(gy / this.chunkSize);
                const localX = ((gx % this.chunkSize) + this.chunkSize) % this.chunkSize;
                const localY = ((gy % this.chunkSize) + this.chunkSize) % this.chunkSize;
                const chunk = this.getChunk(chunkX, chunkY);
                callback(gx, gy, chunk.grid[localY][localX]);
            }
        }
    }
}

class Player {
    constructor(tileSize, dungeon) {
        this.radius = tileSize / 2 - 2;
        // Find a valid spawn position near (0,0)
        const [spawnX, spawnY] = this.findValidSpawn(dungeon, tileSize);
        this.x = spawnX;
        this.y = spawnY;
        this.speed = 300; // pixels per second
    }

    findValidSpawn(dungeon, tileSize) {
        // Search a spiral out from (0,0) for a floor tile
        const maxRadius = 10;
        for (let r = 0; r <= maxRadius; r++) {
            for (let dx = -r; dx <= r; dx++) {
                for (let dy = -r; dy <= r; dy++) {
                    if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue; // Only edges
                    const px = dx * tileSize;
                    const py = dy * tileSize;
                    if (!dungeon.isWallAtPixel(px, py, tileSize)) {
                        return [px, py];
                    }
                }
            }
        }
        // Fallback: just use (0,0)
        return [0, 0];
    }

    tryMove(dx, dy, dt, dungeon, tileSize) {
        const newX = this.x + dx * this.speed * dt;
        const newY = this.y + dy * this.speed * dt;
        if (!this.collidesWithWall(newX, this.y, dungeon, tileSize)) {
            this.x = newX;
        }
        if (!this.collidesWithWall(this.x, newY, dungeon, tileSize)) {
            this.y = newY;
        }
    }

    collidesWithWall(px, py, dungeon, tileSize) {
        for (let angle = 0; angle < 2 * Math.PI; angle += Math.PI / 4) {
            const checkX = px + Math.cos(angle) * this.radius;
            const checkY = py + Math.sin(angle) * this.radius;
            if (dungeon.isWallAtPixel(checkX, checkY, tileSize)) {
                return true;
            }
        }
        return false;
    }
}

class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.tileSize = 64;
        this.dungeon = new EndlessDungeon(16); // chunk size 16x16
        this.player = new Player(this.tileSize, this.dungeon);
        this.keys = {};
        this.lastTime = null;
        this.setupEventListeners();
        requestAnimationFrame((ts) => this.gameLoop(ts));
    }

    setupEventListeners() {
        window.addEventListener('keydown', (e) => {
            this.keys[e.key] = true;
            if (e.key === 'Escape') {
                window.close();
            }
        });
        window.addEventListener('keyup', (e) => {
            this.keys[e.key] = false;
        });
    }

    handleInput(dt) {
        let dx = 0, dy = 0;
        if (this.keys['ArrowLeft'] || this.keys['a']) dx -= 1;
        if (this.keys['ArrowRight'] || this.keys['d']) dx += 1;
        if (this.keys['ArrowUp'] || this.keys['w']) dy -= 1;
        if (this.keys['ArrowDown'] || this.keys['s']) dy += 1;
        if (dx !== 0 && dy !== 0) {
            const norm = Math.sqrt(2) / 2;
            dx *= norm;
            dy *= norm;
        }
        this.player.tryMove(dx, dy, dt, this.dungeon, this.tileSize);
    }

    draw() {
        // Center camera on player
        const screenW = this.canvas.width;
        const screenH = this.canvas.height;
        const camX = this.player.x;
        const camY = this.player.y;
        const offsetX = screenW / 2 - camX;
        const offsetY = screenH / 2 - camY;

        // Fill background
        this.ctx.fillStyle = '#808080'; // Grey background
        this.ctx.fillRect(0, 0, screenW, screenH);

        // Draw visible dungeon
        this.dungeon.forEachVisibleTile(
            this.player.x, this.player.y, this.tileSize, screenW, screenH,
            (gx, gy, val) => {
                const px = offsetX + gx * this.tileSize;
                const py = offsetY + gy * this.tileSize;
                if (val === 1) {
                    // Wall
                    this.ctx.fillStyle = '#808080';
                    this.ctx.fillRect(px, py, this.tileSize, this.tileSize);
                } else {
                    // Floor
                    this.ctx.fillStyle = '#FFFFFF';
                    this.ctx.fillRect(px, py, this.tileSize, this.tileSize);
                }
            }
        );

        // Draw player as a tan circle
        this.ctx.fillStyle = '#D2B48C';
        this.ctx.beginPath();
        this.ctx.arc(screenW / 2, screenH / 2, this.player.radius, 0, Math.PI * 2);
        this.ctx.fill();
    }

    gameLoop(timestamp) {
        if (!this.lastTime) this.lastTime = timestamp;
        const dt = (timestamp - this.lastTime) / 1000;
        this.lastTime = timestamp;
        this.handleInput(dt);
        this.draw();
        requestAnimationFrame((ts) => this.gameLoop(ts));
    }
}

window.onload = () => {
    new Game();
}; 