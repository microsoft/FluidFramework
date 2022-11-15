/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const path = require('path');
const credsRotation = require('./credential_rotation');
const HttpStatus = require('http-status-codes');
const newGuid = require('@fluid-experimental/property-common').GuidUtils.generateGUID;
const OperationError = require('@fluid-experimental/property-common').OperationError;

/**
 * A write transaction accumulates calls to conditionally put, update, and delete DynamoDB records,
 * and executes them in a single transaction. The transaction is subject to all the limitations
 * documented in DynamoDB for transactWriteItems.
 * See {@link https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis.html}
 */
class WriteTransaction {
  /**
   *
   * @param {ParamFactory} paramFactory A ParamFactory instance used to create the DynamoDB
   *   parameters used in calls to the AWS.DynamoDB library.
   */
  constructor(paramFactory) {
    this._paramFactory = paramFactory;
    this._transactItems = [];
    this._clientRequestToken = newGuid();
  }

  /**
   * Adds a condition check to the write transaction. Call {@link #execute} to execute the transaction.
   */
  conditionCheck() {
    throw new OperationError(`WriteTransaction.conditionCheck is not implemented`,
      'WriteTransaction.conditionCheck', HttpStatus.NOT_IMPLEMENTED);
  }

  /**
   * Adds a deleteItem to the write transaction. Call {@link #execute} to execute the transaction.
   * @param {string} tableName Table name
   * @param {object} pk The row's primary key. Can be simple (a partition key) or composite
   *   (partition key and sort key).
   * @param {object} [options] Delete options.
   * @param {boolean} [options.keyMustExist=true] Set to true to fail the delete if the key doesn't exist.
   */
  deleteItem(tableName, pk, options = { keyMustExist: true }) {
    const ddbParams = {
      Delete: this._paramFactory.createDeleteItem(tableName, pk, options)
    };
    this._transactItems.push(ddbParams);
  }

  /**
   * Adds a putItem to the write transaction. Call {@link #execute} to execute the transaction.
   * @param {string} tableName The table name.
   * @param {object} params A row to persist in the table. At a minimum, the row must contain
   *   attributes matching the table's primary key.
   * @param {Array<string>} [protectedAttrs=undefined] When set to the name of the key attribute(s)
   *   and an item with the same key already exists, the operation fails. Defaults to undefined,
   *   which overwrites existing entries.
   */
  putItem(tableName, params, protectedAttrs) {
    const ddbParams = {
      Put: this._paramFactory.createPutItem(tableName, params, protectedAttrs)
    };
    this._transactItems.push(ddbParams);
  }

  /**
   * Adds an updateItem action to the write transaction. Call {@link #execute} to execute the transaction.
   * @param {string} tableName The table name.
   * @param {object} pk The primary key of the row to update. Can be simple (a partition key) or
   *   composite (partition key and sort key).
   * @param {object} [updates=undefined] A map of column names to their update value.
   * @param {object} [condition=undefined] An optional condition to set for the update to succeed.
   *   Example: {
   *     keyMustExist: true,
   *     expression: 'sequence = :value',
   *     variables: {
   *       value: 3
   *     }
   *   }
   * @param {boolean} [condition.keyMustExist=true] Set to true to fail the update if the row identified by
   *   'pk' doesn't exist.
   * @param {string} condition.expression A DynamoDB ConditionExpression string.
   * @param {object} condition.variables A map of variable names to their value, that are in the
   *   condition expression.
   * @param {object} [removeArray=undefined] A list of attributes to remove.
    */
  updateItem(tableName, pk, updates, condition, removeArray) {
    const ddbParams = {
      Update: this._paramFactory.createUpdateItem(tableName, pk, updates, condition, removeArray)
    };
    delete ddbParams.Update.ReturnValues; // <-- This option is not used in transactions
    this._transactItems.push(ddbParams);
  }

  /**
   * Execute the transaction. WriteTransaction instances cannot be reused except to retry a failed call.
   * @return {object} The result of calling AWS.DynamoDB.transactWriteItems
   */
  async execute() {
    const ddbParams = {
      TransactItems: this._transactItems,
      ClientRequestToken: this._clientRequestToken,
      ReturnConsumedCapacity: credsRotation.ddbClient.config.returnConsumedCapacity
    };
    return await credsRotation.ddbClient._ddbApiCall('transactWriteItems', ddbParams);
  }
}

module.exports = WriteTransaction;
