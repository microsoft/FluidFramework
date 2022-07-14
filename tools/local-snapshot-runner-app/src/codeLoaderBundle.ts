/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryBaseLogger } from "@fluidframework/common-definitions";
import { ICodeDetailsLoader, IContainer } from "@fluidframework/container-definitions";
import { FluidObject } from "@fluidframework/core-interfaces";

/**
 * Contract that defines the necessary exports for the bundle provided at runtime
 * For an example, see "src/test/sampleCodeLoader.ts"
 */
export interface ICodeLoaderBundle {
    /**
     * Get the code loader details to provide at Loader creation
     */
    getCodeLoader(): Promise<ICodeDetailsLoader>;

    /**
     * Get the scope object to provide at Loader creation
     */
    getLoaderScope(): Promise<FluidObject | undefined>;

    /**
     * Get the results to write from the provided bundle
     * @param container - container created by this application
     * @param logger
     */
    getResults(container: IContainer, logger: ITelemetryBaseLogger): Promise<Record<string, string>>;
}

/**
 * Type cast to ensure necessary methods are present in the provided bundle
 * @param bundle 
 */
export function isCodeLoaderBundle(bundle: any): bundle is ICodeLoaderBundle {
    return bundle
        && bundle.getCodeLoader && typeof bundle.getCodeLoader === "function"
        && bundle.getLoaderScope && typeof bundle.getLoaderScope === "function"
        && bundle.getResults && typeof bundle.getResults === "function";
}
