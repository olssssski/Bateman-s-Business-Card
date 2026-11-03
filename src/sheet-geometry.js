export function createSheetGeometry() {
  const verts = [];
  function quad(a, b, c, d, n, face) {
    let points = [a, b, c, a, c, d],
      uvs = [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 0],
        [1, 1],
        [0, 1],
      ];
    points.forEach((p, i) => verts.push(...p, ...n, ...uvs[i], face));
  }
  const x = 3.5,
    y = 2.2,
    z = 0.012;
  const GX = 48,
    GY = 30;
  for (let j = 0; j < GY; j++)
    for (let i = 0; i < GX; i++) {
      let a = -x + (2 * x * i) / GX,
        b = -x + (2 * x * (i + 1)) / GX,
        c = -y + (2 * y * j) / GY,
        d = -y + (2 * y * (j + 1)) / GY;
      quad([a, c, z], [b, c, z], [b, d, z], [a, d, z], [0, 0, 1], 0);
      quad([b, c, -z], [a, c, -z], [a, d, -z], [b, d, -z], [0, 0, -1], 1);
    }
  // Face UVs refer to the whole sheet, not to individual grid cells.
  for (let i = 0; i < verts.length; i += 9) {
    verts[i + 6] =
      verts[i + 8] === 0
        ? (verts[i] + x) / (2 * x)
        : 1 - (verts[i] + x) / (2 * x);
    verts[i + 7] = (verts[i + 1] + y) / (2 * y);
  }
  for (let i = 0; i < GX; i++) {
    let a = -x + (2 * x * i) / GX,
      b = -x + (2 * x * (i + 1)) / GX;
    quad([a, -y, -z], [b, -y, -z], [b, -y, z], [a, -y, z], [0, -1, 0], 2);
    quad([a, y, z], [b, y, z], [b, y, -z], [a, y, -z], [0, 1, 0], 2);
  }
  for (let j = 0; j < GY; j++) {
    let a = -y + (2 * y * j) / GY,
      b = -y + (2 * y * (j + 1)) / GY;
    quad([x, a, z], [x, a, -z], [x, b, -z], [x, b, z], [1, 0, 0], 2);
    quad([-x, a, -z], [-x, a, z], [-x, b, z], [-x, b, -z], [-1, 0, 0], 2);
  }
  const restVerts = new Float32Array(verts),
    liveVerts = new Float32Array(verts);

  return { restVerts, liveVerts };
}
