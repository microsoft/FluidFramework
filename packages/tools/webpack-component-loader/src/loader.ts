/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { getRandomName } from "@microsoft/fluid-server-services-core";

// tslint:disable no-string-literal trailing-comma no-shadowed-variable no-submodule-imports no-floating-promises
import { SimpleModuleInstantiationFactory } from "@prague/aqueduct";
import { IHostConfig, start as startCore } from "@prague/base-host";
import {
    IRequest,
} from "@prague/component-core-interfaces";
import {
    IFluidModule,
    IFluidPackage,
    IPackage,
    IPraguePackage,
} from "@prague/container-definitions";
import { extractDetails, IResolvedPackage } from "@prague/loader-web";
import {TestDeltaConnectionServer, TestDocumentServiceFactory, TestResolver} from "@prague/local-test-server";
import { IDocumentServiceFactory, IUrlResolver, IUser } from "@prague/protocol-definitions";
import { DefaultErrorTracking, RouterliciousDocumentServiceFactory } from "@prague/routerlicious-socket-storage";
import * as jwt from "jsonwebtoken";
import * as uuid from "uuid/v4";
import { InsecureUrlResolver } from "./insecureUrlResolver";
// import * as fetch from "isomorphic-fetch";
export interface IDevServerUser extends IUser {
    name: string;
}

export interface IRouteOptions {
    mode: "local" | "localhost" | "live";
    fluidHost?: string;
    tenantId?: string;
    tenantSecret?: string;
    component?: string;
}

function getUser(): IDevServerUser {
    return {
        id: uuid(),
        name: getRandomName(),
     };
}

function modifyFluidPackage(packageJson: IPackage): IFluidPackage {
    const fluidPackage = packageJson as IFluidPackage;
    if (!("fluid" in packageJson)) {
        const praguePackage = packageJson as IPraguePackage;
        fluidPackage.fluid = {
            browser: {
                umd: {
                    files: praguePackage.prague.browser.bundle,
                    library: praguePackage.prague.browser.entrypoint,
                },
            },
        };
    }

    // Start by translating the input package to be webpack-dev-server relative URLs
    for (let i = 0; i < fluidPackage.fluid.browser.umd.files.length; i++) {
        const value = fluidPackage.fluid.browser.umd.files[i];
        const updatedUrl = `${window.location.origin}/${value}`;
        console.log(updatedUrl);
        fluidPackage.fluid.browser.umd.files[i] = updatedUrl;
    }
    return fluidPackage;
}

async function getPkg(packageJson: IPackage, scriptId: string, component = false): Promise<IResolvedPackage> {

    // Start the creation of pkg.
    if (!packageJson) {
        return Promise.reject("No package specified");
    }

    const fluidPackage = modifyFluidPackage(packageJson);
    const details = extractDetails(`${fluidPackage.name}@${fluidPackage.version}`);
    const legacyPackage = `${fluidPackage.name}@${fluidPackage.version}`;

    // Add script to page, rather than load bundle directly
    const script = document.createElement("script");
    script.src = `${window.location.origin}/dist/main.bundle.js`;
    script.id = scriptId;

    const onloadP = new Promise((resolve) => {
        script.onload = () => {
            resolve();
        };
    });

    document.body.appendChild(script);

    return onloadP.then(() => {

        if (component) {
            // Wrap the core component in a runtime
            const loadedComponentRaw = window["main"];
            const fluidModule = loadedComponentRaw as IFluidModule;
            const componentFactory = fluidModule.fluidExport.IComponentFactory;

            const runtimeFactory = new SimpleModuleInstantiationFactory(
                legacyPackage,
                new Map([
                    [legacyPackage, Promise.resolve(componentFactory)],
                ]),
            );
            window["componentMain"] = {
                fluidExport: runtimeFactory,
            };

            fluidPackage.fluid.browser.umd.library = "componentMain";
            fluidPackage.name = `${fluidPackage.name}-dev-server`;

        }

        return {
            pkg: fluidPackage,
            details: {
                config: {
                    [`@${details.scope}:cdn`]: window.location.origin,
                },
                package: fluidPackage,
            },
            parsed: {
                full: legacyPackage,
                pkg: "NA",
                name: "NA",
                version: "NA",
                scope: "NA"
            },
            packageUrl: "NA"
        };
    });
}

const bearerSecret = "VBQyoGpEYrTn3XQPtXW3K8fFDd";

// tslint:disable-next-line: max-func-body-length
export async function start(
    packageJson: IPackage,
    options: IRouteOptions,
    div: HTMLDivElement
): Promise<void> {
    const url = window.location.href;

    // Create Package
    const scriptId = "pragueDevServerScriptToLoad";
    const scriptIds = [scriptId];
    const pkg = await getPkg(packageJson, scriptId, !!options.component);

    // Construct a request
    const req: IRequest = {
        url,
    };

    // Create a config... will allow for snapshotting
    const config = {
        client: {
            permission: [

            ],
            type: "browser",
        },
    };
    let urlResolver: IUrlResolver;
    let npm: string;
    switch (options.mode) {
        case "live":
            npm = "https://pragueauspkn-3873244262.azureedge.net";
            const host = options.fluidHost ? options.fluidHost : "https://www.wu2.prague.office-int.com";
            urlResolver = new InsecureUrlResolver(
                host,
                host.replace("www", "alfred"),
                host.replace("www", "historian"),
                options.tenantId ? options.tenantId : "stoic-gates",
                options.tenantSecret ? options.tenantSecret : "1a7f744b3c05ddc525965f17a1b58aa0",
                getUser(),
                bearerSecret);
            break;

        case "localhost":
            npm = "http://localhost:3002";
            const localHost = "http://localhost:3000";
            urlResolver = new InsecureUrlResolver(
                localHost,
                localHost,
                localHost,
                "prague",
                "43cfc3fbf04a97c0921fd23ff10f9e4b",
                getUser(),
                bearerSecret);
            break;

        case "local":
            urlResolver = new TestResolver();
        default:
    }

    let documentServiceFactory: IDocumentServiceFactory;
    if (options.mode !== "local") {
        documentServiceFactory = new RouterliciousDocumentServiceFactory(
            false,
            new DefaultErrorTracking(),
            false,
            true,
            undefined,
        );
        const hostConf: IHostConfig = { documentServiceFactory, urlResolver };

        startCore(
            url,
            await urlResolver.resolve(req),
            pkg,
            scriptIds,
            npm,
            config,
            {},
            div,
            hostConf,
        );
    } else {

        const deltaConn = TestDeltaConnectionServer.create();
        documentServiceFactory = new TestDocumentServiceFactory(deltaConn);
        const hostConf: IHostConfig = { documentServiceFactory, urlResolver };
        startCore(
            url,
            await urlResolver.resolve(req),
            pkg,
            scriptIds,
            npm,
            config,
            {},
            div,
            hostConf,
        );
    }
}

export function getUserToken(bearerSecret: string) {
    const user = getUser();

    return jwt.sign({ user }, bearerSecret);
}
