import { MergeTree } from "@prague/routerlicious/dist/client-api";

export interface IPgMarker {

    tile: MergeTree.Marker;

    pos: number;
}

export interface ISlice {

    begin: number;

    end: number;

    text: string;
}
