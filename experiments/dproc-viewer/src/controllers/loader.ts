import { ICommit } from "@prague/gitresources";
import * as loader from "@prague/loader";
import { WebLoader, WebPlatformFactory } from "@prague/loader-web";
import { IDocumentService, ITokenProvider, IUser  } from "@prague/runtime-definitions";
import {
    createDocumentService,
    TokenProvider,
    TokenService,
} from "@prague/socket-storage";
import Axios from "axios";

export async function proposeChaincode(document: loader.Document, chaincode: string) {
    if (!document.connected) {
        // tslint:disable-next-line:no-unnecessary-callback-wrapper
        await new Promise<void>((resolve) => document.once("connected", () => resolve()));
    }

    await document.getQuorum()
        .propose("code", chaincode);
}

export async function run(
    id: string,
    tenantId: string,
    user: IUser,
    tokenProvider: ITokenProvider,
    options: any,
    reject: boolean,
    documentServices: IDocumentService,
    version: ICommit,
    connect: boolean,
    chaincode: string,
    loaderUrl: string): Promise<void> {

    const webLoader = new WebLoader(loaderUrl);
    const webPlatformFactory = new WebPlatformFactory(window.document.getElementById("content"));

    const documentP = loader.load(
        id,
        tenantId,
        user,
        tokenProvider,
        { blockUpdateMarkers: true },
        webPlatformFactory,
        documentServices,
        webLoader,
        version,
        connect);
    const document = await documentP;

    const quorum = document.getQuorum();
    console.log("Initial clients", JSON.stringify(Array.from(quorum.getMembers())));
    quorum.on("addMember", (clientId, details) => console.log(`${clientId} joined`));
    quorum.on("removeMember", (clientId) => console.log(`${clientId} left`));
    quorum.on(
        "addProposal",
        (proposal) => {
            if (reject) {
                console.log(`Reject ${proposal.key}=${proposal.value}@${proposal.sequenceNumber}`);
                proposal.reject();
            } else {
                console.log(`Propose ${proposal.key}=${proposal.value}@${proposal.sequenceNumber}`);
            }
        });
    quorum.on(
        "approveProposal",
        (sequenceNumber, key, value) => {
            console.log(`Approve ${key}=${value}@${sequenceNumber}`);
        });

    // Propose initial chaincode if specified
    if (chaincode) {
        await proposeChaincode(document, chaincode);
    }
}

export function load(orderer: string, storage: string, npm: string, token: string) {
    const documentServices = createDocumentService(orderer, storage);

    const tokenService = new TokenService();
    const claims = tokenService.extractClaims(token);

    return run(
        claims.documentId,
        claims.tenantId,
        claims.user,
        new TokenProvider(token),
        null,
        false,
        documentServices,
        null,
        true,
        null,
        npm);
}

export async function createAndNavigate(
    orderer: string,
    storage: string,
    npm: string,
    token: string,
    chaincode: string,
) {
    const documentServices = createDocumentService(orderer, storage);

    const tokenService = new TokenService();
    const claims = tokenService.extractClaims(token);

    await run(
        claims.documentId,
        claims.tenantId,
        claims.user,
        new TokenProvider(token),
        null,
        false,
        documentServices,
        null,
        true,
        chaincode,
        npm);

    // TODO need a better signal for the page being fully complete. For now just wait 3 seconds for initial setup
    // ops to complete after the document is loaded.

    setTimeout(
        () => {
            // navigate top page
            window.top.location.href = `/${encodeURIComponent(claims.documentId)}`;
        },
        3000);
}

export function meta() {
    const form = document.getElementById("process-form") as HTMLFormElement;

    form.addEventListener("submit", (event) => {
        event.preventDefault();

        const fetchUrl = form.process_url.value;
        Axios.get(fetchUrl, { responseType: "text" }).then((result) => {
            const template = document.createElement("template");
            template.innerHTML = result.data;
            const content = template.content;

            const output = document.getElementById("output");
            output.innerHTML = "";
            content.querySelectorAll("meta").forEach((value) => {
                const property = value.getAttribute("property");
                const metaContent = value.content;

                if (property && property.indexOf("prague:") === 0) {
                    const appendDiv = document.createElement("div");
                    appendDiv.innerHTML =
                        `<div class="row">
                            <div class="col">${property}</div>
                            <div class="col">${metaContent}</div>
                        </div>`;
                    output.appendChild(appendDiv);
                }
            });
        });
    });

    return;
}
