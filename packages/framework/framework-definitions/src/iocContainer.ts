/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Container } from "inversify";

declare module "@microsoft/fluid-component-core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IComponent extends Readonly<Partial<IProvideComponentIocContainerProvider>> { }
}

export interface IProvideComponentIocContainerProvider {
    readonly IComponentIocContainerProvider: IComponentIocContainerProvider;
}

/**
 * A component that knows how to Provide an Inversify Ioc Container
 */
export interface IComponentIocContainerProvider extends IProvideComponentIocContainerProvider {
    getIocContainer(): Container
}
