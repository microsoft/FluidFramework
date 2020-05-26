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
    IResolvedFluidCodeDetails,
} from "@fluidframework/container-definitions";
import { ScriptManager } from "./scriptManager";

export class WebCodeLoader implements ICodeLoader {
    private readonly loadedModules = new Map<string, Promise<IFluidModule> | IFluidModule>();
    private readonly scriptManager = new ScriptManager();

    constructor(
        private readonly codeResolver: IFluidCodeResolver,
        private readonly whiteList?: ICodeWhiteList) { }

    public async seedModule(
        source: IFluidCodeDetails,
        maybeFluidModule?: Promise<IFluidModule> | IFluidModule,
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

    public async preCache(source: IFluidCodeDetails, tryPreload: boolean) {
        const resolved = await this.codeResolver.resolveCodeDetails(source);
        if (resolved?.resolvedPackage?.fluid?.browser?.umd?.files !== undefined) {
            return this.scriptManager.preCacheFiles(
                resolved.resolvedPackage.fluid.browser.umd.files, tryPreload);
        }
    }

    /**
     * @param source - Details of where to find chaincode
     */
    public async load(
        source: IFluidCodeDetails,
    ): Promise<IFluidModule> {
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
        if (this.whiteList !== undefined && !(await this.whiteList.testSource(resolved))) {
            throw new Error("Attempted to load invalid code package url");
        }

        const loadedScripts = await this.scriptManager.loadLibrary(
            resolved.resolvedPackage.fluid.browser.umd,
        );
        let fluidModule: IFluidModule | undefined;
        for (const script of loadedScripts) {
            const maybeFluidModule = script.entryPoint as IFluidModule;
            if (maybeFluidModule.fluidExport !== undefined) {
                if (fluidModule !== undefined) {
                    throw new Error("Multiple fluid modules loaded");
                }
                fluidModule = maybeFluidModule;
            }
        }

        if (fluidModule?.fluidExport === undefined) {
            throw new Error("Entry point of loaded code package not a fluid module");
        }
        return fluidModule;
    }
}
