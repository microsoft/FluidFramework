/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// tslint:disable
import * as MergeTree from "@microsoft/fluid-merge-tree";
import { TextSegment, createGroupOp, PropertySet, IMergeTreeOp, MergeTreeTextHelper } from "@microsoft/fluid-merge-tree";
import {
    LocalClientId,
    NonCollabClient,
    UnassignedSequenceNumber,
    UniversalSequenceNumber,
} from "@microsoft/fluid-merge-tree/dist/constants";
import { insertOverlayNode, onodeTypeKey, OverlayNodePosition } from "@microsoft/fluid-merge-tree/dist/overlayTree";
import { loadTextFromFile, TestClient, TestServer } from "@microsoft/fluid-merge-tree/dist/test/";
import { ISequencedDocumentMessage } from "@microsoft/fluid-protocol-definitions";
import * as JsDiff from "diff";
import * as fs from "fs";
import * as path from "path";
import * as random from "random-js";
import * as Xmldoc from "xmldoc";
import * as SharedString from "../intervalCollection";

function clock() {
    return process.hrtime();
}

function elapsedMicroseconds(start: [number, number]) {
    let end: number[] = process.hrtime(start);
    let duration = Math.round((end[0] * 1000000) + (end[1] / 1000));
    return duration;
}

// enum AsyncRoundState {
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
    let a = <string[]>[];
    let v = <number[]>[];
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
        let bObj = MergeTree.createMap<number>();
        for (let key in obj) {
            bObj[key] = obj[key];
        }
    }
    et = elapsedMicroseconds(clockStart);
    perIter = (et / iterCount).toFixed(3);
    perProp = (et / (iterCount * propCount)).toFixed(3);
    console.log(`obj prop init time ${perIter} per init; ${perProp} per property`);
}

function makeBookmarks(client: TestClient, bookmarkCount: number) {
    let mt = random.engines.mt19937();
    mt.seedWithArray([0xdeadbeef, 0xfeedbed]);
    let bookmarks = <SharedString.SequenceInterval[]>[];
    let len = client.mergeTree.getLength(UniversalSequenceNumber, NonCollabClient);
    let maxRangeLen = Math.min(Math.floor(len / 100), 30);
    for (let i = 0; i < bookmarkCount; i++) {
        let pos1 = random.integer(0, len - 1)(mt);
        let rangeLen = random.integer(0, maxRangeLen)(mt);
        let pos2 = pos1 + rangeLen;
        if (pos2 >= len) {
            pos2 = len - 2;
        }
        if (pos1 > pos2) {
            let temp = pos1;
            pos1 = pos2;
            pos2 = temp;
        }
        let segoff1 = client.getContainingSegment(pos1);
        let segoff2 = client.getContainingSegment(pos2);

        if (segoff1 && segoff1.segment && segoff2 && segoff2.segment) {
            let baseSegment1 = <MergeTree.BaseSegment>segoff1.segment;
            let baseSegment2 = <MergeTree.BaseSegment>segoff2.segment;
            let lref1 = new MergeTree.LocalReference(client, baseSegment1, segoff1.offset);
            let lref2 = new MergeTree.LocalReference(client, baseSegment2, segoff2.offset);
            lref1.refType = MergeTree.ReferenceType.RangeBegin;
            lref1.addProperties({ [MergeTree.reservedRangeLabelsKey]: ["bookmark"] });
            // can do this locally; for shared refs need to use id/index to ref end
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
    let mt = random.engines.mt19937();
    mt.seedWithArray([0xdeadbeef, 0xfeedbed]);
    let refs = <MergeTree.LocalReference[]>[];
    let len = client.mergeTree.getLength(UniversalSequenceNumber, NonCollabClient);
    for (let i = 0; i < referenceCount; i++) {
        let pos = random.integer(0, len - 1)(mt);
        let segoff = client.getContainingSegment(pos);
        if (segoff && segoff.segment) {
            let baseSegment = <MergeTree.BaseSegment>segoff.segment;
            let lref = new MergeTree.LocalReference(client, baseSegment, segoff.offset);
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
    let mt = random.engines.mt19937();
    mt.seedWithArray([0xdeadbeef, 0xfeedbed]);
    let smallSegmentCountDistribution = random.integer(1, 4);
    function randSmallSegmentCount() {
        return smallSegmentCountDistribution(mt);
    }
    let textLengthDistribution = random.integer(1, 5);
    function randTextLength() {
        return textLengthDistribution(mt);
    }
    const zedCode = 48
    function randomString(len: number, c: string) {
        let str = "";
        for (let i = 0; i < len; i++) {
            str += c;
        }
        return str;
    }

    let checkIncr = false;

    let getTextTime = 0;
    let getTextCalls = 0;
    let crossGetTextTime = 0;
    let crossGetTextCalls = 0;
    // let incrGetTextTime = 0;
    // let incrGetTextCalls = 0;
    // let catchUpTime = 0;
    // let catchUps = 0;

    function reportTiming(client: TestClient) {
        if (!verbose) {
            return;
        }
        let aveTime = (client.accumTime / client.accumOps).toFixed(1);
        let aveLocalTime = (client.localTime / client.localOps).toFixed(1);
        let stats = client.mergeTree.getStats();
        let windowTime = stats.windowTime;
        let packTime = stats.packTime;
        let ordTime = stats.ordTime;
        let aveWindowTime = ((windowTime || 0) / (client.accumOps)).toFixed(1);
        let aveOrdTime = ((ordTime || 0) / (client.accumOps)).toFixed(1);
        let avePackTime = ((packTime || 0) / (client.accumOps)).toFixed(1);
        let aveExtraWindowTime = (client.accumWindowTime / client.accumOps).toFixed(1);
        let aveWindow = (client.accumWindow / client.accumOps).toFixed(1);
        let adjTime = ((client.accumTime - (windowTime - client.accumWindowTime)) / client.accumOps).toFixed(1);
        if (client.localOps > 0) {
            console.log(`local time ${client.localTime} us ops: ${client.localOps} ave time ${aveLocalTime}`);
        }
        console.log(`ord time average: ${aveOrdTime}us max ${stats.maxOrdTime}us`);
        console.log(`${client.longClientId} accum time ${client.accumTime} us ops: ${client.accumOps} ave time ${aveTime} - wtime ${adjTime} pack ${avePackTime} ave window ${aveWindow}`);
        console.log(`${client.longClientId} accum window time ${client.accumWindowTime} us ave window time total ${aveWindowTime} not in ops ${aveExtraWindowTime}; max ${client.maxWindowTime}`);
    }

    function manyMergeTrees() {
        const mergeTreeCount = 2000000;
        let a = <MergeTree.MergeTree[]>Array(mergeTreeCount);
        for (let i = 0; i < mergeTreeCount; i++) {
            a[i] = new MergeTree.MergeTree();
        }
        for (; ;);
    }

    function clientServer(startFile?: string, initRounds = 1000) {
        const clientCount = 5;
        const fileSegCount = 0;
        const initString = "don't ask for whom the bell tolls; it tolls for thee";
        let snapInProgress = false;
        let asyncExec = false;
        let addSnapClient = false;
        let extractSnap = false;
        let includeMarkers = false;
        let measureBookmarks = true;
        let bookmarks: SharedString.SequenceInterval[];
        let bookmarkRangeTree = new MergeTree.IntervalTree<SharedString.SequenceInterval>();
        let testOrdinals = true;
        let ordErrors = 0;
        let ordSuccess = 0;
        let measureRanges = true;
        let referenceCount = 2000;
        let bookmarkCount = 5000;
        let references: MergeTree.LocalReference[];
        let refReads = 0;
        let refReadTime = 0;
        let posContextChecks = 0;
        let posContextTime = 0;
        let posContextResults = 0;
        let rangeOverlapTime = 0;
        let rangeOverlapChecks = 0;
        let overlapIntervalResults = 0;
        let testSyncload = false;
        let snapClient: TestClient;
        let useGroupOperationsForMoveWord = false;
        let annotateProps: PropertySet;
        let insertAsRefPos = false;

        let options = {};
        if (measureBookmarks) {
            options = { blockUpdateMarkers: true };
        }
        let server = new TestServer(options);
        server.measureOps = true;
        if (startFile) {
            loadTextFromFile(startFile, server.mergeTree, fileSegCount);
        } else {
            server.insertTextLocal(0, initString);
        }

        let clients = new Array<TestClient>(clientCount);
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
            clients[i].startCollaboration(`Fred${i}`);
        }
        server.startCollaboration("theServer");
        server.addClients(clients);
        if (measureBookmarks) {
            references = makeReferences(server, referenceCount);
            if (measureRanges) {
                bookmarks = makeBookmarks(server, bookmarkCount);
                for (let bookmark of bookmarks) {
                    bookmarkRangeTree.put(bookmark);
                }
            }
        }
        if (testSyncload) {
            let clockStart = clock();
            // let segs = Paparazzo.Snapshot.loadSync("snap-initial");
            console.log(`sync load time ${elapsedMicroseconds(clockStart)}`);
            let fromLoad = new MergeTree.MergeTree();
            // fromLoad.reloadFromSegments(segs);
            let fromLoadText = new MergeTreeTextHelper(fromLoad).getText(UniversalSequenceNumber, NonCollabClient);
            let serverText = server.getText();
            if (fromLoadText != serverText) {
                console.log('snap file vs. text file mismatch');
            }
        }
        if (addSnapClient) {
            snapClient = new TestClient();
            if (startFile) {
                loadTextFromFile(startFile, snapClient.mergeTree, fileSegCount);
            }else {
                snapClient.insertTextLocal(0, initString);
            }
            snapClient.startCollaboration("snapshot");
            server.addListeners([snapClient]);
        }

        function checkTextMatch() {
            //console.log(`checking text match @${server.getCurrentSeq()}`);
            let clockStart = clock();
            let serverText = server.getText();
            getTextTime += elapsedMicroseconds(clockStart);
            getTextCalls++;
            if (checkIncr) {
                clockStart = clock();
                let serverIncrText = server.incrementalGetText();
                // incrGetTextTime += elapsedMicroseconds(clockStart);
                // incrGetTextCalls++;
                if (serverIncrText != serverText) {
                    console.log("incr get text mismatch");
                }
            }
            for (let client of clients) {
                let cliText = client.getText();
                if (cliText != serverText) {
                    console.log(`mismatch @${server.getCurrentSeq()} client @${client.getCurrentSeq()} id: ${client.getClientId()}`);
                    //console.log(serverText);
                    //console.log(cliText);
                    let diffParts = JsDiff.diffChars(serverText, cliText);
                    for (let diffPart of diffParts) {
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
                        console.log(`text: ${diffPart.value} ` + annotes);
                    }
                    console.log(server.mergeTree.toString());
                    console.log(client.mergeTree.toString());
                    return true;
                }
            }
            return false;
        }

        let rounds = initRounds;

        function clientProcessSome(client: TestClient, all = false) {
            let cliMsgCount = client.getMessageCount();
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
            let svrMsgCount = server.getMessageCount();
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
            let textLen = randTextLength();
            let text = randomString(textLen, String.fromCharCode(zedCode + ((client.getCurrentSeq() + charIndex) % 50)));
            let preLen = client.getLength();
            let pos = random.integer(0, preLen)(mt);
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
            let dlen = randTextLength();
            let preLen = client.getLength();
            let pos = random.integer(0, preLen)(mt);
            const op = client.removeRangeLocal(pos, pos + dlen);
            server.enqueueMsg(client.makeOpMessage(op));
            if (TestClient.useCheckQ) {
                client.enqueueTestString();
            }
        }

        function randomWordMove(client: TestClient) {
            let word1 = client.findRandomWord();
            if (word1) {
                let removeStart = word1.pos;
                let removeEnd = removeStart + word1.text.length;
                const ops: IMergeTreeOp[] = [];
                const removeOp = client.removeRangeLocal(removeStart, removeEnd);
                if (!useGroupOperationsForMoveWord){
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
                let pos = word2.pos + word2.text.length;

                let insertOp;
                const segOff = client.getContainingSegment(pos);
                if (!insertAsRefPos && segOff.segment) {
                    insertOp = client.insertAtReferencePositionLocal(
                        new MergeTree.LocalReference(client, segOff.segment, segOff.offset, MergeTree.ReferenceType.Transient),
                        TextSegment.make(word1.text));
                } else {
                    insertOp = client.insertTextLocal(pos, word1.text)
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

        // function asyncRoundStep(asyncInfo: AsyncRoundInfo, roundCount: number) {
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
            // process remaining messages
            if (serverProcessSome(server, true)) {
                return;
            }
            for (let client of clients) {
                clientProcessSome(client, true);
            }

            if (measureBookmarks) {
                let refReadsPerRound = 200;
                let posChecksPerRound = 200;
                let rangeChecksPerRound = 200;
                let clockStart = clock();
                for (let i = 0; i < refReadsPerRound; i++) {
                    references[i].toPosition();
                    refReads++;
                }
                refReadTime += elapsedMicroseconds(clockStart);
                if (testOrdinals) {
                    let mt = random.engines.mt19937();
                    mt.seedWithArray([0xdeadbeef, 0xfeedbed]);
                    let checkRange = <number[][]>[];
                    let len = server.mergeTree.getLength(UniversalSequenceNumber, server.getClientId());
                    for (let i = 0; i < rangeChecksPerRound; i++) {
                        let e = random.integer(0, len - 2)(mt);
                        let rangeSize = random.integer(1, Math.min(1000, len - 2))(mt);
                        let b = e - rangeSize;
                        if (b < 0) {
                            b = 0;
                        }
                        checkRange[i] = [b, b + rangeSize];
                        let segoff1 = server.getContainingSegment(checkRange[i][0]);
                        let segoff2 = server.getContainingSegment(checkRange[i][1]);
                        if (segoff1 && segoff2 && segoff1.segment && segoff2.segment) {
                            // console.log(`[${checkRange[i][0]},${checkRange[i][1]})`);
                            if (segoff1.segment === segoff2.segment) {
                                // console.log("same segment");
                            } else if (segoff1.segment.ordinal > segoff2.segment.ordinal) {
                                ordErrors++;
                                console.log(`reverse ordinals ${MergeTree.ordinalToArray(segoff1.segment.ordinal)} > ${MergeTree.ordinalToArray(segoff2.segment.ordinal)}`);
                                console.log(`segments ${segoff1.segment.toString()} ${segoff2.segment.toString()}`)
                                console.log(server.mergeTree.toString());
                                break;
                            } else {
                                ordSuccess++;
                                // console.log(`happy ordinals ${MergeTree.ordinalToArray(segoff1.segment.ordinal)} < ${MergeTree.ordinalToArray(segoff2.segment.ordinal)}`);
                            }

                        } else {
                            // console.log(`no seg for [${b},${e}) with len ${len}`);
                        }
                    }

                }
                if (measureRanges) {
                    let mt = random.engines.mt19937();
                    mt.seedWithArray([0xdeadbeef, 0xfeedbed]);
                    let len = server.mergeTree.getLength(UniversalSequenceNumber, server.getClientId());
                    let checkPos = <number[]>[];
                    let checkRange = <number[][]>[];
                    let checkPosRanges = <SharedString.SequenceInterval[]>[];
                    let checkRangeRanges = <SharedString.SequenceInterval[]>[];
                    for (let i = 0; i < posChecksPerRound; i++) {
                        checkPos[i] = random.integer(0, len - 2)(mt);
                        let segoff1 = server.getContainingSegment(checkPos[i]);
                        let segoff2 = server.getContainingSegment(checkPos[i] + 1);
                        if (segoff1 && segoff1.segment && segoff2 && segoff2.segment) {
                            let lrefPos1 = new MergeTree.LocalReference(server, <MergeTree.BaseSegment>segoff1.segment, segoff1.offset);
                            let lrefPos2 = new MergeTree.LocalReference(server, <MergeTree.BaseSegment>segoff2.segment, segoff2.offset);
                            checkPosRanges[i] = new SharedString.SequenceInterval(lrefPos1, lrefPos2, MergeTree.IntervalType.Simple);
                        } else {
                            i--;
                        }
                    }
                    for (let i = 0; i < rangeChecksPerRound; i++) {
                        let e = random.integer(0, len - 2)(mt);
                        let rangeSize = random.integer(1, Math.min(1000, len - 2))(mt);
                        let b = e - rangeSize;
                        if (b < 0) {
                            b = 0;
                        }
                        checkRange[i] = [b, b + rangeSize];
                        let segoff1 = server.getContainingSegment(checkRange[i][0]);
                        let segoff2 = server.getContainingSegment(checkRange[i][1]);
                        if (segoff1 && segoff1.segment && segoff2 && segoff2.segment) {
                            let lrefPos1 = new MergeTree.LocalReference(server, <MergeTree.BaseSegment>segoff1.segment, segoff1.offset);
                            let lrefPos2 = new MergeTree.LocalReference(server, <MergeTree.BaseSegment>segoff2.segment, segoff2.offset);
                            checkRangeRanges[i] = new SharedString.SequenceInterval(lrefPos1, lrefPos2, MergeTree.IntervalType.Simple);
                        } else {
                            i--;
                        }
                    }
                    let showResults = false;
                    clockStart = clock();

                    for (let i = 0; i < posChecksPerRound; i++) {
                        let ivals = bookmarkRangeTree.match(checkPosRanges[i]);
                        if (showResults) {
                            console.log(`results for point [${checkPos[i]},${checkPos[i] + 1})`);
                            for (let ival of ivals) {
                                let pos1 = server.mergeTree.referencePositionToLocalPosition(ival.key.start);
                                let pos2 = server.mergeTree.referencePositionToLocalPosition(ival.key.end);
                                console.log(`[${pos1},${pos2})`);
                            }
                        }
                        posContextResults += ivals.length;
                    }
                    posContextTime += elapsedMicroseconds(clockStart);
                    posContextChecks += posChecksPerRound;

                    clockStart = clock();
                    for (let i = 0; i < rangeChecksPerRound; i++) {
                        let ivals = bookmarkRangeTree.match(checkRangeRanges[i]);
                        if (showResults) {
                            console.log(`results for [${checkRange[i][0]},${checkRange[i][1]})`);
                            for (let ival of ivals) {
                                let pos1 = server.mergeTree.referencePositionToLocalPosition(ival.key.start);
                                let pos2 = server.mergeTree.referencePositionToLocalPosition(ival.key.end);
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
                let clockStart = clock();
                // let snapshot = new Paparazzo.Snapshot(snapClient.mergeTree);
                // snapshot.extractSync();
                extractSnapTime += elapsedMicroseconds(clockStart);
                extractSnapOps++;
            }
            /*
                        if (checkTextMatch()) {
                            console.log(`round: ${i}`);
                            break;
                        }
            */
            // console.log(server.getText());
            // console.log(server.mergeTree.toString());
            // console.log(server.mergeTree.getStats());
            if (0 == (roundCount % 100)) {
                let clockStart = clock();
                if (checkTextMatch()) {
                    console.log(`round: ${roundCount} BREAK`);
                    errorCount++;
                    return errorCount;
                }
                checkTime += elapsedMicroseconds(clockStart);
                if (verbose) {
                    console.log(`wall clock is ${((Date.now() - startTime) / 1000.0).toFixed(1)}`);
                }
                let stats = server.mergeTree.getStats();
                let liveAve = (stats.liveCount / stats.nodeCount).toFixed(1);
                let posLeaves = stats.leafCount - stats.removedLeafCount;
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
                    let timePerRead = (refReadTime / refReads).toFixed(2);
                    let bookmarksPerSeg = (bookmarkCount / stats.leafCount).toFixed(2);
                    if (ordErrors > 0) {
                        console.log(`ord errors: ${ordErrors}`);
                    }
                    if (ordSuccess > 0) {
                        console.log(`total ord range tests ${ordSuccess}`);
                    }
                    console.log(`bookmark count ${bookmarkCount} ave. per seg ${bookmarksPerSeg} time/read ${timePerRead}`);
                    if (measureRanges) {
                        let timePerContextCheck = (posContextTime / posContextChecks).toFixed(2);
                        let results = (posContextResults / posContextChecks).toFixed(2);
                        console.log(`ave. per bookmark context check ${timePerContextCheck} ave results per check ${results}`);
                        let timePerRangeCheck = (rangeOverlapTime / rangeOverlapChecks).toFixed(2);
                        let resultsRange = (overlapIntervalResults / rangeOverlapChecks).toFixed(2);
                        console.log(`ave. per bookmark range check ${timePerRangeCheck} ave results per check ${resultsRange}`);
                    }
                }
                reportTiming(clients[2]);
                let totalTime = server.accumTime + server.accumWindowTime;
                for (let client of clients) {
                    totalTime += (client.accumTime + client.localTime + client.accumWindowTime);
                }
                if (verbose) {
                    console.log(`total time ${(totalTime / 1000000.0).toFixed(1)} check time ${(checkTime / 1000000.0).toFixed(1)}`);
                }
                //console.log(server.getText());
                //console.log(server.mergeTree.toString());
            }
            return errorCount;
        }

        function round(roundCount: number) {
            for (let client of clients) {
                let insertSegmentCount = randSmallSegmentCount();
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

        let startTime = Date.now();
        let checkTime = 0;
        let asyncRoundCount = 0;
        let lastSnap = 0;
        // let checkSnapText = true;

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
            let curmin = snapClient.getCollabWindow().minSeq;
            lastSnap = curmin;
            console.log(`snap started seq ${snapClient.getCurrentSeq()} minseq ${curmin}`);
            // let snapshot = new Paparazzo.Snapshot(snapClient.mergeTree, filename, snapFinished);
            // snapshot.start();
        }

        function asyncStep() {
            round(asyncRoundCount);
            let curmin = server.getCollabWindow().minSeq;
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
            //console.log(server.getText());
            //console.log(server.mergeTree.toString());
        }
        return errorCount;
    }

    function clientServerBranch(startFile?: string, initRounds = 1000) {
        const clientCountA = 2;
        const clientCountB = 2;
        const fileSegCount = 0;
        const initString = "don't ask for whom the bell tolls; it tolls for thee";


        let serverA = new TestServer();
        serverA.measureOps = true;
        let serverB = new TestServer();
        serverB.measureOps = true;
        if (startFile) {
            loadTextFromFile(startFile, serverA.mergeTree, fileSegCount);
            loadTextFromFile(startFile, serverB.mergeTree, fileSegCount);
        }else{
            serverA.insertTextLocal(0, initString);
            serverB.insertTextLocal(0, initString);
        }

        let clientsA = new Array<TestClient>(clientCountA);
        let clientsB = new Array<TestClient>(clientCountB);

        for (let i = 0; i < clientCountA; i++) {
            clientsA[i] = new TestClient();
            clientsA[i].measureOps = true;
            if (startFile) {
                loadTextFromFile(startFile, clientsA[i].mergeTree, fileSegCount);
            }else{
                clientsA[i].insertTextLocal(0, initString);
            }
            clientsA[i].startCollaboration(`FredA${i}`);
        }

        for (let i = 0; i < clientCountB; i++) {
            clientsB[i] = new TestClient();
            clientsB[i].measureOps = true;
            if (startFile) {
                loadTextFromFile(startFile, clientsB[i].mergeTree, fileSegCount);
            }else{
                clientsB[i].insertTextLocal(0, initString);
            }
            clientsB[i].startCollaboration(`FredB${i}`, 0, 1);
        }
        for (let i = 0; i < clientCountB; i++) {
            let clientB = clientsB[i];
            serverB.getOrAddShortClientId(clientB.longClientId, 1);
            for (let j = 0; j < clientCountB; j++) {
                let otherBClient = clientsB[j];
                if (otherBClient != clientB) {
                    otherBClient.getOrAddShortClientId(clientB.longClientId, 1);
                }
            }
        }
        serverA.startCollaboration("theServerA");
        serverA.addClients(clientsA);
        serverA.addListeners([serverB]);
        serverB.startCollaboration("theServerB", 0, 1);
        serverB.addClients(clientsB);
        serverB.addUpstreamClients(clientsA);

        function crossBranchTextMatch(serverA: TestServer, serverB: TestServer, aClientId: string) {
            let clockStart = clock();
            let serverAText = serverA.getText();
            getTextTime += elapsedMicroseconds(clockStart);
            getTextCalls++;
            clockStart = clock();
            let serverBAText = new MergeTreeTextHelper(serverB.mergeTree).getText(serverB.getCurrentSeq(), serverB.getOrAddShortClientId(aClientId, null));
            crossGetTextTime += elapsedMicroseconds(clockStart);
            crossGetTextCalls++;
            if (serverAText != serverBAText) {
                console.log(`cross mismatch @${serverA.getCurrentSeq()} serverB @${serverB.getCurrentSeq()}`);
                return true;
            }
        }

        function checkTextMatch(clients: TestClient[], server: TestServer) {
            //console.log(`checking text match @${server.getCurrentSeq()}`);
            let clockStart = clock();
            let serverText = server.getText();
            getTextTime += elapsedMicroseconds(clockStart);
            getTextCalls++;
            for (let client of clients) {
                let showDiff = true;
                let cliText = client.getText();
                if (cliText != serverText) {
                    console.log(`mismatch @${server.getCurrentSeq()} client @${client.getCurrentSeq()} id: ${client.getClientId()}`);
                    //console.log(serverText);
                    //console.log(cliText);
                    if (showDiff) {
                        let diffParts = JsDiff.diffChars(serverText, cliText);
                        for (let diffPart of diffParts) {
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
                            console.log(`text: ${diffPart.value} ` + annotes);
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

        let rounds = initRounds;

        function clientProcessSome(client: TestClient, all = false) {
            let cliMsgCount = client.getMessageCount();
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
            let svrMsgCount = server.getMessageCount();
            let countToApply: number;
            if (all) {
                countToApply = svrMsgCount;
            }
            else {
                countToApply = random.integer(Math.floor(2 * svrMsgCount / 3), svrMsgCount)(mt);
            }
            return server.applyMessages(countToApply);
        }

        function randomSpateOfInserts(client: TestClient, server: TestServer,
            charIndex: number) {
            let textLen = randTextLength();
            let text = randomString(textLen, String.fromCharCode(zedCode + ((client.getCurrentSeq() + charIndex) % 50)));
            let preLen = client.getLength();
            let pos = random.integer(0, preLen)(mt);
            const insertOp = client.insertTextLocal(pos, text);
            server.enqueueMsg(client.makeOpMessage(insertOp, UnassignedSequenceNumber));
            if (TestClient.useCheckQ) {
                client.enqueueTestString();
            }
        }

        function randomSpateOfRemoves(client: TestClient, server: TestServer) {
            let dlen = randTextLength();
            let preLen = client.getLength();
            let pos = random.integer(0, preLen)(mt);
            const removeOp = client.removeRangeLocal(pos, pos + dlen);
            server.enqueueMsg(client.makeOpMessage(removeOp, UnassignedSequenceNumber));
            if (TestClient.useCheckQ) {
                client.enqueueTestString();
            }
        }

        function randomWordMove(client: TestClient, server: TestServer) {
            let word1 = client.findRandomWord();
            if (word1) {
                let removeStart = word1.pos;
                let removeEnd = removeStart + word1.text.length;
                const removeOp = client.removeRangeLocal(removeStart, removeEnd);
                server.enqueueMsg(client.makeOpMessage(removeOp, UnassignedSequenceNumber));
                if (TestClient.useCheckQ) {
                    client.enqueueTestString();
                }
                let word2 = client.findRandomWord();
                while (!word2) {
                    word2 = client.findRandomWord();
                }
                let pos = word2.pos + word2.text.length;
                const insertOp = client.insertTextLocal(pos, word1.text);
                server.enqueueMsg(client.makeOpMessage(insertOp, UnassignedSequenceNumber));
                if (TestClient.useCheckQ) {
                    client.enqueueTestString();
                }
            }
        }

        let errorCount = 0;

        function finishRound(roundCount: number) {
            // process remaining messages
            if (serverProcessSome(serverA, true)) {
                return;
            }
            if (serverProcessSome(serverB, true)) {
                return;
            }
            for (let client of clientsA) {
                clientProcessSome(client, true);
            }
            for (let client of clientsB) {
                clientProcessSome(client, true);
            }
            let allRounds = false;
            if (allRounds || (0 === (roundCount % 100))) {
                let clockStart = clock();
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
                let statsA = serverA.mergeTree.getStats();
                let statsB = serverB.mergeTree.getStats();
                let liveAve = (statsA.liveCount / statsA.nodeCount).toFixed(1);
                let liveAveB = (statsB.liveCount / statsB.nodeCount).toFixed(1);

                let posLeaves = statsA.leafCount - statsA.removedLeafCount;
                let posLeavesB = statsB.leafCount - statsB.removedLeafCount;

                console.log(`round: ${roundCount} A> seqA ${serverA.seq} char count ${serverA.getLength()} height ${statsA.maxHeight} lv ${statsA.leafCount} rml ${statsA.removedLeafCount} p ${posLeaves} nodes ${statsA.nodeCount} pop ${liveAve} histo ${statsA.histo}`);
                console.log(`round: ${roundCount} B> seqB ${serverB.seq} char count ${serverB.getLength()} height ${statsB.maxHeight} lv ${statsB.leafCount} rml ${statsB.removedLeafCount} p ${posLeavesB} nodes ${statsB.nodeCount} pop ${liveAveB} histo ${statsB.histo}`);
                reportTiming(serverA);
                reportTiming(serverB);
                reportTiming(clientsA[1]);
                reportTiming(clientsB[1]);
                let aveGetTextTime = (getTextTime / getTextCalls).toFixed(1);
                let perLeafAveGetTextTime = ((getTextTime / getTextCalls) / statsA.leafCount).toFixed(1);
                let perLeafAveCrossGetTextTime = ((crossGetTextTime / crossGetTextCalls) / statsB.leafCount).toFixed(1);
                let aveCrossGetTextTime = (crossGetTextTime / crossGetTextCalls).toFixed(1);
                // let aveIncrGetTextTime = "off";
                // let aveCatchUpTime = "off";
                // if (catchUps > 0) {
                //     aveCatchUpTime = (catchUpTime / catchUps).toFixed(1);
                // }
                // if (checkIncr) {
                //     aveIncrGetTextTime = (incrGetTextTime / incrGetTextCalls).toFixed(1);
                // }
                console.log(`get text time: ${aveGetTextTime}; ${perLeafAveGetTextTime}/leaf cross: ${aveCrossGetTextTime}; ${perLeafAveCrossGetTextTime}/leaf`);

                let totalTime = serverA.accumTime + serverA.accumWindowTime;
                for (let client of clientsA) {
                    totalTime += (client.accumTime + client.localTime + client.accumWindowTime);
                }
                for (let client of clientsB) {
                    totalTime += (client.accumTime + client.localTime + client.accumWindowTime);
                }
                if (verbose) {
                    console.log(`total time ${(totalTime / 1000000.0).toFixed(1)} check time ${(checkTime / 1000000.0).toFixed(1)}`);
                }
                //console.log(server.getText());
                //console.log(server.mergeTree.toString());
            }
            return errorCount;
        }

        function round(roundCount: number, clients: TestClient[], server: TestServer) {
            let small = true;
            for (let client of clients) {
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

        let startTime = Date.now();
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
            //console.log(server.getText());
            //console.log(server.mergeTree.toString());
        }
        return errorCount;

    }
    let clientNames = ["Ed", "Ted", "Ned", "Harv", "Marv", "Glenda", "Susan"];

    function firstTest() {
        let cli = new TestClient();
        cli.insertTextLocal(0, "on the mat.")
        cli.startCollaboration("Fred1");
        for (let cname of clientNames) {
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
        cli.startCollaboration("Fred2");
        for (let cname of clientNames) {
            cli.addLongClientId(cname);
        }
        cli.insertTextRemote(0, "abcde", undefined, 1, 0, "2");
        let segoff = cli.getContainingSegment(0);
        let lref1 = new MergeTree.LocalReference(cli, <MergeTree.BaseSegment>(segoff.segment),
            segoff.offset);
        cli.insertTextRemote(0, "yyy", undefined, 2, 0, "1");
        cli.insertTextRemote(2, "zzz", undefined, 3, 1, "3");
        cli.insertTextRemote(1, "EAGLE", undefined, 4, 1, "4");
        cli.insertTextRemote(4, "HAS", undefined, 5, 1, "5");
        cli.insertTextLocal(19, " LANDED");
        cli.insertTextRemote(0, "yowza: ", undefined, 6, 4, "2");
        let lref1pos = cli.mergeTree.referencePositionToLocalPosition(lref1);
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
        cli.startCollaboration("Fred3");
        for (let cname of clientNames) {
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
        let fwdRanges = cli.mergeTree.tardisRange(0, 5, 1, 2, cli.getClientId());
        if (verbose) {
            console.log(`fwd range 0 5 on 1 => 2`);
            for (let r of fwdRanges) {
                console.log(`fwd range (${r.start}, ${r.end})`);
            }
        }
        let fwdPos = cli.mergeTree.tardisPosition(2, 1, 2, cli.getClientId());
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
        cli.removeRangeLocal(3,8);
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
        fwdRanges = cli.mergeTree.tardisRangeFromClient(3, 6, 9, 10, 2);
        if (verbose) {
            console.log(cli.mergeTree.toString());
            console.log(`fwd range 3 6 on cli 2 refseq 9 => cli 0 local`);
            for (let r of fwdRanges) {
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
    }
}

function editFlat(source: string, s: number, dl: number, nt = "") {
    return source.substring(0, s) + nt + source.substring(s + dl, source.length);
}

let accumTime = 0;

function checkInsertMergeTree(mergeTree: MergeTree.MergeTree, pos: number, textSegment: MergeTree.TextSegment,
    verbose = false) {
    const helper = new MergeTreeTextHelper(mergeTree);
    let checkText = helper.getText(UniversalSequenceNumber, LocalClientId);
    checkText = editFlat(checkText, pos, 0, textSegment.text);
    let clockStart = clock();
    mergeTree.insertSegments(
        pos,
        [new TextSegment(textSegment.text)],
        UniversalSequenceNumber,
        LocalClientId,
        UniversalSequenceNumber,
        undefined);
    accumTime += elapsedMicroseconds(clockStart);
    let updatedText = helper.getText(UniversalSequenceNumber, LocalClientId);
    let result = (checkText == updatedText);
    if ((!result) && verbose) {
        console.log(`mismatch(o): ${checkText}`);
        console.log(`mismatch(u): ${updatedText}`);
    }
    return result;
}

function checkRemoveMergeTree(mergeTree: MergeTree.MergeTree, start: number, end: number, verbose = false) {
    const helper = new MergeTreeTextHelper(mergeTree);
    let origText = helper.getText(UniversalSequenceNumber, LocalClientId);
    let checkText = editFlat(origText, start, end - start);
    let clockStart = clock();
    mergeTree.removeRange(start, end, UniversalSequenceNumber, LocalClientId);
    accumTime += elapsedMicroseconds(clockStart);
    let updatedText = helper.getText(UniversalSequenceNumber, LocalClientId);
    let result = (checkText == updatedText);
    if ((!result) && verbose) {
        console.log(`mismatch(o): ${origText}`);
        console.log(`mismatch(c): ${checkText}`);
        console.log(`mismatch(u): ${updatedText}`);
    }
    return result;
}

function checkMarkRemoveMergeTree(mergeTree: MergeTree.MergeTree, start: number, end: number, verbose = false) {
    const helper = new MergeTreeTextHelper(mergeTree);
    let origText = helper.getText(UniversalSequenceNumber, LocalClientId);
    let checkText = editFlat(origText, start, end - start);
    let clockStart = clock();
    mergeTree.markRangeRemoved(start, end, UniversalSequenceNumber, LocalClientId, UniversalSequenceNumber, false, undefined);
    accumTime += elapsedMicroseconds(clockStart);
    let updatedText = helper.getText(UniversalSequenceNumber, LocalClientId);
    let result = (checkText == updatedText);
    if ((!result) && verbose) {
        console.log(`mismatch(o): ${origText}`);
        console.log(`mismatch(c): ${checkText}`);
        console.log(`mismatch(u): ${updatedText}`);
    }
    return result;
}

function makeCollabTextSegment(text: string) {
    return new MergeTree.TextSegment(text);
}

export function mergeTreeCheckedTest() {
    let mergeTree = new MergeTree.MergeTree();
    mergeTree.insertSegments(0, [TextSegment.make("the cat is on the mat")], UniversalSequenceNumber, LocalClientId, UniversalSequenceNumber, undefined);
    const insertCount = 2000;
    const removeCount = 1400;
    const largeRemoveCount = 20;
    let mt = random.engines.mt19937();
    mt.seedWithArray([0xdeadbeef, 0xfeedbed]);
    const imin = 1;
    const imax = 9;
    let distribution = random.integer(imin, imax);
    let largeDistribution = random.integer(10, 1000);
    function randInt() {
        return distribution(mt);
    }
    function randLargeInt() {
        return largeDistribution(mt);
    }
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
        let slen = randInt();
        let s = randomString(slen, String.fromCharCode(48 + slen));
        let preLen = mergeTree.getLength(UniversalSequenceNumber, LocalClientId);
        let pos = random.integer(0, preLen)(mt);
        if (!checkInsertMergeTree(mergeTree, pos, makeCollabTextSegment(s), true)) {
            console.log(`i: ${i} preLen ${preLen} pos: ${pos} slen: ${slen} s: ${s} itree len: ${mergeTree.getLength(UniversalSequenceNumber, LocalClientId)}`);
            console.log(mergeTree.toString());
            errorCount++;
            break;
        }
        if ((i > 0) && (0 == (i % 1000))) {
            let perIter = (accumTime / (i + 1)).toFixed(3);
            treeCount++;
            accumTreeSize += mergeTree.getLength(UniversalSequenceNumber, LocalClientId);
            let averageTreeSize = (accumTreeSize / treeCount).toFixed(3);
            console.log(`i: ${i} time: ${accumTime}us which is average ${perIter} per insert with average tree size ${averageTreeSize}`);
        }
    }
    accumTime = 0;
    accumTreeSize = 0;
    treeCount = 0;
    for (let i = 0; i < largeRemoveCount; i++) {
        let dlen = randLargeInt();
        let preLen = mergeTree.getLength(UniversalSequenceNumber, LocalClientId);
        let pos = random.integer(0, preLen)(mt);
        // console.log(itree.toString());
        if (!checkRemoveMergeTree(mergeTree, pos, pos + dlen, true)) {
            console.log(`i: ${i} preLen ${preLen} pos: ${pos} dlen: ${dlen} itree len: ${mergeTree.getLength(UniversalSequenceNumber, LocalClientId)}`);
            console.log(mergeTree.toString());
            break;
        }
        if ((i > 0) && (0 == (i % 10))) {
            let perIter = (accumTime / (i + 1)).toFixed(3);
            treeCount++;
            accumTreeSize += mergeTree.getLength(UniversalSequenceNumber, LocalClientId);
            let averageTreeSize = (accumTreeSize / treeCount).toFixed(3);
            console.log(`i: ${i} time: ${accumTime}us which is average ${perIter} per large del with average tree size ${averageTreeSize}`);
        }
    }
    accumTime = 0;
    accumTreeSize = 0;
    treeCount = 0;
    for (let i = 0; i < removeCount; i++) {
        let dlen = randInt();
        let preLen = mergeTree.getLength(UniversalSequenceNumber, LocalClientId);
        let pos = random.integer(0, preLen)(mt);
        // console.log(itree.toString());
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
        if ((i > 0) && (0 == (i % 1000))) {
            let perIter = (accumTime / (i + 1)).toFixed(3);
            treeCount++;
            accumTreeSize += mergeTree.getLength(UniversalSequenceNumber, LocalClientId);
            let averageTreeSize = (accumTreeSize / treeCount).toFixed(3);
            console.log(`i: ${i} time: ${accumTime}us which is average ${perIter} per del with average tree size ${averageTreeSize}`);
        }
    }
    accumTime = 0;
    accumTreeSize = 0;
    treeCount = 0;
    for (let i = 0; i < insertCount; i++) {
        let slen = randInt();
        let s = randomString(slen, String.fromCharCode(48 + slen));
        let preLen = mergeTree.getLength(UniversalSequenceNumber, LocalClientId);
        let pos = random.integer(0, preLen)(mt);
        if (!checkInsertMergeTree(mergeTree, pos, makeCollabTextSegment(s), true)) {
            console.log(`i: ${i} preLen ${preLen} pos: ${pos} slen: ${slen} s: ${s} itree len: ${mergeTree.getLength(UniversalSequenceNumber, LocalClientId)}`);
            console.log(mergeTree.toString());
            errorCount++;
            break;
        }
        if ((i > 0) && (0 == (i % 1000))) {
            let perIter = (accumTime / (i + 1)).toFixed(3);
            treeCount++;
            accumTreeSize += mergeTree.getLength(UniversalSequenceNumber, LocalClientId);
            let averageTreeSize = (accumTreeSize / treeCount).toFixed(3);
            console.log(`i: ${i} time: ${accumTime}us which is average ${perIter} per insert with average tree size ${averageTreeSize}`);
        }
    }
    accumTime = 0;
    accumTreeSize = 0;
    treeCount = 0;
    for (let i = 0; i < removeCount; i++) {
        let dlen = randInt();
        let preLen = mergeTree.getLength(UniversalSequenceNumber, LocalClientId);
        let pos = random.integer(0, preLen)(mt);
        // console.log(itree.toString());
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
        if ((i > 0) && (0 == (i % 1000))) {
            let perIter = (accumTime / (i + 1)).toFixed(3);
            treeCount++;
            accumTreeSize += mergeTree.getLength(UniversalSequenceNumber, LocalClientId);
            let averageTreeSize = (accumTreeSize / treeCount).toFixed(3);
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
        let exampleWords = ["giraffe", "hut", "aardvark", "gold", "hover",
            "yurt", "hot", "antelope", "gift", "banana", "book", "airplane",
            "kitten", "moniker", "lemma", "doughnut", "orange", "tangerine"
        ];
        let buf = "";
        for (let i = 0; i < wordCount; i++) {
            let exampleWord = exampleWords[this.randInteger(0, exampleWords.length - 1)];
            if (i > 0) {
                buf += ' ';
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
            let text = <string>docNode;
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
                let trid = docNode.name + this.ids[docNode.name].toString();
                docNode.id = trid;
                id = this.ids[docNode.name]++;
                let props = {
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
            for (let child of docNode.children) {
                this.addToMergeTree(client, child);
            }
            if (docNode.name !== "pg") {
                let etrid = "end-" + docNode.name + id.toString();
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
        let verbose = false;
        let stacks = {
            box: new MergeTree.Stack<string>(),
            row: new MergeTree.Stack<string>()
        };

        function printStack(stack: MergeTree.Stack<string>) {
            for (let item in stack.items) {
                console.log(item);
            }
        }

        function printStacks() {
            for (let name of ["box", "row"]) {
                console.log(name + ":");
                printStack(stacks[name]);
            }
        }

        function checkTreeStackEmpty(treeStack: MergeTree.Stack<string>) {
            if (!treeStack.empty()) {
                errorCount++;
                console.log("mismatch: client stack empty; tree stack not");
            }
        }

        let checkNodeStacks = (docNode: DocumentNode) => {
            if (typeof docNode === "string") {
                let text = <string>docNode;
                let epos = pos + text.length;
                if (verbose) {
                    console.log(`stacks for [${pos}, ${epos}): ${text}`);
                    printStacks();
                }
                let cliStacks = client.getStackContext(pos, ["box", "row"]);
                for (let name of ["box", "row"]) {
                    let cliStack = cliStacks[name];
                    let treeStack = <MergeTree.Stack<string>>stacks[name];
                    if (cliStack) {
                        let len = cliStack.items.length;
                        if (len > 0) {
                            if (len !== treeStack.items.length) {
                                console.log(`stack length mismatch cli ${len} tree ${treeStack.items.length}`);
                                errorCount++;
                            }
                            for (let i = 0; i < len; i++) {
                                let cliMarkerId = (cliStack.items[i] as MergeTree.Marker).getId();
                                let treeMarkerId = treeStack.items[i];
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
                    for (let child of docNode.children) {
                        checkNodeStacks(child);
                    }
                    stacks[docNode.name].pop();
                    pos++;
                }
            }
        }

        let prevPos = -1;
        let prevChild: DocumentNode;

        // console.log(client.mergeTree.toString());
        for (let rootChild of this.children) {
            if (prevPos >= 0) {
                if ((typeof prevChild !== "string") && (prevChild.name === "row")) {
                    let id = prevChild.id;
                    let endId = "end-" + id;
                    let endRowMarker = <MergeTree.Marker>client.getMarkerFromId(endId);
                    let endRowPos = client.getPosition(endRowMarker);
                    prevPos = endRowPos;
                }
                let tilePos = client.findTile(prevPos, "pg", false);
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
            // printStacks();
            checkNodeStacks(rootChild);
        }
        return errorCount;
    }

    private generateClient() {
        let client = new TestClient({ blockUpdateMarkers: true });
        client.startCollaboration("Fred");
        for (let child of this.children) {
            this.addToMergeTree(client, child);
        }
        return client;
    }

    static test1() {
        let doc = DocumentTree.generateDocument();
        let client = doc.generateClient();
        return doc.checkStacksAllPositions(client);
    }

    static generateDocument() {
        let tree = new DocumentTree("Document", DocumentTree.generateContent(0.6));
        return tree;
    }

    static generateContent(rowProbability: number) {
        let items = <DocumentNode[]>[];
        let docLen = DocumentTree.randPack.randInteger(7, 25);
        for (let i = 0; i < docLen; i++) {
            let rowThreshold = rowProbability * 1000;
            let selector = DocumentTree.randPack.randInteger(1, 1000);
            if (selector >= rowThreshold) {
                let pg = DocumentTree.generateParagraph();
                items.push(pg);
            } else {
                rowProbability /= 2;
                if (rowProbability < 0.08) {
                    rowProbability = 0;
                }
                let row = DocumentTree.generateRow(rowProbability);
                items.push(row);
            }

        }
        return items;
    }

    // model pg tile as tree with single child
    static generateParagraph() {
        let wordCount = DocumentTree.randPack.randInteger(1, 6);
        let text = DocumentTree.randPack.randString(wordCount);
        let pgTree = new DocumentTree("pg", [text]);
        return pgTree;
    }

    static generateRow(rowProbability: number) {
        let items = <DocumentNode[]>[];
        let rowLen = DocumentTree.randPack.randInteger(1, 5);
        for (let i = 0; i < rowLen; i++) {
            let item = DocumentTree.generateBox(rowProbability);
            items.push(item);
        }
        return new DocumentTree("row", items);
    }

    static generateBox(rowProbability: number) {
        return new DocumentTree("box", DocumentTree.generateContent(rowProbability));
    }
}

function insertElm(treeLabel: string, elm: Xmldoc.XmlElement, client: TestClient, parentId?: string) {
    let elmProps = MergeTree.createMap<any>();
    if (elm.attr) {
        elmProps["XMLattributes"] = elm.attr;
    }
    let nodePos = OverlayNodePosition.Append;
    if (!parentId) {
        nodePos = OverlayNodePosition.Root;
    }
    let elmId = insertOverlayNode(treeLabel, client, elm.name, nodePos,
        elmProps, parentId);
    if (elm.children) {
        for (let child of elm.children) {
            child = child as Xmldoc.XmlElement;
            if (child.name) {
                insertElm(treeLabel, child, client, elmId);
            }
        }
    }
    if (elm.val && /[^\s]/.test(elm.val)) {
        const pos = client.posFromRelativePos({ id: elmId })
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
            for (let attr in attrs) {
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
            let marker = <MergeTree.Marker>segment;
            if (marker.refType & MergeTree.ReferenceType.NestBegin) {
                strbuf += MergeTree.internedSpaces(indentAmt);
                let nodeType = marker.properties[onodeTypeKey];
                strbuf += `<${nodeType}`;
                let attrs = marker.properties["XMLattributes"];
                if (attrs) {
                    strbuf += attrString(attrs);
                }
                strbuf += ">\n";
                indentAmt += indentDelta;
            } else if (marker.refType & MergeTree.ReferenceType.NestEnd) {
                indentAmt -= indentDelta;
                strbuf += MergeTree.internedSpaces(indentAmt);
                let nodeType = marker.properties[onodeTypeKey];
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
    let books = fs.readFileSync(booksFilename, "utf8");
    let booksDoc = new Xmldoc.XmlDocument(books);
    let client = new TestClient({ blockUpdateMarkers: true });
    let plants = fs.readFileSync(plantsFilename, "utf8");
    let plantsDoc = new Xmldoc.XmlDocument(plants);
    insertElm("booksDoc", booksDoc, client);
    insertElm("plantsDoc", plantsDoc, client);

    printOverlayTree(client);
}

let docRanges = <MergeTree.IIntegerRange[]>[
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

let testRanges = <MergeTree.IIntegerRange[]>[
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
    let rangeTree = new MergeTree.IntegerRangeTree();
    for (let docRange of docRanges) {
        rangeTree.put(docRange);
    }
    console.log(rangeTree.toString());
    function matchRange(r: MergeTree.IIntegerRange) {
        console.log("match range " + MergeTree.integerRangeToString(r));
        let results = rangeTree.match(r);
        for (let result of results) {
            console.log(MergeTree.integerRangeToString(result.key));
        }
    }
    for (let testRange of testRanges) {
        matchRange(testRange);
    }
}

export function intervalTest() {
    let mt = random.engines.mt19937();
    mt.seedWithArray([0xdeadbeef, 0xfeedbed]);
    const imin = 0;
    const imax = 10000000;
    const intCount = 50000;
    const arr = [] as SharedString.Interval[];
    let distribution = random.integer(imin, imax);
    function randInt() {
        return distribution(mt);
    }
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
    let tst = new MergeTree.TST<ICmd>();
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
    for (let pair of res) {
        console.log(`key: ${pair.key} val: ${pair.val.description}`);
    }
    res = tst.pairsWithPrefix("n");
    console.log("trying n");
    for (let pair of res) {
        console.log(`key: ${pair.key} val: ${pair.val.description}`);
    }
    res = tst.pairsWithPrefix("ne");
    console.log("trying ne");
    for (let pair of res) {
        console.log(`key: ${pair.key} val: ${pair.val.description}`);
    }
    res=[];
    tst.map((key,val)=> res.push({key, val}));
    console.log("trying map");
    for (let pair of res) {
        console.log(`key: ${pair.key} val: ${pair.val.description}`);
    }
}

let rangeTreeTest = false;
let testPropCopy = false;
let overlayTree = false;
let docTree = false;
let chktst = false;
let clientServerTest = true;
let tstTest = false;
let firstTest = false;
let ivalTest = false;

if (firstTest) {
    let testPack = TestPack(true);
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
    let ppTest = true;
    let branch = false;
    let testPack = TestPack();
    const filename = path.join(__dirname, "../../../../server/gateway/public/literature", "pp.txt");
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
