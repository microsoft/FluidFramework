/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ICodeAllowList,
    IFluidModule,
    IFluidCodeResolver,
    IResolvedFluidCodeDetails,
    isFluidBrowserPackage,
    IFluidCodeDetails,
    ICodeDetailsLoader,
    IFluidModuleWithDetails,
} from "@fluidframework/container-definitions";
import { ScriptManager } from "./scriptManager";

export class WebCodeLoader implements ICodeDetailsLoader {
    private readonly loadedModules = new Map<string, Promise<IFluidModuleWithDetails> | IFluidModuleWithDetails>();
    private readonly scriptManager = new ScriptManager();

    constructor(
        private readonly codeResolver: IFluidCodeResolver,
        private readonly allowList?: ICodeAllowList) { }

    public async seedModule(
        source: IFluidCodeDetails,
        maybeFluidModule?: Promise<IFluidModuleWithDetails> | IFluidModuleWithDetails,
    ): Promise<void> {
        const resolved = await this.codeResolver.resolveCodeDetails(source);
        if (resolved.resolvedPackageCacheId !== undefined
            && this.loadedModules.has(resolved.resolvedPackageCacheId)) {
            return;
        }
        const fluidModule = maybeFluidModule ?? this.load(source);
        if (resolved.resolvedPackageCacheId !== undefined) {
            this.loadedModules.set(resolved.resolvedPackageCacheId, fluidModule);
        }
    }

    public async preCache(source: IFluidCodeDetails) {
        const resolved = await this.codeResolver.resolveCodeDetails(source);
        if (isFluidBrowserPackage(resolved.resolvedPackage)) {
            return this.scriptManager.preCacheFiles(
                resolved.resolvedPackage.fluid.browser);
        }
    }

    /**
     * @param source - Details of where to find chaincode
     */
    public async load(
        source: IFluidCodeDetails,
    ): Promise<IFluidModuleWithDetails> {
        const resolved = await this.codeResolver.resolveCodeDetails(source);
        if (resolved.resolvedPackageCacheId !== undefined) {
            const maybePkg = this.loadedModules.get(resolved.resolvedPackageCacheId);
            if (maybePkg !== undefined) {
                return maybePkg;
            }
        }

        const fluidModuleP = this.loadModuleFromResolvedCodeDetails(resolved);

        if (resolved.resolvedPackageCacheId !== undefined) {
            this.loadedModules.set(resolved.resolvedPackageCacheId, fluidModuleP);
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

        const loadedScriptsP = this.scriptManager.loadLibrary(
            resolved.resolvedPackage.fluid.browser.umd);

        let fluidModule: IFluidModule | undefined;
        for (const script of await loadedScriptsP) {
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
        return { module: fluidModule, details: resolved };
    }
}
