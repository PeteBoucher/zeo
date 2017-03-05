import {
  WIDTH,
  HEIGHT,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  WORLD_DEPTH,

  NAVBAR_WIDTH,
  NAVBAR_HEIGHT,
  NAVBAR_WORLD_WIDTH,
  NAVBAR_WORLD_HEIGHT,
  NAVBAR_WORLD_DEPTH,

  DEFAULT_USER_HEIGHT,
  TRANSITION_TIME,
} from './lib/constants/menu';
import {
  KEYBOARD_WIDTH,
  KEYBOARD_HEIGHT,
  KEYBOARD_WORLD_WIDTH,
  KEYBOARD_WORLD_HEIGHT,
} from './lib/constants/keyboard';
import menuUtils from './lib/utils/menu';
import keyboardImg from './lib/img/keyboard';
import menuRender from './lib/render/menu';

const keyboardImgSrc = 'data:image/svg+xml;base64,' + btoa(keyboardImg);

const SIDES = ['left', 'right'];

class Rend {
  constructor(archae) {
    this._archae = archae;
  }

  mount() {
    const {_archae: archae} = this;

    let live = true;
    const cleanups = [];
    this._cleanup = () => {
      live = false;

      const oldCleanups = cleanups.slice();
      for (let i = 0; i < oldCleanups.length; i++) {
        const cleanup = oldCleanups[i];
        cleanup();
      }
    };

    return archae.requestPlugins([
      '/core/engines/hub',
      '/core/engines/input',
      '/core/engines/three',
      '/core/engines/webvr',
      '/core/engines/biolumi',
      '/core/engines/anima',
      '/core/plugins/js-utils',
      '/core/plugins/geometry-utils',
      '/core/plugins/creature-utils',
    ]).then(([
      hub,
      input,
      three,
      webvr,
      biolumi,
      anima,
      jsUtils,
      geometryUtils,
      creatureUtils,
    ]) => {
      if (live) {
        const {THREE, scene, camera, renderer} = three;
        const {events} = jsUtils;
        const {EventEmitter} = events;

        const transparentImg = biolumi.getTransparentImg();
        const transparentMaterial = biolumi.getTransparentMaterial();
        const solidMaterial = biolumi.getSolidMaterial();

        const oneVector = new THREE.Vector3(1, 1, 1);

        const menuRenderer = menuRender.makeRenderer({
          creatureUtils,
        });

        const _decomposeObjectMatrixWorld = object => {
          const position = new THREE.Vector3();
          const rotation = new THREE.Quaternion();
          const scale = new THREE.Vector3();
          object.matrixWorld.decompose(position, rotation, scale);
          return {position, rotation, scale};
        };

        const localUpdates = [];

        // main state
        let api = null;
        let menu = null;
        let menuMesh = null;
        let keyboardMesh = null;
        let auxObjects = {
          bagMesh: null,
          tagMeshes: null,
        };

        const menuState = {
          open: false,
          loggedIn: false,
          animation: null,
        };
        const statusState = {
          username: 'username',
          incomingMails: 7,
          outgoingMails: 3,
          worldname: 'Aldous Huxley',
          users: [
            'allie',
            'reede',
            'fay',
            'khromix',
          ],
          numTags: 8,
          numFiles: 2,
        };
        const navbarState = {
          tab: 'status',
        };

        // api functions
        const _initializeMenu = () => {
          if (live) {
            const mainFontSpec = {
              fonts: biolumi.getFonts(),
              fontSize: 72,
              lineHeight: 1.4,
              fontWeight: biolumi.getFontWeight(),
              fontStyle: biolumi.getFontStyle(),
            };
            const itemsFontSpec = {
              fonts: biolumi.getFonts(),
              fontSize: 32,
              lineHeight: 1.4,
              fontWeight: biolumi.getFontWeight(),
              fontStyle: biolumi.getFontStyle(),
            };
            const subcontentFontSpec = {
              fonts: biolumi.getFonts(),
              fontSize: 28,
              lineHeight: 1.4,
              fontWeight: biolumi.getFontWeight(),
              fontStyle: biolumi.getFontStyle(),
            };

            const _requestUis = () => Promise.all([
              biolumi.requestUi({
                width: WIDTH,
                height: HEIGHT,
              }),
              biolumi.requestUi({
                width: NAVBAR_WIDTH,
                height: NAVBAR_HEIGHT,
              }),
            ]).then(([
              menuUi,
              navbarUi,
            ]) => ({
              menuUi,
              navbarUi,
            }));

            return _requestUis()
              .then(({
                menuUi,
                navbarUi,
              }) => {
                if (live) {
                  const {matrix: matrixArray} = hub.getUserState();
                  if (matrixArray) {
                    webvr.setStageMatrix(new THREE.Matrix4().fromArray(matrixArray));
                    webvr.updateStatus();
                  }

                  menuMesh = (() => {
                    const object = new THREE.Object3D();
                    object.position.y = DEFAULT_USER_HEIGHT;
                    object.visible = menuState.open;

                    const statusMesh = (() => {
                      const mesh = menuUi.addPage(({
                        status,
                      }) => [
                        {
                          type: 'html',
                          src: menuRenderer.getStatusSrc({status}),
                          x: 0,
                          y: 0,
                          w: WIDTH,
                          h: HEIGHT,
                        },
                      ], {
                        type: 'status',
                        state: {
                          status: statusState,
                        },
                        worldWidth: WORLD_WIDTH,
                        worldHeight: WORLD_HEIGHT,
                      });
                      mesh.position.z = -1.5;
                      mesh.receiveShadow = true;

                      return mesh;
                    })();
                    object.add(statusMesh);
                    object.statusMesh = statusMesh;

                    object.worldMesh = null;
                    object.universeMesh = null;
                    object.serversMesh = null;
                    object.configMesh = null;
                    object.statsMesh = null;
                    object.trashMesh = null;

                    const navbarMesh = (() => {
                      const mesh = navbarUi.addPage(({
                        navbar: {
                          tab,
                        },
                      }) => ([
                        {
                          type: 'html',
                          src: menuRenderer.getNavbarSrc({tab}),
                          x: 0,
                          y: 0,
                          w: NAVBAR_WIDTH,
                          h: NAVBAR_HEIGHT,
                        },
                      ]), {
                        type: 'navbar',
                        state: {
                          navbar: navbarState,
                        },
                        worldWidth: NAVBAR_WORLD_WIDTH,
                        worldHeight: NAVBAR_WORLD_HEIGHT,
                      });
                      mesh.position.y = (WORLD_HEIGHT / 2) + (NAVBAR_WORLD_HEIGHT / 2);
                      mesh.position.z = -1.5;
                      mesh.receiveShadow = true;

                      return mesh;
                    })();
                    object.add(navbarMesh);
                    object.navbarMesh = navbarMesh;

                    const shadowMesh = (() => {
                      const geometry = new THREE.BoxBufferGeometry(WORLD_WIDTH, WORLD_HEIGHT + NAVBAR_WORLD_HEIGHT, 0.01);
                      const material = transparentMaterial.clone();
                      material.depthWrite = false;

                      const mesh = new THREE.Mesh(geometry, material);
                      mesh.position.y = NAVBAR_WORLD_HEIGHT / 2;
                      mesh.castShadow = true;
                      return mesh;
                    })();
                    object.add(shadowMesh);

                    return object;
                  })();
                  scene.add(menuMesh);

                  const menuDotMeshes = {
                    left: biolumi.makeMenuDotMesh(),
                    right: biolumi.makeMenuDotMesh(),
                  };
                  scene.add(menuDotMeshes.left);
                  scene.add(menuDotMeshes.right);

                  const menuBoxMeshes = {
                    left: biolumi.makeMenuBoxMesh(),
                    right: biolumi.makeMenuBoxMesh(),
                  };
                  scene.add(menuBoxMeshes.left);
                  scene.add(menuBoxMeshes.right);

                  const navbarDotMeshes = {
                    left: biolumi.makeMenuDotMesh(),
                    right: biolumi.makeMenuDotMesh(),
                  };
                  scene.add(navbarDotMeshes.left);
                  scene.add(navbarDotMeshes.right);

                  const navbarBoxMeshes = {
                    left: biolumi.makeMenuBoxMesh(),
                    right: biolumi.makeMenuBoxMesh(),
                  };
                  scene.add(navbarBoxMeshes.left);
                  scene.add(navbarBoxMeshes.right);

                  keyboardMesh = (() => {
                    const object = new THREE.Object3D();
                    object.position.y = DEFAULT_USER_HEIGHT;
                    object.visible = menuState.open;

                    const planeMesh = (() => {
                      const _requestKeyboardImage = () => new Promise((accept, reject) => {
                        const img = new Image();
                        img.src = keyboardImgSrc;
                        img.onload = () => {
                          accept(img);
                        };
                        img.onerror = err => {
                          reject(err);
                        };
                      });

                      const geometry = new THREE.PlaneBufferGeometry(KEYBOARD_WORLD_WIDTH, KEYBOARD_WORLD_HEIGHT);
                      const material = (() => {
                        const texture = new THREE.Texture(
                          transparentImg,
                          THREE.UVMapping,
                          THREE.ClampToEdgeWrapping,
                          THREE.ClampToEdgeWrapping,
                          THREE.LinearFilter,
                          THREE.LinearFilter,
                          THREE.RGBAFormat,
                          THREE.UnsignedByteType,
                          16
                        );

                        _requestKeyboardImage()
                          .then(img => {
                            texture.image = img;
                            texture.needsUpdate = true;
                          })
                          .catch(err => {
                            console.warn(err);
                          });

                        const material = new THREE.MeshBasicMaterial({
                          map: texture,
                          side: THREE.DoubleSide,
                          transparent: true,
                          alphaTest: 0.5,
                        });
                        return material;
                      })();
                      const mesh = new THREE.Mesh(geometry, material);
                      mesh.position.y = 1 - DEFAULT_USER_HEIGHT;
                      mesh.position.z = -0.4;
                      mesh.rotation.x = -Math.PI * (3 / 8);

                      const shadowMesh = (() => {
                        const geometry = new THREE.BoxBufferGeometry(KEYBOARD_WORLD_WIDTH, KEYBOARD_WORLD_HEIGHT, 0.01);
                        const material = transparentMaterial;
                        const mesh = new THREE.Mesh(geometry, material);
                        mesh.castShadow = true;
                        return mesh;
                      })();
                      mesh.add(shadowMesh);

                      return mesh;
                    })();
                    object.add(planeMesh);
                    object.planeMesh = planeMesh;

                    const keySpecs = (() => {
                      class KeySpec {
                        constructor(key, rect) {
                          this.key = key;
                          this.rect = rect;

                          this.anchorBoxTarget = null;
                        }
                      }

                      const div = document.createElement('div');
                      div.style.cssText = 'position: absolute; top: 0; left: 0; width: ' + KEYBOARD_WIDTH + 'px; height: ' + KEYBOARD_HEIGHT + 'px;';
                      div.innerHTML = keyboardImg;

                      document.body.appendChild(div);

                      const keyEls = div.querySelectorAll(':scope > svg > g[key]');
                      const result = Array(keyEls.length);
                      for (let i = 0; i < keyEls.length; i++) {
                        const keyEl = keyEls[i];
                        const key = keyEl.getAttribute('key');
                        const rect = keyEl.getBoundingClientRect();

                        const keySpec = new KeySpec(key, rect);
                        result[i] = keySpec;
                      }

                      document.body.removeChild(div);

                      return result;
                    })();
                    object.keySpecs = keySpecs;

                    const _updateKeySpecAnchorBoxTargets = () => {
                      object.updateMatrixWorld();
                      const {position: keyboardPosition, rotation: keyboardRotation} = _decomposeObjectMatrixWorld(planeMesh);

                      for (let i = 0; i < keySpecs.length; i++) {
                        const keySpec = keySpecs[i];
                        const {key, rect} = keySpec;

                        const anchorBoxTarget = geometryUtils.makeBoxTargetOffset(
                          keyboardPosition,
                          keyboardRotation,
                          oneVector,
                          new THREE.Vector3(
                            -(KEYBOARD_WORLD_WIDTH / 2) + (rect.left / KEYBOARD_WIDTH) * KEYBOARD_WORLD_WIDTH,
                            (KEYBOARD_WORLD_HEIGHT / 2) + (-rect.top / KEYBOARD_HEIGHT) * KEYBOARD_WORLD_HEIGHT,
                            -WORLD_DEPTH
                          ),
                          new THREE.Vector3(
                            -(KEYBOARD_WORLD_WIDTH / 2) + (rect.right / KEYBOARD_WIDTH) * KEYBOARD_WORLD_WIDTH,
                            (KEYBOARD_WORLD_HEIGHT / 2) + (-rect.bottom / KEYBOARD_HEIGHT) * KEYBOARD_WORLD_HEIGHT,
                            WORLD_DEPTH
                          )
                        );
                        keySpec.anchorBoxTarget = anchorBoxTarget;
                      }
                    };
                    _updateKeySpecAnchorBoxTargets();
                    object.updateKeySpecAnchorBoxTargets = _updateKeySpecAnchorBoxTargets;

                    return object;
                  })();
                  scene.add(keyboardMesh);

                  const keyboardBoxMeshes = {
                    left: biolumi.makeMenuBoxMesh(),
                    right: biolumi.makeMenuBoxMesh(),
                  };
                  scene.add(keyboardBoxMeshes.left);
                  scene.add(keyboardBoxMeshes.right);

                  const _updatePages = () => {
                    menuUi.update();
                    navbarUi.update();
                  };
                  _updatePages();

                  const trigger = e => {
                    const {open} = menuState;

                    if (open) {
                      const {side} = e;

                      const _doClickNavbar = () => {
                        const navbarHoverState = navbarHoverStates[side];
                        const {anchor} = navbarHoverState;
                        const onclick = (anchor && anchor.onclick) || '';

                        let match;
                        if (match = onclick.match(/^navbar:(status|world|mail|inventory|worlds|servers|options)$/)) {
                          const newTab = match[1];

                          const _getTabMesh = tab => {
                            switch (tab) {
                              case 'status': return menuMesh.statusMesh;
                              case 'world': return menuMesh.worldMesh;
                              case 'mail': return menuMesh.mailMesh;
                              case 'worlds': return menuMesh.universeMesh;
                              case 'servers': return menuMesh.serversMesh;
                              case 'options': return menuMesh.configMesh;
                              default: return null;
                            }
                          };

                          const {tab: oldTab} = navbarState;
                          const oldMesh = _getTabMesh(oldTab);
                          const newMesh = _getTabMesh(newTab);

                          oldMesh.visible = false;
                          newMesh.visible = true;

                          navbarState.tab = newTab;

                          _updatePages();

                          api.emit('tabchange', newTab);

                          return true;
                        } else {
                          return false;
                        }
                      };
                      const _doClickMenu = () => {
                        const menuHoverState = menuHoverStates[side];
                        const {anchor} = menuHoverState;
                        const onclick = (anchor && anchor.onclick) || '';

                        if (onclick === 'status:downloadLoginToken') {
                          const a = document.createElement('a');
                          a.href = '/server/token';
                          a.download = 'token.txt';
                          a.style.display = 'none';
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);

                          return true;
                        } else {
                          return false;
                        }
                      };

                      _doClickNavbar();
                      _doClickMenu();
                    }
                  };
                  input.on('trigger', trigger);
                  const menudown = () => {
                    const {loggedIn} = menuState;

                    if (loggedIn) {
                      const {open, animation} = menuState;

                      if (open) {
                        menuState.open = false; // XXX need to cancel other menu states as well
                        menuState.animation = anima.makeAnimation(TRANSITION_TIME);

                        SIDES.forEach(side => {
                          menuBoxMeshes[side].visible = false;
                          menuDotMeshes[side].visible = false;

                          navbarBoxMeshes[side].visible = false;
                          navbarDotMeshes[side].visible = false;
                        });
                      } else {
                        menuState.open = true;
                        menuState.animation = anima.makeAnimation(TRANSITION_TIME);

                        const newPosition = camera.position;
                        const newRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(
                          0,
                          camera.rotation.y,
                          0,
                          camera.rotation.order
                        ));

                        menuMesh.position.copy(newPosition);
                        menuMesh.quaternion.copy(newRotation);

                        keyboardMesh.position.copy(newPosition);
                        keyboardMesh.quaternion.copy(newRotation);

                        keyboardMesh.updateKeySpecAnchorBoxTargets();
                      }
                    }
                  };
                  input.on('menudown', menudown);

                  cleanups.push(() => {
                    scene.remove(menuMesh);
                    scene.remove(keyboardMesh);

                    SIDES.forEach(side => {
                      scene.remove(menuDotMeshes[side]);
                      scene.remove(menuBoxMeshes[side]);

                      scene.remove(navbarDotMeshes[side]);
                      scene.remove(navbarBoxMeshes[side]);

                      scene.remove(keyboardBoxMeshes[side]);
                    });

                    input.removeListener('trigger', trigger);
                    input.removeListener('menudown', menudown);
                  });

                  const menuHoverStates = {
                    left: biolumi.makeMenuHoverState(),
                    right: biolumi.makeMenuHoverState(),
                  };
                  const navbarHoverStates = {
                    left: biolumi.makeMenuHoverState(),
                    right: biolumi.makeMenuHoverState(),
                  };

                  const _makeKeyboardHoverState = () => ({
                    key: null,
                  });
                  const keyboardHoverStates = {
                    left: _makeKeyboardHoverState(),
                    right: _makeKeyboardHoverState(),
                  };

                  localUpdates.push(() => {
                    const _updateMeshAnimations = () => {
                      const {animation} = menuState;

                      if (animation) {
                        const {open} = menuState;

                        const startValue = open ? 0 : 1;
                        const endValue = 1 - startValue;
                        const factor = animation.getValue();
                        const value = ((1 - factor) * startValue) + (factor * endValue);

                        const {bagMesh: {headMesh, bodyMesh, armMeshes}, tagMeshes} = auxObjects;
                        const animatedMeshSpecs = [
                          {
                            mesh: menuMesh,
                            direction: 'y',
                          },
                          {
                            mesh: keyboardMesh,
                            direction: 'x',
                          },
                          {
                            mesh: headMesh,
                            direction: 'x',
                          },
                          {
                            mesh: bodyMesh,
                            direction: 'x',
                          },
                        ]
                          .concat(armMeshes.map(armMesh => ({
                            mesh: armMesh,
                            direction: 'x',
                          })))
                          .concat(tagMeshes.map(tagMesh => ({
                            mesh: tagMesh,
                            direction: 'y',
                          })));

                        if (factor < 1) {
                          if (value > 0.001) {
                            animatedMeshSpecs.forEach(meshSpec => {
                              const {direction, mesh} = meshSpec;
                              const {initialScale = oneVector} = mesh;

                              switch (direction) {
                                case 'x':
                                  mesh.scale.set(value * initialScale.x, initialScale.y, initialScale.z);
                                  break;
                                case 'y':
                                  mesh.scale.set(initialScale.x, value * initialScale.y, initialScale.z);
                                  break;
                                case 'z':
                                  mesh.scale.set(initialScale.x, initialScale.y, value * initialScale.z);
                                  break;
                              }

                              if (!mesh.visible) {
                                mesh.visible = true;
                              }
                            });
                          } else {
                            animatedMeshSpecs.forEach(meshSpec => {
                              const {mesh} = meshSpec;

                              mesh.visible = false;
                            });
                          }
                        } else {
                          animatedMeshSpecs.forEach(meshSpec => {
                            const {mesh} = meshSpec;
                            const {initialScale = oneVector} = mesh;

                            mesh.scale.copy(initialScale);

                            if (open && !mesh.visible) {
                              mesh.visible = true;
                            } else if (!open && mesh.visible) {
                              mesh.visible = false;
                            }
                          });

                          menuState.animation = null;
                        }
                      }
                    };
                    const _updateRenderer = () => {
                      renderer.shadowMap.needsUpdate = true;
                    };
                    const _updateUiTimer = () => {
                      biolumi.updateUiTimer();
                    };
                    _updateMeshAnimations();
                    _updateRenderer();
                    _updateUiTimer();

                    const {open} = menuState;

                    if (open) {
                      const _updateAnchors = () => {
                        const status = webvr.getStatus();
                        const {gamepads} = status;

                        const {statusMesh, navbarMesh} = menuMesh;
                        const menuMatrixObject = _decomposeObjectMatrixWorld(statusMesh);
                        const {page: statusPage} = statusMesh;
                        const navbarMatrixObject = _decomposeObjectMatrixWorld(navbarMesh);
                        const {page: navbarPage} = navbarMesh;

                        SIDES.forEach(side => {
                          const gamepad = gamepads[side];

                          if (gamepad) {
                            const {position: controllerPosition, rotation: controllerRotation} = gamepad;

                            const menuHoverState = menuHoverStates[side];
                            const menuDotMesh = menuDotMeshes[side];
                            const menuBoxMesh = menuBoxMeshes[side];

                            const navbarHoverState = navbarHoverStates[side];
                            const navbarDotMesh = navbarDotMeshes[side];
                            const navbarBoxMesh = navbarBoxMeshes[side];

                            const keyboardHoverState = keyboardHoverStates[side];
                            const keyboardBoxMesh = keyboardBoxMeshes[side];

                            const _updateMenuAnchors = () => {
                              const {tab} = navbarState;

                              if (tab === 'status') {
                                biolumi.updateAnchors({
                                  objects: [{
                                    matrixObject: menuMatrixObject,
                                    page: statusPage,
                                    width: WIDTH,
                                    height: HEIGHT,
                                    worldWidth: WORLD_WIDTH,
                                    worldHeight: WORLD_HEIGHT,
                                    worldDepth: WORLD_DEPTH,
                                  }],
                                  hoverState: menuHoverState,
                                  dotMesh: menuDotMesh,
                                  boxMesh: menuBoxMesh,
                                  controllerPosition,
                                  controllerRotation,
                                });
                              }

                              biolumi.updateAnchors({
                                objects: [{
                                  matrixObject: navbarMatrixObject,
                                  page: navbarPage,
                                  width: NAVBAR_WIDTH,
                                  height: NAVBAR_HEIGHT,
                                  worldWidth: NAVBAR_WORLD_WIDTH,
                                  worldHeight: NAVBAR_WORLD_HEIGHT,
                                  worldDepth: NAVBAR_WORLD_DEPTH,
                                }],
                                hoverState: navbarHoverState,
                                dotMesh: navbarDotMesh,
                                boxMesh: navbarBoxMesh,
                                controllerPosition,
                                controllerRotation,
                              });
                            };
                            const _updateKeyboardAnchors = () => {
                              // NOTE: there should be at most one intersecting anchor box since keys do not overlap
                              const {keySpecs} = keyboardMesh;
                              const newKeySpec = keySpecs.find(keySpec => keySpec.anchorBoxTarget.containsPoint(controllerPosition));

                              const {key: oldKey} = keyboardHoverState;
                              const newKey = newKeySpec ? newKeySpec.key : null;
                              keyboardHoverState.key = newKey;

                              if (oldKey && newKey !== oldKey) {
                                const key = oldKey;
                                const keyCode = biolumi.getKeyCode(key);

                                input.triggerEvent('keyboardup', {
                                  key,
                                  keyCode,
                                  side,
                                });
                              }
                              if (newKey && newKey !== oldKey) {
                                const key = newKey;
                                const keyCode = biolumi.getKeyCode(key);

                                input.triggerEvent('keyboarddown', {
                                  key,
                                  keyCode,
                                  side,
                                });
                                input.triggerEvent('keyboardpress', {
                                  key,
                                  keyCode,
                                  side,
                                });
                              }

                              if (newKeySpec) {
                                const {anchorBoxTarget} = newKeySpec;

                                keyboardBoxMesh.position.copy(anchorBoxTarget.position);
                                keyboardBoxMesh.quaternion.copy(anchorBoxTarget.quaternion);
                                keyboardBoxMesh.scale.copy(anchorBoxTarget.size);

                                if (!keyboardBoxMesh.visible) {
                                  keyboardBoxMesh.visible = true;
                                }
                              } else {
                                if (keyboardBoxMesh.visible) {
                                  keyboardBoxMesh.visible = false;
                                }
                              }
                            };

                            _updateMenuAnchors();
                            _updateKeyboardAnchors();
                          }
                        });
                      };
                      _updateAnchors();
                    }
                  });

                  menu = {
                    updatePages: _updatePages,
                  };

                  const unload = e => {
                    hub.saveUserStateAsync();
                  };
                  window.addEventListener('unload', unload);
                  cleanups.push(() => {
                    window.removeEventListener('unload', unload);
                  });
                }
              });
          }
        };

        return _initializeMenu()
          .then(() => {
            class RendApi extends EventEmitter {
              constructor() {
                super();

                this.setMaxListeners(100);
              }

              isOpen() {
                return menuState.open;
              }

              getTab() {
                return navbarState.tab;
              }

              getMenuMesh() {
                return menuMesh;
              }

              registerMenuMesh(name, object) {
                menuMesh.add(object);
                menuMesh[name] = object;
              }

              registerAuxObject(name, object) {
                auxObjects[name] = object;
              }

              update() { // XXX move this
                this.emit('update');
              }

              updateEye(camera) {
                this.emit('updateEye', camera);
              }

              updateStart() {
                this.emit('updateStart');
              }

              updateEnd() {
                this.emit('updateEnd');
              }

              registerElement(pluginInstance, elementApi) {
                const tag = archae.getName(pluginInstance);

                _addModApiElement(tag, elementApi);
              }

              unregisterElement(pluginInstance) {
                const tag = archae.getName(pluginInstance);

                _removeModApiElement(tag);
              }

              login() {
                menuState.open = true;
                menuState.loggedIn = true;

                statusState.username = auxObjects.login.getUsername();

                menu.updatePages();

                menuMesh.visible = true;
                keyboardMesh.visible = true;

                this.emit('login');
              }

              logout() {
                menuState.open = false;
                menuState.loggedIn = false;

                menu.updatePages();

                menuMesh.visible = false;
                keyboardMesh.visible = false;

                this.emit('logout');
              }

              connectServer() {
                this.emit('connectServer');
              }

              disconnectServer() {
                this.emit('disconnectServer');
              }
            }
            api = new RendApi();
            api.on('update', () => {
              for (let i = 0; i < localUpdates.length; i++) {
                const localUpdate = localUpdates[i];
                localUpdate();
              }
            });

            return api;
          });
      }
    });
  }

  unmount() {
    this._cleanup();
  }
}

module.exports = Rend;
