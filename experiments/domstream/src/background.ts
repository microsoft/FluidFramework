import { BackgroundStreaming } from "./backgroundStreaming";
import { debugPopup } from "./debug";

function exportToView(tab: chrome.tabs.Tab, response) {
    const w = window.open(chrome.runtime.getURL("view.html"));
    w.onload = () => {
        const urlField = w.document.getElementById("URL") as HTMLSpanElement;
        urlField.innerHTML = tab.url;
        const dimensionField = w.document.getElementById("DIMENSION") as HTMLSpanElement;
        dimensionField.innerHTML = tab.width + " x " + tab.height;
        const scrollPosField = w.document.getElementById("SCROLLPOS") as HTMLSpanElement;
        scrollPosField.innerHTML = response.scrollX + ", " + response.scrollY;
        const iframe = w.document.getElementById("view") as HTMLIFrameElement;
        iframe.width = String(tab.width);
        iframe.height = String(tab.height);
        iframe.contentDocument.write(response.DOM);
        iframe.contentWindow.scrollTo(response.scrollX, response.scrollY);
    };
}

const streamState = {
    background: false,
    batchOp: false,
    docId: "",
    enabled: false,
    pending: false,
    tabId: -1,
};

BackgroundStreaming.init();

chrome.runtime.onMessage.addListener((message, sender) => {
    debugPopup(message, sender, performance.now());
    if (message && message.command) {
        const command = message.command;
        if (command === "Tab" || command === "PragueMap" || command === "PragueFlatMap" || command === "JSON"
            || command === "PragueStreamStart" || command === "PragueStreamStop") {

            const tab: chrome.tabs.Tab = message.tab;
            let tabId = tab.id;
            if (command === "PragueStreamStop") {
                if (!streamState.enabled) { return; }
                if (streamState.pending) { return; }

                // Ignore the tab passed in
                tabId = streamState.tabId;
                streamState.enabled = false;

                if (streamState.background) {
                    BackgroundStreaming.stop(tabId);
                    return;
                }
            } else {
                if (streamState.enabled && command !== "Tab" && command !== "JSON") {
                    alert("Already streaming to " + streamState.docId + " tabId: " + streamState.tabId
                        + " (requested tabId: " + tabId + ")");
                    return;
                }
                if (command === "PragueStreamStart") {
                    streamState.enabled = true;
                    streamState.tabId = tabId;
                    streamState.docId = message.docId;
                    streamState.batchOp = message.batchOp;
                    if (message.background) {
                        streamState.background = true;
                        streamState.pending = true;
                        BackgroundStreaming.start(streamState.docId, streamState.tabId, streamState.batchOp).then(
                            () => { streamState.pending = false; });
                        return;
                    }
                }
            }

            streamState.background = false;
            chrome.tabs.sendMessage(tabId, [command, message.docId, message.batchOp], undefined,
                (response) => {
                    if (command === "Tab" || command === "JSON") {
                        debugPopup(response);
                        exportToView(tab, response);
                    }
                });
        }
    }
});

chrome.webNavigation.onCompleted.addListener((details) => {
    debugPopup("Navigate ", details);
    if (streamState.enabled && !streamState.background
        && streamState.tabId === details.tabId && details.frameId === 0) {
        chrome.tabs.sendMessage(streamState.tabId, ["PragueStreamStart", streamState.docId]);
    }
});

(window as any).getStreamingState = () => {
    return streamState;
};
