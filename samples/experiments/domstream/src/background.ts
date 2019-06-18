/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

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
    batchOps: false,
    docId: "",
    enabled: false,
    pending: false,
    server: "",
    tabId: -1,
};

BackgroundStreaming.init();

function executeCommand(message) {
    const command = message.command;

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
            streamState.batchOps = message.batchOps;
            streamState.server = message.server;
            streamState.server = message.server;
            if (message.background) {
                streamState.background = true;
                streamState.pending = true;
                BackgroundStreaming.start(
                    streamState.server, streamState.docId, streamState.tabId, streamState.batchOps)
                    .then(() => { streamState.pending = false; })
                    .catch(() => { streamState.pending = false; streamState.enabled = false; });
                return;
            }
        }
    }
    streamState.background = false;
    chrome.tabs.sendMessage(tabId, [command, message.docId, message.batchOps, message.server], { frameId: 0 },
        (response) => {
            if (command === "Tab" || command === "JSON") {
                debugPopup(response);
                exportToView(tab, response);
            }
        });
}

function ensureInject(tabId: number, needInject: boolean, callback) {

    if (needInject && !contentOptionalInjectedTabIds.has(tabId)) {
        contentOptionalInjectedTabIds.add(tabId);
        chrome.tabs.executeScript(tabId, {
            file: "contentOptional.js",
        }, () => {
            callback();
        });
    } else {
        callback();
    }
}
const contentOptionalInjectedTabIds = new Set<number>();
chrome.runtime.onMessage.addListener((message, sender) => {
    debugPopup(message, sender, performance.now());
    if (message && message.command) {
        const command = message.command;
        let needInject;
        switch (command) {
            case "Tab":
            case "JSON":
            case "PragueMap":
            case "PragueFlatMap":
                needInject = true;
                break;
            case "PragueStreamStart":
                needInject = !message.background;
                break;
            case "PragueStreamStop":
                needInject = false;
                break;
            default:
                alert("Invalid command: " + command);
                return;
        }

        const tab: chrome.tabs.Tab = message.tab;
        const tabId = tab.id;
        ensureInject(tabId, needInject, () => { executeCommand(message); });
    }
});

chrome.webNavigation.onBeforeNavigate.addListener((details) => {
    if (details.frameId === 0) {
        contentOptionalInjectedTabIds.delete(details.tabId);
    }
});

chrome.webNavigation.onCompleted.addListener((details) => {
    debugPopup("Navigate ", details);
    // Trigger streaming on a new page in foreground mode.  Only support the main frame and not subframes
    if (streamState.enabled && !streamState.background
        && streamState.tabId === details.tabId && details.frameId === 0) {
        ensureInject(streamState.tabId, true, () => {
            chrome.tabs.sendMessage(
                streamState.tabId,
                ["PragueStreamStart", streamState.docId, streamState.batchOps, streamState.server],
                { frameId: 0 });
        });
    }
});

(window as any).getStreamingState = () => {
    return streamState;
};
