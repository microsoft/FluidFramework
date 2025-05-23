/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IKafkaResources, KafkaRunnerFactory } from "@fluidframework/server-lambdas-driver";
import * as core from "@fluidframework/server-services-core";
import { runService } from "@fluidframework/server-services-shared";
import { configureLogging } from "@fluidframework/server-services-utils";
import commander from "commander";
import nconf from "nconf";
import * as winston from "winston";

export function execute(
	factoryFn: (name: string, lambda: string) => core.IResourcesFactory<IKafkaResources>,
	configOrPath: nconf.Provider | string,
) {
	// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
	const packageDetails = require("../../package.json");

	let action = false;
	commander
		.version(packageDetails.version)
		.arguments("<name> <lambda>")
		.action((name: string, lambda: string) => {
			configureLogging(configOrPath);
			action = true;

			runService(
				factoryFn(name, lambda),
				new KafkaRunnerFactory(),
				winston,
				name,
				configOrPath,
			);
		})
		.parse(process.argv);

	if (!action) {
		commander.help();
	}
}
