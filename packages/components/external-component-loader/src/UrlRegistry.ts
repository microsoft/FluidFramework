/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IPraguePackage } from "@prague/container-definitions";
import { IComponentRegistry } from "@prague/container-runtime";
import { IComponentFactory, IComponentContext, IComponentRuntime } from "@prague/runtime-definitions";
import { Deferred } from "@prague/utils";

export class UrlRegistry implements IComponentRegistry{
    private static readonly WindowKeyPrefix = "FluidExternalComponent"

    private readonly registryMap = new Map<string, Promise<IComponentFactory>>();
    private readonly loadingPackages: Map<string, Promise<any>>;
    private readonly loadingEntrypoints: Map<string, Promise<unknown>>;

    constructor(...entries: [string, Promise<IComponentFactory>][]) {
        entries.forEach((e)=>this.registryMap.set(e[0], e[1]))

        // stash on the window so multiple instance can coordinate
        const loadingPackagesKey =`${UrlRegistry.WindowKeyPrefix}LoadingPackages`;
        if(window[loadingPackagesKey] === undefined){
            window[loadingPackagesKey] = new Map<string, Promise<unknown>>();
        }
        this.loadingPackages = window[loadingPackagesKey];

        const loadingEntrypointsKey =`${UrlRegistry.WindowKeyPrefix}LoadingEntrypoints`;
        if(window[loadingEntrypointsKey] === undefined){
            window[loadingEntrypointsKey] = new Map<string, Promise<unknown>>();
        }
        this.loadingEntrypoints = window[loadingEntrypointsKey];
    }

    public async get(name: string): Promise<IComponentFactory> {

        if (!this.registryMap.has(name)) {
            this.registryMap.set(name, new Promise<IComponentFactory>(async (resolve, reject) => {

                if (!this.loadingPackages.has(name)) {
                    this.loadingPackages.set(name, this.loadEntrypoint(name));
                }

                const entrypoint = await this.loadingPackages.get(name);

                if (entrypoint === undefined) {
                    reject(`UrlRegistry: ${name}: Entrypoint is undefined`);
                } else {
                    const instantiateComponent =
                        entrypoint["instantiateComponent"] as (context: IComponentContext) => Promise<IComponentRuntime>;

                    if (instantiateComponent === undefined) {
                        reject(`UrlRegistry: ${name}: instantiateComponent does not exist on entrypoint`);
                    }
                    resolve({ instantiateComponent });
                }
            }));
        }

        return this.registryMap.get(name);
    }


    private async loadEntrypoint(name: string): Promise<any>{
        const response = await fetch(`${name}/package.json`);
        if (!response.ok) {
            console.log(`UrlRegistry: ${name}: fetch was no ok. status code: ${response.status}`)
        } else {
            const responseText = await response.text();
            const packageJson = JSON.parse(responseText) as IPraguePackage;

            if (!packageJson) {
                console.log(`UrlRegistry: ${name}: Package json not deserializable as IPraguePackage`);
            } else if (!packageJson.prague) {
                console.log(`UrlRegistry: ${name}: Package contains no prague property`);
            } else if (!packageJson.prague.browser) {
                console.log(`UrlRegistry: ${name}: Package contains no prague.browser property`);
            } else if (!packageJson.prague.browser.entrypoint || packageJson.prague.browser.entrypoint == "") {
                console.log(`UrlRegistry: ${name}: Package contains no or empty prague.browser.entrypoint property`);
            } else if (!packageJson.prague.browser.bundle || packageJson.prague.browser.bundle.length === 0) {
                console.log(`UrlRegistry: ${name}: Package contains no or empty prague.browser.bundle property`);
            } else {

                // prevent entry points from overwriting each other before we stash them
                const entrypointName = packageJson.prague.browser.entrypoint;
                while (this.loadingEntrypoints.has(entrypointName)) {
                    await this.loadingEntrypoints.get(entrypointName);
                }
                const loadingEntrypoint = new Deferred();
                this.loadingEntrypoints.set(entrypointName, loadingEntrypoint.promise);
                try {
                    await Promise.all(
                        packageJson.prague.browser.bundle.map(
                            async (bundle) => loadScript(`${name}/${bundle}`)));

                    // stash the entry point
                    const entrypoint = window[entrypointName];
                    if (entrypoint === undefined) {
                        console.log(`UrlRegistry: ${name}: Entrypoint: ${entrypointName}: Entry point is undefined`);
                    }
                    return entrypoint;

                } finally {
                    // release the entry point
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
      script.onerror = () =>
        reject(new Error(`Failed to download the script at url: ${scriptUrl}`));

      document.head.appendChild(script);
    });
}