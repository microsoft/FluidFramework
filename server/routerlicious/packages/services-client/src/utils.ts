/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as resources from "@fluidframework/gitresources";
import {
	FileMode,
	ISnapshotTreeEx,
	ITreeEntry,
	MessageType,
	SummaryObject,
	SummaryType,
	TreeEntry,
} from "@fluidframework/protocol-definitions";
import Axios, { AxiosRequestHeaders } from "axios";

export async function getOrCreateRepository(
	endpoint: string,
	owner: string,
	repository: string,
	headers?: AxiosRequestHeaders,
): Promise<void> {
	console.log(`Get Repo: ${endpoint}/${owner}/${repository}`);

	const details = await Axios.get(`${endpoint}/repos/${owner}/${repository}`, { headers }).catch(
		(error) => {
			if (error.response && error.response.status === 400) {
				return null;
			} else {
				throw error;
			}
		},
	);

	if (!details || details.status === 400) {
		console.log(`Create Repo: ${endpoint}/${owner}/${repository}`);
		const createParams: resources.ICreateRepoParams = {
			name: repository,
		};

		await Axios.post(`${endpoint}/${owner}/repos`, createParams, { headers });
	}
}

/**
 * getRandomInt is not and should not be used as part of any secure random number generation
 */
export const getRandomInt = (range: number) => Math.floor(Math.random() * range);

/**
 * NOTE: Duplicated this function from common-utils
 *
 * This function can be used to assert at compile time that a given value has type never.
 * One common usage is in the default case of a switch block,
 * to ensure that all cases are explicitly handled.
 */
export function unreachableCase(_: never, message = "Unreachable Case"): never {
	throw new Error(message);
}

/**
 * Take a summary object and returns its type.
 *
 * @param value - summary object
 * @returns the type of summary object
 */
export function getGitType(value: SummaryObject): "blob" | "tree" {
	const type = value.type === SummaryType.Handle ? value.handleType : value.type;

	switch (type) {
		case SummaryType.Blob:
		case SummaryType.Attachment:
			return "blob";
		case SummaryType.Tree:
			return "tree";
		default:
			unreachableCase(type, `Unknown type: ${type}`);
	}
}

/**
 * NOTE: found a similar function in services-client#storageUtils.ts
 *
 * Build a tree hierarchy base on a flat tree
 *
 * @param flatTree - a flat tree
 * @param blobsShaToPathCache - Map with blobs sha as keys and values as path of the blob.
 * @param removeAppTreePrefix - Remove `.app/` from beginning of paths when present
 * @returns the hierarchical tree
 */
export function buildHierarchy(
	flatTree: resources.ITree,
	blobsShaToPathCache: Map<string, string> = new Map<string, string>(),
	removeAppTreePrefix = false,
): ISnapshotTreeEx {
	const lookup: { [path: string]: ISnapshotTreeEx } = {};
	const root: ISnapshotTreeEx = { id: flatTree.sha, blobs: {}, trees: {} };
	lookup[""] = root;

	for (const entry of flatTree.tree) {
		const entryPath = removeAppTreePrefix ? entry.path.replace(/^\.app\//, "") : entry.path;
		const lastIndex = entryPath.lastIndexOf("/");
		const entryPathDir = entryPath.slice(0, Math.max(0, lastIndex));
		const entryPathBase = entryPath.slice(lastIndex + 1);

		// The flat output is breadth-first so we can assume we see tree nodes prior to their contents
		const node = lookup[entryPathDir];

		// Add in either the blob or tree
		if (entry.type === "tree") {
			const newTree = { id: entry.sha, blobs: {}, commits: {}, trees: {} };
			node.trees[decodeURIComponent(entryPathBase)] = newTree;
			lookup[entryPath] = newTree;
		} else if (entry.type === "blob") {
			node.blobs[decodeURIComponent(entryPathBase)] = entry.sha;
			blobsShaToPathCache.set(entry.sha, `/${entryPath}`);
		} else {
			throw new Error("Unknown entry type!!");
		}
	}

	return root;
}

/**
 * Check if the string is a service message type, which includes
 * MessageType.ClientJoin, MessageType.ClientLeave, MessageType.Control,
 * MessageType.NoClient, MessageType.SummaryAck, and MessageType.SummaryNack
 *
 * @param type - the type to check
 * @returns true if it is a system message type
 */
export const isServiceMessageType = (type: string) =>
	type === MessageType.ClientJoin ||
	type === MessageType.ClientLeave ||
	type === MessageType.Control ||
	type === MessageType.NoClient ||
	type === MessageType.SummaryAck ||
	type === MessageType.SummaryNack;

export function generateServiceProtocolEntries(deli: string, scribe: string): ITreeEntry[] {
	const serviceProtocolEntries: ITreeEntry[] = [
		{
			mode: FileMode.File,
			path: "deli",
			type: TreeEntry.Blob,
			value: {
				contents: deli,
				encoding: "utf-8",
			},
		},
	];

	serviceProtocolEntries.push({
		mode: FileMode.File,
		path: "scribe",
		type: TreeEntry.Blob,
		value: {
			contents: scribe,
			encoding: "utf-8",
		},
	});
	return serviceProtocolEntries;
}
