const Bullet = require('bullet');

const OPEN = 1; // ws.OPEN
const engineKey = 'engine';
const worldKey = 'world';

class Context {
  constructor() {
    this.objects = new Map(); // clientId -> Object
    this.updateIndex = new Map(); // engineId -> clientId
    this.children = new Map(); // parentId -> [childId]

    const engine = new Bullet();
    this.setEngine(engine);

    const world = new Bullet.World();
    this.setWorld(world);
    engine.add(world);
  }

  getEngine() {
    return this.objects.get(engineKey);
  }

  setEngine(engine) {
    this.objects.set(engineKey, engine);
  }

  getWorld() {
    return this.objects.get(worldKey);
  }

  setWorld(world) {
    return this.objects.set(worldKey, world);
  }

  hasRunnableObjects() {
    const {objects} = this;

    const _hasInstanceOf = type => {
      for (const [k, v] of objects) {
        if (v instanceof type) {
          return true;
        }
      }
      return false;
    };

    return _hasInstanceOf(Bullet.Body);
  }

  create(type, id, opts) {
    if (!this.objects.has(id)) {
      const object = (() => {
        switch (type) {
          case 'plane': return new Bullet.Plane(opts);
          case 'box': return new Bullet.Box(opts);
          case 'sphere': return new Bullet.Sphere(opts);
          case 'convexHull': return new Bullet.ConvexHull(opts);
          case 'triangleMesh': return new Bullet.TriangleMesh(opts);
          case 'compound': return new Bullet.Compound(opts);
          case 'constraint': {
            const {bodyAId, bodyBId, pivotA, pivotB} = opts;
            const bodyA = this.objects.get(bodyAId);
            const bodyB = this.objects.get(bodyBId);

            return new Bullet.Constraint({
              bodyA,
              bodyB,
              pivotA,
              pivotB,
            });
          }
          default: return null;
        }
      })();

      this.objects.set(id, object);
      this.updateIndex.set(object.id, id);

      const engine = this.getEngine();
      if (!engine.running && this.hasRunnableObjects()) {
        engine.start();
      }
    }
  }

  destroy(id) {
    const object = this.objects.get(id);
    if (object) {
      this.objects.delete(id);
      this.updateIndex.delete(object.id);
    }

    const childIds = this.children.get(id);
    if (childIds) {
      for (let i = 0; i < childIds.length; i++) {
        const childId = childIds[i];
        this.destroy(childId);
      }
      this.children.delete(id);
    }

    const engine = this.getEngine();
    if (engine.running && !this.hasRunnableObjects()) {
      engine.stop();
    }
  }

  add(parentId, childId) {
    const {objects} = this;

    const parent = objects.get(parentId);
    const child = objects.get(childId);
    parent.add(child);

    let childIds = this.children.get(parentId);
    if (!childIds) {
      childIds = [];
      this.children.set(parentId, childIds);
    }
    childIds.push(childId);
  }

  remove(parentId, childId) {
    const {objects} = this;

    const parent = objects.get(parentId);
    const child = objects.get(childId);
    if (parent && child) {
      parent.remove(child);

      const childIds = this.children.get(parentId);
      childIds.splice(childIds.indexOf(childId), 1);
      if (childIds.length === 0) {
        this.children.delete(parentId);
      }
    }
  }

  setPosition(id, position) {
    const {objects} = this;

    const object = objects.get(id);
    const [x, y, z] = position;
    object.setPosition(x, y, z);
  }

  setRotation(id, rotation) {
    const {objects} = this;

    const object = objects.get(id);
    const [x, y, z, w] = rotation;
    object.setRotation(x, y, z, w);
  }

  setLinearVelocity(id, linearVelocity) {
    const {objects} = this;

    const object = objects.get(id);
    const [x, y, z] = linearVelocity;
    object.setLinearVelocity(x, y, z);
  }

  setAngularVelocity(id, angularVelocity) {
    const {objects} = this;

    const object = objects.get(id);
    const [x, y, z] = angularVelocity;
    object.setAngularVelocity(x, y, z);
  }

  setLinearFactor(id, linearFactor) {
    const {objects} = this;

    const object = objects.get(id);
    const [x, y, z] = linearFactor;
    object.setLinearFactor(x, y, z);
  }

  setAngularFactor(id, angularFactor) {
    const {objects} = this;

    const object = objects.get(id);
    const [x, y, z] = angularFactor;
    object.setAngularFactor(x, y, z);
  }

  activate(id) {
    const {objects} = this;

    const object = objects.get(id);
    object.activate();
  }

  deactivate(id) {
    const {objects} = this;

    const object = objects.get(id);
    object.deactivate();
  }

  disableDeactivation(id) {
    const {objects} = this;

    const object = objects.get(id);
    object.disableDeactivation();
  }

  setIgnoreCollisionCheck(sourceBodyId, targetBodyId, ignore) {
    const {objects} = this;

    const sourceBody = objects.get(sourceBodyId);
    const targetBody = objects.get(targetBodyId);
    sourceBody.setIgnoreCollisionCheck(targetBody, ignore);
  }

  requestInit(id, cb) {
    const {objects} = this;

    const object = objects.get(id);
    if (object) {
      object.requestInit();
      object.once('init', objects => {
        cb(null, objects);
      });
    } else {
      cb(null, []);
    }
  }

  requestUpdate(id, cb) {
    const {objects} = this;

    const object = objects.get(id);
    if (object) {
      object.requestUpdate();
      object.once('update', engineUpdates => {
        const clientUpdates = engineUpdates.map(update => {
          const {id: engineId, position, rotation, linearVelocity, angularVelocity} = update;
          const clientId = this.updateIndex.get(engineId);

          return {
            id: clientId,
            position,
            rotation,
            linearVelocity,
            angularVelocity,
          };
        });

        cb(null, clientUpdates);
      });
    } else {
      cb(null, []);
    }
  }
}

class BulletServer {
  constructor(archae) {
    this._archae = archae;
  }

  mount() {
    const {_archae: archae} = this;
    const {wss} = archae.getCore();

    const context = new Context();

    const connections = [];

    wss.on('connection', c => {
      const {url} = c.upgradeReq;

      if (url === '/archae/bulletWs') {
        const _sendInit = () => {

          const {objects} = this;
          const e = {
          };
          const er = JSON.stringify(e);
          // c.send(es);
        };
        _sendInit();

        c.on('message', s => {
          const m = _jsonParse(s);

          if (typeof m === 'object' && m !== null && typeof m.method === 'string' && Array.isArray(m.args) && typeof m.id === 'string') {
            const {method, id, args} = m;

            const cb = (err = null, result = null) => {
              if (c.readyState === OPEN) {
                const e = {
                  id: id,
                  error: err,
                  result: result,
                };
                const es = JSON.stringify(e);
                c.send(es);
              }
            };

            if (method === 'create') {
              const [type, id, opts] = args;
              context.create(type, id, opts);

              cb();
            } else if (method === 'destroy') {
              const [id] = args;
              context.destroy(id);

              cb();
            } else if (method === 'add') {
              const [parentId, childId] = args;
              context.add(parentId, childId);

              cb();
            } else if (method === 'addConnectionBound') {
              const [parentId, childId] = args;
              context.add(parentId, childId);

              c.on('close', () => {
                context.remove(parentId, childId);
              });

              cb();
            } else if (method === 'remove') {
              const [parentId, childId] = args;
              context.remove(parentId, childId);

              cb();
            } else if (method === 'setPosition') {
              const [id, position, activate] = args;
              context.setPosition(id, position, activate);

              cb();
            } else if (method === 'setRotation') {
              const [id, rotation, activate] = args;
              context.setRotation(id, rotation, activate);

              cb();
            } else if (method === 'setLinearVelocity') {
              const [id, linearVelocity, activate] = args;
              context.setLinearVelocity(id, linearVelocity, activate);

              cb();
            } else if (method === 'setAngularVelocity') {
              const [id, angularVelocity, activate] = args;
              context.setAngularVelocity(id, angularVelocity, activate);

              cb();
            } else if (method === 'setLinearFactor') {
              const [id, linearFactor, activate] = args;
              context.setLinearFactor(id, linearFactor, activate);

              cb();
            } else if (method === 'setAngularFactor') {
              const [id, angularFactor, activate] = args;
              context.setAngularFactor(id, angularFactor, activate);

              cb();
            } else if (method === 'activate') {
              const [id] = args;
              context.activate(id);

              cb();
            } else if (method === 'deactivate') {
              const [id] = args;
              context.deactivate(id);

              cb();
            } else if (method === 'disableDeactivation') {
              const [id] = args;
              context.disableDeactivation(id);

              cb();
            } else if (method === 'setIgnoreCollisionCheck') {
              const [sourceId, targetId, ignore] = args;
              context.setIgnoreCollisionCheck(sourceId, targetId, ignore);

              cb();
            } else if (method === 'requestInit') {
              const [id] = args;
              context.requestInit(id, (err, objects) => {
                if (live) {
                  cb(err, objects);
                }
              });
            } else if (method === 'requestUpdate') {
              const [id] = args;
              context.requestUpdate(id, (err, updates) => {
                if (live) {
                  cb(err, updates);
                }
              });
            } else {
              const err = new Error('no such method:' + JSON.stringify(method));
              cb(err.stack);
            }
          } else {
            console.warn('invalid message', m);
          }
        });
        c.on('close', () => {
          connections.splice(connections.indexOf(c), 1);
        });

        connections.push(c);
      }
    });

    let live = true;
    this._cleanup = () => {
      for (let i = 0; i < connections.length; i++) {
        const connection = connections[i];
        connection.close();
      }

      live = false;
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

module.exports = BulletServer;
