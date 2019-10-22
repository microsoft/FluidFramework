/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentRouter } from "@microsoft/fluid-component-core-interfaces";
import { ComponentFactoryTypes } from "./componentFactory";

declare module "@microsoft/fluid-component-core-interfaces" {
    export interface IComponent extends Readonly<Partial<IProvideComponentRegistry>> {}
}

export type ComponentRegistryTypes =
    IComponentRegistry | { get(name: string, router: IComponentRouter): Promise<ComponentFactoryTypes> | undefined };

export interface IProvideComponentRegistry {
    IComponentRegistry: ComponentRegistryTypes;
}

export interface IComponentRegistry extends IProvideComponentRegistry {
    get(name: string, router: IComponentRouter): Promise<ComponentFactoryTypes> | undefined;
}
