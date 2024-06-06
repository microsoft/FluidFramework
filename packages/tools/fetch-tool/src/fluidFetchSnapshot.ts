/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "fs";
import util from "util";

import { bufferToString, stringToBuffer } from "@fluid-internal/client-utils";
import {
	IDocumentService,
	IDocumentStorageService,
	ISnapshotTree,
	IVersion,
} from "@fluidframework/driver-definitions/internal";

import { formatNumber } from "./fluidAnalyzeMessages.js";
import {
	dumpSnapshotStats,
	dumpSnapshotTrees,
	dumpSnapshotVersions,
	paramActualFormatting,
	paramNumSnapshotVersions,
	paramSnapshotVersionIndex,
} from "./fluidFetchArgs.js";
import { latestVersionsId } from "./fluidFetchInit.js";

interface ISnapshotInfo {
	blobCountNew: number;
	blobCount: number;
	size: number;
	sizeNew: number;
}

type IFetchedData = IFetchedBlob | IFetchedTree;

interface IFetchedBlob {
	treePath: string;
	filename: string;
	blobId: string;
	blob: Promise<ArrayBufferLike | undefined>;
	reused: boolean;
}

interface IFetchedTree {
	treePath: string;
	blobId: string;
	filename: string;
	blob: ArrayBufferLike;

	reused: false;

	patched: boolean;
}

function isFetchedTree(fetchedData: IFetchedData): fetchedData is IFetchedTree {
	return "patched" in fetchedData;
}

const blobCache = new Map<string, Promise<ArrayBufferLike>>();
let blobCachePrevious = new Map<string, Promise<ArrayBufferLike>>();
let blobCacheCurrent = new Map<string, Promise<ArrayBufferLike>>();

function fetchBlobs(
	prefix: string,
	tree: ISnapshotTree,
	storage: IDocumentStorageService,
	blobIdMap: Map<string, number>,
) {
	const result: IFetchedBlob[] = [];
	for (const item of Object.keys(tree.blobs)) {
		const treePath = `${prefix}${item}`;
		const blobId = tree.blobs[item];
		if (blobId !== null) {
			let reused = true;
			let blob = blobCachePrevious.get(blobId);
			if (!blob) {
				reused = false;
				blob = blobCache.get(blobId);
				if (blob === undefined) {
					blob = storage.readBlob(blobId);
					blobCache.set(blobId, blob);
				}
			}
			blobCacheCurrent.set(blobId, blob);

			// Use the blobIdMap to assign a number for each unique blob
			// and use it as a prefix for files to avoid case-insensitive fs
			let index = blobIdMap.get(blobId);
			if (index === undefined) {
				index = blobIdMap.size;
				blobIdMap.set(blobId, index);
			}
			const filename = `${index}-${blobId}`;
			result.push({ treePath, blobId, blob, reused, filename });

			// patch the tree so that we can write it out to reference the file
			tree.blobs[item] = filename;
		}
	}
	return result;
}

function createTreeBlob(tree: ISnapshotTree, prefix: string, patched: boolean): IFetchedTree {
	const id = tree.id ?? "original";
	const blob = stringToBuffer(JSON.stringify(tree), "utf8");
	const filename = patched ? "tree" : `tree-${id}`;
	const treePath = `${prefix}${filename}`;
	return { treePath, blobId: "original tree $id", filename, blob, patched, reused: false };
}

async function fetchBlobsFromSnapshotTree(
	storage: IDocumentStorageService,
	tree: ISnapshotTree,
	prefix: string = "/",
	parentBlobIdMap?: Map<string, number>,
): Promise<IFetchedData[]> {
	const isTopLevel = !parentBlobIdMap;
	if (isTopLevel && dumpSnapshotTrees) {
		console.log(tree);
	}

	if (prefix === "/") {
		blobCachePrevious = blobCacheCurrent;
		blobCacheCurrent = new Map<string, Promise<ArrayBufferLike>>();
	}

	// Create the tree info before fetching blobs (which will modify it)
	let topLevelBlob: IFetchedTree | undefined;
	if (isTopLevel) {
		topLevelBlob = createTreeBlob(tree, prefix, false);
	}

	const blobIdMap = parentBlobIdMap ?? new Map<string, number>();
	let result: IFetchedData[] = fetchBlobs(prefix, tree, storage, blobIdMap);

	for (const subtreeId of Object.keys(tree.trees)) {
		const subtree = tree.trees[subtreeId];
		const dataStoreBlobs = await fetchBlobsFromSnapshotTree(
			storage,
			subtree,
			`${prefix}${subtreeId}/`,
			blobIdMap,
		);
		result = result.concat(dataStoreBlobs);
	}

	if (topLevelBlob) {
		result.push(topLevelBlob);
		result.push(createTreeBlob(tree, prefix, true));
	}
	return result;
}

function getDumpFetchedData(fetchedData: IFetchedData[]) {
	const sorted = fetchedData.sort((a, b) => a.treePath.localeCompare(b.treePath));
	return sorted.filter((item) => !isFetchedTree(item) || !item.patched);
}

async function dumpSnapshotTreeVerbose(name: string, fetchedData: IFetchedData[]) {
	let size = 0;
	const sorted = getDumpFetchedData(fetchedData);

	let nameLength = 10;
	for (const item of sorted) {
		nameLength = Math.max(nameLength, item.treePath.length);
	}

	console.log("");
	console.log(`${"Blob Path".padEnd(nameLength)} | Reused |      Bytes`);
	console.log("-".repeat(nameLength + 26));
	for (const item of sorted) {
		const buffer = await item.blob;
		if (buffer === undefined) {
			continue;
		}
		const blob = bufferToString(buffer, "utf8");
		console.log(
			`${item.treePath.padEnd(nameLength)} |    ${item.reused ? "X" : " "}   | ${formatNumber(
				blob.length,
			).padStart(10)}`,
		);
		size += blob.length;
	}

	console.log("-".repeat(nameLength + 26));
	console.log(
		`${"Total snapshot size".padEnd(nameLength)} |        | ${formatNumber(size).padStart(10)}`,
	);
}

async function dumpSnapshotTree(name: string, fetchedData: IFetchedData[]): Promise<ISnapshotInfo> {
	let size = 0;
	let sizeNew = 0;
	let blobCountNew = 0;
	const sorted = getDumpFetchedData(fetchedData);

	for (const item of sorted) {
		const buffer = await item.blob;
		if (buffer === undefined) {
			continue;
		}
		const blob = bufferToString(buffer, "utf8");
		if (!item.reused) {
			sizeNew += blob.length;
			blobCountNew++;
		}
		size += blob.length;
	}

	return { blobCountNew, blobCount: sorted.length, size, sizeNew };
}

async function saveSnapshot(name: string, fetchedData: IFetchedData[], saveDir: string) {
	const outDir = `${saveDir}/${name}/`;
	const mkdir = util.promisify(fs.mkdir);

	await mkdir(`${outDir}/decoded`, { recursive: true });
	await Promise.all(
		fetchedData.map(async (item) => {
			const buffer = await item.blob;
			if (buffer === undefined) {
				console.error(`ERROR: Unable to get data for blob ${item.blobId}`);
				return;
			}

			if (!isFetchedTree(item)) {
				// Just write the data as is.
				fs.writeFileSync(`${outDir}/${item.filename}`, Buffer.from(buffer));

				// we assume that the buffer is utf8 here, which currently is true for
				// all of our snapshot blobs.  It doesn't necessary be true in the future
				let decoded = bufferToString(buffer, "utf8");
				try {
					if (!paramActualFormatting) {
						decoded = JSON.stringify(JSON.parse(decoded), undefined, 2);
					}
				} catch (e) {}
				fs.writeFileSync(`${outDir}/decoded/${item.filename}.json`, decoded);
			} else {
				// Write out same data for tree decoded or not, except for formatting
				const treeString = bufferToString(buffer, "utf8");
				fs.writeFileSync(`${outDir}/${item.filename}.json`, treeString);
				fs.writeFileSync(
					`${outDir}/decoded/${item.filename}.json`,
					paramActualFormatting
						? treeString
						: JSON.stringify(JSON.parse(treeString), undefined, 2),
				);
			}
		}),
	);
}

async function fetchBlobsFromVersion(storage: IDocumentStorageService, version: IVersion) {
	const tree = await reportErrors(
		`getSnapshotTree ${version.id}`,
		storage.getSnapshotTree(version),
	);
	if (!tree) {
		throw new Error("Failed to load snapshot tree");
	}
	return fetchBlobsFromSnapshotTree(storage, tree);
}

async function reportErrors<T>(message: string, res: Promise<T>) {
	try {
		return await res;
	} catch (error) {
		console.error(`Error calling ${message}`);
		throw error;
	}
}

export async function fluidFetchSnapshot(documentService?: IDocumentService, saveDir?: string) {
	if (
		!dumpSnapshotStats &&
		!dumpSnapshotTrees &&
		!dumpSnapshotVersions &&
		saveDir === undefined
	) {
		return;
	}

	// --local mode - do not connect to storage.
	// For now, bail out early.
	// In future, separate download from analyzes parts and allow offline analyzes
	if (!documentService) {
		return;
	}

	console.log("\n");

	const storage = await documentService.connectToStorage();

	let version: IVersion | undefined;
	const versions = await reportErrors(
		`getVersions ${latestVersionsId}`,
		storage.getVersions(latestVersionsId, paramNumSnapshotVersions),
	);
	if (dumpSnapshotVersions) {
		console.log("Snapshot versions");
		console.log(versions);
	}

	let blobsToDump: IFetchedData[] | undefined;
	if (paramSnapshotVersionIndex !== undefined) {
		version = versions[paramSnapshotVersionIndex];
		if (version === undefined) {
			console.log(
				`There are only ${versions.length} snapshots, --snapshotVersionIndex is too large`,
			);
			return;
		}
		if (saveDir !== undefined) {
			blobsToDump = await fetchBlobsFromVersion(storage, version);
			const name = version.id;
			console.log(`Saving snapshot ${name}`);
			await saveSnapshot(name, blobsToDump, saveDir);
		}
	} else {
		version = versions[0];
		if (saveDir !== undefined && versions.length > 0) {
			console.log(
				"  Name          |                    Date |       Size |   New Size |  Blobs | New Blobs",
			);
			console.log("-".repeat(86));

			// Go in reverse order, to correctly calculate blob reuse - from oldest to newest snapshots
			for (let i = versions.length - 1; i >= 0; i--) {
				const v = versions[i];
				const blobs = await fetchBlobsFromVersion(storage, v);
				blobsToDump = blobs;
				const name = `${i}-${v.id}`;
				const res = await dumpSnapshotTree(name, blobs);

				let date = "";
				if (v.date !== undefined) {
					try {
						date = new Date(v.date).toLocaleString();
					} catch (e) {
						date = v.date.replace("T", " ");
						const index = date.lastIndexOf(".");
						if (index > 0) {
							date = `${date.substr(0, index)} Z`;
						}
					}
				}
				date = date.padStart(23);
				const size = formatNumber(res.size).padStart(10);
				const sizeNew = formatNumber(res.sizeNew).padStart(10);
				const blobCount = formatNumber(res.blobCount).padStart(6);
				const blobCountNew = formatNumber(res.blobCountNew).padStart(9);

				console.log(
					`${name.padEnd(
						15,
					)} | ${date} | ${size} | ${sizeNew} | ${blobCount} | ${blobCountNew}`,
				);

				await saveSnapshot(name, blobs, saveDir);
			}
		}
	}

	if (dumpSnapshotStats || dumpSnapshotTrees) {
		if (version === undefined) {
			console.log("No snapshot tree");
		} else {
			if (blobsToDump === undefined) {
				blobsToDump = await fetchBlobsFromVersion(storage, version);
			}
			console.log(`\n\nSnapshot version ${version.id}`);
			await dumpSnapshotTreeVerbose(version.id, blobsToDump);
		}
	}
}
