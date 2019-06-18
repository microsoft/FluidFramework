/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { core, MergeTree } from "@prague/routerlicious/dist/client-api";
import { SharedString } from "@prague/routerlicious/dist/shared-string";
import { EventEmitter } from "events";
import { IPgMarker, IRange } from "./definitions";

export class ParagrapgSlicer extends EventEmitter {
    private idleTimer = null;
    private idleTimeMS: number = 500;
    private currentIdleTime: number = 0;
    private pendingMarkers: IPgMarker[] = new Array<IPgMarker>();
    private tileMap: Map<MergeTree.ReferencePosition, IRange> = new Map<MergeTree.ReferencePosition, IRange>();
    private initialCallLimit: number = 10;
    private initialCounter: number = 0;

    constructor(private sharedString: SharedString) {
        super();
    }

    // Slice and emit initial paragraphs of the document.
    public run() {
        const emitSlice = (startPG: number, endPG: number, text: string) => {
            if (++this.initialCounter < this.initialCallLimit) {
                const range: IRange = {
                    begin: startPG,
                    end: endPG,
                };
                this.emit("slice", {
                    range,
                    text,
                });
            }
        };
        let prevPG: MergeTree.Marker;
        let startPGPos = 0;
        let pgText = "";
        let endMarkerFound = false;
        const mergeTree = this.sharedString.client.mergeTree;
        function gatherPG(segment: MergeTree.Segment, segpos: number) {
            if (segment instanceof MergeTree.Marker) {
                if (mergeTree.localNetLength(segment)) {
                    if (segment.hasTileLabel("pg")) {
                        if (prevPG) {
                            emitSlice(startPGPos, segpos, pgText);
                            endMarkerFound = true;
                        }
                        startPGPos = segpos + mergeTree.localNetLength(segment);
                        prevPG = segment;
                        pgText = "";
                        if (endMarkerFound) {
                            return false;
                        }
                    } else {
                        for (let i = 0; i < mergeTree.localNetLength(segment); i++) {
                            pgText += " ";
                        }
                    }
                }
            } else if (segment instanceof MergeTree.TextSegment) {
                if (mergeTree.localNetLength(segment)) {
                    pgText += segment.text;
                }
            } else {
                throw new Error("Unknown SegmentType");
            }
            return true;
        }

        do {
            endMarkerFound = false;
            this.sharedString.client.mergeTree.mapRange({ leaf: gatherPG }, MergeTree.UniversalSequenceNumber,
                this.sharedString.client.getClientId(), undefined, startPGPos);
        } while (endMarkerFound);

        if (prevPG) {
            emitSlice(startPGPos, startPGPos + pgText.length, pgText);
        }

        this.setTypingSlicer();
    }

    public stop() {
        this.sharedString.removeAllListeners();
        if (!this.idleTimer) {
            return;
        }
        clearInterval(this.idleTimer);
        this.idleTimer = null;
    }

    // Sets up slicing service for typing. Keep collecting deltas until ops are stopped.
    private setTypingSlicer() {
        const idleCheckerMS = this.idleTimeMS / 5;
        this.idleTimer = setInterval(() => {
            this.currentIdleTime += idleCheckerMS;
            if (this.currentIdleTime >= this.idleTimeMS) {
                this.sliceParagraph();
                this.currentIdleTime = 0;
            }
        }, idleCheckerMS);
        this.sharedString.on("op", (msg: core.ISequencedObjectMessage) => {
            if (msg && msg.contents) {
                const delta = msg.contents as MergeTree.IMergeTreeOp;
                this.collectDeltas(delta);
                this.currentIdleTime = 0;
            }
        });
    }

    // Collects deltas and convert them into markers.
    private collectDeltas(delta: MergeTree.IMergeTreeOp) {
        if (delta.type === MergeTree.MergeTreeDeltaType.INSERT ||
            delta.type === MergeTree.MergeTreeDeltaType.REMOVE) {
            const pgRef = this.sharedString.findTile(delta.pos1, "pg");
            let pgMarker: IPgMarker;
            if (!pgRef) {
                pgMarker = { tile: undefined, pos: 0 };
            } else {
                pgMarker = { tile: pgRef.tile as MergeTree.Marker, pos: pgRef.pos };
            }
            this.pendingMarkers.push(pgMarker);
        } else if (delta.type === MergeTree.MergeTreeDeltaType.GROUP) {
            for (const groupOp of delta.ops) {
                this.collectDeltas(groupOp);
            }
        }
    }

    // Emits paragraphs based on previously collected markers. For dedeuplication, uses a map with tile as hash key.
    private sliceParagraph() {
        if (this.pendingMarkers.length > 0) {
            for (const pg of this.pendingMarkers) {
                let offset = 0;
                if (pg.tile) {
                    offset = this.sharedString.client.mergeTree.getOffset(pg.tile, MergeTree.UniversalSequenceNumber,
                        this.sharedString.client.getClientId());
                }
                const endMarker = this.sharedString.findTile(offset + 1, "pg", false);
                if (endMarker) {
                    this.tileMap.set(endMarker.tile, {begin: offset, end: endMarker.pos});
                }
            }
            for (const entry of this.tileMap.entries()) {
                const range = entry[1];
                let endPos: number;
                if (entry[0]) {
                    endPos = range.end;
                } else {
                    endPos = this.sharedString.client.mergeTree.getLength(MergeTree.UniversalSequenceNumber,
                        this.sharedString.client.getClientId());
                }
                const queryString = this.sharedString.getText(range.begin, endPos);
                const newRange: IRange = {
                    begin: range.begin + 1,
                    end: endPos + 1,
                };
                this.emit("slice", {
                    range: newRange,
                    text: queryString,
                });
            }
            this.pendingMarkers = [];
            this.tileMap.clear();
        }
    }
}
