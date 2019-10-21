/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ComponentFactoryTypes, IHostRuntime } from "@microsoft/fluid-runtime-definitions";

declare module "@microsoft/fluid-component-core-interfaces" {
    export interface IComponent extends Readonly<Partial<IProvideComponentDefaultFactory>> {}
}

export interface IProvideComponentDefaultFactory {
    readonly IComponentDefaultFactory: IComponentDefaultFactory;
}

export interface IComponentDefaultFactory extends IProvideComponentDefaultFactory {
    getDefaultFactory(runtime: IHostRuntime): Promise<ComponentFactoryTypes>;
}
