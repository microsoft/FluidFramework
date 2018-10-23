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

let isStreaming = false;
let streamingTabId;
let streamingDocId;

chrome.runtime.onMessage.addListener((message, sender) => {
  console.log(message);
  console.log(sender);
  if (message && message.command) {
    const command = message.command;
    if (command === "Tab" || command === "PragueMap" || command === "PragueFlatMap" || command === "JSON"
      || command === "PragueStreamStart" || command === "PragueStreamStop") {

      const tab: chrome.tabs.Tab = message.tab;
      let tabId = tab.id;
      if (command === "PragueStreamStop") {
        if (!isStreaming) { return; }
        // Ignore the tab passed in
        tabId = streamingTabId;
        isStreaming = false;
      } else {
        if (isStreaming && command !== "Tab" && command !== "JSON") {
          alert("Already streaming to " + streamingDocId + " tabId: " + streamingTabId
            + " (requested tabId: " + tabId + ")");
          return;
        }
        if (command === "PragueStreamStart") {
          isStreaming = true;
          streamingTabId = tabId;
          streamingDocId = message.docId;
        }
      }
      chrome.tabs.sendMessage(tabId, [command, message.docId], undefined,
        (response) => {
          if (command === "Tab" || command === "JSON") {
            console.log(response);
            exportToView(tab, response);
          }
        });
    }
  }
});

chrome.webNavigation.onCompleted.addListener((details) => {
  console.log("Navigate ", details);
  if (isStreaming && streamingTabId === details.tabId && details.frameId === 0) {
    chrome.tabs.sendMessage(streamingTabId, ["PragueStreamStart", streamingDocId]);
  }
});

(window as any).getIsStreaming = () => {
  return isStreaming;
};
(window as any).getStreamingTabId = () => {
  return streamingTabId;
};
(window as any).getStreamingDocId = () => {
  return streamingDocId;
};
