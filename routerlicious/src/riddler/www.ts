import * as nconf from "nconf";
import * as path from "path";
import * as winston from "winston";
import * as utils from "../utils";
import { configureLogging } from "../utils/logger";
import { RiddlerResourcesFactory, RiddlerRunnerFactory } from "./runnerFactory";

runService(new RiddlerResourcesFactory(), new RiddlerRunnerFactory());

function runService<T extends utils.IResources>(
    resourceFactory: utils.IResourcesFactory<T>,
    runnerFactory: utils.IRunnerFactory<T>,
    configFile = path.join(__dirname, "../../config/config.json")) {

    const config = nconf.argv().env(<any> "__").file(configFile).use("memory");
    configureLogging(config.get("logger"));

    // notify of connection
    const runningP = runTracked(config, resourceFactory, runnerFactory);
    runningP.then(
        () => {
            winston.info("Exiting");
            process.exit(0);
        },
        (error) => {
            winston.error("Service exiting due to error");
            winston.error(error);
            process.exit(1);
        });
}

async function runTracked<T extends utils.IResources>(
    config: nconf.Provider,
    resourceFactory: utils.IResourcesFactory<T>,
    runnerFactory: utils.IRunnerFactory<T>): Promise<void> {

    // Run the service. The return result is null if run ran to completion. Or the error itself. We await on it
    // so that we won't send the leave message until the run completes.
    const runError = await utils.run(config, resourceFactory, runnerFactory).then(() => null, (error) => error);

    return runError ? Promise.reject(runError) : Promise.resolve();
}
