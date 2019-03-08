// tslint:disable:ban-types
import * as agent from "@prague/agent";
import * as API from "@prague/client-api";
import { controls, ui } from "@prague/client-ui";
import { Browser, IClient, IPragueResolvedUrl, IResolvedUrl } from "@prague/container-definitions";
import * as DistributedMap from "@prague/map";
import * as MergeTree from "@prague/merge-tree";
import * as replaySocketStorage from "@prague/replay-socket-storage";
import { ContainerUrlResolver } from "@prague/routerlicious-host";
import * as socketStorage from "@prague/routerlicious-socket-storage";
import * as Sequence from "@prague/sequence";
import { IGitCache } from "@prague/services-client";
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

async function getInsights(map: DistributedMap.ISharedMap, id: string): Promise<DistributedMap.ISharedMap> {
    const insights = await map.wait<DistributedMap.ISharedMap>("insights");
    return insights.wait<DistributedMap.ISharedMap>(id);
}

async function addTranslation(
    document: API.Document,
    id: string,
    fromLanguage: string,
    toLanguage: string): Promise<void> {
    // Create the translations map
    const insights = await document.getRoot().wait<DistributedMap.ISharedMap>("insights");
    const idMap = await insights.wait<DistributedMap.ISharedMap>(id);
    if (!document.existing) {
        idMap.set("translationsFrom", undefined, DistributedMap.DistributedSetValueType.Name);
        idMap.set("translationsTo", undefined, DistributedMap.DistributedSetValueType.Name);
    }

    if (fromLanguage) {
        const translationsFrom = await idMap.wait<DistributedMap.DistributedSet<string>>("translationsFrom");
        translationsFrom.add(fromLanguage);
    }

    if (toLanguage) {
        const translationsTo = await idMap.wait<DistributedMap.DistributedSet<string>>("translationsTo");
        translationsTo.add(toLanguage);
    }
}

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
    to: number) {

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
    to: number) {

    const host = new ui.BrowserContainerHost();

    const errorService = config.trackError
        ? new BrowserErrorTrackingService()
        : new socketStorage.DefaultErrorTracking();
    const replayMode = (from >= 0) && (to >= 0);
    const documentService = replayMode
        ? replaySocketStorage.createReplayDocumentService(document.location.origin, from, to)
        : socketStorage.createDocumentService(
            config.serverUrl,
            config.blobStorageUrl,
            errorService,
            disableCache,
            config.historianApi,
            config.credentials,
            seedData);
    API.registerDocumentService(documentService);

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

    // Register to run task only if the client type is browser.
    const client = config.client as IClient;
    if (client && client.type === Browser) {
        agent.registerToWork(document.location.origin, collabDoc, client, apiHost, config);
    }

    console.log(`Document loaded ${resolved.url}: ${performanceNow()}`);
    const root = await collabDoc.getRoot();
    console.log(`Getting root ${resolved.url} - ${performanceNow()}`);

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
        console.log(`Not existing ${resolved.url} - ${performanceNow()}`);
        root.set("presence", collabDoc.createMap());
        root.set("users", collabDoc.createMap());
        root.set("calendar", undefined, Sequence.SharedIntervalCollectionValueType.Name);
        const seq = collabDoc.create(Sequence.SharedNumberSequenceExtension.Type) as
            Sequence.SharedNumberSequence;
        root.set("sequence-test", seq);
        const newString = collabDoc.createString() as Sequence.SharedString;

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
        await Promise.all([root.wait("text"), root.wait("ink"), root.wait("sequence-test"), root.wait("presence")]);
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
