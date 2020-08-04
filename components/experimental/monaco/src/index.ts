/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ContainerRuntimeFactoryWithDefaultDataStore,
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import { IProvideRuntimeFactory } from "@fluidframework/container-definitions";
import { IProvideFluidDataStoreFactory } from "@fluidframework/runtime-definitions";
import * as sequence from "@fluidframework/sequence";
import { MonacoRunner } from "./chaincode";

const monacoName = "@fluid-example/monaco";

const componentFactory = new DataObjectFactory(
    monacoName,
    MonacoRunner,
    [
        sequence.SharedString.getFactory(),
        sequence.SharedObjectSequence.getFactory(),
        sequence.SharedNumberSequence.getFactory(),
    ],
    {},
);

const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
    monacoName,
    new Map([
        [monacoName, Promise.resolve(componentFactory)],
    ]),
);

export const fluidExport: IProvideFluidDataStoreFactory & IProvideRuntimeFactory = {
    IFluidDataStoreFactory: componentFactory,
    IRuntimeFactory: runtimeFactory,
};
