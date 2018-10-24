
export interface IMapWrapper {
    set(key: string, value: string | number): void;
    setMap(key: string, value: IMapWrapper): void;
}

export interface IMapViewWrapper {
    set(key: string, value: string | number): void;
    setMap(key: string, value: IMapWrapper): void;
    setMapView(key: string, value: IMapViewWrapper): void;
    setIfChanged(key: string, value: string): boolean;
    delete(key: string): void;
    forEach(callback: (value: any, key: string) => void): void;
    onNonLocalValueChanged(callback: (key: string, value: any, deleted: boolean) => void): void;
}

export interface IMapWrapperFactory {
    createMap(): IMapWrapper;
    createMapView(): Promise<IMapViewWrapper>;
}
