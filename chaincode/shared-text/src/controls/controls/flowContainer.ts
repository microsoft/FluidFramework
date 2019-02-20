// tslint:disable:ban-types
import * as api from "@prague/client-api";
import { ISharedMap } from "@prague/map";
import * as SharedString from "@prague/sequence";
import { IStream } from "@prague/stream";
import * as ui from "../ui";
import { debug } from "./debug";
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
    private dockPanel: DockPanel;
    private layerPanel: LayerPanel;

    constructor(
        element: HTMLDivElement,
        private collabDocument: api.Document,
        sharedString: SharedString.SharedString,
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

        // Layer panel lets us put the overlay canvas on top of the text
        const layerPanelDiv = document.createElement("div");
        this.layerPanel = new LayerPanel(layerPanelDiv);

        // Overlay canvas for ink
        const overlayCanvasDiv = document.createElement("div");
        overlayCanvasDiv.classList.add("overlay-canvas");

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

    private async updateInsights(view: ISharedMap) {

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
