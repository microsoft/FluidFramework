import * as pragueApi from "@prague/client-api";
import * as pragueMap from "@prague/map";
import { IMapViewWrapper, IMapWrapper, IMapWrapperFactory } from "./mapWrapper";

class PragueMapWrapper implements IMapWrapper {
    private map: pragueMap.IMap;
    constructor(map: pragueMap.IMap) {
        this.map = map;
    }

    public set(key: string, value: any) {
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

    public set(key: string, value: any) {
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
    private collabDoc: pragueApi.Document;
    constructor(collabDoc: pragueApi.Document) {
        this.collabDoc = collabDoc;
    }

    public async getRootMapView() {
        return new PragueMapViewWrapper(await this.collabDoc.getRoot().getView());
    }
    public createMap() {
        return new PragueMapWrapper(this.collabDoc.createMap());
    }
    public async createMapView() {
        const map = this.collabDoc.createMap();
        return new PragueMapViewWrapper(await map.getView());
    }
}
