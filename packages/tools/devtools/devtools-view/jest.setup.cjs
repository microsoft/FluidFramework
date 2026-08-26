/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// This file is used to mock the canvas element for jest tests.
globalThis.jest = jest;
HTMLCanvasElement.prototype.getContext = jest.fn();
