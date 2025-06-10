class DungeonGenerator {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.grid = Array(height).fill().map(() => Array(width).fill(1));
        this.startPos = null;
        this.generate();
    }

    generate() {
        // Create rooms
        const numRooms = Math.floor(Math.random() * 6) + 5; // 5-10 rooms
        for (let i = 0; i < numRooms; i++) {
            const roomWidth = Math.floor(Math.random() * 4) + 3; // 3-6
            const roomHeight = Math.floor(Math.random() * 4) + 3; // 3-6
            const x = Math.floor(Math.random() * (this.width - roomWidth - 2)) + 1;
            const y = Math.floor(Math.random() * (this.height - roomHeight - 2)) + 1;

            // Carve out room
            for (let dy = 0; dy < roomHeight; dy++) {
                for (let dx = 0; dx < roomWidth; dx++) {
                    this.grid[y + dy][x + dx] = 0;
                }
            }

            // Connect rooms
            if (this.startPos === null) {
                this.startPos = [x + Math.floor(roomWidth/2), y + Math.floor(roomHeight/2)];
            } else {
                this.createCorridor(
                    this.startPos[0], this.startPos[1],
                    x + Math.floor(roomWidth/2), y + Math.floor(roomHeight/2)
                );
            }
        }
    }

    createCorridor(x1, y1, x2, y2) {
        if (Math.random() < 0.5) {
            // First horizontal, then vertical
            for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
                this.grid[y1][x] = 0;
            }
            for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
                this.grid[y][x2] = 0;
            }
        } else {
            // First vertical, then horizontal
            for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
                this.grid[y][x1] = 0;
            }
            for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
                this.grid[y2][x] = 0;
            }
        }
    }

    isWallAtPixel(px, py, tileSize) {
        const x = Math.floor(px / tileSize);
        const y = Math.floor(py / tileSize);
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) return true;
        return this.grid[y][x] === 1;
    }
}

class Player {
    constructor(startPos, tileSize) {
        // Start in the center of the starting tile
        this.radius = tileSize / 2 - 2;
        this.x = (startPos[0] + 0.5) * tileSize;
        this.y = (startPos[1] + 0.5) * tileSize;
        this.speed = 150; // pixels per second
    }

    tryMove(dx, dy, dt, dungeon, tileSize) {
        // Calculate new position
        const newX = this.x + dx * this.speed * dt;
        const newY = this.y + dy * this.speed * dt;
        // Check collision with walls (circle vs. grid)
        if (!this.collidesWithWall(newX, this.y, dungeon, tileSize)) {
            this.x = newX;
        }
        if (!this.collidesWithWall(this.x, newY, dungeon, tileSize)) {
            this.y = newY;
        }
    }

    collidesWithWall(px, py, dungeon, tileSize) {
        // Check 8 points around the circle
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
        this.tileSize = 32;
        this.dungeon = new DungeonGenerator(25, 25);
        this.player = new Player(this.dungeon.startPos, this.tileSize);
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
        // Normalize diagonal movement
        if (dx !== 0 && dy !== 0) {
            const norm = Math.sqrt(2) / 2;
            dx *= norm;
            dy *= norm;
        }
        this.player.tryMove(dx, dy, dt, this.dungeon, this.tileSize);
    }

    draw() {
        // Clear canvas
        this.ctx.fillStyle = '#808080'; // Gray background
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Calculate offset to center the dungeon
        const dungeonPixelWidth = this.dungeon.width * this.tileSize;
        const dungeonPixelHeight = this.dungeon.height * this.tileSize;
        const offsetX = (this.canvas.width - dungeonPixelWidth) / 2;
        const offsetY = (this.canvas.height - dungeonPixelHeight) / 2;

        // Draw dungeon
        for (let y = 0; y < this.dungeon.height; y++) {
            for (let x = 0; x < this.dungeon.width; x++) {
                const posX = offsetX + x * this.tileSize;
                const posY = offsetY + y * this.tileSize;
                
                if (this.dungeon.grid[y][x] === 1) {
                    // Wall
                    this.ctx.fillStyle = '#000000';
                    this.ctx.fillRect(posX, posY, this.tileSize, this.tileSize);
                } else {
                    // Floor
                    this.ctx.strokeStyle = '#FFFFFF';
                    this.ctx.strokeRect(posX, posY, this.tileSize, this.tileSize);
                }
            }
        }

        // Draw player as a tan circle
        this.ctx.fillStyle = '#D2B48C';
        this.ctx.beginPath();
        this.ctx.arc(
            offsetX + (this.player.x),
            offsetY + (this.player.y),
            this.player.radius,
            0,
            Math.PI * 2
        );
        this.ctx.fill();
    }

    gameLoop(timestamp) {
        if (!this.lastTime) this.lastTime = timestamp;
        const dt = (timestamp - this.lastTime) / 1000; // seconds
        this.lastTime = timestamp;
        this.handleInput(dt);
        this.draw();
        requestAnimationFrame((ts) => this.gameLoop(ts));
    }
}

// Start the game when the page loads
window.onload = () => {
    new Game();
}; 