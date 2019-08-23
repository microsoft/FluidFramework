/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PrimedComponentFactory } from "@prague/aqueduct";
import { IComponentFactory } from "@prague/runtime-definitions";
import { SharedObjectSequence } from "@prague/sequence";
import { ExternalComponentView } from "./externalComponentView";

export const WaterParkViewInstantiationFactory: IComponentFactory = new PrimedComponentFactory(
    ExternalComponentView,
    [
        SharedObjectSequence.getFactory(),
    ],
);
