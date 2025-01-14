// Note that to use the websocket server, you also need the web server enabled

export const DEFAULT = {
  servers: {
    websocket: (config) => {
      return {
        enabled:
          process.env.WEB_SERVER === "true" || process.env.NODE_ENV === "test",
        // you can pass a FQDN (string) here or 'window.location.origin'
        clientUrl:
          process.env.NODE_ENV === "test"
            ? "http://localhost"
            : process.env.WEB_URL || "window.location.origin",
        // Directory to render client-side JS.
        // Path should start with "/" and will be built starting from config..general.paths.public
        clientJsPath: "client-js/",
        // the name of the client-side JS file to render.  Both `.js` and `.min.js` versions will be created
        // do not include the file exension
        // set to `undefined` to not render the client-side JS on boot
        clientJsName: "grouparoo-websocket-client",
        // should the server signal clients to not reconnect when the server is shutdown/reboot
        destroyClientsOnShutdown: false,

        // websocket Server Options:
        server: {
          // authorization: null,
          // pathname:      '/primus',
          // parser:        'JSON',
          // transformer:   'websockets',
          // plugin:        {},
          // timeout:       35000,
          // origins:       '*',
          // methods:       ['GET','HEAD','PUT','POST','DELETE','OPTIONS'],
          // credentials:   true,
          // maxAge:        '30 days',
          // exposed:       false,
        },

        // websocket Client Options:
        client: {
          apiPath: "/api", // the api base endpoint on your actionhero server
          // the cookie name we should use for shared authentication between WS and web connections
          cookieKey: config.servers.web.fingerprintOptions.cookieKey,
          // reconnect:        {},
          // timeout:          10000,
          // ping:             25000,
          // pong:             10000,
          // strategy:         "online",
          // manual:           false,
          // websockets:       true,
          // network:          true,
          // transport:        {},
          // queueSize:        Infinity,
        },
      };
    },
  },
};
