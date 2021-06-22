"use strict";
/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.start = exports.isSynchronized = void 0;
const moniker = __importStar(require("moniker"));
const uuid_1 = require("uuid");
const aqueduct_1 = require("@fluidframework/aqueduct");
const common_utils_1 = require("@fluidframework/common-utils");
const container_definitions_1 = require("@fluidframework/container-definitions");
const container_loader_1 = require("@fluidframework/container-loader");
const odsp_driver_1 = require("@fluidframework/odsp-driver");
const view_adapters_1 = require("@fluidframework/view-adapters");
const web_code_loader_1 = require("@fluidframework/web-code-loader");
const local_driver_1 = require("@fluidframework/local-driver");
const runtime_utils_1 = require("@fluidframework/runtime-utils");
const multiResolver_1 = require("./multiResolver");
const multiDocumentServiceFactory_1 = require("./multiDocumentServiceFactory");
const odspPersistantCache_1 = require("./odspPersistantCache");
function wrapWithRuntimeFactoryIfNeeded(packageJson, fluidModule) {
    if (fluidModule.fluidExport.IRuntimeFactory === undefined) {
        const dataStoreFactory = fluidModule.fluidExport.IFluidDataStoreFactory;
        const defaultFactory = runtime_utils_1.createDataStoreFactory(packageJson.name, dataStoreFactory);
        const runtimeFactory = new aqueduct_1.ContainerRuntimeFactoryWithDefaultDataStore(defaultFactory, new Map([
            [defaultFactory.type, Promise.resolve(defaultFactory)],
        ]));
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
function makeSideBySideDiv(divId) {
    const div = document.createElement("div");
    div.style.flexGrow = "1";
    div.style.width = "50%"; // ensure the divs don't encroach on each other
    div.style.border = "1px solid lightgray";
    div.style.boxSizing = "border-box";
    div.style.position = "relative"; // Make the new <div> a CSS containing block.
    div.id = divId;
    return div;
}
class WebpackCodeResolver {
    constructor(options) {
        this.options = options;
    }
    async resolveCodeDetails(details) {
        var _a;
        const baseUrl = (_a = details.config.cdn) !== null && _a !== void 0 ? _a : `http://localhost:${this.options.port}`;
        let pkg = details.package;
        if (typeof pkg === "string") {
            const resp = await fetch(`${baseUrl}/package.json`);
            pkg = await resp.json();
        }
        if (!container_definitions_1.isFluidBrowserPackage(pkg)) {
            throw new Error("Not a Fluid package");
        }
        const browser = web_code_loader_1.resolveFluidPackageEnvironment(pkg.fluid.browser, baseUrl);
        const parse = web_code_loader_1.extractPackageIdentifierDetails(pkg);
        return Object.assign(Object.assign({}, details), { resolvedPackage: Object.assign(Object.assign({}, pkg), { fluid: Object.assign(Object.assign({}, pkg.fluid), { browser }) }), resolvedPackageCacheId: parse.fullId });
    }
}
/**
 * Create a loader with WebCodeLoader and return it.
 */
async function createWebLoader(documentId, fluidModule, options, urlResolver, codeDetails, testOrderer = false, odspPersistantCache) {
    let documentServiceFactory = multiDocumentServiceFactory_1.getDocumentServiceFactory(documentId, options, odspPersistantCache);
    // Create the inner document service which will be wrapped inside local driver. The inner document service
    // will be used for ops(like delta connection/delta ops) while for storage, local storage would be used.
    if (testOrderer) {
        const resolvedUrl = await urlResolver.resolve(await urlResolver.createRequestForCreateNew(documentId));
        const innerDocumentService = await documentServiceFactory.createDocumentService(resolvedUrl);
        documentServiceFactory = new local_driver_1.LocalDocumentServiceFactory(multiDocumentServiceFactory_1.deltaConns.get(documentId), undefined, innerDocumentService);
    }
    const codeLoader = new web_code_loader_1.WebCodeLoader(new WebpackCodeResolver(options));
    await codeLoader.seedModule(codeDetails, wrapWithRuntimeFactoryIfNeeded(codeDetails.package, fluidModule));
    return new container_loader_1.Loader({
        urlResolver: testOrderer ?
            new multiResolver_1.MultiUrlResolver(documentId, window.location.origin, options, true) : urlResolver,
        documentServiceFactory,
        codeLoader,
    });
}
const containers = [];
// A function for testing to make sure the containers are not dirty and in sync (at the same seq num)
function isSynchronized() {
    if (containers.length === 0) {
        return true;
    }
    const seqNum = containers[0].deltaManager.lastSequenceNumber;
    return containers.every((c) => !c.isDirty && c.deltaManager.lastSequenceNumber === seqNum);
}
exports.isSynchronized = isSynchronized;
async function start(id, packageJson, fluidModule, options, div) {
    let documentId = id;
    let url = window.location.href;
    /**
     * For new documents, the `url` is of the format - http://localhost:8080/new or http://localhost:8080/manualAttach.
     * So, we create a new `id` and use that as the `documentId`.
     * We will also replace the url in the browser with a new url of format - http://localhost:8080/doc/<documentId>.
     */
    const autoAttach = id === "new" || id === "testorderer";
    const manualAttach = id === "manualAttach";
    const testOrderer = id === "testorderer";
    if (autoAttach || manualAttach) {
        documentId = moniker.choose();
        url = url.replace(id, `doc/${documentId}`);
    }
    const codeDetails = {
        package: packageJson,
        config: {},
    };
    let urlResolver = new multiResolver_1.MultiUrlResolver(documentId, window.location.origin, options);
    const odspPersistantCache = new odspPersistantCache_1.OdspPersistentCache();
    // Create the loader that is used to load the Container.
    let loader1 = await createWebLoader(documentId, fluidModule, options, urlResolver, codeDetails, testOrderer, odspPersistantCache);
    let container1;
    if (autoAttach || manualAttach) {
        // For new documents, create a detached container which will be attached later.
        container1 = await loader1.createDetachedContainer(codeDetails);
        containers.push(container1);
    }
    else {
        // For existing documents, we try to load the container with the given documentId.
        const documentUrl = `${window.location.origin}/${documentId}`;
        // This functionality is used in odsp driver to prefetch the latest snapshot and cache it so
        // as to avoid the network call to fetch trees latest.
        if (window.location.hash === "#prefetch") {
            common_utils_1.assert(options.mode === "spo-df" || options.mode === "spo", 0x1ea /* "Prefetch snapshot only available for odsp!" */);
            const prefetched = await odsp_driver_1.prefetchLatestSnapshot(await urlResolver.resolve({ url: documentUrl }), async () => options.odspAccessToken, odspPersistantCache, new common_utils_1.BaseTelemetryNullLogger(), undefined);
            common_utils_1.assert(prefetched, 0x1eb /* "Snapshot should be prefetched!" */);
        }
        container1 = await loader1.resolve({ url: documentUrl });
        containers.push(container1);
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
            urlResolver = new multiResolver_1.MultiUrlResolver(documentId, window.location.origin, options);
            loader1 = await createWebLoader(documentId, fluidModule, options, urlResolver, codeDetails, testOrderer);
            container1 = await loader1.createDetachedContainer(codeDetails);
        }
    }
    let leftDiv = div;
    let rightDiv;
    // For side by side mode, create two divs. Use side by side mode to test orderer.
    if ((options.mode === "local" && !options.single) || testOrderer) {
        div.style.display = "flex";
        leftDiv = makeSideBySideDiv("sbs-left");
        rightDiv = makeSideBySideDiv("sbs-right");
        div.append(leftDiv, rightDiv);
    }
    const reqParser = runtime_utils_1.RequestParser.create({ url });
    const fluidObjectUrl = `/${reqParser.createSubRequest(4).url}`;
    // Load and render the Fluid object.
    await getFluidObjectAndRender(container1, fluidObjectUrl, leftDiv);
    // Handle the code upgrade scenario (which fires contextChanged)
    container1.on("contextChanged", () => {
        getFluidObjectAndRender(container1, fluidObjectUrl, leftDiv).catch(() => { });
    });
    // We have rendered the Fluid object. If the container is detached, attach it now.
    if (container1.attachState === container_definitions_1.AttachState.Detached) {
        container1 = await attachContainer(loader1, container1, fluidObjectUrl, urlResolver, documentId, url, leftDiv, rightDiv, manualAttach, testOrderer);
    }
    // For side by side mode, we need to create a second container and Fluid object.
    if (rightDiv) {
        // Create a new loader that is used to load the second container.
        const loader2 = await createWebLoader(documentId, fluidModule, options, urlResolver, codeDetails, testOrderer);
        // Create a new request url from the resolvedUrl of the first container.
        const requestUrl2 = await urlResolver.getAbsoluteUrl(container1.resolvedUrl, "");
        const container2 = await loader2.resolve({ url: requestUrl2 });
        containers.push(container2);
        await getFluidObjectAndRender(container2, fluidObjectUrl, rightDiv);
        // Handle the code upgrade scenario (which fires contextChanged)
        container2.on("contextChanged", () => {
            getFluidObjectAndRender(container2, fluidObjectUrl, rightDiv).catch(() => { });
        });
    }
}
exports.start = start;
async function getFluidObjectAndRender(container, url, div) {
    const response = await container.request({
        headers: {
            mountableView: true,
        },
        url,
    });
    if (response.status !== 200 ||
        !(response.mimeType === "fluid/object")) {
        return false;
    }
    const fluidObject = response.value;
    if (fluidObject === undefined) {
        return;
    }
    // We should be retaining a reference to mountableView long-term, so we can call unmount() on it to correctly
    // remove it from the DOM if needed.
    const mountableView = fluidObject.IFluidMountableView;
    if (mountableView !== undefined) {
        mountableView.mount(div);
        return;
    }
    // If we don't get a mountable view back, we can still try to use a view adapter.  This won't always work (e.g.
    // if the response is a React-based Fluid object using hooks) and is not the preferred path, but sometimes it
    // can work.
    console.warn(`Container returned a non-IFluidMountableView.  This can cause errors when mounting Fluid objects `
        + `with React hooks across bundle boundaries.  URL: ${url}`);
    const view = new view_adapters_1.HTMLViewAdapter(fluidObject);
    view.render(div, { display: "block" });
}
/**
 * Attached a detached container.
 * In case of manual attach (when manualAttach is true), it creates a button and attaches the container when the button
 * is clicked. Otherwise, it attaches the container right away.
 */
async function attachContainer(loader, container, fluidObjectUrl, urlResolver, documentId, url, leftDiv, rightDiv, manualAttach, testOrderer) {
    // This is called once loading is complete to replace the url in the address bar with the new `url`.
    const replaceUrl = () => {
        window.history.replaceState({}, "", url);
        document.title = documentId;
    };
    let currentContainer = container;
    let currentLeftDiv = leftDiv;
    const attached = new common_utils_1.Deferred();
    // To test orderer, we use local driver as wrapper for actual document service. So create request
    // using local resolver.
    const attachUrl = testOrderer ? new local_driver_1.LocalResolver().createCreateNewRequest(documentId)
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
                let newLeftDiv;
                if (rightDiv !== undefined) {
                    newLeftDiv = makeSideBySideDiv(uuid_1.v4());
                }
                else {
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
    }
    else {
        await currentContainer.attach(attachUrl);
        replaceUrl();
        attached.resolve();
    }
    await attached.promise;
    return currentContainer;
}
//# sourceMappingURL=loader.js.map