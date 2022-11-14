/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// TODOs:
// - Search for registered debuggers and display warning if none are found? (Still launch debug view?)

/**
 * When the extension icon is clicked, launch the debug view.
 */
chrome.action.onClicked.addListener((tab) => {
    chrome.scripting
        .executeScript({
            target: { tabId: tab.id ?? -1 },
            files: ["toggleDebugger.js"],
        })
        .then(
            () => {
                /* No-op */
            },
            (error) => {
                console.error(error);
            },
        );
});
