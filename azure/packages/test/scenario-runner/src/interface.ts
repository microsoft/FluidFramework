/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IEvent, IEventProvider } from "@fluidframework/common-definitions";

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
}

export interface IRunner extends IEventProvider<IRunnerEvents> {
    run(config: IRunConfig): Promise<unknown>;
    getStatus(): IRunnerStatus;
    stop(): void;
}

export interface ContainerFactorySchema {
    initialObjects: { [key: string]: string };
    dynamicObjects?: { [key: string]: string };
}
