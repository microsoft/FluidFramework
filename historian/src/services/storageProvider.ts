import { IStorageProvider } from "./definitions";
import { RestGitService } from "./restGitService";

/**
 * Helper class that manages a storage provider definition
 */
export class StorageProvider {
    // Getter for the historian interface that manages access to the underlying storage provider
    public get gitService(): RestGitService {
        return this.git;
    }

    constructor(private git: RestGitService, private provider: IStorageProvider) {
    }

    /**
     * Translates a generic path to a storage provider specific one
     */
    public translatePath(path: string) {
        return `${this.provider.isDefault ? "" : `/${this.provider.name}` }${path}`;
    }
}
