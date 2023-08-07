/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import child_process from "child_process";
import { v4 as uuid } from "uuid";

import { TypedEventEmitter } from "@fluidframework/common-utils";
import { AzureClient } from "@fluidframework/azure-client";
import { SharedMap } from "@fluidframework/map";
import { PerformanceEvent } from "@fluidframework/telemetry-utils";
import { timeoutPromise } from "@fluidframework/test-utils";

import {
	AzureClientConnectionConfig,
	ContainerFactorySchema,
	IRunConfig,
	IRunner,
	IRunnerEvents,
	IRunnerStatus,
	RunnnerStatus,
} from "./interface";
import {
	AzureClientConfig,
	createAzureClient,
	delay,
	getScenarioRunnerTelemetryEventMap,
	loadInitialObjSchema,
} from "./utils";
import { getLogger } from "./logger";

// This was originally namespaced as "DocLoader"
const eventMap = getScenarioRunnerTelemetryEventMap("MapTraffic");

export interface MapTrafficRunnerConfig {
	connectionConfig: AzureClientConnectionConfig;
	docId: string;
	schema: ContainerFactorySchema;
	numClients: number;
	clientStartDelayMs: number;
	writeRatePerMin: number;
	sharedMapKey: string;
	totalWriteCount: number;
	client?: AzureClient;
}

export interface MapTrafficRunnerRunConfig
	extends IRunConfig,
		Pick<
			AzureClientConfig,
			| "connType"
			| "connEndpoint"
			| "tenantId"
			| "tenantKey"
			| "functionUrl"
			| "secureTokenProvider"
		> {
	childId: number;
	docId: string;
	writeRatePerMin: number;
	totalWriteCount: number;
	sharedMapKey: string;
	schema: ContainerFactorySchema;
	region?: string;
	client?: AzureClient;
}

export class MapTrafficRunner extends TypedEventEmitter<IRunnerEvents> implements IRunner {
	private status: RunnnerStatus = "notStarted";
	constructor(public readonly c: MapTrafficRunnerConfig) {
		super();
	}

	public async run(config: IRunConfig): Promise<void> {
		this.status = "running";

		await this.spawnChildRunners(config);
		this.status = "success";
	}

	private async spawnChildRunners(config: IRunConfig): Promise<void> {
		this.status = "running";
		const runnerArgs: string[][] = [];
		for (let i = 0; i < this.c.numClients; i++) {
			const connection = this.c.connectionConfig;
			const childArgs: string[] = [
				"./dist/mapTrafficRunnerClient.js",
				"--runId",
				config.runId,
				"--scenarioName",
				config.scenarioName,
				"--childId",
				i.toString(),
				"--docId",
				this.c.docId,
				"--schema",
				JSON.stringify(this.c.schema),
				"--writeRatePerMin",
				this.c.writeRatePerMin.toString(),
				"--totalWriteCount",
				this.c.totalWriteCount.toString(),
				"--sharedMapKey",
				this.c.sharedMapKey,
				"--connType",
				connection.type,
				...(connection.endpoint ? ["--connEndpoint", connection.endpoint] : []),
				...(connection.useSecureTokenProvider ? ["--secureTokenProvider"] : []),
				...(connection.region ? ["--region", connection.region] : []),
			];
			childArgs.push("--verbose");
			runnerArgs.push(childArgs);
		}

		const children: Promise<boolean>[] = [];
		for (const runnerArg of runnerArgs) {
			try {
				children.push(this.createChild(runnerArg));
			} catch {
				throw new Error("Failed to spawn child");
			}
			await delay(this.c.clientStartDelayMs);
		}

		try {
			await Promise.all(children);
		} catch {
			throw new Error("Not all clients closed successfully.");
		}
	}

	public async runSync(config: IRunConfig): Promise<void> {
		this.status = "running";
		const connection = this.c.connectionConfig;
		const docId = this.c.docId;
		const connType = connection.type;
		const connEndpoint = connection.endpoint;
		const tenantId = connection.tenantId;
		const tenantKey = connection.key;
		const functionUrl = connection.functionUrl;
		const secureTokenProvider = connection.useSecureTokenProvider;
		const totalWriteCount = this.c.totalWriteCount;
		const writeRatePerMin = this.c.writeRatePerMin;
		const sharedMapKey = this.c.sharedMapKey;
		const schema = this.c.schema;
		const client = this.c.client;
		const runs: Promise<void>[] = [];
		for (let i = 0; i < this.c.numClients; i++) {
			runs.push(
				MapTrafficRunner.execRun({
					...config,
					childId: i,
					docId,
					connType,
					connEndpoint,
					tenantId,
					tenantKey,
					functionUrl,
					secureTokenProvider,
					schema,
					totalWriteCount,
					writeRatePerMin,
					sharedMapKey,
					client,
				}),
			);
		}
		try {
			await Promise.all(runs);
			this.status = "success";
		} catch {
			this.status = "error";
			throw new Error("Not all clients closed succesfully.");
		}
	}

	public static async execRun(runConfig: MapTrafficRunnerRunConfig): Promise<void> {
		let schema;
		const logger =
			runConfig.logger ??
			(await getLogger(
				{
					runId: runConfig.runId,
					scenarioName: runConfig.scenarioName,
					namespace: "scenario:runner:MapTraffic",
					endpoint: runConfig.connEndpoint,
					region: runConfig.region,
				},
				["scenario:runner"],
				eventMap,
			));

		const ac =
			runConfig.client ??
			(await createAzureClient({
				userId: `testUserId_${runConfig.childId}`,
				userName: `testUserName_${runConfig.childId}`,
				connType: runConfig.connType,
				connEndpoint: runConfig.connEndpoint,
				tenantId: runConfig.tenantId,
				tenantKey: runConfig.tenantKey,
				functionUrl: runConfig.functionUrl,
				secureTokenProvider: runConfig.secureTokenProvider,
				logger,
			}));

		try {
			schema = loadInitialObjSchema(runConfig.schema);
		} catch {
			throw new Error("Invalid schema provided.");
		}

		const { container } = await PerformanceEvent.timedExecAsync(
			logger,
			{ eventName: "ContainerLoad", clientId: runConfig.childId },
			async (_event) => {
				return ac.getContainer(runConfig.docId, schema);
			},
			{ start: true, end: true, cancel: "generic" },
		);

		const msBetweenWrites = 60000 / runConfig.writeRatePerMin;
		const initialObjectsCreate = container.initialObjects;
		const map = initialObjectsCreate[runConfig.sharedMapKey] as SharedMap;

		for (let i = 0; i < runConfig.totalWriteCount; i++) {
			await delay(msBetweenWrites);
			// console.log(`Simulating write ${i} for client ${config.runId}`)
			map.set(uuid(), "test-value");
		}

		await PerformanceEvent.timedExecAsync(
			logger,
			{ eventName: "Catchup", clientId: runConfig.childId },
			async (_event) => {
				await timeoutPromise((resolve) => container.once("saved", () => resolve()), {
					durationMs: 20000,
					errorMsg: "datastoreSaveAfterAttach timeout",
				});
			},
			{ start: true, end: true, cancel: "generic" },
		);
	}

	public stop(): void {}

	public getStatus(): IRunnerStatus {
		return {
			status: this.status,
			description: this.description(),
			details: {},
		};
	}

	private description(): string {
		return `This stage runs SharedMap traffic on multiple clients.`;
	}

	private async createChild(childArgs: string[]): Promise<boolean> {
		const envVar = { ...process.env };
		const runnerProcess = child_process.spawn("node", childArgs, {
			stdio: "inherit",
			env: envVar,
		});

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
}
