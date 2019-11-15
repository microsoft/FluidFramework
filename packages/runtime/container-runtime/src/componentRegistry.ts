/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import {
    ComponentRegistryEntry,
    IComponentRegistry,
    NamedComponentRegistryEntries,
} from "@microsoft/fluid-runtime-definitions";

/**
 * If there is no entry in the ComponentRegisty for the provided name
 * the ComponentRegisty will attempt to get the FallbackComponentRegistryName. If an entry
 * exists in the ComponentRegisty with FallbackComponentRegistryName and that entry is an
 * IComponentRegistry the get call to the original ComponentRegisty will be forwared
 * to the IComponentRegistry at the FallbackComponentRegistryName
 */
export const FallbackComponentRegistryName = "__FALLBACK_COMPONENT_REGISTRY__";

export class ComponentRegistry implements IComponentRegistry {

    private readonly map: Map<string, Promise<ComponentRegistryEntry>>;

    public get IComponentRegistry() { return this; }

    constructor(namedEntries: NamedComponentRegistryEntries) {
        this.map = new Map(namedEntries);
    }

    public async get(name: string): Promise<ComponentRegistryEntry | undefined> {

        if (this.map.has(name)) {
            return this.map.get(name);
        }
        if (this.map.has(FallbackComponentRegistryName)) {
            const maybeFallbackRegistry = await this.map.get(FallbackComponentRegistryName);
            if (maybeFallbackRegistry.IComponentRegistry !== undefined) {
                return maybeFallbackRegistry.IComponentRegistry.get(name);
            }
        }

        return undefined;
    }
}
