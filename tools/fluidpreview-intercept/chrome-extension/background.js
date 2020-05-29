/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

let isDisabled = true
chrome.storage.sync.get("interceptDisabled", function (obj) {  
  isDisabled = obj.interceptDisabled; 
});

chrome.storage.onChanged.addListener(function(changes, namespace) {
  for (var key in changes) {
    if (key === "interceptDisabled") {
      isDisabled = changes[key].newValue;
    }
  }
});

function webPartsHandler(req) {
  if (!isDisabled) {
    return { redirectUrl: 'http://localhost:3000/getclientsidewebparts' };
  }
}

function setListeners() {
  chrome.webRequest.onBeforeRequest.addListener(
    webPartsHandler,
    {
      urls: [
        "https://*.sharepoint-df.com/*/getclientsidewebparts",
        "https://*.sharepoint.com/*/getclientsidewebparts"
      ]
    },
    ['requestBody', 'blocking']
  );
}

function removeListeners() {
    chrome.webRequest.onBeforeRequest.removeListener(webPartsHandler);
}

setListeners();

chrome.runtime.onInstalled.addListener(function() {
  chrome.declarativeContent.onPageChanged.removeRules(undefined, function() {
    chrome.declarativeContent.onPageChanged.addRules([{
      conditions: [new chrome.declarativeContent.PageStateMatcher({
        pageUrl: {hostEquals: 'fluidpreview.office.net'},
      })
      ],
          actions: [new chrome.declarativeContent.ShowPageAction()]
    }]);
  });
});
