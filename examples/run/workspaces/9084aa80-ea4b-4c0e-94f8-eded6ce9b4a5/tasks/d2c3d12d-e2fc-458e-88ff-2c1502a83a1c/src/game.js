export function createGame(level) {
  const width = level?.width ?? 800;
  return {
    x: 40,
    y: 360,
    level,
    move(dx) {
      this.x = Math.max(0, Math.min(width - 32, this.x + dx));
    },
    jump() {
      this.y = Math.max(80, this.y - 48);
    },
  };
}
