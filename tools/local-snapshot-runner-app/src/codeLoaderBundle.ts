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
    getResults(container: IContainer, logger: ITelemetryBaseLogger): Promise<Record<"fileName" | "content", string>[]>;
}

/**
 * TODO
 * @param bundle 
 * @returns 
 */
export function isCodeLoaderBundle(bundle: any): bundle is ICodeLoaderBundle {
    return bundle
        && bundle.getCodeLoader && typeof bundle.getCodeLoader === "function"
        && bundle.getResults && typeof bundle.getResults === "function";
}
