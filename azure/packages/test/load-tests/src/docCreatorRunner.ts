/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    AzureClient,
} from "@fluidframework/azure-client";
import { TypedEventEmitter } from "@fluidframework/common-utils";
import { ContainerSchema } from "@fluidframework/fluid-static";
import { SharedMap } from '@fluidframework/map';
import { ContainerFactorySchema, IRunner, IRunnerEvents, IRunnerStatus } from "./interface";

export interface DocCreatorConfig {
    client: AzureClient;
    schema: ContainerFactorySchema,
}

export class DocCreatorRunner extends TypedEventEmitter<IRunnerEvents> implements IRunner {
    private readonly c: DocCreatorConfig;
    constructor(config: DocCreatorConfig) {
        super();
        this.c = config;
    }

    public async run(): Promise<string> {
        const schema: ContainerSchema = {
            initialObjects: {}
        };
        this.loadInitialObjSchema(schema)
        const ac = this.c.client;
        const r = await ac.createContainer(schema);
        const c = r.container;
        const id = await c.attach();
        this.emit("status", {
            status: "success",
            description: this.description(),
        });
        return id;
    }

    public stop(): void {
        console.log("stop");
    }

    public getStatus(): IRunnerStatus {
        return {
            status: "notstarted",
            description: this.description(),
            details: {},
        };
    }

    private description(): string {
        return `This stage creates container for the given schema.`
    }

    private loadInitialObjSchema(schema: ContainerSchema): void {
        for(const k of Object.keys(this.c.schema.initialObjects)) {
            if(this.c.schema.initialObjects[k] === "SharedMap") {
                schema.initialObjects[k] = SharedMap;
            }
        }
    }
}
