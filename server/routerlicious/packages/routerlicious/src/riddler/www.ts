/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "path";
import * as utils from "@microsoft/fluid-server-services-utils";
import { RiddlerResourcesFactory, RiddlerRunnerFactory } from "./runnerFactory";

utils.runService(
    new RiddlerResourcesFactory(),
    new RiddlerRunnerFactory(),
    "riddler",
    path.join(__dirname, "../../config/config.json"));
