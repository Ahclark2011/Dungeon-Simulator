import pygame
import sys
from dungeon_generator import DungeonGenerator
from player import Player

# Initialize Pygame
pygame.init()

# Constants
SCREEN_WIDTH = 800
SCREEN_HEIGHT = 600
TILE_SIZE = 32
FPS = 60

# Colors
BLACK = (0, 0, 0)
WHITE = (255, 255, 255)
GRAY = (128, 128, 128)

class Game:
    def __init__(self):
        self.screen = pygame.display.set_mode((SCREEN_WIDTH, SCREEN_HEIGHT))
        pygame.display.set_caption("Dungeon Crawler")
        self.clock = pygame.time.Clock()
        self.dungeon = DungeonGenerator(25, 25)  # 25x25 grid
        self.player = Player(self.dungeon.start_pos)
        self.running = True

    def handle_events(self):
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                self.running = False
            elif event.type == pygame.KEYDOWN:
                if event.key == pygame.K_ESCAPE:
                    self.running = False

        # Handle continuous key presses
        keys = pygame.key.get_pressed()
        if keys[pygame.K_LEFT]:
            self.player.move(-1, 0, self.dungeon)
        if keys[pygame.K_RIGHT]:
            self.player.move(1, 0, self.dungeon)
        if keys[pygame.K_UP]:
            self.player.move(0, -1, self.dungeon)
        if keys[pygame.K_DOWN]:
            self.player.move(0, 1, self.dungeon)

    def update(self):
        pass  # Add game logic updates here

    def draw(self):
        self.screen.fill(BLACK)
        
        # Draw dungeon
        for y in range(self.dungeon.height):
            for x in range(self.dungeon.width):
                pos = (x * TILE_SIZE, y * TILE_SIZE)
                if self.dungeon.grid[y][x] == 1:  # Wall
                    pygame.draw.rect(self.screen, GRAY, (*pos, TILE_SIZE, TILE_SIZE))
                else:  # Floor
                    pygame.draw.rect(self.screen, WHITE, (*pos, TILE_SIZE, TILE_SIZE), 1)

        # Draw player
        player_pos = (self.player.x * TILE_SIZE, self.player.y * TILE_SIZE)
        pygame.draw.circle(
            self.screen,
            (210, 180, 140),  # Tan color
            (player_pos[0] + TILE_SIZE // 2, player_pos[1] + TILE_SIZE // 2),
            TILE_SIZE // 2 - 2  # Slightly smaller than the tile to leave a small gap
        )

        pygame.display.flip()

    def run(self):
        while self.running:
            self.handle_events()
            self.update()
            self.draw()
            self.clock.tick(FPS)

if __name__ == "__main__":
    game = Game()
    game.run()
    pygame.quit()
    sys.exit() 