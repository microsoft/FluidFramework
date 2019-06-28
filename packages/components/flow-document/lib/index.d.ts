import { Component } from "@prague/app-component";
import { BaseSegment, ISegment, LocalReference, Marker, PropertySet, ReferencePosition } from "@prague/merge-tree";
export declare enum DocSegmentKind {
    Text = "text",
    Paragraph = "<p>",
    LineBreak = "<br>",
    Inclusion = "<?>",
    EOF = "<eof>"
}
export declare enum InclusionKind {
    HTML = "<html>",
    Chaincode = "<@chaincode>",
    Component = "<@component>"
}
export declare const getInclusionKind: (marker: Marker) => InclusionKind;
export declare const getInclusionHtml: (marker: Marker) => HTMLElement;
export declare const getStyle: (segment: BaseSegment) => CSSStyleDeclaration;
export declare const setStyle: (segment: BaseSegment, style: CSSStyleDeclaration) => void;
export declare const getDocSegmentKind: (segment: ISegment) => DocSegmentKind;
declare type LeafAction = (position: number, segment: ISegment, start: number, end: number) => boolean;
export declare class FlowDocument extends Component {
    readonly ready: Promise<void>;
    private readonly sharedString;
    private readonly mergeTree;
    private readonly clientId;
    readonly length: number;
    static readonly type: string;
    static markAsParagraph(marker: Marker): Marker;
    private static readonly paragraphTileProperties;
    private static readonly lineBreakTileProperties;
    private static readonly eofTileProperties;
    private maybeSharedString?;
    private maybeMergeTree?;
    private maybeClientId?;
    private readonly readyDeferred;
    constructor();
    opened(): Promise<void>;
    getInclusionComponent(marker: Marker, services: ReadonlyArray<[string, Promise<any>]>): Promise<{}>;
    getInclusionContainerComponent(marker: Marker, services: ReadonlyArray<[string, Promise<any>]>): Promise<void>;
    getSegmentAndOffset(position: number): {
        segment: ISegment;
        offset: number;
    };
    getPosition(segment: ISegment): number;
    addLocalRef(position: number): LocalReference;
    removeLocalRef(localRef: LocalReference): void;
    localRefToPosition(localRef: LocalReference): number;
    appendText(text: string): void;
    insertText(position: number, text: string): void;
    replaceWithText(start: number, end: number, text: string): void;
    remove(start: number, end: number): void;
    insertParagraph(position: number): void;
    insertLineBreak(position: number): void;
    insertHTML(position: number, content: HTMLElement): void;
    insertComponent(position: number, serverUrl: string, docId: string, chaincode?: string): void;
    insertInclusionComponent(position: number, docId: string, pkg: string): void;
    annotate(start: number, end: number, props: PropertySet): void;
    findTile(startPos: number, tileType: string, preceding?: boolean): {
        tile: ReferencePosition;
        pos: number;
    };
    findParagraphStart(position: number): number;
    visitRange(callback: LeafAction, startPosition?: number, endPosition?: number): void;
    protected create(): Promise<void>;
}
export {};
//# sourceMappingURL=index.d.ts.map