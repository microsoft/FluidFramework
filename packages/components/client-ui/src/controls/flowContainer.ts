/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IInk } from "@microsoft/fluid-ink";
import { ISharedMap } from "@microsoft/fluid-map";
import * as MergeTree from "@microsoft/fluid-merge-tree";
import * as Sequence from "@microsoft/fluid-sequence";
// tslint:disable:ban-types
import * as api from "@prague/client-api";
import { IComponentHandle } from "@prague/component-core-interfaces";
import * as ui from "../ui";
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
    private inkCanvas: InkCanvas;

    private layerCache: { [key: string]: Layer } = {};
    private activeLayers: { [key: string]: IOverlayLayerStatus } = {};

    /**
     * This determines whether to use an OverlayCanvas or InkCanvas for inking.  Currently will always use an overlay
     * canvas, but keeping the other option alive for testing purposes for now.
     */
    private useOverlayCanvas: boolean = true;

    constructor(
        element: HTMLDivElement,
        private collabDocument: api.Document,
        private sharedString: Sequence.SharedString,
        private readonly overlayInkMap: ISharedMap,
        private readonly pageInk: IInk,
        private image: Image,
        private options?: Object) {

        super(element);

        // TODO the below code is becoming controller like and probably doesn't belong in a constructor. Likely
        // a better API model.

        // Title bar at the top
        const titleDiv = document.createElement("div");
        this.title = new Title(titleDiv);
        this.title.setTitle(this.collabDocument.id);
        this.title.setBackgroundColor(this.collabDocument.id);

        // Status bar at the bottom
        const statusDiv = document.createElement("div");
        statusDiv.style.borderTop = "1px solid gray";
        this.status = new Status(statusDiv);

        // FlowView holds the text
        const flowViewDiv = document.createElement("div");
        flowViewDiv.classList.add("flow-view");
        this.flowView = new FlowView(flowViewDiv, this.collabDocument, this.sharedString, this.status, this.options);

        // Layer panel lets us put the canvas on top of the text
        const layerPanelDiv = document.createElement("div");
        this.layerPanel = new LayerPanel(layerPanelDiv);

        // Create the correct inking canvas
        if (this.useOverlayCanvas) {
            // Overlay canvas for ink
            const overlayCanvasDiv = document.createElement("div");
            overlayCanvasDiv.classList.add("overlay-canvas");
            this.overlayCanvas = new OverlayCanvas(this.collabDocument, overlayCanvasDiv, layerPanelDiv);

            this.overlayCanvas.on("ink", (layer: InkLayer, model: IInk, start: ui.IPoint) => {
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
                this.overlayInkMap.set(model.id, model.handle);
                // Inserts the marker at the flow view's cursor position
                this.sharedString.insertMarker(
                    position,
                    MergeTree.ReferenceType.Simple,
                    {
                        [MergeTree.reservedMarkerIdKey]: model.id,
                        [MergeTree.reservedMarkerSimpleTypeKey]: "inkOverlay",
                    });
            });
        } else {
            this.inkCanvas = new InkCanvas(document.createElement("div"), this.pageInk);
            this.inkCanvas.enableInkHitTest(false);
        }

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

        this.status.addOption("inkingEnabled", "ink");
        this.status.on("inkingEnabled", (value) => {
            if (this.useOverlayCanvas) {
                this.overlayCanvas.enableInk(value);
            } else {
                this.inkCanvas.enableInkHitTest(value);
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
        if (this.useOverlayCanvas) {
            this.layerPanel.addChild(this.overlayCanvas);
        } else {
            this.layerPanel.addChild(this.inkCanvas);
        }

        this.dockPanel = new DockPanel(this.element);
        this.addChild(this.dockPanel);

        // Use the dock panel to layout the viewport - layer panel as the content and then status bar at the bottom
        this.dockPanel.addTop(this.title);
        this.dockPanel.addContent(this.layerPanel);
        this.dockPanel.addBottom(this.status);

        // Intelligence image
        this.image.element.style.visibility = "hidden";
        this.addChild(this.image);
        this.element.appendChild(this.image.element);
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

        if (this.activeLayers[id]) {
            this.activeLayers[id].active = true;
        }
        const inkLayerData = await this.overlayInkMap.get<IComponentHandle>(id).get<IInk>();

        if (!(id in this.layerCache)) {
            const layer = new InkLayer(this.size, inkLayerData);
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
