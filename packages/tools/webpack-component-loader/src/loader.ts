/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// tslint:disable no-string-literal trailing-comma no-shadowed-variable no-submodule-imports no-floating-promises

import { SimpleModuleInstantiationFactory } from "@microsoft/fluid-aqueduct";
import { IHostConfig, start as startCore } from "@microsoft/fluid-base-host";
import { IRequest } from "@microsoft/fluid-component-core-interfaces";
import { IFluidModule, IFluidPackage, IPackage } from "@microsoft/fluid-container-definitions";
import {
    ITestDeltaConnectionServer,
    TestDeltaConnectionServer,
    TestDocumentServiceFactory,
    TestResolver,
} from "@microsoft/fluid-local-test-server";
import { IDocumentServiceFactory, IUrlResolver, IUser } from "@microsoft/fluid-protocol-definitions";
import { DefaultErrorTracking, RouterliciousDocumentServiceFactory } from "@microsoft/fluid-routerlicious-driver";
import { getRandomName } from "@microsoft/fluid-server-services-core";
import { extractDetails, IResolvedPackage } from "@microsoft/fluid-web-code-loader";
import * as jwt from "jsonwebtoken";
import * as uuid from "uuid/v4";
import { InsecureUrlResolver } from "./insecureUrlResolver";
import { SessionStorageDbFactory } from "./sessionStorageTestDb";

export interface IDevServerUser extends IUser {
    name: string;
}

export interface IRouteOptions {
    mode: "local" | "localhost" | "live";
    fluidHost?: string;
    tenantId?: string;
    tenantSecret?: string;
    bearerSecret?: string;
    npm?: string;
    component?: string;
    single?: boolean;
}

function getUser(): IDevServerUser {
    return {
        id: uuid(),
        name: getRandomName(),
     };
}

function modifyFluidPackage(packageJson: IPackage): IFluidPackage {
    const fluidPackage = packageJson as IFluidPackage;

    // Start by translating the input package to be webpack-dev-server relative URLs
    for (let i = 0; i < fluidPackage.fluid.browser.umd.files.length; i++) {
        const value = fluidPackage.fluid.browser.umd.files[i];
        const updatedUrl = `${window.location.origin}/${value}`;
        console.log(updatedUrl);
        fluidPackage.fluid.browser.umd.files[i] = updatedUrl;
    }
    return fluidPackage;
}

async function getPkg(packageJson: IPackage, scriptIds: string[], component = false): Promise<IResolvedPackage> {

    // Start the creation of pkg.
    if (!packageJson) {
        return Promise.reject("No package specified");
    }

    const fluidPackage = modifyFluidPackage(packageJson);
    const details = extractDetails(`${fluidPackage.name}@${fluidPackage.version}`);
    const legacyPackage = `${fluidPackage.name}@${fluidPackage.version}`;

    // Add script to page, rather than load bundle directly
    const scriptLoadP: Promise<void>[] = [];
    const scriptIdPrefix = "fluidDevServerScriptToLoad";
    let scriptIndex = 0;
    fluidPackage.fluid.browser.umd.files.forEach((file) => {
        const script = document.createElement("script");
        script.src = file;
        const scriptId = `${scriptIdPrefix}_${scriptIndex++}`;
        script.id = scriptId;
        scriptIds.push(scriptId);

        scriptLoadP.push(new Promise((resolve) => {
            script.onload = () => {
                resolve();
            };
        }));

        document.body.appendChild(script);
    });
    await Promise.all(scriptLoadP);

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
}

// tslint:disable-next-line: max-func-body-length
export async function start(
    packageJson: IPackage,
    options: IRouteOptions,
    div: HTMLDivElement
): Promise<void> {
    const url = window.location.href;

    // Create Package
    const scriptIds: string[] = [];
    const pkg = await getPkg(packageJson, scriptIds, !!options.component);

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
    switch (options.mode) {
        case "localhost":
            options.npm = options.npm ? options.npm : "http://localhost:3002";
            urlResolver = new InsecureUrlResolver(
                "http://localhost:3000",
                "http://localhost:3003",
                "http://localhost:3001",
                options.tenantId,
                options.tenantSecret,
                getUser(),
                options.bearerSecret);
            break;

        case "local":
            urlResolver = new TestResolver();
            break;

        default: // live
            urlResolver = new InsecureUrlResolver(
                options.fluidHost,
                options.fluidHost.replace("www", "alfred"),
                options.fluidHost.replace("www", "historian"),
                options.tenantId,
                options.tenantSecret,
                getUser(),
                options.bearerSecret);
    }

    let documentServiceFactory: IDocumentServiceFactory;
    let deltaConn: ITestDeltaConnectionServer ;
    if (options.mode !== "local") {
        documentServiceFactory = new RouterliciousDocumentServiceFactory(
            false,
            new DefaultErrorTracking(),
            false,
            true,
            undefined,
        );
    } else {
        deltaConn = TestDeltaConnectionServer.create(new SessionStorageDbFactory(url));
        documentServiceFactory = new TestDocumentServiceFactory(deltaConn);
    }
    const hostConf: IHostConfig = { documentServiceFactory, urlResolver };

    const double = (options.mode === "local") && !options.single;
    let leftDiv: HTMLDivElement;
    let rightDiv: HTMLDivElement;
    if (double) {
        leftDiv = document.createElement("div");
        leftDiv.style.width = "50%";
        leftDiv.style.cssFloat = "left";
        leftDiv.style.border = "1px solid lightgray";
        rightDiv = document.createElement("div");
        rightDiv.style.marginLeft = "50%";
        rightDiv.style.border = "1px solid lightgray";
        div.append(leftDiv, rightDiv);
    }

    startCore(
        url,
        await urlResolver.resolve(req),
        pkg,
        scriptIds,
        options.npm,
        config,
        {},
        double ? leftDiv : div,
        hostConf,
    );

    if (double) {
        // new documentServiceFactory for right div, same everything else
        const docServFac2: IDocumentServiceFactory = new TestDocumentServiceFactory(deltaConn);
        const hostConf2 = { documentServiceFactory: docServFac2, urlResolver };

        // startCore will create a new Loader/Container/Component from the startCore above. This is
        // intentional because we want to emulate two clients collaborating with each other.
        startCore(
            url,
            await urlResolver.resolve(req),
            pkg,
            scriptIds,
            options.npm,
            config,
            {},
            rightDiv,
            hostConf2,
        );
    }
}

export function getUserToken(bearerSecret: string) {
    const user = getUser();

    return jwt.sign({ user }, bearerSecret);
}
