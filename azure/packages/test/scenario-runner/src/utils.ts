/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import child_process from "child_process";

import {
	AzureClient,
	AzureLocalConnectionConfig,
	AzureRemoteConnectionConfig,
	ITokenProvider,
	IUser,
} from "@fluidframework/azure-client";
import { ContainerSchema } from "@fluidframework/fluid-static";
import { SharedMap } from "@fluidframework/map/internal";
import { ITelemetryLoggerExt } from "@fluidframework/telemetry-utils/internal";
import { InsecureTokenProvider } from "@fluidframework/test-runtime-utils/internal";
import commander from "commander";
import { v4 as uuid } from "uuid";

import { AzureFunctionTokenProvider } from "./AzureFunctionTokenProvider.js";
import {
	AzureClientConnectionConfig,
	ContainerFactorySchema,
	IRunConfig,
} from "./interface.js";

export interface AzureClientConfig {
	id?: string;
	name?: string;
	logger?: ITelemetryLoggerExt;
}

export const delay = async (timeMs: number): Promise<void> =>
	new Promise((resolve) => setTimeout(() => resolve(), timeMs));

export function loadInitialObjSchema(source: ContainerFactorySchema): ContainerSchema {
	const schema: ContainerSchema = {
		initialObjects: {},
	};

	for (const k of Object.keys(source.initialObjects)) {
		// Todo: more DDS types to add.
		if (source.initialObjects[k] === "SharedMap") {
			schema.initialObjects[k] = SharedMap;
		}
	}
	return schema;
}

export function convertConfigToScriptParams<T extends IRunConfig>(config: T): string[] {
	const params: string[] = [];
	Object.entries(config).forEach(([key, value]) => {
		const paramName = `--${key}`;
		if (value === undefined) {
			return;
		}
		if (typeof value === "string") {
			params.push(paramName, value);
		}
		params.push(paramName, JSON.stringify(value));
	});
	return params;
}

export function createAzureTokenProvider(
	fnUrl: string,
	id?: string,
	name?: string,
): AzureFunctionTokenProvider {
	return new AzureFunctionTokenProvider(`${fnUrl}/api/GetFrsToken`, {
		id: id ?? "foo",
		name: name ?? "bar",
	});
}

export function createInsecureTokenProvider(
	tenantKey: string,
	id?: string,
	name?: string,
): InsecureTokenProvider {
	const user: IUser & { name: string } = {
		id: id ?? "foo",
		name: name ?? "bar",
	};
	return new InsecureTokenProvider(tenantKey, user);
}

export function getAzureClientConnectionConfigFromEnv(): AzureClientConnectionConfig {
	const partialConfig: Partial<AzureClientConnectionConfig> = {
		endpoint: process.env.azure__fluid__relay__service__endpoint,
		tenantId: process.env.azure__fluid__relay__service__tenantId,
		key: process.env.azure__fluid__relay__service__tenantKey,
		functionUrl: process.env.azure__fluid__relay__service__function__url,
		region: process.env.azure__fluid__relay__service__region,
	};
	const type =
		partialConfig.tenantId && (partialConfig.key ?? partialConfig.functionUrl)
			? "remote"
			: "local";
	const useSecureTokenProvider = partialConfig.functionUrl !== undefined && !partialConfig.key;
	return {
		...partialConfig,
		type,
		useSecureTokenProvider,
	};
}

/**
 * This function will determine if local or remote mode is required (based on FLUID_CLIENT), and return a new
 * {@link AzureClient} instance based on the mode by setting the Connection config accordingly.
 */
export async function createAzureClient(config: AzureClientConfig): Promise<AzureClient> {
	const connectionConfig = getAzureClientConnectionConfigFromEnv();
	const useAzure = connectionConfig.type === "remote";

	if (!connectionConfig.endpoint) {
		throw new Error("Missing AFR configuration: Relay Service Endpoint URL.");
	}

	let connectionProps: AzureRemoteConnectionConfig | AzureLocalConnectionConfig;

	if (useAzure) {
		if (!connectionConfig.tenantId) {
			throw new Error("Missing AFR configuration: Tenant ID.");
		}

		let tokenProvider: ITokenProvider;
		/* Insecure Token Provider */
		if (!connectionConfig.useSecureTokenProvider) {
			if (!connectionConfig.key) {
				throw new Error("Missing AFR configuration: Tenant Primary Key.");
			}
			tokenProvider = createInsecureTokenProvider(
				connectionConfig.key,
				config.id,
				config.name,
			);
		} else {
			/* Secure Token Provider (Azure Function) */
			if (!connectionConfig.functionUrl) {
				throw new Error("Missing AFR configuration: Function URL.");
			}
			tokenProvider = createAzureTokenProvider(
				connectionConfig.functionUrl,
				config.id,
				config.name,
			);
		}
		connectionProps = {
			tenantId: connectionConfig.tenantId,
			tokenProvider,
			endpoint: connectionConfig.endpoint,
			type: "remote",
		};
	} else {
		connectionProps = {
			tokenProvider: new InsecureTokenProvider("fooBar", {
				id: uuid(),
				name: uuid(),
			}),
			endpoint: connectionConfig.endpoint,
			type: "local",
		};
	}

	return new AzureClient({ connection: connectionProps, logger: config.logger });
}

export async function createChildProcess(
	childArgs: string[],
	additionalSetup?: (runnerProcess: child_process.ChildProcess) => void,
): Promise<boolean> {
	const envVar = { ...process.env };
	const runnerProcess = child_process.spawn("node", childArgs, {
		stdio: "inherit",
		env: envVar,
	});

	if (additionalSetup !== undefined) {
		additionalSetup(runnerProcess);
	}

	return new Promise((resolve, reject) =>
		runnerProcess.once("close", (status) => {
			if (status === 0) {
				resolve(true);
			} else {
				reject(new Error("Client failed to complet the tests sucesfully."));
			}
		}),
	);
}

export type ScenarioRunnerTelemetryEventNames =
	| RouterliciousDriverTelemetryEventNames
	| FluidContainerTelemetryEventNames
	| FluidSummarizerTelemetryEventNames;

export enum FluidSummarizerTelemetryEventNames {
	Summarize = "fluid:telemetry:Summarizer:Running:Summarize",
}

export enum FluidContainerTelemetryEventNames {
	Request = "fluid:telemetry:Container:Request",
	ConnectionStateChange = "fluid:telemetry:Container:ConnectionStateChange",
}

export enum RouterliciousDriverTelemetryEventNames {
	FetchOrdererToken = "fluid:telemetry:RouterliciousDriver:FetchOrdererToken",
	FetchStorageToken = "fluid:telemetry:RouterliciousDriver:FetchStorageToken",
	CreateNew = "fluid:telemetry:RouterliciousDriver:CreateNew",
	DocPostCreateCallback = "fluid:telemetry:RouterliciousDriver:DocPostCreateCallback",
	DiscoverSession = "fluid:telemetry:RouterliciousDriver:DiscoverSession",
	uploadSummaryWithContext = "fluid:telemetry:RouterliciousDriver:uploadSummaryWithContext",
	getWholeFlatSummary = "fluid:telemetry:RouterliciousDriver:getWholeFlatSummary",
	GetDeltas = "fluid:telemetry:RouterliciousDriver:GetDeltas",
	GetDeltaStreamToken = "fluid:telemetry:RouterliciousDriver:GetDeltaStreamToken",
	ConnectToDeltaStream = "fluid:telemetry:RouterliciousDriver:ConnectToDeltaStream",
}

export function getScenarioRunnerTelemetryEventMap(
	scenario?: string,
): Map<ScenarioRunnerTelemetryEventNames, string> {
	const scenarioName = scenario ? `:${scenario}` : "";
	return new Map<ScenarioRunnerTelemetryEventNames, string>([
		[
			RouterliciousDriverTelemetryEventNames.FetchOrdererToken,
			`scenario:runner${scenarioName}:Attach:FetchOrdererToken`,
		],
		[
			RouterliciousDriverTelemetryEventNames.CreateNew,
			`scenario:runner${scenarioName}:Attach:CreateNew`,
		],
		[
			RouterliciousDriverTelemetryEventNames.DiscoverSession,
			`scenario:runner${scenarioName}:Load:DiscoverSession`,
		],
		[
			RouterliciousDriverTelemetryEventNames.FetchStorageToken,
			`scenario:runner${scenarioName}:Attach:FetchStorageToken`,
		],
		[
			RouterliciousDriverTelemetryEventNames.getWholeFlatSummary,
			`scenario:runner${scenarioName}:Load:GetSummary`,
		],
		[
			RouterliciousDriverTelemetryEventNames.GetDeltas,
			`scenario:runner${scenarioName}:Load:GetDeltas`,
		],
		[
			FluidContainerTelemetryEventNames.Request,
			`scenario:runner${scenarioName}:Load:RequestDataObject`,
		],
		[
			RouterliciousDriverTelemetryEventNames.DocPostCreateCallback,
			`scenario:runner${scenarioName}:Attach:DocPostCreateCallback`,
		],
		[
			RouterliciousDriverTelemetryEventNames.GetDeltaStreamToken,
			`scenario:runner${scenarioName}:Connection:GetDeltaStreamToken`,
		],
		[
			RouterliciousDriverTelemetryEventNames.ConnectToDeltaStream,
			`scenario:runner${scenarioName}:Connection:ConnectToDeltaStream`,
		],
		[
			FluidContainerTelemetryEventNames.ConnectionStateChange,
			`scenario:runner${scenarioName}:Connection:ConnectionStateChange`,
		],
		[
			RouterliciousDriverTelemetryEventNames.GetDeltas,
			`scenario:runner${scenarioName}:Summarize:UploadSummary`,
		],
		[
			FluidSummarizerTelemetryEventNames.Summarize,
			`scenario:runner${scenarioName}:Summarize:Summarized`,
		],
	]);
}

export function commanderParseIntArg(value: any): number {
	if (isNaN(parseInt(value, 10))) {
		throw new commander.InvalidArgumentError("Not a number.");
	}
	return parseInt(value, 10);
}
export function getCommander(): commander.CommanderStatic {
	return commander
		.version("0.0.1")
		.requiredOption("-r, --runId <runId>", "orchestrator run id.")
		.requiredOption("-s, --scenarioName <scenarioName>", "scenario name.")
		.requiredOption("-c, --childId <childId>", "id of this node client.", commanderParseIntArg)
		.option(
			"-l, --log <filter>",
			"Filter debug logging. If not provided, uses DEBUG env variable.",
		)
		.requiredOption("-v, --verbose", "Enables verbose logging");
}
