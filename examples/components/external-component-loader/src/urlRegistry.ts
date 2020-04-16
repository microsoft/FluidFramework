/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { isFluidPackage } from "@microsoft/fluid-container-definitions";
import {
    ComponentRegistryEntry,
    IComponentRegistry,
} from "@microsoft/fluid-runtime-definitions";

const loadScript = async (scriptUrl: string) =>
    new Promise<void>((resolve, reject) => {
        const script = document.createElement("script");
        script.src = scriptUrl;

        // Dynamically added scripts are async by default. By setting async to false, we are enabling the scripts
        // to be downloaded in parallel, but executed in order. This ensures that a script is executed after all of
        // its dependencies have been loaded and executed.
        script.async = false;

        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Failed to download the script at url: ${scriptUrl}`));

        document.head.appendChild(script);
    });

/**
 * Fetch the package.json and verify it is a valid IFluidPackage with the info we need to be able to load.
 * @param packageUrl - The URL to the package we're loading
 */
const fetchAndValidatePackageInfo = async (packageUrl: string) => {
    const response = await fetch(`${packageUrl}/package.json`);
    if (!response.ok) {
        throw new Error(`UrlRegistry: ${packageUrl}: fetch was no ok. status code: ${response.status}`);
    }

    const fluidPackage = await response.json();
    if (!isFluidPackage(fluidPackage)) {
        throw new Error(`UrlRegistry: ${packageUrl}: Package json not deserializable as IFluidPackage`);
    }

    if (fluidPackage.fluid.browser.umd.library === undefined) {
        throw new Error(`UrlRegistry: Missing module name`);
    }

    if (fluidPackage.fluid.browser.umd.files === undefined) {
        throw new Error(`UrlRegistry: Missing scripts`);
    }

    return fluidPackage;
};

/**
 * A component registry that can load component via their url
 */
export class UrlRegistry implements IComponentRegistry {
    private static readonly WindowKeyPrefix = "FluidExternalComponent";

    /**
     * A map of URLs to the registry entries they provide.  This functions as our component registry.
     */
    private readonly registryEntryMap: Map<string, Promise<ComponentRegistryEntry>>;

    /**
     * A map of module entrypoints to a pending promise as they load.
     * The map entry is deleted after the load completes.
     */
    private readonly loadingFluidModules: Map<string, Promise<ComponentRegistryEntry>>;

    constructor() {
        // Stash on the window so multiple instance can coordinate
        const registryEntryMapKey = `${UrlRegistry.WindowKeyPrefix}RegistryEntries`;
        if (window[registryEntryMapKey] === undefined) {
            window[registryEntryMapKey] = new Map<string, Promise<ComponentRegistryEntry>>();
        }
        this.registryEntryMap = window[registryEntryMapKey];

        const loadingFluidModulesKey = `${UrlRegistry.WindowKeyPrefix}LoadingModules`;
        if (window[loadingFluidModulesKey] === undefined) {
            window[loadingFluidModulesKey] = new Map<string, Promise<void>>();
        }
        this.loadingFluidModules = window[loadingFluidModulesKey];
    }

    public get IComponentRegistry() { return this; }

    public async get(name: string): Promise<ComponentRegistryEntry | undefined> {
        if (!this.registryEntryMap.has(name)
            && (name.startsWith("http://") || name.startsWith("https://"))) {
            this.registryEntryMap.set(name, this.loadRegistryEntry(name));
        }

        return this.registryEntryMap.get(name);
    }

    /**
     * Load and retrieve an entrypoint to a Fluid package from a URL
     * @param packageUrl - The URL to the package we're loading
     */
    private async loadRegistryEntry(packageUrl: string): Promise<ComponentRegistryEntry> {
        // First get the info from the package about what we're loading
        const fluidPackage = await fetchAndValidatePackageInfo(packageUrl);
        const entrypoint = fluidPackage.fluid.browser.umd.library;
        const scriptRelativeUrls = fluidPackage.fluid.browser.umd.files;
        const scriptUrls = scriptRelativeUrls.map((scriptRelativeUrl) => `${packageUrl}/${scriptRelativeUrl}`);

        // Many of the modules may have the same entrypoint (e.g. "main") and will try to put it on the window object.
        // loadingFluidModules is effectively a lock on the entrypoint name so multiple modules don't collide.
        // We wait on that lock here.
        while (this.loadingFluidModules.has(entrypoint)) {
            await this.loadingFluidModules.get(entrypoint);
        }

        // Preserve our own module (the WaterParkModuleInstantiationFactory) -- it's likely the scripts we're about to
        // load will stomp on it otherwise.
        const preservedModule = window[entrypoint];
        window[entrypoint] = undefined;

        const loadModule = async () => {
            // Wait for all of our scripts to load.  Accumulate errors and report them afterwards.
            const errors: Error[] = [];
            await Promise.all(scriptUrls.map(async (scriptUrl) => {
                return loadScript(scriptUrl).catch((error) => { errors.push(error); });
            }));
            if (errors.length > 0) {
                throw new Error(errors.join("\n"));
            }

            // After the script loads, the module will be available on the window at the entrypoint.
            const module = window[entrypoint];
            if (module === undefined) {
                throw new Error(`UrlRegistry: ${packageUrl}: Entrypoint: ${entrypoint}: Entry point is undefined`);
            }
            return module.fluidExport as ComponentRegistryEntry;
        };

        const registryEntryP = loadModule().finally(() => {
            // Restore the module and release the module name
            window[entrypoint] = preservedModule;
            this.loadingFluidModules.delete(entrypoint);
        });

        this.loadingFluidModules.set(entrypoint, registryEntryP);
        return registryEntryP;
    }
}
