import * as request from "request";
import * as url from "url";
// import * as Geometry from "./geometry";
import * as api from "../../api";
import { MergeTreeChunk } from "../../api";
import * as SharedString from "../../merge-tree";
import * as socketStorage from "../../socket-storage";

socketStorage.registerAsDefault(document.location.origin);

// first script loaded
let clockStart = Date.now();

interface ISegSpan extends HTMLSpanElement {
    seg: SharedString.TextSegment;
}

let cachedCanvas: HTMLCanvasElement;
/**
 * Uses canvas.measureText to compute and return the width of the given text of given font in pixels.
 *
 * @param {String} text The text to be rendered.
 * @param {String} font The css font descriptor that text is to be rendered with (e.g. "bold 14px verdana").
 *
 * @see http://stackoverflow.com/questions/118241/calculate-text-width-with-javascript/21015393#21015393
 */
function getTextWidth(text, font) {
    // re-use canvas object for better performance
    const canvas = cachedCanvas || (cachedCanvas = document.createElement("canvas"));
    const context = canvas.getContext("2d");
    context.font = font;
    const metrics = context.measureText(text);
    return metrics.width;
}

// for now global; later map from font info to width/height estimates
let wEst = 0;
let hEst = 23;

function makeInnerDiv() {
    let innerDiv = document.createElement("div");
    innerDiv.style.font = "18px Times";
    innerDiv.style.lineHeight = "125%";
    return innerDiv;
}

export function makePlaceholder(sizeChars: number, charsPerViewport: number) {
    let div = document.createElement("div");
    div.style.height = `${Math.floor(sizeChars / charsPerViewport) * window.innerHeight}px`;
    return div;
}

function widthEst(fontInfo: string) {
    let innerDiv = makeInnerDiv();
    wEst = getTextWidth("abcdefghi jklmnopqrstuvwxyz", innerDiv.style.font) / 27;
}

export function heightFromCharCount(sizeChars: number) {
    let charsPerLine = window.innerWidth / Math.floor(wEst);
    let charsPerViewport = Math.floor((window.innerHeight / hEst) * charsPerLine);
    return Math.floor((sizeChars / charsPerViewport) * window.innerHeight);
}

function renderTree(div: HTMLDivElement, pos: number, client: SharedString.Client) {
    div.id = "renderedTree";
    div.style.marginRight = "8%";
    div.style.marginLeft = "5%";
    let w = Math.floor(wEst);
    let h = hEst;
    let charsPerLine = window.innerWidth / w;
    let charsPerViewport = Math.floor((window.innerHeight / h) * charsPerLine);
    let innerDiv = makeInnerDiv();
    div.appendChild(innerDiv);
    let charLength = 0;

    function renderSegment(
        segment: SharedString.Segment, renderSegmentPos: number, refSeq: number,
        clientId: number, start: number, end: number) {
        if (segment.getType() === SharedString.SegmentType.Text) {
            let textSegment = <SharedString.TextSegment> segment;
            let segText = textSegment.text;
            let span = <ISegSpan> document.createElement("span");
            if (segText.indexOf("Chapter") >= 0) {
                span.style.fontSize = "140%";
                span.style.lineHeight = "150%";
            } else {
                segText = segText.replace(/_([a-zA-Z]+)_/g, "<span style='font-style:italic'>$1</span>");
            }
            span.innerHTML = segText;
            span.seg = textSegment;
            innerDiv.appendChild(span);
            if (segText.charAt(segText.length - 1) === "\n") {
                innerDiv = makeInnerDiv();
                div.appendChild(innerDiv);
            }
            charLength += segText.length;

            if (charLength > charsPerViewport) {
                console.log(`client h, w ${div.clientHeight},${div.clientWidth}`);
                if (div.clientHeight > window.innerHeight) {
                    return false;
                }
            }
        }
        return true;
    }
    client.mergeTree.mapRange({ leaf: renderSegment }, SharedString.UniversalSequenceNumber,
        client.getClientId(), undefined, pos);
}

class ClientString {
    public timeToImpression: number;
    public timeToEdit: number;
    private viewportCharCount: number;
    private ticking = false;
    private topChar = 0;

    constructor(public sharedString: SharedString.SharedString) {
        let charsPerLine = window.innerWidth / Math.floor(wEst); // overestimate
        let charsPerViewport = Math.floor((window.innerHeight / hEst) * charsPerLine);
        this.viewportCharCount = charsPerViewport;

        sharedString.on("op", () => {
            this.render();
        });
    }

    public setEdit() {
        document.body.onclick = (e) => {
            let span = <ISegSpan> e.target;
            if (span.seg) {
                let offset = this.sharedString.client.mergeTree.getOffset(
                    span.seg,
                    this.sharedString.client.getCurrentSeq(),
                    this.sharedString.client.getClientId());
                console.log(`segment at char offset ${offset}`);
            }
        };
        let handler = (e: KeyboardEvent) => {
            console.log(`key ${e.keyCode}`);
            if (((e.keyCode === 33) || (e.keyCode === 34)) && (!this.ticking)) {
                setTimeout(() => {
                    console.log(`animation frame ${Date.now() - clockStart}`);
                    this.scroll(e.keyCode === 33);
                    this.ticking = false;
                }, 40);
                this.ticking = true;
            } else if (e.keyCode === 36) {
                this.render(0);
                e.preventDefault();
                e.returnValue = false;
            }
        };

        document.body.onkeydown = handler;
    }

    public scroll(up: boolean) {
        let len = this.sharedString.client.getLength();
        let halfport = Math.floor(this.viewportCharCount / 2);
        if ((up && (this.topChar === 0)) || ((!up) && (this.topChar > (len - halfport)))) {
            return;
        }
        if (up) {
            this.topChar -= halfport;
            if (this.topChar < 0) {
                this.topChar = 0;
            }
        } else {
            this.topChar += halfport;
            if (this.topChar >= len) {
                this.topChar -= (halfport / 2);
            }
        }
        this.render();
    }

    public render(topChar?: number) {
        if (topChar !== undefined) {
            this.topChar = topChar;
        }
        let len = this.sharedString.client.getLength();
        let frac = this.topChar / len;
        let pos = Math.floor(frac * len);
        let oldDiv = document.getElementById("renderedTree");
        if (oldDiv) {
            document.body.removeChild(oldDiv);
        }
        let viewportDiv = document.createElement("div");
        document.body.appendChild(viewportDiv);
        // let flowDiv = document.createElement("div");
        // let scrollDiv = document.createElement("div");
        renderTree(viewportDiv, pos, this.sharedString.client);
    }

    public loadFinished() {
        // tslint:disable-next-line:max-line-length
        console.log(`time to edit/impression: ${this.timeToEdit} time to load: ${Date.now() - clockStart}ms len: ${this.sharedString.client.getLength()}`);
    }
}

export let theString: ClientString;

export async function onLoad(id: string) {
    const extension = api.defaultRegistry.getExtension(SharedString.CollaboritiveStringExtension.Type);
    const sharedString = extension.load(id, api.getDefaultServices(), api.defaultRegistry) as SharedString.SharedString;

    sharedString.on("partialLoad", async (data: MergeTreeChunk) => {
        console.log("Partial load fired");

        widthEst("18px Times");
        theString = new ClientString(sharedString);
        theString.render(0);
        theString.timeToEdit = theString.timeToImpression = Date.now() - clockStart;
        theString.setEdit();
    });

    sharedString.on("loadFinshed", (data: MergeTreeChunk) => {
        theString.loadFinished();

        if (sharedString.client.getLength() === 0) {
            request.get(url.resolve(document.baseURI, "/public/literature/pp.txt"), (error, response, body: string) => {
                if (error) {
                    return console.error(error);
                }

                const segments = SharedString.loadSegments(body, 0);
                for (const segment of segments) {
                    sharedString.insertText((<SharedString.TextSegment> segment).text, sharedString.client.getLength());
                }
            });
        }
    });
}
