/// <reference path="node.d.ts" />
/// <reference path="base.d.ts" />
/// <reference path="random.d.ts" />
/// <reference path="diff.d.ts" />

import * as fs from "fs";
import * as RedBlack from "./redBlack";
import * as random from "random-js";
import * as MergeTree from "./cmergeTree";
import * as Text from "./text";
import * as JsDiff from "diff";

function compareStrings(a: string, b: string) {
    return a.localeCompare(b);
}

function compareNumbers(a: number, b: number) {
    return a - b;
}

function printStringProperty(p: Base.Property<string, string>) {
    console.log(`[${p.key}, ${p.data}]`);
    return true;
}

function printStringNumProperty(p: Base.Property<string, number>) {
    console.log(`[${p.key}, ${p.data}]`);
    return true;
}

function simpleTest() {
    let a = [
        "Aardvark", "cute",
        "Baboon", "big",
        "Chameleon", "colorful",
        "Dingo", "wild"
    ];

    let beast = new RedBlack.RedBlackTree<string, string>(compareStrings);
    for (let i = 0; i < a.length; i += 2) {
        beast.put(a[i], a[i + 1]);
    }
    beast.map(printStringProperty);
    console.log("Map B D");
    console.log("Map Aardvark Dingo");
    console.log("Map Baboon Chameleon");
    printStringProperty(beast.get("Chameleon"));
}

function clock() {
    return process.hrtime();
}

function took(desc: string, start: number[]) {
    let end: number[] = process.hrtime(start);
    let duration = elapsedMilliseconds(start);
    console.log(`${desc} took ${duration} ms`);
    return duration;
}

function elapsedMilliseconds(start: number[]) {
    let end: number[] = process.hrtime(start);
    let duration = Math.round((end[0] * 1000) + (end[1] / 1000000));
    return duration;
}

function elapsedMicroseconds(start: number[]) {
    let end: number[] = process.hrtime(start);
    let duration = Math.round((end[0] * 1000000) + (end[1] / 1000));
    return duration;
}

function integerTest1() {
    let mt = random.engines.mt19937();
    mt.seedWithArray([0xdeadbeef, 0xfeedbed]);
    const imin = 0;
    const imax = 10000000;
    const intCount = 1100000;
    let distribution = random.integer(imin, imax);
    let beast = new RedBlack.RedBlackTree<number, number>(compareNumbers);

    function randInt() {
        return distribution(mt);
    }
    let pos = new Array<number>(intCount);
    let i = 0;
    let redo = false;
    function onConflict(key: number, current: number, proposed: number) {
        redo = true;
        return current;
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
        let prop = beast.get(cp);
    }
    let getdur = took("get all keys", start);
    console.log(`cost per get is ${(1000.0 * getdur / intCount).toFixed(3)} us`);
    beast.diag();
    console.log(`duplicates ${conflictCount}, errors ${errorCount}`);
}

function fileTest1() {
    let content = fs.readFileSync("pizzaingredients.txt", "utf8");
    let a = content.split('\n');
    let iterCount = a.length >> 2;
    const removeCount = 10;
    console.log("len: " + a.length);

    for (let k = 0; k < iterCount; k++) {
        let beast = new RedBlack.RedBlackTree<string, number>(compareStrings);
        let linearBeast = RedBlack.LinearDictionary<string, number>(compareStrings);
        for (let i = 0, len = a.length; i < len; i++) {
            a[i] = a[i].trim();
            if (a[i].length > 0) {
                beast.put(a[i], i);
                linearBeast.put(a[i], i);
            }
        }
        if (k == 0) {
            beast.map(printStringNumProperty);
            console.log("BTREE...");
        }
        let removedAnimals: string[] = [];
        for (let j = 0; j < removeCount; j++) {
            let removeIndex = Math.floor(Math.random() * a.length);
            console.log(`Removing: ${a[removeIndex]} at ${removeIndex}`);
            beast.remove(a[removeIndex]);
            linearBeast.remove(a[removeIndex]);
            removedAnimals.push(a[removeIndex]);
        }
        for (let animal of a) {
            if ((animal.length > 0) && (removedAnimals.indexOf(animal) < 0)) {
                let prop = beast.get(animal);
                let linProp = linearBeast.get(animal);
                //console.log(`Trying key ${animal}`);
                if (prop) {
                    //printStringNumProperty(prop);
                    if ((linProp === undefined) || (prop.key != linProp.key) || (prop.data != linProp.data)) {
                        console.log(`Linear BST does not match RB BST at key ${animal}`);
                    }
                }
                else {
                    console.log("hmm...bad key: " + animal);
                }
            }
        }
        beast.diag();
        linearBeast.diag();
    }
}

function printTextSegment(textSegment: MergeTree.TextSegment, pos: number) {
    console.log(textSegment.text);
    console.log(`at [${pos}, ${pos + textSegment.text.length})`);
    return true;
}

function makeTextSegment(text: string): MergeTree.TextSegment {
    return { text: text };
}

function makeCollabTextSegment(text: string, seq = MergeTree.UniversalSequenceNumber, clientId = MergeTree.LocalClientId): MergeTree.TextSegment {
    return { text: text, seq: seq, clientId: clientId };
}

function editFlat(source: string, s: number, dl: number, nt = "") {
    return source.substring(0, s) + nt + source.substring(s + dl, source.length);
}

let accumTime = 0;

function checkInsertSegTree(segTree: MergeTree.MergeTree, pos: number, textSegment: MergeTree.TextSegment,
    verbose = false) {
    let checkText = segTree.getText(MergeTree.UniversalSequenceNumber, MergeTree.LocalClientId);
    checkText = editFlat(checkText, pos, 0, textSegment.text);
    let clockStart = clock();
    segTree.insertInterval(pos, MergeTree.UniversalSequenceNumber, MergeTree.LocalClientId, MergeTree.UniversalSequenceNumber, textSegment);
    accumTime += elapsedMicroseconds(clockStart);
    let updatedText = segTree.getText(MergeTree.UniversalSequenceNumber, MergeTree.LocalClientId);
    let result = (checkText == updatedText);
    if ((!result) && verbose) {
        console.log(`mismatch(o): ${checkText}`);
        console.log(`mismatch(u): ${updatedText}`);
    }
    return result;
}

function checkRemoveSegTree(mergeTree: MergeTree.MergeTree, start: number, end: number, verbose = false) {
    let origText = mergeTree.getText(MergeTree.UniversalSequenceNumber, MergeTree.LocalClientId);
    let checkText = editFlat(origText, start, end - start);
    let clockStart = clock();
    mergeTree.removeRange(start, end, MergeTree.UniversalSequenceNumber, MergeTree.LocalClientId);
    accumTime += elapsedMicroseconds(clockStart);
    let updatedText = mergeTree.getText(MergeTree.UniversalSequenceNumber, MergeTree.LocalClientId);
    let result = (checkText == updatedText);
    if ((!result) && verbose) {
        console.log(`mismatch(o): ${origText}`);
        console.log(`mismatch(c): ${checkText}`);
        console.log(`mismatch(u): ${updatedText}`);
    }
    return result;
}

function checkMarkRemoveSegTree(segTree: MergeTree.MergeTree, start: number, end: number, verbose = false) {
    let origText = segTree.getText(MergeTree.UniversalSequenceNumber, MergeTree.LocalClientId);
    let checkText = editFlat(origText, start, end - start);
    let clockStart = clock();
    segTree.markRangeRemoved(start, end, MergeTree.UniversalSequenceNumber, MergeTree.LocalClientId, MergeTree.UniversalSequenceNumber);
    accumTime += elapsedMicroseconds(clockStart);
    let updatedText = segTree.getText(MergeTree.UniversalSequenceNumber, MergeTree.LocalClientId);
    let result = (checkText == updatedText);
    if ((!result) && verbose) {
        console.log(`mismatch(o): ${origText}`);
        console.log(`mismatch(c): ${checkText}`);
        console.log(`mismatch(u): ${updatedText}`);
    }
    return result;
}

function segTreeTest1() {
    let mergeTree = new MergeTree.MergeTree("the cat is on the mat");
    mergeTree.map({ leaf: printTextSegment }, MergeTree.UniversalSequenceNumber, MergeTree.LocalClientId);
    let fuzzySeg = makeCollabTextSegment("fuzzy, fuzzy ");
    checkInsertSegTree(mergeTree, 4, fuzzySeg);
    fuzzySeg = makeCollabTextSegment("fuzzy, fuzzy ");
    checkInsertSegTree(mergeTree, 4, fuzzySeg);
    checkMarkRemoveSegTree(mergeTree, 4, 13);
    //checkRemoveSegTree(segTree, 4, 13);
    checkInsertSegTree(mergeTree, 4, makeCollabTextSegment("fi"));
    mergeTree.map({ leaf: printTextSegment }, MergeTree.UniversalSequenceNumber, MergeTree.LocalClientId);
    let segment = mergeTree.getContainingSegment(4, MergeTree.UniversalSequenceNumber, MergeTree.LocalClientId);
    console.log(mergeTree.getOffset(segment, MergeTree.UniversalSequenceNumber, MergeTree.LocalClientId));
    console.log(mergeTree.getText(MergeTree.UniversalSequenceNumber, MergeTree.LocalClientId));
    console.log(mergeTree.toString());
    TestPack().firstTest();
}

function segTreeLargeTest() {
    let mergeTree = new MergeTree.MergeTree("the cat is on the mat");
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
        let preLen = mergeTree.getLength(MergeTree.UniversalSequenceNumber, MergeTree.LocalClientId);
        let pos = random.integer(0, preLen)(mt);
        let clockStart = clock();
        mergeTree.insertInterval(pos, MergeTree.UniversalSequenceNumber, MergeTree.LocalClientId, MergeTree.UniversalSequenceNumber, makeCollabTextSegment(s));
        accumTime += elapsedMicroseconds(clockStart);
        if ((i > 0) && (0 == (i % 50000))) {
            let perIter = (accumTime / (i + 1)).toFixed(3);
            treeCount++;
            accumTreeSize += mergeTree.getLength(MergeTree.UniversalSequenceNumber, MergeTree.LocalClientId);
            let averageTreeSize = (accumTreeSize / treeCount).toFixed(3);
            console.log(`i: ${i} time: ${accumTime}us which is average ${perIter} per insert with average tree size ${averageTreeSize}`);
        }
    }
    console.log(process.memoryUsage().heapUsed);
    accumTime = 0;
    accumTreeSize = 0;
    treeCount = 0;
    for (let i = 0; i < removeCount; i++) {
        let dlen = randInt();
        let preLen = mergeTree.getLength(MergeTree.UniversalSequenceNumber, MergeTree.LocalClientId);
        let pos = random.integer(0, preLen)(mt);
        // console.log(itree.toString());
        let clockStart = clock();
        mergeTree.removeRange(pos, pos + dlen, MergeTree.UniversalSequenceNumber, MergeTree.LocalClientId);
        accumTime += elapsedMicroseconds(clockStart);

        if ((i > 0) && (0 == (i % 50000))) {
            let perIter = (accumTime / (i + 1)).toFixed(3);
            treeCount++;
            accumTreeSize += mergeTree.getLength(MergeTree.UniversalSequenceNumber, MergeTree.LocalClientId);
            let averageTreeSize = (accumTreeSize / treeCount).toFixed(3);
            console.log(`i: ${i} time: ${accumTime}us which is average ${perIter} per del with average tree size ${averageTreeSize}`);
        }
    }
}

function segTreeCheckedTest() {
    let segTree = new MergeTree.MergeTree("the cat is on the mat");
    const insertCount = 10000;
    const removeCount = 7000;
    const largeRemoveCount = 50;
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
    for (let i = 0; i < insertCount; i++) {
        let slen = randInt();
        let s = randomString(slen, String.fromCharCode(48 + slen));
        let preLen = segTree.getLength(MergeTree.UniversalSequenceNumber, MergeTree.LocalClientId);
        let pos = random.integer(0, preLen)(mt);
        if (!checkInsertSegTree(segTree, pos, makeCollabTextSegment(s), true)) {
            console.log(`i: ${i} preLen ${preLen} pos: ${pos} slen: ${slen} s: ${s} itree len: ${segTree.getLength(MergeTree.UniversalSequenceNumber, MergeTree.LocalClientId)}`);
            console.log(segTree.toString());
            break;
        }
        if ((i > 0) && (0 == (i % 1000))) {
            let perIter = (accumTime / (i + 1)).toFixed(3);
            treeCount++;
            accumTreeSize += segTree.getLength(MergeTree.UniversalSequenceNumber, MergeTree.LocalClientId);
            let averageTreeSize = (accumTreeSize / treeCount).toFixed(3);
            console.log(`i: ${i} time: ${accumTime}us which is average ${perIter} per insert with average tree size ${averageTreeSize}`);
        }
    }
    accumTime = 0;
    accumTreeSize = 0;
    treeCount = 0;
    for (let i = 0; i < largeRemoveCount; i++) {
        let dlen = randLargeInt();
        let preLen = segTree.getLength(MergeTree.UniversalSequenceNumber, MergeTree.LocalClientId);
        let pos = random.integer(0, preLen)(mt);
        // console.log(itree.toString());
        if (!checkRemoveSegTree(segTree, pos, pos + dlen, true)) {
            console.log(`i: ${i} preLen ${preLen} pos: ${pos} dlen: ${dlen} itree len: ${segTree.getLength(MergeTree.UniversalSequenceNumber, MergeTree.LocalClientId)}`);
            console.log(segTree.toString());
            break;
        }
        if ((i > 0) && (0 == (i % 10))) {
            let perIter = (accumTime / (i + 1)).toFixed(3);
            treeCount++;
            accumTreeSize += segTree.getLength(MergeTree.UniversalSequenceNumber, MergeTree.LocalClientId);
            let averageTreeSize = (accumTreeSize / treeCount).toFixed(3);
            console.log(`i: ${i} time: ${accumTime}us which is average ${perIter} per large del with average tree size ${averageTreeSize}`);
        }
    }
    accumTime = 0;
    accumTreeSize = 0;
    treeCount = 0;
    for (let i = 0; i < removeCount; i++) {
        let dlen = randInt();
        let preLen = segTree.getLength(MergeTree.UniversalSequenceNumber, MergeTree.LocalClientId);
        let pos = random.integer(0, preLen)(mt);
        // console.log(itree.toString());
        if (i & 1) {
            if (!checkMarkRemoveSegTree(segTree, pos, pos + dlen, true)) {
                console.log(`i: ${i} preLen ${preLen} pos: ${pos} dlen: ${dlen} itree len: ${segTree.getLength(MergeTree.UniversalSequenceNumber, MergeTree.LocalClientId)}`);
                console.log(segTree.toString());
                break;
            }
        }
        else {
            if (!checkRemoveSegTree(segTree, pos, pos + dlen, true)) {
                console.log(`i: ${i} preLen ${preLen} pos: ${pos} dlen: ${dlen} itree len: ${segTree.getLength(MergeTree.UniversalSequenceNumber, MergeTree.LocalClientId)}`);
                console.log(segTree.toString());
                break;
            }

        }
        if ((i > 0) && (0 == (i % 1000))) {
            let perIter = (accumTime / (i + 1)).toFixed(3);
            treeCount++;
            accumTreeSize += segTree.getLength(MergeTree.UniversalSequenceNumber, MergeTree.LocalClientId);
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
        let preLen = segTree.getLength(MergeTree.UniversalSequenceNumber, MergeTree.LocalClientId);
        let pos = random.integer(0, preLen)(mt);
        if (!checkInsertSegTree(segTree, pos, makeCollabTextSegment(s), true)) {
            console.log(`i: ${i} preLen ${preLen} pos: ${pos} slen: ${slen} s: ${s} itree len: ${segTree.getLength(MergeTree.UniversalSequenceNumber, MergeTree.LocalClientId)}`);
            console.log(segTree.toString());
            break;
        }
        if ((i > 0) && (0 == (i % 1000))) {
            let perIter = (accumTime / (i + 1)).toFixed(3);
            treeCount++;
            accumTreeSize += segTree.getLength(MergeTree.UniversalSequenceNumber, MergeTree.LocalClientId);
            let averageTreeSize = (accumTreeSize / treeCount).toFixed(3);
            console.log(`i: ${i} time: ${accumTime}us which is average ${perIter} per insert with average tree size ${averageTreeSize}`);
        }
    }
    accumTime = 0;
    accumTreeSize = 0;
    treeCount = 0;
    for (let i = 0; i < removeCount; i++) {
        let dlen = randInt();
        let preLen = segTree.getLength(MergeTree.UniversalSequenceNumber, MergeTree.LocalClientId);
        let pos = random.integer(0, preLen)(mt);
        // console.log(itree.toString());
        if (i & 1) {
            if (!checkMarkRemoveSegTree(segTree, pos, pos + dlen, true)) {
                console.log(`i: ${i} preLen ${preLen} pos: ${pos} dlen: ${dlen} itree len: ${segTree.getLength(MergeTree.UniversalSequenceNumber, MergeTree.LocalClientId)}`);
                console.log(segTree.toString());
                break;
            }
        }
        else {
            if (!checkRemoveSegTree(segTree, pos, pos + dlen, true)) {
                console.log(`i: ${i} preLen ${preLen} pos: ${pos} dlen: ${dlen} itree len: ${segTree.getLength(MergeTree.UniversalSequenceNumber, MergeTree.LocalClientId)}`);
                console.log(segTree.toString());
                break;
            }

        }
        if ((i > 0) && (0 == (i % 1000))) {
            let perIter = (accumTime / (i + 1)).toFixed(3);
            treeCount++;
            accumTreeSize += segTree.getLength(MergeTree.UniversalSequenceNumber, MergeTree.LocalClientId);
            let averageTreeSize = (accumTreeSize / treeCount).toFixed(3);
            console.log(`i: ${i} time: ${accumTime}us which is average ${perIter} per del with average tree size ${averageTreeSize}`);
        }
    }

}

export function TestPack() {
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

    function reportTiming(client: MergeTree.Client) {
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
        if (client.localOps > 0) {
            console.log(`local time ${client.localTime} us ops: ${client.localOps} ave time ${aveLocalTime}`);
        }
        console.log(`accum time ${client.accumTime} us ops: ${client.accumOps} ave time ${aveTime} - wtime ${adjTime} pack ${avePackTime} ave window ${aveWindow}`);
        console.log(`accum window time ${client.accumWindowTime} us ave window time total ${aveWindowTime} not in ops ${aveExtraWindowTime}; max ${client.maxWindowTime}`);
    }

    function manyMergeTrees() {
        const mergeTreeCount = 100000;
        let a = <MergeTree.MergeTree[]>Array(mergeTreeCount);
        for (let i=0;i<mergeTreeCount;i++) {
            a[i]=new MergeTree.MergeTree("");
        }
        for (;;);
    }

    function clientServer(startFile?: string) {
        const clientCount = 5;
        const fileSegCount = 0;
        let initString = "";
        if (!startFile) {
            initString = "don't ask for whom the bell tolls; it tolls for thee";
        }
        let server = new MergeTree.TestServer(initString);
        if (startFile) {
            Text.loadText(startFile, server.mergeTree, fileSegCount);
        }

        let clients = <MergeTree.Client[]>Array(clientCount);
        for (let i = 0; i < clientCount; i++) {
            clients[i] = new MergeTree.Client(initString);
            if (startFile) {
                Text.loadText(startFile, clients[i].mergeTree, fileSegCount);
            }
            clients[i].startCollaboration(i);
        }
        server.startCollaboration(clientCount);
        server.addClients(clients);

        function checkTextMatch() {
            //console.log(`checking text match @${server.getCurrentSeq()}`);
            let serverText = server.getText();
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
                    //console.log(server.mergeTree.toString());
                    //console.log(client.mergeTree.toString());
                    return true;
                }
            }
            return false;
        }

        let rounds = 1000000;
        function clientProcessSome(client: MergeTree.Client, all = false) {
            let cliMsgCount = client.q.count();
            let countToApply: number;
            if (all) {
                countToApply = cliMsgCount;
            }
            else {
                countToApply = random.integer(Math.floor(2 * cliMsgCount / 3), cliMsgCount)(mt);
            }
            client.applyMessages(countToApply);
        }

        function serverProcessSome(server: MergeTree.Client, all = false) {
            let svrMsgCount = server.q.count();
            let countToApply: number;
            if (all) {
                countToApply = svrMsgCount;
            }
            else {
                countToApply = random.integer(Math.floor(2 * svrMsgCount / 3), svrMsgCount)(mt);
            }
            return server.applyMessages(countToApply);
        }

        function randomSpateOfInserts(client: MergeTree.Client, charIndex: number) {
            let textLen = randTextLength();
            let text = randomString(textLen, String.fromCharCode(zedCode + ((client.getCurrentSeq() + charIndex) % 50)));
            let preLen = client.getLength();
            let pos = random.integer(0, preLen)(mt);
            server.enqueueMsg(MergeTree.makeInsertMsg(text, pos, MergeTree.UnassignedSequenceNumber, client.getCurrentSeq(), client.getClientId()));
            client.insertSegmentLocal(text, pos);
            if (MergeTree.useCheckQ) {
                client.enqueueTestString();
            }
        }

        function randomSpateOfRemoves(client: MergeTree.Client) {
            let dlen = randTextLength();
            let preLen = client.getLength();
            let pos = random.integer(0, preLen)(mt);
            server.enqueueMsg(MergeTree.makeRemoveMsg(pos, pos + dlen, MergeTree.UnassignedSequenceNumber, client.getCurrentSeq(), client.getClientId()));
            client.removeSegmentLocal(pos, pos + dlen);
            if (MergeTree.useCheckQ) {
                client.enqueueTestString();
            }
        }

        function randomWordMove(client: MergeTree.Client) {
            let word1 = Text.findRandomWord(client.mergeTree, client.getClientId());
            if (word1) {
                let removeStart = word1.pos;
                let removeEnd = removeStart + word1.text.length;
                server.enqueueMsg(MergeTree.makeRemoveMsg(removeStart, removeEnd, MergeTree.UnassignedSequenceNumber, client.getCurrentSeq(), client.getClientId()));
                client.removeSegmentLocal(removeStart, removeEnd);
                if (MergeTree.useCheckQ) {
                    client.enqueueTestString();
                }
                let word2 = Text.findRandomWord(client.mergeTree, client.getClientId());
                while (!word2) {
                    word2 = Text.findRandomWord(client.mergeTree, client.getClientId());
                }
                let pos = word2.pos + word2.text.length;
                server.enqueueMsg(MergeTree.makeInsertMsg(word1.text, pos, MergeTree.UnassignedSequenceNumber, client.getCurrentSeq(), client.getClientId()));
                client.insertSegmentLocal(word1.text, pos);
                if (MergeTree.useCheckQ) {
                    client.enqueueTestString();
                }
            }
        }
        let startTime = Date.now();
        let checkTime = 0;
        for (let i = 0; i < rounds; i++) {
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
                    }
                }
                if (serverProcessSome(server)) {
                    return;
                }
                clientProcessSome(client);
            }
            // process remaining messages
            if (serverProcessSome(server, true)) {
                return;
            }
            for (let client of clients) {
                clientProcessSome(client, true);
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
            if (0 == (i % 100)) {
                let clockStart = clock();
                if (checkTextMatch()) {
                    console.log(`round: ${i} BREAK`);
                    break;
                }
                checkTime += elapsedMicroseconds(clockStart);
                console.log(`wall clock is ${((Date.now() - startTime) / 1000.0).toFixed(1)}`);
                let stats = server.mergeTree.getStats();
                let liveAve = (stats.liveCount / stats.nodeCount).toFixed(1);
                let posLeaves = stats.leafCount - stats.removedLeafCount;
                console.log(`round: ${i} seq ${server.seq} char count ${server.getLength()} height ${stats.maxHeight} lv ${stats.leafCount} rml ${stats.removedLeafCount} p ${posLeaves} nodes ${stats.nodeCount} pop ${liveAve} histo ${stats.histo}`);
                reportTiming(server);
                reportTiming(clients[2]);
                let totalTime = server.accumTime + server.accumWindowTime;
                for (let client of clients) {
                    totalTime += (client.accumTime + client.localTime + client.accumWindowTime);
                }
                console.log(`total time ${(totalTime / 1000000.0).toFixed(1)} check time ${(checkTime / 1000000.0).toFixed(1)}`);
                //console.log(server.getText());
                //console.log(server.mergeTree.toString());
            }
        }
        reportTiming(server);
        reportTiming(clients[2]);
        //console.log(server.getText());
        //console.log(server.mergeTree.toString());
    }

    function randolicious() {
        let insertRounds = 40;
        let removeRounds = 32;

        let cliA = new MergeTree.Client("a stitch in time saves nine");
        cliA.startCollaboration(0);
        let cliB = new MergeTree.Client("a stitch in time saves nine");
        cliB.startCollaboration(1);
        function checkTextMatch(checkSeq: number) {
            let error = false;
            if (cliA.getCurrentSeq() != checkSeq) {
                console.log(`client A has seq number ${cliA.getCurrentSeq()} mismatch with ${checkSeq}`);
                error = true;
            }
            if (cliB.getCurrentSeq() != checkSeq) {
                console.log(`client B has seq number ${cliB.getCurrentSeq()} mismatch with ${checkSeq}`);
                error = true;
            }
            let aText = cliA.getText();
            let bText = cliB.getText();
            if (aText != bText) {
                console.log(`mismatch @${checkSeq}:`)
                console.log(aText);
                console.log(bText);
                error = true;
            }
            return error;
        }
        cliA.accumTime = 0;
        cliB.accumTime = 0;
        function insertTest() {
            for (let i = 0; i < insertRounds; i++) {
                let insertCount = randSegmentCount();
                let sequenceNumber = cliA.getCurrentSeq() + 1;
                let firstSeq = sequenceNumber;
                for (let j = 0; j < insertCount; j++) {
                    let textLen = randTextLength();
                    let text = randomString(textLen, String.fromCharCode(zedCode + (sequenceNumber % 50)));
                    let preLen = cliA.getLength();
                    let pos = random.integer(0, preLen)(mt);
                    cliB.insertSegmentRemote(text, pos, sequenceNumber++, cliA.getCurrentSeq(), cliA.mergeTree.getSegmentWindow().clientId);
                    cliA.insertSegmentLocal(text, pos);
                }
                for (let k = firstSeq; k < sequenceNumber; k++) {
                    cliA.ackPendingSegment(k);
                }
                if (checkTextMatch(sequenceNumber - 1)) {
                    return true;
                }
                cliA.updateMinSeq(sequenceNumber - 1);
                cliB.updateMinSeq(sequenceNumber - 1);
                insertCount = randSegmentCount();
                sequenceNumber = cliA.getCurrentSeq() + 1;
                firstSeq = sequenceNumber;
                for (let j = 0; j < insertCount; j++) {
                    let textLen = randTextLength();
                    let text = randomString(textLen, String.fromCharCode(zedCode + (sequenceNumber % 50)));
                    let preLen = cliB.getLength();
                    let pos = random.integer(0, preLen)(mt);
                    cliA.insertSegmentRemote(text, pos, sequenceNumber++, cliB.getCurrentSeq(), cliB.mergeTree.getSegmentWindow().clientId);
                    cliB.insertSegmentLocal(text, pos);
                }
                for (let k = firstSeq; k < sequenceNumber; k++) {
                    cliB.ackPendingSegment(k);
                }
                if (checkTextMatch(sequenceNumber - 1)) {
                    return true;
                }
                cliA.updateMinSeq(sequenceNumber - 1);
                cliB.updateMinSeq(sequenceNumber - 1);
            }
            return false;
        }


        function removeTest() {
            for (let i = 0; i < removeRounds; i++) {
                let removeCount = randSegmentCount();
                let sequenceNumber = cliA.getCurrentSeq() + 1;
                let firstSeq = sequenceNumber;
                for (let j = 0; j < removeCount; j++) {
                    let dlen = randTextLength();
                    let preLen = cliA.getLength();
                    let pos = random.integer(0, preLen)(mt);
                    cliB.removeSegmentRemote(pos, pos + dlen, sequenceNumber++, cliA.getCurrentSeq(), cliA.mergeTree.getSegmentWindow().clientId);
                    cliA.removeSegmentLocal(pos, pos + dlen);
                }
                for (let k = firstSeq; k < sequenceNumber; k++) {
                    cliA.ackPendingSegment(k);
                }
                if (checkTextMatch(sequenceNumber - 1)) {
                    return true;
                }
                cliA.updateMinSeq(sequenceNumber - 1);
                cliB.updateMinSeq(sequenceNumber - 1);
                removeCount = randSegmentCount();
                sequenceNumber = cliA.getCurrentSeq() + 1;
                firstSeq = sequenceNumber;
                for (let j = 0; j < removeCount; j++) {
                    let dlen = randTextLength();
                    let preLen = cliB.getLength();
                    let pos = random.integer(0, preLen)(mt);
                    cliA.removeSegmentRemote(pos, pos + dlen, sequenceNumber++, cliB.getCurrentSeq(), cliB.mergeTree.getSegmentWindow().clientId);
                    cliB.removeSegmentLocal(pos, pos + dlen);
                }
                for (let k = firstSeq; k < sequenceNumber; k++) {
                    cliB.ackPendingSegment(k);
                }
                if (checkTextMatch(sequenceNumber - 1)) {
                    return true;
                }
                cliA.updateMinSeq(sequenceNumber - 1);
                cliB.updateMinSeq(sequenceNumber - 1);
            }
            return false;
        }
        if (insertTest()) {
            console.log(cliA.mergeTree.toString());
            console.log(cliB.mergeTree.toString());
        }
        else {
            console.log(`sequence number: ${cliA.getCurrentSeq()} min: ${cliA.mergeTree.getSegmentWindow().minSeq}`);
            //            console.log(cliA.mergeTree.toString());

            console.log(`testing remove at ${cliA.getCurrentSeq()} and ${cliB.getCurrentSeq()}`);
            if (removeTest()) {
                console.log(cliA.mergeTree.toString());
                console.log(cliB.mergeTree.toString());
            }
        }
        console.log(`sequence number: ${cliA.getCurrentSeq()} min: ${cliA.mergeTree.getSegmentWindow().minSeq}`);
        //                console.log(cliA.mergeTree.toString());
        //console.log(cliB.mergeTree.toString());
        console.log(cliA.getText());
        let aveWindow = ((minSegCount + maxSegCount) / 2).toFixed(1);
        let aveTime = (cliA.accumTime / cliA.accumOps).toFixed(3);
        let aveWindowTime = (cliA.accumWindowTime / cliA.accumOps).toFixed(3);
        console.log(`accum time ${cliA.accumTime} us ops: ${cliA.accumOps} ave window ${aveWindow} ave time ${aveTime}`)
        console.log(`accum window time ${cliA.accumWindowTime} us ave window time ${aveWindowTime}; max ${cliA.maxWindowTime}`)
        //console.log(cliB.getText());
    }

    function firstTest() {
        let cli = new MergeTree.Client("on the mat.");
        cli.startCollaboration(1);
        cli.insertSegmentRemote("that ", 0, 1, 0, 0);
        cli.insertSegmentRemote("fat ", 0, 2, 0, 2);
        cli.insertSegmentLocal("cat ", 5);
        console.log(cli.mergeTree.toString());
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
                console.log(cli.relText(i, j));
            }
        }
        cli.mergeTree.ackPendingSegment(3);
        console.log(cli.mergeTree.toString());
        for (let clientId = 0; clientId < 4; clientId++) {
            for (let refSeq = 0; refSeq < 4; refSeq++) {
                console.log(cli.relText(clientId, refSeq));
            }
        }
        cli.insertSegmentRemote("very ", 5, 4, 2, 2);
        console.log(cli.mergeTree.toString());
        for (let clientId = 0; clientId < 4; clientId++) {
            for (let refSeq = 0; refSeq < 5; refSeq++) {
                console.log(cli.relText(clientId, refSeq));
            }
        }
        cli = new MergeTree.Client(" old sock!");
        cli.startCollaboration(1);
        cli.insertSegmentRemote("abcde", 0, 1, 0, 2);
        cli.insertSegmentRemote("yyy", 0, 2, 0, 0);
        cli.insertSegmentRemote("zzz", 2, 3, 1, 3);
        cli.insertSegmentRemote("EAGLE", 1, 4, 1, 4);
        cli.insertSegmentRemote("HAS", 4, 5, 1, 5);
        cli.insertSegmentLocal(" LANDED", 19);
        cli.insertSegmentRemote("yowza: ", 0, 6, 4, 2);
        cli.mergeTree.ackPendingSegment(7);
        console.log(cli.mergeTree.toString());
        for (let clientId = 0; clientId < 6; clientId++) {
            for (let refSeq = 0; refSeq < 8; refSeq++) {
                console.log(cli.relText(clientId, refSeq));
            }
        }
        cli.removeSegmentRemote(3, 5, 8, 6, 0);
        console.log(cli.mergeTree.toString());
        for (let clientId = 0; clientId < 6; clientId++) {
            for (let refSeq = 0; refSeq < 9; refSeq++) {
                console.log(cli.relText(clientId, refSeq));
            }
        }
        cli = new MergeTree.Client("abcdefgh");
        cli.startCollaboration(1);
        cli.removeSegmentRemote(1, 3, 1, 0, 3);
        console.log(cli.mergeTree.toString());
        cli.insertSegmentRemote("zzz", 2, 2, 0, 2);
        console.log(cli.mergeTree.toString());
        for (let clientId = 0; clientId < 4; clientId++) {
            for (let refSeq = 0; refSeq < 3; refSeq++) {
                console.log(cli.relText(clientId, refSeq));
            }
        }
        cli.insertSegmentRemote(" chaser", 9, 3, 2, 3);
        cli.removeSegmentLocal(12, 14);
        cli.mergeTree.ackPendingSegment(4);
        console.log(cli.mergeTree.toString());
        for (let clientId = 0; clientId < 4; clientId++) {
            for (let refSeq = 0; refSeq < 5; refSeq++) {
                console.log(cli.relText(clientId, refSeq));
            }
        }
        cli.insertSegmentLocal("*yolumba*", 14);
        cli.insertSegmentLocal("-zanzibar-", 17);
        cli.mergeTree.ackPendingSegment(5);
        cli.insertSegmentRemote("(aaa)", 2, 6, 4, 2);
        cli.mergeTree.ackPendingSegment(7);
        console.log(cli.mergeTree.toString());
        for (let clientId = 0; clientId < 4; clientId++) {
            for (let refSeq = 0; refSeq < 8; refSeq++) {
                console.log(cli.relText(clientId, refSeq));
            }
        }
        /*
        cli.removeSegmentLocal(3,8);
        cli.removeSegmentLocal(5,7);
        cli.ackPendingSegment(8);
        cli.ackPendingSegment(9);
        */
        cli.removeSegmentRemote(3, 8, 8, 7, 2);
        cli.removeSegmentRemote(5, 7, 9, 7, 2);
        console.log(cli.mergeTree.toString());
        for (let clientId = 0; clientId < 4; clientId++) {
            for (let refSeq = 0; refSeq < 10; refSeq++) {
                console.log(cli.relText(clientId, refSeq));
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

//simpleTest();
//fileTest1();
//integerTest1();
//segTreeTest1();
//segTreeLargeTest();
//segTreeCheckedTest();
let testPack = TestPack();
//testPack.randolicious();
testPack.clientServer("pp.txt");
//testPack.firstTest();
//testPack.manyMergeTrees();
