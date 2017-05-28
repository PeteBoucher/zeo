const path = require('path');

const MultiMutex = require('multimutex');

class ZBuild {
  constructor(archae) {
    this._archae = archae;
  }

  mount() {
    const {_archae: archae} = this;
    const {express, app, wss} = archae.getCore();
    const {world, fs} = zeo;

    const tagsJson = world.getTags();

    const filesMutex = new MultiMutex();

    const _requestBuildMeshFileSpec = ({buildId}) => new Promise((accept, reject) => {
      const buildEntityTag = (() => {
        const tagIds = Object.keys(tagsJson);

        for (let i = 0; i < tagIds.length; i++) {
          const tagId = tagIds[i];
          const tagJson = tagsJson[tagId];
          const {type, name} = tagJson;

          if (type === 'entity' && name === 'build') {
            const {attributes} = tagJson;
            const {'build-id': buildIdAttribute} = attributes;

            if (buildIdAttribute) {
              const {value: buildIdValue} = buildIdAttribute;

              if (buildIdValue === buildId) {
                return tagJson;
              }
            }
          }
        }

        return null;
      })();
      if (buildEntityTag) {
        const {attributes} = buildEntityTag;
        const {file: fileAttribute} = attributes;

        if (fileAttribute) {
          const {value} = fileAttribute;
          const match = (value || '').match(/^fs\/([^\/]+)(\/.*)$/)

          if (match) {
            const id = match[1];
            const pathname = match[2];

            accept({
              id,
              pathname,
            });
          } else {
            accept(null); // non-local file
          }
        } else {
          accept(null);
        }
      } else {
        accept(null);
      }
    });
    const _ensureFileArrayIncludesEntry = ({file, entry}) => file.read('utf8')
      .then(s => {
        let j = _jsonParse(s);
        if (!Array.isArray(j)) {
          j = [];
        }

        if (!j.includes(entry)) {
          j.push(entry);
        }

        return file.write(JSON.stringify(j, null, 2));
      });
    const _writeFile = ({file, data}) => new Promise((accept, reject) => {
      const ws = file.createWriteStream();
      ws.end(data);
      ws.on('finish', () => {
        accept();
      });
      ws.on('error', err => {
        reject(err);
      });
    });
    const _requestBuildMeshFiles = ({buildId}) => _requestBuildMeshFileSpec({buildId})
      .then(fileSpec => {
        if (fileSpec) {
          const {id, pathname} = fileSpec;
          const indexFile = fs.makeFile(id, pathname);

          return indexFile.read('utf8')
            .then(s => {
              let j = _jsonParse(s);
              if (!Array.isArray(j)) {
                j = [];
              }

              return Promise.resolve(j.map(meshId => {
                const file = fs.makeFile(id, meshId + '.mesh.json');
                file.meshId = meshId;
                return file;
              }));
            });
        } else {
          return Promise.resolve([]);
        }
      });
    const _requestBuildIndexAndMeshFile = ({buildId, meshId}) => _requestBuildMeshFileSpec({buildId})
      .then(fileSpec => {
        if (fileSpec) {
          const {id, pathname} = fileSpec;
          const indexFile = fs.makeFile(id, pathname);
          const meshFile = fs.makeFile(id, meshId + '.mesh.json');
          meshFile.meshId = meshId;

          return Promise.resolve({
            indexFile: indexFile,
            meshFile: meshFile,
          });
        } else {
          return Promise.resolve(null);
        }
      });
   const _requestBuildIndexFile = ({buildId}) => _requestBuildMeshFileSpec({buildId})
      .then(fileSpec => {
        if (fileSpec) {
          const {id, pathname} = fileSpec;
          const indexFile = fs.makeFile(id, pathname);
          return Promise.resolve(indexFile);
        } else {
          return Promise.resolve(null);
        }
      });

    const connections = [];

    const _broadcastUpdate = ({peerId, buildId, meshId, data, thisPeerOnly = false}) => {
      const e = {
        type: 'buildSpec',
        meshId: meshId,
        data: data,
      };
      const es = JSON.stringify(e);

      for (let i = 0; i < connections.length; i++) {
        const connection = connections[i];
        if ((!thisPeerOnly ? (connection.peerId !== peerId) : (connection.peerId === peerId)) && connection.buildId === buildId) {
          connection.send(es);
        }
      }
    };
    const _broadcastClear = ({peerId, buildId}) => {
      const e = {
        type: 'clear',
      };
      const es = JSON.stringify(e);

      for (let i = 0; i < connections.length; i++) {
        const connection = connections[i];
        if (connection.peerId !== peerId && connection.buildId === buildId) {
          connection.send(es);
        }
      }
    };
    const _saveUpdate = ({buildId, meshId, data}) => {
      filesMutex.lock(buildId)
        .then(unlock => {
          _requestBuildIndexAndMeshFile({buildId, meshId})
            .then(files => {
              if (files) {
                const {indexFile, meshFile} = files;

                return Promise.all([
                  _ensureFileArrayIncludesEntry({
                    file: indexFile,
                    entry: meshId,
                  }),
                  _writeFile({
                    file: meshFile,
                    data: JSON.stringify(data, null, 2),
                  }),
                ]);
              } else {
                console.warn('build server could not find file for saving for build id', {buildId});

                return Promise.resolve();
              }
            })
            .then(() => {
              unlock();
            })
            .catch(err => {
              console.warn(err);

              unlock();
            });
        });
    };
    const _saveClear = ({buildId}) => {
      filesMutex.lock(buildId)
        .then(unlock => {
          _requestBuildIndexFile({buildId})
            .then(indexFile => {
              if (indexFile) {
                return _writeFile({
                  file: indexFile,
                  data: '',
                });
              } else {
                console.warn('build server could not find file for clearing for build id', {buildId});

                return Promise.resolve();
              }
            })
            .then(() => {
              unlock();
            })
            .catch(err => {
              console.warn(err);

              unlock();
            });
        });
    };

    const onconnection = c => {
      const {url} = c.upgradeReq;

      let match;
      if (match = url.match(/^\/archae\/buildWs\?peerId=(.+?)&buildId=(.+?)$/)) {
        const peerId = decodeURIComponent(match[1]);
        const buildId = decodeURIComponent(match[2]);

        c.peerId = peerId;
        c.buildId = buildId;

        const _sendInit = () => {
          _requestBuildMeshFiles({buildId})
            .then(meshFiles => {
              for (let i = 0; i < meshFiles.length; i++) {
                (() => {
                  const meshFile = meshFiles[i];
                  const {meshId} = meshFile;

                  meshFile.read('utf8')
                    .then(s => {
                      _broadcastUpdate({
                        peerId,
                        buildId,
                        meshId,
                        data: _jsonParse(s),
                        thisPeerOnly: true,
                      });
                    })
                })();
              }
            })
            .catch(err => {
              console.warn(err);
            });
        };
        _sendInit();

        c.on('message', (msg, flags) => {
          if (!flags.binary) {
            const m = JSON.parse(msg);

            if (m && typeof m === 'object' && ('type' in m)) {
              const {type} = m;

              if (type === 'buildSpec') {
                const {meshId, data} = m;

                _broadcastUpdate({
                  peerId,
                  buildId,
                  meshId,
                  data,
                });

                _saveUpdate({
                  buildId,
                  meshId,
                  data,
                });
              } else if (type === 'clear') {
                _broadcastClear({
                  peerId,
                  buildId,
                });

                _saveClear({
                  buildId,
                });
              } else {
                console.warn('build invalid message type', {type});
              }
            } else {
              console.warn('build invalid message', {msg});
            }
          } else {
            console.warn('build got binary data', {msg});
          }
        });
        c.on('close', () => {
          connections.splice(connections.indexOf(c), 1);
        });

        connections.push(c);
      }
    };
    wss.on('connection', onconnection);

    this._cleanup = () => {
      wss.removeListener('connection', onconnection);
    };
  }

  unmount() {
    this._cleanup();
  }
}

const _jsonParse = s => {
  let error = null;
  let result;
  try {
    result = JSON.parse(s);
  } catch (err) {
    error = err;
  }
  if (!error) {
    return result;
  } else {
    return null;
  }
};

module.exports = ZBuild;
