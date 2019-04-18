import * as pragueMap from "@prague/map";
import { FrameLoader, IFrameLoaderCallbacks } from "./frameLoader";
import { PragueDocument } from "./pragueUtil";

function setSpanText(spanName, message) {
    (document.getElementById(spanName) as HTMLSpanElement).innerHTML = message;
}

function setStatusMessage(msg) {
    setSpanText("status", msg);
}

const scale = document.getElementById("scale") as HTMLInputElement;

const scrollPosField = document.getElementById("SCROLLPOS") as HTMLSpanElement;
let scaleListener;
class FrameLoaderCallbacks implements IFrameLoaderCallbacks {
    private startTime: number;
    private startLoadTime: Date;
    private mutationCount: number = 0;
    private totalBgMutationLatency: number = 0;
    private maxBgMutationLatency: number = 0;
    private totalMutationLatency: number = 0;
    private maxMutationLatency: number = 0;
    private dataMapView: pragueMap.IMapView;
    public onDOMDataNotFound() {
        setStatusMessage("DOM not found");
        setSpanText("URL", "Empty");
    }
    public onDOMDataFound(startLoadTime: Date, dataMapView: pragueMap.IMapView) {
        this.maxMutationLatency = 0;
        this.totalMutationLatency = 0;
        this.maxBgMutationLatency = 0;
        this.totalBgMutationLatency = 0;
        this.mutationCount = 0;

        this.startLoadTime = startLoadTime;
        this.dataMapView = dataMapView;
        setStatusMessage("Creating DOM");
        setSpanText("config",
            (dataMapView.get("CONFIG_BATCHOPS") ? "Batched " : "") +
            (dataMapView.get("CONFIG_BACKGROUND") ? "Background " : ""));
        setSpanText("inittime", Math.round(dataMapView.get("TIME_INIT")) + " ms");
        setSpanText("signaltime", Math.round(dataMapView.get("TIME_STARTSIGNAL")) + " ms (Nav Only)");
        setSpanText("savetime", Math.round(dataMapView.get("TIME_STARTSAVE")) + " ms");
        setSpanText("readygentime", Math.round(dataMapView.get("TIME_DOCLOAD")) + " ms");
        setSpanText("gentime", Math.round(dataMapView.get("TIME_GEN")) + " ms");

        setSpanText("URL", dataMapView.get("URL"));
        if (scaleListener) {
            scale.removeEventListener("change", scaleListener);
        }
        scaleListener = () => {
            FrameLoader.setDimension(iframe, dataMapView, this);
        };
        scale.addEventListener("change", scaleListener);

        this.startTime = performance.now();
    }

    public onTreeGenerated() {
        setSpanText("domgentime", Math.round(performance.now() - this.startTime) + "ms");
        setStatusMessage("DOM generated");

        if (this.dataMapView.has("END_DATE")) {
            this.setLatency(this.dataMapView, this.startLoadTime);
        } else {
            setSpanText("attachtime", "");
            setSpanText("bgwkrlatency", "");
            setSpanText("latency", "");
        }
    }

    public onValueChanged(key) {
        switch (key) {
            case "DATE":
                setSpanText("latency", Math.round(this.startLoadTime.valueOf() - this.dataMapView.get("DATE"))
                    + " ms (Live only)");
                return true;
            case "END_DATE":
                this.setLatency(this.dataMapView, this.startLoadTime);
                return true;
            case "TIME_ATTACH":
                return true;

            case "MUTATION_DATE":
                const mutationDates = this.dataMapView.get("MUTATION_DATE");
                const bgMutationDate = mutationDates[0];
                const mutationDate = mutationDates[1];
                this.mutationCount++;
                const currentTime = Date.now();
                const bgLatency = mutationDate - bgMutationDate;
                this.maxBgMutationLatency = Math.max(bgLatency, this.maxBgMutationLatency);
                this.totalBgMutationLatency += bgLatency;
                const latency = currentTime - mutationDate;
                this.maxMutationLatency = Math.max(latency, this.maxMutationLatency);
                this.totalMutationLatency += latency;

                const avgBgMutationLtency = Math.round(this.totalBgMutationLatency / this.mutationCount).toFixed(0);
                const avgMutationLatency = Math.round(this.totalMutationLatency / this.mutationCount).toFixed(0);

                setSpanText("mutationLatencyCount", this.mutationCount);
                setSpanText("mutationBgLatencyLast", bgLatency);
                setSpanText("mutationBgLatencyAvg", avgBgMutationLtency);
                setSpanText("mutationBgLatencyMax", this.maxBgMutationLatency);
                setSpanText("mutationLatencyLast", latency);
                setSpanText("mutationLatencyAvg", avgMutationLatency);
                setSpanText("mutationLatencyMax", this.maxMutationLatency);
                return true;
        }
    }

    public getScrollPosField() {
        return scrollPosField;
    }

    public getViewScale() {
        return parseInt(scale.value, 10);
    }

    public onDimensionUpdated(dimension: any, scaleStr: string, boundingRect: any, viewScaleValue: number) {
        const dimensionField = document.getElementById("DIMENSION") as HTMLSpanElement;
        dimensionField.innerHTML = dimension.width + " x " + dimension.height + " " + scaleStr;
        setSpanText("scaleValue",
            viewScaleValue + "% (" + boundingRect.width.toFixed(0) + ", " + boundingRect.height.toFixed(0) + ")");
    }

    private setLatency(dataMapView, startLoadTime) {
        const endTime = dataMapView.get("END_DATE");
        setSpanText("attachtime", Math.round(dataMapView.get("TIME_ATTACH")) + " ms");
        setSpanText("bgwkrlatency", Math.round(endTime[1] - endTime[0]) + " ms");
        const latency = startLoadTime.valueOf() - endTime[1];
        setSpanText("latency", Math.round(latency) + " ms (Live only)");
    }
}

async function initFromPrague(server: string, documentId: string) {
    setStatusMessage("Loading document " + documentId);

    const collabDoc = await PragueDocument.Load(server, documentId);
    const rootView = await collabDoc.getRoot().getView();

    FrameLoader.syncRoot(iframe, rootView, new FrameLoaderCallbacks());
}

const query = window.location.search.substring(1);
const search = new URLSearchParams(query);
const fullView = search.has("full") && search.get("full") === "true";
const debugView = search.has("debug") && search.get("debug") === "true";
const iframe = document.getElementById("view") as HTMLIFrameElement;
let serverInput = "localhost";

if (!fullView) {
    document.getElementById("top").className = "";
    iframe.className = "";
    if (debugView) {
        document.getElementById("side").className = "";
    }
}

if (search.has("server")) {
    serverInput = search.get("server");
}

setSpanText("server", serverInput);

if (search.has("docId")) {
    const docId = search.get("docId");
    document.title += " - " + docId;
    initFromPrague(serverInput, docId).catch((error) => { console.error(error); });
}
