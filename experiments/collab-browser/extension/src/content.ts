chrome.runtime.onMessage.addListener(function (msg, sender, response) {
    if ((msg.from === "popup") && (msg.type === "share")) {
        chrome.runtime.sendMessage({ type: "share" });
    }
});