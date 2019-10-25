/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import {
    ComponentRegistryEntry,
    IComponentRegistry,
    NamedComponentRegistryEntries,
} from "@microsoft/fluid-runtime-definitions";

export class CompositComponentRegistry implements IComponentRegistry {

    private readonly map: Map<string, Promise<ComponentRegistryEntry>>;

    public get IComponentRegistry() { return this; }

    constructor(...namedEntries: NamedComponentRegistryEntries[]) {

        const mapEntries: [string, Promise<ComponentRegistryEntry>][] = [];
        for (const entry of namedEntries) {
            if (entry !== undefined) {
                mapEntries.push(...entry);
            }
        }
        this.map = new Map(mapEntries);
    }

    public async get(name: string): Promise<ComponentRegistryEntry | undefined> {
        if (this.map.has(name)) {
            return this.map.get(name);
        }

        return undefined;
    }
}
