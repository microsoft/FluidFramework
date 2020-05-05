/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDebugger } from "debug";
import { debug as parent } from "../debug";

export const debug: IDebugger = parent.extend("md");
