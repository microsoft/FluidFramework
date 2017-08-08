// tslint:disable:align whitespace no-trailing-whitespace
import * as request from "request";
import * as url from "url";
import * as API from "../../api";
import { MergeTreeChunk } from "../../api";
import * as SharedString from "../../merge-tree";
import * as shared from "../../shared";
import * as socketStorage from "../../socket-storage";
import * as FlowView from "./flowView";
import * as Geometry from "./geometry";

socketStorage.registerAsDefault(document.location.origin);

// first script loaded
let clockStart = Date.now();

export let theFlow: FlowView.FlowView;

interface IKeyMsgPair {
    key: string;
    msg: string;
    showKey?: boolean;
}

class Status implements FlowView.IStatus {
    public overlayDiv: HTMLDivElement;
    public overlayImageElm: HTMLImageElement;
    public overlayMsgBox: HTMLSpanElement;
    public info: IKeyMsgPair[] = [];
    public overlayInnerRects: Geometry.Rectangle[];
    public overlayMsg: string;

    constructor(public div: HTMLDivElement, public overlayContainer: HTMLElement) {
        this.makeOverlay(overlayContainer);
        this.updateGeometry();
        this.div.style.backgroundColor = "#F1F1F1";
    }

    public onresize() {
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

        this.div.innerHTML = buf;
    }

    public overlay(msg: string) {
        this.overlayMsg = msg;
        this.overlayMsgBox.innerText = msg;
        if (!this.overlayImageElm) {
            this.overlayImageElm = document.createElement("img");
            this.overlayImageElm.src = url.resolve(document.baseURI, "/public/images/clippy.gif");
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
        let bounds = Geometry.Rectangle.fromClientRect(this.overlayContainer.getBoundingClientRect());
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

class FlowContainer implements FlowView.IComponentContainer {
    public onresize: () => void;
    public onkeydown: (e: KeyboardEvent) => void;
    public onkeypress: (e: KeyboardEvent) => void;
    public status: FlowView.IStatus;
    public div: HTMLDivElement;
    public statusDiv: HTMLDivElement;

    constructor() {
        this.createElements();
        this.updateGeometry();
        this.status = new Status(this.statusDiv, this.div);
        window.addEventListener("resize", () => {
            this.updateGeometry();
            if (this.onresize) {
                this.onresize();
                if (this.status) {
                    this.status.onresize();
                }
            }
        });
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
        let bodBounds = Geometry.Rectangle.fromClientRect(document.body.getBoundingClientRect());
        let vertSplit = bodBounds.nipVertBottom(22);
        vertSplit[0].conformElement(this.div);
        vertSplit[1].y++; vertSplit[1].height--; // room for 1px border
        vertSplit[1].conformElement(this.statusDiv);
    }
}

export async function onLoad(id: string, config: any) {
    SharedString.MergeTree.blockUpdateMarkers = true;
    const extension = API.defaultRegistry.getExtension(SharedString.CollaboritiveStringExtension.Type);
    const sharedString = extension.load(id, API.getDefaultServices(), API.defaultRegistry) as SharedString.SharedString;

    // Retrive any stored insights
    const mapExtension = API.defaultRegistry.getExtension(API.MapExtension.Type);
    const insights = mapExtension.load(`${id}-insights`, API.getDefaultServices(), API.defaultRegistry) as API.IMap;
    console.log(window.navigator.userAgent);
    console.log(`id is ${id}`);
    sharedString.on("partialLoad", async (data: MergeTreeChunk) => {
        console.log("Partial load fired");

        let container = new FlowContainer();
        theFlow = new FlowView.FlowView(sharedString, data.totalSegmentCount,
            data.totalLengthChars, container, insights);
        if (data.totalLengthChars > 0) {
            theFlow.render(0, true);
        }
        theFlow.timeToEdit = theFlow.timeToImpression = Date.now() - clockStart;
        theFlow.setEdit();
    });

    sharedString.on("loadFinshed", (data: MergeTreeChunk, existing: boolean) => {
        // Bootstrap worker service.
        if (config.permission.sharedText) {
            shared.registerWorker(config);
        }

        if (existing) {
            theFlow.loadFinished(clockStart);
        } else {
            console.log("local load...");
            request.get(url.resolve(document.baseURI,
                "/public/literature/pp.txt"), (error, response, body: string) => {
                    if (error) {
                        return console.error(error);
                    }
                    const segments = SharedString.loadSegments(body, 0, true);
                    for (const segment of segments) {
                        if (segment.getType() === SharedString.SegmentType.Text) {
                            let textSegment = <SharedString.TextSegment>segment;
                            sharedString.insertText(textSegment.text, sharedString.client.getLength(),
                                textSegment.properties);
                        } else {
                            // assume marker
                            let marker = <SharedString.Marker>segment;
                            // tslint:disable:max-line-length
                            sharedString.insertMarker(sharedString.client.getLength(), marker.type, marker.behaviors, marker.properties);
                        }
                    }
                    theFlow.loadFinished(clockStart);
                });
        }
    });
}
