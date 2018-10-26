import * as pragueApi from "@prague/client-api";
import * as pragueMap from "@prague/map";
import { debug, debugDOM } from "./debug";
import { PragueMapViewWrapper } from "./pragueMapWrapper";
import { getCollabDoc } from "./pragueUtil";
import { StreamDOMTree, StreamWindow } from "./streamDOMTree";

const allowInteraction = true;

function setSpanText(spanName, message) {
    (document.getElementById(spanName) as HTMLSpanElement).innerHTML = message;
}

function setStatusMessage(msg) {
    setSpanText("status", msg);
}

async function loadDataView(rootView: pragueMap.IMapView, collabDoc: pragueApi.Document) {
    const dataMap = rootView.get("DOMSTREAM");
    if (!dataMap) {
        setStatusMessage("DOM not found");
        return;
    }

    const startLoadTime = new Date();
    setStatusMessage("Creating DOM");
    const dataMapView = await dataMap.getView();
    setSpanText("inittime", Math.round(dataMapView.get("TIME_INIT")) + " ms");
    setSpanText("signaltime", Math.round(dataMapView.get("TIME_STARTSIGNAL")) + " ms (Nav Only)");
    setSpanText("docloadtime", Math.round(dataMapView.get("TIME_DOCLOAD")) + " ms");
    setSpanText("gentime", Math.round(dataMapView.get("TIME_GEN")) + " ms");

    setSpanText("URL", dataMapView.get("URL"));
    setDimension(dataMapView);
    const tree = await setDOM(dataMapView);

    if (dataMapView.has("TIME_ATTACH")) {
        setSpanText("attachtime", Math.round(dataMapView.get("TIME_ATTACH")) + " ms");
    } else {
        setSpanText("attachtime", "");
    }

    if (dataMapView.has("DATE")) {
        setSpanText("latency", Math.round(startLoadTime.valueOf() - dataMapView.get("DATE")) + " ms (Live only)");
    } else {
        setSpanText("latency", "");
    }

    const iframe = document.getElementById("view") as HTMLIFrameElement;
    const w = iframe.contentWindow;
    const scrollPosField = document.getElementById("SCROLLPOS") as HTMLSpanElement;
    StreamWindow.loadScrollPos(w, dataMapView.get("SCROLLPOS"), scrollPosField);

    dataMapView.getMap().on("valueChanged", (changed, local, op) => {
        switch (changed.key) {
            case "DIMENSION":
                setDimension(dataMapView);
                break;
            case "SCROLLPOS":
                if (!local) {
                    StreamWindow.loadScrollPos(w, dataMapView.get("SCROLLPOS"), scrollPosField);
                }
                break;
            case "MUTATION":
                tree.FlushPendingMutationEvent();
                break;
            case "DATE":
                setSpanText("latency", Math.round(startLoadTime.valueOf() - dataMapView.get("DATE"))
                    + " ms (Live only)");
                break;
            case "TIME_ATTACH":
                setSpanText("attachtime", Math.round(dataMapView.get("TIME_ATTACH")) + " ms");
                break;
            case "REMOTECLICK":
                break;
            default:
                console.error(changed.key, "shouldn't change");
                break;
        }
    });

    if (allowInteraction) {
        new StreamWindow(iframe.contentWindow, new PragueMapViewWrapper(dataMapView), tree, true); // tslint:disable-line
    }
}

async function initFromPrague(documentId: string) {
    setStatusMessage("Loading document " + documentId);

    const collabDoc = await getCollabDoc(documentId);
    const rootView = await collabDoc.getRoot().getView();

    rootView.getMap().on("valueChanged", (changed, local, op) => {
        if (changed.key === "DOMSTREAM") {
            debug("Loading new page");
            loadDataView(rootView, collabDoc);
        }
    });

    await loadDataView(rootView, collabDoc);
}

function setDimension(dataMapView) {
    const dimension = JSON.parse(dataMapView.get("DIMENSION"));
    debugDOM(dimension);
    if (dimension) {
        const dimensionField = document.getElementById("DIMENSION") as HTMLSpanElement;
        dimensionField.innerHTML = dimension.width + " x " + dimension.height;
        const iframe = document.getElementById("view") as HTMLIFrameElement;
        iframe.width = dimension.width;
        iframe.height = dimension.height;
        // Also update the scroll pos after resize.
        StreamWindow.loadScrollPos(iframe.contentWindow, dataMapView.get("SCROLLPOS"));
    }
}

async function setDOM(dataMapView: pragueMap.IMapView) {
    const iframe = document.getElementById("view") as HTMLIFrameElement;
    return await streamDOMFromPrague(dataMapView, iframe.contentDocument);
}

const query = window.location.search.substring(1);
const search = new URLSearchParams(query);
if (search.has("docId")) {
    initFromPrague(search.get("docId")).catch((error) => { console.error(error); });
}

async function streamDOMFromPrague(dataMapView: pragueMap.IMapView, doc: Document) {
    const domMap: pragueMap.IMap = dataMapView.get("DOM");
    if (!domMap) {
        return;
    }
    const domMapView = await domMap.getView();
    if (!dataMapView.has("DOMFLATMAPNODE")) { return; }
    const domRootNode = dataMapView.get("DOMFLATMAPNODE");

    const startTime = performance.now();
    const tree = new StreamDOMTree();
    await tree.readFromMap(new PragueMapViewWrapper(domMapView), domRootNode, doc);
    setSpanText("domgentime", Math.round(performance.now() - startTime) + "ms");
    setStatusMessage("DOM generated");
    return tree;
}
