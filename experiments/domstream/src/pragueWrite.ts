import * as pragueMap from "@prague/map";
import { PragueFlatMapDOMTree } from "./pragueFlatMapDOMTree";
import { PragueStreamDOMTree, PragueStreamWindow } from "./pragueStreamDOMTree";
import { getCollabDoc } from "./pragueUtil";
import { RewriteDOMTree } from "./rewriteDOMTree";

const debugPragueMap = false;
function PragueMapToObject(mapView: pragueMap.IMapView): object {
    const obj: any = {};
    mapView.forEach((value, key) => {
        obj[key] = value;
    });
    return obj;
}

export async function saveDOMToPrague(documentId: string, useFlatMap: boolean, stream: boolean) {
    if (mutationObserver) { alert("Content script already streaming"); return; }
    // Load in the latest and connect to the document
    const collabDoc = await getCollabDoc(documentId);

    const rootView = await collabDoc.getRoot().getView();
    const dataMap = collabDoc.createMap();
    const dataMapView = await dataMap.getView();
    rootView.set("FORCEATTACH", dataMap);

    const startTime = performance.now();
    dataMapView.set("DATE", new Date());
    dataMapView.set("URL", window.location.href);
    dataMapView.set("DIMENSION", { width: window.innerWidth, height: window.innerHeight });
    dataMapView.set("SCROLLPOS", JSON.stringify([ window.scrollX, window.scrollY]));

    let tree;
    if (useFlatMap) {

        const domMap = collabDoc.createMap();
        const domMapView = await domMap.getView();

        // dataMapView.set("DOMFORCEATTACH", domMap); // TODO: Work around the message too large problem

        let rootNodeId;
        if (stream) {
            tree = new PragueStreamDOMTree();
        } else {
            tree = new PragueFlatMapDOMTree();
        }
        tree.initializeFromDocument(document);
        tree.setOnPragueFlatMap(domMapView, collabDoc);
        rootNodeId = tree.getRootElement().getNodeId();

        dataMapView.set("DOMFLATMAPNODE", rootNodeId);
        dataMapView.set("DOM", domMap);

        // dataMapView.delete("DOMFORCEATTACH");  // TODO: Work around the message too large problem

        if (debugPragueMap) {
            console.log(JSON.stringify(PragueMapToObject(domMapView)));
        }
    } else {
        if (stream) {
            throw new Error("Not Implemented");
        }
        tree = new RewriteDOMTree();
        tree.initializeFromDocument(document);
        dataMapView.set("DOM", tree.getPragueMap(collabDoc));
    }
    rootView.set("DOMSTREAM", dataMap);
    rootView.delete("FORCEATTACH");
    collabDoc.save();
    console.log("Finish writing to Prague - " + (performance.now() - startTime) + "ms");

    if (stream) {
        startStreamToPrague(tree as PragueStreamDOMTree, dataMapView);
    }
}

let mutationObserver: MutationObserver;
let streamWindow: PragueStreamWindow;
function startStreamToPrague(tree: PragueStreamDOMTree, dataMapView: pragueMap.IMapView) {
    stopStreamToPrague();
    let mutation = 0;
    mutationObserver = tree.startStream(document, () => {
        dataMapView.set("MUTATION", mutation++);
    });

    streamWindow = new PragueStreamWindow(window, dataMapView, tree, false);

    // Receive scroll and click events
    dataMapView.getMap().on("valueChanged", (changed, local, op) => {
        if (local) { return; }
        if (changed.key === "SCROLLPOS") {
            PragueStreamWindow.loadScrollPos(window, dataMapView);
        } else if (changed.key === "REMOTECLICK") {
            const nodeId = dataMapView.get("REMOTECLICK");
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
