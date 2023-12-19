/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// THIS FILE IS NOT ACTUALLY USED (see indexBrowser.ts and indexNode.ts for that).
// It's only here so type-test-generator doesn't fail, until we update it to support packages that don't have an
// index.ts file.
// If we remove this file, we need to update api-extractor-lint.json and api-extractor.json so they override
// "mainEntryPointFilePath": "<projectFolder>/dist/indexNode.d.ts" (or wherever the main type declarations file ends up).
// eslint-disable-next-line no-restricted-syntax
export * from "./indexNode";
