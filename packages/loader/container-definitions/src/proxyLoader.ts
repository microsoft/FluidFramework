/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidResolvedUrl } from "@microsoft/fluid-protocol-definitions";
import { ILoader } from "./loader";

export interface IProxyLoaderFactory {
    /**
     * Loader environment
     */
    environment: string;

    /**
     * returns an instance of ILoader loaded inside an execution context.
     */
    createProxyLoader(
        id: string,
        options: any,
        resolved: IFluidResolvedUrl,
        fromSequenceNumber: number): Promise<ILoader>;
}
