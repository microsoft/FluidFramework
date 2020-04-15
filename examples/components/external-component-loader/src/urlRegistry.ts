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
        throw new Error(`UrlRegistry: Missing entrypoint name`);
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

    /**
     * Load and retrieve an entrypoint to a Fluid package from a URL
     * @param packageUrl - The URL to the package we're loading
     */
    private async loadEntrypoint(packageUrl: string): Promise<any> {
        // First get the info from the package about what we're loading
        const fluidPackage = await fetchAndValidatePackageInfo(packageUrl);
        const entrypointName = fluidPackage.fluid.browser.umd.library;
        const scriptRelativeUrls = fluidPackage.fluid.browser.umd.files;
        const scriptUrls = scriptRelativeUrls.map((scriptRelativeUrl) => `${packageUrl}/${scriptRelativeUrl}`);

        while (this.loadingEntrypoints.has(entrypointName)) {
            await this.loadingEntrypoints.get(entrypointName);
        }
        const loadingEntrypoint = new Deferred();
        this.loadingEntrypoints.set(entrypointName, loadingEntrypoint.promise);
        // Preserve the entry point for our own external component loader package
        const preservedEntryPoint = window[entrypointName];
        window[entrypointName] = undefined;

        try {
            const scriptLoadPromises = scriptUrls.map(loadScript);

            const errors: Error[] = [];
            for (const scriptLoadPromise of scriptLoadPromises) {
                await scriptLoadPromise.catch(errors.push);
            }
            if (errors.length > 0) {
                throw new Error(errors.join("\n"));
            }

            // Stash the entry point
            const entrypoint = window[entrypointName];
            if (entrypoint === undefined) {
                throw new Error(
                    `UrlRegistry: ${packageUrl}: Entrypoint: ${entrypointName}: Entry point is undefined`);
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
