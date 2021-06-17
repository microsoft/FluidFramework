/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "fs";
import path from "path";
import * as MergeTree from "@fluidframework/merge-tree";

const corpusFilenames = ["pp.txt", "huckfinn.txt", "shakespeare.txt", "tomsawyer.txt", "ulysses.txt"];

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

function train() {
    const corpusTree = new MergeTree.TST<number>();
    function addCorpus(content: string, tree: MergeTree.TST<number>) {
        let count = 0;
        const re = /\b\w+\b/g;
        let result: RegExpExecArray | null;
        do {
            result = re.exec(content);
            if (result) {
                const candidate = result[0];
                count++;
                const val = tree.get(candidate);
                if (val !== undefined) {
                    tree.put(candidate, val + 1);
                } else {
                    tree.put(candidate, 1);
                }
            }
        } while (result);
        return count;
    }
    for (const corpusFilename of corpusFilenames) {
        const corpusFullname = path.join(__dirname, "../../public/literature", corpusFilename);
        const corpusContent = fs.readFileSync(corpusFullname, "utf8");
        addCorpus(corpusContent, corpusTree);
    }

    const dictFilename = path.join(__dirname, "../../public/literature/dict.txt");
    const dictContent = fs.readFileSync(dictFilename, "utf8");
    const splitContent = dictContent.split(/\r\n|\n/g);
    const randomDict = shuffle(splitContent);
    let dictFreqContent = "";
    for (const entry of randomDict) {
        const freq = corpusTree.get(entry);
        if (freq !== undefined) {
            dictFreqContent += `${entry};${freq}\n`;
        } else {
            dictFreqContent += `${entry};1\n`;
        }
    }
    const dictFreqFilename = path.join(__dirname, "../../public/literature/dictfreq.txt");
    fs.writeFileSync(dictFreqFilename, dictFreqContent);
}

train();
