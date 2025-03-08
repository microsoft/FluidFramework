/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This library contains common utility functions and classes used by the Fluid Framework.
 *
 * @packageDocumentation
 */

export { fromBase64ToUtf8, fromUtf8ToBase64, toUtf8 } from "./base64Encoding";
export { Uint8ArrayToArrayBuffer } from "./bufferShared";
/**
 * NOTE: This export is remapped to export from "./indexBrowser" in browser environments via package.json.
 * Because the two files don't have fully isomorphic exports, using named exports for the full API surface
 * is problematic if that named export includes values not in their intersection.
 *
 * In a future breaking change, we could use a named export for their intersection if we desired.
 */
// eslint-disable-next-line no-restricted-syntax
export * from "./indexNode";
