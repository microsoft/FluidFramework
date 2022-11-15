/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const _ = require('lodash');
const Long = require('long');
const { OperationError } = require('@fluid-experimental/property-common');
const HTTPStatus = require('http-status');
const PathHelper = require('@fluid-experimental/property-changeset').PathHelper;
const IndexKeyEncoder = require('../../utils/index_key_encoder');
const NOT_PROVIDED = {}; // This means a value was not provided, which is different than it being undefined

const SUPPORTED_WHERE_CONDITIONS = ['eq', 'lte', 'lt', 'gte', 'gt'];
const denormalizers = {};
denormalizers[IndexKeyEncoder.Type.Path] = (value) => value;
denormalizers[IndexKeyEncoder.Type.String] = (value) => value;
denormalizers[IndexKeyEncoder.Type.Integer] = (value) => {
  const intValue = parseInt(value, 10);
  if (intValue.toString() === value) {
    // This is a safe integer in JS
    return intValue;
  }

  const signed = value.startsWith('-');
  const long = Long.fromString(value, !signed);
  return [long.getLowBits(), long.getHighBits(), signed];
};
denormalizers[IndexKeyEncoder.Type.Boolean] = (value) => value === 'true';
denormalizers[IndexKeyEncoder.Type.Single] = (value) => parseFloat(value);
denormalizers[IndexKeyEncoder.Type.Double] = (value) => parseFloat(value);

/**
 * Utility functions used when querying using indices
 */
class IndexUtils {
  /**
   * Processes the filter conditions provided in a query that uses an index to produce index traversal parameters
   * @param {Object} params Parameters for this function
   * @param {Object} params.indexDef Index definition
   * @param {String} params.indexName Name of the index
   * @param {String} params.branchGuid Guid of the branch that owns the index
   * @param {String} [params.typeId] Schema specified in the "from" section of the query
   * @param {Object} [params.where] Filter condition specified in the "from" section of the query
   * @return {Object} Index traversal parameters equivalent to the where condition
   * {Array<Array<*>>} values - Exact values to be retrieved from the index MV
   * {Array<Array<Array<*>>>} valueRanges - Ranges of values to be retrieved from the index MV
   * {Array<Array<*>>} excludeValues - Exact values to be excluded from the index MV result
   */
  static getIndexTraversalParamsFromFilter(params) {
    const values = [];
    const valueRanges = [];
    const excludeValues = [];
    if (params.typeId) {
      const typeId = params.typeId;
      const matchingCriteria = params.indexDef.include.find((includeCriteria) => includeCriteria.schema === typeId);
      if (!matchingCriteria) {
        throw new OperationError(`Cannot query index '${params.indexName}' on branch '${params.branchGuid}'. Index` +
          ` does not cover schema '${typeId}'`, 'GetIndexMV', HTTPStatus.BAD_REQUEST, OperationError.FLAGS.QUIET);
      }
    } else {
      throw new OperationError('Querying an index currently requires a typeId', 'GetIndexMV', HTTPStatus.BAD_REQUEST,
        OperationError.FLAGS.QUIET);
    }

    if (params.where) {
      const keys = Object.keys(params.where).filter((key) => !SUPPORTED_WHERE_CONDITIONS.includes(key));
      if (keys.length > 0) {
        const conditionsText = `'${SUPPORTED_WHERE_CONDITIONS.join('\', \'')}'`;
        throw new OperationError(`Only conditions ${conditionsText} are currently supported for indices`, 'GetIndexMV',
          HTTPStatus.BAD_REQUEST, OperationError.FLAGS.QUIET);
      }

      const getValueFromConditions = (conditions) => {
        const value = _.times(params.indexDef.fields.length, _.constant(NOT_PROVIDED));
        for (const propertyName of Object.keys(conditions)) {
          const index = params.indexDef.fields.findIndex((field) => field.name === propertyName);
          if (index === -1) {
            throw new OperationError(`Cannot query index '${params.indexName}' on branch '${params.branchGuid}'. ` +
              `Index does not include field '${propertyName}'`, 'GetIndexMV', HTTPStatus.BAD_REQUEST,
              OperationError.FLAGS.QUIET);
          }
          // TODO: In order to support the same syntax for filter values that is used by the scanning implementation
          // we would have to normalize at this point. However, there is the problem that we don't know the exact
          // typeid of the field, which we need because index typeids are more high level (Integer covers many types)
          // For now, we'll assume the values are normalized, but for that to be final we'd have to require the same
          // for scan queries.
          value[index] = conditions[propertyName];
        }
        // Check for unprovided values. This would require a full or partial scan, which is not currently supported
        // TODO: The following logic should evolve to detect these cases and transform the request
        for (let i = 0; i < value.length; i++) {
          if (value[i] === NOT_PROVIDED) {
            throw new OperationError('Index scan is not currently supported. A value for field ' +
              `'${params.indexDef.fields[i].name}' was not provided.`, 'GetIndexMV', HTTPStatus.BAD_REQUEST,
              OperationError.FLAGS.QUIET);
          }
        }
        return value;
      };

      if (params.where.eq) {
        const value = getValueFromConditions(params.where.eq);
        values.push(value);
      }
      if (params.where.lte) {
        const value = getValueFromConditions(params.where.lte);
        valueRanges.push([_.times(params.indexDef.fields.length, _.constant(undefined)), value]);
        values.push(value);
      }
      if (params.where.gte) {
        const value = getValueFromConditions(params.where.gte);
        valueRanges.push([value, _.times(params.indexDef.fields.length, _.constant(undefined))]);
      }
      if (params.where.lt) {
        const value = getValueFromConditions(params.where.lt);
        valueRanges.push([_.times(params.indexDef.fields.length, _.constant(undefined)), value]);
      }
      if (params.where.gt) {
        const value = getValueFromConditions(params.where.gt);
        valueRanges.push([value, _.times(params.indexDef.fields.length, _.constant(undefined))]);
        excludeValues.push(value);
      }
    }

    return {
      values,
      valueRanges,
      excludeValues
    };
  }

  /**
   * Encodes a value range into binary representation
   * @param {Array<Array<*>>} valueRange Range
   * @param {IndexKeyEncoder} keyEncoder Encoder for this index
   * @return {Array<String>} Binary encoded range
   */
  static encodeRange(valueRange, keyEncoder) {
    const left = keyEncoder.encode(valueRange[0]);
    let right;
    if (valueRange[1].every((item) => item === undefined)) {
      // An undefined right boundary should be translated to an upper bound
      right = IndexKeyEncoder.UPPER_BOUND;
    } else {
      right = keyEncoder.encode(valueRange[1]);
    }
    return [left, right];
  }

  /**
   * Given sort criteria specified in a paging query element, it returns the order that should be
   * used when traversing the index.
   * @param {Object} params Parameters for this function
   * @param {Object} params.indexDef Index definition
   * @param {Array<Object>} params.order Order criteria specified in the paging section of the query
   * @return {String|undefined} Traversal order to follow or undefined if the index cannot be used
   */
  static getTraversalOrder(params) {
    const sortCriteria = _.times(params.indexDef.fields.length, _.constant(NOT_PROVIDED));
    if (params.order) {
      for (let i = 0; i < params.order.length; i++) {
        const { by, direction } = params.order[i];
        if (params.indexDef.fields[i] && params.indexDef.fields[i].name === by) {
          sortCriteria[i] = direction;
        } else {
          // The index does not cover this field, or not in this place at least. It cannot be used for sorting.
          return undefined;
        }
      }
    }
    let sortOrder;
    for (let i = 0; i < sortCriteria.length; i++) {
      if (!sortOrder) {
        sortOrder = sortCriteria[i];
      } else if (sortOrder !== sortCriteria[i] && sortCriteria[i] !== NOT_PROVIDED) {
        // If the sort order is mixed we cannot satisfy this with the index. The only exception is trailing
        // "not provided" sort criteria, as those can be coerced to be either ascending or descending.
        return undefined;
      }
    }
    if (sortOrder === NOT_PROVIDED) {
      // No order was specified. Let's go with ascending order by default.
      return 'ASC';
    }
    return sortOrder;
  }

  /**
   * Given an MV obtained from an index, it returns the paths to the contained properties.
   * If specified, this will also filter the results based on pathPrefix and depthLimit.
   * @param {Object} changeSet The mv obtained from an index
   * @param {Number} fieldCount Number of fields to expect. This is used to determine the level the paths are at.
   * @param {String} [pathPrefix] If specified, only paths containing this prefix will be returned
   * @param {Number} [depthLimit] If specified, only paths up to this depth from the prefix will be returned
   * @param {Object} [order] If specified, the keys will be sorted before traversing
   * @param {Boolean} [order.isDescending] If true, the sort order of the keys will be descending
   * @param {Function} [order.sortKeyEncoder] Used to encode the keys for sorting
   * @return {Array<String>} Extracted paths
   */
  static extractPathsFromIndexMV(changeSet, fieldCount, pathPrefix = '', depthLimit = Infinity, order) {
    const paths = [];
    const getSortedKeys = (cs, level) => {
      let keys = Object.keys(cs);
      if (!order) {
        return keys;
      }
      keys = _.orderBy(keys, (key) => order.sortKeyEncoder(key, level), order.isDescending ? 'desc' : 'asc');
      return keys;
    };
    const gatherPathsRecursive = (csAt, level) => {
      csAt = csAt.insert && csAt.insert.NodeProperty;
      if (!csAt) {
        return;
      }
      const sortedKeys = getSortedKeys(csAt, level);
      if (level === fieldCount) {
        for (const key of sortedKeys) {
          // Comparing without tokenizing first means pathPrefix should be "correct", i.e. it cannot replace [] by .
          if (key.startsWith(pathPrefix)) {
            if (depthLimit < Infinity) {
              const prefixParts = PathHelper.tokenizePathString(pathPrefix);
              const pathParts = PathHelper.tokenizePathString(key);
              if (pathParts.length <= prefixParts.length + depthLimit) {
                paths.push(key);
              }
            } else {
              // Optimization when there is no depthLimit
              paths.push(key);
            }
          }
        }
      } else {
        for (const key of sortedKeys) {
          gatherPathsRecursive(csAt[key], level + 1);
        }
      }
    };
    gatherPathsRecursive(changeSet, 0);
    return paths;
  }

  /**
   * Applies the removal of an index property, found by its keys, in an index MV.
   * @param {Object} mv Index MV where to perform the removal
   * @param {Array<*>} keys List of keys to traverse to get to the property to delete
   * @return {Number} Numbers of keys that are kept in the MV
   */
  static applyRemoveInMV(mv, keys) {
    let mvAt = mv;
    let keysToKeepCount = 0;
    let done;
    let last = keys[keys.length - 1];
    let parents = keys.slice(0, keys.length - 1);
    for (const key of parents) {
      if (mvAt.insert && mvAt.insert.NodeProperty && mvAt.insert.NodeProperty[key]) {
        mvAt = mvAt.insert.NodeProperty[key];
        keysToKeepCount++;
      } else {
        done = true;
        break;
      }
    }
    if (!done) {
      if (mvAt.insert && mvAt.insert.NodeProperty && mvAt.insert.NodeProperty[last]) {
        delete mvAt.insert.NodeProperty[last];
        if (_.isEmpty(mvAt.insert.NodeProperty)) {
          delete mvAt.insert.NodeProperty;
          delete mvAt.insert;
          // Recursively delete parent level if needed
          // Note that the keys to keep will be those that we have not deleted
          return IndexUtils.applyRemoveInMV(mv, parents);
        }
      }
    }
    return keysToKeepCount;
  }

  /**
   * Normalizes a key value to give a standard string representation, avoiding aliases of same value
   * @param {*} value The value to normalize
   * @param {String} [typeid] The declared typeid of the value
   * @return {String} The value converted to a normalized string
   */
  static normalizeValue(value, typeid) {
    if (value === undefined) {
      return IndexUtils.UNDEFINED_KEY;
    }
    if (typeid === 'Uint64') {
      return new Long(value[0], value[1], true).toString();
    } else if (typeid === 'Int64') {
      return new Long(value[0], value[1]).toString();
    } else {
      return value.toString();
    }
  }

  /**
   * Encodes the key by first denormalizing and then binary encoding it.
   * @param {Array<Object>} fields Fields of the current index
   * @param {IndexKeyEncoder} encoder Encoder to transform to binary representation
   * @param {String} key Normalized key value
   * @param {Number} index Index of the field that matches this value
   * @return {String} Encoded key
   */
  static normalizedToBinaryEncoder(fields, encoder, key, index) {
    const field = fields[index];
    let typeId;
    if (field) {
      typeId = field.typeId;
    } else {
      // This is the actual property path
      typeId = IndexKeyEncoder.Type.Path;
    }
    let denormalized;
    if (key === IndexUtils.UNDEFINED_KEY) {
      denormalized = undefined;
    } else {
      denormalized = denormalizers[typeId](key);
    }
    return encoder.encodeSingleValue(denormalized, typeId);
  }

  /**
   * Produces a path made by combining the current path with the provided key.
   * @param {String} path Current path
   * @param {Object} key An object containing the current key
   * @return {String} Combined path with the new key
   */
  static indexChunkPathBuilder(path, key) {
    return path + key.sortKey;
  }
}

// This is a randomly generated base64 guid. It is used as the key for undefined values in an index change set.
IndexUtils.UNDEFINED_KEY = 'ViRDB1ujOHr8HDWQitRksA';

module.exports = IndexUtils;
