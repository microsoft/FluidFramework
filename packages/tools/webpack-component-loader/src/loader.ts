/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as moniker from "moniker";
import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct";
import { Deferred } from "@fluidframework/common-utils";
import {
    IFluidModule,
    IFluidPackage,
    IFluidCodeDetails,
    IFluidCodeResolver,
    IProxyLoaderFactory,
    IResolvedFluidCodeDetails,
    isFluidPackage,
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
 * Create a loader and return it.
 * @param hostConfig - Config specifying the resolver/factory to be used.
 * @param pkg - A resolved package with cdn links.
 * @param scriptIds - The script tags the chaincode are attached to the view with.
 */
async function createWebLoader(
    documentId: string,
    packageJson: IFluidPackage,
    fluidModule: IFluidModule,
    options: RouteOptions,
    urlResolver: IUrlResolver,
    codeDetails: IFluidCodeDetails,
): Promise<Loader> {
    const documentServiceFactory = getDocumentServiceFactory(documentId, options);
    const codeLoader = new WebCodeLoader(new WebpackCodeResolver(options));

    await codeLoader.seedModule(codeDetails, wrapIfComponentPackage(packageJson, fluidModule));

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
     * For a new document, the `url` is of the format - http://localhost:8080/createNew.
     * So, we create a new `documentId` and replace the "createNew" in the `url` with the `documentId`.
     * We will replace the url in the browser with this `url` once loading is complete.
     */
    let createNew: boolean = id === "createNew";
    if (createNew) {
        documentId = moniker.choose();
        url = url.replace("createNew", documentId);
    }

    const codeDetails: IFluidCodeDetails = {
        package: packageJson,
        config: {},
    };
    const urlResolver = new MultiUrlResolver(window.location.origin, documentId, options);

    // Create the loader that is used to load the Container.
    const loader1 = await createWebLoader(documentId, packageJson, fluidModule, options, urlResolver, codeDetails);
    const container1Attached = new Deferred();

    // For a new document, this is called once loading is complete to replace the url in the address bar with the
    // new `url` with the `documentId`.
    const replaceUrl = () => {
        window.history.replaceState({}, "", url);
        document.title = documentId;
    };

    let container1: Container;

    if (window.location.hash.toLocaleLowerCase().includes("manualattach")) {
        // Manual attach flow. Create a detached conatiner and attach it only after the user clicks the
        // "Attach Container" button that is created below.
        container1 = await loader1.createDetachedContainer(codeDetails);

        const attachDiv = document.createElement("div");
        const attachButton = document.createElement("button");
        attachButton.innerText = "Attach Container";
        attachDiv.append(attachButton);
        document.body.prepend(attachDiv);

        const attachUrl = await urlResolver.createRequestForCreateNew(documentId);
        attachButton.onclick = () => {
            container1.attach(attachUrl)
                .then(() => {
                    container1Attached.resolve();
                    attachDiv.remove();
                    replaceUrl();
                    window.location.hash = "";
                }, (error) => {
                    console.error(error);
                });
        };

        // Set `createNew` to false because we already created a detached container and don't want to do it again.
        createNew = false;
    } else if (!createNew) {
        // Load existing document flow. We try to load the container with the document id in the `url`.
        container1 = await loader1.resolve({ url });

        /**
         * For existing document scenario, the container should already exist. If it doesn't, we treat this as the new
         * document scenario. Replace the `documentId` with `createNew` and reload the page.
         * Note that we can't use the same `documentId` because the document is already created in `loader.resolve`.
         */
        if (!container1.existing) {
            container1.close();
            window.location.href = window.location.href.replace(documentId, "createNew");
        } else {
            container1Attached.resolve();
        }
    }

    // This is the new document flow. Create a detached container.
    if (createNew) {
        container1 = await loader1.createDetachedContainer(codeDetails);
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
    const componentUrl = `/${reqParser.createSubRequest(3).url}`;

    await getComponentAndRender(container1, componentUrl, leftDiv);
    // Handle the code upgrade scenario (which fires contextChanged)
    container1.on("contextChanged", () => {
        getComponentAndRender(container1, componentUrl, leftDiv).catch(() => { });
    });

    // Now that we have rendered the component, attach the detached container and replace the url in the address bar.
    if (createNew) {
        const attachUrl = await urlResolver.createRequestForCreateNew(documentId);
        await container1.attach(attachUrl);
        replaceUrl();
        container1Attached.resolve();
    }

    // For side by side mode, we need to create a second container and component.
    if (rightDiv) {
        // In manual attach scenario, we display this message in the right div until the user clicks on the
        // "Attach Container" button.
        if (!container1Attached.isCompleted) {
            rightDiv.innerText = "Waiting for container attach";
        }

        await container1Attached.promise;

        // Create a new loader that is used to load the second container.
        const loader2 = await createWebLoader(documentId, packageJson, fluidModule, options, urlResolver, codeDetails);

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
