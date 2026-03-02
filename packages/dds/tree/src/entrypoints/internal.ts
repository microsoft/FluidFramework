/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// This file provides one module of indirection from index.ts to control
// TypeScript import spec generation for expression declarations. Importantly,
// if alpha / beta / public entrypoints need to search to import spec and those
// reference index.js, then package exports should not also reference index.js,
// or that path will be chosen. (import("@fluidframework/tree/internal") in this
// case).

export * from "../index.js";
