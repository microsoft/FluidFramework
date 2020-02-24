import { EventEmitter } from "events";
import {
    DefaultErrorTracking,
    RouterliciousDocumentServiceFactory,
} from "@microsoft/fluid-routerlicious-driver";
// eslint-disable-next-line import/no-internal-modules
import {InsecureUrlResolver} from "@microsoft/fluid-webpack-component-loader/dist/insecureUrlResolver";
import { IFluidCodeDetails } from "@microsoft/fluid-container-definitions";
import { BaseHost } from "@microsoft/fluid-base-host";
import { IRequest } from "@microsoft/fluid-component-core-interfaces";
import { IFrameOuterHost } from "./inframehost";

const docid = "testdoc4";

const createRequest = (): IRequest=> ({
    url:`${window.location.origin}/${docid}`,
});

const getTinyliciousResolver =
    () => new InsecureUrlResolver(
        "http://localhost:3000",
        "http://localhost:3000",
        "http://localhost:3000",
        "tinylicious",
        "12345",
        {id:"userid0"},
        "");

const getTinyliciousDocumentServiceFactory =
    () => new RouterliciousDocumentServiceFactory(
        false,
        new DefaultErrorTracking(),
        false,
        true,
        undefined);

export async function loadFrame(iframeId: string){
    const iframe = document.getElementById(iframeId) as HTMLIFrameElement;

    const urlResolver = getTinyliciousResolver();

    const documentServiceFactory = getTinyliciousDocumentServiceFactory();

    const host = new IFrameOuterHost({
        urlResolver,
        documentServiceFactory,
    });

    return host.load(createRequest(), iframe);
}

export async function loadDiv(divId: string){
    const div = document.getElementById(divId) as HTMLDivElement;

    const urlResolver = getTinyliciousResolver();

    const documentServiceFactory = getTinyliciousDocumentServiceFactory();

    const pkgResp =
        await fetch(
            "https://pragueauspkn-3873244262.azureedge.net/@fluid-example/todo@^0.14.0/package.json");
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
        await urlResolver.resolve(createRequest()),
        undefined,
        []);

    await baseHost.loadAndRender(createRequest().url, div, pkg);
}

export async function runOuter(iframeId: string, divId: string, logId: string){

    const [proxyContainer] =await Promise.all([
        loadFrame(iframeId),
        loadDiv(divId).catch(),
    ]);

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

