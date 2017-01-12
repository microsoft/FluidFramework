/// <reference path="node.d.ts" />
import * as fs from "fs";
import * as Base from "./redBlack"


function compareStrings(a: string, b: string) {
    return a.localeCompare(b);
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

    let beast = Base.RedBlackTree<string, string>(compareStrings);
    for (let i = 0; i < a.length; i += 2) {
        beast.put(a[i], a[i + 1]);
    }
    beast.map(printStringProperty);
    printStringProperty(beast.get("Chameleon"));
}


function fileTest1() {
    let content = fs.readFileSync("pizzaingredients.txt", "utf8");
    let a = content.split('\n');
    let nRand = a.length>>2;
    console.log("len: " + a.length);

    for (let k = 0; k < nRand; k++) {
        let beast = Base.RedBlackTree<string, number>(compareStrings);
        let linearBeast = Base.LinearDictionary<string, number>(compareStrings);
        for (let i = 0, len = a.length; i < len; i++) {
            a[i] = a[i].trim();
            if (a[i].length > 0) {
                beast.put(a[i], i);
                linearBeast.put(a[i], i);
            }
        }
        if (k == 0) {
            beast.map(printStringNumProperty);
        }
        let removeIndex = Math.floor(Math.random() * a.length);
        console.log(`Removing: ${a[removeIndex]} at ${removeIndex}`);
        beast.remove(a[removeIndex]);
        linearBeast.remove(a[removeIndex]);
        for (let animal of a) {
            if ((animal.length > 0) && (animal != a[removeIndex])) {
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

//simpleTest();
fileTest1();