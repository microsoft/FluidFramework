/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PrimedComponentFactory } from "@prague/aqueduct";
import { IComponentFactory } from "@prague/runtime-definitions";
import * as sequence from "@prague/sequence";
import { MonacoRunner } from "./chaincode";

export const fluidExport: IComponentFactory = new PrimedComponentFactory(
    MonacoRunner,
    [
        sequence.SharedString.getFactory(),
        sequence.SharedObjectSequence.getFactory(),
        sequence.SharedNumberSequence.getFactory(),
    ],
);
