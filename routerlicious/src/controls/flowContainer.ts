import * as api from "../api";
import * as ui from "../ui";
import { IStatus, Status } from "./status";

export class FlowContainer extends ui.Component {
    public status: IStatus;
    public div: HTMLDivElement;
    public statusDiv: HTMLDivElement;

    // TODO should a container just have a set of interfaces that its children can make use of?

    constructor(element: HTMLDivElement) {
        super(element);
        this.createElements();
        this.status = new Status(this.statusDiv, this.div);
    }

    public createElements() {
        this.div = document.createElement("div");
        this.statusDiv = document.createElement("div");
        this.statusDiv.style.borderTop = "1px solid gray";
        document.body.appendChild(this.div);
        document.body.appendChild(this.statusDiv);
    }

    public trackInsights(insights: api.IMap) {
        this.updateInsights(insights);
        insights.on("valueChanged", () => {
            this.updateInsights(insights);
        });
    }

    protected resizeCore(rectangle: ui.Rectangle) {
        let bodBounds = ui.Rectangle.fromClientRect(document.body.getBoundingClientRect());
        let vertSplit = bodBounds.nipVertBottom(22);
        vertSplit[0].conformElement(this.div);
        vertSplit[1].y++; vertSplit[1].height--; // room for 1px border
        vertSplit[1].conformElement(this.statusDiv);
    }

    private async updateInsights(insights: api.IMap) {
        const view = await insights.getView();
        if (view.has("ResumeAnalytics")) {
            const resume = view.get("ResumeAnalytics");
            const probability = parseFloat(resume.resumeAnalyticsResult);
            if (probability !== 1 && probability > 0.7) {
                this.status.overlay(`${Math.round(probability * 100)}% sure I found a resume!`);
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
