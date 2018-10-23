(() => {
    const docName = document.getElementById("doc_name") as HTMLInputElement;
    function sendCommand(commandValue: string) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs && tabs.length !== 0) {
                const tabValue = tabs[0];
                chrome.runtime.sendMessage({
                    command: commandValue,
                    docId: docName.value,
                    tab: tabValue,
                });
            }
        });
    }
    document.getElementById("tab_btn").onclick = () => sendCommand("Tab");
    document.getElementById("json_btn").onclick = () => sendCommand("JSON");
    document.getElementById("prague_btn").onclick = () => sendCommand("PragueMap");
    document.getElementById("prague_flat_btn").onclick = () => sendCommand("PragueFlatMap");
    document.getElementById("prague_stream_start_btn").onclick = () => sendCommand("PragueStreamStart");
    document.getElementById("prague_stream_stop_btn").onclick = () => sendCommand("PragueStreamStop");
    document.getElementById("prague_view_btn").onclick = () =>
        window.open(chrome.runtime.getURL("pragueView.html") + "?docId=" + docName.value);
})();
