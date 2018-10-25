import * as pragueApi from "@prague/client-api";
import * as pragueMap from "@prague/map";
import { PragueStreamDOMTree, PragueStreamWindow } from "./pragueStreamDOMTree";
import { getCollabDoc } from "./pragueUtil";

const allowInteraction = true;

async function loadDataView(rootView: pragueMap.IMapView, collabDoc: pragueApi.Document) {
    const dataMap = rootView.get("DOMSTREAM");
    if (!dataMap) {
        setStatusMessage("Empty");
        return;
    }

    setStatusMessage("Creating DOM");
    const dataMapView = await dataMap.getView();

    setURL(dataMapView);
    setDimension(dataMapView);
    const tree = await setDOM(dataMapView, collabDoc);

    const iframe = document.getElementById("view") as HTMLIFrameElement;
    const w = iframe.contentWindow;
    PragueStreamWindow.loadScrollPos(w, dataMapView);

    const scrollPosField = document.getElementById("SCROLLPOS") as HTMLSpanElement;
    dataMapView.getMap().on("valueChanged", (changed, local, op) => {
        switch (changed.key) {
            case "URL":
                console.error("URL shouldn't change");
                break;
            case "DIMENSION":
                setDimension(dataMapView);
                break;
            case "SCROLLPOS":
                if (!local) {
                    PragueStreamWindow.loadScrollPos(w, dataMapView, scrollPosField);
                }
                break;
            case "DOM":
                console.error("DOM shouldn't change");
                break;
            case "MUTATION":
                tree.FlushPendingMutationEvent();
                break;
        }
    });

    if (allowInteraction) {
        new PragueStreamWindow(iframe.contentWindow, dataMapView, tree, true); // tslint:disable-line
    }
}

async function initFromPrague(documentId: string) {
    setStatusMessage("Loading document " + documentId);
    const collabDoc = await getCollabDoc(documentId);
    const rootView = await collabDoc.getRoot().getView();

    await loadDataView(rootView, collabDoc);

    rootView.getMap().on("valueChanged", (changed, local, op) => {
        if (changed.key === "DOMSTREAM") {
            console.log("Loading new page");
            loadDataView(rootView, collabDoc);
        }
    });
}

function setURL(dataMapView) {
    const urlField = document.getElementById("URL") as HTMLSpanElement;
    urlField.innerHTML = dataMapView.get("URL");
}

function setDimension(dataMapView) {
    const dimension = dataMapView.get("DIMENSION");
    console.log(dimension);
    if (dimension) {
        const dimensionField = document.getElementById("DIMENSION") as HTMLSpanElement;
        dimensionField.innerHTML = dimension.width + " x " + dimension.height;
        const iframe = document.getElementById("view") as HTMLIFrameElement;
        iframe.width = dimension.width;
        iframe.height = dimension.height;
        // Also update the scroll pos after resize.
        PragueStreamWindow.loadScrollPos(iframe.contentWindow, dataMapView);
    }
}

async function setDOM(dataMapView: pragueMap.IMapView, collabDoc: pragueApi.Document) {
    const iframe = document.getElementById("view") as HTMLIFrameElement;
    return await streamDOMFromPrague(dataMapView, collabDoc, iframe.contentDocument);
}

const query = window.location.search.substring(1);
const search = new URLSearchParams(query);
if (search.has("docId")) {
    initFromPrague(search.get("docId")).catch((error) => { console.error(error); });
}

async function streamDOMFromPrague(dataMapView: pragueMap.IMapView, collabDoc: pragueApi.Document, doc: Document) {
    const domMap: pragueMap.IMap = dataMapView.get("DOM");
    if (!domMap) {
        return;
    }
    const domMapView = await domMap.getView();
    if (!dataMapView.has("DOMFLATMAPNODE")) { return; }
    const domRootNode = dataMapView.get("DOMFLATMAPNODE");

    const startTime = performance.now();
    const tree = new PragueStreamDOMTree();
    tree.readFromMap(domMapView, collabDoc, domRootNode, doc);
    document.getElementById("loadtime").innerHTML = (performance.now() - startTime) + "ms";
    return tree;
}

function setStatusMessage(msg) {
    const urlField = document.getElementById("URL") as HTMLSpanElement;
    urlField.innerHTML = msg;
}
