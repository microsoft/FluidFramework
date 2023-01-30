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

export interface DocSchema {
	initialObjects: { [key: string]: string };
	dynamicObjects?: { [key: string]: string };
}

export interface DocCreatorRunnerConfig {
	connectionConfig: AzureClientConfig;
	schema: DocSchema;
	numDocs: number;
	clientStartDelayMs: number;
}

export class DocCreatorRunner extends TypedEventEmitter<IRunnerEvents> implements IRunner {
	private status: RunnnerStatus = "notStarted";
	private readonly docIds: string[] = [];
	constructor(public readonly c: DocCreatorRunnerConfig) {
		super();
	}

	public async run(config: IRunConfig): Promise<string | string[] | undefined> {
		this.status = "running";

		const r = await this.execRun(config);
		this.status = "success";
		return r;
	}

	public async execRun(config: IRunConfig): Promise<string | string[] | undefined> {
		this.status = "running";
		const runnerArgs: string[][] = [];
		for (let i = 0; i < this.c.numDocs; i++) {
			const connection = this.c.connectionConfig;
			const childArgs: string[] = [
				"./dist/docCreatorRunnerClient.js",
				"--runId",
				config.runId,
				"--scenarioName",
				config.scenarioName,
				"--childId",
				i.toString(),
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
		} catch (error) {
			throw new Error(`Not all clients closed sucesfully.\n${error}`);
		}

		return this.docIds;
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
		return `This stage creates empty document for the given schema.`;
	}

	private async createChild(childArgs: string[]): Promise<boolean> {
		const envVar = { ...process.env };
		const runnerProcess = child_process.spawn("node", childArgs, {
			stdio: ["inherit", "inherit", "inherit", "ipc"],
			env: envVar,
		});

		runnerProcess.stdout?.once("data", (data) => {
			this.docIds.push(String(data));
		});

		runnerProcess.on("message", (id) => {
			this.docIds.push(String(id));
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
