// tslint:disable

// import * as Geometry from "./geometry";
import * as MergeTree from "./mergeTree";
import { MergeTreeChunk } from "../api";

// first script loaded
let clockStart = Date.now();

interface SegSpan extends HTMLSpanElement {
    seg: MergeTree.TextSegment;
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
    var canvas = cachedCanvas || (cachedCanvas = document.createElement("canvas"));
    var context = canvas.getContext("2d");
    context.font = font;
    var metrics = context.measureText(text);
    return metrics.width;
}

// for now global; later map from font info to width/height estimates
let w_est = 0;
let h_est = 23;

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
    w_est = getTextWidth("abcdefghi jklmnopqrstuvwxyz", innerDiv.style.font) / 27;
}

export function heightFromCharCount(sizeChars: number) {
    let charsPerLine = window.innerWidth / Math.floor(w_est);
    let charsPerViewport = Math.floor((window.innerHeight / h_est) * charsPerLine);
    return Math.floor((sizeChars / charsPerViewport) * window.innerHeight);
}

function renderTree(div: HTMLDivElement, pos: number, client: MergeTree.Client) {
    div.id = "renderedTree";
    div.style.marginRight = "8%";
    div.style.marginLeft = "5%";
    let w = Math.floor(w_est);
    let h = h_est;
    let charsPerLine = window.innerWidth / w;
    let charsPerViewport = Math.floor((window.innerHeight / h) * charsPerLine);
    let innerDiv = makeInnerDiv();
    div.appendChild(innerDiv);
    let charLength = 0;

    function renderSegment(segment: MergeTree.Segment, pos: number, refSeq: number,
        clientId: number, start: number, end: number) {
        if (segment.getType() == MergeTree.SegmentType.Text) {
            let textSegment = <MergeTree.TextSegment>segment;
            let segText = textSegment.text;
            let span = <SegSpan>document.createElement("span");
            if (segText.indexOf("Chapter") >= 0) {
                span.style.fontSize = "140%";
                span.style.lineHeight = "150%";
            }
            else {
                segText = segText.replace(/_([a-zA-Z]+)_/g, "<span style='font-style:italic'>$1</span>");
            }
            span.innerHTML = segText;
            span.seg = textSegment;
            innerDiv.appendChild(span);
            if (segText.charAt(segText.length - 1) == '\n') {
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
    client.mergeTree.mapRange({ leaf: renderSegment }, MergeTree.UniversalSequenceNumber,
        client.getClientId(), undefined, pos);
}

function ajax_get(url, callback) {
    let xmlhttp = new XMLHttpRequest();
    xmlhttp.onreadystatechange = function () {
        if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
            //console.log('responseText:' + xmlhttp.responseText);
            try {
                var data = JSON.parse(xmlhttp.responseText);
            } catch (err) {
                console.log(err.message + " in " + xmlhttp.responseText);
                return;
            }
            callback(data, xmlhttp.responseText);
        }
    };

    xmlhttp.open("GET", url, true);
    xmlhttp.send();
}

function textsToSegments(texts: string[]) {
    let segments = <MergeTree.TextSegment[]>[];
    for (let text of texts) {
        let segment = new MergeTree.TextSegment(text,
            MergeTree.UniversalSequenceNumber,
            MergeTree.LocalClientId);
        segments.push(segment);
    }
    return segments;
}

let theString: ClientString;

class ClientString {
    timeToImpression: number;
    timeToLoad: number;
    timeToEdit: number;
    timeToCollab: number;
    viewportCharCount: number;
    constructor(public client: MergeTree.Client, public totalSegmentCount, public currentSegmentIndex, public totalLengthChars) {
        let charsPerLine = window.innerWidth / Math.floor(w_est); // overestimate
        let charsPerViewport = Math.floor((window.innerHeight / h_est) * charsPerLine);
        this.viewportCharCount = charsPerViewport;
    }


    ticking = false;

    setEdit() {
        document.body.onclick = (e) => {
            let span = <SegSpan>e.target;
            if (span.seg) {
                let offset = this.client.mergeTree.getOffset(span.seg, this.client.getCurrentSeq(),
                    this.client.getClientId());
                console.log(`segment at char offset ${offset}`);
            }
        }
        let handler = (e: KeyboardEvent) => {
            console.log(`key ${e.keyCode}`);
            if (((e.keyCode == 33) || (e.keyCode == 34)) && (!this.ticking)) {
                setTimeout(() => {
                    console.log(`animation frame ${Date.now() - clockStart}`);
                    theString.scroll(e.keyCode == 33);
                    this.ticking = false;
                }, 40);
                this.ticking = true;
            }
            else if (e.keyCode == 36) {
                theString.render(0);
                e.preventDefault();
                e.returnValue = false;
            }
        }
        document.body.onkeydown = handler;

    }

    topChar = 0
    scroll(up: boolean) {
        let len = this.client.getLength();
        let halfport = Math.floor(this.viewportCharCount / 2);
        if ((up && (this.topChar == 0)) || ((!up) && (this.topChar > (len - halfport)))) {
            return;
        }
        if (up) {
            this.topChar -= halfport;
            if (this.topChar < 0) {
                this.topChar = 0;
            }
        }
        else {
            this.topChar += halfport;
            if (this.topChar >= len) {
                this.topChar -= (halfport / 2);
            }
        }
        this.render();
    }

    render(topChar?: number) {
        if (topChar !== undefined) {
            this.topChar = topChar;
        }
        let len = this.client.getLength();
        let frac = this.topChar / len;
        let pos = Math.floor(frac * len);
        let oldDiv = document.getElementById("renderedTree");
        if (oldDiv) {
            document.body.removeChild(oldDiv);
        }
        let viewportDiv = document.createElement("div");
        document.body.appendChild(viewportDiv);
        //let flowDiv = document.createElement("div");
        //let scrollDiv = document.createElement("div");
        renderTree(viewportDiv, pos, this.client);
    }

    continueLoading() {
        ajax_get(`/obj?startSegment=${this.currentSegmentIndex}`, (data: MergeTreeChunk, text) => {
            for (let text of data.segmentTexts) {
                this.client.mergeTree.appendTextSegment(text);
            }
            this.currentSegmentIndex += data.chunkSegmentCount;
            if (this.currentSegmentIndex < this.totalSegmentCount) {
                this.continueLoading();
            }
            else {
                console.log(`time to edit/impression: ${this.timeToEdit} time to load: ${Date.now() - clockStart}ms len: ${this.client.getLength()}`);
            }
        });
    }
}

export function onLoad() {
    widthEst("18px Times");
    ajax_get("/obj?init=true", (data: MergeTreeChunk, text) => {
        let client = new MergeTree.Client("", data.clientId);
        let segs = textsToSegments(data.segmentTexts);
        client.mergeTree.reloadFromSegments(segs);
        theString = new ClientString(client, data.totalSegmentCount, data.chunkSegmentCount,
            data.totalLengthChars);
        theString.render(0);
        theString.timeToEdit = theString.timeToImpression = Date.now() - clockStart;
        theString.setEdit();
        if (data.chunkSegmentCount < data.totalSegmentCount) {
            theString.continueLoading();
        }
    });
}