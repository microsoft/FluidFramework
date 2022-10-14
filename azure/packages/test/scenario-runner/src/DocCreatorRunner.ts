/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { AzureClient } from "@fluidframework/azure-client";
import { TypedEventEmitter } from "@fluidframework/common-utils";
import { ContainerSchema, IFluidContainer } from "@fluidframework/fluid-static";
import { SharedMap } from "@fluidframework/map";
import { PerformanceEvent } from "@fluidframework/telemetry-utils";

import {
    ContainerFactorySchema,
    IRunConfig,
    IRunner,
    IRunnerEvents,
    IRunnerStatus,
    RunnnerStatus,
} from "./interface";
import { getLogger } from "./logger";

export interface DocCreatorConfig {
    client: AzureClient;
    schema: ContainerFactorySchema;
}

export class DocCreatorRunner extends TypedEventEmitter<IRunnerEvents> implements IRunner {
    private status: RunnnerStatus = "notStarted";
    constructor(private readonly c: DocCreatorConfig) {
        super();
    }

    public async run(config: IRunConfig): Promise<string | undefined> {
        const logger = await getLogger({
            runId: config.runId,
            scenarioName: config.scenarioName,
            namespace: "scenario:runner:doccreator",
        });
        this.status = "running";

        const id = await PerformanceEvent.timedExecAsync(
            logger,
            { eventName: "RunStage" },
            async () => {
                return this.execRun();
            },
            { start: true, end: true, cancel: "generic" },
        );
        this.status = "success";
        return id;
    }

    private async execRun(): Promise<string | undefined> {
        this.status = "running";
        const schema: ContainerSchema = {
            initialObjects: {},
        };

        try {
            this.loadInitialObjSchema(schema);
        } catch {
            throw new Error("Invalid schema provided.");
        }

        const ac = this.c.client;
        let container: IFluidContainer;
        try {
            ({ container } = await ac.createContainer(schema));
        } catch {
            throw new Error("Unable to create container.");
        }

        let id: string;
        try {
            id = await container.attach();
        } catch {
            throw new Error("Unable to attach container.");
        }
        return id;
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

    private loadInitialObjSchema(schema: ContainerSchema): void {
        for (const k of Object.keys(this.c.schema.initialObjects)) {
            if (this.c.schema.initialObjects[k] === "SharedMap") {
                schema.initialObjects[k] = SharedMap;
            }
        }
    }
}
