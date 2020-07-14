/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { initializeContainerCode } from "@fluidframework/base-host";
import { IComponent } from "@fluidframework/component-core-interfaces";
import {
    IFluidCodeDetails,
    IProxyLoaderFactory,
} from "@fluidframework/container-definitions";
import { Loader } from "@fluidframework/container-loader";
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
    codeLoader: WebCodeLoader,
): Promise<Loader> {
    const config = hostConfig.config ?? {};

    // We need to extend options, otherwise we nest properties, like client, too deeply
    //
    config.blockUpdateMarkers = true;

    const scope = hostConfig.scope ?? {};
    const proxyLoaderFactories = hostConfig.proxyLoaderFactories ?? new Map<string, IProxyLoaderFactory>();

    return new Loader(
        hostConfig.urlResolver,
        hostConfig.documentServiceFactory,
        codeLoader,
        config,
        scope,
        proxyLoaderFactories);
}

export class BaseHost {
    private readonly loaderP: Promise<Loader>;
    public constructor(
        hostConfig: IBaseHostConfig,
        codeLoader: WebCodeLoader,
    ) {
        this.loaderP = createWebLoader(
            hostConfig,
            codeLoader,
        );
    }

    public async getLoader() {
        return this.loaderP;
    }

    public async initializeContainer(url: string, codeDetails?: IFluidCodeDetails) {
        const loader = await this.getLoader();
        const container = await loader.resolve({ url });

        // if a package is provided, try to initialize the code proposal with it
        // if not we assume the container already has a code proposal
        if (codeDetails !== undefined) {
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

    public async getComponent(url: string) {
        const loader = await this.getLoader();
        const response = await loader.request({ url });

        if (response.status !== 200 ||
            !(
                response.mimeType === "fluid/component" ||
                response.mimeType === "prague/component"
            )) {
            return undefined;
        }

        return response.value as IComponent;
    }
}
