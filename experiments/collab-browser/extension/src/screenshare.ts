import { TabRef } from "./tabRef";
import { RemoteSession } from "../../remotesession";
import { Store } from "../../../danlehen/store";
import { captureVisibleTab } from "./utils";

const userId = `user-${Math.random().toString(36).substr(2, 4)}`;
const store = new Store("http://localhost:3000");
let sourceTab = new TabRef();
let remoteId = "";

export const isSharing = (tabId: number) => {
    return sourceTab.id === tabId;
};

export const start = async (sourceTabId: number, remoteSessionId: string) => {
    if (isSharing(sourceTabId)) {
        return remoteId;
    }

    sourceTab = new TabRef(sourceTabId);
    const remoteSession = await store.open<RemoteSession>(remoteSessionId, userId, `@chaincode/collab-browser@latest`);
    console.log(`Opened ${remoteSessionId}`);
    let previousImage = "";
    let lastStart = NaN;
    
    const pollForChanges = async () => {
        if (!(await sourceTab.isActive)) {
            if (!sourceTab.isClosed) {
                pollAgainLater();
            }
            return;
        }

        const tab = await sourceTab.tab;
        const nextImage = await captureVisibleTab(tab.windowId, { format: "jpeg", quality: 75 });
        if (nextImage === previousImage) {
            const elapsed = Date.now() - lastStart;
            if (elapsed > 32) {
                console.log(`*** Capture Screenshot(high)`);
                const tab = await sourceTab.tab;
                const image = await captureVisibleTab(tab.windowId, { format: "png" });
                await remoteSession.setImage(image, tab.width, tab.height);
                lastStart = NaN;
            }
            pollAgainLater();
            return;
        }

        console.log(`*** Capture Screenshot(low)`);
        await remoteSession.setImage(nextImage, tab.width, tab.height);
        previousImage = nextImage;

        window.setTimeout(pollForChanges, 8);
        lastStart = Date.now();
    }

    const pollAgainLater = () => {
        window["requestIdleCallback"](pollForChanges, { timeout: 8 });
    }

    pollForChanges();

    return remoteSessionId;
};

export const stop = () => { sourceTab = new TabRef(); };