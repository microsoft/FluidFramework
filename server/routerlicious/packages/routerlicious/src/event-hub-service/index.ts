/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "path";
import { EventHubResourcesFactory } from "@fluidframework/server-lambdas-driver";
import { execute } from "./command";

execute(
    (name: string, lambda: string) => new EventHubResourcesFactory(name, lambda),
    path.join(__dirname, "../../config/config.json"));
