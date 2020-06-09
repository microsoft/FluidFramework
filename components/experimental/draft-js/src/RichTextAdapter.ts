/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ISegment,
    Marker,
    MergeTreeDeltaType,
    ReferenceType,
    reservedMarkerIdKey,
    TextSegment,
} from "@fluidframework/merge-tree";
import { ISequenceDeltaRange, SharedString } from "@fluidframework/sequence";
import { CharacterMetadata, ContentBlock, ContentState, genKey, SelectionState } from "draft-js";
import { List, OrderedSet } from "immutable";

export const insertBlockStart = (
    text: SharedString,
    pos: number,
    key: string = genKey(),
    type: string = "unstyled",
): void => {
    text.insertMarker(pos, ReferenceType.RangeBegin, {
        [reservedMarkerIdKey]: key,
        blockType: type,
    });
};

export interface TextRange {
    start: number;
    end: number;
}

export interface BlockTextRange {
    startKey: string;
    startOffset: number;
    endKey: string;
    endOffset: number;
}

const draftTextStyleNames = new Set(["BOLD", "ITALIC", "UNDERLINE", "CODE"]);

export const draftStyleToSharedTextProp = (formats: OrderedSet<string>, styleName?: string): {} => {
    const prop = {};
    if (styleName === undefined) {
        for (const style of draftTextStyleNames) {
            prop[style] = formats.has(style) ? true : null;
        }
    } else if (draftTextStyleNames.has(styleName.toUpperCase())) {
        const style = styleName.toUpperCase();
        prop[style] = formats.has(style);
    } else {
        throw new Error(`Unknown style name ${styleName}`);
    }
    return prop;
};

const sharedTextStylePropToDraft = (prop: {}): OrderedSet<string> => {
    const result = [];
    for (const styleName of draftTextStyleNames) {
        if (prop[styleName] === true) {
            result.push(styleName);
        }
    }

    return OrderedSet.of<string>(...result);
};

export const selectionToBlockRange = (selection: SelectionState): BlockTextRange => ({
    startKey: selection.getStartKey(),
    startOffset: selection.getStartOffset(),
    endKey: selection.getEndKey(),
    endOffset: selection.getEndOffset(),
});

export const blockRangeToSelection = (range: BlockTextRange, hasFocus: boolean): SelectionState => new SelectionState({
    anchorKey: range.startKey,
    anchorOffset: range.startOffset,
    focusKey: range.endKey,
    focusOffset: range.endOffset,
    hasFocus,
});

export const textRangeToBlockTextRangeFromBlocks = (absPos: TextRange, blocks: ContentBlock[]): BlockTextRange => {
    const contentPos = { startKey: undefined, startOffset: 0, endKey: undefined, endOffset: 0 };

    let prevEnd = 0;
    for (const block of blocks) {
        prevEnd++;
        if (contentPos.startKey === undefined && absPos.start <= prevEnd + block.getLength()) {
            contentPos.startKey = block.getKey();
            contentPos.startOffset = absPos.start - prevEnd;
        }
        if (absPos.end <= prevEnd + block.getLength()) {
            contentPos.endKey = block.getKey();
            contentPos.endOffset = absPos.end - prevEnd;
            break;
        }
        prevEnd = prevEnd + block.getLength();
    }

    if (contentPos.endKey === undefined) {
        contentPos.endKey = blocks[blocks.length - 1].getKey();
        contentPos.endOffset = blocks[blocks.length - 1].getLength();
    }
    if (contentPos.startKey === undefined) {
        contentPos.startKey = contentPos.endKey;
        contentPos.startOffset = contentPos.endOffset;
    }

    return contentPos;
};

/**
 * Convert delta range to blocks and offsets
 * @param start Absolute position of start of the range
 * @param end Absolute position of the end of the range
 * @param content The ConstentState of the editor
 */
export const textRangeToBlockTextRange =
    (absPos: TextRange, content: ContentState): BlockTextRange =>
        textRangeToBlockTextRangeFromBlocks(absPos, content.getBlocksAsArray());

/**
 * Convert a DraftJS selection to a SharedString TextRange
 */
export const selectionToTextRange = (selection: SelectionState, content: ContentState): TextRange => {
    const position: TextRange = { start: 0, end: undefined };
    const range = selectionToBlockRange(selection);

    const blocks = content.getBlocksAsArray();
    let prevEnd = 0;
    for (const block of blocks) {
        prevEnd++;
        if (block.getKey() === range.startKey) {
            position.start = prevEnd + range.startOffset;
        }
        if (block.getKey() === range.endKey) {
            position.end = prevEnd + range.endOffset;
            break;
        }

        prevEnd = prevEnd + block.getLength();
    }

    if (position.end === undefined) {
        position.end = prevEnd;
    }

    return position;
};

export const sharedStringToBlockArary = (sharedString: SharedString): ContentBlock[] => {
    const blocks = [];
    let currentBlock: any = { key: undefined, text: "" };

    let characterList = [];
    sharedString.walkSegments((segment: ISegment) => {
        if (segment.type === "Marker") {
            const markerSegment = segment as Marker;
            if (
                markerSegment.refType === ReferenceType.RangeBegin &&
                markerSegment.properties !== undefined &&
                markerSegment.properties[reservedMarkerIdKey] !== undefined
            ) {
                if (currentBlock.key !== undefined) {
                    blocks.push(
                        new ContentBlock({
                            ...currentBlock,
                            characterList: List.of<CharacterMetadata>(...characterList),
                        }),
                    );
                }

                currentBlock = {
                    key: markerSegment.properties[reservedMarkerIdKey],
                    type: markerSegment.properties.blockType,
                    text: "",
                };
                characterList = [];
            }
        } else if (segment.type === "TextSegment") {
            const textSegment = segment as TextSegment;

            const metaConfig: any = {};
            if (textSegment.properties !== undefined) {
                metaConfig.style = sharedTextStylePropToDraft(textSegment.properties);
            }

            const meta = CharacterMetadata.create(metaConfig);
            characterList = characterList.concat(new Array(textSegment.cachedLength).fill(meta));
            currentBlock.text += textSegment.text;
        }
        return true;
    }, 0, sharedString.getLength());

    blocks.push(
        new ContentBlock({
            ...currentBlock,
            characterList: List.of<CharacterMetadata>(...characterList),
        }),
    );
    return blocks;
};

export const getMarkersInBlockRange = (sharedString: SharedString, startKey: string, endKey: string): Marker[] => {
    const markers = [];

    let enteredRange = false;
    let exitedRange = false;
    sharedString.walkSegments((segment: ISegment) => {
        if (
            !exitedRange &&
            segment.type === "Marker" &&
            segment.properties !== undefined &&
            segment.properties[reservedMarkerIdKey] !== undefined
        ) {
            if (segment.properties[reservedMarkerIdKey] === startKey) {
                enteredRange = true;
            }
            if (enteredRange) {
                markers.push(segment);
            }
            if (segment.properties[reservedMarkerIdKey] === endKey) {
                exitedRange = true;
            }
        }
        return true;
    }, 0, sharedString.getLength());

    return markers;
};

/**
 * Update a text range to reflect changes in the surrounding text
 */
export const updateTextRange = (
    opRanges: readonly Readonly<ISequenceDeltaRange>[],
    textRange: TextRange,
): TextRange => {
    const updatedRange = { ...textRange };

    for (const delta of opRanges) {
        if (delta.operation === MergeTreeDeltaType.INSERT) {
            if (delta.position <= updatedRange.start) {
                updatedRange.start += delta.segment.cachedLength;
                updatedRange.end += delta.segment.cachedLength;
            } else if (delta.position < updatedRange.end) {
                updatedRange.end += delta.segment.cachedLength;
            }
        } else if (delta.operation === MergeTreeDeltaType.REMOVE) {
            if (delta.position < updatedRange.start) {
                updatedRange.start -= delta.segment.cachedLength;
                updatedRange.end -= delta.segment.cachedLength;
            } else if (delta.position < updatedRange.end) {
                updatedRange.end -= Math.min(delta.segment.cachedLength, updatedRange.end - delta.position);
            }
        }
    }
    return updatedRange;
};
