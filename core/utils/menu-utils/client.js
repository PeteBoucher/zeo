const menuUtils = () => ({
  mount() {
    let targetPlaneImg = null;
    const _makeTargetPlaneImg = () => {
      const width = 256;
      const height = width;
      const lineWidth = 2;
      const lineOffset = lineWidth / 2;

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      ctx.lineWidth = lineWidth;

      // top left
      ctx.beginPath();
      ctx.moveTo(lineOffset, lineOffset + (height * 0.1));
      ctx.lineTo(lineOffset, lineOffset + (height * 0.05));
      ctx.lineTo(lineOffset + (width * 0.05), lineOffset);
      ctx.lineTo(lineOffset + (width * 0.1), lineOffset);
      ctx.stroke();

      // top right
      ctx.beginPath();
      ctx.moveTo(width - lineOffset - (width * 0.1), lineOffset);
      ctx.lineTo(width - lineOffset - (width * 0.05), lineOffset);
      ctx.lineTo(width - lineOffset, lineOffset + (height * 0.05));
      ctx.lineTo(width - lineOffset, lineOffset + (height * 0.1));
      ctx.stroke();

      // bottom right
      ctx.beginPath();
      ctx.moveTo(width - lineOffset, height - lineOffset - (height * 0.1));
      ctx.lineTo(width - lineOffset, height - lineOffset - (height * 0.05));
      ctx.lineTo(width - lineOffset - (width * 0.05), height - lineOffset);
      ctx.lineTo(width - lineOffset - (width * 0.1), height - lineOffset);
      ctx.stroke();

      // bottom left
      ctx.beginPath();
      ctx.moveTo(lineOffset + (width * 0.1), height - lineOffset);
      ctx.lineTo(lineOffset + (width * 0.05), height - lineOffset);
      ctx.lineTo(lineOffset, height - lineOffset - (height * 0.05));
      ctx.lineTo(lineOffset, height - lineOffset - (height * 0.1));
      ctx.stroke();

      return canvas;
    };
    const _getTargetPlaneImg = () => {
      if (!targetPlaneImg) {
        targetPlaneImg = _makeTargetPlaneImg();
      }
      return targetPlaneImg;
    };

    const _makeColorWheelImg = () => {
      const size = 256;
      const width = size;
      const height = size;
      const halfWidth = width / 2;
      const halfHeight = height / 2;

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      canvas.ctx = ctx;

      // grab the current ImageData (or use createImageData)
      const bitmap = ctx.getImageData(0, 0, width, height);

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          // offset for the 4 RGBA values in the data array
          const offset = 4 * ((y * width) + x);

          const hue = 180 + Math.atan2(y - halfHeight, x - halfWidth) * (180 / Math.PI);
          const saturation = Math.min(Math.sqrt(Math.pow(y - halfHeight, 2) + Math.pow(x - halfWidth, 2)) / halfWidth, 1);
          const value = 1;
          const hsv = _hsv2rgb(hue, saturation, value);

          // fill RGBA values
          bitmap.data[offset + 0] = hsv[0];
          bitmap.data[offset + 1] = hsv[1];
          bitmap.data[offset + 2] = hsv[2];
          bitmap.data[offset + 3] = 255; // no transparency
        }
      }

      // update the canvas
      ctx.putImageData(bitmap, 0, 0);

      canvas.getColor = (x, y) => {
        const xPx = Math.floor(x * width);
        const yPx = Math.floor(y * height);
        const imageData = ctx.getImageData(xPx, yPx, 1, 1);
        const {data: imageDataData} = imageData;
        const [r, g, b] = imageDataData;

        return (r << (8 * 2)) | (g << (8 * 1)) | (b << (8 * 0));
      };

      return canvas;
    };
    let colorWheelImg = null;
    const _getColorWheelImg = () => {
      if (!colorWheelImg) {
        colorWheelImg = _makeColorWheelImg();
      }
      return colorWheelImg;
    };

    const _makeColorBarImg = () => {
      const size = 256;
      const width = 1;
      const height = size;

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      const imageData = ctx.getImageData(0, 0, width, height);
      const {data: imageDataData} = imageData;
      for (let i = 0; i < height; i++) {
        const baseIndex = i * 4;
        const valueFactor = (height - i) / height;
        const value = Math.round(valueFactor * 255);
        imageDataData[baseIndex + 0] = value;
        imageDataData[baseIndex + 1] = value;
        imageDataData[baseIndex + 2] = value;
        imageDataData[baseIndex + 3] = 255;
      }
      ctx.putImageData(imageData, 0, 0);

      canvas.getColor = y => {
        const v = y * 255;
        return (v << (8 * 2)) | (v << (8 * 1)) | (v << (8 * 0));
      };

      return canvas;
    };
    let colorBarImg = null;
    const _getColorBarImg = () => {
      if (!colorBarImg) {
        colorBarImg = _makeColorBarImg();
      }
      return colorBarImg;
    };

    return {
      getTargetPlaneImg: _getTargetPlaneImg,
      getColorWheelImg: _getColorWheelImg,
      getColorBarImg: _getColorBarImg,
    };
  },
});
const _hsv2rgb = (h, s, v) => {
  var c = v * s;
  var h1 = h / 60;
  var x = c * (1 - Math.abs((h1 % 2) - 1));
  var m = v - c;
  var rgb;

  if (typeof h == 'undefined') rgb = [0, 0, 0];
  else if (h1 < 1) rgb = [c, x, 0];
  else if (h1 < 2) rgb = [x, c, 0];
  else if (h1 < 3) rgb = [0, c, x];
  else if (h1 < 4) rgb = [0, x, c];
  else if (h1 < 5) rgb = [x, 0, c];
  else if (h1 <= 6) rgb = [c, 0, x];

  var r = 255 * (rgb[0] + m);
  var g = 255 * (rgb[1] + m);
  var b = 255 * (rgb[2] + m);

  return [r, g, b];
};

module.exports = menuUtils;
