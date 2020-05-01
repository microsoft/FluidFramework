function webPartsHandler(req){
  return { redirectUrl: 'http://localhost:3000/getclientsidewebparts' };
}
function packageHandler(req){
  return { redirectUrl: 'http://localhost:3000/main.bundle.js' };
}
function setListeners() {
  chrome.webRequest.onBeforeRequest.addListener(webPartsHandler,
    {urls: ["https://*.microsoft.sharepoint-df.com/*/getclientsidewebparts", "https://microsofteur-my.sharepoint.com/*/getclientsidewebparts"]},
    ['requestBody', 'blocking']);
}
function removeListeners() {
  chrome.webRequest.onBeforeRequest.removeListener(requestHandler);
}
setListeners();