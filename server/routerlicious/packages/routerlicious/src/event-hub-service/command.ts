/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IKafkaResources, KafkaRunnerFactory } from "@microsoft/fluid-server-lambdas-driver";
import * as utils from "@microsoft/fluid-server-services-utils";
import * as commander from "commander";

export function execute(
    factoryFn: (name: string, lambda: string) => utils.IResourcesFactory<IKafkaResources>,
    configFile: string) {
    // tslint:disable-next-line:no-var-requires
    const packageDetails = require("../../package.json");

    let action = false;
    commander
        .version(packageDetails.version)
        .arguments("<name> <lambda>")
        .action((name: string, lambda: string) => {
            action = true;
            utils.runService(
                factoryFn(name, lambda),
                new KafkaRunnerFactory(),
                name,
                configFile);
        })
        .parse(process.argv);

    if (!action) {
        commander.help();
    }
}
