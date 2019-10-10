/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { SimpleModuleInstantiationFactory } from "@microsoft/fluid-aqueduct";
import { IHostConfig, start as startCore } from "@microsoft/fluid-base-host";
import { IRequest } from "@microsoft/fluid-component-core-interfaces";
import { IFluidModule, IFluidPackage, IPackage, isFluidPackage } from "@microsoft/fluid-container-definitions";
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
// tslint:disable-next-line:no-submodule-imports
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

async function loadScripts(files: string[], origin: string) {
    // Add script to page, rather than load bundle directly
    const scriptLoadP: Promise<string>[] = [];
    const scriptIdPrefix = "fluidDevServerScriptToLoad";
    let scriptIndex = 0;
    files.forEach((file: string) => {
        const script = document.createElement("script");
        // translate URLs to be webpack-dev-server relative URLs
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

function wrapComponentPackage(packageName: string, packageJson: IFluidPackage) {
    // Wrap the core component in a runtime
    // tslint:disable-next-line:no-string-literal
    const loadedComponentRaw = window["main"];
    const fluidModule = loadedComponentRaw as IFluidModule;
    const componentFactory = fluidModule.fluidExport.IComponentFactory;

    const runtimeFactory = new SimpleModuleInstantiationFactory(
        packageName,
        new Map([
            [packageName, Promise.resolve(componentFactory)],
        ]),
    );
    // tslint:disable-next-line:no-string-literal
    window["componentMain"] = {
        fluidExport: runtimeFactory,
    };

    packageJson.fluid.browser.umd.library = "componentMain";
    packageJson.name = `${packageJson.name}-dev-server`;
}

async function getResolvedPackage(
    packageJson: IPackage,
    scriptIds: string[],
    component = false,
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

    if (component) {
        wrapComponentPackage(legacyPackage, packageJson);
    }

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
            scope: "NA"
        },
        packageUrl: "NA"
    };
}

function getUrlResolver(options: IRouteOptions): IUrlResolver {
    switch (options.mode) {
        case "localhost":
            return new InsecureUrlResolver(
                "http://localhost:3000",
                "http://localhost:3003",
                "http://localhost:3001",
                options.tenantId,
                options.tenantSecret,
                getUser(),
                options.bearerSecret);

        case "live":
            return new InsecureUrlResolver(
                options.fluidHost,
                options.fluidHost.replace("www", "alfred"),
                options.fluidHost.replace("www", "historian"),
                options.tenantId,
                options.tenantSecret,
                getUser(),
                options.bearerSecret);

        default: // local
            return new TestResolver();
    }
}

function getNpm(options: IRouteOptions): string {
    if (options.mode === "localhost") {
        return "http://localhost:3002";
    }

    // local, live
    return options.npm;
}

export async function start(
    documentId: string,
    packageJson: IPackage,
    options: IRouteOptions,
    div: HTMLDivElement
): Promise<void> {
    const url = window.location.href;

    // Create Package
    const scriptIds: string[] = [];
    const pkg = await getResolvedPackage(packageJson, scriptIds, !!options.component);

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
    const urlResolver = getUrlResolver(options);
    const npm = getNpm(options);

    let documentServiceFactory: IDocumentServiceFactory;
    let deltaConn: ITestDeltaConnectionServer;
    if (options.mode !== "local") {
        documentServiceFactory = new RouterliciousDocumentServiceFactory(
            false,
            new DefaultErrorTracking(),
            false,
            true,
            undefined,
        );
    } else {
        deltaConn = TestDeltaConnectionServer.create(new SessionStorageDbFactory(documentId));
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

    const start1Promise = startCore(
        url,
        await urlResolver.resolve(req),
        pkg,
        scriptIds,
        npm,
        config,
        {},
        double ? leftDiv : div,
        hostConf,
    );

    let start2Promise: Promise<any> = Promise.resolve();
    if (double) {
        // new documentServiceFactory for right div, same everything else
        const docServFac2: IDocumentServiceFactory = new TestDocumentServiceFactory(deltaConn);
        const hostConf2 = { documentServiceFactory: docServFac2, urlResolver };

        // startCore will create a new Loader/Container/Component from the startCore above. This is
        // intentional because we want to emulate two clients collaborating with each other.
        start2Promise = startCore(
            url,
            await urlResolver.resolve(req),
            pkg,
            scriptIds,
            npm,
            config,
            {},
            rightDiv,
            hostConf2,
        );
    }
    await Promise.all([start1Promise, start2Promise]);
}

export function getUserToken(bearerSecret: string) {
    const user = getUser();

    return jwt.sign({ user }, bearerSecret);
}
