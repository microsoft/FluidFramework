// tslint:disable

import * as fs from "fs";
import * as minimist from "minimist";
import * as Collections from "../../merge-tree/collections";
import * as random from "random-js";
import * as MergeTree from "../../merge-tree";
import * as Base from "../../merge-tree/base";
import * as ops from "../../merge-tree/ops";
import * as Text from "../../merge-tree/text";
import * as JsDiff from "diff";
import * as Paparazzo from "../../merge-tree/snapshot";
import * as express from "express";
import * as path from "path";

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

export function simpleTest() {
    let a = [
        "Aardvark", "cute",
        "Baboon", "big",
        "Chameleon", "colorful",
        "Dingo", "wild"
    ];

    let beast = new Collections.RedBlackTree<string, string>(compareStrings);
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

function took(desc: string, start: [number, number]) {
    // let end: number[] = process.hrtime(start);
    let duration = elapsedMilliseconds(start);
    console.log(`${desc} took ${duration} ms`);
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

class Server {
    server: MergeTree.TestServer;
    proxyClient: MergeTree.Client;
    snapshot: Paparazzo.Snapshot;
    html: string;

    constructor(filename?: string) {
        this.server = new MergeTree.TestServer("");
        if (filename) {
            Text.loadTextFromFile(filename, this.server.mergeTree);
        }
        this.proxyClient = new MergeTree.Client("");
        this.server.addListeners([this.proxyClient]);
        this.snapshot = new Paparazzo.Snapshot(this.server.mergeTree);
        this.snapshot.extractSync();
        let clockStart = clock();
        this.html = this.snapToHTML(8000);
        console.log(`snap to html took ${elapsedMicroseconds(clockStart)}`);
    }

    segsToHTML(segTexts: string[], lengthLimit?: number) {
        let buf = "<div style='line-height:120%;font-size:18px;font-famliy:Helvetica'><div>";
        let segCount = segTexts.length;
        let charLength = 0;
        for (let i = 0; i < segCount; i++) {
            let segText = segTexts[i];
            let styleAttr = "";
            if (segText.indexOf("Chapter") >= 0) {
                styleAttr = " style='font-size:140%;line-height:150%'";
            }
            else {
                segText = segText.replace(/_([a-zA-Z]+)_/g, "<span style='font-style:italic'>$1</span>");
            }
            buf += `<span${styleAttr}>${segText}</span>`
            if (segText.charAt(segText.length - 1) == '\n') {
                buf += "</div><div>";
            }
            charLength += segText.length;
            if (lengthLimit && (charLength >= lengthLimit)) {
                break;
            }
        }
        buf += "</div></div>";
        return buf;
    }

    snapToHTML(lengthLimit?: number) {
        // let segTexts = this.snapshot.texts;
        let buf = "<!DOCTYPE html><html><head>";
        buf += "<script src='static/bro.js'></script><script src='static/driver.js'></script>";
        buf += "</head><body onload='eff()' style='overflow:hidden'>";
        //buf += this.segsToHTML(segTexts, lengthLimit);
        buf += "</body></html>";
        return buf;
    }

    getCharLengthSegs(alltexts: ops.IPropertyString[], approxCharLength: number, clientId: string,
        startIndex = 0): ops.MergeTreeChunk {
        //console.log(`start index ${startIndex}`);
        let texts = <ops.IPropertyString[]>[];
        let lengthChars = 0;
        let segCount = 0;
        while ((lengthChars < approxCharLength) && ((startIndex + segCount) < alltexts.length)) {
            let ptext = alltexts[startIndex + segCount];
            segCount++;
            texts.push(ptext);
            lengthChars += ptext.text.length;
        }
        return {
            chunkStartSegmentIndex: startIndex,
            chunkSegmentCount: segCount,
            chunkLengthChars: lengthChars,
            totalLengthChars: this.snapshot.header.segmentsTotalLength,
            totalSegmentCount: alltexts.length,
            chunkSequenceNumber: this.snapshot.header.seq,
            segmentTexts: texts
        }
    }

    startListening() {
        let app = express();
        app.use("/static", express.static(path.join(__dirname, "/public")));

        app.get("/obj", (req, res) => {
            if (req.query.init) {
                res.json(this.getCharLengthSegs(this.snapshot.texts, 10000, "FurryFox", 0));
            }
            else {
                res.json(this.getCharLengthSegs(this.snapshot.texts, 10000, "FurryFox", +req.query.startSegment));
            }
        });

        app.get("/", (req, res) => {
            res.send(this.html);
        });
        app.listen(3002, () => {
            console.log("listening on port 3002");
        });
    }
}


export function integerTest1() {
    let mt = random.engines.mt19937();
    mt.seedWithArray([0xdeadbeef, 0xfeedbed]);
    const imin = 0;
    const imax = 10000000;
    const intCount = 1100000;
    let distribution = random.integer(imin, imax);
    let beast = new Collections.RedBlackTree<number, number>(compareNumbers);

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
        /* let prop = */ beast.get(cp);
    }
    let getdur = took("get all keys", start);
    console.log(`cost per get is ${(1000.0 * getdur / intCount).toFixed(3)} us`);
    beast.diag();
    console.log(`duplicates ${conflictCount}, errors ${errorCount}`);
}

export function fileTest1() {
    let content = fs.readFileSync(path.join(__dirname, "../../../public/literature/shakespeare.txt"), "utf8");
    let a = content.split('\n');
    let iterCount = a.length >> 2;
    const removeCount = 10;
    console.log("len: " + a.length);

    for (let k = 0; k < iterCount; k++) {
        let beast = new Collections.RedBlackTree<string, number>(compareStrings);
        let linearBeast = Collections.LinearDictionary<string, number>(compareStrings);
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
    console.log(textSegment.toString());
    console.log(`at [${pos}, ${pos + textSegment.text.length})`);
    return true;
}

export function makeTextSegment(text: string): MergeTree.Node {
    return new MergeTree.TextSegment(text);
}

function makeCollabTextSegment(text: string, seq = MergeTree.UniversalSequenceNumber, clientId = MergeTree.LocalClientId) {
    return new MergeTree.TextSegment(text, seq, clientId);
}

function editFlat(source: string, s: number, dl: number, nt = "") {
    return source.substring(0, s) + nt + source.substring(s + dl, source.length);
}

let accumTime = 0;

function checkInsertMergeTree(mergeTree: MergeTree.MergeTree, pos: number, textSegment: MergeTree.TextSegment,
    verbose = false) {
    let checkText = mergeTree.getText(MergeTree.UniversalSequenceNumber, MergeTree.LocalClientId);
    checkText = editFlat(checkText, pos, 0, textSegment.text);
    let clockStart = clock();
    mergeTree.insertText(pos, MergeTree.UniversalSequenceNumber, MergeTree.LocalClientId, MergeTree.UniversalSequenceNumber,
        textSegment.text);
    accumTime += elapsedMicroseconds(clockStart);
    let updatedText = mergeTree.getText(MergeTree.UniversalSequenceNumber, MergeTree.LocalClientId);
    let result = (checkText == updatedText);
    if ((!result) && verbose) {
        console.log(`mismatch(o): ${checkText}`);
        console.log(`mismatch(u): ${updatedText}`);
    }
    return result;
}

function checkRemoveMergeTree(mergeTree: MergeTree.MergeTree, start: number, end: number, verbose = false) {
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

function checkMarkRemoveMergeTree(mergeTree: MergeTree.MergeTree, start: number, end: number, verbose = false) {
    let origText = mergeTree.getText(MergeTree.UniversalSequenceNumber, MergeTree.LocalClientId);
    let checkText = editFlat(origText, start, end - start);
    let clockStart = clock();
    mergeTree.markRangeRemoved(start, end, MergeTree.UniversalSequenceNumber, MergeTree.LocalClientId, MergeTree.UniversalSequenceNumber);
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

export function mergeTreeTest1() {
    let mergeTree = new MergeTree.MergeTree("the cat is on the mat");
    mergeTree.map({ leaf: printTextSegment }, MergeTree.UniversalSequenceNumber, MergeTree.LocalClientId);
    let fuzzySeg = makeCollabTextSegment("fuzzy, fuzzy ");
    checkInsertMergeTree(mergeTree, 4, fuzzySeg);
    fuzzySeg = makeCollabTextSegment("fuzzy, fuzzy ");
    checkInsertMergeTree(mergeTree, 4, fuzzySeg);
    checkMarkRemoveMergeTree(mergeTree, 4, 13);
    //checkRemoveSegTree(segTree, 4, 13);
    checkInsertMergeTree(mergeTree, 4, makeCollabTextSegment("fi"));
    mergeTree.map({ leaf: printTextSegment }, MergeTree.UniversalSequenceNumber, MergeTree.LocalClientId);
    let segoff = mergeTree.getContainingSegment(4, MergeTree.UniversalSequenceNumber, MergeTree.LocalClientId);
    console.log(mergeTree.getOffset(segoff.segment, MergeTree.UniversalSequenceNumber, MergeTree.LocalClientId));
    console.log(mergeTree.getText(MergeTree.UniversalSequenceNumber, MergeTree.LocalClientId));
    console.log(mergeTree.toString());
    TestPack().firstTest();
}

export function mergeTreeLargeTest() {
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
        mergeTree.insertText(pos, MergeTree.UniversalSequenceNumber, MergeTree.LocalClientId, MergeTree.UniversalSequenceNumber,
            s);
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

export function mergeTreeCheckedTest() {
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
        if (!checkInsertMergeTree(segTree, pos, makeCollabTextSegment(s), true)) {
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
        if (!checkRemoveMergeTree(segTree, pos, pos + dlen, true)) {
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
            if (!checkMarkRemoveMergeTree(segTree, pos, pos + dlen, true)) {
                console.log(`i: ${i} preLen ${preLen} pos: ${pos} dlen: ${dlen} itree len: ${segTree.getLength(MergeTree.UniversalSequenceNumber, MergeTree.LocalClientId)}`);
                console.log(segTree.toString());
                break;
            }
        }
        else {
            if (!checkRemoveMergeTree(segTree, pos, pos + dlen, true)) {
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
        if (!checkInsertMergeTree(segTree, pos, makeCollabTextSegment(s), true)) {
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
            if (!checkMarkRemoveMergeTree(segTree, pos, pos + dlen, true)) {
                console.log(`i: ${i} preLen ${preLen} pos: ${pos} dlen: ${dlen} itree len: ${segTree.getLength(MergeTree.UniversalSequenceNumber, MergeTree.LocalClientId)}`);
                console.log(segTree.toString());
                break;
            }
        }
        else {
            if (!checkRemoveMergeTree(segTree, pos, pos + dlen, true)) {
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

enum AsyncRoundState {
    Insert,
    Remove,
    Tail
}

interface AsyncRoundInfo {
    clientIndex: number;
    state: AsyncRoundState;
    insertSegmentCount?: number;
    removeSegmentCount?: number;
    iterIndex: number;
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

    let checkIncr = false;

    let getTextTime = 0;
    let getTextCalls = 0;
    let incrGetTextTime = 0;
    let incrGetTextCalls = 0;
    let catchUpTime = 0;
    let catchUps = 0;

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
            console.log(`local time ${client.localTime} us ops: ${client.localOps} ave time ${aveLocalTime}`);
        }
        console.log(`get text time: ${aveGetTextTime} incr: ${aveIncrGetTextTime} catch up ${aveCatchUpTime}`);
        console.log(`accum time ${client.accumTime} us ops: ${client.accumOps} ave time ${aveTime} - wtime ${adjTime} pack ${avePackTime} ave window ${aveWindow}`);
        console.log(`accum window time ${client.accumWindowTime} us ave window time total ${aveWindowTime} not in ops ${aveExtraWindowTime}; max ${client.maxWindowTime}`);
    }

    function manyMergeTrees() {
        const mergeTreeCount = 2000000;
        let a = <MergeTree.MergeTree[]>Array(mergeTreeCount);
        for (let i = 0; i < mergeTreeCount; i++) {
            a[i] = new MergeTree.MergeTree("");
        }
        for (; ;);
    }

    function clientServer(startFile?: string) {
        const clientCount = 5;
        const fileSegCount = 0;
        let initString = "";
        let snapInProgress = false;
        let asyncExec = false;
        let addSnapClient = false;
        let extractSnap = false;
        let includeMarkers = false;

        let testSyncload = false;
        let snapClient: MergeTree.Client;

        if (!startFile) {
            initString = "don't ask for whom the bell tolls; it tolls for thee";
        }
        let server = new MergeTree.TestServer(initString);
        server.measureOps = true;
        if (startFile) {
            Text.loadTextFromFile(startFile, server.mergeTree, fileSegCount);
        }

        let clients = <MergeTree.Client[]>Array(clientCount);
        for (let i = 0; i < clientCount; i++) {
            clients[i] = new MergeTree.Client(initString);
            clients[i].measureOps = true;
            if (startFile) {
                Text.loadTextFromFile(startFile, clients[i].mergeTree, fileSegCount);
            }
            clients[i].startCollaboration(`Fred${i}`);
        }
        server.startCollaboration("theServer");
        server.addClients(clients);
        if (testSyncload) {
            let clockStart = clock();
            let segs = Paparazzo.Snapshot.loadSync("snap-initial");
            console.log(`sync load time ${elapsedMicroseconds(clockStart)}`);
            let fromLoad = new MergeTree.MergeTree("");
            fromLoad.reloadFromSegments(segs);
            let fromLoadText = fromLoad.getText(MergeTree.UniversalSequenceNumber, MergeTree.NonCollabClient);
            let serverText = server.getText();
            if (fromLoadText != serverText) {
                console.log('snap file vs. text file mismatch');
            }
        }
        if (addSnapClient) {
            snapClient = new MergeTree.Client(initString);
            if (startFile) {
                Text.loadTextFromFile(startFile, snapClient.mergeTree, fileSegCount);
            }
            snapClient.startCollaboration("snapshot");
            server.addListeners([snapClient]);
        }
        function incrGetText(client: MergeTree.Client) {
            let collabWindow = client.mergeTree.getCollabWindow();
            return client.mergeTree.incrementalGetText(collabWindow.currentSeq, collabWindow.clientId);
        }

        function checkTextMatch() {
            //console.log(`checking text match @${server.getCurrentSeq()}`);
            let clockStart = clock();
            let serverText = server.getText();
            getTextTime += elapsedMicroseconds(clockStart);
            getTextCalls++;
            if (checkIncr) {
                clockStart = clock();
                let serverIncrText = incrGetText(server);
                incrGetTextTime += elapsedMicroseconds(clockStart);
                incrGetTextCalls++;
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

        let rounds = 80000;
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
            if (includeMarkers) {
                server.enqueueMsg(client.makeInsertMarkerMsg("test", ops.MarkerBehaviors.Tile,
                    pos, MergeTree.UnassignedSequenceNumber, client.getCurrentSeq(), ""));
                client.insertMarkerLocal(pos, ops.MarkerBehaviors.Tile,
                     { [MergeTree.reservedMarkerLabelsKey]: "test"});
            }
            server.enqueueMsg(client.makeInsertMsg(text, pos, MergeTree.UnassignedSequenceNumber,
                client.getCurrentSeq(), server.longClientId));
            client.insertTextLocal(text, pos);
            if (MergeTree.useCheckQ) {
                client.enqueueTestString();
            }
        }

        function randomSpateOfRemoves(client: MergeTree.Client) {
            let dlen = randTextLength();
            let preLen = client.getLength();
            let pos = random.integer(0, preLen)(mt);
            server.enqueueMsg(client.makeRemoveMsg(pos, pos + dlen, MergeTree.UnassignedSequenceNumber,
                client.getCurrentSeq(), server.longClientId));
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
                server.enqueueMsg(client.makeRemoveMsg(removeStart, removeEnd, MergeTree.UnassignedSequenceNumber,
                    client.getCurrentSeq(), server.longClientId));
                client.removeSegmentLocal(removeStart, removeEnd);
                if (MergeTree.useCheckQ) {
                    client.enqueueTestString();
                }
                let word2 = Text.findRandomWord(client.mergeTree, client.getClientId());
                while (!word2) {
                    word2 = Text.findRandomWord(client.mergeTree, client.getClientId());
                }
                let pos = word2.pos + word2.text.length;
                server.enqueueMsg(client.makeInsertMsg(word1.text, pos, MergeTree.UnassignedSequenceNumber,
                    client.getCurrentSeq(), server.longClientId));
                client.insertTextLocal(word1.text, pos);
                if (MergeTree.useCheckQ) {
                    client.enqueueTestString();
                }
            }
        }

        let errorCount = 0;

        function asyncRoundStep(asyncInfo: AsyncRoundInfo, roundCount: number) {
            if (asyncInfo.state == AsyncRoundState.Insert) {
                if (!asyncInfo.insertSegmentCount) {
                    asyncInfo.insertSegmentCount = randSmallSegmentCount();
                }
                if (asyncInfo.clientIndex == clients.length) {
                    asyncInfo.state = AsyncRoundState.Remove;
                    asyncInfo.iterIndex = 0;
                }
                else {
                    let client = clients[asyncInfo.clientIndex];
                    if (startFile) {
                        randomWordMove(client);
                    }
                    else {
                        randomSpateOfInserts(client, asyncInfo.iterIndex);
                    }
                    asyncInfo.iterIndex++;
                    if (asyncInfo.iterIndex == asyncInfo.insertSegmentCount) {
                        asyncInfo.clientIndex++;
                        asyncInfo.insertSegmentCount = undefined;
                        asyncInfo.iterIndex = 0;
                    }
                }
            }
            if (asyncInfo.state == AsyncRoundState.Remove) {
                if (!asyncInfo.removeSegmentCount) {
                    asyncInfo.removeSegmentCount = Math.floor(3 * asyncInfo.insertSegmentCount / 4);
                    if (asyncInfo.removeSegmentCount < 1) {
                        asyncInfo.removeSegmentCount = 1;
                    }
                }
                if (asyncInfo.clientIndex == clients.length) {
                    asyncInfo.state = AsyncRoundState.Tail;
                }
                else {
                    let client = clients[asyncInfo.clientIndex];
                    if (startFile) {
                        randomWordMove(client);
                    }
                    else {
                        randomSpateOfInserts(client, asyncInfo.iterIndex);
                    }
                    asyncInfo.iterIndex++;
                    if (asyncInfo.iterIndex == asyncInfo.removeSegmentCount) {
                        asyncInfo.clientIndex++;
                        asyncInfo.removeSegmentCount = undefined;
                        asyncInfo.iterIndex = 0;
                    }
                }
            }
            if (asyncInfo.state == AsyncRoundState.Tail) {
                finishRound(roundCount);
            }
            else {
                setImmediate(asyncRoundStep, asyncInfo, roundCount);
            }
        }

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

            if (extractSnap) {
                let clockStart = clock();
                let snapshot = new Paparazzo.Snapshot(snapClient.mergeTree);
                snapshot.extractSync();
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
                    return;
                }
                checkTime += elapsedMicroseconds(clockStart);
                console.log(`wall clock is ${((Date.now() - startTime) / 1000.0).toFixed(1)}`);
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
        let checkSnapText = true;

        function snapFinished() {
            snapInProgress = false;
            let curmin = snapClient.mergeTree.getCollabWindow().minSeq;
            console.log(`snap finished round ${asyncRoundCount} server seq ${server.getCurrentSeq()} seq ${snapClient.getCurrentSeq()} minseq ${curmin}`);
            let clockStart = clock();
            //snapClient.verboseOps = true;
            clientProcessSome(snapClient, true);
            catchUpTime += elapsedMicroseconds(clockStart);
            catchUps++;
            if (checkSnapText) {
                let serverText = server.getText();
                let snapText = snapClient.getText();
                if (serverText != snapText) {
                    console.log(`mismatch @${server.getCurrentSeq()} client @${snapClient.getCurrentSeq()} id: ${snapClient.getClientId()}`);
                }
            }
        }

        function ohSnap(filename: string) {
            snapInProgress = true;
            let curmin = snapClient.mergeTree.getCollabWindow().minSeq;
            lastSnap = curmin;
            console.log(`snap started seq ${snapClient.getCurrentSeq()} minseq ${curmin}`);
            let snapshot = new Paparazzo.Snapshot(snapClient.mergeTree, filename, snapFinished);
            snapshot.start();
        }

        function asyncStep() {
            round(asyncRoundCount);
            let curmin = server.mergeTree.getCollabWindow().minSeq;
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
    }

    function randolicious() {
        let insertRounds = 800;
        let removeRounds = 700;

        let cliA = new MergeTree.Client("a stitch in time saves nine");
        cliA.startCollaboration("FredA");
        let cliB = new MergeTree.Client("a stitch in time saves nine");
        cliB.startCollaboration("FredB");
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
                    cliB.insertTextRemote(text, pos, undefined, sequenceNumber++, cliA.getCurrentSeq(), cliA.mergeTree.getCollabWindow().clientId);
                    cliA.insertTextLocal(text, pos);
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
                    cliA.insertTextRemote(text, pos, undefined, sequenceNumber++, cliB.getCurrentSeq(), cliB.mergeTree.getCollabWindow().clientId);
                    cliB.insertTextLocal(text, pos);
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
                    cliB.removeSegmentRemote(pos, pos + dlen, sequenceNumber++, cliA.getCurrentSeq(), cliA.mergeTree.getCollabWindow().clientId);
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
                    cliA.removeSegmentRemote(pos, pos + dlen, sequenceNumber++, cliB.getCurrentSeq(), cliB.mergeTree.getCollabWindow().clientId);
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
            console.log(`sequence number: ${cliA.getCurrentSeq()} min: ${cliA.mergeTree.getCollabWindow().minSeq}`);
            //            console.log(cliA.mergeTree.toString());

            console.log(`testing remove at ${cliA.getCurrentSeq()} and ${cliB.getCurrentSeq()}`);
            if (removeTest()) {
                console.log(cliA.mergeTree.toString());
                console.log(cliB.mergeTree.toString());
            }
        }
        console.log(`sequence number: ${cliA.getCurrentSeq()} min: ${cliA.mergeTree.getCollabWindow().minSeq}`);
        //                console.log(cliA.mergeTree.toString());
        //console.log(cliB.mergeTree.toString());
        //console.log(cliA.getText());
        let aveWindow = ((minSegCount + maxSegCount) / 2).toFixed(1);
        let aveTime = (cliA.accumTime / cliA.accumOps).toFixed(3);
        let aveWindowTime = (cliA.accumWindowTime / cliA.accumOps).toFixed(3);
        console.log(`accum time ${cliA.accumTime} us ops: ${cliA.accumOps} ave window ${aveWindow} ave time ${aveTime}`)
        console.log(`accum window time ${cliA.accumWindowTime} us ave window time ${aveWindowTime}; max ${cliA.maxWindowTime}`)
        //console.log(cliB.getText());
    }

    let clientNames = ["Ed", "Ted", "Ned", "Harv", "Marv", "Glenda", "Susan"];
    function firstTest() {
        let cli = new MergeTree.Client("on the mat.");
        cli.startCollaboration("Fred1");
        for (let cname of clientNames) {
            cli.addLongClientId(cname);
        }
        cli.insertTextRemote("that ", 0, undefined, 1, 0, 1);
        console.log(cli.mergeTree.toString());
        cli.insertTextRemote("fat ", 0, undefined, 2, 0, 2);
        console.log(cli.mergeTree.toString());
        cli.insertTextLocal("cat ", 5);
        console.log(cli.mergeTree.toString());
        for (let i = 0; i < 4; i++) {
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
        cli.insertMarkerRemote({ behaviors: ops.MarkerBehaviors.Tile }, 0, 
            { [MergeTree.reservedMarkerLabelsKey]: ["peach"]},
            5, 0, 2)
        cli.insertTextRemote("very ", 6, undefined, 4, 2, 2);
        console.log(cli.mergeTree.toString());
        for (let clientId = 0; clientId < 4; clientId++) {
            for (let refSeq = 0; refSeq < 7; refSeq++) {
                console.log(cli.relText(clientId, refSeq));
            }
        }
        cli.updateMinSeq(6);
        let segs = new Paparazzo.Snapshot(cli.mergeTree).extractSync();
        for (let seg of segs) {
            if (seg.text !== undefined) {
                console.log(seg.text);
            }
            else {
                console.log(seg.marker.toString());
            }
        }
        cli = new MergeTree.Client(" old sock!");
        cli.startCollaboration("Fred2");
        for (let cname of clientNames) {
            cli.addLongClientId(cname);
        }
        cli.insertTextRemote("abcde", 0, undefined, 1, 0, 2);
        cli.insertTextRemote("yyy", 0, undefined, 2, 0, 1);
        cli.insertTextRemote("zzz", 2, undefined, 3, 1, 3);
        cli.insertTextRemote("EAGLE", 1, undefined, 4, 1, 4);
        cli.insertTextRemote("HAS", 4, undefined, 5, 1, 5);
        cli.insertTextLocal(" LANDED", 19);
        cli.insertTextRemote("yowza: ", 0, undefined, 6, 4, 2);
        cli.mergeTree.ackPendingSegment(7);
        console.log(cli.mergeTree.toString());
        for (let clientId = 0; clientId < 6; clientId++) {
            for (let refSeq = 0; refSeq < 8; refSeq++) {
                console.log(cli.relText(clientId, refSeq));
            }
        }
        cli.removeSegmentRemote(3, 5, 8, 6, 1);
        console.log(cli.mergeTree.toString());
        for (let clientId = 0; clientId < 6; clientId++) {
            for (let refSeq = 0; refSeq < 9; refSeq++) {
                console.log(cli.relText(clientId, refSeq));
            }
        }
        cli = new MergeTree.Client("abcdefgh");
        cli.startCollaboration("Fred3");
        for (let cname of clientNames) {
            cli.addLongClientId(cname);
        }
        cli.removeSegmentRemote(1, 3, 1, 0, 3);
        console.log(cli.mergeTree.toString());
        cli.insertTextRemote("zzz", 2, undefined, 2, 0, 2);
        console.log(cli.mergeTree.toString());
        
        let fwdRanges = cli.mergeTree.tardisRange(0,5, 1, 2);
        console.log(`fwd range 0 5 on 1 => 2`);
        for (let r of fwdRanges) {
            console.log(`fwd range (${r.start}, ${r.end})`);
        }
        let fwdPos = cli.mergeTree.tardisPosition(2, 1, 2);
        console.log(`fwd pos 2 on 1 => 2 is ${fwdPos}`);
        for (let clientId = 0; clientId < 4; clientId++) {
            for (let refSeq = 0; refSeq < 3; refSeq++) {
                console.log(cli.relText(clientId, refSeq));
            }
        }
        cli.insertTextRemote(" chaser", 9, undefined, 3, 2, 3);
        cli.removeSegmentLocal(12, 14);
        cli.mergeTree.ackPendingSegment(4);
        console.log(cli.mergeTree.toString());
        for (let clientId = 0; clientId < 4; clientId++) {
            for (let refSeq = 0; refSeq < 5; refSeq++) {
                console.log(cli.relText(clientId, refSeq));
            }
        }
        cli.insertTextLocal("*yolumba*", 14);
        cli.insertTextLocal("-zanzibar-", 17);
        cli.mergeTree.ackPendingSegment(5);
        cli.insertTextRemote("(aaa)", 2, undefined, 6, 4, 2);
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

function compareProxStrings(a: Collections.ProxString<number>, b: Collections.ProxString<number>) {
    let ascore = (a.invDistance * 200) + a.val;
    let bscore = (b.invDistance * 200) + b.val;
    return bscore - ascore;
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
    let tree = new Collections.TST<boolean>();
    let entries = ["giraffe", "hut", "aardvark", "gold", "hover", "yurt", "hot", "antelope", "gift", "banana"];
    for (let entry of entries) {
        tree.put(entry, true);
    }
    for (let entry of entries) {
        console.log(`get ${entry}: ${tree.get(entry)}`);
    }
    let p1 = tree.keysWithPrefix("g");
    let p2 = tree.keysWithPrefix("gi");
    console.log(p1);
    console.log(p2);
    let p3 = tree.neighbors("hat");
    console.log(p3);
    let ntree = new Collections.TST<number>();
    let filename = path.join(__dirname, "../../public/literature/dict.txt")
    let content = fs.readFileSync(filename, "utf8");
    let splitContent = content.split(/\r\n|\n/g);
    let corpusFilename = path.join(__dirname, "../../../public/literature/pp.txt")
    let corpusContent = fs.readFileSync(corpusFilename, "utf8");
    let corpusTree = new Collections.TST<number>();
    function addCorpus(corpusContent: string, corpusTree: Collections.TST<number>) {
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
    let count = addCorpus(corpusContent, corpusTree);
    corpusFilename = path.join(__dirname, "../../public/literature/shakespeare.txt")
    corpusContent = fs.readFileSync(corpusFilename, "utf8");
    count += addCorpus(corpusContent, corpusTree);
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
    console.log(`size: ${ntree.size()}; random insert takes ${elapsedMilliseconds(clockStart)}ms`);
    for (let entry of a) {
        if (!ntree.get(entry)) {
            console.log(`biff ${entry}`);
        }
    }
    let p4 = ntree.neighbors("het").sort(compareProxStrings);
    console.log(p4);
    p4 = ntree.neighbors("peech").sort(compareProxStrings);
    console.log(p4);
    p4 = ntree.neighbors("tihs").sort(compareProxStrings);
    console.log(p4);
}

let testTST = false;
if (testTST) {
    tst();
}

describe("Routerlicious", () => {
    const DefaultTimeout = 120000;

    describe("merge-tree", () => {
        it("simpleTest", () => {
            simpleTest();
        });

        it("integerTest1", () => {
            integerTest1();
        }).timeout(DefaultTimeout);

        it("mergeTreeTest1", () => {
            mergeTreeTest1();
        });

        it("mergeTreeLargeTest", () => {
            mergeTreeLargeTest();
        }).timeout(DefaultTimeout);

        it("firstTest", () => {
            const testPack = TestPack();
            testPack.firstTest();
        });
    });

    // As we port over to mocha the below tests can be conditionally enabled by setting the beast flag. But
    // are skipped by default.
    const parsedArgs = minimist(process.argv.slice(2));
    const conditionalDescribe = parsedArgs.beast ? describe : describe.skip;

    conditionalDescribe("merge-tree", () => {
        // TODO need to adjust timings on the below

        it("fileTest1", () => {
            fileTest1();
        }).timeout(Number.MAX_VALUE);

        it("randolicious", () => {
            const testPack = TestPack();
            testPack.randolicious();
        }).timeout(Number.MAX_VALUE);

        it("mergeTreeCheckedTest", () => {
            mergeTreeCheckedTest();
        }).timeout(Number.MAX_VALUE);

        it("beastTest", () => {
            const testPack = TestPack();
            const filename = path.join(__dirname, "../../../public/literature", "pp.txt");
            testPack.clientServer(filename);
            new Server();
        }).timeout(Number.MAX_VALUE)
    });
});
