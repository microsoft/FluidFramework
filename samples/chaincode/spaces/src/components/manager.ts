import { EventEmitter } from "events";
import { SharedComponent, SharedComponentFactory } from "@microsoft/fluid-aqueduct";

/**
 * The manager will be use as a container level provider/consumer manager
 */
export class Manager extends SharedComponent {
    private static readonly factory = new SharedComponentFactory(Manager, []);
    private readonly registry: Map<string, (() => void)[]> = new Map();

    public static getFactory() { return this.factory; }

    registerProducer(type: string, listener: EventEmitter) {
        listener.on(type, () => {
            const map = this.registry.get(type);
            if(map) {
                // call all the callbacks
                map.forEach((value) => value());
            }
        });
    }

    registerListener(type: string, callback: () => void) {
        const map = this.registry.get(type);
        if(map) {
            // append to the map
            map.push(callback);
        }
        else {
            // set the first item
            this.registry.set(type, [callback]);
        }
    }
}
