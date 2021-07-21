/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContainerRuntimeOptions } from "@fluidframework/container-runtime";

/** Temporary function to make backwards compatible runtime options. */
export function flattenRuntimeOptions(
    runtimeOptions?: IContainerRuntimeOptions,
): IContainerRuntimeOptions | undefined {
    if (runtimeOptions === undefined) {
        return runtimeOptions;
    }

    // Promote all summaryOptions and gcOptions to top-layer.
    return {
        ...runtimeOptions.summaryOptions,
        ...runtimeOptions.gcOptions,
        ...runtimeOptions,
    };
}
