/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { SpacesCompatibleToolbar } from ".";

declare module "@microsoft/fluid-component-core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IComponent extends Readonly<Partial<IProvideComponentToolbarConsumer>> { }
}

export const IComponentToolbarConsumer: keyof IProvideComponentToolbarConsumer = "IComponentToolbarConsumer";

export interface IProvideComponentToolbarConsumer {
    readonly IComponentToolbarConsumer: IComponentToolbarConsumer;
}

/**
 * An IComponentToolbarConsumer is a component that takes another to use as a toolbar.  That toolbar may implement
 * other interfaces such as IComponentToolbar or IComponentCallable.
 */
export interface IComponentToolbarConsumer extends IProvideComponentToolbarConsumer {
    setComponentToolbar(id: string, type: string, toolbarComponent: SpacesCompatibleToolbar): void;
}
