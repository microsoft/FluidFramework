/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import commander from "commander";

import { ContainerFactorySchema } from "./interface";
import { MapTrafficRunner, MapTrafficRunnerRunConfig } from "./MapTrafficRunner";

export interface MapTrafficRunnerConfig {
	runId: string;
	scenarioName: string;
	childId: number;
	docId: string;
	writeRatePerMin: number;
	totalWriteCount: number;
	sharedMapKey: string;
	connType: string;
	connEndpoint: string;
	region?: string;
}

async function main() {
	const parseIntArg = (value: any): number => {
		if (isNaN(parseInt(value, 10))) {
			throw new commander.InvalidArgumentError("Not a number.");
		}
		return parseInt(value, 10);
	};
	commander
		.version("0.0.1")
		.requiredOption("-d, --docId <docId>", "Document ID to target")
		.requiredOption("-s, --schema <schema>", "Container Schema")
		.requiredOption("-r, --runId <runId>", "orchestrator run id.")
		.requiredOption("-s, --scenarioName <scenarioName>", "scenario name.")
		.requiredOption("-c, --childId <childId>", "id of this node client.", parseIntArg)
		.requiredOption("-wr, --writeRatePerMin <writeRatePerMin>", "Rate of writes", parseIntArg)
		.requiredOption(
			"-wc, --totalWriteCount <totalWriteCount>",
			"Total write count",
			parseIntArg,
		)
		.requiredOption("-k, --sharedMapKey <sharedMapKey>", "Shared map location")
		.requiredOption("-ct, --connType <connType>", "Connection type")
		.option("-ce, --connEndpoint <connEndpoint>", "Connection endpoint")
		.option("-ti, --tenantId <tenantId>", "Tenant ID")
		.option("-tk, --tenantKey <tenantKey>", "Tenant Key")
		.option("-furl, --functionUrl <functionUrl>", "Azure Function URL")
		.option("-st, --secureTokenProvider", "Enable use of secure token provider")
		.option("-rg, --region <region>", "Alias of Azure region where the tenant is running from")
		.option(
			"-l, --log <filter>",
			"Filter debug logging. If not provided, uses DEBUG env variable.",
		)
		.requiredOption("-v, --verbose", "Enables verbose logging")
		.parse(process.argv);

	const config: MapTrafficRunnerRunConfig = {
		runId: commander.runId,
		scenarioName: commander.scenarioName,
		childId: commander.childId,
		docId: commander.docId,
		writeRatePerMin: commander.writeRatePerMin,
		totalWriteCount: commander.totalWriteCount,
		sharedMapKey: commander.sharedMapKey,
		connType: commander.connType,
		connEndpoint: commander.connEndpoint ?? process.env.azure__fluid__relay__service__endpoint,
		tenantId: commander.tenantId ?? process.env.azure__fluid__relay__service__tenantId,
		tenantKey: commander.tenantKey ?? process.env.azure__fluid__relay__service__tenantKey,
		functionUrl:
			commander.functionUrl ?? process.env.azure__fluid__relay__service__function__url,
		secureTokenProvider: commander.secureTokenProvider,
		region: commander.region ?? process.env.azure__fluid__relay__service__region,
		schema: JSON.parse(commander.schema) as ContainerFactorySchema,
	};

	if (commander.log !== undefined) {
		process.env.DEBUG = commander.log;
	}

	if (config.docId === undefined) {
		console.error("Missing --docId argument needed to run child process");
		process.exit(-1);
	}

	await MapTrafficRunner.execRun(config);
	process.exit(0);
}

main().catch((error) => {
	console.error(error);
	process.exit(-1);
});
