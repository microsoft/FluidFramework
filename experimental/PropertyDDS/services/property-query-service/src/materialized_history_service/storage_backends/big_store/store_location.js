/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview
 * An enumeration of store locations.
 */
class StoreLocation {
  /**
   * An enumeration of store locations where ChangeSets may be persisted.
   * 'value' matches integer values in the commits.changeSet.location field.
   * @param {string} name Enum name.
   * @param {number} value Enum value.
   * @constructor
   * @alias HFDM.PropertyGraphStore.Types.StoreLocation
   */
  constructor(name, value) {
    this._name = name;
    this._value = value;
  }

  /**
   * @return {string} Enum name.
   */
  get name() {
    return this._name;
  }

  /**
   * @return {string} Enum value.
   */
  get value() {
    return this._value;
  }

  /**
   * @return {string} A string representation of the store location.
   *   Ex.: 'S3 (2)'
   */
  toString() {
    return this.name + '(' + this.value + ')';
  }
}

// Keep the constructor private
const exported = {
  CASSANDRA: new StoreLocation('cassandra', 0),
  File: new StoreLocation('file', 1),
  S3: new StoreLocation('S3', 2),
  DYNAMODB: new StoreLocation('DynamoDB', 3)
};

module.exports = exported;
