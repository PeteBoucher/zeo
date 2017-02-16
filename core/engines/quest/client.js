import {
  WIDTH,
  HEIGHT,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  WORLD_DEPTH,

  QUEST_WIDTH,
  QUEST_HEIGHT,
  QUEST_WORLD_WIDTH,
  QUEST_WORLD_HEIGHT,
  QUEST_WORLD_DEPTH,
} from './lib/constants/quest';
import questRender from './lib/render/quest';
import menuUtils from './lib/utils/menu';

const SIDES = ['left', 'right'];

const DEFAULT_GRAB_RADIUS = 0.2;
const DEFAULT_QUEST_MATRIX = [
  0, 0, 0,
  0, 0, 0, 1,
  1, 1, 1,
];

const questFlagSymbol = Symbol();

class Quest {
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
      '/core/engines/three',
      '/core/engines/input',
      '/core/engines/webvr',
      '/core/engines/biolumi',
      '/core/engines/rend',
      '/core/engines/hands',
      '/core/plugins/creature-utils',
    ])
      .then(([
        three,
        input,
        webvr,
        biolumi,
        rend,
        hands,
        creatureUtils,
      ]) => {
        if (live) {
          const {THREE, scene, camera} = three;

          const transparentMaterial = biolumi.getTransparentMaterial();
          const solidMaterial = biolumi.getSolidMaterial();

          const questRenderer = questRender.makeRenderer({creatureUtils});

          const _decomposeObjectMatrixWorld = object => _decomposeMatrix(object.matrixWorld);
          const _decomposeMatrix = matrix => {
            const position = new THREE.Vector3();
            const rotation = new THREE.Quaternion();
            const scale = new THREE.Vector3();
            matrix.decompose(position, rotation, scale);
            return {position, rotation, scale};
          };

          const wireframeMaterial = new THREE.MeshBasicMaterial({
            color: 0x0000FF,
            wireframe: true,
            opacity: 0.5,
            transparent: true,
          });

          const _requestUis = () => Promise.all([
            biolumi.requestUi({
              width: WIDTH,
              height: HEIGHT,
            }),
          ])
            .then(([
              menuUi,
            ]) => ({
              menuUi,
            }));

          return _requestUis()
            .then(({
              menuUi
            }) => {
              if (live) {
                const menuHoverStates = {
                  left: biolumi.makeMenuHoverState(),
                  right: biolumi.makeMenuHoverState(),
                };
                const dotMeshes = {
                  left: biolumi.makeMenuDotMesh(),
                  right: biolumi.makeMenuDotMesh(),
                };
                scene.add(dotMeshes.left);
                scene.add(dotMeshes.right);
                const boxMeshes = {
                  left: biolumi.makeMenuBoxMesh(),
                  right: biolumi.makeMenuBoxMesh(),
                };
                scene.add(boxMeshes.left);
                scene.add(boxMeshes.right);

                const questHoverStates = {
                  left: biolumi.makeMenuHoverState(),
                  right: biolumi.makeMenuHoverState(),
                };
                const questDotMeshes = {
                  left: biolumi.makeMenuDotMesh(),
                  right: biolumi.makeMenuDotMesh(),
                };
                scene.add(questDotMeshes.left);
                scene.add(questDotMeshes.right);
                const questBoxMeshes = {
                  left: biolumi.makeMenuBoxMesh(),
                  right: biolumi.makeMenuBoxMesh(),
                };
                scene.add(questBoxMeshes.left);
                scene.add(questBoxMeshes.right);

                const _makeGrabState = () => ({
                  grabber: null,
                });
                const grabStates = {
                  left: _makeGrabState(),
                  right: _makeGrabState(),
                };

                const _makeGrabBoxMesh = () => {
                  const width = QUEST_WORLD_WIDTH;
                  const height = QUEST_WORLD_HEIGHT;
                  const depth = QUEST_WORLD_DEPTH;

                  const geometry = new THREE.BoxBufferGeometry(width, height, depth);
                  const material = wireframeMaterial;

                  const mesh = new THREE.Mesh(geometry, material);
                  mesh.position.y = 1.2;
                  mesh.rotation.order = camera.rotation.order;
                  mesh.rotation.y = Math.PI / 2;
                  mesh.depthWrite = false;
                  mesh.visible = false;
                  return mesh;
                };
                const grabBoxMeshes = {
                  left: _makeGrabBoxMesh(),
                  right: _makeGrabBoxMesh(),
                };
                scene.add(grabBoxMeshes.left);
                scene.add(grabBoxMeshes.right);

                const mailState = {
                  page: 'threads',
                };
                const focusState = {
                  type: '',
                };

                menuUi.pushPage(({mail, focus: {type}}) => {
                  return [
                    {
                      type: 'html',
                      src: questRenderer.getMailPageSrc(mail),
                      x: 0,
                      y: 0,
                      w: WIDTH,
                      h: HEIGHT,
                      scroll: true,
                    },
                  ];
                }, {
                  type: 'main',
                  state: {
                    mail: mailState,
                    focus: focusState,
                  },
                  immediate: true,
                });

                const menuMesh = (() => {
                  const width = WORLD_WIDTH;
                  const height = WORLD_HEIGHT;
                  const depth = WORLD_DEPTH;

                  const menuMaterial = biolumi.makeMenuMaterial();

                  const geometry = new THREE.PlaneBufferGeometry(width, height);
                  const materials = [solidMaterial, menuMaterial];

                  const mesh = THREE.SceneUtils.createMultiMaterialObject(geometry, materials);
                  mesh.position.z = -1;
                  mesh.visible = false;
                  mesh.receiveShadow = true;
                  mesh.menuMaterial = menuMaterial;

                  const shadowMesh = (() => {
                    const geometry = new THREE.BoxBufferGeometry(width, height, 0.01);
                    const material = transparentMaterial;
                    const mesh = new THREE.Mesh(geometry, material);
                    mesh.castShadow = true;
                    return mesh;
                  })();
                  mesh.add(shadowMesh);

                  return mesh;
                })();
                rend.addMenuMesh('questMesh', menuMesh);

                const _updatePages = menuUtils.debounce(next => {
                  const pageSpecs = (() => {
                    const result = [];

                    const menuPages = menuUi.getPages();
                    for (let i = 0; i < menuPages.length; i++) {
                      const menuPage = menuPages[i];
                      result.push({
                        page: menuPage,
                      });
                    }

                    for (let i = 0; i < questMeshes.length; i++) {
                      const questMesh = questMeshes[i];
                      const {ui, quest} = questMeshes;

                      if (ui) {
                        const pages = ui.getPages();

                        for (let j = 0; j < pages.length; j++) {
                          const page = pages[j];
                          const pageSpec = {
                            page,
                            quest,
                          };
                          result.push(pageSpec);
                        }
                      }
                    }

                    return result;
                  })();

                  if (pageSpecs.length > 0) {
                    let pending = pageSpecs.length;
                    const pend = () => {
                      if (--pending === 0) {
                        next();
                      }
                    };

                    for (let i = 0; i < pageSpecs.length; i++) {
                      const pageSpec = pageSpecs[i];
                      const {page} = pageSpec;
                      const {type} = page;

                      if (type === 'main') {
                        page.update({
                          mail: mailState,
                          focus: focusState,
                        }, pend);
                      } else if (type === 'quest') {
                        const {quest} = pageSpec;

                        page.update({
                          quest,
                        }, pend);
                      } else {
                        pend();
                      }
                    }
                  } else {
                    next();
                  }
                });

                const _trigger = e => {
                  const {side} = e;

                  const menuHoverState = menuHoverStates[side];
                  const {anchor} = menuHoverState;
                  const onclick = (anchor && anchor.onclick) || '';

                  let match;
                  if (onclick === 'mail:threads') {
                    mailState.page = 'threads';

                    _updatePages();
                  } else if (onclick === 'mail:users') {
                    mailState.page = 'users';

                    _updatePages();
                  } else if (onclick === 'mail:notifications') {
                    mailState.page = 'notifications';

                    _updatePages();
                  } else if (onclick === 'mail:newThread') {
                    mailState.page = 'newThread';

                    _updatePages();
                  } else if (match = onclick.match(/^mail:thread:([0-9]+)$/)) {
                    // const threadIndex = match[1];

                    mailState.page = 'thread';

                    _updatePages();
                  }
                };
                input.on('trigger', _trigger);
                const _gripdown = e => {
                  const {side} = e;

                  const bestGrabbableQuestMesh = hands.getBestGrabbable(side, questMeshes, {radius: DEFAULT_GRAB_RADIUS});
                  if (bestGrabbableQuestMesh) {
                    questInstance.grabQuest(side, bestGrabbableQuestMesh);
                  }
                };
                input.on('gripdown', _gripdown);
                const _gripup = e => {
                  const {side} = e;
                  const grabState = grabStates[side];
                  const {grabber} = grabState;

                  if (grabber) {
                    grabber.release();
                  }
                };
                input.on('gripup', _gripup);
                const _update = () => {
                  const _updateMenuTextures = () => {
                    const tab = rend.getTab();

                    if (tab === 'quests') {
                      const {
                        menuMaterial,
                      } = menuMesh;
                      const uiTime = rend.getUiTime();

                      biolumi.updateMenuMaterial({
                        ui: menuUi,
                        menuMaterial,
                        uiTime,
                      });
                    }
                  };
                  const _updateQuestTextures = () => {
                    const uiTime = rend.getUiTime();

                    for (let i = 0; i < questMeshes.length; i++) {
                      const questMesh = questMeshes[i];
                      const {
                        ui,
                        planeMesh,
                      } = questMesh;

                      if (ui && planeMesh) {
                        const {menuMaterial} = planeMesh;

                        biolumi.updateMenuMaterial({
                          ui,
                          menuMaterial,
                          uiTime,
                        });
                      }
                    }
                  };
                  const _updateGrabbers = () => {
                    SIDES.forEach(side => {
                      const grabState = grabStates[side];
                      const grabBoxMesh = grabBoxMeshes[side];

                      const bestGrabbableQuestMesh = hands.getBestGrabbable(side, questMeshes, {radius: DEFAULT_GRAB_RADIUS});
                      if (bestGrabbableQuestMesh) {
                        const {position: questMeshPosition, rotation: questMeshRotation} = _decomposeObjectMatrixWorld(bestGrabbableQuestMesh);
                        grabBoxMesh.position.copy(questMeshPosition);
                        grabBoxMesh.quaternion.copy(questMeshRotation);

                        if (!grabBoxMesh.visible) {
                          grabBoxMesh.visible = true;
                        }
                      } else {
                        if (grabBoxMesh.visible) {
                          grabBoxMesh.visible = false;
                        }
                      }
                    });
                  };
                  const _updateMenuAnchors = () => {
                    const tab = rend.getTab();

                    if (tab === 'quests') {
                      const {gamepads} = webvr.getStatus();
                      const menuMatrixObject = _decomposeObjectMatrixWorld(menuMesh);

                      SIDES.forEach(side => {
                        const gamepad = gamepads[side];

                        if (gamepad) {
                          const {position: controllerPosition, rotation: controllerRotation} = gamepad;

                          const menuHoverState = menuHoverStates[side];
                          const dotMesh = dotMeshes[side];
                          const boxMesh = boxMeshes[side];

                          biolumi.updateAnchors({
                            objects: [{
                              matrixObject: menuMatrixObject,
                              ui: menuUi,
                              width: WIDTH,
                              height: HEIGHT,
                              worldWidth: WORLD_WIDTH,
                              worldHeight: WORLD_HEIGHT,
                              worldDepth: WORLD_DEPTH,
                            }],
                            hoverState: menuHoverState,
                            dotMesh: dotMesh,
                            boxMesh: boxMesh,
                            controllerPosition,
                            controllerRotation,
                          });
                        }
                      });
                    }
                  };
                  const _updateQuestAnchors = () => {
                    const {gamepads} = webvr.getStatus();

                    SIDES.forEach(side => {
                      const gamepad = gamepads[side];

                      if (gamepad) {
                        const {position: controllerPosition, rotation: controllerRotation} = gamepad;
                        const questHoverState = questHoverStates[side];
                        const questDotMesh = questDotMeshes[side];
                        const questBoxMesh = questBoxMeshes[side];

                        biolumi.updateAnchors({
                          objects: questMeshes.map(questMesh => {
                            const {ui, planeMesh} = questMesh;

                            if (ui && planeMesh) {
                              const matrixObject = _decomposeObjectMatrixWorld(planeMesh);

                              return {
                                matrixObject: matrixObject,
                                ui: ui,
                                width: QUEST_WIDTH,
                                height: QUEST_HEIGHT,
                                worldWidth: QUEST_WORLD_WIDTH,
                                worldHeight: QUEST_WORLD_HEIGHT,
                                worldDepth: QUEST_WORLD_DEPTH,
                              };
                            } else {
                              return null;
                            }
                          }).filter(object => object !== null),
                          hoverState: questHoverState,
                          dotMesh: questDotMesh,
                          boxMesh: questBoxMesh,
                          controllerPosition,
                          controllerRotation,
                        });
                      }
                    });
                  };

                  _updateMenuTextures();
                  _updateQuestTextures();
                  _updateGrabbers();
                  _updateMenuAnchors();
                  _updateQuestAnchors();
                };
                rend.on('update', _update);

                this._cleanup = () => {
                  rend.removeMenuMesh('questMesh');

                  for (let i = 0; i < questMeshes.length; i++) {
                    const questMesh = questMeshes[i];
                    questMesh.parent.remove(questMesh);
                  }

                  SIDES.forEach(side => {
                    scene.remove(dotMeshes[side]);
                    scene.remove(boxMeshes[side]);
                    scene.remove(questDotMesh[side]);
                    scene.remove(questBoxMesh[side]);
                    scene.remove(grabBoxMesh[side]);
                  });

                  input.removeListener('trigger', _trigger);
                  input.removeListener('gripdown', _gripdown);
                  input.removeListener('gripup', _gripup);
                  rend.removeListener('update', _update);
                };

                class Quest {
                  constructor(id, name, author, created, matrix) {
                    this.id = id;
                    this.name = name;
                    this.author = author;
                    this.created = created;
                    this.matrix = matrix;
                  }
                }

                const questMeshes = [];
                class QuestApi {
                  makeQuest(questSpec) {
                    const object = new THREE.Object3D();
                    object[questFlagSymbol] = true;

                    const quest = new Quest(questSpec.id, questSpec.name, questSpec.author, questSpec.created, questSpec.matrix);
                    object.quest = quest;

                    object.position.set(quest.matrix[0], quest.matrix[1], quest.matrix[2]);
                    object.quaternion.set(quest.matrix[3], quest.matrix[4], quest.matrix[5], quest.matrix[6]);
                    object.scale.set(quest.matrix[7], quest.matrix[8], quest.matrix[9]);

                    object.ui = null;
                    object.planeMesh = null;

                    this._requestDecorateQuest(object);

                    questMeshes.push(object);

                    return object;
                  }

                  _requestDecorateQuest(object) {
                    return biolumi.requestUi({
                      width: QUEST_WIDTH,
                      height: QUEST_HEIGHT,
                    })
                      .then(ui => {
                        const {quest} = object;

                        ui.pushPage(({quest}) => ([
                          {
                            type: 'html',
                            src: questRenderer.getQuestSrc(quest),
                          },
                          /* {
                            type: 'image',
                            img: creatureUtils.makeAnimatedCreature('quest:' + quest.name),
                            x: 10,
                            y: 0,
                            w: 100,
                            h: 100,
                            frameTime: 300,
                            pixelated: true,
                          } */
                        ]), {
                          type: 'quest',
                          state: {
                            quest,
                          },
                          immediate: true,
                        });
                        object.ui = ui;

                        _updatePages();

                        const planeMesh = (() => {
                          const width = QUEST_WORLD_WIDTH;
                          const height = QUEST_WORLD_HEIGHT;
                          const depth = QUEST_WORLD_DEPTH;

                          const menuMaterial = biolumi.makeMenuMaterial();

                          const geometry = new THREE.PlaneBufferGeometry(width, height);
                          const materials = [solidMaterial, menuMaterial];

                          const mesh = THREE.SceneUtils.createMultiMaterialObject(geometry, materials)
                          // mesh.position.y = 1.5;
                          mesh.receiveShadow = true;
                          mesh.menuMaterial = menuMaterial;

                          return mesh;
                        })();
                        object.add(planeMesh);
                        object.planeMesh = planeMesh;

                        const shadowMesh = (() => {
                          const geometry = new THREE.BoxBufferGeometry(QUEST_WORLD_WIDTH, QUEST_WORLD_HEIGHT, 0.01);
                          const material = transparentMaterial.clone();
                          material.depthWrite = false;

                          const mesh = new THREE.Mesh(geometry, material);
                          mesh.castShadow = true;
                          return mesh;
                        })();
                        object.add(shadowMesh);
                      });
                  };

                  destroyQuest(questMesh) {
                    const index = questMeshes.indexOf(questMesh);

                    if (index !== -1) {
                      questMeshes.splice(index, 1);
                    }
                  }

                  isQuest(object) {
                    return object[questFlagSymbol] === true;
                  }

                  grabQuest(side, questMesh) {
                    const menuMesh = rend.getMenuMesh();
                    menuMesh.add(questMesh);

                    const {quest} = questMesh;
                    quest.matrix = DEFAULT_QUEST_MATRIX;

                    const grabber = hands.grab(side, questMesh);
                    grabber.on('update', ({position, rotation}) => {
                      const menuMeshMatrixInverse = new THREE.Matrix4().getInverse(menuMesh.matrix);
                      const menuMeshQuaternionInverse = menuMesh.quaternion.clone().inverse();

                      const newRotation = menuMeshQuaternionInverse.clone()
                        .multiply(rotation)
                        .multiply(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1)));
                      const newPosition = position.clone().applyMatrix4(menuMeshMatrixInverse)
                        .add(
                          new THREE.Vector3(0, 0.02, 0).applyQuaternion(newRotation)
                        );

                      questMesh.position.copy(newPosition);
                      questMesh.quaternion.copy(newRotation);
                    });
                    grabber.on('release', () => {
                      const {position, quaternion, quest} = questMesh;
                      const newMatrixArray = position.toArray().concat(quaternion.toArray()).concat(new THREE.Vector3(1, 1, 1).toArray());
                      quest.matrix = newMatrixArray;

                      grabState.grabber = null;
                    });

                    const grabState = grabStates[side];
                    grabState.grabber = grabber;
                  }
                };

                const questInstance = new QuestApi();
                return questInstance;
              }
            });
        }
      });
  }

  unmount() {
    this._cleanup();
  }
}

const _clone = o => JSON.parse(JSON.stringify(o));

module.exports = Quest;
