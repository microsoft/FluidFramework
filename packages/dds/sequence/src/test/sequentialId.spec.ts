/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { createIdAfterMin, createIdBeforeMax, createIdBetween } from "../generateSequentialId";

describe("CreateIdBetween SequentialId tests", () => {
  // it("Create Id between min and max with same length", () => {
  //   const min = "ABC";
  //   const max = "XYZ";
  //   const expectedResult = "LMN";
  //   const result = createIdBetween(min, max);
  //   assert.equal(result, expectedResult);
  // });

  // it("Create Id between min and max with same length but very close in delta", () => {
  //   const min = "ABC";
  //   const max = "ABD";
  //   const expectedResult = "ABCAAZ";
  //   const result = createIdBetween(min, max);
  //   assert.equal(result, expectedResult);
  // });

  // it("Create Id between min and max with bigger max length", () => {
  //   const min = "ABC";
  //   const max = "ABDDDD";
  //   const expectedResult = "ABCBBB";
  //   const result = createIdBetween(min, max);
  //   assert.equal(result, expectedResult);
  // });

  // it("Create Id between min and max with bigger min length", () => {
  //   const min = "ABCCCC";
  //   const max = "ABD";
  //   const expectedResult = "ABCBBB";
  //   const result = createIdBetween(min, max);
  //   assert.equal(result, expectedResult);
  // });

  it("Create Id between min and max with bigger min length", () => {
    const min = "ABBBBB";
    const max = "ABD";
    const expectedResult = "ABCBBB";
    const result = createIdBetween(min, max);
    assert.equal(result, expectedResult);
  });
});

describe("CreateIdAfterMin SequentialId tests", () => {
  it("Create Id after min for emtpy ids as param", () => {
    const min = "";
    const max = "";
    const expectedResult = "AAAAAZ";
    const result = createIdAfterMin(min, max);
    assert.equal(result, expectedResult);
  });

  it("Create Id after min for max as empty id as param", () => {
    const min = "AAAAAZ";
    const max = "";
    const expectedResult = "AAAAB";
    const result = createIdAfterMin(min, max);
    assert.equal(result, expectedResult);
  });

  it("Create Id after min for non-empty different length min and max", () => {
    const min = "AAAAAZ";
    const max = "AAAAB";
    const expectedResult = "AAAAAZAZ";
    const result = createIdAfterMin(min, max);
    assert.equal(result, expectedResult);
  });

  it("Create Id after min for non-empty same length min and max", () => {
    const min = "AAAAB";
    const max = "AAAAD";
    const expectedResult = "AAAAC";
    const result = createIdAfterMin(min, max);
    assert.equal(result, expectedResult);
  });
});

describe("createIdBeforeMax SequentialId tests", () => {
  it("Create Id before max for emtpy ids as param", () => {
    const min = "";
    const max = "";
    const expectedResult = "ZZZZZZ";
    const result = createIdBeforeMax(min, max);
    assert.equal(result, expectedResult);
  });

  it("Create Id before max  for empty min as param", () => {
    const min = "";
    const max = "ZZZZZZ";
    const expectedResult = "ZZZZZY";
    const result = createIdBeforeMax(min, max);
    assert.equal(result, expectedResult);
  });

  it("Create Id before max for non-empty same length min and max", () => {
    const min = "ZZZZZY";
    const max = "ZZZZZZ";
    const expectedResult = "ZZZZZYZ";
    const result = createIdBeforeMax(min, max);
    assert.equal(result, expectedResult);
  });

  it("Create Id before max for non-empty different length min and max", () => {
    const min = "AAAAB";
    const max = "ZZZZZY";
    const expectedResult = "ZZZZY";
    const result = createIdBeforeMax(min, max);
    assert.equal(result, expectedResult);
  });
});
