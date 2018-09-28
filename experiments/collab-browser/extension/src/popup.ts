import * as style from "./style.css";
import { load } from "./prague";
import { SessionManager, SessionList } from "../../sessions";

const sessionManagerP = load<SessionManager>("x20");

chrome.runtime.sendMessage({ type: "getDocId" }, (docId: string) => {
    const outer = document.createElement("div");
    outer.classList.add(style.collabbox);
    outer.innerHTML = `
        <div>
            Collab-Browser: <a href="http://localhost:3000/loader/${docId}" target="_blank" rel="noopener noreferrer">${docId}</a>
            <div>
                <button id="shareButton">Share</button>
            </div>
            <div id="sessions">
            </div>
        </div>
    `;
        
    document.body.appendChild(outer);

    const button = document.getElementById("shareButton");
    button.addEventListener("click", async () => {
        //const activeTab = await getActiveTab();

        // sessionManagerP.then(sessionManager => {
        //     sessionManager.addSession("new session");
        // });

        // const sessionsElm = document.getElementById("sessions");
        // sessionsElm.innerHTML += `
        //     <a href="http://localhost:3000/sharedText/sedate-leather?template=empty" target="_blank" rel="noopener noreferrer">session</a>
        // `;
    
        // chrome.tabs.query({ active: true, currentWindow: true },
        //     (tabs) => {
        //         chrome.tabs.sendMessage(
        //             tabs[0].id,
        //             { from: 'popup', type: 'share' });
        //     });

        chrome.runtime.sendMessage({ type: "share" });
    });

    sessionManagerP.then(sessionManager => {
        const sessionList = new SessionList<any>();
        const sessionsDiv = document.getElementById("sessions");
        sessionsDiv.appendChild(sessionList.mount(sessionManager));
    });
});
