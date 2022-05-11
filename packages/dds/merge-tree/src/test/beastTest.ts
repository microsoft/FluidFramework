/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/consistent-type-assertions, max-len, no-bitwise */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { strict as assert } from "assert";
import fs from "fs";
import path from "path";
import { Trace } from "@fluidframework/common-utils";
import { DebugLogger } from "@fluidframework/telemetry-utils";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import JsDiff from "diff";
import random from "random-js";
import {
    KeyComparer,
    Property,
    PropertyAction,
    SortedDictionary,
} from "../base";
import {
    ProxString,
    RedBlackTree,
    Stack,
    TST,
} from "../collections";
import { LocalClientId, UnassignedSequenceNumber, UniversalSequenceNumber } from "../constants";
import {
    IJSONMarkerSegment,
    IMergeNode,
    ISegment,
    Marker,
    MergeTree,
    reservedMarkerIdKey,
    reservedRangeLabelsKey,
    reservedTileLabelsKey,
} from "../mergeTree";
import { IMergeTreeDeltaOpArgs } from "../mergeTreeDeltaCallback";
import { createRemoveRangeOp } from "../opBuilder";
import {
    IMergeTreeOp,
    MergeTreeDeltaType,
    ReferenceType,
} from "../ops";
import { SnapshotLegacy } from "../snapshotlegacy";
import {
    IJSONTextSegment,
    MergeTreeTextHelper,
    TextSegment,
} from "../textSegment";
import { specToSegment, TestClient } from "./testClient";
import { TestServer } from "./testServer";
import { insertText, loadTextFromFile, nodeOrdinalsHaveIntegrity } from "./testUtils";

function LinearDictionary<TKey, TData>(compareKeys: KeyComparer<TKey>): SortedDictionary<TKey, TData> {
    const props: Property<TKey, TData>[] = [];
    const compareProps = (a: Property<TKey, TData>, b: Property<TKey, TData>) => compareKeys(a.key, b.key);
    function mapRange<TAccum>(action: PropertyAction<TKey, TData>, accum?: TAccum, start?: TKey, end?: TKey) {
        let _start = start;
        let _end = end;

        if (props.length !== 0) { return; }

        if (_start === undefined) {
            _start = min()!.key;
        }
        if (_end === undefined) {
            _end = max()!.key;
        }
        for (let i = 0, len = props.length; i < len; i++) {
            if (compareKeys(_start, props[i].key) <= 0) {
                const ecmp = compareKeys(_end, props[i].key);
                if (ecmp < 0) {
                    break;
                }
                if (!action(props[i], accum)) {
                    break;
                }
            }
        }
    }

    function map<TAccum>(action: PropertyAction<TKey, TData>, accum?: TAccum) {
        mapRange(action, accum);
    }

    function min() {
        if (props.length > 0) {
            return props[0];
        }
    }
    function max() {
        if (props.length > 0) {
            return props[props.length - 1];
        }
    }

    function get(key: TKey) {
        for (let i = 0, len = props.length; i < len; i++) {
            if (props[i].key === key) {
                return props[i];
            }
        }
    }

    function put(key: TKey, data: TData) {
        if (key !== undefined) {
            if (data === undefined) {
                remove(key);
            } else {
                props.push({ key, data });
                props.sort(compareProps); // Go to insertion sort if too slow
            }
        }
    }
    function remove(key: TKey) {
        if (key !== undefined) {
            for (let i = 0, len = props.length; i < len; i++) {
                if (props[i].key === key) {
                    props[i] = props[len - 1];
                    props.length--;
                    props.sort(compareProps);
                    break;
                }
            }
        }
    }
    return {
        min,
        max,
        map,
        mapRange,
        remove,
        get,
        put,
    };
}

let logLines: string[];
function log(message: any) {
    if (logLines) {
        logLines.push(message.toString());
    }
}

const compareStrings = (a: string, b: string) => a.localeCompare(b);

const compareNumbers = (a: number, b: number) => a - b;

function printStringProperty(p?: Property<string, string>) {
    log(`[${p?.key}, ${p?.data}]`);
    return true;
}

function printStringNumProperty(p: Property<string, number>) {
    log(`[${p.key}, ${p.data}]`);
    return true;
}

export function simpleTest() {
    const a = [
        "Aardvark", "cute",
        "Baboon", "big",
        "Chameleon", "colorful",
        "Dingo", "wild",
    ];

    const beast = new RedBlackTree<string, string>(compareStrings);
    for (let i = 0; i < a.length; i += 2) {
        beast.put(a[i], a[i + 1]);
    }
    beast.map(printStringProperty);
    log("Map B D");
    log("Map Aardvark Dingo");
    log("Map Baboon Chameleon");
    printStringProperty(beast.get("Chameleon"));
}

const clock = () => Trace.start();

function took(desc: string, trace: Trace) {
    const duration = trace.trace().duration;
    log(`${desc} took ${duration} ms`);
    return duration;
}

function elapsedMicroseconds(trace: Trace) {
    return trace.trace().duration * 1000;
}

export function integerTest1() {
    const mt = random.engines.mt19937();
    mt.seedWithArray([0xdeadbeef, 0xfeedbed]);
    const imin = 0;
    const imax = 10000000;
    const intCount = 1100000;
    const distribution = random.integer(imin, imax);
    const beast = new RedBlackTree<number, number>(compareNumbers);

    const randInt = () => distribution(mt);
    const pos = new Array<number>(intCount);
    let i = 0;
    let redo = false;
    function onConflict(key: number, currentKey: number) {
        redo = true;
        return { data: currentKey };
    }
    let conflictCount = 0;
    let start = clock();
    while (i < intCount) {
        pos[i] = randInt();
        beast.put(pos[i], i, onConflict);
        if (!redo) {
            i++;
        } else {
            conflictCount++;
            redo = false;
        }
    }
    took("test gen", start);
    const errorCount = 0;
    start = clock();
    for (let j = 0, len = pos.length; j < len; j++) {
        const cp = pos[j];
        /* let prop = */ beast.get(cp);
    }
    const getdur = took("get all keys", start);
    log(`cost per get is ${(1000.0 * getdur / intCount).toFixed(3)} us`);
    log(`duplicates ${conflictCount}, errors ${errorCount}`);
    return errorCount;
}

export function fileTest1() {
    const content = fs.readFileSync(path.join(__dirname, "../../../public/literature/shakespeare.txt"), "utf8");
    const a = content.split("\n");
    const iterCount = a.length >> 2;
    const removeCount = 10;
    log(`len: ${a.length}`);

    for (let k = 0; k < iterCount; k++) {
        const beast = new RedBlackTree<string, number>(compareStrings);
        const linearBeast = LinearDictionary<string, number>(compareStrings);
        for (let i = 0, len = a.length; i < len; i++) {
            a[i] = a[i].trim();
            if (a[i].length > 0) {
                beast.put(a[i], i);
                linearBeast.put(a[i], i);
            }
        }
        if (k === 0) {
            beast.map(printStringNumProperty);
            log("BTREE...");
        }
        const removedAnimals: string[] = [];
        for (let j = 0; j < removeCount; j++) {
            const removeIndex = Math.floor(Math.random() * a.length);
            log(`Removing: ${a[removeIndex]} at ${removeIndex}`);
            beast.remove(a[removeIndex]);
            linearBeast.remove(a[removeIndex]);
            removedAnimals.push(a[removeIndex]);
        }
        for (const animal of a) {
            if ((animal.length > 0) && (!removedAnimals.includes(animal))) {
                const prop = beast.get(animal);
                const linProp = linearBeast.get(animal);
                // log(`Trying key ${animal}`);
                if (prop) {
                    // printStringNumProperty(prop);
                    if ((linProp === undefined) || (prop.key !== linProp.key) || (prop.data !== linProp.data)) {
                        log(`Linear BST does not match RB BST at key ${animal}`);
                    }
                } else {
                    log(`hmm...bad key: ${animal}`);
                }
            }
        }
    }
}

function printTextSegment(textSegment: ISegment, pos: number) {
    log(textSegment.toString());
    log(`at [${pos}, ${pos + textSegment.cachedLength})`);
    return true;
}

export function makeTextSegment(text: string): IMergeNode {
    return new TextSegment(text);
}

function makeCollabTextSegment(text: string) {
    return new TextSegment(text);
}

function editFlat(source: string, s: number, dl: number, nt = "") {
    return source.substring(0, s) + nt + source.substring(s + dl, source.length);
}

let accumTime = 0;

function checkInsertMergeTree(
    mergeTree: MergeTree,
    pos: number, textSegment: TextSegment,
    verbose = false) {
    let checkText = new MergeTreeTextHelper(mergeTree).getText(UniversalSequenceNumber, LocalClientId);
    checkText = editFlat(checkText, pos, 0, textSegment.text);
    const clockStart = clock();
    insertText(mergeTree, pos, UniversalSequenceNumber, LocalClientId, UniversalSequenceNumber,
        textSegment.text, undefined, undefined);
    accumTime += elapsedMicroseconds(clockStart);
    const updatedText = new MergeTreeTextHelper(mergeTree).getText(UniversalSequenceNumber, LocalClientId);
    const result = (checkText === updatedText);
    if ((!result) && verbose) {
        log(`mismatch(o): ${checkText}`);
        log(`mismatch(u): ${updatedText}`);
    }
    return result;
}

function checkMarkRemoveMergeTree(mergeTree: MergeTree, start: number, end: number, verbose = false) {
    const helper = new MergeTreeTextHelper(mergeTree);
    const origText = helper.getText(UniversalSequenceNumber, LocalClientId);
    const checkText = editFlat(origText, start, end - start);
    const clockStart = clock();
    mergeTree.markRangeRemoved(start, end, UniversalSequenceNumber, LocalClientId, UniversalSequenceNumber, false, { op: createRemoveRangeOp(start, end) });
    accumTime += elapsedMicroseconds(clockStart);
    const updatedText = helper.getText(UniversalSequenceNumber, LocalClientId);
    const result = (checkText === updatedText);
    if ((!result) && verbose) {
        log(`mismatch(o): ${origText}`);
        log(`mismatch(c): ${checkText}`);
        log(`mismatch(u): ${updatedText}`);
    }
    return result;
}

export function mergeTreeTest1() {
    const mergeTree = new MergeTree();
    mergeTree.insertSegments(0, [TextSegment.make("the cat is on the mat")], UniversalSequenceNumber, LocalClientId, UniversalSequenceNumber, undefined);
    mergeTree.map({ leaf: printTextSegment }, UniversalSequenceNumber, LocalClientId, undefined);
    let fuzzySeg = makeCollabTextSegment("fuzzy, fuzzy ");
    checkInsertMergeTree(mergeTree, 4, fuzzySeg);
    fuzzySeg = makeCollabTextSegment("fuzzy, fuzzy ");
    checkInsertMergeTree(mergeTree, 4, fuzzySeg);
    checkMarkRemoveMergeTree(mergeTree, 4, 13);
    // checkRemoveSegTree(segTree, 4, 13);
    checkInsertMergeTree(mergeTree, 4, makeCollabTextSegment("fi"));
    mergeTree.map({ leaf: printTextSegment }, UniversalSequenceNumber, LocalClientId, undefined);
    const segoff = mergeTree.getContainingSegment(4, UniversalSequenceNumber, LocalClientId);
    log(mergeTree.getPosition(segoff.segment!, UniversalSequenceNumber, LocalClientId));
    log(new MergeTreeTextHelper(mergeTree).getText(UniversalSequenceNumber, LocalClientId));
    log(mergeTree.toString());
    TestPack().firstTest();
}

export function mergeTreeLargeTest() {
    const mergeTree = new MergeTree();
    mergeTree.insertSegments(0, [TextSegment.make("the cat is on the mat")], UniversalSequenceNumber, LocalClientId, UniversalSequenceNumber, undefined);
    const insertCount = 1000000;
    const removeCount = 980000;
    const mt = random.engines.mt19937();
    mt.seedWithArray([0xdeadbeef, 0xfeedbed]);
    const imin = 1;
    const imax = 9;
    const distribution = random.integer(imin, imax);
    const randInt = () => distribution(mt);
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
    for (let i = 0; i < insertCount; i++) {
        const slen = randInt();
        const s = randomString(slen, String.fromCharCode(48 + slen));
        const preLen = mergeTree.getLength(UniversalSequenceNumber, LocalClientId);
        const pos = random.integer(0, preLen)(mt);
        const clockStart = clock();
        insertText(mergeTree, pos, UniversalSequenceNumber, LocalClientId, UniversalSequenceNumber,
            s, undefined, undefined);
        accumTime += elapsedMicroseconds(clockStart);
        if ((i > 0) && (0 === (i % 50000))) {
            const perIter = (accumTime / (i + 1)).toFixed(3);
            treeCount++;
            accumTreeSize += mergeTree.getLength(UniversalSequenceNumber, LocalClientId);
            const averageTreeSize = (accumTreeSize / treeCount).toFixed(3);
            log(`i: ${i} time: ${accumTime}us which is average ${perIter} per insert with average tree size ${averageTreeSize}`);
        }
    }
    log(process.memoryUsage().heapUsed);
    accumTime = 0;
    accumTreeSize = 0;
    treeCount = 0;
    for (let i = 0; i < removeCount; i++) {
        const dlen = randInt();
        const preLen = mergeTree.getLength(UniversalSequenceNumber, LocalClientId);
        const pos = random.integer(0, preLen)(mt);
        // Log(itree.toString());
        const clockStart = clock();
        mergeTree.markRangeRemoved(pos, pos + dlen, UniversalSequenceNumber, LocalClientId, UniversalSequenceNumber, false, undefined as any);
        accumTime += elapsedMicroseconds(clockStart);

        if ((i > 0) && (0 === (i % 50000))) {
            const perIter = (accumTime / (i + 1)).toFixed(3);
            treeCount++;
            accumTreeSize += mergeTree.getLength(UniversalSequenceNumber, LocalClientId);
            const averageTreeSize = (accumTreeSize / treeCount).toFixed(3);
            log(`i: ${i} time: ${accumTime}us which is average ${perIter} per del with average tree size ${averageTreeSize}`);
        }
    }
}

export function mergeTreeCheckedTest() {
    const mergeTree = new MergeTree();
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
            log(`i: ${i} preLen ${preLen} pos: ${pos} slen: ${slen} s: ${s} itree len: ${mergeTree.getLength(UniversalSequenceNumber, LocalClientId)}`);
            log(mergeTree.toString());
            errorCount++;
            break;
        }
        if ((i > 0) && (0 === (i % 1000))) {
            const perIter = (accumTime / (i + 1)).toFixed(3);
            treeCount++;
            accumTreeSize += mergeTree.getLength(UniversalSequenceNumber, LocalClientId);
            const averageTreeSize = (accumTreeSize / treeCount).toFixed(3);
            log(`i: ${i} time: ${accumTime}us which is average ${perIter} per insert with average tree size ${averageTreeSize}`);
        }
    }
    accumTime = 0;
    accumTreeSize = 0;
    treeCount = 0;
    for (let i = 0; i < largeRemoveCount; i++) {
        const dlen = randLargeInt();
        const preLen = mergeTree.getLength(UniversalSequenceNumber, LocalClientId);
        const pos = random.integer(0, preLen)(mt);
        // log(itree.toString());
        if (!checkMarkRemoveMergeTree(mergeTree, pos, pos + dlen, true)) {
            log(`i: ${i} preLen ${preLen} pos: ${pos} dlen: ${dlen} itree len: ${mergeTree.getLength(UniversalSequenceNumber, LocalClientId)}`);
            log(mergeTree.toString());
            break;
        }
        if ((i > 0) && (0 === (i % 10))) {
            const perIter = (accumTime / (i + 1)).toFixed(3);
            treeCount++;
            accumTreeSize += mergeTree.getLength(UniversalSequenceNumber, LocalClientId);
            const averageTreeSize = (accumTreeSize / treeCount).toFixed(3);
            log(`i: ${i} time: ${accumTime}us which is average ${perIter} per large del with average tree size ${averageTreeSize}`);
        }
    }
    accumTime = 0;
    accumTreeSize = 0;
    treeCount = 0;
    for (let i = 0; i < removeCount; i++) {
        const dlen = randInt();
        const preLen = mergeTree.getLength(UniversalSequenceNumber, LocalClientId);
        const pos = random.integer(0, preLen)(mt);
        // log(itree.toString());
        if (i & 1) {
            if (!checkMarkRemoveMergeTree(mergeTree, pos, pos + dlen, true)) {
                log(`mr i: ${i} preLen ${preLen} pos: ${pos} dlen: ${dlen} itree len: ${mergeTree.getLength(UniversalSequenceNumber, LocalClientId)}`);
                log(mergeTree.toString());
                errorCount++;
                break;
            }
        } else {
            if (!checkMarkRemoveMergeTree(mergeTree, pos, pos + dlen, true)) {
                log(`i: ${i} preLen ${preLen} pos: ${pos} dlen: ${dlen} itree len: ${mergeTree.getLength(UniversalSequenceNumber, LocalClientId)}`);
                log(mergeTree.toString());
                errorCount++;
                break;
            }
        }
        if ((i > 0) && (0 === (i % 1000))) {
            const perIter = (accumTime / (i + 1)).toFixed(3);
            treeCount++;
            accumTreeSize += mergeTree.getLength(UniversalSequenceNumber, LocalClientId);
            const averageTreeSize = (accumTreeSize / treeCount).toFixed(3);
            log(`i: ${i} time: ${accumTime}us which is average ${perIter} per del with average tree size ${averageTreeSize}`);
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
            log(`i: ${i} preLen ${preLen} pos: ${pos} slen: ${slen} s: ${s} itree len: ${mergeTree.getLength(UniversalSequenceNumber, LocalClientId)}`);
            log(mergeTree.toString());
            errorCount++;
            break;
        }
        if ((i > 0) && (0 === (i % 1000))) {
            const perIter = (accumTime / (i + 1)).toFixed(3);
            treeCount++;
            accumTreeSize += mergeTree.getLength(UniversalSequenceNumber, LocalClientId);
            const averageTreeSize = (accumTreeSize / treeCount).toFixed(3);
            log(`i: ${i} time: ${accumTime}us which is average ${perIter} per insert with average tree size ${averageTreeSize}`);
        }
    }
    accumTime = 0;
    accumTreeSize = 0;
    treeCount = 0;
    for (let i = 0; i < removeCount; i++) {
        const dlen = randInt();
        const preLen = mergeTree.getLength(UniversalSequenceNumber, LocalClientId);
        const pos = random.integer(0, preLen)(mt);
        // log(itree.toString());
        if (i & 1) {
            if (!checkMarkRemoveMergeTree(mergeTree, pos, pos + dlen, true)) {
                log(`i: ${i} preLen ${preLen} pos: ${pos} dlen: ${dlen} itree len: ${mergeTree.getLength(UniversalSequenceNumber, LocalClientId)}`);
                log(mergeTree.toString());
                errorCount++;
                break;
            }
        } else {
            if (!checkMarkRemoveMergeTree(mergeTree, pos, pos + dlen, true)) {
                log(`i: ${i} preLen ${preLen} pos: ${pos} dlen: ${dlen} itree len: ${mergeTree.getLength(UniversalSequenceNumber, LocalClientId)}`);
                log(mergeTree.toString());
                errorCount++;
                break;
            }
        }
        if ((i > 0) && (0 === (i % 1000))) {
            const perIter = (accumTime / (i + 1)).toFixed(3);
            treeCount++;
            accumTreeSize += mergeTree.getLength(UniversalSequenceNumber, LocalClientId);
            const averageTreeSize = (accumTreeSize / treeCount).toFixed(3);
            log(`i: ${i} time: ${accumTime}us which is average ${perIter} per del with average tree size ${averageTreeSize}`);
        }
    }
    return errorCount;
}

type SharedStringJSONSegment = IJSONTextSegment & IJSONMarkerSegment;

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

export function TestPack(verbose = true) {
    const mt = random.engines.mt19937();
    mt.seedWithArray([0xdeadbeef, 0xfeedbed]);
    const minSegCount = 1;
    const maxSegCount = 1000;
    const segmentCountDistribution = random.integer(minSegCount, maxSegCount);
    const smallSegmentCountDistribution = random.integer(1, 4);
    const randSmallSegmentCount = () => smallSegmentCountDistribution(mt);
    const randSegmentCount = () => segmentCountDistribution(mt);
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
    let incrGetTextTime = 0;
    let incrGetTextCalls = 0;
    const catchUpTime = 0;
    const catchUps = 0;

    function reportTiming(client: TestClient) {
        if (!verbose) {
            return;
        }
        const aveTime = (client.accumTime / client.accumOps).toFixed(1);
        const aveLocalTime = (client.localTime / client.localOps).toFixed(1);
        const stats = client.mergeTree.getStats();
        const windowTime = stats.windowTime!;
        const packTime = stats.packTime;
        const aveWindowTime = ((windowTime || 0) / (client.accumOps)).toFixed(1);
        const avePackTime = ((packTime || 0) / (client.accumOps)).toFixed(1);
        const aveExtraWindowTime = (client.accumWindowTime / client.accumOps).toFixed(1);
        const aveWindow = (client.accumWindow / client.accumOps).toFixed(1);
        const adjTime = ((client.accumTime - (windowTime - client.accumWindowTime)) / client.accumOps).toFixed(1);
        const aveGetTextTime = (getTextTime / getTextCalls).toFixed(1);
        let aveIncrGetTextTime = "off";
        let aveCatchUpTime = "off";
        if (catchUps > 0) {
            aveCatchUpTime = (catchUpTime / catchUps).toFixed(1);
        }
        if (checkIncr) {
            aveIncrGetTextTime = (incrGetTextTime / incrGetTextCalls).toFixed(1);
        }
        if (client.localOps > 0) {
            log(`local time ${client.localTime} us ops: ${client.localOps} ave time ${aveLocalTime}`);
        }
        log(`get text time: ${aveGetTextTime} incr: ${aveIncrGetTextTime} catch up ${aveCatchUpTime}`);
        log(`accum time ${client.accumTime} us ops: ${client.accumOps} ave time ${aveTime} - wtime ${adjTime} pack ${avePackTime} ave window ${aveWindow}`);
        log(`accum window time ${client.accumWindowTime} us ave window time total ${aveWindowTime} not in ops ${aveExtraWindowTime}; max ${client.maxWindowTime}`);
    }

    function manyMergeTrees() {
        const mergeTreeCount = 2000000;
        const a = <MergeTree[]>Array(mergeTreeCount);
        for (let i = 0; i < mergeTreeCount; i++) {
            a[i] = new MergeTree();
        }
        for (; ;) { }
    }

    function clientServer(startFile?: string, initRounds = 1000) {
        const clientCount = 5;
        const fileSegCount = 0;
        let initString = "";
        const asyncExec = false;
        const includeMarkers = false;

        if (!startFile) {
            initString = "don't ask for whom the bell tolls; it tolls for thee";
        }
        const server = new TestServer();
        server.insertTextLocal(0, initString);
        server.measureOps = true;
        if (startFile) {
            loadTextFromFile(startFile, server.mergeTree, fileSegCount);
        }

        const clients = new Array<TestClient>(clientCount);
        for (let i = 0; i < clientCount; i++) {
            clients[i] = new TestClient();
            clients[i].insertTextLocal(0, initString);
            clients[i].measureOps = true;
            if (startFile) {
                loadTextFromFile(startFile, clients[i].mergeTree, fileSegCount);
            }
            clients[i].startOrUpdateCollaboration(`Fred${i}`);
        }
        server.startOrUpdateCollaboration("theServer");
        server.addClients(clients);

        function checkTextMatch() {
            // log(`checking text match @${server.getCurrentSeq()}`);
            let clockStart = clock();
            const serverText = server.getText();
            getTextTime += elapsedMicroseconds(clockStart);
            getTextCalls++;
            if (checkIncr) {
                clockStart = clock();
                const serverIncrText = server.incrementalGetText();
                incrGetTextTime += elapsedMicroseconds(clockStart);
                incrGetTextCalls++;
                if (serverIncrText !== serverText) {
                    log("incr get text mismatch");
                }
            }
            for (const client of clients) {
                const cliText = client.getText();
                if (cliText !== serverText) {
                    log(`mismatch @${server.getCurrentSeq()} client @${client.getCurrentSeq()} id: ${client.getClientId()}`);
                    // log(serverText);
                    // log(cliText);
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
                        log(`text: ${diffPart.value} ${annotes}`);
                    }
                    log(server.mergeTree.toString());
                    log(client.mergeTree.toString());
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
            } else {
                countToApply = random.integer(Math.floor(2 * cliMsgCount / 3), cliMsgCount)(mt);
            }
            client.applyMessages(countToApply);
        }

        function serverProcessSome(_server: TestClient, all = false) {
            const svrMsgCount = _server.getMessageCount();
            let countToApply: number;
            if (all) {
                countToApply = svrMsgCount;
            } else {
                countToApply = random.integer(Math.floor(2 * svrMsgCount / 3), svrMsgCount)(mt);
            }
            return _server.applyMessages(countToApply);
        }

        function randomSpateOfInserts(client: TestClient, charIndex: number) {
            const textLen = randTextLength();
            const text = randomString(textLen, String.fromCharCode(zedCode + ((client.getCurrentSeq() + charIndex) % 50)));
            const preLen = client.getLength();
            const pos = random.integer(0, preLen)(mt);
            if (includeMarkers) {
                const insertMarkerOp = client.insertMarkerLocal(pos, ReferenceType.Tile,
                    { [reservedTileLabelsKey]: "test" });
                server.enqueueMsg(client.makeOpMessage(insertMarkerOp!, UnassignedSequenceNumber));
            }
            const insertTextOp = client.insertTextLocal(pos, text);
            server.enqueueMsg(client.makeOpMessage(insertTextOp!, UnassignedSequenceNumber));

            if (TestClient.useCheckQ) {
                client.enqueueTestString();
            }
        }

        function randomSpateOfRemoves(client: TestClient) {
            const dlen = randTextLength();
            const preLen = client.getLength();
            const pos = random.integer(0, preLen)(mt);
            const op = client.removeRangeLocal(pos, pos + dlen);
            server.enqueueMsg(client.makeOpMessage(op!));
            if (TestClient.useCheckQ) {
                client.enqueueTestString();
            }
        }

        function randomWordMove(client: TestClient) {
            const word1 = client.findRandomWord();
            if (word1) {
                const removeStart = word1.pos;
                const removeEnd = removeStart + word1.text.length;
                const removeOp = client.removeRangeLocal(removeStart, removeEnd);
                server.enqueueMsg(client.makeOpMessage(removeOp!, UnassignedSequenceNumber));
                if (TestClient.useCheckQ) {
                    client.enqueueTestString();
                }
                let word2 = client.findRandomWord();
                while (!word2) {
                    word2 = client.findRandomWord();
                }
                const pos = word2.pos + word2.text.length;
                const insertOp = client.insertTextLocal(pos, word1.text);
                server.enqueueMsg(client.makeOpMessage(insertOp!, UnassignedSequenceNumber));

                if (TestClient.useCheckQ) {
                    client.enqueueTestString();
                }
            }
        }

        let errorCount = 0;

        // function asyncRoundStep(asyncInfo: AsyncRoundInfo, roundCount: number) {
        //     if (asyncInfo.state === AsyncRoundState.Insert) {
        //         if (!asyncInfo.insertSegmentCount) {
        //             asyncInfo.insertSegmentCount = randSmallSegmentCount();
        //         }
        //         if (asyncInfo.clientIndex === clients.length) {
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
        //             if (asyncInfo.iterIndex === asyncInfo.insertSegmentCount) {
        //                 asyncInfo.clientIndex++;
        //                 asyncInfo.insertSegmentCount = undefined;
        //                 asyncInfo.iterIndex = 0;
        //             }
        //         }
        //     }
        //     if (asyncInfo.state === AsyncRoundState.Remove) {
        //         if (!asyncInfo.removeSegmentCount) {
        //             asyncInfo.removeSegmentCount = Math.floor(3 * asyncInfo.insertSegmentCount / 4);
        //             if (asyncInfo.removeSegmentCount < 1) {
        //                 asyncInfo.removeSegmentCount = 1;
        //             }
        //         }
        //         if (asyncInfo.clientIndex === clients.length) {
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
        //             if (asyncInfo.iterIndex === asyncInfo.removeSegmentCount) {
        //                 asyncInfo.clientIndex++;
        //                 asyncInfo.removeSegmentCount = undefined;
        //                 asyncInfo.iterIndex = 0;
        //             }
        //         }
        //     }
        //     if (asyncInfo.state === AsyncRoundState.Tail) {
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

        const extractSnapTime = 0;
        const extractSnapOps = 0;
        function finishRound(roundCount: number) {
            // Process remaining messages
            if (serverProcessSome(server, true)) {
                return;
            }
            for (const client of clients) {
                clientProcessSome(client, true);
            }

            /*
                        if (checkTextMatch()) {
                            log(`round: ${i}`);
                            break;
                        }
            */
            // log(server.getText());
            // log(server.mergeTree.toString());
            // log(server.mergeTree.getStats());
            if (0 === (roundCount % 100)) {
                const clockStart = clock();
                if (checkTextMatch()) {
                    log(`round: ${roundCount} BREAK`);
                    errorCount++;
                    return errorCount;
                }
                checkTime += elapsedMicroseconds(clockStart);
                if (verbose) {
                    log(`wall clock is ${((Date.now() - startTime) / 1000.0).toFixed(1)}`);
                }
                const stats = server.mergeTree.getStats();
                const liveAve = (stats.liveCount / stats.nodeCount).toFixed(1);
                const posLeaves = stats.leafCount - stats.removedLeafCount;
                let aveExtractSnapTime = "off";
                if (extractSnapOps > 0) {
                    aveExtractSnapTime = (extractSnapTime / extractSnapOps).toFixed(1);
                }
                log(`round: ${roundCount} seq ${server.seq} char count ${server.getLength()} height ${stats.maxHeight} lv ${stats.leafCount} rml ${stats.removedLeafCount} p ${posLeaves} nodes ${stats.nodeCount} pop ${liveAve} histo ${stats.histo}`);
                if (extractSnapOps > 0) {
                    aveExtractSnapTime = (extractSnapTime / extractSnapOps).toFixed(1);
                    log(`ave extract snap time ${aveExtractSnapTime}`);
                }
                reportTiming(server);
                reportTiming(clients[2]);
                let totalTime = server.accumTime + server.accumWindowTime;
                for (const client of clients) {
                    totalTime += (client.accumTime + client.localTime + client.accumWindowTime);
                }
                if (verbose) {
                    log(`total time ${(totalTime / 1000000.0).toFixed(1)} check time ${(checkTime / 1000000.0).toFixed(1)}`);
                }
                // log(server.getText());
                // log(server.mergeTree.toString());
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
                    } else {
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

        function asyncStep() {
            round(asyncRoundCount);
            asyncRoundCount++;
            if (asyncRoundCount < rounds) {
                setImmediate(asyncStep);
            }
        }

        if (asyncExec) {
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
            reportTiming(server);
            reportTiming(clients[2]);
            // log(server.getText());
            // log(server.mergeTree.toString());
        }
        return errorCount;
    }

    function randolicious() {
        const insertRounds = 40;
        const removeRounds = 32;

        const cliA = new TestClient();
        cliA.insertTextLocal(0, "a stitch in time saves nine");
        cliA.startOrUpdateCollaboration("FredA");
        const cliB = new TestClient();
        cliB.insertTextLocal(0, "a stitch in time saves nine");
        cliB.startOrUpdateCollaboration("FredB");
        function checkTextMatch(checkSeq: number) {
            let error = false;
            if (cliA.getCurrentSeq() !== checkSeq) {
                log(`client A has seq number ${cliA.getCurrentSeq()} mismatch with ${checkSeq}`);
                error = true;
            }
            if (cliB.getCurrentSeq() !== checkSeq) {
                log(`client B has seq number ${cliB.getCurrentSeq()} mismatch with ${checkSeq}`);
                error = true;
            }
            const aText = cliA.getText();
            const bText = cliB.getText();
            if (aText !== bText) {
                log(`mismatch @${checkSeq}:`);
                log(aText);
                log(bText);
                error = true;
            }
            if (!nodeOrdinalsHaveIntegrity(cliA.mergeTree.root)) {
                error = true;
            }
            if (!nodeOrdinalsHaveIntegrity(cliB.mergeTree.root)) {
                error = true;
            }
            return error;
        }

        let min = 0;
        cliA.accumTime = 0;
        cliB.accumTime = 0;

        function insertTest() {
            for (let i = 0; i < insertRounds; i++) {
                let insertCount = randSegmentCount();
                let sequenceNumber = cliA.getCurrentSeq() + 1;
                let firstSeq = sequenceNumber;
                const cliAMsgs: ISequencedDocumentMessage[] = [];
                for (let j = 0; j < insertCount; j++) {
                    const textLen = randTextLength();
                    const text = randomString(textLen, String.fromCharCode(zedCode + (sequenceNumber % 50)));
                    const preLen = cliA.getLength();
                    const pos = random.integer(0, preLen)(mt);

                    const msg = cliA.makeOpMessage(cliA.insertTextLocal(pos, text)!, sequenceNumber++);
                    msg.minimumSequenceNumber = min;
                    cliAMsgs.push(msg);
                    cliB.applyMsg(msg);
                }
                for (let k = firstSeq; k < sequenceNumber; k++) {
                    cliA.applyMsg(cliAMsgs.shift()!);
                }
                if (checkTextMatch(sequenceNumber - 1)) {
                    return true;
                }

                min = sequenceNumber - 1;

                insertCount = randSegmentCount();
                sequenceNumber = cliA.getCurrentSeq() + 1;
                firstSeq = sequenceNumber;
                const cliBMsgs: ISequencedDocumentMessage[] = [];
                for (let j = 0; j < insertCount; j++) {
                    const textLen = randTextLength();
                    const text = randomString(textLen, String.fromCharCode(zedCode + (sequenceNumber % 50)));
                    const preLen = cliB.getLength();
                    const pos = random.integer(0, preLen)(mt);
                    const msg = cliB.makeOpMessage(cliB.insertTextLocal(pos, text)!, sequenceNumber++);
                    msg.minimumSequenceNumber = min;
                    cliBMsgs.push(msg);
                    cliA.applyMsg(msg);
                }
                for (let k = firstSeq; k < sequenceNumber; k++) {
                    cliB.applyMsg(cliBMsgs.shift()!);
                }
                if (checkTextMatch(sequenceNumber - 1)) {
                    return true;
                }

                min = sequenceNumber - 1;
            }
            return false;
        }

        function removeTest() {
            for (let i = 0; i < removeRounds; i++) {
                let removeCount = randSegmentCount();
                let sequenceNumber = cliA.getCurrentSeq() + 1;
                let firstSeq = sequenceNumber;
                const cliAMsgs: ISequencedDocumentMessage[] = [];
                for (let j = 0; j < removeCount; j++) {
                    const dlen = randTextLength();
                    const preLen = cliA.getLength();
                    const pos = random.integer(0, preLen)(mt);
                    const msg = cliA.makeOpMessage(cliA.removeRangeLocal(pos, pos + dlen)!, sequenceNumber++);
                    msg.minimumSequenceNumber = min;
                    cliAMsgs.push(msg);
                    cliB.applyMsg(msg);
                }
                for (let k = firstSeq; k < sequenceNumber; k++) {
                    cliA.applyMsg(cliAMsgs.shift()!);
                }
                if (checkTextMatch(sequenceNumber - 1)) {
                    return true;
                }

                min = sequenceNumber - 1;

                removeCount = randSegmentCount();
                sequenceNumber = cliA.getCurrentSeq() + 1;
                firstSeq = sequenceNumber;
                const cliBMsgs: ISequencedDocumentMessage[] = [];
                for (let j = 0; j < removeCount; j++) {
                    const dlen = randTextLength();
                    const preLen = cliB.getLength() - 1;
                    const pos = random.integer(0, preLen)(mt);
                    const msg = cliB.makeOpMessage(cliB.removeRangeLocal(pos, pos + dlen)!, sequenceNumber++);
                    msg.minimumSequenceNumber = min;
                    cliBMsgs.push(msg);
                    cliA.applyMsg(msg);
                }
                for (let k = firstSeq; k < sequenceNumber; k++) {
                    cliB.applyMsg(cliBMsgs.shift()!);
                }
                if (checkTextMatch(sequenceNumber - 1)) {
                    return true;
                }

                min = sequenceNumber - 1;
            }
            return false;
        }
        let errorCount = 0;
        if (insertTest()) {
            log(cliA.mergeTree.toString());
            log(cliB.mergeTree.toString());
            errorCount++;
        } else {
            log(`sequence number: ${cliA.getCurrentSeq()} min: ${cliA.getCollabWindow().minSeq}`);
            //            log(cliA.mergeTree.toString());

            log(`testing remove at ${cliA.getCurrentSeq()} and ${cliB.getCurrentSeq()}`);
            if (removeTest()) {
                log(cliA.mergeTree.toString());
                log(cliB.mergeTree.toString());
                errorCount++;
            }
        }
        log(`sequence number: ${cliA.getCurrentSeq()} min: ${cliA.getCollabWindow().minSeq}`);
        //                log(cliA.mergeTree.toString());
        // log(cliB.mergeTree.toString());
        // log(cliA.getText());
        const aveWindow = ((minSegCount + maxSegCount) / 2).toFixed(1);
        const aveTime = (cliA.accumTime / cliA.accumOps).toFixed(3);
        const aveWindowTime = (cliA.accumWindowTime / cliA.accumOps).toFixed(3);
        if (verbose) {
            log(`accum time ${cliA.accumTime} us ops: ${cliA.accumOps} ave window ${aveWindow} ave time ${aveTime}`);
            log(`accum window time ${cliA.accumWindowTime} us ave window time ${aveWindowTime}; max ${cliA.maxWindowTime}`);
        }
        // log(cliB.getText());
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
            log(cli.mergeTree.toString());
        }
        cli.insertTextRemote(0, "fat ", undefined, 2, 0, "2");
        if (verbose) {
            log(cli.mergeTree.toString());
        }
        cli.insertTextLocal(5, "cat ");
        if (verbose) {
            log(cli.mergeTree.toString());
        }
        if (verbose) {
            for (let i = 0; i < 4; i++) {
                for (let j = 0; j < 3; j++) {
                    log(cli.relText(i, j));
                }
            }
        }
        cli.mergeTree.ackPendingSegment(createLocalOpArgs(MergeTreeDeltaType.INSERT, 3));
        if (verbose) {
            log(cli.mergeTree.toString());
            for (let clientId = 0; clientId < 4; clientId++) {
                for (let refSeq = 0; refSeq < 4; refSeq++) {
                    log(cli.relText(clientId, refSeq));
                }
            }
        }
        cli.insertMarkerRemote(0, { refType: ReferenceType.Tile },
            { [reservedTileLabelsKey]: ["peach"] },
            5, 0, "2");
        cli.insertTextRemote(6, "very ", undefined, 6, 2, "2");
        if (verbose) {
            log(cli.mergeTree.toString());
            for (let clientId = 0; clientId < 4; clientId++) {
                for (let refSeq = 0; refSeq < 7; refSeq++) {
                    log(cli.relText(clientId, refSeq));
                }
            }
        }
        const segs = <SharedStringJSONSegment[]> new SnapshotLegacy(cli.mergeTree, DebugLogger.create("fluid:snapshot")).extractSync();
        if (verbose) {
            for (const seg of segs) {
                log(`${specToSegment(seg)}`);
            }
        }
        cli = new TestClient();
        cli.insertTextLocal(0, " old sock!");
        cli.startOrUpdateCollaboration("Fred2");
        for (const cname of clientNames) {
            cli.addLongClientId(cname);
        }
        cli.insertTextRemote(0, "abcde", undefined, 1, 0, "2");
        cli.insertTextRemote(0, "yyy", undefined, 2, 0, "1");
        cli.insertTextRemote(2, "zzz", undefined, 3, 1, "3");
        cli.insertTextRemote(1, "EAGLE", undefined, 4, 1, "4");
        cli.insertTextRemote(4, "HAS", undefined, 5, 1, "5");
        cli.insertTextLocal(19, " LANDED");
        cli.insertTextRemote(0, "yowza: ", undefined, 6, 4, "2");
        cli.mergeTree.ackPendingSegment(createLocalOpArgs(MergeTreeDeltaType.INSERT, 7));
        if (verbose) {
            log(cli.mergeTree.toString());
            for (let clientId = 0; clientId < 6; clientId++) {
                for (let refSeq = 0; refSeq < 8; refSeq++) {
                    log(cli.relText(clientId, refSeq));
                }
            }
        }
        cli.applyMsg(cli.makeOpMessage(createRemoveRangeOp(3, 5), 8, 6, "1"));
        if (verbose) {
            log(cli.mergeTree.toString());
            for (let clientId = 0; clientId < 6; clientId++) {
                for (let refSeq = 0; refSeq < 9; refSeq++) {
                    log(cli.relText(clientId, refSeq));
                }
            }
        }
        cli = new TestClient();
        cli.insertTextLocal(0, "abcdefgh");
        cli.startOrUpdateCollaboration("Fred3");
        for (const cname of clientNames) {
            cli.addLongClientId(cname);
        }
        cli.applyMsg(cli.makeOpMessage(createRemoveRangeOp(1, 3), 1, 0, "3"));
        if (verbose) {
            log(cli.mergeTree.toString());
        }
        cli.insertTextRemote(2, "zzz", undefined, 2, 0, "2");
        if (verbose) {
            log(cli.mergeTree.toString());
        }
        cli.insertTextRemote(9, " chaser", undefined, 3, 2, "3");
        cli.removeRangeLocal(12, 14);
        cli.mergeTree.ackPendingSegment(createLocalOpArgs(MergeTreeDeltaType.REMOVE, 4));
        if (verbose) {
            log(cli.mergeTree.toString());
            for (let clientId = 0; clientId < 4; clientId++) {
                for (let refSeq = 0; refSeq < 5; refSeq++) {
                    log(cli.relText(clientId, refSeq));
                }
            }
        }
        cli.insertTextLocal(14, "*yolumba*");
        cli.insertTextLocal(17, "-zanzibar-");
        cli.mergeTree.ackPendingSegment(createLocalOpArgs(MergeTreeDeltaType.INSERT, 5));
        cli.insertTextRemote(2, "(aaa)", undefined, 6, 4, "2");
        cli.mergeTree.ackPendingSegment(createLocalOpArgs(MergeTreeDeltaType.INSERT, 7));
        if (verbose) {
            log(cli.mergeTree.toString());
            for (let clientId = 0; clientId < 4; clientId++) {
                for (let refSeq = 0; refSeq < 8; refSeq++) {
                    log(cli.relText(clientId, refSeq));
                }
            }
        }
        /*
        cli.removeRangeLocal(3,8);
        cli.removeRangeLocal(5,7);
        cli.ackPendingSegment(8);
        cli.ackPendingSegment(9);
        */
        cli.applyMsg(cli.makeOpMessage(createRemoveRangeOp(3, 8), 8, 7, "2"));
        cli.applyMsg(cli.makeOpMessage(createRemoveRangeOp(5, 7), 9, 7, "2"));
        if (verbose) {
            log(cli.mergeTree.toString());
            for (let clientId = 0; clientId < 4; clientId++) {
                for (let refSeq = 0; refSeq < 10; refSeq++) {
                    log(cli.relText(clientId, refSeq));
                }
            }
        }
        const removeOp = cli.removeRangeLocal(3, 5);
        cli.applyMsg(cli.makeOpMessage(createRemoveRangeOp(3, 6), 10, 9, "2"));
        cli.applyMsg(cli.makeOpMessage(removeOp!, 11));
        if (verbose) {
            log(cli.mergeTree.toString());
            for (let clientId = 0; clientId < 4; clientId++) {
                for (let refSeq = 0; refSeq < 12; refSeq++) {
                    log(cli.relText(clientId, refSeq));
                }
            }
        }
    }
    return {
        firstTest,
        randolicious,
        clientServer,
        manyMergeTrees,
    };
}

function compareProxStrings(a: ProxString<number>, b: ProxString<number>) {
    const ascore = (a.invDistance * 200) + a.val;
    const bscore = (b.invDistance * 200) + b.val;
    return bscore - ascore;
}

const createLocalOpArgs = (type: MergeTreeDeltaType, sequenceNumber: number): IMergeTreeDeltaOpArgs => ({
    op: { type } as IMergeTreeOp,
    sequencedMessage: {
        sequenceNumber,
    } as ISequencedDocumentMessage,
});

function shuffle<T>(a: T[]) {
    let currentIndex = a.length;
    let temp: T;
    let randomIndex: number;

    // While there remain elements to shuffle...
    while (0 !== currentIndex) {
        // Pick a remaining element...
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;

        // And swap it with the current element.
        temp = a[currentIndex];
        a[currentIndex] = a[randomIndex];
        a[randomIndex] = temp;
    }

    return a;
}

function tst() {
    const tree = new TST<boolean>();
    const entries = ["giraffe", "hut", "aardvark", "gold", "hover", "yurt", "hot", "antelope", "gift", "banana"];
    for (const entry of entries) {
        tree.put(entry, true);
    }
    for (const entry of entries) {
        log(`get ${entry}: ${tree.get(entry)}`);
    }
    const p1 = tree.keysWithPrefix("g");
    const p2 = tree.keysWithPrefix("gi");
    log(p1);
    log(p2);
    const p3 = tree.neighbors("hat");
    log(p3);
    const ntree = new TST<number>();
    const filename = path.join(__dirname, "../../public/literature/dict.txt");
    const content = fs.readFileSync(filename, "utf8");
    const splitContent = content.split(/\r\n|\n/g);
    let corpusFilename = path.join(__dirname, "../../../public/literature/pp.txt");
    let corpusContent = fs.readFileSync(corpusFilename, "utf8");
    const corpusTree = new TST<number>();
    function addCorpus(_corpusContent: string, _corpusTree: TST<number>) {
        let count = 0;
        const re = /\b\w+\b/g;
        let result: RegExpExecArray | null;
        do {
            result = re.exec(_corpusContent);
            if (result) {
                const candidate = result[0];
                count++;
                const val = _corpusTree.get(candidate);
                if (val !== undefined) {
                    _corpusTree.put(candidate, val + 1);
                } else {
                    _corpusTree.put(candidate, 1);
                }
            }
        } while (result);
        return count;
    }
    const clockStart = clock();
    addCorpus(corpusContent, corpusTree);
    corpusFilename = path.join(__dirname, "../../public/literature/shakespeare.txt");
    corpusContent = fs.readFileSync(corpusFilename, "utf8");
    addCorpus(corpusContent, corpusTree);
    const a = shuffle(splitContent);
    for (const entry of a) {
        const freq = corpusTree.get(entry);
        if (freq !== undefined) {
            ntree.put(entry, freq);
        } else {
            ntree.put(entry, 1);
        }
    }
    log(`size: ${ntree.size()}; random insert takes ${clockStart.trace().duration}ms`);
    for (const entry of a) {
        if (!ntree.get(entry)) {
            log(`biff ${entry}`);
        }
    }
    let p4 = ntree.neighbors("het").sort(compareProxStrings);
    log(p4);
    p4 = ntree.neighbors("peech").sort(compareProxStrings);
    log(p4);
    p4 = ntree.neighbors("tihs").sort(compareProxStrings);
    log(p4);
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
                client.insertMarkerLocal(this.pos, ReferenceType.Tile,
                    {
                        [reservedTileLabelsKey]: [docNode.name],
                    },
                );
                this.pos++;
            } else {
                // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
                const trid = docNode.name + this.ids[docNode.name].toString();
                docNode.id = trid;
                id = this.ids[docNode.name]++;
                const props = {
                    [reservedMarkerIdKey]: trid,
                    [reservedRangeLabelsKey]: [docNode.name],
                };
                let behaviors = ReferenceType.NestBegin;
                if (docNode.name === "row") {
                    props[reservedTileLabelsKey] = ["pg"];
                    behaviors |= ReferenceType.Tile;
                }

                client.insertMarkerLocal(this.pos, behaviors, props);
                this.pos++;
            }
            for (const child of docNode.children) {
                this.addToMergeTree(client, child);
            }
            if (docNode.name !== "pg") {
                const etrid = `end-${docNode.name}${id?.toString()}`;
                client.insertMarkerLocal(this.pos, ReferenceType.NestEnd,
                    {
                        [reservedMarkerIdKey]: etrid,
                        [reservedRangeLabelsKey]: [docNode.name],
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
            box: new Stack<string>(),
            row: new Stack<string>(),
        };

        function printStack(stack: Stack<string>) {
            // eslint-disable-next-line @typescript-eslint/no-for-in-array, guard-for-in, no-restricted-syntax
            for (const item in stack.items) {
                log(item);
            }
        }

        function printStacks() {
            for (const name of ["box", "row"]) {
                log(`${name}:`);
                printStack(stacks[name]);
            }
        }

        function checkTreeStackEmpty(treeStack: Stack<string>) {
            if (!treeStack.empty()) {
                errorCount++;
                log("mismatch: client stack empty; tree stack not");
            }
        }

        const checkNodeStacks = (docNode: DocumentNode) => {
            if (typeof docNode === "string") {
                const text = docNode;
                const epos = pos + text.length;
                if (verbose) {
                    log(`stacks for [${pos}, ${epos}): ${text}`);
                    printStacks();
                }
                const cliStacks = client.getStackContext(pos, ["box", "row"]);
                for (const name of ["box", "row"]) {
                    const cliStack = cliStacks[name];
                    const treeStack = <Stack<string>>stacks[name];
                    if (cliStack) {
                        const len = cliStack.items.length;
                        if (len > 0) {
                            if (len !== treeStack.items.length) {
                                log(`stack length mismatch cli ${len} tree ${treeStack.items.length}`);
                                errorCount++;
                            }
                            for (let i = 0; i < len; i++) {
                                const cliMarkerId = (cliStack.items[i] as Marker).getId();
                                const treeMarkerId = treeStack.items[i];
                                if (cliMarkerId !== treeMarkerId) {
                                    errorCount++;
                                    log(`mismatch index ${i}: ${cliMarkerId} !== ${treeMarkerId} pos ${pos} text ${text}`);
                                    printStack(treeStack);
                                    log(client.mergeTree.toString());
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

        // log(client.mergeTree.toString());
        for (const rootChild of this.children) {
            if (prevPos >= 0) {
                if ((typeof prevChild !== "string") && (prevChild?.name === "row")) {
                    const id = prevChild.id;
                    const endId = `end-${id}`;
                    const endRowMarker = <Marker>client.getMarkerFromId(endId);
                    const endRowPos = client.getPosition(endRowMarker);
                    prevPos = endRowPos;
                }
                const tilePos = client.findTile(prevPos + 1, "pg", false);
                if (tilePos) {
                    if (tilePos.pos !== pos) {
                        errorCount++;
                        log(`next tile ${tilePos.tile} found from pos ${prevPos} at ${tilePos.pos} compare to ${pos}`);
                    }
                }
            }
            if (verbose) {
                log(`next child ${pos} with name ${docNodeToString(rootChild)}`);
            }
            prevPos = pos;
            prevChild = rootChild;
            // printStacks();
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

    static generateContent(rowProbability: number) {
        let _rowProbability = rowProbability;
        const items = <DocumentNode[]>[];
        const docLen = DocumentTree.randPack.randInteger(7, 25);
        for (let i = 0; i < docLen; i++) {
            const rowThreshold = _rowProbability * 1000;
            const selector = DocumentTree.randPack.randInteger(1, 1000);
            if (selector >= rowThreshold) {
                const pg = DocumentTree.generateParagraph();
                items.push(pg);
            } else {
                _rowProbability /= 2;
                if (_rowProbability < 0.08) {
                    _rowProbability = 0;
                }
                const row = DocumentTree.generateRow(_rowProbability);
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

function findReplacePerf(filename: string) {
    const client = new TestClient();
    loadTextFromFile(filename, client.mergeTree);

    const clockStart = clock();

    let cFetches = 0;
    let cReplaces = 0;
    for (let pos = 0; pos < client.getLength();) {
        const curSegOff = client.getContainingSegment(pos);
        cFetches++;

        const curSeg = curSegOff.segment;
        const textSeg = <TextSegment>curSeg;
        if (textSeg !== null) {
            const text = textSeg.text;
            const i = text.indexOf("the");
            if (i >= 0) {
                client.mergeTree.markRangeRemoved(
                    pos + i,
                    pos + i + 3,
                    UniversalSequenceNumber,
                    client.getClientId(),
                    1,
                    false,
                    undefined as any);
                insertText(
                    client.mergeTree,
                    pos + i,
                    UniversalSequenceNumber,
                    client.getClientId(),
                    1,
                    "teh",
                    undefined,
                    undefined);
                pos = pos + i + 3;
                cReplaces++;
            } else {
                pos += (curSeg!.cachedLength - curSegOff!.offset!);
            }
        }
    }

    const elapsed = elapsedMicroseconds(clockStart);
    log(`${cFetches} fetches and ${cReplaces} replaces took ${elapsed} microseconds`);
}

const testTST = false;
if (testTST) {
    tst();
}

const baseDir = "../../src/test/literature";
const testTimeout = 60000;

describe("Routerlicious", () => {
    describe("merge-tree", () => {
        beforeEach(() => {
            logLines = [];
        });
        it("firstTest", () => {
            const testPack = TestPack(true);
            testPack.firstTest();
        });

        it("hierarchy", () => {
            assert(DocumentTree.test1() === 0, logLines.join("\n"));
        }).timeout(testTimeout);

        it("randolicious", () => {
            const testPack = TestPack(false);
            assert(testPack.randolicious() === 0, logLines.join("\n"));
        }).timeout(testTimeout);

        it("mergeTreeCheckedTest", () => {
            assert(mergeTreeCheckedTest() === 0, logLines.join("\n"));
        }).timeout(testTimeout);

        it("beastTest", () => {
            const testPack = TestPack(false);
            const filename = path.join(__dirname, baseDir, "pp.txt");
            assert(testPack.clientServer(filename, 250) === 0, logLines.join("\n"));
        }).timeout(testTimeout);

        it("findReplPerf", () => {
            const filename = path.join(__dirname, baseDir, "pp10.txt");
            findReplacePerf(filename);
        }).timeout(testTimeout);
    });
});
