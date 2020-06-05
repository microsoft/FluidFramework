/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "path";
import { KafkaResourcesFactory } from "@fluidframework/server-lambdas-driver";
import { execute } from "./command";

execute(
    (name: string, lambda: string) => new KafkaResourcesFactory(name, lambda),
    path.join(__dirname, "../../config/config.json"));
