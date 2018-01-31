import { IHistorian } from "gitresources";

/**
 * Interface representing a git storage provider
 */
export interface IStorageProvider {
    // The type of provider
    type: "git" | "cobalt";

    // URL to the provider
    url: string;

    // Name for the provider
    name: string;

    // Whether or not this should be the default provider
    isDefault: boolean;
}

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
