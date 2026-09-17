/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { OdspErrorTypes } from "@fluidframework/odsp-driver-definitions/internal";

export interface VersionRef {
	readonly versionId: string;
	readonly lastModifiedDateTime: string;
}

export interface ResolvedVersion extends VersionRef {
	readonly sequenceNumber: number;
	readonly latestSequenceNumber?: number;
}

export type BaseForSeq =
	| {
			readonly kind: "found";
			readonly base: ResolvedVersion;
	  }
	| {
			readonly kind: "noBaseVersion";
			readonly oldestResolvedSeq?: number;
	  };

/**
 * Selects the closest sealed version at or before a target.
 *
 * The newest version is mutable and excluded. If older retained history crosses an epoch boundary
 * after a candidate has been found, that candidate remains usable and the older lineage is ignored.
 */
export async function findBaseForSeqFromVersions(
	versions: readonly VersionRef[],
	target: number,
	resolveSequenceNumber: (versionId: string) => Promise<number>,
): Promise<BaseForSeq> {
	let closestBase: ResolvedVersion | undefined;
	let oldestResolvedSeq: number | undefined;
	for (const version of versions.slice(1)) {
		let sequenceNumber: number;
		try {
			sequenceNumber = await resolveSequenceNumber(version.versionId);
		} catch (error) {
			if (
				closestBase !== undefined &&
				(error as { errorType?: unknown } | undefined)?.errorType ===
					OdspErrorTypes.fileOverwrittenInStorage
			) {
				break;
			}
			throw error;
		}
		oldestResolvedSeq =
			oldestResolvedSeq === undefined
				? sequenceNumber
				: Math.min(oldestResolvedSeq, sequenceNumber);
		if (
			sequenceNumber <= target &&
			(closestBase === undefined || sequenceNumber > closestBase.sequenceNumber)
		) {
			closestBase = { ...version, sequenceNumber };
		}
	}
	if (closestBase !== undefined) {
		return { kind: "found", base: closestBase };
	}
	return oldestResolvedSeq === undefined
		? { kind: "noBaseVersion" }
		: { kind: "noBaseVersion", oldestResolvedSeq };
}
