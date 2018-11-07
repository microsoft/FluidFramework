import * as pragueMap from "@prague/map";
import { debug, debugDOM, debugFrame } from "./debug";
import { PragueMapViewWrapper } from "./pragueMapWrapper";
import { getCollabDoc } from "./pragueUtil";
import { IFrameLoader, StreamDOMTreeClient, StreamWindowClient } from "./streamDOMTreeClient";

type FrameRecord = { frame: HTMLIFrameElement, loadingFrame: Promise<StreamWindowClient> }; // tslint:disable-line

class FrameLoader implements IFrameLoader {
    // TODO: How to clean this map?
    private frameStreamWindowMap = new Map<string, FrameRecord>();
    private frameToNameMap = new WeakMap<HTMLIFrameElement, string>();
    private frameDataContainer: pragueMap.IMapView;

    constructor(frameDataContainer: pragueMap.IMapView) {
        this.frameDataContainer = frameDataContainer;
    }

    public loadFrame(frame: HTMLIFrameElement, frameId: number) {
        const dataName = "DOMSTREAM_" + frameId;
        this.frameStreamWindowMap.set(dataName, { frame, loadingFrame: this.loadFrameData(dataName, frame) });
        this.frameToNameMap.set(frame, dataName);
    }
    public reloadFrame(frame: HTMLIFrameElement, frameId: number) {
        const oldName = this.frameToNameMap.get(frame);
        if (oldName) {
            const data = this.frameStreamWindowMap.get(oldName);
            if (data) {
                // iframe navigated, load new data.
                data.loadingFrame.then((streamWindow) => {
                    if (streamWindow) {
                        streamWindow.stopSync();
                    }
                    this.loadFrame(frame, frameId);
                });
                return;
            }
        }
        this.loadFrame(frame, frameId);
    }
    public reloadFrameWithDataName(dataName: string) {
        debugFrame(-1, "Reloading frame data", dataName);
        const data = this.frameStreamWindowMap.get(dataName);
        if (data) {
            // iframe navigated, load new data.
            data.loadingFrame.then((streamWindow) => {
                if (streamWindow) {
                    streamWindow.stopSync();
                }
                this.loadFrameData(dataName, data.frame);
            });

            return true;
        }
        return false;
    }

    public async streamDOMFromPrague(dataMapView: pragueMap.IMapView, doc: Document) {
        const domMap: pragueMap.IMap = dataMapView.get("DOM");
        if (!domMap) {
            return;
        }
        const domMapView = await domMap.getView();
        if (!dataMapView.has("DOMFLATMAPNODE")) { return; }
        const domRootNode = dataMapView.get("DOMFLATMAPNODE");

        const tree = new StreamDOMTreeClient(this);
        await tree.readFromMap(new PragueMapViewWrapper(domMapView), domRootNode, doc);
        return tree;
    }

    public stopSync() {
        for (const item of this.frameStreamWindowMap) {
            item[1].loadingFrame.then((streamWindow) => {
                if (streamWindow) {
                    streamWindow.stopSync();
                }
            });
        }
        this.frameStreamWindowMap = null;
        this.frameToNameMap = null;
    }
    private async loadFrameData(dataName: string, frame: HTMLIFrameElement) {
        const frameDataMap = this.frameDataContainer.get(dataName);
        if (frameDataMap) {
            const subDataMapView = await frameDataMap.getView();
            const subtree = await this.streamDOMFromPrague(subDataMapView, frame.contentDocument);
            if (subtree) {
                const mapViewWrapper = new PragueMapViewWrapper(subDataMapView);
                return new StreamWindowClient(frame.contentWindow, mapViewWrapper, subtree);
            }
        }
    }
}

function setSpanText(spanName, message) {
    (document.getElementById(spanName) as HTMLSpanElement).innerHTML = message;
}

function setStatusMessage(msg) {
    setSpanText("status", msg);
}

function setLatency(dataMapView, startLoadTime) {
    const endTime = dataMapView.get("END_DATE");
    setSpanText("attachtime", Math.round(dataMapView.get("TIME_ATTACH")) + " ms");
    setSpanText("bgwkrlatency", Math.round(endTime - dataMapView.get("FG_END_DATE")) + " ms");
    setSpanText("latency", Math.round(startLoadTime.valueOf() - endTime) + " ms (Live only)");
}
const scale = document.getElementById("scale") as HTMLInputElement;

const scrollPosField = document.getElementById("SCROLLPOS") as HTMLSpanElement;
function setDimension(dataMapView) {
    const dimension = JSON.parse(dataMapView.get("DIMENSION"));
    debugDOM(dimension);
    const scaleValue = parseInt(scale.value, 10);
    if (dimension) {
        const dimensionField = document.getElementById("DIMENSION") as HTMLSpanElement;
        iframe.width = dimension.width;
        iframe.height = dimension.height;

        const scaleStr = dimension.devicePixelRatio === 1 ? "" :
            " scale(" + (dimension.devicePixelRatio * 100).toFixed(0) + ")";

        if (dimension.devicePixelRatio === 1 && scaleValue === 100) {
            iframe.style.transform = "";
            iframe.style.transformOrigin = "";
        } else {
            iframe.style.transform = "scale(" + (scaleValue / 100 * dimension.devicePixelRatio) + ")";
            iframe.style.transformOrigin = "top left";
        }

        dimensionField.innerHTML = dimension.width + " x " + dimension.height + " " + scaleStr;

        // Also update the scroll pos after resize.
        StreamWindowClient.loadScrollPos(iframe.contentWindow, dataMapView.get("SCROLLPOS"), scrollPosField);
    }

    const boundingRect = iframe.getBoundingClientRect();
    setSpanText("scaleValue", scaleValue + "% (" + boundingRect.width + ", " + boundingRect.height + ")");
}

type LoadResult = { // tslint:disable-line
    readonly frameLoader: FrameLoader;
    readonly streamWindowReceiver: StreamWindowClient;
};

let scaleListener;
async function loadDataView(rootView: pragueMap.IMapView, dataName: string): Promise<LoadResult> {
    const dataMap = rootView.get(dataName);
    if (!dataMap) {
        setStatusMessage("DOM not found");
        setSpanText("URL", "Empty");
        return;
    }

    const startLoadTime = new Date();
    setStatusMessage("Creating DOM");
    const dataMapView = await dataMap.getView();
    setSpanText("config",
        (dataMapView.get("CONFIG_BATCHOP") ? "Batched " : "") +
        (dataMapView.get("CONFIG_BACKGROUND") ? "Background " : ""));
    setSpanText("inittime", Math.round(dataMapView.get("TIME_INIT")) + " ms");
    setSpanText("signaltime", Math.round(dataMapView.get("TIME_STARTSIGNAL")) + " ms (Nav Only)");
    setSpanText("savetime", Math.round(dataMapView.get("TIME_STARTSAVE")) + " ms");
    setSpanText("docloadtime", Math.round(dataMapView.get("TIME_DOCLOAD")) + " ms");
    setSpanText("gentime", Math.round(dataMapView.get("TIME_GEN")) + " ms");

    setSpanText("URL", dataMapView.get("URL"));
    setDimension(dataMapView);

    if (scaleListener) {
        scale.removeEventListener("change", scaleListener);
    }
    scaleListener = () => {
        setDimension(dataMapView);
    };
    scale.addEventListener("change", scaleListener);

    const startTime = performance.now();
    const frameLoader = new FrameLoader(dataMapView);
    const tree = await frameLoader.streamDOMFromPrague(dataMapView, iframe.contentDocument);
    if (tree) {
        setSpanText("domgentime", Math.round(performance.now() - startTime) + "ms");
        setStatusMessage("DOM generated");
    }

    if (dataMapView.has("END_DATE")) {
        setLatency(dataMapView, startLoadTime);
    } else {
        setSpanText("attachtime", "");
        setSpanText("bgwkrlatency", "");
        setSpanText("latency", "");
    }

    const w = iframe.contentWindow;

    StreamWindowClient.loadScrollPos(w, dataMapView.get("SCROLLPOS"), scrollPosField);

    dataMapView.getMap().on("valueChanged", (changed, local, op) => {
        switch (changed.key) {
            case "DIMENSION":
                setDimension(dataMapView);
                break;
            case "DATE":
                setSpanText("latency", Math.round(startLoadTime.valueOf() - dataMapView.get("DATE"))
                    + " ms (Live only)");
                break;
            case "END_DATE":
                setLatency(dataMapView, startLoadTime);
                break;
            case "TIME_ATTACH":
            case "FG_END_DATE":

            // These are dealt with in the StreamWindow
            case "SCROLLPOS":
            case "REMOTECLICK":
            case "MUTATION":
                break;

            default:
                if (!frameLoader.reloadFrameWithDataName(changed.key)) {
                    if (dataMapView.has(changed.key)) {
                        console.error(changed.key, "shouldn't change");
                    }
                }
                break;
        }
    });

    const mapViewWrapper = new PragueMapViewWrapper(dataMapView);
    const streamWindowReceiver = new StreamWindowClient(iframe.contentWindow, mapViewWrapper, tree, scrollPosField);
    return { frameLoader, streamWindowReceiver };
}

async function initFromPrague(documentId: string) {
    setStatusMessage("Loading document " + documentId);

    const collabDoc = await getCollabDoc(documentId);
    const rootView = await collabDoc.getRoot().getView();

    const dataName = "DOMSTREAM";
    let loadResultPromise: Promise<LoadResult>;
    rootView.getMap().on("valueChanged", (changed, local, op) => {
        if (changed.key === dataName) {
            debug("Loading new page");
            loadResultPromise.then((loadResult) => {
                if (loadResult) {
                    loadResult.streamWindowReceiver.stopSync();
                    loadResult.frameLoader.stopSync();
                }
                loadResultPromise = loadDataView(rootView, dataName);
            });
        }
    });

    loadResultPromise = loadDataView(rootView, dataName);
}

const query = window.location.search.substring(1);
const search = new URLSearchParams(query);
const fullView = search.has("full") && search.get("full") === "true";
const debugView = search.has("debug") && search.get("debug") === "true";
const iframe = document.getElementById("view") as HTMLIFrameElement;

if (!fullView) {
    document.getElementById("top").className = "";
    iframe.className = "";
    if (debugView) {
        document.getElementById("side").className = "";
    }
}

if (search.has("docId")) {
    const docId = search.get("docId");
    document.title += " - " + docId;
    initFromPrague(docId).catch((error) => { console.error(error); });
}
