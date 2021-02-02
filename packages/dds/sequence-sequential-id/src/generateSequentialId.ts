/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";

export const digitZero = "A";
export const digitLast = "Z";
const idBase = 26;
const base = digitZero.charCodeAt(0);

export function isValidSeqId(seqId: string): boolean {
  for (let i = 1; i < seqId.length; i++) {
    const letterCode = seqId.charCodeAt(i) - base;
    if (letterCode < 0 && letterCode >= idBase) {
      return false;
    }
  }
  return true;
}

export function createIdBetween(seqId1: string, seqId2: string): string {
  let minSeqId = seqId1.length > 0 ? seqId1 : digitZero;
  let maxSeqId = seqId2.length > 0 ? seqId2 : digitLast;

  assert(minSeqId < maxSeqId, "minSeqId must be less than maxSeqId");

  if (minSeqId.length !== maxSeqId.length) {
    // Fill up with zeros to make both ids same length for subtraction
    if (minSeqId.length < maxSeqId.length) {
      while (minSeqId.length < maxSeqId.length) {
        minSeqId += digitZero;
      }
    }

    if (maxSeqId.length < minSeqId.length) {
      while (maxSeqId.length < minSeqId.length) {
        maxSeqId += digitZero;
      }
    }
  }

  let id = "";
  for (let char = 0; char < maxSeqId.length; char ++) {
    const maxLetterCode = maxSeqId.charCodeAt(char);
    const minLetterCode = minSeqId.charCodeAt(char);
    id += String.fromCharCode(Math.round((maxLetterCode + minLetterCode) / 2));
  }

  // If minSeqId + 1 >= maxSeqId, we need to add more digits due to overflow cases
  if (id >= maxSeqId) {
    id = minSeqId + String.fromCharCode(Math.round((base + digitLast.charCodeAt(0)) / 2));
  }

  assert(id > minSeqId, "Created id should be greater than min");
  assert(id < maxSeqId, "Created id should be smaller than max");
  return id;
}
