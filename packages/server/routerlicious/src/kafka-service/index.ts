/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { KafkaResourcesFactory } from "@prague/lambdas-driver";
import * as path from "path";
import { execute } from "./command";

execute(
    (name: string, lambda: string) => new KafkaResourcesFactory(name, lambda),
    path.join(__dirname, "../../config/config.json"));
