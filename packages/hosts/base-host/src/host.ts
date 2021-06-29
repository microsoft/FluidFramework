/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidObject, IFluidCodeDetails } from "@fluidframework/core-interfaces";
import {
    IFluidModule,
} from "@fluidframework/container-definitions";
import { Loader, Container, IDetachedBlobStorage } from "@fluidframework/container-loader";
import { WebCodeLoader } from "@fluidframework/web-code-loader";
import { IBaseHostConfig } from "./hostConfig";

/**
 * Create a loader and return it.
 * @param hostConfig - Config specifying the resolver/factory to be used.
 * @param pkg - A resolved package with cdn links.
 * @param scriptIds - The script tags the chaincode are attached to the view with.
 */
async function createWebLoader(
    hostConfig: IBaseHostConfig,
    seedPackages?: Iterable<[IFluidCodeDetails, Promise<IFluidModule> | IFluidModule | undefined]>,
    detachedBlobStorage?: IDetachedBlobStorage,
): Promise<Loader> {
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
        detachedBlobStorage,
    });
}

export class BaseHost {
    private readonly loaderP: Promise<Loader>;
    public constructor(
        hostConfig: IBaseHostConfig,
        seedPackages?: Iterable<[IFluidCodeDetails, Promise<IFluidModule> | IFluidModule | undefined]>,
        detachedBlobStorage?: IDetachedBlobStorage,
    ) {
        this.loaderP = createWebLoader(
            hostConfig,
            seedPackages,
            detachedBlobStorage,
        );
    }

    public async getLoader() {
        return this.loaderP;
    }

    public async loadContainer(url: string): Promise<Container> {
        const loader = await this.getLoader();
        const container = await loader.resolve({ url });
        return container;
    }

    /**
     * Used to create a detached container from code details.
     * @param codeDetails - codeDetails used to create detached container.
     */
    public async createContainer(codeDetails: IFluidCodeDetails): Promise<Container> {
        const loader = await this.getLoader();
        const container = await loader.createDetachedContainer(codeDetails);

        return container;
    }

    /**
     * Used to create a detached container from snapshot of another detached container.
     * @param snapshot - Snapshot of detached container.
     */
    public async rehydrateContainer(snapshot: string): Promise<Container> {
        const loader = await this.getLoader();
        const container = await loader.rehydrateDetachedContainerFromSnapshot(snapshot);

        return container;
    }

    public async requestFluidObjectFromContainer(container: Container, url: string) {
        const response = await container.request({ url });

        if (response.status !== 200 || response.mimeType !== "fluid/object") {
            return undefined;
        }

        return response.value as IFluidObject;
    }

    public async requestFluidObject(url: string) {
        const loader = await this.getLoader();
        const response = await loader.request({ url });

        if (response.status !== 200 || response.mimeType !== "fluid/object") {
            return undefined;
        }

        return response.value as IFluidObject;
    }
}
