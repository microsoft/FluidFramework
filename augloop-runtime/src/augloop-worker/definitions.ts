import { MergeTree } from "@prague/routerlicious/dist/client-api";

export interface IPgMarker {

    tile: MergeTree.Marker;

    pos: number;
}

export interface IRange {

    begin: number;

    end: number;
}

export interface ISlice {

    range: IRange;

    text: string;
}
