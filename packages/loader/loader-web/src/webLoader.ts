/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ICodeLoader,
    ICodeWhiteList,
    IFluidCodeDetails,
    IFluidModule,
    IFluidPackageResolver,
} from "@microsoft/fluid-container-definitions";
/**
 * Helper class to manage loading of script elements. Only loads a given script once.
 */
class ScriptManager {
    private readonly loadCache = new Map<string, Promise<void>>();

    // Check whether the script is loaded inside a worker.
    public get isBrowser(): boolean {
        if (typeof window === "undefined") {
            return false;
        }
        return window.document !== undefined;
    }

    public async loadScript(scriptUrl: string, scriptId?: string): Promise<void> {
        let scriptP = this.loadCache.get(scriptUrl);
        if (!scriptP) {
            scriptP = new Promise<void>((resolve, reject) => {
                if (this.isBrowser) {
                    const script = document.createElement("script");
                    script.src = scriptUrl;

                    if (scriptId !== undefined) {
                        script.id = scriptId;
                    }

                    // Dynamically added scripts are async by default. By setting async to false, we are enabling the
                    // scripts to be downloaded in parallel, but executed in order. This ensures that a script is
                    // executed after all of its dependencies have been loaded and executed.
                    script.async = false;

                    script.onload = () => resolve();
                    script.onerror = () =>
                        reject(new Error(`Failed to download the script at url: ${scriptUrl}`));

                    document.head.appendChild(script);
                } else {
                    import(/* webpackMode: "eager", webpackIgnore: true */ scriptUrl).then(() => {
                        resolve();
                    }, () => {
                        reject(new Error(`Failed to download the script at url: ${scriptUrl}`));
                    });
                }

            });

            this.loadCache.set(scriptUrl, scriptP);
        }

        return scriptP;
    }

    public async loadScripts(
        umdDetails: { files: string[]; library: string },
        packageUrl: string,
        scriptIds?: string[],
    ): Promise<any> {
        await Promise.all(umdDetails.files.map(async (bundle, index) => {
            // Load file as cdn Link (starts with http)
            // Or create a cdnLink from packageURl
            const url = bundle.startsWith("http")
                ? bundle
                : `${packageUrl}/${bundle}`;
            return this.loadScript(url, scriptIds !== undefined ? scriptIds[index] : undefined);
        }));
        return window[umdDetails.library];
    }
}

export class WebCodeLoader implements ICodeLoader {
    private readonly loadedModules = new Map<string, IFluidModule>();
    private readonly scriptManager = new ScriptManager();

    constructor(
        private readonly packageResolver: IFluidPackageResolver,
        private readonly whiteList?: ICodeWhiteList) { }

    public async seed(source: IFluidCodeDetails, fluidModule: IFluidModule){
        const resolvedPackage = await this.packageResolver.resolve(source);
        if(resolvedPackage === undefined){
            throw new Error("Failed to resolve package");
        }
        this.loadedModules.set(resolvedPackage.packageUrl, fluidModule);
        return fluidModule;
    }

    /**
     * @param source - Details of where to find chaincode
     */
    public async load(
        source: IFluidCodeDetails,
    ): Promise<IFluidModule> {
        const resolvedPackage = await this.packageResolver.resolve(source);
        if (resolvedPackage === undefined){
            throw new Error("Failed to resolve code package");
        }
        const maybePkg = this.loadedModules.get(resolvedPackage.packageUrl);
        if(maybePkg !== undefined){
            return maybePkg;
        }
        if (this.whiteList && !(await this.whiteList.testSource(resolvedPackage))) {
            throw new Error("Attempted to load invalid code package url");
        }

        const fluidModule = await this.scriptManager.loadScripts(
            resolvedPackage.package.fluid.browser.umd,
            resolvedPackage.packageUrl,
        ) as IFluidModule;

        if(fluidModule?.fluidExport === undefined){
            throw new Error("Entry point of loaded code package not a fluid module");
        }
        return this.seed(source, fluidModule);
    }
}
