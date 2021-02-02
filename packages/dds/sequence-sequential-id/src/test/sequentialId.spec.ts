/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { createIdBetween } from "../generateSequentialId";

describe("CreateIdBetween SequentialId tests", () => {
  it("Create Id between min and max with same length", () => {
    const min = "ABC";
    const max = "XYZ";
    const expectedResult = "MNO";
    const result = createIdBetween(min, max);
    assert.equal(result, expectedResult);
  });

  it("Create Id between min and max with same length but very close in delta", () => {
    const min = "ABC";
    const max = "ABD";
    const expectedResult = "ABCN";
    const result = createIdBetween(min, max);
    assert.equal(result, expectedResult);
  });

  it("Create Id between min and max with bigger max length", () => {
    const min = "ABC";
    const max = "ABDDDD";
    const expectedResult = "ABDCCC";
    const result = createIdBetween(min, max);
    assert.equal(result, expectedResult);
  });

  it("Create Id between min and max with bigger min length", () => {
    const min = "ABCC";
    const max = "ABD";
    const expectedResult = "ABCCN";
    const result = createIdBetween(min, max);
    assert.equal(result, expectedResult);
  });

  it("Create Id between min and max with bigger min length and overflow", () => {
    const min = "ABCC";
    const max = "AD";
    const expectedResult = "ACBB";
    const result = createIdBetween(min, max);
    assert.equal(result, expectedResult);
  });

  it("Create Id between min and max with overflow", () => {
    const min = "ABCC";
    const max = "ACBB";
    const expectedResult = "ABCCN";
    const result = createIdBetween(min, max);
    assert.equal(result, expectedResult);
  });

  it("Create Id between min and max close to limits and 1 digit", () => {
    const min = "Y";
    const max = "Z";
    const expectedResult = "YN";
    const result = createIdBetween(min, max);
    assert.equal(result, expectedResult);
  });

  it("Create Id between min and max close to limits and 2 digits", () => {
    const min = "YY";
    const max = "ZZ";
    const expectedResult = "YYN";
    const result = createIdBetween(min, max);
    assert.equal(result, expectedResult);
  });

  it("Create Id between min and max close to smaller limit", () => {
    const min = "B";
    const max = "C";
    const expectedResult = "BN";
    const result = createIdBetween(min, max);
    assert.equal(result, expectedResult);
  });
});
