import * as style from "./style.css";
//import { Observer } from "./observer";

// function doScreenshot() {
//     window.open(window.URL.createObjectURL(screenshotPage()));
// }

chrome.runtime.sendMessage({ type: "getDocId" }, (docId: string) => {
    const outer = document.createElement("div");
    outer.classList.add(style.collabbox);
    outer.innerHTML = `
        <div>
            Collab-Browser: <a href="http://localhost:3000/loader/${docId}" target="_blank" rel="noopener noreferrer">${docId}</a>
            <div>
                <button id="shareButton">Share</button>
            </div>
        </div>
    `;
    document.body.appendChild(outer);

    const button = document.getElementById("shareButton");
    button.addEventListener("click", () => {
        chrome.tabs.query({ active: true, currentWindow: true },
            (tabs) => {
                chrome.tabs.sendMessage(
                    tabs[0].id,
                    { from: 'popup', type: 'share' });
            });
    });
});
