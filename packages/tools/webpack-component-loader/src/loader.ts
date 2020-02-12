/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { SimpleModuleInstantiationFactory } from "@microsoft/fluid-aqueduct";
import { BaseHost, IBaseHostConfig } from "@microsoft/fluid-base-host";
import { IRequest } from "@microsoft/fluid-component-core-interfaces";
import {
    IFluidModule,
    IFluidPackage,
    IPackage,
    isFluidPackage,
} from "@microsoft/fluid-container-definitions";
import { IDocumentServiceFactory, IUrlResolver } from "@microsoft/fluid-driver-definitions";
import {
    ITestDeltaConnectionServer,
    SessionStorageDbFactory,
    TestDeltaConnectionServer,
    TestDocumentServiceFactory,
    TestResolver
} from "@microsoft/fluid-local-test-server";
import { IUser } from "@microsoft/fluid-protocol-definitions";
import { DefaultErrorTracking, RouterliciousDocumentServiceFactory } from "@microsoft/fluid-routerlicious-driver";
import { getRandomName } from "@microsoft/fluid-server-services-client";
import { extractDetails, IResolvedPackage } from "@microsoft/fluid-web-code-loader";
import * as jwt from "jsonwebtoken";
// eslint-disable-next-line import/no-internal-modules
import * as uuid from "uuid/v4";
import { InsecureUrlResolver } from "./insecureUrlResolver";

export interface IDevServerUser extends IUser {
    name: string;
}

export interface IRouteOptions {
    mode: "local" | "docker" | "live" | "tinylicious";
    fluidHost?: string;
    tenantId?: string;
    tenantSecret?: string;
    bearerSecret?: string;
    npm?: string;
    single?: boolean;
}

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

function getUrlResolver(documentId: string, options: IRouteOptions): IUrlResolver {
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

        case "live":
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

        default: // Local
            return new TestResolver(documentId);
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

export async function start(
    documentId: string,
    packageJson: IPackage,
    options: IRouteOptions,
    div: HTMLDivElement,
): Promise<void> {
    const url = window.location.href;

    // Create Package
    const scriptIds: string[] = [];
    const pkg = await getResolvedPackage(packageJson, scriptIds);

    // Construct a request
    const req: IRequest = {
        url,
    };

    const urlResolver = getUrlResolver(documentId, options);

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
    const hostConf: IBaseHostConfig = { documentServiceFactory, urlResolver };

    const double = (options.mode === "local") && !options.single;
    let leftDiv: HTMLDivElement;
    let rightDiv: HTMLDivElement;
    if (double) {
        leftDiv = makeSideBySideDiv("sbs-left");
        rightDiv = makeSideBySideDiv("sbs-right");
        div.append(leftDiv, rightDiv);
    }

    const start1Promise = BaseHost.start(
        hostConf,
        url,
        await urlResolver.resolve(req),
        pkg,
        scriptIds,
        double ? leftDiv : div,
    );

    let start2Promise: Promise<any> = Promise.resolve();
    if (double) {
        // New documentServiceFactory for right div, same everything else
        const docServFac2: IDocumentServiceFactory = new TestDocumentServiceFactory(deltaConn);
        const hostConf2 = { documentServiceFactory: docServFac2, urlResolver };

        // BaseHost.start will create a new Loader/Container/Component from the startCore above. This is
        // intentional because we want to emulate two clients collaborating with each other.
        start2Promise = BaseHost.start(
            hostConf2,
            url,
            await urlResolver.resolve(req),
            pkg,
            scriptIds,
            rightDiv,
        );
    }
    await Promise.all([start1Promise, start2Promise]);
}

export function getUserToken(bearerSecret: string) {
    const user = getUser();

    return jwt.sign({ user }, bearerSecret);
}
