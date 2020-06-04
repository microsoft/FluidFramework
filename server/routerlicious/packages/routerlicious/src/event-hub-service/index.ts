/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "path";
import nconf from "nconf";
import { EventHubResourcesFactory } from "@fluidframework/server-lambdas-driver";
import { execute } from "./command";

const configFile = path.join(__dirname, "../../config/config.json");
const config = nconf.argv().env({ separator: "__", parseValues: true }).file(configFile).use("memory");

execute(
    (name: string, lambda: string) => new EventHubResourcesFactory(name, lambda),
    config);
