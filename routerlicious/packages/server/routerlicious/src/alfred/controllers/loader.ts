import { Container, Loader } from "@prague/container-loader";
import { ICommit } from "@prague/gitresources";
import { WebLoader, WebPlatform } from "@prague/loader-web";
import { IComponentRuntime } from "@prague/runtime-definitions";
import {
    createDocumentService,
    DefaultErrorTracking,
    TokenProvider,
} from "@prague/socket-storage";

async function initializeChaincode(document: Container, pkg: string): Promise<void> {
    if (!pkg) {
        return;
    }

    const quorum = document.getQuorum();

    // Wait for connection so that proposals can be sent
    if (!document.connected) {
        await new Promise<void>((resolve) => document.on("connected", () => resolve()));
    }

    // And then make the proposal if a code proposal has not yet been made
    if (!quorum.has("code2")) {
        await quorum.propose("code2", pkg);
    }

    console.log(`Code is ${quorum.get("code2")}`);
}

async function attach(loader: Loader, url: string, platform: LocalPlatform) {
    const response = await loader.request({ url });

    if (response.status !== 200) {
        return;
    }

    switch (response.mimeType) {
        case "prague/component":
            const component = response.value as IComponentRuntime;
            component.attach(platform);
            break;
    }
}

async function registerAttach(loader: Loader, container: Container, uri: string, platform: LocalPlatform) {
    attach(loader, uri, platform);
    container.on("contextChanged", (value) => {
        attach(loader, uri, platform);
    });
}

class LocalPlatform extends WebPlatform {
    constructor(div: HTMLElement) {
        super(div);
    }

    public async detach() {
        return;
    }
}

async function start(
    token: string,
    tenantId: string,
    documentId: string,
    path: string,
    code: string,
    npm: string,
    config: any,
    from: number,
    to: number,
    unitIsTime: boolean,
): Promise<void> {
    const errorService = new DefaultErrorTracking();

    const documentServices = createDocumentService(
        document.location.origin,
        config.blobStorageUrl,
        errorService);

    const codeLoader = new WebLoader(npm);
    const tokenProvider = new TokenProvider(token);
    const loader = new Loader(
        { tokenProvider },
        documentServices,
        codeLoader,
        { blockUpdateMarkers: true });

    const baseUrl =
        `prague://${document.location.host}/${encodeURIComponent(tenantId)}/${encodeURIComponent(documentId)}`;
    const container = await loader.resolve({ url: baseUrl });

    const platform = new LocalPlatform(document.getElementById("content"));
    registerAttach(
        loader,
        container,
        `${baseUrl}/${path}`,
        platform);

    // If this is a new document we will go and instantiate the chaincode. For old documents we assume a legacy
    // package.
    if (!container.existing) {
        await initializeChaincode(container, code)
            .catch((error) => console.log("chaincode error", error));
    }
}

export function containerInitialize(
    tenantId: string,
    documentId: string,
    path: string,
    version: ICommit,
    token: string,
    config: any,
    chaincode: string,
    npm: string,
    from: number,
    to: number,
    unitIsTime: boolean,
) {
    console.log(`Loading ${documentId}`);
    const startP = start(
        token,
        tenantId,
        documentId,
        path,
        chaincode,
        npm,
        config,
        from,
        to,
        unitIsTime);
    startP.catch((err) => console.error(err));
}
