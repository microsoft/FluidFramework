import { debugPort } from "./debug";
import { IMapViewWrapper, IMapWrapper, IMapWrapperFactory } from "./mapWrapper";
import { PortHolder } from "./portHolder";

class PragueBackgroundMapWrapper extends PortHolder implements IMapWrapper {
    private mapId: number;
    constructor(port: chrome.runtime.Port, mapId: number) {
        super(port);
        this.mapId = mapId;
    }

    public set(key: string, value: any) {
        this.postMessage(["set", this.mapId, key, value]);
    }

    public setMap(key: string, value: PragueBackgroundMapWrapper) {
        this.postMessage(["setMap", this.mapId, key, value.mapId]);
    }

    public getMapId() {
        return this.mapId;
    }
}

export class PragueBackgroundMapViewWrapper extends PortHolder implements IMapViewWrapper {
    private mapId: number;
    private nonLocalValueChangeCallback = new Array<(key: string, value: any, deleted: boolean) => void>();
    private valueChangeListener: (message: any[]) => void;
    constructor(port: chrome.runtime.Port, mapId: number) {
        super(port);
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
        this.postMessage(["setMap", this.mapId, key, value.getMapId()]);
    }
    public setMapView(key: string, value: PragueBackgroundMapViewWrapper) {
        this.postMessage(["setMap", this.mapId, key, value.mapId]);
    }
    public setIfChanged(key: string, value: string) {
        this.postMessage(["setIfChanged", this.mapId, key, value]);
    }
    public delete(key: string) {
        this.postMessage(["delete", this.mapId, key]);
    }
    public forEach(callback: (value: any, key: string) => void): Promise<void> {
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
}

export class PragueBackgroundMapWrapperFactory extends PortHolder implements IMapWrapperFactory {
    private nextMapId: number = 1;  // 0 is ithe root
    constructor(port: chrome.runtime.Port) {
        super(port);
    }
    public async getRootMapView() {
        return Promise.resolve(new PragueBackgroundMapViewWrapper(this.getPort(), 0));
    }
    public createMap() {
        return new PragueBackgroundMapWrapper(this.getPort(), this.nextMapId++);
    }
    public async createMapView() {
        const mapId = this.nextMapId++;
        return new Promise<PragueBackgroundMapViewWrapper>((resolve) => {
            const listener = (message: any[]) => {
                if (message[0] === "ensureMapViewDone" && message[1] === mapId) {
                    debugPort("Execute action: ", message[0], mapId);
                    this.removeMessageListener(listener);
                    return resolve(new PragueBackgroundMapViewWrapper(this.getPort(), mapId));
                }
            };
            this.addMessageListener(listener);
            this.postMessage(["ensureMapView", mapId]);
        });
    }
}
