// rigpop-motion v2 · the Indimation look: bold dark outline, flat fill, one cel shadow.
export const INK = '#1a1316';
export const LW = 5; // base outline width in world units

// Fill a path, add one hard-edged cel shadow clipped inside it, then outline it.
//   build(g)   adds the shape's path (no beginPath needed)
//   shade      (g) => adds the shadow region's path, drawn clipped to the shape
export function cel(g, build, fill, shadeCol, shade, lw = LW) {
  g.beginPath(); build(g);
  g.fillStyle = fill; g.fill();
  if (shade && shadeCol) {
    g.save();
    g.beginPath(); build(g); g.clip();
    g.beginPath(); const rule = shade(g);
    g.fillStyle = shadeCol; g.fill(rule === 'evenodd' ? 'evenodd' : 'nonzero');
    g.restore();
  }
  if (lw > 0) {
    g.beginPath(); build(g);
    g.lineJoin = 'round'; g.lineCap = 'round';
    g.lineWidth = lw; g.strokeStyle = INK; g.stroke();
  }
}

// A rubber-hose limb through points pts with width w: ink, fill, inner cel shadow.
// Drawn as strokes with round joins so the joint can never open a seam.
export function limb(g, pts, w, fill, shadeCol, lw = LW, shadeSide = 1) {
  const path = () => { g.beginPath(); g.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y); };
  g.lineJoin = 'round'; g.lineCap = 'round';
  path(); g.strokeStyle = INK; g.lineWidth = w + lw * 2; g.stroke();
  path(); g.strokeStyle = fill; g.lineWidth = w; g.stroke();
  if (!shadeCol) return;
  // shadow: a thinner stroke pushed to one side along the averaged normal, stays inside
  const off = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let nx = -(b.y - a.y), ny = b.x - a.x; const L = Math.hypot(nx, ny) || 1; nx /= L; ny /= L;
    // keep the shadow on the lower-right side (light from top-left)
    if (nx * 0.6 + ny * 0.8 < 0) { nx = -nx; ny = -ny; }
    off.push({ x: pts[i].x + nx * w * 0.27 * shadeSide, y: pts[i].y + ny * w * 0.27 * shadeSide });
  }
  g.beginPath(); g.moveTo(off[0].x, off[0].y); for (let i = 1; i < off.length; i++) g.lineTo(off[i].x, off[i].y);
  g.lineCap = 'butt'; g.strokeStyle = shadeCol; g.lineWidth = w * 0.42; g.stroke();
  g.lineCap = 'round';
}

export function ellipse(g, x, y, rx, ry, rot = 0) { g.moveTo(x + rx * Math.cos(rot), y + rx * Math.sin(rot)); g.ellipse(x, y, Math.abs(rx), Math.abs(ry), rot, 0, Math.PI * 2); }
export function rrect(g, x, y, w, h, r) { g.roundRect(x, y, w, h, r); }

export function stroke(g, lw = LW, col = INK) { g.lineJoin = 'round'; g.lineCap = 'round'; g.lineWidth = lw; g.strokeStyle = col; g.stroke(); }
export function fill(g, col) { g.fillStyle = col; g.fill(); }
