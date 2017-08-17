import { Promise } from "es6-promise";

export interface IHost {
    // Lists all interfaces supported by the host
    listServices(): Promise<string[]>;

    // Returns a reference to the given interface on the host
    getService<T>(name: string): Promise<T>;
}
