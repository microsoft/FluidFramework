function webPartsHandler(req){
  return { redirectUrl: 'http://localhost:3000/getclientsidewebparts' };
}
function setListeners() {
  chrome.webRequest.onBeforeRequest.addListener(webPartsHandler,
                                                {urls: ["https://*.microsoft.sharepoint-df.com/*/getclientsidewebparts"]},
                                                ['requestBody', 'blocking']);
}
function removeListeners() {
  chrome.webRequest.onBeforeRequest.removeListener(requestHandler);
}
setListeners();