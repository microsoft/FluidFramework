/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// TODO: Some of these should be fixed
/* eslint-disable no-bitwise */
/* eslint-disable max-len */
/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable no-restricted-syntax */
/* eslint-disable guard-for-in */
/* eslint-disable @typescript-eslint/no-for-in-array */
/* eslint-disable no-shadow */
/* eslint-disable @typescript-eslint/consistent-type-assertions */

import fs from "fs";
import path from "path";
// eslint-disable-next-line import/no-duplicates
import * as MergeTree from "@fluidframework/merge-tree";
// eslint-disable-next-line no-duplicate-imports
import {
    TextSegment,
    createGroupOp,
    PropertySet,
    IMergeTreeOp,
    MergeTreeTextHelper,
    // eslint-disable-next-line import/no-duplicates
} from "@fluidframework/merge-tree";
import {
    LocalClientId,
    NonCollabClient,
    UnassignedSequenceNumber,
    UniversalSequenceNumber,
    // eslint-disable-next-line import/no-internal-modules
} from "@fluidframework/merge-tree/dist/constants";
// eslint-disable-next-line import/no-internal-modules
import { insertOverlayNode, onodeTypeKey, OverlayNodePosition } from "@fluidframework/merge-tree/dist/overlayTree";
// eslint-disable-next-line import/no-internal-modules
import { loadTextFromFile, TestClient, TestServer } from "@fluidframework/merge-tree/dist/test/";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import JsDiff from "diff";
import random from "random-js";
import * as Xmldoc from "xmldoc";
import * as SharedString from "../intervalCollection";

const clock = () => process.hrtime();

function elapsedMicroseconds(start: [number, number]) {
    const end: number[] = process.hrtime(start);
    const duration = Math.round((end[0] * 1000000) + (end[1] / 1000));
    return duration;
}

// Enum AsyncRoundState {
//     Insert,
//     Remove,
//     Tail
// }

// interface AsyncRoundInfo {
//     clientIndex: number;
//     state: AsyncRoundState;
//     insertSegmentCount?: number;
//     removeSegmentCount?: number;
//     iterIndex: number;
// }

export function propertyCopy() {
    const propCount = 2000;
    const iterCount = 10000;
    const a = <string[]>[];
    const v = <number[]>[];
    for (let i = 0; i < propCount; i++) {
        a[i] = `prop${i}`;
        v[i] = i;
    }
    let clockStart = clock();
    let obj: MergeTree.MapLike<number>;
    for (let j = 0; j < iterCount; j++) {
        obj = MergeTree.createMap<number>();
        for (let i = 0; i < propCount; i++) {
            obj[a[i]] = v[i];
        }
    }
    let et = elapsedMicroseconds(clockStart);
    let perIter = (et / iterCount).toFixed(3);
    let perProp = (et / (iterCount * propCount)).toFixed(3);
    console.log(`arr prop init time ${perIter} per init; ${perProp} per property`);
    clockStart = clock();
    for (let j = 0; j < iterCount; j++) {
        const bObj = MergeTree.createMap<number>();
        for (const key in obj) {
            bObj[key] = obj[key];
        }
    }
    et = elapsedMicroseconds(clockStart);
    perIter = (et / iterCount).toFixed(3);
    perProp = (et / (iterCount * propCount)).toFixed(3);
    console.log(`obj prop init time ${perIter} per init; ${perProp} per property`);
}

function makeBookmarks(client: TestClient, bookmarkCount: number) {
    const mt = random.engines.mt19937();
    mt.seedWithArray([0xdeadbeef, 0xfeedbed]);
    const bookmarks = <SharedString.SequenceInterval[]>[];
    const len = client.mergeTree.getLength(UniversalSequenceNumber, NonCollabClient);
    const maxRangeLen = Math.min(Math.floor(len / 100), 30);
    for (let i = 0; i < bookmarkCount; i++) {
        let pos1 = random.integer(0, len - 1)(mt);
        const rangeLen = random.integer(0, maxRangeLen)(mt);
        let pos2 = pos1 + rangeLen;
        if (pos2 >= len) {
            pos2 = len - 2;
        }
        if (pos1 > pos2) {
            const temp = pos1;
            pos1 = pos2;
            pos2 = temp;
        }
        const segoff1 = client.getContainingSegment(pos1);
        const segoff2 = client.getContainingSegment(pos2);

        if (segoff1 && segoff1.segment && segoff2 && segoff2.segment) {
            const baseSegment1 = <MergeTree.BaseSegment>segoff1.segment;
            const baseSegment2 = <MergeTree.BaseSegment>segoff2.segment;
            const lref1 = new MergeTree.LocalReference(client, baseSegment1, segoff1.offset);
            const lref2 = new MergeTree.LocalReference(client, baseSegment2, segoff2.offset);
            lref1.refType = MergeTree.ReferenceType.RangeBegin;
            lref1.addProperties({ [MergeTree.reservedRangeLabelsKey]: ["bookmark"] });
            // Can do this locally; for shared refs need to use id/index to ref end
            lref1.pairedRef = lref2;
            lref2.refType = MergeTree.ReferenceType.RangeEnd;
            lref2.addProperties({ [MergeTree.reservedRangeLabelsKey]: ["bookmark"] });
            client.addLocalReference(lref1);
            client.addLocalReference(lref2);
            bookmarks.push(new SharedString.SequenceInterval(lref1, lref2, MergeTree.IntervalType.Simple));
        } else {
            i--;
        }
    }
    return bookmarks;
}

function makeReferences(client: TestClient, referenceCount: number) {
    const mt = random.engines.mt19937();
    mt.seedWithArray([0xdeadbeef, 0xfeedbed]);
    const refs = <MergeTree.LocalReference[]>[];
    const len = client.mergeTree.getLength(UniversalSequenceNumber, NonCollabClient);
    for (let i = 0; i < referenceCount; i++) {
        const pos = random.integer(0, len - 1)(mt);
        const segoff = client.getContainingSegment(pos);
        if (segoff && segoff.segment) {
            const baseSegment = <MergeTree.BaseSegment>segoff.segment;
            const lref = new MergeTree.LocalReference(client, baseSegment, segoff.offset);
            if (i & 1) {
                lref.refType = MergeTree.ReferenceType.SlideOnRemove;
            }
            client.addLocalReference(lref);
            refs.push(lref);
        } else {
            i--;
        }
    }
    return refs;
}

export function TestPack(verbose = true) {
    const mt = random.engines.mt19937();
    mt.seedWithArray([0xdeadbeef, 0xfeedbed]);
    const smallSegmentCountDistribution = random.integer(1, 4);
    const randSmallSegmentCount = () => smallSegmentCountDistribution(mt);
    const textLengthDistribution = random.integer(1, 5);
    const randTextLength = () => textLengthDistribution(mt);
    const zedCode = 48;
    function randomString(len: number, c: string) {
        let str = "";
        for (let i = 0; i < len; i++) {
            str += c;
        }
        return str;
    }

    const checkIncr = false;

    let getTextTime = 0;
    let getTextCalls = 0;
    let crossGetTextTime = 0;
    let crossGetTextCalls = 0;
    // Let incrGetTextTime = 0;
    // let incrGetTextCalls = 0;
    // let catchUpTime = 0;
    // let catchUps = 0;

    function reportTiming(client: TestClient) {
        if (!verbose) {
            return;
        }
        const aveTime = (client.accumTime / client.accumOps).toFixed(1);
        const aveLocalTime = (client.localTime / client.localOps).toFixed(1);
        const stats = client.mergeTree.getStats();
        const windowTime = stats.windowTime;
        const packTime = stats.packTime;
        const ordTime = stats.ordTime;
        const aveWindowTime = ((windowTime || 0) / (client.accumOps)).toFixed(1);
        const aveOrdTime = ((ordTime || 0) / (client.accumOps)).toFixed(1);
        const avePackTime = ((packTime || 0) / (client.accumOps)).toFixed(1);
        const aveExtraWindowTime = (client.accumWindowTime / client.accumOps).toFixed(1);
        const aveWindow = (client.accumWindow / client.accumOps).toFixed(1);
        const adjTime = ((client.accumTime - (windowTime - client.accumWindowTime)) / client.accumOps).toFixed(1);
        if (client.localOps > 0) {
            console.log(`local time ${client.localTime} us ops: ${client.localOps} ave time ${aveLocalTime}`);
        }
        console.log(`ord time average: ${aveOrdTime}us max ${stats.maxOrdTime}us`);
        console.log(`${client.longClientId} accum time ${client.accumTime} us ops: ${client.accumOps} ave time ${aveTime} - wtime ${adjTime} pack ${avePackTime} ave window ${aveWindow}`);
        console.log(`${client.longClientId} accum window time ${client.accumWindowTime} us ave window time total ${aveWindowTime} not in ops ${aveExtraWindowTime}; max ${client.maxWindowTime}`);
    }

    function manyMergeTrees() {
        const mergeTreeCount = 2000000;
        const a = <MergeTree.MergeTree[]>Array(mergeTreeCount);
        for (let i = 0; i < mergeTreeCount; i++) {
            a[i] = new MergeTree.MergeTree();
        }
        for (; ;) { }
    }

    function clientServer(startFile?: string, initRounds = 1000) {
        const clientCount = 5;
        const fileSegCount = 0;
        const initString = "don't ask for whom the bell tolls; it tolls for thee";
        let snapInProgress = false;
        const asyncExec = false;
        const addSnapClient = false;
        const extractSnap = false;
        const includeMarkers = false;
        const measureBookmarks = true;
        let bookmarks: SharedString.SequenceInterval[];
        const bookmarkRangeTree = new MergeTree.IntervalTree<SharedString.SequenceInterval>();
        const testOrdinals = true;
        let ordErrors = 0;
        let ordSuccess = 0;
        const measureRanges = true;
        const referenceCount = 2000;
        const bookmarkCount = 5000;
        let references: MergeTree.LocalReference[];
        let refReads = 0;
        let refReadTime = 0;
        let posContextChecks = 0;
        let posContextTime = 0;
        let posContextResults = 0;
        let rangeOverlapTime = 0;
        let rangeOverlapChecks = 0;
        let overlapIntervalResults = 0;
        const testSyncload = false;
        let snapClient: TestClient;
        const useGroupOperationsForMoveWord = false;
        let annotateProps: PropertySet;
        const insertAsRefPos = false;

        let options = {};
        if (measureBookmarks) {
            options = { blockUpdateMarkers: true };
        }
        const server = new TestServer(options);
        server.measureOps = true;
        if (startFile) {
            loadTextFromFile(startFile, server.mergeTree, fileSegCount);
        } else {
            server.insertTextLocal(0, initString);
        }

        const clients = new Array<TestClient>(clientCount);
        for (let i = 0; i < clientCount; i++) {
            clients[i] = new TestClient();
            clients[i].measureOps = true;
            if (startFile) {
                loadTextFromFile(startFile, clients[i].mergeTree, fileSegCount);
            } else {
                clients[i].insertTextLocal(0, initString);
            }
            if (annotateProps) {
                clients[i].annotateRangeLocal(0, clients[i].getLength(), annotateProps, undefined);
            }
            clients[i].startOrUpdateCollaboration(`Fred${i}`);
        }
        server.startOrUpdateCollaboration("theServer");
        server.addClients(clients);
        if (measureBookmarks) {
            references = makeReferences(server, referenceCount);
            if (measureRanges) {
                bookmarks = makeBookmarks(server, bookmarkCount);
                for (const bookmark of bookmarks) {
                    bookmarkRangeTree.put(bookmark);
                }
            }
        }
        if (testSyncload) {
            const clockStart = clock();
            // Let segs = Paparazzo.Snapshot.loadSync("snap-initial");
            console.log(`sync load time ${elapsedMicroseconds(clockStart)}`);
            const fromLoad = new MergeTree.MergeTree();
            // FromLoad.reloadFromSegments(segs);
            const fromLoadText = new MergeTreeTextHelper(fromLoad).getText(UniversalSequenceNumber, NonCollabClient);
            const serverText = server.getText();
            if (fromLoadText !== serverText) {
                console.log("snap file vs. text file mismatch");
            }
        }
        if (addSnapClient) {
            snapClient = new TestClient();
            if (startFile) {
                loadTextFromFile(startFile, snapClient.mergeTree, fileSegCount);
            } else {
                snapClient.insertTextLocal(0, initString);
            }
            snapClient.startOrUpdateCollaboration("snapshot");
            server.addListeners([snapClient]);
        }

        function checkTextMatch() {
            // Console.log(`checking text match @${server.getCurrentSeq()}`);
            let clockStart = clock();
            const serverText = server.getText();
            getTextTime += elapsedMicroseconds(clockStart);
            getTextCalls++;
            if (checkIncr) {
                clockStart = clock();
                const serverIncrText = server.incrementalGetText();
                // IncrGetTextTime += elapsedMicroseconds(clockStart);
                // incrGetTextCalls++;
                if (serverIncrText !== serverText) {
                    console.log("incr get text mismatch");
                }
            }
            for (const client of clients) {
                const cliText = client.getText();
                if (cliText !== serverText) {
                    console.log(`mismatch @${server.getCurrentSeq()} client @${client.getCurrentSeq()} id: ${client.getClientId()}`);
                    // Console.log(serverText);
                    // console.log(cliText);
                    const diffParts = JsDiff.diffChars(serverText, cliText);
                    for (const diffPart of diffParts) {
                        let annotes = "";
                        if (diffPart.added) {
                            annotes += "added ";
                        }
                        else if (diffPart.removed) {
                            annotes += "removed ";
                        }
                        if (diffPart.count) {
                            annotes += `count: ${diffPart.count}`;
                        }
                        console.log(`text: ${diffPart.value} ${annotes}`);
                    }
                    console.log(server.mergeTree.toString());
                    console.log(client.mergeTree.toString());
                    return true;
                }
            }
            return false;
        }

        const rounds = initRounds;

        function clientProcessSome(client: TestClient, all = false) {
            const cliMsgCount = client.getMessageCount();
            let countToApply: number;
            if (all) {
                countToApply = cliMsgCount;
            }
            else {
                countToApply = random.integer(Math.floor(2 * cliMsgCount / 3), cliMsgCount)(mt);
            }
            client.applyMessages(countToApply);
        }

        function serverProcessSome(server: TestClient, all = false) {
            const svrMsgCount = server.getMessageCount();
            let countToApply: number;
            if (all) {
                countToApply = svrMsgCount;
            }
            else {
                countToApply = random.integer(Math.floor(2 * svrMsgCount / 3), svrMsgCount)(mt);
            }
            return server.applyMessages(countToApply);
        }

        function randomSpateOfInserts(client: TestClient, charIndex: number) {
            const textLen = randTextLength();
            const text = randomString(textLen, String.fromCharCode(zedCode + ((client.getCurrentSeq() + charIndex) % 50)));
            const preLen = client.getLength();
            const pos = random.integer(0, preLen)(mt);
            if (includeMarkers) {
                const markerOp = client.insertMarkerLocal(pos, MergeTree.ReferenceType.Tile,
                    { [MergeTree.reservedTileLabelsKey]: "test" });
                server.enqueueMsg(client.makeOpMessage(markerOp, UnassignedSequenceNumber));
            }
            const textOp = client.insertTextLocal(pos, text);
            server.enqueueMsg(client.makeOpMessage(textOp, UnassignedSequenceNumber));
            if (TestClient.useCheckQ) {
                client.enqueueTestString();
            }
        }

        function randomSpateOfRemoves(client: TestClient) {
            const dlen = randTextLength();
            const preLen = client.getLength();
            const pos = random.integer(0, preLen)(mt);
            const op = client.removeRangeLocal(pos, pos + dlen);
            server.enqueueMsg(client.makeOpMessage(op));
            if (TestClient.useCheckQ) {
                client.enqueueTestString();
            }
        }

        function randomWordMove(client: TestClient) {
            const word1 = client.findRandomWord();
            if (word1) {
                const removeStart = word1.pos;
                const removeEnd = removeStart + word1.text.length;
                const ops: IMergeTreeOp[] = [];
                const removeOp = client.removeRangeLocal(removeStart, removeEnd);
                if (!useGroupOperationsForMoveWord) {
                    server.enqueueMsg(client.makeOpMessage(removeOp));
                    if (TestClient.useCheckQ) {
                        client.enqueueTestString();
                    }
                } else {
                    ops.push(removeOp);
                }

                let word2 = client.findRandomWord();
                while (!word2) {
                    word2 = client.findRandomWord();
                }
                const pos = word2.pos + word2.text.length;

                let insertOp;
                const segOff = client.getContainingSegment(pos);
                if (!insertAsRefPos && segOff.segment) {
                    insertOp = client.insertAtReferencePositionLocal(
                        new MergeTree.LocalReference(client, segOff.segment, segOff.offset, MergeTree.ReferenceType.Transient),
                        TextSegment.make(word1.text));
                } else {
                    insertOp = client.insertTextLocal(pos, word1.text);
                }

                if (!useGroupOperationsForMoveWord) {
                    server.enqueueMsg(
                        client.makeOpMessage(insertOp));
                    if (TestClient.useCheckQ) {
                        client.enqueueTestString();
                    }
                } else {
                    ops.push(insertOp);
                }

                if (annotateProps) {
                    const annotateOp = client.annotateRangeLocal(pos, pos + word1.text.length, annotateProps, undefined);
                    if (!useGroupOperationsForMoveWord) {
                        server.enqueueMsg(client.makeOpMessage(annotateOp));
                    } else {
                        ops.push(annotateOp);
                    }
                }

                if (useGroupOperationsForMoveWord) {
                    server.enqueueMsg(client.makeOpMessage(createGroupOp(...ops)));
                    if (TestClient.useCheckQ) {
                        client.enqueueTestString();
                    }
                }
            }
        }

        let errorCount = 0;

        // Function asyncRoundStep(asyncInfo: AsyncRoundInfo, roundCount: number) {
        //     if (asyncInfo.state == AsyncRoundState.Insert) {
        //         if (!asyncInfo.insertSegmentCount) {
        //             asyncInfo.insertSegmentCount = randSmallSegmentCount();
        //         }
        //         if (asyncInfo.clientIndex == clients.length) {
        //             asyncInfo.state = AsyncRoundState.Remove;
        //             asyncInfo.iterIndex = 0;
        //         }
        //         else {
        //             let client = clients[asyncInfo.clientIndex];
        //             if (startFile) {
        //                 randomWordMove(client);
        //             }
        //             else {
        //                 randomSpateOfInserts(client, asyncInfo.iterIndex);
        //             }
        //             asyncInfo.iterIndex++;
        //             if (asyncInfo.iterIndex == asyncInfo.insertSegmentCount) {
        //                 asyncInfo.clientIndex++;
        //                 asyncInfo.insertSegmentCount = undefined;
        //                 asyncInfo.iterIndex = 0;
        //             }
        //         }
        //     }
        //     if (asyncInfo.state == AsyncRoundState.Remove) {
        //         if (!asyncInfo.removeSegmentCount) {
        //             asyncInfo.removeSegmentCount = Math.floor(3 * asyncInfo.insertSegmentCount / 4);
        //             if (asyncInfo.removeSegmentCount < 1) {
        //                 asyncInfo.removeSegmentCount = 1;
        //             }
        //         }
        //         if (asyncInfo.clientIndex == clients.length) {
        //             asyncInfo.state = AsyncRoundState.Tail;
        //         }
        //         else {
        //             let client = clients[asyncInfo.clientIndex];
        //             if (startFile) {
        //                 randomWordMove(client);
        //             }
        //             else {
        //                 randomSpateOfInserts(client, asyncInfo.iterIndex);
        //             }
        //             asyncInfo.iterIndex++;
        //             if (asyncInfo.iterIndex == asyncInfo.removeSegmentCount) {
        //                 asyncInfo.clientIndex++;
        //                 asyncInfo.removeSegmentCount = undefined;
        //                 asyncInfo.iterIndex = 0;
        //             }
        //         }
        //     }
        //     if (asyncInfo.state == AsyncRoundState.Tail) {
        //         finishRound(roundCount);
        //     }
        //     else {
        //         setImmediate(asyncRoundStep, asyncInfo, roundCount);
        //     }
        // }

        // function asyncRound(roundCount: number) {
        //     let asyncInfo = <AsyncRoundInfo>{
        //         clientIndex: 0,
        //         iterIndex: 0,
        //         state: AsyncRoundState.Insert
        //     }
        //     setImmediate(asyncRoundStep, asyncInfo, roundCount);
        // }

        let extractSnapTime = 0;
        let extractSnapOps = 0;
        function finishRound(roundCount: number) {
            // Process remaining messages
            if (serverProcessSome(server, true)) {
                return;
            }
            for (const client of clients) {
                clientProcessSome(client, true);
            }

            if (measureBookmarks) {
                const refReadsPerRound = 200;
                const posChecksPerRound = 200;
                const rangeChecksPerRound = 200;
                let clockStart = clock();
                for (let i = 0; i < refReadsPerRound; i++) {
                    references[i].toPosition();
                    refReads++;
                }
                refReadTime += elapsedMicroseconds(clockStart);
                if (testOrdinals) {
                    const mt = random.engines.mt19937();
                    mt.seedWithArray([0xdeadbeef, 0xfeedbed]);
                    const checkRange = <number[][]>[];
                    const len = server.mergeTree.getLength(UniversalSequenceNumber, server.getClientId());
                    for (let i = 0; i < rangeChecksPerRound; i++) {
                        const e = random.integer(0, len - 2)(mt);
                        const rangeSize = random.integer(1, Math.min(1000, len - 2))(mt);
                        let b = e - rangeSize;
                        if (b < 0) {
                            b = 0;
                        }
                        checkRange[i] = [b, b + rangeSize];
                        const segoff1 = server.getContainingSegment(checkRange[i][0]);
                        const segoff2 = server.getContainingSegment(checkRange[i][1]);
                        if (segoff1 && segoff2 && segoff1.segment && segoff2.segment) {
                            // Console.log(`[${checkRange[i][0]},${checkRange[i][1]})`);
                            if (segoff1.segment === segoff2.segment) {
                                // Console.log("same segment");
                            } else if (segoff1.segment.ordinal > segoff2.segment.ordinal) {
                                ordErrors++;
                                console.log(`reverse ordinals ${MergeTree.ordinalToArray(segoff1.segment.ordinal)} > ${MergeTree.ordinalToArray(segoff2.segment.ordinal)}`);
                                console.log(`segments ${segoff1.segment.toString()} ${segoff2.segment.toString()}`);
                                console.log(server.mergeTree.toString());
                                break;
                            } else {
                                ordSuccess++;
                                // Console.log(`happy ordinals ${MergeTree.ordinalToArray(segoff1.segment.ordinal)} < ${MergeTree.ordinalToArray(segoff2.segment.ordinal)}`);
                            }
                        } else {
                            // Console.log(`no seg for [${b},${e}) with len ${len}`);
                        }
                    }
                }
                if (measureRanges) {
                    const mt = random.engines.mt19937();
                    mt.seedWithArray([0xdeadbeef, 0xfeedbed]);
                    const len = server.mergeTree.getLength(UniversalSequenceNumber, server.getClientId());
                    const checkPos = <number[]>[];
                    const checkRange = <number[][]>[];
                    const checkPosRanges = <SharedString.SequenceInterval[]>[];
                    const checkRangeRanges = <SharedString.SequenceInterval[]>[];
                    for (let i = 0; i < posChecksPerRound; i++) {
                        checkPos[i] = random.integer(0, len - 2)(mt);
                        const segoff1 = server.getContainingSegment(checkPos[i]);
                        const segoff2 = server.getContainingSegment(checkPos[i] + 1);
                        if (segoff1 && segoff1.segment && segoff2 && segoff2.segment) {
                            const lrefPos1 = new MergeTree.LocalReference(server, <MergeTree.BaseSegment>segoff1.segment, segoff1.offset);
                            const lrefPos2 = new MergeTree.LocalReference(server, <MergeTree.BaseSegment>segoff2.segment, segoff2.offset);
                            checkPosRanges[i] = new SharedString.SequenceInterval(lrefPos1, lrefPos2, MergeTree.IntervalType.Simple);
                        } else {
                            i--;
                        }
                    }
                    for (let i = 0; i < rangeChecksPerRound; i++) {
                        const e = random.integer(0, len - 2)(mt);
                        const rangeSize = random.integer(1, Math.min(1000, len - 2))(mt);
                        let b = e - rangeSize;
                        if (b < 0) {
                            b = 0;
                        }
                        checkRange[i] = [b, b + rangeSize];
                        const segoff1 = server.getContainingSegment(checkRange[i][0]);
                        const segoff2 = server.getContainingSegment(checkRange[i][1]);
                        if (segoff1 && segoff1.segment && segoff2 && segoff2.segment) {
                            const lrefPos1 = new MergeTree.LocalReference(server, <MergeTree.BaseSegment>segoff1.segment, segoff1.offset);
                            const lrefPos2 = new MergeTree.LocalReference(server, <MergeTree.BaseSegment>segoff2.segment, segoff2.offset);
                            checkRangeRanges[i] = new SharedString.SequenceInterval(lrefPos1, lrefPos2, MergeTree.IntervalType.Simple);
                        } else {
                            i--;
                        }
                    }
                    const showResults = false;
                    clockStart = clock();

                    for (let i = 0; i < posChecksPerRound; i++) {
                        const ivals = bookmarkRangeTree.match(checkPosRanges[i]);
                        if (showResults) {
                            console.log(`results for point [${checkPos[i]},${checkPos[i] + 1})`);
                            for (const ival of ivals) {
                                const pos1 = server.mergeTree.referencePositionToLocalPosition(ival.key.start);
                                const pos2 = server.mergeTree.referencePositionToLocalPosition(ival.key.end);
                                console.log(`[${pos1},${pos2})`);
                            }
                        }
                        posContextResults += ivals.length;
                    }
                    posContextTime += elapsedMicroseconds(clockStart);
                    posContextChecks += posChecksPerRound;

                    clockStart = clock();
                    for (let i = 0; i < rangeChecksPerRound; i++) {
                        const ivals = bookmarkRangeTree.match(checkRangeRanges[i]);
                        if (showResults) {
                            console.log(`results for [${checkRange[i][0]},${checkRange[i][1]})`);
                            for (const ival of ivals) {
                                const pos1 = server.mergeTree.referencePositionToLocalPosition(ival.key.start);
                                const pos2 = server.mergeTree.referencePositionToLocalPosition(ival.key.end);
                                console.log(`[${pos1},${pos2})`);
                            }
                        }
                        overlapIntervalResults += ivals.length;
                    }
                    rangeOverlapTime += elapsedMicroseconds(clockStart);
                    rangeOverlapChecks += rangeChecksPerRound;
                }
            }

            if (extractSnap) {
                const clockStart = clock();
                // Let snapshot = new Paparazzo.Snapshot(snapClient.mergeTree);
                // snapshot.extractSync();
                extractSnapTime += elapsedMicroseconds(clockStart);
                extractSnapOps++;
            }
            /*
                        If (checkTextMatch()) {
                            console.log(`round: ${i}`);
                            break;
                        }
            */
            // console.log(server.getText());
            // console.log(server.mergeTree.toString());
            // console.log(server.mergeTree.getStats());
            if (0 === (roundCount % 100)) {
                const clockStart = clock();
                if (checkTextMatch()) {
                    console.log(`round: ${roundCount} BREAK`);
                    errorCount++;
                    return errorCount;
                }
                checkTime += elapsedMicroseconds(clockStart);
                if (verbose) {
                    console.log(`wall clock is ${((Date.now() - startTime) / 1000.0).toFixed(1)}`);
                }
                const stats = server.mergeTree.getStats();
                const liveAve = (stats.liveCount / stats.nodeCount).toFixed(1);
                const posLeaves = stats.leafCount - stats.removedLeafCount;
                let aveExtractSnapTime = "off";
                if (extractSnapOps > 0) {
                    aveExtractSnapTime = (extractSnapTime / extractSnapOps).toFixed(1);
                }
                console.log(`round: ${roundCount} seq ${server.seq} char count ${server.getLength()} height ${stats.maxHeight} lv ${stats.leafCount} rml ${stats.removedLeafCount} p ${posLeaves} nodes ${stats.nodeCount} pop ${liveAve} histo ${stats.histo}`);
                if (extractSnapOps > 0) {
                    aveExtractSnapTime = (extractSnapTime / extractSnapOps).toFixed(1);
                    console.log(`ave extract snap time ${aveExtractSnapTime}`);
                }
                reportTiming(server);
                if (measureBookmarks) {
                    const timePerRead = (refReadTime / refReads).toFixed(2);
                    const bookmarksPerSeg = (bookmarkCount / stats.leafCount).toFixed(2);
                    if (ordErrors > 0) {
                        console.log(`ord errors: ${ordErrors}`);
                    }
                    if (ordSuccess > 0) {
                        console.log(`total ord range tests ${ordSuccess}`);
                    }
                    console.log(`bookmark count ${bookmarkCount} ave. per seg ${bookmarksPerSeg} time/read ${timePerRead}`);
                    if (measureRanges) {
                        const timePerContextCheck = (posContextTime / posContextChecks).toFixed(2);
                        const results = (posContextResults / posContextChecks).toFixed(2);
                        console.log(`ave. per bookmark context check ${timePerContextCheck} ave results per check ${results}`);
                        const timePerRangeCheck = (rangeOverlapTime / rangeOverlapChecks).toFixed(2);
                        const resultsRange = (overlapIntervalResults / rangeOverlapChecks).toFixed(2);
                        console.log(`ave. per bookmark range check ${timePerRangeCheck} ave results per check ${resultsRange}`);
                    }
                }
                reportTiming(clients[2]);
                let totalTime = server.accumTime + server.accumWindowTime;
                for (const client of clients) {
                    totalTime += (client.accumTime + client.localTime + client.accumWindowTime);
                }
                if (verbose) {
                    console.log(`total time ${(totalTime / 1000000.0).toFixed(1)} check time ${(checkTime / 1000000.0).toFixed(1)}`);
                }
                // Console.log(server.getText());
                // console.log(server.mergeTree.toString());
            }
            return errorCount;
        }

        function round(roundCount: number) {
            for (const client of clients) {
                const insertSegmentCount = randSmallSegmentCount();
                for (let j = 0; j < insertSegmentCount; j++) {
                    if (startFile) {
                        randomWordMove(client);
                    }
                    else {
                        randomSpateOfInserts(client, j);
                    }
                }
                if (serverProcessSome(server)) {
                    return;
                }
                clientProcessSome(client);

                let removeSegmentCount = Math.floor(3 * insertSegmentCount / 4);
                if (removeSegmentCount < 1) {
                    removeSegmentCount = 1;
                }
                for (let j = 0; j < removeSegmentCount; j++) {
                    if (startFile) {
                        randomWordMove(client);
                    }
                    else {
                        randomSpateOfRemoves(client);
                        if (includeMarkers) {
                            if (client.getLength() > 200) {
                                randomSpateOfRemoves(client);
                            }
                        }
                    }
                }
                if (serverProcessSome(server)) {
                    return;
                }
                clientProcessSome(client);
            }
            finishRound(roundCount);
        }

        const startTime = Date.now();
        let checkTime = 0;
        let asyncRoundCount = 0;
        let lastSnap = 0;
        // Let checkSnapText = true;

        // function snapFinished() {
        //     snapInProgress = false;
        //     let curmin = snapClient.mergeTree.getCollabWindow().minSeq;
        //     console.log(`snap finished round ${asyncRoundCount} server seq ${server.getCurrentSeq()} seq ${snapClient.getCurrentSeq()} minseq ${curmin}`);
        //     let clockStart = clock();
        //     //snapClient.verboseOps = true;
        //     clientProcessSome(snapClient, true);
        //     catchUpTime += elapsedMicroseconds(clockStart);
        //     catchUps++;
        //     if (checkSnapText) {
        //         let serverText = server.getText();
        //         let snapText = snapClient.getText();
        //         if (serverText != snapText) {
        //             console.log(`mismatch @${server.getCurrentSeq()} client @${snapClient.getCurrentSeq()} id: ${snapClient.getClientId()}`);
        //         }
        //     }
        // }

        function ohSnap(filename: string) {
            snapInProgress = true;
            const curmin = snapClient.getCollabWindow().minSeq;
            lastSnap = curmin;
            console.log(`snap started seq ${snapClient.getCurrentSeq()} minseq ${curmin}`);
            // Let snapshot = new Paparazzo.Snapshot(snapClient.mergeTree, filename, snapFinished);
            // snapshot.start();
        }

        function asyncStep() {
            round(asyncRoundCount);
            const curmin = server.getCollabWindow().minSeq;
            if ((!snapInProgress) && (lastSnap < curmin)) {
                ohSnap("snapit");
            }
            asyncRoundCount++;
            if (asyncRoundCount < rounds) {
                setImmediate(asyncStep);
            }
        }

        if (asyncExec) {
            ohSnap("snap-initial");
            setImmediate(asyncStep);
        }
        else {
            for (let i = 0; i < rounds; i++) {
                round(i);
                if (errorCount > 0) {
                    break;
                }
            }
            tail();
        }
        function tail() {
            reportTiming(server);
            reportTiming(clients[2]);
            // Console.log(server.getText());
            // console.log(server.mergeTree.toString());
        }
        return errorCount;
    }

    function clientServerBranch(startFile?: string, initRounds = 1000) {
        const clientCountA = 2;
        const clientCountB = 2;
        const fileSegCount = 0;
        const initString = "don't ask for whom the bell tolls; it tolls for thee";

        const serverA = new TestServer();
        serverA.measureOps = true;
        const serverB = new TestServer();
        serverB.measureOps = true;
        if (startFile) {
            loadTextFromFile(startFile, serverA.mergeTree, fileSegCount);
            loadTextFromFile(startFile, serverB.mergeTree, fileSegCount);
        } else {
            serverA.insertTextLocal(0, initString);
            serverB.insertTextLocal(0, initString);
        }

        const clientsA = new Array<TestClient>(clientCountA);
        const clientsB = new Array<TestClient>(clientCountB);

        for (let i = 0; i < clientCountA; i++) {
            clientsA[i] = new TestClient();
            clientsA[i].measureOps = true;
            if (startFile) {
                loadTextFromFile(startFile, clientsA[i].mergeTree, fileSegCount);
            } else {
                clientsA[i].insertTextLocal(0, initString);
            }
            clientsA[i].startOrUpdateCollaboration(`FredA${i}`);
        }

        for (let i = 0; i < clientCountB; i++) {
            clientsB[i] = new TestClient();
            clientsB[i].measureOps = true;
            if (startFile) {
                loadTextFromFile(startFile, clientsB[i].mergeTree, fileSegCount);
            } else {
                clientsB[i].insertTextLocal(0, initString);
            }
            clientsB[i].startOrUpdateCollaboration(`FredB${i}`, /* minSeq: */ 0, /* currentSeq: */ 0, /* branchId: */ 1);
        }
        for (let i = 0; i < clientCountB; i++) {
            const clientB = clientsB[i];
            serverB.getOrAddShortClientId(clientB.longClientId, 1);
            for (let j = 0; j < clientCountB; j++) {
                const otherBClient = clientsB[j];
                if (otherBClient !== clientB) {
                    otherBClient.getOrAddShortClientId(clientB.longClientId, 1);
                }
            }
        }
        serverA.startOrUpdateCollaboration("theServerA");
        serverA.addClients(clientsA);
        serverA.addListeners([serverB]);
        serverB.startOrUpdateCollaboration("theServerB", /* minSeq: */ 0, /* currentSeq: */ 0, /* branchId: */ 1);
        serverB.addClients(clientsB);
        serverB.addUpstreamClients(clientsA);

        function crossBranchTextMatch(serverA: TestServer, serverB: TestServer, aClientId: string) {
            let clockStart = clock();
            const serverAText = serverA.getText();
            getTextTime += elapsedMicroseconds(clockStart);
            getTextCalls++;
            clockStart = clock();
            // eslint-disable-next-line no-null/no-null
            const serverBAText = new MergeTreeTextHelper(serverB.mergeTree).getText(serverB.getCurrentSeq(), serverB.getOrAddShortClientId(aClientId, null));
            crossGetTextTime += elapsedMicroseconds(clockStart);
            crossGetTextCalls++;
            if (serverAText !== serverBAText) {
                console.log(`cross mismatch @${serverA.getCurrentSeq()} serverB @${serverB.getCurrentSeq()}`);
                return true;
            }
        }

        function checkTextMatch(clients: TestClient[], server: TestServer) {
            // Console.log(`checking text match @${server.getCurrentSeq()}`);
            const clockStart = clock();
            const serverText = server.getText();
            getTextTime += elapsedMicroseconds(clockStart);
            getTextCalls++;
            for (const client of clients) {
                const showDiff = true;
                const cliText = client.getText();
                if (cliText !== serverText) {
                    console.log(`mismatch @${server.getCurrentSeq()} client @${client.getCurrentSeq()} id: ${client.getClientId()}`);
                    // Console.log(serverText);
                    // console.log(cliText);
                    if (showDiff) {
                        const diffParts = JsDiff.diffChars(serverText, cliText);
                        for (const diffPart of diffParts) {
                            let annotes = "";
                            if (diffPart.added) {
                                annotes += "added ";
                            }
                            else if (diffPart.removed) {
                                annotes += "removed ";
                            }
                            if (diffPart.count) {
                                annotes += `count: ${diffPart.count}`;
                            }
                            console.log(`text: ${diffPart.value} ${annotes}`);
                        }
                    }
                    console.log(`Server MT ${server.longClientId}`);
                    console.log(server.mergeTree.toString());
                    console.log(`Client MT ${client.longClientId}`);
                    console.log(client.mergeTree.toString());
                    return true;
                }
            }
            return false;
        }

        const rounds = initRounds;

        function clientProcessSome(client: TestClient, all = false) {
            const cliMsgCount = client.getMessageCount();
            let countToApply: number;
            if (all) {
                countToApply = cliMsgCount;
            }
            else {
                countToApply = random.integer(Math.floor(2 * cliMsgCount / 3), cliMsgCount)(mt);
            }
            client.applyMessages(countToApply);
        }

        function serverProcessSome(server: TestClient, all = false) {
            const svrMsgCount = server.getMessageCount();
            let countToApply: number;
            if (all) {
                countToApply = svrMsgCount;
            }
            else {
                countToApply = random.integer(Math.floor(2 * svrMsgCount / 3), svrMsgCount)(mt);
            }
            return server.applyMessages(countToApply);
        }

        function randomSpateOfInserts(client: TestClient, server: TestServer, charIndex: number) {
            const textLen = randTextLength();
            const text = randomString(textLen, String.fromCharCode(zedCode + ((client.getCurrentSeq() + charIndex) % 50)));
            const preLen = client.getLength();
            const pos = random.integer(0, preLen)(mt);
            const insertOp = client.insertTextLocal(pos, text);
            server.enqueueMsg(client.makeOpMessage(insertOp, UnassignedSequenceNumber));
            if (TestClient.useCheckQ) {
                client.enqueueTestString();
            }
        }

        function randomSpateOfRemoves(client: TestClient, server: TestServer) {
            const dlen = randTextLength();
            const preLen = client.getLength();
            const pos = random.integer(0, preLen)(mt);
            const removeOp = client.removeRangeLocal(pos, pos + dlen);
            server.enqueueMsg(client.makeOpMessage(removeOp, UnassignedSequenceNumber));
            if (TestClient.useCheckQ) {
                client.enqueueTestString();
            }
        }

        function randomWordMove(client: TestClient, server: TestServer) {
            const word1 = client.findRandomWord();
            if (word1) {
                const removeStart = word1.pos;
                const removeEnd = removeStart + word1.text.length;
                const removeOp = client.removeRangeLocal(removeStart, removeEnd);
                server.enqueueMsg(client.makeOpMessage(removeOp, UnassignedSequenceNumber));
                if (TestClient.useCheckQ) {
                    client.enqueueTestString();
                }
                let word2 = client.findRandomWord();
                while (!word2) {
                    word2 = client.findRandomWord();
                }
                const pos = word2.pos + word2.text.length;
                const insertOp = client.insertTextLocal(pos, word1.text);
                server.enqueueMsg(client.makeOpMessage(insertOp, UnassignedSequenceNumber));
                if (TestClient.useCheckQ) {
                    client.enqueueTestString();
                }
            }
        }

        let errorCount = 0;

        function finishRound(roundCount: number) {
            // Process remaining messages
            if (serverProcessSome(serverA, true)) {
                return;
            }
            if (serverProcessSome(serverB, true)) {
                return;
            }
            for (const client of clientsA) {
                clientProcessSome(client, true);
            }
            for (const client of clientsB) {
                clientProcessSome(client, true);
            }
            const allRounds = false;
            if (allRounds || (0 === (roundCount % 100))) {
                const clockStart = clock();
                if (crossBranchTextMatch(serverA, serverB, clientsA[0].longClientId)) {
                    errorCount++;
                }
                if (checkTextMatch(clientsA, serverA)) {
                    console.log(`round: ${roundCount} BREAK`);
                    errorCount++;
                    return errorCount;
                }
                if (checkTextMatch(clientsB, serverB)) {
                    console.log(`round: ${roundCount} BREAK`);
                    errorCount++;
                    return errorCount;
                }
                checkTime += elapsedMicroseconds(clockStart);
                if (verbose) {
                    console.log(`wall clock is ${((Date.now() - startTime) / 1000.0).toFixed(1)}`);
                }
                const statsA = serverA.mergeTree.getStats();
                const statsB = serverB.mergeTree.getStats();
                const liveAve = (statsA.liveCount / statsA.nodeCount).toFixed(1);
                const liveAveB = (statsB.liveCount / statsB.nodeCount).toFixed(1);

                const posLeaves = statsA.leafCount - statsA.removedLeafCount;
                const posLeavesB = statsB.leafCount - statsB.removedLeafCount;

                console.log(`round: ${roundCount} A> seqA ${serverA.seq} char count ${serverA.getLength()} height ${statsA.maxHeight} lv ${statsA.leafCount} rml ${statsA.removedLeafCount} p ${posLeaves} nodes ${statsA.nodeCount} pop ${liveAve} histo ${statsA.histo}`);
                console.log(`round: ${roundCount} B> seqB ${serverB.seq} char count ${serverB.getLength()} height ${statsB.maxHeight} lv ${statsB.leafCount} rml ${statsB.removedLeafCount} p ${posLeavesB} nodes ${statsB.nodeCount} pop ${liveAveB} histo ${statsB.histo}`);
                reportTiming(serverA);
                reportTiming(serverB);
                reportTiming(clientsA[1]);
                reportTiming(clientsB[1]);
                const aveGetTextTime = (getTextTime / getTextCalls).toFixed(1);
                const perLeafAveGetTextTime = ((getTextTime / getTextCalls) / statsA.leafCount).toFixed(1);
                const perLeafAveCrossGetTextTime = ((crossGetTextTime / crossGetTextCalls) / statsB.leafCount).toFixed(1);
                const aveCrossGetTextTime = (crossGetTextTime / crossGetTextCalls).toFixed(1);
                // Let aveIncrGetTextTime = "off";
                // let aveCatchUpTime = "off";
                // if (catchUps > 0) {
                //     aveCatchUpTime = (catchUpTime / catchUps).toFixed(1);
                // }
                // if (checkIncr) {
                //     aveIncrGetTextTime = (incrGetTextTime / incrGetTextCalls).toFixed(1);
                // }
                console.log(`get text time: ${aveGetTextTime}; ${perLeafAveGetTextTime}/leaf cross: ${aveCrossGetTextTime}; ${perLeafAveCrossGetTextTime}/leaf`);

                let totalTime = serverA.accumTime + serverA.accumWindowTime;
                for (const client of clientsA) {
                    totalTime += (client.accumTime + client.localTime + client.accumWindowTime);
                }
                for (const client of clientsB) {
                    totalTime += (client.accumTime + client.localTime + client.accumWindowTime);
                }
                if (verbose) {
                    console.log(`total time ${(totalTime / 1000000.0).toFixed(1)} check time ${(checkTime / 1000000.0).toFixed(1)}`);
                }
                // Console.log(server.getText());
                // console.log(server.mergeTree.toString());
            }
            return errorCount;
        }

        function round(roundCount: number, clients: TestClient[], server: TestServer) {
            const small = true;
            for (const client of clients) {
                let insertSegmentCount = randSmallSegmentCount();
                if (small) {
                    insertSegmentCount = 1;
                }
                for (let j = 0; j < insertSegmentCount; j++) {
                    if (startFile) {
                        randomWordMove(client, server);
                    }
                    else {
                        randomSpateOfInserts(client, server, j);
                    }
                }
                if (serverProcessSome(server)) {
                    return;
                }
                clientProcessSome(client);

                let removeSegmentCount = Math.floor(3 * insertSegmentCount / 4);
                if (small || (removeSegmentCount < 1)) {
                    removeSegmentCount = 1;
                }
                for (let j = 0; j < removeSegmentCount; j++) {
                    if (startFile) {
                        randomWordMove(client, server);
                    }
                    else {
                        if (client.getLength() > 200) {
                            randomSpateOfRemoves(client, server);
                        }
                    }
                }
                if (serverProcessSome(server)) {
                    return;
                }
                clientProcessSome(client);
            }
        }

        const startTime = Date.now();
        let checkTime = 0;

        for (let i = 0; i < rounds; i++) {
            round(i, clientsA, serverA);
            round(i, clientsB, serverB);
            finishRound(i);
            if (errorCount > 0) {
                break;
            }
        }
        tail();
        function tail() {
            reportTiming(serverA);
            reportTiming(clientsA[1]);
            reportTiming(clientsB[1]);
            // Console.log(server.getText());
            // console.log(server.mergeTree.toString());
        }
        return errorCount;
    }
    const clientNames = ["Ed", "Ted", "Ned", "Harv", "Marv", "Glenda", "Susan"];

    function firstTest() {
        let cli = new TestClient();
        cli.insertTextLocal(0, "on the mat.");
        cli.startOrUpdateCollaboration("Fred1");
        for (const cname of clientNames) {
            cli.addLongClientId(cname);
        }
        cli.insertTextRemote(0, "that ", undefined, 1, 0, "1");
        if (verbose) {
            console.log(cli.mergeTree.toString());
        }
        cli.insertTextRemote(0, "fat ", undefined, 2, 0, "2");
        if (verbose) {
            console.log(cli.mergeTree.toString());
        }
        cli.insertTextLocal(5, "cat ");
        if (verbose) {
            console.log(cli.mergeTree.toString());
        }
        if (verbose) {
            for (let i = 0; i < 4; i++) {
                for (let j = 0; j < 3; j++) {
                    console.log(cli.relText(i, j));
                }
            }
        }
        cli.mergeTree.ackPendingSegment({
            op: { type: MergeTree.MergeTreeDeltaType.INSERT },
            sequencedMessage: {
                sequenceNumber: 3,
            } as ISequencedDocumentMessage,
        });
        if (verbose) {
            console.log(cli.mergeTree.toString());
            for (let clientId = 0; clientId < 4; clientId++) {
                for (let refSeq = 0; refSeq < 4; refSeq++) {
                    console.log(cli.relText(clientId, refSeq));
                }
            }
        }
        cli.insertTextRemote(6, "very ", undefined, 4, 2, "2");
        cli.insertMarkerRemote(0, { refType: MergeTree.ReferenceType.Tile },
            { [MergeTree.reservedTileLabelsKey]: ["peach"] },
            5, 0, "2");
        if (verbose) {
            console.log(cli.mergeTree.toString());
            for (let clientId = 0; clientId < 4; clientId++) {
                for (let refSeq = 0; refSeq < 5; refSeq++) {
                    console.log(cli.relText(clientId, refSeq));
                }
            }
        }

        cli = new TestClient();
        cli.insertTextLocal(0, " old sock!");
        cli.startOrUpdateCollaboration("Fred2");
        for (const cname of clientNames) {
            cli.addLongClientId(cname);
        }
        cli.insertTextRemote(0, "abcde", undefined, 1, 0, "2");
        const segoff = cli.getContainingSegment(0);
        const lref1 = new MergeTree.LocalReference(cli, <MergeTree.BaseSegment>(segoff.segment),
            segoff.offset);
        cli.insertTextRemote(0, "yyy", undefined, 2, 0, "1");
        cli.insertTextRemote(2, "zzz", undefined, 3, 1, "3");
        cli.insertTextRemote(1, "EAGLE", undefined, 4, 1, "4");
        cli.insertTextRemote(4, "HAS", undefined, 5, 1, "5");
        cli.insertTextLocal(19, " LANDED");
        cli.insertTextRemote(0, "yowza: ", undefined, 6, 4, "2");
        const lref1pos = cli.mergeTree.referencePositionToLocalPosition(lref1);
        console.log(`lref pos: ${lref1pos}`);
        cli.mergeTree.ackPendingSegment({
            op: { type: MergeTree.MergeTreeDeltaType.INSERT },
            sequencedMessage: {
                sequenceNumber: 7,
            } as ISequencedDocumentMessage,
        });
        if (verbose) {
            console.log(cli.mergeTree.toString());
            for (let clientId = 0; clientId < 6; clientId++) {
                for (let refSeq = 0; refSeq < 8; refSeq++) {
                    console.log(cli.relText(clientId, refSeq));
                }
            }
        }
        cli.applyMsg(cli.makeOpMessage(
            MergeTree.createRemoveRangeOp(3, 5),
            8,
            6,
            "1"));
        if (verbose) {
            console.log(cli.mergeTree.toString());
            for (let clientId = 0; clientId < 6; clientId++) {
                for (let refSeq = 0; refSeq < 9; refSeq++) {
                    console.log(cli.relText(clientId, refSeq));
                }
            }
        }
        cli = new TestClient();
        cli.insertTextLocal(0, "abcdefgh");
        cli.startOrUpdateCollaboration("Fred3");
        for (const cname of clientNames) {
            cli.addLongClientId(cname);
        }
        cli.applyMsg(cli.makeOpMessage(
            MergeTree.createRemoveRangeOp(1, 3),
            1,
            0,
            "3"));
        if (verbose) {
            console.log(cli.mergeTree.toString());
        }
        cli.insertTextRemote(2, "zzz", undefined, 2, 0, "2");
        if (verbose) {
            console.log(cli.mergeTree.toString());
        }
        let fwdRanges = cli.mergeTree.findHistorialRange(0, 5, 1, 2, cli.getClientId());
        if (verbose) {
            console.log(`fwd range 0 5 on 1 => 2`);
            for (const r of fwdRanges) {
                console.log(`fwd range (${r.start}, ${r.end})`);
            }
        }
        const fwdPos = cli.mergeTree.findHistorialPosition(2, 1, 2, cli.getClientId());
        if (verbose) {
            console.log(`fwd pos 2 on 1 => 2 is ${fwdPos}`);
            for (let clientId = 0; clientId < 4; clientId++) {
                for (let refSeq = 0; refSeq < 3; refSeq++) {
                    console.log(cli.relText(clientId, refSeq));
                }
            }
        }
        cli.insertTextRemote(9, " chaser", undefined, 3, 2, "3");
        cli.removeRangeLocal(12, 14);
        cli.mergeTree.ackPendingSegment({
            op: { type: MergeTree.MergeTreeDeltaType.REMOVE },
            sequencedMessage: {
                sequenceNumber: 4,
            } as ISequencedDocumentMessage,
        });
        if (verbose) {
            console.log(cli.mergeTree.toString());
            for (let clientId = 0; clientId < 4; clientId++) {
                for (let refSeq = 0; refSeq < 5; refSeq++) {
                    console.log(cli.relText(clientId, refSeq));
                }
            }
        }
        cli.insertTextLocal(14, "*yolumba*");
        cli.insertTextLocal(17, "-zanzibar-");
        cli.mergeTree.ackPendingSegment({
            op: { type: MergeTree.MergeTreeDeltaType.INSERT },
            sequencedMessage: {
                sequenceNumber: 5,
            } as ISequencedDocumentMessage,
        });
        cli.insertTextRemote(2, "(aaa)", undefined, 6, 4, "2");
        cli.mergeTree.ackPendingSegment({
            op: { type: MergeTree.MergeTreeDeltaType.INSERT },
            sequencedMessage: {
                sequenceNumber: 7,
            } as ISequencedDocumentMessage,
        });
        if (verbose) {
            console.log(cli.mergeTree.toString());
            for (let clientId = 0; clientId < 4; clientId++) {
                for (let refSeq = 0; refSeq < 8; refSeq++) {
                    console.log(cli.relText(clientId, refSeq));
                }
            }
        }
        /*
        Cli.removeRangeLocal(3,8);
        cli.removeRangeLocal(5,7);
        cli.ackPendingSegment(8);
        cli.ackPendingSegment(9);
        */
        cli.applyMsg(cli.makeOpMessage(
            MergeTree.createRemoveRangeOp(3, 8),
            8,
            7,
            "2"));
        cli.applyMsg(cli.makeOpMessage(
            MergeTree.createRemoveRangeOp(5, 7),
            9,
            7,
            "2"));
        if (verbose) {
            console.log(cli.mergeTree.toString());
            for (let clientId = 0; clientId < 4; clientId++) {
                for (let refSeq = 0; refSeq < 10; refSeq++) {
                    console.log(cli.relText(clientId, refSeq));
                }
            }
        }
        const localRemoveOp = cli.removeRangeLocal(3, 5);
        fwdRanges = cli.mergeTree.findHistorialRangeFromClient(3, 6, 9, 10, 2);
        if (verbose) {
            console.log(cli.mergeTree.toString());
            console.log(`fwd range 3 6 on cli 2 refseq 9 => cli 0 local`);
            for (const r of fwdRanges) {
                console.log(`fwd range (${r.start}, ${r.end})`);
            }
        }
        cli.applyMsg(cli.makeOpMessage(
            MergeTree.createRemoveRangeOp(3, 6),
            10,
            9,
            "2"));
        cli.applyMsg(cli.makeOpMessage(localRemoveOp, 11));
        if (verbose) {
            console.log(cli.mergeTree.toString());
            for (let clientId = 0; clientId < 4; clientId++) {
                for (let refSeq = 0; refSeq < 12; refSeq++) {
                    console.log(cli.relText(clientId, refSeq));
                }
            }
        }
    }

    return {
        firstTest,
        clientServer,
        clientServerBranch,
        manyMergeTrees,
    };
}

const editFlat = (source: string, s: number, dl: number, nt = "") =>
    source.substring(0, s) + nt + source.substring(s + dl, source.length);

let accumTime = 0;

function checkInsertMergeTree(
    mergeTree: MergeTree.MergeTree,
    pos: number,
    textSegment: MergeTree.TextSegment,
    verbose = false,
) {
    const helper = new MergeTreeTextHelper(mergeTree);
    let checkText = helper.getText(UniversalSequenceNumber, LocalClientId);
    checkText = editFlat(checkText, pos, 0, textSegment.text);
    const clockStart = clock();
    mergeTree.insertSegments(
        pos,
        [new TextSegment(textSegment.text)],
        UniversalSequenceNumber,
        LocalClientId,
        UniversalSequenceNumber,
        undefined);
    accumTime += elapsedMicroseconds(clockStart);
    const updatedText = helper.getText(UniversalSequenceNumber, LocalClientId);
    const result = (checkText === updatedText);
    if ((!result) && verbose) {
        console.log(`mismatch(o): ${checkText}`);
        console.log(`mismatch(u): ${updatedText}`);
    }
    return result;
}

function checkRemoveMergeTree(mergeTree: MergeTree.MergeTree, start: number, end: number, verbose = false) {
    const helper = new MergeTreeTextHelper(mergeTree);
    const origText = helper.getText(UniversalSequenceNumber, LocalClientId);
    const checkText = editFlat(origText, start, end - start);
    const clockStart = clock();
    mergeTree.removeRange(start, end, UniversalSequenceNumber, LocalClientId);
    accumTime += elapsedMicroseconds(clockStart);
    const updatedText = helper.getText(UniversalSequenceNumber, LocalClientId);
    const result = (checkText === updatedText);
    if ((!result) && verbose) {
        console.log(`mismatch(o): ${origText}`);
        console.log(`mismatch(c): ${checkText}`);
        console.log(`mismatch(u): ${updatedText}`);
    }
    return result;
}

function checkMarkRemoveMergeTree(mergeTree: MergeTree.MergeTree, start: number, end: number, verbose = false) {
    const helper = new MergeTreeTextHelper(mergeTree);
    const origText = helper.getText(UniversalSequenceNumber, LocalClientId);
    const checkText = editFlat(origText, start, end - start);
    const clockStart = clock();
    mergeTree.markRangeRemoved(start, end, UniversalSequenceNumber, LocalClientId, UniversalSequenceNumber, false, undefined);
    accumTime += elapsedMicroseconds(clockStart);
    const updatedText = helper.getText(UniversalSequenceNumber, LocalClientId);
    const result = (checkText === updatedText);
    if ((!result) && verbose) {
        console.log(`mismatch(o): ${origText}`);
        console.log(`mismatch(c): ${checkText}`);
        console.log(`mismatch(u): ${updatedText}`);
    }
    return result;
}

const makeCollabTextSegment = (text: string) => new MergeTree.TextSegment(text);

export function mergeTreeCheckedTest() {
    const mergeTree = new MergeTree.MergeTree();
    mergeTree.insertSegments(0, [TextSegment.make("the cat is on the mat")], UniversalSequenceNumber, LocalClientId, UniversalSequenceNumber, undefined);
    const insertCount = 2000;
    const removeCount = 1400;
    const largeRemoveCount = 20;
    const mt = random.engines.mt19937();
    mt.seedWithArray([0xdeadbeef, 0xfeedbed]);
    const imin = 1;
    const imax = 9;
    const distribution = random.integer(imin, imax);
    const largeDistribution = random.integer(10, 1000);
    const randInt = () => distribution(mt);
    const randLargeInt = () => largeDistribution(mt);
    function randomString(len: number, c: string) {
        let str = "";
        for (let i = 0; i < len; i++) {
            str += c;
        }
        return str;
    }
    accumTime = 0;
    let accumTreeSize = 0;
    let treeCount = 0;
    let errorCount = 0;
    for (let i = 0; i < insertCount; i++) {
        const slen = randInt();
        const s = randomString(slen, String.fromCharCode(48 + slen));
        const preLen = mergeTree.getLength(UniversalSequenceNumber, LocalClientId);
        const pos = random.integer(0, preLen)(mt);
        if (!checkInsertMergeTree(mergeTree, pos, makeCollabTextSegment(s), true)) {
            console.log(`i: ${i} preLen ${preLen} pos: ${pos} slen: ${slen} s: ${s} itree len: ${mergeTree.getLength(UniversalSequenceNumber, LocalClientId)}`);
            console.log(mergeTree.toString());
            errorCount++;
            break;
        }
        if ((i > 0) && (0 === (i % 1000))) {
            const perIter = (accumTime / (i + 1)).toFixed(3);
            treeCount++;
            accumTreeSize += mergeTree.getLength(UniversalSequenceNumber, LocalClientId);
            const averageTreeSize = (accumTreeSize / treeCount).toFixed(3);
            console.log(`i: ${i} time: ${accumTime}us which is average ${perIter} per insert with average tree size ${averageTreeSize}`);
        }
    }
    accumTime = 0;
    accumTreeSize = 0;
    treeCount = 0;
    for (let i = 0; i < largeRemoveCount; i++) {
        const dlen = randLargeInt();
        const preLen = mergeTree.getLength(UniversalSequenceNumber, LocalClientId);
        const pos = random.integer(0, preLen)(mt);
        // Console.log(itree.toString());
        if (!checkRemoveMergeTree(mergeTree, pos, pos + dlen, true)) {
            console.log(`i: ${i} preLen ${preLen} pos: ${pos} dlen: ${dlen} itree len: ${mergeTree.getLength(UniversalSequenceNumber, LocalClientId)}`);
            console.log(mergeTree.toString());
            break;
        }
        if ((i > 0) && (0 === (i % 10))) {
            const perIter = (accumTime / (i + 1)).toFixed(3);
            treeCount++;
            accumTreeSize += mergeTree.getLength(UniversalSequenceNumber, LocalClientId);
            const averageTreeSize = (accumTreeSize / treeCount).toFixed(3);
            console.log(`i: ${i} time: ${accumTime}us which is average ${perIter} per large del with average tree size ${averageTreeSize}`);
        }
    }
    accumTime = 0;
    accumTreeSize = 0;
    treeCount = 0;
    for (let i = 0; i < removeCount; i++) {
        const dlen = randInt();
        const preLen = mergeTree.getLength(UniversalSequenceNumber, LocalClientId);
        const pos = random.integer(0, preLen)(mt);
        // Console.log(itree.toString());
        if (i & 1) {
            if (!checkMarkRemoveMergeTree(mergeTree, pos, pos + dlen, true)) {
                console.log(`mr i: ${i} preLen ${preLen} pos: ${pos} dlen: ${dlen} itree len: ${mergeTree.getLength(UniversalSequenceNumber, LocalClientId)}`);
                console.log(mergeTree.toString());
                errorCount++;
                break;
            }
        }
        else {
            if (!checkRemoveMergeTree(mergeTree, pos, pos + dlen, true)) {
                console.log(`i: ${i} preLen ${preLen} pos: ${pos} dlen: ${dlen} itree len: ${mergeTree.getLength(UniversalSequenceNumber, LocalClientId)}`);
                console.log(mergeTree.toString());
                errorCount++;
                break;
            }
        }
        if ((i > 0) && (0 === (i % 1000))) {
            const perIter = (accumTime / (i + 1)).toFixed(3);
            treeCount++;
            accumTreeSize += mergeTree.getLength(UniversalSequenceNumber, LocalClientId);
            const averageTreeSize = (accumTreeSize / treeCount).toFixed(3);
            console.log(`i: ${i} time: ${accumTime}us which is average ${perIter} per del with average tree size ${averageTreeSize}`);
        }
    }
    accumTime = 0;
    accumTreeSize = 0;
    treeCount = 0;
    for (let i = 0; i < insertCount; i++) {
        const slen = randInt();
        const s = randomString(slen, String.fromCharCode(48 + slen));
        const preLen = mergeTree.getLength(UniversalSequenceNumber, LocalClientId);
        const pos = random.integer(0, preLen)(mt);
        if (!checkInsertMergeTree(mergeTree, pos, makeCollabTextSegment(s), true)) {
            console.log(`i: ${i} preLen ${preLen} pos: ${pos} slen: ${slen} s: ${s} itree len: ${mergeTree.getLength(UniversalSequenceNumber, LocalClientId)}`);
            console.log(mergeTree.toString());
            errorCount++;
            break;
        }
        if ((i > 0) && (0 === (i % 1000))) {
            const perIter = (accumTime / (i + 1)).toFixed(3);
            treeCount++;
            accumTreeSize += mergeTree.getLength(UniversalSequenceNumber, LocalClientId);
            const averageTreeSize = (accumTreeSize / treeCount).toFixed(3);
            console.log(`i: ${i} time: ${accumTime}us which is average ${perIter} per insert with average tree size ${averageTreeSize}`);
        }
    }
    accumTime = 0;
    accumTreeSize = 0;
    treeCount = 0;
    for (let i = 0; i < removeCount; i++) {
        const dlen = randInt();
        const preLen = mergeTree.getLength(UniversalSequenceNumber, LocalClientId);
        const pos = random.integer(0, preLen)(mt);
        // Console.log(itree.toString());
        if (i & 1) {
            if (!checkMarkRemoveMergeTree(mergeTree, pos, pos + dlen, true)) {
                console.log(`i: ${i} preLen ${preLen} pos: ${pos} dlen: ${dlen} itree len: ${mergeTree.getLength(UniversalSequenceNumber, LocalClientId)}`);
                console.log(mergeTree.toString());
                errorCount++;
                break;
            }
        }
        else {
            if (!checkRemoveMergeTree(mergeTree, pos, pos + dlen, true)) {
                console.log(`i: ${i} preLen ${preLen} pos: ${pos} dlen: ${dlen} itree len: ${mergeTree.getLength(UniversalSequenceNumber, LocalClientId)}`);
                console.log(mergeTree.toString());
                errorCount++;
                break;
            }
        }
        if ((i > 0) && (0 === (i % 1000))) {
            const perIter = (accumTime / (i + 1)).toFixed(3);
            treeCount++;
            accumTreeSize += mergeTree.getLength(UniversalSequenceNumber, LocalClientId);
            const averageTreeSize = (accumTreeSize / treeCount).toFixed(3);
            console.log(`i: ${i} time: ${accumTime}us which is average ${perIter} per del with average tree size ${averageTreeSize}`);
        }
    }
    return errorCount;
}

export class RandomPack {
    mt: Random.MT19937;
    constructor() {
        this.mt = random.engines.mt19937();
        this.mt.seedWithArray([0xdeadbeef, 0xfeedbed]);
    }

    randInteger(min: number, max: number) {
        return random.integer(min, max)(this.mt);
    }

    randString(wordCount: number) {
        const exampleWords = ["giraffe", "hut", "aardvark", "gold", "hover",
            "yurt", "hot", "antelope", "gift", "banana", "book", "airplane",
            "kitten", "moniker", "lemma", "doughnut", "orange", "tangerine",
        ];
        let buf = "";
        for (let i = 0; i < wordCount; i++) {
            const exampleWord = exampleWords[this.randInteger(0, exampleWords.length - 1)];
            if (i > 0) {
                buf += " ";
            }
            buf += exampleWord;
        }
        return buf;
    }
}

function docNodeToString(docNode: DocumentNode) {
    if (typeof docNode === "string") {
        return docNode;
    } else {
        return docNode.name;
    }
}

export type DocumentNode = string | DocumentTree;
/**
 * Generate and model documents from the following tree grammar:
 * Row -> row[Box*];
 * Box -> box[Content];
 * Content -> (Row|Paragraph)*;
 * Paragraph -> pgtile text;
 * Document-> Content
 */
export class DocumentTree {
    pos = 0;
    ids = { box: 0, row: 0 };
    id: string;
    static randPack = new RandomPack();

    constructor(public name: string, public children: DocumentNode[]) {
    }

    addToMergeTree(client: TestClient, docNode: DocumentNode) {
        if (typeof docNode === "string") {
            const text = docNode;
            client.insertTextLocal(this.pos, text);
            this.pos += text.length;
        } else {
            let id: number;
            if (docNode.name === "pg") {
                client.insertMarkerLocal(this.pos, MergeTree.ReferenceType.Tile,
                    {
                        [MergeTree.reservedTileLabelsKey]: [docNode.name],
                    },
                );
                this.pos++;
            } else {
                // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
                const trid = docNode.name + this.ids[docNode.name].toString();
                docNode.id = trid;
                id = this.ids[docNode.name]++;
                const props = {
                    [MergeTree.reservedMarkerIdKey]: trid,
                    [MergeTree.reservedRangeLabelsKey]: [docNode.name],
                };
                let behaviors = MergeTree.ReferenceType.NestBegin;
                if (docNode.name === "row") {
                    props[MergeTree.reservedTileLabelsKey] = ["pg"];
                    behaviors |= MergeTree.ReferenceType.Tile;
                }

                client.insertMarkerLocal(this.pos, behaviors, props);
                this.pos++;
            }
            for (const child of docNode.children) {
                this.addToMergeTree(client, child);
            }
            if (docNode.name !== "pg") {
                const etrid = `end-${docNode.name}${id.toString()}`;
                client.insertMarkerLocal(this.pos, MergeTree.ReferenceType.NestEnd,
                    {
                        [MergeTree.reservedMarkerIdKey]: etrid,
                        [MergeTree.reservedRangeLabelsKey]: [docNode.name],
                    },
                );
                this.pos++;
            }
        }
    }

    checkStacksAllPositions(client: TestClient) {
        let errorCount = 0;
        let pos = 0;
        const verbose = false;
        const stacks = {
            box: new MergeTree.Stack<string>(),
            row: new MergeTree.Stack<string>(),
        };

        function printStack(stack: MergeTree.Stack<string>) {
            for (const item in stack.items) {
                console.log(item);
            }
        }

        function printStacks() {
            for (const name of ["box", "row"]) {
                console.log(`${name}:`);
                printStack(stacks[name]);
            }
        }

        function checkTreeStackEmpty(treeStack: MergeTree.Stack<string>) {
            if (!treeStack.empty()) {
                errorCount++;
                console.log("mismatch: client stack empty; tree stack not");
            }
        }

        const checkNodeStacks = (docNode: DocumentNode) => {
            if (typeof docNode === "string") {
                const text = docNode;
                const epos = pos + text.length;
                if (verbose) {
                    console.log(`stacks for [${pos}, ${epos}): ${text}`);
                    printStacks();
                }
                const cliStacks = client.getStackContext(pos, ["box", "row"]);
                for (const name of ["box", "row"]) {
                    const cliStack = cliStacks[name];
                    const treeStack = <MergeTree.Stack<string>>stacks[name];
                    if (cliStack) {
                        const len = cliStack.items.length;
                        if (len > 0) {
                            if (len !== treeStack.items.length) {
                                console.log(`stack length mismatch cli ${len} tree ${treeStack.items.length}`);
                                errorCount++;
                            }
                            for (let i = 0; i < len; i++) {
                                const cliMarkerId = (cliStack.items[i] as MergeTree.Marker).getId();
                                const treeMarkerId = treeStack.items[i];
                                if (cliMarkerId !== treeMarkerId) {
                                    errorCount++;
                                    console.log(`mismatch index ${i}: ${cliMarkerId} !== ${treeMarkerId} pos ${pos} text ${text}`);
                                    printStack(treeStack);
                                    console.log(client.mergeTree.toString());
                                }
                            }
                        } else {
                            checkTreeStackEmpty(treeStack);
                        }
                    } else {
                        checkTreeStackEmpty(treeStack);
                    }
                }
                pos = epos;
            } else {
                pos++;
                if (docNode.name === "pg") {
                    checkNodeStacks(docNode.children[0]);
                } else {
                    stacks[docNode.name].push(docNode.id);
                    for (const child of docNode.children) {
                        checkNodeStacks(child);
                    }
                    stacks[docNode.name].pop();
                    pos++;
                }
            }
        };

        let prevPos = -1;
        let prevChild: DocumentNode;

        // Console.log(client.mergeTree.toString());
        for (const rootChild of this.children) {
            if (prevPos >= 0) {
                if ((typeof prevChild !== "string") && (prevChild.name === "row")) {
                    const id = prevChild.id;
                    const endId = `end-${id}`;
                    const endRowMarker = <MergeTree.Marker>client.getMarkerFromId(endId);
                    const endRowPos = client.getPosition(endRowMarker);
                    prevPos = endRowPos;
                }
                const tilePos = client.findTile(prevPos, "pg", false);
                if (tilePos) {
                    if (tilePos.pos !== pos) {
                        errorCount++;
                        console.log(`next tile ${tilePos.tile} found from pos ${prevPos} at ${tilePos.pos} compare to ${pos}`);
                    }
                }
            }
            if (verbose) {
                console.log(`next child ${pos} with name ${docNodeToString(rootChild)}`);
            }
            prevPos = pos;
            prevChild = rootChild;
            // PrintStacks();
            checkNodeStacks(rootChild);
        }
        return errorCount;
    }

    private generateClient() {
        const client = new TestClient({ blockUpdateMarkers: true });
        client.startOrUpdateCollaboration("Fred");
        for (const child of this.children) {
            this.addToMergeTree(client, child);
        }
        return client;
    }

    static test1() {
        const doc = DocumentTree.generateDocument();
        const client = doc.generateClient();
        return doc.checkStacksAllPositions(client);
    }

    static generateDocument() {
        const tree = new DocumentTree("Document", DocumentTree.generateContent(0.6));
        return tree;
    }

    static generateContent(initialRowProbability: number) {
        let rowProbability = initialRowProbability;
        const items = <DocumentNode[]>[];
        const docLen = DocumentTree.randPack.randInteger(7, 25);
        for (let i = 0; i < docLen; i++) {
            const rowThreshold = rowProbability * 1000;
            const selector = DocumentTree.randPack.randInteger(1, 1000);
            if (selector >= rowThreshold) {
                const pg = DocumentTree.generateParagraph();
                items.push(pg);
            } else {
                rowProbability /= 2;
                if (rowProbability < 0.08) {
                    rowProbability = 0;
                }
                const row = DocumentTree.generateRow(rowProbability);
                items.push(row);
            }
        }
        return items;
    }

    // Model pg tile as tree with single child
    static generateParagraph() {
        const wordCount = DocumentTree.randPack.randInteger(1, 6);
        const text = DocumentTree.randPack.randString(wordCount);
        const pgTree = new DocumentTree("pg", [text]);
        return pgTree;
    }

    static generateRow(rowProbability: number) {
        const items = <DocumentNode[]>[];
        const rowLen = DocumentTree.randPack.randInteger(1, 5);
        for (let i = 0; i < rowLen; i++) {
            const item = DocumentTree.generateBox(rowProbability);
            items.push(item);
        }
        return new DocumentTree("row", items);
    }

    static generateBox(rowProbability: number) {
        return new DocumentTree("box", DocumentTree.generateContent(rowProbability));
    }
}

function insertElm(treeLabel: string, elm: Xmldoc.XmlElement, client: TestClient, parentId?: string) {
    const elmProps = MergeTree.createMap<any>();
    if (elm.attr) {
        elmProps.XMLattributes = elm.attr;
    }
    let nodePos = OverlayNodePosition.Append;
    if (!parentId) {
        nodePos = OverlayNodePosition.Root;
    }
    const elmId = insertOverlayNode(treeLabel, client, elm.name, nodePos,
        elmProps, parentId);
    if (elm.children) {
        for (let child of elm.children) {
            child = child as Xmldoc.XmlElement;
            if (child.name) {
                insertElm(treeLabel, child, client, elmId);
            }
        }
    }
    if (elm.val && /\S/.test(elm.val)) {
        const pos = client.posFromRelativePos({ id: elmId });
        client.insertTextLocal(pos, elm.val);
    }
    return elmId;
}

function printOverlayTree(client: TestClient) {
    let indentAmt = 0;
    const indentDelta = 4;
    let strbuf = "";
    function attrString(attrs: MergeTree.PropertySet) {
        let attrStrbuf = "";
        if (attrs) {
            for (const attr in attrs) {
                attrStrbuf += ` ${attr}='${attrs[attr]}'`;
            }
        }
        return attrStrbuf;
    }
    function leaf(segment: MergeTree.ISegment) {
        if (MergeTree.TextSegment.is(segment)) {
            strbuf += MergeTree.internedSpaces(indentAmt);
            strbuf += segment.text;
            strbuf += "\n";
        } else {
            const marker = segment as MergeTree.Marker;
            if (marker.refType & MergeTree.ReferenceType.NestBegin) {
                strbuf += MergeTree.internedSpaces(indentAmt);
                const nodeType = marker.properties[onodeTypeKey];
                strbuf += `<${nodeType}`;
                const attrs = marker.properties.XMLattributes;
                if (attrs) {
                    strbuf += attrString(attrs);
                }
                strbuf += ">\n";
                indentAmt += indentDelta;
            } else if (marker.refType & MergeTree.ReferenceType.NestEnd) {
                indentAmt -= indentDelta;
                strbuf += MergeTree.internedSpaces(indentAmt);
                const nodeType = marker.properties[onodeTypeKey];
                strbuf += `</${nodeType}>\n`;
            }
        }
        return true;
    }
    client.mergeTree.map({ leaf }, UniversalSequenceNumber,
        client.getClientId());
    console.log(strbuf);
}

function testOverlayTree() {
    const booksFilename = path.join(__dirname, "../../public/literature", "book.xml");
    const plantsFilename = path.join(__dirname, "../../public/literature", "plants.xml");
    const books = fs.readFileSync(booksFilename, "utf8");
    const booksDoc = new Xmldoc.XmlDocument(books);
    const client = new TestClient({ blockUpdateMarkers: true });
    const plants = fs.readFileSync(plantsFilename, "utf8");
    const plantsDoc = new Xmldoc.XmlDocument(plants);
    insertElm("booksDoc", booksDoc, client);
    insertElm("plantsDoc", plantsDoc, client);

    printOverlayTree(client);
}

const docRanges = <MergeTree.IIntegerRange[]>[
    { start: 0, end: 20 },
    { start: 8, end: 12 },
    { start: 8, end: 14 },
    { start: 20, end: 24 },
    { start: 11, end: 15 },
    { start: 16, end: 33 },
    { start: 19, end: 24 },
    { start: 22, end: 80 },
    { start: 25, end: 29 },
    { start: 30, end: 32 },
    { start: 41, end: 49 },
    { start: 41, end: 49 },
    { start: 41, end: 49 },
    { start: 51, end: 69 },
    { start: 55, end: 58 },
    { start: 60, end: 71 },
    { start: 81, end: 99 },
    { start: 85, end: 105 },
    { start: 9, end: 34 },
];

const testRanges = <MergeTree.IIntegerRange[]>[
    { start: 9, end: 20 },
    { start: 8, end: 10 },
    { start: 82, end: 110 },
    { start: 54, end: 56 },
    { start: 57, end: 57 },
    { start: 58, end: 58 },
    { start: 22, end: 48 },
    { start: 3, end: 11 },
    { start: 43, end: 58 },
    { start: 19, end: 31 },
];

function testRangeTree() {
    const rangeTree = new MergeTree.IntegerRangeTree();
    for (const docRange of docRanges) {
        rangeTree.put(docRange);
    }
    console.log(rangeTree.toString());
    function matchRange(r: MergeTree.IIntegerRange) {
        console.log(`match range ${MergeTree.integerRangeToString(r)}`);
        const results = rangeTree.match(r);
        for (const result of results) {
            console.log(MergeTree.integerRangeToString(result.key));
        }
    }
    for (const testRange of testRanges) {
        matchRange(testRange);
    }
}

export function intervalTest() {
    const mt = random.engines.mt19937();
    mt.seedWithArray([0xdeadbeef, 0xfeedbed]);
    const imin = 0;
    const imax = 10000000;
    const intCount = 50000;
    const arr = [] as SharedString.Interval[];
    const distribution = random.integer(imin, imax);
    const randInt = () => distribution(mt);
    const intervalIndex = SharedString.createIntervalIndex();

    for (let i = 0; i < intCount; i++) {
        let a = randInt();
        let b = randInt();
        while (a === b) {
            b = randInt();
        }
        if (a > b) {
            const temp = a;
            a = b;
            b = temp;
        }
        arr.push(intervalIndex.addInterval(a, b, MergeTree.IntervalType.Simple, { id: i }));
    }
    let dup = 0;
    for (let i = 0; i < intCount; i++) {
        if (arr[i].getAdditionalPropertySets()) {
            dup++;
        }
    }
    console.log(`dup: ${dup}`);
}

export interface ICmd {
    description?: string;
    iconURL?: string;
    exec?: () => void;
}
export function tstSimpleCmd() {
    const tst = new MergeTree.TST<ICmd>();
    tst.put("zest", { description: "zesty" });
    tst.put("nest", { description: "nesty" });
    tst.put("newt", { description: "newty" });
    tst.put("neither", { description: "neithery" });
    tst.put("restitution", { description: "restitutiony" });
    tst.put("restful", { description: "restfuly" });
    tst.put("fish", { description: "fishy" });
    tst.put("nurf", { description: "nurfy" });
    tst.put("reify", { description: "reifyy" });
    tst.put("pert", { description: "perty" });
    tst.put("jest", { description: "jesty" });
    tst.put("jestcuz", { description: "jestcuzy" });
    let res = tst.pairsWithPrefix("je");
    console.log("trying je");
    for (const pair of res) {
        console.log(`key: ${pair.key} val: ${pair.val.description}`);
    }
    res = tst.pairsWithPrefix("n");
    console.log("trying n");
    for (const pair of res) {
        console.log(`key: ${pair.key} val: ${pair.val.description}`);
    }
    res = tst.pairsWithPrefix("ne");
    console.log("trying ne");
    for (const pair of res) {
        console.log(`key: ${pair.key} val: ${pair.val.description}`);
    }
    res = [];
    tst.map((key, val) => res.push({ key, val }));
    console.log("trying map");
    for (const pair of res) {
        console.log(`key: ${pair.key} val: ${pair.val.description}`);
    }
}

const rangeTreeTest = false;
const testPropCopy = false;
const overlayTree = false;
const docTree = false;
const chktst = false;
const clientServerTest = true;
const tstTest = false;
const firstTest = false;
const ivalTest = false;

if (firstTest) {
    const testPack = TestPack(true);
    testPack.firstTest();
}

if (ivalTest) {
    intervalTest();
}

if (tstTest) {
    tstSimpleCmd();
}

if (rangeTreeTest) {
    testRangeTree();
}

if (chktst) {
    mergeTreeCheckedTest();
}

if (testPropCopy) {
    propertyCopy();
}

if (overlayTree) {
    testOverlayTree();
}

if (docTree) {
    DocumentTree.test1();
}

if (clientServerTest) {
    const ppTest = true;
    const branch = false;
    const testPack = TestPack();
    const baseDir = "../../../merge-tree/src/test/literature";
    const filename = path.join(__dirname, baseDir, "pp.txt");
    if (ppTest) {
        if (branch) {
            testPack.clientServerBranch(filename, 100000);
        } else {
            testPack.clientServer(filename, 100000);
        }
    } else {
        if (branch) {
            testPack.clientServerBranch(undefined, 100000);
        } else {
            testPack.clientServer(undefined, 100000);
        }
    }
}
