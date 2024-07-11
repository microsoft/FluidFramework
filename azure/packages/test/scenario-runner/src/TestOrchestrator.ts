/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "node:fs";
import path from "node:path";

import {
	ITelemetryLoggerExt,
	PerformanceEvent,
} from "@fluidframework/telemetry-utils/internal";
import * as yaml from "js-yaml";
import { v4 as uuid } from "uuid";

import { AzureClientRunner, AzureClientRunnerConfig } from "./AzureClientRunner.js";
import { DocCreatorRunner, DocCreatorRunnerConfig } from "./DocCreatorRunner.js";
import { DocLoaderRunner, DocLoaderRunnerConfig } from "./DocLoaderRunner.js";
import { MapTrafficRunner, MapTrafficRunnerConfig } from "./MapTrafficRunner.js";
import { NestedMapRunner, NestedMapRunnerConfig } from "./NestedMapRunner.js";
import { IRunner } from "./interface.js";
import { getLogger } from "./logger.js";
import { getScenarioRunnerTelemetryEventMap } from "./utils.js";

const eventMap = getScenarioRunnerTelemetryEventMap();

export interface IStageParams {
	[key: string]: unknown;
}
export interface IEnvVars {
	[key: string]: unknown;
}
export interface IStage {
	id: number;
	description?: string;
	name: string;
	package: string;
	params: IStageParams;
	out: string;
}

export interface RunConfig {
	title: string;
	description: string;
	env: IEnvVars;
	stages: IStage[];
}

export interface VersionedRunConfig {
	version: string;
	config: RunConfig;
}

export interface TestOrchestratorConfig {
	version: string;
}

export type RunStatus = "notStarted" | "running" | "done";
export type StageStatus = "notStarted" | "running" | "success" | "error";

export interface IRunStatus {
	title: string;
	description: string;
	status: string;
	stages: IStageStatus[];
}
export interface IStageStatus {
	id: number;
	title: string;
	description?: string;
	status: StageStatus;
	details: unknown;
}

export class TestOrchestrator {
	private readonly runId = uuid();
	private runStatus: RunStatus = "notStarted";
	private readonly doc: RunConfig;
	private readonly env = new Map<string, unknown>();
	private readonly stageStatus = new Map<number, IStageStatus>();
	private readonly useSingleProcess: boolean;
	constructor(private readonly c: TestOrchestratorConfig) {
		this.doc = TestOrchestrator.getConfig(this.c.version);
		this.useSingleProcess = this.doc.env.parallelProcesses === false;
	}

	public static getConfigs(): VersionedRunConfig[] {
		return [{ version: "v1", config: this.getConfig("v1") }];
	}

	public static getConfig(version: string): RunConfig {
		return yaml.load(fs.readFileSync(this.getConfigFileName(version), "utf8")) as RunConfig;
	}

	public async run(): Promise<boolean> {
		this.runStatus = "running";
		const logger = await getLogger(
			{
				runId: this.runId,
				scenarioName: this.doc?.title,
				namespace: "scenario:runner",
			},
			["scenario:runner"],
			eventMap,
		);

		const success = await PerformanceEvent.timedExecAsync(
			logger,
			{ eventName: "RunStages" },
			async () => {
				return this.execRun(logger);
			},
			{ start: true, end: true, cancel: "generic" },
		);
		this.runStatus = "done";
		return success;
	}

	private async execRun(logger: ITelemetryLoggerExt): Promise<boolean> {
		if (!this.doc) {
			throw new Error("Invalid config.");
		}

		if (this.useSingleProcess) {
			this.env.set(`\${logger}`, logger);
		}

		for (const key of Object.keys(this.doc.env)) {
			this.env.set(`\${${key}}`, this.doc.env[key]);
		}

		for (const stage of this.doc.stages) {
			this.fillEnvForStage(stage.params);
			const runner = this.createRunner(stage);
			if (runner) {
				try {
					console.log("Starting stage:", stage.name);
					await PerformanceEvent.timedExecAsync(
						logger,
						{ eventName: "RunStage", stageName: stage.name },
						async () => {
							const r = await this.runStage(runner, stage, logger);
							if (r !== undefined && stage.out !== undefined) {
								this.env.set(stage.out, r);
							}
						},
						{ start: true, end: true, cancel: "generic" },
					);

					console.log("done with stage", stage.name);
					this.stageStatus.set(stage.id, {
						id: stage.id,
						status: "success",
						title: stage.name,
						description: stage.description,
						details: {},
					});
				} catch (error) {
					this.stageStatus.set(stage.id, {
						id: stage.id,
						status: "error",
						title: stage.name,
						description: error as string,
						details: {},
					});
					console.log("Stage exited with error:", stage.name, error);
					return false;
				}
			}
		}
		return true;
	}

	public getStatus(): IRunStatus {
		const r: IStageStatus[] = [];
		for (const [, value] of this.stageStatus) {
			r.push(value);
		}
		const stages = r.sort((a, b) => (a.id < b.id ? -1 : 1));

		return {
			title: this.doc?.title ?? "title",
			description: this.doc?.description ?? "description",
			status: this.runStatus,
			stages,
		};
	}

	private fillEnvForStage(params: IStageParams): void {
		for (const key of Object.keys(params)) {
			const val = params[key];
			if (typeof val === "string" && val.startsWith("$")) {
				params[key] = this.env.get(val);
			}
		}
	}

	private createRunner(stage: IStage): IRunner | undefined {
		switch (stage.package) {
			case "azure-client": {
				return new AzureClientRunner(stage.params as unknown as AzureClientRunnerConfig);
			}
			case "doc-creator": {
				return new DocCreatorRunner(stage.params as unknown as DocCreatorRunnerConfig);
			}
			case "doc-loader": {
				return new DocLoaderRunner(stage.params as unknown as DocLoaderRunnerConfig);
			}
			case "nested-maps": {
				return new NestedMapRunner(stage.params as unknown as NestedMapRunnerConfig);
			}
			case "shared-map-traffic": {
				return new MapTrafficRunner(stage.params as unknown as MapTrafficRunnerConfig);
			}
			default: {
				console.log("unknown stage:", stage);
			}
		}
	}

	private async runStage(
		runner: IRunner,
		stage: IStage,
		logger: ITelemetryLoggerExt,
	): Promise<unknown> {
		// Initial status
		const initStatus = runner.getStatus();
		this.stageStatus.set(stage.id, {
			id: stage.id,
			title: stage.name,
			description: initStatus?.description ?? stage.description,
			status: initStatus.status,
			details: initStatus.details,
		});

		// Handle events
		runner.on("status", (e) => {
			this.stageStatus.set(stage.id, {
				id: stage.id,
				title: stage.name,
				description: e?.description ?? stage.description,
				status: e.status,
				details: JSON.stringify(e.details),
			});
			console.log("state change --------------->:");
			console.log(this.getStatus());
		});

		if (this.useSingleProcess) {
			// exec
			return runner.runSync({
				runId: this.runId,
				scenarioName: this.doc?.title ?? "",
				logger,
			});
		}
		// exec with possible child processes
		return runner.run({
			runId: this.runId,
			scenarioName: this.doc?.title ?? "",
			logger,
		});
	}

	private static getConfigFileName(version: string): string {
		switch (version) {
			case "v1": {
				return "./testConfig_v1.yml";
			}
			default: {
				return path.join(process.cwd(), version);
			}
		}
	}
}
