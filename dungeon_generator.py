import random
import numpy as np

class DungeonGenerator:
    def __init__(self, width, height):
        self.width = width
        self.height = height
        self.grid = np.zeros((height, width), dtype=int)
        self.start_pos = None
        self.generate()

    def generate(self):
        # Fill with walls
        self.grid.fill(1)
        
        # Create rooms
        num_rooms = random.randint(5, 10)
        for _ in range(num_rooms):
            room_width = random.randint(3, 6)
            room_height = random.randint(3, 6)
            x = random.randint(1, self.width - room_width - 1)
            y = random.randint(1, self.height - room_height - 1)
            
            # Carve out room
            self.grid[y:y+room_height, x:x+room_width] = 0
            
            # Connect rooms with corridors
            if self.start_pos is None:
                self.start_pos = (x + room_width//2, y + room_height//2)
            else:
                self.create_corridor(
                    self.start_pos[0], self.start_pos[1],
                    x + room_width//2, y + room_height//2
                )

    def create_corridor(self, x1, y1, x2, y2):
        # Create L-shaped corridor
        if random.random() < 0.5:
            # First horizontal, then vertical
            self.grid[y1, min(x1, x2):max(x1, x2) + 1] = 0
            self.grid[min(y1, y2):max(y1, y2) + 1, x2] = 0
        else:
            # First vertical, then horizontal
            self.grid[min(y1, y2):max(y1, y2) + 1, x1] = 0
            self.grid[y2, min(x1, x2):max(x1, x2) + 1] = 0

    def is_walkable(self, x, y):
        if 0 <= x < self.width and 0 <= y < self.height:
            return self.grid[y][x] == 0
        return False 