/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Helper class for managing audience member data that flattens its nested map operations.
 * AudienceData functions largely like a two-keyed map, and provides many of the standard Map
 * methods, along with direct access to its internal data for more complex operations.
 */
export class AudienceData<T> {
    private readonly _data: Map<string, Map<string, T>> = new Map();
    public get data() {
        return this._data;
    }

    /**
     * Get the number of userIds present in the AudienceData.  To get the number of clientIds for
     * a specific userId, the caller should make an operation directly on the AudienceData's
     * internal data.
     */
    public get size() {
        return this._data.size;
    }

    /**
     * Get the stored value for a userId and clientId.  The userId is not required, but omitting it
     * will result in iteration over all stored userIds to find a matching clientId.
     * @param userId - The userId to match
     * @param clientId - The clientId to match
     * @returns The value for the specified key combination, or undefined if the key combination is
     * not present
     */
    public get(userId: string | undefined, clientId: string): T | undefined {
        if (userId !== undefined) {
            return this._data.get(userId)?.get(clientId);
        }
        this._data.forEach((clientIdMap, userIdKey) => {
            if (clientIdMap.has(clientId)) {
                return clientIdMap.get(clientId);
            }
        });
        return undefined;
    }

    /**
     * Set the value for a userId and clientId
     * @param userId - The userId to set
     * @param clientId - The clientId to set
     * @param value - The value to set for the specified userId and clientId
     * @returns The AudienceData object
     */
    public set(userId: string, clientId: string, value: T): AudienceData<T> {
        let clientIdMap = this._data.get(userId);
        if (clientIdMap === undefined) {
            clientIdMap = new Map<string, T>();
            this._data.set(userId, clientIdMap);
        }
        clientIdMap.set(clientId, value);
        return this;
    }

    /**
     * Checks if the specified key(s) exist.  Providing only the clientId will result in iteration
     * over all stored userIds.  userIds whose clientIds have all disconnected will have been
     * deleted and will not show as present.
     * @param userId - The userId to check
     * @param clientId - The clientId to checl
     * @returns if there is a value present for the key combination
     */
    public has(userId: string | undefined, clientId: string | undefined): boolean {
        if (clientId === undefined) {
            if (userId === undefined) {
                return false;
            } else {
                return this._data.has(userId);
            }
        } else if (userId === undefined) {
            this._data.forEach((clientIdMap, userIdKey) => {
                if (clientIdMap.has(clientId)) {
                    return true;
                }
            });
            return false;
        } else {
            return this._data.get(userId)?.has(clientId) ?? false;
        }
    }

    /**
     * Remove all elements from the AudienceData object, or remove all elements for the specified
     * userId from the AudienceData object if provided.
     * @param userId - Optional userId for which to remove all elements
     */
    public clear(userId?: string): void {
        if (userId !== undefined) {
            this._data.get(userId)?.clear();
        } else {
            this._data.clear();
        }
    }

    /**
     * Remove the element for the specified key(s).  In the case that this would result in a userId
     * having no more associated clientIds, the userId is removed as well.  Providing only the
     * clientId will result in iteration over all stored userIds.
     * @param userId - The userId to remove
     * @param clientId - The clientId to remove
     * @returns if an element was removed
     */
    public delete(userId: string | undefined, clientId: string | undefined): boolean {
        if (clientId === undefined) {
            if (userId === undefined) {
                return false;
            } else {
                return this._data.delete(userId);
            }
        } else if (userId === undefined) {
            this._data.forEach((clientIdMap, userIdKey) => {
                if (clientIdMap.has(clientId)) {
                    clientIdMap.delete(clientId);
                    if (clientIdMap.size === 0) {
                        this._data.delete(userIdKey);
                    }
                    return true;
                }
            });
            return false;
        } else {
            const deleted = this._data.get(userId)?.delete(clientId) ?? false;
            if (this._data.get(userId)?.size === 0) {
                this._data.delete(userId);
            }
            return deleted;
        }
    }
}
