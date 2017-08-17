const HEIGHTFIELD_PLUGIN = 'plugins-heightfield';
const DEFAULT_MATRIX = [
  0, 0, 0,
  0, 0, 0, 1,
  1, 1, 1,
];
const SIDES = ['left', 'right'];

const dataSymbol = Symbol();

const monitor = objectApi => {
  const {three, elements, render, input, pose, fs, hands, items} = zeo;
  const {THREE, scene, camera, renderer} = three;

  const oneVector = new THREE.Vector3(1, 1, 1);
  const backVector = new THREE.Vector3(0, 0, -1);
  const localVector = new THREE.Vector3();
  const localVector2 = new THREE.Vector3();
  const localCoords = new THREE.Vector2();
  const localQuaternion = new THREE.Quaternion();
  const localEuler = new THREE.Euler();
  const localLine = new THREE.Line3();

  const _requestImage = src => new Promise((accept, reject) => {
    const img = new Image();
    img.onload = () => {
      accept(img);
    };
    img.onerror = err => {
      reject(img);
    };
    img.src = src;
  });
  const _requestImageBitmap = src => _requestImage(src)
    .then(img => createImageBitmap(img, 0, 0, img.width, img.height));

  return () => _requestImage('/archae/objects/img/plastic.png')
    .then(monitorImg => objectApi.registerTexture('monitor', monitorImg))
    .then(() => objectApi.registerGeometry('monitor', (args) => {
      const {THREE, getUv} = args;
      const monitorUvs = getUv('monitor');
      const uvWidth = monitorUvs[2] - monitorUvs[0];
      const uvHeight = monitorUvs[3] - monitorUvs[1];

      const MONITOR_SIZE = 1;
      const STAND_SIZE = 2;
      const MONITOR_BORDER_SIZE = MONITOR_SIZE * 0.1;
      const width = MONITOR_SIZE;
      const aspectRatio = 1.5;
      const height = width / aspectRatio;
      const border = MONITOR_BORDER_SIZE;
      const NUM_POSITIONS = 10 * 1024;

      const geometry = (() => {
        const trunkGeometry = new THREE.BoxBufferGeometry(border, STAND_SIZE, border)
          .applyMatrix(new THREE.Matrix4().makeTranslation(0, STAND_SIZE/2 + border, 0));

        const screenGeometry = new THREE.BoxBufferGeometry(width, height, border)
          .applyMatrix(new THREE.Matrix4().makeTranslation(0, STAND_SIZE - height/2 + border, border/2 + border/2));

        const baseGeometry = new THREE.BoxBufferGeometry(border * 4, border, border * 3)
          .applyMatrix(new THREE.Matrix4().makeTranslation(0, border/2, 0));

        const _copyIndices = (src, dst, startIndexIndex, startAttributeIndex) => {
          for (let i = 0; i < src.length; i++) {
            dst[startIndexIndex + i] = src[i] + startAttributeIndex;
          }
        };

        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(NUM_POSITIONS);
        const normals = new Float32Array(NUM_POSITIONS);
        const uvs = new Float32Array(NUM_POSITIONS);
        const indices = new Uint16Array(NUM_POSITIONS);
        let attributeIndex = 0;
        let uvIndex = 0;
        let indexIndex = 0;
        [
          trunkGeometry,
          screenGeometry,
          baseGeometry,
        ].forEach(newGeometry => {
          const newPositions = newGeometry.getAttribute('position').array;
          positions.set(newPositions, attributeIndex);
          const newNormals = newGeometry.getAttribute('normal').array;
          normals.set(newNormals, attributeIndex);
          const newUvs = newGeometry.getAttribute('uv').array;
          uvs.set(newUvs, uvIndex);
          const newIndices = newGeometry.index.array;
          _copyIndices(newIndices, indices, indexIndex, attributeIndex / 3);

          attributeIndex += newPositions.length;
          uvIndex += newUvs.length;
          indexIndex += newIndices.length;
        });
        geometry.addAttribute('position', new THREE.BufferAttribute(new Float32Array(positions.buffer, positions.byteOffset, attributeIndex), 3));
        geometry.addAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals.buffer, normals.byteOffset, attributeIndex), 3));
        geometry.addAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs.buffer, uvs.byteOffset, uvIndex), 2));
        geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(indices.buffer, indices.byteOffset, indexIndex), 1));
        return geometry;
      })();
      const uvs = geometry.getAttribute('uv').array;
      const numUvs = uvs.length / 2;
      for (let i = 0; i < numUvs; i++) {
        uvs[i * 2 + 0] = monitorUvs[0] + (uvs[i * 2 + 0] * uvWidth);
        uvs[i * 2 + 1] = (monitorUvs[1] + uvHeight) - (uvs[i * 2 + 1] * uvHeight);
      }

      return geometry;
    }))
    .then(() => {
      const MONITOR_SIZE = 1;
      const STAND_SIZE = 2;
      const MONITOR_BORDER_SIZE = MONITOR_SIZE * 0.1;
      const width = MONITOR_SIZE;
      const aspectRatio = 1.5;
      const height = width / aspectRatio;
      const border = MONITOR_BORDER_SIZE;
      const RESOLUTION_X = 800;
      const RESOLUTION_Y = Math.round(RESOLUTION_X / aspectRatio);

      const monitorItemApi = {
        asset: 'ITEM.MONITOR',
        itemAddedCallback(grabbable) {
          const _triggerdown = e => {
            const {side} = e;

            if (grabbable.getGrabberSide() === side) {
              const heightfieldElement = elements.getEntitiesElement().querySelector(HEIGHTFIELD_PLUGIN);
              localVector.set(
                grabbable.position.x,
                heightfieldElement ? heightfieldElement.getBestElevation(grabbable.position.x, grabbable.position.z, grabbable.position.y) : 0,
                grabbable.position.z
              );
              localEuler.setFromQuaternion(grabbable.rotation, camera.rotation.order);
              localEuler.x = 0;
              localEuler.z = 0;
              localQuaternion.setFromEuler(localEuler);
              objectApi.addObject('monitor', localVector, localQuaternion);

              items.destroyItem(grabbable);

              e.stopImmediatePropagation();
            }
          };
          input.on('triggerdown', _triggerdown);

          grabbable[dataSymbol] = {
            cleanup: () => {
              input.removeListener('triggerdown', _triggerdown);
            },
          };
        },
        itemRemovedCallback(grabbable) {
          const {[dataSymbol]: {cleanup}} = grabbable;
          cleanup();

          delete grabbable[dataSymbol];
        },
      };
      items.registerItem(this, monitorItemApi);

      const monitors = {};
      const monitorObjectApi = {
        object: 'monitor',
        addedCallback(id, position, rotation, value) {
          const monitorMesh = (() => {
            const geometry = new THREE.PlaneBufferGeometry(width * 0.9, height * 0.9);

            const canvas = document.createElement('canvas');
            canvas.width = RESOLUTION_X;
            canvas.height = RESOLUTION_Y;
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            ctx.mozImageSmoothingEnabled = false;
            ctx.clear = () => {
              canvas.ctx.fillStyle = '#000';
              canvas.ctx.fillRect(0, 0, canvas.width, canvas.height);
            };
            canvas.ctx = ctx;
            const texture = new THREE.Texture(
              canvas,
              THREE.UVMapping,
              THREE.ClampToEdgeWrapping,
              THREE.ClampToEdgeWrapping,
              THREE.NearestFilter,
              THREE.NearestFilter,
              THREE.RGBAFormat,
              THREE.UnsignedByteType,
              1
            );
            texture.needsUpdate = true;
            const material = new THREE.MeshBasicMaterial({
              map: texture,
            });

            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.copy(position)
              .add(new THREE.Vector3(0, STAND_SIZE - height/2 + border, border/2 + border + 0.01).applyQuaternion(rotation));
            mesh.quaternion.copy(rotation);
            // mesh.scale.copy(scale);

            const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
              localVector.copy(backVector).applyQuaternion(mesh.quaternion),
              mesh.position
            );
            const xAxis = new THREE.Line3(
              mesh.position.clone().add(new THREE.Vector3(-MONITOR_SIZE/2, MONITOR_SIZE/2, 0).applyQuaternion(mesh.quaternion)),
              mesh.position.clone().add(new THREE.Vector3(MONITOR_SIZE/2, MONITOR_SIZE/2, 0).applyQuaternion(mesh.quaternion))
            );
            const yAxis = new THREE.Line3(
              mesh.position.clone().add(new THREE.Vector3(-MONITOR_SIZE/2, MONITOR_SIZE/2, 0).applyQuaternion(mesh.quaternion)),
              mesh.position.clone().add(new THREE.Vector3(-MONITOR_SIZE/2, -MONITOR_SIZE/2, 0).applyQuaternion(mesh.quaternion))
            );
            mesh.getCoords = (line, resultCoords) => {
              const planePoint = plane.intersectLine(line, localVector);

              if (planePoint) {
                const x = Math.floor(xAxis.closestPointToPoint(planePoint, true, localVector2).distanceTo(xAxis.start) / MONITOR_SIZE * RESOLUTION_X);
                const y = Math.floor(yAxis.closestPointToPoint(planePoint, true, localVector2).distanceTo(yAxis.start) / MONITOR_SIZE * RESOLUTION_Y);

                if (x > 0 && x < RESOLUTION && y > 0 && y < RESOLUTION) {
                  return resultCoords.set(x, y);
                } else {
                  return null;
                }
              } else {
                return null;
              }
            };

            const _makeDrawState = () => ({
              lastPoint: new THREE.Vector2(),
              lastPointActive: false,
            });
            mesh.drawStates = {
              left: _makeDrawState(),
              right: _makeDrawState(),
            };

            return mesh;
          })();
          scene.add(monitorMesh);
          monitorMesh.updateMatrixWorld();

          const monitor = {
            loadFileN(n) {
              const texture = monitorMesh.material.map;

              if (n !== 0) {
                _requestImageBitmap(items.getFile(n).getUrl())
                  .then(img => {
                    texture.image.ctx.clear();
                    const aspectRatio = img.width / img.height;
                    let width = texture.image.width;
                    let height = Math.floor(width / aspectRatio);
                    if (height > texture.image.height) {
                      height = texture.image.height;
                      width = Math.floor(height * aspectRatio);
                    }
                    const x = Math.max((texture.image.width - width) / 2, 0);
                    const y = Math.max((texture.image.height - height) / 2, 0);
                    texture.image.ctx.drawImage(img, x, y, width, height);
                    texture.needsUpdate = true;
                  })
                  .catch(err => {
                    console.warn(err);
                  });
              } else {
                texture.image.ctx.clear();
                texture.needsUpdate = true;
              }
            },
            cleanup() {
              scene.remove(monitorMesh);

              monitors[id] = null;
            },
          };
          monitor.loadFileN(value);

          monitors[id] = monitor;
        },
        removedCallback(id) {
          monitors[id].cleanup();
        },
        triggerCallback(id, side, x, z, objectIndex) {
          const monitor = monitors[id];
          const grabbedGrabbable = hands.getGrabbedGrabbable(side);

          if (grabbedGrabbable && grabbedGrabbable.type === 'file') {
            objectApi.setData(x, z, objectIndex, grabbedGrabbable.value);
          } else {
            objectApi.setData(x, z, objectIndex, 0);
          }
        },
        gripCallback(id, side, x, z, objectIndex) {
          const itemId = _makeId();
          const asset = 'ITEM.MONITOR';
          const assetInstance = items.makeItem({
            type: 'asset',
            id: itemId,
            name: asset,
            displayName: asset,
            attributes: {
              type: {value: 'asset'},
              value: {value: asset},
              position: {value: DEFAULT_MATRIX},
              quantity: {value: 1},
              owner: {value: null},
              bindOwner: {value: null},
              physics: {value: false},
            },
          });
          assetInstance.grab(side);

          objectApi.removeObject(x, z, objectIndex);
        },
        updateCallback(id, position, rotation, value) {
          monitors[id].loadFileN(value);
        },
      };
      objectApi.registerObject(monitorObjectApi);

      const _update = () => {
        // XXX
      };
      render.on('update', _update);

      return () => {
        objectApi.unregisterObject(monitorObjectApi);

        render.removeListener('update', _update);
      };
    });
};
const _makeId = () => Math.random().toString(36).substring(7);

module.exports = monitor;