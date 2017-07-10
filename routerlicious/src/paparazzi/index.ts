// Setup the configuration system - pull arguments, then environment variables - prior to loading other modules that
// may depend on the config already being initialized
import * as nconf from "nconf";
import * as path from "path";
nconf.argv().env(<any> "__").file(path.join(__dirname, "../../config.json")).use("memory");

import { WorkerService} from "../shared";
import { logger } from "../utils";
import * as utils from "../utils";

// Connect to Alfred for default storage options
const alfredUrl = nconf.get("paparazzi:alfred");

// Subscribe to tmz to receive work.
const tmzUrl = nconf.get("paparazzi:tmz");
const workerConfig = nconf.get("worker");

async function run() {
    const deferred = new utils.Deferred<void>();
    const workerService = new WorkerService(alfredUrl, tmzUrl, workerConfig);
    workerService.connect("Paparazzi").catch((error) => {
        deferred.reject(error);
    });

    return deferred.promise;
}

// Start up the paparazzi service
const runP = run();
runP.catch((error) => {
    logger.error(error);
    process.exit(1);
});
