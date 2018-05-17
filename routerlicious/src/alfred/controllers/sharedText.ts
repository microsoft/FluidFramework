import * as resources from "gitresources";
import performanceNow = require("performance-now");
import * as request from "request";
import * as url from "url";
import * as agent from "../../agent";
import { api as API, map as DistributedMap,  MergeTree, socketStorage, types } from "../../client-api";
import { controls, ui } from "../../client-ui";
import { SharedString } from "../../shared-string";

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

async function addTranslation(document: API.Document, id: string, language: string): Promise<void> {
    // Create the translations map
    const insights = await document.getRoot().wait<types.IMap>("insights");
    const view = await (await insights.wait<types.IMap>(id)).getView();
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
    options: Object) {

    console.log(`Load Option: ${JSON.stringify(options)}`);
    loadDocument(id, version, token, pageInk, disableCache, config, template, connect, options).catch((error) => {
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
    options: Object) {

    const host = new ui.BrowserContainerHost();

    socketStorage.registerAsDefault(
        document.location.origin,
        config.blobStorageUrl,
        config.tenantId,
        config.trackError,
        disableCache,
        config.historianApi,
        config.credentials);
    console.log(`collabDoc loading ${id} - ${performanceNow()}`);
    const collabDoc = await API.load(id, { blockUpdateMarkers: true, token }, version, connect);
    console.log(`collabDoc loaded ${id} - ${performanceNow()}`);
    const root = await collabDoc.getRoot().getView();
    console.log(`Getting root ${id} - ${performanceNow()}`);

    collabDoc.on("clientJoin", (name) => {
        console.log(`${name} joined`);
        console.log(`${Array.from(collabDoc.getClients())}`);
    });
    collabDoc.on("clientLeave", (name) => {
        console.log(`${name} left`);
        console.log(`${Array.from(collabDoc.getClients())}`);
    });

    // If a text element already exists load it directly - otherwise load in pride + prejudice
    if (!collabDoc.existing) {
        console.log(`Not existing ${id} - ${performanceNow()}`);
        root.set("presence", collabDoc.createMap());
        root.set("users", collabDoc.createMap());
        const newString = collabDoc.createString() as SharedString;

        const starterText = template ? await downloadRawText(template) : " ";
        const segments = MergeTree.loadSegments(starterText, 0, true);
        for (const segment of segments) {
            if (segment.getType() === MergeTree.SegmentType.Text) {
                let textSegment = <MergeTree.TextSegment> segment;
                newString.insertText(textSegment.text, newString.client.getLength(),
                    textSegment.properties);
            } else {
                // assume marker
                let marker = <MergeTree.Marker> segment;
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

    const sharedString = root.get("text") as SharedString;
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

    // Bootstrap worker service.
    agent.registerWorker(config, "sharedText");

    sharedString.loaded.then(() => {
        theFlow.loadFinished(clockStart);
        console.log(`fully loaded ${id}: ${performanceNow()} `);
    });
}
