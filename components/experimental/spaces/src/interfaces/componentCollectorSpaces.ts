/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent, IComponentLoadable } from "@microsoft/fluid-component-core-interfaces";
import { Layout } from "react-grid-layout";

declare module "@microsoft/fluid-component-core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IComponent extends Readonly<Partial<IProvideComponentCollectorSpaces>> { }
}

export const IComponentCollectorSpaces: keyof IProvideComponentCollectorSpaces = "IComponentCollectorSpaces";

export interface IProvideComponentCollectorSpaces {
    readonly IComponentCollectorSpaces: IComponentCollectorSpaces;
}

/**
 * An IComponentCollectorSpaces is a component that manages a collection of things in the format that Spaces uses.
 * @alpha
 */
export interface IComponentCollectorSpaces extends IProvideComponentCollectorSpaces {
    /**
     * Adds the given item to the collector.
     * @param item - The item to add.
     * @returns A unique key corresponding to the added item.
     */
    addItem(item: ISpacesCollectible): string;
    /**
     * Removes the item specified by the given key.
     * @param key - The key referring to the item to remove.
     */
    removeItem(key: string): void;

    // Could add more functionality here, e.g. get, enumeration, remove all
}

/**
 * Spaces collects loadable components paired with a type.  The type is actually not generally needed except for
 * supporting export to template.
 */
export interface ISpacesCollectible {
    component: IComponent & IComponentLoadable;
    type: string;
    layout?: Layout;
}
