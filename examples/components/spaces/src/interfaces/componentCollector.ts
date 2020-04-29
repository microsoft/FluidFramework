/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent, IComponentLoadable } from "@microsoft/fluid-component-core-interfaces";

declare module "@microsoft/fluid-component-core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IComponent extends Readonly<Partial<IProvideComponentCollector>> { }
}

export const IComponentCollector: keyof IProvideComponentCollector = "IComponentCollector";

export interface IProvideComponentCollector {
    readonly IComponentCollector: IComponentCollector;
}

/**
 * An IComponentCollector is a component that manages a collection of components.
 */
export interface IComponentCollector extends IProvideComponentCollector {
    addComponent(component: ICollectionAddition): void;
    removeComponent(): void;
}

export interface ICollectionAddition {
    component: IComponent & IComponentLoadable;
    type: string;
}
