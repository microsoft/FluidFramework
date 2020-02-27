/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent } from "@microsoft/fluid-component-core-interfaces";
import {
    IFluidCodeDetails,
    IProxyLoaderFactory,
} from "@microsoft/fluid-container-definitions";
import { Container, Loader } from "@microsoft/fluid-container-loader";
import { IFluidResolvedUrl, IResolvedUrl } from "@microsoft/fluid-driver-definitions";
import { IResolvedPackage, WebCodeLoader } from "@microsoft/fluid-web-code-loader";
import { IBaseHostConfig } from "./hostConfig";
import { initializeContainerCode } from "./initializeContainerCode";


async function getComponentAndRender(loader: Loader, url: string, div: HTMLDivElement) {
    const response = await loader.request({ url });

    if (response.status !== 200 ||
        !(
            response.mimeType === "fluid/component" ||
            response.mimeType === "prague/component"
        )) {
        return;
    }

    // Check if the component is viewable
    const component = response.value as IComponent;
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

/**
 * Create a loader and return it.
 * @param hostConfig - Config specifying the resolver/factory to be used.
 * @param resolved - A resolved url from a url resolver.
 * @param pkg - A resolved package with cdn links.
 * @param scriptIds - The script tags the chaincode are attached to the view with.
 */
async function createWebLoader(
    hostConfig: IBaseHostConfig,
    resolved: IResolvedUrl,
    pkg: IResolvedPackage | undefined,
    scriptIds: string[],
): Promise<Loader> {

    // Create the web loader and prefetch the chaincode we will need
    const codeLoader = new WebCodeLoader(hostConfig.whiteList);
    if (pkg) {
        if (pkg.pkg) { // This is an IFluidPackage
            await codeLoader.seed({
                package: pkg.pkg,
                config: pkg.details.config,
                scriptIds,
            });
            if (pkg.details.package === pkg.pkg.name) {
                pkg.details.package = `${pkg.pkg.name}@${pkg.pkg.version}`;
            }
        }

        // The load takes in an IFluidCodeDetails
        codeLoader.load(pkg.details).catch((error) => console.error("script load error", error));
    }

    const config = hostConfig.config ? hostConfig.config : {};

    // We need to extend options, otherwise we nest properties, like client, too deeply
    //
    config.blockUpdateMarkers = true;
    config.tokens = (resolved as IFluidResolvedUrl).tokens;

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
        resolved: IResolvedUrl,
        pkg: IResolvedPackage | undefined,
        scriptIds: string[],
        div: HTMLDivElement,
    ): Promise<Container> {
        const baseHost = new BaseHost(hostConfig, resolved, pkg, scriptIds);
        return baseHost.loadAndRender(url, div, pkg ? pkg.details : undefined);
    }

    public static async create(
        hostConfig: IBaseHostConfig,
        resolved: IResolvedUrl,
        pkg: IResolvedPackage,
        scriptIds: string[],
        div: HTMLDivElement,
    ): Promise<Container> {
        const baseHost = new BaseHost(hostConfig, resolved, pkg, scriptIds);
        return baseHost.createAndRender(div, pkg.details);
    }

    private readonly loaderP: Promise<Loader>;
    public constructor(
        hostConfig: IBaseHostConfig,
        resolved: IResolvedUrl,
        seedPackage: IResolvedPackage | undefined,
        scriptIds: string[],
    ) {

        this.loaderP = createWebLoader(
            hostConfig,
            resolved,
            seedPackage,
            scriptIds,
        );
    }

    public async getLoader() {
        return this.loaderP;
    }

    public async loadAndRender(url: string, div: HTMLDivElement, pkg?: IFluidCodeDetails) {
        const loader = await this.getLoader();
        const container = await loader.resolve({ url });

        container.on("contextChanged", (value) => {
            getComponentAndRender(loader, url, div).catch(() => { });
        });
        await getComponentAndRender(loader, url, div);

        // if a package is provided, try to initialize the code proposal with it
        // if not we assume the contianer already has a code proposal
        if (pkg) {
            await initializeContainerCode(container, pkg)
                .catch((error) => console.error("code proposal error", error));
        }

        return container;
    }

    public async createAndRender(div: HTMLDivElement, pkg: IFluidCodeDetails) {
        const loader = await this.getLoader();

        const container = await loader.createDetachedContainer(pkg);
        const response = await container.request({ url: "/" });

        // Check if the component is viewable
        const component = response.value as IComponent;
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

        return container;
    }
}
