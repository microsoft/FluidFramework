/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const Joi = require('joi');
const OperationError = require('@fluid-experimental/property-common').OperationError;
const HTTPStatus = require('http-status');
const { mergeChunkedChangeSet } = require('../change_set_processing/merge_chunked_changeset');
const QueryV1Execution = require('./query_v1_execution');

const _ = require('lodash');

const QUERY_VERSIONS = {
  V1: 'queryV1'
};

const QUERY_SCHEMA =
  Joi.array().items(
    Joi.object({
      queryLanguage: Joi.string().valid(Object.values(QUERY_VERSIONS))
    }));

/**
 * An executor to process the array of a union request (multiple queries)
 */
class MultipleQueriesExecution {
  /**
   * Constructor
   * @param {Object} params - Params for this
   * @param {Object} params.materializedHistoryService - Instance of MaterializedHistoryService
   */
  constructor(params) {
    this._materializedHistoryService = params.materializedHistoryService;
  }

  /**
   * Calls the distinct request plans and performs the merging of changeSets
   * @param {Object} branchInfo - Branch info fetched from DB
   * @param {String} commitGuid - Guid for the MV at commit
   * @param {Object} queryString - Query string describing the query
   * @return {Object} - Object with the changeSet
   */
  async execute(branchInfo, commitGuid, queryString) {
    const queries = this._validateAndParseQueryString(queryString);

    let multipleQueriesResults = await Promise.all(
      queries.map((q) => {
        switch (q.queryLanguage) {
          case QUERY_VERSIONS.V1:
            return new QueryV1Execution({
              materializedHistoryService: this._materializedHistoryService
            }).execute(branchInfo, commitGuid, q);
          default:
            throw new OperationError('Unsupported query language ' + q.queryLanguage, 'GetCommit',
              HTTPStatus.BAD_REQUEST, OperationError.FLAGS.QUIET);
        }
      })
    );

    return {
      changeSet: mergeChunkedChangeSet(multipleQueriesResults.map((qr) => qr.changeSet)),
      queryPaths: _.uniq(_.flatten(multipleQueriesResults.map((qr) => qr.queryPaths)))
    };
  }

   /**
   * Validates the query string
   * @param {Object} queryString - Query string describing the query
   * @return {Object} - Object with the arguments to pass to getCommitMV
   */
  _validateAndParseQueryString(queryString) {
    let result = Joi.validate(queryString.query, QUERY_SCHEMA, { convert: true, allowUnknown: true });

    if (result.error) {
      throw new OperationError(
        `Invalid query ${result.error.details.map((e) => `${e.path}: ${e.message}`).join(', ')}`,
        '_validateAndParseQueryString', HTTPStatus.BAD_REQUEST,
        OperationError.FLAGS.QUIET);
    }

    return result.value;
  }
}

module.exports = MultipleQueriesExecution;
