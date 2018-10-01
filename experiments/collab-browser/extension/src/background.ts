import { SharingTab } from "./sharingtab";
import * as screenshare from "./screenshare";
import { loadNotebook } from "./prague";
import { chainload } from "./chainload";

let sharingTab;
let notebook;

{
    const div = document.createElement("div");
    div.id = "content";
    document.body.appendChild(div);
}

chainload("@chaincode/notebook").then(async id => {
    notebook = await loadNotebook(id)
    sharingTab = new SharingTab(id);
    await notebook.initialize({ 
        routerlicious: "http://localhost:3000", 
        historian: "http://localhost:3001", 
        tenantId: "prague", 
        token: "43cfc3fbf04a97c0921fd23ff10f9e4b", 
        npm: "http://localhost:4873", 
        versions: { 
            pinpoint: "@chaincode/pinpoint-editor@latest", 
            sharedText: "@chaincode/shared-text@latest"
     }});
});

const parentMenuId = "prague_share_menu";
const menus: chrome.contextMenus.CreateProperties[] = [{
    title: "page",
    contexts: ["all"],
    onclick: async (info: chrome.contextMenus.OnClickData, tab: chrome.tabs.Tab) => {
        const id = await screenshare.start(tab.id);
        await insertComponent("document", { id });
    }
}, {
    title: "selection",
    contexts: ["selection"],
    onclick: async (info: chrome.contextMenus.OnClickData, tab: chrome.tabs.Tab) => {
        insertText(info.selectionText);
    }
}, {
    title: "pinpoint",
    contexts: ["selection"],
    onclick: async (info: chrome.contextMenus.OnClickData, tab: chrome.tabs.Tab) => {
        notebook.addPinpoint(info.selectionText);
    }
}];

chrome.contextMenus.create({
    id: parentMenuId,
    title: "share",
    contexts: ["all"],
}, () => {
    for (const menu of menus) {
        menu.parentId = parentMenuId;
        chrome.contextMenus.create(menu);
    }
});

chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    switch (request.type) {
        case "share": {
            await sharingTab.get();
            return true;
        }
        default:
            return false;
    }
});

const executeScript = async (script: string) => {
    chrome.tabs.sendMessage(await sharingTab.get(), { type: "eval", script });
};

const insertComponent = (type: string, state: {}) => {
    executeScript(`insertComponent(${JSON.stringify(type)}, ${JSON.stringify(state)})`);
};

const insertText = (text: string) => {
    executeScript(`insertText(${JSON.stringify(text)})`);
};