/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const BSON = require('bson-ext');

const bson = new BSON([
  BSON.Binary, BSON.Code, BSON.DBRef, BSON.Decimal128, BSON.Double,
  BSON.Int32, BSON.Long, BSON.Map, BSON.MaxKey, BSON.MinKey,
  BSON.ObjectId, BSON.BSONRegExp, BSON.Symbol, BSON.Timestamp
]);

/**
 * BSON serializer
 */
class BSONSerializer {
  /**
   * Serializes anything to BSON
   * @param {*} input - Anything
   * @return {String} - Serialized version
   */
  serialize(input) {
    return bson.serialize(input);
  }

    /**
   * Deserializes anything from BSON
   * @param {String} input - Serialized
   * @return {*} - Deserialized
   */
  deserialize(input) {
    return bson.deserialize(input);
  }
}

module.exports = BSONSerializer;
