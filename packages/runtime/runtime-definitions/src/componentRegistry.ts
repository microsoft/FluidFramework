/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IProvideComponentFactory } from "./componentFactory";

declare module "@fluidframework/component-core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IComponent extends Readonly<Partial<IProvideComponentRegistry>> { }
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IFluidObject extends Readonly<Partial<IProvideComponentRegistry>> { }
}

/**
 * A single registry entry that may be used to create components
 */
export type ComponentRegistryEntry = Readonly<Partial<IProvideComponentRegistry & IProvideComponentFactory>>;
/**
 * An associated pair of an identifier and registry entry.  Registry entries
 * may be dynamically loaded.
 */
export type NamedComponentRegistryEntry = [string, Promise<ComponentRegistryEntry>];
/**
 * An iterable itentifier/registry entry pair list
 */
export type NamedComponentRegistryEntries = Iterable<NamedComponentRegistryEntry>;

export const IComponentRegistry: keyof IProvideComponentRegistry = "IComponentRegistry";

export interface IProvideComponentRegistry {
    readonly IComponentRegistry: IComponentRegistry;
}

/**
 * An association of identifiers to component registry entries, where the
 * entries can be used to create components.
 */
export interface IComponentRegistry extends IProvideComponentRegistry {
    get(name: string): Promise<ComponentRegistryEntry | undefined>;
}
