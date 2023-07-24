/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { ChildProcess } from "child_process";
import { TypedEventEmitter, delay } from "@fluidframework/common-utils";
import {
	IRunConfig,
	IRunner,
	IRunnerEvents,
	IRunnerStatus,
	IScenarioConfig,
	IScenarioRunConfig,
	RunnerStatus,
} from "./interface";
import { convertConfigToScriptParams, createChildProcess } from "./utils";

export abstract class ScenarioRunner<
		ScenarioConfig extends IScenarioConfig,
		ScenarioRunConfig extends IScenarioRunConfig,
		A,
		S = A,
	>
	extends TypedEventEmitter<IRunnerEvents>
	implements IRunner
{
	protected childResults: A[] = [];
	protected status: RunnerStatus = RunnerStatus.NotStarted;
	protected abstract runnerClientFilePath: string;

	constructor(protected readonly scenarioConfig: ScenarioConfig) {
		super();
	}

	protected abstract buildScenarioRunConfig(
		runConfig: IRunConfig,
		options: { childId: number; isSync?: boolean } & Partial<Record<string, any>>,
	): ScenarioRunConfig;

	public async run(config: IRunConfig): Promise<A[]> {
		this.status = RunnerStatus.Running;
		const runnerArgs: string[][] = [];
		const numClients = this.scenarioConfig.numClients ?? 1;
		for (let i = 0; i < numClients; i++) {
			const childArgs: string[] = [
				this.runnerClientFilePath,
				...convertConfigToScriptParams<ScenarioRunConfig>(
					this.runCore(config, { clientIndex: i }),
				),
				"--verbose",
			];
			runnerArgs.push(childArgs);
		}

		const children: Promise<boolean>[] = [];
		const numRunsPerClient = this.scenarioConfig.numRunsPerClient ?? 1;
		for (let j = 0; j < numRunsPerClient; j++) {
			for (const runnerArg of runnerArgs) {
				try {
					children.push(this.spawnChildProcess(runnerArg));
				} catch {
					throw new Error("Failed to spawn child");
				}
				if (this.scenarioConfig.clientStartDelayMs) {
					await delay(this.scenarioConfig.clientStartDelayMs);
				}
			}
		}

		try {
			await Promise.all(children);
		} catch {
			throw new Error("Not all clients closed successfully");
		}

		return this.childResults;
	}

	protected abstract runCore(
		config: IRunConfig,
		info: { clientIndex: number },
	): ScenarioRunConfig;

	public async runSync(config: IRunConfig): Promise<S[]> {
		this.status = RunnerStatus.Running;
		const runs: Promise<S>[] = [];
		const numClients = this.scenarioConfig.numClients ?? 1;
		const numRunsPerClient = this.scenarioConfig.numRunsPerClient ?? 1;
		for (let j = 0; j < numRunsPerClient; j++) {
			for (let i = 0; i < numClients; i++) {
				runs.push(this.runSyncCore(config, { clientIndex: i }));
				if (this.scenarioConfig.clientStartDelayMs) {
					await delay(this.scenarioConfig.clientStartDelayMs);
				}
			}
		}
		try {
			const results = await Promise.all(runs);
			this.status = RunnerStatus.Success;
			return results;
		} catch (error) {
			this.status = RunnerStatus.Error;
			throw new Error(`Not all clients closed successfully.\n${error}`);
		}
	}

	protected abstract runSyncCore(config: IRunConfig, info: { clientIndex: number }): Promise<S>;

	public stop(): void {}

	public getStatus(): IRunnerStatus {
		return {
			status: this.status,
			description: this.description(),
			details: {},
		};
	}

	protected abstract description(): string;

	protected async spawnChildProcess(childArgs: string[]): Promise<boolean> {
		return createChildProcess(childArgs, (runnerProcess) =>
			this.additionalChildProcessSetup(runnerProcess),
		);
	}

	protected additionalChildProcessSetup(runnerProcess: ChildProcess): void {}
}
