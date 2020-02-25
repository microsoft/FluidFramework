/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IProvideComponentFactory } from "@microsoft/fluid-runtime-definitions";
import { IComponent } from "@microsoft/fluid-component-core-interfaces/dist/components";

export interface IContainerComponentDetails {
    type: string;
    factory: Promise<IProvideComponentFactory>;
    friendlyName: string;
    fabricIconName: string;
    capabilities: (keyof IComponent)[];
}
export interface IProvideComponentRegistryDetails {
    readonly IComponentRegistryDetails: IComponentRegistryDetails;
}

export interface IComponentRegistryDetails extends IProvideComponentRegistryDetails {
    getFromCapabilities(type: keyof IComponent): IContainerComponentDetails[];
}
