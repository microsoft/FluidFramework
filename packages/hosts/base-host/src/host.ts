/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IComponent,
    IComponentHTMLVisual,
    IComponentQueryableLegacy,
    IRequest,
} from "@microsoft/fluid-component-core-interfaces";
import { ICodeWhiteList } from "@microsoft/fluid-container-definitions";
import { Container, Loader } from "@microsoft/fluid-container-loader";
import {
    IFluidResolvedUrl,
    IResolvedUrl,
} from "@microsoft/fluid-protocol-definitions";
import { IResolvedPackage, WebCodeLoader, WhiteList } from "@microsoft/fluid-web-code-loader";
import { IHostConfig } from "./hostConfig";

/**
 * Interface to provide the info about the session.
 */
export interface IPrivateSessionInfo {
    /**
     * Whether the session is outer session or not.
     */
    outerSession?: boolean;

    /**
     * Whether the session is inner session or not.
     */
    innerSession?: boolean;

    /**
     * IFrame in which the inner session is loaded.
     */
    frameP?: Promise<HTMLIFrameElement>;

    /**
     * Request to be resolved.
     */
    request?: IRequest;
}

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
    const queryable = component as IComponentQueryableLegacy;
    let viewable = component.IComponentHTMLVisual;
    if (!viewable && queryable.query) {
        viewable = queryable.query<IComponentHTMLVisual>("IComponentHTMLVisual");
    }
    if (viewable) {
        const renderable =
            viewable.addView ? viewable.addView() : viewable;

        renderable.render(div, { display: "block" });
        return;
    }
}

export async function initializeChaincode(document: Container, pkg: IResolvedPackage): Promise<void> {
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
    if (!quorum.has("code2")) {
        // We propose both code and code2. code2 is the legacy format of just a string. code is the new object
        // based format.
        await Promise.all([
            quorum.propose("code", pkg.details),
            quorum.propose("code2", pkg.parsed.full),
        ]);
    }

    console.log(`Code is ${quorum.get("code2")}`);
}

export async function registerAttach(loader: Loader, container: Container, uri: string, div: HTMLDivElement) {
    attach(loader, uri, div);
    container.on("contextChanged", (value) => {
        attach(loader, uri, div);
    });
}

/**
 * Create a loader and return it.
 * @param resolved - A resolved package with cdn links. Overrides a query paramter.
 * @param pkg - A resolved package with cdn links. Overrides a query paramter.
 * @param scriptIds - The script tags the chaincode are attached to the view with.
 * @param config - Any config to be provided to loader.
 * @param scope - Scope of the component.
 * @param hostConf - Config specifying the resolver/factory to be used.
 * @param whiteList - functionality to check the validity of code to be loaded.
 */
export function createWebLoader(
    resolved: IResolvedUrl,
    pkg: IResolvedPackage,
    scriptIds: string[],
    config: any,
    scope: IComponent,
    hostConf: IHostConfig,
    whiteList?: ICodeWhiteList,
): Loader {

    // Create the web loader and prefetch the chaincode we will need
    const codeLoader = new WebCodeLoader(whiteList);
    if (pkg) {
        if (pkg.pkg) { // this is an IFluidPackage
            codeLoader.seed({
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
    // we need to extend options, otherwise we nest properties, like client, too deeply
    //
    // tslint:disable-next-line: no-unsafe-any
    config.blockUpdateMarkers = true;
    // tslint:disable-next-line: no-unsafe-any
    config.tokens = (resolved as IFluidResolvedUrl).tokens;

    return new Loader(
        { resolver: hostConf.urlResolver },
        hostConf.documentServiceFactory,
        codeLoader,
        config,
        scope);
}

/**
 * Function to load the container from the given url and initialize the chaincode.
 * @param url - Url of the Fluid component to be loaded.
 * @param resolved - A resolved package with cdn links. Overrides a query paramter.
 * @param pkg - A resolved package with cdn links. Overrides a query paramter.
 * @param scriptIds - The script tags the chaincode are attached to the view with.
 * @param npm - path from where the packages can be fetched.
 * @param config - Any config to be provided to loader.
 * @param scope - Scope of the component.
 * @param div - The div to load the component into.
 * @param hostConf - Config specifying the resolver/factory to be used.
 */
export async function start(
    url: string,
    resolved: IResolvedUrl,
    pkg: IResolvedPackage,
    scriptIds: string[],
    npm: string,
    config: any,
    scope: IComponent,
    div: HTMLDivElement,
    hostConf: IHostConfig,
): Promise<Container> {
    const loader = createWebLoader(
        resolved,
        pkg,
        scriptIds,
        config,
        scope,
        hostConf,
        new WhiteList(),
        );

    const container = await loader.resolve({ url });
    registerAttach(
        loader,
        container,
        url,
        div);

    // If this is a new document we will go and instantiate the chaincode. For old documents we assume a legacy
    // package.
    if (!container.existing) {
            await initializeChaincode(container, pkg)
                .catch((error) => console.error("chaincode error", error));
    }

    return container;
}
