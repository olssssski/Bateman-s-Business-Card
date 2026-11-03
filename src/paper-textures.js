export function createPaperTextures() {
  let print = document.createElement("canvas");
  print.width = print.height = 2048;
  let ctx = print.getContext("2d");
  ctx.scale(1, 2048 / 1285);
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, 2048, 1285);
  ctx.fillStyle = "white";
  ctx.textBaseline = "alphabetic";
  function text(t, x, y, size, align = "left", spacing = 0, book = false) {
    ctx.font =
      (book ? "400 " : "600 ") +
      size +
      "px " +
      (book ? "CardBook" : "CardCopperplate");
    ctx.textAlign = align;
    if (!spacing) {
      ctx.fillText(t, x, y);
      return;
    }
    let width = ctx.measureText(t).width + spacing * (t.length - 1);
    let pos =
      align === "center" ? x - width / 2 : align === "right" ? x - width : x;
    ctx.textAlign = "left";
    for (let char of t) {
      ctx.fillText(char, pos, y);
      pos += ctx.measureText(char).width + spacing;
    }
  }
  text("212.555.6342", 180, 205, 64);
  text("PIERCE & PIERCE", 1865, 190, 72, "right", 0.5);
  text("MERGERS AND ACQUISITIONS", 1865, 255, 36, "right", 0.1);
  text("PAUL ALLEN", 1024, 610, 86, "center", 1.5);
  text("Vice President", 1024, 704, 66, "center", 0, true);
  text(
    "358 EXCHANGE PLACE NEW YORK N.Y. 10006",
    1024,
    1045,
    48,
    "center",
    0.25,
  );
  text("FAX 212.555.6390 TELEX 10 4534", 1024, 1135, 51, "center", 0.5);
  // Independent ink and softened relief masks: R is coverage, G is bevel height.
  let reliefCanvas = document.createElement("canvas");
  reliefCanvas.width = reliefCanvas.height = 2048;
  let rc = reliefCanvas.getContext("2d");
  rc.filter = "blur(2.4px)";
  rc.drawImage(print, 0, 0);
  let inkPixels = ctx.getImageData(0, 0, 2048, 2048),
    reliefPixels = rc.getImageData(0, 0, 2048, 2048);
  for (let i = 0; i < inkPixels.data.length; i += 4)
    inkPixels.data[i + 1] = Math.min(255, reliefPixels.data[i] * 1.55);
  // putImageData ignores the canvas transform.
  ctx.putImageData(inkPixels, 0, 0);
  // One fiber network supplies visible height, density, and preferred transport direction.
  let paper = document.createElement("canvas");
  paper.width = paper.height = 1024;
  let pc = paper.getContext("2d"),
    seed = 42;
  function rand() {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    return (seed >>> 0) / 4294967296;
  }
  pc.fillStyle = "#656565";
  pc.fillRect(0, 0, 1024, 1024);
  pc.lineCap = "round";
  for (let i = 0; i < 78000; i++) {
    let px = rand() * 1024,
      py = rand() * 1024,
      angle = rand() * Math.PI * 2,
      len = 2 + rand() * 13;
    // Layered fibers overlap, leaving pores between the strands.
    pc.lineWidth = 0.45 + rand() * 1.2;
    pc.strokeStyle =
      rand() > 0.3 ? "rgba(224,224,224,.12)" : "rgba(27,27,27,.18)";
    pc.beginPath();
    pc.moveTo(px, py);
    pc.quadraticCurveTo(
      px + Math.cos(angle + 0.35) * len * 0.5,
      py + Math.sin(angle + 0.35) * len * 0.5,
      px + Math.cos(angle) * len,
      py + Math.sin(angle) * len,
    );
    pc.stroke();
  }
  let fiberPixels = pc.getImageData(0, 0, 1024, 1024).data;

  return { print, paper, inkPixels, fiberPixels };
}
