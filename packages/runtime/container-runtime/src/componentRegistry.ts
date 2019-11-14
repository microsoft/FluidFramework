/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import {
    ComponentRegistryEntry,
    IComponentRegistry,
    NamedComponentRegistryEntries,
} from "@microsoft/fluid-runtime-definitions";

export const DefaultComponentEntryName = "__DEFAULT_COMPONENT_REGISTRY_ENTRY__";

export class ComponentRegistry implements IComponentRegistry {

    private readonly map: Map<string, Promise<ComponentRegistryEntry>>;

    public get IComponentRegistry() { return this; }

    constructor(namedEntries: NamedComponentRegistryEntries) {

        this.map = new Map(namedEntries);
    }

    public async get(name: string): Promise<ComponentRegistryEntry | undefined> {

        if (this.map.has(name)) {
            return this.map.get(name);
        } else if (this.map.has(DefaultComponentEntryName)) {
            return this.map.get(DefaultComponentEntryName);
        }

        return undefined;
    }
}
