import * as api from "../api";

export class Counter implements api.ICounter {
    constructor(private parentMap: api.IMapView, private key: string) {

    }
    public increment(value: number): Promise<void> {
        const currentValue = this.parentMap.get(this.key);
        return Promise.resolve(this.parentMap.set(this.key, currentValue + value));
    }
}
