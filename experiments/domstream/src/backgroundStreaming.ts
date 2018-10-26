import * as pragueMap from "@prague/map";
import { debug, debugPort } from "./debug";
import { PortHolder } from "./portHolder";
import { getCollabDoc } from "./pragueUtil";

let collabDoc;
let mapBatchOp = true;

export class BackgroundStreaming {
    public static init() {
        chrome.runtime.onConnect.addListener((port) => {
            const frame = ContentFrame.register(port);
            if (collabDoc) {
                frame.startStreaming();
            }
        });
    }

    public static async start(docId: string, tabId: number, batchOp: boolean) {
        if (collabDoc) {
            console.error("Shouldn't start background stream when there is already an collabDoc");
            return;
        }
        collabDoc = await getCollabDoc(docId);
        mapBatchOp = batchOp;
        debug("Start streaming tab", tabId, docId);
        ContentFrame.forEachFrame(tabId, (frame) => {
            frame.startStreaming();
        });
    }

    public static stop(tabId: number) {
        if (!collabDoc) {
            console.error("Shouldn't stop background stream when there is no collabDoc");
            return;
        }
        debug("Stop streaming tab", tabId);
        ContentFrame.forEachFrame(tabId, (frame) => {
            frame.stopStreaming();
        });
        collabDoc.close();
        collabDoc = undefined;
    }
}

class ContentFrame extends PortHolder {
    public static register(port: chrome.runtime.Port) {
        const sender = port.sender;
        const tabId = sender.tab.id;
        const frameId = sender.frameId;
        debug("ContentFrame connected", tabId, frameId);
        let frameMap = ContentFrame.tabIdToFrameMap.get(tabId);
        if (!frameMap) {
            frameMap = new Map();
            ContentFrame.tabIdToFrameMap.set(tabId, frameMap);
        }
        const frame = new ContentFrame(port, tabId, frameId);
        frameMap.set(frameId, frame);

        frame.getPort().onDisconnect.addListener(() => {
            debug("ContentFrame discounnted", tabId, frameId);
            frameMap.delete(frameId);
            if (frameMap.size === 0) { ContentFrame.tabIdToFrameMap.delete(tabId); }
        });
        return frame;
    }

    public static forEachFrame(tabId: number, callback: (frame: ContentFrame) => void) {
        const frameMap = ContentFrame.tabIdToFrameMap.get(tabId);
        if (frameMap) {
            frameMap.forEach(callback);
        }
    }

    private static tabIdToFrameMap: Map<number, Map<number, ContentFrame>> = new Map();
    private maps: pragueMap.IMap[];
    private mapViews: pragueMap.IMapView[];
    private listener: (message: any[]) => void;
    // private tabId: number;
    // private frameId: number;

    constructor(port: chrome.runtime.Port, tabId: number, frameId: number) {
        super(port);
        // this.tabId = tabId;
        // this.frameId = frameId;
    }

    public async startStreaming() {
        this.maps = [collabDoc.getRoot()];
        this.mapViews = [await collabDoc.getRoot().getView()];
        this.listener = (message: any[]) => {
            const command = message[0];
            let handled = true;
            switch (command) {
                case "batch":
                    const batchedMessages: any[][] = message[1];
                    for (const m of batchedMessages) {
                        this.listener(m);
                    }
                case "set":
                    this.getPragueMap(message[1]).set(message[2], message[3]);
                    break;
                case "setMap":
                    this.getPragueMap(message[1]).set(message[2], this.getPragueMap(message[3]));
                    break;
                case "setIfChanged": {
                    const mapView = this.getPragueMapView(message[1]);
                    const key = message[2];
                    const value = message[3];
                    const oldValue = mapView.get(key);
                    if (oldValue === value) { return; }
                    mapView.set(key, value);
                    break;
                }
                case "setTimeStamp":
                    this.getPragueMapView(message[1]).set(message[2], new Date().valueOf());
                    break;
                case "delete":
                    this.getPragueMap(message[1]).delete(message[2]);
                    break;
                case "forEach": {
                    const mapId = message[1];
                    this.getPragueMapView(mapId).forEach((value, key) => {
                        this.postMessage(["forEachItem", mapId, value, key]);
                    });
                    this.postMessage(["forEachDone", mapId]);
                    break;
                }
                case "ensureMapView": {
                    const mapId = message[1];
                    this.ensurePragueMapView(mapId).then(() => {
                        this.postMessage(["ensureMapViewDone", mapId]);
                    });
                    break;
                }
                default:
                    handled = false;
                    break;
            }
            if (handled) {
                debugPort("Execute action:", message);
            }
        };
        this.addMessageListener(this.listener);

        this.postMessage(["BackgroundPragueStreamStart", mapBatchOp]);
    }

    public stopStreaming() {
        this.maps = null;
        this.mapViews = null;
        this.removeMessageListener(this.listener);
        this.postMessage(["BackgroundPragueStreamStop"]);
    }

    private getPragueMap(mapId: number) {
        let map = this.maps[mapId];
        if (map) { return map; }
        map = collabDoc.createMap();
        if (!mapBatchOp) {
            collabDoc.getRoot().set("FORCEATTACH", map);
        }
        this.maps[mapId] = map;
        this.mapViews[mapId] = null;
        return map;
    }

    private getPragueMapView(mapId: number) {
        return this.mapViews[mapId];
    }

    private async ensurePragueMapView(mapId: number) {
        if (this.maps[mapId] || this.mapViews[mapId]) { console.error("Map ensured twice?"); }
        const map = this.getPragueMap(mapId);
        const mapView = await map.getView();
        this.mapViews[mapId] = mapView;
        map.on("valueChanged", (changed, local) => {
            if (local) { return; }
            const key = changed.key;
            const deleted = !mapView.has(key);
            const value = deleted ? undefined : mapView.get(key);
            this.postMessage(["valueChanged", mapId, key, value, deleted]);
        });
    }
}
