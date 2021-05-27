/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { inspect } from "util";
import nconf from "nconf";
import { ILogger, IResources, IResourcesFactory, IRunnerFactory } from "@fluidframework/server-services-core";

/**
 * Uses the provided factories to create and execute a runner.
 */
export async function run<T extends IResources>(
    config: nconf.Provider,
    resourceFactory: IResourcesFactory<T>,
    runnerFactory: IRunnerFactory<T>,
    logger: ILogger | undefined) {
    const resources = await resourceFactory.create(config);
    const runner = await runnerFactory.create(resources);

    // Start the runner and then listen for the message to stop it
    const runningP = runner
        .start(logger)
        .catch(async (error) => {
            await runner
                    .stop()
                    .catch((innerError) => {
                        logger?.error(`Could not stop runner due to error: ${innerError}`);
                        error.forceKill = true;
                    });
            return Promise.reject(error);
        });

    process.on("SIGTERM", () => {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        runner.stop();
    });

    // Wait for the runner to complete
    await runningP;

    // And then dispose of any resources
    await resources.dispose();
}

/**
 * Variant of run that is used to fully run a service. It configures base settings such as logging. And then will
 * exit the service once the runner completes.
 */
export function runService<T extends IResources>(
    resourceFactory: IResourcesFactory<T>,
    runnerFactory: IRunnerFactory<T>,
    logger: ILogger | undefined,
    group: string,
    configOrPath: nconf.Provider | string,
) {
    const config = typeof configOrPath === "string"
        ? nconf.argv().env({ separator: "__", parseValues: true }).file(configOrPath).use("memory")
        : configOrPath;

    const runningP = run(config, resourceFactory, runnerFactory, logger);

    runningP.then(
        () => {
            logger?.info("Exiting");
            process.exit(0);
        },
        (error) => {
            logger?.error(`${group} service exiting due to error`);
            logger?.error(inspect(error));
            if (error.forceKill) {
                process.kill(process.pid, "SIGKILL");
            } else {
                process.exit(1);
            }
        });
}
