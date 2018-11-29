import { IMap, IMapView, MapExtension } from "@prague/map";
import { SharedString, CollaborativeStringExtension } from "@prague/shared-string";
import { IChaincode, IPlatform, IRuntime } from "@prague/runtime-definitions";
import { Component, Store } from "@prague/store";
import {
    MergeTree,
    UniversalSequenceNumber,
    Segment,
    LocalReference,
    BaseSegment,
    ReferenceType,
    reservedTileLabelsKey,
    PropertySet,
    SegmentType,
    Marker
} from "@prague/merge-tree";

export enum DocSegmentKind {
    Text = "text",
    Paragraph = "<p>",
    LineBreak = "<br>",
    Inclusion = "<?>",
};

const inclusionSymbol = Symbol.for("FlowDocument.inclusion");
export const getInclusionContent = (marker: Marker): HTMLElement => marker.properties[inclusionSymbol as any];

const styleProperty = "style";
export const getStyle = (segment: BaseSegment): CSSStyleDeclaration => segment.properties && segment.properties[styleProperty];
export const setStyle = (segment: BaseSegment, style: CSSStyleDeclaration) => { 
    segment.properties = Object.assign(segment.properties || {}, { [styleProperty]: style });
};

export const getDocSegmentKind = (segment: Segment): DocSegmentKind => {
    const segmentType = segment.getType();
    switch (segmentType) {
        case SegmentType.Text:
            return DocSegmentKind.Text;
        case SegmentType.Marker: {
            const asMarker = segment as Marker;
            const markerType = asMarker.refType;

            switch (markerType) {
                case ReferenceType.Tile:
                    const tileLabel = asMarker.getTileLabels()[0];
                    switch (tileLabel) {
                        case DocSegmentKind.Paragraph:
                        case DocSegmentKind.LineBreak:
                            return tileLabel;
                        default:
                            throw new Error(`Unknown Marker.tileLabel '${tileLabel}'.`);
                    }
                case ReferenceType.Simple:
                    return DocSegmentKind.Inclusion;
                default:
                    throw new Error(`Unknown Marker.refType '${markerType}'.`);
            }
        }
        default:
            throw new Error(`Unknown SegmentType '${segmentType}'.`);
    }   
}

type LeafAction = (position: number, segment: Segment, start: number, end: number) => boolean;

/** 
 * Used by 'FlowDocument.visitRange'.  Uses the otherwise unused 'accum' object to pass the
 * leaf action callback, allowing us to simplify the the callback signature and while (maybe)
 * avoiding unnecessary allocation to wrap the given 'callback'.
 */
const accumAsLeafAction = {
    leaf: (
        segment: Segment,
        position: number,
        refSeq: number,
        clientId: number,
        start: number,
        end: number,
        accum?: LeafAction
    ) => (accum as LeafAction)(position, segment, start, end)
};

export class FlowDocument extends Component {
    private maybeSharedString?: SharedString;
    private maybeMergeTree?: MergeTree;
    private maybeClientId?: number;
    private static readonly paragraphTileProperties = { [reservedTileLabelsKey]: [DocSegmentKind.Paragraph] };
    private static readonly linebreakTileProperties = { [reservedTileLabelsKey]: [DocSegmentKind.Paragraph] };

    constructor() {
        super([
            [MapExtension.Type, new MapExtension()],
            [CollaborativeStringExtension.Type, new CollaborativeStringExtension()]
        ]);
    }
    
    protected async create(runtime: IRuntime, platform: IPlatform, root: IMap) {
        // For 'findTile(..)', we must enable tracking of left/rightmost tiles:
        // (See: https://github.com/Microsoft/Prague/pull/1118)
        Object.assign(runtime, { options: Object.assign(runtime.options || {}, { blockUpdateMarkers: true }) });

        root.set("text", runtime.createChannel("text", CollaborativeStringExtension.Type));
    }

    public async opened(runtime: IRuntime, platform: IPlatform, root: IMapView) {
        console.log("component loaded");

        this.maybeSharedString = await root.wait("text") as SharedString;
        const client = this.sharedString.client;
        this.maybeClientId = client.getClientId();
        this.maybeMergeTree = client.mergeTree;
    }

    private get sharedString() { return this.maybeSharedString as SharedString; }
    private get mergeTree() { return this.maybeMergeTree as MergeTree; }
    private get clientId() { return this.maybeClientId as number; }

    public getSegmentAndOffset(position: number) {
        return this.mergeTree.getContainingSegment(position, UniversalSequenceNumber, this.clientId);        
    }

    public getPosition(segment: Segment) {
        return this.mergeTree.getOffset(segment, UniversalSequenceNumber, this.clientId);
    }

    public addLocalRef(position: number) {
        const { segment, offset } = this.getSegmentAndOffset(position);
        const localRef = new LocalReference(segment as BaseSegment, offset, ReferenceType.SlideOnRemove);
        this.mergeTree.addLocalReference(localRef);
        return localRef;
    }

    public removeLocalRef(localRef: LocalReference) {
        this.mergeTree.removeLocalReference(localRef.getSegment(), localRef);
    }

    public localRefToPosition(localRef: LocalReference) {
        return localRef.toPosition(this.mergeTree, UniversalSequenceNumber, this.clientId);
    }

    public get length() {
        return this.mergeTree.getLength(UniversalSequenceNumber, this.clientId);
    }

    public appendText(text: string) {
        this.sharedString.insertText(text, this.length);
    }

    public insertText(position: number, text: string) {
        this.sharedString.insertText(text, position);
    }

    public remove(start: number, end: number) {
        this.sharedString.removeText(start, end);
    }

    public static markAsParagraph(marker: Marker) {
        marker.properties = Object.assign(marker.properties || {}, FlowDocument.paragraphTileProperties);
        return marker;
    }

    public insertParagraph(position: number) {
        this.sharedString.insertMarker(position, ReferenceType.Tile, FlowDocument.paragraphTileProperties);
    }

    public insertLineBreak(position: number) {
        this.sharedString.insertMarker(position, ReferenceType.Tile, FlowDocument.linebreakTileProperties);
    }

    public insertInclusion(position: number, content: HTMLElement) {
        this.sharedString.insertMarker(position, ReferenceType.Simple, { });
        const { segment } = this.getSegmentAndOffset(position);
        (segment as Marker).properties[inclusionSymbol as any] = content;
    }

    public annotate(start: number, end: number, props: PropertySet) {
        this.sharedString.annotateRange(props, start, end);
    }

    public findTile(startPos: number, tileType: string, preceding = true) {
        return this.mergeTree.findTile(startPos, this.clientId, tileType, preceding);
    }
   
    public findParagraphStart(position: number) {
        const maybePosAndTile = this.findTile(position, DocSegmentKind.Paragraph);
        return maybePosAndTile && maybePosAndTile.pos;
    }

    public visitRange(callback: LeafAction, startPosition?: number, endPosition?: number) {
        // Note: We pass the leaf callback action as the accumulator, and then use the 'accumAsLeafAction'
        //       actions to invoke the accum for each leaf.  (Paranoid micro-optimization that attempts to
        //       avoid allocation while simplifying the 'LeafAction' signature.)
        this.mergeTree.mapRange(
            /* actions: */ accumAsLeafAction,
            UniversalSequenceNumber,
            this.clientId,
            /* accum: */ callback,
            startPosition,
            endPosition);
    }
}

// Chainloader bootstrap.
export async function instantiate(): Promise<IChaincode> {
    return Store.instantiate(new FlowDocument());
}
