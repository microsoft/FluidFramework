/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as utils from "@prague/routerlicious/dist/utils";
import * as path from "path";
import { AugLoopResourcesFactory, AugLoopRunnerFactory } from "./runnerFactory";

utils.runService(
    new AugLoopResourcesFactory(),
    new AugLoopRunnerFactory(),
    "augloop",
    path.join(__dirname, "../config.json"));
