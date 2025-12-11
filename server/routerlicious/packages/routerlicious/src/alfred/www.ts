/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "path";

import {
	AlfredResourcesFactory,
	AlfredRunnerFactory,
} from "@fluidframework/server-routerlicious-base";
import { runService } from "@fluidframework/server-services-shared";
import {
	configureGlobalAbortControllerContext,
	configureLogging,
} from "@fluidframework/server-services-utils";
import * as winston from "winston";

const configPath = path.join(__dirname, "../../config/config.json");

configureLogging(configPath);
configureGlobalAbortControllerContext();

runService(new AlfredResourcesFactory(), new AlfredRunnerFactory(), winston, "alfred", configPath);
