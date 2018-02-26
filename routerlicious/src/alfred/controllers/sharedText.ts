import * as resources from "gitresources";
import performanceNow = require("performance-now");
import * as request from "request";
import * as url from "url";
import * as agent from "../../agent";
import { api as API, map as Map, MergeTree as SharedString, socketStorage, types } from "../../client-api";
import { controls, ui } from "../../client-ui";

// first script loaded
let clockStart = Date.now();

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

async function getInsights(map: types.IMap, id: string): Promise<types.IMap> {
    const insights = await map.wait<types.IMap>("insights");
    return insights.wait<types.IMap>(id);
}

export async function onLoad(
    id: string,
    version: resources.ICommit,
    pageInk: boolean,
    disableCache: boolean,
    config: any,
    template: string,
    loadPartial: boolean,
    options: Object) {

    console.log(`Load Option: ${JSON.stringify(options)}`);
    loadPartial
        ? loadCommit(id, version, pageInk, config, options)
        : loadFull(id, version, pageInk, disableCache, config, template, options);
}

async function loadFull(
    id: string,
    version: resources.ICommit,
    pageInk: boolean,
    disableCache: boolean,
    config: any,
    template: string,
    options: Object) {

    const host = new ui.BrowserContainerHost();

    socketStorage.registerAsDefault(
        document.location.origin,
        config.blobStorageUrl,
        config.owner,
        config.repository,
        disableCache,
        config.historianApi,
        config.credentials);
    console.log(`collabDoc loading ${id} - ${performanceNow()}`);
    const collabDoc = await API.load(id, { blockUpdateMarkers: true }, version);
    console.log(`collabDoc loaded ${id} - ${performanceNow()}`);
    const root = await collabDoc.getRoot().getView();
    console.log(`Getting root ${id} - ${performanceNow()}`);

    // If a text element already exists load it directly - otherwise load in pride + prejudice
    const existing = root.has("text");
    if (!existing) {
        console.log(`Not existing ${id} - ${performanceNow()}`);
        root.set("presence", collabDoc.createMap());
        const newString = collabDoc.createString() as SharedString.SharedString;

        const starterText = template ? await downloadRawText(template) : " ";
        const segments = SharedString.loadSegments(starterText, 0, true);
        for (const segment of segments) {
            if (segment.getType() === SharedString.SegmentType.Text) {
                let textSegment = <SharedString.TextSegment> segment;
                newString.insertText(textSegment.text, newString.client.getLength(),
                    textSegment.properties);
            } else {
                // assume marker
                let marker = <SharedString.Marker> segment;
                newString.insertMarker(newString.client.getLength(), marker.refType, marker.properties);
            }
        }
        root.set("text", newString);
        root.set("ink", collabDoc.createMap());

        if (pageInk) {
            root.set("pageInk", collabDoc.createStream());
        }
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
        root.get("pageInk") as types.IStream,
        options);
    theFlow = container.flowView;
    host.attach(container);

    getInsights(collabDoc.getRoot(), sharedString.id).then((insightsMap) => {
        container.trackInsights(insightsMap);
    });

    if (sharedString.client.getLength() > 0) {
        theFlow.render(0, true);
    }
    theFlow.timeToEdit = theFlow.timeToImpression = Date.now() - clockStart;

    theFlow.setEdit(root);

    // Bootstrap worker service.
    agent.registerWorker(config, "sharedText");

    sharedString.loaded.then(() => {
        theFlow.loadFinished(clockStart);

        // sharedString.addBookmark(collabDoc.clientId, 10);
        // console.log(`Bookmarks`);
        // sharedString.getBookmarks().forEach((value: Map.DistributedArray<any>, key) => {
        //     console.log(`${key} => ${JSON.stringify(value.value)}`);
        // });
    });
}

async function loadCommit(
    id: string,
    version: resources.ICommit,
    pageInk: boolean,
    config: any,
    options: Object) {
    console.log(`Load document ${id} upto commit ${JSON.stringify(version)}.`);

    const host = new ui.BrowserContainerHost();

    socketStorage.registerAsDefault(
        document.location.origin,
        config.blobStorageUrl,
        config.owner,
        config.repository);
    console.log(`collabDoc loading ${id} - ${performanceNow()}`);
    const collabDoc = await API.load(id, { blockUpdateMarkers: true }, version, false);
    console.log(`collabDoc loaded ${id} - ${performanceNow()}`);
    const root = await collabDoc.getRoot().getView();
    console.log(`Getting root ${id} - ${performanceNow()}`);

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
        root.get("pageInk") as types.IStream,
        options);
    theFlow = container.flowView;
    host.attach(container);

    getInsights(collabDoc.getRoot(), sharedString.id);

    if (sharedString.client.getLength() > 0) {
        theFlow.render(0, true);
    }
    theFlow.timeToEdit = theFlow.timeToImpression = Date.now() - clockStart;

    theFlow.setEdit(root);

    sharedString.loaded.then(() => {
        theFlow.loadFinished(clockStart);
    });
}
