/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "path";

import { HistorianResourcesFactory, HistorianRunnerFactory } from "@fluidframework/historian-base";
import { runService } from "@fluidframework/server-services-shared";
import { configureLogging } from "@fluidframework/server-services-utils";
import * as winston from "winston";

const configPath = path.join(__dirname, "../config.json");

configureLogging(configPath);

runService(
	new HistorianResourcesFactory(),
	new HistorianRunnerFactory(),
	winston,
	"historian",
	configPath,
);
