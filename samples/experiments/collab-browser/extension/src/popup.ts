/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as style from "./style.css";

chrome.runtime.sendMessage({ type: "getDocId" }, (docId: string) => {
    const outer = document.createElement("div");
    outer.classList.add(style.collabbox);
    outer.innerHTML = `
        <div>
            Collab-Browser: <a href="http://localhost:3000/loader/${docId}" target="_blank" rel="noopener noreferrer">${docId}</a>
            <div>
                <button id="shareButton">Shared Notebook</button>
            </div>
            <div id="sessions">
            </div>
        </div>
    `;
        
    document.body.appendChild(outer);

    const button = document.getElementById("shareButton");
    button.addEventListener("click", async () => {
        chrome.runtime.sendMessage({ type: "share" });
    });
});
