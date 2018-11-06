import { debugFrame } from "./debug";
import { StreamDOMTree } from "./streamDOMTree";

// FrameId Discovery

// Content script create a port to background script
// Background script on port connection sendMessage with the frameId back to the content script
// Content script then postMessage to the parent window with the frameId.
//
// If the parent window content script is initialized and listening,
// then we will associate the event source window with the frame id
//
// If the parent window content script is not initalized and message the message,
// It will postMessage to the child window to request the frameId on demand

export class FrameManager {
    public static init() {
        this.listener = (ev) => {
            // TODO: Are these check good enough enough?
            if (ev.data && ev.data.extension === chrome.runtime.id) {
                const frameId = ev.data.frameId;
                if (frameId) {

                    const w = ev.source as WindowProxy;
                    let debugMessage;
                    // The event source might be null if it have navigated away before we receive the message
                    if (w) {
                        this.frameWindowToId.set(w, frameId);
                        debugMessage = "received by parent frameId";

                        if (this.tree) {
                            const frames = document.getElementsByTagName("IFRAME");
                            for (const frame of frames as HTMLCollectionOf<HTMLIFrameElement>) {
                                if (frame.contentWindow === w) {
                                    this.tree.updateFrameId(frame, frameId);
                                    return;
                                }
                            }
                            debugMessage = "Existing frame not found in";
                        }
                    } else {
                        debugMessage = "received by parent frameId with no window";
                    }
                    debugFrame(frameId, debugMessage, this.currentFrameId, window.location.href);
                } else {
                    debugFrame(this.currentFrameId, "Parent requested frameId from ", window.location.href);
                    if (this.currentFrameId) {
                        this.sentFrameIdToParent();
                    }
                }
            }
        };
        window.addEventListener("message", this.listener);
    }
    public static ensureFrameIdListener() {
        window.removeEventListener("message", this.listener);
        window.addEventListener("message", this.listener);
    }
    public static getFrameId(iframe: HTMLIFrameElement) {
        if (this.frameWindowToId.has(iframe.contentWindow)) {
            return this.frameWindowToId.get(iframe.contentWindow);
        }

        // document.write causes us to lose the listener, try to add it back before we ask for the frameId
        // TODO: See if there is better way of frameId discovery
        this.ensureFrameIdListener();

        // Child iframe might have sent the frameId before our content script initialize, and missed the message
        // So we just request it again.
        const parentMessage = {
            extension: chrome.runtime.id,
        };
        iframe.contentWindow.postMessage(parentMessage, "*");
        return -1;
    }
    public static startStream(tree: StreamDOMTree) {
        this.tree = tree;
    }

    public static stopStream() {
        this.tree = undefined;
    }

    public static setCurrentFrameId(frameId: number, parentFrameId: number) {
        this.currentFrameId = frameId;

        if (window === window.parent) {
            debugFrame(frameId, "not sent to parent from", window.location.href);
            return;
        }

        debugFrame(
            this.currentFrameId, "sent to parent", parentFrameId,
            window.parent === window.top ? "(top) from" : "from", window.location.href);
        this.sentFrameIdToParent();
    }

    private static listener;
    private static frameWindowToId: WeakMap<WindowProxy, number> = new WeakMap();
    private static tree: StreamDOMTree;
    private static currentFrameId: number;

    private static sentFrameIdToParent() {
        const parentMessage = {
            extension: chrome.runtime.id,
            frameId: this.currentFrameId,
        };
        window.parent.postMessage(parentMessage, "*");
    }
}
