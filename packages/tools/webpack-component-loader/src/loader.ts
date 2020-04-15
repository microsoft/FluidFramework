/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerRuntimeFactoryWithDefaultComponent } from "@microsoft/fluid-aqueduct";
import { BaseHost, IBaseHostConfig } from "@microsoft/fluid-base-host";
import {
    IFluidModule,
    IFluidPackage,
    IFluidCodeDetails,
    IFluidCodeResolver,
    IResolvedFluidCodeDetails,
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
import { Deferred } from "@microsoft/fluid-common-utils";
import * as jwt from "jsonwebtoken";
import { v4 as uuid } from "uuid";
import { OdspDocumentServiceFactory } from "@microsoft/fluid-odsp-driver";
import { HTMLViewAdapter } from "@microsoft/fluid-view-adapters";
import { InsecureUrlResolver } from "@microsoft/fluid-test-runtime-utils";
import { extractPackageIdentifierDetails } from "@microsoft/fluid-web-code-loader";
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

function wrapIfComponentPackage(packageJson: IFluidPackage, fluidModule: IFluidModule): IFluidModule {
    if (fluidModule.fluidExport.IRuntimeFactory === undefined) {
        const componentFactory = fluidModule.fluidExport.IComponentFactory;

        const runtimeFactory = new ContainerRuntimeFactoryWithDefaultComponent(
            packageJson.name,
            new Map([
                [packageJson.name, Promise.resolve(componentFactory)],
            ]),
        );
        return {
            fluidExport:{
                IRuntimeFactory: runtimeFactory,
                IComponentFactory: componentFactory,
            },
        };
    }
    return fluidModule;
}

function getUrlResolver(
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
            return new TestResolver(connection);
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

class WebpackCodeResolver implements IFluidCodeResolver {
    constructor(private readonly options: IBaseRouteOptions){}
    async resolveCodeDetails(details: IFluidCodeDetails): Promise<IResolvedFluidCodeDetails> {
        const baseUrl = details.config.cdn ?? `http://localhost:${this.options.port}`;
        let pkg = details.package;
        if(typeof pkg === "string"){
            const resp = await fetch(`${baseUrl}/package.json`);
            pkg = await resp.json() as IFluidPackage;
        }
        if(!isFluidPackage(pkg)){
            throw new Error("Not a fluid package");
        }
        const files = pkg.fluid.browser.umd.files;
        for(let i=0;i<pkg.fluid.browser.umd.files.length;i++){
            if(!files[i].startsWith("http")){
                files[i] = `${baseUrl}/${files[i]}`;
            }
        }
        const parse = extractPackageIdentifierDetails(details.package);
        return{
            config:details.config,
            package: details.package,
            resolvedPackage: pkg,
            resolvedPackageCacheId: parse.fullId,
        };
    }

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
            // TODO: web socket token
            documentServiceFactory = new OdspDocumentServiceFactory(
                "webpack-component-loader",
                async (siteUrl, refresh) => { return options.odspAccessToken; },
                async (refresh) => { return options.pushAccessToken; },
                { send: (event) => { return; } },
                undefined,
                undefined,
                undefined,
                options.openMode === "detached" ? true : false,
            );
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
    packageJson: IFluidPackage,
    fluidModule: IFluidModule,
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

    const urlResolver = getUrlResolver(options, connection);

    // Construct a request
    const url = window.location.href;

    const codeDetails: IFluidCodeDetails ={
        package:packageJson,
        config:{},
    };
    const packageSeed: [IFluidCodeDetails, IFluidModule] =
        [codeDetails, wrapIfComponentPackage(packageJson, fluidModule)];

    const host1Conf: IBaseHostConfig =
        { codeResolver: new WebpackCodeResolver(options), documentServiceFactory, urlResolver };
    const baseHost1 = new BaseHost(
        host1Conf,
        [packageSeed],
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

    const urlParts = new URL(url).pathname.split("/");
    const componentUrl = `/${urlParts[2] === undefined ? "" : urlParts[2]}`;
    attachButton.disabled = false;
    const urlDeferred = new Deferred<string>();
    // Side-by-side mode
    if (options.mode === "local" && !options.single) {
        const leftDiv = makeSideBySideDiv("sbs-left");
        const rightDiv = makeSideBySideDiv("sbs-right");
        div.append(leftDiv, rightDiv);
        await getComponentAndRender(container1, componentUrl, leftDiv);
        // Handle the code upgrade scenario (which fires contextChanged)
        container1.on("contextChanged", () => {
            getComponentAndRender(container1, componentUrl, leftDiv).catch(() => { });
        });
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        urlDeferred.promise.then(async (containerUrl) => {
            // New documentServiceFactory for right div, same everything else
            const docServFac2: IDocumentServiceFactory = new TestDocumentServiceFactory(connection);
            const hostConf2 =
            { codeResolver: new WebpackCodeResolver(options), documentServiceFactory: docServFac2, urlResolver };

            // This will create a new Loader/Container/Component from the BaseHost above. This is
            // intentional because we want to emulate two clients collaborating with each other.
            const baseHost2 = new BaseHost(
                hostConf2,
                [packageSeed],
            );
            const container2 = await baseHost2.initializeContainer(
                containerUrl,
                codeDetails,
            );

            await getComponentAndRender(container2, componentUrl, rightDiv);
            // Handle the code upgrade scenario (which fires contextChanged)
            container2.on("contextChanged", () => {
                getComponentAndRender(container2, componentUrl, rightDiv).catch(() => { });
            });
        });
    } else {
        await getComponentAndRender(container1, componentUrl, div);
        // Handle the code upgrade scenario (which fires contextChanged)
        container1.on("contextChanged", () => {
            getComponentAndRender(container1, componentUrl, div).catch(() => { });
        });
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
        return;
    }

    // Render the component with an HTMLViewAdapter to abstract the UI framework used by the component
    const view = new HTMLViewAdapter(component);
    view.render(div, { display: "block" });
}

export function getUserToken(bearerSecret: string) {
    const user = getUser();

    return jwt.sign({ user }, bearerSecret);
}
