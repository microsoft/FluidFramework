// tslint:disable:align whitespace no-trailing-whitespace
import * as request from "request";
import * as url from "url";
import * as API from "../../api";
import * as SharedString from "../../merge-tree";
import * as shared from "../../shared";
import * as socketStorage from "../../socket-storage";
import * as FlowView from "./flowView";
import * as Geometry from "./geometry";

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

const prideAndPrejudice = "/public/literature/pp.txt";

function downloadRawText(textUrl: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        request.get(url.resolve(document.baseURI, textUrl), (error, response, body: string) => {
            if (error) {
                reject(error);
            } else if (response.statusCode !== 200) {
                reject(response.statusCode);
            } else {
                resolve(body);
            }
        });
    });
}

async function waitForKey<T>(parent: API.IMap, key: string): Promise<T> {
    const view = await parent.getView();
    if (view.has(key)) {
        return view.get(key);
    } else {
        return new Promise<T>((resolve, reject) => {
            const callback = (value: { key: string }) => {
                if (key === value.key) {
                    resolve(view.get(value.key));
                    parent.removeListener("valueChanged", callback);
                }
            };

            parent.on("valueChanged", callback);
        });
    }
}

async function getInsights(map: API.IMap, id: string): Promise<API.IMap> {
    const insights = await waitForKey<API.IMap>(map, "insights");
    return waitForKey<API.IMap>(insights, id);
}

export async function onLoad(id: string, config: any) {
    socketStorage.registerAsDefault(document.location.origin, config.blobStorageUrl, config.repository);
    const collabDoc = await API.load(id, { blockUpdateMarkers: true });
    const root = await collabDoc.getRoot().getView();

    // If a text element already exists load it direclty - otherwise load in price + prejudice
    const existing = root.has("text");
    if (!existing) {
        const newString = collabDoc.createString() as SharedString.SharedString;
        const starterText = await downloadRawText(prideAndPrejudice);
        const segments = SharedString.loadSegments(starterText, 0, true);
        for (const segment of segments) {
            if (segment.getType() === SharedString.SegmentType.Text) {
                let textSegment = <SharedString.TextSegment>segment;
                newString.insertText(textSegment.text, newString.client.getLength(),
                    textSegment.properties);
            } else {
                // assume marker
                let marker = <SharedString.Marker>segment;
                // tslint:disable:max-line-length
                newString.insertMarker(newString.client.getLength(), marker.type, marker.behaviors, marker.properties);
            }
        }

        root.set("text", newString);
    }

    const sharedString = root.get("text") as SharedString.SharedString;

    getInsights(collabDoc.getRoot(), sharedString.id).then((insightsMap) => {
        theFlow.trackInsights(insightsMap);
    });

    console.log(window.navigator.userAgent);
    console.log(`id is ${id}`);
    console.log("Partial load fired");

    let container = new FlowContainer();
    theFlow = new FlowView.FlowView(sharedString, container);
    if (sharedString.client.getLength() > 0) {
        theFlow.render(0, true);
    }
    theFlow.timeToEdit = theFlow.timeToImpression = Date.now() - clockStart;
    theFlow.setEdit();

    sharedString.loaded.then(() => {
        // Bootstrap worker service.
        if (config.permission.sharedText) {
            shared.registerWorker(config);
        }

        theFlow.loadFinished(clockStart);
    });
}
