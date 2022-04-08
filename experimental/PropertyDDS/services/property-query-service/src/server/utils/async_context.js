/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const  { createNamespace, getNamespace } = require('cls-hooked');

createNamespace('mhsAsync');

/**
 * A facade for a context per transaction
 */
class AsyncContext {
  /**
   * Returns the current context
   * @return {Context} - The context
   */
  static getContext() {
    return getNamespace('mhsAsync');
  }

  /**
   * Initializes a context
   * @param {function} handler - Code to run under this context
   */
  static async runInNewContext(handler) {
    return await new Promise((res, rej) => {
      AsyncContext.getContext().run(() => handler().then(res, rej));
    });
  }

  /**
   * Sets a value inside a context
   * @param {String} key - The key
   * @param {*} value - The value
   */
  static setInContext(key, value) {
    let ctx = AsyncContext.getContext();
    if (ctx.active) {
      ctx.set(key, value);
    }
  }

  /**
   * Increments a value inside a context
   * @param {String} key - The key
   * @param {*} incrementBy - How much to increment by
   */
  static incrementInContext(key, incrementBy) {
    let value = AsyncContext.getInContext(key);
    if (!value) {
      value = 0;
    }
    AsyncContext.setInContext(key, value + incrementBy);
  }

  /**
   * Returns a value from context
   * @param {String} key - Key for the value
   * @return {*} - Value last set for the key in the context
   */
  static getInContext(key) {
    return AsyncContext.getContext().get(key);
  }

  /**
   * Returns all keys associated to the DB Stats
   * @return {Object} - Associative array for these stats
   */
  static getDBStats() {
    return {
      nodesReadFromCache: AsyncContext.getInContext('nodesReadFromCache') || 0,
      nodesReadFromBackend: AsyncContext.getInContext('nodesReadFromBackend') || 0,
      nodesWritten: AsyncContext.getInContext('nodesWritten') || 0,
      nodesDeleted: AsyncContext.getInContext('nodesDeleted') || 0,
      wcuUsed: AsyncContext.getInContext('wcuUsed') || 0,
      rcuUsed: AsyncContext.getInContext('rcuUsed') || 0
    };
  }
}

module.exports = AsyncContext;
