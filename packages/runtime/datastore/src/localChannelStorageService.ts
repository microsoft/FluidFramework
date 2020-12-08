/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IChannelStorageService } from "@fluidframework/datastore-definitions";
import { fromUtf8ToBase64, IsoBuffer } from "@fluidframework/common-utils";
import { IBlob, ITree, TreeEntry } from "@fluidframework/protocol-definitions";
import { listBlobsAtTreePath } from "@fluidframework/runtime-utils";

export class LocalChannelStorageService implements IChannelStorageService {
    constructor(private readonly tree: ITree) {
    }

    public async read(path: string): Promise<string> {
        const contents = this.readSync(path);
        return contents !== undefined ? Promise.resolve(contents) : Promise.reject(new Error("Not found"));
    }

    public async contains(path: string): Promise<boolean> {
        const contents = this.readSync(path);
        return contents !== undefined;
    }

    public async list(path: string): Promise<string[]> {
        return listBlobsAtTreePath(this.tree, path);
    }

    /**
     * Provides a synchronous access point to locally stored data
     */
    private readSync(path: string): string | undefined {
        return this.readSyncInternal(path, this.tree);
    }

    private readSyncInternal(path: string, tree: ITree): string | undefined {
        for (const entry of tree.entries) {
            switch (entry.type) {
                case TreeEntry.Blob:
                    if (path === entry.path) {
                        const blob = entry.value as IBlob;
                        return blob.encoding === "utf-8"
                            ? fromUtf8ToBase64(blob.contents)
                            : blob.contents;
                    }
                    break;

                case TreeEntry.Tree:
                    if (path.startsWith(entry.path)) {
                        return this.readSyncInternal(path.substr(entry.path.length + 1), entry.value as ITree);
                    }
                    break;

                default:
            }
        }

        return undefined;
    }
}

//
// Concrete example of an interface that has readBlob
//

// Some interface (as an example) that implements readBlob.
// This can be IDocumentStorage, IChannelStorageService, etc.
export interface IDocumentStorage {
    someOtherMethods(): void;

    readBlob(blobid: string): IsoBuffer;

    // This is optional (i.e. may not be on interface), but it's nice to have it here.
    // It basically says that underlying interface (like IDocumentStorage) could imlement readString()
    // if it wants to. It does not have to, but it may chose to do so if it has extra knowlege allowing
    // it to implement such functionality more efficiently
    // I.e. SPO driver may implement it because it already operates (for most part) with strings, going through
    // readBlob() would add more conversions, and thus make it slower.
    readString?(blobId: string): string;
}

// We expect mostconsumers of IDocumentStorage to want to use readString API, so different layers down the road
// (like Container, ContainerRuntime, etc.) could take IDocumentStorage and fill in missing readSTring.
// For simplicity of usage, we define new interface that has raedString
export type IDocumentStorageEx = IDocumentStorage & IHasReadString;
export const getDocumentStroageEx = (storage: IDocumentStorage): IDocumentStorageEx =>
    addReadString(storage);

//
// SHARED CODE
// To be used by various users like getDocumentStroageEx, IChannelStorageServiceEx, etc.
//

// This is what we add to such object.
export interface IHasReadString {
    readString(blobid: string): string;
}

// This is input to addReadString() - it basically defined any type that has readBlob
// Any object that satisfy this interace (like IFoo) will be accespted
export interface IHasReadBlob {
    readBlob(blobid: string): IsoBuffer;
}

// Function that takes any object that implements readBlob() and adds implementation of readString.
export function addReadString<T extends IHasReadBlob>(object: T): T & IHasReadString {
    const objectEx = object as T & IHasReadString;

    // check if readString is already implemented. If it is, nothing to do.
    // We are better off leaving it as is, as it can be implemented in more efficient way.
    if (objectEx.readString !== undefined) {
        return objectEx;
    }

    // make a copy and add method
    const copy = Object.create(objectEx) as T & IHasReadString;
    copy.readString = (...args) => {
        const buffer = copy.readBlob(...args);
        return buffer.toString("utf8");
    };
    return copy;
}
