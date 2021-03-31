/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { IFluidObject, IFluidCodeDetails } from "@fluidframework/core-interfaces";
import {
    IFluidModule,
} from "@fluidframework/container-definitions";
import { Loader, Container } from "@fluidframework/container-loader";
import { WebCodeLoader } from "@fluidframework/web-code-loader";
import { IBaseHostConfig } from "./hostConfig";
import { initializeContainerCode } from "./initializeContainerCode";

/**
 * Create a loader and return it.
 * @param hostConfig - Config specifying the resolver/factory to be used.
 * @param pkg - A resolved package with cdn links.
 * @param scriptIds - The script tags the chaincode are attached to the view with.
 */
async function createWebLoader(
    hostConfig: IBaseHostConfig,
    seedPackages?: Iterable<[IFluidCodeDetails, Promise<IFluidModule> | IFluidModule | undefined]>): Promise<Loader> {
    // Create the web loader and prefetch the chaincode we will need
    const codeLoader = new WebCodeLoader(hostConfig.codeResolver, hostConfig.allowList);

    if (seedPackages !== undefined) {
        for (const [codeDetails, maybeModule] of seedPackages) {
            await codeLoader.seedModule(codeDetails, maybeModule);
        }
    }

    return new Loader({
        ...hostConfig,
        codeLoader,
    });
}

export class BaseHost {
    private readonly loaderP: Promise<Loader>;
    public constructor(
        hostConfig: IBaseHostConfig,
        seedPackages?: Iterable<[IFluidCodeDetails, Promise<IFluidModule> | IFluidModule | undefined]>,
    ) {
        this.loaderP = createWebLoader(
            hostConfig,
            seedPackages,
        );
    }

    public async getLoader() {
        return this.loaderP;
    }

    public async initializeContainer(url: string, codeDetails?: IFluidCodeDetails): Promise<Container> {
        const loader = await this.getLoader();
        const container = await loader.resolve({ url });

        // if a package is provided, try to initialize the code proposal with it
        // if not we assume the container already has a code proposal
        if (codeDetails) {
            await initializeContainerCode(container, codeDetails)
                .catch((error) => console.error("code proposal error", error));
        }

        // If we're loading from ops, the context might be in the middle of reloading.  Check for that case and wait
        // for the contextChanged event to avoid returning before that reload completes.
        if (container.hasNullRuntime()) {
            await new Promise<void>((resolve) => container.once("contextChanged", () => resolve()));
        }

        return container;
    }

    /**
     * Used to create a detached container from code details.
     * @param codeDetails - codeDetails used to create detached container.
     */
    public async createContainer(codeDetails: IFluidCodeDetails): Promise<Container> {
        const loader = await this.getLoader();
        const container = await loader.createDetachedContainer(codeDetails);

        assert(container.hasNullRuntime() === false, 0x0cb /* "Detached container should never have null runtime" */);
        return container;
    }

    /**
     * Used to create a detached container from snapshot of another detached container.
     * @param snapshot - Snapshot of detached container.
     */
    public async rehydrateContainer(snapshot: string): Promise<Container> {
        const loader = await this.getLoader();
        const container = await loader.rehydrateDetachedContainerFromSnapshot(snapshot);

        assert(container.hasNullRuntime() === false, 0x0cc /* "Detached container should never have null runtime" */);
        return container;
    }

    public async requestFluidObjectFromContainer(container: Container, url: string) {
        const response = await container.request({ url });

        if (response.status !== 200 ||
            !(
                response.mimeType === "fluid/component" ||
                response.mimeType === "fluid/object"
            )) {
            return undefined;
        }

        return response.value as IFluidObject;
    }

    public async requestFluidObject(url: string) {
        const loader = await this.getLoader();
        const response = await loader.request({ url });

        if (response.status !== 200 ||
            !(
                response.mimeType === "fluid/component" ||
                response.mimeType === "fluid/object"
            )) {
            return undefined;
        }

        return response.value as IFluidObject;
    }
}
