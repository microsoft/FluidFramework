/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { InnerDocumentServiceFactory } from "@microsoft/fluid-iframe-driver";
import { BaseHost, SemVerCdnCodeResolver } from "@microsoft/fluid-base-host";
import { IFluidCodeDetails } from "@microsoft/fluid-container-definitions";

export async function runInner(divId: string){
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

    await baseHost.loadAndRender(documentServiceFactory.resolvedUrl.url, div, pkg);
}
