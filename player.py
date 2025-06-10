class Player:
    def __init__(self, start_pos):
        self.x, self.y = start_pos
        self.speed = 1

    def move(self, dx, dy, dungeon):
        new_x = self.x + dx * self.speed
        new_y = self.y + dy * self.speed
        
        # Check if the new position is walkable
        if dungeon.is_walkable(new_x, new_y):
            self.x = new_x
            self.y = new_y 