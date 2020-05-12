/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

function webPartsHandler(req) {
    return { redirectUrl: 'http://localhost:3000/getclientsidewebparts' };
}

function setListeners() {
    chrome.webRequest.onBeforeRequest.addListener(
        webPartsHandler,
        {
            urls: [
                "https://*.microsoft.sharepoint-df.com/*/getclientsidewebparts",
                "https://*.microsoft-my.sharepoint-df.com/*/getclientsidewebparts",
                "https://*.microsoft-my.sharepoint.com/*/getclientsidewebparts",
                "https://microsofteur-my.sharepoint.com/*/getclientsidewebparts"
            ]
        },
        ['requestBody', 'blocking']
    );
}

function removeListeners() {
    chrome.webRequest.onBeforeRequest.removeListener(webPartsHandler);
}

setListeners();
