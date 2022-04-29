/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const { hashCombine4xUint32, uint32x4ToGUID, guidToUint32x4 } = require('@fluid-experimental/property-common').GuidUtils;

/**
 * Generated GUIDs in a deterministic fashion, given an instance-unique seed and new GUIDs to combine with its internal
 * state.
 */
class DeterministicGuidGenerator {
  /**
   * Constructs a new instance using the specified GUIDs as seed parts
   * @param {String} seed1 First part of the seed
   * @param {String} seed2 Second part of the seed
   */
  constructor(seed1, seed2) {
    this.lastGuid = hashCombine4xUint32(guidToUint32x4(seed1), guidToUint32x4(seed2));
  }

  /**
   * Gets the next GUID based on the generator's state and the provided GUID. The internal state is updated after each
   * successive call, so even calls with the same parameter would provide different results.
   * @param {String} toCombineWithGuid GUID used to combine and get the next GUID
   * @param {Boolean} [base64=false] Whether to return a base64 GUID or not
   * @return {String} The next GUID for this session
   */
  getNextGuid(toCombineWithGuid, base64 = false) {
    this.lastGuid = hashCombine4xUint32(this.lastGuid, guidToUint32x4(toCombineWithGuid));
    return uint32x4ToGUID(this.lastGuid, base64);
  }
}

module.exports = DeterministicGuidGenerator;
