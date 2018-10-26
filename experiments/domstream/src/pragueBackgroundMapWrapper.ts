import { debugPort } from "./debug";
import { IMapViewWrapper, IMapWrapper, IMapWrapperFactory } from "./mapWrapper";
import { PortHolder } from "./portHolder";

class BatchMessageQueue extends PortHolder {
    private messageQueue: any[][];
    constructor(port: chrome.runtime.Port, batchOp: boolean) {
        super(port);
        if (batchOp) {
            this.messageQueue = new Array();     
        }        
    }

    protected postMessage(message: any[]) {
        if (this.messageQueue) {
            this.messageQueue.push(message);
            return;
        }
        super.postMessage(message);
    }

    protected flushMessageQueue(parentQueue?: BatchMessageQueue) {        
        if (this.messageQueue) {
            if (parentQueue) {
                parentQueue.postMessage(["batch", this.messageQueue]);
            } else {
                super.postMessage(["batch", this.messageQueue]);
            }
            this.messageQueue = null;
        }
    }
};
class PragueBackgroundMapWrapper extends BatchMessageQueue implements IMapWrapper {
    private mapId: number;
    constructor(port: chrome.runtime.Port, mapId: number, batchOp: boolean) {
        super(port, batchOp);
        this.mapId = mapId;
    }

    public set(key: string, value: any) {
        this.postMessage(["set", this.mapId, key, value]);
    }

    public setMap(key: string, value: PragueBackgroundMapWrapper) {
        this.postMessage(["setMap", this.mapId, key, value.getMapId(this)]);
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
    
    constructor(port: chrome.runtime.Port, mapId: number, batchOp: boolean) {
        super(port, batchOp);
        this.mapId = mapId;

        this.valueChangeListener = (message: any[]) => {
            if (message[0] !== "valueChanged") {
                return;
            }
            if (message[1] !== this.mapId) {
                return;
            }

            debugPort("Execute action:", message[0], this.mapId);
            for (const callback of this.nonLocalValueChangeCallback) {
                callback(message[2], message[3], message[4]);
            }
        };
        this.addMessageListener(this.valueChangeListener);
    }

    public set(key: string, value: any) {
        this.postMessage(["set", this.mapId, key, value]);
    }
    public setMap(key: string, value: PragueBackgroundMapWrapper) {        
        this.postMessage(["setMap", this.mapId, key, value.getMapId(this)]);
    }
    public setMapView(key: string, value: PragueBackgroundMapViewWrapper) {        
        this.postMessage(["setMap", this.mapId, key, value.getMapId(this)]);
    }
    public setIfChanged(key: string, value: string) {
        this.postMessage(["setIfChanged", this.mapId, key, value]);
    }
    public delete(key: string) {
        this.postMessage(["delete", this.mapId, key]);
    }
    public forEach(callback: (value: any, key: string) => void): Promise<void> {
        this.flushMessageQueue();
        const promise = new Promise<void>((resolve, reject) => {
            const listener = (message: any[]) => {
                if (message[1] !== this.mapId) {
                    return;
                }
                if (message[0] === "forEachItem") {
                    debugPort("Execute action:", message[0], this.mapId);
                    callback(message[2], message[3]);
                    return;
                }
                if (message[0] === "forEachDone") {
                    debugPort("Execute action:", message[0], this.mapId);
                    this.removeMessageListener(listener);
                    resolve();
                    return;
                }
            };
            this.addMessageListener(listener);
        });
        this.postMessage(["forEach", this.mapId]);
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
    private nextMapId: number = 1;  // 0 is ithe root
    private batchOp: boolean;
    constructor(port: chrome.runtime.Port, batchOp: boolean) {
        super(port);
        this.batchOp = batchOp;
    }
    public async getRootMapView() {
        return Promise.resolve(new PragueBackgroundMapViewWrapper(this.getPort(), 0, false));
    }
    public createMap() {
        return new PragueBackgroundMapWrapper(this.getPort(), this.nextMapId++, this.batchOp);
    }
    public async createMapView() {
        const mapId = this.nextMapId++;
        return new Promise<PragueBackgroundMapViewWrapper>((resolve) => {
            const listener = (message: any[]) => {
                if (message[0] === "ensureMapViewDone" && message[1] === mapId) {
                    debugPort("Execute action: ", message[0], mapId);
                    this.removeMessageListener(listener);
                    return resolve(new PragueBackgroundMapViewWrapper(this.getPort(), mapId, this.batchOp));
                }
            };
            this.addMessageListener(listener);
            this.postMessage(["ensureMapView", mapId]);
        });
    }
}
