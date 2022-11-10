/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

let active = false;

function makeOrange(color: string): void {
    document.body.style.backgroundColor = color;
}

chrome.action.onClicked.addListener((tab) => {
    active = !active;
    const color = active ? "orange" : "white";
    chrome.scripting
        .executeScript({
            target: { tabId: tab.id === undefined ? -1 : tab.id },
            func: makeOrange,
            args: [color],
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
