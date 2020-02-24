import { InnerDocumentServiceFactory, InnerUrlResolver } from "@microsoft/fluid-iframe-driver";
import { BaseHost } from "@microsoft/fluid-base-host";
import { IFluidCodeDetails } from "@microsoft/fluid-container-definitions";
export async function runInner(divId: string){
    const div = document.getElementById(divId) as HTMLDivElement;

    const pkgResp =
        await fetch(
            "https://pragueauspkn-3873244262.azureedge.net/@fluid-example/todo@^0.14.0/package.json");
    const pkg: IFluidCodeDetails = {
        package: await pkgResp.json(),
        config:{
            "@fluid-example:cdn":"https://pragueauspkn-3873244262.azureedge.net",
        },
    };

    const documentServiceFactory = await InnerDocumentServiceFactory.create();
    const baseHost = new BaseHost(
        {
            documentServiceFactory,
            urlResolver: new InnerUrlResolver(),
            config: {},
        },
        InnerUrlResolver.resolvedUrl,
        undefined,
        []);

    await baseHost.loadAndRender(InnerUrlResolver.resolvedUrl.url, div, pkg);
}
