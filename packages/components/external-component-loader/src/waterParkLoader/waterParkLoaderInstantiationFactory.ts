/*!
* Copyright (c) Microsoft Corporation. All rights reserved.
* Licensed under the MIT License.
*/

import { IComponentFactory } from "@microsoft/fluid-runtime-definitions";
import { PrimedComponentFactory } from "@microsoft/fluid-aqueduct";
import { ExternalComponentLoader } from "./externalComponentLoader";

export const WaterParkLoaderInstantiationFactory: IComponentFactory = new PrimedComponentFactory(
    ExternalComponentLoader,
    [],
);
