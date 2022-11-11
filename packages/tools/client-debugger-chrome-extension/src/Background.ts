/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

chrome.action.onClicked.addListener((tab) => {
    chrome.scripting
        .executeScript({
            target: { tabId: tab.id ?? -1 },
            files: ["content.js"],
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
