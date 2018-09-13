import { EventEmitter } from "events";

/**
 * The platform interface exposes access to underlying pl
 */
export interface IPlatform extends EventEmitter {
    /**
     * Queries the platform for an interface of the given ID. Returns it if it exists otherwise returns null.
     */
    queryInterface<T>(id: string);
}
