import * as api from "../api";
import * as ui from "../ui";
import { DockPanel } from "./dockPanel";
import { Image } from "./image";
import { Status } from "./status";

export class FlowContainer extends ui.Component {
    public status: Status;
    public image: Image;
    private dockPanel: DockPanel;

    constructor(element: HTMLDivElement) {
        super(element);

        this.dockPanel = new DockPanel(element);

        const statusDiv = document.createElement("div");
        statusDiv.style.borderTop = "1px solid gray";
        this.status = new Status(statusDiv);

        this.dockPanel.addBottom(this.status);
    }

    public trackInsights(insights: api.IMap) {
        this.updateInsights(insights);
        insights.on("valueChanged", () => {
            this.updateInsights(insights);
        });
    }

    public addContent(content: ui.Component) {
        this.dockPanel.addContent(content);
    }

    public addOverlay(image: Image) {
        image.element.style.visibility = "hidden";
        this.image = image;
        this.addChild(image);
        document.body.appendChild(image.element);
        this.resizeCore(this.size);
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
}
