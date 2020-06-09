/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ContainerRuntimeFactoryWithDefaultComponent,
    PrimedComponentFactory,
} from "@fluidframework/aqueduct";
import { IProvideRuntimeFactory } from "@fluidframework/container-definitions";
import { IProvideComponentFactory } from "@fluidframework/runtime-definitions";
import * as sequence from "@fluidframework/sequence";
import { MonacoRunner } from "./chaincode";

const monacoName = "@fluid-example/monaco";

const componentFactory = new PrimedComponentFactory(
    monacoName,
    MonacoRunner,
    [
        sequence.SharedString.getFactory(),
        sequence.SharedObjectSequence.getFactory(),
        sequence.SharedNumberSequence.getFactory(),
    ],
    {},
);

const runtimeFactory = new ContainerRuntimeFactoryWithDefaultComponent(
    monacoName,
    new Map([
        [monacoName, Promise.resolve(componentFactory)],
    ]),
);

export const fluidExport: IProvideComponentFactory & IProvideRuntimeFactory = {
    IComponentFactory: componentFactory,
    IRuntimeFactory: runtimeFactory,
};
