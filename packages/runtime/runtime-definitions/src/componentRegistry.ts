/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ComponentFactoryTypes } from "./componentFactory";

declare module "@microsoft/fluid-component-core-interfaces" {
    export interface IComponent extends Readonly<Partial<IProvideComponentRegistry>> {}
}

export type ComponentRegistryTypes =
    IComponentRegistry | { get(name: string): Promise<ComponentFactoryTypes> | undefined };

export interface IProvideComponentRegistry {
    IComponentRegistry: IComponentRegistry;
}

export interface IComponentRegistry extends IProvideComponentRegistry {
    get(name: string, cdn?: string): Promise<ComponentFactoryTypes> | undefined;
}
