/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as utils from "@prague/services-utils";
import * as nconf from "nconf";
import * as path from "path";
import * as winston from "winston";
import { JarvisResourcesFactory, JarvisRunnerFactory } from "./runnerFactory";

/**
 * Variant of run that is used to fully run a service. It configures base settings such as logging. And then will
 * exit the service once the runner completes.
 */
export function runService<T extends utils.IResources>(
    resourceFactory: utils.IResourcesFactory<T>,
    runnerFactory: utils.IRunnerFactory<T>,
    group: string,
    configFile = path.join(__dirname, "../../config.json")) {

    const config = nconf.argv().env("__" as any).file(configFile).use("memory");
    const loggingConfig = config.get("logger");
    utils.configureLogging(loggingConfig);

    winston.configure({
        format: winston.format.simple(),
        transports: [
            new winston.transports.Console({ handleExceptions: true, level: loggingConfig.level}),
        ],
    });

    const errorTrackingConfig = config.get("error");
    let runningP;

    // TODO enable once error tracking is exported
    if (errorTrackingConfig.track) {
        // const errorTracker = new utils.NodeErrorTrackingService(errorTrackingConfig.endpoint);
        // errorTracker.track(() => {
        runningP = utils.run(config, resourceFactory, runnerFactory);
        // });
    } else {
        runningP = utils.run(config, resourceFactory, runnerFactory);
    }

    // notify of connection
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

runService(new JarvisResourcesFactory(), new JarvisRunnerFactory(), "jarvis");
