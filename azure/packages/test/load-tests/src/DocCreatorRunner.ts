/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { AzureClient } from "@fluidframework/azure-client";
import { TypedEventEmitter } from "@fluidframework/common-utils";
import { ContainerSchema, IFluidContainer } from "@fluidframework/fluid-static";
import { SharedMap } from "@fluidframework/map";

import { ContainerFactorySchema, IRunner, IRunnerEvents, IRunnerStatus } from "./interface";

export interface DocCreatorConfig {
    client: AzureClient;
    schema: ContainerFactorySchema;
}

export class DocCreatorRunner extends TypedEventEmitter<IRunnerEvents> implements IRunner {
    private readonly c: DocCreatorConfig;
    constructor(config: DocCreatorConfig) {
        super();
        this.c = config;
    }

    public async run(): Promise<string | undefined> {
        const schema: ContainerSchema = {
            initialObjects: {},
        };

        try {
            this.loadInitialObjSchema(schema);
        } catch {
            this.emit("status", {
                status: "error",
                description: "Invalid schema provided.",
            });
            return;
        }
        const ac = this.c.client;

        let container: IFluidContainer;
        try {
            ({ container } = await ac.createContainer(schema));
        } catch {
            this.emit("status", {
                status: "error",
                description: "Unable to create container.",
            });
            return;
        }

        let id: string;
        try {
            id = await container.attach();
        } catch {
            this.emit("status", {
                status: "error",
                description: "Unable to attach container.",
            });
            return;
        }

        this.emit("status", {
            status: "success",
            description: this.description(),
        });
        return id;
    }

    public stop(): void {}

    public getStatus(): IRunnerStatus {
        return {
            status: "notstarted",
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
