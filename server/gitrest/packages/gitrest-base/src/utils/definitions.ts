/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fsPromises from "fs/promises";
import * as git from "@fluidframework/gitresources";

export enum Constants {
	StorageRoutingIdHeader = "Storage-Routing-Id",
	StorageNameHeader = "Storage-Name",
	IsEphemeralContainer = "Is-Ephemeral-Container",
}

export interface IStorageDirectoryConfig {
	useRepoOwner: boolean;
	baseDir?: string;
	suffixPath?: string;
}

export interface IExternalWriterConfig {
	enabled: boolean;
}

export interface IRepositoryManager {
	path: string;
	getCommit(sha: string): Promise<git.ICommit>;
	getCommits(
		sha: string,
		count: number,
		externalWriterConfig?: IExternalWriterConfig,
	): Promise<git.ICommitDetails[]>;
	getTree(root: string, recursive: boolean): Promise<git.ITree>;
	getBlob(sha: string): Promise<git.IBlob>;
	getContent(commit: string, path: string): Promise<git.IBlob>;
	createBlob(createBlobParams: git.ICreateBlobParams): Promise<git.ICreateBlobResponse>;
	createTree(params: git.ICreateTreeParams): Promise<git.ITree>;
	createCommit(commit: git.ICreateCommitParams): Promise<git.ICommit>;
	getRefs(): Promise<git.IRef[]>;
	getRef(ref: string, externalWriterConfig?: IExternalWriterConfig): Promise<git.IRef>;
	createRef(
		createRefParams: git.ICreateRefParams & { force?: boolean },
		externalWriterConfig?: IExternalWriterConfig,
	): Promise<git.IRef>;
	patchRef(
		refId: string,
		patchRefParams: git.IPatchRefParams,
		externalWriterConfig?: IExternalWriterConfig,
	): Promise<git.IRef>;
	deleteRef(refId: string): Promise<void>;
	getTag(tagId: string): Promise<git.ITag>;
	createTag(tagParams: git.ICreateTagParams): Promise<git.ITag>;
}

/**
 * Subset of Node.js `fs/promises` API.
 */
export interface IFileSystemPromises {
	readFile: (
		...args: Parameters<typeof fsPromises.readFile>
	) => ReturnType<typeof fsPromises.readFile>;
	writeFile: (
		...args: Parameters<typeof fsPromises.writeFile>
	) => ReturnType<typeof fsPromises.writeFile>;
	unlink: (...args: Parameters<typeof fsPromises.unlink>) => ReturnType<typeof fsPromises.unlink>;
	readdir: (
		...args: Parameters<typeof fsPromises.readdir>
	) => ReturnType<typeof fsPromises.readdir>;
	mkdir: (...args: Parameters<typeof fsPromises.mkdir>) => ReturnType<typeof fsPromises.mkdir>;
	rmdir: (...args: Parameters<typeof fsPromises.rmdir>) => ReturnType<typeof fsPromises.rmdir>;
	stat: (...args: Parameters<typeof fsPromises.stat>) => ReturnType<typeof fsPromises.stat>;
	lstat: (...args: Parameters<typeof fsPromises.lstat>) => ReturnType<typeof fsPromises.lstat>;
	readlink: (
		...args: Parameters<typeof fsPromises.readlink>
	) => ReturnType<typeof fsPromises.readlink>;
	symlink: (
		...args: Parameters<typeof fsPromises.symlink>
	) => ReturnType<typeof fsPromises.symlink>;
	chmod: (...args: Parameters<typeof fsPromises.chmod>) => ReturnType<typeof fsPromises.chmod>;
	rm: (...args: Parameters<typeof fsPromises.rm>) => ReturnType<typeof fsPromises.rm>;
}

/**
 * A filesystem representation.
 */
export interface IFileSystemManager {
	promises: IFileSystemPromises;
}

export interface IFileSystemManagerParams {
	storageName?: string;
	rootDir?: string;
}

export interface IFileSystemManagerFactory {
	create(fileSystemManagerParams?: IFileSystemManagerParams): IFileSystemManager;
	dispose?(): Promise<void>;
}

export interface IFileSystemManagerFactories {
	defaultFileSystemManagerFactory: IFileSystemManagerFactory;
	ephemeralFileSystemManagerFactory?: IFileSystemManagerFactory;
}

export interface IStorageRoutingId {
	tenantId: string;
	documentId: string;
}

export function isIStorageRoutingId(routingId: unknown): routingId is IStorageRoutingId {
	return (
		typeof routingId === "object" &&
		routingId !== null &&
		"tenantId" in routingId &&
		typeof routingId.tenantId === "string" &&
		"documentId" in routingId &&
		typeof routingId.documentId === "string"
	);
}

export interface IRepoManagerParams {
	repoOwner: string;
	repoName: string;
	storageRoutingId?: IStorageRoutingId;
	fileSystemManagerParams?: IFileSystemManagerParams;
	optimizeForInitialSummary?: boolean;
	isEphemeralContainer?: boolean;
}

export interface IRepositoryManagerFactory {
	/**
	 * Tries to create a new repository and return its manager instance.
	 * If the repository already exists, then it is returned.
	 */
	create(params: IRepoManagerParams): Promise<IRepositoryManager>;
	/**
	 * Open an existing repository and return its manager instance.
	 * If the repository does not exist, throws an error.
	 */
	open(params: IRepoManagerParams): Promise<IRepositoryManager>;
}

export interface IRepositoryManagerFactories {
	defaultRepositoryManagerFactories: Promise<IRepositoryManager>;
	ephemeralRepositoryManagerFactories: Promise<IRepositoryManager>;
}

// 100644 for file (blob)
// 100755 for executable (blob)
// 040000 for subdirectory (tree)
// 160000 for submodule (commit)
// 120000 for a blob that specifies the path of a symlink

/** Basic type (loose or packed) of any Git object. */
export enum GitObjectType {
	/** Object can be any of the following */
	any = -2,
	/** Object is invalid. */
	bad = -1,
	/** Reserved for future use. */
	ext1 = 0,
	/** A commit object. */
	commit = 1,
	/** A tree (directory listing) object. */
	tree = 2,
	/** A file revision object. */
	blob = 3,
	/** An annotated tag object. */
	tag = 4,
	/** Reserved for future use. */
	ext2 = 5,
	/** A delta, base is given by an offset. */
	ofsdelta = 6,
	/** A delta, base is given by object id. */
	refdelta = 7,
}
