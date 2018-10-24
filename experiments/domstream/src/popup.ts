(() => {
    const docName = document.getElementById("doc_name") as HTMLInputElement;
    chrome.storage.local.get("docName", (items) => {
        if (items.docName) {
            docName.value = items.docName;
        }
    });
    docName.addEventListener("input", () => {
        chrome.storage.local.set({ docName: docName.value });
    });
    function getCurrentTab(callback) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs && tabs.length !== 0) { callback(tabs[0]); }
        });
    }
    function sendCommand(commandValue: string) {
        getCurrentTab((tab) => {
            chrome.runtime.sendMessage({
                command: commandValue,
                docId: docName.value,
                tab,
            });
            window.close();
        });
    }
    document.getElementById("tab_btn").onclick = () => sendCommand("Tab");
    document.getElementById("json_btn").onclick = () => sendCommand("JSON");
    document.getElementById("prague_btn").onclick = () => sendCommand("PragueMap");
    document.getElementById("prague_flat_btn").onclick = () => sendCommand("PragueFlatMap");
    const bgPage = chrome.extension.getBackgroundPage();
    if (bgPage && (bgPage.window as any).getIsStreaming()) {
        document.getElementById("prague_stream_start_btn").style.visibility = "hidden";
        document.getElementById("prague_stream_stop_btn").onclick = () => sendCommand("PragueStreamStop");
        getCurrentTab((tab) => {
            const streamingTabId = (bgPage.window as any).getStreamingTabId();
            document.getElementById("status").innerHTML = "Streaming to "
                + (bgPage.window as any).getStreamingDocId() + " in tab " + streamingTabId
                + (tab.id === streamingTabId ? " (Current)" : "");
        });

    } else {
        document.getElementById("prague_stream_start_btn").onclick = () => sendCommand("PragueStreamStart");
        document.getElementById("prague_stream_stop_btn").style.visibility = "hidden";
    }

    document.getElementById("prague_view_btn").onclick = () =>
        window.open(chrome.runtime.getURL("pragueView.html") + "?docId=" + docName.value);
})();
