/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerViewRuntimeFactory } from "@fluid-example/example-utils";
import {
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import * as sequence from "@fluidframework/sequence";
import { MonacoRunner } from "./dataObject";
import { MonacoRunnerView } from "./view";

const monacoName = "@fluid-example/monaco";

const componentFactory = new DataObjectFactory(
    monacoName,
    MonacoRunner,
    [
        sequence.SharedString.getFactory(),
    ],
    {},
);

const monacoViewCallback = (model: MonacoRunner) => new MonacoRunnerView(model.text);

export const fluidExport = new ContainerViewRuntimeFactory(componentFactory, monacoViewCallback);
