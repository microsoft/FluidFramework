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
    const expectedResult = "LMN";
    const result = createIdBetween(min, max);
    assert.equal(result, expectedResult);
  });

  it("Create Id between min and max with same length but very close in delta", () => {
    const min = "ABC";
    const max = "ABD";
    const expectedResult = "ABCAB";
    const result = createIdBetween(min, max);
    assert.equal(result, expectedResult);
  });

  it("Create Id between min and max with bigger max length", () => {
    const min = "ABC";
    const max = "ABDDDD";
    const expectedResult = "ABCBBB";
    const result = createIdBetween(min, max);
    assert.equal(result, expectedResult);
  });

  it("Create Id between min and max with bigger max length and need to carry over", () => {
    const min = "ABCC";
    const max = "ABD";
    const expectedResult = "ABCO";
    const result = createIdBetween(min, max);
    assert.equal(result, expectedResult);
  });

  it("Create Id between min and max with bigger min length and need to carry over twice", () => {
    const min = "ABCC";
    const max = "AD";
    const expectedResult = "ABNO";
    const result = createIdBetween(min, max);
    assert.equal(result, expectedResult);
  });
});
