import { debug, debugPopup, debugPort} from "./debug";
import { saveDOMToPrague, stopStreamToPrague, streamDOMToBackgroundPrague } from "./pragueWrite";
import { RewriteDOMTree } from "./rewriteDOMTree";

(() => {
    const port = chrome.runtime.connect();
    port.onMessage.addListener((message) => {
        if (message[0] === "BackgroundPragueStreamStart") {
            debugPort("Execute action: ", message[0]);
            streamDOMToBackgroundPrague(port).catch((error) => { console.error(error); });
        } else if (message[0] === "BackgroundPragueStreamStop") {
            debugPort("Execute action: ", message[0]);
            stopStreamToPrague();
        }
    });

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        debugPopup(message[0], message[1], sender, performance.now());
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

        if (window === window.top) {
            const tree = new RewriteDOMTree();
            tree.initializeFromDOM(document);
            let dom;
            if (command === "Tab") {
                dom = tree.getHTML();
                debugPopup(dom);
            } else if (command === "JSON") {
                dom = tree.getJSONString();
                debugPopup(dom);
                dom = "<div>" + dom + "</div>";
            }

            if (dom) {
                debugPopup(document.body.outerHTML);
                const response = {
                    DOM: dom,
                    scrollX: window.scrollX,
                    scrollY: window.scrollY,
                };
                sendResponse(response);
            }
        }
    });

    debug("Content script initialized", performance.now());
})();
