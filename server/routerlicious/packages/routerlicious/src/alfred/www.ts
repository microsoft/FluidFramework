/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "path";
import { runService } from "@fluidframework/server-services-utils";
import { AlfredResourcesFactory, AlfredRunnerFactory } from "./runnerFactory";

runService(
    new AlfredResourcesFactory(),
    new AlfredRunnerFactory(),
    "alfred",
    path.join(__dirname, "../../config/config.json"));
