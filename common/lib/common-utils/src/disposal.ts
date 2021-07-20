/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDisposable } from "@fluidframework/common-definitions";

export function doIfNotDisposed<T>(
    disposable: IDisposable,
    f: (...args: any[]) => T,
): (...args: any[]) => T {
    return (...args: any[]) => {
        if (disposable.disposed) {
            throw new Error("Already disposed");
        } else {
            return f(...args);
        }
    };
}
