/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { parse } from "querystring";
import { IFluidObject } from "@fluidframework/core-interfaces";
import { IFluidCodeDetails } from "@fluidframework/container-definitions";
import { Container, Loader } from "@fluidframework/container-loader";
import { IFluidHTMLView } from "@fluidframework/view-interfaces";

/**
 * The initializeChaincode method takes in a document and a desired npm package and establishes a code quorum
 * on this package.
 */
export async function initializeChaincode(document: Container, pkg?: IFluidCodeDetails): Promise<void> {
    if (pkg === undefined) {
        return;
    }

    const quorum = document.getQuorum();

    // Wait for connection so that proposals can be sent
    if (!document.connected) {
        await new Promise<void>((resolve) => document.on("connected", () => resolve()));
    }

    // And then make the proposal if a code proposal has not yet been made
    if (!quorum.has("code")) {
        await quorum.propose("code", pkg);
    }

    console.log(`Code is ${quorum.get("code")}`);
}

/**
 * attachCore is used to make a request against the loader to load a Fluid object. And then attaches to it once
 * found.
 */
async function attachCore(loader: Loader, url: string, div: HTMLDivElement) {
    const response = await loader.request({ url });

    if (response.status !== 200 || response.mimeType !== "fluid/object") {
        return;
    }

    const fluidObject = response.value as IFluidObject;
    // Try to render the Fluid object if it is a view
    const view: IFluidHTMLView | undefined = fluidObject.IFluidHTMLView;
    if (view !== undefined) {
        view.render(div, { display: "block" });
    }
}

/**
 * attach is used to allow a host to attach to a Prague URL. Given that we may be establishing a new set of code
 * on the document it listens for the "contextChanged" event which fires when a new code value is quorumed on. In this
 * case it simply runs the attach method again.
 */
export async function attach(loader: Loader, container: Container, url: string, div: HTMLDivElement) {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    attachCore(loader, url, div);
    container.on("contextChanged", () => {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        attachCore(loader, url, div);
    });
}

export function parsePackageName(url: Location, defaultPkg: string): string {
    const parsed = parse(url.search.substr(1));
    return parsed.chaincode !== undefined ? parsed.chaincode as string : defaultPkg;
}
