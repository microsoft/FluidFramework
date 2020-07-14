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

export class BaseHost {
    private readonly loader: Loader;
    public constructor(
        hostConfig: IBaseHostConfig,
        codeLoader: WebCodeLoader,
    ) {
        this.loader = new Loader(
            hostConfig.urlResolver,
            hostConfig.documentServiceFactory,
            codeLoader,
            { blockUpdateMarkers: true },
            {},
            new Map<string, IProxyLoaderFactory>());
    }

    public async initializeContainer(url: string, codeDetails?: IFluidCodeDetails) {
        const container = await this.loader.resolve({ url });

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
        const response = await this.loader.request({ url });

        if (response.status !== 200 || response.mimeType !== "fluid/component") {
            return undefined;
        }

        return response.value as IComponent;
    }
}
