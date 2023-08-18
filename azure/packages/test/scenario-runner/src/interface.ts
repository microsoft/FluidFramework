/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { AzureClient } from "@fluidframework/azure-client";
import { IEvent, IEventProvider, ITelemetryLogger } from "@fluidframework/core-interfaces";
import { CommanderStatic } from "commander";

export enum RunnerStatus {
	NotStarted = "notStarted",
	Running = "running",
	Success = "success",
	Error = "error",
}
export interface IRunnerStatus {
	status: RunnerStatus;
	description?: string;
	details: unknown;
}

export interface IRunnerEvents extends IEvent {
	(event: "status", listener: (s: IRunnerStatus) => void): void;
}

export interface IScenarioConfig {
	schema: ContainerFactorySchema;
	clientStartDelayMs?: number;
	numClients?: number;
	numRunsPerClient?: number;
	client?: AzureClient;
}

export interface IRunConfig {
	runId: string;
	scenarioName: string;
	logger?: ITelemetryLogger;
}

export interface IScenarioRunConfig extends IRunConfig, IScenarioConfig {
	childId: number;
}

export interface IRunner extends IEventProvider<IRunnerEvents> {
	/**
	 * Runs in 1 or more child processes.
	 */
	run(config: IRunConfig): Promise<unknown>;
	/**
	 * Runs in same process.
	 */
	runSync(config: IRunConfig): Promise<unknown>;
	/**
	 * Get the runner's current status.
	 */
	getStatus(): IRunnerStatus;
	/**
	 * Stop the runner.
	 */
	stop(): void;
}

export interface ContainerFactorySchema {
	initialObjects: { [key: string]: string };
	dynamicObjects?: { [key: string]: string };
}

export interface AzureClientConnectionConfig {
	type: "remote" | "local";
	endpoint?: string;
	key?: string;
	tenantId?: string;
	functionUrl?: string;
	useSecureTokenProvider?: boolean;
	region?: string;
}

export type ChildRunner = (
	program: CommanderStatic,
) => (opts: { [key: string]: any }) => Promise<void>;
