/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import child_process from "child_process";

import { TypedEventEmitter } from "@fluidframework/common-utils";

import { IRunConfig, IRunner, IRunnerEvents, IRunnerStatus, RunnnerStatus } from "./interface";
import { delay } from "./utils";

export interface AzureClientConfig {
	type: "remote" | "local";
	endpoint?: string;
	key?: string;
	tenantId?: string;
	useSecureTokenProvider?: boolean;
}

export interface ContainerTrafficSchema {
	initialObjects: { [key: string]: string };
	dynamicObjects?: { [key: string]: string };
}

export interface MapTrafficRunnerConfig {
	connectionConfig: AzureClientConfig;
	docId: string;
	schema: ContainerTrafficSchema;
	numClients: number;
	clientStartDelayMs: number;
	writeRatePerMin: number;
	sharedMapKey: string;
	totalWriteCount: number;
}

export class MapTrafficRunner extends TypedEventEmitter<IRunnerEvents> implements IRunner {
	private status: RunnnerStatus = "notStarted";
	constructor(public readonly c: MapTrafficRunnerConfig) {
		super();
	}

	public async run(config: IRunConfig): Promise<void> {
		this.status = "running";

		await this.execRun(config);
		this.status = "success";
	}

	public async execRun(config: IRunConfig): Promise<void> {
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
			throw new Error("Not all clients closed sucesfully.");
		}
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
