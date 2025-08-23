import { API_BASE } from "../constants";

export function getBleedInPixels(bleedEdgeWidth: number, unit: string): number {
  if (unit === "mm") {
    return (bleedEdgeWidth / 25.4) * 300;
  } else {
    return bleedEdgeWidth * 300;
  }
}

export function getLocalBleedImageUrl(originalUrl: string): string {
  return `${API_BASE}/api/cards/images/proxy?url=${encodeURIComponent(originalUrl)}`;
}

export async function urlToDataUrl(url: string): Promise<string> {
  const resp = await fetch(url);
  const blob = await resp.blob();
  return await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

export function pngToNormal(pngUrl: string) {
  try {
    const u = new URL(pngUrl);
    u.pathname = u.pathname
      .replace("/png/", "/normal/")
      .replace(/\.png$/i, ".jpg");
    return u.toString();
  } catch {
    return pngUrl; //fallback
  }
}

export function trimBleedEdge(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let bleedTrim = 76;
      const canvas = document.createElement("canvas");
      console.log(img.height);
      if (img.height >= 2220 && img.height < 2960) {
        bleedTrim = 78;
      }
      if (img.height >= 2960 && img.height < 4440) {
        bleedTrim = 104;
      }
      if (img.height >= 4440) {
        bleedTrim = 156;
      }

      const height = img.height - bleedTrim * 2;
      const width = img.width - bleedTrim * 2;

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(
          img,
          bleedTrim,
          bleedTrim,
          width,
          height,
          0,
          0,
          width,
          height
        );
        resolve(canvas.toDataURL("image/png"));
      } else {
        resolve(dataUrl);
      }
    };
    img.src = dataUrl;
  });
}

export function blackenAllNearBlackPixels(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  threshold: number,
  borderThickness = {
    top: 96,
    bottom: 400,
    left: 48,
    right: 48,
  }
) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const inBorder =
        y < borderThickness.top ||
        y >= height - borderThickness.bottom ||
        x < borderThickness.left ||
        x >= width - borderThickness.right;

      if (!inBorder) continue;

      const index = (y * width + x) * 4;
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];

      if (r < threshold && g < threshold && b < threshold) {
        data[index] = 0;
        data[index + 1] = 0;
        data[index + 2] = 0;
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

export async function addBleedEdge(
  src: string,
  bleedOverride?: number,
  opts?: {
    unit?: "mm" | "in";
    bleedEdgeWidth?: number;
  }
) {
  console.log("Adding bleed edge:", bleedOverride, opts);

  return new Promise<string>((resolve) => {
    const targetCardWidth = 744;
    const targetCardHeight = 1040;
    const bleed = Math.round(
      getBleedInPixels(
        bleedOverride ?? opts?.bleedEdgeWidth ?? 0,
        opts?.unit ?? "mm"
      )
    );
    const finalWidth = targetCardWidth + bleed * 2;
    const finalHeight = targetCardHeight + bleed * 2;
    const blackThreshold = 30; // max RGB value to still consider "black"
    const blackToleranceRatio = 0.7; // how much of the edge must be black to switch modes

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    canvas.width = finalWidth;
    canvas.height = finalHeight;

    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      const aspectRatio = img.width / img.height;
      const targetAspect = targetCardWidth / targetCardHeight;

      let drawWidth = targetCardWidth;
      let drawHeight = targetCardHeight;
      let offsetX = 0;
      let offsetY = 0;

      if (aspectRatio > targetAspect) {
        drawHeight = targetCardHeight;
        drawWidth = img.width * (targetCardHeight / img.height);
        offsetX = (drawWidth - targetCardWidth) / 2;
      } else {
        drawWidth = targetCardWidth;
        drawHeight = img.height * (targetCardWidth / img.width);
        offsetY = (drawHeight - targetCardHeight) / 2;
      }

      const temp = document.createElement("canvas");
      temp.width = targetCardWidth;
      temp.height = targetCardHeight;
      const tempCtx = temp.getContext("2d")!;
      tempCtx.drawImage(img, -offsetX, -offsetY, drawWidth, drawHeight);

      const cornerSize = 30;
      const sampleInset = 10;

      const averageColor = (
        x: number,
        y: number,
        w: number,
        h: number
      ): string => {
        const data = tempCtx.getImageData(x, y, w, h).data;
        let r = 0,
          g = 0,
          b = 0,
          count = 0;

        for (let i = 0; i < data.length; i += 4) {
          const alpha = data[i + 3];
          if (alpha === 0) continue;
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
          count++;
        }

        if (count === 0) return "#000";

        r = Math.round(r / count);
        g = Math.round(g / count);
        b = Math.round(b / count);

        return `rgb(${r}, ${g}, ${b})`;
      };

      const fillIfLight = (
        r: number,
        g: number,
        b: number,
        a: number
      ): boolean => a === 0 || (r > 200 && g > 200 && b > 200);

      const cornerCoords = [
        { x: 0, y: 0 },
        { x: temp.width - cornerSize, y: 0 },
        { x: 0, y: temp.height - cornerSize },
        { x: temp.width - cornerSize, y: temp.height - cornerSize },
      ];

      cornerCoords.forEach(({ x, y }) => {
        const imageData = tempCtx.getImageData(
          x,
          y,
          cornerSize,
          cornerSize
        ).data;
        let shouldFill = false;

        for (let i = 0; i < imageData.length; i += 4) {
          const r = imageData[i];
          const g = imageData[i + 1];
          const b = imageData[i + 2];
          const a = imageData[i + 3];
          if (fillIfLight(r, g, b, a)) {
            shouldFill = true;
            break;
          }
        }

        if (shouldFill) {
          const avgColor = averageColor(
            x < temp.width / 2 ? sampleInset : temp.width - sampleInset - 10,
            y < temp.height / 2 ? sampleInset : temp.height - sampleInset - 10,
            10,
            10
          );

          tempCtx.fillStyle = avgColor;
          tempCtx.fillRect(x, y, cornerSize, cornerSize);
        }
      });

      blackenAllNearBlackPixels(
        tempCtx,
        targetCardWidth,
        targetCardHeight,
        blackThreshold
      );

      const edgeData = tempCtx.getImageData(0, 0, 1, targetCardHeight).data;
      let blackCount = 0;

      for (let i = 0; i < targetCardHeight; i++) {
        const r = edgeData[i * 4];
        const g = edgeData[i * 4 + 1];
        const b = edgeData[i * 4 + 2];
        if (r < blackThreshold && g < blackThreshold && b < blackThreshold) {
          blackCount++;
        }
      }

      const isMostlyBlack = blackCount / targetCardHeight > blackToleranceRatio;

      const scaledImg = new Image();
      scaledImg.onload = () => {
        ctx.drawImage(scaledImg, bleed, bleed);

        if (isMostlyBlack) {
          const slice = 8;
          // Edges
          ctx.drawImage(
            scaledImg,
            0,
            0,
            slice,
            targetCardHeight,
            0,
            bleed,
            bleed,
            targetCardHeight
          ); // L
          ctx.drawImage(
            scaledImg,
            targetCardWidth - slice,
            0,
            slice,
            targetCardHeight,
            targetCardWidth + bleed,
            bleed,
            bleed,
            targetCardHeight
          ); // R
          ctx.drawImage(
            scaledImg,
            0,
            0,
            targetCardWidth,
            slice,
            bleed,
            0,
            targetCardWidth,
            bleed
          ); // T
          ctx.drawImage(
            scaledImg,
            0,
            targetCardHeight - slice,
            targetCardWidth,
            slice,
            bleed,
            targetCardHeight + bleed,
            targetCardWidth,
            bleed
          ); // B

          // Corners
          ctx.drawImage(scaledImg, 0, 0, slice, slice, 0, 0, bleed, bleed); // TL
          ctx.drawImage(
            scaledImg,
            targetCardWidth - slice,
            0,
            slice,
            slice,
            targetCardWidth + bleed,
            0,
            bleed,
            bleed
          ); // TR
          ctx.drawImage(
            scaledImg,
            0,
            targetCardHeight - slice,
            slice,
            slice,
            0,
            targetCardHeight + bleed,
            bleed,
            bleed
          ); // BL
          ctx.drawImage(
            scaledImg,
            targetCardWidth - slice,
            targetCardHeight - slice,
            slice,
            slice,
            targetCardWidth + bleed,
            targetCardHeight + bleed,
            bleed,
            bleed
          ); // BR
        } else {
          ctx.save();
          ctx.scale(-1, 1);
          ctx.drawImage(
            scaledImg,
            0,
            0,
            bleed,
            targetCardHeight,
            -bleed,
            bleed,
            bleed,
            targetCardHeight
          );
          ctx.restore();

          ctx.save();
          ctx.scale(-1, 1);
          ctx.drawImage(
            scaledImg,
            targetCardWidth - bleed,
            0,
            bleed,
            targetCardHeight,
            -finalWidth,
            bleed,
            bleed,
            targetCardHeight
          );
          ctx.restore();

          ctx.save();
          ctx.scale(1, -1);
          ctx.drawImage(
            scaledImg,
            0,
            0,
            targetCardWidth,
            bleed,
            bleed,
            -bleed,
            targetCardWidth,
            bleed
          );
          ctx.restore();

          ctx.save();
          ctx.scale(1, -1);
          ctx.drawImage(
            scaledImg,
            0,
            targetCardHeight - bleed,
            targetCardWidth,
            bleed,
            bleed,
            -finalHeight,
            targetCardWidth,
            bleed
          );
          ctx.restore();

          // Corners
          ctx.save();
          ctx.scale(-1, -1);
          ctx.drawImage(
            scaledImg,
            0,
            0,
            bleed,
            bleed,
            -bleed,
            -bleed,
            bleed,
            bleed
          );
          ctx.restore();

          ctx.save();
          ctx.scale(-1, -1);
          ctx.drawImage(
            scaledImg,
            targetCardWidth - bleed,
            0,
            bleed,
            bleed,
            -finalWidth,
            -bleed,
            bleed,
            bleed
          );
          ctx.restore();

          ctx.save();
          ctx.scale(-1, -1);
          ctx.drawImage(
            scaledImg,
            0,
            targetCardHeight - bleed,
            bleed,
            bleed,
            -bleed,
            -finalHeight,
            bleed,
            bleed
          );
          ctx.restore();

          ctx.save();
          ctx.scale(-1, -1);
          ctx.drawImage(
            scaledImg,
            targetCardWidth - bleed,
            targetCardHeight - bleed,
            bleed,
            bleed,
            -finalWidth,
            -finalHeight,
            bleed,
            bleed
          );
          ctx.restore();
        }

        resolve(canvas.toDataURL("image/png"));
      };

      scaledImg.src = temp.toDataURL("image/png");
    };

    img.src = src;
  });
}
