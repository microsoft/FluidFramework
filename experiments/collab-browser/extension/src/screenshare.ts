import { load } from "./prague";
import { chainload } from "./chainload";
import { TabRef } from "./tabRef";
import { Component } from "../../component/src/component";
import { captureVisibleTab } from "./utils";

const docIdP = chainload("@chaincode/collab-browser");
let sharedTab = new TabRef();

export const isSharing = (tabId: number) => {
    return sharedTab.id === tabId;
};

export const start = async (tabId: number) => {
    sharedTab = new TabRef(tabId);
    const docId = await docIdP;
    const component = await load<Component>(docId);
    let previousImage = "";
    let lastStart = NaN;
    
    const pollForChanges = async () => {
        if (!(await sharedTab.isActive)) {
            if (!sharedTab.isClosed) {
                pollAgainLater();
            }
            return;
        }

        const tab = await sharedTab.tab;
        const nextImage = await captureVisibleTab(tab.windowId, { format: "jpeg", quality: 8 });
        if (nextImage === previousImage) {
            const elapsed = Date.now() - lastStart;
            if (elapsed > 100) {
                console.log(`*** Capture Screenshot(high)`);
                const tab = await sharedTab.tab;
                const image = await captureVisibleTab(tab.windowId, { format: "jpeg", quality: 25 });
                await component.setImage(image, tab.width, tab.height);
                lastStart = NaN;
            }
            pollAgainLater();
            return;
        }

        console.log(`*** Capture Screenshot(low)`);
        await component.setImage(nextImage, tab.width, tab.height);
        previousImage = nextImage;

        window.setTimeout(pollForChanges, 8);
        lastStart = Date.now();
    }

    const pollAgainLater = () => {
        window["requestIdleCallback"](pollForChanges, { timeout: 8 });
    }

    pollForChanges();

    return docId;
};

export const stop = () => { sharedTab = new TabRef(); };