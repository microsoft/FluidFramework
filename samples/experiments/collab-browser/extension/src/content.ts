/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

const evalInPage = (script: string) => {
    const scriptElm = document.createElement('script');
    scriptElm.textContent = script;
    (document.head || document.documentElement).appendChild(scriptElm);
    scriptElm.remove();
}

chrome.runtime.onMessage.addListener((msg, sender, response) => {
    switch (msg.type) {
        case "eval":
            evalInPage(msg.script);
            break;
    }
});