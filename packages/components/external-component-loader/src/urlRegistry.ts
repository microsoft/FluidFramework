/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidPackage, isFluidPackage } from "@microsoft/fluid-container-definitions";
import { Deferred } from "@microsoft/fluid-common-utils";
import {
    ComponentRegistryEntry,
    IComponentRegistry,
    IComponentFactory,
    IProvideComponentRegistry,
} from "@microsoft/fluid-runtime-definitions";

/**
 * A component registry that can load component via their url
 */
export class UrlRegistry implements IComponentRegistry {
    private static readonly WindowKeyPrefix = "FluidExternalComponent";

    private readonly urlRegistryMap = new Map<string, Promise<ComponentRegistryEntry>>();
    private readonly loadingPackages: Map<string, Promise<any>>;
    private readonly loadingEntrypoints: Map<string, Promise<unknown>>;

    constructor() {

        // Stash on the window so multiple instance can coordinate
        const loadingPackagesKey = `${UrlRegistry.WindowKeyPrefix}LoadingPackages`;
        if (window[loadingPackagesKey] === undefined) {
            window[loadingPackagesKey] = new Map<string, Promise<unknown>>();
        }
        this.loadingPackages = window[loadingPackagesKey] as Map<string, Promise<unknown>>;

        const loadingEntrypointsKey = `${UrlRegistry.WindowKeyPrefix}LoadingEntrypoints`;
        if (window[loadingEntrypointsKey] === undefined) {
            window[loadingEntrypointsKey] = new Map<string, Promise<unknown>>();
        }
        this.loadingEntrypoints = window[loadingEntrypointsKey] as Map<string, Promise<unknown>>;
    }

    public get IComponentRegistry() { return this; }

    public async get(name: string): Promise<ComponentRegistryEntry> {

        if (!this.urlRegistryMap.has(name)
            && (name.startsWith("http://") || name.startsWith("https://"))) {

            // eslint-disable-next-line @typescript-eslint/no-misused-promises, no-async-promise-executor
            const entryPointPromise = new Promise<any>(async (resolve, reject) => {
                if (!this.loadingPackages.has(name)) {
                    this.loadingPackages.set(name, this.loadEntrypoint(name));
                }

                const entrypoint = await this.loadingPackages.get(name);

                if (entrypoint === undefined) {
                    reject(`UrlRegistry: ${name}: Entrypoint is undefined`);
                } else {
                    resolve(entrypoint);
                }
            });

            // To satisfy the constraint that the component context's pkg must match the resolved factory's
            // type, create a proxy factory that renames the factory `type` to `name`.
            const factoryP = entryPointPromise.then(({ fluidExport }) => {
                let f: IComponentFactory & IProvideComponentRegistry;
                return f = {
                    type: name,
                    instantiateComponent: (...args) => fluidExport.instantiateComponent(...args),
                    get IComponentFactory() { return f; },
                    IComponentRegistry: fluidExport.IComponentRegistry,
                };
            });

            this.urlRegistryMap.set(name, factoryP);
        }

        return this.urlRegistryMap.get(name);
    }

    private async loadEntrypoint(name: string): Promise<any> {
        const response = await fetch(`${name}/package.json`);
        if (!response.ok) {
            throw new Error(`UrlRegistry: ${name}: fetch was no ok. status code: ${response.status}`);
        } else {
            const responseText = await response.text();
            const packageJson = JSON.parse(responseText);
            if (!isFluidPackage(packageJson)) {
                throw new Error(`UrlRegistry: ${name}: Package json not deserializable as IFluidPackage`);
            }

            const fluidPackage: IFluidPackage = packageJson;

            const entrypointName = fluidPackage.fluid.browser.umd.library;
            const scripts = fluidPackage.fluid.browser.umd.files;

            if (entrypointName && scripts) {

                while (this.loadingEntrypoints.has(entrypointName)) {
                    await this.loadingEntrypoints.get(entrypointName);
                }
                const loadingEntrypoint = new Deferred();
                this.loadingEntrypoints.set(entrypointName, loadingEntrypoint.promise);
                const preservedEntryPoint = window[entrypointName];
                window[entrypointName] = undefined;
                try {
                    const scriptLoadPromises =
                        scripts.map(
                            async (bundle) => loadScript(`${name}/${bundle}`));

                    const errors = [];
                    while (scriptLoadPromises.length > 0) {
                        try {
                            await scriptLoadPromises.shift();
                        } catch (e) {
                            errors.push(e);
                        }
                    }
                    if (errors.length > 0) {
                        throw new Error(errors.join("\n"));
                    }

                    // Stash the entry point
                    const entrypoint = window[entrypointName];
                    if (entrypoint === undefined) {
                        throw new Error(
                            `UrlRegistry: ${name}: Entrypoint: ${entrypointName}: Entry point is undefined`);
                    }
                    return entrypoint;

                } finally {
                    // Release the entry point
                    window[entrypointName] = preservedEntryPoint;
                    loadingEntrypoint.resolve();
                    this.loadingEntrypoints.delete(entrypointName);
                }
            }
        }
    }
}

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
async function loadScript(scriptUrl: string): Promise<{}> {
    return new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = scriptUrl;

        // Dynamically added scripts are async by default. By setting async to false, we are enabling the scripts
        // to be downloaded in parallel, but executed in order. This ensures that a script is executed after all of
        // its dependencies have been loaded and executed.
        script.async = false;

        script.onload = resolve;
        script.onerror = () => reject(new Error(`Failed to download the script at url: ${scriptUrl}`));

        document.head.appendChild(script);
    });
}
