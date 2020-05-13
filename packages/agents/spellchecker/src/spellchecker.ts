/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import MergeTree from "@microsoft/fluid-merge-tree";
import { ISequencedDocumentMessage } from "@microsoft/fluid-protocol-definitions";
import Sequence from "@microsoft/fluid-sequence";

export interface IPgMarker {
    tile: MergeTree.Marker | undefined;

    pos: number;
}

export interface IRange {

    begin: number;

    end: number;
}

function compareProxStrings(a: MergeTree.ProxString<number>, b: MergeTree.ProxString<number>) {
    const ascore = ((a.invDistance * 200) * a.val) + a.val;
    const bscore = ((b.invDistance * 200) * b.val) + b.val;
    return bscore - ascore;
}

class Speller {
    private static readonly altMax = 7;
    private static readonly idleTimeMS = 500;
    private idleTimer: NodeJS.Timeout | null = null;
    private currentIdleTime: number = 0;
    private pendingMarkers: IPgMarker[] = [];
    private readonly tileMap: Map<MergeTree.ReferencePosition, IRange> = new Map<MergeTree.ReferencePosition, IRange>();
    private readonly verbose = false;

    constructor(
        public sharedString: Sequence.SharedString,
        private readonly dict: MergeTree.TST<number>) {
    }

    public initialSpellCheck() {
        const spellParagraph = (startPG: number, endPG: number, text: string) => {
            const re = /\b\w+\b/g;
            let result: RegExpExecArray | null;
            do {
                result = re.exec(text);
                if (result) {
                    const candidate = result[0];
                    if (this.spellingError(candidate.toLocaleLowerCase())) {
                        const start = result.index;
                        const end = re.lastIndex;
                        const textErrorInfo = this.makeTextErrorInfo(candidate);
                        if (this.verbose) {
                            console.log(`spell (${startPG + start}, ${startPG + end}): ${textErrorInfo.text}`);
                        }
                        this.sharedString.annotateRange(startPG + start, startPG + end, { textError: textErrorInfo });
                    }
                }
            } while (result);
        };
        let prevPG: MergeTree.Marker | null = null;
        let startPGPos = 0;
        let pgText = "";
        let endMarkerFound = false;
        function gatherPG(segment: MergeTree.ISegment, segpos: number) {
            if (MergeTree.Marker.is(segment)) {
                if (segment.hasTileLabel("pg")) {
                    if (prevPG) {
                        // TODO: send paragraph to service
                        spellParagraph(startPGPos, segpos, pgText);
                        endMarkerFound = true;
                    }
                    startPGPos = segpos + segment.cachedLength;
                    prevPG = segment;
                    pgText = "";
                    if (endMarkerFound) {
                        return false;
                    }
                } else {
                    for (let i = 0; i < segment.cachedLength; i++) {
                        pgText += " ";
                    }
                }
            } else if (MergeTree.TextSegment.is(segment)) {
                pgText += segment.text;
            } else {
                throw new Error("Unknown SegmentType");
            }
            return true;
        }

        do {
            endMarkerFound = false;
            this.sharedString.walkSegments(gatherPG, startPGPos);
        } while (endMarkerFound);

        if (prevPG) {
            // TODO: send paragraph to service
            spellParagraph(startPGPos, startPGPos + pgText.length, pgText);
        }

        this.setEvents();
    }

    public stop() {
        this.sharedString.removeAllListeners();
        if (!this.idleTimer) {
            return;
        }
        clearInterval(this.idleTimer);
        this.idleTimer = null;
    }

    private spellingError(word: string) {
        if (/\b\d+\b/.test(word)) {
            return false;
        } else {
            return !this.dict.contains(word);
        }
    }

    private setEvents() {
        const idleCheckerMS = Speller.idleTimeMS / 5;
        this.idleTimer = setInterval(() => {
            this.currentIdleTime += idleCheckerMS;
            if (this.currentIdleTime >= Speller.idleTimeMS) {
                this.sliceParagraph();
                this.currentIdleTime = 0;
            }
        }, idleCheckerMS);
        this.sharedString.on("op", (msg: ISequencedDocumentMessage) => {
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

    private makeTextErrorInfo(candidate: string) {
        const alternates = this.dict.neighbors(candidate, 2).sort(compareProxStrings);
        if (alternates.length > Speller.altMax) {
            alternates.length = Speller.altMax;
        }
        return {
            alternates,
            text: candidate,
        };
    }

    // Slices paragraph based on previously collected markers. For dedeuplication, uses a map with tile as hash key.
    private sliceParagraph() {
        if (this.pendingMarkers.length > 0) {
            for (const pg of this.pendingMarkers) {
                let position = 0;
                if (pg.tile) {
                    position = this.sharedString.getPosition(pg.tile);
                }
                const endMarker = this.sharedString.findTile(position + 1, "pg", false);
                if (endMarker) {
                    this.tileMap.set(endMarker.tile, { begin: position, end: endMarker.pos });
                }
            }
            for (const entry of this.tileMap.entries()) {
                const range = entry[1];
                let endPos: number;
                if (entry[0]) {
                    endPos = range.end;
                } else {
                    endPos = this.sharedString.getLength();
                }
                const queryString = this.sharedString.getText(range.begin, endPos);
                const newRange: IRange = {
                    begin: range.begin + 1,
                    end: endPos + 1,
                };
                this.runtimeSpellCheck(newRange.begin, newRange.end, queryString);
            }
            this.pendingMarkers = [];
            this.tileMap.clear();
        }
    }

    private runtimeSpellCheck(beginPos: number, endPos: number, text: string) {
        const re = /\b\w+\b/g;
        let result: RegExpExecArray | null;
        let runningStart = beginPos;
        do {
            result = re.exec(text);
            if (result) {
                const start = result.index + beginPos;
                const end = re.lastIndex + beginPos;
                const candidate = result[0];
                if (this.spellingError(candidate.toLocaleLowerCase())) {
                    if (start > runningStart) {
                        this.sharedString.annotateRange(runningStart, start, { textError: null });
                    }
                    const textErrorInfo = this.makeTextErrorInfo(candidate);
                    if (this.verbose) {
                        console.log(`respell (${start}, ${end}): ${textErrorInfo.text}`);
                        let buf = "alternates: ";
                        for (const alt of textErrorInfo.alternates) {
                            buf += ` ${alt.text}:${alt.invDistance}:${alt.val}`;
                        }
                        console.log(buf);
                    }
                    this.sharedString.annotateRange(start, end, { textError: textErrorInfo });
                    runningStart = end;
                }
            }
        }
        while (result);
        if (endPos > runningStart) {
            this.sharedString.annotateRange(runningStart, endPos, { textError: null });
        }
    }
}

export class Spellchecker {
    private speller: Speller | undefined;

    constructor(
        private readonly root: Sequence.SharedString,
        private readonly dict: MergeTree.TST<number>) {
    }

    public checkSharedString() {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.root.loaded.then(() => {
            this.speller = new Speller(this.root, this.dict);
            this.speller.initialSpellCheck();
        });
    }

    public stop() {
        if (this.speller) {
            this.speller.stop();
        }
    }
}
