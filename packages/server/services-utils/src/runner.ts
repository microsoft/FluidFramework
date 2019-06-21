/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as nconf from "nconf";
import * as winston from "winston";
import { NodeErrorTrackingService } from "./errorTrackingService";
import { configureLogging } from "./logger";

/**
 * A runner represents a task that starts once start is called. And ends when either start completes
 * or stop is called.
 */
export interface IRunner {
    /**
     * Starts the runner
     */
    start(): Promise<void>;

    /**
     * Stops the runner
     */
    stop(): Promise<void>;
}

/**
 * Base interfaces for resources that can be provided to a runner
 */
export interface IResources {
    /**
     * Disposes fo the resources
     */
    dispose(): Promise<void>;
}

/**
 * A resource factory is used to create the resources needed by a runner
 */
export interface IResourcesFactory<T extends IResources> {
    /**
     * Creates a new set of resources
     */
    create(config: nconf.Provider): Promise<T>;
}

/**
 * A runner factory is used to create new runners
 */
export interface IRunnerFactory<T> {
    /**
     * Creates a new runner
     */
    create(resources: T): Promise<IRunner>;
}

interface IErrorTrackingConfig {
    track: boolean;
    endpoint: string;
}

/**
 * Uses the provided factories to create and execute a runner.
 */
export async function run<T extends IResources>(
    config: nconf.Provider,
    resourceFactory: IResourcesFactory<T>,
    runnerFactory: IRunnerFactory<T>) {

    const resources = await resourceFactory.create(config);
    const runner = await runnerFactory.create(resources);

    // Start the runner and then listen for the message to stop it
    const runningP = runner.start();
    process.on("SIGTERM", () => {
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
    group: string,
    configFile: string) {

    const config = nconf.argv().env("__" as any).file(configFile).use("memory");
    configureLogging(config.get("logger"));

    const errorTrackingConfig = config.get("error") as IErrorTrackingConfig;
    let runningP;
    if (errorTrackingConfig.track) {
        const errorTracker = new NodeErrorTrackingService(errorTrackingConfig.endpoint);
        errorTracker.track(() => {
            runningP = run(config, resourceFactory, runnerFactory);
        });
    } else {
        runningP = run(config, resourceFactory, runnerFactory);
    }

    // notify of connection
    runningP.then(
        () => {
            winston.info("Exiting");
            process.exit(0);
        },
        (error) => {
            winston.error("Service exiting due to error", error);
            process.exit(1);
        });
}
