/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const _ = require('lodash');
const OperationError = require('@fluid-experimental/property-common').OperationError;
const HTTPStatus = require('http-status');

/**
 * Simple query execution, with the inline query string arguments
 */
class SimpleQueryExecution {
  /**
   * Constructor
   * @param {Object} params - Params for this
   * @param {Object} params.materializedHistoryService - Instance of MaterializedHistoryService
   */
  constructor(params) {
    this._materializedHistoryService = params.materializedHistoryService;
  }

  /**
   * Plain old query execution
   * @param {Object} branchInfo - Branch info fetched from DB
   * @param {String} commitGuid - Guid for the MV at commit
   * @param {Object} queryString - Query string describing the query
   * @return {Object} - Object with the changeSet
   */
  async execute(branchInfo, commitGuid, queryString) {
    const query = this._validateAndParseQueryString(commitGuid, queryString);
    query.branchGuid = branchInfo.guid;
    return this._materializedHistoryService.getCommitMV(query);
  }

   /**
   * Plain old query execution
   * @param {String} commitGuid - Guid for the MV at commit
   * @param {Object} queryString - Query string describing the query
   * @return {Object} - Object with the arguments to pass to getCommitMV
   */
  _validateAndParseQueryString(commitGuid, queryString) {
    let paths = queryString.path;
    if (paths === undefined) {
      paths = [];
    }
    if (_.isString(paths)) {
      paths = [paths];
    }

    const fetchSchemas = queryString.fetchSchemas !== 'false';
    let followReferences = false;
    if (queryString.followReferences === 'true') {
      followReferences = true;
    }
    let pagingStartPath = queryString.pagingStartPath;
    let pagingLimit = queryString.pagingLimit;
    if (pagingLimit !== undefined) {
      pagingLimit = pagingLimit * 1024;
    }

    let ranges;
    if (queryString.rangeStart && queryString.rangeEnd) {
      let rangeStart = queryString.rangeStart;
      let rangeEnd = queryString.rangeEnd;

      if (_.isString(rangeStart)) {
        rangeStart = [rangeStart];
      }
      if (_.isString(rangeEnd)) {
        rangeEnd = [rangeEnd];
      }

      ranges = [];
      if (rangeStart.length !== rangeEnd.length) {
        throw new OperationError('Number of rangeStart and rangeEnd parameters must match', 'GetCommit',
          HTTPStatus.BAD_REQUEST, OperationError.FLAGS.QUIET);
      }

      for (let i = 0; i < rangeStart.length; i++) {
        ranges.push( [rangeStart[i], rangeEnd[i]]);
      }
    }

    return {
      guid: commitGuid,
      paths,
      fetchSchemas,
      followReferences,
      pagingLimit,
      pagingStartPath,
      ranges
    };
  }
}

module.exports = SimpleQueryExecution;
