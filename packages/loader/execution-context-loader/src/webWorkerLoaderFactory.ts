/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ILoader, ILoaderOptions, IProxyLoaderFactory } from "@fluidframework/container-definitions";
import { IFluidResolvedUrl } from "@fluidframework/driver-definitions";
import { WebWorkerLoader } from "./webWorkerLoader";

/**
 * Factory for creating the proxy loader inside web worker. Use this if your environment
 * supports web worker.
 */
export class WebWorkerLoaderFactory implements IProxyLoaderFactory {
    public readonly environment = "webworker";
    public async createProxyLoader(
        id: string,
        options: ILoaderOptions,
        resolved: IFluidResolvedUrl,
        fromSequenceNumber: number,
    ): Promise<ILoader> {
        return WebWorkerLoader.load(id, options, resolved, fromSequenceNumber);
    }
}
