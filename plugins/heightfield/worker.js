importScripts('/archae/assets/three.js');
const {exports: THREE} = self.module;
importScripts('/archae/assets/murmurhash.js');
const {exports: murmur} = self.module;
importScripts('/archae/assets/indev.js');
const {exports: indev} = self.module;
self.module = {};

const generatorLib = require('./generator');
const trra = require('trra');
const {
  NUM_CELLS,

  DEFAULT_SEED,

  PEEK_FACES,
  PEEK_FACE_INDICES,
} = require('./lib/constants/constants');
const protocolUtils = require('./lib/utils/protocol-utils');
const DIRECTIONS = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];

const generator = generatorLib({
  THREE,
  murmur,
  indev,
});
const tra = trra({
  seed: DEFAULT_SEED,
});
const elevationNoise = indev({
  seed: DEFAULT_SEED,
}).uniform({
  frequency: 0.002,
  octaves: 8,
});

const _resArrayBuffer = res => {
  if (res.status >= 200 && res.status < 300) {
    return res.arrayBuffer();
  } else {
    return Promise.reject({
      status: res.status,
      stack: 'API returned invalid status code: ' + res.status,
    });
  }
};
const _resBlob = res => {
  if (res.status >= 200 && res.status < 300) {
    return res.blob();
  } else {
    return Promise.reject({
      status: res.status,
      stack: 'API returned invalid status code: ' + res.status,
    });
  }
};
const _getOriginHeight = () => (1 - 0.3 + Math.pow(elevationNoise.in2D(0 + 1000, 0 + 1000), 0.5)) * 64;

class PeekFace {
  constructor(exitFace, enterFace, x, y, z) {
    this.exitFace = exitFace;
    this.enterFace = enterFace;
    this.x = x;
    this.y = y;
    this.z = z;
  }
}
const peekFaceSpecs = [
  new PeekFace(PEEK_FACES.BACK, PEEK_FACES.FRONT, 0, 0, -1),
  new PeekFace(PEEK_FACES.FRONT, PEEK_FACES.BACK, 0, 0, 1),
  new PeekFace(PEEK_FACES.LEFT, PEEK_FACES.RIGHT, -1, 0, 0),
  new PeekFace(PEEK_FACES.RIGHT, PEEK_FACES.LEFT, 1, 0, 0),
  new PeekFace(PEEK_FACES.TOP, PEEK_FACES.BOTTOM, 0, 1, 0),
  new PeekFace(PEEK_FACES.BOTTOM, PEEK_FACES.TOP, 0, -1, 0),
];

const _requestChunk = (x, z) => {
  const chunk = tra.getChunk(x, z);

  if (chunk) {
    return Promise.resolve(chunk);
  } else {
    return fetch(`/archae/heightfield/chunks?x=${x}&z=${z}`, {
      credentials: 'include',
    })
      .then(_resArrayBuffer)
      .then(buffer => tra.addChunk(x, z, new Uint32Array(buffer)));
  }
};

self.onmessage = e => {
  const {data} = e;
  const {method} = data;

  switch (method) {
    case 'getOriginHeight': {
      const {id} = data;

      postMessage({
        type: 'response',
        args: [id],
        result: _getOriginHeight(),
      });
      break;
    }
    case 'generate': {
      const {id, args} = data;
      const {x, y, buffer} = args;

      _requestChunk(x, y)
        .then(chunk => {
          const uint32Buffer = chunk.getBuffer();
          protocolUtils.stringifyRenderChunk(
            protocolUtils.parseDataChunk(uint32Buffer.buffer, uint32Buffer.byteOffset),
            buffer,
            0
          );

          postMessage({
            type: 'response',
            args: [id],
            result: buffer,
          }, [buffer]);
        })
        .catch(err => {
          console.warn(err);
        });
      break;
    }
    case 'ungenerate': {
      const {args} = data;
      const {x, y} = args;
      tra.removeChunk(x, y);
      break;
    }
    case 'addVoxel': {
      throw new Error('not implemented');
      /* const {id, args} = data;
      const {position} = args;
      const [x, y, z] = position;
      // XXX regenerate locally and return immediately
      // XXX need to inform other clients of these
      fetch(`/archae/heightfield/voxels?x=${x}&y=${y}&z=${z}`, {
        method: 'POST',
        credentials: 'include',
      })
        .then(_resBlob)
        .then(() => {
          const ox = Math.floor(x / NUM_CELLS);
          const oz = Math.floor(z / NUM_CELLS);
          tra.removeChunk(ox, oz); // XXX not needed once we regenerate locally

          postMessage({
            type: 'response',
            args: [id],
            result: null,
          });
        })
        .catch(err => {
          console.warn(err);
        }); */
      break;
    }
    case 'subVoxel': {
      const {id, args} = data;
      const {position} = args;
      const [x, y, z] = position;

      fetch(`/archae/heightfield/voxels?x=${x}&y=${y}&z=${z}`, {
          method: 'DELETE',
          credentials: 'include',
        })
          .then(_resBlob)
          .then(() => {
            // _respond();
          })
          .catch(err => {
            console.warn(err);
          });

      const regenerated = [];
      for (let i = 0; i < DIRECTIONS.length; i++) {
        const [dx, dz] = DIRECTIONS[i];
        const ax = x + dx * 2;
        const az = z + dz * 2;
        const ox = Math.floor(ax / NUM_CELLS);
        const oz = Math.floor(az / NUM_CELLS);

        if (!regenerated.some(entry => entry[0] === ox && entry[1] === oz)) {
          const chunk = tra.getChunk(ox, oz);
          if (chunk) {
            const uint32Buffer = chunk.getBuffer();
            const chunkData = protocolUtils.parseDataChunk(uint32Buffer.buffer, uint32Buffer.byteOffset);
            const oldElevations = chunkData.elevations.slice();
            const oldEther = chunkData.ether.slice();
            const newEther = Float32Array.from([x - (ox * NUM_CELLS), y, z - (oz * NUM_CELLS), 1]);
            chunk.generate(generator, {
              oldElevations,
              oldEther,
              newEther,
            });
          }
          regenerated.push([ox, oz]);
        }
      }
      postMessage({
        type: 'response',
        args: [id],
        result: regenerated,
      });
      break;
    }
    default: {
      console.warn('invalid heightfield worker method:', JSON.stringify(method));
      break;
    }
  }
};
