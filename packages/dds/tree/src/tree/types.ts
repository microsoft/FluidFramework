/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export type TreeKey = (number | string) & { readonly TreeKey: symbol; };
export type TreeType = (number | string) & { readonly TreeType: symbol; };
