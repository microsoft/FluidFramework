/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const _ = require('lodash');
const AWS = require('aws-sdk');

/**
 * A helper class to retrieve the parameters required to make common DynamoDB calls.
 */
class ParamFactory {
  /**
   * @param {object} config The DynamoDB configuration.
   */
  constructor(config) {
    this._config = _.clone(config);
    delete this._config.returnConsumedCapacity;
  }

  /**
   * Escape reserved DynamoDB names.
   * @param {Array<string>} names Array of names to escape.
   * @return {object} A map of escaped to unescaped names.
   * @private
   */
  static escapeReservedNames(names) {
    let i = 0;
    let attributeNames = {};
    _.each(names, name => {
      attributeNames[`#r${i++}`] = name;
    });

    return attributeNames;
  }

  /**
   * Builds the DynamoDB updateItem expression that splits the update expression, the column names
   * and their values in separate fields.
   * @param {object} updates A map of column names to their update value.
   * @param {object} removeArray A list of attributes to remove.
   * @param {object} condition A condition to set for the update to succeed.
   *   Example: {
   *     keyMustExist: true,
   *     expression: 'sequence = :value',
   *     variables: {
   *       value: 3
   *     }
   *   }
   * @param {object} [condition.variables=undefined] A map of variable names to their value, that are
   *   in the condition expression. May be undefined when no condition is set for the updateItem
   *   operation.
   * @return {object} The UpdateExpression, along with its ExpressionAttributeNames and
   *   ExpressionAttributeValues.
   */
  static getUpdateExpression(updates, removeArray, condition) {
    const result = { updateExpression: '' };

    let attributeNames = {};
    let attributeValues = {};
    let updateExpressions = [];
    let i = 0;

    if (updates) {
      _.map(updates, (value, columnName) => {
        attributeNames[`#p${i}`] = columnName;
        attributeValues[`:p${i}`] = value;
        updateExpressions.push(`#p${i} = :p${i++}`);
      });

      i = 0;
      _.map(condition.variables, (value, varName) => {
        // Use a placeholder instead of the variable name to avoid conflicts with DynamoDB reserved
        // keywords:
        const placeholder = `#v${i++}`;
        attributeNames[placeholder] = varName;
        attributeValues[`:${varName}`] = value;

        // Match all the naked variable references in the condition expression:
        // 'value = :value' <== will match 'value' but not ':value'.
        const re = new RegExp(`(^|[^:])${varName}`, 'g');
        // Replace all variable references with the placeholder that doesn't conflict with reserved
        // DynamoDB names:
        condition.expression = condition.expression.replace(re, `$1${placeholder}`);
      });

      result.expressionAttributeValues = AWS.DynamoDB.Converter.marshall(attributeValues);
      result.updateExpression = `SET ${updateExpressions.join(', ')}`;
    }

    result.expressionAttributeNames = attributeNames;

    if (removeArray && removeArray.length > 0) {
      const SEPARATOR = result.updateExpression.length > 0 ? ' ' : '';
      result.updateExpression =
        `${result.updateExpression}${SEPARATOR}REMOVE ${removeArray.join(', ')}`;
    }

    return result;
  }

  /**
   * Prepare parameters to call AWS.DynamoDB.deleteItem.
   * @param {string} tableName Table name
   * @param {object} pk The row's primary key. Can be simple (a partition key) or composite
   *   (partition key and sort key).
   * @param {object} options Delete options.
   * @param {boolean} [options.keyMustExist=true] Set to true to fail the delete if the key doesn't exist.
   * @return {object} The deleteItem DynamoDB parameters.
   */
  createDeleteItem(tableName, pk, options) {
    options.keyMustExist = _.isUndefined(options.keyMustExist) ? true : options.keyMustExist;

    let ddbParams = {
      Key: AWS.DynamoDB.Converter.marshall(pk),
      TableName: tableName
    };

    if (this._config.returnConsumedCapacity) {
      ddbParams.ReturnConsumedCapacity = this._config.returnConsumedCapacity;
    }

    if (options.keyMustExist) {
      const pkColumnNames = _.map(pk, (value, columnName) => {
        return columnName;
      });
      ddbParams.ExpressionAttributeNames = ParamFactory.escapeReservedNames(pkColumnNames);
      const attrs = _.map(ddbParams.ExpressionAttributeNames, (columnName, escapedName) => {
        return `attribute_exists(${escapedName})`;
      });
      ddbParams.ConditionExpression = attrs.join(' AND ');
    }

    return ddbParams;
  }

  /**
   * Prepare parameters to call AWS.DynamoDB.putItem.
   * See {@link http://docs.aws.amazon.com/goto/AWSJavaScriptSDK/dynamodb-2012-08-10/PutItem}
   * @param {string} tableName The table name.
   * @param {object} params A row to persist in the table. At a minimum, the row must contain
   *   attributes matching the table's primary key.
   * @param {Array<string>} [protectedAttrs=undefined] When set to the name of the key attribute(s)
   *   and an item with the same key already exists, the operation fails. Defaults to undefined,
   *   which overwrites existing entries.
   * @return {object} The putItem DynamoDB parameters.
   */
  createPutItem(tableName, params, protectedAttrs) {
    const ddbParams = {
      Item: AWS.DynamoDB.Converter.marshall(params),
      TableName: tableName
    };

    if (this._config.returnConsumedCapacity) {
      ddbParams.ReturnConsumedCapacity = this._config.returnConsumedCapacity;
    }

    if (protectedAttrs) {
      ddbParams.ExpressionAttributeNames = ParamFactory.escapeReservedNames(protectedAttrs);
      const attrs = _.map(ddbParams.ExpressionAttributeNames, (value, attr) => {
        return `attribute_not_exists(${attr})`;
      });
      ddbParams.ConditionExpression = attrs.join(' AND ');
    }

    return ddbParams;
  }

  /**
   * Prepare parameters to call AWS.DynamoDB.updateItem.
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
   * @return {object} The updateItem DynamoDB parameters.
   */
  createUpdateItem(tableName, pk, updates, condition, removeArray) {
    if (condition) {
      condition.keyMustExist = _.isUndefined(condition.keyMustExist) ? true : condition.keyMustExist;
    } else {
      condition = { keyMustExist: true };
    }

    let ddbParams = {
      Key: AWS.DynamoDB.Converter.marshall(pk),
      TableName: tableName,
      ReturnValues: 'UPDATED_OLD'
    };

    // Build the DynamoDB update expression:
    const updateExp = ParamFactory.getUpdateExpression(updates, removeArray, condition);
    ddbParams.ExpressionAttributeNames = updateExp.expressionAttributeNames;
    ddbParams.ExpressionAttributeValues = updateExp.expressionAttributeValues;
    ddbParams.UpdateExpression = updateExp.updateExpression;

    let conditionalExpressions = [];

    if (condition.keyMustExist) {
      let i = 0;
      // Add the PK constraint to the conditional expressions.

      conditionalExpressions = _.map(pk, (value, columnName)  => {
        const placeholder = `#r${i++}`;
        ddbParams.ExpressionAttributeNames[placeholder] = columnName;
        return `attribute_exists(${placeholder})`;
      });
    }

    if (condition.expression) {
      // Add the specified (arbitrary) conditional expression.
      conditionalExpressions.push(`(${condition.expression})`);
    }

    if (conditionalExpressions.length > 0) {
      // Join all conditional expressions.
      ddbParams.ConditionExpression = conditionalExpressions.join(' AND ');
    }

    return ddbParams;
  }
}

module.exports = ParamFactory;
