/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryBaseLogger } from "@fluidframework/common-definitions";
import { ICodeDetailsLoader, IContainer } from "@fluidframework/container-definitions";

/**
 * TODO
 */
export interface ICodeLoaderBundle {
    getCodeLoader(): Promise<ICodeDetailsLoader>;
    getResult(container: IContainer, logger: ITelemetryBaseLogger): Promise<string>;
}

/**
 * TODO
 * @param bundle 
 * @returns 
 */
export function isCodeLoaderBundle(bundle: any): bundle is ICodeLoaderBundle {
    return bundle
        && bundle.getCodeLoader && typeof bundle.getCodeLoader === "function"
        && bundle.getResult && typeof bundle.getResult === "function";
}
