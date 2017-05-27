const path = require('path');
const fs = require('fs');

class Home {
  constructor(archae) {
    this._archae = archae;
  }

  mount() {
    const {_archae: archae} = this;
    const {express, app, dirname} = archae.getCore();

    const homeImgStatic = express.static(path.join(__dirname, 'lib', 'img'));
    function serveHomeImg(req, res, next) {
      homeImgStatic(req, res, next);
    }
    app.use('/archae/home/img', serveHomeImg);
    const homeDefaultsData = express.static(path.join(dirname, 'defaults', 'data'));
    function serveHomeDefaultsData(req, res, next) {
      homeDefaultsData(req, res, next);
    }
    app.use('/archae/home/defaults/data', serveHomeDefaultsData);

    this._cleanup = () => {
      function removeMiddlewares(route, i, routes) {
        if (
          route.handle.name === 'serveHomeImg' ||
          route.handle.name === 'serveHomeDefaultsData'
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

  unmount() {
    this._cleanup();
  }
}

module.exports = Home;