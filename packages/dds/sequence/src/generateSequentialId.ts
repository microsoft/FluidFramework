/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";

export const digitZero = "A";
export const digitLast = "Z";
const idBase = 26;

export function isValidSeqId(seqId: string): boolean {
  for (let i = 1; i < seqId.length; i++) {
    const letterCode = getLetterCode(seqId[i]);
    if (letterCode < 0 && letterCode >= idBase) {
      return false;
    }
  }
  return true;
}

const nextChar = (char: string) => String.fromCharCode(char.charCodeAt(0) + 1);

// Returns value for UpperCase letter from 0 - 25;
const getLetterCode = (char: string) => char.charCodeAt(0) - digitZero.charCodeAt(0);

export function createIdBetween(seqId1: string, seqId2: string): string {
  const delta: number[] = [];
  let minSeqId = seqId1.length > 0 ? seqId1 : digitZero;
  let maxSeqId = seqId2.length > 0 ? seqId2 : digitLast;
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

  // Iterate strings in reverse order to subtract
  let carry = 0;
  for (let i = maxSeqId.length - 1; i >= 0; i--) {
    let maxDigit = maxSeqId.charCodeAt(i);
    let minDigit = minSeqId.charCodeAt(i);
    let deltaNum = 0;

    minDigit += carry;
    carry = 0;
    if (maxDigit < minDigit) {
      // Need to borrow for subtraction
      maxDigit += idBase;
      carry += 1;
    }
    deltaNum = (maxDigit - minDigit) / 2;

    delta[i] = deltaNum;
  }

  let id = "";
  for (let char = 0; char < maxSeqId.length; char ++) {
    const minLetterCode = minSeqId.charCodeAt(char);
    id += String.fromCharCode(minLetterCode + delta[char]);
  }

  // If the delta between both numbers is minimal, we need to add (zeros) more digits,
  // so we will use createIdAfterMin to create id with more digits.
  while (id <= minSeqId) {
    id += digitZero + nextChar(digitZero);
  }

  assert(id > minSeqId, "Created id should be greater than min");
  assert(id < maxSeqId, "Created id should be smaller than max");
  return id;
}
