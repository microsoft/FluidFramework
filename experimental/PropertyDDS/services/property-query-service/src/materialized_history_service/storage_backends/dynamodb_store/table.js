/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable max-len */
const { ModuleLogger } = require('@fluid-experimental/property-query')
const logger = ModuleLogger.getLogger('HFDM.PropertyGraphStore.DynamoDB');

let exported = {};
let nameToTableMap = {};  // Maps all Table instances by name
let names = [];           // Array of all table names

/**
 * @fileOverview
 * The table enumeration.
 */
class Table {
  /**
   * Create a table by specifying its keyspace and name
   * @param {string} id Table id. Ex.: "commits"
   * @param {string} name Full table name. Ex.: "hfdm-c-uw2-db.commits"
   * @param {Array<string>} pkColumns The name of primary key columns. Includes the partition key
   *   and optionally the sort key.
   * @param {object} [indexes=undefined] Maps table indexes by name.
   */
  constructor(id, name, pkColumns, indexes) {
    this._id = id;
    this._name = name;
    this._pkColumns = pkColumns;
    this._indexes = indexes;
  }

  /**
   * @return {string} The table id. Ex.: "commits".
   */
  get id() {
    return this._id;
  }

  /**
   * @return {object} A map of table indexes by name.
   */
  get indexes() {
    return this._indexes;
  }

  /**
   * @return {Array<string>} The name of primary key columns. Includes the partition key and
   *   optionally the sort key.
   */
  get pkColumns() {
    return this._pkColumns;
  }

  /**
   * @return {string} The table name. Ex.: 'dev.business'
   */
  get name() {
    return this._name;
  }

  /**
   * @return {string} The table name. Ex.: 'dev.business'
   */
  toString() {
    return this._name;
  }

  /**
   * @param {string} name A table name
   * @return {Table|undefined} The table instance identified by 'name' if it exists.
   */
  static fromName(name) {
    return nameToTableMap[name];
  }

  /**
   * @return {Array<string>} An array of all the table names.
   */
  static get names() {
    return names;
  }
}

/**
 * @param {string} keyspace A common table prefix. That prefix is legacy: it predates the ability to set
 *   individual table names.
 * @param {string} tableId A well known table id, such as "commits".
 * @param {object} [tableNames] A map of well known table ids to custom table name.
 * @return {string} The legacy table name that is a concatenation of the keyspace and table id, or a
 *   fully custom name from the tableNames map.
 */
const getTableName = (keyspace, tableId, tableNames) => {
  if (tableNames && tableNames[tableId]) {
    logger.info(`Table name override: { ${tableId}: ${tableNames[tableId]} }`);
    return tableNames[tableId];
  }

  return `${keyspace}.${tableId}`;
};

/**
 * Create a Table instance
 * @param {string} tableId A well known table id, such as "commits".
 * @param {string} keyspace A common table prefix. That prefix is legacy: it predates the ability to set
 *   individual table names.
 * @param {object} [tableNames] A map of well known table ids to custom table name.
 * @param {Array<string>} pkColumns The name of primary key columns. Includes the partition key
 *   and optionally the sort key.
 * @param {object} [indexes=undefined] Maps table indexes by name.
 * @return {Table} A table instance.
 */
const createInstance = (tableId, keyspace, tableNames, pkColumns, indexes) => {
  const name = getTableName(keyspace, tableId, tableNames);
  const table = new Table(tableId, name, pkColumns, indexes);
  nameToTableMap[name] = table;
  names.push(name);
  return table;
};

/**
 * Initializes the DynamoDB table names.
 * @param {string} keyspace Keyspace name
 * @param {object} [tableNames] A map of well known table ids to custom table name.
 *   Ex.: { commits: 'hfdm-c-uw2-db.commits' }
 */
exported.init = function(keyspace, tableNames) {
  nameToTableMap = {};
  names = [];

  exported.ACCESS_CONTROL = createInstance('accessControl', keyspace, tableNames, ['pk', 'sk'], {byPolicyId: {name: 'byPolicyId'}});
  exported.BINARY_OBJECTS = createInstance('binaryObjects', keyspace, tableNames, ['objectKey'], {byRepoPartition: {name: 'byRepoPartition'}});
  exported.BINARY_MERGES = createInstance('binaryMerges', keyspace, tableNames, ['id'], {byBranchPage: {name: 'byBranchPage'}});
  exported.BRANCHES = createInstance('branches', keyspace, tableNames, ['branch'], { byRepo: {name: 'byRepo'} });
  exported.BUSINESS = createInstance('business', keyspace, tableNames, ['id']);
  exported.COMMITS = createInstance('commits', keyspace, tableNames, ['commit'], { byTopology: {name: 'byTopology2'} });
  exported.LIFECYCLE = createInstance('lifecycle', keyspace, tableNames, ['id', 'transitionTime']);
  exported.MAPS = createInstance('maps', keyspace, tableNames, ['map', 'key']);
  exported.MATERIALIZED_HISTORY = createInstance('materializedHistory', keyspace, tableNames, ['PK', 'SK']);
  exported.METRICS = createInstance('metrics', keyspace, tableNames, ['id', 'created']);
  exported.REPOSITORIES = createInstance('repositories', keyspace, tableNames, ['repository'], { byCreatorId: {name: 'byCreatorId'} });
  exported.TOPOLOGY = createInstance('topology', keyspace, tableNames, ['id', 'created']);
};

exported.fromName = Table.fromName;
exported.names = Table.names;
module.exports = exported;
