import * as pragueMap from "@prague/map";
import { debug, debugFrame, debugPort } from "./debug";
import { globalConfig } from "./globalConfig";
import { MessageEnum, PortHolder } from "./portHolder";
import { PragueDocument } from "./pragueUtil";

let collabDoc: PragueDocument;
let currentTabId;
let mapBatchOp = true;

export class BackgroundStreaming {
    public static init() {
        chrome.runtime.onConnect.addListener((port) => {
            if (globalConfig.disableFrame && port.sender.frameId !== 0) {
                return;
            }
            const frame = ContentFrame.register(port);
            if (collabDoc && currentTabId === port.sender.tab.id) {
                frame.startStreaming();
            }
        });
    }

    public static async start(server: string, docId: string, tabId: number, batchOp: boolean) {
        if (collabDoc) {
            console.error("Shouldn't start background stream when there is already an collabDoc");
            return;
        }
        collabDoc = await PragueDocument.Load(server, docId);
        currentTabId = tabId;
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
        let frameMap = ContentFrame.tabIdToFrameMap.get(tabId);
        if (!frameMap) {
            frameMap = new Map();
            ContentFrame.tabIdToFrameMap.set(tabId, frameMap);
        }
        const frame = new ContentFrame(port, tabId, frameId);
        frameMap.set(frameId, frame);

        port.onDisconnect.addListener(() => {
            debugFrame(frameId, "port disconnected", tabId, sender.url);
            frameMap.delete(frameId);
            if (frameMap.size === 0) { ContentFrame.tabIdToFrameMap.delete(tabId); }
        });

        if (frameId !== 0) {
            chrome.webNavigation.getFrame({
                frameId,
                tabId,
            }, (details) => {
                // Let the content script knows about the frameId
                // Note: parentFrameId is only for debug purpose
                if (details) {
                    const parentFrameId = details.parentFrameId;
                    debugFrame(frameId, "port connected", tabId, parentFrameId, sender.url);
                    const parentFrame = frameMap.get(parentFrameId);
                    if (parentFrame) {
                        parentFrame.sendMessage([MessageEnum.EnsureFrameIdListener], () => {
                            frame.sendMessage([MessageEnum.SetFrameId, frameId, parentFrameId], () => {
                                debugFrame(frameId, "establish with parent", parentFrameId);
                            });
                        });
                    } else {
                        debugFrame(frameId, "not establish with parent", parentFrameId);
                    }
                } else {
                    debugFrame(frameId, "connected (with no frame detail)", tabId, sender.url);
                }
            });
        } else {
            debugFrame(frameId, "port connected", tabId, sender.url);
        }
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
    private tabId: number;
    private frameId: number;

    constructor(port: chrome.runtime.Port, tabId: number, frameId: number) {
        super(port);
        this.tabId = tabId;
        this.frameId = frameId;
    }

    public async startStreaming() {
        if (this.maps) {
            // we already started
            return;
        }

        if (this.frameId) {
            const topFrame = ContentFrame.tabIdToFrameMap.get(this.tabId).get(0);
            await topFrame.startStreaming();

            // TODO: Currently we put all the frames under the top frame nodes.
            // Might consider deleting these map once the frame goes away
            this.maps = [topFrame.getPragueMap(1)];
            this.mapViews = [topFrame.getPragueMapView(1)];
        } else {
            this.maps = [collabDoc.getRoot()];
            this.mapViews = [await collabDoc.getRoot().getView()];
        }

        await this.ensurePragueMapView(1);

        this.listener = (message: any[]) => {
            const command = message[0];
            let handled = true;
            switch (command) {
                case MessageEnum.batch:
                    const batchedMessages: any[][] = message[1];
                    for (const m of batchedMessages) {
                        this.listener(m);
                    }
                case MessageEnum.set:
                    this.getPragueMap(message[1]).set(message[2], message[3]);
                    break;
                case MessageEnum.setMap:
                    this.getPragueMap(message[1]).set(message[2], this.getPragueMap(message[3]));
                    break;
                case MessageEnum.setIfChanged: {
                    const mapView = this.getPragueMapView(message[1]);
                    const key = message[2];
                    const value = message[3];
                    const oldValue = mapView.get(key);
                    if (oldValue === value) { return; }
                    mapView.set(key, value);
                    break;
                }
                case MessageEnum.setTimeStamp:
                    this.getPragueMap(message[1]).set(message[2], new Date().valueOf());
                    break;
                case MessageEnum.delete:
                    this.getPragueMap(message[1]).delete(message[2]);
                    break;
                case MessageEnum.forEach: {
                    const mapId = message[1];
                    this.getPragueMapView(mapId).forEach((value, key) => {
                        this.postMessage([MessageEnum.forEachItem, mapId, value, key]);
                    });
                    this.postMessage([MessageEnum.forEachDone, mapId]);
                    break;
                }
                case MessageEnum.ensureMapView: {
                    const mapId = message[1];
                    this.ensurePragueMapView(mapId).then(() => {
                        this.postMessage([MessageEnum.ensureMapViewDone, mapId]);
                    });
                    break;
                }
                default:
                    handled = false;
                    break;
            }
            if (handled) {
                debugPort("Execute action:", MessageEnum[command], message);
            }
        };
        this.addMessageListener(this.listener);

        this.postMessage([MessageEnum.BackgroundPragueStreamStart,
        {
            batchOp: mapBatchOp,
            frameId: this.frameId,
        }]);
    }

    public stopStreaming() {
        this.maps = null;
        this.mapViews = null;
        this.removeMessageListener(this.listener);
        this.postMessage([MessageEnum.BackgroundPragueStreamStop]);
    }

    private sendMessage(message: any[], callback?: (response: any) => void) {
        chrome.tabs.sendMessage(this.tabId, message, { frameId: this.frameId }, callback);
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
            this.postMessage([MessageEnum.valueChanged, mapId, key, value, deleted]);
        });
    }
}
