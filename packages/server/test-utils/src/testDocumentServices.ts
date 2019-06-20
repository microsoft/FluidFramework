/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IContentMessage,
    ICreateBlobResponse,
    IDocumentDeltaConnection,
    IDocumentDeltaStorageService,
    IDocumentMessage,
    IDocumentService,
    IDocumentStorageService,
    ISequencedDocumentMessage,
    ISignalMessage,
    ISnapshotTree,
    ISummaryHandle,
    ISummaryTree,
    ITree,
    IVersion,
} from "@prague/container-definitions";
import * as git from "@prague/gitresources";
import * as socketStorage from "@prague/routerlicious-socket-storage";
import { EventEmitter } from "events";

export class TestDocumentDeltaConnection extends EventEmitter implements IDocumentDeltaConnection {
    public readonly maxMessageSize = 16 * 1024;
    public existing: boolean;
    public parentBranch: string;
    public clientId: string;
    public initialMessages: ISequencedDocumentMessage[] | undefined;
    public initialContents: IContentMessage[] | undefined;
    public initialSignals: ISignalMessage[] | undefined;
    public documentId: string;
    public encrypted: boolean;
    public privateKey: string;
    public publicKey: string;

    constructor() {
        super();
    }

    public submit(message: IDocumentMessage): void {
        throw new Error("Method not implemented.");
    }

    public submitSignal(message: any): void {
        throw new Error("Method not implemented.");
    }

    public async submitAsync(message: IDocumentMessage): Promise<void> {
        throw new Error("Method not implemented.");
    }

    public disconnect() {
        return;
    }
}

export class TestDocumentStorageService implements IDocumentStorageService {
    public get repositoryUrl(): string {
        return "";
    }

    public getSnapshotTree(version?: IVersion): Promise<ISnapshotTree> {
        throw new Error("Method not implemented.");
    }

    public getVersions(commitId: string, count: number): Promise<IVersion[]> {
        throw new Error("Method not implemented.");
    }

    public async getContent(version: IVersion, path: string): Promise<string> {
        return "";
    }

    public read(blobId: string): Promise<string> {
        throw new Error("Method not implemented.");
    }

    public write(root: ITree, parents: string[], message: string): Promise<IVersion> {
        throw new Error("Method not implemented.");
    }

    public uploadSummary(commit: ISummaryTree): Promise<ISummaryHandle> {
        return Promise.reject("Method not implemented.");
    }

    public downloadSummary(handle: ISummaryHandle): Promise<ISummaryTree> {
        return Promise.reject("Invalid operation");
    }

    public async createBlob(file: Buffer): Promise<ICreateBlobResponse> {
        return null;
    }

    public async getBlob(blobId: string): Promise<git.IBlob> {
        return null;
    }

    public getRawUrl(blobId: string): string {
        return null;
    }
}

export class TestDocumentDeltaStorageService implements IDocumentDeltaStorageService {
    public get(from?: number, to?: number): Promise<ISequencedDocumentMessage[]> {
        throw new Error("Method not implemented.");
    }
}

export class TestDocumentService implements IDocumentService {
    private errorTracking = new socketStorage.DefaultErrorTracking();

    public async connectToStorage(): Promise<IDocumentStorageService> {
        return new TestDocumentStorageService();
    }

    public async connectToDeltaStorage(): Promise<IDocumentDeltaStorageService> {
        return new TestDocumentDeltaStorageService();
    }

    public async connectToDeltaStream(): Promise<IDocumentDeltaConnection> {
        return new TestDocumentDeltaConnection();
    }

    public branch(): Promise<string> {
        return Promise.reject("Not implemented");
    }

    public getErrorTrackingService() {
        return this.errorTracking;
    }
}
