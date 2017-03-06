import {
  WIDTH,
  HEIGHT,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  WORLD_DEPTH,

  DEFAULT_USER_HEIGHT,
} from './lib/constants/menu';
import menuRenderer from './lib/render/menu';

const DEFAULT_MATRIX = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const NUM_INVENTORY_ITEMS = 4;

class Hub {
  constructor(archae) {
    this._archae = archae;
  }

  mount() {
    const {_archae: archae} = this;
    const {metadata: {hub: {enabled: hubEnabled}}} = archae;

    let live = true;
    this._cleanup = () => {
      live = false;
    };

    return Promise.all([
      archae.requestPlugins([
        '/core/engines/three',
        '/core/engines/biolumi',
        '/core/engines/rend',
        '/core/plugins/creature-utils',
      ]),
    ])
      .then(([
        [
          three,
          biolumi,
          rend,
          creatureUtils,
        ],
      ]) => {
        if (live) {
          const {THREE, scene} = three;

          const transparentMaterial = biolumi.getTransparentMaterial();
          const transparentImg = biolumi.getTransparentImg();

          const menuUi = biolumi.makeUi({
            width: WIDTH,
            height: HEIGHT,
          });

          const mainFontSpec = {
            fonts: biolumi.getFonts(),
            fontSize: 40,
            lineHeight: 1.4,
            fontWeight: biolumi.getFontWeight(),
            fontStyle: biolumi.getFontStyle(),
          };
          const hubState = {
            open: hubEnabled,
            searchText: '',
            username: '',
            inputText: '',
            inputIndex: 0,
            inputValue: 0,
            loading: false,
            error: null,
          };
          const focusState = {
            type: '',
          };

          const menuMesh = (() => {
            const object = new THREE.Object3D();
            object.position.y = DEFAULT_USER_HEIGHT;

            const planeMesh = (() => {
              const mesh = menuUi.addPage(({
                login: {
                  searchText,
                  inputIndex,
                  inputValue,
                  loading,
                  error,
                },
                focus: {
                  type: focusType,
                }
              }) => {
                return [
                  {
                    type: 'html',
                    src: menuRenderer.getHubSrc({
                      searchText,
                      inputIndex,
                      inputValue,
                      loading,
                      error,
                      focusType,
                    }),
                    x: 0,
                    y: 0,
                    w: WIDTH,
                    h: HEIGHT,
                  },
                ];
              }, {
                type: 'hub',
                state: {
                  login: hubState,
                  focus: focusState,
                },
                worldWidth: WORLD_WIDTH,
                worldHeight: WORLD_HEIGHT,
              });
              mesh.visible = hubState.open;
              mesh.position.z = -1;
              mesh.receiveShadow = true;

              return mesh;
            })();
            object.add(planeMesh);
            object.planeMesh = planeMesh;

            const shadowMesh = (() => {
              const geometry = new THREE.BoxBufferGeometry(WORLD_WIDTH, WORLD_HEIGHT, 0.01);
              const material = transparentMaterial.clone();
              material.depthWrite = false;

              const mesh = new THREE.Mesh(geometry, material);
              mesh.castShadow = true;
              return mesh;
            })();
            object.add(shadowMesh);

            return object;
          })();
          scene.add(menuMesh);

          const _getServerMeshes = () => {
            const result = [];

            for (let i = 0; i < 1; i++) {
              const mesh = (() => {
                const geometry = new THREE.SphereBufferGeometry(0.5, 32, 32);
                const material = (() => {
                  const texture = new THREE.CubeTexture(
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

                  const img = new Image();
                  img.src = creatureUtils.makeStaticCreature('server:' + ('server' + _padNumber(i, 2)));
                  img.onload = () => {
                    const images = (() => {
                      const result = [];
                      for (let i = 0; i < 6; i++) {
                        result[i] = img;
                      }
                      return result;
                    })();
                    texture.images = images;
                    texture.needsUpdate = true;
                  };
                  img.onerror = err => {
                    console.warn(err);
                  };

                  const material = new THREE.MeshPhongMaterial({
                    color: 0xffffff,
                    envMap: texture,
                  });
                  return material;
                })();

                const mesh = new THREE.Mesh(geometry, material);
                mesh.position.x = -2;
                mesh.position.y = 1;
                return mesh;
              })();
              result.push(mesh);

              return result;
            }
          };
          const serverMeshes = _getServerMeshes();
          serverMeshes.forEach(serverMesh => {
            scene.add(serverMesh);
          });

          const _updatePages = () => {
            menuUi.update();
          };
          _updatePages();

          const _update = () => {
            // XXX
          };
          rend.on('update', _update);

          this._cleanup = () => {
            scene.remove(menuMesh);
            serverMeshes.forEach(serverMesh => {
              scene.remove(serverMesh);
            });

            rend.removeListener('update', _update);
          };
        }
      });
  }

  unmount() {
    this._cleanup();
  }
}

const _padNumber = (n, width) => {
  n = n + '';
  return n.length >= width ? n : new Array(width - n.length + 1).join('0') + n;
};

module.exports = Hub;
