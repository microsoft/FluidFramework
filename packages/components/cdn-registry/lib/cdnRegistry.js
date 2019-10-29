/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 *
 */
import { isFluidPackage, } from "@microsoft/fluid-container-definitions";
import { createComponentResponse, createErrorResponse, handleRegistryRequest, RequestParser, } from "@microsoft/fluid-container-runtime";
// tslint:disable-next-line: completed-docs
export class CdnRegistry {
    constructor(containerContext, cdnUrlBase) {
        this.containerContext = containerContext;
        this.cdnUrlBase = cdnUrlBase;
        this.packages = new Map();
        this.modules = new Map();
    }
    get IComponentRegistry() { return this; }
    get IComponentRouter() { return this; }
    async get(name) {
        const response = await this.request({ url: encodeURIComponent(name) });
        if (response.status === 200) {
            return response.value;
        }
        return undefined;
    }
    async request(request) {
        const parser = RequestParser.create(request);
        if (parser.pathParts.length === 0) {
            return createComponentResponse(this);
        }
        const fluidModule = await this.getModuleFromCache(parser.pathParts[0]);
        if (fluidModule === undefined || fluidModule.fluidExport === undefined) {
            return createErrorResponse(404, parser.url);
        }
        if (parser.pathParts.length === 1) {
            return createComponentResponse(fluidModule.fluidExport);
        }
        if (parser.pathParts[1] === CdnRegistry.defaultComponent) {
            const defaultComponent = await this.getDefaultFactory(fluidModule.fluidExport);
            if (defaultComponent === undefined) {
                return createErrorResponse(404, parser.url);
            }
            if (parser.pathParts.length === 2) {
                return createComponentResponse(defaultComponent);
            }
            if (defaultComponent.IComponentRegistry) {
                return handleRegistryRequest(parser.createSubRequest(2), defaultComponent.IComponentRegistry);
            }
            return createErrorResponse(400, parser.url);
        }
        if (fluidModule.fluidExport.IComponentRegistry) {
            return handleRegistryRequest(parser.createSubRequest(1), fluidModule.fluidExport.IComponentRegistry);
        }
        return createErrorResponse(400, parser.url);
    }
    async getFluidPackage(pkgName) {
        const response = await fetch(`${this.cdnUrlBase}/${pkgName}/package.json`);
        if (!response.ok) {
            return undefined;
        }
        else {
            const responseText = await response.text();
            const fluidPackageJson = JSON.parse(responseText);
            if (isFluidPackage(fluidPackageJson)) {
                return fluidPackageJson;
            }
            else {
                return undefined;
            }
        }
    }
    async getDefaultFactory(fluidExport) {
        if (fluidExport.IComponentDefaultFactory !== undefined) {
            return fluidExport.IComponentDefaultFactory.getDefaultFactory();
        }
        else if (fluidExport.IComponentFactory !== undefined) {
            return fluidExport.IComponentFactory;
        }
        return undefined;
    }
    async getModuleFromCache(name) {
        if (!this.modules.has(name)) {
            const getModule = async (moduleName) => {
                const fluidPackage = await this.getPackageFromCache(moduleName);
                if (fluidPackage === undefined) {
                    return undefined;
                }
                else {
                    const details = {
                        config: { cdn: this.cdnUrlBase },
                        package: fluidPackage,
                    };
                    return this.containerContext.codeLoader.load(details);
                }
            };
            this.modules.set(name, getModule(name));
        }
        return this.modules.get(name);
    }
    async getPackageFromCache(name) {
        if (!this.packages.has(name)) {
            this.packages.set(name, this.getFluidPackage(name));
        }
        return this.packages.get(name);
    }
}
CdnRegistry.defaultComponent = "default";
//# sourceMappingURL=cdnRegistry.js.map