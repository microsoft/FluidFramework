/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { EventEmitter } from "events";
import {
    DefaultErrorTracking,
    RouterliciousDocumentServiceFactory,
} from "@microsoft/fluid-routerlicious-driver";
import { IFluidCodeDetails } from "@microsoft/fluid-container-definitions";
import { BaseHost } from "@microsoft/fluid-base-host";
import { IRequest } from "@microsoft/fluid-component-core-interfaces";
import {InsecureUrlResolver} from "@microsoft/fluid-test-runtime-utils";
import { IFrameOuterHost } from "./inframehost";

const createRequest = (): IRequest => ({
    url: `${window.location.origin}/testdoc41`,
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

const getTinyliciousDocumentServiceFactory =
    () => new RouterliciousDocumentServiceFactory(
        false,
        new DefaultErrorTracking(),
        false,
        true,
        undefined);

export async function loadFrame(iframeId: string, logId: string){
    const iframe = document.getElementById(iframeId) as HTMLIFrameElement;

    const urlResolver = getTinyliciousResolver();

    const documentServiceFactory = getTinyliciousDocumentServiceFactory();

    const host = new IFrameOuterHost({
        urlResolver,
        documentServiceFactory,
    });

    const proxyContainer = await host.load(createRequest(), iframe);


    const text = document.getElementById(logId) as HTMLDivElement;
    const quorum = proxyContainer.getQuorum();

    const log = (emitter: EventEmitter, name: string, ...events: string[]) =>{
        events.forEach((event)=>
            emitter.on(event, (...args)=>{
                text.innerHTML+=`${name}: ${event}: ${JSON.stringify(args)}<br/>`;
            }));
    };

    quorum.getMembers().forEach((client)=>text.innerHTML+=`Quorum: client: ${JSON.stringify(client)}<br/>`);
    log(quorum, "Quorum", "error", "addMember", "removeMember");
    log(proxyContainer, "Container", "error", "connected","disconnected");
}

export async function loadDiv(divId: string){
    const div = document.getElementById(divId) as HTMLDivElement;

    const urlResolver = getTinyliciousResolver();

    const documentServiceFactory = getTinyliciousDocumentServiceFactory();

    const pkgResp =
        await fetch(
            "https://pragueauspkn-3873244262.azureedge.net/@fluid-example/todo@^0.15.0/package.json");
    const pkg: IFluidCodeDetails = {
        package: await pkgResp.json(),
        config:{
            "@fluid-example:cdn":"https://pragueauspkn-3873244262.azureedge.net",
        },
    };
    const baseHost = new BaseHost(
        {
            documentServiceFactory,
            urlResolver,
            config: {},
        },
        undefined,
        []);

    await baseHost.loadAndRender(createRequest().url, div, pkg);
}

export async function runOuter(iframeId: string, divId: string, logId: string){

    await Promise.all([
        loadFrame(iframeId, logId),
        loadDiv(divId).catch(),
    ]);

}

