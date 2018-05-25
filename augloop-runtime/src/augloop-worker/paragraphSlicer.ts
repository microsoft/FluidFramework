import { core, MergeTree } from "@prague/routerlicious/dist/client-api";
import { SharedString } from "@prague/routerlicious/dist/shared-string";
import { EventEmitter } from "events";
import { IPgMarker } from "./definitons";

export class ParagrapgSlicer extends EventEmitter {
    private idleTimeMS: number = 500;
    private currentIdleTime: number = 0;
    private pendingMarkers: IPgMarker[] = new Array<IPgMarker>();
    private offsetMap: { [start: number]: number } = {};
    private tileSet: Set<MergeTree.ReferencePosition> = new Set<MergeTree.ReferencePosition>();

    constructor(private sharedString: SharedString) {
        super();
    }

    public run() {
        const emitSlice = (startPG: number, endPG: number, text: string) => {
            this.emit("slice", {
                begin: startPG,
                end: endPG,
                text,
            });
        };
        let prevPG: MergeTree.Marker;
        let startPGPos = 0;
        let pgText = "";
        let endMarkerFound = false;
        const mergeTree = this.sharedString.client.mergeTree;
        function gatherPG(segment: MergeTree.Segment, segpos: number) {
            switch (segment.getType()) {
                case MergeTree.SegmentType.Marker:
                    const marker = segment as MergeTree.Marker;
                    if (mergeTree.localNetLength(segment)) {
                        if (marker.hasTileLabel("pg")) {
                            if (prevPG) {
                                emitSlice(startPGPos, segpos, pgText);
                                endMarkerFound = true;
                            }
                            startPGPos = segpos + mergeTree.localNetLength(segment);
                            prevPG = marker;
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
                    break;
                case MergeTree.SegmentType.Text:
                    const textSegment = segment as MergeTree.TextSegment;
                    if (mergeTree.localNetLength(textSegment)) {
                        pgText += textSegment.text;
                    }
                    break;
                default:
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

    private setTypingSlicer() {
        const idleCheckerMS = this.idleTimeMS / 5;
        setInterval(() => {
            this.currentIdleTime += idleCheckerMS;
            if (this.currentIdleTime >= this.idleTimeMS) {
                this.runSpellOp();
                this.currentIdleTime = 0;
            }
        }, idleCheckerMS);
        this.sharedString.on("op", (msg: core.ISequencedObjectMessage) => {
            if (msg && msg.contents) {
                const delta = msg.contents as MergeTree.IMergeTreeOp;
                this.enqueueDeltas(delta);
                this.currentIdleTime = 0;
            }
        });
    }

    private enqueueDeltas(delta: MergeTree.IMergeTreeOp) {
        if (delta.type === MergeTree.MergeTreeDeltaType.INSERT ||
            delta.type === MergeTree.MergeTreeDeltaType.REMOVE) {
            const pgRef = this.sharedString.client.mergeTree.findTile(delta.pos1,
                this.sharedString.client.getClientId(), "pg");
            let pgMarker: IPgMarker;
            if (!pgRef) {
                pgMarker = { tile: undefined, pos: 0 };
            } else {
                pgMarker = { tile: pgRef.tile as MergeTree.Marker, pos: pgRef.pos };
            }
            this.pendingMarkers.push(pgMarker);
        } else if (delta.type === MergeTree.MergeTreeDeltaType.GROUP) {
            for (const groupOp of delta.ops) {
                this.enqueueDeltas(groupOp);
            }
        }
    }

    private runSpellOp() {
        if (this.pendingMarkers.length > 0) {
            for (const pg of this.pendingMarkers) {
                let offset = 0;
                if (pg.tile) {
                    offset = this.sharedString.client.mergeTree.getOffset(pg.tile, MergeTree.UniversalSequenceNumber,
                        this.sharedString.client.getClientId());
                }
                const endMarker = this.sharedString.client.mergeTree.findTile(offset + 1,
                    this.sharedString.client.getClientId(), "pg", false);
                let endPos: number;
                if (endMarker) {
                    endPos = endMarker.pos;
                } else {
                    endPos = this.sharedString.client.mergeTree.getLength(MergeTree.UniversalSequenceNumber,
                        this.sharedString.client.getClientId());
                }
                this.offsetMap[offset] = endPos;
                this.tileSet.add(endMarker.tile);
                console.log(this.tileSet.size);
            }
            for (const start of Object.keys(this.offsetMap)) {
                const queryString = this.sharedString.client.mergeTree.getText(
                    MergeTree.UniversalSequenceNumber,
                    this.sharedString.client.getClientId(),
                    "",
                    Number(start), this.offsetMap[start]);
                this.emit("slice", {
                    begin: Number(start),
                    end: this.offsetMap[start],
                    text: queryString,
                });
            }
            this.offsetMap = {};
            this.pendingMarkers = [];
        }
    }
}
