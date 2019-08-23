/*!
* Copyright (c) Microsoft Corporation. All rights reserved.
* Licensed under the MIT License.
*/

import { PrimedComponentFactory } from "@prague/aqueduct";
import { IComponentFactory } from "@prague/runtime-definitions";
import { ExternalComponentLoader } from "./externalComponentLoader";

export const WaterParkLoaderInstantiationFactory: IComponentFactory = new PrimedComponentFactory(
    ExternalComponentLoader,
    [],
);
