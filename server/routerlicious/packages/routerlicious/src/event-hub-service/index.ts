/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventHubResourcesFactory } from "@microsoft/fluid-server-lambdas-driver";
import * as path from "path";
import { execute } from "./command";

execute(
    (name: string, lambda: string) => new EventHubResourcesFactory(name, lambda),
    path.join(__dirname, "../../config/config.json"));
