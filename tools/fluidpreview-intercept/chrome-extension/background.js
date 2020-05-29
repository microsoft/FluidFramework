/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

let isDisabled = true
chrome.storage.sync.get("interceptDisabled", function(obj) {
    isDisabled = obj.interceptDisabled;
});

let additionalUrls = [];
chrome.storage.sync.get("additionalUrls", function(obj) {
    additionalUrls = obj.additionalUrls || additionalUrls;
    setListeners();
});

chrome.storage.onChanged.addListener(function(changes, namespace) {
    for (var key in changes) {
        if (key === "interceptDisabled") {
            isDisabled = changes[key].newValue;
        } else if (key === "additionalUrls") {
            additionalUrls = changes[key].newValue;
            setUrls();
        }
    }
});

function webPartsHandler(req) {
    if (!isDisabled) {
        return { redirectUrl: 'http://localhost:3000/getclientsidewebparts' };
    }
}

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
}

function removeListeners() {
    chrome.webRequest.onBeforeRequest.removeListener(webPartsHandler);
}

setListeners();

chrome.runtime.onInstalled.addListener(function() { <<
    <<
    <<
    <
    HEAD
    chrome.declarativeContent.onPageChanged.removeRules(undefined, function() {
        chrome.declarativeContent.onPageChanged.addRules([{
            conditions: [new chrome.declarativeContent.PageStateMatcher({
                pageUrl: { hostEquals: 'fluidpreview.office.net' },
            })],
            actions: [new chrome.declarativeContent.ShowPageAction()]
        }]);
    });
}); ===
===
=
chrome.declarativeContent.onPageChanged.removeRules(undefined, function() {
chrome.declarativeContent.onPageChanged.addRules([{
    conditions: [new chrome.declarativeContent.PageStateMatcher({
        pageUrl: { hostEquals: 'fluidpreview.office.net' },
    })],
    actions: [new chrome.declarativeContent.ShowPageAction()]
}]);
});
}); >>>
>>>
>
43 a0cbb2a42dfea6ec1a42f509813953b3f99e3f