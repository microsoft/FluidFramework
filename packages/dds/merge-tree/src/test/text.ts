/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { NonCollabClient, UniversalSequenceNumber } from "../constants.js";
import { MergeTree } from "../mergeTree.js";
import { Marker } from "../mergeTreeNodes.js";
import { ReferenceType } from "../ops.js";
import { reservedTileLabelsKey } from "../referencePositions.js";
import {
	overwriteInfo,
	type IHasInsertionInfo,
	type SegmentWithInfo,
} from "../segmentInfos.js";
import { TextSegment } from "../textSegment.js";

const defaultInsertionInfo: IHasInsertionInfo = {
	insert: {
		clientId: NonCollabClient,
		seq: UniversalSequenceNumber,
	},
};

export function loadSegments(
	content: string,
	segLimit: number,
	markers: boolean = false,
	withProps: boolean = true,
): SegmentWithInfo<IHasInsertionInfo>[] {
	const BOMFreeContent = content.replace(/^\uFEFF/, "");

	const paragraphs = BOMFreeContent.split(/\r?\n/);
	for (let i = 0, len = paragraphs.length; i < len; i++) {
		paragraphs[i] = paragraphs[i]
			.replace(/\r?\n/g, " ")
			.replace(/\u201C|\u201D/g, '"')
			.replace(/\u2019/g, "'");
		if (!markers && i !== paragraphs.length - 1) {
			paragraphs[i] += "\n";
		}
	}

	const segments: SegmentWithInfo<IHasInsertionInfo>[] = [];
	for (const paragraph of paragraphs) {
		let pgMarker: Marker | undefined;
		if (markers) {
			pgMarker = Marker.make(ReferenceType.Tile, { [reservedTileLabelsKey]: ["pg"] });
		}
		if (withProps) {
			if (paragraph.includes("Chapter") || paragraph.includes("PRIDE AND PREJ")) {
				if (pgMarker) {
					pgMarker.properties = { header: 2 };
					segments.push(overwriteInfo(new TextSegment(paragraph), defaultInsertionInfo));
				} else {
					segments.push(
						overwriteInfo(
							TextSegment.make(paragraph, { fontSize: "140%", lineHeight: "150%" }),
							defaultInsertionInfo,
						),
					);
				}
			} else {
				const emphStrings = paragraph.split("_");
				for (let i = 0, len = emphStrings.length; i < len; i++) {
					// eslint-disable-next-line no-bitwise
					if (i & 1) {
						if (emphStrings[i].length > 0) {
							segments.push(
								overwriteInfo(
									TextSegment.make(emphStrings[i], { fontStyle: "italic" }),
									defaultInsertionInfo,
								),
							);
						}
					} else {
						if (emphStrings[i].length > 0) {
							segments.push(
								overwriteInfo(new TextSegment(emphStrings[i]), defaultInsertionInfo),
							);
						}
					}
				}
			}
		} else {
			segments.push(overwriteInfo(new TextSegment(paragraph), defaultInsertionInfo));
		}
		if (pgMarker) {
			segments.push(overwriteInfo(pgMarker, defaultInsertionInfo));
		}
	}

	if (segLimit > 0) {
		segments.length = segLimit;
	}

	return segments;
}

export function loadText(
	content: string,
	mergeTree: MergeTree,
	segLimit: number,
	markers = false,
): MergeTree {
	const segments = loadSegments(content, segLimit, markers);
	mergeTree.reloadFromSegments(segments);
	return mergeTree;
}
