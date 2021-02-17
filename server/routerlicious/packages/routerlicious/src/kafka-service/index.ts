/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "path";

import { execute } from "./command";
import { OrderingResourcesFactory } from "./resourcesFactory";

execute(
    (name: string, lambda: string) => new OrderingResourcesFactory(name, lambda),
    path.join(__dirname, "../../config/config.json"));
