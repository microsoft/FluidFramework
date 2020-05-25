/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as utils from "@fluidframework/server-services-utils";
import * as path from "path";
import { AdminResourcesFactory, AdminRunnerFactory } from "./runnerFactory";

utils.runService(
  new AdminResourcesFactory(),
  new AdminRunnerFactory(),
  "admin",
  path.join(__dirname, "../config.json"));
