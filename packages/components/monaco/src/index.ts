/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IProvideComponentFactory } from "@microsoft/fluid-runtime-definitions";
import * as sequence from "@microsoft/fluid-sequence";
import { PrimedComponentFactory, SimpleModuleInstantiationFactory } from "@prague/aqueduct";
import { IProvideRuntimeFactory } from "@prague/container-definitions";
import { MonacoRunner } from "./chaincode";

const componentFactory = new PrimedComponentFactory(
    MonacoRunner,
    [
        sequence.SharedString.getFactory(),
        sequence.SharedObjectSequence.getFactory(),
        sequence.SharedNumberSequence.getFactory(),
    ],
);

const runtimeFactory = new SimpleModuleInstantiationFactory(
    "@fluid-example/monaco",
    new Map([
        ["@fluid-example/monaco", Promise.resolve(componentFactory)],
    ]),
);

export const fluidExport: IProvideComponentFactory & IProvideRuntimeFactory = {
    IComponentFactory: componentFactory,
    IRuntimeFactory: runtimeFactory,
};
