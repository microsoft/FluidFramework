/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { runService } from "@prague/services-utils";
import * as path from "path";
import { AlfredResourcesFactory, AlfredRunnerFactory } from "./runnerFactory";

runService(
    new AlfredResourcesFactory(),
    new AlfredRunnerFactory(),
    "alfred",
    path.join(__dirname, "../config.json"));
