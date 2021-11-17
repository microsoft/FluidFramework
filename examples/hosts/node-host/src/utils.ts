/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FluidObject } from "@fluidframework/core-interfaces";
import { Container, Loader } from "@fluidframework/container-loader";
import { launchCLI } from "./cli";

/**
 * fetchCore is used to make a request against the loader to load a Fluid object.
 */
async function fetchCore(loader: Loader, url: string) {
    const response = await loader.request({ url });

    if (response.status !== 200 || response.mimeType !== "fluid/object") {
        return;
    }

    const fluidObject: FluidObject = response.value;

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    launchCLI(fluidObject);
}

/**
 * fetchFluidObject is used to allow a host to interact with a Fluid object. Given that we may be establishing a
 * new set of code on the document it listens for the "contextChanged" event which fires when a new code value is
 * quorumed on.
 */
export async function fetchFluidObject(loader: Loader, container: Container, url: string) {
    await fetchCore(loader, url);
    container.on("contextChanged", () => {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        fetchCore(loader, url);
    });
}
