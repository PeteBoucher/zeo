const {
  NUM_CELLS,
  NUM_CELLS_HEIGHT,

  NUM_CHUNKS_HEIGHT,
  NUM_RENDER_GROUPS,

  HEIGHTFIELD_DEPTH,

  RANGE,

  PEEK_FACES,
  PEEK_FACE_INDICES,
} = require('./lib/constants/constants');
const protocolUtils = require('./lib/utils/protocol-utils');

const NUM_POSITIONS_CHUNK = 800 * 1024;
const LIGHTMAP_PLUGIN = 'plugins-lightmap';
const DAY_NIGHT_SKYBOX_PLUGIN = 'plugins-day-night-skybox';

const HEIGHTFIELD_SHADER = {
  uniforms: {
    lightMap: {
      type: 't',
      value: null,
    },
    useLightMap: {
      type: 'f',
      value: 0,
    },
    d: {
      type: 'v2',
      value: null,
    },
    sunIntensity: {
      type: 'f',
      value: 0,
    },
  },
  vertexShader: `\
precision highp float;
precision highp int;
#define USE_COLOR
#define FLAT_SHADED
/*uniform mat4 modelMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;
uniform mat3 normalMatrix;
attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv; */
#ifdef USE_COLOR
	attribute vec3 color;
#endif

varying vec3 vPosition;
varying vec3 vViewPosition;

#ifdef USE_COLOR
	varying vec3 vColor;
#endif

void main() {
#ifdef USE_COLOR
	vColor.xyz = color.xyz;
#endif

  vec4 mvPosition = modelViewMatrix * vec4( position.xyz, 1.0 );
  gl_Position = projectionMatrix * mvPosition;

	vPosition = position.xyz;
  vViewPosition = -mvPosition.xyz;
}
`,
  fragmentShader: `\
precision highp float;
precision highp int;
#define USE_COLOR
#define FLAT_SHADED
// uniform mat4 viewMatrix;
uniform vec3 ambientLightColor;
uniform sampler2D lightMap;
uniform float useLightMap;
uniform vec2 d;
uniform float sunIntensity;

#define saturate(a) clamp( a, 0.0, 1.0 )

#ifdef USE_COLOR
	varying vec3 vColor;
#endif

varying vec3 vPosition;
varying vec3 vViewPosition;

void main() {
	vec3 diffuseColor = vColor;

  vec3 lightColor;
  if (useLightMap > 0.0) {
    float u = (
      floor(clamp(vPosition.x - d.x, 0.0, ${(NUM_CELLS).toFixed(8)})) +
      (floor(clamp(vPosition.z - d.y, 0.0, ${(NUM_CELLS).toFixed(8)})) * ${(NUM_CELLS + 1).toFixed(8)}) +
      0.5
    ) / (${(NUM_CELLS + 1).toFixed(8)} * ${(NUM_CELLS + 1).toFixed(8)});
    float v = (floor(vPosition.y) + 0.5) / ${NUM_CELLS_HEIGHT.toFixed(8)};
    lightColor = texture2D( lightMap, vec2(u, v) ).rgb;
  } else {
    lightColor = vec3(sunIntensity);
  }

  vec3 fdx = vec3( dFdx( vViewPosition.x ), dFdx( vViewPosition.y ), dFdx( vViewPosition.z ) );
  vec3 fdy = vec3( dFdy( vViewPosition.x ), dFdy( vViewPosition.y ), dFdy( vViewPosition.z ) );
  vec3 normal = normalize( cross( fdx, fdy ) );
  float dotNL = saturate( dot( normal, normalize(vViewPosition)) );
  vec3 irradiance = ambientLightColor + (dotNL * 1.5);
  vec3 outgoingLight = diffuseColor * irradiance * (0.1 + lightColor * 0.9);

	gl_FragColor = vec4( outgoingLight, 1.0 );
}
`
};

class Heightfield {
  constructor(archae) {
    this._archae = archae;
  }

  mount() {
    const {_archae: archae} = this;
    const {three, render, pose, input, world, elements, teleport, stck, utils: {js: {mod, bffr, sbffr}, random: {chnkr}}} = zeo;
    const {THREE, scene, camera, renderer} = three;

    const modelViewMatrices = {
      left: new THREE.Matrix4(),
      right: new THREE.Matrix4(),
    };
    const normalMatrices = {
      left: new THREE.Matrix3(),
      right: new THREE.Matrix3(),
    };
    const modelViewMatricesValid = {
      left: false,
      right: false,
    };
    const normalMatricesValid = {
      left: false,
      right: false,
    };
    const uniformsNeedUpdate = {
      left: true,
      right: true,
    };
    function _updateModelViewMatrix(camera) {
      if (!modelViewMatricesValid[camera.name]) {
        modelViewMatrices[camera.name].multiplyMatrices(camera.matrixWorldInverse, this.matrixWorld);
        modelViewMatricesValid[camera.name] = true;
      }
      this.modelViewMatrix = modelViewMatrices[camera.name];
    }
    function _updateNormalMatrix(camera) {
      if (!normalMatricesValid[camera.name]) {
        normalMatrices[camera.name].getNormalMatrix(this.modelViewMatrix);
        normalMatricesValid[camera.name] = true;
      }
      this.normalMatrix = normalMatrices[camera.name];
    }
    function _uniformsNeedUpdate(camera) {
      if (uniformsNeedUpdate[camera.name]) {
        uniformsNeedUpdate[camera.name] = false;
        return true;
      } else {
        return false;
      }
    }

    const _getChunkIndex = (x, z) => (mod(x, 0xFFFF) << 16) | mod(z, 0xFFFF);

    const forwardVector = new THREE.Vector3(0, 0, -1);
    const localVector = new THREE.Vector3();
    const localVector2 = new THREE.Vector3();
    const localEuler = new THREE.Euler();
    const localArray3 = Array(3);
    const localArray16 = Array(16);
    const localArray162 = Array(16);

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

    const geometryBuffer = sbffr(
      NUM_POSITIONS_CHUNK,
      RANGE * 2 * RANGE * 2 + RANGE * 2,
      [
        {
          name: 'positions',
          constructor: Float32Array,
          size: 3 * 3 * 4,
        },
        {
          name: 'colors',
          constructor: Float32Array,
          size: 3 * 3 * 4,
        },
        {
          name: 'indices',
          constructor: Uint32Array,
          size: 3 * 4,
        }
      ]
    );
    const buffers = bffr(NUM_POSITIONS_CHUNK, (RANGE * 2) * (RANGE * 2) * 2);
    let cullBuffer = new ArrayBuffer(4096);
    const worker = new Worker('archae/plugins/_plugins_heightfield/build/worker.js');
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
    worker.requestOriginHeight = cb => {
      const id = _makeId();
      worker.postMessage({
        method: 'getOriginHeight',
        id,
      });
      queues[id] = cb;
    };
    worker.requestGenerate = (x, y, cb) => {
      const id = _makeId();
      const buffer = buffers.alloc();
      worker.postMessage({
        method: 'generate',
        id,
        args: {
          x,
          y,
          buffer,
        },
      }, [buffer]);
      queues[id] = cb;
    };
    worker.requestUngenerate = (x, y) => {
      worker.postMessage({
        method: 'ungenerate',
        args: {
          x,
          y,
        },
      });
    };
    worker.requestCull = (hmdPosition, projectionMatrix, matrixWorldInverse, cb) => {
      const id = _makeId();
      worker.postMessage({
        method: 'cull',
        id,
        args: {
          hmdPosition: hmdPosition.toArray(localArray3),
          projectionMatrix: projectionMatrix.toArray(localArray16),
          matrixWorldInverse: matrixWorldInverse.toArray(localArray162),
          buffer: cullBuffer,
        },
      }, [cullBuffer]);
      cullBuffer = null;

      queues[id] = buffer => {
        cullBuffer = buffer;
        cb(buffer);
      };
    };
    /* worker.requestAddVoxel = (x, y, z) => new Promise((accept, reject) => {
      const id = _makeId();
      worker.postMessage({
        method: 'addVoxel',
        id,
        args: {
          position: [x, y, z],
        },
      });
      queues[id] = accept;
    }); */
    worker.requestSubVoxel = (x, y, z, cb) => {
      const id = _makeId();
      worker.postMessage({
        method: 'subVoxel',
        id,
        args: {
          position: [x, y, z],
        },
      });
      queues[id] = cb;
    };
    worker.onmessage = e => {
      const {data} = e;
      const {type, args} = data;

      if (type === 'response') {
        const [id] = args;
        const {result} = data;

        queues[id](result);
        queues[id] = null;

        _cleanupQueues();
      } else {
        console.warn('heightfield got unknown worker message type:', JSON.stringify(type));
      }
    };

    let Lightmapper = null;
    let lightmapper = null;
    const _bindLightmapper = lightmapElement => {
      Lightmapper = lightmapElement.Lightmapper;
      lightmapper = lightmapElement.lightmapper;

      _bindLightmaps();
    };
    const _unbindLightmapper = () => {
      _unbindLightmaps();

      Lightmapper = null;
      lightmapper = null;
    };
    const _bindLightmaps = () => {
      for (const index in mapChunkMeshes) {
        const trackedMapChunkMeshes = mapChunkMeshes[index];
        if (trackedMapChunkMeshes) {
          _bindLightmap(trackedMapChunkMeshes);
        }
      }
    };
    const _unbindLightmaps = () => {
      for (const index in mapChunkMeshes) {
        const trackedMapChunkMeshes = mapChunkMeshes[index];
        if (trackedMapChunkMeshes && trackedMapChunkMeshes.lightmap) {
          _unbindLightmap(trackedMapChunkMeshes);
        }
      }
    };
    const _bindLightmap = trackedMapChunkMeshes => {
      const {offset, staticHeightfield/*, ether*/} = trackedMapChunkMeshes;
      const {x, y} = offset;

      /* const shape = new Lightmapper.Ether(x * NUM_CELLS, y * NUM_CELLS, ether, Lightmapper.MaxBlend);
      lightmapper.add(shape);
      trackedMapChunkMeshes.shape = shape; */

      const dayNightSkyboxEntity = elements.getEntitiesElement().querySelector(DAY_NIGHT_SKYBOX_PLUGIN);
      const sunIntensity = (dayNightSkyboxEntity && dayNightSkyboxEntity.getSunIntensity) ? dayNightSkyboxEntity.getSunIntensity() : 0;
      const shape = new Lightmapper.Heightfield(x * NUM_CELLS, y * NUM_CELLS, sunIntensity, staticHeightfield, Lightmapper.MaxBlend);
      lightmapper.add(shape);
      trackedMapChunkMeshes.shape = shape;

      const lightmap = lightmapper.getLightmapAt(x * NUM_CELLS, y * NUM_CELLS);
      trackedMapChunkMeshes.material.uniforms.lightMap.value = lightmap.texture;
      trackedMapChunkMeshes.material.uniforms.useLightMap.value = 1;
      trackedMapChunkMeshes.lightmap = lightmap;
    };
    const _unbindLightmap = trackedMapChunkMeshes => {
      lightmapper.remove(trackedMapChunkMeshes.shape);
      trackedMapChunkMeshes.shape = null;

      lightmapper.releaseLightmap(trackedMapChunkMeshes.lightmap);
      trackedMapChunkMeshes.lightmap = null;
      trackedMapChunkMeshes.material.uniforms.lightMap.value = null;
      trackedMapChunkMeshes.material.uniforms.useLightMap.value = 0;
    };
    const elementListener = elements.makeListener(LIGHTMAP_PLUGIN);
    elementListener.on('add', entityElement => {
      _bindLightmapper(entityElement);
    });
    elementListener.on('remove', () => {
      _unbindLightmapper();
    });

    const _bootstrap = () => new Promise((accept, reject) => {
      worker.requestOriginHeight(originHeight => {
        world.setSpawnMatrix(new THREE.Matrix4().makeTranslation(0, originHeight, 0));

        accept();
      });
    });
    const _requestGenerate = (x, z) => new Promise((accept, reject) => {
      worker.requestGenerate(x, z, mapChunkBuffer => {
        accept(protocolUtils.parseRenderChunk(mapChunkBuffer));
      });
    });
    const _makeMapChunkMeshes = (chunk, mapChunkData) => {
      const {x, z} = chunk;
      const {positions: newPositions, colors: newColors, indices: newIndices, heightfield, staticHeightfield} = mapChunkData;

      // geometery

      const gbuffer = geometryBuffer.alloc();
      const {index, slices: {positions, colors, indices}} = gbuffer;

      positions.set(newPositions);
      renderer.updateAttribute(heightfieldObject.geometry.attributes.position, index * positions.length, newPositions.length, false);

      colors.set(newColors);
      renderer.updateAttribute(heightfieldObject.geometry.attributes.color, index * colors.length, newColors.length, false);

      const positionOffset = index * (positions.length / 3);
      for (let i = 0; i < newIndices.length; i++)  {
        indices[i] = newIndices[i] + positionOffset; // XXX do this in the worker
      }
      renderer.updateAttribute(heightfieldObject.geometry.index, index * indices.length, newIndices.length, true);

      // material

      const uniforms = Object.assign(
        THREE.UniformsUtils.clone(THREE.UniformsLib.lights),
        THREE.UniformsUtils.clone(HEIGHTFIELD_SHADER.uniforms)
      );
      uniforms.d.value = new THREE.Vector2(x * NUM_CELLS, z * NUM_CELLS);
      const material = new THREE.ShaderMaterial({
        uniforms,
        vertexShader: HEIGHTFIELD_SHADER.vertexShader,
        fragmentShader: HEIGHTFIELD_SHADER.fragmentShader,
        lights: true,
        // transparent: true,
        extensions: {
          derivatives: true,
        },
      });
      material.uniformsNeedUpdate = _uniformsNeedUpdate;

      // mesh

      const meshes = {
        material,
        indexOffset: index * indices.length,
        renderListEntry: {
          object: heightfieldObject,
          material,
          groups: [],
        },
        offset: new THREE.Vector2(x, z),
        heightfield,
        staticHeightfield,
        lightmap: null,
        shape: null,
        stckBody: null,
        destroy: () => {
          buffers.free(mapChunkData.buffer);
          geometryBuffer.free(gbuffer);

          material.dispose();

          if (meshes.lightmap) {
            _unbindLightmap(meshes);
          }
        },
      };
      if (lightmapper && chunk.lod === 1) {
        _bindLightmap(meshes);
      }

      return meshes;
    };

    const chunker = chnkr.makeChunker({
      resolution: NUM_CELLS,
      range: RANGE,
    });
    let mapChunkMeshes = {};

    const heightfieldObject = (() => {
      const {positions, colors, indices} = geometryBuffer.getAll();

      const geometry = new THREE.BufferGeometry();
      const positionAttribute = new THREE.BufferAttribute(positions, 3);
      positionAttribute.dynamic = true;
      geometry.addAttribute('position', positionAttribute);
      const colorAttribute = new THREE.BufferAttribute(colors, 3);
      colorAttribute.dynamic = true;
      geometry.addAttribute('color', colorAttribute);
      const indexAttribute = new THREE.BufferAttribute(indices, 1);
      indexAttribute.dynamic = true;
      geometry.setIndex(indexAttribute);

      const mesh = new THREE.Mesh(geometry, null);
      mesh.frustumCulled = false;
      mesh.updateModelViewMatrix = _updateModelViewMatrix;
      mesh.updateNormalMatrix = _updateNormalMatrix;
      mesh.renderList = [];
      return mesh;
    })();
    scene.add(heightfieldObject);

    const _requestRefreshMapChunks = () => {
      const {hmd} = pose.getStatus();
      const {worldPosition: hmdPosition} = hmd;
      const {added, removed, relodded} = chunker.update(hmdPosition.x, hmdPosition.z);

      const _addTarget = trackedMapChunkMeshes => {
        const {offset} = trackedMapChunkMeshes;
        const {x, z} = offset;

        const stckBody = stck.makeStaticHeightfieldBody(
          new THREE.Vector3(x * NUM_CELLS, 0, z * NUM_CELLS),
          NUM_CELLS,
          NUM_CELLS,
          trackedMapChunkMeshes.staticHeightfield
        );
        trackedMapChunkMeshes.stckBody = stckBody;

        trackedMapChunkMeshes.targeted = true;
      };
      const _removeTarget = trackedMapChunkMeshes => {
        stck.destroyBody(trackedMapChunkMeshes.stckBody);
        trackedMapChunkMeshes.stckBody = null;

        trackedMapChunkMeshes.targeted = false;
      };

      const addedPromises = [];
      const _addChunk = chunk => {
        const {x, z, lod} = chunk;
        const promise = _requestGenerate(x, z)
          .then(mapChunkData => {
            const index = _getChunkIndex(x, z);
            const oldMapChunkMeshes = mapChunkMeshes[index];
            if (oldMapChunkMeshes) {
              heightfieldObject.renderList.splice(heightfieldObject.renderList.indexOf(oldMapChunkMeshes.renderListEntry), 1);

              oldMapChunkMeshes.destroy();

              if (lod !== 1 && oldMapChunkMeshes.targeted) {
                _removeTarget(oldMapChunkMeshes);
              }

              mapChunkMeshes[index] = null;
            }

            const newMapChunkMeshes = _makeMapChunkMeshes(chunk, mapChunkData);
            heightfieldObject.renderList.push(newMapChunkMeshes.renderListEntry);
            mapChunkMeshes[index] = newMapChunkMeshes;

            if (lod === 1 && !newMapChunkMeshes.targeted) {
              _addTarget(newMapChunkMeshes);
            }

            chunk.data = newMapChunkMeshes;
          });
        addedPromises.push(promise);
      };
      for (let i = 0; i < added.length; i++) {
        _addChunk(added[i]);
      }
      for (let i = 0; i < relodded.length; i++) {
        const chunk = relodded[i];
        const {lastLod} = chunk;

        if (lastLod === -1) {
          _addChunk(chunk);
        } else {
          const {lod, data: mapChunkMeshes} = chunk;

          if (!mapChunkMeshes.lightmap && lod === 1) {
            _bindLightmap(mapChunkMeshes);
          } else if (mapChunkMeshes.lightmap && lod !== 1) {
            _unbindLightmap(mapChunkMeshes);
          }
        }
      }
      for (let i = 0; i < removed.length; i++) {
        const chunk = removed[i];
        const {x, z, data: oldMapChunkMeshes} = chunk;
        heightfieldObject.renderList.splice(heightfieldObject.renderList.indexOf(oldMapChunkMeshes.renderListEntry), 1);

        oldMapChunkMeshes.destroy();

        const {lod} = chunk;
        if (lod !== 1 && oldMapChunkMeshes.targeted) {
          _removeTarget(oldMapChunkMeshes);
        }

        mapChunkMeshes[_getChunkIndex(x, z)] = null;

        worker.requestUngenerate(x, z);
      }
      return Promise.all(addedPromises)
        .then(() => {
          const newMapChunkMeshes = {};
          for (const index in mapChunkMeshes) {
            const trackedMapChunkMeshes = mapChunkMeshes[index];
            if (trackedMapChunkMeshes) {
              newMapChunkMeshes[index] = trackedMapChunkMeshes;
            }
          }
          mapChunkMeshes = newMapChunkMeshes;
        });
    };
    const _debouncedRequestRefreshMapChunks = _debounce(next => {
      _requestRefreshMapChunks()
        .then(next)
        .catch(err => {
          console.warn(err);
          next();
        });
    });

    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const p = new THREE.Vector3();
    const triangle = new THREE.Triangle(a, b, c);
    const baryCoord = new THREE.Vector3();
    const _getHeightfieldIndex = (x, z) => (x + (z * (NUM_CELLS + 1))) * HEIGHTFIELD_DEPTH;
    const _getElevation = (x, z) => {
      const ox = Math.floor(x / NUM_CELLS);
      const oz = Math.floor(z / NUM_CELLS);
      const mapChunkMesh = mapChunkMeshes[_getChunkIndex(ox, oz)];

      return mapChunkMesh ?
        _getTopHeightfieldTriangleElevation(mapChunkMesh.heightfield, x - (ox * NUM_CELLS), z - (ox * NUM_CELLS))
      :
        0;
    };
    const _getBestElevation = (x, z, y) => {
      const ox = Math.floor(x / NUM_CELLS);
      const oz = Math.floor(z / NUM_CELLS);
      const mapChunkMesh = mapChunkMeshes[_getChunkIndex(ox, oz)];

      return mapChunkMesh ?
        _getBestHeightfieldTriangleElevation(
          mapChunkMesh.heightfield,
          x - (ox * NUM_CELLS),
          z - (oz * NUM_CELLS),
          y
        )
      :
        0;
    };
    const _getTopHeightfieldTriangleElevation = (heightfield, x, z) => {
      const ax = Math.floor(x);
      const az = Math.floor(z);
      if ((x - ax) <= (1 - (z - az))) { // top left triangle
        a.set(ax, 0, az);
        b.set(ax + 1, 0, az);
        c.set(ax, 0, az + 1);
      } else { // bottom right triangle
        a.set(ax + 1, 0, az);
        b.set(ax, 0, az + 1);
        c.set(ax + 1, 0, az + 1);
      };
      const ea = heightfield[_getHeightfieldIndex(a.x, a.z)];
      const eb = heightfield[_getHeightfieldIndex(b.x, b.z)];
      const ec = heightfield[_getHeightfieldIndex(c.x, c.z)];

      p.set(x, 0, z);
      triangle.barycoordFromPoint(p, baryCoord);

      return baryCoord.x * ea +
        baryCoord.y * eb +
        baryCoord.z * ec;
    };
    const _getBestHeightfieldTriangleElevation = (heightfield, x, z, y) => {
      const ax = Math.floor(x);
      const az = Math.floor(z);
      if ((x - ax) <= (1 - (z - az))) { // top left triangle
        a.set(ax, 0, az);
        b.set(ax + 1, 0, az);
        c.set(ax, 0, az + 1);
      } else { // bottom right triangle
        a.set(ax + 1, 0, az);
        b.set(ax, 0, az + 1);
        c.set(ax + 1, 0, az + 1);
      };
      const ea = _getBestHeightfieldPointElevation(heightfield, a.x, a.z, y);
      const eb = _getBestHeightfieldPointElevation(heightfield, b.x, b.z, y);
      const ec = _getBestHeightfieldPointElevation(heightfield, c.x, c.z, y);

      triangle.barycoordFromPoint(p.set(x, 0, z), baryCoord);

      return baryCoord.x * ea +
        baryCoord.y * eb +
        baryCoord.z * ec;
    };
    const _getBestHeightfieldPointElevation = (heightfield, x, z, y) => {
      let bestY = -1024;
      let bestYDistance = Infinity;
      for (let i = 0; i < HEIGHTFIELD_DEPTH; i++) {
        const localY = heightfield[_getHeightfieldIndex(x, z) + i];

        if (localY !== -1024) {
          const distance = Math.abs(y - localY);

          if (distance < bestYDistance) {
            bestY = localY;
            bestYDistance = distance;
          } else {
            continue;
          }
        } else {
          break;
        }
      }
      return bestY;
    };

    return _bootstrap()
      .then(() => {
        const heightfieldEntity = {
          entityAddedCallback(entityElement) {
            const _teleportTarget = (position, rotation, scale, side, hmdPosition) => {
              localEuler.setFromQuaternion(rotation, camera.rotation.order);
              const angleFactor = Math.min(Math.pow(Math.max(localEuler.x + Math.PI * 0.45, 0) / (Math.PI * 0.8), 2), 1);
              localEuler.x = 0;
              localEuler.z = 0;
              const targetPosition = localVector.set(position.x, 0, position.z)
                .add(
                  localVector2.copy(forwardVector)
                    .applyEuler(localEuler)
                    .multiplyScalar(15 * angleFactor)
                );
              const ox = Math.floor(targetPosition.x / NUM_CELLS);
              const oz = Math.floor(targetPosition.z / NUM_CELLS);
              const mapChunkMesh = mapChunkMeshes[_getChunkIndex(ox, oz)];

              if (mapChunkMesh) {
                targetPosition.y = _getBestHeightfieldTriangleElevation(
                  mapChunkMesh.heightfield,
                  targetPosition.x - (ox * NUM_CELLS),
                  targetPosition.z - (oz * NUM_CELLS),
                  hmdPosition.y - 1.5
                );
                if (targetPosition.y !== -1024) {
                  return targetPosition;
                } else {
                  return null;
                }
              } else {
                return null;
              }
            };
            teleport.addTarget(_teleportTarget);

            entityElement.getElevation = _getElevation;
            entityElement.getBestElevation = _getBestElevation;
            entityElement._cleanup = () => {
              teleport.removeTarget(_teleportTarget);
            };
          },
        };
        elements.registerEntity(this, heightfieldEntity);

        const _triggerdown = e => {
          const {side} = e;
          const {hmd, gamepads} = pose.getStatus();
          const {worldPosition: hmdPosition} = hmd;
          const gamepad = gamepads[side];
          const {worldPosition: controllerPosition, worldRotation: controllerRotation} = gamepad;

          localEuler.setFromQuaternion(controllerRotation, camera.rotation.order);
          const angleFactor = Math.min(Math.pow(Math.max(localEuler.x + Math.PI * 0.45, 0) / (Math.PI * 0.8), 2), 1);
          localEuler.x = 0;
          localEuler.z = 0;
          localVector.set(controllerPosition.x, 0, controllerPosition.z)
            .add(
              localVector2.copy(forwardVector)
                .applyEuler(localEuler)
                .multiplyScalar(15 * angleFactor)
            );
          const lx = localVector.x;
          const lz = localVector.z;
          const ox = Math.floor(lx / NUM_CELLS);
          const oz = Math.floor(lz / NUM_CELLS);
          const mapChunkMesh = mapChunkMeshes[_getChunkIndex(ox, oz)];

          if (mapChunkMesh) {
            const ly = _getBestHeightfieldTriangleElevation(
              mapChunkMesh.heightfield,
              lx - (ox * NUM_CELLS),
              lz - (oz * NUM_CELLS),
              hmdPosition.y - 1.5
            );
            if (ly !== -1024) {
              worker.requestSubVoxel(Math.round(lx), Math.round(ly), Math.round(lz), regenerated => {
                if (regenerated.length > 0) {
                  for (let i = 0; i < regenerated.length; i++) {
                    const [ox, oz] = regenerated[i];
                    const chunk = chunker.getChunk(ox, oz);
                    if (chunk) {
                      chunk.lod = -1; // force chunk refresh
                    }
                  }
                  _debouncedRequestRefreshMapChunks();
                }
              });

              e.stopImmediatePropagation();
            }
          }
        };
        input.on('triggerdown', _triggerdown, {
          priority: -1,
        });

        const _requestCull = (hmdPosition, projectionMatrix, matrixWorldInverse, cb) => {
          worker.requestCull(hmdPosition, projectionMatrix, matrixWorldInverse, cullBuffer => {
            cb(protocolUtils.parseCull(cullBuffer));
          });
        };
        const _debouncedRefreshCull = _debounce(next => {
          const {hmd} = pose.getStatus();
          const {worldPosition: hmdPosition} = hmd;
          const {projectionMatrix, matrixWorldInverse} = camera;
          _requestCull(hmdPosition, projectionMatrix, matrixWorldInverse, culls => {
            for (let i = 0; i < culls.length; i++) {
              const {index, groups} = culls[i];

              const trackedMapChunkMeshes = mapChunkMeshes[index];
              if (trackedMapChunkMeshes) {
                for (let j = 0; j < groups.length; j++) {
                  groups[j].start += trackedMapChunkMeshes.indexOffset; // XXX do this reindexing in the worker
                }
                trackedMapChunkMeshes.renderListEntry.groups = groups;
              }
            }

            next();
          });
        });

        let refreshChunksTimeout = null;
        const _recurseRefreshChunks = () => {
          _debouncedRequestRefreshMapChunks();
          refreshChunksTimeout = setTimeout(_recurseRefreshChunks, 1000);
        };
        _recurseRefreshChunks();
        let refreshCullTimeout = null;
        const _recurseRefreshCull = () => {
          _debouncedRefreshCull();
          refreshCullTimeout = setTimeout(_recurseRefreshCull, 1000 / 30);
        };
        _recurseRefreshCull();

        const _update = () => {
          const _updateSunIntensity = () => {
            const dayNightSkyboxEntity = elements.getEntitiesElement().querySelector(DAY_NIGHT_SKYBOX_PLUGIN);
            const sunIntensity = (dayNightSkyboxEntity && dayNightSkyboxEntity.getSunIntensity) ? dayNightSkyboxEntity.getSunIntensity() : 0;

            for (const index in mapChunkMeshes) {
              const trackedMapChunkMeshes = mapChunkMeshes[index];
              if (trackedMapChunkMeshes) {
                trackedMapChunkMeshes.material.uniforms.sunIntensity.value = sunIntensity;
              }
            }
          };
          const _updateMatrices = () => {
            modelViewMatricesValid.left = false;
            modelViewMatricesValid.right = false;
            normalMatricesValid.left = false;
            normalMatricesValid.right = false;
            uniformsNeedUpdate.left = true;
            uniformsNeedUpdate.right = true;
          };

          _updateSunIntensity();
          _updateMatrices();
        };
        render.on('update', _update);

        this._cleanup = () => {
          scene.remove(heightfieldObject);

          clearTimeout(refreshChunksTimeout);
          clearTimeout(refreshCullTimeout);

          elements.destroyListener(elementListener);

          elements.unregisterEntity(this, heightfieldEntity);

          render.removeListener('update', _update);
        };
      });
  }

  unmount() {
    this._cleanup();
  }
}
let _id = 0;
const _makeId = () => {
  const result = _id;
  _id = (_id + 1) | 0;
  return result;
};
const _debounce = fn => {
  let running = false;
  let queued = false;

  const _go = () => {
    if (!running) {
      running = true;

      fn(() => {
        running = false;

        if (queued) {
          queued = false;

          _go();
        }
      });
    } else {
      queued = true;
    }
  };
  return _go;
};

module.exports = Heightfield;
