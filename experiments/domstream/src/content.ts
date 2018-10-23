import { saveDOMToPrague, stopStreamToPrague } from "./pragueWrite";
import { RewriteDOMTree } from "./rewriteDOMTree";

(() => {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        console.log(message[0]);
        console.log(message[1]);
        console.log(sender);
        const command = message[0];
        const documentId = message[1];
        if (command === "PragueMap") {
            saveDOMToPrague(documentId, false, false).catch((error) => { console.error(error); });
            return;
        }
        if (command === "PragueFlatMap") {
            saveDOMToPrague(documentId, true, false).catch((error) => { console.error(error); });
            return;
        }
        if (command === "PragueStreamStart") {
            saveDOMToPrague(documentId, true, true).catch((error) => { console.error(error); });
            return;
        }
        if (command === "PragueStreamStop") {
            stopStreamToPrague();
            return;
        }
        const tree = new RewriteDOMTree();
        tree.initializeFromDocument(document);
        let dom;
        if (command === "Tab") {
            dom = tree.getHTML();
            console.log(dom);
        } else if (command === "JSON") {
            dom = tree.getJSONString();
            console.log(dom);
            dom = "<div>" + dom + "</div>";
        }

        if (dom) {
            console.log(document.body.outerHTML);
            const response = {
                DOM: dom,
                scrollX: window.scrollX,
                scrollY: window.scrollY,
            };
            sendResponse(response);
        }
    });
})();
