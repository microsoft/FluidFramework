function requestHandler(req){
  if (req.url.indexOf('clientsidewebparts') >= 0) {
    console.log(req);
    return {redirectUrl: 'http://localhost:3000/users/hi'};
  }
}
function setListeners() {
//   chrome.webRequest.onBeforeSendHeaders.addListener(requestHandler,
//                                                     {urls: ["<all_urls>"]},
//                                                     ["requestHeaders"]);
  chrome.webRequest.onBeforeRequest.addListener(requestHandler,
                                                {urls: ["<all_urls>"]},
                                                ['requestBody', 'blocking']);
  // chrome.webRequest.onCompleted.addListener(requestHandler,
  //                                          {urls: ["<all_urls>"]});
}
function removeListeners() {
  chrome.webRequest.onBeforeSendHeaders.removeListener(requestHandler);
  chrome.webRequest.onBeforeRequest.removeListener(requestHandler);
  chrome.webRequest.onCompleted.removeListener(requestHandler);
}
setListeners();
// // if (details.url.contains("getclientsidewebparts")) {
// //   return {redirectUrl: 'http://localhost:3000/users/hi'};
// // }
// chrome.webRequest.onBeforeRequest.addListener(function(details) {
//   if (details.url.indexOf("fluidpreview.office.net/") >= 0) {
//     return {redirectUrl: 'http://time.com'};
//   }
  
// }, {
//   urls: ["https://microsoft.sharepoint-df.com/"], // or <all_urls>
//   types: ['main_frame', 'sub_frame'],
// }, [
//   'blocking'
// ]);