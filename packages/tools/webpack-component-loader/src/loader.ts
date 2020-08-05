/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as moniker from "moniker";
import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct";
import { Deferred } from "@fluidframework/common-utils";
import {
    AttachState,
    IFluidModule,
    IFluidPackage,
    IFluidCodeDetails,
    IFluidCodeResolver,
    IProxyLoaderFactory,
    IResolvedFluidCodeDetails,
    isFluidPackage,
    DetachedContainerSource,
} from "@fluidframework/container-definitions";
import { Container, Loader } from "@fluidframework/container-loader";
import { IUrlResolver } from "@fluidframework/driver-definitions";
import { IUser } from "@fluidframework/protocol-definitions";
import { HTMLViewAdapter } from "@fluidframework/view-adapters";
import { IFluidMountableView } from "@fluidframework/view-interfaces";
import { extractPackageIdentifierDetails, WebCodeLoader } from "@fluidframework/web-code-loader";
import { IFluidObject } from "@fluidframework/core-interfaces";
import { RequestParser } from "@fluidframework/runtime-utils";
import { MultiUrlResolver } from "./multiResolver";
import { getDocumentServiceFactory } from "./multiDocumentServiceFactory";

export interface IDevServerUser extends IUser {
    name: string;
}

export interface IBaseRouteOptions {
    port: number;
    npm?: string;
}

export interface ILocalRouteOptions extends IBaseRouteOptions {
    mode: "local";
    single?: boolean;
}

export interface IDockerRouteOptions extends IBaseRouteOptions {
    mode: "docker";
    tenantId?: string;
    tenantSecret?: string;
    bearerSecret?: string;
}

export interface IRouterliciousRouteOptions extends IBaseRouteOptions {
    mode: "r11s";
    fluidHost?: string;
    tenantId?: string;
    tenantSecret?: string;
    bearerSecret?: string;
}

export interface ITinyliciousRouteOptions extends IBaseRouteOptions {
    mode: "tinylicious";
    bearerSecret?: string;
}

export interface IOdspRouteOptions extends IBaseRouteOptions {
    mode: "spo" | "spo-df";
    server?: string;
    odspAccessToken?: string;
    pushAccessToken?: string;
    forceReauth?: boolean;
    driveId?: string;
}

export type RouteOptions =
    | ILocalRouteOptions
    | IDockerRouteOptions
    | IRouterliciousRouteOptions
    | ITinyliciousRouteOptions
    | IOdspRouteOptions;

function wrapIfComponentPackage(packageJson: IFluidPackage, fluidModule: IFluidModule): IFluidModule {
    if (fluidModule.fluidExport.IRuntimeFactory === undefined) {
        const componentFactory = fluidModule.fluidExport.IFluidDataStoreFactory;

        const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
            packageJson.name,
            new Map([
                [packageJson.name, Promise.resolve(componentFactory)],
            ]),
        );
        return {
            fluidExport: {
                IRuntimeFactory: runtimeFactory,
                IFluidDataStoreFactory: componentFactory,
            },
        };
    }
    return fluidModule;
}

// Invoked by `start()` when the 'double' option is enabled to create the side-by-side panes.
function makeSideBySideDiv(divId: string) {
    const div = document.createElement("div");
    div.style.flexGrow = "1";
    div.style.width = "50%"; // ensure the divs don't encroach on each other
    div.style.border = "1px solid lightgray";
    div.style.boxSizing = "border-box";
    div.style.position = "relative"; // Make the new <div> a CSS containing block.
    div.id = divId;
    return div;
}

class WebpackCodeResolver implements IFluidCodeResolver {
    constructor(private readonly options: IBaseRouteOptions) { }
    async resolveCodeDetails(details: IFluidCodeDetails): Promise<IResolvedFluidCodeDetails> {
        const baseUrl = details.config.cdn ?? `http://localhost:${this.options.port}`;
        let pkg = details.package;
        if (typeof pkg === "string") {
            const resp = await fetch(`${baseUrl}/package.json`);
            pkg = await resp.json() as IFluidPackage;
        }
        if (!isFluidPackage(pkg)) {
            throw new Error("Not a fluid package");
        }
        const files = pkg.fluid.browser.umd.files;
        for (let i = 0; i < pkg.fluid.browser.umd.files.length; i++) {
            if (!files[i].startsWith("http")) {
                files[i] = `${baseUrl}/${files[i]}`;
            }
        }
        const parse = extractPackageIdentifierDetails(details.package);
        return {
            config: details.config,
            package: details.package,
            resolvedPackage: pkg,
            resolvedPackageCacheId: parse.fullId,
        };
    }
}

/**
 * Create a loader with WebCodeLoader and return it.
 */
async function createWebLoader(
    documentId: string,
    fluidModule: IFluidModule,
    options: RouteOptions,
    urlResolver: IUrlResolver,
    codeDetails: IFluidCodeDetails,
): Promise<Loader> {
    const documentServiceFactory = getDocumentServiceFactory(documentId, options);
    const codeLoader = new WebCodeLoader(new WebpackCodeResolver(options));

    await codeLoader.seedModule(codeDetails, wrapIfComponentPackage(codeDetails.package as IFluidPackage, fluidModule));

    return new Loader(
        urlResolver,
        documentServiceFactory,
        codeLoader,
        { blockUpdateMarkers: true },
        {},
        new Map<string, IProxyLoaderFactory>());
}

export async function start(
    id: string,
    packageJson: IFluidPackage,
    fluidModule: IFluidModule,
    options: RouteOptions,
    div: HTMLDivElement,
): Promise<void> {
    let documentId: string = id;
    let url = window.location.href;

    /**
     * For new documents, the `url` is of the format - http://localhost:8080/new or http://localhost:8080/manualAttach.
     * So, we create a new `id` and use that as the `documentId`.
     * We will also replace the url in the browser with a new url of format - http://localhost:8080/doc/<documentId>.
     */
    const autoAttach: boolean = id === "new";
    const manualAttach: boolean = id === "manualAttach";
    if (autoAttach || manualAttach) {
        documentId = moniker.choose();
        url = url.replace(id, `doc/${documentId}`);
    }

    const codeDetails: IFluidCodeDetails = {
        package: packageJson,
        config: {},
    };

    const source: DetachedContainerSource = {
        codeDetails,
        useSnapshot: false,
    };

    const urlResolver = new MultiUrlResolver(window.location.origin, options);

    // Create the loader that is used to load the Container.
    const loader1 = await createWebLoader(documentId, fluidModule, options, urlResolver, codeDetails);

    let container1: Container;
    if (autoAttach || manualAttach) {
        // For new documents, create a detached container which will be attached later.
        container1 = await loader1.createDetachedContainer(source);
    } else {
        // For existing documents, we try to load the container with the given documentId.
        const documentUrl = `${window.location.origin}/${documentId}`;
        container1 = await loader1.resolve({ url: documentUrl });

        /**
         * For existing documents, the container should already exist. If it doesn't, we treat this as the new
         * document scenario.
         * Create a new `documentId`, a new Loader and a new detached container.
         */
        if (!container1.existing) {
            console.warn(`Document with id ${documentId} not found. Falling back to creating a new document.`);
            container1.close();

            documentId = moniker.choose();
            url = url.replace(id, documentId);

            const newLoader = await createWebLoader(documentId, fluidModule, options, urlResolver, codeDetails);
            container1 = await newLoader.createDetachedContainer(source);
        }
    }

    let leftDiv: HTMLDivElement = div;
    let rightDiv: HTMLDivElement;

    // For side by side mode, create two divs.
    if (options.mode === "local" && !options.single) {
        div.style.display = "flex";
        leftDiv = makeSideBySideDiv("sbs-left");
        rightDiv = makeSideBySideDiv("sbs-right");
        div.append(leftDiv, rightDiv);
    }

    const reqParser = new RequestParser({ url });
    const componentUrl = `/${reqParser.createSubRequest(4).url}`;

    // Load and render the component.
    await getComponentAndRender(container1, componentUrl, leftDiv);
    // Handle the code upgrade scenario (which fires contextChanged)
    container1.on("contextChanged", () => {
        getComponentAndRender(container1, componentUrl, leftDiv).catch(() => { });
    });

    // We have rendered the component. If the container is detached, attach it now.
    if (container1.attachState === AttachState.Detached) {
        await attachContainer(container1, urlResolver, documentId, url, rightDiv, manualAttach);
    }

    // For side by side mode, we need to create a second container and component.
    if (rightDiv) {
        // Create a new loader that is used to load the second container.
        const loader2 = await createWebLoader(documentId, fluidModule, options, urlResolver, codeDetails);

        // Create a new request url from the resolvedUrl of the first container.
        const requestUrl2 = await urlResolver.getAbsoluteUrl(container1.resolvedUrl, "");
        const container2 = await loader2.resolve({ url: requestUrl2 });

        await getComponentAndRender(container2, componentUrl, rightDiv);
        // Handle the code upgrade scenario (which fires contextChanged)
        container2.on("contextChanged", () => {
            getComponentAndRender(container2, componentUrl, rightDiv).catch(() => { });
        });
    }
}

async function getComponentAndRender(container: Container, url: string, div: HTMLDivElement) {
    const response = await container.request({
        headers: {
            mountableView: true,
        },
        url,
    });

    if (response.status !== 200 ||
        !(
            response.mimeType === "fluid/object" ||
            response.mimeType === "fluid/component"
        )) {
        return false;
    }

    const component = response.value as IFluidObject;
    if (component === undefined) {
        return;
    }

    // We should be retaining a reference to mountableView long-term, so we can call unmount() on it to correctly
    // remove it from the DOM if needed.
    const mountableView: IFluidMountableView = component.IFluidMountableView;
    if (mountableView !== undefined) {
        mountableView.mount(div);
        return;
    }

    // If we don't get a mountable view back, we can still try to use a view adapter.  This won't always work (e.g.
    // if the response is a React-based component using hooks) and is not the preferred path, but sometimes it
    // can work.
    console.warn(`Container returned a non-IFluidMountableView.  This can cause errors when mounting components `
        + `with React hooks across bundle boundaries.  URL: ${url}`);
    const view = new HTMLViewAdapter(component);
    view.render(div, { display: "block" });
}

/**
 * Attached a detached container.
 * In case of manual attach (when manualAttach is true), it creates a button and attaches the container when the button
 * is clicked. Otherwise, it attaches the conatiner right away.
 */
async function attachContainer(
    container: Container,
    urlResolver: MultiUrlResolver,
    documentId: string,
    url: string,
    div: HTMLDivElement | undefined,
    manualAttach: boolean,
) {
    // This is called once loading is complete to replace the url in the address bar with the new `url`.
    const replaceUrl = () => {
        window.history.replaceState({}, "", url);
        document.title = documentId;
    };

    const attached = new Deferred();
    const attachUrl = await urlResolver.createRequestForCreateNew(documentId);

    if (manualAttach) {
        // Create an "Attach Container" button that the user can click when they want to attach the container.
        const attachDiv = document.createElement("div");
        const attachButton = document.createElement("button");
        attachButton.innerText = "Attach Container";
        attachDiv.append(attachButton);
        document.body.prepend(attachDiv);

        attachButton.onclick = () => {
            container.attach(attachUrl)
                .then(() => {
                    attachDiv.remove();
                    replaceUrl();

                    if (div) {
                        div.innerText = "";
                    }

                    attached.resolve();
                }, (error) => {
                    console.error(error);
                });
        };

        // If we are in side-by-side mode, we need to display the following message in the right div passed here.
        if (div) {
            div.innerText = "Waiting for container attach";
        }
    } else {
        await container.attach(attachUrl);
        replaceUrl();
        attached.resolve();
    }

    return attached.promise;
}
