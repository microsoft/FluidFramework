import { load } from "./prague";
import { Component } from "../../component/src/component";
import { Scheduler } from "./scheduler";

const docId = `cd-${Math.random().toString(36).substring(2, 6)}`
chrome.tabs.create({ url: `http://localhost:3000/loader/${docId}?chaincode=@chaincode/collab-browser@latest` }, tab => {
    const historyListener = (details) => {
        if (details.tabId !== tab.id) {
            return;
        }

        if (details.url.split("?").length !== 1) {
            return;
        }
        
        chrome.tabs.remove(tab.id)
        chrome.webNavigation.onHistoryStateUpdated.removeListener(historyListener);
    }    

    chrome.webNavigation.onHistoryStateUpdated.addListener(historyListener);
});

let componentP: Promise<Component>;
let sharedTab = NaN;
let previousImage = "";

const getComponent = async () => {
    if (!componentP) {
        componentP = new Promise<Component>(resolve => {
            resolve(load(docId));
        });
    }

    return componentP;
}

// Chrome may replace a tab if the user navigates to a prerendered page.
chrome.tabs.onReplaced.addListener((added, removed) => {
    if (removed === sharedTab) {
        sharedTab = added;
    }
});

const updateScreenShot = async (quality: number) => {
    await new Promise(resolve => {
        chrome.tabs.get(sharedTab, (tab) => {
            console.log(`*** Capture Screenshot(quality: ${quality})`);
            chrome.tabs.captureVisibleTab(tab.windowId, { format: "jpeg", quality }, async (image) => {
                const component = await getComponent();
                await component.setImage(image, tab.width, tab.height);
                resolve();
            });
        });
    });
}

const scheduler = new Scheduler(
    async () => {
        await updateScreenShot(8);
        pollForChanges();
    },
    async () => { 
        await updateScreenShot(25);
    });

const getHasChanged = () => {
    return new Promise(resolve => {
        chrome.tabs.get(sharedTab, (tab) => {
            const windowId = tab.windowId;
    
            // Capture an extremely lossy version (quality = 0) JPEG for a fast comparison to see if we can detect
            // any visible changes.
            chrome.tabs.captureVisibleTab(windowId, { format: "jpeg", quality: 0 }, (previewImage) => {
                if ((previewImage === undefined) || (previousImage === previewImage)) {
                    resolve(false);
                    return;
                }
        
                previousImage = previewImage;
                resolve(true);
            });
        });    
    });
}

const pollForChanges = async () => {
    if (await getHasChanged()) {
        await scheduler.schedule();
    } else {
        setTimeout(pollForChanges, 8);
    }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.type) {
        case "getDocId": {
            sendResponse(docId);
            return false;
        }
        case "share": {
            sharedTab = sender.tab.id;
            pollForChanges();
            return true;
        }
        default:
            return false;
    }
});
