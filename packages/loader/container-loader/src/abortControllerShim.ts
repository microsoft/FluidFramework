/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// This adds typings for the reason param for AbortController.abort and AbortSignal
// It's made optional since Node 14 doesn't support this, but Node 16 and modern browsers do
declare module "abort-controller" {
    export interface AbortController {
        abort(reason?: any): void;
    }

    export interface AbortSignal {
        readonly reason?: any;
    }
}
