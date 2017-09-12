
// Setup the configuration system - pull arguments, then environment variables - prior to loading other modules that
// may depend on the config already being initialized
import * as nconf from "nconf";
import * as path from "path";
import * as winston from "winston";
nconf.argv().env(<any> "__").file(path.join(__dirname, "../../config.json")).use("memory");

import * as shared from "../shared";

// Connect to alfred and tmz and subscribes for work.
const alfredUrl = nconf.get("paparazzi:alfred");
const tmzUrl = nconf.get("paparazzi:tmz");
const workerConfig = nconf.get("worker");
const gitConfig = nconf.get("git");

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
