/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// Initialize disabled state and currently listened URLs from storage
let isDisabled = true
let additionalUrls = [];
chrome.storage.sync.get("interceptDisabled", function(obj) {
    isDisabled = obj.interceptDisabled;
});
chrome.storage.sync.get("additionalUrls", function(obj) {
    additionalUrls = obj.additionalUrls || additionalUrls;
    setListeners();
});

// Add listeners for storage value changes to update the in memory variables
chrome.storage.onChanged.addListener(function(changes, namespace) {
    for (var key in changes) {
        if (key === "interceptDisabled") {
            isDisabled = changes[key].newValue;
        } else if (key === "additionalUrls") {
            additionalUrls = changes[key].newValue;
            removeListeners();
            setListeners();
        }
    }
});

// Redirect the web parts request if the extension isn't disabled
function webPartsHandler(req) {
    if (!isDisabled) {
        return { redirectUrl: 'http://localhost:8080/getclientsidewebparts' };
    }
}

// Add listeners to the web requests to the combined list of URLs from default + user defined
function setListeners() {
    const combinedUrls = additionalUrls.concat([
        "https://*.sharepoint-df.com/*/getclientsidewebparts",
        "https://*.sharepoint.com/*/getclientsidewebparts"
    ]);
    chrome.webRequest.onBeforeRequest.addListener(
        webPartsHandler, {
            urls: combinedUrls
        }, ['requestBody', 'blocking']
    );
    chrome.webRequest.onBeforeSendHeaders.addListener(
        function(details) {
            return {
                requestHeaders: []
            };
        }, { urls: ["http://localhost:8080/getclientsidewebparts"] }, ['blocking', 'requestHeaders']
    );
    chrome.webRequest.onHeadersReceived.addListener(
        function(details) {
            const responseHeaders = [
                { name: "Access-Control-Allow-Origin", value: "*" },
                { name: "Access-Control-Allow-Credentials", value: "true" },
                { name: "Access-Control-Allow-Methods", value: "GET,HEAD,OPTIONS,POST,PUT" },
                { name: "Access-Control-Allow-Headers", value: "Access-Control-Allow-Headers, Origin,Accept, X-Requested-With, Content-Type, Access-Control-Request-Method, Access-Control-Request-Headers, Authorization" },
            ]
            return { responseHeaders };
        }, {
            urls: ["http://localhost:8080/getclientsidewebparts"],
        }, ["blocking", "responseHeaders", "extraHeaders"]
    );
}
setListeners();

// Remove listeners from web requests
function removeListeners() {
    chrome.webRequest.onBeforeRequest.removeListener(webPartsHandler);
}

// Show the popup page if someone clicks on the extension icon on the Fluid Preview site
chrome.runtime.onInstalled.addListener(function() {
    chrome.declarativeContent.onPageChanged.removeRules(undefined, function() {
        chrome.declarativeContent.onPageChanged.addRules([{
            conditions: [new chrome.declarativeContent.PageStateMatcher({
                pageUrl: { hostEquals: 'fluidpreview.office.net' },
            })],
            actions: [new chrome.declarativeContent.ShowPageAction()]
        }]);
    });
});