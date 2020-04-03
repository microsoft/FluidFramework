/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent } from "@microsoft/fluid-component-core-interfaces";
import { IProvideComponentFactory } from "@microsoft/fluid-runtime-definitions";

declare module "@microsoft/fluid-component-core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IComponent extends Readonly<Partial<IProvideComponentRegistryDetails>> { }
}

export const IComponentRegistryDetails: keyof IProvideComponentRegistryDetails = "IComponentRegistryDetails";

export interface IProvideComponentRegistryDetails {
    readonly IComponentRegistryDetails: IComponentRegistryDetails;
}

export interface IComponentRegistryDetails extends IProvideComponentRegistryDetails {
    getFromCapabilities(type: keyof IComponent): IContainerComponentDetails[];
}

export interface IContainerComponentDetails {
    type: string;
    factory: Promise<IProvideComponentFactory>;
    capabilities: (keyof IComponent)[];
    friendlyName: string;
    fabricIconName: string;
}
