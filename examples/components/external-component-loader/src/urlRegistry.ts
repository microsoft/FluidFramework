/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidModule, isFluidPackage } from "@microsoft/fluid-container-definitions";
import { Deferred } from "@microsoft/fluid-common-utils";
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

    public async get(name: string): Promise<ComponentRegistryEntry | undefined> {
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

            this.urlRegistryMap.set(
                name,
                entryPointPromise.then(async (entrypoint: IFluidModule) => entrypoint.fluidExport));
        }

        return this.urlRegistryMap.get(name);
    }

    private async loadEntrypoint(name: string): Promise<any> {
        const response = await fetch(`${name}/package.json`);
        if (!response.ok) {
            throw new Error(`UrlRegistry: ${name}: fetch was no ok. status code: ${response.status}`);
        }

        const packageJson = await response.json();
        if (!isFluidPackage(packageJson)) {
            throw new Error(`UrlRegistry: ${name}: Package json not deserializable as IFluidPackage`);
        }

        const fluidPackage = packageJson;

        const entrypointName = fluidPackage.fluid.browser.umd.library;
        const scripts = fluidPackage.fluid.browser.umd.files;

        if (entrypointName === undefined || scripts === undefined) {
            throw new Error(`UrlRegistry: Missing entrypointName or scripts: \
                entrypointName: ${entrypointName}, scripts: ${scripts}`);
        }

        while (this.loadingEntrypoints.has(entrypointName)) {
            await this.loadingEntrypoints.get(entrypointName);
        }
        const loadingEntrypoint = new Deferred();
        this.loadingEntrypoints.set(entrypointName, loadingEntrypoint.promise);
        // Preserve the entry point for our own external component loader package
        const preservedEntryPoint = window[entrypointName];
        window[entrypointName] = undefined;
        try {
            const scriptLoadPromises =
                scripts.map(
                    async (bundle) => loadScript(`${name}/${bundle}`));

            const errors: any[] = [];
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
            console.log(entrypoint);
            return entrypoint;

        } finally {
            // Release the entry point
            window[entrypointName] = preservedEntryPoint;
            loadingEntrypoint.resolve();
            this.loadingEntrypoints.delete(entrypointName);
        }
    }
}
