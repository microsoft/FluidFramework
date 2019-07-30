/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
// tslint:disable: no-console
import { IComponent, IFluidPackage, IPraguePackage } from "@prague/container-definitions";
import { ComponentRegistryTypes, IComponentRegistry } from "@prague/container-runtime";
import { IComponentFactory } from "@prague/runtime-definitions";
import { Deferred } from "@prague/utils";

/**
 * A component registry that can load component via their url
 */
export class UrlRegistry implements IComponentRegistry {
    private static readonly WindowKeyPrefix = "FluidExternalComponent";

    private readonly urlRegistryMap = new Map<string, Promise<IComponentFactory>>();
    // tslint:disable-next-line: prefer-array-literal
    private readonly subRegistries: Array<Promise<ComponentRegistryTypes>> = [];
    private readonly loadingPackages: Map<string, Promise<any>>;
    private readonly loadingEntrypoints: Map<string, Promise<unknown>>;

    constructor(entries: Map<string, Promise<IComponentFactory>>) {

        this.subRegistries.push(Promise.resolve(entries));
        this.subRegistries.push(Promise.resolve(this.urlRegistryMap));

        // stash on the window so multiple instance can coordinate
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

    public async get(name: string): Promise<IComponentFactory> {

        if (!this.urlRegistryMap.has(name)
            && (name.startsWith("http://") || name.startsWith("https://"))) {

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

            this.subRegistries.push(entryPointPromise.then((entrypoint) => {
                const fluidExport: IComponent = entrypoint.fluidExport;
                if (fluidExport !== undefined) {
                    const registry = fluidExport.IComponentRegistry ?
                        fluidExport.IComponentRegistry :
                        fluidExport.query<IComponentRegistry>("IComponentRegistry");
                    if (registry !== undefined) {
                        return registry;
                    }
                }
                return undefined;
            }));

            this.urlRegistryMap.set(name, entryPointPromise.then((entrypoint) => {
                const fluidExport: IComponent = entrypoint.fluidExport;
                let componentFactory = entrypoint as IComponentFactory;

                if (fluidExport !== undefined && fluidExport.query !== undefined) {
                    const exportFactory = fluidExport.IComponentFactory ?
                        fluidExport.IComponentFactory :
                        fluidExport.query<IComponentFactory>("IComponentFactory");
                    if (exportFactory !== undefined) {
                        componentFactory = exportFactory;
                    }
                }

                if (componentFactory === undefined || componentFactory.instantiateComponent === undefined) {
                    throw new Error(`UrlRegistry: ${name}: instantiateComponent does not exist on entrypoint`);
                } else {
                    return componentFactory;
                }
            }));
        }

        const factory = await this.getFromSubRegistries(name);
        if (factory !== undefined) {
            return factory;
        }

        throw new Error(`Unknown package: ${name}`);
    }

    // tslint:disable-next-line: promise-function-async
    private async getFromSubRegistries(name: string): Promise<IComponentFactory>  {
        for (const registryP of this.subRegistries) {
            try {
                const registry = await registryP;
                if (registry !== undefined) {
                    const factory = await registry.get(name);
                    if (factory !== undefined) {
                        return factory;
                    }
                }
            } catch { }
        }
        return undefined;
    }

    private async loadEntrypoint(name: string): Promise<any> {
        const response = await fetch(`${name}/package.json`);
        if (!response.ok) {
            throw new Error(`UrlRegistry: ${name}: fetch was no ok. status code: ${response.status}`);
        } else {
            const responseText = await response.text();
            const packageJson = JSON.parse(responseText);
            const praguePackage = packageJson as IPraguePackage;
            const fluidPackage = packageJson as IFluidPackage;

            let entrypointName: string;
            let scripts: string[];
            if (fluidPackage.fluid && fluidPackage.fluid.browser && fluidPackage.fluid.browser.umd) {
                entrypointName = fluidPackage.fluid.browser.umd.library;
                scripts = fluidPackage.fluid.browser.umd.files;
            } else if (praguePackage.prague !== undefined) {
                entrypointName = packageJson.prague.browser.entrypoint;
                scripts = packageJson.prague.browser.bundle;
            } else {
                throw new Error(`UrlRegistry: ${name}: Package json not deserializable as IFluidPackage`);
            }

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

                    // stash the entry point
                    const entrypoint = window[entrypointName];
                    if (entrypoint === undefined) {
                        throw new Error(
                            `UrlRegistry: ${name}: Entrypoint: ${entrypointName}: Entry point is undefined`);
                    }
                    return entrypoint;

                } finally {
                    // release the entry point
                    window[entrypointName] = preservedEntryPoint;
                    loadingEntrypoint.resolve();
                    this.loadingEntrypoints.delete(entrypointName);
                }
            }
        }
    }
}

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
