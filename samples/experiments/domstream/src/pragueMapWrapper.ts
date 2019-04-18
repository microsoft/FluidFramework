import * as pragueMap from "@prague/map";
import { IMapViewWrapper, IMapWrapper, IMapWrapperFactory } from "./mapWrapper";
import { PragueDocument } from "./pragueUtil";

class PragueMapWrapper implements IMapWrapper {
    private map: pragueMap.IMap;
    constructor(map: pragueMap.IMap) {
        this.map = map;
    }

    public set(key: string, value: string | number | boolean) {
        this.map.set(key, value);
    }

    public setMap(key: string, value: PragueMapWrapper) {
        this.map.set(key, value.map);
    }

    public getPragueMap() {
        return this.map;
    }
}

export class PragueMapViewWrapper implements IMapViewWrapper {
    private mapView: pragueMap.IMapView;

    constructor(mapView: pragueMap.IMapView) {
        this.mapView = mapView;
    }

    public set(key: string, value: string | number | boolean) {
        this.mapView.set(key, value);
    }
    public setMap(key: string, value: IMapWrapper) {
        // NOTE: No type safety
        this.mapView.set(key, (value as PragueMapWrapper).getPragueMap());
    }
    public setMapView(key: string, value: IMapViewWrapper) {
        // NOTE: No type safety
        this.mapView.set(key, (value as PragueMapViewWrapper).mapView.getMap());
    }
    public setTimeStamp(key: string) {
        const date = Date.now();
        this.mapView.set(key, [date, date]);
    }
    public setIfChanged(key: string, value: string) {
        const oldValue = this.mapView.get(key);
        if (oldValue === value) { return; }
        this.mapView.set(key, value);
        return;
    }
    public delete(key: string) {
        this.mapView.delete(key);
    }
    public forEach(callback: (value: any, key: string) => void): Promise<void> {
        this.mapView.forEach(callback);
        return Promise.resolve();
    }
    public onNonLocalValueChanged(callback: (key: string, value: any, deleted: boolean) => void) {
        this.mapView.getMap().on("valueChanged", (changed, local, op) => {
            if (local) { return; }
            const key = changed.key;
            const deleted = !this.mapView.has(key);
            const value = deleted ? undefined : this.mapView.get(key);
            callback(key, value, deleted);
        });
    }
}

export class PragueMapWrapperFactory implements IMapWrapperFactory {
    private collabDoc: PragueDocument;
    private batchOps: boolean;
    private defaultMapView: pragueMap.IMapView;
    constructor(collabDoc: PragueDocument, batchOps: boolean) {
        this.collabDoc = collabDoc;
        this.batchOps = batchOps;
    }
    public async getFrameContainerDataMapView() {
        // TODO: Only support top frame
        return new PragueMapViewWrapper(await this.collabDoc.getRoot().getView());
    }

    public async getDefaultDataMapView() {
        if (!this.defaultMapView) {
            this.defaultMapView = await this.collabDoc.createMap().getView();
        }
        return new PragueMapViewWrapper(this.defaultMapView);
    }
    public createMap() {
        const newMap = this.collabDoc.createMap();
        if (!this.batchOps) {
            this.collabDoc.getRoot().set("FORCEATTACH", newMap);
        }
        return new PragueMapWrapper(newMap);
    }
    public async createMapView() {
        const newMap = this.collabDoc.createMap();
        if (!this.batchOps) {
            this.collabDoc.getRoot().set("FORCEATTACH", newMap);
        }
        return new PragueMapViewWrapper(await newMap.getView());
    }
}
