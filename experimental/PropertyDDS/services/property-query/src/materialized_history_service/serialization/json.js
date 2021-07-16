/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * JSON serializer
 */
class JSONSerializer {
  /**
   * Serializes anything to JSON
   * @param {*} input - Anything
   * @return {String} - Serialized version
   */
  serialize(input) {
    return JSON.stringify(input);
  }

    /**
   * Deerializes anything from JSON
   * @param {String} input - Serialized
   * @return {*} - Deserialized
   */
  deserialize(input) {
    return JSON.parse(input);
  }
}

module.exports = JSONSerializer;
