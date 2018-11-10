import { debug, debugFrame, debugPort } from "./debug";
import { FrameManager } from "./frameManager";
import { MessageEnum } from "./portHolder";
import { PragueBackgroundMapWrapperFactory } from "./pragueBackgroundMapWrapper";
import { saveDOM, stopStreamToPrague } from "./pragueWrite";

(() => {
    debugFrame(-1, "Initializing content script: ", window.location.href);
    FrameManager.init();

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        const command = message[0];
        if (!command) { return; }

        if (command === MessageEnum.EnsureFrameIdListener) {
            FrameManager.ensureFrameIdListener();
            sendResponse("Ack");
            return;
        }
        if (command === MessageEnum.SetFrameId) {
            FrameManager.setCurrentFrameId(message[1], message[2]);
            sendResponse("Ack");
            return;
        }
    });

    async function streamDOMToBackgroundPrague(startSignalTime, streamOptions) {
        const options = {
            background: true,
            batchOp: streamOptions.batchOp,
            contentScriptInitTime,
            frameId: streamOptions.frameId,
            startSaveSignalTime: performance.now(),
            startSignalTime,
            stream: true,
            useFlatMap: true,
        };
        return saveDOM(new PragueBackgroundMapWrapperFactory(port, options.batchOp), options);
    }

    let contentScriptInitTime;
    const port = chrome.runtime.connect();
    port.onMessage.addListener((message) => {
        if (message[0] === MessageEnum.BackgroundPragueStreamStart) {
            debugPort("Execute action: ", MessageEnum[message[0]]);
            const startSignalTime = performance.now();
            if (document.readyState === "loading") {
                document.addEventListener("DOMContentLoaded", () => {
                    streamDOMToBackgroundPrague(startSignalTime, message[1]).catch(
                        (error) => { console.error(error); });
                });
            } else {  // `DOMContentLoaded` already fired
                streamDOMToBackgroundPrague(startSignalTime, message[1]).catch(
                    (error) => { console.error(error); });
            }
        } else if (message[0] === MessageEnum.BackgroundPragueStreamStop) {
            debugPort("Execute action: ", MessageEnum[message[0]]);
            stopStreamToPrague();
        }
    });

    contentScriptInitTime = performance.now();
    debug("Content script initialized", contentScriptInitTime);
})();
