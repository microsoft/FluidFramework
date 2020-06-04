/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent } from "@fluidframework/component-core-interfaces";
import { IFluidCodeDetails } from "@fluidframework/container-definitions";
import { Container, Loader } from "@fluidframework/container-loader";
import { launchCLI } from "./cli";

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
}

/**
 * fetchCore is used to make a request against the loader to load a fluid component.
 */
async function fetchCore(loader: Loader, url: string) {
    const response = await loader.request({ url });

    if (response.status !== 200 || response.mimeType !== "fluid/component") {
        return;
    }

    const component = response.value as IComponent;

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    launchCLI(component);
}

/**
 * fetchComponent is used to allow a host to interact with a Fluid component. Given that we may be establishing a
 * new set of code on the document it listens for the "contextChanged" event which fires when a new code value is
 * quorumed on.
 */
export async function fetchComponent(loader: Loader, container: Container, url: string) {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    fetchCore(loader, url);
    container.on("contextChanged", () => {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        fetchCore(loader, url);
    });
}
