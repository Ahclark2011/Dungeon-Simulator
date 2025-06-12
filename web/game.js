// --- Room-based endless dungeon ---
const ROOM_SIZE = 28;
const TILE_SIZE = 64;
const DOOR_WIDTH = 2; // doors are 2 tiles wide

class Enemy {
    constructor(x, y, radius = TILE_SIZE / 2 - 6) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.avoidanceRadius = radius + 10; // New: Larger radius for wall avoidance
        this.color = '#c0392b'; // red
        this.speed = 120;
        this.reload = 0; // attack cooldown
        this.hp = 5;
        this.dead = false;
        this.knockback = {x: 0, y: 0, t: 0};
        this.deathTimer = 0; // for visual indicator
        this.damageNumbers = [];
    }
    addDamageNumber(amount) {
        // Random position within enemy circle
        const angle = Math.random() * 2 * Math.PI;
        const r = Math.random() * this.radius; // Use full radius for more spread
        const ox = Math.cos(angle) * r;
        const oy = Math.sin(angle) * r - 20; // Start 20 pixels higher
        this.damageNumbers.push({
            amount,
            ox,
            oy,
            t: 0,
            fadeStart: 0.5, // Start fading after 0.5 seconds
            opacity: 1.0,
            vy: 50, // Start moving downward
            gravity: 600, // Reduced gravity for more controlled falling
            bounce: 0.8, // Increased bounce for more dramatic bounces
            originalY: oy // Store the original Y position for bounce reference
        });
    }
    updateDamageNumbers(dt) {
        this.damageNumbers.forEach(dn => {
            dn.t += dt;
            // Only start fading after fadeStart time
            if (dn.t > dn.fadeStart) {
                dn.opacity = Math.max(0, 1.0 - ((dn.t - dn.fadeStart) * 1.2));
            }
            
            // Apply gravity and bounce
            dn.vy += dn.gravity * dt;
            dn.oy += dn.vy * dt;
            
            // If the number has fallen below its original position and is moving down
            if (dn.oy > dn.originalY + 30 && dn.vy > 0) { // Added offset for more bounce room
                // Bounce with reduced velocity
                dn.vy = -dn.vy * dn.bounce;
                // If the bounce is too small, stop the number
                if (Math.abs(dn.vy) < 30) { // Reduced minimum velocity for more bounces
                    dn.vy = 0;
                    dn.oy = dn.originalY + 30; // Stop at the bounce point
                }
            }
        });
        // Remove numbers that have faded out or stopped moving
        this.damageNumbers = this.damageNumbers.filter(dn => 
            dn.t < 2.0 && (dn.vy !== 0 || dn.oy !== dn.originalY + 30)
        );
    }
    moveToward(player, dt, others, dungeon) {
        if (this.dead) return;
        // Repel from other enemies
        let repelX = 0, repelY = 0;
        for (const other of others) {
            if (other === this || other.dead) continue;
            const dx = this.x - other.x;
            const dy = this.y - other.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            if (dist < this.radius * 2 && dist > 0) {
                repelX += dx / dist * (this.radius * 2 - dist);
                repelY += dy / dist * (this.radius * 2 - dist);
            }
        }
        // Move toward player, but stop at edge
        let dx = player.x - this.x;
        let dy = player.y - this.y;
        let dist = Math.sqrt(dx*dx + dy*dy);
        let stopDist = this.radius + player.radius; // Removed the -6 to allow closer approach
        if (dist > 0 && dist > stopDist) {
            dx /= dist;
            dy /= dist;
        } else {
            dx = 0; dy = 0;
        }
        // Combine movement
        let vx = dx * this.speed * dt + repelX * 0.5 * dt;
        let vy = dy * this.speed * dt + repelY * 0.5 * dt;
        // Knockback
        if (this.knockback.t > 0) {
            // Clamp knockback direction to not push into player
            let kx = this.knockback.x, ky = this.knockback.y;
            const px = player.x - this.x;
            const py = player.y - this.y;
            const pdist = Math.sqrt(px*px + py*py);
            if (pdist < this.radius + player.radius + 2 && pdist > 0) {
                // Push away from player
                kx = -px / pdist * Math.abs(this.knockback.x);
                ky = -py / pdist * Math.abs(this.knockback.y);
            }
            vx += kx * dt;
            vy += ky * dt;
            this.knockback.t -= dt;
        }
        // Try to move, but don't go through walls or out of bounds
        const tryMove = (nx, ny) => {
            for (let angle = 0; angle < 2 * Math.PI; angle += Math.PI / 4) {
                const checkX = nx + Math.cos(angle) * this.avoidanceRadius; // Use avoidanceRadius
                const checkY = ny + Math.sin(angle) * this.avoidanceRadius; // Use avoidanceRadius
                if (dungeon.isWallAtPixel(checkX, checkY)) return false;
            }
            if (nx < -10000 || nx > 10000 || ny < -10000 || ny > 10000) return false;
            // Don't move into player, but allow closer approach
            const px = player.x - nx;
            const py = player.y - ny;
            if (Math.sqrt(px*px + py*py) < this.radius + player.radius - 4) return false; // Changed from -2 to -4
            return true;
        };
        if (tryMove(this.x + vx, this.y)) this.x += vx;
        if (tryMove(this.x, this.y + vy)) this.y += vy;
    }
    canAttack(player) {
        if (this.dead) return false;
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        return dist < this.radius + player.radius + 4; // Changed from -2 to +4 to increase attack range
    }
    takeDamage(knockX, knockY, amount = 1) {
        if (this.dead) return;
        this.hp -= amount;
        this.addDamageNumber(amount);
        if (this.hp <= 0) {
            this.dead = true;
            this.deathTimer = 1.0; // show indicator for 1 second
        } else {
            // Apply knockback
            this.knockback.x = knockX * 600;
            this.knockback.y = knockY * 600;
            this.knockback.t = 0.2;
        }
    }
}

class Room {
    constructor(roomX, roomY) {
        this.roomX = roomX;
        this.roomY = roomY;
        this.enemies = [];
        this.droppedItems = []; // New: Array to hold items dropped in this room
        this.grid = Array(ROOM_SIZE).fill().map(() => Array(ROOM_SIZE).fill(1));
        this.doors = {}; // Initialize doors as empty, they will be generated in setupRoom
        this.hasGeneratedEnemies = false; // Flag to ensure enemies are spawned only once
    }

    setupRoom(neighbors, playerSpawn, isStartRoom = false) {
        this.neighbors = neighbors;
        this.doors = this.generateDoors(neighbors);
        this.carveRoom();
        this.spawnEnemies(playerSpawn);
    }

    generateDoors(neighbors) {
        const doors = {};
        const wallPositions = {
            N: Math.floor(ROOM_SIZE / 2) - Math.floor(DOOR_WIDTH / 2),
            S: Math.floor(ROOM_SIZE / 2) - Math.floor(DOOR_WIDTH / 2),
            E: Math.floor(ROOM_SIZE / 2) - Math.floor(DOOR_WIDTH / 2),
            W: Math.floor(ROOM_SIZE / 2) - Math.floor(DOOR_WIDTH / 2)
        };

        // 1. Prioritize connecting to existing neighbors with matching doors
        if (neighbors.N && neighbors.N.doors && neighbors.N.doors.S !== undefined) {
            doors.N = neighbors.N.doors.S;
        }
        if (neighbors.S && neighbors.S.doors && neighbors.S.doors.N !== undefined) {
            doors.S = neighbors.S.doors.N;
        }
        if (neighbors.E && neighbors.E.doors && neighbors.E.doors.W !== undefined) {
            doors.E = neighbors.E.doors.W;
        }
        if (neighbors.W && neighbors.W.doors && neighbors.W.doors.E !== undefined) {
            doors.W = neighbors.W.doors.E;
        }

        // 2. Add random doors until we have at least 3, only if not already connected to a neighbor
        const possibleDirections = ['N', 'S', 'E', 'W'];
        const availableDirections = possibleDirections.filter(dir => doors[dir] === undefined);

        // Shuffle available directions to randomize which ones are chosen
        for (let i = availableDirections.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [availableDirections[i], availableDirections[j]] = [availableDirections[j], availableDirections[i]];
        }
        
        for (let i = 0; Object.keys(doors).length < 3 && i < availableDirections.length; i++) {
            const dir = availableDirections[i];
            doors[dir] = wallPositions[dir]; // Use the consistent centered position
        }
        
        return doors;
    }

    carveRoom() {
        // Initialize all tiles to wall (1)
        for (let y = 0; y < ROOM_SIZE; y++) {
            for (let x = 0; x < ROOM_SIZE; x++) {
                this.grid[y][x] = 1; 
            }
        }

        // Carve out the main playable area (floor) with a 1-tile wall border
        for (let y = 1; y < ROOM_SIZE - 1; y++) {
            for (let x = 1; x < ROOM_SIZE - 1; x++) {
                this.grid[y][x] = 0; // Set to floor (0)
            }
        }
        
        // Carve out doors
        for (const [dir, pos] of Object.entries(this.doors)) {
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

    spawnEnemies(playerSpawn) {
        // Only spawn enemies if they haven't been spawned yet
        if (this.hasGeneratedEnemies) return;
        
        const numEnemies = Math.floor(Math.random() * 3) + 2; // 2-4 enemies
        console.log(`[Room] Spawning ${numEnemies} enemies in room: (${this.roomX}, ${this.roomY})`);
        for (let i = 0; i < numEnemies; i++) {
            let x, y;
            do {
                x = Math.floor(Math.random() * (ROOM_SIZE - 4)) + 2;
                y = Math.floor(Math.random() * (ROOM_SIZE - 4)) + 2;
            } while (
                this.grid[y][x] !== 0 || 
                (playerSpawn && Math.abs(x - playerSpawn[0]) < 3 && Math.abs(y - playerSpawn[1]) < 3)
            );
            
            const enemy = new Enemy(
                (this.roomX * ROOM_SIZE + x) * TILE_SIZE + TILE_SIZE/2,
                (this.roomY * ROOM_SIZE + y) * TILE_SIZE + TILE_SIZE/2
            );
            this.enemies.push(enemy);
        }
        this.hasGeneratedEnemies = true;
    }

    isWall(localX, localY) {
        if (localX < 0 || localX >= ROOM_SIZE || localY < 0 || localY >= ROOM_SIZE) return true;
        return this.grid[localY][localX] === 1;
    }
}

class RoomDungeon {
    constructor() {
        this.rooms = new Map();
        this.lastRoomKey = null;
        this.roomCount = 0; // Re-introduce room count for potential future limits
        this.ROOM_LIMIT = 10000; // Set a high limit for now
    }

    generateRoom(roomX, roomY, playerSpawn, isStartRoom = false) {
        const key = `${roomX},${roomY}`;
        if (!this.rooms.has(key)) {
            if (this.roomCount >= this.ROOM_LIMIT) {
                console.error('ROOM LIMIT EXCEEDED! Not generating more rooms.');
                return undefined;
            }
            this.roomCount++;
            console.log(`[RoomDungeon] Generating room: (${roomX}, ${roomY}), total rooms: ${this.roomCount}, isStartRoom: ${isStartRoom}`);
            
            const neighbors = {
                N: this.rooms.get(`${roomX},${roomY-1}`) || null,
                S: this.rooms.get(`${roomX},${roomY+1}`) || null,
                E: this.rooms.get(`${roomX+1},${roomY}`) || null,
                W: this.rooms.get(`${roomX-1},${roomY}`) || null,
            };
            
            const room = new Room(roomX, roomY);
            this.rooms.set(key, room);
        }
        return this.rooms.get(key);
    }

    loadAdjacentRooms(centerX, centerY, playerSpawn, isStartRoom = false) {
        console.log(`[RoomDungeon] Loading adjacent rooms for center: (${centerX}, ${centerY})`);
        
        // Pass 1: Ensure all rooms in the 3x3 grid are created and added to the map
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const nx = centerX + dx;
                const ny = centerY + dy;
                this.generateRoom(nx, ny); // Just create the room, no setup yet
            }
        }

        // Pass 2: Now that all rooms exist, setup each room (generate doors, carve, spawn enemies)
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const nx = centerX + dx;
                const ny = centerY + dy;
                const room = this.getRoom(nx, ny);
                if (room) {
                    // Gather neighbors for the current room from the already generated rooms
                    const neighbors = {
                        N: this.getRoom(nx, ny - 1),
                        S: this.getRoom(nx, ny + 1),
                        E: this.getRoom(nx + 1, ny),
                        W: this.getRoom(nx - 1, ny),
                    };
                    // Determine if this is the player's current room for enemy spawning
                    const currentRoomPlayerSpawn = (dx === 0 && dy === 0) ? playerSpawn : null;
                    const currentRoomIsStartRoom = (nx === 0 && ny === 0 && isStartRoom);

                    room.setupRoom(neighbors, currentRoomPlayerSpawn, currentRoomIsStartRoom);
                }
            }
        }
    }

    getRoom(roomX, roomY) {
        return this.rooms.get(`${roomX},${roomY}`);
    }

    isWallAtPixel(px, py) {
        const gx = Math.floor(px / TILE_SIZE);
        const gy = Math.floor(py / TILE_SIZE);
        const roomX = Math.floor(gx / ROOM_SIZE);
        const roomY = Math.floor(gy / ROOM_SIZE);
        const localX = ((gx % ROOM_SIZE) + ROOM_SIZE) % ROOM_SIZE; // Ensure positive modulo
        const localY = ((gy % ROOM_SIZE) + ROOM_SIZE) % ROOM_SIZE; // Ensure positive modulo

        console.log(`[isWallAtPixel] Global tile: (${gx}, ${gy}), Room: (${roomX}, ${roomY}), Local tile: (${localX}, ${localY})`);

        const room = this.getRoom(roomX, roomY);
        console.log(`[isWallAtPixel] Retrieved room: ${room ? 'Exists' : 'Undefined/Null'}`);

        return room?.isWall(localX, localY) ?? true;
    }

    forEachVisibleTile(centerPx, centerPy, screenW, screenH, callback) {
        const halfTilesX = Math.ceil(screenW / (2 * TILE_SIZE)) + 2;
        const halfTilesY = Math.ceil(screenH / (2 * TILE_SIZE)) + 2;
        const centerTileX = Math.floor(centerPx / TILE_SIZE);
        const centerTileY = Math.floor(centerPy / TILE_SIZE);
        
        for (let dy = -halfTilesY; dy <= halfTilesY; dy++) {
            for (let dx = -halfTilesX; dx <= halfTilesX; dx++) {
                const gx = centerTileX + dx;
                const gy = centerTileY + dy;
                const roomX = Math.floor(gx / ROOM_SIZE);
                const roomY = Math.floor(gy / ROOM_SIZE);
                const localX = ((gx % ROOM_SIZE) + ROOM_SIZE) % ROOM_SIZE; // Ensure positive modulo
                const localY = ((gy % ROOM_SIZE) + ROOM_SIZE) % ROOM_SIZE; // Ensure positive modulo
                
                const room = this.generateRoom(roomX, roomY, null, false);
                if (room && room.grid) {
                    callback(gx, gy, room.grid[localY][localX]);
                } else {
                    callback(gx, gy, 1);
                }
            }
        }
    }
}

class Player {
    constructor(dungeon) {
        this.radius = TILE_SIZE / 2 - 2;
        const [spawnX, spawnY, spawnTile] = this.findValidSpawn(dungeon);
        this.x = spawnX;
        this.y = spawnY;
        this.speed = 300;
        this.spawnTile = spawnTile;
        this.hp = 5;
        this.swinging = false;
        this.swingAngle = 0;
        this.swingTime = 0;
        this.mouseAngle = 0;
        this.hands = [0, 0];
        this.swingStartAngle = 0;
        this.swingDir = 1;
        this.hitEnemiesThisSwing = new Set();
        this.inventory = Array(40).fill(null); // Initialize 40 inventory slots (10 hotbar + 30 extended)
        this.extendedInventoryOpen = false; // New: Track if the extended inventory is open
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
                        return [lx * TILE_SIZE + TILE_SIZE / 2, ly * TILE_SIZE + TILE_SIZE / 2, [lx, ly]];
                    }
                }
            }
        }
        // fallback
        return [center * TILE_SIZE + TILE_SIZE / 2, center * TILE_SIZE + TILE_SIZE / 2, [center, center]];
    }

    tryMove(dx, dy, dt, dungeon) {
        const newX = this.x + dx * this.speed * dt;
        const newY = this.y + dy * this.speed * dt;
        const collidedX = this.collidesWithWall(newX, this.y, dungeon);
        const collidedY = this.collidesWithWall(this.x, newY, dungeon);
        console.log(`[Player.tryMove] Attempting move to (${newX.toFixed(2)}, ${newY.toFixed(2)}). Collided X: ${collidedX}, Collided Y: ${collidedY}`);

        if (!collidedX) {
            this.x = newX;
        }
        if (!collidedY) {
            this.y = newY;
        }
    }

    collidesWithWall(px, py, dungeon) {
        let isColliding = false;
        for (let angle = 0; angle < 2 * Math.PI; angle += Math.PI / 4) {
            const checkX = px + Math.cos(angle) * this.radius;
            const checkY = py + Math.sin(angle) * this.radius;
            const wallAtPixel = dungeon.isWallAtPixel(checkX, checkY);
            if (wallAtPixel) {
                isColliding = true;
                // Log the exact collision point
                console.log(`[Player.collidesWithWall] Collision detected at pixel (${checkX.toFixed(2)}, ${checkY.toFixed(2)}). Original player pos: (${px.toFixed(2)}, ${py.toFixed(2)})`);
                break; // Found a collision, no need to check further angles
            }
        }
        console.log(`[Player.collidesWithWall] Final collision result for (${px.toFixed(2)}, ${py.toFixed(2)}): ${isColliding}`);
        return isColliding;
    }

    updateMouse(mouseX, mouseY, camX, camY) {
        const dx = mouseX - camX;
        const dy = mouseY - camY;
        this.mouseAngle = Math.atan2(dy, dx);
    }

    startSwing(mouseAngle) {
        if (!this.swinging) {
            this.swinging = true;
            this.swingTime = 0;
            this.swingStartAngle = mouseAngle;
            this.swingDir = 1;
            this.hitEnemiesThisSwing = new Set(); // reset hit tracking
        }
    }

    updateSwing(dt) {
        if (this.swinging) {
            this.swingTime += dt;
            const duration = 0.35;
            if (this.swingTime > duration) {
                this.swinging = false;
                this.swingAngle = 0;
            } else {
                // Arc: ease-in-out, overshoot, then return
                const t = this.swingTime / duration;
                const ease = 0.5 - 0.5 * Math.cos(Math.PI * t);
                const maxArc = (Math.PI / 3 + Math.PI / 12); // 60° + 15° overshoot
                if (t < 0.5) {
                    this.swingAngle = maxArc * (ease * 2);
                } else {
                    this.swingAngle = maxArc * (2 - ease * 2);
                }
                this.mouseAngle = this.swingStartAngle + this.swingAngle;
            }
        }
    }

    getHandPositions() {
        const base = this.mouseAngle;
        const offset = Math.PI / 3; // 60°
        let a1 = base + offset;
        let a2 = base - offset;
        const r = this.radius + 10;
        return [
            [this.x + Math.cos(a1) * r, this.y + Math.sin(a1) * r],
            [this.x + Math.cos(a2) * r, this.y + Math.sin(a2) * r]
        ];
    }

    getSwordLine() {
        const [h1, h2] = this.getHandPositions();
        const dx = h2[0] - h1[0];
        const dy = h2[1] - h1[1];
        const len = Math.sqrt(dx*dx + dy*dy);
        const ext = 80; // Increased from 40 to 80 for longer sword
        return [h1, [h2[0] + dx/len*ext, h2[1] + dy/len*ext]];
    }
}

class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.dungeon = new RoomDungeon();

        // 1. Generate the initial room (0,0) so player can find a valid spawn location
        this.dungeon.generateRoom(0, 0, null, true);

        // 2. Create player (needs room (0,0) to exist for findValidSpawn)
        this.player = new Player(this.dungeon);

        // 3. Now load adjacent rooms, using player's actual spawn tile for enemy exclusion in room (0,0)
        // Note: loadAdjacentRooms will call generateRoom for (0,0) again, but it won't re-create it or re-spawn enemies.
        this.dungeon.loadAdjacentRooms(0, 0, this.player.spawnTile, true);

        this.keys = {};
        this.lastTime = null;
        this.mouseX = 0;
        this.mouseY = 0;
        this.setupEventListeners();
        this.currentRoomKey = null; // Used to track player's current room for loading adjacent rooms
        requestAnimationFrame((ts) => this.gameLoop(ts));
    }

    setupEventListeners() {
        window.addEventListener('keydown', (e) => {
            this.keys[e.key] = true;
            if (e.key === 'Escape') {
                window.close();
            } else if (e.key === 'e' || e.key === 'E') {
                this.player.extendedInventoryOpen = !this.player.extendedInventoryOpen;
                console.log(`[Game] Extended inventory toggled: ${this.player.extendedInventoryOpen}`);
            }
        });
        window.addEventListener('keyup', (e) => {
            this.keys[e.key] = false;
        });
        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            this.mouseX = e.clientX - rect.left;
            this.mouseY = e.clientY - rect.top;
        });
        this.canvas.addEventListener('mousedown', (e) => {
            if (e.button === 0) {
                // Always swing from the current mouse angle, in a fixed direction
                const screenW = this.canvas.width;
                const screenH = this.canvas.height;
                const camX = screenW / 2;
                const camY = screenH / 2;
                const dx = this.mouseX - camX;
                const dy = this.mouseY - camY;
                const mouseAngle = Math.atan2(dy, dx);
                this.player.startSwing(mouseAngle);
            }
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

    updateEnemies(dt) {
        const gx = Math.floor(this.player.x / TILE_SIZE);
        const gy = Math.floor(this.player.y / TILE_SIZE);
        const roomX = Math.floor(gx / ROOM_SIZE);
        const roomY = Math.floor(gy / ROOM_SIZE);
        const isStartRoom = (roomX === 0 && roomY === 0);
        const playerSpawn = isStartRoom ? this.player.spawnTile : null;
        const key = `${roomX},${roomY}`;

        if (this.currentRoomKey !== key) {
            console.log(`[Game] Player entering room: (${roomX}, ${roomY})`);
            this.dungeon.loadAdjacentRooms(roomX, roomY, playerSpawn, isStartRoom);
            this.currentRoomKey = key;
        }

        // Get enemies from current room and its 8 neighbors
        const visibleEnemies = [];
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const currentRoom = this.dungeon.getRoom(roomX + dx, roomY + dy);
                if (currentRoom) {
                    visibleEnemies.push(...currentRoom.enemies);
                }
            }
        }

        for (let i = visibleEnemies.length - 1; i >= 0; i--) {
            const enemy = visibleEnemies[i];
            enemy.updateDamageNumbers(dt);
            
            if (enemy.dead) {
                enemy.deathTimer -= dt;
                console.log(`[DEBUG] Dead enemy deathTimer: ${enemy.deathTimer.toFixed(3)}`);
                if (enemy.deathTimer <= 0) {
                    // Find the room this enemy belongs to and remove it
                    const enemyRoomX = Math.floor(enemy.x / TILE_SIZE / ROOM_SIZE);
                    const enemyRoomY = Math.floor(enemy.y / TILE_SIZE / ROOM_SIZE);
                    const enemyRoom = this.dungeon.getRoom(enemyRoomX, enemyRoomY);
                    console.log(`[DEBUG] Attempting to remove enemy. Enemy position: (${enemy.x}, ${enemy.y}), calculated room: (${enemyRoomX}, ${enemyRoomY})`);
                    if (enemyRoom) {
                        const indexInRoom = enemyRoom.enemies.indexOf(enemy);
                        console.log(`[DEBUG] Enemy room found. Index in room: ${indexInRoom}, enemies in room before splice: ${enemyRoom.enemies.length}`);
                        if (indexInRoom > -1) {
                            enemyRoom.enemies.splice(indexInRoom, 1);
                            console.log(`[Game] Removed dead enemy from room (${enemyRoomX}, ${enemyRoomY}). Enemies in room after splice: ${enemyRoom.enemies.length}`);

                            // New: Drop a coin when an enemy dies
                            const coin = {
                                x: enemy.x, // Item position is enemy's last position
                                y: enemy.y,
                                radius: 10, // Small radius for pickup
                                name: "Coin",
                                color: "gold" // Visual color for the coin
                            };
                            enemyRoom.droppedItems.push(coin);
                            console.log(`[Game] Dropped a Coin at (${coin.x.toFixed(2)}, ${coin.y.toFixed(2)}) in room (${enemyRoomX}, ${enemyRoomY})`);
                        } else {
                            console.log(`[DEBUG] Enemy not found in room. This should not happen. Re-checking room contents.`);
                            const foundEnemy = enemyRoom.enemies.find(e => e === enemy);
                            if (foundEnemy) {
                                console.log("[DEBUG] Enemy found via find, but not indexOf. This is unexpected.");
                            }
                        }
                    } else {
                        console.log(`[DEBUG] Enemy room not found for coordinates (${enemyRoomX}, ${enemyRoomY}). Enemy might be stuck.`);
                    }
                }
                continue;
            }

            enemy.moveToward(this.player, dt, visibleEnemies, this.dungeon);
            
            if (enemy.reload > 0) enemy.reload -= dt;
            if (enemy.canAttack(this.player) && enemy.reload <= 0) {
                this.player.hp--;
                enemy.reload = 1.0;
            }
        }
    }

    updatePlayer(dt) {
        // Update mouse angle for hands
        const screenW = this.canvas.width;
        const screenH = this.canvas.height;
        const camX = screenW / 2;
        const camY = screenH / 2;
        this.player.updateMouse(this.mouseX, this.mouseY, camX, camY);
        this.player.updateSwing(dt);
    }

    checkSwordHits() {
        if (!this.player.swinging) return;
        const gx = Math.floor(this.player.x / TILE_SIZE);
        const gy = Math.floor(this.player.y / TILE_SIZE);
        const roomX = Math.floor(gx / ROOM_SIZE);
        const roomY = Math.floor(gy / ROOM_SIZE);

        // Get enemies from current room and its 8 neighbors for sword hits
        const visibleEnemies = [];
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const room = this.dungeon.getRoom(roomX + dx, roomY + dy);
                if (room) {
                    visibleEnemies.push(...room.enemies);
                }
            }
        }

        const [p1, p2] = this.player.getSwordLine();
        for (const enemy of visibleEnemies) {
            if (enemy.dead) continue;
            if (this.player.hitEnemiesThisSwing.has(enemy)) continue;
            // Closest point on sword line to enemy center
            const ex = enemy.x, ey = enemy.y;
            const x1 = p1[0], y1 = p1[1], x2 = p2[0], y2 = p2[1];
            const l2 = (x2-x1)*(x2-x1)+(y2-y1)*(y2-y1);
            let t = ((ex-x1)*(x2-x1)+(ey-y1)*(y2-y1))/l2;
            t = Math.max(0, Math.min(1, t));
            const cx = x1 + t*(x2-x1);
            const cy = y1 + t*(y2-y1);
            const dist = Math.sqrt((ex-cx)*(ex-cx)+(ey-cy)*(ey-cy));
            if (dist < enemy.radius + 16) { // Increased from 8 to 16 for larger attack range
                // Knockback direction
                const kx = (enemy.x - this.player.x) / Math.max(1, Math.sqrt((enemy.x - this.player.x)**2 + (enemy.y - this.player.y)**2));
                const ky = (enemy.y - this.player.y) / Math.max(1, Math.sqrt((enemy.x - this.player.x)**2 + (enemy.y - this.player.y)**2));
                enemy.takeDamage(kx, ky, 1);
                this.player.hitEnemiesThisSwing.add(enemy);
            }
        }
    }

    checkItemPickups() {
        const gx = Math.floor(this.player.x / TILE_SIZE);
        const gy = Math.floor(this.player.y / TILE_SIZE);
        const roomX = Math.floor(gx / ROOM_SIZE);
        const roomY = Math.floor(gy / ROOM_SIZE);

        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const room = this.dungeon.getRoom(roomX + dx, roomY + dy);
                if (room) {
                    for (let i = room.droppedItems.length - 1; i >= 0; i--) {
                        const item = room.droppedItems[i];
                        const dist = Math.sqrt((this.player.x - item.x)**2 + (this.player.y - item.y)**2);
                        if (dist < this.player.radius + item.radius) {
                            // Player can pick up this item
                            // For now, let's just add it to the first empty slot
                            const emptySlotIndex = this.player.inventory.indexOf(null);
                            if (emptySlotIndex !== -1) {
                                this.player.inventory[emptySlotIndex] = item;
                                room.droppedItems.splice(i, 1); // Remove item from the room
                                console.log(`[Game] Picked up ${item.name}! Inventory:`, this.player.inventory);
                            }
                        }
                    }
                }
            }
        }
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = '#FFFFFF'; // Background is white
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        const screenW = this.canvas.width;
        const screenH = this.canvas.height;
        const camX = this.player.x;
        const camY = this.player.y;

        // Draw visible tiles
        this.dungeon.forEachVisibleTile(camX, camY, screenW, screenH, (gx, gy, type) => {
            const drawX = gx * TILE_SIZE - camX + screenW / 2;
            const drawY = gy * TILE_SIZE - camY + screenH / 2;
            if (type === 1) {
                this.ctx.fillStyle = '#808080'; // Walls - Dark Grey
                this.ctx.fillRect(drawX, drawY, TILE_SIZE, TILE_SIZE);
            } else if (type === 0) {
                this.ctx.fillStyle = '#FFFFFF'; // Floors - White
                this.ctx.fillRect(drawX, drawY, TILE_SIZE, TILE_SIZE);
                this.ctx.strokeStyle = '#e0e0e0'; // Grid lines on top of floor
                this.ctx.lineWidth = 1;
                this.ctx.strokeRect(drawX, drawY, TILE_SIZE, TILE_SIZE);
            }
        });

        // Draw enemies (from all visible rooms)
        const playerRoomX = Math.floor(this.player.x / TILE_SIZE / ROOM_SIZE);
        const playerRoomY = Math.floor(this.player.y / TILE_SIZE / ROOM_SIZE);

        console.log(`[Game] Drawing enemies for rooms around: (${playerRoomX}, ${playerRoomY})`);
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const room = this.dungeon.getRoom(playerRoomX + dx, playerRoomY + dy);
                if (room) {
                    for (const enemy of room.enemies) {
                        if (enemy.dead && enemy.deathTimer <= 0) {
                            // Enemy is dead and its death timer has expired, so it should be removed
                            // This case should ideally be handled by updateEnemies, but as a safeguard,
                            // we won't draw it if it somehow slipped through.
                            continue;
                        }
                        
                        // If the enemy is dead but still within its deathTimer, it will be drawn.
                        // You could add a fading effect here if desired, e.g., by adjusting opacity based on deathTimer.

                        this.ctx.fillStyle = 'red';
                        this.ctx.beginPath();
                        this.ctx.arc(enemy.x - camX + screenW / 2, enemy.y - camY + screenH / 2, enemy.radius, 0, Math.PI * 2);
                        this.ctx.fill();
                        // Draw damage numbers with enhanced styling
                        for (const dm of enemy.damageNumbers) {
                            this.ctx.fillStyle = `rgba(255, 255, 0, ${dm.opacity})`; // Yellow damage numbers
                            this.ctx.font = 'bold 20px Arial'; // Made font bigger and bold
                            this.ctx.textAlign = 'center'; // Center the text
                            this.ctx.fillText(
                                dm.amount.toString(),
                                enemy.x - camX + screenW / 2 + dm.ox,
                                enemy.y - camY + screenH / 2 + dm.oy
                            );
                        }
                    }
                }
            }
        }

        // Draw dropped items (from all visible rooms)
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const room = this.dungeon.getRoom(playerRoomX + dx, playerRoomY + dy);
                if (room) {
                    for (const item of room.droppedItems) {
                        this.ctx.fillStyle = item.color; // Use the item's defined color
                        this.ctx.beginPath();
                        this.ctx.arc(item.x - camX + screenW / 2, item.y - camY + screenH / 2, item.radius, 0, Math.PI * 2);
                        this.ctx.fill();
                    }
                }
            }
        }

        // Draw player
        this.ctx.fillStyle = '#F5DEB3'; // Player color - Lighter tan (Wheat color)
        this.ctx.beginPath();
        this.ctx.arc(screenW / 2, screenH / 2, this.player.radius, 0, Math.PI * 2);
        this.ctx.fill();

        // Draw player hands (always visible)
        const [h1, h2] = this.player.getHandPositions();
        this.ctx.fillStyle = '#F5DEB3'; // Hands color - Lighter tan (Wheat color)
        this.ctx.beginPath();
        this.ctx.arc(h1[0] - camX + screenW / 2, h1[1] - camY + screenH / 2, this.player.radius / 2, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.beginPath();
        this.ctx.arc(h2[0] - camX + screenW / 2, h2[1] - camY + screenH / 2, this.player.radius / 2, 0, Math.PI * 2);
        this.ctx.fill();

        // Draw sword (always visible and correct appearance)
        this.ctx.strokeStyle = '#888'; // Sword color: Grey
        this.ctx.lineWidth = 8;
        const [s1, s2] = this.player.getSwordLine();
        this.ctx.beginPath();
        this.ctx.moveTo(s1[0] - camX + screenW / 2, s1[1] - camY + screenH / 2);
        this.ctx.lineTo(s2[0] - camX + screenW / 2, s2[1] - camY + screenH / 2);
        this.ctx.stroke();

        // Display player HP
        this.ctx.fillStyle = 'red';
        this.ctx.font = '24px Arial';
        this.ctx.fillText(`HP: ${this.player.hp}`, 20, 40);

        // Display current room coordinates
        const currentRoomDisplayX = Math.floor(this.player.x / TILE_SIZE / ROOM_SIZE);
        const currentRoomDisplayY = Math.floor(this.player.y / TILE_SIZE / ROOM_SIZE);
        this.ctx.fillStyle = 'white';
        this.ctx.font = '24px Arial';
        this.ctx.fillText(`Room: (${currentRoomDisplayX}, ${currentRoomDisplayY})`, screenW - 200, 40);

        // Draw Inventory (Hotbar always visible, extended inventory conditional)
        const slotSize = 60; // Size of each inventory slot
        const padding = 10; // Padding around the inventory bar and between slots
        const hotbarLength = 10; // Number of slots in the hotbar

        const inventoryWidth = (slotSize + padding) * hotbarLength - padding;
        const inventoryX = (screenW - inventoryWidth) / 2; // Center the inventory horizontally
        const hotbarY = screenH - slotSize - padding; // Position hotbar at the bottom

        this.ctx.strokeStyle = '#FFFFFF'; // White border for slots
        this.ctx.lineWidth = 3;

        // Draw hotbar slots (first 10 slots)
        for (let i = 0; i < hotbarLength; i++) {
            const x = inventoryX + i * (slotSize + padding);
            const y = hotbarY;

            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'; // Semi-transparent black background for slots
            this.ctx.fillRect(x, y, slotSize, slotSize);
            this.ctx.strokeRect(x, y, slotSize, slotSize);

            // Draw hotbar items
            if (this.player.inventory[i]) {
                this.ctx.fillStyle = this.player.inventory[i].color;
                this.ctx.beginPath();
                this.ctx.arc(x + slotSize / 2, y + slotSize / 2, this.player.inventory[i].radius, 0, Math.PI * 2);
                this.ctx.fill();
            }
        }

        // Draw extended inventory slots if open
        if (this.player.extendedInventoryOpen) {
            const extendedRows = 3; // 3 rows for 30 additional slots (3 * 10)
            const extendedInventoryHeight = (slotSize + padding) * extendedRows - padding;
            const extendedInventoryY = hotbarY - extendedInventoryHeight - padding; // Position above hotbar

            // Background for the entire extended inventory area
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'; // Slightly darker background for the full inventory
            this.ctx.fillRect(inventoryX - padding, extendedInventoryY - padding, 
                              inventoryWidth + padding * 2, extendedInventoryHeight + padding * 2);

            for (let i = hotbarLength; i < this.player.inventory.length; i++) {
                const slotIndex = i - hotbarLength; // 0-29 for extended slots
                const row = Math.floor(slotIndex / hotbarLength);
                const col = slotIndex % hotbarLength;

                const x = inventoryX + col * (slotSize + padding);
                const y = extendedInventoryY + row * (slotSize + padding);

                this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'; // Semi-transparent black background for slots
                this.ctx.fillRect(x, y, slotSize, slotSize);
                this.ctx.strokeRect(x, y, slotSize, slotSize);

                // Draw extended inventory items
                if (this.player.inventory[i]) {
                    this.ctx.fillStyle = this.player.inventory[i].color;
                    this.ctx.beginPath();
                    this.ctx.arc(x + slotSize / 2, y + slotSize / 2, this.player.inventory[i].radius, 0, Math.PI * 2);
                    this.ctx.fill();
                }
            }
        }

        // Game Over screen
        if (this.player.hp <= 0) {
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'; // Semi-transparent black overlay
            this.ctx.fillRect(0, 0, screenW, screenH);
            this.ctx.fillStyle = 'white';
            this.ctx.font = '48px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('GAME OVER', screenW / 2, screenH / 2);
            this.ctx.textAlign = 'start'; // Reset text alignment
        }
    }

    gameLoop(timestamp) {
        if (!this.lastTime) this.lastTime = timestamp;
        const dt = (timestamp - this.lastTime) / 1000;
        this.lastTime = timestamp;
        if (this.player.hp > 0) {
            this.handleInput(dt);
            this.updateEnemies(dt);
            this.updatePlayer(dt);
            this.checkSwordHits();
            this.checkItemPickups();
        }
        this.draw();
        // Only continue game loop if player is alive
        if (this.player.hp > 0) {
            requestAnimationFrame((ts) => this.gameLoop(ts));
        }

        // Log player position and calculated room in every frame
        const currentRoomDisplayX = Math.floor(this.player.x / TILE_SIZE / ROOM_SIZE);
        const currentRoomDisplayY = Math.floor(this.player.y / TILE_SIZE / ROOM_SIZE);
        console.log(`[GameLoop] Player pos: (${this.player.x.toFixed(2)}, ${this.player.y.toFixed(2)}), Room: (${currentRoomDisplayX}, ${currentRoomDisplayY})`);
    }
}

window.onload = () => {
    new Game();
}; 