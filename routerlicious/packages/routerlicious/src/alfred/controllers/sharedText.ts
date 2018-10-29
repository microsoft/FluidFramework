// tslint:disable:ban-types
import * as agent from "@prague/agent";
import * as API from "@prague/client-api";
import { controls, ui } from "@prague/client-ui";
import * as resources from "@prague/gitresources";
import * as DistributedMap from "@prague/map";
import * as MergeTree from "@prague/merge-tree";
import { IClient } from "@prague/runtime-definitions";
import * as SharedString from "@prague/shared-string";
import * as socketStorage from "@prague/socket-storage";
import { IStream } from "@prague/stream";
// tslint:disable-next-line:no-var-requires
const performanceNow = require("performance-now");
import * as request from "request";
import * as url from "url";
import { BrowserErrorTrackingService } from "./errorTracking";

// first script loaded
const clockStart = Date.now();

export let theFlow: controls.FlowView;

function downloadRawText(textUrl: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        request.get(url.resolve(document.baseURI, textUrl), (error, response, body: string) => {
            if (error) {
                reject(error);
            } else if (response.statusCode !== 200) {
                reject(response.statusCode);
            } else {
                resolve(body);
            }
        });
    });
}

async function getInsights(map: DistributedMap.IMap, id: string): Promise<DistributedMap.IMap> {
    const insights = await map.wait<DistributedMap.IMap>("insights");
    return insights.wait<DistributedMap.IMap>(id);
}

async function addTranslation(document: API.Document, id: string, language: string): Promise<void> {
    // Create the translations map
    const insights = await document.getRoot().wait<DistributedMap.IMap>("insights");
    const view = await (await insights.wait<DistributedMap.IMap>(id)).getView();
    if (!document.existing) {
        view.set("translations", undefined, DistributedMap.DistributedSetValueType.Name);
    }

    if (!language) {
        return;
    }

    const translations = await view.wait<DistributedMap.DistributedSet<string>>("translations");
    translations.add(language);
}

export async function load(
    id: string,
    version: resources.ICommit,
    token: string,
    pageInk: boolean,
    disableCache: boolean,
    config: any,
    template: string,
    connect: boolean,
    options: Object,
    credentials: { tenant: string, key: string },
    from: number,
    to: number) {

    API.registerChaincodeRepo(config.npm);
    API.registerDefaultCredentials(credentials);

    console.log(`Load Option: ${JSON.stringify(options)}`);
    loadDocument(id, version, token, pageInk, disableCache, config, template, connect, options, from, to)
    .catch((error) => {
        console.error(error);
    });
}

async function loadDocument(
    id: string,
    version: resources.ICommit,
    token: string,
    pageInk: boolean,
    disableCache: boolean,
    config: any,
    template: string,
    connect: boolean,
    options: Object,
    from: number,
    to: number) {

    const host = new ui.BrowserContainerHost();

    const errorService = config.trackError
        ? new BrowserErrorTrackingService()
        : new socketStorage.DefaultErrorTracking();
    const replayMode = (from >= 0) && (to >= 0);
    const documentService = replayMode ? socketStorage.createReplayDocumentService(document.location.origin, from, to)
        : socketStorage.createDocumentService(
            document.location.origin,
            config.blobStorageUrl,
            errorService,
            disableCache,
            config.historianApi,
            config.credentials);
    API.registerDocumentService(documentService);
    console.log(`collabDoc loading ${id} - ${performanceNow()}`);
    const collabDoc = await API.load(id, { blockUpdateMarkers: true, client: config.client, token }, version, connect);

    // Register to run task only if the client type is browser.
    const client = config.client as IClient;
    if (client && client.type === "browser") {
        agent.registerToWork(collabDoc, client, token, config);
    }

    console.log(`collabDoc loaded ${id} - ${performanceNow()}`);
    const root = await collabDoc.getRoot().getView();
    console.log(`Getting root ${id} - ${performanceNow()}`);

    collabDoc.on("clientJoin", (message) => {
        console.log(`${JSON.stringify(message)} joined`);
        console.log(`${Array.from(collabDoc.getClients().keys())}`);
    });
    collabDoc.on("clientLeave", (message) => {
        console.log(`${JSON.stringify(message)} left`);
        console.log(`${Array.from(collabDoc.getClients().keys())}`);
    });

    // If a text element already exists load it directly - otherwise load in pride + prejudice
    if (!collabDoc.existing) {
        console.log(`Not existing ${id} - ${performanceNow()}`);
        root.set("presence", collabDoc.createMap());
        root.set("users", collabDoc.createMap());
        root.set("calendar", undefined, SharedString.SharedIntervalCollectionValueType.Name);
        const newString = collabDoc.createString() as SharedString.SharedString;

        const starterText = template ? await downloadRawText(template) : " ";
        const segments = MergeTree.loadSegments(starterText, 0, true);
        for (const segment of segments) {
            if (segment.getType() === MergeTree.SegmentType.Text) {
                const textSegment = segment as MergeTree.TextSegment;
                newString.insertText(textSegment.text, newString.client.getLength(),
                    textSegment.properties);
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
        await Promise.all([root.wait("text"), root.wait("ink")]);
    }

    const sharedString = root.get("text") as SharedString.SharedString;
    console.log(`Shared string ready - ${performanceNow()}`);
    console.log(window.navigator.userAgent);
    console.log(`id is ${id}`);
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

    const translationLanguage = "translationLanguage";
    addTranslation(collabDoc, sharedString.id, options[translationLanguage]).catch((error) => {
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
        console.log(`fully loaded ${id}: ${performanceNow()} `);
    });
}
