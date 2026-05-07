/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict } from "@fluidframework/eslint-config-fluid/flat.mts";
import type { Linter } from "eslint";

import sharedConfig from "../../eslint.config.data.mts";

const config: Linter.Config[] = [...strict, ...sharedConfig];

export default config;
