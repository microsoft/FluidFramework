/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ComponentFactoryTypes } from "@microsoft/fluid-runtime-definitions";

declare module "@microsoft/fluid-component-core-interfaces" {
    export interface IComponent extends Readonly<Partial<IProvideComponentRegistryWithDefaultFactory>> {}
}

export interface IProvideComponentRegistryWithDefaultFactory {
    readonly IComponentRegistryWithDefaultFactory: IComponentRegistryWithDefaultFactory;
}

export interface IComponentRegistryWithDefaultFactory extends IProvideComponentRegistryWithDefaultFactory {
    getDefaultFactory(): Promise<ComponentFactoryTypes>;
}
