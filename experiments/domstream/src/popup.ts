(() => {
    function getCurrentTab(callback) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs && tabs.length !== 0) { callback(tabs[0]); }
        });
    }
    function sendCommand(commandValue: string) {
        getCurrentTab((tab) => {
            chrome.runtime.sendMessage({
                background: background.checked,
                batchOp: batchOp.checked,
                command: commandValue,
                docId: docName.value,
                tab,
            });
            window.close();
        });
    }

    const docName = document.getElementById("doc_name") as HTMLInputElement;
    const background = document.getElementById("background_cb") as HTMLInputElement;
    const batchOp = document.getElementById("batch_ops_cb") as HTMLInputElement;
    const tabBtn = document.getElementById("tab_btn") as HTMLInputElement;
    const jsonBtn = document.getElementById("json_btn") as HTMLInputElement;
    const pragueMapBtn = document.getElementById("prague_btn") as HTMLInputElement;
    const pragueFlatMapBtn = document.getElementById("prague_flat_btn") as HTMLInputElement;
    const streamStartBtn = document.getElementById("prague_stream_start_btn") as HTMLInputElement;
    const streamStopBtn = document.getElementById("prague_stream_stop_btn") as HTMLInputElement;   

    // Initialize button command
    tabBtn.onclick = () => sendCommand("Tab");
    jsonBtn.onclick = () => sendCommand("JSON");
    pragueMapBtn.onclick = () => sendCommand("PragueMap");
    pragueFlatMapBtn.onclick = () => sendCommand("PragueFlatMap");
    streamStartBtn.onclick = () => sendCommand("PragueStreamStart");
    streamStopBtn.onclick = () => sendCommand("PragueStreamStop");
    document.getElementById("prague_view_btn").onclick = () =>
        window.open(chrome.runtime.getURL("pragueView.html") + "?docId=" + docName.value);

    const bgPage = chrome.extension.getBackgroundPage();
    const streamState = bgPage? (bgPage.window as any).getStreamingState() : undefined;
    if (streamState && streamState.enabled) {  
        streamStartBtn.style.visibility = "hidden";
   
        docName.disabled = true;
        background.disabled = true;
        batchOp.disabled = true;

        docName.value = streamState.docId;
        background.checked = streamState.background;
        batchOp.checked = streamState.checked;

        getCurrentTab((tab) => {
            document.getElementById("status").innerHTML = (streamState.pending ? "[PENDING] " : "") +
                "Streaming in tab " + streamState.tabId + (tab.id === streamState.tabId ? " (Current)" : "");
        });
    } else {
        streamStopBtn.style.visibility = "hidden";

        // Sync from local storage
        chrome.storage.local.get("docName", (items) => {
            console.log(items);
            if (items.docName) {
                docName.value = items.docName;
            }
        });
        chrome.storage.local.get("background", (items) => {
            console.log(items);
            if (items.background !== undefined) {
                background.checked = items.background;
            }
        });
        chrome.storage.local.get("batchOp", (items) => {
            console.log(items);
            if (items.batchOp !== undefined) {
                batchOp.checked = items.batchOp;
            }
        });            
    }

    // Hook up input sync
    docName.addEventListener("input", () => {
        chrome.storage.local.set({ docName: docName.value });
    });
    background.addEventListener("click", () => {
        chrome.storage.local.set({ background: background.checked });
    });
    batchOp.addEventListener("click", () => {
        chrome.storage.local.set({ batchOp: batchOp.checked });
    });

})();
