/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as git from "@fluidframework/gitresources";
import * as api from "@fluidframework/protocol-definitions";
import {
    IWholeSummaryPayload,
    IWholeFlatSummary,
    IWriteSummaryResponse,
    IWholeSummaryPayloadType,
} from "./storageContracts";

/**
 * Required params to create ref with config
 */
export interface ICreateRefParamsExternal extends git.ICreateRefParams {
    config?: IExternalWriterConfig;
}

/**
 * Required params to get ref with config
 */
export interface IGetRefParamsExternal {
    config?: IExternalWriterConfig;
}

/**
 * Required params to patch ref with config
 */
export interface IPatchRefParamsExternal extends git.IPatchRefParams {
    config?: IExternalWriterConfig;
}

interface IExternalWriterConfig {
    enabled: boolean;
}

/**
 * Git cache data
 */
export interface IGitCache {
    // Cached blob values
    blobs: git.IBlob[];

    // Reference mapping
    refs: { [key: string]: string; };

    // All trees contained in the commit (includes submodules)
    trees: git.ITree[];

    // Commits for each module
    commits: git.ICommit[];
}

/**
 * Interface to a generic Git provider
 */
export interface IGitService {
    getBlob(sha: string): Promise<git.IBlob>;
    createBlob(blob: git.ICreateBlobParams): Promise<git.ICreateBlobResponse>;
    getContent(path: string, ref: string): Promise<any>;
    getCommits(sha: string, count: number): Promise<git.ICommitDetails[]>;
    getCommit(sha: string): Promise<git.ICommit>;
    createCommit(commit: git.ICreateCommitParams): Promise<git.ICommit>;
    getRefs(): Promise<git.IRef[]>;
    getRef(ref: string): Promise<git.IRef>;
    createRef(params: git.ICreateRefParams): Promise<git.IRef>;
    updateRef(ref: string, params: git.IPatchRefParams): Promise<git.IRef>;
    deleteRef(ref: string): Promise<void>;
    createTag(tag: git.ICreateTagParams): Promise<git.ITag>;
    getTag(tag: string): Promise<git.ITag>;
    createTree(tree: git.ICreateTreeParams): Promise<git.ITree>;
    getTree(sha: string, recursive: boolean): Promise<git.ITree>;
    createSummary(summary: IWholeSummaryPayload): Promise<IWriteSummaryResponse>;
    deleteSummary(softDelete: boolean): Promise<void>;
    getSummary(sha: string): Promise<IWholeFlatSummary>;
}

/**
 * The Historian extends the git service by providing access to document header information stored in
 * the repository
 */
export interface IHistorian extends IGitService {
    endpoint: string;

    /**
     * Retrieves the header for the given document
     */
    getHeader(sha: string): Promise<git.IHeader>;
    getFullTree(sha: string): Promise<any>;
}

export interface IGitManager {
    getHeader(id: string, sha: string): Promise<api.ISnapshotTree>;
    getFullTree(sha: string): Promise<any>;
    getCommit(sha: string): Promise<git.ICommit>;
    getCommits(sha: string, count: number): Promise<git.ICommitDetails[]>;
    getTree(root: string, recursive: boolean): Promise<git.ITree>;
    getBlob(sha: string): Promise<git.IBlob>;
    getRawUrl(sha: string): string;
    getContent(commit: string, path: string): Promise<git.IBlob>;
    createBlob(content: string, encoding: string): Promise<git.ICreateBlobResponse>;
    createGitTree(params: git.ICreateTreeParams): Promise<git.ITree>;
    createTree(files: api.ITree): Promise<git.ITree>;
    createCommit(commit: git.ICreateCommitParams): Promise<git.ICommit>;
    getRef(ref: string): Promise<git.IRef>;
    createRef(branch: string, sha: string): Promise<git.IRef>;
    upsertRef(branch: string, commitSha: string): Promise<git.IRef>;
    write(branch: string, inputTree: api.ITree, parents: string[], message: string): Promise<git.ICommit>;
    createSummary(summary: IWholeSummaryPayload): Promise<IWriteSummaryResponse>;
    deleteSummary(softDelete: boolean): Promise<void>;
    getSummary(sha: string): Promise<IWholeFlatSummary>;
}

/**
 * Uploads a summary to storage.
 */
export interface ISummaryUploadManager {
    /**
     * Writes summary tree to storage.
     * @param summaryTree - Summary tree to write to storage
     * @param parentHandle - Parent summary acked handle (if available from summary ack)
     * @param summaryType - type of summary being uploaded
     * @param sequenceNumber - optional reference sequence number of the summary
     * @returns Id of created tree as a string.
     */
    writeSummaryTree(
        summaryTree: api.ISummaryTree,
        parentHandle: string,
        summaryType: IWholeSummaryPayloadType,
        sequenceNumber?: number): Promise<string>;
}
