/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IEvent, IEventProvider } from "@fluidframework/common-definitions";
import { ITelemetryLogger } from "@fluidframework/core-interfaces";

export type RunnnerStatus = "notStarted" | "running" | "success" | "error";
export interface IRunnerStatus {
	status: RunnnerStatus;
	description?: string;
	details: unknown;
}

export interface IRunnerEvents extends IEvent {
	(event: "status", listener: (s: IRunnerStatus) => void): void;
}

export interface IRunConfig {
	runId: string;
	scenarioName: string;
	logger?: ITelemetryLogger;
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
