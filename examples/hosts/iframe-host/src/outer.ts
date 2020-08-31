/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import {
    RouterliciousDocumentServiceFactory,
} from "@fluidframework/routerlicious-driver";
import { IFluidCodeDetails } from "@fluidframework/container-definitions";
import { BaseHost } from "@fluidframework/base-host";
import { IRequest } from "@fluidframework/core-interfaces";
import { InsecureUrlResolver } from "@fluidframework/test-runtime-utils";
import { SemVerCdnCodeResolver } from "@fluidframework/web-code-loader";
import { HTMLViewAdapter } from "@fluidframework/view-adapters";
import { IFrameOuterHost } from "./inframehost";

const createRequest = (): IRequest => ({
    url: `${window.location.origin}/testdoc50`,
});

const getTinyliciousResolver =
    () => new InsecureUrlResolver(
        "http://localhost:3000",
        "http://localhost:3000",
        "http://localhost:3000",
        "tinylicious",
        "12345",
        { id: "userid0" },
        "bearer");

export async function loadFrame(iframeId: string, logId: string) {
    const iframe = document.getElementById(iframeId) as HTMLIFrameElement;

    const urlResolver = getTinyliciousResolver();

    const documentServiceFactory = new RouterliciousDocumentServiceFactory();

    const host = new IFrameOuterHost({
        urlResolver,
        documentServiceFactory,
    });

    const proxyContainer = await host.load(createRequest(), iframe);

    const text = document.getElementById(logId) as HTMLDivElement;
    const quorum = proxyContainer.getQuorum();

    const log =
        (emitter: { on(event: string, listener: (...args: any[]) => void) }, name: string, ...events: string[]) => {
            events.forEach((event) =>
                emitter.on(event, (...args) => {
                    text.innerHTML += `${name}: ${event}: ${JSON.stringify(args)}<br/>`;
                }));
        };

    quorum.getMembers().forEach((client) => text.innerHTML += `Quorum: client: ${JSON.stringify(client)}<br/>`);
    log(quorum, "Quorum", "error", "addMember", "removeMember");
    log(proxyContainer, "Container", "error", "connected", "disconnected");
}

async function getComponentAndRender(baseHost: BaseHost, url: string, div: HTMLDivElement) {
    const component = await baseHost.requestFluidObject(url);
    if (component === undefined) {
        return;
    }
    // Render the component with an HTMLViewAdapter to abstract the UI framework used by the component
    const view = new HTMLViewAdapter(component);
    view.render(div, { display: "block" });
}

export async function loadDiv(divId: string) {
    const div = document.getElementById(divId) as HTMLDivElement;

    const urlResolver = getTinyliciousResolver();

    const documentServiceFactory = new RouterliciousDocumentServiceFactory();

    const pkg: IFluidCodeDetails = {
        package: "@fluid-example/todo@^0.15.0",
        config: {
            "@fluid-example:cdn": "https://pragueauspkn.azureedge.net",
        },
    };

    const baseHost = new BaseHost(
        {
            codeResolver: new SemVerCdnCodeResolver(),
            documentServiceFactory,
            urlResolver,
            config: {},
        });

    const url = createRequest().url;
    const container = await baseHost.initializeContainer(url, pkg);

    // Handle the code upgrade scenario (which fires contextChanged)
    container.on("contextChanged", (value) => {
        getComponentAndRender(baseHost, url, div).catch(() => { });
    });
}

export async function runOuter(iframeId: string, divId: string, logId: string) {
    await Promise.all([
        loadFrame(iframeId, logId),
        loadDiv(divId).catch(),
    ]);
}
