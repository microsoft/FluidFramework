/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentFactory } from "@microsoft/fluid-runtime-definitions";
import { SharedObjectSequence } from "@microsoft/fluid-sequence";
import { PrimedComponentFactory } from "@microsoft/fluid-aqueduct";
import { ExternalComponentView } from "./externalComponentView";

export const WaterParkViewInstantiationFactory: IComponentFactory = new PrimedComponentFactory(
    ExternalComponentView,
    [
        SharedObjectSequence.getFactory(),
    ],
);
