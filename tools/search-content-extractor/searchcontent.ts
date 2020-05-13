/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "fs";
import util from "util";

export let snapshotArgument = null;

async function searchContentExtractionMain() {
  if (process.argv.length > 1) {
    snapshotArgument = process.argv[2];
    //const snapshotTree: vroomSnapshot.ITree = this.convertToSnapshotTree(tree);
    //const entries = config.removeDeltasFromSnapshots ? snapshotTree.entries.filter((entry) => entry.path !== "deltas") : snapshotTree.entries;
    getSearchContent(snapshotArgument);
  }
}

searchContentExtractionMain()
  .catch((error: string) => console.log(`ERROR: ${error}`))
  .then(() => process.exit(0));

/*
 * Extracts text from list of snapshot entries. Returns empty string if none found.
 */
function getSearchContent(entries: Array<Object>): string {
  /*
   * snapshotEntries: Object array of length 1 (channel) or 0 (container)
   */
  let snapshotEntries = entries.filter(
    (entry: any) => entry["value"]["entries"]
  );
  if (snapshotEntries.length == 0) {
    return "";
  }
  /* slice1 finds the correct Object in array that contains the field with the shared string
   filters once for objects with entry objects length 3
   filters again for the singular object that has the unique path
   ex: Object {path: "some_path_id", type: "tree" }
*/
  let slice1: any = snapshotEntries
    .filter((ent: any) => ent.value.entries.length == 3)
    .filter(
      (x: any) =>
        x["value"] &&
        x["value"]["entries"] &&
        x["value"]["entries"][1] &&
        x["value"]["entries"][1]["value"] &&
        x["value"]["entries"][1]["value"]["entries"] &&
        x["value"]["entries"][1]["value"]["entries"][1]
    );
  if (slice1.length == 0) {
    return "";
  }
  /*
   * slice2 and slice 3 navigate into the sharedString from entry dictionary
   */
  let entry = slice1.filter((x: any) => selectEntry(x));
  if (entry.length == 0) {
    return "";
  }
  let subdict = entry[0];
  let slice2 = subdict.value.entries.filter((x: any) => x.path == "content");
  if (slice2.length == 0) {
    return "";
  }
  let slice3 = slice2[0].value.entries.filter((x: any) => x.path == "header");
  let sharedsegment = slice3.filter((x: any) => x["value"]["content"]);
  if (sharedsegment.length == 0) {
    return "";
  }
  /*
   * Raw shared string, starting with chunkSegment ID followed by sequence of text.
   * extractedString & concatenate string formats string to send in snapshot JSON to Vroom
   * extractedString ex: ""f", "o", "o ","b", "a", "r""
   * concatenateString ex: "foo bar"
   */
  let slice4 = sharedsegment[0]["value"]["content"];
  if (slice4 == null) {
    return "";
  }
  let parsedTextJSON = JSON.parse(slice4);
  let searchContent = "";
  /* Filters out all Objects in segmentText array */
  if (parsedTextJSON != null && parsedTextJSON.segmentTexts != null) {
    //see if pattern matching works
    let stringList = parsedTextJSON.segmentTexts.filter(
      (x: any) => typeof x === "string" || x.text
    );
    let mappedStrings = stringList.map((x: any) => {
      if (x.text) return x.text;
      else return x;
    });
    searchContent = mappedStrings.join("").trim();
  }
  /* encodes string to base64 */
  let encodedString = Buffer.from(searchContent).toString("base64");
  return encodedString;
}

/*
 * In case of multiple entries satisfiying original filter criteria
 * Finds the correct subdictionary to later traverse
 */
function selectEntry(entry: any) {
  let slice2 = entry.value.entries.filter((x: any) => x.path == "content");
  if (slice2.length == 0) {
    return false;
  }
  let slice3 = slice2[0].value.entries.filter((x: any) => x.path == "header");
  if (slice3.length == 0) {
    return false;
  }
  let slice4 = slice3[0]["value"]["content"];
  let stringList = slice4
    .slice(slice4.indexOf("[") + 1, slice4.lastIndexOf("]"))
    .split(",");
  return stringList.length > 0 && stringList[0] != "";
}

module.exports = searchContentExtractionMain
