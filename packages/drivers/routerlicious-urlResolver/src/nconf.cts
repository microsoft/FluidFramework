/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// This file serves as an intermediary module to export the 'Provider' named export from the 'nconf' module.
// It is written using ESM module syntax, making it compatible with both ESM and CJS module.
// This compatibility allows for flexible usage of the 'Provider' named export from the 'nconf' module across different module systems without modification.

import { Provider } from "nconf";

export { Provider };
