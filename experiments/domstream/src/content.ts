import { debug, debugPopup, debugPort } from "./debug";
import { saveDOMToPrague, stopStreamToPrague, streamDOMToBackgroundPrague } from "./pragueWrite";
import { RewriteDOMTree } from "./rewriteDOMTree";

(() => {
    let contentScriptInitTime;
    const port = chrome.runtime.connect();
    port.onMessage.addListener((message) => {
        if (message[0] === "BackgroundPragueStreamStart") {
            debugPort("Execute action: ", message[0]);
            streamDOMToBackgroundPrague(port, contentScriptInitTime, message[1]).catch((error) => { console.error(error); });
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
            const options = {
                batchOp: message[2],
                contentScriptInitTime,
                stream: false,
                useFlatMap: false,
            };
            saveDOMToPrague(documentId, options).catch((error) => { console.error(error); });
            return;
        }
        if (command === "PragueFlatMap") {
            const options = {
                batchOp: message[2],
                contentScriptInitTime,
                stream: false,
                useFlatMap: true,
            };
            saveDOMToPrague(documentId, options).catch((error) => { console.error(error); });
            return;
        }
        if (command === "PragueStreamStart") {
            const options = {
                batchOp: message[2],
                contentScriptInitTime,
                stream: true,
                useFlatMap: true,
            };
            saveDOMToPrague(documentId, options).catch((error) => { console.error(error); });
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

    contentScriptInitTime = performance.now();
    debug("Content script initialized", contentScriptInitTime);
})();
