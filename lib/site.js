const path = require('path');
const fs = require('fs');

const httpProxy = require('http-proxy');
const modulequery = require('modulequery');
const transclude = require('transclude');
const vrid = require('vrid');

const listen = a => {
  const {
    dirname,
    metadata: {
      site: {
        url: siteUrl,
      },
      hub: {
        url: hubUrl,
      },
      home: {
        url: homeUrl,
      },
      forum: {
        url: forumUrl,
      },
    },
  } = a;

  const _readFile = (p, opts) => new Promise((accept, reject) => {
    fs.readFile(p, opts, (err, d) => {
      if (!err) {
        accept(d);
      } else {
        reject(err);
      }
    });
  });

  const _listenProxy = () => new Promise((accept, reject) => {
    const _listenHubProxy = () => {
      a.app.get('/servers/servers.json', (req, res, next) => {
        res.redirect(hubUrl + '/servers/servers.json');
      });
    };
    _listenForumProxy = () => {
      const forumProxy = httpProxy.createProxyServer({
        target: forumUrl,
        xfwd: true,
      });

      a.app.all(/^\/forum(?:\/|$)/, (req, res, next) => {
        forumProxy.web(req, res);
      });
    };

    _listenHubProxy();
    _listenForumProxy();

    accept();
  });
  const _listenSearch = () => new Promise((accept, reject) => {
    const mq = modulequery({
      dirname: dirname,
      modulePath: path.join('/', 'plugins'),
    });

    a.app.get('/modules/modules.json', (req, res, next) => {
      const q = req.query.q ? decodeURIComponent(req.query.q) : '';

      mq.search(q, {
        keywords: ['zeo-module'],
      })
        .then(modSpecs => {
          res.json(modSpecs);
        })
        .catch(err => {
          res.status(500);
          res.send(err.stack);
        });
    });
    a.app.get('/modules/module.json', (req, res, next) => {
      const q = req.query.q ? decodeURIComponent(req.query.q) : '';

      mq.getModule(q)
        .then(modSpec => {
          res.json(modSpec);
        })
        .catch(err => {
          res.status(500);
          res.send(err.stack);
        });
    });

    accept();
  });
  const _listenWallet = ({headerHtml, headerCss}) => Promise.all([
    vrid({
      prefix: '/id',
      head: `\
        <style>
          ${headerCss}
        </style>
      `,
      body: `\
        ${headerHtml}
        <script>
          window.$ = s => document.querySelectorAll(s);

          $('navbar > a').forEach(el => {
            if (el.classList.contains('id')) {
              el.classList.add('selected');
            } else {
              el.classList.remove('selected');
            }
          });
        </script>
      `,
      origin: siteUrl,
      sso: {
        secretKey: 'password',
        emailDomain: 'address.zeovr.io',
        redirectUrl: siteUrl + '/forum/session/sso_login',
      },
    }).requestApp(),
    vrid({
      prefix: '/id/iframe',
      origin: siteUrl,
      sso: {
        secretKey: 'password',
        emailDomain: 'address.zeovr.io',
        redirectUrl: siteUrl + '/forum/session/sso_login',
      },
    }).requestApp()
  ])
    .then(handlers => {
      for (let i = 0; i < handlers.length; i++) {
        const handler = handlers[i];
        a.app.use(handler);
      }
    });
  const _listenPublic = ({headerHtml}) => {
    const _transcludeHtml = p => transclude.requestFileTranscludeRequestHandler(path.join(__dirname, '..', 'public', p), s => s.replace('<!-- header.html -->', headerHtml));

    Promise.all([
      _transcludeHtml('site.html'),
      _transcludeHtml('doc/docs.html'),
      _transcludeHtml('modules.html'),
      _transcludeHtml('module.html'),
      _transcludeHtml('buy.html'),
      _transcludeHtml('buy-success.html'),
      _transcludeHtml('servers.html'),
    ])
    .then(([
      siteHtmlHandler,
      docsHtmlHandler,
      modulesHtmlHandler,
      moduleHtmlHandler,
      buyHtmlHandler,
      buySuccessHtmlHandler,
      serversHtmlHandler,
    ]) => new Promise((accept, reject) => {
      a.app.get(/^\/(docs|modules|buy(?:-success)?|servers)?((?:(?:\/|\?).*)?)$/, (req, res, next) => {
        const page = req.params[0];
        const tail = req.params[1];

        if (page === 'docs') {
          docsHtmlHandler(req, res, next);
        } else if (page === 'modules') {
          if (/^\//.test(tail)) {
            moduleHtmlHandler(req, res, next);
          } else {
            modulesHtmlHandler(req, res, next);
          }
        } else if (page === 'buy') {
          buyHtmlHandler(req, res, next);
        } else if (page === 'buy-success') {
          buySuccessHtmlHandler(req, res, next);
        } else if (page === 'servers') {
          serversHtmlHandler(req, res, next);
        } else {
          siteHtmlHandler(req, res, next);
        }
      });

      accept();
    }));
  };

  return Promise.all([
    _readFile(path.join(__dirname, '..', 'public', 'header.html'), 'utf8'),
    _readFile(path.join(__dirname, '..', 'public', 'css', 'header.css'), 'utf8'),
  ])
    .then(([
      headerHtml,
      headerCss,
    ]) => Promise.all([
      _listenProxy(),
      _listenSearch(),
      _listenWallet({headerHtml, headerCss}),
      _listenPublic({headerHtml}),
    ]))
    .then(() => {});
};

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
    return undefined;
  }
};

module.exports = {
  listen,
};
