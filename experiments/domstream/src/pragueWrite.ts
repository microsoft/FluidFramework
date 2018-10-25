import { debug, debugDOM } from "./debug";
import { IMapViewWrapper, IMapWrapperFactory } from "./mapWrapper";
import { PragueBackgroundMapWrapperFactory } from "./pragueBackgroundMapWrapper";
import { FlatMapDOMTree } from "./pragueFlatMapDOMTree";
import { PragueMapWrapperFactory } from "./pragueMapWrapper";
import { StreamDOMTree, StreamWindow } from "./pragueStreamDOMTree";
import { getCollabDoc } from "./pragueUtil";
import { RewriteDOMTree } from "./rewriteDOMTree";

const debugPragueMap = false;
async function MapWrapperToObject(mapView: IMapViewWrapper): Promise<object> {
    const obj: any = {};
    await mapView.forEach((value, key) => {
        obj[key] = value;
    });
    return obj;
}

let collabDocToClose;
export async function saveDOMToPrague(documentId: string, useFlatMap: boolean, stream: boolean) {
    if (mutationObserver) { alert("Content script already streaming"); return; }
    // Load in the latest and connect to the document
    const collabDoc = await getCollabDoc(documentId);
    await saveDOM(new PragueMapWrapperFactory(collabDoc), useFlatMap, stream);
    if (stream) {
        collabDocToClose = collabDoc;
    } else {
        collabDoc.close();
    }
}

export async function streamDOMToBackgroundPrague(port: chrome.runtime.Port) {
    if (mutationObserver) { alert("Content script already streaming"); return; }
    return saveDOM(new PragueBackgroundMapWrapperFactory(port), true, true);
}

async function saveDOM(mapWrapperFactory: IMapWrapperFactory, useFlatMap: boolean, stream: boolean) {
    const rootViewWrapper = await mapWrapperFactory.getRootMapView();
    const dataMapWrapper = await mapWrapperFactory.createMapView();

    debug("Start sending to Prague");
    const startTime = performance.now();

    dataMapWrapper.set("DATE", new Date().toString());
    dataMapWrapper.set("URL", window.location.href);
    dataMapWrapper.set("DIMENSION", JSON.stringify({ width: window.innerWidth, height: window.innerHeight }));
    dataMapWrapper.set("SCROLLPOS", JSON.stringify([window.scrollX, window.scrollY]));

    if (useFlatMap) {
        let tree: StreamDOMTree | FlatMapDOMTree;
        const domMapViewWrapper = await mapWrapperFactory.createMapView();

        let rootNodeId;
        if (stream) {
            tree = new StreamDOMTree();
        } else {
            tree = new FlatMapDOMTree();
        }
        tree.initializeFromDOM(document);
        tree.setOnMapWrapper(domMapViewWrapper);
        rootNodeId = tree.getRootElement().getNodeId();

        dataMapWrapper.set("DOMFLATMAPNODE", rootNodeId);
        dataMapWrapper.setMapView("DOM", domMapViewWrapper);

        if (debugPragueMap) {
            debugDOM(JSON.stringify(await MapWrapperToObject(domMapViewWrapper)));
        }

        if (stream) {
            startStreamToPrague(tree as StreamDOMTree, dataMapWrapper);
        }
    } else {
        if (stream) {
            throw new Error("Not Implemented");
        }
        const tree = new RewriteDOMTree();
        tree.initializeFromDOM(document);
        dataMapWrapper.setMap("DOM", tree.getMap(mapWrapperFactory));
    }

    rootViewWrapper.setMapView("DOMSTREAM", dataMapWrapper);
    // collabDoc.save();
    debug("Finish sending to Prague - " + (performance.now() - startTime) + "ms");    
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
