/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { SimpleModuleInstantiationFactory } from "@microsoft/fluid-aqueduct";
import { BaseHost, IBaseHostConfig } from "@microsoft/fluid-base-host";
import {
    IFluidModule,
    IFluidPackage,
    IPackage,
    isFluidPackage,
} from "@microsoft/fluid-container-definitions";
import { Container } from "@microsoft/fluid-container-loader";
import { IDocumentServiceFactory, IUrlResolver } from "@microsoft/fluid-driver-definitions";
import { TestDocumentServiceFactory, TestResolver } from "@microsoft/fluid-local-driver";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@microsoft/fluid-server-local-server";
import { SessionStorageDbFactory } from "@microsoft/fluid-local-test-utils";
import { IUser } from "@microsoft/fluid-protocol-definitions";
import { DefaultErrorTracking, RouterliciousDocumentServiceFactory } from "@microsoft/fluid-routerlicious-driver";
import { getRandomName } from "@microsoft/fluid-server-services-client";
import { extractDetails, IResolvedPackage } from "@microsoft/fluid-web-code-loader";
import { Deferred } from "@microsoft/fluid-common-utils";
import * as jwt from "jsonwebtoken";
// eslint-disable-next-line import/no-internal-modules
import * as uuid from "uuid/v4";
import { OdspDocumentServiceFactory } from "@microsoft/fluid-odsp-driver";
import { HTMLViewAdapter } from "@microsoft/fluid-view-adapters";
import { InsecureUrlResolver } from "@microsoft/fluid-test-runtime-utils";
import { IComponent } from "@microsoft/fluid-component-core-interfaces";
import { OdspUrlResolver } from "./odspUrlResolver";

export interface IDevServerUser extends IUser {
    name: string;
}

export interface IBaseRouteOptions {
    port: number;
    npm?: string;
    openMode?: "detached" | "attached";
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

const getUser = (): IDevServerUser => ({
    id: uuid(),
    name: getRandomName(),
});

async function loadScripts(files: string[], origin: string) {
    // Add script to page, rather than load bundle directly
    const scriptLoadP: Promise<string>[] = [];
    const scriptIdPrefix = "fluidDevServerScriptToLoad";
    let scriptIndex = 0;
    files.forEach((file: string) => {
        const script = document.createElement("script");
        // Translate URLs to be webpack-dev-server relative URLs
        script.src = `${origin}/${file}`;
        const scriptId = `${scriptIdPrefix}_${scriptIndex++}`;
        script.id = scriptId;

        scriptLoadP.push(new Promise((resolve) => {
            script.onload = () => {
                resolve(scriptId);
            };
        }));

        document.body.appendChild(script);
    });
    return Promise.all(scriptLoadP);
}

function wrapIfComponentPackage(packageName: string, packageJson: IFluidPackage) {
    // Wrap the core component in a runtime
    const loadedComponentRaw = window[packageJson.fluid.browser.umd.library];
    const fluidModule = loadedComponentRaw as IFluidModule;
    if (fluidModule.fluidExport.IRuntimeFactory === undefined) {
        const componentFactory = fluidModule.fluidExport.IComponentFactory;

        const runtimeFactory = new SimpleModuleInstantiationFactory(
            packageName,
            new Map([
                [packageName, Promise.resolve(componentFactory)],
            ]),
        );
        // eslint-disable-next-line dot-notation
        window["componentMain"] = {
            fluidExport: runtimeFactory,
        };

        packageJson.fluid.browser.umd.library = "componentMain";
        packageJson.name = `${packageJson.name}-dev-server`;
    }
}

async function getResolvedPackage(
    packageJson: IPackage,
    scriptIds: string[],
): Promise<IResolvedPackage> {
    // Start the creation of pkg.
    if (!packageJson) {
        return Promise.reject(new Error("No package specified"));
    }

    if (!isFluidPackage(packageJson)) {
        return Promise.reject(new Error(`Package ${packageJson.name} not a fluid module.`));
    }

    const details = extractDetails(`${packageJson.name}@${packageJson.version}`);
    const legacyPackage = `${packageJson.name}@${packageJson.version}`;

    const loadedScriptIds = await loadScripts(packageJson.fluid.browser.umd.files, window.location.origin);
    loadedScriptIds.forEach((scriptId) => {
        scriptIds.push(scriptId);
    });

    wrapIfComponentPackage(legacyPackage, packageJson);

    return {
        pkg: packageJson,
        details: {
            config: {
                [`@${details.scope}:cdn`]: window.location.origin,
            },
            package: packageJson,
        },
        parsed: {
            full: legacyPackage,
            pkg: "NA",
            name: "NA",
            version: "NA",
            scope: "NA",
        },
        packageUrl: "NA",
    };
}

function getUrlResolver(
    documentId: string,
    options: RouteOptions,
    connection: ILocalDeltaConnectionServer,
): IUrlResolver {
    switch (options.mode) {
        case "docker":
            return new InsecureUrlResolver(
                "http://localhost:3000",
                "http://localhost:3003",
                "http://localhost:3001",
                options.tenantId,
                options.tenantSecret,
                getUser(),
                options.bearerSecret);

        case "r11s":
            return new InsecureUrlResolver(
                options.fluidHost,
                options.fluidHost.replace("www", "alfred"),
                options.fluidHost.replace("www", "historian"),
                options.tenantId,
                options.tenantSecret,
                getUser(),
                options.bearerSecret);

        case "tinylicious":
            return new InsecureUrlResolver(
                "http://localhost:3000",
                "http://localhost:3000",
                "http://localhost:3000",
                "tinylicious",
                "12345",
                getUser(),
                options.bearerSecret);

        case "spo":
        case "spo-df":
            return new OdspUrlResolver(
                options.server,
                { accessToken: options.odspAccessToken },
                options.driveId);

        default: // Local
            return new TestResolver(documentId, connection);
    }
}

// Invoked by `start()` when the 'double' option is enabled to create the side-by-side panes.
function makeSideBySideDiv(divId?: string) {
    const div = document.createElement("div");
    div.style.flexGrow = "1";
    div.style.width = "50vw"; // ensure the divs don't encroach on each other
    div.style.border = "1px solid lightgray";
    div.style.boxSizing = "border-box";
    div.style.position = "relative";                // Make the new <div> a CSS stacking context.
    if (divId) {
        div.id = divId;
    }
    return div;
}

function getDocumentServiceFactory(documentId: string, options: RouteOptions) {
    let documentServiceFactory: IDocumentServiceFactory;
    let deltaConn: ILocalDeltaConnectionServer;
    switch (options.mode) {
        case "local": {
            deltaConn = LocalDeltaConnectionServer.create(new SessionStorageDbFactory(documentId));
            documentServiceFactory = new TestDocumentServiceFactory(deltaConn);
            break;
        }
        case "spo":
        case "spo-df": {
            if (options.openMode === "detached") {
                // TODO: web socket token
                documentServiceFactory = new OdspDocumentServiceFactory(
                    "webpack-component-loader",
                    async (siteUrl, refresh) => { return options.odspAccessToken; },
                    async (refresh) => { return options.pushAccessToken; },
                    { send: (event) => { return; } },
                    undefined,
                    undefined,
                    undefined,
                    true,
                );
            } else {
                // TODO: web socket token
                documentServiceFactory = new OdspDocumentServiceFactory(
                    "webpack-component-loader",
                    async (siteUrl, refresh) => { return options.odspAccessToken; },
                    async (refresh) => { return options.pushAccessToken; },
                    { send: (event) => { return; } },
                );
            }
            break;
        }
        default: {
            documentServiceFactory = new RouterliciousDocumentServiceFactory(
                false,
                new DefaultErrorTracking(),
                false,
                true,
                undefined,
            );
        }
    }
    return {documentServiceFactory, connection: deltaConn};
}

export async function start(
    documentId: string,
    packageJson: IPackage,
    options: RouteOptions,
    div: HTMLDivElement,
    attachButton: HTMLButtonElement,
    textArea: HTMLTextAreaElement,
    attached: boolean,
): Promise<void> {
    if (attached) {
        attachButton.style.display = "none";
        textArea.style.display = "none";
    }

    const {documentServiceFactory, connection} = getDocumentServiceFactory(documentId, options);

    const urlResolver = getUrlResolver(documentId, options, connection);

    // Construct a request
    const url = window.location.href;

    // Create Package
    const scriptIds: string[] = [];
    const pkg = await getResolvedPackage(packageJson, scriptIds);
    const codeDetails = pkg ? pkg.details : undefined;

    const host1Conf: IBaseHostConfig = { documentServiceFactory, urlResolver };
    const baseHost1 = new BaseHost(
        host1Conf,
        pkg,
        scriptIds,
    );
    let container1: Container;
    if (!attached) {
        if (!codeDetails) {
            throw new Error("Code details must be defined for detached mode!!");
        }
        const loader = await baseHost1.getLoader();
        container1 = await loader.createDetachedContainer(codeDetails);
    } else {
        container1 = await baseHost1.initializeContainer(
            url,
            codeDetails,
        );
    }

    attachButton.disabled = false;
    const urlDeferred = new Deferred<string>();
    // Side-by-side mode
    if (options.mode === "local" && !options.single) {
        const leftDiv = makeSideBySideDiv("sbs-left");
        const rightDiv = makeSideBySideDiv("sbs-right");
        div.append(leftDiv, rightDiv);
        await startRendering(container1, "/", leftDiv);
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        urlDeferred.promise.then(async (containerUrl) => {
            // New documentServiceFactory for right div, same everything else
            const docServFac2: IDocumentServiceFactory = new TestDocumentServiceFactory(connection);
            const hostConf2 = { documentServiceFactory: docServFac2, urlResolver };

            // This will create a new Loader/Container/Component from the BaseHost above. This is
            // intentional because we want to emulate two clients collaborating with each other.
            const baseHost2 = new BaseHost(
                hostConf2,
                pkg,
                scriptIds,
            );
            const container2 = await baseHost2.initializeContainer(
                containerUrl,
                codeDetails,
            );

            await startRendering(container2, "/", rightDiv);
        });
    } else {
        await startRendering(container1, "/", div);
    }
    if (!attached) {
        attachButton.onclick = async () => {
            await container1.attach({url: window.location.href})
                .then(() => {
                    const text = window.location.href.replace("create", container1.id);
                    textArea.innerText = text;
                    urlDeferred.resolve(text);
                    attachButton.style.display = "none";
                },
                (error) => {
                    throw new Error(error);
                });
        };
    } else {
        urlDeferred.resolve(window.location.href);
    }
}

async function startRendering(container: Container, url: string, div: HTMLDivElement) {
    const p = new Promise((resolve, reject) => {
        const tryGetComponentAndRender = () => {
            getComponentAndRender(container, url, div).then((success) => {
                if (success) {
                    resolve();
                }
            }).catch((error) => reject(error));
        };

        container.on("contextChanged", (value) => {
            tryGetComponentAndRender();
        });
        tryGetComponentAndRender();
    });
    return p;
}

async function getComponentAndRender(container: Container, url: string, div: HTMLDivElement) {
    const response = await container.request({ url });

    if (response.status !== 200 ||
        !(
            response.mimeType === "fluid/component" ||
            response.mimeType === "prague/component"
        )) {
        return false;
    }

    const component = response.value as IComponent;
    if (component === undefined) {
        return false;
    }

    // Render the component with an HTMLViewAdapter to abstract the UI framework used by the component
    const view = new HTMLViewAdapter(component);
    view.render(div, { display: "block" });
    return true;
}

export function getUserToken(bearerSecret: string) {
    const user = getUser();

    return jwt.sign({ user }, bearerSecret);
}
