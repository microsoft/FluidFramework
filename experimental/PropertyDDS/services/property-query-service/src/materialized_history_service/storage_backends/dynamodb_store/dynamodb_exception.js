/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const _ = require('lodash');
const HttpStatus = require('http-status-codes');

const duplicateKeyRE = new RegExp('Provided list of item keys contains duplicates');

/**
 * @fileOverview
 * A class to categorize DynamoDB exceptions.
 */
class DynamoDBException {
    /**
     * Create a new DynamoDBException that can be used to determine if an error is transient or not.
     * @param {Error} error An error from a call to DynamoDB in the AWS SDK.
     */
    constructor(error) {
        this._error = error;
    }

    /**
     * @param {string} message The error message.
     * @return {Error} An error whose code and statusCode properties are those of a DynamoDB
     * ProvisionedThroughputExceededException.
     * @static
     */
    static getProvisionedThroughputExceededException(message) {
        return _createError('ProvisionedThroughputExceededException', HttpStatus.BAD_REQUEST, message);
    }

    /**
     * Examine an error to determine if it is transient.
     * The 'retryable' flag is ignored because some errors are flagged as retryable in the AWS SDK
     * that are not transient, such as 'UnrecognizedClientException'.
     * See {@link https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Programming.Errors.html}
     * @return {boolean} Whether or not the error is transient.
     */
    isTransient() {
        return DynamoDBException.isTransient(this._error);
    }

    /**
     * Examine an error to determine if it is transient.
     * The 'retryable' flag is ignored because some errors are flagged as retryable in the AWS SDK
     * that are not transient, such as 'UnrecognizedClientException'.
     * See {@link https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Programming.Errors.html}
     * @param {Error} error An error from a call to DynamoDB in the AWS SDK.
     * @return {boolean} Whether or not the error is transient.
     * @static
     */
    static isTransient(error) {
        return (!_.isUndefined(error.statusCode) && error.statusCode >= 500 && error.statusCode < 600) ||
            error.code === 'ProvisionedThroughputExceededException' ||
            error.code === 'ThrottlingException';
    }

    /**
     * @param {Error} error An error instance
     * @return {boolean} Whether or not the error is a DynamoDB duplicate key error.
     */
    static isDuplicateKey(error) {
        return error.statusCode === HttpStatus.BAD_REQUEST &&
            error.code === 'ValidationException' &&
            duplicateKeyRE.test(error.message);
    }
}

/**
 * Create an error whose code and statusCode properties are those of a DynamoDB exception.
 * @param {string} code A DynamoDB exception code.
 * @param {number} statusCode A DynamoDB exception status code.
 * @param {string} message The error message.
 * @return {Error} An error whose code and statusCode properties are those of a DynamoDB exception.
 */
function _createError(code, statusCode, message) {
    const error = new Error(message);
    error.code = code;
    error.statusCode = statusCode;
    return error;
}

module.exports = DynamoDBException;
