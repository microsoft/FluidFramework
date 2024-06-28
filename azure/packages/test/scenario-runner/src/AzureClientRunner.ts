/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import { AzureClient } from "@fluidframework/azure-client";

import {
	IRunConfig,
	IRunner,
	IRunnerEvents,
	IRunnerStatus,
	RunnerStatus,
} from "./interface.js";
import { getLogger } from "./logger.js";
import {
	createAzureClient,
	getAzureClientConnectionConfigFromEnv,
	getScenarioRunnerTelemetryEventMap,
} from "./utils.js";

const eventMap = getScenarioRunnerTelemetryEventMap("AzureClient");

export interface ICustomUserDetails {
	gender: string;
	email: string;
}

export interface AzureClientRunnerConfig {
	id?: string;
	name?: string;
}
export type AzureClientRunnerRunConfig = AzureClientRunnerConfig & IRunConfig;

export class AzureClientRunner extends TypedEventEmitter<IRunnerEvents> implements IRunner {
	private status: RunnerStatus = RunnerStatus.NotStarted;
	constructor(private readonly c: AzureClientRunnerConfig) {
		super();
	}

	public async run(config: IRunConfig): Promise<AzureClient> {
		this.status = RunnerStatus.Running;

		try {
			const ac = await AzureClientRunner.execRun({
				...config,
				...this.c,
			});

			this.status = RunnerStatus.Success;
			return ac;
		} catch {
			this.status = RunnerStatus.Error;
			throw new Error("Failed to create client");
		}
	}

	public async runSync(config: IRunConfig): Promise<AzureClient> {
		return this.run(config);
	}

	public static async execRun(runConfig: AzureClientRunnerRunConfig): Promise<AzureClient> {
		const logger =
			runConfig.logger ??
			(await getLogger(
				{
					runId: runConfig.runId,
					scenarioName: runConfig.scenarioName,
					namespace: "scenario:runner:AzureClient",
				},
				["scenario:runner"],
				eventMap,
			));
		const ac = await createAzureClient({
			id: runConfig.id ?? "testUserId",
			name: runConfig.name ?? "testUserId",
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
		const connectionConfig = getAzureClientConnectionConfigFromEnv();
		return `Creating ${connectionConfig.type} Azure Client pointing to: ${connectionConfig.endpoint}`;
	}
}
