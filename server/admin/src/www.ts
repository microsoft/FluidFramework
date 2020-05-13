/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import utils from "@microsoft/fluid-server-services-utils";
import path from "path";
import { AdminResourcesFactory, AdminRunnerFactory } from "./runnerFactory";

utils.runService(
  new AdminResourcesFactory(),
  new AdminRunnerFactory(),
  "admin",
  path.join(__dirname, "../config.json"));
