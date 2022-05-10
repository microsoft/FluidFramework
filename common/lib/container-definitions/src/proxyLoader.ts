/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidResolvedUrl } from "@fluidframework/driver-definitions";
import { ILoader, ILoaderOptions } from "./loader";

/**
 * Abstraction layer to support different Loaders in different Node execution contexts
 * @deprecated Not recommended for general use and will be removed in an upcoming release.
 */
export interface IProxyLoaderFactory {
    /**
     * Loader environment
     * @deprecated Not recommended for general use and will be removed in an upcoming release.
     */
    environment: string;

    /**
     * Returns an instance of ILoader loaded inside an execution context.
     * @deprecated Not recommended for general use and will be removed in an upcoming release.
     */
    createProxyLoader(
        id: string,
        options: ILoaderOptions,
        resolved: IFluidResolvedUrl,
        fromSequenceNumber: number): Promise<ILoader>;
}
