/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as isomorphicGit from "isomorphic-git";
import * as resources from "@fluidframework/gitresources";
import { NetworkError } from "@fluidframework/server-services-client";
import { Lumberjack } from "@fluidframework/server-services-telemetry";

type IsomorphicGitTreeEntryType = "commit" | "blob" | "tree";
type IsomorphicGitTagObjectType = IsomorphicGitTreeEntryType | "tag";

function ensureIsomorphicGitTreeEntryType(
	originalITreeEntryType: string,
): IsomorphicGitTreeEntryType {
	if (!["commit", "blob", "tree"].includes(originalITreeEntryType)) {
		throw new NetworkError(400, "Invalid TreeEntry type.");
	}

	return originalITreeEntryType as IsomorphicGitTreeEntryType;
}

function ensureIsomorphicGitTagObjectType(originalITagType: string): IsomorphicGitTagObjectType {
	if (!["commit", "blob", "tree", "tag"].includes(originalITagType)) {
		throw new NetworkError(400, "Invalid Tag Object type.");
	}

	return originalITagType as IsomorphicGitTagObjectType;
}

function oidToCommitHash(oid: string): resources.ICommitHash {
	return { sha: oid, url: "" };
}

function getIAuthorOrICommitterOrITaggerFromIsoGitData(
	isoGitObjectData:
		| isomorphicGit.CommitObject["author"]
		| isomorphicGit.CommitObject["committer"]
		| isomorphicGit.TagObject["tagger"],
): resources.IAuthor | resources.ICommitter | resources.ITagger {
	return {
		date: new Date(isoGitObjectData.timestamp * 1000).toISOString(),
		email: isoGitObjectData.email,
		name: isoGitObjectData.name,
	};
}

function getIsoGitAuthorOrCommitterOrTaggerFromCommitOrTag(
	data: resources.IAuthor | resources.ICommitter | resources.ITagger,
):
	| isomorphicGit.CommitObject["author"]
	| isomorphicGit.CommitObject["committer"]
	| isomorphicGit.TagObject["tagger"] {
	const date = Date.parse(data.date);
	if (isNaN(date)) {
		Lumberjack.error("Invalid input date");
		throw new NetworkError(400, "Invalid input");
	}

	// Date.parse() returns a value in milliseconds, and Isomorphic-Git expects
	// a timestamp number time in seconds (UTC Unix timestamp)
	const timestamp = Math.floor(date / 1000);

	return {
		name: data.name,
		email: data.email,
		timestamp,
		timezoneOffset: 0,
	};
}

/**
 * Helper function to convert an `isomorphic-git` ReadCommitResult to our resource representation
 */
export function commitToICommit(commitResult: isomorphicGit.ReadCommitResult): resources.ICommit {
	return {
		author: getIAuthorOrICommitterOrITaggerFromIsoGitData(commitResult.commit.author),
		committer: getIAuthorOrICommitterOrITaggerFromIsoGitData(commitResult.commit.committer),
		message: commitResult.commit.message,
		parents:
			commitResult.commit.parent && commitResult.commit.parent.length > 0
				? commitResult.commit.parent.map((parent) => oidToCommitHash(parent))
				: [],
		sha: commitResult.oid,
		tree: {
			sha: commitResult.commit.tree,
			url: "",
		},
		url: "",
	};
}

/**
 * Helper function to convert our Create Commit parameters to
 * `isomorphic-git`'s CommitObject type.
 */
export function iCreateCommitParamsToCommitObject(
	commitParams: resources.ICreateCommitParams,
): isomorphicGit.CommitObject {
	const parent =
		commitParams.parents && commitParams.parents.length > 0 ? commitParams.parents : [];
	return {
		message: commitParams.message,
		tree: commitParams.tree,
		parent,
		author: getIsoGitAuthorOrCommitterOrTaggerFromCommitOrTag(commitParams.author),
		committer: getIsoGitAuthorOrCommitterOrTaggerFromCommitOrTag(commitParams.author),
	};
}

/**
 * Helper function to convert an `isomorphic-git` ReadBlobResult to our resource representation
 */
export function blobToIBlob(
	readBlobResponse: isomorphicGit.ReadBlobResult,
	owner: string,
	repo: string,
): resources.IBlob {
	const buffer = Buffer.from(readBlobResponse.blob).toString("base64");
	const sha = readBlobResponse.oid;
	return {
		content: buffer,
		encoding: "base64",
		sha,
		size: buffer.length,
		url: `/repos/${owner}/${repo}/git/blobs/${sha}`,
	};
}

/**
 * Helper function to convert reference-related parameters into our resource representation.
 */
export function refToIRef(resolvedRef: string, expandedRef: string): resources.IRef {
	return {
		object: {
			sha: resolvedRef,
			type: "",
			url: "",
		},
		ref: expandedRef,
		url: "",
	};
}

/**
 * Helper function to convert an `isomorphic-git` TreeEntry to our resource representation ITreeEntry
 */
export function treeEntryToITreeEntry(treeEntry: isomorphicGit.TreeEntry): resources.ITreeEntry {
	return {
		// remove leading 0s from hexadecimal mode string coming from isomorphic-git
		mode: parseInt(treeEntry.mode, 16).toString(16),
		path: treeEntry.path,
		sha: treeEntry.oid,
		size: 0,
		type: treeEntry.type,
		url: "",
	};
}

/**
 * Helper function to convert our Create Tree Entry to an `isomorphic-git` TreeEntry
 */
export function iCreateTreeEntryToTreeEntry(
	createTreeEntry: resources.ICreateTreeEntry,
): isomorphicGit.TreeEntry {
	return {
		mode: createTreeEntry.mode,
		path: createTreeEntry.path,
		oid: createTreeEntry.sha,
		type: ensureIsomorphicGitTreeEntryType(createTreeEntry.type),
	};
}

/**
 * Helper function to convert an `isomorphic-git` ReadTagResult to our resource representation of a tag
 */
export async function tagToITag(tagResult: isomorphicGit.ReadTagResult): Promise<resources.ITag> {
	return {
		message: tagResult.tag.message,
		object: {
			sha: tagResult.tag.object,
			type: tagResult.tag.type,
			url: "",
		},
		sha: tagResult.oid,
		tag: tagResult.tag.tag,
		tagger: getIAuthorOrICommitterOrITaggerFromIsoGitData(tagResult.tag.tagger),
		url: "",
	};
}

/**
 * Helper function to convert our Create Tag parameters to an `isomorphic-git` TagObject
 */
export function iCreateTagParamsToTagObject(
	tagParams: resources.ICreateTagParams,
): isomorphicGit.TagObject {
	return {
		object: tagParams.object,
		type: ensureIsomorphicGitTagObjectType(tagParams.type),
		tag: tagParams.tag,
		message: tagParams.message,
		tagger: getIsoGitAuthorOrCommitterOrTaggerFromCommitOrTag(tagParams.tagger),
	};
}
