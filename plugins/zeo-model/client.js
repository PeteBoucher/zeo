const modelsPath = '/archae/models/models/';

const MODELS = { // XXX fold these transforms into the models themselves
  cloud: {
    path: 'https://cdn.rawgit.com/modulesio/zeo-data/29412380b29e98b18c746a373bdb73aeff59e27a/models/cloud/cloud.json',
    position: [0, 0.65, 0],
    rotation: [0, Math.PI, 0],
    scale: [0.5, 0.5, 0.5],
  },
  lightning: {
    path: 'lightning/lightning.json',
    position: [0, 0.8, 0],
    rotation: [0, Math.PI, 0],
    scale: [0.014, 0.014, 0.014],
  },
  vanille: {
    path: 'vanille/vanille.json',
    position: [0, 0.8, 0],
    rotation: [0, Math.PI, 0],
    scale: [0.014, 0.014, 0.014],
  },
  ellie: {
    path: 'ellie/ellie.json',
    position: [0, 0, 0],
    rotation: [-Math.PI / 2, 0, 0],
    scale: [1, 1, 1],
  },
  pc: {
    path: 'pc/pc.json',
    position: [0, 0, 0],
    rotation: [0, Math.PI, 0],
    scale: [0.025, 0.025, 0.025],
  },
};

class Model {
  mount() {
    const {three: {THREE, scene}, elements} = zeo;
 
    const _requestModel = file => file.fetch({
      type: 'json',
    }).then(modelJson => new Promise((accept, reject) => {
      const loader = new THREE.ObjectLoader();

      const {url} = file;
      const texturePath = url.substring(0, url.lastIndexOf('/') + 1);
      loader.setTexturePath(texturePath);
      loader.parse(modelJson, accept);
    }));

    class ModelElement extends HTMLElement {
      createdCallback() {
        this.position = null;
        this.mesh = null;

        this._cancelRequest = null;

        this._cleanup = () => {
          const {mesh, _cancelRequest: cancelRequest} = this;
          if (mesh) {
            scene.remove(mesh);
          }
          if (cancelRequest) {
            cancelRequest();
          }
        };
      }

      destructor() {
        this._cleanup();
      }

      attributeValueChangedCallback(name, oldValue, newValue) {
        switch (name) {
          case 'position': {
            this.position = newValue;

            this._updateMesh();

            break;
          }
          case 'model': {
            const {mesh: oldMesh, _cancelRequest: cancelRequest} = this;
            if (oldMesh) {
              scene.remove(oldMesh);
              this.mesh = null;
            }
            if (cancelRequest) {
              cancelRequest();
            }

            let live = true;
            this._cancelRequest = () => {
              live = false;
            };

            const file = newValue;
            _requestModel(file)
              .then(mesh => {
                if (live) {
                  scene.add(mesh);
                  this.mesh = mesh;

                  this._updateMesh();

                  this._cancelRequest = null;
                }
              })
              .catch(err => {
                console.warn('failed to load model', err);
              });

            break;
          }
        }
      }

      _updateMesh() {
        const {mesh, position} = this;

        if (mesh && position) {
          mesh.position.set(position[0], position[1], position[2]);
          mesh.quaternion.set(position[3], position[4], position[5], position[6]);
          mesh.scale.set(position[7], position[8], position[9]);
        }
      }
    }
    elements.registerElement(this, ModelElement);

    this._cleanup = () => {
      elements.unregisterElement(this);
    };
  }

  unmount() {
    this._cleanup();
  }
}

module.exports = Model;
