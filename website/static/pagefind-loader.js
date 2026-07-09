/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as pagefind from "/pagefind/pagefind.js";

globalThis.fluidFrameworkPagefind = pagefind;
globalThis.dispatchEvent(new Event("fluid-framework-pagefind-loaded"));
