import * as MergeTree from "./mergeTree";

// first script loaded
let clockStart = Date.now();  

let client: MergeTree.Client;

// TODO: eliminate duplicate code
function segsToHTML(segTexts: string[], lengthLimit ?: number) {
    let buf = "<div style='line-height:120%;font-size:18px;font-famliy:Helvetica'><div>";
    let segCount = segTexts.length;
    let charLength = 0;
    for (let i = 0; i < segCount; i++) {
        let segText = segTexts[i];
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


export function onLoad() {
    ajax_get("/obj?init=true", (data, text) => {
        data.texts[0]+=` RULES in ${Date.now()-clockStart}ms\n`;
        let html = segsToHTML(data.texts);
        document.body.removeChild(document.body.children[0]);
        let div = document.createElement("div");
        div.innerHTML = html;
        document.body.appendChild(div);
    });
}