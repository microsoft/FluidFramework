/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

declare module "@microsoft/fluid-component-core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IComponent extends Readonly<Partial<IProvideComponentToolbarConsumer>> { }
}


export interface IProvideComponentToolbarConsumer {
    IComponentToolbarConsumer: IComponentToolbarConsumer;
}

/**
 * An IComponentCallable is a component that has a roster of functions defined by T that other components can use
 */
export interface IComponentToolbarConsumer {
    setComponentToolbar(id: string, type: string, url: string): Promise<void>;
}

