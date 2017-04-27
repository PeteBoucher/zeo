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
import menuUtils from './lib/utils/menu';
import menuRender from './lib/render/menu';

const SIDES = ['left', 'right'];

class Rend {
  constructor(archae) {
    this._archae = archae;
  }

  mount() {
    const {_archae: archae} = this;
    const {metadata: {home: {enabled: homeEnabled}, server: {worldname: serverWorldname, enabled: serverEnabled}, hub: {url: hubUrl}}} = archae;

    const cleanups = [];
    this._cleanup = () => {
      const oldCleanups = cleanups.slice();
      for (let i = 0; i < oldCleanups.length; i++) {
        const cleanup = oldCleanups[i];
        cleanup();
      }
    };

    let live = true;
    cleanups.push(() => {
      live = false;
    });

    return archae.requestPlugins([
      '/core/engines/bootstrap',
      '/core/engines/input',
      '/core/engines/three',
      '/core/engines/webvr',
      '/core/engines/biolumi',
      '/core/engines/anima',
      '/core/utils/js-utils',
      '/core/utils/geometry-utils',
      '/core/utils/creature-utils',
    ]).then(([
      bootstrap,
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

        const _parseUrlSpec = url => {
          const match = url.match(/^(?:([^:]+):\/\/)([^:]+)(?::([0-9]*?))?$/);
          return match && {
            protocol: match[1],
            host: match[2],
            port: match[3] ? parseInt(match[3], 10) : null,
          };
        };
        const hubSpec = _parseUrlSpec(hubUrl);

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

        const uiTracker = biolumi.makeUiTracker();
        const {dotMeshes, boxMeshes} = uiTracker;
        SIDES.forEach(side => {
          scene.add(dotMeshes[side]);
          scene.add(boxMeshes[side]);
        });

        const localUpdates = [];

        const auxObjects = {
          tagMeshes: null,
          tagsLinesMesh: null,
          controllerMeshes: null,
        };

        const menuState = {
          open: serverEnabled,
          position: null,
          rotation: null,
          loggedIn: false,
          animation: null,
        };
        const statusState = {
          url: bootstrap.getInitialPath(),
          username: null,
          worldname: serverWorldname,
          users: [],
          authToken: '',
          hasHub: Boolean(hubSpec),
        };
        const navbarState = {
          tab: 'status',
        };

        const menuMesh = (() => {
          const object = new THREE.Object3D();
          object.position.set(0, DEFAULT_USER_HEIGHT, -1.5);
          object.visible = menuState.open;

          const statusMesh = (() => {
            const menuUi = biolumi.makeUi({
              width: WIDTH,
              height: HEIGHT,
            });
            const mesh = menuUi.makePage(({
              status,
            }) => ({
              type: 'html',
              src: menuRenderer.getStatusSrc({status}),
              x: 0,
              y: 0,
              w: WIDTH,
              h: HEIGHT,
            }), {
              type: 'status',
              state: {
                status: statusState,
              },
              worldWidth: WORLD_WIDTH,
              worldHeight: WORLD_HEIGHT,
            });
            mesh.receiveShadow = true;

            const {page} = mesh;
            uiTracker.addPage(page);

            cleanups.push(() => {
              uiTracker.removePage(page);
            });

            return mesh;
          })();
          object.add(statusMesh);
          object.statusMesh = statusMesh;

          object.worldMesh = null;
          object.serversMesh = null;
          object.configMesh = null;
          object.statsMesh = null;

          const navbarMesh = (() => {
            const navbarUi = biolumi.makeUi({
              width: NAVBAR_WIDTH,
              height: NAVBAR_HEIGHT,
            });
            const mesh = navbarUi.makePage(({
              navbar: {
                tab,
              },
            }) => ({
              type: 'html',
              src: menuRenderer.getNavbarSrc({tab}),
              x: 0,
              y: 0,
              w: NAVBAR_WIDTH,
              h: NAVBAR_HEIGHT,
            }), {
              type: 'navbar',
              state: {
                navbar: navbarState,
              },
              worldWidth: NAVBAR_WORLD_WIDTH,
              worldHeight: NAVBAR_WORLD_HEIGHT,
            });
            mesh.position.y = (WORLD_HEIGHT / 2) + (NAVBAR_WORLD_HEIGHT / 2);
            mesh.receiveShadow = true;

            const {page} = mesh;
            uiTracker.addPage(page);

            cleanups.push(() => {
              uiTracker.removePage(page);
            });

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

        const trigger = e => {
          const {open} = menuState;

          if (open) {
            const {side} = e;

            const _doClickNavbar = () => {
              const hoverState = uiTracker.getHoverState(side);
              const {anchor} = hoverState;
              const onclick = (anchor && anchor.onclick) || '';

              let match;
              if (match = onclick.match(/^navbar:(status|world|servers|options)$/)) {
                const newTab = match[1];

                const _getTabMesh = tab => {
                  switch (tab) {
                    case 'status': return menuMesh.statusMesh;
                    case 'world': return menuMesh.worldMesh;
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

                _updateNavbarPage();

                rendApi.emit('tabchange', newTab);

                return true;
              } else {
                return false;
              }
            };
            const _doClickMenu = () => {
              const hoverState = uiTracker.getHoverState(side);
              const {anchor} = hoverState;
              const onclick = (anchor && anchor.onclick) || '';

              /* if (onclick === 'status:downloadLoginToken') {
                const a = document.createElement('a');
                a.href = '/server/token';
                a.download = 'token.txt';
                a.style.display = 'none';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);

                return true;
              } else if (onclick === 'status:logOut') {
                const _requestLogout = () => new Promise((accept, reject) => {
                  bootstrap.requestLogout()
                    .then(() => {
                      accept();
                    })
                    .catch(err => {
                      console.warn(err);

                      accept();
                    });
                });

                _requestLogout()
                  .then(() => {
                    rendApi.logout();
                  });

                return true;
              } else */if (onclick === 'status:backToHub') {
                const initialToken = _getQueryVariable(bootstrap.getInitialUrl(), 't');
                bootstrap.navigate('https://' + hubUrl + (initialToken ? ('?t=' + initialToken) : ''));

                return true; // can't happen
              } else {
                return false;
              }
            };

            _doClickNavbar() || _doClickMenu();
          }
        };
        input.on('trigger', trigger);
        // this needs to be a native click event rather than a soft trigger click event due for clipboard copy security reasons
        const click = () => {
          const mode = webvr.getMode();

          if (SIDES.indexOf(mode) !== -1) {
            const side = mode;
            const hoverState = uiTracker.getHoverState(side);
            const {anchor} = hoverState;
            const onclick = (anchor && anchor.onclick) || '';

            if (onclick === 'status:token') {
              const {url, authToken} = statusState;
              const clipboardText = url + '?t=' + authToken;

              const ok = _copyToClipboard(clipboardText);
              if (ok) {
                console.log('copied to clipboard: ' + clipboardText);

                _proxyLogin()
                  .then(token => {
                    statusState.authToken = token;

                    _updateMenuPage();
                  })
                  .catch(err => {
                    console.warn(err);
                  });
              } else {
                console.warn('failed to copy URL:\n' + clipboardText);
              }
            }
          }
        };
        input.on('click', click);
        const menudown = () => {
          const {open, animation} = menuState;

          if (open) {
            menuState.open = false; // XXX need to cancel other menu states as well
            menuState.position = null;
            menuState.rotation = null;
            menuState.animation = anima.makeAnimation(TRANSITION_TIME);

            const {tagsLinesMesh} = auxObjects;
            tagsLinesMesh.visible = false;

            rendApi.emit('close');
          } else {
            const newCameraPosition = camera.position.clone();
            const newCameraRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(
              0,
              camera.rotation.y,
              0,
              camera.rotation.order
            ));
            const newMenuPosition = newCameraPosition.clone()
              .add(new THREE.Vector3(0, 0, -1.5).applyQuaternion(newCameraRotation));
            const newMenuRotation = newCameraRotation;
            menuMesh.position.copy(newMenuPosition);
            menuMesh.quaternion.copy(newMenuRotation);

            menuState.open = true;
            menuState.position = newMenuPosition.toArray();
            menuState.rotation = newMenuRotation.toArray();
            menuState.animation = anima.makeAnimation(TRANSITION_TIME);

            const {tagsLinesMesh} = auxObjects;
            tagsLinesMesh.visible = true;

            rendApi.emit('open', {
              position: newCameraPosition,
              rotation: newCameraRotation,
            });
          }
        };
        input.on('menudown', menudown);

        localUpdates.push(() => {
          const _updateMeshAnimations = () => {
            const {animation} = menuState;

            if (animation) {
              const {open} = menuState;

              const startValue = open ? 0 : 1;
              const endValue = 1 - startValue;
              const factor = animation.getValue();
              const value = ((1 - factor) * startValue) + (factor * endValue);

              const {tagMeshes} = auxObjects;
              const animatedMeshSpecs = [
                {
                  mesh: menuMesh,
                  direction: 'y',
                },
                /* {
                  mesh: keyboardMesh,
                  direction: 'x',
                }, */
              ].concat(tagMeshes.map(tagMesh => ({
                mesh: tagMesh,
                direction: 'y',
              })));

              if (factor < 1) {
                if (value > 0.001) {
                  animatedMeshSpecs.forEach(meshSpec => {
                    const {direction, mesh} = meshSpec;

                    switch (direction) {
                      case 'x':
                        mesh.scale.set(value, 1, 1);
                        break;
                      case 'y':
                        mesh.scale.set(1, value, 1);
                        break;
                      case 'z':
                        mesh.scale.set(1, 1, value);
                        break;
                    }

                    if (!mesh.visible) {
                      mesh.visible = (('initialVisible' in mesh) ? mesh.initialVisible : true);
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

                  mesh.scale.set(1, 1, 1);

                  if (open && !mesh.visible) {
                    mesh.visible = (('initialVisible' in mesh) ? mesh.initialVisible : true);
                  } else if (!open && mesh.visible) {
                    mesh.visible = false;
                  }
                });

                menuState.animation = null;
              }
            }
          };

          _updateMeshAnimations();
        });

        cleanups.push(() => {
          scene.remove(menuMesh);

          SIDES.forEach(side => {
            const {dotMeshes, boxMeshes} = uiTracker;

            scene.remove(dotMeshes[side]);
            scene.remove(boxMeshes[side]);
          });

          input.removeListener('trigger', trigger);
          input.removeListener('click', click);
          input.removeListener('menudown', menudown);
        });

        let lastMenuStatusJsonString = '';
        const _updateMenuPage = () => {
          if (menuMesh) {
            const menuStatusJsonString = JSON.stringify(statusState);

            if (menuStatusJsonString !== lastMenuStatusJsonString) {
              const {statusMesh} = menuMesh;
              const {page} = statusMesh;
              page.update();

              lastMenuStatusJsonString = menuStatusJsonString;
            }
          };
        };
        const _updateNavbarPage = () => {
          if (menuMesh) {
            const {navbarMesh} = menuMesh;
            const {page} = navbarMesh;
            page.update();
          };
        };
        const _updatePages = () => {
          _updateMenuPage();
          _updateNavbarPage();
        };
        _updatePages();

        localUpdates.push(() => {
          const _updateRenderer = () => {
            renderer.shadowMap.needsUpdate = true;
          };
          const _updateUiTimer = () => {
            biolumi.updateUiTimer();
          };
          const _updateUiTracker = () => {
            uiTracker.update({
              pose: webvr.getStatus(),
              enabled: rendApi.isOpen() || homeEnabled,
              sides: (() => {
                const mode = webvr.getMode();

                if (mode !== null) {
                  return [mode];
                } else {
                  return SIDES;
                }
              })(),
              controllerMeshes: auxObjects.controllerMeshes,
            });
          };

          _updateRenderer();
          _updateUiTimer();
          _updateUiTracker();
        });

        class RendApi extends EventEmitter {
          constructor() {
            super();

            this.setMaxListeners(100);
          }

          isOpen() {
            return menuState.open;
          }

          getMenuState() {
            const {open, position, rotation} = menuState;

            return {
              open,
              position,
              rotation
            };
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

          getStatus(name) {
            return statusState[name];
          }

          setStatus(name, value) {
            statusState[name] = value;

            this.emit('statusUpdate');

            _updateMenuPage();
          }

          update() {
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

          renderStart() {
            this.emit('renderStart');
          }

          renderEnd() {
            this.emit('renderEnd');
          }

          registerElement(pluginInstance, elementApi) {
            const tag = archae.getName(pluginInstance);

            _addModApiElement(tag, elementApi);
          }

          unregisterElement(pluginInstance) {
            const tag = archae.getName(pluginInstance);

            _removeModApiElement(tag);
          }

          addPage(page) {
            uiTracker.addPage(page);
          }

          removePage(page) {
            uiTracker.removePage(page);
          }

          getHoverState(side) {
            return uiTracker.getHoverState(side);
          }

          login() {
            menuState.open = true;
            menuState.position = [0, DEFAULT_USER_HEIGHT, -1.5];
            menuState.rotation = [0, 0, 0, 1];
            menuState.loggedIn = true;

            _updateMenuPage();

            menuMesh.visible = true;

            this.emit('login');
          }

          logout() {
            menuState.open = false;
            menuState.position = null;
            menuState.rotation = null;
            menuState.loggedIn = false;

            _updateMenuPage();

            menuMesh.visible = false;

            this.emit('logout');
          }
        }
        const rendApi = new RendApi();
        rendApi.on('update', () => {
          for (let i = 0; i < localUpdates.length; i++) {
            const localUpdate = localUpdates[i];
            localUpdate();
          }
        });

        return rendApi;
      }
    });
  }

  unmount() {
    this._cleanup();
  }
}

const _getQueryVariable = (url, variable) => {
  const match = url.match(/\?(.+)$/);
  const query = match ? match[1] : '';
  const vars = query.split('&');

  for (let i = 0; i < vars.length; i++) {
    const pair = vars[i].split('=');

    if (decodeURIComponent(pair[0]) === variable) {
      return decodeURIComponent(pair[1]);
    }
  }
  return null;
};
const _copyToClipboard = s => {
  const mark = document.createElement('span');
  mark.textContent = s;
  mark.setAttribute('style', [
    // reset user styles for span element
    'all: unset',
    // prevents scrolling to the end of the page
    'position: fixed',
    'top: 0',
    'clip: rect(0, 0, 0, 0)',
    // used to preserve spaces and line breaks
    'white-space: pre',
    // do not inherit user-select (it may be `none`)
    '-webkit-user-select: text',
    '-moz-user-select: text',
    '-ms-user-select: text',
    'user-select: text',
  ].join(';'));
  document.body.appendChild(mark);

  const range = document.createRange();
  range.selectNode(mark);

  const selection = document.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);

  const successful = document.execCommand('copy');
  return successful;
};
const _proxyLogin = () => fetch('server/proxyLogin', {
  method: 'POST',
  credentials: 'same-origin',
})
  .then(res => res.json()
    .then(({token}) => token)
  );

module.exports = Rend;
