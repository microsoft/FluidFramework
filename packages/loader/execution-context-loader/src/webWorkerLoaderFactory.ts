/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ILoader, IProxyLoaderFactory } from "@microsoft/fluid-container-definitions";
import { IFluidResolvedUrl } from "@microsoft/fluid-driver-definitions";
import { WebWorkerLoader } from "./webWorkerLoader";

/**
 * Factory for creating the proxy loader inside web worker. Use this if your environment
 * supports web worker.
 */
export class WebWorkerLoaderFactory implements IProxyLoaderFactory {
    public readonly environment = "webworker";
    public async createProxyLoader(
        id: string,
        options: any,
        resolved: IFluidResolvedUrl,
        fromSequenceNumber: number,
    ): Promise<ILoader> {
        return WebWorkerLoader.load(id, options, resolved, fromSequenceNumber);
    }
}
