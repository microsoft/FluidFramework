/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as utils from "@microsoft/fluid-server-services-utils";
import * as path from "path";
import { PaparazziResourcesFactory, PaparazziRunnerFactory } from "./runnerFactory";

utils.runService(
    new PaparazziResourcesFactory(),
    new PaparazziRunnerFactory(),
    "paparazzi",
    path.join(__dirname, "../../config/config.json"));
