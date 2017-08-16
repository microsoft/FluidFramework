// Load in configuration first before resolving other modules
import * as debug from "debug";
import * as http from "http";
import * as nconf from "nconf";
import * as path from "path";

// Setup the configuration system - pull arguments, then environment letiables
nconf.argv().env(<any> "__").file(path.join(__dirname, "../config.json")).use("memory");

/**
 * Module dependencies.
 */
import app from "./app";

let debugFn = debug("tmp:server");

/**
 * Get port from environment and store in Express.
 */
// tslint:disable-next-line:no-string-literal
let port = normalizePort(process.env["PORT"] || "3000");
app.set("port", port);

/**
 * Create HTTP server.
 */

let server = http.createServer(app);

/**
 * Attach to socket.io connections
 */
// import { default as io } from "./io";
// io.attach(server);

// Start the collaboration server
import * as collabServer from "./collab/server";
collabServer.initialize(server);

/**
 * Listen on provided port, on all network interfaces.
 */

server.listen(port);
server.on("error", onError);
server.on("listening", onListening);

/**
 * Normalize a port into a number, string, or false.
 */

function normalizePort(val) {
  let normalizedPort = parseInt(val, 10);

  if (isNaN(normalizedPort)) {
    // named pipe
    return val;
  }

  if (normalizedPort >= 0) {
    // port number
    return normalizedPort;
  }

  return false;
}

/**
 * Event listener for HTTP server "error" event.
 */

function onError(error) {
  if (error.syscall !== "listen") {
    throw error;
  }

  let bind = typeof port === "string"
    ? "Pipe " + port
    : "Port " + port;

  // handle specific listen errors with friendly messages
  switch (error.code) {
    case "EACCES":
      console.error(bind + " requires elevated privileges");
      process.exit(1);
      break;
    case "EADDRINUSE":
      console.error(bind + " is already in use");
      process.exit(1);
      break;
    default:
      throw error;
  }
}

/**
 * Event listener for HTTP server "listening" event.
 */

function onListening() {
  let addr = server.address();
  let bind = typeof addr === "string"
    ? "pipe " + addr
    : "port " + addr.port;
  debugFn("Listening on " + bind);
}
