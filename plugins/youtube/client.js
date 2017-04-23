const aspectRatio = 16 / 9;
const videoWidth = 1;
const videoHeight = videoWidth / aspectRatio;
const controlsHeight = videoHeight / 4;
const videoResolutionWidth = 256;
const videoResolutionHeight = videoResolutionWidth / aspectRatio;
const trackbarStart = 26 + 8;
const trackbarWidth = videoResolutionWidth - trackbarStart - (16);

const videoUrl = 'https://www.youtube.com/watch?v=AOZtqDhQP44';

class Youtube {
  mount() {
    const {three: {THREE, camera}, elements, input, render, ui, sound} = zeo;

    const transparentImg = ui.getTransparentImg();

    const solidMaterial = new THREE.MeshBasicMaterial({
      color: 0xFFFFFF,
      opacity: 0.75,
      transparent: true,
      // alphaTest: 0.5,
      depthWrite: false,
    });
    const wireframeMaterial = new THREE.MeshBasicMaterial({
      color: 0x000000,
      wireframe: true,
      opacity: 0.5,
      transparent: true,
    });

    const youtubeComponent = {
      selector: 'youtube[position]',
      attributes: {
        position: {
          type: 'matrix',
          value: [
            0, 0, 0,
            0, 0, 0, 1,
            1, 1, 1,
          ],
        },
      },
      entityAddedCallback(entityElement) {
        const entityApi = entityElement.getComponentApi();
        const entityObject = entityElement.getObject();

        const mesh = (() => {
          const object = new THREE.Object3D();

          const videoMesh = (() => {
            const geometry = new THREE.PlaneBufferGeometry(videoWidth, videoHeight, 1, 1);

            const material = (() => {
              const videoTexture = (() => {
                fetch('archae/youtube/' + videoUrl)
                  .then(res => {
                    res.text()
                      .then(src => {
                        const video = document.createElement('video');
                        video.src = 'archae/cors/' + src;
                        video.loop = true;
                        // video.muted = true;
                        video.oncanplay = () => {
                          texture.image = video;
                          texture.needsUpdate = true;

                          soundBody.setInputElement(video);

                          // video.play();
                          // video.currentTime = 0.5 * video.duration;

                          video.oncanplay = null;
                        };
                        video.onerror = err => {
                          console.warn('video error', err);
                        };
                      })
                      .catch(err => {
                        console.warn(err);
                      });
                  })
                  .catch(err => {
                    console.warn(err);
                  });

                const texture = new THREE.Texture(
                  transparentImg,
                  THREE.UVMapping,
                  THREE.ClampToEdgeWrapping,
                  THREE.ClampToEdgeWrapping,
                  THREE.NearestFilter,
                  THREE.NearestFilter,
                  THREE.RGBFormat,
                  THREE.UnsignedByteType,
                  16
                );
                texture.needsUpdate = true;
                return texture;
              })();

              const material = new THREE.MeshBasicMaterial({
                map: videoTexture,
              });
              return material;
            })();

            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.x = -1;
            mesh.position.y = 1.5;
            mesh.position.z = 0;
            mesh.rotation.y = Math.PI / 2;

            const soundBody = (() => {
              const result = sound.makeBody();
              // result.setInputElement(video);
              result.setObject(mesh);
              return result;
            })();

            return mesh;
          })();
          object.add(videoMesh);
          object.videoMesh = videoMesh;

          const menuMesh = (() => {
            const mesh = new THREE.Object3D();
            mesh.position.x = -1;
            mesh.position.y = 1.5 - (videoHeight / 2) - (controlsHeight / 2);
            mesh.position.z = 0;
            mesh.rotation.y = Math.PI / 2;

            const controlsMesh = (() => {
              const geometry = new THREE.PlaneBufferGeometry(videoWidth, controlsHeight, 1, 1);

              const textMaterial = (() => {
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

                  canvas.update(0.5);

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
              const materials = [solidMaterial, textMaterial];

              const mesh = new THREE.Mesh(geometry, materials);
              return mesh;
            })();
            mesh.add(controlsMesh);
            mesh.controlsMesh = controlsMesh;

            const boxMesh = (() => {
              const width = controlsHeight;
              const height = controlsHeight;
              const depth = controlsHeight / 4;
              const geometry = new THREE.BoxBufferGeometry(width, height, depth);
              const material = wireframeMaterial;

              const mesh = new THREE.Mesh(geometry, material);
              mesh.visible = false;
              mesh.renderOrder = -1;
              mesh.visible = false;
              mesh.target = null;
              mesh.value = null;
              mesh.update = () => {
                const cameraPosition = new THREE.Vector3();
                const cameraRotation = new THREE.Quaternion();
                const cameraScale = new THREE.Vector3();
                camera.matrixWorld.decompose(cameraPosition, cameraRotation, cameraScale);

                const ray = new THREE.Vector3(0, 0, -1)
                  .applyQuaternion(cameraRotation);
                const cameraLine = new THREE.Line3(
                  cameraPosition.clone(),
                  cameraPosition.clone().add(ray.clone().multiplyScalar(15))
                );

                const controlsPosition = new THREE.Vector3();
                const controlsRotation = new THREE.Quaternion();
                const controlsScale = new THREE.Vector3();
                controlsMesh.matrixWorld.decompose(controlsPosition, controlsRotation, controlsScale);
                const controlsNormalX = new THREE.Vector3(1, 0, 0).applyQuaternion(controlsRotation);
                // const controlsNormalY = new THREE.Vector3(0, 1, 0).applyQuaternion(controlsRotation);
                const controlsNormalZ = new THREE.Vector3(0, 0, 1).applyQuaternion(controlsRotation);

                const controlPoints = (() => {
                  const numTrackbarPoints = 32;
                  const result = Array(numTrackbarPoints + 1 + 1); // play, end

                  const playButtonXOffset = -(videoWidth / 2) + ((((10 + 26) / 2) / videoResolutionWidth) * videoWidth);
                  const playButtonPoint = controlsPosition.clone()
                    .add(controlsNormalX.clone()
                      .multiplyScalar(playButtonXOffset)
                    );
                  playButtonPoint.xOffset = playButtonXOffset;
                  playButtonPoint.target = 'play';
                  result[0] = playButtonPoint;

                  for (let i = 0; i < numTrackbarPoints; i++) {
                    const trackbarXOffset = -(videoWidth / 2) + (((trackbarStart + ((i / numTrackbarPoints) * trackbarWidth)) / videoResolutionWidth) * videoWidth);
                    const trackbarPoint = controlsPosition.clone()
                      .add(controlsNormalX.clone()
                        .multiplyScalar(trackbarXOffset)
                      );
                    trackbarPoint.xOffset = trackbarXOffset;
                    trackbarPoint.target = 'track';
                    trackbarPoint.value = i / numTrackbarPoints;

                    result[i + 1] = trackbarPoint;
                  }

                  const endTrackbarPointXOffset = -(videoWidth / 2) + (((trackbarStart + (1 * trackbarWidth)) / videoResolutionWidth) * videoWidth);
                  const endTrackbarPoint = controlsPosition.clone()
                    .add(controlsNormalX.clone()
                      .multiplyScalar(endTrackbarPointXOffset)
                    );
                  endTrackbarPoint.xOffset = endTrackbarPointXOffset;
                  endTrackbarPoint.target = 'end';
                  result[numTrackbarPoints + 1] = endTrackbarPoint;

                  return result;
                })();

                const controlsPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(controlsNormalZ, controlsPosition);
                const intersectionPoint = controlsPlane.intersectLine(cameraLine);

                if (intersectionPoint) {
                  const controlPointDistances = controlPoints.map((controlPoint, i) => {
                    return {
                      controlPoint,
                      distance: intersectionPoint.distanceTo(controlPoint),
                    };
                  });
                  const sortedControlPoints = controlPointDistances.sort((a, b) => {
                    return a.distance - b.distance;
                  });
                  const closestControlPoint = sortedControlPoints[0];

                  if (closestControlPoint.distance < 0.1) {
                    if (closestControlPoint.controlPoint.target === 'play') {
                      mesh.position.x = closestControlPoint.controlPoint.xOffset;
                      mesh.position.y = 0;
                      mesh.position.z = 0;
                      mesh.visible = true;
                      mesh.target = 'play';
                      mesh.value = null;
                    } else if (closestControlPoint.controlPoint.target === 'track') {
                      const value = (() => {
                        const lastControlPoint = controlPoints[controlPoints.length - 1];
                        const distanceToLastPoint = intersectionPoint.distanceTo(lastControlPoint);
                        return 1 - (distanceToLastPoint / (trackbarWidth / videoResolutionWidth));
                      })();
                      const xOffset = -(videoWidth / 2) + (((trackbarStart + (value * trackbarWidth)) / videoResolutionWidth) * videoWidth);
                      mesh.position.x = xOffset;
                      mesh.position.y = 0;
                      mesh.position.z = 0;
                      mesh.visible = true;
                      mesh.target = 'track';
                      mesh.value = value;
                    } else if (closestControlPoint.controlPoint.target === 'end') {
                      const xOffset = -(videoWidth / 2) + (((trackbarStart + (1 * trackbarWidth)) / videoResolutionWidth) * videoWidth);
                      mesh.position.x = xOffset;
                      mesh.position.y = 0;
                      mesh.position.z = 0;
                      mesh.visible = true;
                      mesh.target = 'track';
                      mesh.value = 1;
                    } else {
                      mesh.visible = false;
                      mesh.target = null;
                      mesh.value = null;
                    }
                  } else {
                    mesh.visible = false;
                    mesh.target = null;
                    mesh.value = null;
                  }
                } else {
                  mesh.visible = false;
                  mesh.target = null;
                  mesh.value = null;
                }
              };
              return mesh;
            })();
            mesh.add(boxMesh);
            mesh.boxMesh = boxMesh;

            return mesh;
          })();
          object.add(menuMesh);
          object.menuMesh = menuMesh;

          return object;
        })();
        entityObject.add(mesh);
        entityApi.mesh = mesh;

        const trigger = e => {
          const {videoMesh, menuMesh} = mesh;
          const {material: {map}} = videoMesh;
          const video = map.image.tagName === 'VIDEO' ? map.image : null;
          const {boxMesh} = menuMesh;

          if (boxMesh.target === 'play') {
            if (video) {
              if (video.paused) {
                video.play();
              } else {
                video.pause();
              }
            }

            e.stopImmediatePropagation();
          } else if (boxMesh.target === 'track') {
            if (video) {
              video.currentTime = boxMesh.value * video.duration;
            }

            e.stopImmediatePropagation();
          }
        };
        input.on('trigger', trigger);

        const update = () => {
          const {videoMesh, menuMesh} = mesh;
          const {material: {map}} = videoMesh;
          const video = map.image.tagName === 'VIDEO' ? map.image : null;

          if (video) {
            map.needsUpdate = true;

            const {controlsMesh} = menuMesh;
            const canvas = controlsMesh.children[1].material.map.image;
            const {currentTime, duration} = video;
            const progress = currentTime / duration;
            canvas.update(progress);
          }

          const {boxMesh} = menuMesh;
          boxMesh.update();
        };
        updates.push(update);

        entityApi._cleanup = () => {
          entityObject.remove(mesh);

          input.removeListener('trigger', trigger);

          updates.splice(updates.indexOf(update), 1);
        };
      },
      entityRemovedCallback(entityElement) {
        const entityApi = entityElement.getComponentApi();

        entityApi._cleanup();
      },
      entityAttributeValueChangedCallback(entityElement, name, oldValue, newValue) {
        const entityApi = entityElement.getComponentApi();

        switch (name) {
          case 'position': {
            const {mesh} = entityApi;

            mesh.position.set(newValue[0], newValue[1], newValue[2]);
            mesh.quaternion.set(newValue[3], newValue[4], newValue[5], newValue[6]);
            mesh.scale.set(newValue[7], newValue[8], newValue[9]);

            break;
          }
        }
      },
    };
    elements.registerComponent(this, youtubeComponent);

    const updates = [];
    const _update = () => {
      for (let i = 0; i < updates.length; i++) {
        const update = updates[i];
        update();
      }
    };
    render.on('update', _update);

    this._cleanup = () => {
      elements.unregisterComponent(this, youtubeComponent);

      render.removeListener('update', _update);
    };
  }

  unmount() {
    this._cleanup();
  }
}

module.exports = Youtube;
