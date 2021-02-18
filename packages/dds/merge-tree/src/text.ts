/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as MergeTree from "./mergeTree";
import * as ops from "./ops";
import { TextSegment } from "./textSegment";

export function loadSegments(content: string, segLimit: number, markers: boolean = false, withProps: boolean = true) {
    const BOMFreeContent = content.replace(/^\uFEFF/, "");

    const paragraphs = BOMFreeContent.split(/\r?\n/);
    for (let i = 0, len = paragraphs.length; i < len; i++) {
        paragraphs[i] = paragraphs[i]
            .replace(/\r?\n/g, " ")
            .replace(/\u201c|\u201d/g, '"')
            .replace(/\u2019/g, "'");
        if (!markers && i !== paragraphs.length - 1) {
            paragraphs[i] += "\n";
        }
    }

    const segments = [] as MergeTree.ISegment[];
    for (const paragraph of paragraphs) {
        let pgMarker: MergeTree.Marker | undefined;
        if (markers) {
            pgMarker = MergeTree.Marker.make(ops.ReferenceType.Tile,
                { [MergeTree.reservedTileLabelsKey]: ["pg"] });
        }
        if (withProps) {
            if ((paragraph.includes("Chapter")) || (paragraph.includes("PRIDE AND PREJ"))) {
                if (pgMarker) {
                    pgMarker.addProperties({ header: 2 });
                    segments.push(new TextSegment(paragraph));
                } else {
                    segments.push(
                        TextSegment.make(paragraph, { fontSize: "140%", lineHeight: "150%" }));
                }
            } else {
                const emphStrings = paragraph.split("_");
                for (let i = 0, len = emphStrings.length; i < len; i++) {
                    // eslint-disable-next-line no-bitwise
                    if (i & 1) {
                        if (emphStrings[i].length > 0) {
                            segments.push(
                                TextSegment.make(emphStrings[i], { fontStyle: "italic" }));
                        }
                    } else {
                        if (emphStrings[i].length > 0) {
                            segments.push(new TextSegment(emphStrings[i]));
                        }
                    }
                }
            }
        } else {
            segments.push(new TextSegment(paragraph));
        }
        if (pgMarker) {
            segments.push(pgMarker);
        }
    }

    if (segLimit > 0) {
        segments.length = segLimit;
    }

    return segments;
}

export function loadText(content: string, mergeTree: MergeTree.MergeTree, segLimit: number, markers = false) {
    const segments = loadSegments(content, segLimit, markers);
    mergeTree.reloadFromSegments(segments);
    // console.log(`Number of Segments: ${segments.length}`);
    // console.log(`Height: ${mergeTree.getStats().maxHeight}`);
    // console.log(segTree.toString());
    return mergeTree;
}
