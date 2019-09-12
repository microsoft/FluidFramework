/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IComponent,
    IComponentHTMLVisual,
    IComponentQueryableLegacy,
    IRequest,
} from "@prague/component-core-interfaces";
import { ICodeLoader } from "@prague/container-definitions";
import { Container, Loader } from "@prague/container-loader";
import { IResolvedPackage, WebCodeLoader } from "@prague/loader-web";
import {
    IFluidResolvedUrl,
    IResolvedUrl,
} from "@prague/protocol-definitions";
import { IHostConfig } from "./hostConfig";

export interface IPrivateSessionInfo {
    outerSession?: boolean;

    innerSession?: boolean;

    frameP?: Promise<HTMLIFrameElement>;

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

export function createLoader(
    resolved: IResolvedUrl,
    config: any,
    scope: IComponent,
    codeLoader: ICodeLoader,
    hostConf: IHostConfig,
): Loader {

    const options = {
        blockUpdateMarkers: true,
        config,
        tokens: (resolved as IFluidResolvedUrl).tokens,
    };

    return new Loader(
        { resolver: hostConf.urlResolver },
        hostConf.documentServiceFactory,
        codeLoader,
        options,
        scope);
}

export function createWebLoader(
    resolved: IResolvedUrl,
    pkg: IResolvedPackage,
    scriptIds: string[],
    npm: string,
    config: any,
    scope: IComponent,
    hostConf: IHostConfig,
): Loader {
    // Create the web loader and prefetch the chaincode we will need
    const codeLoader = new WebCodeLoader(npm);
    if (pkg) {
        if (pkg.pkg) { // this is an IFluidPackage
            codeLoader.seed(pkg.pkg, pkg.details.config, scriptIds);
            if (pkg.details.package === pkg.pkg.name) {
                pkg.details.package = `${pkg.pkg.name}@${pkg.pkg.version}`;
            }
        }

        // The load takes in an IFluidCodeDetails
        codeLoader.load(pkg.details).catch((error) => console.error("script load error", error));
    }

    const loader = createLoader(
        resolved,
        config,
        scope,
        codeLoader,
        hostConf);
    return loader;
}

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
    const loader = createWebLoader(resolved, pkg, scriptIds, npm, config, scope, hostConf);

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
