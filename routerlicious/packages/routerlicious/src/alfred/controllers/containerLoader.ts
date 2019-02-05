import { CollaborativeObject } from "@prague/api-definitions";
import { IChaincodeFactory, ICodeLoader } from "@prague/container-definitions";
import { Container } from "@prague/container-loader";
import { Loader } from "@prague/container-loader";
import { ICommit } from "@prague/gitresources";
import { CollaborativeMap, IMapView } from "@prague/map";
import { createReplayDocumentService } from "@prague/replay-socket-storage";
import { IComponentRuntime, WebPlatform } from "@prague/runtime";
import { IPraguePackage } from "@prague/runtime-definitions";
import {
    createDocumentService,
    DefaultErrorTracking,
    TokenProvider,
} from "@prague/socket-storage";
import { BrowserErrorTrackingService } from "./errorTracking";

async function loadScript(scriptUrl: string): Promise<{}> {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = scriptUrl;

      // Dynamically added scripts are async by default. By setting async to false, we are enabling the scripts
      // to be downloaded in parallel, but executed in order. This ensures that a script is executed after all of
      // its dependencies have been loaded and executed.
      script.async = false;

      script.onload = resolve;
      script.onerror = () =>
        reject(new Error(`Failed to download the script at url: ${scriptUrl}`));

      document.head.appendChild(script);
    });
}

export class CodeLoader implements ICodeLoader {
    constructor(private baseUrl: string) {
    }

    public async load(source: string): Promise<IChaincodeFactory> {
        const components = source.match(/(.*)\/(.*)@(.*)/);
        if (!components) {
            return Promise.reject("Invalid package");
        }

        // TODO: Add caching so you don't download the same chaincode multiple times in a given session.
        const [, scope, name, version] = components;
        const packageUrl = `${this.baseUrl}/${encodeURI(scope)}/${encodeURI(`${name}@${version}`)}`;

        const response = await fetch(`${packageUrl}/package.json`);
        const packageJson = await response.json() as IPraguePackage;

        await Promise.all(
            packageJson.prague.browser.bundle.map(async (bundle) => loadScript(`${packageUrl}/${bundle}`)));

        // tslint:disable-next-line:no-unsafe-any
        return window[packageJson.prague.browser.entrypoint];
    }
}

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

function renderMap(view: IMapView) {
    const div = document.getElementById("content");
    // tslint:disable-next-line:no-inner-html using to clear contents
    div.innerHTML = "";

    const dl = document.createElement("dl");
    view.forEach((value, key) => {
        const dt = document.createElement("dt");
        const dd = document.createElement("dd");
        dt.innerText = key;

        if (value instanceof CollaborativeObject) {
            dd.innerText = `${value.type}/${value.id}`;
        } else {
            try {
                dd.innerText = JSON.stringify(value);
            } catch {
                dd.innerText = "!Circular";
            }
        }

        dl.appendChild(dt).appendChild(dd);
    });

    div.appendChild(dl);
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
        case "prague/dataType":
            const dataType = response.value as CollaborativeMap;
            const view = await dataType.getView();
            renderMap(view);
            dataType.on("valueChanged", (key) => renderMap(view));
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
    const errorService = config.trackError
        ? new BrowserErrorTrackingService()
        : new DefaultErrorTracking();

    const replay = from >= 0 || to >= 0;
    const documentServices = replay
        ? createReplayDocumentService(document.location.origin, from, to, unitIsTime)
        : createDocumentService(
            document.location.origin,
            config.blobStorageUrl,
            errorService);

    const codeLoader = new CodeLoader(npm);

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
