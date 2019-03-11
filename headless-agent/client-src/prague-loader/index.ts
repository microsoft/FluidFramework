import { Browser } from "@prague/container-definitions";
import { Container, Loader } from "@prague/container-loader";
import { createDocumentService, TokenProvider } from "@prague/routerlicious-socket-storage";
import { IComponentRuntime } from "@prague/runtime-definitions";
import { LocalPlatform } from "./localPlatform";
import { WebLoader } from "./webLoader";

async function attach(loader: Loader, url: string, platform: LocalPlatform) {
    console.log(url);
    const response = await loader.request({ url });

    if (response.status !== 200) {
        return;
    }
    console.log(response.mimeType);
    console.log(response.status);
    switch (response.mimeType) {
        case "prague/component":
            const component = response.value as IComponentRuntime;
            component.attach(platform);
            console.log(component.id);
            break;
    }
}

export async function registerAttach(loader: Loader, container: Container, uri: string, platform: LocalPlatform) {
    console.log(`Attaching a web platform`);
    attach(loader, uri, platform).catch((err) => {
        console.log(err);
    });
    container.on("contextChanged", (value) => {
        attach(loader, uri, platform);
    });
}

export async function startLoading(
    id: string,
    routerlicious: string,
    historian: string,
    tenantId: string,
    token: string,
    packageUrl: string,
    loaderType: string): Promise<void> {

    console.log(`Loading ${id}...`);
    const documentServices = createDocumentService(routerlicious, historian);

    const codeLoader = new WebLoader(packageUrl);
    const tokenProvider = new TokenProvider(token);

    const loader = new Loader(
        { tokenProvider },
        documentServices,
        codeLoader,
        { encrypted: undefined, localMinSeq: 0, blockUpdateMarkers: true, client: { type: loaderType } });

    const baseUrl =
        `prague://prague.com/` +
        `${encodeURIComponent(tenantId)}/${encodeURIComponent(id)}`;
    const container = await loader.resolve({ url: baseUrl });

    // Wait to be fully connected!
    if (!container.connected) {
        await new Promise<void>((resolve) => container.on("connected", () => resolve()));
    }

    console.log(`${container.clientId} is now fully connected to ${container.id}`);
    checkContainerActivity(container);

    const platform = new LocalPlatform(document.getElementById("content"));
    registerAttach(loader, container, baseUrl, platform);
}

function checkContainerActivity(container: Container) {
    const quorum = container.getQuorum();
    quorum.on("removeMember", (clientId: string) => {
        if (container.clientId === clientId) {
            (window as any).closeContainer();
        } else {
            for (const client of quorum.getMembers()) {
                if (!client[1].client || !client[1].client.type || client[1].client.type === Browser) {
                    return;
                }
            }
            (window as any).closeContainer();
        }
    });
}
