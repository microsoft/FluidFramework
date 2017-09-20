
// Setup the configuration system - pull arguments, then environment variables - prior to loading other modules that
// may depend on the config already being initialized
import * as nconf from "nconf";
import * as path from "path";
import * as winston from "winston";
import * as shared from "../shared";

const provider = nconf.argv().env(<any> "__").file(path.join(__dirname, "../../config/config.json")).use("memory");

// Connect to alfred and tmz and subscribes for work.
const alfredUrl = nconf.get("paparazzi:alfred");
const tmzUrl = nconf.get("paparazzi:tmz");
const workerConfig = nconf.get("worker");
const gitConfig = nconf.get("git");

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
            label: loggerConfig.label,
            level: loggerConfig.level,
            stringify: (obj) => JSON.stringify(obj),
            timestamp: loggerConfig.timestamp,
        }),
    ],
});

async function run() {
    const workerService = new shared.WorkerService(
        alfredUrl,
        tmzUrl,
        gitConfig.historian,
        gitConfig.repository,
        workerConfig);
    const workerRunningP = workerService.connect("Paparazzi");
    const deferred = new shared.Deferred<void>();
    workerRunningP.then(
        () => {
            winston.info("Resolved");
            deferred.resolve();
        }, (error) => {
            deferred.reject(error);
        });

    process.on("SIGTERM", () => {
        workerService.close().then(
            () => {
                deferred.resolve();
            }, (error) => {
                deferred.reject(error);
            });
    });

    return deferred.promise;
}

// Start up the paparazzi service
const runP = run();
runP.then(
    () => {
        process.exit(0);
    },
    (error) => {
        winston.error(error);
        process.exit(1);
    });
