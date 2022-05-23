/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidBrowserPackageEnvironment } from "@fluidframework/container-definitions";

const precacheTargetList: readonly string[] =
    [
        "audio", "document", "embed", "fetch", "font", "image", " object",
        "script", "style", "track", "video", "worker",
        // umd will need to convert to script to cache
        "umd",
    ];

/**
 * Helper class to manage loading of script elements. Only loads a given script once.
 */
export class ScriptManager {
    private static readonly loadingEntrypoints = new Map<string, Promise<unknown>>();
    private static readonly loadCache = new Map<string, Promise<unknown>>();

    // Check whether the script is loaded inside a worker.
    public static get isBrowser(): boolean {
        if (typeof window === "undefined") {
            return false;
        }
        return window.document !== undefined;
    }

    private static async protectEntrypoint<T>(library: string, callback: () => Promise<T>) {
        if (!this.isBrowser) {
            return callback();
        }
        // if we are in a browser we need to ensure multiple
        // scripts aren't loaded with the same entry point
        // otherwise they could overwrite each other
        while (this.loadingEntrypoints.has(library)) {
            await this.loadingEntrypoints.get(library);
        }
        const returnP = callback().finally(() => this.loadingEntrypoints.delete(library));
        this.loadingEntrypoints.set(library, returnP);
        return returnP;
    }

    private static async internalLoadScript(scriptUrl: string, library: string): Promise<unknown> {
        if (!this.loadCache.has(scriptUrl)) {
            while (this.loadingEntrypoints.has(library)) {
                await this.loadingEntrypoints.get(library);
            }
            const scriptP = new Promise<unknown>((resolve, reject) => {
                if (this.isBrowser) {
                    const script = document.createElement("script");
                    script.src = scriptUrl;

                    // Dynamically added scripts are async by default. By setting async to false, we are enabling the
                    // scripts to be downloaded in parallel, but executed in order. This ensures that a script is
                    // executed after all of its dependencies have been loaded and executed.
                    script.async = false;

                    script.onload = () => resolve(window[library]);
                    script.onerror = () =>
                        reject(new Error(`Failed to download the script at url: ${scriptUrl}`));

                    document.head.appendChild(script);
                } else {
                    import(/* webpackMode: "eager", webpackIgnore: true */ scriptUrl).then((value) => {
                        resolve(value);
                    }, () => {
                        reject(new Error(`Failed to download the script at url: ${scriptUrl}`));
                    });
                }
            });
            this.loadCache.set(scriptUrl, scriptP);
        }
        return this.loadCache.get(scriptUrl);
    }

    public async preCacheFiles(browser: IFluidBrowserPackageEnvironment): Promise<void> {
        const preCachePs: Promise<void>[] = [];
        const docfrag = document.createDocumentFragment();
        for (const targetName of Object.keys(browser).filter((t) => precacheTargetList.includes(t))) {
            const target = browser[targetName];
            if (target !== undefined) {
                for (const url of target.files) {
                    const cacheLink = document.createElement("link");
                    cacheLink.href = url;
                    cacheLink.as = targetName === "umd" ? "script" : targetName;
                    cacheLink.crossOrigin = "anonymous";

                    if (cacheLink.relList?.supports("preload") === true) {
                        cacheLink.rel = "preload";
                    } else {
                        cacheLink.rel = "prefetch";
                    }
                    const loadP = new Promise<void>((resolve, reject) => {
                        cacheLink.onload = () => resolve();
                        // eslint-disable-next-line prefer-promise-reject-errors
                        cacheLink.onerror = (...args: any[]) => reject({ ...args });
                    });
                    docfrag.appendChild(docfrag);
                    preCachePs.push(loadP);
                }
            }
        }
        document.appendChild(docfrag);

        await Promise.all(preCachePs);
    }

    public async loadScript(scriptUrl: string, entryPoint: string): Promise<unknown> {
        return ScriptManager.protectEntrypoint(
            entryPoint,
            async () => ScriptManager.internalLoadScript(scriptUrl, entryPoint));
    }

    public async loadLibrary(
        libraryDetails: { files: string[]; library: string; },
    ): Promise<{ file: string; entryPoint: unknown; }[]> {
        return ScriptManager.protectEntrypoint(libraryDetails.library, async () => {
            return Promise.all(
                libraryDetails.files.map(
                    async (file) => ({
                        file,
                        entryPoint: await ScriptManager.internalLoadScript(file, libraryDetails.library),
                    })));
        });
    }
}
