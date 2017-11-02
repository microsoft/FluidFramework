import * as fs from "fs";
import * as path from "path";
import * as Collections from "../merge-tree/collections";

let corpusFilenames = ["pp.txt", "huckfinn.txt", "shakespeare.txt", "tomsawyer.txt", "ulysses.txt"];

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
    let corpusTree = new Collections.TST<number>();
    function addCorpus(content: string, tree: Collections.TST<number>) {
        let count = 0;
        let re = /\b\w+\b/g;
        let result: RegExpExecArray;
        do {
            result = re.exec(content);
            if (result) {
                let candidate = result[0];
                count++;
                let val = tree.get(candidate);
                if (val !== undefined) {
                    tree.put(candidate, val + 1);
                } else {
                    tree.put(candidate, 1);
                }
            }
        } while (result);
        return count;
    }
    for (let corpusFilename of corpusFilenames) {
        let corpusFullname = path.join(__dirname, "../../public/literature", corpusFilename);
        let corpusContent = fs.readFileSync(corpusFullname, "utf8");
        addCorpus(corpusContent, corpusTree);
    }

    let dictFilename = path.join(__dirname, "../../public/literature/dict.txt");
    let dictContent = fs.readFileSync(dictFilename, "utf8");
    let splitContent = dictContent.split(/\r\n|\n/g);
    let randomDict = shuffle(splitContent);
    let dictFreqContent = "";
    for (let entry of randomDict) {
        let freq = corpusTree.get(entry);
        if (freq !== undefined) {
            dictFreqContent += `${entry};${freq}\n`;
        } else {
            dictFreqContent += `${entry};1\n`;
        }
    }
    let dictFreqFilename = path.join(__dirname, "../../public/literature/dictfreq.txt");
    fs.writeFileSync(dictFreqFilename, dictFreqContent);
}

train();
