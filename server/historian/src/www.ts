/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as http from "http";
import * as path from "path";
import * as debug from "debug";
import * as nconf from "nconf";
import * as redis from "redis";
import * as winston from "winston";
import * as app from "./app";
import * as services from "./services";

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
// tslint:disable-next-line:only-arrow-functions
(debug as any).formatArgs = function(args) {
    const name = this.namespace;
    args[0] = `${name  } ${  args[0]}`;
};

// Create services
const riddlerEndpoint = provider.get("riddler");
const riddler = new services.RiddlerService(riddlerEndpoint);

const redisConfig = provider.get("redis");
const redisOptions: redis.ClientOpts = { password: redisConfig.pass };
// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
if (redisConfig.tls) {
    redisOptions.tls = {
        serverName: redisConfig.host,
    };
}

const redisClient = redis.createClient(redisConfig.port, redisConfig.host);
const cache = new services.RedisCache(redisClient);

// Create the historian app
const historian = app.create(provider, riddler, cache);

/**
 * Get port from environment and store in Express.
 */
// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
const port = normalizePort(process.env.PORT || "3000");
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
            winston.error(`${bind  } requires elevated privileges`);
            process.exit(1);
            break;
        case "EADDRINUSE":
            winston.error(`${bind  } is already in use`);
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
        ? `pipe ${  addr}`
        : `port ${  addr.port}`;
    winston.info(`Listening on ${  bind}`);
}

/**
 * Listen on provided port, on all network interfaces.
 */

server.listen(port);
server.on("error", onError);
server.on("listening", onListening);

// Listen for shutdown signal in order to shutdown gracefully
process.on("SIGTERM", () => {
    server.close(() => {
        process.exit(0);
    });
});
