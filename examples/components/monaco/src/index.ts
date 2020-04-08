/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PrimedComponentFactory, SimpleModuleInstantiationFactory } from "@microsoft/fluid-aqueduct";
import { IProvideRuntimeFactory } from "@microsoft/fluid-container-definitions";
import { IProvideComponentFactory } from "@microsoft/fluid-runtime-definitions";
import * as sequence from "@microsoft/fluid-sequence";
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
);

const runtimeFactory = new SimpleModuleInstantiationFactory(
    monacoName,
    new Map([
        [monacoName, Promise.resolve(componentFactory)],
    ]),
);

export const fluidExport: IProvideComponentFactory & IProvideRuntimeFactory = {
    IComponentFactory: componentFactory,
    IRuntimeFactory: runtimeFactory,
};
