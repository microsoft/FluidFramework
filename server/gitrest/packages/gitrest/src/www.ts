/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "path";

import { GitrestResourcesFactory, GitrestRunnerFactory } from "@fluidframework/gitrest-base";
import { runService } from "@fluidframework/server-services-shared";
import { configureLogging } from "@fluidframework/server-services-utils";
import winston from "winston";

const configPath = path.join(__dirname, "../config.json");

configureLogging(configPath);

runService(
	new GitrestResourcesFactory(),
	new GitrestRunnerFactory(),
	winston,
	"gitrest",
	configPath,
);
