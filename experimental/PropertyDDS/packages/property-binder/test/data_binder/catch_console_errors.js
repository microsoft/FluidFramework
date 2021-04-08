/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */

/* globals should */

let firstError = undefined;

const hadConsoleError = function() {
  return firstError !== undefined;
};

const clearConsoleError = function() {
  firstError = undefined;
};

const catchConsoleErrors = function() {
  let oldConsoleError, oldConsoleAssert;

  beforeEach(function() {
    clearConsoleError();
    oldConsoleError = console.error;
    oldConsoleAssert = console.assert;
    console.error = function(e) {
      if (!firstError) {
        if (typeof e === Error) {
          firstError = e.stack;
        } else {
          firstError = e;
        }
      }
      oldConsoleError(e);
    };
    console.assert = function(expression, text) {
      oldConsoleAssert(expression, text);
      if (!firstError && !expression) {
        firstError = expression;
      }
    };
  });

  afterEach(function() {
    console.error = oldConsoleError;
    console.assert = oldConsoleAssert;
    if (firstError) {
      should.fail(true, false, firstError);
      clearConsoleError();
    }
  });
};

const oldConsoles = {};
const numConsoleMessages = {};

/**
 * Suppress console messages of the given category, and count them until endCountConsoleMessages
 *
 * @param {string} category warn, info, error...
 */
const countConsoleMessages = function(category) {
  oldConsoles[category] = console[category];

  numConsoleMessages[category] = 0;
  console[category] = function() {
    numConsoleMessages[category]++;
  };
};

/**
 * End the suppression and counting of messages of this category
 *
 * @param {string} category warn, info, error...
 * @return {Number} the number of category in this category
 */
const endCountConsoleMessages = function(category) {
  console[category] = oldConsoles[category];
  return numConsoleMessages[category];
};

export { catchConsoleErrors, hadConsoleError, clearConsoleError, countConsoleMessages, endCountConsoleMessages };
