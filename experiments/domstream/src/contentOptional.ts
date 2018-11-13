import { debug, debugFrame, debugPopup } from "./debug";
import { MessageEnum } from "./portHolder";
import { PragueMapWrapperFactory } from "./pragueMapWrapper";
import { PragueDocument } from "./pragueUtil";
import { saveDOM, stopStreamToPrague } from "./pragueWrite";
import { RewriteDOMTree } from "./rewriteDOMTree";

(() => {
    debugFrame(-1, "Initializing optional content script: ", window.location.href);

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        const command = message[0];
        if (!command) { return; }

        if (command === MessageEnum.SetFrameId || command === MessageEnum.EnsureFrameIdListener) {
            // Handled by the main content script
            return;
        }

        if (window !== window.top) {
            console.error(command, "shouldn't be issue on iframes");
        }
        debugPopup(command, message[1], sender, performance.now());

        const documentId = message[1];
        if (command === "PragueMap") {
            const options = {
                background: false,
                batchOp: message[2],
                contentScriptInitTime,
                frameId: 0,
                stream: false,
                useFlatMap: false,
            };
            saveDOMToPrague(documentId, options).catch((error) => { console.error(error); });
            return;
        }
        if (command === "PragueFlatMap") {
            const options = {
                background: false,
                batchOp: message[2],
                contentScriptInitTime,
                frameId: 0,
                stream: false,
                useFlatMap: true,
            };
            saveDOMToPrague(documentId, options).catch((error) => { console.error(error); });
            return;
        }
        if (command === "PragueStreamStart") {
            const options = {
                background: false,
                batchOp: message[2],
                contentScriptInitTime,
                frameId: 0,
                stream: true,
                useFlatMap: true,
            };
            saveDOMToPrague(documentId, options).catch((error) => { console.error(error); });
            return;
        }
        if (command === "PragueStreamStop") {
            stopStreamToPrague();
            if (collabDocToClose) {
                collabDocToClose.close();
                collabDocToClose = null;
            }
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

    let contentScriptInitTime;
    let collabDocToClose;
    async function saveDOMToPrague(documentId: string, options: any) {
        // Load in the latest and connect to the document
        options.startSignalTime = options.startSaveSignalTime = performance.now();
        const collabDoc = await PragueDocument.Load("local", documentId);
        await saveDOM(new PragueMapWrapperFactory(collabDoc, options.batchOp), options);
        if (options.stream) {
            collabDocToClose = collabDoc;
        } else {
            // collabDoc.close(); // how to wait until all the ops are done?
        }
    }

    contentScriptInitTime = performance.now();
    debug("Optional Content script initialized", contentScriptInitTime);
})();
