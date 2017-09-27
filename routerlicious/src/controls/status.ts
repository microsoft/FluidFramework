import * as url from "url";
import * as ui from "../ui";

export interface IKeyMsgPair {
    key: string;
    msg: string;
    showKey?: boolean;
}

export interface IStatus {
    add(key: string, msg: string);
    remove(key: string);
    overlay(msg: string);
    removeOverlay();
}

export class Status extends ui.Component implements IStatus {
    public overlayDiv: HTMLDivElement;
    public overlayImageElm: HTMLImageElement;
    public overlayMsgBox: HTMLSpanElement;
    public info: IKeyMsgPair[] = [];
    public overlayInnerRects: ui.Rectangle[];
    public overlayMsg: string;

    constructor(element: HTMLDivElement, public overlayContainer: HTMLElement) {
        super(element);
        this.makeOverlay(overlayContainer);
        this.element.style.backgroundColor = "#F1F1F1";
    }

    public resizeCore(rectangle: ui.Rectangle) {
        this.updateGeometry();
    }

    public add(key: string, msg: string, showKey = false) {
        let i = this.findKV(key);
        if (i < 0) {
            i = this.info.length;
            this.info.push({ key, msg, showKey });
        } else {
            this.info[i].msg = msg;
            this.info[i].showKey = showKey;
        }
        this.renderBar();
    }

    public remove(key: string) {
        let i = this.findKV(key);
        if (i >= 0) {
            this.info.splice(i, 1);
        }
        this.renderBar();
    }

    public renderBar() {
        let buf = "";
        let first = true;
        for (let kv of this.info) {
            buf += "<span>";
            if (!first) {
                if (kv.showKey) {
                    buf += ";  ";
                } else {
                    buf += " ";
                }
            }
            first = false;
            if (kv.showKey) {
                buf += `${kv.key}: ${kv.msg}`;
            } else {
                buf += `${kv.msg}`;
            }
            buf += "<\span>";
        }

        this.element.innerHTML = buf;
    }

    public overlay(msg: string) {
        this.overlayMsg = msg;
        this.overlayMsgBox.innerText = msg;
        if (!this.overlayImageElm) {
            this.overlayImageElm = document.createElement("img");
            this.overlayImageElm.src = url.resolve(document.baseURI, "/public/images/bindy.svg");
            this.overlayImageElm.alt = "Your Buddy!";
            this.overlayDiv.appendChild(this.overlayImageElm);
        }
        this.overlayImageElm.style.height = "auto";
        this.overlayInnerRects[1].conformElement(this.overlayImageElm);
        this.overlayDiv.style.visibility = "visible";
        this.overlayMsgBox.style.height = "auto";
        this.overlayMsgBox.style.padding = "5px";
        this.overlayMsgBox.style.borderRadius = "8px";
        this.overlayMsgBox.style.backgroundColor = "rgba(0, 240, 20, 0.5)";
        this.overlayMsgBox.style.visibility = "visible";
    }

    public removeOverlay() {
        this.overlayMsg = undefined;
        this.overlayDiv.style.visibility = "hidden";
    }

    private findKV(key: string) {
        for (let i = 0, len = this.info.length; i < len; i++) {
            if (this.info[i].key === key) {
                return i;
            }
        }
        return -1;
    }

    private updateGeometry() {
        let bounds = ui.Rectangle.fromClientRect(this.overlayContainer.getBoundingClientRect());
        let overlayRect = bounds.inner4(0.7, 0.05, 0.2, 0.1);
        overlayRect.conformElement(this.overlayDiv);
        overlayRect.x = 0;
        overlayRect.y = 0;
        this.overlayInnerRects = overlayRect.nipHoriz(Math.floor(overlayRect.width * 0.6));
        this.overlayInnerRects[0].conformElement(this.overlayMsgBox);
        if (this.overlayMsg) {
            this.overlay(this.overlayMsg);
        }
    }

    private makeOverlay(overlayContainer: HTMLElement) {
        let overlayDiv = document.createElement("div");
        overlayDiv.style.visibility = "hidden";
        this.overlayMsgBox = document.createElement("span");
        overlayDiv.appendChild(this.overlayMsgBox);
        overlayContainer.appendChild(overlayDiv);
        this.overlayDiv = overlayDiv;
    }
}
