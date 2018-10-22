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
