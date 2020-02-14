/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IProvideComponentFactory } from "./componentFactory";

declare module "@microsoft/fluid-component-core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IComponent extends Readonly<Partial<IProvideComponentRegistry>> { }
}

export type ComponentRegistryEntry = Readonly<Partial<IProvideComponentRegistry & IProvideComponentFactory>>;

export type NamedComponentRegistryEntries =
    Iterable<[string, Promise<ComponentRegistryEntry>]>;


export interface IProvideComponentRegistry {
    IComponentRegistry: IComponentRegistry;
}

export interface IComponentRegistry extends IProvideComponentRegistry {
    get(name: string): Promise<ComponentRegistryEntry | undefined>;
}
