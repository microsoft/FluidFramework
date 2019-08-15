/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {  SharedComponentFactory } from "@prague/aqueduct";
import { SharedDirectory } from "@prague/map";
import { IComponentFactory } from "@prague/runtime-definitions";
import { SharedObjectSequence } from "@prague/sequence";
import { ExternalComponentView } from "./externalComponentView";

export const WaterParkViewInstantiationFactory: IComponentFactory = new SharedComponentFactory(
    ExternalComponentView,
    [
        SharedDirectory.getFactory(),
        SharedObjectSequence.getFactory(),
    ],
);
