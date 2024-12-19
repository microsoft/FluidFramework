/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { NonCollabClient, UniversalSequenceNumber } from "../constants.js";
import { MergeTree } from "../mergeTree.js";
import { Marker } from "../mergeTreeNodes.js";
import { ReferenceType } from "../ops.js";
import { reservedTileLabelsKey } from "../referencePositions.js";
import { setSegmentInfo, type IInsertionInfo, type SegmentWithInfo } from "../segmentInfos.js";
import { TextSegment } from "../textSegment.js";

const defaultInsertionInfo: IInsertionInfo = {
	clientId: NonCollabClient,
	seq: UniversalSequenceNumber,
};

export function loadSegments(
	content: string,
	segLimit: number,
	markers: boolean = false,
	withProps: boolean = true,
): SegmentWithInfo<IInsertionInfo>[] {
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

	const segments: SegmentWithInfo<IInsertionInfo>[] = [];
	for (const paragraph of paragraphs) {
		let pgMarker: Marker | undefined;
		if (markers) {
			pgMarker = Marker.make(ReferenceType.Tile, { [reservedTileLabelsKey]: ["pg"] });
		}
		if (withProps) {
			if (paragraph.includes("Chapter") || paragraph.includes("PRIDE AND PREJ")) {
				if (pgMarker) {
					pgMarker.properties = { header: 2 };
					segments.push(
						setSegmentInfo<IInsertionInfo>(defaultInsertionInfo, new TextSegment(paragraph)),
					);
				} else {
					segments.push(
						setSegmentInfo<IInsertionInfo>(
							defaultInsertionInfo,
							TextSegment.make(paragraph, { fontSize: "140%", lineHeight: "150%" }),
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
								setSegmentInfo<IInsertionInfo>(
									defaultInsertionInfo,
									TextSegment.make(emphStrings[i], { fontStyle: "italic" }),
								),
							);
						}
					} else {
						if (emphStrings[i].length > 0) {
							segments.push(
								setSegmentInfo<IInsertionInfo>(
									defaultInsertionInfo,
									new TextSegment(emphStrings[i]),
								),
							);
						}
					}
				}
			}
		} else {
			segments.push(
				setSegmentInfo<IInsertionInfo>(defaultInsertionInfo, new TextSegment(paragraph)),
			);
		}
		if (pgMarker) {
			segments.push(setSegmentInfo<IInsertionInfo>(defaultInsertionInfo, pgMarker));
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
