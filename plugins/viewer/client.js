import {
  WIDTH,
  HEIGHT,
  ASPECT_RATIO,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  WORLD_DEPTH,

  SLOT_WIDTH,
  SLOT_HEIGHT,
  SLOT_ASPECT_RATIO,
  SLOT_WORLD_WIDTH,
  SLOT_WORLD_HEIGHT,
  SLOT_WORLD_DEPTH,
} from './lib/constants/viewer';
import viewerRenderer from './lib/render/viewer';
import menuUtils from './lib/utils/menu';

const SIDES = ['left', 'right'];

const SLOT_GRAB_DISTANCE = 0.2;

const dataKeySymbol = Symbol();

class Viewer {
  constructor(archae) {
    this._archae = archae;
  }

  mount() {
    const {_archae: archae} = this;

    let live = true;
    this._cleanup = () => {
      live = false;
    };

    return archae.requestPlugins([
      '/core/engines/zeo',
      '/core/engines/biolumi',
      '/core/engines/fs',
      '/core/plugins/geometry-utils',
    ]).then(([
      zeo,
      biolumi,
      fs,
      geometryUtils,
    ]) => {
      if (live) {
        const {THREE, scene, camera} = zeo;

        // const transparentMaterial = biolumi.getTransparentMaterial();
        const solidMaterial = biolumi.getSolidMaterial();

        const lineMaterial = new THREE.LineBasicMaterial({
          color: 0x808080,
        });
        const wireframeMaterial = new THREE.MeshBasicMaterial({
          color: 0x0000FF,
          wireframe: true,
          opacity: 0.5,
          transparent: true,
        });

        const _decomposeObjectMatrixWorld = object => _decomposeMatrix(object.matrixWorld);
        const _decomposeMatrix = matrix => {
          const position = new THREE.Vector3();
          const rotation = new THREE.Quaternion();
          const scale = new THREE.Vector3();
          matrix.decompose(position, rotation, scale);
          return {position, rotation, scale};
        };

        /* const _requestImage = src => new Promise((accept, reject) => {
          const img = new Image();
          img.src = src;
          img.onload = () => {
            accept(img);
          };
          img.onerror = err => {
            reject(err);
          };
        }); */

        const _requestUis = () => Promise.all([
          biolumi.requestUi({
            width: WIDTH,
            height: HEIGHT,
          }),
          biolumi.requestUi({
            width: SLOT_WIDTH,
            height: SLOT_HEIGHT,
            color: [1, 1, 1, 0],
          }),
        ]).then(([
          mediaUi,
          slotPlaceholderUi,
        ]) => ({
          mediaUi,
          slotPlaceholderUi,
        }));

        class ViewerElement extends HTMLElement {
          createdCallback() {
            let live = true;
            this._cleanup = () => {
              live = false;
            };

            _requestUis()
              .then(({
                mediaUi,
                slotPlaceholderUi,
              }) => {
                if (live) {
                  class Data {
                    constructor(data) {
                      this[dataKeySymbol] = data;

                      this._id = _makeId();
                    }

                    get() {
                      return this[dataKeySymbol];
                    }
                  }
                  const _requestFileData = file => {
                    const {type} = file;

                    if (/^image\/(?:png|jpeg|gif|file)$/.test(type)) {
                      const {id} = file;

                      return fetch('/archae/fs/' + id)
                        .then(res => res.arrayBuffer()
                          .then(arrayBuffer => ({
                            mode: 'image',
                            type,
                            data: new Data(arrayBuffer),
                          }))
                        );
                    } else if (/^audio\/(?:wav|mpeg|ogg|vorbis|webm|x-flac)$/.test(type)) {
                      const {id} = file;

                      return new Promise((accept, reject) => {
                        const audio = document.createElement('audio');
                        audio.src = '/archae/fs/' + id;
                        audio.oncanplaythrough = () => {
                          accept({
                            mode: 'audio',
                            type,
                            data: new Data(audio),
                          });
                        };
                        audio.onerror = err => {
                          reject(err);
                        };
                      });
                    } else {
                      return new Promise((accept, reject) => {
                        const err = new Error('unsupported file type: ' + JSON.stringify(type));
                        reject(err);
                      });
                    }
                  };

                  const mediaGrabState = {
                    fileMesh: null, // not in mediaState to prevent JSON.stringify recursion
                  };

                  const mediaState = {
                    type: null,
                    data: null,
                    loading: false,
                    cancelRequest: null,
                  };

                  const mediaHoverStates = {
                    left: biolumi.makeMenuHoverState(),
                    right: biolumi.makeMenuHoverState(),
                  };

                  const mediaBoxMeshes = {
                    left: biolumi.makeMenuBoxMesh(),
                    right: biolumi.makeMenuBoxMesh(),
                  };
                  scene.add(mediaBoxMeshes.left);
                  scene.add(mediaBoxMeshes.right);

                  const _makeBoxMesh = () => {
                    const width = SLOT_WORLD_WIDTH;
                    const height = SLOT_WORLD_HEIGHT;
                    const depth = SLOT_WORLD_DEPTH;

                    const geometry = new THREE.BoxBufferGeometry(width, height, depth);
                    const material = wireframeMaterial;

                    const mesh = new THREE.Mesh(geometry, material);
                    mesh.rotation.order = camera.rotation.order;
                    mesh.depthWrite = false;
                    mesh.visible = false;
                    return mesh;
                  };
                  const boxMeshes = {
                    left: _makeBoxMesh(),
                    right: _makeBoxMesh(),
                  };
                  scene.add(boxMeshes.left);
                  scene.add(boxMeshes.right);

                  const mesh = (() => {
                    const object = new THREE.Object3D();
                    object.position.y = 1.2;
                    object.position.z = 1;

                    const mediaMesh = (() => {
                      const mesh = mediaUi.addPage(({
                        media: {
                          mode,
                          type,
                          data,
                          loading,
                          paused,
                        }
                      }) => {
                        return [
                          {
                            type: 'html',
                            src: viewerRenderer.getMediaSrc({mode, type, data, loading, paused}),
                            x: 0,
                            y: 0,
                            w: WIDTH,
                            h: HEIGHT,
                          },
                        ];
                      }, {
                        type: 'media',
                        state: {
                          media: mediaState,
                        },
                        worldWidth: WORLD_WIDTH,
                        worldHeight: WORLD_HEIGHT,
                      });
                      // mesh.position.y = 1.5;
                      mesh.receiveShadow = true;

                      return mesh;
                    })();
                    object.add(mediaMesh);
                    object.mediaMesh = mediaMesh;

                    /* const controlsMesh = (() => {
                      const geometry = new THREE.PlaneBufferGeometry(WORLD_WIDTH, WORLD_WIDTH / 4, 1, 1);

                      const controlsMaterial = (() => {
                        const texture = (() => {
                          const canvas = document.createElement('canvas');
                          canvas.width = videoResolutionWidth;
                          canvas.height = videoResolutionHeight / 4;

                          const ctx = canvas.getContext('2d');
                          canvas.update = progress => {
                            ctx.clearRect(0, 0, canvas.width, canvas.height);

                            ctx.fillStyle = '#000000';
                            ctx.beginPath();
                            ctx.moveTo(10, 10);
                            ctx.lineTo(10, 26);
                            ctx.lineTo(26, (10 + 26) / 2);
                            ctx.closePath();
                            ctx.fill();

                            ctx.fillStyle = '#CCCCCC';
                            ctx.fillRect(trackbarStart, 17, trackbarWidth, 36 - (17) - (17));

                            ctx.fillStyle = '#FF0000';
                            ctx.fillRect(trackbarStart + (progress * trackbarWidth) - 1, 10, 2, 36 - (10) - (10));

                            texture.needsUpdate = true;
                          };

                          const texture = new THREE.Texture(
                            canvas,
                            THREE.UVMapping,
                            THREE.ClampToEdgeWrapping,
                            THREE.ClampToEdgeWrapping,
                            THREE.LinearFilter,
                            THREE.LinearFilter,
                            THREE.RGBAFormat,
                            THREE.UnsignedByteType,
                            16
                          );
                          texture.needsUpdate = true;
                          return texture;
                        })();

                        const material = new THREE.MeshBasicMaterial({
                          // color: 0xCCCCCC,
                          // shininess: 0,
                          map: texture,
                          // shading: THREE.FlatShading,
                          // wireframe: true,
                          transparent: true,
                          alphaTest: 0.5,
                          // depthWrite: false,
                        });
                        return material;
                      })();

                      const mesh = THREE.SceneUtils.createMultiMaterialObject(geometry, [solidMaterial, controlsMaterial]);
                      return mesh;
                    })();
                    object.add(controlsMesh);
                    object.controlsMesh = controlsMesh; */

                    const slotMesh = (() => {
                      const object = new THREE.Object3D();
                      object.position.x = (WORLD_WIDTH / 2) + (SLOT_WORLD_HEIGHT / 2);
                      object.rotation.z = Math.PI / 2;

                      /* const notchMesh = (() => {
                        const geometry = new THREE.BoxBufferGeometry(SLOT_WORLD_WIDTH + (SLOT_WORLD_HEIGHT / 4), SLOT_WORLD_HEIGHT / 4, (SLOT_WORLD_HEIGHT / 4) / 2);
                        geometry.applyMatrix(new THREE.Matrix4().makeTranslation(0, (SLOT_WORLD_HEIGHT / 2) - ((SLOT_WORLD_HEIGHT / 4) / 2), 0));
                        const material = new THREE.MeshPhongMaterial({
                          color: 0x808080,
                          shininess: 10,
                        });

                        const mesh = new THREE.Mesh(geometry, material);
                        return mesh;
                      })();
                      object.add(notchMesh); */

                      const placeholderMesh = (() => {
                        const mesh = slotPlaceholderUi.addPage([
                          {
                            type: 'html',
                            src: viewerRenderer.getSlotPlaceholderSrc(),
                            x: 0,
                            y: 0,
                            w: SLOT_WIDTH,
                            h: SLOT_HEIGHT,
                          },
                        ], {
                          type: 'slotPlaceholder',
                          state: {},
                          worldWidth: SLOT_WORLD_WIDTH,
                          worldHeight: SLOT_WORLD_HEIGHT,
                        });
                        mesh.receiveShadow = true;

                        return mesh;
                      })();
                      object.add(placeholderMesh);
                      object.placeholderMesh = placeholderMesh;

                      const lineMesh = (() => {
                        const geometry = new THREE.BufferGeometry();
                        const positions = Float32Array.from([
                          -SLOT_WORLD_WIDTH / 2, -SLOT_WORLD_HEIGHT / 2, 0,
                          -SLOT_WORLD_WIDTH / 2, SLOT_WORLD_HEIGHT / 2, 0,
                          SLOT_WORLD_WIDTH / 2, SLOT_WORLD_HEIGHT / 2, 0,
                          SLOT_WORLD_WIDTH / 2, -SLOT_WORLD_HEIGHT / 2, 0,
                          -SLOT_WORLD_WIDTH / 2, -SLOT_WORLD_HEIGHT / 2, 0,
                        ]);
                        geometry.addAttribute('position', new THREE.BufferAttribute(positions, 3));

                        const material = lineMaterial;

                        const mesh = new THREE.Line(geometry, material);
                        mesh.frustumCulled = false;
                        return mesh;
                      })();
                      object.add(lineMesh);

                      return object;
                    })();
                    object.add(slotMesh);
                    object.slotMesh = slotMesh;

                    /* const lineMesh = (() => {
                      const geometry = new THREE.BufferGeometry();
                      const positions = Float32Array.from([
                        -WORLD_WIDTH / 2, -WORLD_HEIGHT / 2, 0,
                        -WORLD_WIDTH / 2, WORLD_HEIGHT / 2, 0,
                        WORLD_WIDTH / 2, WORLD_HEIGHT / 2, 0,
                        WORLD_WIDTH / 2, -WORLD_HEIGHT / 2, 0,
                        -WORLD_WIDTH / 2, -WORLD_HEIGHT / 2, 0,
                      ]);
                      geometry.addAttribute('position', new THREE.BufferAttribute(positions, 3));

                      const material = lineMaterial;

                      const mesh = new THREE.Line(geometry, material);
                      mesh.frustumCulled = false;
                      return mesh;
                    })();
                    object.add(lineMesh); */

                    return object;
                  })();
                  this.mesh = mesh;
                  scene.add(mesh);

                  const _updatePages = {
                    mediaUi.update();
                    slotPlaceholderUi.update();
                  };
                  _updatePages();

                  const _makeHoverState = () => ({
                    hovered: false,
                  });
                  const hoverStates = {
                    left: _makeHoverState(),
                    right: _makeHoverState(),
                  };

                  const _gripdown = e => {
                    const {side} = e;
                    const {fileMesh} = mediaGrabState;

                    if (fileMesh) {
                      const slotHovered = hoverStates[side].hovered;

                      if (slotHovered) {
                        const handsGrabber = zeo.peek(side);

                        if (!handsGrabber) {
                          fs.grabFile(side, fileMesh);

                          mediaGrabState.fileMesh = null;

                          mediaState.type = null;
                          mediaState.data = null;
                          mediaState.loading = false;

                          if (mediaState.cancelRequest) {
                            mediaState.cancelRequest();
                            mediaState.cancelRequest = null;
                          }

                          const {slotMesh} = mesh;
                          const {placeholderMesh} = slotMesh;
                          placeholderMesh.visible = false;

                          _updatePages();

                          e.stopImmediatePropagation();
                        }
                      }
                    }
                  };
                  zeo.on('gripdown', _gripdown, {
                    priority: 1,
                  });

                  const _gripup = e => {
                    const {side} = e;

                    const handsGrabber = zeo.peek(side);
                    if (handsGrabber) {
                      const {object: handsGrabberObject} = handsGrabber;

                      if (fs.isFile(handsGrabberObject)) {
                        const slotHovered = hoverStates[side].hovered;

                        if (slotHovered) {
                          handsGrabber.release();

                          const fileMesh = handsGrabberObject;
                          const {slotMesh} = mesh;
                          slotMesh.add(fileMesh);
                          fileMesh.position.copy(new THREE.Vector3());
                          fileMesh.quaternion.copy(new THREE.Quaternion());
                          fileMesh.scale.copy(new THREE.Vector3(1, 1, 1));

                          const {placeholderMesh} = slotMesh;
                          placeholderMesh.visible = false;

                          if (mediaState.cancelRequest) {
                            mediaState.cancelRequest();
                            mediaState.cancelRequest = null;
                          }

                          const {file} = fileMesh;
                          let live = true;
                          _requestFileData(file)
                            .then(({mode, type, data}) => {
                              mediaGrabState.fileMesh = fileMesh;

                              mediaState.mode = mode;
                              mediaState.type = type;
                              mediaState.data = data.get();
                              mediaState.loading = false;
                              mediaState.paused = true;

                              _updatePages();

                              live = false;
                            })
                            .catch(err => {
                              console.warn(err);

                              mediaState.loading = false;

                              _updatePages();

                              live = false;
                            });
                          mediaState.cancelRequest = () => {
                            live = false;
                          };
                          mediaState.loading = true;

                          _updatePages();

                          e.stopImmediatePropagation(); // so tags engine doesn't pick it up
                        }
                      }
                    }
                  };
                  zeo.on('gripup', _gripup, {
                    priority: 1,
                  });

                  const _update = () => {
                    const _updateControllers = () => {
                      const {gamepads} = zeo.getStatus();

                      const {mediaMesh} = mesh;
                      const mediaMatrixObject = _decomposeObjectMatrixWorld(mediaMesh);

                      SIDES.forEach(side => {
                        const gamepad = gamepads[side];

                        if (gamepad) {
                          const _updateMedia = () => {
                            const {position: controllerPosition} = gamepad;
                            const mediaHoverState = mediaHoverStates[side];
                            const mediaBoxMesh = mediaBoxMeshes[side];

                            biolumi.updateAnchors({
                              objects: [{
                                matrixObject: mediaMatrixObject,
                                ui: mediaUi,
                              }],
                              hoverState: mediaHoverState,
                              boxMesh: mediaBoxMesh,
                              width: WIDTH,
                              height: HEIGHT,
                              worldWidth: WORLD_WIDTH,
                              worldHeight: WORLD_HEIGHT,
                              worldDepth: WORLD_DEPTH,
                              controllerPosition,
                            });
                          };
                          const _updateSlot = () => {
                            const {position: controllerPosition} = gamepad;
                            const {slotMesh} = mesh;
                            const {position: slotMeshPosition, rotation: slotMeshRotation} = _decomposeObjectMatrixWorld(slotMesh);

                            const hoverState = hoverStates[side];
                            const boxMesh = boxMeshes[side];
                            if (controllerPosition.distanceTo(slotMeshPosition) <= SLOT_GRAB_DISTANCE) {
                              hoverState.hovered = true;

                              boxMesh.position.copy(slotMeshPosition);
                              boxMesh.quaternion.copy(slotMeshRotation);
                              boxMesh.visible = true;
                            } else {
                              hoverState.hovered = false;
                              boxMesh.visible = false;
                            }
                          };

                          _updateMedia();
                          _updateSlot();
                        }
                      });
                    };
                    _updateControllers();
                  };
                  zeo.on('update', _update);

                  this._cleanup = () => {
                    scene.remove(mesh);

                    scene.remove(mediaBoxMeshes.left);
                    scene.remove(mediaBoxMeshes.right);

                    scene.remove(boxMeshes.left);
                    scene.remove(boxMeshes.right);

                    zeo.removeListener('gripdown', _gripdown);
                    zeo.removeListener('gripup', _gripup);
                    zeo.removeListener('update', _update);
                  };
                }
              });
          }

          destructor() {
            this._cleanup();
          }
        }
        zeo.registerElement(this, ViewerElement);

        this._cleanup = () => {
          zeo.unregisterElement(this);
        };

        return {};
      }
    });
  }

  unmount() {
    this._cleanup();
  }
}

const _makeId = () => Math.random().toString(36).substring(7);

module.exports = Viewer;
