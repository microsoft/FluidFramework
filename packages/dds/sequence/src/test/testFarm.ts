/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// TODO: Some of these should be fixed
/* eslint-disable no-bitwise */
/* eslint-disable max-len */
/* eslint-disable no-restricted-syntax */
/* eslint-disable guard-for-in */
/* eslint-disable @typescript-eslint/no-for-in-array */
/* eslint-disable @typescript-eslint/consistent-type-assertions */

import path from "path";
import { assert, Trace } from "@fluidframework/common-utils";
import * as MergeTree from "@fluidframework/merge-tree";
import {
    TextSegment,
    createGroupOp,
    PropertySet,
    MergeTreeTextHelper,
    IMergeTreeDeltaOp,
} from "@fluidframework/merge-tree";
import {
    LocalClientId,
    NonCollabClient,
    UnassignedSequenceNumber,
    UniversalSequenceNumber,
    // eslint-disable-next-line import/no-internal-modules
} from "@fluidframework/merge-tree/dist/constants";
// eslint-disable-next-line import/no-internal-modules
import { loadTextFromFile, TestClient, TestServer } from "@fluidframework/merge-tree/dist/test/";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import JsDiff from "diff";
import random from "random-js";
import * as SharedString from "../intervalCollection";

const clock = () => Trace.start();

const elapsedMicroseconds = (trace: Trace) => {
    return trace.trace().duration * 1000;
};

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
    let obj: MergeTree.MapLike<number> = MergeTree.createMap<number>();
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

        if (segoff1?.segment && segoff2?.segment) {
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
            bookmarks.push(new SharedString.SequenceInterval(lref1, lref2, SharedString.IntervalType.Simple));
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
        if (segoff?.segment) {
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
        assert(windowTime !== undefined, "window time is expected to exist");
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
        let annotateProps: PropertySet | undefined;
        const insertAsRefPos = false;

        const testServer = new TestServer({});
        testServer.measureOps = true;
        if (startFile) {
            loadTextFromFile(startFile, testServer.mergeTree, fileSegCount);
        } else {
            testServer.insertTextLocal(0, initString);
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
        testServer.startOrUpdateCollaboration("theServer");
        testServer.addClients(clients);
        if (measureBookmarks) {
            references = makeReferences(testServer, referenceCount);
            if (measureRanges) {
                bookmarks = makeBookmarks(testServer, bookmarkCount);
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
            const serverText = testServer.getText();
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
            testServer.addListeners([snapClient]);
        }

        function checkTextMatch() {
            // Console.log(`checking text match @${server.getCurrentSeq()}`);
            const serverText = testServer.getText();
            if (checkIncr) {
                const serverIncrText = testServer.incrementalGetText();
                // IncrGetTextTime += elapsedMicroseconds(clockStart);
                // incrGetTextCalls++;
                if (serverIncrText !== serverText) {
                    console.log("incr get text mismatch");
                }
            }
            for (const client of clients) {
                const cliText = client.getText();
                if (cliText !== serverText) {
                    console.log(`mismatch @${testServer.getCurrentSeq()} client @${client.getCurrentSeq()} id: ${client.getClientId()}`);
                    // Console.log(serverText);
                    // console.log(cliText);
                    const diffParts = JsDiff.diffChars(serverText, cliText);
                    for (const diffPart of diffParts) {
                        let annotes = "";
                        if (diffPart.added) {
                            annotes += "added ";
                        } else if (diffPart.removed) {
                            annotes += "removed ";
                        }
                        if (diffPart.count) {
                            annotes += `count: ${diffPart.count}`;
                        }
                        console.log(`text: ${diffPart.value} ${annotes}`);
                    }
                    console.log(testServer.mergeTree.toString());
                    console.log(client.mergeTree.toString());
                    return true;
                }
            }
            return false;
        }

        const rounds = initRounds;

        function clientProcessSome(client: TestClient, all = false) {
            const cliMsgCount = client.getMessageCount();
            const countToApply: number = all ? cliMsgCount : random.integer(Math.floor(2 * cliMsgCount / 3), cliMsgCount)(mt);
            client.applyMessages(countToApply);
        }

        function serverProcessSome(server: TestClient, all = false) {
            const svrMsgCount = server.getMessageCount();
            const countToApply: number = all ? svrMsgCount : random.integer(Math.floor(2 * svrMsgCount / 3), svrMsgCount)(mt);
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
                testServer.enqueueMsg(client.makeOpMessage(markerOp, UnassignedSequenceNumber));
            }
            const textOp = client.insertTextLocal(pos, text);
            testServer.enqueueMsg(client.makeOpMessage(textOp, UnassignedSequenceNumber));
            if (TestClient.useCheckQ) {
                client.enqueueTestString();
            }
        }

        function randomSpateOfRemoves(client: TestClient) {
            const dlen = randTextLength();
            const preLen = client.getLength();
            const pos = random.integer(0, preLen)(mt);
            const op = client.removeRangeLocal(pos, pos + dlen);
            testServer.enqueueMsg(client.makeOpMessage(op));
            if (TestClient.useCheckQ) {
                client.enqueueTestString();
            }
        }

        function randomWordMove(client: TestClient) {
            const word1 = client.findRandomWord();
            if (word1) {
                const removeStart = word1.pos;
                const removeEnd = removeStart + word1.text.length;
                const ops: IMergeTreeDeltaOp[] = [];
                const removeOp = client.removeRangeLocal(removeStart, removeEnd);
                if (!useGroupOperationsForMoveWord) {
                    testServer.enqueueMsg(client.makeOpMessage(removeOp));
                    if (TestClient.useCheckQ) {
                        client.enqueueTestString();
                    }
                } else if (removeOp) {
                    ops.push(removeOp);
                }

                let word2 = client.findRandomWord();
                while (!word2) {
                    word2 = client.findRandomWord();
                }
                const pos = word2.pos + word2.text.length;

                const segOff = client.getContainingSegment(pos);
                const insertOp = !insertAsRefPos && segOff.segment
                    ? client.insertAtReferencePositionLocal(
                        new MergeTree.LocalReference(client, segOff.segment, segOff.offset, MergeTree.ReferenceType.Transient),
                        TextSegment.make(word1.text))
                    : client.insertTextLocal(pos, word1.text);

                if (!useGroupOperationsForMoveWord) {
                    testServer.enqueueMsg(
                        client.makeOpMessage(insertOp));
                    if (TestClient.useCheckQ) {
                        client.enqueueTestString();
                    }
                } else if (insertOp) {
                    ops.push(insertOp);
                }

                if (annotateProps) {
                    const annotateOp = client.annotateRangeLocal(pos, pos + word1.text.length, annotateProps, undefined);
                    if (!useGroupOperationsForMoveWord) {
                        testServer.enqueueMsg(client.makeOpMessage(annotateOp));
                    } else if (annotateOp) {
                        ops.push(annotateOp);
                    }
                }

                if (useGroupOperationsForMoveWord) {
                    testServer.enqueueMsg(client.makeOpMessage(createGroupOp(...ops)));
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
            if (serverProcessSome(testServer, true)) {
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
                    const mt2 = random.engines.mt19937();
                    mt2.seedWithArray([0xdeadbeef, 0xfeedbed]);
                    const checkRange = <number[][]>[];
                    const len = testServer.mergeTree.getLength(UniversalSequenceNumber, testServer.getClientId());
                    for (let i = 0; i < rangeChecksPerRound; i++) {
                        const e = random.integer(0, len - 2)(mt2);
                        const rangeSize = random.integer(1, Math.min(1000, len - 2))(mt2);
                        let b = e - rangeSize;
                        if (b < 0) {
                            b = 0;
                        }
                        checkRange[i] = [b, b + rangeSize];
                        const segoff1 = testServer.getContainingSegment(checkRange[i][0]);
                        const segoff2 = testServer.getContainingSegment(checkRange[i][1]);
                        if (segoff1 && segoff2 && segoff1.segment && segoff2.segment) {
                            // Console.log(`[${checkRange[i][0]},${checkRange[i][1]})`);
                            if (segoff1.segment === segoff2.segment) {
                                // Console.log("same segment");
                            } else if (segoff1.segment.ordinal > segoff2.segment.ordinal) {
                                ordErrors++;
                                console.log(`reverse ordinals ${MergeTree.ordinalToArray(segoff1.segment.ordinal)} > ${MergeTree.ordinalToArray(segoff2.segment.ordinal)}`);
                                console.log(`segments ${segoff1.segment.toString()} ${segoff2.segment.toString()}`);
                                console.log(testServer.mergeTree.toString());
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
                    const mt2 = random.engines.mt19937();
                    mt2.seedWithArray([0xdeadbeef, 0xfeedbed]);
                    const len = testServer.mergeTree.getLength(UniversalSequenceNumber, testServer.getClientId());
                    const checkPos = <number[]>[];
                    const checkRange = <number[][]>[];
                    const checkPosRanges = <SharedString.SequenceInterval[]>[];
                    const checkRangeRanges = <SharedString.SequenceInterval[]>[];
                    for (let i = 0; i < posChecksPerRound; i++) {
                        checkPos[i] = random.integer(0, len - 2)(mt2);
                        const segoff1 = testServer.getContainingSegment(checkPos[i]);
                        const segoff2 = testServer.getContainingSegment(checkPos[i] + 1);
                        if (segoff1?.segment && segoff2?.segment) {
                            const lrefPos1 = new MergeTree.LocalReference(testServer, <MergeTree.BaseSegment>segoff1.segment, segoff1.offset);
                            const lrefPos2 = new MergeTree.LocalReference(testServer, <MergeTree.BaseSegment>segoff2.segment, segoff2.offset);
                            checkPosRanges[i] = new SharedString.SequenceInterval(lrefPos1, lrefPos2, SharedString.IntervalType.Simple);
                        } else {
                            i--;
                        }
                    }
                    for (let i = 0; i < rangeChecksPerRound; i++) {
                        const e = random.integer(0, len - 2)(mt2);
                        const rangeSize = random.integer(1, Math.min(1000, len - 2))(mt2);
                        let b = e - rangeSize;
                        if (b < 0) {
                            b = 0;
                        }
                        checkRange[i] = [b, b + rangeSize];
                        const segoff1 = testServer.getContainingSegment(checkRange[i][0]);
                        const segoff2 = testServer.getContainingSegment(checkRange[i][1]);
                        if (segoff1?.segment && segoff2?.segment) {
                            const lrefPos1 = new MergeTree.LocalReference(testServer, <MergeTree.BaseSegment>segoff1.segment, segoff1.offset);
                            const lrefPos2 = new MergeTree.LocalReference(testServer, <MergeTree.BaseSegment>segoff2.segment, segoff2.offset);
                            checkRangeRanges[i] = new SharedString.SequenceInterval(lrefPos1, lrefPos2, SharedString.IntervalType.Simple);
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
                                const pos1 = testServer.mergeTree.referencePositionToLocalPosition(ival.key.start);
                                const pos2 = testServer.mergeTree.referencePositionToLocalPosition(ival.key.end);
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
                                const pos1 = testServer.mergeTree.referencePositionToLocalPosition(ival.key.start);
                                const pos2 = testServer.mergeTree.referencePositionToLocalPosition(ival.key.end);
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
                const stats = testServer.mergeTree.getStats();
                const liveAve = (stats.liveCount / stats.nodeCount).toFixed(1);
                const posLeaves = stats.leafCount - stats.removedLeafCount;
                let aveExtractSnapTime = "off";
                if (extractSnapOps > 0) {
                    aveExtractSnapTime = (extractSnapTime / extractSnapOps).toFixed(1);
                }
                console.log(`round: ${roundCount} seq ${testServer.seq} char count ${testServer.getLength()} height ${stats.maxHeight} lv ${stats.leafCount} rml ${stats.removedLeafCount} p ${posLeaves} nodes ${stats.nodeCount} pop ${liveAve} histo ${stats.histo}`);
                if (extractSnapOps > 0) {
                    aveExtractSnapTime = (extractSnapTime / extractSnapOps).toFixed(1);
                    console.log(`ave extract snap time ${aveExtractSnapTime}`);
                }
                reportTiming(testServer);
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
                let totalTime = testServer.accumTime + testServer.accumWindowTime;
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
                    } else {
                        randomSpateOfInserts(client, j);
                    }
                }
                if (serverProcessSome(testServer)) {
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
                    } else {
                        randomSpateOfRemoves(client);
                        if (includeMarkers) {
                            if (client.getLength() > 200) {
                                randomSpateOfRemoves(client);
                            }
                        }
                    }
                }
                if (serverProcessSome(testServer)) {
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
            const curmin = testServer.getCollabWindow().minSeq;
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
        } else {
            for (let i = 0; i < rounds; i++) {
                round(i);
                if (errorCount > 0) {
                    break;
                }
            }
            tail();
        }
        function tail() {
            reportTiming(testServer);
            reportTiming(clients[2]);
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

function checkMarkRemoveMergeTree(mergeTree: MergeTree.MergeTree, start: number, end: number, verbose = false) {
    const helper = new MergeTreeTextHelper(mergeTree);
    const origText = helper.getText(UniversalSequenceNumber, LocalClientId);
    const checkText = editFlat(origText, start, end - start);
    const clockStart = clock();
    mergeTree.markRangeRemoved(
        start,
        end,
        UniversalSequenceNumber,
        LocalClientId,
        UniversalSequenceNumber,
        false,
        // `opArgs` being `undefined` is special-cased specifically for internal
        // test code
        undefined as any,
    );
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
        if (!checkMarkRemoveMergeTree(mergeTree, pos, pos + dlen, true)) {
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
        } else {
            if (!checkMarkRemoveMergeTree(mergeTree, pos, pos + dlen, true)) {
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
        } else {
            if (!checkMarkRemoveMergeTree(mergeTree, pos, pos + dlen, true)) {
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
    return typeof docNode === "string" ? docNode : docNode.name;
}

export type DocumentNode = string | DocumentTree;
/**
 * Generate and model documents from the following tree grammar:
 * Row -\> row[Box*];
 * Box -\> box[Content];
 * Content -\> (Row|Paragraph)*;
 * Paragraph -\> pgtile text;
 * Document-\> Content
 */
export class DocumentTree {
    pos = 0;
    ids = { box: 0, row: 0 };
    id: string | undefined;
    static randPack = new RandomPack();

    constructor(public name: string, public children: DocumentNode[]) {
    }

    addToMergeTree(client: TestClient, docNode: DocumentNode) {
        if (typeof docNode === "string") {
            const text = docNode;
            client.insertTextLocal(this.pos, text);
            this.pos += text.length;
        } else {
            let id: number | undefined;
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
                assert(id !== undefined, "expected `id` to be defined");
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
        let prevChild: DocumentNode | undefined;

        // Console.log(client.mergeTree.toString());
        for (const rootChild of this.children) {
            if (prevPos >= 0) {
                if ((typeof prevChild !== "string") && (prevChild?.name === "row")) {
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
        const client = new TestClient();
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
        arr.push(intervalIndex.addInterval(a, b, SharedString.IntervalType.Simple, { id: i }));
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

const testPropCopy = false;
const docTree = false;
const chktst = false;
const clientServerTest = true;
const tstTest = false;
const doFirstTest = false;
const ivalTest = false;

if (doFirstTest) {
    const testPack = TestPack(true);
    testPack.firstTest();
}

if (ivalTest) {
    intervalTest();
}

if (tstTest) {
    tstSimpleCmd();
}

if (chktst) {
    mergeTreeCheckedTest();
}

if (testPropCopy) {
    propertyCopy();
}

if (docTree) {
    DocumentTree.test1();
}

if (clientServerTest) {
    const ppTest = true;
    const testPack = TestPack();
    const baseDir = "../../../merge-tree/src/test/literature";
    const filename = path.join(__dirname, baseDir, "pp.txt");
    if (ppTest) {
        testPack.clientServer(filename, 100000);
    } else {
        testPack.clientServer(undefined, 100000);
    }
}
