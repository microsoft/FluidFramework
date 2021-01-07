/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as moniker from "moniker";
import { v4 as uuid } from "uuid";
import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct";
import { Deferred } from "@fluidframework/common-utils";
import {
    AttachState,
    IFluidModule,
    IFluidCodeResolver,
    IResolvedFluidCodeDetails,
    isFluidBrowserPackage,
} from "@fluidframework/container-definitions";
import { Container, Loader } from "@fluidframework/container-loader";
import { IUser } from "@fluidframework/protocol-definitions";
import { HTMLViewAdapter } from "@fluidframework/view-adapters";
import { IFluidMountableView } from "@fluidframework/view-interfaces";
import {
    extractPackageIdentifierDetails,
    resolveFluidPackageEnvironment,
    WebCodeLoader,
} from "@fluidframework/web-code-loader";
import { IFluidObject, IFluidPackage, IFluidCodeDetails } from "@fluidframework/core-interfaces";
import { IDocumentServiceFactory } from "@fluidframework/driver-definitions";
import { LocalDocumentServiceFactory, LocalResolver } from "@fluidframework/local-driver";
import { RequestParser, createDataStoreFactory } from "@fluidframework/runtime-utils";
import { MultiUrlResolver } from "./multiResolver";
import { deltaConns, getDocumentServiceFactory } from "./multiDocumentServiceFactory";

export interface IDevServerUser extends IUser {
    name: string;
}

export interface IBaseRouteOptions {
    port: number;
    npm?: string;
    hotSwapContext?: "true" | "false";
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

function wrapWithRuntimeFactoryIfNeeded(packageJson: IFluidPackage, fluidModule: IFluidModule): IFluidModule {
    if (fluidModule.fluidExport.IRuntimeFactory === undefined) {
        const dataStoreFactory = fluidModule.fluidExport.IFluidDataStoreFactory;

        const defaultFactory = createDataStoreFactory(packageJson.name, dataStoreFactory);

        const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
            defaultFactory,
            new Map([
                [defaultFactory.type, Promise.resolve(defaultFactory)],
            ]),
        );
        return {
            fluidExport: {
                IRuntimeFactory: runtimeFactory,
                IFluidDataStoreFactory: dataStoreFactory,
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
        if (!isFluidBrowserPackage(pkg)) {
            throw new Error("Not a Fluid package");
        }
        const browser =
            resolveFluidPackageEnvironment(pkg.fluid.browser, baseUrl);
        const parse = extractPackageIdentifierDetails(pkg);
        return {
            ...details,
            resolvedPackage: {
                ...pkg,
                fluid: {
                    ...pkg.fluid,
                    browser,
                },
            },
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
    urlResolver: MultiUrlResolver,
    codeDetails: IFluidCodeDetails,
    testOrderer: boolean = false,
): Promise<Loader> {
    let documentServiceFactory: IDocumentServiceFactory = getDocumentServiceFactory(documentId, options);
    // Create the inner document service which will be wrapped inside local driver. The inner document service
    // will be used for ops(like delta connection/delta ops) while for storage, local storage would be used.
    if (testOrderer) {
        const resolvedUrl = await urlResolver.resolve(await urlResolver.createRequestForCreateNew(documentId));
        const innerDocumentService = await documentServiceFactory.createDocumentService(resolvedUrl);
        documentServiceFactory = new LocalDocumentServiceFactory(
            deltaConns.get(documentId),
            innerDocumentService);
    }

    const codeLoader = new WebCodeLoader(new WebpackCodeResolver(options));

    await codeLoader.seedModule(
        codeDetails,
        wrapWithRuntimeFactoryIfNeeded(codeDetails.package as IFluidPackage, fluidModule),
    );

    return new Loader({
        urlResolver: testOrderer ?
            new MultiUrlResolver(documentId, window.location.origin, options, true) : urlResolver,
        documentServiceFactory,
        codeLoader,
        options: { hotSwapContext: options.hotSwapContext === "true" },
    });
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
    const autoAttach: boolean = id === "new" || id === "testorderer";
    const manualAttach: boolean = id === "manualAttach";
    const testOrderer = id === "testorderer";
    if (autoAttach || manualAttach) {
        documentId = moniker.choose();
        url = url.replace(id, `doc/${documentId}`);
    }

    const codeDetails: IFluidCodeDetails = {
        package: packageJson,
        config: {},
    };

    let urlResolver = new MultiUrlResolver(documentId, window.location.origin, options);

    // Create the loader that is used to load the Container.
    let loader1 = await createWebLoader(documentId, fluidModule, options, urlResolver, codeDetails, testOrderer);

    let container1: Container;
    if (autoAttach || manualAttach) {
        // For new documents, create a detached container which will be attached later.
        container1 = await loader1.createDetachedContainer(codeDetails);
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
            urlResolver = new MultiUrlResolver(documentId, window.location.origin, options);
            loader1 = await createWebLoader(documentId, fluidModule, options, urlResolver, codeDetails, testOrderer);
            container1 = await loader1.createDetachedContainer(codeDetails);
        }
    }

    let leftDiv: HTMLDivElement = div;
    let rightDiv: HTMLDivElement | undefined;

    // For side by side mode, create two divs. Use side by side mode to test orderer.
    if ((options.mode === "local" && !options.single) || testOrderer) {
        div.style.display = "flex";
        leftDiv = makeSideBySideDiv("sbs-left");
        rightDiv = makeSideBySideDiv("sbs-right");
        div.append(leftDiv, rightDiv);
    }

    const reqParser = RequestParser.create({ url });
    const fluidObjectUrl = `/${reqParser.createSubRequest(4).url}`;

    // Load and render the Fluid object.
    await getFluidObjectAndRender(container1, fluidObjectUrl, leftDiv);
    // Handle the code upgrade scenario (which fires contextChanged)
    container1.on("contextChanged", () => {
        getFluidObjectAndRender(container1, fluidObjectUrl, leftDiv).catch(() => { });
    });

    // We have rendered the Fluid object. If the container is detached, attach it now.
    if (container1.attachState === AttachState.Detached) {
        container1 = await attachContainer(
            loader1,
            container1,
            fluidObjectUrl,
            urlResolver,
            documentId,
            url,
            leftDiv,
            rightDiv,
            manualAttach,
            testOrderer,
        );
    }

    // For side by side mode, we need to create a second container and Fluid object.
    if (rightDiv) {
        // Create a new loader that is used to load the second container.
        const loader2 = await createWebLoader(documentId, fluidModule, options, urlResolver, codeDetails, testOrderer);

        // Create a new request url from the resolvedUrl of the first container.
        const requestUrl2 = await urlResolver.getAbsoluteUrl(container1.resolvedUrl, "");
        const container2 = await loader2.resolve({ url: requestUrl2 });

        await getFluidObjectAndRender(container2, fluidObjectUrl, rightDiv);
        // Handle the code upgrade scenario (which fires contextChanged)
        container2.on("contextChanged", () => {
            getFluidObjectAndRender(container2, fluidObjectUrl, rightDiv).catch(() => { });
        });
    }
}

async function getFluidObjectAndRender(container: Container, url: string, div: HTMLDivElement) {
    const response = await container.request({
        headers: {
            mountableView: true,
        },
        url,
    });

    if (response.status !== 200 ||
        !(
            response.mimeType === "fluid/object"
        )) {
        return false;
    }

    const fluidObject = response.value as IFluidObject;
    if (fluidObject === undefined) {
        return;
    }

    // We should be retaining a reference to mountableView long-term, so we can call unmount() on it to correctly
    // remove it from the DOM if needed.
    const mountableView: IFluidMountableView = fluidObject.IFluidMountableView;
    if (mountableView !== undefined) {
        mountableView.mount(div);
        return;
    }

    // If we don't get a mountable view back, we can still try to use a view adapter.  This won't always work (e.g.
    // if the response is a React-based Fluid object using hooks) and is not the preferred path, but sometimes it
    // can work.
    console.warn(`Container returned a non-IFluidMountableView.  This can cause errors when mounting Fluid objects `
        + `with React hooks across bundle boundaries.  URL: ${url}`);
    const view = new HTMLViewAdapter(fluidObject);
    view.render(div, { display: "block" });
}

/**
 * Attached a detached container.
 * In case of manual attach (when manualAttach is true), it creates a button and attaches the container when the button
 * is clicked. Otherwise, it attaches the container right away.
 */
async function attachContainer(
    loader: Loader,
    container: Container,
    fluidObjectUrl: string,
    urlResolver: MultiUrlResolver,
    documentId: string,
    url: string,
    leftDiv: HTMLDivElement,
    rightDiv: HTMLDivElement | undefined,
    manualAttach: boolean,
    testOrderer: boolean,
) {
    // This is called once loading is complete to replace the url in the address bar with the new `url`.
    const replaceUrl = () => {
        window.history.replaceState({}, "", url);
        document.title = documentId;
    };

    let currentContainer = container;
    let currentLeftDiv = leftDiv;
    const attached = new Deferred();
    // To test orderer, we use local driver as wrapper for actual document service. So create request
    // using local resolver.
    const attachUrl = testOrderer ? new LocalResolver().createCreateNewRequest(documentId)
        : await urlResolver.createRequestForCreateNew(documentId);

    if (manualAttach) {
        // Create an "Attach Container" button that the user can click when they want to attach the container.
        const attachDiv = document.createElement("div");
        const attachButton = document.createElement("button");
        attachButton.innerText = "Attach Container";
        const serializeButton = document.createElement("button");
        serializeButton.innerText = "Serialize";
        const rehydrateButton = document.createElement("button");
        rehydrateButton.innerText = "Rehydrate Container";
        rehydrateButton.hidden = true;
        const summaryList = document.createElement("select");
        summaryList.hidden = true;
        attachDiv.append(attachButton);
        attachDiv.append(serializeButton);
        attachDiv.append(summaryList);
        document.body.prepend(attachDiv);

        let summaryNum = 1;
        serializeButton.onclick = () => {
            summaryList.hidden = false;
            rehydrateButton.hidden = false;
            attachDiv.append(rehydrateButton);
            const summary = currentContainer.serialize();
            const listItem = document.createElement("option");
            listItem.innerText = `Summary_${summaryNum}`;
            summaryNum += 1;
            listItem.value = summary;
            summaryList.appendChild(listItem);
            rehydrateButton.onclick = async () => {
                const snapshot = summaryList.value;
                currentContainer = await loader.rehydrateDetachedContainerFromSnapshot(snapshot);
                let newLeftDiv: HTMLDivElement;
                if (rightDiv !== undefined) {
                    newLeftDiv = makeSideBySideDiv(uuid());
                } else {
                    newLeftDiv = document.createElement("div");
                }
                currentLeftDiv.replaceWith(newLeftDiv);
                currentLeftDiv = newLeftDiv;
                // Load and render the component.
                await getFluidObjectAndRender(currentContainer, fluidObjectUrl, newLeftDiv);
                // Handle the code upgrade scenario (which fires contextChanged)
                currentContainer.on("contextChanged", () => {
                    getFluidObjectAndRender(currentContainer, fluidObjectUrl, newLeftDiv).catch(() => { });
                });
            };
        };

        attachButton.onclick = () => {
            currentContainer.attach(attachUrl)
                .then(() => {
                    attachDiv.remove();
                    replaceUrl();

                    if (rightDiv) {
                        rightDiv.innerText = "";
                    }

                    attached.resolve();
                }, (error) => {
                    console.error(error);
                });
        };

        // If we are in side-by-side mode, we need to display the following message in the right div passed here.
        if (rightDiv) {
            rightDiv.innerText = "Waiting for container attach";
        }
    } else {
        await currentContainer.attach(attachUrl);
        replaceUrl();
        attached.resolve();
    }
    await attached.promise;
    return currentContainer;
}
