/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDisposable } from "@fluidframework/common-definitions";

/**
 * Returns a wrapper around the provided function, which will only invoke the inner function if the provided
 * {@link @fluidframework/common-definitions#IDisposable | disposable} object has not yet been disposed.
 * Otherwise, it will throw an error.
 */
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
