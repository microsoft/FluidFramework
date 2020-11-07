/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as http from "http";
import * as path from "path";
import * as debug from "debug";
import nconf from "nconf";
import * as winston from "winston";
import * as app from "./app";
import { ExternalStorageManager } from "./externalStorageManager";

/**
 * Normalize a port into a number, string, or false.
 */
function normalizePort(val) {
    const normalizedPort = parseInt(val, 10);

    if (isNaN(normalizedPort)) {
        // named pipe
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return val;
    }

    if (normalizedPort >= 0) {
    // port number
        return normalizedPort;
    }

    return false;
}

const provider = nconf.argv().env("__" as any).file(path.join(__dirname, "../config.json")).use("memory");

/**
 * Default logger setup
 */
const loggerConfig = provider.get("logger");
winston.configure({
    transports: [
        new winston.transports.Console({
            colorize: loggerConfig.colorize,
            handleExceptions: true,
            json: loggerConfig.json,
            level: loggerConfig.level,
            stringify: (obj) => JSON.stringify(obj),
            timestamp: loggerConfig.timestamp,
        }),
    ],
});

// Update debug library to output to winston
(debug as any).log = (msg, ...args) => winston.info(msg, ...args);
// override the default log format to not include the timestamp since winston will do this for us
(debug as any).formatArgs = function(args) {
    const name = this.namespace;
    args[0] = `${name} ${args[0]}`;
};

/**
 * Get port from environment and store in Express.
 */
const port = normalizePort(process.env.PORT || "3000");
const externalStorageManager = new ExternalStorageManager(provider);
const historian = app.create(provider, externalStorageManager);
historian.set("port", port);

/**
 * Create HTTP server.
 */

const server = http.createServer(historian);

/**
 * Event listener for HTTP server "error" event.
 */

function onError(error) {
    if (error.syscall !== "listen") {
        throw error;
    }

    const bind = typeof port === "string"
        ? `Pipe ${  port}`
        : `Port ${  port}`;

    // handle specific listen errors with friendly messages
    switch (error.code) {
        case "EACCES":
            winston.error(`${bind} requires elevated privileges`);
            process.exit(1);
        case "EADDRINUSE":
            winston.error(`${bind} is already in use`);
            process.exit(1);
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
        ? `pipe ${  addr}`
        : `port ${  addr.port}`;
    winston.info(`Listening on ${bind}`);
}

/**
 * Listen on provided port, on all network interfaces.
 */

server.listen(port);
server.on("error", onError);
server.on("listening", onListening);
