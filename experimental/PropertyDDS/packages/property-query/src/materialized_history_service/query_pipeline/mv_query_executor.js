/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const SimpleQueryExecution = require('./simple_query_execution');
const MultipleQueriesExecution = require('./multiple_queries_execution');
const MockAsyncContext = require('../../utils/mock_async_context');

/**
 * Executes the query for a get MV
 */
class MaterializedViewQueryExecutor {

  /**
   * Constructor
   * @param {Object} params - Params for this
   * @param {Object} params.materializedHistoryService - Instance of MaterializedHistoryService
   * @param {Object} params.systemMonitor The system monitor to use
   */
  constructor(params) {
    this._systemMonitor = params.systemMonitor;
    this._materializedHistoryService = params.materializedHistoryService;
    this._asyncContext = params.asyncContext || MockAsyncContext;
  }

  /**
   * General router for query execution based on version and indices
   * @param {String} branchGuid - Guid of the branch in question
   * @param {String} commitGuid - Commit guid for the MV
   * @param {Object} queryString - Raw query string input from the REST request
   * @return {Array} - An array of branch info, and changeset
   */
  async execute(branchGuid, commitGuid, queryString) {
    this._systemMonitor.addCustomAttributes({
      commitGuid: commitGuid,
      branchGuid: branchGuid
    });

    return this._asyncContext.runInNewContext(async () => {
      let branchInfo = await this._materializedHistoryService.getBranch(branchGuid);
      let qe;
      if (!queryString.query) {
        qe = new SimpleQueryExecution({
          materializedHistoryService: this._materializedHistoryService
        });

      } else {
        qe = new MultipleQueriesExecution({
          materializedHistoryService: this._materializedHistoryService
        });
      }

      let result = await qe.execute(branchInfo, commitGuid, queryString);

      this._systemMonitor.addCustomAttributes(AsyncContext.getDBStats());

      return [branchInfo, result];
    });
  }
}

module.exports = MaterializedViewQueryExecutor;
