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
import { ScriptManager } from "./scriptManager";

export class WebCodeLoader implements ICodeLoader {
    private static readonly loadedModules = new Map<string, IFluidModule>();
    private static readonly scriptManager = new ScriptManager();

    constructor(
        private readonly codeResolver: IFluidCodeResolver,
        private readonly whiteList?: ICodeWhiteList) { }

    public async seedModule(
        source: IFluidCodeDetails,
        maybeFluidModule?: IFluidModule,
    ): Promise<void>{
        const resolved = await this.codeResolver.resolveCodeDetails(source);
        if(resolved.resolvedPackageCacheId !== undefined
            && WebCodeLoader.loadedModules.has(resolved.resolvedPackageCacheId)){
            return;
        }
        const fluidModule = maybeFluidModule ?? await this.load(source);
        if(resolved.resolvedPackageCacheId !== undefined){
            WebCodeLoader.loadedModules.set(resolved.resolvedPackageCacheId, fluidModule);
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
            const maybePkg = WebCodeLoader.loadedModules.get(resolved.resolvedPackageCacheId);
            if(maybePkg !== undefined){
                return maybePkg;
            }
        }
        if (this.whiteList && !(await this.whiteList.testSource(resolved))) {
            throw new Error("Attempted to load invalid code package url");
        }

        const loadedScripts = await WebCodeLoader.scriptManager.loadLibrary(
            resolved.resolvedPackage.fluid.browser.umd,
        );
        let fluidModule: IFluidModule | undefined;
        for(const script of loadedScripts){
            const maybeFluidModule = script.entryPoint as IFluidModule;
            if(maybeFluidModule.fluidExport !== undefined){
                if (fluidModule !== undefined){
                    throw new Error("Multiple fluid modules loaded");
                }
                fluidModule = maybeFluidModule;
            }
        }

        if(fluidModule?.fluidExport === undefined){
            throw new Error("Entry point of loaded code package not a fluid module");
        }
        if(resolved.resolvedPackageCacheId !== undefined){
            WebCodeLoader.loadedModules.set(resolved.resolvedPackageCacheId, fluidModule);
        }
        return fluidModule;
    }
}
