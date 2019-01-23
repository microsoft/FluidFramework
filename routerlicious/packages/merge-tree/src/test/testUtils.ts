import * as fs from "fs";
import { MergeTree } from "../mergeTree";
import { loadText } from "../text";

export function loadTextFromFile(filename: string, mergeTree: MergeTree, segLimit = 0) {
    // tslint:disable-next-line:non-literal-fs-path
    const content = fs.readFileSync(filename, "utf8");
    return loadText(content, mergeTree, segLimit);
}

export function loadTextFromFileWithMarkers(filename: string, mergeTree: MergeTree, segLimit = 0) {
    // tslint:disable-next-line:non-literal-fs-path
    const content = fs.readFileSync(filename, "utf8");
    return loadText(content, mergeTree, segLimit, true);
}
