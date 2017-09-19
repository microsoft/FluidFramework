import * as debug from "debug";
import * as git from "gitresources";
import * as nconf from "nconf";
import * as path from "path";
import * as winston from "winston";
import * as services from "../services";
import * as utils from "../utils";
import { AlfredRunner } from "./runner";

const provider = nconf.argv().env(<any> "__").file(path.join(__dirname, "../../config.json")).use("memory");

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

(<any> debug).log = (msg, ...args) => winston.info(msg, ...args);
// override the default log format to not include the timestamp since winston will do this for us
// tslint:disable-next-line:only-arrow-functions
(<any> debug).formatArgs = function(args) {
    const name = this.namespace;
    args[0] = name + " " + args[0];
};

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

async function run(): Promise<void> {
    // Create dependent resources
    const mongoUrl = provider.get("mongo:endpoint") as string;
    const mongoFactory = new services.MongoDbFactory(mongoUrl);
    const mongoManager = new utils.MongoManager(mongoFactory);

    const settings = provider.get("git");
    const historian: git.IHistorian = new services.Historian(settings.historian);

    let port = normalizePort(process.env.PORT || "3000");
    const runner = new AlfredRunner(provider, port, historian, mongoManager);

    // Listen for shutdown signal in order to shutdown gracefully
    process.on("SIGTERM", () => {
        runner.stop();
    });

    return runner.start();
}

// Start the runner and listen for any errors
run().then(
    () => {
        winston.info("Exiting");
    },
    (error) => {
        winston.error(error);
        process.exit(1);
    });
