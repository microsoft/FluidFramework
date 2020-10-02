/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ICodeLoader,
    ICodeAllowList,
    IFluidCodeDetails,
    IFluidModule,
    IFluidCodeResolver,
    IResolvedFluidCodeDetails,
} from "@fluidframework/container-definitions";
import { isFluidBrowserPackage } from "./utils";
import { ScriptManager } from "./scriptManager";

export class WebCodeLoader implements ICodeLoader {
    private readonly loadedModules = new Map<string, Promise<IFluidModule> | IFluidModule>();
    private readonly scriptManager = new ScriptManager();

    constructor(
        private readonly codeResolver: IFluidCodeResolver,
        private readonly allowList?: ICodeAllowList) { }

    public async seedModule(
        source: IFluidCodeDetails,
        maybeFluidModule?: Promise<IFluidModule> | IFluidModule,
    ): Promise<void> {
        const resolved = await this.codeResolver.resolveCodeDetails(source);
        if (resolved.cacheId !== undefined
            && this.loadedModules.has(resolved.cacheId)) {
            return;
        }
        const fluidModule = maybeFluidModule ?? this.load(source);
        if (resolved.cacheId !== undefined) {
            this.loadedModules.set(resolved.cacheId, fluidModule);
        }
    }

    public async preCache(source: IFluidCodeDetails, tryPreload: boolean) {
        const resolved = await this.codeResolver.resolveCodeDetails(source);
        if (resolved?.resolvedPackage?.fluid?.environment?.umd?.files !== undefined) {
            return this.scriptManager.preCacheFiles(
                resolved.resolvedPackage.fluid.environment.umd.files, tryPreload);
        }
    }

    /**
     * @param source - Details of where to find chaincode
     */
    public async load(
        source: IFluidCodeDetails,
    ): Promise<IFluidModule> {
        const resolved = await this.codeResolver.resolveCodeDetails(source);
        if (resolved.cacheId !== undefined) {
            const maybePkg = this.loadedModules.get(resolved.cacheId);
            if (maybePkg !== undefined) {
                return maybePkg;
            }
        }

        const fluidModuleP = this.loadModuleFromResolvedCodeDetails(resolved);
        if (resolved.cacheId !== undefined) {
            this.loadedModules.set(resolved.cacheId, fluidModuleP);
        }
        return fluidModuleP;
    }

    private async loadModuleFromResolvedCodeDetails(resolved: IResolvedFluidCodeDetails) {
        if (this.allowList !== undefined && !(await this.allowList.testSource(resolved))) {
            throw new Error("Attempted to load invalid code package url");
        }
        if (!isFluidBrowserPackage(resolved.resolvedPackage)) {
            throw new Error(`Package ${resolved.resolvedPackage.name} not a Fluid module.`);
        }

        const loadedScripts = await this.scriptManager.loadLibrary(
            resolved.resolvedPackage.fluid.browser.umd);
        let fluidModule: IFluidModule | undefined;
        for (const script of loadedScripts) {
            const maybeFluidModule = script.entryPoint as IFluidModule;
            if (maybeFluidModule.fluidExport !== undefined) {
                if (fluidModule !== undefined) {
                    throw new Error("Multiple Fluid modules loaded");
                }
                fluidModule = maybeFluidModule;
            }
        }

        if (fluidModule?.fluidExport === undefined) {
            throw new Error("Entry point of loaded code package not a Fluid module");
        }
        return fluidModule;
    }
}
