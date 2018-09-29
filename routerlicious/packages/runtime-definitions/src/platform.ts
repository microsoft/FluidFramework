import { EventEmitter } from "events";

/**
 * The platform interface exposes access to underlying pl
 */
export interface IPlatform extends EventEmitter {
    /**
     * Queries the platform for an interface of the given ID.
     */
    queryInterface<T>(id: string): Promise<T>;
}

export interface IPlatformFactory {
    /**
     * Creates a new platform to be passed to the runtime
     */
    create(): Promise<IPlatform>;
}
