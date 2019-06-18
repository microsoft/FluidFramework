/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IChaincodeFactory,
    ICodeLoader,
    IPraguePackage,
} from "@prague/container-definitions";

/**
 * The CodeLoader is used to load quorumed NPM packages into the browser. It does so by querying a CDN that proxies
 * access to the raw NPM package data. The loader starts by fetching the package's package.json. It then looks for a
 * special 'prague' entry which defines the code designed to be run in the browser as well as the name of the entry
 * point module. It then script includes these files on the page and once loaded makes use of the module entry point
 * name to get access to the module.
 */
export class CodeLoader implements ICodeLoader {
    private entryCache = new Map<string, Promise<IChaincodeFactory>>();

    constructor(private baseUrl: string) {
    }

    public async load(source: string): Promise<IChaincodeFactory> {
        if (!this.entryCache.has(source)) {
            const entryP = this.loadCore(source);
            this.entryCache.set(source, entryP);
        }

        return this.entryCache.get(source);
    }

    private async loadCore(source: string): Promise<IChaincodeFactory> {
        const components = source.match(/(.*)\/(.*)@(.*)/);
        if (!components) {
            return Promise.reject("Invalid package");
        }

        const [, scope, name, version] = components;
        const packageUrl = `${this.baseUrl}/${encodeURI(scope)}/${encodeURI(`${name}@${version}`)}`;

        const response = await fetch(`${packageUrl}/package.json`);
        const packageJson = await response.json() as IPraguePackage;

        await Promise.all(
            packageJson.prague.browser.bundle.map(async (bundle) => this.loadScript(`${packageUrl}/${bundle}`)));

        // tslint:disable-next-line:no-unsafe-any
        return window[packageJson.prague.browser.entrypoint];
    }

    private async loadScript(scriptUrl: string): Promise<void> {
        return new Promise((resolve, reject) => {
          const script = document.createElement("script");
          script.src = scriptUrl;

          // Dynamically added scripts are async by default. By setting async to false, we are enabling the scripts
          // to be downloaded in parallel, but executed in order. This ensures that a script is executed after all of
          // its dependencies have been loaded and executed.
          script.async = false;

          script.onload = () => resolve();
          script.onerror = () =>
            reject(new Error(`Failed to download the script at url: ${scriptUrl}`));

          document.head.appendChild(script);
        });
    }
}
