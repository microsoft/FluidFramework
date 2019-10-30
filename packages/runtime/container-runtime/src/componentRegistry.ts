/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import {
    ComponentRegistryEntry,
    IComponentRegistry,
    NamedComponentRegistryEntries,
} from "@microsoft/fluid-runtime-definitions";

export class ComponentRegistry implements IComponentRegistry {

    private readonly map: Map<string, Promise<ComponentRegistryEntry> | (() => Promise<ComponentRegistryEntry>)>;

    public get IComponentRegistry() { return this; }

    constructor(namedEntries: NamedComponentRegistryEntries) {

        this.map =
        new Map<string, Promise<ComponentRegistryEntry> | (() => Promise<ComponentRegistryEntry>)>(
            namedEntries);
    }

    public async get(name: string): Promise<ComponentRegistryEntry | undefined> {

        if (this.map.has(name)) {
            const entry = this.map.get(name);
            if (typeof entry === "function") {
                return entry();
            } else {
                return entry;
            }
        }

        return undefined;
    }
}
