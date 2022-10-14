
/*
 * Map like interface
 */
export interface SharedPropertyMap {
    
    // map identity token (provide as arg to initMap for distributed editing)
    mapId(): string;

    delete(key: string): void;
    forEach(callbackfn: (value: string, key: string) => void): void;
    get(key: string): string | undefined;
    has(key: string): boolean;
    set(key: string, value: string): this;
    keys(): string[];
    values(): string[];

    insert(key: string, value: string): this;
    insertMany(map: Map<string, string>): this;
    updateMany(map: Map<string, string>): this;
    deleteMany(keys: string[]): void;

    // make changes visible to remote peers
    commit(): void;
    // container life-cycle
    dispose(): void;
}

/*
 * Insert & update notification signature
 */
export interface UpdateCallback {
    (name: string, payload: string) : void
}

/*
 * Delete notification signature
 */
export interface DeleteCallback {
    (name: string) : void
}