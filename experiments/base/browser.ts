import * as MergeTree from "./mergeTree";
import * as Protocol from "../../routerlicious/src/api/protocol";

// first script loaded
let clockStart = Date.now();

// TODO: eliminate duplicate code
function segsToHTML(segs: MergeTree.TextSegment[], lengthLimit?: number) {
    let buf = "<div style='line-height:120%;font-size:18px;font-famliy:Helvetica'><div>";
    let segCount = segs.length;
    let charLength = 0;
    for (let i = 0; i < segCount; i++) {
        let segText = segs[i].text;
        let styleAttr = "";
        if (segText.indexOf("Chapter") >= 0) {
            styleAttr = " style='font-size:140%;line-height:150%'";
        }
        else {
            segText = segText.replace(/_([a-zA-Z]+)_/g, "<span style='font-style:italic'>$1</span>");
        }
        buf += `<span${styleAttr}>${segText}</span>`
        if (segText.charAt(segText.length - 1) == '\n') {
            buf += "</div><div>";
        }
        charLength += segText.length;
        if (lengthLimit && (charLength >= lengthLimit)) {
            break;
        }
    }
    buf += "</div></div>";
    return buf;
}

function ajax_get(url, callback) {
    let xmlhttp = new XMLHttpRequest();
    xmlhttp.onreadystatechange = function () {
        if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
            console.log('responseText:' + xmlhttp.responseText);
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
    constructor(public client: MergeTree.Client, public totalSegmentCount, public currentSegmentIndex, public totalLengthChars) {
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
                alert(`time to load: ${Date.now()-clockStart}ms len: ${this.client.getLength()}`);
            }
        });
    }
}

export function onLoad() {
    ajax_get("/obj?init=true", (data: Protocol.MergeTreeChunk, text) => {
        let client = new MergeTree.Client("", data.clientId);
        let segs = textsToSegments(data.segmentTexts);
        let div = document.createElement("div");
        let html = segsToHTML(segs);
        div.innerHTML = html;
        document.body.removeChild(document.body.children[0]);
        document.body.appendChild(div);
        client.mergeTree.reloadFromSegments(segs);
        theString = new ClientString(client, data.totalSegmentCount, data.chunkSegmentCount,
            data.totalLengthChars);
        if (data.chunkSegmentCount < data.totalSegmentCount) {
            theString.continueLoading();
        }
    });
}