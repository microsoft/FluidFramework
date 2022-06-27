/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FluidObject } from "@fluidframework/core-interfaces";
import { IContainer, IFluidPackage, IFluidCodeDetails } from "@fluidframework/container-definitions";
import { Loader } from "@fluidframework/container-loader";
import { IFluidMountableView } from "@fluidframework/view-interfaces";
import { extractPackageIdentifierDetails } from "@fluidframework/web-code-loader";

/**
 * getFluidObjectAndRender is used to make a request against the loader to load a Fluid data store and then render
 * it once found.
 */
async function getFluidObjectAndRenderCore(loader: Loader, url: string, div: HTMLDivElement) {
    const response = await loader.request({
        headers: {
            mountableView: true,
        },
        url,
    });

    if (response.status !== 200 || response.mimeType !== "fluid/object") {
        return;
    }

    const fluidObject: FluidObject<IFluidMountableView> = response.value;
    // Try to render the Fluid object if it is a view
    const view: IFluidMountableView | undefined = fluidObject.IFluidMountableView;
    if (view !== undefined) {
        view.mount(div);
    }
}

/**
 * attach is used to allow a host to attach to a Prague URL. Given that we may be establishing a new set of code
 * on the document it listens for the "contextChanged" event which fires when a new code value is quorumed on. In this
 * case it simply runs the attach method again.
 */
export async function getFluidObjectAndRender(loader: Loader, container: IContainer, url: string, div: HTMLDivElement) {
    container.on("contextChanged", (codeDetails) => {
        console.log("Context changed", codeDetails);
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        getFluidObjectAndRenderCore(loader, url, div);
    });
    await getFluidObjectAndRenderCore(loader, url, div);
}

/** Parse the package value in the code details object that could either be a string or an object. */
export function parsePackageDetails(pkg: string | Readonly<IFluidPackage>) {
    if (typeof pkg === "object") {
        const { name, version } = pkg;
        return { name, version: version as string };
    } else {
        const { scope, name, version } = extractPackageIdentifierDetails(pkg);
        return { name: `@${scope}/${name}`, version };
    }
}

/** Retrieve the code proposal value from the container's quorum */
export function getCodeDetailsFromQuorum(container: IContainer): IFluidCodeDetails {
    const pkg = container.getSpecifiedCodeDetails?.();
    return pkg as IFluidCodeDetails;
}
