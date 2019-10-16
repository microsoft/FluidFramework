/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentFactory, IComponentRegistry } from "@microsoft/fluid-runtime-definitions";

declare module "@microsoft/fluid-component-core-interfaces" {
    export interface IComponent extends Readonly<Partial<IProvideComponentRegistryWithDefaultFactory>> {}
}

export interface IProvideComponentRegistryWithDefaultFactory extends IComponentRegistry {
    readonly IComponentRegistryWithDefaultFactory: IComponentRegistryWithDefaultFactory;
}

export interface IComponentRegistryWithDefaultFactory extends IProvideComponentRegistryWithDefaultFactory {
    getDefaultFactory(): Promise<IComponentFactory>;
}
