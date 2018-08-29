/**
 * The platform interface exposes access to underlying pl
 */
export interface IPlatform {
    /**
     * Queries the platform for an interface of the given ID. Returns it if it exists otherwise returns null.
     */
    queryInterface<T>(id: string);
}
