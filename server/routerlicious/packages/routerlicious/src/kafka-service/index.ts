/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "path";

import { OrderingResourcesFactory } from "@fluidframework/server-routerlicious-base";

import { execute } from "./command";

execute(
	(name: string, lambda: string) => new OrderingResourcesFactory(name, lambda),
	path.join(__dirname, "../../config/config.json"),
);
