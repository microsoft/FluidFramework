/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import { commonExampleConfig } from "@fluid-example/webpack-fluid-loader";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default (env) => commonExampleConfig(dirname, env);
