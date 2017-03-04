const path = require('path');
const fs = require('fs');

const mkdirp = require('mkdirp');
const archae = require('archae');
const cryptoutils = require('cryptoutils');

const args = process.argv.slice(2);
const flags = {
  server: args.includes('server'),
  site: args.includes('site'),
  hub: args.includes('hub'),
  install: args.includes('install'),
  host: (() => {
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      const match = arg.match(/^host=(.+)$/);
      if (match) {
        return match[1];
      }
    }
    return null;
  })(),
  port: (() => {
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      const match = arg.match(/^port=([0-9]+)$/);
      if (match) {
        return parseInt(match[1], 10);
      }
    }
    return null;
  })(),
  dataDirectory: (() => {
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      const match = arg.match(/^dataDirectory=(.+)$/);
      if (match) {
        return match[1];
      }
    }
    return null;
  })(),
  cryptoDirectory: (() => {
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      const match = arg.match(/^cryptoDirectory=(.+)$/);
      if (match) {
        return match[1];
      }
    }
    return null;
  })(),
  installDirectory: (() => {
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      const match = arg.match(/^installDirectory=(.+)$/);
      if (match) {
        return match[1];
      }
    }
    return null;
  })(),
  serverHost: (() => {
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      const match = arg.match(/^serverHost=(.+)$/);
      if (match) {
        return match[1];
      }
    }
    return null;
  })(),
  serverType: (() => {
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      const match = arg.match(/^serverType=(.+)$/);
      if (match) {
        return match[1];
      }
    }
    return null;
  })(),
  hubUrl: (() => {
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      const match = arg.match(/^hubUrl=(.+)$/);
      if (match) {
        return match[1];
      }
    }
    return null;
  })(),
  username: (() => {
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      const match = arg.match(/^username=(.+)$/);
      if (match) {
        return match[1];
      }
    }
    return null;
  })(),
  password: (() => {
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      const match = arg.match(/^password=(.+)$/);
      if (match) {
        return match[1];
      }
    }
    return null;
  })(),
};
const hasSomeFlag = (() => {
  for (const k in flags) {
    if (flags[k]) {
      return true;
    }
  }
  return false;
})();
if (!hasSomeFlag) {
  flags.server = true;
}

const hostname = flags.host || 'zeovr.io';
const port = flags.port || 8000;
const dataDirectory = flags.dataDirectory || 'data';
const cryptoDirectory = flags.cryptoDirectory || 'crypto';
const installDirectory = flags.installDirectory || 'installed';
const staticSite = flags.site && !(flags.hub || flags.server);
const serverHost = flags.serverHost || ('server.' + hostname);
const hubUrl = flags.hubUrl || ('hub.' + hostname + ':' + port);
const config = {
  dirname: __dirname,
  hostname: hostname,
  port: port,
  publicDirectory: 'public',
  dataDirectory: dataDirectory,
  cryptoDirectory: cryptoDirectory,
  installDirectory: installDirectory,
  cors: !staticSite,
  staticSite: staticSite,
  metadata: {
    site: {
      url: hostname + ':' + port,
      enabled: flags.site,
    },
    hub: {
      url: hubUrl,
      enabled: flags.hub,
    },
    server: {
      url: serverHost + ':' + port,
      enabled: flags.server,
      type: flags.serverType || 'secure',
      username: flags.username || 'username',
      password: flags.password || 'password',
    },
  },
};
const a = archae(config);
a.app.getHostname = req => {
  const hostHeader = req.get('Host') || '';
  const match = hostHeader.match(/^([^:]+)(?::[\s\S]*)?$/);
  return match && match[1];
};

const _install = () => {
  if (flags.install) {
    return _getAllPlugins()
     .then(plugins => a.installPlugins(plugins));
  } else {
    return Promise.resolve();
  }
};

const _ensureSign = () => new Promise((accept, reject) => {
  if (flags.hub || flags.server) {
    const signDirectory = path.join(__dirname, cryptoDirectory, 'sign');
    const publicKeyPath = path.join(signDirectory, 'public.pem');
    const privateKeyPath = path.join(signDirectory, 'private.pem');

    const _setFile = (p, d) => {
      fs.writeFile(p, d, err => {
        if (!err) {
          accept();
        } else {
          reject(err);
        }
      });
    };

    fs.lstat(publicKeyPath, (err, stats) => {
      if (!err) {
        if (stats.isFile()) {
          accept();
        } else {
          const err = new Error('Public signing key is not a file: ' + publicKeyPath + '. Remove or replace it with a proper signing key file.');
          reject(err);
        }
      } else if (err.code === 'ENOENT') {
        mkdirp(signDirectory, err => {
          if (!err) {
            const {publicKey, privateKey} = cryptoutils.generateKeys();

            Promise.all([
              _setFile(publicKeyPath, publicKey),
              _setFile(privateKeyPath, privateKey),
            ])
              .then(() => {
                accept();
              })
              .catch(err => {
                reject(err);
              });
          } else {
            reject(err);
          }
        });
      } else {
        reject(err);
      }
    });
  } else {
    accept();
  }
});

const _ensure = () => Promise.all([
  _install(),
  _ensureSign(),
]);

const _getAllPlugins = () => {
  const _flatten = a => {
    const result = [];
    for (let i = 0; i < a.length; i++) {
      const e = a[i];
      result.push.apply(result, e);
    }
    return result;
  };
  const _readdir = p => new Promise((accept, reject) => {
    fs.readdir(p, (err, files) => {
      if (!err) {
        const decoratedFiles = files.map(file => path.join(p, file));
        accept(decoratedFiles);
      } else {
        reject(err);
      }
    });
  });
  const _filterDirectories = files => {
    const acc = [];

    return Promise.all(files.map(file => new Promise((accept, reject) => {
      fs.lstat(file, (err, stats) => {
        if (!err) {
          if (stats.isDirectory()) {
            acc.push(file);
          }

          accept();
        } else {
          reject(err);
        }
      });
    }))).then(() => acc);
  };

  return Promise.all([
    path.join(config.dirname, '/core/engines'),
    path.join(config.dirname, '/core/plugins'),
  ].map(_readdir))
    .then(files => _filterDirectories(_flatten(files))
      .then(directories => directories.map(directory => directory.slice(config.dirname.length)))
    );
};

const _listen = () => {
  const listenPromises = [];

  if (flags.site) {
    const site = require('./lib/site');
    listenPromises.push(site.listen(a, config));
  }
  if (flags.hub) {
    const hub = require('./lib/hub');
    listenPromises.push(hub.listen(a, config));
  }
  if (flags.server) {
    const server = require('./lib/server');
    listenPromises.push(server.listen(a, config));
  }

  return Promise.all(listenPromises)
    .then(() => {
      if (flags.site || flags.hub || flags.server) {
        return new Promise((accept, reject) => {
          a.listen(err => {
            if (!err) {
              accept();
            } else {
              reject(err);
            }
          });
        });
      } else {
        return Promise.resolve();
      }
    });
};

const _boot = () => {
  if (flags.hub || flags.server) {
    return _getAllPlugins()
     .then(plugins => a.requestPlugins(plugins));
  } else {
    return Promise.resolve();
  }
};

_ensure()
  .then(() => _listen())
  .then(() => _boot())
  .then(() => {
    if (flags.site) {
      console.log('https://' + config.metadata.site.url + '/');
    }
    if (flags.hub) {
      console.log('https://' + config.metadata.hub.url + '/');
    }
    if (flags.server) {
      const prefix = 'https://' + config.metadata.server.url + '/';
      const suffix = (() => {
        if (/^.+\..+?(?::[0-9]*?)?$/.test(hubUrl)) {
          return '';
        } else {
          return '?username=' + encodeURIComponent(config.metadata.server.username) + '&password=' + encodeURIComponent(config.metadata.server.password);
        }
      })();
      console.log(prefix + suffix);
    }
  })
  .catch(err => {
    console.warn(err);

    process.exit(1);
  });
