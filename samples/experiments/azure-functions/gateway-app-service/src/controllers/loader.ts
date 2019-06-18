/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IChaincodeFactory,
    ICodeLoader,
    IPraguePackage,
    IResolvedUrl,
} from "@prague/container-definitions";
import { Container, Loader } from "@prague/container-loader";
import { WebPlatform } from "@prague/loader-web";
import { OdspDocumentServiceFactory } from "@prague/odsp-socket-storage";
import { ContainerUrlResolver } from "@prague/routerlicious-host";
import { DefaultErrorTracking, RouterliciousDocumentServiceFactory } from "@prague/routerlicious-socket-storage";
import { IComponent } from "@prague/runtime-definitions";
import { IGitCache } from "@prague/services-client";
import { MultiDocumentServiceFactory } from "../multiDocumentServiceFactory";

export class WebLoader implements ICodeLoader {
    private entryCache = new Map<string, Promise<any>>();

    constructor(private baseUrl: string, pkg: string, entrypoint: string, scriptIds: string[]) {
        if (entrypoint) {
            // Check to see if the entrypoint exists - use it if so
            const entrypointReadyP = new Promise<IChaincodeFactory>((resolve, reject) => {
                if (entrypoint in window) {
                    resolve(window[entrypoint]);
                }

                scriptIds.forEach((scriptId) => {
                    const script = document.getElementById(scriptId) as HTMLScriptElement;
                    script.onload = () => {
                        if (entrypoint in window) {
                            resolve(window[entrypoint]);
                        }
                    };

                    script.onerror = (error) => {
                        reject(error);
                    };
                });
            });

            this.entryCache.set(pkg, entrypointReadyP);
        }
    }

    public async load<T>(source: string): Promise<T> {
        if (!this.entryCache.has(source)) {
            const entryP = this.loadCore(source);
            this.entryCache.set(source, entryP);
        }

        return this.entryCache.get(source);
    }

    private async loadCore(source: string): Promise<IChaincodeFactory> {
        const components = source.match(/(.*)\/(.*)@(.*)/);
        if (!components) {
            return Promise.reject("Invalid package");
        }

        const [, scope, name, version] = components;
        const packageUrl = `${this.baseUrl}/${encodeURI(scope)}/${encodeURI(`${name}@${version}`)}`;

        const response = await fetch(`${packageUrl}/package.json`);
        const packageJson = await response.json() as IPraguePackage;

        await Promise.all(
            packageJson.prague.browser.bundle.map(async (bundle) => this.loadScript(`${packageUrl}/${bundle}`)));

        // tslint:disable-next-line:no-unsafe-any
        return window[packageJson.prague.browser.entrypoint];
    }

    private async loadScript(scriptUrl: string): Promise<void> {
        return new Promise((resolve, reject) => {
          const script = document.createElement("script");
          script.src = scriptUrl;

          // Dynamically added scripts are async by default. By setting async to false, we are enabling the scripts
          // to be downloaded in parallel, but executed in order. This ensures that a script is executed after all of
          // its dependencies have been loaded and executed.
          script.async = false;

          script.onload = () => resolve();
          script.onerror = () =>
            reject(new Error(`Failed to download the script at url: ${scriptUrl}`));

          document.head.appendChild(script);
        });
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

async function attach(loader: Loader, url: string, platform: LocalPlatform) {
    const response = await loader.request({ url });

    if (response.status !== 200) {
        return;
    }

    switch (response.mimeType) {
        case "prague/component":
            const component = response.value as IComponent;
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
    url: string,
    resolved: IResolvedUrl,
    cache: IGitCache,
    config: any,
    code: string,
    entrypoint: string,
    scriptIds: string[],
    npm: string,
    jwt: string,
): Promise<void> {
    const errorService = new DefaultErrorTracking();

    // URL resolver for routes
    const resolver = new ContainerUrlResolver(
        document.location.origin,
        jwt,
        new Map<string, IResolvedUrl>([[url, resolved]]));

    const r11sDocumentServiceFactory = new RouterliciousDocumentServiceFactory(false, errorService, false, true, cache);
    const odspDocumentServiceFactory = new OdspDocumentServiceFactory();
    const documentServiceFactory = new MultiDocumentServiceFactory(
        {
            "prague-odsp:": odspDocumentServiceFactory,
            "prague:": r11sDocumentServiceFactory,
        });
    // Create the web loader and prefetch the chaincode we will need
    const codeLoader = new WebLoader(npm, code, entrypoint, scriptIds);
    codeLoader.load(code).catch((error) => console.error("script load error", error));

    const loader = new Loader(
        { resolver },
        documentServiceFactory,
        codeLoader,
        { blockUpdateMarkers: true });

    const container = await loader.resolve({ url });

    const platform = new LocalPlatform(document.getElementById("content"));
    registerAttach(
        loader,
        container,
        url,
        platform);

    // If this is a new document we will go and instantiate the chaincode. For old documents we assume a legacy
    // package.
    if (!container.existing) {
        await initializeChaincode(container, code)
            .catch((error) => console.error("chaincode error", error));
    }
}

export function initialize(
    url: string,
    resolved: IResolvedUrl,
    cache: IGitCache,
    config: any,
    chaincode: string,
    entrypoint: string,
    scriptIds: string[],
    npm: string,
    jwt: string,
) {
    console.log(`Loading ${url}`);
    const startP = start(
        url,
        resolved,
        cache,
        config,
        chaincode,
        entrypoint,
        scriptIds,
        npm,
        jwt);
    startP.catch((err) => console.error(err));
}
