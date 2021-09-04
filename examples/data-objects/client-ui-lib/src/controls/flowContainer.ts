/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as api from "@fluid-internal/client-api";
import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { ISharedMap } from "@fluidframework/map";
import { IFluidDataStoreContext } from "@fluidframework/runtime-definitions";
import * as Sequence from "@fluidframework/sequence";
import * as ui from "../ui";
import { DockPanel } from "./dockPanel";
import { FlowView, IOverlayMarker } from "./flowView";
import { Image } from "./image";
import { LayerPanel } from "./layerPanel";
import { IRange } from "./scrollBar";
import { Status } from "./status";
import { Title } from "./title";

export class FlowContainer extends ui.Component {
    public status: Status;
    public title: Title;
    public flowView: FlowView;
    private readonly dockPanel: DockPanel;
    private readonly layerPanel: LayerPanel;

    // api.Document should not be used. It should be removed after #2915 is fixed.
    constructor(
        element: HTMLDivElement,
        title: string,
        private readonly clientApiDocument: api.Document,
        private readonly runtime: IFluidDataStoreRuntime,
        private readonly context: IFluidDataStoreContext,
        private readonly sharedString: Sequence.SharedString,
        private readonly image: Image,
        private readonly options?: Record<string, any>) {
        super(element);

        // TODO the below code is becoming controller like and probably doesn't belong in a constructor. Likely
        // a better API model.

        // Title bar at the top
        const titleDiv = document.createElement("div");
        titleDiv.id = "title-bar";
        this.title = new Title(titleDiv);
        this.title.setTitle(title);
        this.title.setBackgroundColor(title);

        // Status bar at the bottom
        const statusDiv = document.createElement("div");
        statusDiv.style.borderTop = "1px solid gray";
        this.status = new Status(statusDiv);

        // FlowView holds the text
        const flowViewDiv = document.createElement("div");
        flowViewDiv.classList.add("flow-view");
        this.flowView = new FlowView(
            flowViewDiv,
            this.clientApiDocument,
            this.runtime,
            this.context,
            this.sharedString,
            this.status,
            this.options,
        );

        // Layer panel lets us put the canvas on top of the text
        const layerPanelDiv = document.createElement("div");
        layerPanelDiv.id = "layer-panel";
        this.layerPanel = new LayerPanel(layerPanelDiv);

        // Update the scroll bar
        this.flowView.on(
            "render",
            (renderInfo: {
                overlayMarkers: IOverlayMarker[];
                range: IRange;
                viewportEndPos: number;
                viewportStartPos: number;
            }) => {
                const showScrollBar = renderInfo.range.min !== renderInfo.viewportStartPos ||
                    renderInfo.range.max !== renderInfo.viewportEndPos;
                this.layerPanel.showScrollBar(showScrollBar);

                this.layerPanel.scrollBar.setRange(renderInfo.range);
            });

        const spellOption = "spellchecker";
        const spellcheckOn = (this.options === undefined || this.options[spellOption] !== "disabled") ? true : false;
        this.status.addOption("spellcheck", "spellcheck", spellcheckOn);
        this.status.on("spellcheck", (value) => {
            this.initSpellcheck(value);
        });

        // Add flowView to the panel
        this.layerPanel.addChild(this.flowView);

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
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.updateInsights(insights);
        insights.on("valueChanged", () => {
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
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
