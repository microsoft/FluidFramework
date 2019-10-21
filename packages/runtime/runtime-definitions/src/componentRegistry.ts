/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ComponentFactoryTypes } from "./componentFactory";
import { IHostRuntime } from "./components";

declare module "@microsoft/fluid-component-core-interfaces" {
    export interface IComponent extends Readonly<Partial<IProvideComponentRegistry>> {}
}

export type ComponentRegistryTypes =
    IComponentRegistry | { get(name: string, runtime: IHostRuntime): Promise<ComponentFactoryTypes> | undefined };

export interface IProvideComponentRegistry {
    IComponentRegistry: ComponentRegistryTypes;
}

export interface IComponentRegistry extends IProvideComponentRegistry {
    get(name: string, runtime: IHostRuntime): Promise<ComponentFactoryTypes> | undefined;
}
