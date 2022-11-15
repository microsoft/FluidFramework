/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const IndexUtils = require('./index_utils');
const FilterInMemoryByType = require('./filtering/in_memory_by_type');
const FilterInMemoryByValue = require('./filtering/in_memory_by_value');
const Joi = require('joi');
const NoIndexPaging = require('./paging/no_index_paging');
const OperationError = require('@fluid-experimental/property-common').OperationError;
const HTTPStatus = require('http-status');
const { TypeIdHelper } = require('@fluid-experimental/property-changeset');

const ALTERNATIVES_FOR_MOST_CLAUSES = Joi.alternatives().try([
  Joi.string(),
  Joi.number(),
  Joi.array() // For Int64, Uint64
    .items(Joi.number().integer())
    .length(2)
]);

const WHERE_CLAUSE_SCHEMA = Joi.object({
  eq: Joi.object()
        .pattern(Joi.string(), ALTERNATIVES_FOR_MOST_CLAUSES),
  'in': Joi.array()
        .items(ALTERNATIVES_FOR_MOST_CLAUSES),
  gt: Joi.object()
        .pattern(Joi.string(), ALTERNATIVES_FOR_MOST_CLAUSES),
  lt: Joi.object()
        .pattern(Joi.string(), ALTERNATIVES_FOR_MOST_CLAUSES),
  gte: Joi.object()
        .pattern(Joi.string(), ALTERNATIVES_FOR_MOST_CLAUSES),
  lte: Joi.object()
        .pattern(Joi.string(), ALTERNATIVES_FOR_MOST_CLAUSES),
  match: Joi.object()
        .pattern(Joi.string(), Joi.string()),
  or: Joi.array()
        .items(Joi.lazy(() => WHERE_CLAUSE_SCHEMA)),
  not: Joi.lazy(() => WHERE_CLAUSE_SCHEMA)
});

const QUERY_SCHEMA =
  Joi.object({
    from: Joi.array()
      .items(
        Joi.object({
          pathPrefix: Joi.string().allow('').default(''),
          typeId: Joi.string().optional(),
          depthLimit: Joi.number().integer().min(-1).default(1),
          where: WHERE_CLAUSE_SCHEMA.optional(),
          useIndex: Joi.string().optional()
        })
      ).max(1).required(),   // Currently only a single from is supported
    paging: Joi.object({
      order: Joi.array()
        .items(
          Joi.object({
            by: Joi.string().optional(),
            direction: Joi.string().valid(['ASC', 'DESC']).default('ASC')
          })
        ),
      limit: Joi.number().integer().min(0).required(),
      offset: Joi.number().integer().min(0).default(0)
    }).optional(),
    queryLanguage: Joi.string().valid('queryV1').required()
  });

/**
 * The specification describing what query to perform
 * @typedef {Object} QueryV1Execution~QuerySpecification
 * @property {Array<Object>} from               - Definition of sets
 * @property {String} from[n].pathPrefix        - Path prefix representing a set
 * @property {Object} paging                    - Definition of the paging to be performed
 * @property {Array<Object>} paging.order       - Ordering criterion
 * @property {String} paging.order[n].by        - Member of the elements of pathPrefix to perform sort by
 * @property {String} paging.order[n].direction - Order of the sorting (ASC, DESC), default ASc
 * @property {Number} paging.limit              - Maximum elements to return
 * @property {Number} paging.offset             - Offset for the paging
 */

/**
 * Simple query execution, with the inline query string arguments
 */
class QueryV1Execution {
  /**
   * Constructor
   * @param {Object} params - Params for this
   * @param {Object} params.materializedHistoryService - Instance of MaterializedHistoryService
   */
  constructor(params) {
    this._materializedHistoryService = params.materializedHistoryService;
  }

  /**
   * Query V1 execution
   * @param {Object} branchInfo - Branch info fetched from DB
   * @param {String} commitGuid - Guid for the MV at commit
   * @param {QueryV1Execution~QuerySpecification} query - Query specification
   * @return {Object} - Object with the changeSet and optional queryPaths
   */
  async execute(branchInfo, commitGuid, query) {
    // Very simplistic implementation for now
    // Here, we'd be deciding whether to do indices or scans for paging etc
    query = this._validateAndParseQueryString(query);

    let result, indexPaging;
    if (query.from[0].useIndex) {
      const indexName = query.from[0].useIndex;
      const indexDef = branchInfo.indices && branchInfo.indices[indexName] && branchInfo.indices[indexName].def;
      if (!indexDef) {
        throw new OperationError(`Index '${indexName}' used in query does not exist on branch ` +
          `'${branchInfo.guid}'`, 'Query', HTTPStatus.BAD_REQUEST, OperationError.FLAGS.QUIET);
      }
      const { values, valueRanges, excludeValues } = IndexUtils.getIndexTraversalParamsFromFilter({
        typeId: query.from[0].typeId,
        where: query.from[0].where,
        indexName: query.from[0].useIndex,
        indexDef,
        branchGuid: branchInfo.guid
      });
      // Try and see if we can also use the index for sorting/paging
      if (query.paging) {
        const traversalOrder = IndexUtils.getTraversalOrder({
          indexDef,
          order: query.paging.order
        });
        if (traversalOrder) {
          // We can use the index to efficiently sort and page
          indexPaging = {
            isDescending: traversalOrder !== 'ASC',
            limit: query.paging.limit,
            offset: query.paging.offset
          };
        }
      }
      const { paths } = await this._materializedHistoryService.getIndexMV({
        commitGuid,
        branchGuid: branchInfo.guid,
        indexName: query.from[0].useIndex,
        filtering: {
          values,
          valueRanges,
          excludeValues,
          pathPrefix: query.from[0].pathPrefix,
          depthLimit: query.from[0].depthLimit
        },
        paging: indexPaging
      });

      result = await this._materializedHistoryService.getCommitMV({
        guid: commitGuid,
        branchGuid: branchInfo.guid,
        paths
      });
      result.queryPaths = paths;
    } else {
      const paths = query.from.map((f) => f.pathPrefix).filter((p) => !!p);

      result = await this._materializedHistoryService.getCommitMV({
        guid: commitGuid,
        branchGuid: branchInfo.guid,
        paths
      });

      // TODO: Implement this at the fetch level for greater performance
      if (query.from[0].typeId) {
        result = await FilterInMemoryByType.filterByType(query.from[0], result.changeSet);
      }

      if (query.from[0].where) {
        let limitedPaths;
        if (result.queryPaths) {
          limitedPaths = result.queryPaths;
        }
        result = await FilterInMemoryByValue.filterByValue(
          query.from[0], result.changeSet, limitedPaths
        );
      }
    }

    if (query.paging && !indexPaging) { // If the index is not good, fall back to in-memory paging
      let limitedPaths;
      if (result.queryPaths) {
        limitedPaths = result.queryPaths;
      }
      result = await NoIndexPaging.doPaging(
        query, result.changeSet, limitedPaths
      );
    }

    return result;
  }

  /**
   * Validates the query string
   * @param {Object} query - Query string describing the query
   * @return {Object} - Object with the arguments to pass to getCommitMV
   */
  _validateAndParseQueryString(query) {
    let result = Joi.validate(query, QUERY_SCHEMA, { convert: true });

    if (result.error) {
      throw new OperationError(
        `Invalid query ${result.error.details.map((e) => `${e.path}: ${e.message}`).join(', ')}`,
        '_validateAndParseQueryString', HTTPStatus.BAD_REQUEST,
        OperationError.FLAGS.QUIET);
    }

    if (result.value.from[0].typeId && TypeIdHelper.isPrimitiveType(result.value.from[0].typeId)) {
      throw new OperationError('from.typeId must not be a primitive type', 'GetCommit', HTTPStatus.BAD_REQUEST,
        OperationError.FLAGS.QUIET);
    }

    if (result.value.paging) {
      if (!result.value.from[0].typeId) {
        throw new OperationError('from.typeId required when paging', 'GetCommit', HTTPStatus.BAD_REQUEST,
          OperationError.FLAGS.QUIET);
      }

      if (result.value.paging.order.length > 1) {
        result.value.paging.order.forEach((o) => {
          if (!o.by) {
            throw new OperationError('Only a single ordering criteria is allowed when ordering by key',
              'GetCommit', HTTPStatus.BAD_REQUEST, OperationError.FLAGS.QUIET);
          }
        });
      }
    }

    if (result.value.from[0].depthLimit === -1) {
      result.value.from[0].depthLimit = Infinity;
    } else if (result.value.from[0].depthLimit === 0) {
      throw new OperationError('from.depthLimit must not be zero', 'GetCommit', HTTPStatus.BAD_REQUEST,
        OperationError.FLAGS.QUIET);
    }

    return result.value;
  }
}

module.exports = QueryV1Execution;
