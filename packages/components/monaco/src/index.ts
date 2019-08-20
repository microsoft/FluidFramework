/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { SharedComponentFactory } from "@prague/aqueduct";
import {
    CounterValueType,
    DistributedSetValueType,
    SharedDirectory,
    SharedMap,
} from "@prague/map";
import { IComponentFactory } from "@prague/runtime-definitions";
import * as sequence from "@prague/sequence";
import { MonacoRunner } from "./chaincode";

export const fluidExport: IComponentFactory = new SharedComponentFactory(
    MonacoRunner,
    [
        SharedDirectory.getFactory([
            new DistributedSetValueType(),
            new CounterValueType(),
            new sequence.SharedStringIntervalCollectionValueType(),
            new sequence.SharedIntervalCollectionValueType(),
        ]),
        // TODO: Remove SharedMap factory when compatibility with SharedMap PrimedComponent is no longer needed.
        SharedMap.getFactory([
            new DistributedSetValueType(),
            new CounterValueType(),
            new sequence.SharedStringIntervalCollectionValueType(),
            new sequence.SharedIntervalCollectionValueType(),
        ]),
        sequence.SharedString.getFactory(),
        sequence.SharedObjectSequence.getFactory(),
        sequence.SharedNumberSequence.getFactory(),
    ],
);
