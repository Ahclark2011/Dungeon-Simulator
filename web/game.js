// --- Room-based endless dungeon ---
const ROOM_SIZE = 20;
const TILE_SIZE = 64;
const DOOR_WIDTH = 2; // doors are 2 tiles wide

class Room {
    constructor(roomX, roomY, neighbors) {
        this.roomX = roomX;
        this.roomY = roomY;
        this.grid = Array(ROOM_SIZE).fill().map(() => Array(ROOM_SIZE).fill(1));
        this.doors = this.generateDoors(neighbors);
        this.carveRoom();
    }

    generateDoors(neighbors) {
        // neighbors: {N: Room|null, S: Room|null, E: Room|null, W: Room|null}
        // Place at least 3 doors on different walls, random positions (not corners)
        const walls = ['N', 'S', 'E', 'W'];
        // Always add doors to connect to existing neighbors
        let doors = [];
        for (const dir of walls) {
            if (neighbors[dir]) doors.push(dir);
        }
        // Add random doors until we have at least 3
        while (doors.length < 3) {
            const dir = walls[Math.floor(Math.random() * 4)];
            if (!doors.includes(dir)) doors.push(dir);
        }
        // Assign random positions for each door (not at corners)
        let doorPositions = {};
        for (const dir of doors) {
            if (dir === 'N' || dir === 'S') {
                // Top or bottom wall
                let x = Math.floor(Math.random() * (ROOM_SIZE - 2 - DOOR_WIDTH + 1)) + 1;
                doorPositions[dir] = x;
            } else {
                // Left or right wall
                let y = Math.floor(Math.random() * (ROOM_SIZE - 2 - DOOR_WIDTH + 1)) + 1;
                doorPositions[dir] = y;
            }
        }
        // If neighbor exists, align door with neighbor's door
        if (neighbors['N'] && neighbors['N'].doors['S'] !== undefined) doorPositions['N'] = neighbors['N'].doors['S'];
        if (neighbors['S'] && neighbors['S'].doors['N'] !== undefined) doorPositions['S'] = neighbors['S'].doors['N'];
        if (neighbors['E'] && neighbors['E'].doors['W'] !== undefined) doorPositions['E'] = neighbors['E'].doors['W'];
        if (neighbors['W'] && neighbors['W'].doors['E'] !== undefined) doorPositions['W'] = neighbors['W'].doors['E'];
        return doorPositions;
    }

    carveRoom() {
        // Make the room open space
        for (let y = 1; y < ROOM_SIZE - 1; y++) {
            for (let x = 1; x < ROOM_SIZE - 1; x++) {
                this.grid[y][x] = 0;
            }
        }
        // Carve doors
        for (const dir in this.doors) {
            const pos = this.doors[dir];
            if (dir === 'N') {
                for (let i = 0; i < DOOR_WIDTH; i++) this.grid[0][pos + i] = 0;
            } else if (dir === 'S') {
                for (let i = 0; i < DOOR_WIDTH; i++) this.grid[ROOM_SIZE - 1][pos + i] = 0;
            } else if (dir === 'E') {
                for (let i = 0; i < DOOR_WIDTH; i++) this.grid[pos + i][ROOM_SIZE - 1] = 0;
            } else if (dir === 'W') {
                for (let i = 0; i < DOOR_WIDTH; i++) this.grid[pos + i][0] = 0;
            }
        }
    }

    isWall(localX, localY) {
        if (localX < 0 || localX >= ROOM_SIZE || localY < 0 || localY >= ROOM_SIZE) return true;
        return this.grid[localY][localX] === 1;
    }
}

class RoomDungeon {
    constructor() {
        this.rooms = new Map(); // key: `${roomX},${roomY}`
    }

    getRoom(roomX, roomY) {
        const key = `${roomX},${roomY}`;
        if (!this.rooms.has(key)) {
            // Find neighbors
            const neighbors = {
                N: this.rooms.get(`${roomX},${roomY-1}`) || null,
                S: this.rooms.get(`${roomX},${roomY+1}`) || null,
                E: this.rooms.get(`${roomX+1},${roomY}`) || null,
                W: this.rooms.get(`${roomX-1},${roomY}`) || null,
            };
            this.rooms.set(key, new Room(roomX, roomY, neighbors));
        }
        return this.rooms.get(key);
    }

    isWallAtPixel(px, py) {
        const gx = Math.floor(px / TILE_SIZE);
        const gy = Math.floor(py / TILE_SIZE);
        const roomX = Math.floor(gx / ROOM_SIZE);
        const roomY = Math.floor(gy / ROOM_SIZE);
        const localX = ((gx % ROOM_SIZE) + ROOM_SIZE) % ROOM_SIZE;
        const localY = ((gy % ROOM_SIZE) + ROOM_SIZE) % ROOM_SIZE;
        return this.getRoom(roomX, roomY).isWall(localX, localY);
    }

    forEachVisibleTile(centerPx, centerPy, screenW, screenH, callback) {
        const halfTilesX = Math.ceil(screenW / (2 * TILE_SIZE)) + 2;
        const halfTilesY = Math.ceil(screenH / (2 * TILE_SIZE)) + 2;
        const centerGx = Math.floor(centerPx / TILE_SIZE);
        const centerGy = Math.floor(centerPy / TILE_SIZE);
        for (let gy = centerGy - halfTilesY; gy <= centerGy + halfTilesY; gy++) {
            for (let gx = centerGx - halfTilesX; gx <= centerGx + halfTilesX; gx++) {
                const roomX = Math.floor(gx / ROOM_SIZE);
                const roomY = Math.floor(gy / ROOM_SIZE);
                const localX = ((gx % ROOM_SIZE) + ROOM_SIZE) % ROOM_SIZE;
                const localY = ((gy % ROOM_SIZE) + ROOM_SIZE) % ROOM_SIZE;
                const room = this.getRoom(roomX, roomY);
                callback(gx, gy, room.grid[localY][localX]);
            }
        }
    }
}

class Player {
    constructor(dungeon) {
        this.radius = TILE_SIZE / 2 - 2;
        // Find a valid spawn position in the center of the starting room
        const [spawnX, spawnY] = this.findValidSpawn(dungeon);
        this.x = spawnX;
        this.y = spawnY;
        this.speed = 300;
    }

    findValidSpawn(dungeon) {
        // Center of room (0,0)
        const room = dungeon.getRoom(0, 0);
        const center = Math.floor(ROOM_SIZE / 2);
        for (let r = 0; r < ROOM_SIZE; r++) {
            for (let dx = -r; dx <= r; dx++) {
                for (let dy = -r; dy <= r; dy++) {
                    if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
                    const lx = center + dx;
                    const ly = center + dy;
                    if (lx >= 0 && lx < ROOM_SIZE && ly >= 0 && ly < ROOM_SIZE && room.grid[ly][lx] === 0) {
                        return [lx * TILE_SIZE + TILE_SIZE / 2, ly * TILE_SIZE + TILE_SIZE / 2];
                    }
                }
            }
        }
        // fallback
        return [center * TILE_SIZE + TILE_SIZE / 2, center * TILE_SIZE + TILE_SIZE / 2];
    }

    tryMove(dx, dy, dt, dungeon) {
        const newX = this.x + dx * this.speed * dt;
        const newY = this.y + dy * this.speed * dt;
        if (!this.collidesWithWall(newX, this.y, dungeon)) {
            this.x = newX;
        }
        if (!this.collidesWithWall(this.x, newY, dungeon)) {
            this.y = newY;
        }
    }

    collidesWithWall(px, py, dungeon) {
        for (let angle = 0; angle < 2 * Math.PI; angle += Math.PI / 4) {
            const checkX = px + Math.cos(angle) * this.radius;
            const checkY = py + Math.sin(angle) * this.radius;
            if (dungeon.isWallAtPixel(checkX, checkY)) {
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
        this.dungeon = new RoomDungeon();
        this.player = new Player(this.dungeon);
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
        this.player.tryMove(dx, dy, dt, this.dungeon);
    }

    draw() {
        const screenW = this.canvas.width;
        const screenH = this.canvas.height;
        const camX = this.player.x;
        const camY = this.player.y;
        const offsetX = screenW / 2 - camX;
        const offsetY = screenH / 2 - camY;
        this.ctx.fillStyle = '#808080';
        this.ctx.fillRect(0, 0, screenW, screenH);
        this.dungeon.forEachVisibleTile(
            this.player.x, this.player.y, screenW, screenH,
            (gx, gy, val) => {
                const px = offsetX + gx * TILE_SIZE;
                const py = offsetY + gy * TILE_SIZE;
                if (val === 1) {
                    this.ctx.fillStyle = '#808080';
                    this.ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
                } else {
                    this.ctx.fillStyle = '#FFFFFF';
                    this.ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
                }
            }
        );
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