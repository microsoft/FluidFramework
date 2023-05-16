/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { AzureClient } from "@fluidframework/azure-client";
import { TypedEventEmitter } from "@fluidframework/common-utils";

import { IRunConfig, IRunner, IRunnerEvents, IRunnerStatus, RunnnerStatus } from "./interface";
import { createAzureClient, getScenarioRunnerTelemetryEventMap } from "./utils";
import { getLogger } from "./logger";

const eventMap = getScenarioRunnerTelemetryEventMap("AzureClient");

export interface ICustomUserDetails {
	gender: string;
	email: string;
}

export interface AzureClientRunnerConnectionConfig {
	type: "remote" | "local";
	endpoint: string;
	funTokenProvider?: string;
	useSecureTokenProvider?: boolean;
}
export interface AzureClientRunnerConfig {
	connectionConfig: AzureClientRunnerConnectionConfig;
	userId?: string;
	userName?: string;
	region?: string;
}
export type AzureClientRunnerRunConfig = AzureClientRunnerConfig & IRunConfig;

export class AzureClientRunner extends TypedEventEmitter<IRunnerEvents> implements IRunner {
	private status: RunnnerStatus = "notStarted";
	constructor(private readonly c: AzureClientRunnerConfig) {
		super();
	}

	public async run(config: IRunConfig): Promise<AzureClient> {
		this.status = "running";

		try {
			const ac = await AzureClientRunner.execRun({
				...config,
				...this.c,
			});

			this.status = "success";
			return ac;
		} catch {
			this.status = "error";
			throw new Error("Failed to create client");
		}
	}

	public async runSync(config: IRunConfig): Promise<AzureClient> {
		return this.run(config);
	}

	public static async execRun(runConfig: AzureClientRunnerRunConfig): Promise<AzureClient> {
		const connEndpoint =
			runConfig.connectionConfig.endpoint ??
			process.env.azure__fluid__relay__service__endpoint;
		const region = runConfig.region;
		const logger =
			runConfig.logger ??
			(await getLogger(
				{
					runId: runConfig.runId,
					scenarioName: runConfig.scenarioName,
					namespace: "scenario:runner:AzureClient",
					endpoint: connEndpoint,
					region,
				},
				["scenario:runner"],
				eventMap,
			));
		const ac = await createAzureClient({
			connType: runConfig.connectionConfig.type,
			connEndpoint,
			userId: runConfig.userId ?? "testUserId",
			userName: runConfig.userName ?? "testUserId",
			tenantId: process.env.azure__fluid__relay__service__tenantId,
			tenantKey: process.env.azure__fluid__relay__service__tenantKey,
			functionUrl: process.env.azure__fluid__relay__service__function__url,
			secureTokenProvider: runConfig.connectionConfig.useSecureTokenProvider,
			logger,
		});
		return ac;
	}

	public getStatus(): IRunnerStatus {
		return {
			status: this.status,
			description: this.description(),
			details: {},
		};
	}

	public stop(): void {}

	private description(): string {
		return `Creating ${this.c.connectionConfig.type} Azure Client pointing to: ${this.c.connectionConfig.endpoint}`;
	}
}
