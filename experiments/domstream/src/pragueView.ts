import * as pragueApi from "@prague/client-api";
import * as pragueMap from "@prague/map";
import { PragueStreamDOMTree } from "./pragueStreamDOMTree";
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
    setScrollPos(dataMapView);

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
                    setScrollPos(dataMapView);
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

    // Send scroll events
    const iframe = document.getElementById("view") as HTMLIFrameElement;
    const w = iframe.contentWindow;
    const scroll = () => {
        if (!allowInteraction) { w.removeEventListener("scroll", scroll); }
        const pos = { x: w.scrollX, y: w.scrollY };
        console.log("Update scrollpos: " + pos);
        dataMapView.set("SCROLLPOS", pos);
    };
    w.addEventListener("scroll", scroll);

    w.addEventListener("click", (ev: MouseEvent) => {
        const id = tree.getNodeId(ev.target as Node);
        console.log("Send click to node id: " + id, ev.target);
        dataMapView.set("REMOTECLICK", id);
    });
}

async function initFromPrague(documentId: string) {
    setStatusMessage("Loading document " + documentId);
    const collabDoc = await getCollabDoc(documentId);
    const rootView = await collabDoc.getRoot().getView();

    await loadDataView(rootView, collabDoc);

    rootView.getMap().on("valueChanged", (changed, local, op) => {
        if (changed.key === "DOMSTREAM") {
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
    }
    // Also update the scroll pos after resize.
    setScrollPos(dataMapView);
}

function setScrollPos(dataMapView) {
    const scrollPos = dataMapView.get("SCROLLPOS");
    console.log(scrollPos);
    if (scrollPos) {
        const scrollPosField = document.getElementById("SCROLLPOS") as HTMLSpanElement;
        scrollPosField.innerHTML = scrollPos.x + ", " + scrollPos.y;

        const iframe = document.getElementById("view") as HTMLIFrameElement;
        iframe.contentWindow.scrollTo(scrollPos.x, scrollPos.y);
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

    const tree = new PragueStreamDOMTree();
    tree.readFromMap(domMapView, collabDoc, domRootNode, doc);
    return tree;
}

function setStatusMessage(msg) {
    const urlField = document.getElementById("URL") as HTMLSpanElement;
    urlField.innerHTML = msg;
}
