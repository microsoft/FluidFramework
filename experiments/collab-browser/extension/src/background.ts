import { SharingTab } from "./sharingtab";
import * as screenshare from "./screenshare";

const sharingTab = new SharingTab();

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

const shareMenuClicked = async (info: chrome.contextMenus.OnClickData, tab: chrome.tabs.Tab) => {
    const id = await screenshare.start(tab.id);
    await insertComponent("document", { id });
};

chrome.contextMenus.create({
    title: "share",
    onclick: shareMenuClicked
});

const insertComponent = async (type, state) => {
    chrome.tabs.sendMessage(
        await sharingTab.get(),
        { type: "insertComponent", componentType: type, componentState: state });
};