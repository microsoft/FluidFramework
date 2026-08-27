/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// This file is used to mock the canvas element for jest tests.
// Jest does not inject `jest` into the global scope in ESM mode, so we do it manually.
// Alternatively, every test using `jest.*` could import `import { jest } from "@jest/globals";`
// Unfortunately, there is no compile time detection of the missing import because some
// Jest globals are injected at runtime providing the convenience of not importing
// `{ describe, it }` in all tests but that brings along all of the types and hides
// that others like `jest.fn` are not available without the import or this injection.
globalThis.jest = jest;
HTMLCanvasElement.prototype.getContext = jest.fn();
