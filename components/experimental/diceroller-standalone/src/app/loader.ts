/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerRuntimeFactoryWithDefaultComponent } from "@fluidframework/aqueduct";
import { BaseHost, IBaseHostConfig } from "@fluidframework/base-host";
import {
    IFluidModule,
    IFluidPackage,
    IFluidCodeDetails,
    IFluidCodeResolver,
    IResolvedFluidCodeDetails,
    isFluidPackage,
} from "@fluidframework/container-definitions";
import { Container } from "@fluidframework/container-loader";
import { IUser } from "@fluidframework/protocol-definitions";
import { Deferred } from "@fluidframework/common-utils";
import { RouterliciousDocumentServiceFactory, DefaultErrorTracking } from "@fluidframework/routerlicious-driver";
import { HTMLViewAdapter } from "@fluidframework/view-adapters";
import { IComponentMountableView } from "@fluidframework/view-interfaces";
import { extractPackageIdentifierDetails } from "@fluidframework/web-code-loader";
import { IComponent } from "@fluidframework/component-core-interfaces";
import { RequestParser } from "@fluidframework/runtime-utils";
import { getRandomName } from "@fluidframework/server-services-client";
// eslint-disable-next-line import/no-internal-modules
import uuid from "uuid/v4";
import { InsecureUrlResolver } from "./insecureUrlResolver";

export interface IDevServerUser extends IUser {
    name: string;
}

export interface IBaseRouteOptions {
    port: number;
    npm?: string;
}

export interface ITinyliciousRouteOptions extends IBaseRouteOptions {
    mode: "tinylicious";
    bearerSecret?: string;
}

function wrapIfComponentPackage(packageJson: IFluidPackage, fluidModule: IFluidModule): IFluidModule {
    if (fluidModule.fluidExport.IRuntimeFactory === undefined) {
        const componentFactory = fluidModule.fluidExport.IComponentFactory;

        const runtimeFactory = new ContainerRuntimeFactoryWithDefaultComponent(
            packageJson.name,
            new Map([
                [packageJson.name, Promise.resolve(componentFactory!)],
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
    options: ITinyliciousRouteOptions,
    div: HTMLDivElement,
): Promise<void> {
    const documentServiceFactory = new RouterliciousDocumentServiceFactory(
        false,
        new DefaultErrorTracking(),
        false,
        true,
        undefined,
    );

    // Construct a request
    const url = window.location.href;
    const urlResolver = new InsecureUrlResolver(
        "http://localhost:3000", // hostUrl
        "http://localhost:3000", // ordererUrl
        "http://localhost:3000", // storageUrl
        "tinylicious",
        "12345",
        {
            id: uuid(),
            name: getRandomName(),
        } as IUser,
        options.bearerSecret!,
        documentId,
    );

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
            container1.attach(urlResolver.createCreateNewRequest(documentId))
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

    // Needs updating if the doc id is in the hash
    const reqParser = new RequestParser({ url });
    const componentUrl = `/${reqParser.createSubRequest(3)!.url}`;

    await getComponentAndRender(container1, componentUrl, div);
    // Handle the code upgrade scenario (which fires contextChanged)
    container1.on("contextChanged", () => {
        getComponentAndRender(container1, componentUrl, div).catch(() => { });
    });
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
            response.mimeType === "fluid/component" ||
            response.mimeType === "prague/component"
        )) {
        return false;
    }

    const component = response.value as IComponent;
    if (component === undefined) {
        return;
    }

    // We should be retaining a reference to mountableView long-term, so we can call unmount() on it to correctly
    // remove it from the DOM if needed.
    const mountableView: IComponentMountableView | undefined = component.IComponentMountableView;
    if (mountableView !== undefined) {
        mountableView.mount(div);
        return;
    }

    // If we don't get a mountable view back, we can still try to use a view adapter.  This won't always work (e.g.
    // if the response is a React-based component using hooks) and is not the preferred path, but sometimes it
    // can work.
    console.warn(`Container returned a non-IComponentMountableView.  This can cause errors when mounting components `
        + `with React hooks across bundle boundaries.  URL: ${url}`);
    const view = new HTMLViewAdapter(component);
    view.render(div, { display: "block" });
}
