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

    constructor(public client: MergeTree.Client, public totalSegmentCount, public currentSegmentIndex, public totalLengthChars) {
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

let globScrollY = 0;
let ticking = false;

export function onLoad() {
    widthEst("18px Times");
    ajax_get("/obj?init=true", (data: Protocol.MergeTreeChunk, text) => {
        /* document.body.onscroll = () => {
        
            globScrollY = window.scrollY;
            if (!ticking) {
                window.requestAnimationFrame(()=> {
                    render()
                    ticking = false;
                });
            }
            //console.log(`scroll top: ${document.body.scrollTop}`);
            ticking = true;
        }*/
        let client = new MergeTree.Client("", data.clientId);
        let segs = textsToSegments(data.segmentTexts);
        let div = document.createElement("div");
        document.body.appendChild(div);
        render(div, segs, 0, data.totalLengthChars);
        client.mergeTree.reloadFromSegments(segs);
        theString = new ClientString(client, data.totalSegmentCount, data.chunkSegmentCount,
            data.totalLengthChars);
        theString.timeToEdit = theString.timeToImpression = Date.now() - clockStart;
        if (data.chunkSegmentCount < data.totalSegmentCount) {
            theString.setEdit();
            theString.continueLoading();
        }
    });
}