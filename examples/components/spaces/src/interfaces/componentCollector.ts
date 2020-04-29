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

export interface IProvideComponentCollector<T = any> {
    readonly IComponentCollector: IComponentCollector<T>;
}

/**
 * An IComponentCollector is a component that manages a collection of things.
 */
export interface IComponentCollector<T> extends IProvideComponentCollector<T> {
    addItem(key: string, item: T): void;
    removeItem(key: string): void;
}

export interface ISpacesCollectible {
    component: IComponent & IComponentLoadable;
    type: string;
}
