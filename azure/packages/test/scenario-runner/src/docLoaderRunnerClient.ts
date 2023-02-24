/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import commander from "commander";

import { ConnectionState } from "fluid-framework";

import { AzureClient } from "@fluidframework/azure-client";
import { IFluidContainer } from "@fluidframework/fluid-static";
import { PerformanceEvent } from "@fluidframework/telemetry-utils";
import { timeoutPromise } from "@fluidframework/test-utils";

import { ContainerFactorySchema } from "./interface";
import { getLogger, loggerP } from "./logger";
import { createAzureClient, loadInitialObjSchema } from "./utils";

const eventMap = new Map([
	[
		"fluid:telemetry:RouterliciousDriver:FetchOrdererToken",
		"scenario:runner:DocLoader:Load:FetchOrdererToken",
	],
	[
		"fluid:telemetry:RouterliciousDriver:DiscoverSession",
		"scenario:runner:DocLoader:Load:DiscoverSession",
	],
	[
		"fluid:telemetry:RouterliciousDriver:FetchStorageToken",
		"scenario:runner:DocLoader:Load:FetchStorageToken",
	],
	[
		"fluid:telemetry:RouterliciousDriver:getWholeFlatSummary",
		"scenario:runner:DocLoader:Load:GetSummary",
	],
	["fluid:telemetry:RouterliciousDriver:GetDeltas", "scenario:runner:DocLoader:Load:GetDeltas"],
	["fluid:telemetry:Container:Request", "scenario:runner:DocLoader:Load:RequestDataObject"],
	[
		"fluid:telemetry:RouterliciousDriver:GetDeltaStreamToken",
		"scenario:runner:DocLoader:Connection:GetDeltaStreamToken",
	],
	[
		"fluid:telemetry:RouterliciousDriver:ConnectToDeltaStream",
		"scenario:runner:DocLoader:Connection:ConnectToDeltaStream",
	],
	[
		"fluid:telemetry:Container:ConnectionStateChange",
		"scenario:runner:DocLoader:Connection:ConnectionStateChange",
	],
]);

export interface DocLoaderRunnerConfig {
	runId: string;
	scenarioName: string;
	childId: number;
	docId: string;
	connType: string;
	connEndpoint: string;
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
		.requiredOption("-s, --schema <schema>", "Container Schema")
		.requiredOption("-d, --docId <docId>", "Document id")
		.requiredOption("-r, --runId <runId>", "orchestrator run id.")
		.requiredOption("-s, --scenarioName <scenarioName>", "scenario name.")
		.requiredOption("-c, --childId <childId>", "id of this node client.", parseIntArg)
		.requiredOption("-ct, --connType <connType>", "Connection type")
		.option("-ce, --connEndpoint <connEndpoint>", "Connection endpoint")
		.option("-ti, --tenantId <tenantId>", "Tenant ID")
		.option("-tk, --tenantKey <tenantKey>", "Tenant Key")
		.option("-furl, --functionUrl <functionUrl>", "Azure Function URL")
		.option("-st, --secureTokenProvider", "Enable use of secure token provider")
		.option(
			"-l, --log <filter>",
			"Filter debug logging. If not provided, uses DEBUG env variable.",
		)
		.requiredOption("-v, --verbose", "Enables verbose logging")
		.parse(process.argv);

	const config = {
		runId: commander.runId,
		scenarioName: commander.scenarioName,
		childId: commander.childId,
		docId: commander.docId,
		connType: commander.connType,
		connEndpoint: commander.connEndpoint ?? process.env.azure__fluid__relay__service__endpoint,
		tenantId: commander.tenantId ?? process.env.azure__fluid__relay__service__tenantId,
		tenantKey: commander.tenantKey ?? process.env.azure__fluid__relay__service__tenantKey,
		functionUrl:
			commander.functionUrl ?? process.env.azure__fluid__relay__service__function__url,
		secureTokenProvider: commander.secureTokenProvider,
	};

	if (commander.log !== undefined) {
		process.env.DEBUG = commander.log;
	}

	const logger = await getLogger(
		{
			runId: config.runId,
			scenarioName: config.scenarioName,
			endpoint: config.connEndpoint,
		},
		["scenario:runner"],
		eventMap,
	);

	const ac = await createAzureClient({
		userId: `testUserId_${config.childId}`,
		userName: `testUserName_${config.childId}`,
		connType: config.connType,
		connEndpoint: config.connEndpoint,
		tenantId: config.tenantId,
		tenantKey: config.tenantKey,
		functionUrl: config.functionUrl,
		secureTokenProvider: config.secureTokenProvider,
		logger,
	});

	await execRun(ac, config);
	process.exit(0);
}

async function execRun(ac: AzureClient, config: DocLoaderRunnerConfig): Promise<void> {
	let schema;
	const logger = await getLogger(
		{
			runId: config.runId,
			scenarioName: config.scenarioName,
			namespace: "scenario:runner:DocLoader",
			endpoint: config.connEndpoint,
		},
		["scenario:runner"],
		eventMap,
	);

	try {
		schema = loadInitialObjSchema(JSON.parse(commander.schema) as ContainerFactorySchema);
	} catch {
		throw new Error("Invalid schema provided.");
	}

	let container: IFluidContainer;
	try {
		({ container } = await PerformanceEvent.timedExecAsync(
			logger,
			{ eventName: "load" },
			async () => {
				return ac.getContainer(config.docId, schema);
			},
			{ start: true, end: true, cancel: "generic" },
		));
	} catch {
		throw new Error("Unable to load container.");
	}

	await PerformanceEvent.timedExecAsync(
		logger,
		{ eventName: "connected" },
		async () => {
			if (container.connectionState !== ConnectionState.Connected) {
				return timeoutPromise((resolve) => container.once("connected", () => resolve()), {
					durationMs: 60000,
					errorMsg: "container connect() timeout",
				});
			}
		},
		{ start: true, end: true, cancel: "generic" },
	);

	const scenarioLogger = await loggerP;
	await scenarioLogger.flush();
}

main().catch((error) => {
	console.error(error);
	process.exit(-1);
});
