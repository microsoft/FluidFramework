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

async function attach(loader: Loader, url: string, div: HTMLDivElement) {
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
    const viewable = component.IComponentHTMLVisual;

    if (viewable) {
        const renderable =
            viewable.addView ? viewable.addView() : viewable;

        renderable.render(div, { display: "block" });
        return;
    }
}

async function initializeChaincode(document: Container, pkg?: IFluidCodeDetails): Promise<void> {
    if (!pkg) {
        return;
    }

    const quorum = document.getQuorum();

    // Wait for connection so that proposals can be sent
    if (!document.connected) {
        // tslint:disable-next-line: no-unnecessary-callback-wrapper
        await new Promise<void>((resolve) => document.on("connected", () => resolve()));
    }

    // And then make the proposal if a code proposal has not yet been made
    if (!quorum.has("code")) {
        await quorum.propose("code", pkg);
    }

    console.log(`Code is ${quorum.get("code")}`);
}

async function registerAttach(loader: Loader, container: Container, uri: string, div: HTMLDivElement) {
    container.on("contextChanged", async (value) => {
        await attach(loader, uri, div);
    });
    await attach(loader, uri, div);
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
        // tslint:disable-next-line: strict-boolean-expressions
        if (pkg.pkg) { // this is an IFluidPackage
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

    // we need to extend options, otherwise we nest properties, like client, too deeply
    //
    // tslint:disable-next-line: no-unsafe-any
    config.blockUpdateMarkers = true;
    // tslint:disable-next-line: no-unsafe-any
    config.tokens = (resolved as IFluidResolvedUrl).tokens;

    const scope = hostConfig.scope ? hostConfig.scope : {};
    const proxyLoaderFactories = hostConfig.proxyLoaderFactories ?
        hostConfig.proxyLoaderFactories : new Map<string, IProxyLoaderFactory>();

    return new Loader(
        { resolver: hostConfig.urlResolver },
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
        await registerAttach(
            loader,
            container,
            url,
            div);

        // If this is a new document we will go and instantiate the chaincode. For old documents we assume a legacy
        // package.
        // tslint:disable-next-line: strict-boolean-expressions
        if (!container.existing) {
            await initializeChaincode(container, pkg)
                .catch((error) => console.error("chaincode error", error));
        }

        return container;
    }
}
