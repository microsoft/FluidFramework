import { TabRef } from "./tabRef";
import { RemoteSession } from "../../remotesession";
import { Store } from "../../../../routerlicious/packages/store";
import { captureVisibleTab } from "./utils";

const userId = `user-${Math.random().toString(36).substr(2, 4)}`;
const store = new Store("http://localhost:3000");

export class ScreenShare {
    private sourceTab = new TabRef();
    private serialNumber = 0;

    // private isSharing(tabId: number) {
    //     return this.sourceTab.id === tabId;
    // };
    
    public async start(sourceTabId: number, remoteSessionId: string) {
        this.sourceTab = new TabRef(sourceTabId);
        const remoteSession = await store.open<RemoteSession>(remoteSessionId, userId, `@chaincode/collab-browser@latest`);
        console.log(`Opened ${remoteSessionId}`);
        
        let previousImage = "";
        let lastStart = NaN;
        let capturedSerialNumber = ++this.serialNumber;
        
        const pollForChanges = async () => {
            const pollAgainLater = () => {
                window["requestIdleCallback"](pollForChanges, { timeout: 8 });
            }
        
            // Exit the "wide loop" if the source tab has closed, or the user has restarted the screencast (i.e., the
            // serial number has been incremented).
            if (this.sourceTab.isClosed || capturedSerialNumber !== this.serialNumber) {
                return;
            }
    
            const tab = await this.sourceTab.tab;
            let nextImage: string;

            // Note: 'captureVisibleTab' will throw if the tab is not currently visible.
            try {
                nextImage = await captureVisibleTab(tab.windowId, { format: "jpeg", quality: 80 });
            } catch (error) {
                // If unable to capture the tab, do nothing and try again later.
                pollAgainLater();
                return;
            }
    
            if (nextImage === previousImage) {
                // If the image hasn't changed, see if enough time has elapsed to send a higher quality screenshot.
                const elapsed = Date.now() - lastStart;
                if (elapsed > 32) {
                    console.log(`*** Capture Screenshot(high): ${remoteSessionId}`);
                    const tab = await this.sourceTab.tab;
    
                    // Note: 'captureVisibleTab' will throw if the tab is not currently visible.
                    try {
                        const image = await captureVisibleTab(tab.windowId, { format: "jpeg", quality: 90 });
    
                        // If unable to capture the tab, do nothing and try again later.
                        await remoteSession.setImage(image, tab.width, tab.height);
                        lastStart = NaN;
                    } catch (error) { /* do nothing */ }
                }
                pollAgainLater();
            } else {
                console.log(`*** Capture Screenshot(low): ${remoteSessionId}`);
                await remoteSession.setImage(nextImage, tab.width, tab.height);
                previousImage = nextImage;
        
                window.setTimeout(pollForChanges, 8);
                lastStart = Date.now();
            }    
        }
    
        pollForChanges();
    };
    
    public stop() { this.sourceTab = new TabRef(); };
}