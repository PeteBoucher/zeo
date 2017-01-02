const path = require('path');
const fs = require('fs');

const mkdirp = require('mkdirp');
const bodyParser = require('body-parser');
const bodyParserJson = bodyParser.json();
const showdown = require('showdown');
const showdownConverter = new showdown.Converter();
const MultiMutex = require('multimutex');

class Rend {
  constructor(archae) {
    this._archae = archae;
  }

  mount() {
    const {_archae: archae} = this;
    const {app, dirname} = archae.getCore();

    let live = true;
    this._cleanup = () => {
      live = false;
    };

    return archae.requestEngines([
      '/core/engines/npm',
    ])
      .then(([
        npm,
      ]) => {
        if (live) {
          const worldModsJsons = new Map();
          const worldElementsJsons = new Map();
          const worldModMutex = new MultiMutex();

          const worldsPath = path.join(dirname, 'data', 'worlds');

          const _getWorldModJson = ({world}) => new Promise((accept, reject) => {
            const entry = worldModsJsons.get(world);

            if (entry) {
              accept(entry);
            } else {
              const worldModsJsonPath = path.join(worldsPath, world, 'mods.json');

              fs.readFile(worldModsJsonPath, 'utf8', (err, s) => {
                if (!err) {
                  const entry = JSON.parse(s);
                  worldModsJsons.set(world, entry);
                  accept(entry);
                } else if (err.code === 'ENOENT') {
                  const entry = {
                    mods: [],
                  };
                  worldModsJsons.set(world, entry);
                  accept(entry);
                } else {
                  reject(err);
                }
              });
            }
          });
          const _setWorldModsJson = ({world, worldModsJson}) => new Promise((accept, reject) => {
            worldModsJsons.set(world, worldModsJson);

            const worldPath = path.join(worldsPath, world);
            mkdirp(worldPath, err => {
              if (!err) {
                const worldModsJsonPath = path.join(worldPath, 'mods.json');

                fs.writeFile(worldModsJsonPath, JSON.stringify(worldModsJson, null, 2), 'utf8', err => {
                  if (!err) {
                    accept();
                  } else {
                    reject(err);
                  }
                });
              } else {
                reject(err);
              }
            });
          });
          const _getWorldElementsJson = ({world}) => new Promise((accept, reject) => {
            const entry = worldElementsJsons.get(world);

            if (entry) {
              accept(entry);
            } else {
              const worldElementsJsonPath = path.join(worldsPath, world, 'elements.json');

              fs.readFile(worldElementsJsonPath, 'utf8', (err, s) => {
                if (!err) {
                  const entry = JSON.parse(s);
                  worldElementsJsons.set(world, entry);
                  accept(entry);
                } else if (err.code === 'ENOENT') {
                  const entry = {
                    elements: [],
                    clipboardElements: [],
                  };
                  worldElementsJsons.set(world, entry);
                  accept(entry);
                } else {
                  reject(err);
                }
              });
            }
          });
          const _setWorldElementsJson = ({world, worldElementsJson}) => new Promise((accept, reject) => {
            worldElementsJsons.set(world, worldElementsJson);

            const worldPath = path.join(worldsPath, world);
            mkdirp(worldPath, err => {
              if (!err) {
                const worldElementJsonPath = path.join(worldPath, 'elements.json');
                fs.writeFile(worldElementJsonPath, JSON.stringify(worldElementsJson, null, 2), 'utf8', err => {
                  if (!err) {
                    accept();
                  } else {
                    reject(err);
                  }
                });
              } else {
                reject(err);
              }
            });
          });

          const _addWorldMod = ({world, mod}, cb) => {
            const key = world + ':' + mod;

            worldModMutex.lock(key)
              .then(unlock => {
                cb = (cb => err => {
                  cb(err);

                  unlock();
                })(cb);

                _getWorldModJson({world})
                  .then(worldModsJson => {
                    const {mods} = worldModsJson;
                    if (!mods.includes(mod)) {
                      mods.push(mod);
                    }
                    
                    _setWorldModsJson({world, worldModsJson})
                      .then(() => {
                        cb();
                      })
                      .catch(err => {
                        cb(err);
                      });
                  })
                  .catch(err => {
                    cb(err);
                  });
              })
              .catch(err => {
                cb(err);
              });
          };
          const _removeWorldMod = ({world, mod}, cb) => {
            const key = world + ':' + mod;

            worldModMutex.lock(key)
              .then(unlock => {
                cb = (cb => err => {
                  cb(err);

                  unlock();
                })(cb);

                _getWorldModJson({world})
                  .then(worldModsJson => {
                    const {mods} = worldModsJson;
                    const index = mods.indexOf(mod);
                    if (index !== -1) {
                      mods.splice(index, 1);
                    }
                    
                    _setWorldModsJson({world, worldModsJson})
                      .then(() => {
                        cb();
                      })
                      .catch(err => {
                        cb(err);
                      });
                  })
                  .catch(err => {
                    cb(err);
                  });
              })
              .catch(err => {
                cb(err);
              });
          };

          const pluginsInstalledPath = path.join(dirname, 'installed', 'plugins');
          const _getPluginName = plugin => new Promise((accept, reject) => {
            if (path.isAbsolute(plugin)) {
              const pluginPath = path.join(dirname, plugin);
              const pluginPackageJsonPath = path.join(pluginPath, 'package.json');

              fs.readFile(pluginPackageJsonPath, 'utf8', (err, s) => {
                if (!err) {
                  const j = JSON.parse(s);
                  const {name} = j;
                  
                  accept(name);
                } else {
                  reject(err);
                }
              });
            } else {
              accept(plugin);
            }
          });
          const _getInstalledPluginPackageJson = plugin => _getPluginName(plugin)
            .then(name => new Promise((accept, reject) => {
              fs.readFile(path.join(pluginsInstalledPath, plugin, 'package.json'), 'utf8', (err, s) => {
                if (!err) {
                  const j = JSON.parse(s);

                  accept(j);
                } else {
                  reject(err);
                }
              });
            }));
          const _getUninstalledPluginPackageJson = plugin => {
            if (path.isAbsolute(plugin)) {
              fs.readFile(path.join(pluginsInstalledPath, plugin, 'package.json'), 'utf8', (err, s) => {
                if (!err) {
                  const j = JSON.parse(s);

                  accept(j);
                } else {
                  reject(err);
                }
              });
            } else {
              npm.requestPackageJson(plugin)
                .then(accept)
                .catch(reject);
            }
          };
          const _getUninstalledPluginReadmeMd = plugin => new Promise((accept, reject) => {
            if (path.isAbsolute(plugin)) {
              const pluginPath = path.join(dirname, plugin);

              fs.readdir(pluginPath, (err, files) => {
                if (!err) {
                  const readmeFiles = files.filter(f => /^README\.md$/i.test());

                  if (readmeFiles.length > 0) {
                    const readmeFilePath = readmeFiles.sort((a, b) => a.localeCompare(b))[0];

                    fs.readFile(path.join(pluginPath, readmeFilePath), 'utf8', (err, s) => {
                      if (!err) {
                        accept(_renderMarkdown(s));
                      } else {
                        reject(err);
                      }
                    });
                  } else {
                    accept('');
                  }
                } else if (err.code === 'ENOENT') {
                  accept('');
                } else {
                  reject(err);
                }
              })
            } else {
              npm.requestReadmeMd(plugin)
                .then(s => {
                  accept(_renderMarkdown(s));
                })
                .catch(reject);
            }
          });
          const _getInstalledModSpec = mod => _getInstalledPluginPackageJson(mod)
            .then(packageJson => ({
              name: packageJson.name,
              version: packageJson.version,
              description: packageJson.description || null,
              hasClient: Boolean(packageJson.client),
              hasServer: Boolean(packageJson.server),
              hasWorker: Boolean(packageJson.worker),
              local: path.isAbsolute(mod),
            }));
          const _getInstalledModSpecs = plugins => Promise.all(plugins.map(_getInstalledModSpec));
          const _getUninstalledModSpec = mod => Promise.all([
            _getUninstalledPluginPackageJson(mod),
            _getUninstalledPluginReadmeMd(mod),
          ])
            .then(([
              packageJson,
              readmeMd,
            ]) => ({
              name: packageJson.name,
              version: packageJson.version,
              description: packageJson.description || null,
              readme: readmeMd || '',
              hasClient: Boolean(packageJson.client),
              hasServer: Boolean(packageJson.server),
              hasWorker: Boolean(packageJson.worker),
              local: path.isAbsolute(mod),
            }));

          function serveReadme(req, res, next) {
            fs.readFile(path.join(__dirname, '..', 'zeo', 'README.md'), 'utf8', (err, s) => {
              if (!err) {
                res.send(_renderMarkdown(s));
              } else if (err.code === 'ENOENT') {
                res.send('');
              } else {
                res.status(500);
                res.send(err.stack);
              }
            });
          }
          app.get('/archae/rend/readme', serveReadme);
          function serveModsInstalled(req, res, next) {
            bodyParserJson(req, res, () => {
              const {body: data} = req;

              const _respondInvalid = () => {
                res.status(400);
                res.send();
              };

              if (typeof data === 'object' && data !== null) {
                const {world} = data;

                if (typeof world === 'string') {
                  _getWorldModJson({world})
                    .then(({mods}) =>
                      _getInstalledModSpecs(mods)
                        .then(modsSpecs => {
                          res.json({
                            mods: modsSpecs,
                          });
                        })
                    )
                    .catch(err => {
                      res.status(500);
                      res.send(err.stack);
                    });
                } else {
                  _respondInvalid();
                }
              } else {
                _respondInvalid();
              }
            });
          }
          app.post('/archae/rend/mods/installed', serveModsInstalled);
          function serveModsSearch(req, res, next) {
            bodyParserJson(req, res, () => {
              const {body: data} = req;

              const _respondInvalid = () => {
                res.status(400);
                res.send();
              };

              if (typeof data === 'object' && data !== null) {
                const {q} = data;

                if (typeof q === 'string') {
                  npm.requestSearch(q)
                    .then(results => {
                      res.json(results);
                    })
                    .catch(err => {
                      res.status(500);
                      res.send(err.stack);
                    });
                } else {
                  _respondInvalid();
                }
              } else {
                _respondInvalid();
              }
            });
          }
          app.post('/archae/rend/mods/search', serveModsSearch);
          function serveModsSpec(req, res, next) {
            bodyParserJson(req, res, () => {
              const {body: data} = req;

              const _respondInvalid = () => {
                res.status(400);
                res.send();
              };

              if (typeof data === 'object' && data !== null) {
                const {mod} = data;

                if (typeof mod === 'string') {
                  _getUninstalledModSpec(mod)
                    .then(modSpec => {
                      res.json({
                        mod: modSpec,
                      });
                    })
                    .catch(err => {
                      res.status(500);
                      res.send(err.stack);
                    });
                } else {
                  _respondInvalid();
                }
              } else {
                _respondInvalid();
              }
            });
          }
          app.post('/archae/rend/mods/spec', serveModsSpec);
          function serveModsAdd(req, res, next) {
            bodyParserJson(req, res, () => {
              const {body: data} = req;

              const _respondInvalid = () => {
                res.status(400);
                res.send();
              };

              if (typeof data === 'object' && data !== null) {
                const {world, mod} = data;

                if (typeof world === 'string' && typeof mod === 'string') {
                  _addWorldMod({
                    world,
                    mod,
                  }, err => {
                    if (!err) {
                      _getInstalledModSpec(mod)
                        .then(modSpec => {
                          res.json({
                            mod: modSpec,
                          });
                        })
                        .catch(err => {
                          res.status(500);
                          res.send(err.stack);
                        });
                    } else {
                      res.status(500);
                      res.send(err.stack);
                    }
                  });
                } else {
                  _respondInvalid();
                }
              } else {
                _respondInvalid();
              }
            });
          }
          app.post('/archae/rend/mods/add', serveModsAdd);
          function serveModsRemove(req, res, next) {
            bodyParserJson(req, res, () => {
              const {body: data} = req;

              const _respondInvalid = () => {
                res.status(400);
                res.send();
              };

              if (typeof data === 'object' && data !== null) {
                const {world, mod} = data;

                if (typeof world === 'string' && typeof mod === 'string') {
                  _getInstalledModSpec(mod)
                    .then(modSpec => {
                      _removeWorldMod({
                        world,
                        mod,
                      }, err => {
                        if (!err) {
                          res.send({
                            mod: modSpec,
                          });
                        } else {
                          res.status(500);
                          res.send(err.stack);
                        }
                      });
                    })
                    .catch(err => {
                      res.status(500);
                      res.send(err.stack);
                    });
                } else {
                  _respondInvalid();
                }
              } else {
                _respondInvalid();
              }
            });
          }
          app.post('/archae/rend/mods/remove', serveModsRemove);
          function serveElementsGet(req, res, next) {
            const {world} = req.params;
            const worldElementsJsonPath = path.join(worldsPath, world, 'elements.json');

            _getWorldElementsJson({world})
              .then(worldElementsJson => {
                const {elements, clipboardElements} = worldElementsJson;

                res.json({
                  elements,
                  clipboardElements,
                });
              })
              .catch(err => {
                res.status(500);
                res.send(err.stack);
              });
          }
          app.get('/archae/rend/worlds/:world/elements.json', serveElementsGet);
          function serveElementsSet(req, res, next) {
            bodyParserJson(req, res, () => {
              const {body: data} = req;

              const _respondInvalid = () => {
                res.status(400);
                res.send();
              };

              if (
                typeof data === 'object' && data !== null &&
                data.elements && Array.isArray(data.elements) &&
                data.clipboardElements && Array.isArray(data.clipboardElements)
              ) {
                const {world} = req.params;
                const worldElementsJson = {
                  elements: data.elements,
                  clipboardElements: data.clipboardElements,
                };
                _setWorldElementsJson({world, worldElementsJson})
                  .then(() => {
                    res.send();
                  })
                  .catch(err => {
                    res.status(500);
                    res.send(err.stack);
                  });
              } else {
                _respondInvalid();
              }
            });
          }
          app.put('/archae/rend/worlds/:world/elements.json', serveElementsSet);

          this._cleanup = () => {
            function removeMiddlewares(route, i, routes) {
              if (
                route.handle.name === 'serveReadme' ||
                route.handle.name === 'serveModsInstalled' ||
                route.handle.name === 'serveModsSpec' ||
                route.handle.name === 'serveModsAdd' ||
                route.handle.name === 'serveModsRemove' ||
                route.handle.name === 'serveElementsGet' ||
                route.handle.name === 'serveElementsSet'
              ) {
                routes.splice(i, 1);
              }
              if (route.route) {
                route.route.stack.forEach(removeMiddlewares);
              }
            }
            app._router.stack.forEach(removeMiddlewares);
          };
        }
      });
  }

  unmount() {
    this._cleanup();
  }
}

const _renderMarkdown = s => showdownConverter
  .makeHtml(s)
  .replace(/&mdash;/g, '-')
  .replace(/(<code\s*[^>]*?>)([^>]*?)(<\/code>)/g, (all, start, mid, end) => start + mid.replace(/\n/g, '<br/>') + end)
  .replace(/\n+/g, ' ');

module.exports = Rend;
