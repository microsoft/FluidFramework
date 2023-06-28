/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Make mock chrome APIs available in Node.js env
global.chrome = require("sinon-chrome/extensions");
