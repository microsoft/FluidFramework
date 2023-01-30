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

export interface DocLoaderSchema {
	initialObjects: { [key: string]: string };
	dynamicObjects?: { [key: string]: string };
}

export interface DocLoaderRunnerConfig {
	connectionConfig: AzureClientConfig;
	schema: DocLoaderSchema;
	docIds: string[];
	clientStartDelayMs: number;
	numOfLoads?: number;
}

export class DocLoaderRunner extends TypedEventEmitter<IRunnerEvents> implements IRunner {
	private status: RunnnerStatus = "notStarted";
	constructor(public readonly c: DocLoaderRunnerConfig) {
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
		let i = 0;
		for (const docId of this.c.docIds) {
			const connection = this.c.connectionConfig;
			const childArgs: string[] = [
				"./dist/docLoaderRunnerClient.js",
				"--runId",
				config.runId,
				"--scenarioName",
				config.scenarioName,
				"--childId",
				(i++).toString(),
				"--docId",
				docId,
				"--schema",
				JSON.stringify(this.c.schema),
				"--connType",
				connection.type,
				...(connection.endpoint ? ["--connEndpoint", connection.endpoint] : []),
				...(connection.useSecureTokenProvider ? ["--secureTokenProvider"] : []),
			];
			childArgs.push("--verbose");
			runnerArgs.push(childArgs);
		}

		const children: Promise<boolean>[] = [];
		const numOfLoads = this.c.numOfLoads ?? 1;
		for (let j = 0; j < numOfLoads; j++) {
			for (const runnerArg of runnerArgs) {
				try {
					children.push(this.createChild(runnerArg));
				} catch {
					throw new Error("Failed to spawn child");
				}
				await delay(this.c.clientStartDelayMs);
			}
		}

		try {
			await Promise.all(children);
		} catch {
			throw new Error("Not all clients closed sucesfully");
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
		return `This stage loads a list of documents, given their IDs`;
	}

	private async createChild(childArgs: string[]): Promise<boolean> {
		const envVar = { ...process.env };
		const runnerProcess = child_process.spawn("node", childArgs, {
			stdio: ["inherit", "inherit", "inherit", "ipc"],
			env: envVar,
		});

		return new Promise((resolve, reject) =>
			runnerProcess.once("close", (status) => {
				if (status === 0) {
					resolve(true);
				} else {
					reject(new Error("Client failed to complete the tests sucesfully."));
				}
			}),
		);
	}
}
