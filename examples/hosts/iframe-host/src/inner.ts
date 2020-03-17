/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { InnerDocumentServiceFactory } from "@microsoft/fluid-iframe-driver";
import { BaseHost } from "@microsoft/fluid-base-host";
import { IFluidCodeDetails } from "@microsoft/fluid-container-definitions";
import { VerdaccioPackageResolver} from "@fluid-example/tiny-web-host";

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
            packageResolver: new VerdaccioPackageResolver(),
            documentServiceFactory,
            urlResolver: documentServiceFactory.urlResolver,
            config: {},
        },
        undefined);

    await baseHost.loadAndRender(documentServiceFactory.resolvedUrl.url, div, pkg);
}
