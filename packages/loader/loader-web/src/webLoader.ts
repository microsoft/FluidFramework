/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ICodeLoader,
    ICodeWhiteList,
    IFluidCodeDetails,
    IFluidModule,
    IFluidCodeResolver,
} from "@microsoft/fluid-container-definitions";
/**
 * Helper class to manage loading of script elements. Only loads a given script once.
 */
class ScriptManager {
    private readonly loadCache = new Map<string, Promise<any>>();

    // Check whether the script is loaded inside a worker.
    public get isBrowser(): boolean {
        if (typeof window === "undefined") {
            return false;
        }
        return window.document !== undefined;
    }

    public async loadScript(scriptUrl: string, library: string): Promise<any> {
        let scriptP = this.loadCache.get(scriptUrl);
        if (scriptP === undefined) {
            scriptP = new Promise<any>((resolve, reject) => {
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

        return scriptP;
    }

    public async loadScripts(
        umdDetails: { files: string[]; library: string },
    ): Promise<{file: string, entryPoint: any}[]> {
        return Promise.all(
            umdDetails.files.map(
                async (file)=>({file, entryPoint: await this.loadScript(file, umdDetails.library)})));
    }
}

export class WebCodeLoader implements ICodeLoader {
    private readonly loadedModules = new Map<string, IFluidModule>();
    private readonly scriptManager = new ScriptManager();

    constructor(
        private readonly codeResolver: IFluidCodeResolver,
        private readonly whiteList?: ICodeWhiteList) { }

    public async seedModule(
        source: IFluidCodeDetails,
        maybeFluidModule?: IFluidModule,
    ): Promise<void>{
        const resolved = await this.codeResolver.resolveCodeDetails(source);
        if(resolved.resolvedPackageCacheId !== undefined
            && this.loadedModules.has(resolved.resolvedPackageCacheId)){
            return;
        }
        const fluidModule = maybeFluidModule ?? await this.load(source);
        if(resolved.resolvedPackageCacheId !== undefined){
            this.loadedModules.set(resolved.resolvedPackageCacheId, fluidModule);
        }
    }

    /**
     * @param source - Details of where to find chaincode
     */
    public async load(
        source: IFluidCodeDetails,
    ): Promise<IFluidModule> {
        const resolved = await this.codeResolver.resolveCodeDetails(source);
        if(resolved.resolvedPackageCacheId !== undefined){
            const maybePkg = this.loadedModules.get(resolved.resolvedPackageCacheId);
            if(maybePkg !== undefined){
                return maybePkg;
            }
        }
        if (this.whiteList !== undefined && !(await this.whiteList.testSource(resolved))) {
            throw new Error("Attempted to load invalid code package url");
        }

        const loadedScripts = await this.scriptManager.loadScripts(
            resolved.resolvedPackage.fluid.browser.umd,
        );
        let fluidModule: IFluidModule | undefined;
        for(const script of loadedScripts){
            if(script !== undefined){
                if(script.entryPoint.fluidExport !== undefined){
                    if (fluidModule !== undefined){
                        throw new Error("Multiple fluid modules loaded");
                    }
                    fluidModule = script.entryPoint;
                }
            }
        }

        if(fluidModule?.fluidExport === undefined){
            throw new Error("Entry point of loaded code package not a fluid module");
        }
        if(resolved.resolvedPackageCacheId !== undefined){
            this.loadedModules.set(resolved.resolvedPackageCacheId, fluidModule);
        }
        return fluidModule;
    }
}
