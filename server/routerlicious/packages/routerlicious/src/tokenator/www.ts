/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "path";
import { configureLogging } from "@fluidframework/server-services-utils";
import {
	TokenatorResourceFactory,
	TokenatorRunnerFactory,
} from "@fluidframework/server-routerlicious-base";
import { runService } from "@fluidframework/server-services-shared";

const configPath = path.join(__dirname, "../../config/config.json");

configureLogging(configPath);

runService(
	new TokenatorResourceFactory(),
	new TokenatorRunnerFactory(),
	undefined,
	"tokenator",
	configPath,
);
