/// <reference path="node.d.ts" />
/// <reference path="base.d.ts" />
/// <reference path="typings/index.d.ts" />

import * as fs from "fs";
import * as RedBlack from "./redBlack";
import BTree from "./btree";
import * as random from "random-js";
import * as ITree from "./intervalSpanningTree";

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

    let beast = RedBlack.RedBlackTree<string, string>(compareStrings);
    let btree = BTree<string,string>(compareStrings);
    for (let i = 0; i < a.length; i += 2) {
        beast.put(a[i], a[i + 1]);
        btree.put(a[i],a[i+1])
    }
    beast.map(printStringProperty);
    btree.map(printStringProperty);
    console.log("Map B D");
    btree.mapRange(printStringProperty,undefined,"B","D");
    console.log("Map Aardvark Dingo");
    btree.mapRange(printStringProperty,undefined,"Aardvark","Dingo");
    console.log("Map Baboon Chameleon");
    btree.mapRange(printStringProperty,undefined,"Baboon","Chameleon");
    printStringProperty(beast.get("Chameleon"));
    printStringProperty(btree.get("Chameleon"));
}

function clock() {
    return process.hrtime();
}

function took(desc: string, start: number[]) {
    let end:number[] = process.hrtime(start);
    let duration =  Math.round((end[0]*1000) + (end[1]/1000000));
    console.log(`${desc} took ${duration} ms`);
    return duration;
}

function integerTest1() {
    let mt = random.engines.mt19937();
    mt.seedWithArray([0xdeadbeef, 0xfeedbed]);
    const imin = 0;
    const imax = 10000000;
    const intCount = 1100000;
    let distribution = random.integer(imin, imax);
    let beast = RedBlack.RedBlackTree<number, number>(compareNumbers);
    let btree = BTree<number, number>(compareNumbers);

    function randInt() {
        return distribution(mt);
    }
    let pos = new Array<number>(intCount);
    let i = 0;
    let redo = false;
    function onConflict(key: number, current: number, proposed:number) {
        redo=true;
        return current;
    }
    let conflictCount=0;
    let start = clock();
    while (i < intCount) {
        pos[i] = randInt();
        beast.put(pos[i], i, onConflict);
        if (!redo) {
            btree.put(pos[i],i);
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
        //let btprop = btree.get(cp);
        /*
        if (prop && btprop) {
            if (prop.data != j) {
                //console.log("data does not match index: " + j);
                errorCount++;
            }
            if (prop.data != btprop.data) {
                errorCount++;
            }
        }
        else {
            console.log("hmm...bad key: " + cp);
            errorCount++;
        }
        */
    }
    let getdur=took("get all keys", start);
    console.log(`cost per get is ${(1000.0*getdur/intCount).toFixed(3)} us`);
    beast.diag();
    btree.diag();
    console.log(`duplicates ${conflictCount}, errors ${errorCount}`);
}

function fileTest1() {
    let content = fs.readFileSync("pizzaingredients.txt", "utf8");
    let a = content.split('\n');
    let iterCount = a.length >> 2;
    const removeCount = 10;
    console.log("len: " + a.length);

    for (let k = 0; k < iterCount; k++) {
        let beast = RedBlack.RedBlackTree<string, number>(compareStrings);
        let linearBeast = RedBlack.LinearDictionary<string, number>(compareStrings);
        let btree = BTree<string, number>(compareStrings);
        for (let i = 0, len = a.length; i < len; i++) {
            a[i] = a[i].trim();
            if (a[i].length > 0) {
                beast.put(a[i], i);
                linearBeast.put(a[i], i);
                btree.put(a[i],i);
            }
        }
        if (k == 0) {
            beast.map(printStringNumProperty);
            console.log("BTREE...");
            btree.map(printStringNumProperty);
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
                let btProp = btree.get(animal);
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
                if (!btProp) {
                    console.log("hmm...bad btree key: " + animal)
                }
            }
        }
        beast.diag();
        linearBeast.diag();
        btree.diag();
    }
}

function printTextSegment(textSegment: ITree.TextSegment, pos: number) {
    console.log(textSegment.content);
    console.log(`at [${pos}, ${pos+textSegment.content.length}) with attributes: `);
    for (let key in textSegment.attributes) {
        if (textSegment.attributes.hasOwnProperty(key)) {
            console.log(`    ${key}: ${textSegment.attributes[key]}`);
        }
    }
    return true;
}

function makeTextSegment(text: string, attributes: any) : ITree.TextSegment {
    return { content: text, attributes: attributes};
}

function itreeTest1() {
    let attr = { font: "Helvetica" };
    let itree = ITree.IntervalSpanningTree("the cat is on the mat", attr);
    itree.setAttributes(4, 3, <ITree.Attributes>{ bold: true })
    itree.map(printTextSegment);
    let fuzzySeg = makeTextSegment("fuzzy, fuzzy", { italic: true});
    itree.insertInterval(4, fuzzySeg);
    itree.map(printTextSegment);
}

//simpleTest();
//fileTest1();
integerTest1();
//itreeTest1();