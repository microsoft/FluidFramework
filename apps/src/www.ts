// Setup the configuration system first since modules may depend on it being configured
import * as http from "http";
import * as nconf from "nconf";
import * as path from "path";
import * as winston from "winston";
import * as app from "./app";
import { configureLogging } from "./logger";

const configFile = path.join(__dirname, "../config.json");
const config = nconf.argv().env("__" as any).file(configFile).use("memory");

// Configure winston logger.
configureLogging(config.get("logger"));

/**
 * Get port from environment and store in Express.
 */
// tslint:disable-next-line:no-string-literal
const port = normalizePort(process.env["PORT"] || config.get("port"));
const expressApp = app.create(config);
expressApp.set("port", port);

/**
 * Create HTTP server.
 */

const server = http.createServer(expressApp);

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
  const normalizedPort = parseInt(val, 10);

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

  const bind = typeof port === "string"
    ? "Pipe " + port
    : "Port " + port;

  // handle specific listen errors with friendly messages
  switch (error.code) {
    case "EACCES":
      winston.error(bind + " requires elevated privileges");
      process.exit(1);
      break;
    case "EADDRINUSE":
      winston.error(bind + " is already in use");
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
  const addr = server.address();
  const bind = typeof addr === "string"
    ? "pipe " + addr
    : "port " + addr.port;
  winston.info("Listening on " + bind);
}
