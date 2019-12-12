/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { DebugLogger } from "@microsoft/fluid-core-utils";
import { ISequencedDocumentMessage } from "@microsoft/fluid-protocol-definitions";
import * as assert from "assert";
// tslint:disable-next-line:no-implicit-dependencies
import * as JsDiff from "diff";
import * as fs from "fs";
import * as path from "path";
// tslint:disable-next-line:no-implicit-dependencies
import * as random from "random-js";
import * as MergeTree from "../";
import * as Base from "../base";
import { LocalClientId, UnassignedSequenceNumber, UniversalSequenceNumber } from "../constants";
import { createRemoveRangeOp } from "../opBuilder";
import { TextSegment } from "../textSegment";
import { specToSegment, TestClient } from "./testClient";
import { TestServer } from "./testServer";
import { insertText, loadTextFromFile, nodeOrdinalsHaveIntegrity } from "./testUtils";

// tslint:disable
let logLines: string[];
function log(message: any) {
    if (logLines) {
        logLines.push(message.toString());
    }
}

function compareStrings(a: string, b: string) {
    return a.localeCompare(b);
}

function compareNumbers(a: number, b: number) {
    return a - b;
}

function printStringProperty(p: Base.Property<string, string>) {
    log(`[${p.key}, ${p.data}]`);
    return true;
}

function printStringNumProperty(p: Base.Property<string, number>) {
    log(`[${p.key}, ${p.data}]`);
    return true;
}

export function simpleTest() {
    let a = [
        "Aardvark", "cute",
        "Baboon", "big",
        "Chameleon", "colorful",
        "Dingo", "wild"
    ];

    let beast = new MergeTree.RedBlackTree<string, string>(compareStrings);
    for (let i = 0; i < a.length; i += 2) {
        beast.put(a[i], a[i + 1]);
    }
    beast.map(printStringProperty);
    log("Map B D");
    log("Map Aardvark Dingo");
    log("Map Baboon Chameleon");
    printStringProperty(beast.get("Chameleon"));
}

function clock() {
    return process.hrtime();
}

function took(desc: string, start: [number, number]) {
    // let end: number[] = process.hrtime(start);
    let duration = elapsedMilliseconds(start);
    log(`${desc} took ${duration} ms`);
    return duration;
}

function elapsedMilliseconds(start: [number, number]) {
    let end: number[] = process.hrtime(start);
    let duration = Math.round((end[0] * 1000) + (end[1] / 1000000));
    return duration;
}

function elapsedMicroseconds(start: [number, number]) {
    let end: number[] = process.hrtime(start);
    let duration = Math.round((end[0] * 1000000) + (end[1] / 1000));
    return duration;
}

export function integerTest1() {
    let mt = random.engines.mt19937();
    mt.seedWithArray([0xdeadbeef, 0xfeedbed]);
    const imin = 0;
    const imax = 10000000;
    const intCount = 1100000;
    let distribution = random.integer(imin, imax);
    let beast = new MergeTree.RedBlackTree<number, number>(compareNumbers);

    function randInt() {
        return distribution(mt);
    }
    let pos = new Array<number>(intCount);
    let i = 0;
    let redo = false;
    function onConflict(key: number, currentKey: number) {
        redo = true;
        return { data: currentKey};
    }
    let conflictCount = 0;
    let start = clock();
    while (i < intCount) {
        pos[i] = randInt();
        beast.put(pos[i], i, onConflict);
        if (!redo) {
            i++;
        }
        else {
            conflictCount++;
            redo = false;
        }
    }
    took("test gen", start);
    let errorCount = 0;
    start = clock();
    for (let j = 0, len = pos.length; j < len; j++) {
        let cp = pos[j];
        /* let prop = */ beast.get(cp);
    }
    let getdur = took("get all keys", start);
    log(`cost per get is ${(1000.0 * getdur / intCount).toFixed(3)} us`);
    beast.diag();
    log(`duplicates ${conflictCount}, errors ${errorCount}`);
    return errorCount;
}

export function fileTest1() {
    let content = fs.readFileSync(path.join(__dirname, "../../src/test/literature/shakespeare.txt"), "utf8");
    let a = content.split('\n');
    let iterCount = a.length >> 2;
    const removeCount = 10;
    log("len: " + a.length);

    for (let k = 0; k < iterCount; k++) {
        let beast = new MergeTree.RedBlackTree<string, number>(compareStrings);
        let linearBeast = MergeTree.LinearDictionary<string, number>(compareStrings);
        for (let i = 0, len = a.length; i < len; i++) {
            a[i] = a[i].trim();
            if (a[i].length > 0) {
                beast.put(a[i], i);
                linearBeast.put(a[i], i);
            }
        }
        if (k == 0) {
            beast.map(printStringNumProperty);
            log("BTREE...");
        }
        let removedAnimals: string[] = [];
        for (let j = 0; j < removeCount; j++) {
            let removeIndex = Math.floor(Math.random() * a.length);
            log(`Removing: ${a[removeIndex]} at ${removeIndex}`);
            beast.remove(a[removeIndex]);
            linearBeast.remove(a[removeIndex]);
            removedAnimals.push(a[removeIndex]);
        }
        for (let animal of a) {
            if ((animal.length > 0) && (removedAnimals.indexOf(animal) < 0)) {
                let prop = beast.get(animal);
                let linProp = linearBeast.get(animal);
                //log(`Trying key ${animal}`);
                if (prop) {
                    //printStringNumProperty(prop);
                    if ((linProp === undefined) || (prop.key != linProp.key) || (prop.data != linProp.data)) {
                        log(`Linear BST does not match RB BST at key ${animal}`);
                    }
                }
                else {
                    log("hmm...bad key: " + animal);
                }
            }
        }
        beast.diag();
        linearBeast.diag();
    }
}

function printTextSegment(textSegment: MergeTree.ISegment, pos: number) {
    log(textSegment.toString());
    log(`at [${pos}, ${pos + textSegment.cachedLength})`);
    return true;
}

export function makeTextSegment(text: string): MergeTree.IMergeNode {
    return new MergeTree.TextSegment(text);
}

function makeCollabTextSegment(text: string) {
    return new MergeTree.TextSegment(text);
}

function editFlat(source: string, s: number, dl: number, nt = "") {
    return source.substring(0, s) + nt + source.substring(s + dl, source.length);
}

let accumTime = 0;

function checkInsertMergeTree(mergeTree: MergeTree.MergeTree, pos: number, textSegment: MergeTree.TextSegment,
    verbose = false) {
    let checkText = new MergeTree.MergeTreeTextHelper(mergeTree).getText(UniversalSequenceNumber, LocalClientId);
    checkText = editFlat(checkText, pos, 0, textSegment.text);
    let clockStart = clock();
    insertText(mergeTree, pos, UniversalSequenceNumber, LocalClientId, UniversalSequenceNumber,
        textSegment.text, undefined, undefined);
    accumTime += elapsedMicroseconds(clockStart);
    let updatedText = new MergeTree.MergeTreeTextHelper(mergeTree).getText(UniversalSequenceNumber, LocalClientId);
    let result = (checkText == updatedText);
    if ((!result) && verbose) {
        log(`mismatch(o): ${checkText}`);
        log(`mismatch(u): ${updatedText}`);
    }
    return result;
}

function checkRemoveMergeTree(mergeTree: MergeTree.MergeTree, start: number, end: number, verbose = false) {
    const helper = new MergeTree.MergeTreeTextHelper(mergeTree);
    let origText = helper.getText(UniversalSequenceNumber, LocalClientId);
    let checkText = editFlat(origText, start, end - start);
    let clockStart = clock();
    mergeTree.removeRange(start, end, UniversalSequenceNumber, LocalClientId);
    accumTime += elapsedMicroseconds(clockStart);
    let updatedText = helper.getText(UniversalSequenceNumber, LocalClientId);
    let result = (checkText == updatedText);
    if ((!result) && verbose) {
        log(`mismatch(o): ${origText}`);
        log(`mismatch(c): ${checkText}`);
        log(`mismatch(u): ${updatedText}`);
    }
    return result;
}

function checkMarkRemoveMergeTree(mergeTree: MergeTree.MergeTree, start: number, end: number, verbose = false) {
    const helper = new MergeTree.MergeTreeTextHelper(mergeTree);
    let origText = helper.getText(UniversalSequenceNumber, LocalClientId);
    let checkText = editFlat(origText, start, end - start);
    let clockStart = clock();
    mergeTree.markRangeRemoved(start, end, UniversalSequenceNumber, LocalClientId, UniversalSequenceNumber, false, undefined);
    accumTime += elapsedMicroseconds(clockStart);
    let updatedText = helper.getText(UniversalSequenceNumber, LocalClientId);
    let result = (checkText == updatedText);
    if ((!result) && verbose) {
        log(`mismatch(o): ${origText}`);
        log(`mismatch(c): ${checkText}`);
        log(`mismatch(u): ${updatedText}`);
    }
    return result;
}

export function mergeTreeTest1() {
    let mergeTree = new MergeTree.MergeTree();
    mergeTree.insertSegments(0, [TextSegment.make("the cat is on the mat")], UniversalSequenceNumber, LocalClientId, UniversalSequenceNumber, undefined);
    mergeTree.map({ leaf: printTextSegment }, UniversalSequenceNumber, LocalClientId);
    let fuzzySeg = makeCollabTextSegment("fuzzy, fuzzy ");
    checkInsertMergeTree(mergeTree, 4, fuzzySeg);
    fuzzySeg = makeCollabTextSegment("fuzzy, fuzzy ");
    checkInsertMergeTree(mergeTree, 4, fuzzySeg);
    checkMarkRemoveMergeTree(mergeTree, 4, 13);
    //checkRemoveSegTree(segTree, 4, 13);
    checkInsertMergeTree(mergeTree, 4, makeCollabTextSegment("fi"));
    mergeTree.map({ leaf: printTextSegment }, UniversalSequenceNumber, LocalClientId);
    let segoff = mergeTree.getContainingSegment(4, UniversalSequenceNumber, LocalClientId);
    log(mergeTree.getPosition(segoff.segment, UniversalSequenceNumber, LocalClientId));
    log(new MergeTree.MergeTreeTextHelper(mergeTree).getText(UniversalSequenceNumber, LocalClientId));
    log(mergeTree.toString());
    TestPack().firstTest();
}

export function mergeTreeLargeTest() {
    let mergeTree = new MergeTree.MergeTree();
    mergeTree.insertSegments(0, [TextSegment.make("the cat is on the mat")], UniversalSequenceNumber, LocalClientId, UniversalSequenceNumber, undefined);
    const insertCount = 1000000;
    const removeCount = 980000;
    let mt = random.engines.mt19937();
    mt.seedWithArray([0xdeadbeef, 0xfeedbed]);
    const imin = 1;
    const imax = 9;
    let distribution = random.integer(imin, imax);
    function randInt() {
        return distribution(mt);
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
    for (let i = 0; i < insertCount; i++) {
        let slen = randInt();
        let s = randomString(slen, String.fromCharCode(48 + slen));
        let preLen = mergeTree.getLength(UniversalSequenceNumber, LocalClientId);
        let pos = random.integer(0, preLen)(mt);
        let clockStart = clock();
        insertText(mergeTree, pos, UniversalSequenceNumber, LocalClientId, UniversalSequenceNumber,
            s, undefined, undefined);
        accumTime += elapsedMicroseconds(clockStart);
        if ((i > 0) && (0 == (i % 50000))) {
            let perIter = (accumTime / (i + 1)).toFixed(3);
            treeCount++;
            accumTreeSize += mergeTree.getLength(UniversalSequenceNumber, LocalClientId);
            let averageTreeSize = (accumTreeSize / treeCount).toFixed(3);
            log(`i: ${i} time: ${accumTime}us which is average ${perIter} per insert with average tree size ${averageTreeSize}`);
        }
    }
    log(process.memoryUsage().heapUsed);
    accumTime = 0;
    accumTreeSize = 0;
    treeCount = 0;
    for (let i = 0; i < removeCount; i++) {
        let dlen = randInt();
        let preLen = mergeTree.getLength(UniversalSequenceNumber, LocalClientId);
        let pos = random.integer(0, preLen)(mt);
        // log(itree.toString());
        let clockStart = clock();
        mergeTree.removeRange(pos, pos + dlen, UniversalSequenceNumber, LocalClientId);
        accumTime += elapsedMicroseconds(clockStart);

        if ((i > 0) && (0 == (i % 50000))) {
            let perIter = (accumTime / (i + 1)).toFixed(3);
            treeCount++;
            accumTreeSize += mergeTree.getLength(UniversalSequenceNumber, LocalClientId);
            let averageTreeSize = (accumTreeSize / treeCount).toFixed(3);
            log(`i: ${i} time: ${accumTime}us which is average ${perIter} per del with average tree size ${averageTreeSize}`);
        }
    }
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
            log(`i: ${i} preLen ${preLen} pos: ${pos} slen: ${slen} s: ${s} itree len: ${mergeTree.getLength(UniversalSequenceNumber, LocalClientId)}`);
            log(mergeTree.toString());
            errorCount++;
            break;
        }
        if ((i > 0) && (0 == (i % 1000))) {
            let perIter = (accumTime / (i + 1)).toFixed(3);
            treeCount++;
            accumTreeSize += mergeTree.getLength(UniversalSequenceNumber, LocalClientId);
            let averageTreeSize = (accumTreeSize / treeCount).toFixed(3);
            log(`i: ${i} time: ${accumTime}us which is average ${perIter} per insert with average tree size ${averageTreeSize}`);
        }
    }
    accumTime = 0;
    accumTreeSize = 0;
    treeCount = 0;
    for (let i = 0; i < largeRemoveCount; i++) {
        let dlen = randLargeInt();
        let preLen = mergeTree.getLength(UniversalSequenceNumber, LocalClientId);
        let pos = random.integer(0, preLen)(mt);
        // log(itree.toString());
        if (!checkRemoveMergeTree(mergeTree, pos, pos + dlen, true)) {
            log(`i: ${i} preLen ${preLen} pos: ${pos} dlen: ${dlen} itree len: ${mergeTree.getLength(UniversalSequenceNumber, LocalClientId)}`);
            log(mergeTree.toString());
            break;
        }
        if ((i > 0) && (0 == (i % 10))) {
            let perIter = (accumTime / (i + 1)).toFixed(3);
            treeCount++;
            accumTreeSize += mergeTree.getLength(UniversalSequenceNumber, LocalClientId);
            let averageTreeSize = (accumTreeSize / treeCount).toFixed(3);
            log(`i: ${i} time: ${accumTime}us which is average ${perIter} per large del with average tree size ${averageTreeSize}`);
        }
    }
    accumTime = 0;
    accumTreeSize = 0;
    treeCount = 0;
    for (let i = 0; i < removeCount; i++) {
        let dlen = randInt();
        let preLen = mergeTree.getLength(UniversalSequenceNumber, LocalClientId);
        let pos = random.integer(0, preLen)(mt);
        // log(itree.toString());
        if (i & 1) {
            if (!checkMarkRemoveMergeTree(mergeTree, pos, pos + dlen, true)) {
                log(`mr i: ${i} preLen ${preLen} pos: ${pos} dlen: ${dlen} itree len: ${mergeTree.getLength(UniversalSequenceNumber, LocalClientId)}`);
                log(mergeTree.toString());
                errorCount++;
                break;
            }
        }
        else {
            if (!checkRemoveMergeTree(mergeTree, pos, pos + dlen, true)) {
                log(`i: ${i} preLen ${preLen} pos: ${pos} dlen: ${dlen} itree len: ${mergeTree.getLength(UniversalSequenceNumber, LocalClientId)}`);
                log(mergeTree.toString());
                errorCount++;
                break;
            }

        }
        if ((i > 0) && (0 == (i % 1000))) {
            let perIter = (accumTime / (i + 1)).toFixed(3);
            treeCount++;
            accumTreeSize += mergeTree.getLength(UniversalSequenceNumber, LocalClientId);
            let averageTreeSize = (accumTreeSize / treeCount).toFixed(3);
            log(`i: ${i} time: ${accumTime}us which is average ${perIter} per del with average tree size ${averageTreeSize}`);
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
            log(`i: ${i} preLen ${preLen} pos: ${pos} slen: ${slen} s: ${s} itree len: ${mergeTree.getLength(UniversalSequenceNumber, LocalClientId)}`);
            log(mergeTree.toString());
            errorCount++;
            break;
        }
        if ((i > 0) && (0 == (i % 1000))) {
            let perIter = (accumTime / (i + 1)).toFixed(3);
            treeCount++;
            accumTreeSize += mergeTree.getLength(UniversalSequenceNumber, LocalClientId);
            let averageTreeSize = (accumTreeSize / treeCount).toFixed(3);
            log(`i: ${i} time: ${accumTime}us which is average ${perIter} per insert with average tree size ${averageTreeSize}`);
        }
    }
    accumTime = 0;
    accumTreeSize = 0;
    treeCount = 0;
    for (let i = 0; i < removeCount; i++) {
        let dlen = randInt();
        let preLen = mergeTree.getLength(UniversalSequenceNumber, LocalClientId);
        let pos = random.integer(0, preLen)(mt);
        // log(itree.toString());
        if (i & 1) {
            if (!checkMarkRemoveMergeTree(mergeTree, pos, pos + dlen, true)) {
                log(`i: ${i} preLen ${preLen} pos: ${pos} dlen: ${dlen} itree len: ${mergeTree.getLength(UniversalSequenceNumber, LocalClientId)}`);
                log(mergeTree.toString());
                errorCount++;
                break;
            }
        }
        else {
            if (!checkRemoveMergeTree(mergeTree, pos, pos + dlen, true)) {
                log(`i: ${i} preLen ${preLen} pos: ${pos} dlen: ${dlen} itree len: ${mergeTree.getLength(UniversalSequenceNumber, LocalClientId)}`);
                log(mergeTree.toString());
                errorCount++;
                break;
            }

        }
        if ((i > 0) && (0 == (i % 1000))) {
            let perIter = (accumTime / (i + 1)).toFixed(3);
            treeCount++;
            accumTreeSize += mergeTree.getLength(UniversalSequenceNumber, LocalClientId);
            let averageTreeSize = (accumTreeSize / treeCount).toFixed(3);
            log(`i: ${i} time: ${accumTime}us which is average ${perIter} per del with average tree size ${averageTreeSize}`);
        }
    }
    return errorCount;
}


type SharedStringJSONSegment = MergeTree.IJSONTextSegment & MergeTree.IJSONMarkerSegment;

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
    let mt = random.engines.mt19937();
    mt.seedWithArray([0xdeadbeef, 0xfeedbed]);
    let minSegCount = 1;
    let maxSegCount = 1000;
    let segmentCountDistribution = random.integer(minSegCount, maxSegCount);
    let smallSegmentCountDistribution = random.integer(1, 4);
    function randSmallSegmentCount() {
        return smallSegmentCountDistribution(mt);
    }
    function randSegmentCount() {
        return segmentCountDistribution(mt);
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
    let incrGetTextTime = 0;
    let incrGetTextCalls = 0;
    let catchUpTime = 0;
    let catchUps = 0;

    function reportTiming(client: TestClient) {
        if (!verbose) {
            return;
        }
        let aveTime = (client.accumTime / client.accumOps).toFixed(1);
        let aveLocalTime = (client.localTime / client.localOps).toFixed(1);
        let stats = client.mergeTree.getStats();
        let windowTime = stats.windowTime;
        let packTime = stats.packTime;
        let aveWindowTime = ((windowTime || 0) / (client.accumOps)).toFixed(1);
        let avePackTime = ((packTime || 0) / (client.accumOps)).toFixed(1);
        let aveExtraWindowTime = (client.accumWindowTime / client.accumOps).toFixed(1);
        let aveWindow = (client.accumWindow / client.accumOps).toFixed(1);
        let adjTime = ((client.accumTime - (windowTime - client.accumWindowTime)) / client.accumOps).toFixed(1);
        let aveGetTextTime = (getTextTime / getTextCalls).toFixed(1);
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
        let a = <MergeTree.MergeTree[]>Array(mergeTreeCount);
        for (let i = 0; i < mergeTreeCount; i++) {
            a[i] = new MergeTree.MergeTree();
        }
        for (; ;);
    }

    function clientServer(startFile?: string, initRounds = 1000) {
        const clientCount = 5;
        const fileSegCount = 0;
        let initString = "";
        let asyncExec = false;
        let includeMarkers = false;

        if (!startFile) {
            initString = "don't ask for whom the bell tolls; it tolls for thee";
        }
        let server = new TestServer();
        server.insertTextLocal(0, initString);
        server.measureOps = true;
        if (startFile) {
            loadTextFromFile(startFile, server.mergeTree, fileSegCount);
        }

        let clients = new Array<TestClient>(clientCount);
        for (let i = 0; i < clientCount; i++) {
            clients[i] = new TestClient();
            clients[i].insertTextLocal(0, initString);
            clients[i].measureOps = true;
            if (startFile) {
                loadTextFromFile(startFile, clients[i].mergeTree, fileSegCount);
            }
            clients[i].startCollaboration(`Fred${i}`);
        }
        server.startCollaboration("theServer");
        server.addClients(clients);

        function checkTextMatch() {
            //log(`checking text match @${server.getCurrentSeq()}`);
            let clockStart = clock();
            let serverText = server.getText();
            getTextTime += elapsedMicroseconds(clockStart);
            getTextCalls++;
            if (checkIncr) {
                clockStart = clock();
                let serverIncrText = server.incrementalGetText();
                incrGetTextTime += elapsedMicroseconds(clockStart);
                incrGetTextCalls++;
                if (serverIncrText != serverText) {
                    log("incr get text mismatch");
                }
            }
            for (let client of clients) {
                let cliText = client.getText();
                if (cliText != serverText) {
                    log(`mismatch @${server.getCurrentSeq()} client @${client.getCurrentSeq()} id: ${client.getClientId()}`);
                    //log(serverText);
                    //log(cliText);
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
                        log(`text: ${diffPart.value} ` + annotes);
                    }
                    log(server.mergeTree.toString());
                    log(client.mergeTree.toString());
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
                const insertMarkerOp = client.insertMarkerLocal(pos, MergeTree.ReferenceType.Tile,
                    { [MergeTree.reservedTileLabelsKey]: "test" });
                server.enqueueMsg(client.makeOpMessage(insertMarkerOp, UnassignedSequenceNumber));

            }
            const insertTextOp = client.insertTextLocal(pos, text);
            server.enqueueMsg(client.makeOpMessage(insertTextOp, UnassignedSequenceNumber));

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
                const removeOp = client.removeRangeLocal(removeStart, removeEnd);
                server.enqueueMsg(client.makeOpMessage( removeOp, UnassignedSequenceNumber));
                if (TestClient.useCheckQ) {
                    client.enqueueTestString();
                }
                let word2 = client.findRandomWord();
                while (!word2) {
                    word2 = client.findRandomWord();
                }
                let pos = word2.pos + word2.text.length;
                const insertOp = client.insertTextLocal(pos, word1.text);
                server.enqueueMsg(client.makeOpMessage( insertOp, UnassignedSequenceNumber));

                if (TestClient.useCheckQ) {
                    client.enqueueTestString();
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

            /*
                        if (checkTextMatch()) {
                            log(`round: ${i}`);
                            break;
                        }
            */
            // log(server.getText());
            // log(server.mergeTree.toString());
            // log(server.mergeTree.getStats());
            if (0 == (roundCount % 100)) {
                let clockStart = clock();
                if (checkTextMatch()) {
                    log(`round: ${roundCount} BREAK`);
                    errorCount++;
                    return errorCount;
                }
                checkTime += elapsedMicroseconds(clockStart);
                if (verbose) {
                    log(`wall clock is ${((Date.now() - startTime) / 1000.0).toFixed(1)}`);
                }
                let stats = server.mergeTree.getStats();
                let liveAve = (stats.liveCount / stats.nodeCount).toFixed(1);
                let posLeaves = stats.leafCount - stats.removedLeafCount;
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
                for (let client of clients) {
                    totalTime += (client.accumTime + client.localTime + client.accumWindowTime);
                }
                if (verbose) {
                    log(`total time ${(totalTime / 1000000.0).toFixed(1)} check time ${(checkTime / 1000000.0).toFixed(1)}`);
                }
                //log(server.getText());
                //log(server.mergeTree.toString());
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

        function asyncStep() {
            round(asyncRoundCount);
            asyncRoundCount++;
            if (asyncRoundCount < rounds) {
                setImmediate(asyncStep);
            }
        }

        if (asyncExec) {
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
            //log(server.getText());
            //log(server.mergeTree.toString());
        }
        return errorCount;
    }

    function randolicious() {
        let insertRounds = 40;
        let removeRounds = 32;

        let cliA = new TestClient();
        cliA.insertTextLocal(0, "a stitch in time saves nine");
        cliA.startCollaboration("FredA");
        let cliB = new TestClient();
        cliB.insertTextLocal(0, "a stitch in time saves nine");
        cliB.startCollaboration("FredB");
        function checkTextMatch(checkSeq: number) {
            let error = false;
            if (cliA.getCurrentSeq() != checkSeq) {
                log(`client A has seq number ${cliA.getCurrentSeq()} mismatch with ${checkSeq}`);
                error = true;
            }
            if (cliB.getCurrentSeq() != checkSeq) {
                log(`client B has seq number ${cliB.getCurrentSeq()} mismatch with ${checkSeq}`);
                error = true;
            }
            let aText = cliA.getText();
            let bText = cliB.getText();
            if (aText != bText) {
                log(`mismatch @${checkSeq}:`)
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
                    let textLen = randTextLength();
                    let text = randomString(textLen, String.fromCharCode(zedCode + (sequenceNumber % 50)));
                    let preLen = cliA.getLength();
                    let pos = random.integer(0, preLen)(mt);

                    const msg = cliA.makeOpMessage(cliA.insertTextLocal(pos, text), sequenceNumber++);
                    msg.minimumSequenceNumber = min;
                    cliAMsgs.push(msg);
                    cliB.applyMsg(msg);
                }
                for (let k = firstSeq; k < sequenceNumber; k++) {
                    cliA.applyMsg(cliAMsgs.shift());
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
                    let textLen = randTextLength();
                    let text = randomString(textLen, String.fromCharCode(zedCode + (sequenceNumber % 50)));
                    let preLen = cliB.getLength();
                    let pos = random.integer(0, preLen)(mt);
                    const msg = cliB.makeOpMessage(cliB.insertTextLocal(pos, text), sequenceNumber++);
                    msg.minimumSequenceNumber = min;
                    cliBMsgs.push(msg);
                    cliA.applyMsg(msg);
                }
                for (let k = firstSeq; k < sequenceNumber; k++) {
                    cliB.applyMsg(cliBMsgs.shift());
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
                    let dlen = randTextLength();
                    let preLen = cliA.getLength();
                    let pos = random.integer(0, preLen)(mt);
                    const msg = cliA.makeOpMessage(cliA.removeRangeLocal(pos, pos + dlen), sequenceNumber++);
                    msg.minimumSequenceNumber = min;
                    cliAMsgs.push(msg);
                    cliB.applyMsg(msg);
                }
                for (let k = firstSeq; k < sequenceNumber; k++) {
                    cliA.applyMsg(cliAMsgs.shift());
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
                    let dlen = randTextLength();
                    let preLen = cliB.getLength() - 1;
                    let pos = random.integer(0, preLen)(mt);
                    const msg = cliB.makeOpMessage(cliB.removeRangeLocal(pos, pos + dlen), sequenceNumber++);
                    msg.minimumSequenceNumber = min;
                    cliBMsgs.push(msg);
                    cliA.applyMsg(msg);
                }
                for (let k = firstSeq; k < sequenceNumber; k++) {
                    cliB.applyMsg(cliBMsgs.shift());
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
        }
        else {
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
        //log(cliB.mergeTree.toString());
        //log(cliA.getText());
        let aveWindow = ((minSegCount + maxSegCount) / 2).toFixed(1);
        let aveTime = (cliA.accumTime / cliA.accumOps).toFixed(3);
        let aveWindowTime = (cliA.accumWindowTime / cliA.accumOps).toFixed(3);
        if (verbose) {
            log(`accum time ${cliA.accumTime} us ops: ${cliA.accumOps} ave window ${aveWindow} ave time ${aveTime}`)
            log(`accum window time ${cliA.accumWindowTime} us ave window time ${aveWindowTime}; max ${cliA.maxWindowTime}`)
        }
        //log(cliB.getText());
        return errorCount;
    }

    let clientNames = ["Ed", "Ted", "Ned", "Harv", "Marv", "Glenda", "Susan"];
    function firstTest() {
        let cli = new TestClient();
        cli.insertTextLocal(0, "on the mat.");
        cli.startCollaboration("Fred1");
        for (let cname of clientNames) {
            cli.addLongClientId(cname, null);
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
        cli.mergeTree.ackPendingSegment(createLocalOpArgs(MergeTree.MergeTreeDeltaType.INSERT, 3));
        if (verbose) {
            log(cli.mergeTree.toString());
            for (let clientId = 0; clientId < 4; clientId++) {
                for (let refSeq = 0; refSeq < 4; refSeq++) {
                    log(cli.relText(clientId, refSeq));
                }
            }
        }
        cli.insertMarkerRemote(0, { refType: MergeTree.ReferenceType.Tile },
            { [MergeTree.reservedTileLabelsKey]: ["peach"] },
            5, 0, "2")
        cli.insertTextRemote(6, "very ", undefined, 6, 2, "2");
        if (verbose) {
            log(cli.mergeTree.toString());
            for (let clientId = 0; clientId < 4; clientId++) {
                for (let refSeq = 0; refSeq < 7; refSeq++) {
                    log(cli.relText(clientId, refSeq));
                }
            }
        }
        let segs = <SharedStringJSONSegment[]>new MergeTree.SnapshotLegacy(cli.mergeTree, DebugLogger.create("fluid:snapshot")).extractSync();
        if (verbose) {
            for (let seg of segs) {
                log(`${specToSegment(seg)}`);
            }
        }
        cli = new TestClient();
        cli.insertTextLocal(0, " old sock!");
        cli.startCollaboration("Fred2");
        for (let cname of clientNames) {
            cli.addLongClientId(cname, null);
        }
        cli.insertTextRemote(0, "abcde", undefined, 1, 0, "2");
        cli.insertTextRemote(0, "yyy", undefined, 2, 0, "1");
        cli.insertTextRemote(2, "zzz", undefined, 3, 1, "3");
        cli.insertTextRemote(1, "EAGLE",undefined, 4, 1, "4");
        cli.insertTextRemote(4, "HAS", undefined, 5, 1, "5");
        cli.insertTextLocal(19, " LANDED");
        cli.insertTextRemote(0, "yowza: ", undefined, 6, 4, "2");
        cli.mergeTree.ackPendingSegment(createLocalOpArgs(MergeTree.MergeTreeDeltaType.INSERT, 7));
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
        cli.startCollaboration("Fred3");
        for (let cname of clientNames) {
            cli.addLongClientId(cname, null);
        }
        cli.applyMsg(cli.makeOpMessage(createRemoveRangeOp(1, 3), 1, 0, "3"));
        if (verbose) {
            log(cli.mergeTree.toString());
        }
        cli.insertTextRemote(2, "zzz", undefined, 2, 0, "2");
        if (verbose) {
            log(cli.mergeTree.toString());
        }
        let fwdRanges = cli.mergeTree.tardisRange(0, 5, 1, 2, cli.getClientId());
        if (verbose) {
            log(`fwd range 0 5 on 1 => 2`);
            for (let r of fwdRanges) {
                log(`fwd range (${r.start}, ${r.end})`);
            }
        }
        let fwdPos = cli.mergeTree.tardisPosition(2, 1, 2, cli.getClientId());
        if (verbose) {
            log(`fwd pos 2 on 1 => 2 is ${fwdPos}`);
            for (let clientId = 0; clientId < 4; clientId++) {
                for (let refSeq = 0; refSeq < 3; refSeq++) {
                    log(cli.relText(clientId, refSeq));
                }
            }
        }
        cli.insertTextRemote(9, " chaser", undefined, 3, 2, "3");
        cli.removeRangeLocal(12, 14);
        cli.mergeTree.ackPendingSegment(createLocalOpArgs(MergeTree.MergeTreeDeltaType.REMOVE, 4));
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
        cli.mergeTree.ackPendingSegment(createLocalOpArgs(MergeTree.MergeTreeDeltaType.INSERT, 5));
        cli.insertTextRemote(2, "(aaa)", undefined, 6, 4, "2");
        cli.mergeTree.ackPendingSegment(createLocalOpArgs(MergeTree.MergeTreeDeltaType.INSERT, 7));
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
        const removeOp = cli.removeRangeLocal(3,5);
        fwdRanges = cli.mergeTree.tardisRangeFromClient(3,6,9,10,2);
        if (verbose) {
            log(cli.mergeTree.toString());
            log(`fwd range 3 6 on cli 2 refseq 9 => cli 0 local`);
            for (let r of fwdRanges) {
                log(`fwd range (${r.start}, ${r.end})`);
            }
        }
        cli.applyMsg(cli.makeOpMessage(createRemoveRangeOp(3, 6), 10, 9, "2"));
        cli.applyMsg(cli.makeOpMessage(removeOp, 11));
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
        firstTest: firstTest,
        randolicious: randolicious,
        clientServer: clientServer,
        manyMergeTrees: manyMergeTrees
    }
}

function compareProxStrings(a: MergeTree.ProxString<number>, b: MergeTree.ProxString<number>) {
    let ascore = (a.invDistance * 200) + a.val;
    let bscore = (b.invDistance * 200) + b.val;
    return bscore - ascore;
}

function createLocalOpArgs(type: MergeTree.MergeTreeDeltaType, sequenceNumber: number): MergeTree.IMergeTreeDeltaOpArgs {
    return {
        op: { type } as MergeTree.IMergeTreeOp,
        sequencedMessage: {
            sequenceNumber,
        } as ISequencedDocumentMessage,
    }
}

function shuffle<T>(a: Array<T>) {
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
    let tree = new MergeTree.TST<boolean>();
    let entries = ["giraffe", "hut", "aardvark", "gold", "hover", "yurt", "hot", "antelope", "gift", "banana"];
    for (let entry of entries) {
        tree.put(entry, true);
    }
    for (let entry of entries) {
        log(`get ${entry}: ${tree.get(entry)}`);
    }
    let p1 = tree.keysWithPrefix("g");
    let p2 = tree.keysWithPrefix("gi");
    log(p1);
    log(p2);
    let p3 = tree.neighbors("hat");
    log(p3);
    let ntree = new MergeTree.TST<number>();
    let filename = path.join(__dirname, "../../src/test/literature/dict.txt")
    let content = fs.readFileSync(filename, "utf8");
    let splitContent = content.split(/\r\n|\n/g);
    let corpusFilename = path.join(__dirname, "./literature/pp.txt")
    let corpusContent = fs.readFileSync(corpusFilename, "utf8");
    let corpusTree = new MergeTree.TST<number>();
    function addCorpus(corpusContent: string, corpusTree: MergeTree.TST<number>) {
        let count = 0;
        let re = /\b\w+\b/g;
        let result: RegExpExecArray;
        do {
            result = re.exec(corpusContent);
            if (result) {
                let candidate = result[0];
                count++;
                let val = corpusTree.get(candidate);
                if (val !== undefined) {
                    corpusTree.put(candidate, val + 1);
                }
                else {
                    corpusTree.put(candidate, 1);
                }
            }
        } while (result);
        return count;
    }
    let clockStart = clock();
    addCorpus(corpusContent, corpusTree);
    corpusFilename = path.join(__dirname, "../../public/literature/shakespeare.txt")
    corpusContent = fs.readFileSync(corpusFilename, "utf8");
    addCorpus(corpusContent, corpusTree);
    let a = shuffle(splitContent);
    for (let entry of a) {
        let freq = corpusTree.get(entry);
        if (freq !== undefined) {
            ntree.put(entry, freq);
        }
        else {
            ntree.put(entry, 1);
        }
    }
    log(`size: ${ntree.size()}; random insert takes ${elapsedMilliseconds(clockStart)}ms`);
    for (let entry of a) {
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
                log(item);
            }
        }

        function printStacks() {
            for (let name of ["box", "row"]) {
                log(name + ":");
                printStack(stacks[name]);
            }
        }

        function checkTreeStackEmpty(treeStack: MergeTree.Stack<string>) {
            if (!treeStack.empty()) {
                errorCount++;
                log("mismatch: client stack empty; tree stack not");
            }
        }

        let checkNodeStacks = (docNode: DocumentNode) => {
            if (typeof docNode === "string") {
                let text = <string>docNode;
                let epos = pos + text.length;
                if (verbose) {
                    log(`stacks for [${pos}, ${epos}): ${text}`);
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
                                log(`stack length mismatch cli ${len} tree ${treeStack.items.length}`);
                                errorCount++;
                            }
                            for (let i = 0; i < len; i++) {
                                let cliMarkerId = (cliStack.items[i] as MergeTree.Marker).getId();
                                let treeMarkerId = treeStack.items[i];
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

        // log(client.mergeTree.toString());
        for (let rootChild of this.children) {
            if (prevPos >= 0) {
                if ((typeof prevChild !== "string") && (prevChild.name === "row")) {
                    let id = prevChild.id;
                    let endId = "end-" + id;
                    let endRowMarker = <MergeTree.Marker>client.getMarkerFromId(endId);
                    let endRowPos = client.getPosition(endRowMarker);
                    prevPos = endRowPos;
                }
                let tilePos = client.findTile(prevPos+1, "pg", false);
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

function findReplacePerf(filename: string) {
    let client = new TestClient({ blockUpdateMarkers: true });
    loadTextFromFile(filename, client.mergeTree);

    let clockStart = clock();

    let cFetches = 0;
    let cReplaces = 0;
    for (let pos = 0; pos < client.getLength();) {
        let curSegOff = client.getContainingSegment(pos);
        cFetches++;

        let curSeg = curSegOff.segment;
        let textSeg = <MergeTree.TextSegment>curSeg;
        if (textSeg != null) {
            let text = textSeg.text;
            let i = text.indexOf("the");
            if (i >= 0) {
                client.mergeTree.removeRange(
                    pos + i,
                    pos + i + 3,
                    UniversalSequenceNumber,
                    client.getClientId());
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
                pos += (curSeg.cachedLength - curSegOff.offset);
            }
        }
    }

    let elapsed = elapsedMicroseconds(clockStart);
    log(`${cFetches} fetches and ${cReplaces} replaces took ${elapsed} microseconds`);
}

let testTST = false;
if (testTST) {
    tst();
}

const baseDir = "../../src/test/literature";
const testTimeout = 60000;

describe("Routerlicious", () => {
    describe("merge-tree", () => {
        beforeEach(() => {
            logLines = [];
        })
        it("firstTest", () => {
            const testPack = TestPack(true);
            testPack.firstTest();
        });

        it("hierarchy", () => {
            assert(DocumentTree.test1() == 0, logLines.join("\n"));
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
        }).timeout(testTimeout)
    });
});

