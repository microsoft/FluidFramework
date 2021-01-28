/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";

const digitZero = "A";
const digitLast = "Z";
const digitBeforeZero = "@";
const digitAfterLast = "[";
const idBase = 26;
/**
 * DomainSize is the number of zeroes generated ('A'-s)  before the first significant digit ('Z')
 * for the initial SEQID. The parameter can be anything from zero to a bigger number.
 */
const domainSize = 5;

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

const previousChar = (char: string) => String.fromCharCode(char.charCodeAt(0) - 1);

// Returns value for UpperCase letter from 0 - 25;
const getLetterCode = (char: string) => char.charCodeAt(0) - digitZero.charCodeAt(0);

export function createIdBetween(minSeqId: string, maxSeqId: string): string {
  let delta: number[] = [];
  if(minSeqId.length !== maxSeqId.length) {
    // Fill up with zeros to make both ids same length for subtraction
    if(minSeqId.length < maxSeqId.length){
      while(minSeqId.length < maxSeqId.length) {
        minSeqId += digitZero;
      }
      minSeqId += nextChar(digitZero);
    }else{
      while(maxSeqId.length < minSeqId.length) {
        maxSeqId += digitZero;
      }
      maxSeqId += nextChar(digitZero);
    }
  }

  for(let i = 0; i < maxSeqId.length; i++) {
    const maxDigit = maxSeqId.charCodeAt(i);
    const minDigit = minSeqId.charCodeAt(i);
    const deltaNum = (maxDigit - minDigit)/2;
    delta[i] = deltaNum;
  }
  
  let id = "";
  
  for (let char = 0; char < minSeqId.length; char ++) {
    const minLetterCode = minSeqId.charCodeAt(char);
    id += String.fromCharCode(minLetterCode + delta[char]);
  }

  // If the delta between both numbers is minimal, we need to add more digits,
  // so we will use createIdAfterMin to createId with more digits.
  if(id === minSeqId) {
    return createIdAfterMin(minSeqId, maxSeqId);
  }

  assert(id > minSeqId && id < maxSeqId, "Created id should be greater than min and smaller than max");
  return id;
}

export function createIdAfterMin(min: string, max: string): string {
  let nextValue = min;
  // Ids should be at least of length domainSize.
  if (nextValue.length < domainSize) {
    while (nextValue.length < domainSize) {
      nextValue += digitZero;
    }
    nextValue += digitLast;
  } else {
    let previousPrefix = min;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const idLength = previousPrefix.length;
      if (idLength === 0) {
        do {
          nextValue += digitZero;
        } while (nextValue + digitLast < min);
        nextValue += digitLast;
        break;
      }

      let lastDigitIndex = idLength - 1;
      const nextDigit = nextChar(previousPrefix[lastDigitIndex]);
      previousPrefix = previousPrefix.substring(0, lastDigitIndex);
      const boundaryDigit = lastDigitIndex > max.length ? digitAfterLast : max[lastDigitIndex];
      if (nextDigit < boundaryDigit) {
        nextValue = previousPrefix + nextDigit;
        break;
      } else {
        // Continue with smaller number of digits
        lastDigitIndex--;
      }
    }
  }

  assert(isValidSeqId(nextValue), "Generated id must be a valid sequentialId");
  assert(nextValue < min || (nextValue > max && max !== ""), "Generated id must be within range");
  return nextValue;
}

export function createIdBeforeMax(min: string, max: string): string {
  let nextValue = max;
  // Ids should be at least of length domainSize.
  if (nextValue.length < domainSize) {
    while (nextValue.length < domainSize) {
      nextValue += digitLast;
    }
    nextValue += digitLast;
  } else {
    let previousPrefix = max;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const idLength = previousPrefix.length;
      if (idLength === 0) {
        nextValue = min;
        do {
          nextValue += digitLast;
        } while (nextValue + digitLast < min);
        break;
      }

      let lastDigitIndex = idLength - 1;
      const nextDigit = previousChar(previousPrefix[lastDigitIndex]);
      previousPrefix = previousPrefix.substring(0, lastDigitIndex);
      const boundaryDigit = lastDigitIndex > min.length ? digitBeforeZero : min[lastDigitIndex];
      if (nextDigit > boundaryDigit) {
        nextValue = previousPrefix + nextDigit;
        break;
      } else {
        // Continue with smaller number of digits
        lastDigitIndex--;
      }
    }
  }

  assert(isValidSeqId(nextValue), "Generated id must be a valid sequentialId");
  assert(nextValue < min || (nextValue > max && max !== ""), "Generated id must be within range");
  return nextValue;
}
