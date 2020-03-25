/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IFluidPackage,
    isFluidPackage,
    IFluidCodeDetails,
} from "@microsoft/fluid-container-definitions";
import {
    ComponentRegistryEntry,
    IComponentRegistry,
    IHostRuntime,
} from "@microsoft/fluid-runtime-definitions";
import { IComponent } from "@microsoft/fluid-component-core-interfaces";

/**
 * A component registry that can load component via their url
 */
export class UrlRegistry implements IComponentRegistry {
    private static readonly WindowKeyPrefix = "FluidExternalComponent";

    private readonly urlRegistryMap = new Map<string, Promise<ComponentRegistryEntry>>();
    private readonly loadingPackages: Map<string, Promise<IFluidPackage>>;

    constructor(private readonly containerRuntime: IHostRuntime) {

        // Stash on the window so multiple instance can coordinate
        const loadingPackagesKey = `${UrlRegistry.WindowKeyPrefix}LoadingPackages`;
        if (window[loadingPackagesKey] === undefined) {
            window[loadingPackagesKey] = new Map<string, Promise<IFluidPackage>>();
        }
        this.loadingPackages = window[loadingPackagesKey] as Map<string, Promise<IFluidPackage>>;
    }

    public get IComponentRegistry() { return this; }

    public async get(name: string): Promise<ComponentRegistryEntry> {

        if (!this.urlRegistryMap.has(name)) {
            this.urlRegistryMap.set(name, this.loadEntyrpoint(name));
        }

        return this.urlRegistryMap.get(name);
    }

    private async loadEntyrpoint(name: string): Promise<IComponent>{
        if(!this.loadingPackages.has(name) && this.isUrl(name)){
            this.loadingPackages.set(name, this.loadPackage(name));
        }
        const fluidPackage = this.loadingPackages.has(name) ? await this.loadingPackages.get(name) : name;
        const codeDetails: IFluidCodeDetails ={
            package: fluidPackage,
            config:{
                cdn:"https://pragueauspkn-3873244262.azureedge.net/",
            },
        };
        const fluidModuel = await this.containerRuntime.codeLoader.load(codeDetails);
        return fluidModuel.fluidExport;
    }

    private async loadPackage(name: string): Promise<IFluidPackage> {
        const response = await fetch(`${name}/package.json`);
        if (!response.ok) {
            throw new Error(`UrlRegistry: ${name}: fetch was no ok. status code: ${response.status}`);
        } else {
            const responseText = await response.text();
            const packageJson = JSON.parse(responseText);
            if (!isFluidPackage(packageJson)) {
                throw new Error(`UrlRegistry: ${name}: Package json not deserializable as IFluidPackage`);
            }
            // we need to resolve the package here, as
            // we don't know forsure where this http endpoint is
            packageJson.fluid.browser.umd.files =
                packageJson.fluid.browser.umd.files.map(
                    (file)=> this.isUrl(file) ? file : `${name}/${file}`);
            return packageJson;

        }
    }

    private isUrl(name: string){
        return name.startsWith("http://") || name.startsWith("https://");
    }
}

