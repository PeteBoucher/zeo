importScripts('/archae/assets/three.js');
const {exports: THREE} = self.module;
importScripts('/archae/assets/murmurhash.js');
const {exports: murmur} = self.module;
importScripts('/archae/assets/indev.js');
const {exports: indev} = self.module;
self.module = {};

const trra = require('trra');
const {
  CHUNK_BUFFER_SIZE,
} = trra;
const {
  NUM_CELLS,

  NUM_CHUNKS_HEIGHT,

  NUM_RENDER_GROUPS,

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
function mod(value, divisor) {
  var n = value % divisor;
  return n < 0 ? (divisor + n) : n;
}
const _getChunkIndex = (x, z) => (mod(x, 0xFFFF) << 16) | mod(z, 0xFFFF);
const _getOriginHeight = () => 64;

const zeroFloat32Array = new Float32Array(0);

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

const mapChunkMeshes = {};

let queues = {};
let numRemovedQueues = 0;
const _cleanupQueues = () => {
  if (++numRemovedQueues >= 16) {
    const newQueues = {};
    for (const id in queues) {
      const entry = queues[id];
      if (entry !== null) {
        newQueues[id] = entry;
      }
    }
    queues = newQueues;
    numRemovedQueues = 0;
  }
};
const _requestChunk = (x, y, index, numPositions, numIndices) => fetch(`/archae/heightfield/chunks?x=${x}&z=${y}`, {
  credentials: 'include',
})
  .then(_resArrayBuffer)
  .then(buffer => {
    const chunkBuffer = new Uint32Array(buffer, 0, CHUNK_BUFFER_SIZE / 4);
    const decorationsBuffer = new Uint8Array(buffer, CHUNK_BUFFER_SIZE);

    const chunkData = protocolUtils.parseData(chunkBuffer.buffer, chunkBuffer.byteOffset);
    chunkData.decorations = protocolUtils.parseDecorations(decorationsBuffer.buffer, decorationsBuffer.byteOffset);
    _offsetChunkData(chunkData, index, numPositions);

    const chunk = tra.addChunk(x, y, new Uint32Array(chunkBuffer, 0));
    chunk.chunkData = chunkData;

    _registerChunk(chunk, index, numIndices);

    return chunk;
  });
const _offsetChunkData = (chunkData, index, numPositions) => {
  const {indices} = chunkData;
  const positionOffset = index * (numPositions / 3);
  for (let i = 0; i < indices.length; i++) {
    indices[i] += positionOffset;
  }
};
const _registerChunk = (chunk, index, numIndices) => {
  const {x, z} = chunk;

  const trackedMapChunkMeshes = {
    array: Array(NUM_CHUNKS_HEIGHT),
    groups: new Int32Array(NUM_RENDER_GROUPS * 6),
  };
  for (let i = 0; i < NUM_CHUNKS_HEIGHT; i++) {
    const {indexRange, boundingSphere, peeks} = chunk.chunkData.geometries[i];
    const indexOffset = index * numIndices;

    trackedMapChunkMeshes.array[i] = {
      offset: new THREE.Vector3(x, i, z),
      indexRange: {
        landStart: indexRange.landStart + indexOffset,
        landCount: indexRange.landCount,
        waterStart: indexRange.waterStart + indexOffset,
        waterCount: indexRange.waterCount,
        lavaStart: indexRange.lavaStart + indexOffset,
        lavaCount: indexRange.lavaCount,
      },
      boundingSphere: new THREE.Sphere(
        new THREE.Vector3().fromArray(boundingSphere, 0),
        boundingSphere[3]
      ),
      peeks,
      visibleIndex: -1,
    };
  }
  mapChunkMeshes[_getChunkIndex(x, z)] = trackedMapChunkMeshes;
};
/* const _requestLightmaps = (lightmapBuffer, cb) => {
  const id = _makeId();
  postMessage({
    type: 'request',
    method: 'renderLightmap',
    args: [id],
    lightmapBuffer,
  }, [lightmapBuffer.buffer]);
  queues[id] = cb;
}; */
const _unrequestChunk = (x, z) => {
  const chunk = tra.removeChunk(x, z);

  mapChunkMeshes[_getChunkIndex(x, z)] = null;
};

/* const _getFaceName = i => {
  for (const k in PEEK_FACES) {
    if (PEEK_FACES[k] === i) {
      return k;
    }
  }
  return null;
};
const PEEK_FACE_NAMES = (() => {
  const result = Array(16);
  let peekIndex = 0;
  const cache = new Uint8Array(8 * 8);
  cache.fill(0xFF);
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 6; j++) {
      if (i !== j) {
        const otherEntry = cache[j << 3 | i];
        const had = otherEntry !== 0xFF;
        if (!had) {
          result[peekIndex] = _getFaceName(i) + ':' + _getFaceName(j);
        }
        cache[i << 3 | j] = had ? otherEntry : peekIndex++;
      }
    }
  }
  return result;
})();
console.log('peeks', ox, oy, oz, Array.from(trackedMapChunkMesh.peeks).map((peek, i) => {
  return peek ? PEEK_FACE_NAMES[i] : undefined;
}).filter(v => v).join(', ')); */

const localMatrix = new THREE.Matrix4();
const localMatrix2 = new THREE.Matrix4();
const localFrustum = new THREE.Frustum();
const cullQueueX = new Int32Array(100000);
const cullQueueY = new Int32Array(100000);
const cullQueueZ = new Int32Array(100000);
const cullQueueFaces = new Uint8Array(100000);
let cullQueueStart = 0;
let cullQueueEnd = 0;
let visibleIndex = 0;
let max = 0;
const _getCull = (hmdPosition, projectionMatrix, matrixWorldInverse) => {
  const ox = Math.floor(hmdPosition[0] / NUM_CELLS);
  const oy = Math.min(Math.max(Math.floor(hmdPosition[1] / NUM_CELLS), 0), NUM_CHUNKS_HEIGHT - 1);
  const oz = Math.floor(hmdPosition[2] / NUM_CELLS);

  const index =_getChunkIndex(ox, oz);
  const trackedMapChunkMeshes = mapChunkMeshes[index];
  if (trackedMapChunkMeshes) {
    localFrustum.setFromMatrix(localMatrix.fromArray(projectionMatrix).multiply(localMatrix2.fromArray(matrixWorldInverse)));

    const trackedMapChunkMesh = trackedMapChunkMeshes.array[oy];
    cullQueueX[cullQueueEnd] = ox;
    cullQueueY[cullQueueEnd] = oy;
    cullQueueZ[cullQueueEnd] = oz;
    cullQueueFaces[cullQueueEnd] = PEEK_FACES.NULL;
    cullQueueEnd = (cullQueueEnd + 1) % 100000;
    for (;cullQueueStart !== cullQueueEnd; cullQueueStart = (cullQueueStart + 1) % 100000) {
      const x = cullQueueX[cullQueueStart];
      const y = cullQueueY[cullQueueStart];
      const z = cullQueueZ[cullQueueStart];
      const enterFace = cullQueueFaces[cullQueueStart];

      const trackedMapChunkMesh = mapChunkMeshes[_getChunkIndex(x, z)].array[y];
      trackedMapChunkMesh.visibleIndex = visibleIndex;

      for (let j = 0; j < peekFaceSpecs.length; j++) {
        const peekFaceSpec = peekFaceSpecs[j];
        const ay = y + peekFaceSpec.y;
        if (ay >= 0 && ay < NUM_CHUNKS_HEIGHT) {
          const ax = x + peekFaceSpec.x;
          const az = z + peekFaceSpec.z;
          if (
            (ax - ox) * peekFaceSpec.x > 0 ||
            (ay - oy) * peekFaceSpec.y > 0 ||
            (az - oz) * peekFaceSpec.z > 0
          ) {
            if (enterFace === PEEK_FACES.NULL || trackedMapChunkMesh.peeks[PEEK_FACE_INDICES[enterFace << 3 | peekFaceSpec.exitFace]] === 1) {
              const trackedMapChunkMeshes = mapChunkMeshes[_getChunkIndex(ax, az)];
              if (trackedMapChunkMeshes) {
                const trackedMapChunkMesh = trackedMapChunkMeshes.array[ay];

                if (localFrustum.intersectsSphere(trackedMapChunkMesh.boundingSphere)) {
                  cullQueueX[cullQueueEnd] = ax;
                  cullQueueY[cullQueueEnd] = ay;
                  cullQueueZ[cullQueueEnd] = az;
                  cullQueueFaces[cullQueueEnd] = peekFaceSpec.enterFace;
                  cullQueueEnd = (cullQueueEnd + 1) % 100000;
                }
              }
            }
          }
        }
      }
    }
  }

  for (const index in mapChunkMeshes) {
    const trackedMapChunkMeshes = mapChunkMeshes[index];
    if (trackedMapChunkMeshes) {
      trackedMapChunkMeshes.groups.fill(-1);
      let landGroupIndex = 0;
      let landStart = -1;
      let landCount = 0;
      let waterGroupIndex = 0;
      let waterStart = -1;
      let waterCount = 0;
      let lavaGroupIndex = 0;
      let lavaStart = -1;
      let lavaCount = 0;

      for (let i = 0; i < NUM_CHUNKS_HEIGHT; i++) { // XXX optimize this direction
        const trackedMapChunkMesh = trackedMapChunkMeshes.array[i];
        if (trackedMapChunkMesh.visibleIndex === visibleIndex) {
          if (landStart === -1 && trackedMapChunkMesh.indexRange.landCount > 0) {
            landStart = trackedMapChunkMesh.indexRange.landStart;
          }
          landCount += trackedMapChunkMesh.indexRange.landCount;

          if (waterStart === -1 && trackedMapChunkMesh.indexRange.waterCount > 0) {
            waterStart = trackedMapChunkMesh.indexRange.waterStart;
          }
          waterCount += trackedMapChunkMesh.indexRange.waterCount;

          if (lavaStart === -1 && trackedMapChunkMesh.indexRange.lavaCount > 0) {
            lavaStart = trackedMapChunkMesh.indexRange.lavaStart;
          }
          lavaCount += trackedMapChunkMesh.indexRange.lavaCount;
        } else {
          if (landStart !== -1) {
            const baseIndex = landGroupIndex * 6;
            trackedMapChunkMeshes.groups[baseIndex + 0] = landStart;
            trackedMapChunkMeshes.groups[baseIndex + 1] = landCount;
            landGroupIndex++;
            landStart = -1;
            landCount = 0;
          }
          if (waterStart !== -1) {
            const baseIndex = waterGroupIndex * 6;
            trackedMapChunkMeshes.groups[baseIndex + 2] = waterStart;
            trackedMapChunkMeshes.groups[baseIndex + 3] = waterCount;
            waterGroupIndex++;
            waterStart = -1;
            waterCount = 0;
          }
          if (lavaStart !== -1) {
            const baseIndex = lavaGroupIndex * 6;
            trackedMapChunkMeshes.groups[baseIndex + 4] = lavaStart;
            trackedMapChunkMeshes.groups[baseIndex + 5] = lavaCount;
            lavaGroupIndex++;
            lavaStart = -1;
            lavaCount = 0;
          }
        }
      }
      if (landStart !== -1) {
        const baseIndex = landGroupIndex * 6;
        trackedMapChunkMeshes.groups[baseIndex + 0] = landStart;
        trackedMapChunkMeshes.groups[baseIndex + 1] = landCount;
      }
      if (waterStart !== -1) {
        const baseIndex = waterGroupIndex * 6;
        trackedMapChunkMeshes.groups[baseIndex + 2] = waterStart;
        trackedMapChunkMeshes.groups[baseIndex + 3] = waterCount;
      }
      if (lavaStart !== -1) {
        const baseIndex = lavaGroupIndex * 6;
        trackedMapChunkMeshes.groups[baseIndex + 4] = lavaStart;
        trackedMapChunkMeshes.groups[baseIndex + 5] = lavaCount;
      }
    }
  }

  visibleIndex = (visibleIndex + 1) % 0xFFFFFFFF;

  return mapChunkMeshes;
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
      const {x, y, index, numPositions, numIndices/*, heightfieldBuffer*/} = args;
      let {buffer} = args;

      _requestChunk(x, y, index, numPositions, numIndices)
        .then(chunk => {
          protocolUtils.stringifyRenderChunk(chunk.chunkData, chunk.chunkData.decorations, buffer, 0);

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

      _unrequestChunk(x, y);

      break;
    }
    case 'heightfield': {
      const {id, args} = data;
      const {x, y, buffer} = args;

      const chunk = tra.getChunk(x, y);

      const heightfield = new Float32Array(buffer, 0, newHeightfield.length);
      if (chunk) {
        heightfield.set(chunk.chunkData.heightfield);
      } else {
        heightfield.fill(0);
      }

      postMessage({
        type: 'response',
        args: [id],
        result: heightfield,
      }, [heightfield.buffer]);
      break;
    }
    case 'lightmaps': {
      throw new Error('not implemented');

      /* const {id, args} = data;
      const {lightmapBuffer} = args;

      let readByteOffset = 0;
      const numLightmaps = new Uint32Array(lightmapBuffer.buffer, lightmapBuffer.byteOffset + readByteOffset, 1)[0];
      readByteOffset += 4;

      const lightmapsCoordsArray = new Int32Array(lightmapBuffer.buffer, lightmapBuffer.byteOffset + readByteOffset, numLightmaps * 2);
      readByteOffset += 4 * numLightmaps * 2;

      const requestMapChunkMeshes = Array(numLightmaps);
      for (let i = 0; i < numLightmaps; i++) {
        const baseIndex = i * 2;
        const x = lightmapsCoordsArray[baseIndex + 0];
        const z = lightmapsCoordsArray[baseIndex + 1];
        requestMapChunkMeshes[i] = tra.getChunk(x, z) || {
          x,
          z,
          chunkData: {
            positions: zeroFloat32Array,
          },
        };
      }

      let writeByteOffset = 4;
      for (let i = 0; i < numLightmaps; i++) {
        const chunk = requestMapChunkMeshes[i]

        const lightmapHeaderArray = new Int32Array(lightmapBuffer.buffer, lightmapBuffer.byteOffset + writeByteOffset, 2);
        lightmapHeaderArray[0] = chunk.x;
        lightmapHeaderArray[1] = chunk.z;
        writeByteOffset += 4 * 2;

        const positions = chunk.chunkData.positions;
        const numPositions = positions.length;
        new Uint32Array(lightmapBuffer.buffer, lightmapBuffer.byteOffset + writeByteOffset, 1)[0] = numPositions;
        writeByteOffset += 4;

        new Float32Array(lightmapBuffer.buffer, lightmapBuffer.byteOffset + writeByteOffset, numPositions).set(positions);
        writeByteOffset += 4 * numPositions;
      }

      _requestLightmaps(lightmapBuffer, lightmapBuffer => {
        postMessage({
          type: 'response',
          args: [id],
          result: lightmapBuffer,
        }, [lightmapBuffer.buffer]);
      }); */

      break;
    }
    case 'cull': {
      const {id, args} = data;
      const {hmdPosition, projectionMatrix, matrixWorldInverse, buffer} = args;

      const mapChunkMeshes = _getCull(hmdPosition, projectionMatrix, matrixWorldInverse);
      protocolUtils.stringifyCull(mapChunkMeshes, buffer, 0);
      postMessage({
        type: 'response',
        args: [id],
        result: buffer,
      }, [buffer]);
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
      const {position: [x, y, z], gslots} = args;
      let {buffer} = args;

      fetch(`/archae/heightfield/voxels?x=${x}&y=${y}&z=${z}`, {
        method: 'DELETE',
        credentials: 'include',
      })
        .then(_resArrayBuffer)
        .then(responseBuffer => {
          let readByteOffset = 0;
          const numChunks = new Uint32Array(responseBuffer, readByteOffset, 1)[0];
          readByteOffset += 4;

          if (numChunks > 0) {
            const chunkSpecs = [];
            for (let i = 0; i < numChunks; i++) {
              const chunkHeader = new Int32Array(responseBuffer, readByteOffset, 2);
              const x = chunkHeader[0];
              const z = chunkHeader[1];
              readByteOffset += 4 * 2;

              const chunkLength = new Uint32Array(responseBuffer, readByteOffset, 1)[0];
              readByteOffset += 4;
              const chunkBuffer = new Uint8Array(responseBuffer, readByteOffset, chunkLength);
              readByteOffset += chunkLength;

              const decorationsLength = new Uint32Array(responseBuffer, readByteOffset, 1)[0];
              readByteOffset += 4;
              const decorationsBuffer = new Uint8Array(responseBuffer, readByteOffset, decorationsLength);
              readByteOffset += decorationsLength;

              const chunk = tra.getChunk(x, z);
              const index = _getChunkIndex(x, z);
              const gslot = gslots[index];
              if (chunk && gslot) {
                const {index, numPositions, numIndices} = gslot;

                const chunkData = protocolUtils.parseData(chunkBuffer.buffer, chunkBuffer.byteOffset);
                chunkData.decorations = protocolUtils.parseDecorations(decorationsBuffer.buffer, decorationsBuffer.byteOffset);
                _offsetChunkData(chunkData, index, numPositions);
                chunk.chunkData = chunkData;

                const uint32Array = chunk.getBuffer();
                new Uint8Array(uint32Array.buffer, uint32Array.byteOffset).set(chunkBuffer);

                _registerChunk(chunk, index, numIndices);

                chunkSpecs.push({
                  x,
                  z,
                  chunkData,
                });
              }
            }
            const numChunkSpecs = chunkSpecs.length;

            let writeByteOffset = 0;
            const chunksHeader = new Uint32Array(buffer, writeByteOffset, 1);
            writeByteOffset += 4;

            let numResponseChunks = 0;
            for (let i = 0; i < numChunkSpecs; i++) {
              const chunkSpec = chunkSpecs[i];
              const {x, z} = chunkSpec;
              const chunk = tra.getChunk(x, z);
              if (chunk) {
                const chunkHeader1 = new Int32Array(buffer, writeByteOffset, 2);
                chunkHeader1[0] = x;
                chunkHeader1[1] = z;
                writeByteOffset += 4 * 2;

                const chunkHeader2 = new Uint32Array(buffer, writeByteOffset, 1);
                writeByteOffset += 4;

                const newWriteByteOffset = protocolUtils.stringifyRenderChunk(chunk.chunkData, chunk.chunkData.decorations, buffer, writeByteOffset)[1];
                const numChunkBytes = newWriteByteOffset - writeByteOffset;
                writeByteOffset = newWriteByteOffset;

                chunkHeader2[0] = numChunkBytes;

                numResponseChunks++;
              }
            }
            chunksHeader[0] = numResponseChunks;

            postMessage({
              type: 'response',
              args: [id],
              result: buffer,
            }, [buffer]);
          } else {
            let writeByteOffset = 0;
            new Uint32Array(buffer, writeByteOffset, 1)[0] = 0;
            writeByteOffset += 4;

            postMessage({
              type: 'response',
              args: [id],
              result: buffer,
            }, [buffer]);
          }
        })
        .catch(err => {
          console.warn(err);
        });
      break;
    }
    case 'response': {
      const {id, result} = data;

      queues[id](result);
      queues[id] = null;

      _cleanupQueues();
      break;
    }
    default: {
      console.warn('invalid heightfield worker method:', JSON.stringify(method));
      break;
    }
  }
};
let _id = 0;
const _makeId = () => {
  const result = _id;
  _id = (_id + 1) | 0;
  return result;
};
