import { debug, debugDOM } from "./debug";
import { FlatMapDOMTree } from "./flatMapDOMTree";
import { IMapViewWrapper, IMapWrapperFactory } from "./mapWrapper";
import { PragueBackgroundMapWrapperFactory } from "./pragueBackgroundMapWrapper";
import { PragueMapWrapperFactory } from "./pragueMapWrapper";
import { getCollabDoc } from "./pragueUtil";
import { RewriteDOMTree } from "./rewriteDOMTree";
import { StreamDOMTree, StreamWindow } from "./streamDOMTree";

const debugPragueMap = false;
async function MapWrapperToObject(mapView: IMapViewWrapper): Promise<object> {
    const obj: any = {};
    await mapView.forEach((value, key) => {
        obj[key] = value;
    });
    return obj;
}

let collabDocToClose;
export async function saveDOMToPrague(documentId: string, options: any) {
    if (mutationObserver) { alert("Content script already streaming"); return; }
    // Load in the latest and connect to the document
    options.startSaveSignalTime = performance.now();
    const collabDoc = await getCollabDoc(documentId);
    await saveDOM(new PragueMapWrapperFactory(collabDoc, options.batchOp), options);
    if (options.stream) {
        collabDocToClose = collabDoc;
    } else {
        // collabDoc.close(); // how to wait until all the ops are done?
    }
}

export async function streamDOMToBackgroundPrague(port: chrome.runtime.Port, contentScriptInitTime, batchOp: boolean) {
    if (mutationObserver) { alert("Content script already streaming"); return; }
    const options = {
        batchOp,
        contentScriptInitTime,
        startSaveSignalTime: performance.now(),
        stream: true,
        useFlatMap: true,
    };
    return saveDOM(new PragueBackgroundMapWrapperFactory(port, options.batchOp), options);
}

async function saveDOM(mapWrapperFactory: IMapWrapperFactory, options: any) {
    const rootViewWrapper = await mapWrapperFactory.getRootMapView();
    const dataMapWrapper = await mapWrapperFactory.createMapView();

    debug("Start sending to Prague");
    const startTime = performance.now();
    dataMapWrapper.set("TIME_INIT", options.contentScriptInitTime);
    dataMapWrapper.set("TIME_STARTSIGNAL", options.startSaveSignalTime - options.contentScriptInitTime);
    dataMapWrapper.set("TIME_DOCLOAD", startTime - options.startSaveSignalTime);

    dataMapWrapper.set("URL", window.location.href);
    dataMapWrapper.set("DIMENSION", JSON.stringify({ width: window.innerWidth, height: window.innerHeight }));
    dataMapWrapper.set("SCROLLPOS", JSON.stringify([window.scrollX, window.scrollY]));
    
    let endGenTime;
    if (options.useFlatMap) {
        let tree: StreamDOMTree | FlatMapDOMTree;
        const domMapViewWrapper = await mapWrapperFactory.createMapView();

        let rootNodeId;
        if (options.stream) {
            tree = new StreamDOMTree();
        } else {
            tree = new FlatMapDOMTree();
        }
        tree.initializeFromDOM(document);
        tree.setOnMapWrapper(domMapViewWrapper);
        rootNodeId = tree.getRootElement().getNodeId();

        endGenTime = performance.now();
        dataMapWrapper.set("TIME_GEN", endGenTime - startTime);

        dataMapWrapper.set("DOMFLATMAPNODE", rootNodeId);
        dataMapWrapper.setMapView("DOM", domMapViewWrapper);

        if (debugPragueMap) {
            debugDOM(JSON.stringify(await MapWrapperToObject(domMapViewWrapper)));
        }

        if (options.stream) {
            startStreamToPrague(tree as StreamDOMTree, dataMapWrapper);
        }
    } else {
        if (options.stream) {
            throw new Error("Not Implemented");
        }
        const tree = new RewriteDOMTree();
        tree.initializeFromDOM(document);

        endGenTime = performance.now();
        dataMapWrapper.set("TIME_GEN", endGenTime - startTime);

        dataMapWrapper.setMap("DOM", tree.getMap(mapWrapperFactory));
    }


    rootViewWrapper.setMapView("DOMSTREAM", dataMapWrapper);
    // collabDoc.save();
    const endTime = performance.now();
    dataMapWrapper.set("TIME_ATTACH", endTime - endGenTime);
    dataMapWrapper.set("DATE", new Date().valueOf());
    debug("Finish sending to Prague - " + (endTime - startTime) + "ms");
}

let mutationObserver: MutationObserver;
let streamWindow: StreamWindow;
function startStreamToPrague(tree: StreamDOMTree, dataMapView: IMapViewWrapper) {
    stopStreamToPrague();
    let mutation = 0;
    mutationObserver = tree.startStream(document, () => {
        dataMapView.set("MUTATION", mutation++);
    });

    streamWindow = new StreamWindow(window, dataMapView, tree, false);

    // Receive scroll and click events
    dataMapView.onNonLocalValueChanged((key, value) => {
        if (key === "SCROLLPOS") {
            StreamWindow.loadScrollPos(window, value);
        } else if (key === "REMOTECLICK") {
            const nodeId = value;
            const n = tree.getNodeFromId(nodeId);

            if (n) {
                debugDOM("Dispatching click to node Id: " + nodeId, n);
                n.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
            } else {
                console.error("Click to node Id not found: " + nodeId);
            }
        }
    });
}

export function stopStreamToPrague() {
    if (mutationObserver) {
        debug("Stop streaming");
        mutationObserver.disconnect();
        mutationObserver = null;
        streamWindow.disableSync();
        streamWindow = null;
        if (collabDocToClose) {
            collabDocToClose.close();
            collabDocToClose = null;
        }
    }
}
