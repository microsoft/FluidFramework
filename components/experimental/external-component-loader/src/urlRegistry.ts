/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IFluidPackage,
    isFluidPackage,
    IFluidCodeDetails,
} from "@fluidframework/container-definitions";
import {
    ComponentRegistryEntry,
    IComponentRegistry,
} from "@fluidframework/runtime-definitions";
import { IComponent } from "@fluidframework/component-core-interfaces";
import { WebCodeLoader, SemVerCdnCodeResolver } from "@fluidframework/web-code-loader";

/**
 * A component registry that can load component via their url
 */
export class UrlRegistry implements IComponentRegistry {
    private static readonly WindowKeyPrefix = "FluidExternalComponent";

    private readonly urlRegistryMap = new Map<string, Promise<ComponentRegistryEntry | undefined>>();
    private readonly loadingPackages: Map<string, Promise<IFluidPackage>>;
    private readonly webloader = new WebCodeLoader(new SemVerCdnCodeResolver());

    constructor() {
        // Stash on the window so multiple instance can coordinate
        const loadingPackagesKey = `${UrlRegistry.WindowKeyPrefix}LoadingPackages`;
        if (window[loadingPackagesKey] === undefined) {
            window[loadingPackagesKey] = new Map<string, Promise<IFluidPackage>>();
        }
        this.loadingPackages = window[loadingPackagesKey] as Map<string, Promise<IFluidPackage>>;
    }

    public get IComponentRegistry() { return this; }

    /**
     * Gets a registry entry, or will try to load based on the passed name if not found.
     * @param name - the registry name, which may be a URL to retrieve from or a published package name.
     */
    public async get(name: string): Promise<ComponentRegistryEntry | undefined> {
        if (!this.urlRegistryMap.has(name)) {
            this.urlRegistryMap.set(name, this.loadEntrypoint(name));
        }

        return this.urlRegistryMap.get(name);
    }

    private async loadEntrypoint(name: string): Promise<IComponent| undefined> {
        if (this.isUrl(name)) {
            if (!this.loadingPackages.has(name)) {
                this.loadingPackages.set(name, this.loadPackage(name));
            }
        }
        const fluidPackage = await this.loadingPackages.get(name) ?? name;
        const codeDetails: IFluidCodeDetails = {
            package: fluidPackage,
            config:{
                cdn:"https://pragueauspkn-3873244262.azureedge.net",
            },
        };
        const fluidModule = await this.webloader.load(codeDetails);
        return fluidModule.fluidExport;
    }

    private async loadPackage(url: string): Promise<IFluidPackage> {
        const response = await fetch(`${url}/package.json`);
        if (!response.ok) {
            throw new Error(`UrlRegistry: ${url}: fetch was no ok. status code: ${response.status}`);
        } else {
            const packageJson = await response.json();
            if (!isFluidPackage(packageJson)) {
                throw new Error(`UrlRegistry: ${url}: Package json not deserializable as IFluidPackage`);
            }
            // we need to resolve the package here, as
            // we don't know forsure where this http endpoint is
            packageJson.fluid.browser.umd.files =
                packageJson.fluid.browser.umd.files.map(
                    (file) => this.isUrl(file) ? file : `${url}/${file}`);
            return packageJson;
        }
    }

    private isUrl(name: string) {
        return name.startsWith("http://") || name.startsWith("https://");
    }
}
