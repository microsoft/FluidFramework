/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { SimpleComponentInstantiationFactory } from "@prague/aqueduct";
import {
    CounterValueType,
    DistributedSetValueType,
    SharedMap,
} from "@prague/map";
import { IComponentFactory } from "@prague/runtime-definitions";
import * as sequence from "@prague/sequence";
import { MonacoRunner } from "./chaincode";

export const fluidExport: IComponentFactory = new SimpleComponentInstantiationFactory(
    [
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
    MonacoRunner.load,
);
