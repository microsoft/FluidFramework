/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IPlatform } from "@prague/container-definitions";
import { Container, Loader } from "@prague/container-loader";
import { parse } from "querystring";

export async function initializeChaincode(document: Container, pkg: string): Promise<void> {
    if (!pkg) {
        return;
    }

    const quorum = document.getQuorum();

    // Wait for connection so that proposals can be sent
    if (!document.connected) {
        // tslint:disable-next-line: no-unnecessary-callback-wrapper
        await new Promise<void>((resolve) => document.on("connected", () => resolve()));
    }

    // And then make the proposal if a code proposal has not yet been made
    if (!quorum.has("code2")) {
        await quorum.propose("code2", pkg);
    }

    console.log(`Code is ${quorum.get("code2")}`);
}

export async function attach(loader: Loader, url: string, platform: IPlatform) {
    const response = await loader.request({ url });

    if (response.status !== 200) {
        return;
    }

    // tslint:disable-next-line: switch-default
    switch (response.mimeType) {
        case "prague/component":
            const component = response.value;
            // tslint:disable-next-line: no-unsafe-any
            component.attach(platform);
            // tslint:disable-next-line: switch-final-break
            break;
    }
}

export async function registerAttach(loader: Loader, container: Container, uri: string, platform: IPlatform) {
    attach(loader, uri, platform);
    container.on("contextChanged", () => {
        attach(loader, uri, platform);
    });
}

export function parsePackageName(url: Location, defaultPkg: string): string {
    const parsed = parse(url.search.substr(1));
    return parsed.chaincode ? parsed.chaincode as string : defaultPkg;
}
