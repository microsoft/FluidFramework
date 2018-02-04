/**
 * Interface for a git object cache
 */
export interface ICache {
    /**
     * Retrieves the cached entry for the given key. Or null if it doesn't exist.
     */
    get<T>(key: string): Promise<T>;

    /**
     * Sets a cache value
     */
    set<T>(key: string, value: T): Promise<void>;
}

/**
 * Credentials used to access a storage provider
 */
export interface ICredentials {
    user: string;

    password: string;
}

/**
 * Interface representing a git storage provider
 */
export interface IStorageProvider {
    // The type of provider
    type: "git" | "cobalt";

    // URL to the provider
    url: string;

    // Optional credentials needed to access the given URL
    credentials?: ICredentials;

    // Name for the provider
    name: string;

    // Whether or not this should be the default provider
    isDefault: boolean;
}
