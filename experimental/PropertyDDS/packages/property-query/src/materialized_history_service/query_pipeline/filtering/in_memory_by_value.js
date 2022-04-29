/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const YIELD_EVERY_N = 1000;
const ComparatorFactory = require('../comparator');
const PropertyUtils = require('@fluid-experimental/property-changeset').Utils;
const PathHelper = require('@fluid-experimental/property-changeset').PathHelper;
const TypeIdHelper = require('@fluid-experimental/property-changeset').TypeIdHelper;
const OperationError = require('@fluid-experimental/property-common').OperationError;
const ScanTraversalUtils = require('../scan_traversal_utils');
const HTTPStatus = require('http-status');
const _ = require('lodash');

const CLAUSES = ['eq', 'in', 'gt', 'lt', 'gte', 'lte', 'match'];

/**
 * Provides in-memory filtering by type for a changeSet
 */
class InMemoryByValue {
  /**
   * Trivial implementation to filter changeSets by path
   * that acts as an alternative to getChangesByType, since it doesn't return a valid changeSet.
   * @param {Object} from - From clause
   * @param {Object} changeSet - ChangeSet Object
   * @param {Array<String>} limitedPaths - A list of paths to intersect with
   * @return {Object} - Filtered changeset
   */
  static async filterByValue(from, changeSet, limitedPaths) {
    const tokenizedPagingPath = PathHelper.tokenizePathString(from.pathPrefix);

    // TODO: Do not traverse outside of limitedPaths
    let retainedPaths = await InMemoryByValue._filterPaths(tokenizedPagingPath, from, changeSet);
    if (limitedPaths) {
      retainedPaths = _.intersection(
        retainedPaths,
        limitedPaths.map((lp) => PathHelper.tokenizePathString(lp)
                                  .map(PathHelper.quotePathSegmentIfNeeded)
                                  .join('.')
                        )
      );
    }

    // Paging yielded some paths, yay.  Return only the filtered items
    if (retainedPaths.length > 0) {
      let filtered = PropertyUtils.getFilteredChangeSetByPaths(changeSet, retainedPaths);

      return {
        changeSet: filtered,
        queryPaths: retainedPaths
      };
    } else {
      // Original ChangeSet doesn't have the path required, return empty
      return {
        changeSet: {},
        queryPaths: []
      };
    }
  }

  /**
   * Obtains a list of paths that satisfy a where clause
   * @param {Array<String>} tokenizedPagingPath - Prefix on which to select
   * @param {Object} from - FROM clause
   * @param {Object} changeSet - ChangeSet on which to build the index
   * @return {Array<String>} - List of paths to return
   */
  static async _filterPaths(tokenizedPagingPath, from, changeSet) {
    let counter = 0;
    const where = from.where;

    const _getPath = _.memoize(
        (stack, length) => stack
                            .slice(0, length)
                            .map(PathHelper.quotePathSegmentIfNeeded)
                            .join('.'),
        (...args) => JSON.stringify(args)
    );

    const fieldsToGather = {};
    const tokenizedFieldsToGather = {};

    const gatherFieldsForWhereClause = (whereClause) => {

      CLAUSES.forEach((clauseName) => {
        let clause = whereClause[clauseName];
        if (clause) {
          let clauseFields = Object.keys(clause);
          clauseFields.forEach((cf) => {
            fieldsToGather[cf] = {
              typeId: undefined,
              value: undefined
            };
            tokenizedFieldsToGather[cf] = PathHelper.tokenizePathString(cf);
          });
        }
      });

      if (whereClause['not']) {
        gatherFieldsForWhereClause(whereClause['not']);
      }

      if (whereClause['or']) {
        whereClause['or'].forEach((wc) => {
          gatherFieldsForWhereClause(wc);
        });
      }
    };

    gatherFieldsForWhereClause(where);

    return new Promise((resolve, reject) => {
      let paths = {};
      let justTheFieldsToGather = Object.values(tokenizedFieldsToGather);
      let depthLimit = from.depthLimit;
      PropertyUtils.traverseChangeSetRecursivelyAsync(changeSet, {
        preCallback: (context, cb) => {
          if (ScanTraversalUtils.shouldStopTraversing(
            tokenizedPagingPath, justTheFieldsToGather, depthLimit, context)
          ) {
            return cb('break');
          }
          if (ScanTraversalUtils.isItemContext(tokenizedPagingPath, depthLimit, context)) {
            if (!paths[_getPath(context._parentStack, context._parentStack.length)]) {
              paths[_getPath(context._parentStack, context._parentStack.length)] = _.cloneDeep(fieldsToGather);
            }
          }

          const keyForContext = InMemoryByValue._getWhereClauseKey(
            tokenizedPagingPath, tokenizedFieldsToGather, depthLimit, context
          );

          if (keyForContext) {
            try {
              InMemoryByValue._validatePrimitiveType(context.getTypeid());
            } catch (ex) {
              reject(ex);
              return undefined;
            }

            paths[_getPath(context._parentStack, -1 * tokenizedFieldsToGather[keyForContext].length)][keyForContext] = {
              value: context.getNestedChangeSet(),
              typeId: context.getTypeid()
            };
          }


          counter++;

          if (counter >= YIELD_EVERY_N) {
            setImmediate(cb);
            counter = 0;
          } else {
            cb();
          }
          return undefined;
        }
      }, () => {
        let matchingPaths = InMemoryByValue._matchGatheredFieldsAgainstWhere(paths, where);
        resolve(matchingPaths);
      });
    });
  }

  /**
   * Determines whether the current context matches a property to filter on
   * @param {String} tokenizedPagingPath - Prefix on which to select
   * @param {Object} tokenizedFieldsToGather -
   *   Object whose keys correspond to the keys affected by the where
   * @param {Number} depthLimit -
   *   limit of depth for traversal
   * @param {Object} context - Traversal context
   * @return {Boolean} - Whether this represent the property to filter upon
   */
  static _getWhereClauseKey(tokenizedPagingPath, tokenizedFieldsToGather, depthLimit, context) {
    let found = Object.keys(tokenizedFieldsToGather).find((f) => {
      let v = tokenizedFieldsToGather[f];
      const expectedStackLength = tokenizedPagingPath.length + v.length + depthLimit;
      if (context._parentStack.length > expectedStackLength) {
        return false;
      }

      const beginPart = context._parentStack.slice(0, tokenizedPagingPath.length);
      const endPart = context._parentStack.slice(-1 * v.length);

      return _.isEqual(beginPart, tokenizedPagingPath) && _.isEqual(endPart, v);
    });

    return found;
  }

    /**
   * Whether a typeId is considered primitive
   * @param {String} type - Typeid to be evaluated
   */
  static _validatePrimitiveType(type) {
    if (!TypeIdHelper.isPrimitiveType(type)) {
      throw new OperationError(
        `Attempting to perform filtering on a non-primitive field, type was ${type}`, '_validatePrimitiveType',
        HTTPStatus.BAD_REQUEST, OperationError.FLAGS.QUIET);
    }
  }

  /**
   * Casts to number for numeric comparison if needed
   * @param {String} typeId - TypeId of the value
   * @param {*} value - Value to possibly cast
   * @return {*} - Possibly casted value
   */
  static _castToNumberIfNeeded(typeId, value) {
    if (typeId !== 'String' && typeId !== 'Uint64' && typeId !== 'Int64') {
      return Number(value);
    } else {
      return value;
    }
  }

  /**
   * Evaluates equality
   * @param {*} expected - Expected value
   * @param {*} actual - Value to compare
   * @param {String} typeId - TypeId of the property being compared
   * @return {Boolean} - Whether it evaluated
   */
  static _evaluateEq(expected, actual, typeId) {
    const cv = ComparatorFactory.getComparator(typeId).compare(expected, actual);
    return cv === 0;
  }

  /**
   * Evaluates equality for one of value
   * @param {*} expected - Expected value
   * @param {*} actual - Value to compare
   * @param {String} typeId - TypeId of the property being compared
   * @return {Boolean} - Whether it evaluated
   */
  static _evaluateIn(expected, actual, typeId) {
    // Special case, since these numbers are expressed as arrays
    // We need to do deep comparison.  This is more expensive
    // Than the standard `includes`, so only do it when needed
    if (typeId === 'Uint64' || typeId === 'Int64') {
      let found = expected.find((exp) => _.isEqual(exp, actual));
      return found !== undefined;
    } else {
      return expected
        .map((exp) => InMemoryByValue._castToNumberIfNeeded(typeId, exp))
        .includes(actual);
    }
  }

  /**
   * Evaluates greater than ness for one of value
   * @param {*} expected - Expected value
   * @param {*} actual - Value to compare
   * @param {String} typeId - TypeId of the property being compared
   * @return {Boolean} - Whether it evaluated
   */
  static _evaluateGt(expected, actual, typeId) {
    expected = InMemoryByValue._castToNumberIfNeeded(typeId, expected);
    const cv = ComparatorFactory.getComparator(typeId).compare(expected, actual);
    return cv === -1;
  }

  /**
   * Evaluates lesser than ness for one of value
   * @param {*} expected - Expected value
   * @param {*} actual - Value to compare
   * @param {String} typeId - TypeId of the property being compared
   * @return {Boolean} - Whether it evaluated
   */
  static _evaluateLt(expected, actual, typeId) {
    expected = InMemoryByValue._castToNumberIfNeeded(typeId, expected);
    const cv = ComparatorFactory.getComparator(typeId).compare(expected, actual);
    return cv === 1;
  }

  /**
   * Evaluates greater than ness or equality for one of value
   * @param {*} expected - Expected value
   * @param {*} actual - Value to compare
   * @param {String} typeId - TypeId of the property being compared
   * @return {Boolean} - Whether it evaluated
   */
  static _evaluateGte(expected, actual, typeId) {
    expected = InMemoryByValue._castToNumberIfNeeded(typeId, expected);
    const cv = ComparatorFactory.getComparator(typeId).compare(expected, actual);
    return cv <= 0;
  }

  /**
   * Evaluates lesser than ness or equality for one of value
   * @param {*} expected - Expected value
   * @param {*} actual - Value to compare
   * @param {String} typeId - TypeId of the property being compared
   * @return {Boolean} - Whether it evaluated
   */
  static _evaluateLte(expected, actual, typeId) {
    expected = InMemoryByValue._castToNumberIfNeeded(typeId, expected);
    const cv = ComparatorFactory.getComparator(typeId).compare(expected, actual);
    return cv >= 0;
  }

  /**
   * Evaluates regex match for one of value
   * @param {String} expected - Expected value
   * @param {String} actual - Value to compare
   * @param {String} typeId - TypeId of the property being compared
   * @return {Boolean} - Whether it evaluated
   */
  static _evaluateMatch(expected, actual, typeId) {
    if (actual === undefined && typeId === undefined) {
      return false;
    }

    if (typeId !== 'String') {
      throw new OperationError(
        `Attempting to perform regex match on non-string field, type was ${typeId}`, '_evaluateMatch',
        HTTPStatus.BAD_REQUEST, OperationError.FLAGS.QUIET);
    }
    return new RegExp(expected).test(actual);
  }

  /**
   * Evaluates inverse evaluation for one of value to a where clause
   * @param {*} wc - Expected value
   * @param {*} value - Value to compare
   * @return {Boolean} - Whether it evaluated
   */
  static _evaluateNot(wc, value) {
    return !InMemoryByValue._evaluateWhere(wc, value);
  }

  /**
   * Evaluates disjunction for a where clause
   * @param {*} wc - Expected value
   * @param {*} value - Value to compare
   * @return {Boolean} - Whether it evaluated
   */
  static _evaluateOr(wc, value) {
    for (let aWhere of wc) {
      let evalRes = InMemoryByValue._evaluateWhere(aWhere, value);
      if (evalRes) {
        return true;
      }
    }
    return false;
  }

  /**
   * Evaluates conjunction for all subclauses of a where clause
   * @param {*} wc - Expected value
   * @param {*} value - Value to compare
   * @return {Boolean} - Whether it evaluated
   */
  static _evaluateWhere(wc, value) {

    const clauseToEval = {
      eq: InMemoryByValue._evaluateEq,
      'in': InMemoryByValue._evaluateIn,
      gt: InMemoryByValue._evaluateGt,
      lt: InMemoryByValue._evaluateLt,
      gte: InMemoryByValue._evaluateGte,
      lte: InMemoryByValue._evaluateLte,
      match: InMemoryByValue._evaluateMatch
    };

    for (const clause of CLAUSES) {
      if (wc[clause]) {
        for (const field of Object.keys(wc[clause])) {
          if (!clauseToEval[clause](wc[clause][field], value[field].value, value[field].typeId)) {
            return false;
          }
        }
      }
    }

    if (wc['not']) {
      let notResult = InMemoryByValue._evaluateNot(wc['not'], value);
      if (!notResult) {
        return false;
      }
    }

    if (wc['or']) {
      let notResult = InMemoryByValue._evaluateOr(wc['or'], value);
      if (!notResult) {
        return false;
      }
    }

    return true;
  }

  /**
   * Returns an array of the paths satisfying the where criteria
   * @param {Object} paths - As a key, full path, as a value, an object with values for evaluation
   * @param {Object} where - Where clause from Query Language
   * @return {Array<String>} - Paths that match the where clause
   */
  static _matchGatheredFieldsAgainstWhere(paths, where) {
    return Object.keys(paths).filter((p) => InMemoryByValue._evaluateWhere(where, paths[p]));
  }
}

module.exports = InMemoryByValue;
