/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct";
import { IContainer } from "@fluidframework/container-definitions";
import { IConfigProviderBase } from "@fluidframework/telemetry-utils";
import { ITestObjectProvider } from "@fluidframework/test-utils";
import { IRandom } from "@fluid-internal/stochastic-test-utils";
import { ContainerDataObjectManager } from "./containerDataObjectManager";

/**
 * Responsible for tracking the lifetime of containers
 * Responsible for retrieving, creating, and loading containers
 * A container is connected if it is attached and not closed
 * A container is closed if container.close is true
 */
export class ContainerManager {
    private readonly connectedContainers: IContainer[] = [];
    private readonly closedContainers: IContainer[] = [];
    constructor(
        public readonly runtimeFactory: ContainerRuntimeFactoryWithDefaultDataStore,
        public readonly configProvider: IConfigProviderBase,
        public readonly provider: ITestObjectProvider,
    ) {}

    public async createContainer(): Promise<IContainer> {
        const container = await this.provider.createContainer(this.runtimeFactory, {
            configProvider: this.configProvider,
        });
        this.trackContainer(container);
        return container;
    }

    public async loadContainer(): Promise<void> {
        const container = await this.provider.loadContainer(this.runtimeFactory, {
            configProvider: this.configProvider,
        });
        this.trackContainer(container);
    }

    private trackContainer(container: IContainer) {
        container.on("closed", () => {
            const index = this.connectedContainers.indexOf(container);
            assert(index >= 0, "Expected container to have been added to connectedContainers");
            this.closedContainers.push(this.connectedContainers[index]);
            this.connectedContainers.splice(index, 1);
        });
        this.connectedContainers.push(container);
    }

    public closeRandomContainer(random: IRandom) {
        assert(this.connectedContainers.length > 0, "Expected there to be connected containers!");
        random.pick(this.connectedContainers).close();
    }

    public hasConnectedContainers(): boolean {
        return this.connectedContainers.length > 0;
    }

    public get connectedContainerCount(): number {
        return this.connectedContainers.length;
    }

    public async getRandomContainer(random: IRandom): Promise<ContainerDataObjectManager> {
        if (!this.hasConnectedContainers()) {
            await this.loadContainer();
        }
        const container = random.pick(this.connectedContainers);
        assert(!container.closed, "Picked container should not be closed!");
        return new ContainerDataObjectManager(container);
    }
}
