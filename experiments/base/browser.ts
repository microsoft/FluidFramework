import * as MergeTree from "./mergeTree";
import * as Protocol from "../../routerlicious/src/api/protocol";

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
let h_est = 22;

function makeInnerDiv() {
    let innerDiv = document.createElement("div");
    innerDiv.style.font = "18px Times";
    innerDiv.style.lineHeight = "120%";
    innerDiv.style.marginLeft = "5%";
    innerDiv.style.marginRight = "5%";
    return innerDiv;
}

function makePlaceholder(sizeChars: number, charsPerViewport: number) {
    let div = document.createElement("div");
    div.style.height = `${Math.floor(sizeChars / charsPerViewport) * window.innerHeight}px`;
    return div;
}

function widthEst(fontInfo: string) {
    let innerDiv = makeInnerDiv();
    w_est = getTextWidth("abcdefghi jklmnopqrstuvwxyz", innerDiv.style.font) / 27;
    w_est *= 0.9;
}

function heightFromCharCount(sizeChars: number) {
    let charsPerLine = window.innerWidth / Math.floor(w_est);
    let charsPerViewport = Math.floor((window.innerHeight / h_est) * charsPerLine);
    return Math.floor((sizeChars / charsPerViewport) * window.innerHeight);
}

function render(div: HTMLDivElement, segs: MergeTree.TextSegment[], cp: number,
    totalLengthChars: number) {
    let tryTextWidth = (w_est).toFixed(1);
    let w = Math.floor(w_est);
    let h = h_est;
    let charsPerLine = window.innerWidth / w;
    let charsPerViewport = Math.floor((window.innerHeight / h) * charsPerLine);
    if (cp > 0) {
        let placeholderDiv = makePlaceholder(cp, charsPerViewport);
        div.appendChild(placeholderDiv);
    }
    function afterDiv() {
        if ((cp + charsPerViewport) < totalLengthChars) {
            let afterSize = totalLengthChars - (cp + charsPerViewport);
            let placeholderDiv = makePlaceholder(afterSize, charsPerViewport);
            div.appendChild(placeholderDiv);
        }
    }
    let innerDiv = makeInnerDiv();
    console.log(`alph space width ${tryTextWidth}`);
    div.appendChild(innerDiv);
    let segCount = segs.length;
    let charLength = 0;
    let halfSegCount = segCount >> 1;
    console.log(` window h,w ${window.innerHeight}, ${window.innerWidth}`);
    for (let i = 0; i < segCount; i++) {
        let segText = segs[i].text;
        let styleAttr = "";
        let span = <SegSpan>document.createElement("span");
        if (segText.indexOf("Chapter") >= 0) {
            span.style.fontSize = "140%";
            span.style.lineHeight = "150%";
        }
        else {
            segText = segText.replace(/_([a-zA-Z]+)_/g, "<span style='font-style:italic'>$1</span>");
        }
        span.innerHTML = segText;
        span.seg = segs[i];
        innerDiv.appendChild(span);
        innerDiv = makeInnerDiv();
        div.appendChild(innerDiv);
        charLength += segText.length;

        if (charLength > charsPerViewport) {
            console.log(`client h, w ${div.clientHeight},${div.clientWidth}`);
            if (div.clientHeight > window.innerHeight) {
                afterDiv();
                return i;
            }
        }
    }
    afterDiv();
}

function renderTree(div: HTMLDivElement, pos: number, client: MergeTree.Client) {
    div.id = "renderedTree";
    let tryTextWidth = (w_est).toFixed(1);
    let w = Math.floor(w_est);
    let h = h_est;
    let totalLengthChars = client.getLength();
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
            let styleAttr = "";
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
        let charsPerLine = window.innerWidth / Math.floor(w_est);
        let charsPerViewport = Math.floor((window.innerHeight / h_est) * charsPerLine);
        this.viewportCharCount = charsPerViewport;
    }

    setEdit() {
        document.body.onclick = (e) => {
            let span = <SegSpan>e.target;
            if (span.seg) {
                let offset = this.client.mergeTree.getOffset(span.seg, this.client.getCurrentSeq(),
                    this.client.getClientId());
                console.log(`segment at char offset ${offset}`);
            }
        }
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
        let div = document.createElement("div");
        document.body.appendChild(div);
        renderTree(div, pos, this.client);
    }

    continueLoading() {
        ajax_get(`/obj?startSegment=${this.currentSegmentIndex}`, (data: Protocol.MergeTreeChunk, text) => {
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

let ticking = false;
let scrollPos = 0;

export function onLoad() {
    widthEst("18px Times");
    ajax_get("/obj?init=true", (data: Protocol.MergeTreeChunk, text) => {
        let client = new MergeTree.Client("", data.clientId);
        let segs = textsToSegments(data.segmentTexts);
        client.mergeTree.reloadFromSegments(segs);
        theString = new ClientString(client, data.totalSegmentCount, data.chunkSegmentCount,
            data.totalLengthChars);
        theString.render(0);
        theString.timeToEdit = theString.timeToImpression = Date.now() - clockStart;
        let handler = (e: KeyboardEvent) => {
            console.log(`key ${e.keyCode}`);
            if (((e.keyCode == 33) || (e.keyCode == 34)) && (!ticking)) {
                setTimeout(() => {
                    console.log(`animation frame ${Date.now() - clockStart}`);
                    theString.scroll(e.keyCode == 33);
                    ticking = false;
                }, 40);
                ticking = true;
            }
            else if (e.keyCode == 36) {
                theString.render(0);
                e.preventDefault();
                e.returnValue = false;
            }
        }
        document.body.onkeydown = handler;
        //document.body.onkeypress = handler;
        if (data.chunkSegmentCount < data.totalSegmentCount) {
            theString.setEdit();
            theString.continueLoading();
        }
    });
}