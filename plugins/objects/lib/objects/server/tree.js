const path = require('path');

const {
  NUM_CELLS,
  NUM_CELLS_OVERSCAN,
} = require('../../constants/constants');
const NUM_POSITIONS = 30 * 1024;
const CAMERA_ROTATION_ORDER = 'YXZ';

const {three: {THREE}, utils: {image: {jimp}}} = zeo;

const tree = objectApi => {
  return () => Promise.all([
    jimp.read(path.join(__dirname, '../../img/tree.png'))
      .then(img => objectApi.registerTexture('tree', img)),
    jimp.read(path.join(__dirname, '../../img/leaf.png'))
      .then(img => objectApi.registerTexture('leaf', img)),
  ])
    .then(() => {
      const treeGeometry = (() => {
        const treeUvs = objectApi.getUv('tree');
        const treeUvWidth = treeUvs[2] - treeUvs[0];
        const treeUvHeight = treeUvs[3] - treeUvs[1];
        const leafUvs = objectApi.getUv('leaf');
        const leafUvWidth = leafUvs[2] - leafUvs[0];
        const leafUvHeight = leafUvs[3] - leafUvs[1];

        const _copyIndices = (src, dst, startIndexIndex, startAttributeIndex) => {
          for (let i = 0; i < src.length; i++) {
            dst[startIndexIndex + i] = src[i] + startAttributeIndex;
          }
        };

        const _makeTrunkGeometry = () => {
          const radiusBottom = 0.3 + objectApi.getRandom() * 0.3;
          const radiusTop = radiusBottom * (0.2 + (objectApi.getRandom() * 0.3));
          const heightSegments = 16;
          const radialSegments = 5;
          const geometry = new THREE.CylinderBufferGeometry(radiusTop, radiusBottom, heightSegments, radialSegments, heightSegments);
          geometry.removeAttribute('normal');
          geometry.applyMatrix(new THREE.Matrix4().makeTranslation(0, heightSegments / 2, 0));
          const positions = geometry.getAttribute('position').array;
          const uvs = geometry.getAttribute('uv').array;

          const heightOffsets = {};
          let heightOffset = new THREE.Vector3();
          heightOffsets[0] = heightOffset;
          for (let i = 1; i <= heightSegments; i++) {
            heightOffset = heightOffset.clone()
              .multiplyScalar(0.8)
              .add(new THREE.Vector3(
                -0.6 + (objectApi.getRandom() * 0.6),
                0,
                -0.6 + (objectApi.getRandom() * 0.6)
              ));
            heightOffsets[i] = heightOffset;
          }

          const numPositions = positions.length / 3;
          for (let i = 0; i < numPositions; i++) {
            const baseIndex3 = i * 3;
            const y = positions[baseIndex3 + 1];
            const heightOffset = heightOffsets[y];

            positions[baseIndex3 + 0] += heightOffset.x;
            // positions[baseIndex + 1] += heightOffset.y;
            positions[baseIndex3 + 2] += heightOffset.z;

            const baseIndex2 = i * 2;
            uvs[baseIndex2 + 0] = treeUvs[0] + (uvs[baseIndex2 + 0] * treeUvWidth);
            uvs[baseIndex2 + 1] = (treeUvs[1] + treeUvHeight) - (uvs[baseIndex2 + 1] * treeUvHeight);
          }

          geometry.computeBoundingBox();

          geometry.heightSegments = heightSegments;
          geometry.radialSegments = radialSegments;
          geometry.heightOffsets = heightOffsets;

          return geometry;
        };
        const trunkGeometries = (() => {
          const numTrunkGeometries = 8;
          const result = Array(numTrunkGeometries);
          for (let i = 0; i < numTrunkGeometries; i++) {
            result[i] = _makeTrunkGeometry();
          }
          return result;
        })();
        const _makeTreeBranchGeometry = heightSegments => {
          const radiusBottom = 0.1 + objectApi.getRandom() * 0.1;
          const radiusTop = radiusBottom * (0.2 + (objectApi.getRandom() * 0.3));
          const radialSegments = 3;

          const geometry = new THREE.CylinderBufferGeometry(radiusTop, radiusBottom, heightSegments, radialSegments, heightSegments);
          geometry.removeAttribute('normal');
          geometry.applyMatrix(new THREE.Matrix4().makeTranslation(0, heightSegments / 2, 0));
          const positions = geometry.getAttribute('position').array;
          const uvs = geometry.getAttribute('uv').array;

          const heightOffsets = {};
          let heightOffset = new THREE.Vector3();
          heightOffsets[0] = heightOffset;
          for (let i = 1; i <= heightSegments; i++) {
            heightOffset = heightOffset.clone()
               .multiplyScalar(0.8)
              .add(new THREE.Vector3(
                -0.6 + (objectApi.getRandom() * 0.6),
                0,
                -0.6 + (objectApi.getRandom() * 0.6)
              ));
            heightOffsets[i] = heightOffset;
          }

          const numPositions = positions.length / 3;
          for (let i = 0; i < numPositions; i++) {
            const baseIndex3 = i * 3;
            const y = positions[baseIndex3 + 1];
            const heightOffset = heightOffsets[y];

            positions[baseIndex3 + 0] += heightOffset.x;
            // positions[baseIndex + 1] += heightOffset.y;
            positions[baseIndex3 + 2] += heightOffset.z;

            const baseIndex2 = i * 2;
            uvs[baseIndex2 + 0] = treeUvs[0] + (uvs[baseIndex2 + 0] * treeUvWidth);
            uvs[baseIndex2 + 1] = treeUvs[1] + (uvs[baseIndex2 + 1] * treeUvHeight);
          }

          geometry.applyMatrix(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            new THREE.Vector3(1, 0, 0)
          )));

          return geometry;
        };
        const _makeTreeBranchGeometrySize = heightSegments => {
          const numChoices = 4;
          const result = Array(numChoices);
          for (let i = 0; i < numChoices; i++) {
            result[i] = _makeTreeBranchGeometry(heightSegments);
          };
          return result;
        };
        const branchGeometrySizes = [
          _makeTreeBranchGeometrySize(4),
          _makeTreeBranchGeometrySize(5),
          _makeTreeBranchGeometrySize(6),
          _makeTreeBranchGeometrySize(7),
          _makeTreeBranchGeometrySize(8),
          _makeTreeBranchGeometrySize(9),
          _makeTreeBranchGeometrySize(10),
        ];
        const treeGeometry = (() => {
          const positions = new Float32Array(NUM_POSITIONS * 3);
          const uvs = new Float32Array(NUM_POSITIONS * 2);
          const indices = new Uint32Array(NUM_POSITIONS);
          let attributeIndex = 0;
          let uvIndex = 0;
          let indexIndex = 0;

          const _renderTrunk = () => {
            const trunkGeometry = trunkGeometries[Math.floor(objectApi.getRandom() * trunkGeometries.length)];
            const geometry = trunkGeometry;
            const newPositions = geometry.getAttribute('position').array;
            positions.set(newPositions, attributeIndex);
            const newUvs = geometry.getAttribute('uv').array;
            uvs.set(newUvs, uvIndex);
            const newIndices = geometry.index.array;
            _copyIndices(newIndices, indices, indexIndex, attributeIndex / 3);

            attributeIndex += newPositions.length;
            uvIndex += newUvs.length;
            indexIndex += newIndices.length;

            return trunkGeometry;
          };
          const trunkGeometrySpec = _renderTrunk();

          const _renderBranches = trunkGeometrySpec => {
            const {heightSegments, heightOffsets} = trunkGeometrySpec;

            const branchGeometrySpec = [];
            for (let i = Math.floor(heightSegments * 0.4); i < heightSegments; i++) {
              const heightOffset = heightOffsets[i];

              const maxNumBranchesPerNode = 2;
              const optimalBranchHeight = 0.7;
              const branchWeight = 1 - Math.pow(Math.abs(i - (heightSegments * optimalBranchHeight)) / (heightSegments * optimalBranchHeight), 0.3);
              for (let j = 0; j < maxNumBranchesPerNode; j++) {
                if (objectApi.getRandom() < branchWeight) {
                  const branchSizeIndex = branchWeight === 1 ? (branchGeometrySizes.length - 1) : Math.floor(branchWeight * branchGeometrySizes.length);
                  const branchGeometries = branchGeometrySizes[branchSizeIndex];
                  const branchGeometry = branchGeometries[Math.floor(objectApi.getRandom() * branchGeometries.length)];
                  const geometry = branchGeometry
                    .clone()
                    .applyMatrix(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(
                      objectApi.getRandom() * Math.PI / 6,
                      objectApi.getRandom() * Math.PI * 2,
                      objectApi.getRandom() * Math.PI / 6,
                      CAMERA_ROTATION_ORDER
                    )))
                    .applyMatrix(new THREE.Matrix4().makeTranslation(
                      heightOffset.x,
                      i,
                      heightOffset.z
                    ));
                  const newPositions = geometry.getAttribute('position').array;
                  positions.set(newPositions, attributeIndex);
                  const newUvs = geometry.getAttribute('uv').array;
                  uvs.set(newUvs, uvIndex);
                  const newIndices = geometry.index.array;
                  _copyIndices(newIndices, indices, indexIndex, attributeIndex / 3);

                  branchGeometrySpec.push(geometry);

                  attributeIndex += newPositions.length;
                  uvIndex += newUvs.length;
                  indexIndex += newIndices.length;
                }
              }
            }

            return branchGeometrySpec;
          };
          const branchGeometrySpec = _renderBranches(trunkGeometrySpec);

          const _renderLeaves = branchGeometrySpec => {
            const numLeaves = 50;
            for (let i = 0; i < numLeaves; i++) {
              const branchGeometry = branchGeometrySpec[Math.floor(objectApi.getRandom() * branchGeometrySpec.length)];
              const branchPositions = branchGeometry.getAttribute('position').array;
              // const branchNormals = branchGeometry.getAttribute('normal').array;
              const numPositions = branchPositions.length / 3;
              // const index1 = Math.floor((1 - Math.pow(objectApi.getRandom(), 0.5)) * numPositions);
              const index1 = Math.floor(objectApi.getRandom() * numPositions);
              // XXX bugfix this to scan to a position with a different y; currently broken due to indexing
              const index2 = (index1 < (numPositions - 1)) ? (index1 + 1) : (index1 - 1);
              const baseIndex1 = index1 * 3;
              const baseIndex2 = index2 * 3;
              const lerpFactor = objectApi.getRandom();
              const inverseLerpFactor = 1 - lerpFactor;

              const geometry = new THREE.PlaneBufferGeometry(1, 1)
                .applyMatrix(new THREE.Matrix4().makeTranslation(0, 1/2, 0))
                .applyMatrix(new THREE.Matrix4().makeScale(
                  3,
                  3,
                  1
                ))
                .applyMatrix(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(
                  objectApi.getRandom() * Math.PI / 2,
                  objectApi.getRandom() * (Math.PI * 2),
                  0,
                  CAMERA_ROTATION_ORDER
                )))
                /* .applyMatrix(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(
                  upVector,
                  new THREE.Vector3(
                    (branchNormals[baseIndex1 + 0] * lerpFactor + branchNormals[baseIndex2 + 0] * inverseLerpFactor),
                    (branchNormals[baseIndex1 + 1] * lerpFactor + branchNormals[baseIndex2 + 1] * inverseLerpFactor),
                    (branchNormals[baseIndex1 + 2] * lerpFactor + branchNormals[baseIndex2 + 2] * inverseLerpFactor)
                  )
                ))) */
                .applyMatrix(new THREE.Matrix4().makeTranslation(
                  (branchPositions[baseIndex1 + 0] * lerpFactor + branchPositions[baseIndex2 + 0] * inverseLerpFactor),
                  (branchPositions[baseIndex1 + 1] * lerpFactor + branchPositions[baseIndex2 + 1] * inverseLerpFactor),
                  (branchPositions[baseIndex1 + 2] * lerpFactor + branchPositions[baseIndex2 + 2] * inverseLerpFactor)
                ));

              const newPositions = geometry.getAttribute('position').array;
              positions.set(newPositions, attributeIndex);
              const newUvs = geometry.getAttribute('uv').array;
              const numNewUvs = newUvs.length / 2;
              for (let j = 0; j < numNewUvs; j++) {
                const baseIndex = j * 2;
                newUvs[baseIndex + 0] = leafUvs[0] + (newUvs[baseIndex + 0] * leafUvWidth);
                newUvs[baseIndex + 1] = leafUvs[1] + (newUvs[baseIndex + 1] * leafUvHeight);
              }
              uvs.set(newUvs, uvIndex);
              const newIndices = geometry.index.array;
              _copyIndices(newIndices, indices, indexIndex, attributeIndex / 3);

              attributeIndex += newPositions.length;
              uvIndex += newUvs.length;
              indexIndex += newIndices.length;
            }
          };
          _renderLeaves(branchGeometrySpec);

          const geometry = new THREE.BufferGeometry();
          geometry.addAttribute('position', new THREE.BufferAttribute(new Float32Array(positions.buffer, positions.byteOffset, attributeIndex), 3));
          geometry.addAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs.buffer, uvs.byteOffset, uvIndex), 2));
          geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices.buffer, indices.byteOffset, indexIndex), 1));
          geometry.boundingBox = trunkGeometrySpec.boundingBox;
          return geometry;
        })();

        return treeGeometry;
      })();
      objectApi.registerGeometry('tree', treeGeometry);

      const localVector = new THREE.Vector3();
      const localQuaternion = new THREE.Quaternion();
      const localEuler = new THREE.Euler();
      const treeProbability = 0.015;

      objectApi.registerGenerator('tree', chunk => {
        for (let dz = 0; dz < NUM_CELLS; dz++) {
          for (let dx = 0; dx < NUM_CELLS; dx++) {
            const elevation = Math.floor(objectApi.getElevation(chunk.x * NUM_CELLS + dx, chunk.z * NUM_CELLS + dz));

            if (elevation > 64) {
              const v = objectApi.getNoise('tree', chunk.x, chunk.z, dx, dz);

              if (v < treeProbability) {
                const ax = (chunk.x * NUM_CELLS) + dx;
                const az = (chunk.z * NUM_CELLS) + dz;
                localVector.set(ax, elevation, az);
                localQuaternion.setFromEuler(localEuler.set(
                  0,
                  objectApi.getHash(String(v)) / 0xFFFFFFFF * Math.PI * 2,
                  0,
                  'YXZ'
                ));
                objectApi.addObject(chunk, 'tree', localVector, localQuaternion, 0);
              }
            }
          }
        }
      });

      return () => {
      };
    });
};

module.exports = tree;
