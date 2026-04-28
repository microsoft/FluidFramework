/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

// Expose window/self as aliases for the Node.js global object so that browser-oriented
// libraries (fake-indexeddb/auto, idb) see a consistent global scope.
global.window = global;
global.self = global;

// Install fake IndexedDB globals so idb can open stores.
// eslint-disable-next-line import-x/no-unassigned-import, @typescript-eslint/no-require-imports, import-x/no-internal-modules
require("fake-indexeddb/auto");
