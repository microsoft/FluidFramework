/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { parse } from "querystring";
import { IFluidObject } from "@fluidframework/core-interfaces";
import { Container, Loader } from "@fluidframework/container-loader";
import { IFluidHTMLView } from "@fluidframework/view-interfaces";

/**
 * getFluidObjectAndRender is used to make a request against the loader to load a Fluid data store and then render
 * it once found.
 */
async function getFluidObjectAndRenderCore(loader: Loader, url: string, div: HTMLDivElement) {
    const response = await loader.request({ url });

    if (response.status !== 200 || response.mimeType !== "fluid/object") {
        return;
    }

    const fluidObject = response.value as IFluidObject;
    // Try to render the fluid object if it is a view
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
export async function getFluidObjectAndRender(loader: Loader, container: Container, url: string, div: HTMLDivElement) {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    getFluidObjectAndRenderCore(loader, url, div);
    container.on("contextChanged", () => {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        getFluidObjectAndRenderCore(loader, url, div);
    });
}

export function parsePackageName(url: Location, defaultPkg: string): string {
    const parsed = parse(url.search.substr(1));
    return parsed.chaincode !== undefined ? parsed.chaincode as string : defaultPkg;
}
