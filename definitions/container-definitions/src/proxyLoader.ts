/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidResolvedUrl } from "@fluidframework/driver-definitions";
import { ILoader, ILoaderOptions } from "./loader";

/**
 * Abstraction layer to support different Loaders in different Node execution contexts
 */
export interface IProxyLoaderFactory {
    /**
     * Loader environment
     */
    environment: string;

    /**
     * Returns an instance of ILoader loaded inside an execution context.
     */
    createProxyLoader(
        id: string,
        options: ILoaderOptions,
        resolved: IFluidResolvedUrl,
        fromSequenceNumber: number): Promise<ILoader>;
}
