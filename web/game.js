// --- Room-based endless dungeon ---
const ROOM_SIZE = 28;
const TILE_SIZE = 64;
const DOOR_WIDTH = 2; // doors are 2 tiles wide

class Enemy {
    constructor(x, y, radius = TILE_SIZE / 2 - 6) {
        this.x = x;
        this.y = y;
        this.radius = radius;
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
        // Random offset within enemy circle
        const angle = Math.random() * 2 * Math.PI;
        const r = Math.random() * (this.radius - 10);
        const ox = Math.cos(angle) * r;
        const oy = Math.sin(angle) * r;
        this.damageNumbers.push({
            amount,
            ox,
            oy,
            t: 0
        });
    }
    updateDamageNumbers(dt) {
        this.damageNumbers.forEach(dn => dn.t += dt);
        this.damageNumbers = this.damageNumbers.filter(dn => dn.t < 1.0);
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
        let stopDist = this.radius + player.radius - 6; // allow a little overlap
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
                const checkX = nx + Math.cos(angle) * this.radius;
                const checkY = ny + Math.sin(angle) * this.radius;
                if (dungeon.isWallAtPixel(checkX, checkY)) return false;
            }
            if (nx < -10000 || nx > 10000 || ny < -10000 || ny > 10000) return false;
            // Don't move into player
            const px = player.x - nx;
            const py = player.y - ny;
            if (Math.sqrt(px*px + py*py) < this.radius + player.radius - 2) return false;
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
        return dist < this.radius + player.radius - 2;
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
    constructor(roomX, roomY, neighbors, playerSpawn, isStartRoom = false) {
        this.roomX = roomX;
        this.roomY = roomY;
        this.grid = Array(ROOM_SIZE).fill().map(() => Array(ROOM_SIZE).fill(1));
        this.doors = this.generateDoors(neighbors);
        this.carveRoom();
        this.enemies = [];
        this.spawned = false;
        // Always spawn enemies, only avoid player spawn in start room
        this.spawnEnemies(isStartRoom ? playerSpawn : null);
    }

    generateDoors(neighbors) {
        // neighbors: {N: Room|null, S: Room|null, E: Room|null, W: Room|null}
        const walls = ['N', 'S', 'E', 'W'];
        let doors = [];
        let doorPositions = {};
        // 1. Always add doors to connect to existing neighbors, aligned with their doors
        for (const dir of walls) {
            if (neighbors[dir] && neighbors[dir].doors) {
                // Align with neighbor's door
                if (dir === 'N' && neighbors[dir].doors['S'] !== undefined) {
                    doors.push('N');
                    doorPositions['N'] = neighbors[dir].doors['S'];
                }
                if (dir === 'S' && neighbors[dir].doors['N'] !== undefined) {
                    doors.push('S');
                    doorPositions['S'] = neighbors[dir].doors['N'];
                }
                if (dir === 'E' && neighbors[dir].doors['W'] !== undefined) {
                    doors.push('E');
                    doorPositions['E'] = neighbors[dir].doors['W'];
                }
                if (dir === 'W' && neighbors[dir].doors['E'] !== undefined) {
                    doors.push('W');
                    doorPositions['W'] = neighbors[dir].doors['E'];
                }
            }
        }
        // 2. Add random doors until we have at least 3, but only if no neighbor exists in that direction
        while (doors.length < 3) {
            const dir = walls[Math.floor(Math.random() * 4)];
            if (!doors.includes(dir) && !neighbors[dir]) {
                if (dir === 'N' || dir === 'S') {
                    let x = Math.floor(Math.random() * (ROOM_SIZE - 2 - DOOR_WIDTH + 1)) + 1;
                    doorPositions[dir] = x;
                } else {
                    let y = Math.floor(Math.random() * (ROOM_SIZE - 2 - DOOR_WIDTH + 1)) + 1;
                    doorPositions[dir] = y;
                }
                doors.push(dir);
            }
        }
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

    spawnEnemies(playerSpawn) {
        if (this.spawned) return;
        this.spawned = true;
        const numEnemies = Math.floor(Math.random() * 4) + 2;
        let attempts = 0;
        while (this.enemies.length < numEnemies && attempts < 100) {
            attempts++;
            const x = Math.floor(Math.random() * (ROOM_SIZE - 2)) + 1;
            const y = Math.floor(Math.random() * (ROOM_SIZE - 2)) + 1;
            if (this.grid[y][x] !== 0) continue;
            // Only avoid player spawn for starting room
            if (playerSpawn) {
                const px = playerSpawn[0];
                const py = playerSpawn[1];
                if (Math.abs(x - px) < 2 && Math.abs(y - py) < 2) continue;
            }
            let overlap = false;
            for (const e of this.enemies) {
                if (Math.abs(e.x - x) < 2 && Math.abs(e.y - y) < 2) {
                    overlap = true;
                    break;
                }
            }
            if (overlap) continue;
            this.enemies.push(new Enemy(x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE + TILE_SIZE / 2));
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
    }

    getRoom(roomX, roomY, playerSpawn, isStartRoom = false, entering = false) {
        const key = `${roomX},${roomY}`;
        if (!this.rooms.has(key)) {
            const neighbors = {
                N: this.rooms.get(`${roomX},${roomY-1}`) || null,
                S: this.rooms.get(`${roomX},${roomY+1}`) || null,
                E: this.rooms.get(`${roomX+1},${roomY}`) || null,
                W: this.rooms.get(`${roomX-1},${roomY}`) || null,
            };
            this.rooms.set(key, new Room(roomX, roomY, neighbors, playerSpawn, isStartRoom));
        }
        const room = this.rooms.get(key);
        // Only spawn enemies when entering the room
        if (entering) room.spawnEnemies(playerSpawn);
        return room;
    }

    loadAdjacentRooms(centerX, centerY, playerSpawn) {
        // Load all 8 adjacent and diagonal rooms
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const nx = centerX + dx;
                const ny = centerY + dy;
                // Only avoid player spawn and set entering=true for the center room
                this.getRoom(
                    nx,
                    ny,
                    (dx === 0 && dy === 0) ? playerSpawn : null,
                    (nx === 0 && ny === 0),
                    (dx === 0 && dy === 0) // entering=true only for center
                );
            }
        }
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

    getEnemiesInRoom(px, py) {
        const gx = Math.floor(px / TILE_SIZE);
        const gy = Math.floor(py / TILE_SIZE);
        const roomX = Math.floor(gx / ROOM_SIZE);
        const roomY = Math.floor(gy / ROOM_SIZE);
        return this.getRoom(roomX, roomY).enemies;
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
        this.invuln = 0;
        this.swinging = false;
        this.swingAngle = 0;
        this.swingTime = 0;
        this.mouseAngle = 0;
        this.hands = [0, 0];
        this.swingStartAngle = 0;
        this.swingDir = 1;
        this.hitEnemiesThisSwing = new Set();
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
        const ext = 40;
        return [h1, [h2[0] + dx/len*ext, h2[1] + dy/len*ext]];
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
        this.mouseX = 0;
        this.mouseY = 0;
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
        // Ensure enemies are spawned for current room and all adjacent/diagonal rooms
        const gx = Math.floor(this.player.x / TILE_SIZE);
        const gy = Math.floor(this.player.y / TILE_SIZE);
        const roomX = Math.floor(gx / ROOM_SIZE);
        const roomY = Math.floor(gy / ROOM_SIZE);
        const isStartRoom = (roomX === 0 && roomY === 0);
        const playerSpawn = isStartRoom ? this.player.spawnTile : null;
        const key = `${roomX},${roomY}`;
        if (this.dungeon.lastRoomKey !== key) {
            this.dungeon.loadAdjacentRooms(roomX, roomY, playerSpawn);
            this.dungeon.lastRoomKey = key;
        }
        const enemies = this.dungeon.getEnemiesInRoom(this.player.x, this.player.y);
        for (let i = enemies.length - 1; i >= 0; i--) {
            const enemy = enemies[i];
            enemy.updateDamageNumbers(dt);
            if (enemy.dead) {
                enemy.deathTimer -= dt;
                if (enemy.deathTimer <= 0) {
                    enemies.splice(i, 1); // remove after indicator
                }
                continue;
            }
            enemy.moveToward(this.player, dt, enemies, this.dungeon);
            if (enemy.reload > 0) enemy.reload -= dt;
            if (enemy.canAttack(this.player) && enemy.reload <= 0 && this.player.invuln <= 0) {
                this.player.hp--;
                this.player.invuln = 1.0;
                enemy.reload = 1.0;
            }
        }
        if (this.player.invuln > 0) this.player.invuln -= dt;
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
        const enemies = this.dungeon.getEnemiesInRoom(this.player.x, this.player.y);
        const [p1, p2] = this.player.getSwordLine();
        for (const enemy of enemies) {
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
            if (dist < enemy.radius + 8) {
                // Knockback direction
                const kx = (enemy.x - this.player.x) / Math.max(1, Math.sqrt((enemy.x - this.player.x)**2 + (enemy.y - this.player.y)**2));
                const ky = (enemy.y - this.player.y) / Math.max(1, Math.sqrt((enemy.x - this.player.x)**2 + (enemy.y - this.player.y)**2));
                enemy.takeDamage(kx, ky, 1);
                this.player.hitEnemiesThisSwing.add(enemy);
            }
        }
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
                this.ctx.strokeStyle = '#e0e0e0';
                this.ctx.lineWidth = 1;
                this.ctx.strokeRect(px, py, TILE_SIZE, TILE_SIZE);
            }
        );
        // Draw enemies in current room
        const enemies = this.dungeon.getEnemiesInRoom(this.player.x, this.player.y);
        for (const enemy of enemies) {
            if (enemy.dead) {
                // Draw a red X for dead enemies
                this.ctx.save();
                this.ctx.globalAlpha = Math.max(0, enemy.deathTimer);
                this.ctx.strokeStyle = '#ff2222';
                this.ctx.lineWidth = 8;
                this.ctx.beginPath();
                this.ctx.moveTo(offsetX + enemy.x - enemy.radius, offsetY + enemy.y - enemy.radius);
                this.ctx.lineTo(offsetX + enemy.x + enemy.radius, offsetY + enemy.y + enemy.radius);
                this.ctx.moveTo(offsetX + enemy.x + enemy.radius, offsetY + enemy.y - enemy.radius);
                this.ctx.lineTo(offsetX + enemy.x - enemy.radius, offsetY + enemy.y + enemy.radius);
                this.ctx.stroke();
                this.ctx.restore();
            }
            if (!enemy.dead) {
                this.ctx.fillStyle = enemy.color;
                this.ctx.beginPath();
                this.ctx.arc(offsetX + enemy.x, offsetY + enemy.y, enemy.radius, 0, Math.PI * 2);
                this.ctx.fill();
            }
            // Draw damage numbers
            for (const dn of enemy.damageNumbers) {
                // Animate: drop, bounce, drop, fade out
                let y = -30 * dn.t + 20 * Math.sin(Math.PI * dn.t);
                let alpha = 1.0 - dn.t;
                this.ctx.save();
                this.ctx.globalAlpha = Math.max(0, alpha);
                this.ctx.fillStyle = '#ffcc00';
                this.ctx.font = 'bold 32px Arial';
                this.ctx.textAlign = 'center';
                this.ctx.fillText(
                    dn.amount,
                    offsetX + enemy.x + dn.ox,
                    offsetY + enemy.y + dn.oy + y
                );
                this.ctx.restore();
            }
        }
        // Draw player hands
        const [h1, h2] = this.player.getHandPositions();
        this.ctx.fillStyle = '#D2B48C';
        this.ctx.beginPath();
        this.ctx.arc(offsetX + h1[0], offsetY + h1[1], 14, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.beginPath();
        this.ctx.arc(offsetX + h2[0], offsetY + h2[1], 14, 0, Math.PI * 2);
        this.ctx.fill();
        // Draw sword
        const [s1, s2] = this.player.getSwordLine();
        this.ctx.strokeStyle = '#888';
        this.ctx.lineWidth = 8;
        this.ctx.beginPath();
        this.ctx.moveTo(offsetX + s1[0], offsetY + s1[1]);
        this.ctx.lineTo(offsetX + s2[0], offsetY + s2[1]);
        this.ctx.stroke();
        // Draw player
        this.ctx.fillStyle = this.player.invuln > 0 ? '#ffe4b5' : '#D2B48C';
        this.ctx.beginPath();
        this.ctx.arc(screenW / 2, screenH / 2, this.player.radius, 0, Math.PI * 2);
        this.ctx.fill();
        // Draw HP
        this.ctx.fillStyle = '#c0392b';
        this.ctx.font = '32px Arial';
        this.ctx.fillText('HP: ' + this.player.hp, 20, 40);
        // Draw room coordinates
        this.ctx.fillStyle = '#333';
        this.ctx.font = '28px Arial';
        this.ctx.textAlign = 'right';
        this.ctx.fillText(`Room: (${roomX}, ${roomY})`, this.canvas.width - 20, 40);
        this.ctx.textAlign = 'left';
        // Game over
        if (this.player.hp <= 0) {
            this.ctx.fillStyle = '#c0392b';
            this.ctx.font = 'bold 80px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('GAME OVER', screenW/2, screenH/2);
            this.ctx.textAlign = 'left';
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
        }
        this.draw();
        requestAnimationFrame((ts) => this.gameLoop(ts));
    }
}

window.onload = () => {
    new Game();
}; 