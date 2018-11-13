
export interface IMapWrapper {
    set(key: string, value: string | number | boolean): void;
    setMap(key: string, value: IMapWrapper): void;
}

export interface IMapViewWrapper {
    set(key: string, value: string | number | boolean): void;
    setMap(key: string, value: IMapWrapper): void;
    setMapView(key: string, value: IMapViewWrapper): void;
    setIfChanged(key: string, value: string): void;
    setTimeStamp(key: string);
    delete(key: string): void;
    forEach(callback: (value: any, key: string) => void): Promise<void>;
    onNonLocalValueChanged(callback: (key: string, value: any, deleted: boolean) => void): void;
}

export interface IMapWrapperFactory {
    getFrameContainerDataMapView(): Promise<IMapViewWrapper>;
    getDefaultDataMapView(): Promise<IMapViewWrapper>;
    createMap(): IMapWrapper;
    createMapView(): Promise<IMapViewWrapper>;
}
