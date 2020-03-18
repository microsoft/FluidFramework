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
    IResolvedFluidCodeDetails,
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


    public async cache(source: IFluidCodeDetails, tryPreload: boolean = false): Promise<IResolvedFluidCodeDetails>{
        const resolved = await this.packageResolver.resolve(source);
        resolved.resolvedPackage.fluid.browser.umd.files.forEach((file)=>{
            const cacheLink = document.createElement("link");
            cacheLink.href = `${resolved.resolvedPackageUrl}/${file}`;
            if(tryPreload && cacheLink.relList && cacheLink.relList.contains("preload")){
                cacheLink.rel = "preload";
            }else{
                cacheLink.rel = "prefetch";
            }

            switch(file.substr(file.lastIndexOf("."))){
                case ".js":
                    cacheLink.as = "script";
                    break;
                case ".css":
                    cacheLink.as = "style";
                    break;
                default:
                    break;
            }
            document.head.appendChild(cacheLink);
        });
        return resolved;
    }

    public async seed(source: IFluidCodeDetails, maybeFluidModule?: IFluidModule): Promise<IResolvedFluidCodeDetails>{
        const resolvedPackage = await this.packageResolver.resolve(source);
        const fluidModule = maybeFluidModule ?? await this.load(source);
        this.loadedModules.set(resolvedPackage.resolvedPackageUrl, fluidModule);
        return resolvedPackage;
    }

    /**
     * @param source - Details of where to find chaincode
     */
    public async load(
        source: IFluidCodeDetails,
    ): Promise<IFluidModule> {
        const resolved = await this.packageResolver.resolve(source);
        const maybePkg = this.loadedModules.get(resolved.resolvedPackageUrl);
        if(maybePkg !== undefined){
            return maybePkg;
        }
        if (this.whiteList && !(await this.whiteList.testSource(resolved))) {
            throw new Error("Attempted to load invalid code package url");
        }

        const fluidModule = await this.scriptManager.loadScripts(
            resolved.resolvedPackage.fluid.browser.umd,
            resolved.resolvedPackageUrl,
        ) as IFluidModule;

        if(fluidModule?.fluidExport === undefined){
            throw new Error("Entry point of loaded code package not a fluid module");
        }
        this.loadedModules.set(resolved.resolvedPackageUrl, fluidModule);
        return fluidModule;
    }
}
