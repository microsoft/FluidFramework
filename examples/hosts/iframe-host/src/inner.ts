/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { InnerDocumentServiceFactory } from "@fluidframework/iframe-driver";
import { BaseHost } from "@fluidframework/base-host";
import { IFluidCodeDetails } from "@fluidframework/container-definitions";
import { SemVerCdnCodeResolver } from "@fluidframework/web-code-loader";
import { HTMLViewAdapter } from "@fluidframework/view-adapters";

async function getFluidObjectAndRender(baseHost: BaseHost, url: string, div: HTMLDivElement) {
    const fluidObject = await baseHost.requestFluidObject(url);
    if (fluidObject === undefined) {
        return;
    }
    // Render the Fluid object with an HTMLViewAdapter to abstract the UI framework used by the Fluid object
    const view = new HTMLViewAdapter(fluidObject);
    view.render(div, { display: "block" });
}

export async function runInner(divId: string) {
    const div = document.getElementById(divId) as HTMLDivElement;

    const pkg: IFluidCodeDetails = {
        package: "@fluid-example/todo@^0.15.0",
        config: {
            "@fluid-example:cdn": "https://pragueauspkn.azureedge.net",
        },
    };

    const documentServiceFactory = await InnerDocumentServiceFactory.create();
    const baseHost = new BaseHost(
        {
            codeResolver: new SemVerCdnCodeResolver(),
            documentServiceFactory,
            urlResolver: documentServiceFactory.urlResolver,
            config: {},
        });

    const url = documentServiceFactory.resolvedUrl.url;
    const container = await baseHost.initializeContainer(url, pkg);

    // Handle the code upgrade scenario (which fires contextChanged)
    container.on("contextChanged", (value) => {
        getFluidObjectAndRender(baseHost, url, div).catch(() => { });
    });
}
