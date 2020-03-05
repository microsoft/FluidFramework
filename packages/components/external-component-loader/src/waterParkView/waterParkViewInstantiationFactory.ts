/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PrimedComponentFactory } from "@microsoft/fluid-aqueduct";
import { IComponentFactory } from "@microsoft/fluid-runtime-definitions";
import { SharedObjectSequence } from "@microsoft/fluid-sequence";
import { ExternalComponentView, WaterParkViewName } from "./externalComponentView";

export const WaterParkViewInstantiationFactory: IComponentFactory = new PrimedComponentFactory(
    WaterParkViewName,
    ExternalComponentView,
    [
        SharedObjectSequence.getFactory(),
    ],
);
