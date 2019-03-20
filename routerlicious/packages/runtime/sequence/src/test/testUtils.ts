import {
    Client,
    IMarkerDef,
    IMergeTreeDeltaOpCallbackArgs,
    Marker,
    MergeTree,
    PropertySet,
    ReferenceType,
    SequenceItem,
    SubSequence,
    TextSegment,
} from "@prague/merge-tree";

// tslint:disable:no-unsafe-any
export function specToSegment(spec: any) {
    const maybeText = TextSegment.fromJSONObject(spec);
    if (maybeText) {
        return maybeText;
    }

    const maybeMarker = Marker.fromJSONObject(spec);
    if (maybeMarker) {
        return maybeMarker;
    }

    const maybeSubSequence = SubSequence.fromJSONObject(spec);
    if (maybeSubSequence) {
        return maybeSubSequence;
    }

    throw new Error(`Unrecognized IJSONSegment type: '${JSON.stringify(spec)}'`);
}
// tslint:enable:no-unsafe-any

export function insertMarker(
    mergeTree: MergeTree,
    pos: number,
    refSeq: number,
    clientId: number,
    seq: number,
    behaviors: ReferenceType, props: PropertySet, opArgs: IMergeTreeDeltaOpCallbackArgs,
) {
    mergeTree.insertSegment(pos, refSeq, clientId, seq, Marker.make(behaviors, props, seq, clientId), opArgs);
}

export function insertText(
    mergeTree: MergeTree,
    pos: number,
    refSeq: number,
    clientId: number,
    seq: number,
    text: string,
    props: PropertySet,
    opArgs: IMergeTreeDeltaOpCallbackArgs,
) {
    mergeTree.insertSegment(pos, refSeq, clientId, seq, TextSegment.make(text, props, seq, clientId), opArgs);
}

export function insertTextLocal(
    client: Client,
    text: string,
    pos: number,
    props?: PropertySet,
    opArgs?: IMergeTreeDeltaOpCallbackArgs,
) {
    const segment = new TextSegment(text);
    if (props) {
        segment.addProperties(props);
    }
    client.insertSegmentLocal(pos, segment, opArgs);
}

export function insertMarkerLocal(
    client: Client,
    pos: number,
    behaviors: ReferenceType,
    props?: PropertySet,
    opArgs?: IMergeTreeDeltaOpCallbackArgs,
) {
    const segment = new Marker(behaviors);
    if (props) {
        segment.addProperties(props);
    }
    client.insertSegmentLocal(pos, segment, opArgs);
}

export function insertItemsRemote(
    client: Client,
    items: SequenceItem[],
    pos: number,
    props: PropertySet,
    seq: number,
    refSeq: number,
    clientId: number,
    opArgs?: IMergeTreeDeltaOpCallbackArgs,
) {
    const segment = new SubSequence(items);
    if (props) {
        segment.addProperties(props);
    }
    client.insertSegmentRemote(segment, pos, seq, refSeq, clientId, opArgs);
}

export function insertMarkerRemote(
    client: Client, markerDef:
    IMarkerDef,
    pos: number,
    props: PropertySet,
    seq: number,
    refSeq: number,
    clientId: number, opArgs?: IMergeTreeDeltaOpCallbackArgs,
) {
    const segment = new Marker(markerDef.refType);
    if (props) {
        segment.addProperties(props);
    }
    client.insertSegmentRemote(segment, pos, seq, refSeq, clientId, opArgs);
}

export function insertTextRemote(
    client: Client,
    text: string,
    pos: number,
    props: PropertySet,
    seq: number,
    refSeq: number,
    clientId: number,
    opArgs?: IMergeTreeDeltaOpCallbackArgs,
) {
    const segment = new TextSegment(text);
    if (props) {
        segment.addProperties(props);
    }
    client.insertSegmentRemote(segment, pos, seq, refSeq, clientId, opArgs);
}
