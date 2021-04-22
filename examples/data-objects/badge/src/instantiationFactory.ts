/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObjectFactory } from "@fluidframework/aqueduct";
import { SharedCell } from "@fluidframework/cell";
import { IEvent } from "@fluidframework/common-definitions";
import { SharedMap } from "@fluidframework/map";
import { SharedObjectSequence } from "@fluidframework/sequence";
import { Badge } from "./BadgeModel";

const BadgeName = "@fluid-example/badge";

export const BadgeInstantiationFactory = new DataObjectFactory<Badge, undefined, undefined, IEvent>(
    BadgeName,
    Badge,
    [
        SharedMap.getFactory(),
        SharedCell.getFactory(),
        SharedObjectSequence.getFactory(),
    ],
    {},
);
