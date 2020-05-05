/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { InnerDocumentServiceFactory } from "@microsoft/fluid-iframe-driver";
import { BaseHost } from "@microsoft/fluid-base-host";
import { IFluidCodeDetails } from "@microsoft/fluid-container-definitions";
import { SemVerCdnCodeResolver } from "@microsoft/fluid-web-code-loader";
import { HTMLViewAdapter } from "@microsoft/fluid-view-adapters";

async function getComponentAndRender(baseHost: BaseHost, url: string, div: HTMLDivElement) {
    const component = await baseHost.getComponent(url);
    if (component === undefined) {
        return;
    }
    // Render the component with an HTMLViewAdapter to abstract the UI framework used by the component
    const view = new HTMLViewAdapter(component);
    view.render(div, { display: "block" });
}

export async function runInner(divId: string) {
    const div = document.getElementById(divId) as HTMLDivElement;

    const pkg: IFluidCodeDetails = {
        package: "@fluid-example/todo@^0.15.0",
        config:{
            "@fluid-example:cdn":"https://pragueauspkn-3873244262.azureedge.net",
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
        getComponentAndRender(baseHost, url, div).catch(() => { });
    });
}
