/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

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

export function getDistance(seqId1: string, seqId2: string): number | undefined {
  let numberSeqId1 = 0;
  let numberSeqId2 = 0;

  if (!isValidSeqId(seqId1)) {
    throw new Error("seqId1 is not valid");
  }

  if (!isValidSeqId(seqId2)) {
    throw new Error("seqId2 is not valid");
  }

  for (let i = 1; i < seqId1.length; i++) {
    numberSeqId1 += getLetterCode(seqId1[i]) * (1 / Math.pow(idBase, i));
  }

  for (let i = 1; i < seqId2.length; i++) {
    numberSeqId2 += getLetterCode(seqId2[i]) * (1 / Math.pow(idBase, i));
  }
  return numberSeqId1 - numberSeqId2;
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

  if (!isValidSeqId(nextValue)) {
    throw new Error("Generated seqId is not valid");
  }

  if (nextValue < min || (nextValue > max && max !== "")) {
    throw new Error("Generated seqId is not inside valid range");
  }
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

  if (!isValidSeqId(nextValue)) {
    throw new Error("Generated seqId is not valid");
  }

  if (nextValue < min || (nextValue > max && max !== "")) {
    throw new Error("Generated seqId is not inside valid range");
  }
  return nextValue;
}
