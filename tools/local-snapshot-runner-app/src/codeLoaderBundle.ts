/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryBaseLogger } from "@fluidframework/common-definitions";
import { ICodeDetailsLoader, IContainer } from "@fluidframework/container-definitions";
import { FluidObject } from "@fluidframework/core-interfaces";

/**
 * TODO
 */
export interface ICodeLoaderBundle {
    getCodeLoader(): Promise<ICodeDetailsLoader>;
    getLoaderScope(): Promise<FluidObject | undefined>;
    getResults(container: IContainer, logger: ITelemetryBaseLogger): Promise<Record<string, string>>;
}

/**
 * TODO
 * @param bundle 
 * @returns 
 */
export function isCodeLoaderBundle(bundle: any): bundle is ICodeLoaderBundle {
    return bundle
        && bundle.getCodeLoader && typeof bundle.getCodeLoader === "function"
        && bundle.getLoaderScope && typeof bundle.getLoaderScope === "function"
        && bundle.getResults && typeof bundle.getResults === "function";
}
