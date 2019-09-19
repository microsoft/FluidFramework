/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDisposable } from "@microsoft/fluid-container-definitions";

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
