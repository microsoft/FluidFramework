/*!
* Copyright (c) Microsoft Corporation. All rights reserved.
* Licensed under the MIT License.
*/

import { PrimedComponentFactory } from "@microsoft/fluid-aqueduct";
import { IComponentFactory } from "@microsoft/fluid-runtime-definitions";
import { UrlRegistry } from "../urlRegistry";
import { ExternalComponentLoader } from "./externalComponentLoader";

export const WaterParkLoaderInstantiationFactory: IComponentFactory = new PrimedComponentFactory(
    ExternalComponentLoader,
    [],
    [["url", Promise.resolve(new UrlRegistry())]],
);
