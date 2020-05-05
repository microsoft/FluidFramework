/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PrimedComponentFactory } from "@microsoft/fluid-aqueduct";
import { SharedCell } from "@microsoft/fluid-cell";
import { SharedMap } from "@microsoft/fluid-map";
import { SharedObjectSequence } from "@microsoft/fluid-sequence";
import { Badge } from "./Badge";

const BadgeName = "@fluid-example/badge";

export const BadgeInstantiationFactory = new PrimedComponentFactory(
    BadgeName,
    Badge,
    [
        SharedMap.getFactory(),
        SharedCell.getFactory(),
        SharedObjectSequence.getFactory(),
    ],
    {},
);
