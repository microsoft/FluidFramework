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
import { IDocumentServiceFactory } from "@microsoft/fluid-driver-definitions";
import { IUser } from "@microsoft/fluid-protocol-definitions";
import { Deferred } from "@fluidframework/common-utils";
import { HTMLViewAdapter } from "@microsoft/fluid-view-adapters";
import { extractPackageIdentifierDetails } from "@microsoft/fluid-web-code-loader";
import { IComponent } from "@microsoft/fluid-component-core-interfaces";
import { RequestParser } from "@microsoft/fluid-container-runtime";
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
        const componentFactory = fluidModule.fluidExport.IComponentFactory;

        const runtimeFactory = new ContainerRuntimeFactoryWithDefaultComponent(
            packageJson.name,
            new Map([
                [packageJson.name, Promise.resolve(componentFactory)],
            ]),
        );
        return {
            fluidExport: {
                IRuntimeFactory: runtimeFactory,
                IComponentFactory: componentFactory,
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

export async function start(
    documentId: string,
    packageJson: IFluidPackage,
    fluidModule: IFluidModule,
    options: RouteOptions,
    div: HTMLDivElement,
): Promise<void> {
    const documentServiceFactory = getDocumentServiceFactory(documentId, options);

    // Construct a request
    const url = window.location.href;
    const urlResolver = new MultiUrlResolver(window.location.origin, documentId, options);

    const codeDetails: IFluidCodeDetails = {
        package: packageJson,
        config: {},
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
    const container1Attached = new Deferred();

    if (window.location.hash.toLocaleLowerCase().includes("manualattach")) {
        if (!codeDetails) {
            throw new Error("Code details must be defined for detached mode!!");
        }
        const loader = await baseHost1.getLoader();
        container1 = await loader.createDetachedContainer(codeDetails);

        const attachDiv = document.createElement("div");
        const attachButton = document.createElement("button");
        attachButton.innerText = "Attach Container";
        attachDiv.append(attachButton);
        document.body.prepend(attachDiv);
        attachButton.onclick = () => {
            container1.attach(urlResolver.createRequestForCreateNew(documentId))
                .then(() => {
                    container1Attached.resolve();
                    attachDiv.remove();
                    window.location.hash = "";
                }, (error) => {
                    console.error(error);
                });
        };
    } else {
        container1 = await baseHost1.initializeContainer(
            url,
            codeDetails,
        );
        container1Attached.resolve();
    }

    const reqParser = new RequestParser({ url });
    const componentUrl = `/${reqParser.createSubRequest(3).url}`;
    // Side-by-side mode
    if (options.mode === "local" && !options.single) {
        div.style.display = "flex";
        const leftDiv = makeSideBySideDiv("sbs-left");
        const rightDiv = makeSideBySideDiv("sbs-right");
        div.append(leftDiv, rightDiv);
        await getComponentAndRender(container1, componentUrl, leftDiv);
        // Handle the code upgrade scenario (which fires contextChanged)
        container1.on("contextChanged", () => {
            getComponentAndRender(container1, componentUrl, leftDiv).catch(() => { });
        });
        if (!container1Attached.isCompleted) {
            rightDiv.innerText = "Waiting for container attach";
        }
        await container1Attached.promise;
        // New documentServiceFactory for right div, same everything else
        const docServFac2: IDocumentServiceFactory = getDocumentServiceFactory(documentId, options);
        const hostConf2 =
            { codeResolver: new WebpackCodeResolver(options), documentServiceFactory: docServFac2, urlResolver };

        // This will create a new Loader/Container/Component from the BaseHost above. This is
        // intentional because we want to emulate two clients collaborating with each other.
        const baseHost2 = new BaseHost(
            hostConf2,
            [packageSeed],
        );
        const container2 = await baseHost2.initializeContainer(
            url,
            codeDetails,
        );

        await getComponentAndRender(container2, componentUrl, rightDiv);
        // Handle the code upgrade scenario (which fires contextChanged)
        container2.on("contextChanged", () => {
            getComponentAndRender(container2, componentUrl, rightDiv).catch(() => { });
        });
    } else {
        await getComponentAndRender(container1, componentUrl, div);
        // Handle the code upgrade scenario (which fires contextChanged)
        container1.on("contextChanged", () => {
            getComponentAndRender(container1, componentUrl, div).catch(() => { });
        });
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
