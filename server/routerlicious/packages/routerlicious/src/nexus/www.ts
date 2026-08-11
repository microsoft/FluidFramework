/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "path";

import {
	NexusResourcesFactory,
	NexusRunnerFactory,
} from "@fluidframework/server-routerlicious-base";
import { runService } from "@fluidframework/server-services-shared";
import { configureLogging } from "@fluidframework/server-services-utils";
import * as winston from "winston";

const configPath = path.join(__dirname, "../../config/config.json");

configureLogging(configPath);

runService(new NexusResourcesFactory(), new NexusRunnerFactory(), winston, "nexus", configPath);
