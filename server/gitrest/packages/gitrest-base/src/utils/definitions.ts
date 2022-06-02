/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fsPromises from "fs/promises";
import * as git from "@fluidframework/gitresources";

export enum Constants {
    StorageRoutingIdHeader = "Storage-Routing-Id",
    StorageNameHeader = "Storage-Name",
}

export interface IStorageDirectoryConfig {
    useRepoOwner: boolean;
    baseDir?: string;
}

export interface IExternalWriterConfig {
    enabled: boolean;
}

export interface IRepositoryManager {
    path: string;
    getCommit(sha: string): Promise<git.ICommit>;
    getCommits(sha: string, count: number, externalWriterConfig?: IExternalWriterConfig): Promise<git.ICommitDetails[]>;
    getTree(root: string, recursive: boolean): Promise<git.ITree>;
    getBlob(sha: string): Promise<git.IBlob>;
    getContent(commit: string, path: string): Promise<git.IBlob>;
    createBlob(createBlobParams: git.ICreateBlobParams): Promise<git.ICreateBlobResponse>;
    createTree(params: git.ICreateTreeParams): Promise<git.ITree>;
    createCommit(commit: git.ICreateCommitParams): Promise<git.ICommit>;
    getRefs(): Promise<git.IRef[]>;
    getRef(ref: string, externalWriterConfig?: IExternalWriterConfig): Promise<git.IRef>;
    createRef(createRefParams: git.ICreateRefParams, externalWriterConfig?: IExternalWriterConfig): Promise<git.IRef>;
    // eslint-disable-next-line max-len
    patchRef(refId: string, patchRefParams: git.IPatchRefParams, externalWriterConfig?: IExternalWriterConfig): Promise<git.IRef>;
    deleteRef(refId: string): Promise<void>;
    getTag(tagId: string): Promise<git.ITag>;
    createTag(tagParams: git.ICreateTagParams): Promise<git.ITag>;
}

/**
 * Subset of Node.js `fs/promises` API.
 */
export interface IFileSystemPromises {
    readFile: typeof fsPromises.readFile;
    writeFile: typeof fsPromises.writeFile;
    unlink: typeof fsPromises.unlink;
    readdir: typeof fsPromises.readdir;
    mkdir: typeof fsPromises.mkdir;
    rmdir: typeof fsPromises.rmdir;
    stat: typeof fsPromises.stat;
    lstat: typeof fsPromises.lstat;
    readlink: typeof fsPromises.readlink;
    symlink: typeof fsPromises.symlink;
    chmod: typeof fsPromises.chmod;
    rm: typeof fsPromises.rm;
}

/**
 * A filesystem representation.
 */
export interface IFileSystemManager {
    promises: IFileSystemPromises;
}

export interface IFileSystemManagerParams {
    storageName?: string;
}

export interface IFileSystemManagerFactory {
    create(fileSystemManagerParams?: IFileSystemManagerParams): IFileSystemManager;
}

export interface IStorageRoutingId {
    tenantId: string;
    documentId: string;
}

export interface IRepoManagerParams {
    repoOwner: string;
    repoName: string;
    storageRoutingId?: IStorageRoutingId;
    fileSystemManagerParams?: IFileSystemManagerParams;
}

export interface IRepositoryManagerFactory {
    /**
     * Create a new repository and return its manager instance.
     */
    create(params: IRepoManagerParams): Promise<IRepositoryManager>;
    /**
     * Open an existing repository and return its manager instance.
     */
    open(params: IRepoManagerParams): Promise<IRepositoryManager>;
}

// 100644 for file (blob)
// 100755 for executable (blob)
// 040000 for subdirectory (tree)
// 160000 for submodule (commit)
// 120000 for a blob that specifies the path of a symlink

/** Basic type (loose or packed) of any Git object. */
export enum GitObjectType {
    any = -2,       /** < Object can be any of the following */
    bad = -1,       /** < Object is invalid. */
    ext1 = 0,       /** < Reserved for future use. */
    commit = 1,     /** < A commit object. */
    tree = 2,       /** < A tree (directory listing) object. */
    blob = 3,       /** < A file revision object. */
    tag = 4,        /** < An annotated tag object. */
    ext2 = 5,       /** < Reserved for future use. */
    ofsdelta = 6,   /** < A delta, base is given by an offset. */
    refdelta = 7,   /** < A delta, base is given by object id. */
}

export enum BaseGitRestTelemetryProperties {
    directoryPath = "directoryPath",
    ref = "ref",
    repoName = "repoName",
    repoOwner = "repoOwner",
    sha = "sha",
    storageName = "storageName",
    summaryType = "summaryType",
}
