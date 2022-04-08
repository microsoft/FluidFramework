/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObjectFactory } from "@fluidframework/aqueduct";
import { SharedCell } from "@fluidframework/cell";
import { SharedMap } from "@fluidframework/map";
import { Badge } from "./BadgeModel";

const BadgeName = "@fluid-example/badge";

export const BadgeInstantiationFactory = new DataObjectFactory(
    BadgeName,
    Badge,
    [
        SharedMap.getFactory(),
        SharedCell.getFactory(),
    ],
    {},
);
