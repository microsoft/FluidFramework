/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
// tslint:disable: no-console
import { IPraguePackage } from "@prague/container-definitions";
import { IComponentRegistry } from "@prague/container-runtime";
import { IComponentFactory } from "@prague/runtime-definitions";
import { Deferred } from "@prague/utils";

/**
 * A component registry that can load component via their url
 */
export class UrlRegistry implements IComponentRegistry {
    private static readonly WindowKeyPrefix = "FluidExternalComponent";

    private readonly registryMap = new Map<string, Promise<IComponentFactory>>();
    private readonly loadingPackages: Map<string, Promise<any>>;
    private readonly loadingEntrypoints: Map<string, Promise<unknown>>;

    constructor(entries: Map<string, Promise<IComponentFactory>>) {

        entries.forEach((v, k) => this.registryMap.set(k, v));

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

    public async get(name: string): Promise<IComponentFactory> {

        if (!this.registryMap.has(name)) {
            this.registryMap.set(name, new Promise<IComponentFactory>(async (resolve, reject) => {

                if (!this.loadingPackages.has(name)) {
                    this.loadingPackages.set(name, this.loadEntrypoint(name));
                }

                const entrypoint = (await this.loadingPackages.get(name)) as IComponentFactory;

                if (entrypoint === undefined) {
                    reject(`UrlRegistry: ${name}: Entrypoint is undefined`);
                } else {
                    if (entrypoint.instantiateComponent === undefined) {
                        reject(`UrlRegistry: ${name}: instantiateComponent does not exist on entrypoint`);
                    }
                    resolve(entrypoint);
                }
            }));
        }
        const factoryP = this.registryMap.get(name);
        if (factoryP !== undefined) {
            return factoryP;
        }
        throw new Error();
    }

    private async loadEntrypoint(name: string): Promise<any> {
        const response = await fetch(`${name}/package.json`);
        if (!response.ok) {
            throw new Error(`UrlRegistry: ${name}: fetch was no ok. status code: ${response.status}`);
        } else {
            const responseText = await response.text();
            const packageJson = JSON.parse(responseText) as IPraguePackage;

            if (packageJson === undefined) {
                throw new Error(`UrlRegistry: ${name}: Package json not deserializable as IPraguePackage`);
            } else if (packageJson.prague  === undefined) {
                throw new Error(`UrlRegistry: ${name}: Package contains no prague property`);
            } else if (packageJson.prague.browser  === undefined) {
                throw new Error(`UrlRegistry: ${name}: Package contains no prague.browser property`);
            } else if (packageJson.prague.browser.entrypoint === undefined
                || packageJson.prague.browser.entrypoint === "") {
                throw new Error(
                    `UrlRegistry: ${name}: Package contains no or empty prague.browser.entrypoint property`);
            } else if (packageJson.prague.browser.bundle === undefined
                || packageJson.prague.browser.bundle.length === 0) {
                throw new Error(`UrlRegistry: ${name}: Package contains no or empty prague.browser.bundle property`);
            } else {

                // prevent entry points from overwriting each other before we stash them
                const entrypointName = packageJson.prague.browser.entrypoint;
                while (this.loadingEntrypoints.has(entrypointName)) {
                    await this.loadingEntrypoints.get(entrypointName);
                }
                const loadingEntrypoint = new Deferred();
                this.loadingEntrypoints.set(entrypointName, loadingEntrypoint.promise);
                const preservedEntryPoint = window[entrypointName];
                window[entrypointName] = undefined;
                try {
                    const scriptLoadPromises =
                        packageJson.prague.browser.bundle.map(
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
