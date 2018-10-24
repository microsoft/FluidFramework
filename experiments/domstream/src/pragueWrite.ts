import { IMapViewWrapper, IMapWrapperFactory } from "./mapWrapper";
import { PragueFlatMapDOMTree } from "./pragueFlatMapDOMTree";
import { PragueMapViewWrapper, PragueMapWrapperFactory } from "./pragueMapWrapper";
import { PragueStreamDOMTree, PragueStreamWindow } from "./pragueStreamDOMTree";
import { getCollabDoc } from "./pragueUtil";
import { RewriteDOMTree } from "./rewriteDOMTree";

const debugPragueMap = false;
function MapWrapperToObject(mapView: IMapViewWrapper): object {
    const obj: any = {};
    mapView.forEach((value, key) => {
        obj[key] = value;
    });
    return obj;
}

async function saveDOMToMap(dataMapWrapper: IMapViewWrapper, mapWrapperFactory: IMapWrapperFactory,
                            useFlatMap: boolean, stream: boolean) {

    dataMapWrapper.set("DATE", new Date().toString());
    dataMapWrapper.set("URL", window.location.href);
    dataMapWrapper.set("DIMENSION", JSON.stringify({ width: window.innerWidth, height: window.innerHeight }));
    dataMapWrapper.set("SCROLLPOS", JSON.stringify([window.scrollX, window.scrollY]));

    if (useFlatMap) {
        let tree: PragueStreamDOMTree | PragueFlatMapDOMTree;
        const domMapViewWrapper = await mapWrapperFactory.createMapView();

        let rootNodeId;
        if (stream) {
            tree = new PragueStreamDOMTree();
        } else {
            tree = new PragueFlatMapDOMTree();
        }
        tree.initializeFromDOM(document);
        tree.setOnMapWrapper(domMapViewWrapper);
        rootNodeId = tree.getRootElement().getNodeId();

        dataMapWrapper.set("DOMFLATMAPNODE", rootNodeId);
        dataMapWrapper.setMapView("DOM", domMapViewWrapper);

        if (debugPragueMap) {
            console.log(JSON.stringify(MapWrapperToObject(domMapViewWrapper)));
        }

        if (stream) {
            startStreamToPrague(tree as PragueStreamDOMTree, dataMapWrapper);
        }
    } else {
        if (stream) {
            throw new Error("Not Implemented");
        }
        const tree = new RewriteDOMTree();
        tree.initializeFromDOM(document);
        dataMapWrapper.setMap("DOM", tree.getMap(mapWrapperFactory));
    }
}

export async function saveDOMToPrague(documentId: string, useFlatMap: boolean, stream: boolean) {
    if (mutationObserver) { alert("Content script already streaming"); return; }
    // Load in the latest and connect to the document
    const collabDoc = await getCollabDoc(documentId);

    const rootView = await collabDoc.getRoot().getView();
    const dataMap = collabDoc.createMap();
    const dataMapView = await dataMap.getView();
    const dataMapWrapper = new PragueMapViewWrapper(dataMapView);

    const startTime = performance.now();

    await saveDOMToMap(dataMapWrapper, new PragueMapWrapperFactory(collabDoc), useFlatMap, stream);

    rootView.set("DOMSTREAM", dataMap);
    collabDoc.save();
    console.log("Finish sending to Prague - " + (performance.now() - startTime) + "ms");
}

let mutationObserver: MutationObserver;
let streamWindow: PragueStreamWindow;
function startStreamToPrague(tree: PragueStreamDOMTree, dataMapView: IMapViewWrapper) {
    stopStreamToPrague();
    let mutation = 0;
    mutationObserver = tree.startStream(document, () => {
        dataMapView.set("MUTATION", mutation++);
    });

    streamWindow = new PragueStreamWindow(window, dataMapView, tree, false);

    // Receive scroll and click events
    dataMapView.onNonLocalValueChanged((key, value) => {
        if (key === "SCROLLPOS") {
            PragueStreamWindow.loadScrollPos(window, value);
        } else if (key === "REMOTECLICK") {
            const nodeId = value;
            const n = tree.getNodeFromId(nodeId);

            if (n) {
                console.log("Dispatching click to node Id: " + nodeId, n);
                n.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
            } else {
                console.log("Click to node Id not found: " + nodeId);
            }
        }
    });
}

export function stopStreamToPrague() {
    if (mutationObserver) {
        console.log("Stop streaming");
        mutationObserver.disconnect();
        mutationObserver = null;
        streamWindow.disableSync();
        streamWindow = null;
    }
}
