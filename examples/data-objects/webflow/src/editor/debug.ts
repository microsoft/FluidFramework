/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IDebugger } from "debug";

import { debug as parent } from "../debug.js";

export const debug: IDebugger = parent.extend("editor");
