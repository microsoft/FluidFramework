/*!
* Copyright (c) Microsoft Corporation. All rights reserved.
* Licensed under the MIT License.
*/

import {  SharedComponentFactory } from "@prague/aqueduct";
import { SharedDirectory } from "@prague/map";
import { IComponentFactory } from "@prague/runtime-definitions";
import { ExternalComponentLoader } from "./externalComponentLoader";

export const WaterParkLoaderInstantiationFactory: IComponentFactory = new SharedComponentFactory(
    ExternalComponentLoader,
    [
        SharedDirectory.getFactory(),
    ],
);
