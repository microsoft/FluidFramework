import * as api from "../api";
import * as ink from "../ink";
import { MarkerBehaviors, reservedMarkerIdKey, SharedString } from "../merge-tree";
import * as ui from "../ui";
import { debug } from "./debug";
import { DockPanel } from "./dockPanel";
import { FlowView, IOverlayMarker } from "./flowView";
import { Image } from "./image";
import { LayerPanel } from "./layerPanel";
import { InkLayer, Layer, OverlayCanvas } from "./overlayCanvas";
import { IRange } from "./scrollBar";
import { Status } from "./status";

interface IOverlayLayerStatus {
    layer: Layer;
    active: boolean;
}

export class FlowContainer extends ui.Component {
    public status: Status;
    public flowView: FlowView;
    private dockPanel: DockPanel;
    private layerPanel: LayerPanel;
    private overlayCanvas: OverlayCanvas;

    private layerCache: { [key: string]: Layer } = {};
    private activeLayers: {[key: string]: IOverlayLayerStatus } = {};

    constructor(
        element: HTMLDivElement,
        collabDocument: api.Document,
        sharedString: SharedString,
        private overlayMap: api.IMap,
        private image: Image) {

        super(element);

        // TODO the below code is becoming controller like and probably doesn't belong in a constructor. Likely
        // a better API model.

        // Status bar at the bottom
        const statusDiv = document.createElement("div");
        statusDiv.style.borderTop = "1px solid gray";
        this.status = new Status(statusDiv);

        // FlowView holds the text
        const flowViewDiv = document.createElement("div");
        flowViewDiv.classList.add("flow-view");
        this.flowView = new FlowView(flowViewDiv, sharedString, this.status);

        // Layer panel lets us put the overlay canvas on top of the text
        const layerPanelDiv = document.createElement("div");
        this.layerPanel = new LayerPanel(layerPanelDiv);

        // Overlay canvas for ink
        const overlayCanvasDiv = document.createElement("div");
        overlayCanvasDiv.classList.add("overlay-canvas");
        this.overlayCanvas = new OverlayCanvas(collabDocument, overlayCanvasDiv, layerPanelDiv);

        this.overlayCanvas.on("ink", (layer: InkLayer, model: ink.IInk, event: PointerEvent) =>  {
            debug("Just saw a new ink layer!");
            this.layerCache[model.id] = layer;
            this.activeLayers[model.id] = { layer, active: true };
            overlayMap.set(model.id, model);
            // Inserts the marker at the flow view's cursor position
            sharedString.insertMarker(
                this.flowView.cursor.pos, MarkerBehaviors.None,
                { [reservedMarkerIdKey]: model.id });
        });

        this.status.on("dry", (value) => {
            debug("Drying a layer");
        });

        // Update the scroll bar
        this.flowView.on(
            "render",
            (renderInfo: {
                overlayMarkers: IOverlayMarker[],
                range: IRange,
                viewportEndPos: number,
                viewportStartPos: number,
            }) => {
                const showScrollBar = renderInfo.range.min !== renderInfo.viewportStartPos ||
                    renderInfo.range.max !== renderInfo.viewportEndPos;
                this.layerPanel.showScrollBar(showScrollBar);

                this.layerPanel.scrollBar.setRange(renderInfo.range);

                this.markLayersInactive();
                for (const marker of renderInfo.overlayMarkers) {
                    this.addLayer(marker.id);
                }
                this.pruneInactiveLayers();
            });

        this.status.addOption("ink", "ink");
        this.status.on("ink", (value) => {
            this.overlayCanvas.enableInk(value);
        });

        // Add children to the panel once we have both
        this.layerPanel.addChild(this.flowView);
        this.layerPanel.addChild(this.overlayCanvas);

        this.dockPanel = new DockPanel(element);
        this.addChild(this.dockPanel);

        // Use the dock panel to layout the viewport - layer panel as the content and then status bar at the bottom
        this.dockPanel.addContent(this.layerPanel);
        this.dockPanel.addBottom(this.status);

        // Intelligence image
        image.element.style.visibility = "hidden";
        this.addChild(image);
        element.appendChild(image.element);
    }

    public trackInsights(insights: api.IMap) {
        this.updateInsights(insights);
        insights.on("valueChanged", () => {
            this.updateInsights(insights);
        });
    }

    protected resizeCore(bounds: ui.Rectangle) {
        bounds.conformElement(this.dockPanel.element);
        this.dockPanel.resize(bounds);

        if (this.image) {
            let overlayRect = bounds.inner4(0.7, 0.05, 0.2, 0.1);
            overlayRect.conformElement(this.image.element);
            this.image.resize(overlayRect);
        }
    }

    private async addLayer(id: string) {
        const ink = await this.overlayMap.get(id) as ink.IInk;
        if (!(id in this.layerCache)) {
            const layer = new InkLayer(this.size, ink);
            this.layerCache[id] = layer;
        }

        if (!(id in this.activeLayers)) {
            const layer = this.layerCache[id];
            this.overlayCanvas.addLayer(layer);
            this.activeLayers[id] = {
                active: true,
                layer,
            };
        }

        this.activeLayers[id].active = true;
    }

    private async updateInsights(insights: api.IMap) {
        const view = await insights.getView();

        if (view.has("ResumeAnalytics") && this.image) {
            const resume = view.get("ResumeAnalytics");
            const probability = parseFloat(resume.resumeAnalyticsResult);
            if (probability !== 1 && probability > 0.7) {
                this.image.setMessage(`${Math.round(probability * 100)}% sure I found a resume!`);
                this.image.element.style.visibility = "visible";
            }
        }
        if (view.has("TextAnalytics")) {
            const analytics = view.get("TextAnalytics");
            if (analytics.language) {
                this.status.add("li", analytics.language);
            }
            if (analytics.sentiment) {
                const sentimentEmoji = analytics.sentiment > 0.7
                    ? "🙂"
                    : analytics.sentiment < 0.3 ? "🙁" : "😐";
                this.status.add("si", sentimentEmoji);
            }
        }
    }

    private markLayersInactive() {
        // tslint:disable-next-line:forin
        for (const layer in this.activeLayers) {
            this.activeLayers[layer].active = false;
        }
    }

    private pruneInactiveLayers() {
        // tslint:disable-next-line:forin
        for (const layerId in this.activeLayers) {
            if (!this.activeLayers[layerId].active) {
                const layer = this.activeLayers[layerId];
                delete this.activeLayers[layerId];
                this.overlayCanvas.removeLayer(layer.layer);
            }
        }
    }
}
