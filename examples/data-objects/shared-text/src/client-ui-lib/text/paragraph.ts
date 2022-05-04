/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
eslint-disable
@typescript-eslint/no-non-null-assertion,
@typescript-eslint/consistent-type-assertions,
@typescript-eslint/strict-boolean-expressions,
*/

import * as MergeTree from "@fluidframework/merge-tree";
import * as Sequence from "@fluidframework/sequence";
import { CharacterCodes } from "./characterCodes";

type SharedString = Sequence.SharedString;

export interface IBreakInfo {
    posInPG: number;
    startItemIndex: number;
}

export interface IParagraphInfo {
    breaks: IBreakInfo[];
    isUniformWidth?: boolean;
    uniformLineWidth?: number;
}

export interface IParagraphItemInfo {
    minWidth: number;
    maxHeight?: number;
    items: ParagraphItem[];
}

export interface IListInfo {
    itemCounts: number[];
}

export interface IParagraphMarker extends MergeTree.Marker {
    cache?: IParagraphInfo;
    itemCache?: IParagraphItemInfo;
    listHeadCache?: IListHeadInfo;
    listCache?: IListInfo;
}

export enum ParagraphItemType {
    Block,
    Glue,
    Marker,
    Penalty,
}

export interface IParagraphItem {
    type: ParagraphItemType;
    width: number;
    segment: MergeTree.ISegment;
    pos?: number;
    // Present if not default
    height?: number;
    fontstr?: string;
}

export interface IPGBlock extends IParagraphItem {
    type: ParagraphItemType.Block;

    // TODO: Only the string's length property appears to be used to determine how many
    //       positions the block occupies.  Consider making this 'positionLength' or similar.
    text: string;
}

export interface IPGMarker extends IParagraphItem {
    type: ParagraphItemType.Marker;
    segment: MergeTree.Marker;
}

function makeIPGBlock(width: number, text: string, textSegment: MergeTree.TextSegment) {
    return <IPGBlock>{ type: ParagraphItemType.Block, width, text, segment: textSegment };
}

function makeIPGMarker(marker: MergeTree.Marker) {
    return <IPGMarker>{ type: ParagraphItemType.Marker, width: 0, segment: marker };
}

function makeGlue(
    width: number,
    text: string,
    textSegment: MergeTree.TextSegment,
    stretch: number,
    shrink: number) {
    return <IPGGlue>{ type: ParagraphItemType.Glue, width, text, segment: textSegment, stretch, shrink };
}

export interface IPGGlue extends IParagraphItem {
    type: ParagraphItemType.Glue;
    text: string;
    stretch: number;
    shrink: number;
}

export interface IPGPenalty extends IParagraphItem {
    type: ParagraphItemType.Penalty;
    cost: number;
}

export type ParagraphItem = IPGBlock | IPGGlue | IPGPenalty | IPGMarker;

// For now assume uniform line widths
export function breakPGIntoLinesFF(items: ParagraphItem[], lineWidth: number) {
    const breaks = <IBreakInfo[]>[{ posInPG: 0, startItemIndex: 0 }];
    let posInPG = 0;
    let committedItemsWidth = 0;
    let blockRunWidth = 0;
    let blockRunPos = -1;
    let prevIsGlue = true;
    for (let i = 0, len = items.length; i < len; i++) {
        const item = items[i];
        if (item.type === ParagraphItemType.Block) {
            item.pos = posInPG;
            if (prevIsGlue) {
                blockRunPos = posInPG;
                blockRunWidth = 0;
            }
            if ((committedItemsWidth + item.width) > lineWidth) {
                breaks.push({ posInPG: blockRunPos, startItemIndex: i });
                committedItemsWidth = blockRunWidth;
            }
            posInPG += item.text.length;
            if (committedItemsWidth > lineWidth) {
                breaks.push({ posInPG, startItemIndex: i });
                committedItemsWidth = 0;
                blockRunWidth = 0;
                blockRunPos = posInPG;
            } else {
                blockRunWidth += item.width;
            }
            prevIsGlue = false;
        } else if (item.type === ParagraphItemType.Glue) {
            posInPG++;
            prevIsGlue = true;
        }
        committedItemsWidth += item.width;
    }
    return breaks;
}

export const enum ParagraphLexerState {
    AccumBlockChars,
    AccumSpaces,
}

export interface ParagraphTokenActions<TContext> {
    textToken(text: string, type: ParagraphItemType, leadSegment: MergeTree.TextSegment, context?: TContext): void;
    markerToken(marker: MergeTree.Marker, context?: TContext): void;
}

export class ParagraphLexer<TContext> {
    public state = ParagraphLexerState.AccumBlockChars;
    private spaceCount = 0;
    private textBuf = "";
    private leadSegment: MergeTree.TextSegment | undefined;

    constructor(public tokenActions: ParagraphTokenActions<TContext>, public actionContext?: TContext) {
    }

    public reset() {
        this.state = ParagraphLexerState.AccumBlockChars;
        this.spaceCount = 0;
        this.textBuf = "";
        this.leadSegment = undefined;
    }

    public mark(marker: MergeTree.Marker) {
        this.emit();
        this.emitMarker(marker);
    }

    public lex(textSegment: MergeTree.TextSegment) {
        if (this.leadSegment && (!MergeTree.matchProperties(this.leadSegment.properties, textSegment.properties))) {
            this.emit();
            this.leadSegment = textSegment;
        } else if (!this.leadSegment) {
            this.leadSegment = textSegment;
        }
        const segText = textSegment.text;
        for (let i = 0, len = segText.length; i < len; i++) {
            const c = segText.charAt(i);
            if (c === " ") {
                if (this.state === ParagraphLexerState.AccumBlockChars) {
                    this.emitBlock();
                }
                this.state = ParagraphLexerState.AccumSpaces;
                this.spaceCount++;
            } else {
                if (this.state === ParagraphLexerState.AccumSpaces) {
                    this.emitGlue();
                }
                this.state = ParagraphLexerState.AccumBlockChars;
                this.textBuf += c;
            }
        }
        this.emit();
    }

    private emit() {
        if (this.state === ParagraphLexerState.AccumBlockChars) {
            this.emitBlock();
        } else {
            this.emitGlue();
        }
    }

    private emitGlue() {
        if (this.spaceCount > 0) {
            this.tokenActions.textToken(MergeTree.internedSpaces(this.spaceCount), ParagraphItemType.Glue,
                this.leadSegment!, this.actionContext);
            this.spaceCount = 0;
        }
    }

    private emitBlock() {
        if (this.textBuf.length > 0) {
            this.tokenActions.textToken(this.textBuf, ParagraphItemType.Block, this.leadSegment!, this.actionContext);
            this.textBuf = "";
        }
    }

    private emitMarker(marker: MergeTree.Marker) {
        this.tokenActions.markerToken(marker, this.actionContext);
    }
}

export function clearContentCaches(pgMarker: IParagraphMarker) {
    pgMarker.cache = undefined;
    pgMarker.itemCache = undefined;
}

export function getIndentPct(pgMarker: IParagraphMarker) {
    if (pgMarker.properties && (pgMarker.properties.indentLevel !== undefined)) {
        return pgMarker.properties.indentLevel * 0.05;
    } else if (pgMarker.properties && pgMarker.properties.blockquote) {
        return 0.10;
    } else {
        return 0.0;
    }
}

export function getIndentSymbol(pgMarker: IParagraphMarker) {
    let indentLevel = pgMarker.properties!.indentLevel;
    indentLevel = indentLevel % pgMarker.listHeadCache!.series!.length;
    let series = pgMarker.listHeadCache!.series![indentLevel];
    let seriesSource = listSeries;
    if (pgMarker.properties!.listKind === 1) {
        seriesSource = symbolSeries;
    }
    series = series % seriesSource.length;
    return seriesSource[series](pgMarker.listCache!.itemCounts[indentLevel]);
}

export interface IListHeadInfo {
    series?: number[];
    tile: IParagraphMarker;
}

export interface ITilePos {
    tile: MergeTree.Marker;
    pos: number;
}

function getPrecedingTile(
    sharedString: SharedString, tile: MergeTree.Marker, tilePos: number, label: string,
    filter: (candidate: MergeTree.Marker) => boolean, precedingTileCache?: ITilePos[]) {
    let _tilePos = tilePos;
    if (precedingTileCache) {
        for (let i = precedingTileCache.length - 1; i >= 0; i--) {
            const candidate = precedingTileCache[i];
            if (filter(candidate.tile)) {
                return candidate;
            }
        }
    }
    while (_tilePos > 0) {
        _tilePos = _tilePos - 1;
        const prevTileInfo = sharedString.findTile(_tilePos, label);
        if (prevTileInfo && filter(<MergeTree.Marker>prevTileInfo.tile)) {
            return prevTileInfo;
        }
    }
}

export const isListTile = (tile: IParagraphMarker) => tile.hasTileLabel("list");

export interface ISymbol {
    font?: string;
    text: string;
}

const numberSuffix = (itemIndex: number, suffix: string): ISymbol => ({ text: itemIndex.toString() + suffix });

// TODO: more than 26
function alphaSuffix(itemIndex: number, suffix: string, little = false) {
    let code = (itemIndex - 1) + CharacterCodes.A;
    if (little) {
        code += 32;
    }
    const prefix = String.fromCharCode(code);
    return { text: prefix + suffix };
}

// TODO: more than 10
const romanNumbers = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

function roman(itemIndex: number, little = false) {
    let text = `${romanNumbers[itemIndex - 1]}.`;
    if (little) {
        text = text.toLowerCase();
    }
    return { text };
}

// Let wingdingLetters = ["l", "m", "n", "R", "S", "T", "s","w"];
const unicodeBullets = [
    "\u2022", "\u25E6", "\u25AA", "\u2731", "\u272F", "\u2729", "\u273F",
    "\u2745", "\u2739", "\u2720", "\u2722",
];

function itemSymbols(itemIndex: number, indentLevel: number) {
    //    Let wingdingLetter = wingdingLetters[indentLevel - 1];
    const wingdingLetter = unicodeBullets[indentLevel - 1];
    //    Return { text: wingdingLetter, font: "12px Wingdings" };
    return { text: wingdingLetter };
}

const listSeries = [
    (itemIndex) => numberSuffix(itemIndex, "."),
    (itemIndex) => numberSuffix(itemIndex, ")"),
    (itemIndex) => alphaSuffix(itemIndex, ".", true),
    (itemIndex) => alphaSuffix(itemIndex, ")", true),
    (itemIndex) => alphaSuffix(itemIndex, "."),
    (itemIndex) => alphaSuffix(itemIndex, ")"),
    (itemIndex) => roman(itemIndex, true),
    (itemIndex) => roman(itemIndex),
];

const symbolSeries = [
    (itemIndex) => itemSymbols(itemIndex, 1),
    (itemIndex) => itemSymbols(itemIndex, 2),
    (itemIndex) => itemSymbols(itemIndex, 3),
    (itemIndex) => itemSymbols(itemIndex, 4),
    (itemIndex) => itemSymbols(itemIndex, 5),
    (itemIndex) => itemSymbols(itemIndex, 6),
    (itemIndex) => itemSymbols(itemIndex, 7),
    (itemIndex) => itemSymbols(itemIndex, 8),
    (itemIndex) => itemSymbols(itemIndex, 9),
    (itemIndex) => itemSymbols(itemIndex, 10),
    (itemIndex) => itemSymbols(itemIndex, 11),
];

function convertToListHead(tile: IParagraphMarker) {
    tile.listHeadCache = {
        series: <number[]>tile.properties!.series,
        tile,
    };
    tile.listCache = { itemCounts: [0, 1] };
}

/**
 * Maximum number of characters before a preceding list paragraph deemed irrelevant
 */
const maxListDistance = 400;

export function getListCacheInfo(
    sharedString: SharedString, tile: IParagraphMarker, tilePos: number, precedingTileCache?: ITilePos[]) {
    if (isListTile(tile)) {
        if (tile.listCache === undefined) {
            if (tile.properties!.series) {
                convertToListHead(tile);
            } else {
                const listKind = tile.properties!.listKind;
                const precedingTilePos = getPrecedingTile(sharedString, tile, tilePos, "list",
                    (t) => isListTile(t) && (t.properties!.listKind === listKind), precedingTileCache);
                if (precedingTilePos && ((tilePos - precedingTilePos.pos) < maxListDistance)) {
                    getListCacheInfo(sharedString, <MergeTree.Marker>precedingTilePos.tile,
                        precedingTilePos.pos, precedingTileCache);
                    const precedingTile = <IParagraphMarker>precedingTilePos.tile;
                    tile.listHeadCache = precedingTile.listHeadCache;
                    const indentLevel = tile.properties!.indentLevel;
                    const precedingItemCount = precedingTile.listCache!.itemCounts[indentLevel];
                    const itemCounts = precedingTile.listCache!.itemCounts.slice();
                    if (indentLevel < itemCounts.length) {
                        itemCounts[indentLevel] = precedingItemCount + 1;
                    } else {
                        itemCounts[indentLevel] = 1;
                    }
                    // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
                    for (let i = indentLevel + 1; i < itemCounts.length; i++) {
                        itemCounts[i] = 0;
                    }
                    tile.listCache = { itemCounts };
                } else {
                    // Doesn't race because re-render is deferred
                    let series: number[];
                    if (tile.properties!.listKind === 0) {
                        series = [0, 0, 2, 6, 3, 7, 2, 6, 3, 7];
                    } else {
                        series = [0, 0, 1, 2, 0, 1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 4, 5, 6];
                    }
                    sharedString.annotateRange(tilePos, tilePos + 1, { series });
                    convertToListHead(tile);
                }
            }
        }
    }
}

export function getContentPct(pgMarker: IParagraphMarker) {
    if (pgMarker.properties && pgMarker.properties.contentWidth) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return pgMarker.properties.contentWidth;
    } else if (pgMarker.properties && pgMarker.properties.blockquote) {
        return 0.8;
    } else {
        return 1.0;
    }
}

export interface IHeightWidth {
    h: number;
    w: number;
}

export interface IFontInfo {
    getTextWidth(text: string, fontstr: string);
    getLineHeight(fontstr: string, lineHeight?: string): number;
    getFont(pg: IParagraphMarker): string;
}

export interface IItemsContext {
    fontInfo: IFontInfo;
    curPGMarker: IParagraphMarker;
    nextPGPos: number;
    itemInfo: IParagraphItemInfo;
    paragraphLexer: ParagraphLexer<IItemsContext>;
}

export function markerToItems(marker: MergeTree.Marker, itemsContext: IItemsContext) {
    const items = itemsContext.itemInfo.items;

    // Assume this is a paragraph marker
    items.push(makeIPGMarker(marker));
}

export function textTokenToItems(
    text: string, type: ParagraphItemType, leadSegment: MergeTree.TextSegment,
    itemsContext: IItemsContext) {
    const fontInfo = itemsContext.fontInfo;
    const pgFontstr = fontInfo.getFont(itemsContext.curPGMarker);
    let lfontstr = pgFontstr;
    const pgLineHeight = fontInfo.getLineHeight(lfontstr);
    itemsContext.itemInfo.maxHeight = pgLineHeight;
    let divHeight = pgLineHeight;
    if (leadSegment.properties) {
        let fontFamily = "Times";
        if (leadSegment.properties.fontFamily) {
            fontFamily = leadSegment.properties.fontFamily;
        }
        const fontSize = leadSegment.properties.fontSize;
        if (fontSize !== undefined) {
            lfontstr = `${fontSize} ${fontFamily}`;
            divHeight = +fontSize;
        }
        // This is not complete because can be % or normal etc.
        const lineHeight = leadSegment.properties.lineHeight;
        if (lineHeight !== undefined) {
            divHeight = Math.floor((+lineHeight) * divHeight);
        }
        const fontWeight = leadSegment.properties.fontWeight;
        if (fontWeight) {
            lfontstr = `${fontWeight} ${lfontstr}`;
        }
        const fontStyle = leadSegment.properties.fontStyle;
        if (fontStyle) {
            lfontstr = `${fontStyle} ${lfontstr}`;
        }
    }

    const textWidth = fontInfo.getTextWidth(text, lfontstr);
    if (textWidth > itemsContext.itemInfo.minWidth) {
        itemsContext.itemInfo.minWidth = textWidth;
    }
    if (type === ParagraphItemType.Block) {
        const block = makeIPGBlock(textWidth, text, leadSegment);
        if (lfontstr !== pgFontstr) {
            block.fontstr = lfontstr;
        }
        if (divHeight !== pgLineHeight) {
            block.height = divHeight;
            if (divHeight > itemsContext.itemInfo.maxHeight) {
                itemsContext.itemInfo.maxHeight = divHeight;
            }
        }
        itemsContext.itemInfo.items.push(block);
    } else {
        const wordSpacing = fontInfo.getTextWidth(" ", lfontstr);
        itemsContext.itemInfo.items.push(makeGlue(textWidth, text, leadSegment,
            wordSpacing / 2, wordSpacing / 3));
    }
}

// eslint-disable-next-line no-bitwise
export const isEndBox = (marker: MergeTree.Marker) => (marker.refType & MergeTree.ReferenceType.NestEnd) &&
    marker.hasRangeLabel("box");

export const referenceProperty = "ref";

export const isReference = (marker: MergeTree.Marker) => marker.hasProperty(referenceProperty);

export function segmentToItems(
    segment: MergeTree.ISegment, segpos: number, refSeq: number, clientId: number,
    start: number, end: number, context: IItemsContext) {
    if (MergeTree.TextSegment.is(segment)) {
        context.paragraphLexer.lex(segment);
    } else if (MergeTree.Marker.is(segment)) {
        if (isReference(segment)) {
            context.paragraphLexer.mark(segment);
        } else if (segment.hasTileLabel("pg") || isEndBox(segment)) {
            context.nextPGPos = segpos;
            return false;
        }
    }
    return true;
}

/*
eslint-enable
@typescript-eslint/no-non-null-assertion,
@typescript-eslint/consistent-type-assertions,
@typescript-eslint/strict-boolean-expressions,
*/
