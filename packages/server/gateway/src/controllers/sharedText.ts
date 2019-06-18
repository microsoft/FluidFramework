/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// tslint:disable:ban-types
import { addTranslation, downloadRawText, getInsights } from "@chaincode/shared-text";
import * as agent from "@prague/agent";
import * as API from "@prague/client-api";
import { controls, ui } from "@prague/client-ui";
import {
    Browser,
    IClient,
    IDocumentServiceFactory,
    IPragueResolvedUrl,
    IResolvedUrl,
    ISequencedClient,
} from "@prague/container-definitions";
import * as MergeTree from "@prague/merge-tree";
import { OdspDocumentServiceFactory } from "@prague/odsp-socket-storage";
import { ReplayDocumentServiceFactory } from "@prague/replay-socket-storage";
import { ContainerUrlResolver } from "@prague/routerlicious-host";
import { DefaultErrorTracking, RouterliciousDocumentServiceFactory } from "@prague/routerlicious-socket-storage";
import * as Sequence from "@prague/sequence";
import { IGitCache } from "@prague/services-client";
import { IStream } from "@prague/stream";
// tslint:disable-next-line:no-var-requires
const performanceNow = require("performance-now");
import * as url from "url";
import { MultiDocumentServiceFactory } from "../multiDocumentServiceFactory";
import { BrowserErrorTrackingService } from "./errorTracking";

// first script loaded
const clockStart = Date.now();

export let theFlow: controls.FlowView;

export async function load(
    resolved: IPragueResolvedUrl,
    jwt: string,
    seedData: IGitCache,
    pageInk: boolean,
    disableCache: boolean,
    config: any,
    template: string,
    options: Object,
    from: number,
    to: number,
) {
    API.registerChaincodeRepo(config.npm);

    console.log(`Load Option: ${JSON.stringify(options)}`);
    loadDocument(
        resolved, jwt, seedData,
        pageInk, disableCache, config,
        template, options, from, to)
        .catch((error) => {
            console.error(error);
        });
}

async function loadDocument(
    resolved: IPragueResolvedUrl,
    jwt: string,
    seedData: IGitCache,
    pageInk: boolean,
    disableCache: boolean,
    config: any,
    template: string,
    options: Object,
    from: number,
    to: number,
) {
    const host = new ui.BrowserContainerHost();

    const errorService = config.trackError
        ? new BrowserErrorTrackingService()
        : new DefaultErrorTracking();
    const replayMode = (from >= 0) && (to >= 0);
    const r11sDocumentServiceFactory = new RouterliciousDocumentServiceFactory(
        false,
        errorService,
        disableCache,
        config.historianApi,
        seedData,
        config.credentials);
    const odspDocumentServiceFactory = new OdspDocumentServiceFactory();
    let documentServiceFactory: IDocumentServiceFactory = new MultiDocumentServiceFactory(
        {
            "prague-odsp:": odspDocumentServiceFactory,
            "prague:": r11sDocumentServiceFactory,
        });
    if (replayMode) {
        documentServiceFactory =
            new ReplayDocumentServiceFactory(
                from,
                to,
                documentServiceFactory);
    }
    API.registerDocumentServiceFactory(documentServiceFactory);

    const resolver = new ContainerUrlResolver(
        document.location.origin,
        jwt,
        new Map<string, IResolvedUrl>([[resolved.url, resolved]]));

    console.log(`Document loading ${resolved.url}: ${performanceNow()}`);
    const apiHost = { resolver };

    const collabDoc = await API.load(
        resolved.url,
        apiHost,
        { blockUpdateMarkers: true, client: config.client });

    const parsedUrl = url.parse(resolved.url);
    const [, tenantId, documentId] = parsedUrl.path.split("/");
    if (!documentId || !tenantId) {
        // tslint:disable-next-line:max-line-length
        return Promise.reject(`Couldn't parse documentId and/or tenantId. [documentId:${documentId}][tenantId:${tenantId}]`);
    }

    // Register to run task only if the client type is browser.
    const client = config.client as IClient;
    if (client && client.type === Browser) {
        agent.registerToWork(document.location.origin, collabDoc, client, apiHost, config, tenantId, documentId);
    }

    console.log(`Document loaded ${resolved.url}: ${performanceNow()}`);
    const root = await collabDoc.getRoot();
    console.log(`Getting root ${resolved.url} - ${performanceNow()}`);

    collabDoc.runtime.getQuorum().on("addMember", (clientId: string, detail: ISequencedClient) => {
        console.log(`${clientId} joined`);
        console.log(JSON.stringify(detail));
    });
    collabDoc.runtime.getQuorum().on("removeMember", (clientId: string) => {
        console.log(`${clientId} left`);
    });

    // If a text element already exists load it directly - otherwise load in pride + prejudice
    if (!collabDoc.existing) {
        console.log(`Not existing ${resolved.url} - ${performanceNow()}`);
        root.set("users", collabDoc.createMap());
        root.set("calendar", undefined, Sequence.SharedIntervalCollectionValueType.Name);
        const seq = Sequence.SharedNumberSequence.create(collabDoc.runtime);
        root.set("sequence-test", seq);
        const newString = collabDoc.createString() as Sequence.SharedString;

        const starterText = template ? await downloadRawText(template) : " ";
        const segments = MergeTree.loadSegments(starterText, 0, true);
        for (const segment of segments) {
            if (MergeTree.TextSegment.is(segment)) {
                newString.insertText(segment.text, newString.client.getLength(),
                segment.properties);
            } else {
                // assume marker
                const marker = segment as MergeTree.Marker;
                newString.insertMarker(newString.client.getLength(), marker.refType, marker.properties);
            }
        }
        root.set("text", newString);
        root.set("ink", collabDoc.createMap());

        if (pageInk) {
            root.set("pageInk", collabDoc.createStream());
        }
    } else {
        await Promise.all([root.wait("text"), root.wait("ink"), root.wait("sequence-test")]);
    }

    const sharedString = root.get("text") as Sequence.SharedString;
    console.log(`Shared string ready - ${performanceNow()}`);
    console.log(window.navigator.userAgent);
    console.log(`id is ${resolved.url}`);
    console.log(`Partial load fired - ${performanceNow()}`);

    // Higher plane ink
    const inkPlane = root.get("ink");

    // Bindy for insights
    const image = new controls.Image(
        document.createElement("div"),
        url.resolve(document.baseURI, "/public/images/bindy.svg"));

    const containerDiv = document.createElement("div");
    const container = new controls.FlowContainer(
        containerDiv,
        collabDoc,
        sharedString,
        inkPlane,
        image,
        root.get("pageInk") as IStream,
        options);
    theFlow = container.flowView;
    host.attach(container);

    const translationFromLanguage = "translationFromLanguage";
    const translationToLanguage = "translationToLanguage";
    addTranslation(
        collabDoc,
        sharedString.id,
        options[translationFromLanguage],
        options[translationToLanguage]).catch((error) => {
            console.error("Problem adding translation", error);
        });

    getInsights(collabDoc.getRoot(), sharedString.id).then(
        (insightsMap) => {
            container.trackInsights(insightsMap);
        });

    if (sharedString.client.getLength() > 0) {
        theFlow.render(0, true);
    }
    theFlow.timeToEdit = theFlow.timeToImpression = Date.now() - clockStart;

    theFlow.setEdit(root);

    sharedString.loaded.then(() => {
        theFlow.loadFinished(clockStart);
        console.log(`fully loaded ${resolved.url}: ${performanceNow()} `);
    });
}
