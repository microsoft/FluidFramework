/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { getRandomName } from "@microsoft/fluid-server-services-core";
// tslint:disable no-string-literal trailing-comma no-shadowed-variable no-submodule-imports no-floating-promises
import { SimpleModuleInstantiationFactory } from "@prague/aqueduct";
import { start as startCore } from "@prague/base-host";
import { IRequest } from "@prague/component-core-interfaces";
import { IFluidModule, IFluidPackage, IPackage, IPraguePackage } from "@prague/container-definitions";
import { extractDetails, IResolvedPackage } from "@prague/loader-web";
import { IUser } from "@prague/protocol-definitions";
import * as jwt from "jsonwebtoken";
import * as uuid from "uuid/v4";
import { InsecureUrlResolver } from "./insecureUrlResolver";
// import * as fetch from "isomorphic-fetch";

export interface IDevServerUser extends IUser {
    name: string;
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

export async function start(
    packageJson: IPackage,
    host: string,
    routerlicious: string,
    historian: string,
    npm: string,
    tenantId: string,
    secret: string,
    jwt: string,
    div: HTMLDivElement,
    component: boolean
): Promise<void> {
    const url = window.location.href;

    // Create Package
    const scriptId = "pragueDevServerScriptToLoad";
    const scriptIds = [scriptId];
    const pkg = await getPkg(packageJson, scriptId, component);

    // Get endpoints
    const urlResolver = new InsecureUrlResolver(
        host,
        routerlicious,
        historian,
        tenantId,
        secret,
        getUser(),
        jwt);

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

    startCore(
        url,
        await urlResolver.resolve(req),
        undefined,
        pkg,
        scriptIds,
        npm,
        jwt,
        config,
        {},
        div,
    );
}

export function getUserToken(bearerSecret: string) {
    const user = getUser();

    return jwt.sign({ user }, bearerSecret);
}
