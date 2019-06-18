/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// tslint:disable:ban-types
import * as api from "@prague/client-api";
import { ISharedMap } from "@prague/map";
import * as MergeTree from "@prague/merge-tree";
import * as Sequence from "@prague/sequence";
import { IStream } from "@prague/stream";
import * as ui from "../ui";
import { debug } from "./debug";
import { DockPanel } from "./dockPanel";
import { FlowView, IOverlayMarker } from "./flowView";
import { Image } from "./image";
import { InkCanvas } from "./inkCanvas";
import { LayerPanel } from "./layerPanel";
import { InkLayer, Layer, OverlayCanvas } from "./overlayCanvas";
import { IRange } from "./scrollBar";
import { Status } from "./status";
import { Title } from "./title";

interface IOverlayLayerStatus {
    layer: Layer;
    active: boolean;
    cursorOffset: ui.IPoint;
}

export class FlowContainer extends ui.Component {
    public status: Status;
    public title: Title;
    public flowView: FlowView;
    private dockPanel: DockPanel;
    private layerPanel: LayerPanel;
    private overlayCanvas: OverlayCanvas;

    private layerCache: { [key: string]: Layer } = {};
    private activeLayers: { [key: string]: IOverlayLayerStatus } = {};

    constructor(
        element: HTMLDivElement,
        private collabDocument: api.Document,
        sharedString: Sequence.SharedString,
        private overlayMap: ISharedMap,
        private image: Image,
        ink: IStream,
        private options?: Object) {

        super(element);

        // TODO the below code is becoming controller like and probably doesn't belong in a constructor. Likely
        // a better API model.

        // Title bar at the top
        const titleDiv = document.createElement("div");
        this.title = new Title(titleDiv);
        this.title.setTitle(collabDocument.id);
        this.title.setBackgroundColor(collabDocument.id);

        // Status bar at the bottom
        const statusDiv = document.createElement("div");
        statusDiv.style.borderTop = "1px solid gray";
        this.status = new Status(statusDiv);

        // FlowView holds the text
        const flowViewDiv = document.createElement("div");
        flowViewDiv.classList.add("flow-view");
        this.flowView = new FlowView(flowViewDiv, collabDocument, sharedString, this.status, this.options);

        // Create the optional full ink canvas
        const inkCanvas = ink ? new InkCanvas(document.createElement("div"), ink) : null;
        if (inkCanvas) {
            inkCanvas.enableInkHitTest(false);
        }

        // Layer panel lets us put the overlay canvas on top of the text
        const layerPanelDiv = document.createElement("div");
        this.layerPanel = new LayerPanel(layerPanelDiv);

        // Overlay canvas for ink
        const overlayCanvasDiv = document.createElement("div");
        overlayCanvasDiv.classList.add("overlay-canvas");
        this.overlayCanvas = new OverlayCanvas(collabDocument, overlayCanvasDiv, layerPanelDiv);

        this.overlayCanvas.on("ink", (layer: InkLayer, model: IStream, start: ui.IPoint) => {
            this.overlayCanvas.enableInkHitTest(false);
            const position = this.flowView.getNearestPosition(start);
            this.overlayCanvas.enableInkHitTest(true);

            const location = this.flowView.getPositionLocation(position);
            const cursorOffset = {
                x: start.x - location.x,
                y: start.y - location.y,
            };

            this.layerCache[model.id] = layer;
            this.activeLayers[model.id] = { layer, active: true, cursorOffset };
            overlayMap.set(model.id, model);
            // Inserts the marker at the flow view's cursor position
            sharedString.insertMarker(
                position,
                MergeTree.ReferenceType.Simple,
                {
                    [MergeTree.reservedMarkerIdKey]: model.id,
                    [MergeTree.reservedMarkerSimpleTypeKey]: "inkOverlay",
                });
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
                    this.addLayer(marker);
                }
                this.pruneInactiveLayers();
            });

        this.status.addOption("ink", "ink");
        this.status.on("ink", (value) => {
            this.overlayCanvas.enableInk(value);

            if (inkCanvas) {
                inkCanvas.enableInkHitTest(value);
            }
        });

        const spellOption = "spellchecker";
        const spellcheckOn = (this.options === undefined || this.options[spellOption] !== "disabled") ? true : false;
        this.status.addOption("spellcheck", "spellcheck", spellcheckOn);
        this.status.on("spellcheck", (value) => {
            this.initSpellcheck(value);
        });

        // For now only allow one level deep of branching
        this.status.addButton("Versions", `/sharedText/${this.collabDocument.id}/commits`, false);
        if (!this.collabDocument.parentBranch) {
            this.status.addButton("Branch", `/sharedText/${this.collabDocument.id}/fork`, true);
        }

        // Add children to the panel once we have both
        this.layerPanel.addChild(this.flowView);
        this.layerPanel.addChild(this.overlayCanvas);
        if (inkCanvas) {
            this.layerPanel.addChild(inkCanvas);
        }

        this.dockPanel = new DockPanel(element);
        this.addChild(this.dockPanel);

        // Use the dock panel to layout the viewport - layer panel as the content and then status bar at the bottom
        this.dockPanel.addTop(this.title);
        this.dockPanel.addContent(this.layerPanel);
        this.dockPanel.addBottom(this.status);

        // Intelligence image
        image.element.style.visibility = "hidden";
        this.addChild(image);
        element.appendChild(image.element);
    }

    public setTitleVisibility(visible: boolean) {
        this.title.setVisibility(visible);
    }

    public trackInsights(insights: ISharedMap) {
        this.updateInsights(insights);
        insights.on("valueChanged", () => {
            this.updateInsights(insights);
        });
    }

    protected resizeCore(bounds: ui.Rectangle) {
        bounds.conformElement(this.dockPanel.element);
        this.dockPanel.resize(bounds);

        if (this.image) {
            const overlayRect = bounds.inner4(0.7, 0.05, 0.2, 0.1);
            overlayRect.conformElement(this.image.element);
            this.image.resize(overlayRect);
        }
    }

    private async addLayer(marker: IOverlayMarker) {
        const id = marker.id;
        const position = marker.position;
        const location = this.flowView.getPositionLocation(position);

        // TODO the async nature of this may cause rendering pauses - and in general the layer should already
        // exist. Should just make this a sync call.
        // Mark true prior to the async work
        if (this.activeLayers[id]) {
            this.activeLayers[id].active = true;
        }
        const ink = await this.overlayMap.get(id) as IStream;

        if (!(id in this.layerCache)) {
            const layer = new InkLayer(this.size, ink);
            this.layerCache[id] = layer;
        }

        if (!(id in this.activeLayers)) {
            const layer = this.layerCache[id];
            this.overlayCanvas.addLayer(layer);
            this.activeLayers[id] = {
                active: true,
                cursorOffset: { x: 0, y: 0 },
                layer,
            };
        }

        const activeLayer = this.activeLayers[id];

        // Add in any cursor offset
        location.x += activeLayer.cursorOffset.x;
        location.y += activeLayer.cursorOffset.y;

        // Translate from global to local coordinates
        const bounds = this.flowView.element.getBoundingClientRect();
        const translated = { x: location.x - bounds.left, y: location.y - bounds.top };

        // Update the position unless we're in the process of drawing the layer
        this.activeLayers[id].layer.setPosition(translated);
    }

    private async updateInsights(insights: ISharedMap) {
        if (insights.has("ResumeAnalytics") && this.image) {
            const resume = insights.get("ResumeAnalytics");
            const probability = parseFloat(resume.resumeAnalyticsResult);
            if (probability !== 1 && probability > 0.7) {
                this.image.setMessage(`${Math.round(probability * 100)}% sure I found a resume!`);
                this.image.element.style.visibility = "visible";
            }
        }
        if (insights.has("TextAnalytics")) {
            const analytics = insights.get("TextAnalytics");
            if (analytics) {
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

    private initSpellcheck(value: boolean) {
        if (value) {
            this.flowView.setViewOption({
                spellchecker: "enabled",
            });
        } else {
            this.flowView.setViewOption({
                spellchecker: "disabled",
            });
        }
        this.flowView.render();
    }
}
