/** Maps samples to canvas coordinates (pure, unit-tested). */
export function sparkPoints(values: readonly number[], width: number, height: number, min: number, max: number, pad = 2): [number, number][] {
  if (values.length === 0) return [];
  const span = max - min || 1;
  const step = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0;
  return values.map((v, i) => {
    const n = Math.min(1, Math.max(0, (v - min) / span));
    return [pad + i * step, height - pad - n * (height - pad * 2)];
  });
}

export function drawSparkline(ctx: CanvasRenderingContext2D, values: readonly number[], min: number, max: number, hue: string): void {
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);
  const pts = sparkPoints(values, width, height, min, max);
  if (pts.length < 2) return;
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, `${hue}55`);
  grad.addColorStop(1, `${hue}00`);
  ctx.beginPath();
  ctx.moveTo(pts[0]![0], height);
  for (const [x, y] of pts) ctx.lineTo(x, y);
  ctx.lineTo(pts[pts.length - 1]![0], height);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.strokeStyle = hue;
  ctx.lineWidth = Math.max(1, width / 160);
  ctx.shadowColor = hue;
  ctx.shadowBlur = 6;
  ctx.stroke();
  ctx.shadowBlur = 0;
  const [lx, ly] = pts[pts.length - 1]!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(lx - 1.5, ly - 1.5, 3, 3);
}
