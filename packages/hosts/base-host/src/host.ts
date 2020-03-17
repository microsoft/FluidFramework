/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent } from "@microsoft/fluid-component-core-interfaces";
import {
    IFluidCodeDetails,
    IProxyLoaderFactory,
    IFluidModule,
} from "@microsoft/fluid-container-definitions";
import { Container, Loader } from "@microsoft/fluid-container-loader";
import { WebCodeLoader } from "@microsoft/fluid-web-code-loader";
import { IBaseHostConfig } from "./hostConfig";
import { initializeContainerCode } from "./initializeContainerCode";

/**
 * Create a loader and return it.
 * @param hostConfig - Config specifying the resolver/factory to be used.
 * @param pkg - A resolved package with cdn links.
 * @param scriptIds - The script tags the chaincode are attached to the view with.
 */
async function createWebLoader(
    hostConfig: IBaseHostConfig,
    packages: Iterable<[IFluidCodeDetails, IFluidModule]> | undefined): Promise<Loader> {

    // Create the web loader and prefetch the chaincode we will need
    const codeLoader = new WebCodeLoader(hostConfig.packageResolver, hostConfig.whiteList);

    if (packages !== undefined) {
        for(const pkg of packages){
            const resolved = await hostConfig.packageResolver.resolve(pkg[0]);
            if(resolved === undefined){
                throw new Error("Failed to resolve package");
            }
            codeLoader.seed(resolved?.pkg, pkg[1]);
        }
    }

    const config = hostConfig.config ? hostConfig.config : {};

    // We need to extend options, otherwise we nest properties, like client, too deeply
    //
    config.blockUpdateMarkers = true;

    const scope = hostConfig.scope ? hostConfig.scope : {};
    const proxyLoaderFactories = hostConfig.proxyLoaderFactories ?
        hostConfig.proxyLoaderFactories : new Map<string, IProxyLoaderFactory>();

    return new Loader(
        hostConfig.urlResolver,
        hostConfig.documentServiceFactory,
        codeLoader,
        config,
        scope,
        proxyLoaderFactories);
}

export class BaseHost {
    /**
     * Function to load the container from the given url and initialize the chaincode.
     * @param hostConfig - Config specifying the resolver/factory and other loader settings to be used.
     * @param url - Url of the Fluid component to be loaded.
     * @param resolved - A resolved url from a url resolver.
     * @param pkg - A resolved package with cdn links.
     * @param scriptIds - The script tags the chaincode are attached to the view with.
     * @param div - The div to load the component into.
     */
    public static async start(
        hostConfig: IBaseHostConfig,
        url: string,
        pkg: IFluidCodeDetails,
        div: HTMLDivElement,
        seedPackages: Iterable<[IFluidCodeDetails, IFluidModule]> | undefined,
    ): Promise<Container> {
        const baseHost = new BaseHost(hostConfig, seedPackages);
        return baseHost.loadAndRender(url, div, pkg);
    }

    private readonly loaderP: Promise<Loader>;
    public constructor(
        hostConfig: IBaseHostConfig,
        packages: Iterable<[IFluidCodeDetails, IFluidModule]> | undefined,
    ) {

        this.loaderP = createWebLoader(
            hostConfig,
            packages,
        );
    }

    public async getLoader() {
        return this.loaderP;
    }

    public async initializeContainer(url: string, pkg?: IFluidCodeDetails) {
        const loader = await this.getLoader();
        const container = await loader.resolve({ url });

        // if a package is provided, try to initialize the code proposal with it
        // if not we assume the container already has a code proposal
        if (pkg) {
            await initializeContainerCode(container, pkg)
                .catch((error) => console.error("code proposal error", error));
        }

        return container;
    }

    public async getComponent(url: string) {
        const loader = await this.getLoader();
        const response = await loader.request({ url });

        if (response.status !== 200 ||
            !(
                response.mimeType === "fluid/component" ||
                response.mimeType === "prague/component"
            )) {
            return undefined;
        }

        return response.value as IComponent;
    }

    private async getComponentAndRender(url: string, div: HTMLDivElement) {
        const component = await this.getComponent(url);
        if (component === undefined) {
            return;
        }

        // First try to get it as a view
        let renderable = component.IComponentHTMLView;
        if (!renderable) {
            // Otherwise get the visual, which is a view factory
            const visual = component.IComponentHTMLVisual;
            if (visual) {
                renderable = visual.addView();
            }
        }
        if (renderable) {
            renderable.render(div, { display: "block" });
        }
    }

    public async loadAndRender(url: string, div: HTMLDivElement, pkg?: IFluidCodeDetails) {
        const container = await this.initializeContainer(url, pkg);

        container.on("contextChanged", (value) => {
            this.getComponentAndRender(url, div).catch(() => { });
        });
        await this.getComponentAndRender(url, div);

        return container;
    }
}
