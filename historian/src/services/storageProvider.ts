import { IHistorian } from "gitresources";
import { IStorageProvider } from "./definitions";

/**
 * Helper class that manages a storage provider definition
 */
export class StorageProvider {
    // Getter for the historian interface that manages access to the underlying storage provider
    public get historian(): IHistorian {
        return this.historianService;
    }

    constructor(private historianService: IHistorian, private provider: IStorageProvider) {
    }

    /**
     * Translates a generic path to a storage provider specific one
     */
    public translatePath(path: string) {
        return `${this.provider.isDefault ? "" : `/${this.provider.name}` }${path}`;
    }
}
