import * as ui from "../ui";
import { Status } from "./status";

export class FlowContainer implements ui.IComponentContainer {
    public onresize: () => void;
    public onkeydown: (e: KeyboardEvent) => void;
    public onkeypress: (e: KeyboardEvent) => void;
    public status: ui.IStatus;
    public div: HTMLDivElement;
    public statusDiv: HTMLDivElement;

    // TODO should a container just have a set of interfaces that its children can make use of?

    constructor() {
        this.createElements();
        this.updateGeometry();
        this.status = new Status(this.statusDiv, this.div);

        // TODO should we send this message down to all children?

        window.addEventListener("resize", () => {
            this.updateGeometry();
            if (this.onresize) {
                this.onresize();
                if (this.status) {
                    this.status.onresize();
                }
            }
        });

        // TODO same with the below events?

        document.body.onkeydown = (e) => {
            // TODO: filter by target
            if (this.onkeydown) {
                this.onkeydown(e);
            }
        };
        document.body.onkeypress = (e) => {
            // TODO: filter by target
            if (this.onkeypress) {
                this.onkeypress(e);
            }
        };
    }

    public createElements() {
        this.div = document.createElement("div");
        this.statusDiv = document.createElement("div");
        this.statusDiv.style.borderTop = "1px solid gray";
        document.body.appendChild(this.div);
        document.body.appendChild(this.statusDiv);
    }

    public updateGeometry() {
        let bodBounds = ui.Rectangle.fromClientRect(document.body.getBoundingClientRect());
        let vertSplit = bodBounds.nipVertBottom(22);
        vertSplit[0].conformElement(this.div);
        vertSplit[1].y++; vertSplit[1].height--; // room for 1px border
        vertSplit[1].conformElement(this.statusDiv);
    }
}
