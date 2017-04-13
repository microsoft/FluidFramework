/// <reference path="node.d.ts" />
/// <reference path="base.d.ts" />
/// <reference path="random.d.ts" />

import * as fs from "fs";
import * as RedBlack from "./redBlack";
import * as random from "random-js";
import * as SegTree from "./segmentTree";
import * as Text from "./text";

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

function printTextSegment(textSegment: SegTree.TextSegment, pos: number) {
    console.log(textSegment.text);
    console.log(`at [${pos}, ${pos + textSegment.text.length})`);
    return true;
}

function makeTextSegment(text: string): SegTree.TextSegment {
    return { text: text };
}

function makeCollabTextSegment(text: string, seq = SegTree.UniversalSequenceNumber, clientId = SegTree.LocalClientId): SegTree.TextSegment {
    return { text: text, seq: seq, clientId: clientId };
}

function editFlat(source: string, s: number, dl: number, nt = "") {
    return source.substring(0, s) + nt + source.substring(s + dl, source.length);
}

let accumTime = 0;

function checkInsertSegTree(segTree: SegTree.SegmentTree, pos: number, textSegment: SegTree.TextSegment,
    verbose = false) {
    let checkText = segTree.getText(SegTree.UniversalSequenceNumber, SegTree.LocalClientId);
    checkText = editFlat(checkText, pos, 0, textSegment.text);
    let clockStart = clock();
    segTree.insertInterval(pos, SegTree.UniversalSequenceNumber, SegTree.LocalClientId, SegTree.UniversalSequenceNumber, textSegment);
    accumTime += elapsedMicroseconds(clockStart);
    let updatedText = segTree.getText(SegTree.UniversalSequenceNumber, SegTree.LocalClientId);
    let result = (checkText == updatedText);
    if ((!result) && verbose) {
        console.log(`mismatch(o): ${checkText}`);
        console.log(`mismatch(u): ${updatedText}`);
    }
    return result;
}

function checkRemoveSegTree(segTree: SegTree.SegmentTree, start: number, end: number, verbose = false) {
    let origText = segTree.getText(SegTree.UniversalSequenceNumber, SegTree.LocalClientId);
    let checkText = editFlat(origText, start, end - start);
    let clockStart = clock();
    segTree.removeRange(start, end, SegTree.UniversalSequenceNumber, SegTree.LocalClientId, SegTree.UniversalSequenceNumber);
    accumTime += elapsedMicroseconds(clockStart);
    let updatedText = segTree.getText(SegTree.UniversalSequenceNumber, SegTree.LocalClientId);
    let result = (checkText == updatedText);
    if ((!result) && verbose) {
        console.log(`mismatch(o): ${origText}`);
        console.log(`mismatch(c): ${checkText}`);
        console.log(`mismatch(u): ${updatedText}`);
    }
    return result;
}

function checkMarkRemoveSegTree(segTree: SegTree.SegmentTree, start: number, end: number, verbose = false) {
    let origText = segTree.getText(SegTree.UniversalSequenceNumber, SegTree.LocalClientId);
    let checkText = editFlat(origText, start, end - start);
    let clockStart = clock();
    segTree.markRangeRemoved(start, end, SegTree.UniversalSequenceNumber, SegTree.LocalClientId, SegTree.UniversalSequenceNumber);
    accumTime += elapsedMicroseconds(clockStart);
    let updatedText = segTree.getText(SegTree.UniversalSequenceNumber, SegTree.LocalClientId);
    let result = (checkText == updatedText);
    if ((!result) && verbose) {
        console.log(`mismatch(o): ${origText}`);
        console.log(`mismatch(c): ${checkText}`);
        console.log(`mismatch(u): ${updatedText}`);
    }
    return result;
}

function segTreeTest1() {
    let segTree = SegTree.segmentTree("the cat is on the mat");
    segTree.map({ leaf: printTextSegment }, SegTree.UniversalSequenceNumber, SegTree.LocalClientId);
    let fuzzySeg = makeCollabTextSegment("fuzzy, fuzzy ");
    checkInsertSegTree(segTree, 4, fuzzySeg);
    fuzzySeg = makeCollabTextSegment("fuzzy, fuzzy ");
    checkInsertSegTree(segTree, 4, fuzzySeg);
    checkMarkRemoveSegTree(segTree, 4, 13);
    //checkRemoveSegTree(segTree, 4, 13);
    checkInsertSegTree(segTree, 4, makeCollabTextSegment("fi"));
    segTree.map({ leaf: printTextSegment }, SegTree.UniversalSequenceNumber, SegTree.LocalClientId);
    let segment = segTree.getContainingSegment(4, SegTree.UniversalSequenceNumber, SegTree.LocalClientId);
    console.log(segTree.getOffset(segment, SegTree.UniversalSequenceNumber, SegTree.LocalClientId));
    console.log(segTree.getText(SegTree.UniversalSequenceNumber, SegTree.LocalClientId));
    console.log(segTree.toString());
    SegTree.TestPack().firstTest();
}

function segTreeLargeTest() {
    let segTree = SegTree.segmentTree("the cat is on the mat");
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
        let preLen = segTree.getLength(SegTree.UniversalSequenceNumber, SegTree.LocalClientId);
        let pos = random.integer(0, preLen)(mt);
        let clockStart = clock();
        segTree.insertInterval(pos, SegTree.UniversalSequenceNumber, SegTree.LocalClientId, SegTree.UniversalSequenceNumber, makeCollabTextSegment(s));
        accumTime += elapsedMicroseconds(clockStart);
        if ((i > 0) && (0 == (i % 50000))) {
            let perIter = (accumTime / (i + 1)).toFixed(3);
            treeCount++;
            accumTreeSize += segTree.getLength(SegTree.UniversalSequenceNumber, SegTree.LocalClientId);
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
        let preLen = segTree.getLength(SegTree.UniversalSequenceNumber, SegTree.LocalClientId);
        let pos = random.integer(0, preLen)(mt);
        // console.log(itree.toString());
        let clockStart = clock();
        segTree.removeRange(pos, pos + dlen, SegTree.UniversalSequenceNumber, SegTree.LocalClientId, SegTree.UniversalSequenceNumber);
        accumTime += elapsedMicroseconds(clockStart);

        if ((i > 0) && (0 == (i % 50000))) {
            let perIter = (accumTime / (i + 1)).toFixed(3);
            treeCount++;
            accumTreeSize += segTree.getLength(SegTree.UniversalSequenceNumber, SegTree.LocalClientId);
            let averageTreeSize = (accumTreeSize / treeCount).toFixed(3);
            console.log(`i: ${i} time: ${accumTime}us which is average ${perIter} per del with average tree size ${averageTreeSize}`);
        }
    }
}

function segTreeCheckedTest() {
    let segTree = SegTree.segmentTree("the cat is on the mat");
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
        let preLen = segTree.getLength(SegTree.UniversalSequenceNumber, SegTree.LocalClientId);
        let pos = random.integer(0, preLen)(mt);
        if (!checkInsertSegTree(segTree, pos, makeCollabTextSegment(s), true)) {
            console.log(`i: ${i} preLen ${preLen} pos: ${pos} slen: ${slen} s: ${s} itree len: ${segTree.getLength(SegTree.UniversalSequenceNumber, SegTree.LocalClientId)}`);
            console.log(segTree.toString());
            break;
        }
        if ((i > 0) && (0 == (i % 1000))) {
            let perIter = (accumTime / (i + 1)).toFixed(3);
            treeCount++;
            accumTreeSize += segTree.getLength(SegTree.UniversalSequenceNumber, SegTree.LocalClientId);
            let averageTreeSize = (accumTreeSize / treeCount).toFixed(3);
            console.log(`i: ${i} time: ${accumTime}us which is average ${perIter} per insert with average tree size ${averageTreeSize}`);
        }
    }
    accumTime = 0;
    accumTreeSize = 0;
    treeCount = 0;
    for (let i = 0; i < largeRemoveCount; i++) {
        let dlen = randLargeInt();
        let preLen = segTree.getLength(SegTree.UniversalSequenceNumber, SegTree.LocalClientId);
        let pos = random.integer(0, preLen)(mt);
        // console.log(itree.toString());
        if (!checkRemoveSegTree(segTree, pos, pos + dlen, true)) {
            console.log(`i: ${i} preLen ${preLen} pos: ${pos} dlen: ${dlen} itree len: ${segTree.getLength(SegTree.UniversalSequenceNumber, SegTree.LocalClientId)}`);
            console.log(segTree.toString());
            break;
        }
        if ((i > 0) && (0 == (i % 10))) {
            let perIter = (accumTime / (i + 1)).toFixed(3);
            treeCount++;
            accumTreeSize += segTree.getLength(SegTree.UniversalSequenceNumber, SegTree.LocalClientId);
            let averageTreeSize = (accumTreeSize / treeCount).toFixed(3);
            console.log(`i: ${i} time: ${accumTime}us which is average ${perIter} per large del with average tree size ${averageTreeSize}`);
        }
    }
    accumTime = 0;
    accumTreeSize = 0;
    treeCount = 0;
    for (let i = 0; i < removeCount; i++) {
        let dlen = randInt();
        let preLen = segTree.getLength(SegTree.UniversalSequenceNumber, SegTree.LocalClientId);
        let pos = random.integer(0, preLen)(mt);
        // console.log(itree.toString());
        if (i & 1) {
            if (!checkMarkRemoveSegTree(segTree, pos, pos + dlen, true)) {
                console.log(`i: ${i} preLen ${preLen} pos: ${pos} dlen: ${dlen} itree len: ${segTree.getLength(SegTree.UniversalSequenceNumber, SegTree.LocalClientId)}`);
                console.log(segTree.toString());
                break;
            }
        }
        else {
            if (!checkRemoveSegTree(segTree, pos, pos + dlen, true)) {
                console.log(`i: ${i} preLen ${preLen} pos: ${pos} dlen: ${dlen} itree len: ${segTree.getLength(SegTree.UniversalSequenceNumber, SegTree.LocalClientId)}`);
                console.log(segTree.toString());
                break;
            }

        }
        if ((i > 0) && (0 == (i % 1000))) {
            let perIter = (accumTime / (i + 1)).toFixed(3);
            treeCount++;
            accumTreeSize += segTree.getLength(SegTree.UniversalSequenceNumber, SegTree.LocalClientId);
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
        let preLen = segTree.getLength(SegTree.UniversalSequenceNumber, SegTree.LocalClientId);
        let pos = random.integer(0, preLen)(mt);
        if (!checkInsertSegTree(segTree, pos, makeCollabTextSegment(s), true)) {
            console.log(`i: ${i} preLen ${preLen} pos: ${pos} slen: ${slen} s: ${s} itree len: ${segTree.getLength(SegTree.UniversalSequenceNumber, SegTree.LocalClientId)}`);
            console.log(segTree.toString());
            break;
        }
        if ((i > 0) && (0 == (i % 1000))) {
            let perIter = (accumTime / (i + 1)).toFixed(3);
            treeCount++;
            accumTreeSize += segTree.getLength(SegTree.UniversalSequenceNumber, SegTree.LocalClientId);
            let averageTreeSize = (accumTreeSize / treeCount).toFixed(3);
            console.log(`i: ${i} time: ${accumTime}us which is average ${perIter} per insert with average tree size ${averageTreeSize}`);
        }
    }
    accumTime = 0;
    accumTreeSize = 0;
    treeCount = 0;
    for (let i = 0; i < removeCount; i++) {
        let dlen = randInt();
        let preLen = segTree.getLength(SegTree.UniversalSequenceNumber, SegTree.LocalClientId);
        let pos = random.integer(0, preLen)(mt);
        // console.log(itree.toString());
        if (i & 1) {
            if (!checkMarkRemoveSegTree(segTree, pos, pos + dlen, true)) {
                console.log(`i: ${i} preLen ${preLen} pos: ${pos} dlen: ${dlen} itree len: ${segTree.getLength(SegTree.UniversalSequenceNumber, SegTree.LocalClientId)}`);
                console.log(segTree.toString());
                break;
            }
        }
        else {
            if (!checkRemoveSegTree(segTree, pos, pos + dlen, true)) {
                console.log(`i: ${i} preLen ${preLen} pos: ${pos} dlen: ${dlen} itree len: ${segTree.getLength(SegTree.UniversalSequenceNumber, SegTree.LocalClientId)}`);
                console.log(segTree.toString());
                break;
            }

        }
        if ((i > 0) && (0 == (i % 1000))) {
            let perIter = (accumTime / (i + 1)).toFixed(3);
            treeCount++;
            accumTreeSize += segTree.getLength(SegTree.UniversalSequenceNumber, SegTree.LocalClientId);
            let averageTreeSize = (accumTreeSize / treeCount).toFixed(3);
            console.log(`i: ${i} time: ${accumTime}us which is average ${perIter} per del with average tree size ${averageTreeSize}`);
        }
    }

}

//simpleTest();
//fileTest1();
//integerTest1();
//segTreeTest1();
//segTreeLargeTest();
//segTreeCheckedTest();
let testPack = SegTree.TestPack();
//testPack.randolicious();
testPack.clientServer("pp.txt");
//testPack.firstTest();