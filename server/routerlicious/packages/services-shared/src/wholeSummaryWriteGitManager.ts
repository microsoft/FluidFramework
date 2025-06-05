/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ICreateBlobParams,
	ICreateTreeEntry,
	ICreateTreeParams,
} from "@fluidframework/gitresources";
import { getGitMode, getGitType } from "@fluidframework/protocol-base";
import { SummaryObject, SummaryType } from "@fluidframework/protocol-definitions";
import {
	IWholeSummaryBlob,
	IWholeSummaryPayload,
	IWholeSummaryTree,
	IWholeSummaryTreeHandleEntry,
	IWholeSummaryTreeValueEntry,
	NetworkError,
	WholeSummaryTreeEntry,
} from "@fluidframework/server-services-client";
import { Lumberjack } from "@fluidframework/server-services-telemetry";

function getSummaryObjectFromWholeSummaryTreeEntry(entry: WholeSummaryTreeEntry): SummaryObject {
	if ((entry as IWholeSummaryTreeHandleEntry).id !== undefined) {
		return {
			type: SummaryType.Handle,
			handleType: entry.type === "tree" ? SummaryType.Tree : SummaryType.Blob,
			handle: (entry as IWholeSummaryTreeHandleEntry).id,
		};
	}
	if (entry.type === "blob") {
		return {
			type: SummaryType.Blob,
			// We don't use this in the code below. We mostly just care about summaryObject for type inference.
			content: "",
		};
	}
	if (entry.type === "tree") {
		return {
			type: SummaryType.Tree,
			// We don't use this in the code below. We mostly just care about summaryObject for type inference.
			tree: {},
			unreferenced: (entry as IWholeSummaryTreeValueEntry).unreferenced,
		};
	}
	Lumberjack.error("Unknown entry type", { entryType: entry.type });
	throw new NetworkError(400, `Unknown entry type: ${entry.type}`);
}

/**
 * @internal
 */
export class WholeSummaryWriteGitManager {
	constructor(
		/**
		 * Write blob to storage and return the git sha.
		 */
		private readonly writeBlob: (blob: ICreateBlobParams) => Promise<string>,
		/**
		 * Write tree to storage and return the git sha.
		 */
		private readonly writeTree: (tree: ICreateTreeParams) => Promise<string>,
	) {}

	public async writeSummary(payload: IWholeSummaryPayload): Promise<string> {
		return this.writeSummaryTreeCore(payload.entries);
	}

	private async writeSummaryTreeCore(
		wholeSummaryTreeEntries: WholeSummaryTreeEntry[],
	): Promise<string> {
		const entries: ICreateTreeEntry[] = await Promise.all(
			wholeSummaryTreeEntries.map(async (entry) => {
				const summaryObject = getSummaryObjectFromWholeSummaryTreeEntry(entry);
				const pathHandle = await this.writeSummaryTreeObject(entry, summaryObject);
				return {
					mode: getGitMode(summaryObject),
					path: entry.path,
					sha: pathHandle,
					type: getGitType(summaryObject),
				};
			}),
		);

		const treeHandle = await this.writeTree({ tree: entries });
		return treeHandle;
	}

	private async writeSummaryTreeObject(
		wholeSummaryTreeEntry: WholeSummaryTreeEntry,
		summaryObject: SummaryObject,
	): Promise<string> {
		switch (summaryObject.type) {
			case SummaryType.Blob:
				return this.writeSummaryBlob(
					(wholeSummaryTreeEntry as IWholeSummaryTreeValueEntry)
						.value as IWholeSummaryBlob,
				);
			case SummaryType.Tree:
				return this.writeSummaryTreeCore(
					(
						(wholeSummaryTreeEntry as IWholeSummaryTreeValueEntry)
							.value as IWholeSummaryTree
					).entries ?? [],
				);
			case SummaryType.Handle:
				return (wholeSummaryTreeEntry as IWholeSummaryTreeHandleEntry).id;
			default:
				throw new NetworkError(501, "Not Implemented");
		}
	}

	private async writeSummaryBlob(blob: IWholeSummaryBlob): Promise<string> {
		const blobSha = await this.writeBlob({
			content: blob.content,
			encoding: blob.encoding,
		});
		return blobSha;
	}
}
