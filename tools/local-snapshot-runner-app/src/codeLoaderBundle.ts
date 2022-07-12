/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICodeDetailsLoader } from "@fluidframework/container-definitions";

export interface ICodeLoaderBundle {
    getCodeLoader(): Promise<ICodeDetailsLoader>;
}

export function isCodeLoaderBundle(bundle: any): bundle is ICodeLoaderBundle {
    return bundle && bundle.getCodeLoader && typeof bundle.getCodeLoader === "function";
}
