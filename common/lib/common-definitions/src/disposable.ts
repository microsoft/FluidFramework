/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export interface IDisposable {
    readonly disposed: boolean;
    dispose(): void;
}

export interface IAsyncDisposable {
    readonly disposed: boolean;
    disposeAsync(): Promise<void>;
}
