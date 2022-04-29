/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export interface IDisposable {
    readonly disposed: boolean;
    dispose(error?: Error): void;
}
