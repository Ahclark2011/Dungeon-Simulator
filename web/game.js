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

    isWalkable(x, y) {
        return x >= 0 && x < this.width && y >= 0 && y < this.height && this.grid[y][x] === 0;
    }
}

class Player {
    constructor(startPos) {
        this.x = startPos[0];
        this.y = startPos[1];
        this.speed = 1;
    }

    move(dx, dy, dungeon) {
        const newX = this.x + dx * this.speed;
        const newY = this.y + dy * this.speed;
        
        if (dungeon.isWalkable(newX, newY)) {
            this.x = newX;
            this.y = newY;
        }
    }
}

class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.tileSize = 32;
        this.dungeon = new DungeonGenerator(25, 25);
        this.player = new Player(this.dungeon.startPos);
        this.keys = {};
        this.setupEventListeners();
        this.gameLoop();
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

    handleInput() {
        if (this.keys['ArrowLeft']) {
            this.player.move(-1, 0, this.dungeon);
        }
        if (this.keys['ArrowRight']) {
            this.player.move(1, 0, this.dungeon);
        }
        if (this.keys['ArrowUp']) {
            this.player.move(0, -1, this.dungeon);
        }
        if (this.keys['ArrowDown']) {
            this.player.move(0, 1, this.dungeon);
        }
    }

    draw() {
        // Clear canvas
        this.ctx.fillStyle = '#000000';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw dungeon
        for (let y = 0; y < this.dungeon.height; y++) {
            for (let x = 0; x < this.dungeon.width; x++) {
                const posX = x * this.tileSize;
                const posY = y * this.tileSize;
                
                if (this.dungeon.grid[y][x] === 1) {
                    // Wall
                    this.ctx.fillStyle = '#808080';
                    this.ctx.fillRect(posX, posY, this.tileSize, this.tileSize);
                } else {
                    // Floor
                    this.ctx.strokeStyle = '#FFFFFF';
                    this.ctx.strokeRect(posX, posY, this.tileSize, this.tileSize);
                }
            }
        }

        // Draw player
        this.ctx.fillStyle = '#D2B48C';  // Tan color
        this.ctx.beginPath();
        this.ctx.arc(
            (this.player.x * this.tileSize) + (this.tileSize / 2),
            (this.player.y * this.tileSize) + (this.tileSize / 2),
            this.tileSize / 2 - 2,  // Slightly smaller than the tile to leave a small gap
            0,
            Math.PI * 2
        );
        this.ctx.fill();
    }

    gameLoop() {
        this.handleInput();
        this.draw();
        requestAnimationFrame(() => this.gameLoop());
    }
}

// Start the game when the page loads
window.onload = () => {
    new Game();
}; 