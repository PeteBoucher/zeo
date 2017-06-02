const TELEPORT_DISTANCE = 15;

const SIDES = ['left', 'right'];

class Teleport {
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
      '/core/engines/webvr',
      '/core/engines/input',
      '/core/engines/rend',
      '/core/engines/cyborg',
    ]).then(([
      three,
      webvr,
      input,
      rend,
      cyborg,
    ]) => {
      if (live) {
        const {THREE, scene, camera} = three;

        const _decomposeMatrix = matrix => {
          const position = new THREE.Vector3();
          const rotation = new THREE.Quaternion();
          const scale = new THREE.Vector3();
          matrix.decompose(position, rotation, scale);
          return {
            position,
            rotation,
            scale,
          };
        };

        const upVector = new THREE.Vector3(0, 1, 0);

        const teleportMeshMaterial = new THREE.MeshPhongMaterial({
          color: 0xFFC107,
          shading: THREE.FlatShading,
          opacity: 0.5,
          transparent: true,
        });

        const targets = [];
        const raycaster = new THREE.Raycaster();

        const _makeTeleportFloorMesh = () => {
          const geometry = new THREE.TorusBufferGeometry(0.5, 0.15, 3, 5);
          geometry.applyMatrix(new THREE.Matrix4().makeRotationX(-(Math.PI / 2)));
          geometry.applyMatrix(new THREE.Matrix4().makeRotationY((1 / 20) * (Math.PI * 2)));

          const material = teleportMeshMaterial;

          const mesh = new THREE.Mesh(geometry, material);
          mesh.visible = false;
          return mesh;
        };
        const teleportFloorMeshes = {
          left: _makeTeleportFloorMesh(),
          right: _makeTeleportFloorMesh(),
        };
        scene.add(teleportFloorMeshes.left);
        scene.add(teleportFloorMeshes.right);

        const _makeTeleportAirMesh = () => {
          const geometry = new THREE.BoxBufferGeometry(1, 1, 1);

          const material = teleportMeshMaterial;

          const mesh = new THREE.Mesh(geometry, material);
          mesh.visible = false;
          return mesh;
        };
        const teleportAirMeshes = {
          left: _makeTeleportAirMesh(),
          right: _makeTeleportAirMesh(),
        };
        scene.add(teleportAirMeshes.left);
        scene.add(teleportAirMeshes.right);

        const _makeTeleportState = () => ({
          teleporting: false,
          teleportFloorPoint: null,
          teleportAirPoint: null,
        });
        const teleportStates = {
          left: _makeTeleportState(),
          right: _makeTeleportState(),
        };

        const _paddown = e => {
          const {side} = e;

          const teleportState = teleportStates[side];
          teleportState.teleporting = true;
        };
        input.on('paddown', _paddown);
        const _padup = e => {
          const {side} = e;

          const teleportState = teleportStates[side];
          teleportState.teleporting = false;
        };
        input.on('padup', _padup);

        const _update = () => {
          const {hmd, gamepads} = webvr.getStatus();
          const {worldPosition: hmdPosition, worldRotation: hmdRotation, worldScale: hmdScale, rotation: hmdLocalRotation} = hmd;
          const hmdLocalEuler = new THREE.Euler().setFromQuaternion(hmdLocalRotation, 'YXZ');

          SIDES.forEach(side => {
            const gamepad = gamepads[side];

            if (gamepad) {
              const teleportState = teleportStates[side];
              const {teleporting} = teleportState;
              const teleportFloorMesh = teleportFloorMeshes[side];
              const teleportAirMesh = teleportAirMeshes[side];

              if (teleporting) {
                const {worldPosition: controllerPosition, worldRotation: controllerRotation, worldScale: controllerScale, axes} = gamepad;

                const axisFactor = (axes[1] - (-1)) / 2;
                raycaster.set(
                  controllerPosition.clone(),
                  new THREE.Vector3(0, 0, -1).applyQuaternion(controllerRotation)
                );
                raycaster.far = axisFactor * TELEPORT_DISTANCE * ((controllerScale.x + controllerScale.y + controllerScale.z) / 3);
                const intersections = raycaster.intersectObjects(targets, true);

                if (intersections.length > 0) {
                  const intersection = intersections[0];
                  const {point: intersectionPoint, face: intersectionFace} = intersection;
                  const {normal: intersectionNormal} = intersectionFace;
                  const destinationPoint = intersectionPoint;

                  teleportFloorMesh.position.copy(destinationPoint);
                  teleportFloorMesh.quaternion.setFromRotationMatrix(
                    new THREE.Matrix4().lookAt(
                      destinationPoint.clone(),
                      destinationPoint.clone().add(
                        destinationPoint.clone().sub(
                          new THREE.Plane().setFromNormalAndCoplanarPoint(
                            intersectionNormal,
                            destinationPoint
                          ).projectPoint(controllerPosition)
                        ).normalize()
                      ),
                      intersectionNormal.clone(),
                    )
                  );
                  teleportFloorMesh.scale.copy(controllerScale);

                  teleportState.teleportFloorPoint = destinationPoint;
                  teleportState.teleportAirPoint = null;

                  if (!teleportFloorMesh.visible) {
                    teleportFloorMesh.visible = true;
                  }
                  if (teleportAirMesh.visible) {
                    teleportAirMesh.visible = false;
                  }
                } else {
                  const destinationPoint = raycaster.ray.origin.clone()
                    .add(
                      raycaster.ray.direction.clone()
                        .multiplyScalar(raycaster.far)
                    );
                  const basePosition = new THREE.Vector3(0, 0, 0).applyMatrix4(webvr.getSittingToStandingTransform());
                  destinationPoint.y = Math.max(destinationPoint.y, basePosition.y, 0);
                  teleportAirMesh.position.copy(destinationPoint);
                  const controllerEuler = new THREE.Euler().setFromQuaternion(controllerRotation, camera.rotation.order);
                  teleportAirMesh.rotation.y = controllerEuler.y;
                  teleportAirMesh.scale.copy(controllerScale);

                  teleportState.teleportAirPoint = destinationPoint;
                  teleportState.teleportFloorPoint = null;

                  if (!teleportAirMesh.visible) {
                    teleportAirMesh.visible = true;
                  }
                  if (teleportFloorMesh.visible) {
                    teleportFloorMesh.visible = false;
                  }
                }
              } else {
                const {teleportFloorPoint, teleportAirPoint} = teleportState;

                if (teleportFloorPoint) {
                  const offsetVector = new THREE.Vector3(0, 1, 0).applyQuaternion(teleportFloorMesh.quaternion);
                  webvr.setStageMatrix(
                    camera.matrixWorldInverse.multiply(webvr.getStageMatrix()) // move back to origin
                      .premultiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(hmdLocalEuler.x, 0, hmdLocalEuler.z, 'YXZ'))) // rotate to HMD
                      .premultiply(teleportFloorMesh.matrixWorld) // move to teleport location
                      .premultiply(new THREE.Matrix4().makeTranslation(offsetVector.x, offsetVector.y, offsetVector.z)) // move above target
                  );

                  webvr.updateStatus();
                  webvr.updateUserStageMatrix();
                  cyborg.update();

                  teleportState.teleportFloorPoint = null;
                } else if (teleportAirPoint) {
                  const offsetVector = new THREE.Vector3(0, 1, 0).applyQuaternion(teleportAirMesh.quaternion);
                  webvr.setStageMatrix(
                    camera.matrixWorldInverse.multiply(webvr.getStageMatrix()) // move back to origin
                      .premultiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(hmdLocalEuler.x, 0, hmdLocalEuler.z, 'YXZ'))) // rotate to HMD
                      .premultiply(teleportAirMesh.matrixWorld) // move to teleport location
                      .premultiply(new THREE.Matrix4().makeTranslation(offsetVector.x, offsetVector.y, offsetVector.z)) // move above target
                  );

                  webvr.updateStatus();
                  webvr.updateUserStageMatrix();
                  cyborg.update();

                  teleportState.teleportAirPoint = null;
                }

                if (teleportFloorMesh.visible) {
                  teleportFloorMesh.visible = false;
                }
                if (teleportAirMesh.visible) {
                  teleportAirMesh.visible = false;
                }
              }
            }
          });
        };
        rend.on('update', _update);

        this._cleanup = () => {
          SIDES.forEach(side => {
            scene.remove(teleportFloorMeshes[side]);
            scene.remove(teleportAirMeshes[side]);
          });

          input.removeListener('paddown', _paddown);
          input.removeListener('padup', _padup);

          rend.removeListener('update', _update);
        };

        const _addTarget = object => {
          targets.push(object);
        };
        const _removeTarget = object => {
          targets.splice(targets.indexOf(object), 1);
        };

        return {
          addTarget: _addTarget,
          removeTarget: _removeTarget,
        };
      }
    });
  }

  unmount() {
    this._cleanup();
  }
};

module.exports = Teleport;
