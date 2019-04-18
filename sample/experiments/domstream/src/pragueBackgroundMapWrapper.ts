import { debugPort } from "./debug";
import { IMapViewWrapper, IMapWrapper, IMapWrapperFactory } from "./mapWrapper";
import { MessageEnum, PortHolder } from "./portHolder";

class BatchMessageQueue extends PortHolder {
    private static maxMessageQueueSize = 1000;
    private messageQueue: any[][];
    constructor(port: chrome.runtime.Port, batchOps: boolean) {
        super(port);
        if (batchOps) {
            this.messageQueue = new Array();
        }
    }

    protected postMessage(message: any[]) {
        if (this.messageQueue) {
            this.messageQueue.push(message);
            if (this.messageQueue.length >= BatchMessageQueue.maxMessageQueueSize) {
                super.postMessage([MessageEnum.batch, this.messageQueue]);
                this.messageQueue.length = 0;
            }
            return;
        }
        super.postMessage(message);
    }

    protected flushMessageQueue(parentQueue?: BatchMessageQueue) {
        if (this.messageQueue) {
            if (parentQueue) {
                // TODO: Should we force the parent to flush if the message queue is cumulatively too big?
                debugPort("Flushing to parent: ", this.messageQueue.length);
                parentQueue.postMessage([MessageEnum.batch, this.messageQueue]);
            } else {
                debugPort("Flushing to port: ", this.messageQueue.length);
                super.postMessage([MessageEnum.batch, this.messageQueue]);
            }
            this.messageQueue = null;
        }
    }
}

class PragueBackgroundMapWrapper extends BatchMessageQueue implements IMapWrapper {
    private mapId: number;
    constructor(port: chrome.runtime.Port, mapId: number, batchOps: boolean) {
        super(port, batchOps);
        this.mapId = mapId;
    }

    public set(key: string, value: string | number | boolean) {
        this.postMessage([MessageEnum.set, this.mapId, key, value]);
    }

    public setMap(key: string, value: PragueBackgroundMapWrapper) {
        this.postMessage([MessageEnum.setMap, this.mapId, key, value.getMapId(this)]);
    }

    public getMapId(parentQueue: BatchMessageQueue) {
        this.flushMessageQueue(parentQueue);
        return this.mapId;
    }
}

export class PragueBackgroundMapViewWrapper extends BatchMessageQueue implements IMapViewWrapper {
    private mapId: number;
    private nonLocalValueChangeCallback = new Array<(key: string, value: any, deleted: boolean) => void>();
    private valueChangeListener: (message: any[]) => void;

    constructor(port: chrome.runtime.Port, mapId: number, batchOps: boolean) {
        super(port, batchOps);
        this.mapId = mapId;

        this.valueChangeListener = (message: any[]) => {
            if (message[0] !== MessageEnum.valueChanged) {
                return;
            }
            if (message[1] !== this.mapId) {
                return;
            }

            debugPort("Execute action:", MessageEnum[message[0]], this.mapId);
            for (const callback of this.nonLocalValueChangeCallback) {
                callback(message[2], message[3], message[4]);
            }
        };
        this.addMessageListener(this.valueChangeListener);
    }

    public set(key: string, value: string | number | boolean) {
        this.postMessage([MessageEnum.set, this.mapId, key, value]);
    }
    public setMap(key: string, value: PragueBackgroundMapWrapper) {
        this.postMessage([MessageEnum.setMap, this.mapId, key, value.getMapId(this)]);
    }
    public setMapView(key: string, value: PragueBackgroundMapViewWrapper) {
        this.postMessage([MessageEnum.setMap, this.mapId, key, value.getMapId(this)]);
    }
    public setIfChanged(key: string, value: string) {
        this.postMessage([MessageEnum.setIfChanged, this.mapId, key, value]);
    }
    public setTimeStamp(key: string) {
        this.postMessage([MessageEnum.setTimeStamp, this.mapId, key, Date.now()]);
    }
    public delete(key: string) {
        this.postMessage([MessageEnum.delete, this.mapId, key]);
    }
    public forEach(callback: (value: any, key: string) => void): Promise<void> {
        this.flushMessageQueue();
        const promise = new Promise<void>((resolve, reject) => {
            const listener = (message: any[]) => {
                if (message[1] !== this.mapId) {
                    return;
                }
                if (message[0] === MessageEnum.forEachItem) {
                    debugPort("Execute action:", MessageEnum[message[0]], this.mapId);
                    callback(message[2], message[3]);
                    return;
                }
                if (message[0] === MessageEnum.forEachDone) {
                    debugPort("Execute action:", MessageEnum[message[0]], this.mapId);
                    this.removeMessageListener(listener);
                    resolve();
                    return;
                }
            };
            this.addMessageListener(listener);
        });
        this.postMessage([MessageEnum.forEach, this.mapId]);
        return promise;
    }
    public onNonLocalValueChanged(newCallback: (key: string, value: any, deleted: boolean) => void) {
        this.nonLocalValueChangeCallback.push(newCallback);
    }
    private getMapId(parentQueue: BatchMessageQueue) {
        this.flushMessageQueue(parentQueue);
        return this.mapId;
    }
}

export class PragueBackgroundMapWrapperFactory extends PortHolder implements IMapWrapperFactory {
    private nextMapId: number = 2;  // 0 is the root, 1 is the default data map
    private batchOps: boolean;
    constructor(port: chrome.runtime.Port, batchOps: boolean) {
        super(port);
        this.batchOps = batchOps;
    }
    public async getFrameContainerDataMapView() {
        return Promise.resolve(new PragueBackgroundMapViewWrapper(this.getPort(), 0, false));
    }
    public async getDefaultDataMapView() {
        return Promise.resolve(new PragueBackgroundMapViewWrapper(this.getPort(), 1, false));
    }
    public createMap() {
        return new PragueBackgroundMapWrapper(this.getPort(), this.nextMapId++, this.batchOps);
    }
    public async createMapView() {
        const mapId = this.nextMapId++;
        return new Promise<PragueBackgroundMapViewWrapper>((resolve) => {
            const listener = (message: any[]) => {
                if (message[0] === MessageEnum.ensureMapViewDone && message[1] === mapId) {
                    debugPort("Execute action: ", MessageEnum[message[0]], mapId);
                    this.removeMessageListener(listener);
                    return resolve(new PragueBackgroundMapViewWrapper(this.getPort(), mapId, this.batchOps));
                }
            };
            this.addMessageListener(listener);
            this.postMessage([MessageEnum.ensureMapView, mapId]);
        });
    }
}
