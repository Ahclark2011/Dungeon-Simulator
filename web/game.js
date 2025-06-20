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
            amount: Math.round(amount),
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
        this.shopItems = []; // New: Array to hold shop items
        this.isShopRoom = false; // New: Flag to identify shop rooms
        this.grid = Array(ROOM_SIZE).fill().map(() => Array(ROOM_SIZE).fill(1));
        this.doors = {}; // Initialize doors as empty, they will be generated in setupRoom
        this.hasGeneratedEnemies = false; // Flag to ensure enemies are spawned only once
    }

    setupRoom(neighbors, playerSpawn, isStartRoom = false) {
        this.neighbors = neighbors;
        this.doors = this.generateDoors(neighbors);
        this.carveRoom();
        
        // Randomly make some rooms shop rooms (except start room)
        if (!isStartRoom && Math.random() < 0.0667) { // 1 in 15 chance for shop room (approximately 6.67%)
            this.isShopRoom = true;
            this.hasGeneratedEnemies = true; // Prevent enemy spawning in shop rooms
            this.spawnShopItems();
        } else {
            this.spawnEnemies(playerSpawn);
        }
    }

    generateDoors(neighbors) {
        // Always create 4 doors at centered positions
        const wallPositions = {
            N: Math.floor(ROOM_SIZE / 2) - 1,
            S: Math.floor(ROOM_SIZE / 2) - 1,
            E: Math.floor(ROOM_SIZE / 2) - 1,
            W: Math.floor(ROOM_SIZE / 2) - 1
        };
        return {
            N: wallPositions.N,
            S: wallPositions.S,
            E: wallPositions.E,
            W: wallPositions.W
        };
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
        
        // Carve out doors (1-tile deep opening for each door)
        for (const [dir, pos] of Object.entries(this.doors)) {
            if (dir === 'N') {
                for (let i = 0; i < DOOR_WIDTH; i++) {
                    this.grid[0][pos + i] = 0;
                }
            } else if (dir === 'S') {
                for (let i = 0; i < DOOR_WIDTH; i++) {
                    this.grid[ROOM_SIZE - 1][pos + i] = 0;
                }
            } else if (dir === 'E') {
                for (let i = 0; i < DOOR_WIDTH; i++) {
                    this.grid[pos + i][ROOM_SIZE - 1] = 0;
                }
            } else if (dir === 'W') {
                for (let i = 0; i < DOOR_WIDTH; i++) {
                    this.grid[pos + i][0] = 0;
                }
            }
        }
    }

    spawnEnemies(playerSpawn) {
        // Only spawn enemies if they haven't been spawned yet and this is not a shop room
        if (this.hasGeneratedEnemies || this.isShopRoom) return;
        
        const numEnemies = Math.floor(Math.random() * 3) + 2; // 2-4 enemies
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

    spawnShopItems() {
        if (!this.isShopRoom) return;
        
        // Place 7 shop items in a better layout (3x3 grid with 2 empty spots)
        const center = Math.floor(ROOM_SIZE / 2);
        const positions = [
            [center - 1, center - 1], // Top left
            [center, center - 1],     // Top center  
            [center + 1, center - 1], // Top right
            [center - 1, center],     // Middle left
            [center, center],         // Center
            [center + 1, center],     // Middle right
            [center, center + 1]      // Bottom center
        ];
        
        for (let i = 0; i < Math.min(SHOP_ITEMS.length, positions.length); i++) {
            const [x, y] = positions[i];
            const shopItem = { ...SHOP_ITEMS[i] };
            shopItem.x = (this.roomX * ROOM_SIZE + x) * TILE_SIZE + TILE_SIZE/2;
            shopItem.y = (this.roomY * ROOM_SIZE + y) * TILE_SIZE + TILE_SIZE/2;
            shopItem.radius = 12;
            this.shopItems.push(shopItem);
        }
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
        this.roomCount = 0;
        this.ROOM_LIMIT = 10000;
        this.currentRoomKey = null; // Track current room
    }

    generateRoom(roomX, roomY, playerSpawn, isStartRoom = false) {
        const key = `${roomX},${roomY}`;
        if (!this.rooms.has(key)) {
            if (this.roomCount >= this.ROOM_LIMIT) {
                return undefined;
            }
            this.roomCount++;
            
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
        const localX = ((gx % ROOM_SIZE) + ROOM_SIZE) % ROOM_SIZE;
        const localY = ((gy % ROOM_SIZE) + ROOM_SIZE) % ROOM_SIZE;

        const room = this.getRoom(roomX, roomY);
        if (!room) {
            // If the room does not exist, consider it a wall
            return true;
        }
        // A tile is a wall if its grid value is 1
        return room.isWall(localX, localY);
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
                const localX = ((gx % ROOM_SIZE) + ROOM_SIZE) % ROOM_SIZE;
                const localY = ((gy % ROOM_SIZE) + ROOM_SIZE) % ROOM_SIZE;
                const currentRoomKey = this.currentRoomKey;
                const [curRoomX, curRoomY] = currentRoomKey.split(',').map(Number);
                if (roomX === curRoomX && roomY === curRoomY) {
                    // Always use the current room's grid for its tiles
                    const room = this.getRoom(roomX, roomY);
                    callback(gx, gy, room ? room.grid[localY][localX] : 1);
                } else {
                    // For adjacent rooms, only show the 1-tile deep door part at the border, otherwise show as wall
                    const room = this.getRoom(roomX, roomY);
                    let isDoorVisual = false;
                    if (room) {
                        for (const [dir, pos] of Object.entries(room.doors)) {
                            if (dir === 'N' && localY === 0 && localX >= pos && localX < pos + DOOR_WIDTH) {
                                isDoorVisual = true;
                            } else if (dir === 'S' && localY === ROOM_SIZE - 1 && localX >= pos && localX < pos + DOOR_WIDTH) {
                                isDoorVisual = true;
                            } else if (dir === 'E' && localX === ROOM_SIZE - 1 && localY >= pos && localY < pos + DOOR_WIDTH) {
                                isDoorVisual = true;
                            } else if (dir === 'W' && localX === 0 && localY >= pos && localY < pos + DOOR_WIDTH) {
                                isDoorVisual = true;
                            }
                            if (isDoorVisual) break;
                        }
                    }
                    callback(gx, gy, isDoorVisual ? 0 : 1);
                }
            }
        }
    }

    updateCurrentRoom(playerX, playerY) {
        const gx = Math.floor(playerX / TILE_SIZE);
        const gy = Math.floor(playerY / TILE_SIZE);
        const roomX = Math.floor(gx / ROOM_SIZE);
        const roomY = Math.floor(gy / ROOM_SIZE);
        const newRoomKey = `${roomX},${roomY}`;

        if (this.currentRoomKey !== newRoomKey) {
            this.currentRoomKey = newRoomKey;
            // Load adjacent rooms but don't spawn enemies in them yet
            this.loadAdjacentRooms(roomX, roomY, null, false);
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
        this.coins = 0; // New: Track coins separately from inventory
        // Potion effects tracking
        this.potionEffects = {
            strength: { level: 0, duration: 0 },
            speed: { level: 0, duration: 0 }
        };
        this.potionChargeStart = null; // For potion usage timing
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
        const effectiveSpeed = this.getEffectiveSpeed();
        const newX = this.x + dx * effectiveSpeed * dt;
        const newY = this.y + dy * effectiveSpeed * dt;
        const collidedX = this.collidesWithWall(newX, this.y, dungeon);
        const collidedY = this.collidesWithWall(this.x, newY, dungeon);

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
                break; // Found a collision, no need to check further angles
            }
        }
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

    // Potion effect methods
    updatePotionEffects(dt) {
        // Update duration for active potion effects
        for (const effect in this.potionEffects) {
            if (this.potionEffects[effect].duration > 0) {
                this.potionEffects[effect].duration -= dt;
                if (this.potionEffects[effect].duration <= 0) {
                    this.potionEffects[effect].level = 0;
                    this.potionEffects[effect].duration = 0;
                }
            }
        }
    }

    getEffectiveSpeed() {
        const speedMultiplier = 1 + (this.potionEffects.speed.level * 0.2);
        return this.speed * speedMultiplier;
    }

    getStrengthBonus() {
        return this.potionEffects.strength.level;
    }

    useHealthPotion(level) {
        const healAmount = 2 + level;
        this.hp = Math.min(this.hp + healAmount, 10); // Cap at 10 HP
    }

    useStrengthPotion(level, duration = 45) { // 45 seconds duration
        this.potionEffects.strength.level = level;
        this.potionEffects.strength.duration = duration;
    }

    useSpeedPotion(level, duration = 45) { // 45 seconds duration
        this.potionEffects.speed.level = level;
        this.potionEffects.speed.duration = duration;
    }

    findFirstAvailableSlot() {
        // First check hotbar (slots 0-9)
        for (let i = 0; i < 10; i++) {
            if (!this.inventory[i]) {
                return i;
            }
        }
        // Then check extended inventory (slots 10-39) top to bottom, left to right
        for (let i = 10; i < 40; i++) {
            if (!this.inventory[i]) {
                return i;
            }
        }
        return -1; // No available slots
    }
}

class Projectile {
    constructor(x, y, direction, speed, damage, homing = false, target = null, radius = 8, type = "magic_orb", color = "#00f", tipColor = "#f00") {
        this.x = x;
        this.y = y;
        this.speed = speed;
        this.damage = damage;
        this.direction = direction; // radians
        this.homing = homing;
        this.target = target; // Enemy instance
        this.radius = radius;
        this.alive = true;
        this.type = type; // "arrow" or "magic_orb"
        this.color = color; // For magic orb
        this.tipColor = tipColor; // For arrow tip
        // Initial velocity
        this.vx = Math.cos(direction) * speed;
        this.vy = Math.sin(direction) * speed;
    }

    update(dt, dungeon, enemies) {
        if (!this.alive) return;
        // Homing logic
        if (this.homing && this.target && !this.target.dead) {
            // Calculate direction to target
            const dx = this.target.x - this.x;
            const dy = this.target.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 1e-3) {
                // Arc toward the target (smoothly adjust velocity)
                const desiredVx = dx / dist * this.speed;
                const desiredVy = dy / dist * this.speed;
                // Interpolate velocity for arcing effect
                const homingStrength = 6.0; // Higher = more aggressive homing
                this.vx += (desiredVx - this.vx) * Math.min(1, homingStrength * dt);
                this.vy += (desiredVy - this.vy) * Math.min(1, homingStrength * dt);
                // Clamp speed
                const vmag = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
                if (vmag > this.speed) {
                    this.vx = this.vx / vmag * this.speed;
                    this.vy = this.vy / vmag * this.speed;
                }
                // Update direction for drawing
                this.direction = Math.atan2(this.vy, this.vx);
            }
        } else if (this.homing && (!this.target || this.target.dead)) {
            // Retarget if possible
            this.retarget(enemies);
        }
        // Move
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        // Wall collision
        if (this.checkWallCollision(dungeon)) {
            this.alive = false;
        }
    }

    checkWallCollision(dungeon) {
        // Check center
        if (dungeon.isWallAtPixel(this.x, this.y)) {
            return true;
        }
        // Check 16 directions around the projectile's edge
        for (let angle = 0; angle < 2 * Math.PI; angle += Math.PI / 8) {
            const checkX = this.x + Math.cos(angle) * this.radius;
            const checkY = this.y + Math.sin(angle) * this.radius;
            if (dungeon.isWallAtPixel(checkX, checkY)) {
                return true;
            }
        }
        return false;
    }

    retarget(enemies) {
        // Find the closest living enemy
        let minDist = Infinity;
        let best = null;
        for (const enemy of enemies) {
            if (enemy.dead) continue;
            const dx = enemy.x - this.x;
            const dy = enemy.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < minDist) {
                minDist = dist;
                best = enemy;
            }
        }
        this.target = best;
    }

    draw(ctx) {
        if (!this.alive) return;
        if (this.type === "magic_orb") {
            ctx.save();
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        } else if (this.type === "arrow") {
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(this.direction);
            // Draw shaft (ends at base of tip)
            const shaftLength = this.radius * 1.7 - 10; // Longer shaft
            ctx.strokeStyle = "#8B5C2A"; // Brownish
            ctx.lineWidth = Math.max(3, this.radius / 2.5); // Thicker
            ctx.beginPath();
            ctx.moveTo(-this.radius * 1.7, 0);
            ctx.lineTo(shaftLength, 0);
            ctx.stroke();
            // Draw tip (triangle at the front)
            ctx.fillStyle = this.tipColor;
            ctx.beginPath();
            ctx.moveTo(this.radius * 1.7, 0); // tip point
            ctx.lineTo(shaftLength, 7);
            ctx.lineTo(shaftLength, -7);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }
    }
}

// Arrow item definition
const ARROW_ITEM = {
    name: "Arrow",
    type: "arrow",
    damage: 1,
    color: "#ccc",
    radius: 7,
    stackable: true
};

// Potion item definitions
const HEALTH_POTION_ITEM = {
    name: "Health Potion",
    type: "health_potion",
    color: "#ff6b6b",
    radius: 8,
    stackable: true,
    level: 1,
    effect: "Restore 2 + level health"
};

const STRENGTH_POTION_ITEM = {
    name: "Strength Potion", 
    type: "strength_potion",
    color: "#ff8e53",
    radius: 8,
    stackable: true,
    level: 1,
    effect: "Short range attacks do +1 damage per level"
};

const SPEED_POTION_ITEM = {
    name: "Speed Potion",
    type: "speed_potion", 
    color: "#4ecdc4",
    radius: 8,
    stackable: true,
    level: 1,
    effect: "Move 20% faster per level"
};

// Shop item definitions
const SHOP_ITEMS = [
    { ...ARROW_ITEM, price: 3, count: 12 }, // Bundle of 12 arrows for 3 coins
    { ...ARROW_ITEM, price: 3, count: 12 }, // Bundle of 12 arrows for 3 coins
    { ...ARROW_ITEM, price: 3, count: 12 }, // Bundle of 12 arrows for 3 coins
    { ...HEALTH_POTION_ITEM, price: 2, count: 1 }, // Health potion for 2 coins
    { ...HEALTH_POTION_ITEM, price: 2, count: 1 }, // Health potion for 2 coins
    { ...STRENGTH_POTION_ITEM, price: 8, count: 1 }, // Strength potion for 8 coins
    { ...SPEED_POTION_ITEM, price: 6, count: 1 } // Speed potion for 6 coins
];

class Bow {
    constructor(power = 1.0) {
        this.name = "Bow";
        this.type = "bow";
        this.power = power; // Determines max speed and max charge time
        this.maxChargeTime = 0.8 + 0.7 * power; // seconds
        this.charging = false;
        this.chargeStart = 0;
        this.currentCharge = 0;
        this.owner = null; // Player reference
    }
    // Draw the bow at (x, y) facing angle, with chargeRatio (0-1)
    draw(ctx, x, y, angle, chargeRatio = 0) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        // Bow body
        ctx.lineWidth = 8;
        ctx.strokeStyle = chargeRatio > 0 ? `rgb(${Math.floor(200+55*chargeRatio)},${Math.floor(120+100*chargeRatio)},80)` : "#b97a56";
        ctx.beginPath();
        ctx.arc(0, 0, 32, -Math.PI/2, Math.PI/2, false);
        ctx.stroke();
        // Bowstring
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#fff";
        ctx.beginPath();
        ctx.moveTo(0, -32);
        ctx.lineTo(0, 32);
        ctx.stroke();
        ctx.restore();
    }
}

class Sword {
    constructor(power = 1.0) {
        this.name = "Sword";
        this.type = "sword";
        this.power = power;
        this.swingTime = 0.35; // seconds
    }
    // Draw the sword using the same logic as the original sword rendering
    draw(ctx, playerX, playerY, mouseAngle, swingTime, swingActive, h1, h2, swordLine, camX, camY, screenW, screenH) {
        // Use cached sword line
        const [s1, s2] = swordLine;
        ctx.save();
        ctx.strokeStyle = '#888'; // Sword color: Grey
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(s1[0] - camX + screenW / 2, s1[1] - camY + screenH / 2);
        ctx.lineTo(s2[0] - camX + screenW / 2, s2[1] - camY + screenH / 2);
        ctx.stroke();
        ctx.restore();
    }
    // Draw a simple sword icon for inventory
    static drawInventoryIcon(ctx, x, y, slotSize) {
        ctx.save();
        ctx.translate(x + slotSize / 2, y + slotSize / 2);
        ctx.rotate(Math.PI/4);
        ctx.strokeStyle = '#888';
        ctx.lineWidth = Math.max(6, slotSize/16);
        ctx.beginPath();
        ctx.moveTo(-slotSize/3, 0);
        ctx.lineTo(slotSize/3, 0);
        ctx.stroke();
        ctx.strokeStyle = '#b97a56';
        ctx.lineWidth = Math.max(10, slotSize/8);
        ctx.beginPath();
        ctx.moveTo(-slotSize/2.5, 0);
        ctx.lineTo(-slotSize/6, 0);
        ctx.stroke();
        ctx.restore();
    }
}

class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.dungeon = new RoomDungeon();
        this.dungeon.generateRoom(0, 0, null, true);
        this.player = new Player(this.dungeon);
        this.dungeon.loadAdjacentRooms(0, 0, this.player.spawnTile, true);
        this.keys = {};
        this.lastTime = null;
        this.mouseX = 0;
        this.mouseY = 0;
        this.bowChargeStart = null;
        this.bowCharging = false;
        this.bowChargeRatio = 0;
        this.lastBowAngle = 0;
        this.selectedHotbar = 0;
        this.draggedItem = null;
        this.draggedIndex = null;
        this.inventoryMouse = {x: 0, y: 0};
        this.setupEventListeners();
        this.currentRoomKey = null;
        // Remove starting projectiles
        this.projectiles = [];
        // Give player a bow and arrows for debugging
        this.player.inventory[0] = new Bow(1.0);
        this.player.inventory[1] = { ...ARROW_ITEM, count: 20 };
        // Give player a sword for testing
        this.player.inventory[2] = new Sword(1.0);
        requestAnimationFrame((ts) => this.gameLoop(ts));
    }

    setupEventListeners() {
        window.addEventListener('keydown', (e) => {
            this.keys[e.key] = true;
            if (e.key === 'Escape') {
                if (this.player.extendedInventoryOpen) {
                    this.player.extendedInventoryOpen = false;
                    this.draggedItem = null;
                    this.draggedIndex = null;
                } else {
                    window.close();
                }
            } else if (e.key === 'e' || e.key === 'E') {
                this.player.extendedInventoryOpen = !this.player.extendedInventoryOpen;
                this.draggedItem = null;
                this.draggedIndex = null;
            } else if (!this.player.extendedInventoryOpen && /^[1-9]$|^0$/.test(e.key)) {
                // Hotbar selection (1-0)
                let idx = e.key === '0' ? 9 : parseInt(e.key) - 1;
                this.selectedHotbar = idx;
            }
        });
        window.addEventListener('keyup', (e) => {
            this.keys[e.key] = false;
        });
        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            this.mouseX = e.clientX - rect.left;
            this.mouseY = e.clientY - rect.top;
            if (this.player.extendedInventoryOpen) {
                this.inventoryMouse.x = this.mouseX;
                this.inventoryMouse.y = this.mouseY;
            }
        });
        this.canvas.addEventListener('mousedown', (e) => {
            const selectedItem = this.player.inventory[this.selectedHotbar];
            if (e.button === 0) {
                // Left click: only swing if sword is selected
                if (selectedItem && selectedItem.type === "sword") {
                    const screenW = this.canvas.width;
                    const screenH = this.canvas.height;
                    const camX = screenW / 2;
                    const camY = screenH / 2;
                    const dx = this.mouseX - camX;
                    const dy = this.mouseY - camY;
                    const mouseAngle = Math.atan2(dy, dx);
                    this.player.startSwing(mouseAngle);
                }
            } else if (e.button === 2) {
                // Right click: only charge/fire if bow is selected and there are arrows
                if (selectedItem && selectedItem.type === "bow") {
                    const arrowItem = this.player.inventory.find(it => it && it.type === "arrow" && it.count > 0);
                    if (arrowItem) {
                        selectedItem.charging = true;
                        selectedItem.chargeStart = performance.now() / 1000;
                    }
                }
            }
            // Track mouse button states for potion usage
            if (e.button === 2) this.keys['Mouse2'] = true;
            
            if (this.player.extendedInventoryOpen && e.button === 0) {
                // Inventory drag start
                const {slot, index} = this.getInventorySlotAt(this.inventoryMouse.x, this.inventoryMouse.y);
                if (slot !== null && this.player.inventory[index]) {
                    this.draggedItem = this.player.inventory[index];
                    this.draggedIndex = index;
                }
            }
        });
        this.canvas.addEventListener('mouseup', (e) => {
            const selectedItem = this.player.inventory[this.selectedHotbar];
            if (e.button === 2) {
                // Right mouse: release bow (only if selected)
                if (selectedItem && selectedItem.type === "bow" && selectedItem.charging) {
                    const arrowIdx = this.player.inventory.findIndex(it => it && it.type === "arrow" && it.count > 0);
                    const arrowItem = this.player.inventory[arrowIdx];
                    if (arrowItem) {
                        const now = performance.now() / 1000;
                        const chargeTime = Math.min(selectedItem.maxChargeTime, now - selectedItem.chargeStart);
                        const minCharge = 0.2; // Minimum charge time in seconds
                        if (chargeTime < minCharge) {
                            selectedItem.charging = false;
                            return;
                        }
                        const chargeRatio = Math.max(0.1, chargeTime / selectedItem.maxChargeTime);
                        const minSpeed = 400;
                        const maxSpeed = 1400;
                        const speed = minSpeed + (maxSpeed - minSpeed) * Math.pow(chargeRatio, 2.5);
                        const damage = selectedItem.power * chargeRatio * (arrowItem.damage || 1);
                        const screenW = this.canvas.width;
                        const screenH = this.canvas.height;
                        const camX = screenW / 2;
                        const camY = screenH / 2;
                        const dx = this.mouseX - camX;
                        const dy = this.mouseY - camY;
                        const mouseAngle = Math.atan2(dy, dx);
                        const px = this.player.x + Math.cos(mouseAngle) * (this.player.radius + 32);
                        const py = this.player.y + Math.sin(mouseAngle) * (this.player.radius + 32);
                        this.projectiles.push(new Projectile(
                            px, py, mouseAngle, speed, damage, false, null, 16, "arrow", "#00f", "#888" // tip is grey
                        ));
                        arrowItem.count--;
                        if (arrowItem.count <= 0) this.player.inventory[arrowIdx] = null;
                        selectedItem.charging = false;
                    }
                }
            }
            // Track mouse button states for potion usage
            if (e.button === 2) this.keys['Mouse2'] = false;
            
            if (this.player.extendedInventoryOpen && e.button === 0 && this.draggedItem) {
                // Inventory drag end
                const {slot, index} = this.getInventorySlotAt(this.inventoryMouse.x, this.inventoryMouse.y);
                if (slot !== null && index !== this.draggedIndex) {
                    // Swap items
                    const temp = this.player.inventory[index];
                    this.player.inventory[index] = this.draggedItem;
                    this.player.inventory[this.draggedIndex] = temp;
                }
                this.draggedItem = null;
                this.draggedIndex = null;
            }
        });
        // Prevent context menu on right click
        this.canvas.addEventListener('contextmenu', e => e.preventDefault());
    }

    handleInput(dt) {
        let dx = 0, dy = 0;
        if (this.keys['ArrowLeft'] || this.keys['a']) dx -= 1;
        if (this.keys['ArrowRight'] || this.keys['d']) dx += 1;
        if (this.keys['ArrowUp'] || this.keys['w']) dy -= 1; // Up decreases Y (standard screen coordinates)
        if (this.keys['ArrowDown'] || this.keys['s']) dy += 1; // Down increases Y (standard screen coordinates)
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

        // Update current room in dungeon
        this.dungeon.updateCurrentRoom(this.player.x, this.player.y);

        // Only update enemies in the current room
        const currentRoom = this.dungeon.getRoom(roomX, roomY);
        if (currentRoom) {
            for (let i = currentRoom.enemies.length - 1; i >= 0; i--) {
                const enemy = currentRoom.enemies[i];
                enemy.updateDamageNumbers(dt);
                
                if (enemy.dead) {
                    enemy.deathTimer -= dt;
                    if (enemy.deathTimer <= 0) {
                        const indexInRoom = currentRoom.enemies.indexOf(enemy);
                        if (indexInRoom > -1) {
                            currentRoom.enemies.splice(indexInRoom, 1);
                            
                            // Drop a coin when an enemy dies
                            const coin = {
                                x: enemy.x,
                                y: enemy.y,
                                radius: 10,
                                name: "Coin",
                                color: "gold"
                            };
                            currentRoom.droppedItems.push(coin);
                        }
                    }
                    continue;
                }

                enemy.moveToward(this.player, dt, currentRoom.enemies, this.dungeon);
                
                if (enemy.reload > 0) enemy.reload -= dt;
                if (enemy.canAttack(this.player) && enemy.reload <= 0) {
                    this.player.hp--;
                    enemy.reload = 1.0;
                }
            }
        }

        // Arrow collision with enemies
        for (const proj of this.projectiles) {
            if (!proj.alive || proj.type !== "arrow") continue;
            // Only check enemies in current room
            const gx = Math.floor(proj.x / TILE_SIZE);
            const gy = Math.floor(proj.y / TILE_SIZE);
            const roomX = Math.floor(gx / ROOM_SIZE);
            const roomY = Math.floor(gy / ROOM_SIZE);
            const room = this.dungeon.getRoom(roomX, roomY);
            if (!room) continue;
            for (const enemy of room.enemies) {
                if (enemy.dead) continue;
                const dist = Math.sqrt((proj.x - enemy.x) ** 2 + (proj.y - enemy.y) ** 2);
                if (dist < proj.radius + enemy.radius) {
                    enemy.takeDamage(
                        (enemy.x - proj.x) / Math.max(1, dist),
                        (enemy.y - proj.y) / Math.max(1, dist),
                        proj.damage || 1
                    );
                    proj.alive = false;
                    break;
                }
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
        this.player.updatePotionEffects(dt);
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
                const damage = 1 + this.player.getStrengthBonus(); // Base damage + strength bonus
                enemy.takeDamage(kx, ky, damage);
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
                            // Handle coins separately
                            if (item.name === "Coin") {
                                this.player.coins++;
                                room.droppedItems.splice(i, 1);
                            } else {
                                // Handle other items as before
                                const emptySlotIndex = this.player.inventory.indexOf(null);
                                if (emptySlotIndex !== -1) {
                                    this.player.inventory[emptySlotIndex] = item;
                                    room.droppedItems.splice(i, 1);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    checkShopItemPurchases() {
        const gx = Math.floor(this.player.x / TILE_SIZE);
        const gy = Math.floor(this.player.y / TILE_SIZE);
        const roomX = Math.floor(gx / ROOM_SIZE);
        const roomY = Math.floor(gy / ROOM_SIZE);
        const room = this.dungeon.getRoom(roomX, roomY);
        
        if (!room || !room.isShopRoom) return;
        
        for (let i = room.shopItems.length - 1; i >= 0; i--) {
            const shopItem = room.shopItems[i];
            const dist = Math.sqrt((this.player.x - shopItem.x)**2 + (this.player.y - shopItem.y)**2);
            if (dist < this.player.radius + shopItem.radius) {
                // Player is on the shop item square
                if (this.player.coins >= shopItem.price) {
                    const slotIndex = this.player.findFirstAvailableSlot();
                    if (slotIndex !== -1) {
                        // Remove price and count properties for inventory item
                        const inventoryItem = { ...shopItem };
                        delete inventoryItem.price;
                        delete inventoryItem.x;
                        delete inventoryItem.y;
                        delete inventoryItem.radius;
                        
                        this.player.inventory[slotIndex] = inventoryItem;
                        this.player.coins -= shopItem.price;
                        room.shopItems.splice(i, 1);
                    }
                }
                break; // Only interact with one shop item at a time
            }
        }
    }

    handlePotionUsage() {
        const selectedItem = this.player.inventory[this.selectedHotbar];
        if (!selectedItem || !selectedItem.type.includes('potion')) return;
        
        // Start charging when right mouse is pressed
        if (this.keys['Mouse2'] && !this.player.potionChargeStart) {
            this.player.potionChargeStart = performance.now() / 1000;
        }
        
        // Check if potion should be consumed (1 second charge)
        if (this.player.potionChargeStart) {
            const chargeTime = performance.now() / 1000 - this.player.potionChargeStart;
            if (chargeTime >= 1.0) {
                // Consume the potion
                if (selectedItem.type === 'health_potion') {
                    this.player.useHealthPotion(selectedItem.level);
                } else if (selectedItem.type === 'strength_potion') {
                    this.player.useStrengthPotion(selectedItem.level);
                } else if (selectedItem.type === 'speed_potion') {
                    this.player.useSpeedPotion(selectedItem.level);
                }
                
                // Remove potion from inventory
                this.player.inventory[this.selectedHotbar] = null;
                this.player.potionChargeStart = null;
            }
        }
        
        // Reset charge if right mouse is released
        if (!this.keys['Mouse2']) {
            this.player.potionChargeStart = null;
        }
    }

    getInventorySlotAt(mx, my) {
        // Only for extended inventory
        if (!this.player.extendedInventoryOpen) return {slot: null, index: null};
        const screenW = this.canvas.width;
        const screenH = this.canvas.height;
        const slotSize = 80;
        const padding = 12;
        const hotbarLength = 10;
        const extendedRows = 4;
        const inventoryWidth = (slotSize + padding) * hotbarLength - padding;
        const inventoryHeight = (slotSize + padding) * extendedRows - padding;
        const inventoryX = (screenW - inventoryWidth) / 2;
        const inventoryY = (screenH - inventoryHeight) / 2;
        for (let i = 0; i < 40; i++) {
            const row = Math.floor(i / hotbarLength);
            const col = i % hotbarLength;
            const x = inventoryX + col * (slotSize + padding);
            const y = inventoryY + row * (slotSize + padding);
            if (mx >= x && mx < x + slotSize && my >= y && my < y + slotSize) {
                return {slot: [col, row], index: i};
            }
        }
        return {slot: null, index: null};
    }

    draw() {
        // Cache these values once per draw
        const screenW = this.canvas.width;
        const screenH = this.canvas.height;
        const camX = this.player.x;
        const camY = this.player.y;
        
        // Inventory variables (needed for heart display)
        const slotSize = this.player.extendedInventoryOpen ? 80 : 60;
        const padding = this.player.extendedInventoryOpen ? 12 : 10;
        const hotbarLength = 10;
        
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = '#FFFFFF'; // Background is white
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw visible tiles
        this.dungeon.forEachVisibleTile(camX, camY, screenW, screenH, (gx, gy, type) => {
            const drawX = gx * TILE_SIZE - camX + screenW / 2;
            const drawY = gy * TILE_SIZE - camY + screenH / 2;
            if (type === 1) {
                this.ctx.fillStyle = '#808080'; // Walls - Dark Grey
                this.ctx.fillRect(drawX, drawY, TILE_SIZE, TILE_SIZE);
                // No grid lines for walls for performance
            } else if (type === 0) {
                this.ctx.fillStyle = '#FFFFFF'; // Floors - White
                this.ctx.fillRect(drawX, drawY, TILE_SIZE, TILE_SIZE);
                // Restore grid lines for floors
                this.ctx.strokeStyle = '#e0e0e0';
                this.ctx.lineWidth = 1;
                this.ctx.strokeRect(drawX, drawY, TILE_SIZE, TILE_SIZE);
            }
        });

        // Draw enemies only from current room
        const playerRoomX = Math.floor(this.player.x / TILE_SIZE / ROOM_SIZE);
        const playerRoomY = Math.floor(this.player.y / TILE_SIZE / ROOM_SIZE);
        const currentRoom = this.dungeon.getRoom(playerRoomX, playerRoomY);
        
        if (currentRoom) {
            for (const enemy of currentRoom.enemies) {
                if (enemy.dead && enemy.deathTimer <= 0) continue;
                
                this.ctx.fillStyle = 'red';
                this.ctx.beginPath();
                this.ctx.arc(enemy.x - camX + screenW / 2, enemy.y - camY + screenH / 2, enemy.radius, 0, Math.PI * 2);
                this.ctx.fill();
                
                // Draw damage numbers
                for (const dm of enemy.damageNumbers) {
                    this.ctx.fillStyle = `rgba(255, 255, 0, ${dm.opacity})`;
                    this.ctx.font = 'bold 20px Arial';
                    this.ctx.textAlign = 'center';
                    this.ctx.fillText(
                        dm.amount.toString(),
                        enemy.x - camX + screenW / 2 + dm.ox,
                        enemy.y - camY + screenH / 2 + dm.oy
                    );
                }
            }
        }

        // Draw dropped items only from current room
        if (currentRoom) {
            for (const item of currentRoom.droppedItems) {
                this.ctx.fillStyle = item.color;
                this.ctx.beginPath();
                this.ctx.arc(item.x - camX + screenW / 2, item.y - camY + screenH / 2, item.radius, 0, Math.PI * 2);
                this.ctx.fill();
            }
            
            // Draw shop items
            if (currentRoom.isShopRoom) {
                for (const shopItem of currentRoom.shopItems) {
                    // Draw shop item background
                    this.ctx.fillStyle = 'rgba(255, 215, 0, 0.3)'; // Semi-transparent gold
                    this.ctx.fillRect(
                        shopItem.x - camX + screenW / 2 - shopItem.radius,
                        shopItem.y - camY + screenH / 2 - shopItem.radius,
                        shopItem.radius * 2,
                        shopItem.radius * 2
                    );
                    
                    // Draw shop item
                    this.ctx.fillStyle = shopItem.color;
                    this.ctx.beginPath();
                    this.ctx.arc(shopItem.x - camX + screenW / 2, shopItem.y - camY + screenH / 2, shopItem.radius, 0, Math.PI * 2);
                    this.ctx.fill();
                    
                    // Draw price
                    this.ctx.fillStyle = 'gold';
                    this.ctx.font = '16px Arial';
                    this.ctx.textAlign = 'center';
                    this.ctx.fillText(
                        `${shopItem.price} coins`,
                        shopItem.x - camX + screenW / 2,
                        shopItem.y - camY + screenH / 2 + shopItem.radius + 20
                    );
                    this.ctx.textAlign = 'left';
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

        // Cache sword line for this frame
        let swordLine = null;
        if (this.player.inventory[this.selectedHotbar] && this.player.inventory[this.selectedHotbar].type === "sword") {
            // Use the same logic as Player.getSwordLine
            const dx = h2[0] - h1[0];
            const dy = h2[1] - h1[1];
            const len = Math.sqrt(dx*dx + dy*dy);
            const ext = 80;
            swordLine = [h1, [h2[0] + dx/len*ext, h2[1] + dy/len*ext]];
        }

        // Draw selected item in hand (only if sword or bow)
        const selectedItem = this.player.inventory[this.selectedHotbar];
        if (selectedItem && selectedItem.type === "sword") {
            // Use cached hand positions and sword line
            selectedItem.draw(
                this.ctx,
                this.player.x,
                this.player.y,
                this.player.mouseAngle,
                this.player.swingTime,
                this.player.swinging,
                h1, h2, swordLine,
                camX,
                camY,
                screenW,
                screenH
            );
        } else if (selectedItem && selectedItem.type === "bow") {
            // Bow faces mouse
            const bowAngle = this.player.mouseAngle;
            const bowX = screenW / 2 + Math.cos(bowAngle) * (this.player.radius + 10);
            const bowY = screenH / 2 + Math.sin(bowAngle) * (this.player.radius + 10);
            // Charge ratio (simulate charging for now)
            let chargeRatio = 0;
            if (selectedItem.charging) {
                chargeRatio = Math.min(1, (performance.now() / 1000 - selectedItem.chargeStart) / selectedItem.maxChargeTime);
            }
            selectedItem.draw(this.ctx, bowX, bowY, bowAngle, chargeRatio);
            // Draw arrow being nocked and pulled back
            // Only if player has arrows
            const arrowItem = this.player.inventory.find(it => it && it.type === "arrow" && it.count > 0);
            if (arrowItem) {
                this.ctx.save();
                this.ctx.translate(bowX, bowY);
                this.ctx.rotate(bowAngle);
                // Arrow is pulled back as charge increases
                const pull = 18 - 14 * chargeRatio;
                // Shaft
                this.ctx.strokeStyle = "#8B5C2A";
                this.ctx.lineWidth = 5;
                this.ctx.beginPath();
                this.ctx.moveTo(-18, 0);
                this.ctx.lineTo(pull, 0);
                this.ctx.stroke();
                // Tip
                this.ctx.fillStyle = arrowItem.color;
                this.ctx.beginPath();
                this.ctx.moveTo(pull + 4, 0);
                this.ctx.lineTo(pull - 4, 6);
                this.ctx.lineTo(pull - 4, -6);
                this.ctx.closePath();
                this.ctx.fill();
                this.ctx.restore();
            }
        }
        // Note: Other items (like arrows) are not displayed in the player's hands

        // Draw heart health display above hotbar
        const heartSize = 20;
        const heartSpacing = 25;
        const hotbarWidth = (slotSize + padding) * hotbarLength - padding;
        const hotbarX = (screenW - hotbarWidth) / 2;
        const hotbarY = screenH - slotSize - padding;
        const heartStartX = hotbarX;
        const heartY = hotbarY - heartSize - 10;
        
        // Draw 10 hearts (5 full hearts = 10 HP)
        for (let i = 0; i < 10; i++) {
            const heartX = heartStartX + i * heartSpacing;
            const isFull = i < this.player.hp;
            
            this.ctx.fillStyle = isFull ? '#ff6b6b' : '#444';
            this.ctx.beginPath();
            this.ctx.arc(heartX + heartSize/2, heartY + heartSize/2, heartSize/2, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Add a small border
            this.ctx.strokeStyle = '#fff';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
        }

        // Display current room coordinates
        const currentRoomDisplayX = Math.floor(this.player.x / TILE_SIZE / ROOM_SIZE);
        const currentRoomDisplayY = Math.floor(this.player.y / TILE_SIZE / ROOM_SIZE);
        this.ctx.fillStyle = 'black';
        this.ctx.font = '24px Arial';
        this.ctx.textAlign = 'right';
        this.ctx.fillText(`Room: (${currentRoomDisplayX}, ${currentRoomDisplayY})`, screenW - 20, 40);
        this.ctx.textAlign = 'left'; // Reset text alignment

        // Display coins in top right (moved below room coordinates)
        this.ctx.fillStyle = 'gold';
        this.ctx.font = '24px Arial';
        this.ctx.textAlign = 'right';
        this.ctx.fillText(`Coins: ${this.player.coins}`, screenW - 20, 70);
        this.ctx.textAlign = 'left'; // Reset text alignment

        // Display active potion effects
        let effectY = 100;
        this.ctx.font = '16px Arial';
        this.ctx.textAlign = 'left';
        
        if (this.player.potionEffects.strength.duration > 0) {
            this.ctx.fillStyle = '#ff8e53';
            this.ctx.fillText(
                `Strength +${this.player.potionEffects.strength.level} (${Math.ceil(this.player.potionEffects.strength.duration)}s)`,
                20, effectY
            );
            effectY += 25;
        }
        
        if (this.player.potionEffects.speed.duration > 0) {
            this.ctx.fillStyle = '#4ecdc4';
            this.ctx.fillText(
                `Speed +${this.player.potionEffects.speed.level} (${Math.ceil(this.player.potionEffects.speed.duration)}s)`,
                20, effectY
            );
            effectY += 25;
        }

        // Draw Inventory
        if (this.player.extendedInventoryOpen) {
            // Large centered inventory
            const extendedRows = 4;
            const inventoryWidth = (slotSize + padding) * hotbarLength - padding;
            const inventoryHeight = (slotSize + padding) * extendedRows - padding;
            const inventoryX = (screenW - inventoryWidth) / 2;
            const inventoryY = (screenH - inventoryHeight) / 2;
            this.ctx.strokeStyle = '#FFFFFF';
            this.ctx.lineWidth = 4;
            // Background
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            this.ctx.fillRect(inventoryX - padding, inventoryY - padding, inventoryWidth + padding * 2, inventoryHeight + padding * 2);
            for (let i = 0; i < 40; i++) {
                const row = Math.floor(i / hotbarLength);
                const col = i % hotbarLength;
                const x = inventoryX + col * (slotSize + padding);
                const y = inventoryY + row * (slotSize + padding);
                this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
                this.ctx.fillRect(x, y, slotSize, slotSize);
                this.ctx.strokeRect(x, y, slotSize, slotSize);
                // Draw items
                if (this.player.inventory[i] && (!this.draggedItem || this.draggedIndex !== i)) {
                    this.drawInventoryItem(this.player.inventory[i], x, y, slotSize);
                }
            }
            // Draw dragged item following mouse
            if (this.draggedItem) {
                this.drawInventoryItem(this.draggedItem, this.inventoryMouse.x - slotSize/2, this.inventoryMouse.y - slotSize/2, slotSize, 0.7);
            }
        } else {
            // Draw hotbar only
            const inventoryWidth = (slotSize + padding) * hotbarLength - padding;
            const inventoryX = (screenW - inventoryWidth) / 2;
            const hotbarY = screenH - slotSize - padding;
            this.ctx.strokeStyle = '#FFFFFF';
            this.ctx.lineWidth = 3;
            for (let i = 0; i < hotbarLength; i++) {
                const x = inventoryX + i * (slotSize + padding);
                const y = hotbarY;
                this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
                this.ctx.fillRect(x, y, slotSize, slotSize);
                this.ctx.strokeRect(x, y, slotSize, slotSize);
                if (i === this.selectedHotbar) {
                    this.ctx.lineWidth = 5;
                    this.ctx.strokeStyle = '#FFD700';
                    this.ctx.strokeRect(x + 2, y + 2, slotSize - 4, slotSize - 4);
                    this.ctx.lineWidth = 3;
                    this.ctx.strokeStyle = '#FFFFFF';
                }
                // Draw hotbar items
                if (this.player.inventory[i]) {
                    this.drawInventoryItem(this.player.inventory[i], x, y, slotSize);
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

        // --- Draw projectiles ---
        for (const proj of this.projectiles) {
            // Convert world to screen coordinates
            this.ctx.save();
            this.ctx.translate(-this.player.x + this.canvas.width / 2, -this.player.y + this.canvas.height / 2);
            proj.draw(this.ctx);
            this.ctx.restore();
        }

        // --- FPS Counter ---
        if (!this.lastFrameTime) this.lastFrameTime = performance.now();
        const now = performance.now();
        const dt = (now - this.lastFrameTime) / 1000;
        this.lastFrameTime = now;
        const fps = Math.round(1 / dt);
        this.ctx.fillStyle = '#222';
        this.ctx.font = '18px Arial';
        this.ctx.fillText(`FPS: ${fps}`, 20, 70);
    }

    drawInventoryItem(item, x, y, slotSize, alpha = 1) {
        this.ctx.save();
        this.ctx.globalAlpha = alpha;
        if (item.type === "bow") {
            this.ctx.save();
            this.ctx.translate(x + slotSize / 2, y + slotSize / 2);
            this.ctx.rotate(0);
            this.ctx.scale(slotSize/100, slotSize/100);
            item.draw(this.ctx, 0, 0, 0, 0);
            this.ctx.restore();
        } else if (item.type === "sword") {
            Sword.drawInventoryIcon(this.ctx, x, y, slotSize);
        } else if (item.type === "arrow") {
            this.ctx.save();
            this.ctx.translate(x + slotSize / 2, y + slotSize / 2);
            this.ctx.rotate(0);
            this.ctx.strokeStyle = "#8B5C2A";
            this.ctx.lineWidth = Math.max(5, slotSize/16);
            this.ctx.beginPath();
            this.ctx.moveTo(-slotSize/2.5, 0);
            this.ctx.lineTo(slotSize/2.5, 0);
            this.ctx.stroke();
            this.ctx.fillStyle = item.color;
            this.ctx.beginPath();
            this.ctx.moveTo(slotSize/2.5 + 6, 0);
            this.ctx.lineTo(slotSize/2.5 - 8, 8);
            this.ctx.lineTo(slotSize/2.5 - 8, -8);
            this.ctx.closePath();
            this.ctx.fill();
            this.ctx.restore();
            if (item.count > 1) {
                this.ctx.fillStyle = '#fff';
                this.ctx.font = Math.floor(slotSize/4) + 'px Arial';
                this.ctx.textAlign = 'right';
                this.ctx.fillText(item.count, x + slotSize - 6, y + slotSize - 8);
                this.ctx.textAlign = 'left';
            }
        } else if (item.type.includes('potion')) {
            // Draw potion bottle
            this.ctx.save();
            this.ctx.translate(x + slotSize / 2, y + slotSize / 2);
            
            // Bottle body
            this.ctx.fillStyle = item.color;
            this.ctx.fillRect(-slotSize/4, -slotSize/3, slotSize/2, slotSize/1.5);
            
            // Bottle neck
            this.ctx.fillRect(-slotSize/8, -slotSize/2, slotSize/4, slotSize/6);
            
            // Potion level indicator
            this.ctx.fillStyle = '#fff';
            this.ctx.font = Math.floor(slotSize/6) + 'px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(`Lv.${item.level}`, 0, slotSize/4);
            this.ctx.textAlign = 'left';
            
            this.ctx.restore();
        } else {
            this.ctx.fillStyle = item.color || '#888';
            this.ctx.beginPath();
            this.ctx.arc(x + slotSize / 2, y + slotSize / 2, slotSize/2.5, 0, Math.PI * 2);
            this.ctx.fill();
        }
        this.ctx.restore();
    }

    gameLoop(timestamp) {
        if (!this.lastTime) this.lastTime = timestamp;
        const dt = (timestamp - this.lastTime) / 1000;
        this.lastTime = timestamp;
        // --- PAUSE GAME LOGIC IF INVENTORY OPEN ---
        if (!this.player.extendedInventoryOpen && this.player.hp > 0) {
            this.handleInput(dt);
            this.updateEnemies(dt);
            this.updatePlayer(dt);
            this.checkSwordHits();
            this.checkItemPickups();
            this.checkShopItemPurchases();
            this.handlePotionUsage();
        }
        // --- Update projectiles even if paused, so they draw, but don't move if paused ---
        if (!this.player.extendedInventoryOpen) {
            for (const proj of this.projectiles) {
                proj.update(dt, this.dungeon, []); // No homing for test
            }
            // Remove dead projectiles
            this.projectiles = this.projectiles.filter(p => p.alive);
        }
        this.draw();
        // Only continue game loop if player is alive
        if (this.player.hp > 0) {
            requestAnimationFrame((ts) => this.gameLoop(ts));
        }
    }
}

window.onload = () => {
    new Game();
}; 