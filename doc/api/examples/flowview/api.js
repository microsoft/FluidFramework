(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.prague = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
module.exports = after

function after(count, callback, err_cb) {
    var bail = false
    err_cb = err_cb || noop
    proxy.count = count

    return (count === 0) ? callback() : proxy

    function proxy(err, result) {
        if (proxy.count <= 0) {
            throw new Error('after called too many times')
        }
        --proxy.count

        // after first error, rest are passed to err_cb
        if (err) {
            bail = true
            callback(err)
            // future error callbacks will go to error handler
            callback = err_cb
        } else if (proxy.count === 0 && !bail) {
            callback(null, result)
        }
    }
}

function noop() {}

},{}],2:[function(require,module,exports){
/**
 * An abstraction for slicing an arraybuffer even when
 * ArrayBuffer.prototype.slice is not supported
 *
 * @api public
 */

module.exports = function(arraybuffer, start, end) {
  var bytes = arraybuffer.byteLength;
  start = start || 0;
  end = end || bytes;

  if (arraybuffer.slice) { return arraybuffer.slice(start, end); }

  if (start < 0) { start += bytes; }
  if (end < 0) { end += bytes; }
  if (end > bytes) { end = bytes; }

  if (start >= bytes || start >= end || bytes === 0) {
    return new ArrayBuffer(0);
  }

  var abv = new Uint8Array(arraybuffer);
  var result = new Uint8Array(end - start);
  for (var i = start, ii = 0; i < end; i++, ii++) {
    result[ii] = abv[i];
  }
  return result.buffer;
};

},{}],3:[function(require,module,exports){
(function (global){
'use strict';

// compare and isBuffer taken from https://github.com/feross/buffer/blob/680e9e5e488f22aac27599a57dc844a6315928dd/index.js
// original notice:

/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
 * @license  MIT
 */
function compare(a, b) {
  if (a === b) {
    return 0;
  }

  var x = a.length;
  var y = b.length;

  for (var i = 0, len = Math.min(x, y); i < len; ++i) {
    if (a[i] !== b[i]) {
      x = a[i];
      y = b[i];
      break;
    }
  }

  if (x < y) {
    return -1;
  }
  if (y < x) {
    return 1;
  }
  return 0;
}
function isBuffer(b) {
  if (global.Buffer && typeof global.Buffer.isBuffer === 'function') {
    return global.Buffer.isBuffer(b);
  }
  return !!(b != null && b._isBuffer);
}

// based on node assert, original notice:

// http://wiki.commonjs.org/wiki/Unit_Testing/1.0
//
// THIS IS NOT TESTED NOR LIKELY TO WORK OUTSIDE V8!
//
// Originally from narwhal.js (http://narwhaljs.org)
// Copyright (c) 2009 Thomas Robinson <280north.com>
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the 'Software'), to
// deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
// sell copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN
// ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
// WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

var util = require('util/');
var hasOwn = Object.prototype.hasOwnProperty;
var pSlice = Array.prototype.slice;
var functionsHaveNames = (function () {
  return function foo() {}.name === 'foo';
}());
function pToString (obj) {
  return Object.prototype.toString.call(obj);
}
function isView(arrbuf) {
  if (isBuffer(arrbuf)) {
    return false;
  }
  if (typeof global.ArrayBuffer !== 'function') {
    return false;
  }
  if (typeof ArrayBuffer.isView === 'function') {
    return ArrayBuffer.isView(arrbuf);
  }
  if (!arrbuf) {
    return false;
  }
  if (arrbuf instanceof DataView) {
    return true;
  }
  if (arrbuf.buffer && arrbuf.buffer instanceof ArrayBuffer) {
    return true;
  }
  return false;
}
// 1. The assert module provides functions that throw
// AssertionError's when particular conditions are not met. The
// assert module must conform to the following interface.

var assert = module.exports = ok;

// 2. The AssertionError is defined in assert.
// new assert.AssertionError({ message: message,
//                             actual: actual,
//                             expected: expected })

var regex = /\s*function\s+([^\(\s]*)\s*/;
// based on https://github.com/ljharb/function.prototype.name/blob/adeeeec8bfcc6068b187d7d9fb3d5bb1d3a30899/implementation.js
function getName(func) {
  if (!util.isFunction(func)) {
    return;
  }
  if (functionsHaveNames) {
    return func.name;
  }
  var str = func.toString();
  var match = str.match(regex);
  return match && match[1];
}
assert.AssertionError = function AssertionError(options) {
  this.name = 'AssertionError';
  this.actual = options.actual;
  this.expected = options.expected;
  this.operator = options.operator;
  if (options.message) {
    this.message = options.message;
    this.generatedMessage = false;
  } else {
    this.message = getMessage(this);
    this.generatedMessage = true;
  }
  var stackStartFunction = options.stackStartFunction || fail;
  if (Error.captureStackTrace) {
    Error.captureStackTrace(this, stackStartFunction);
  } else {
    // non v8 browsers so we can have a stacktrace
    var err = new Error();
    if (err.stack) {
      var out = err.stack;

      // try to strip useless frames
      var fn_name = getName(stackStartFunction);
      var idx = out.indexOf('\n' + fn_name);
      if (idx >= 0) {
        // once we have located the function frame
        // we need to strip out everything before it (and its line)
        var next_line = out.indexOf('\n', idx + 1);
        out = out.substring(next_line + 1);
      }

      this.stack = out;
    }
  }
};

// assert.AssertionError instanceof Error
util.inherits(assert.AssertionError, Error);

function truncate(s, n) {
  if (typeof s === 'string') {
    return s.length < n ? s : s.slice(0, n);
  } else {
    return s;
  }
}
function inspect(something) {
  if (functionsHaveNames || !util.isFunction(something)) {
    return util.inspect(something);
  }
  var rawname = getName(something);
  var name = rawname ? ': ' + rawname : '';
  return '[Function' +  name + ']';
}
function getMessage(self) {
  return truncate(inspect(self.actual), 128) + ' ' +
         self.operator + ' ' +
         truncate(inspect(self.expected), 128);
}

// At present only the three keys mentioned above are used and
// understood by the spec. Implementations or sub modules can pass
// other keys to the AssertionError's constructor - they will be
// ignored.

// 3. All of the following functions must throw an AssertionError
// when a corresponding condition is not met, with a message that
// may be undefined if not provided.  All assertion methods provide
// both the actual and expected values to the assertion error for
// display purposes.

function fail(actual, expected, message, operator, stackStartFunction) {
  throw new assert.AssertionError({
    message: message,
    actual: actual,
    expected: expected,
    operator: operator,
    stackStartFunction: stackStartFunction
  });
}

// EXTENSION! allows for well behaved errors defined elsewhere.
assert.fail = fail;

// 4. Pure assertion tests whether a value is truthy, as determined
// by !!guard.
// assert.ok(guard, message_opt);
// This statement is equivalent to assert.equal(true, !!guard,
// message_opt);. To test strictly for the value true, use
// assert.strictEqual(true, guard, message_opt);.

function ok(value, message) {
  if (!value) fail(value, true, message, '==', assert.ok);
}
assert.ok = ok;

// 5. The equality assertion tests shallow, coercive equality with
// ==.
// assert.equal(actual, expected, message_opt);

assert.equal = function equal(actual, expected, message) {
  if (actual != expected) fail(actual, expected, message, '==', assert.equal);
};

// 6. The non-equality assertion tests for whether two objects are not equal
// with != assert.notEqual(actual, expected, message_opt);

assert.notEqual = function notEqual(actual, expected, message) {
  if (actual == expected) {
    fail(actual, expected, message, '!=', assert.notEqual);
  }
};

// 7. The equivalence assertion tests a deep equality relation.
// assert.deepEqual(actual, expected, message_opt);

assert.deepEqual = function deepEqual(actual, expected, message) {
  if (!_deepEqual(actual, expected, false)) {
    fail(actual, expected, message, 'deepEqual', assert.deepEqual);
  }
};

assert.deepStrictEqual = function deepStrictEqual(actual, expected, message) {
  if (!_deepEqual(actual, expected, true)) {
    fail(actual, expected, message, 'deepStrictEqual', assert.deepStrictEqual);
  }
};

function _deepEqual(actual, expected, strict, memos) {
  // 7.1. All identical values are equivalent, as determined by ===.
  if (actual === expected) {
    return true;
  } else if (isBuffer(actual) && isBuffer(expected)) {
    return compare(actual, expected) === 0;

  // 7.2. If the expected value is a Date object, the actual value is
  // equivalent if it is also a Date object that refers to the same time.
  } else if (util.isDate(actual) && util.isDate(expected)) {
    return actual.getTime() === expected.getTime();

  // 7.3 If the expected value is a RegExp object, the actual value is
  // equivalent if it is also a RegExp object with the same source and
  // properties (`global`, `multiline`, `lastIndex`, `ignoreCase`).
  } else if (util.isRegExp(actual) && util.isRegExp(expected)) {
    return actual.source === expected.source &&
           actual.global === expected.global &&
           actual.multiline === expected.multiline &&
           actual.lastIndex === expected.lastIndex &&
           actual.ignoreCase === expected.ignoreCase;

  // 7.4. Other pairs that do not both pass typeof value == 'object',
  // equivalence is determined by ==.
  } else if ((actual === null || typeof actual !== 'object') &&
             (expected === null || typeof expected !== 'object')) {
    return strict ? actual === expected : actual == expected;

  // If both values are instances of typed arrays, wrap their underlying
  // ArrayBuffers in a Buffer each to increase performance
  // This optimization requires the arrays to have the same type as checked by
  // Object.prototype.toString (aka pToString). Never perform binary
  // comparisons for Float*Arrays, though, since e.g. +0 === -0 but their
  // bit patterns are not identical.
  } else if (isView(actual) && isView(expected) &&
             pToString(actual) === pToString(expected) &&
             !(actual instanceof Float32Array ||
               actual instanceof Float64Array)) {
    return compare(new Uint8Array(actual.buffer),
                   new Uint8Array(expected.buffer)) === 0;

  // 7.5 For all other Object pairs, including Array objects, equivalence is
  // determined by having the same number of owned properties (as verified
  // with Object.prototype.hasOwnProperty.call), the same set of keys
  // (although not necessarily the same order), equivalent values for every
  // corresponding key, and an identical 'prototype' property. Note: this
  // accounts for both named and indexed properties on Arrays.
  } else if (isBuffer(actual) !== isBuffer(expected)) {
    return false;
  } else {
    memos = memos || {actual: [], expected: []};

    var actualIndex = memos.actual.indexOf(actual);
    if (actualIndex !== -1) {
      if (actualIndex === memos.expected.indexOf(expected)) {
        return true;
      }
    }

    memos.actual.push(actual);
    memos.expected.push(expected);

    return objEquiv(actual, expected, strict, memos);
  }
}

function isArguments(object) {
  return Object.prototype.toString.call(object) == '[object Arguments]';
}

function objEquiv(a, b, strict, actualVisitedObjects) {
  if (a === null || a === undefined || b === null || b === undefined)
    return false;
  // if one is a primitive, the other must be same
  if (util.isPrimitive(a) || util.isPrimitive(b))
    return a === b;
  if (strict && Object.getPrototypeOf(a) !== Object.getPrototypeOf(b))
    return false;
  var aIsArgs = isArguments(a);
  var bIsArgs = isArguments(b);
  if ((aIsArgs && !bIsArgs) || (!aIsArgs && bIsArgs))
    return false;
  if (aIsArgs) {
    a = pSlice.call(a);
    b = pSlice.call(b);
    return _deepEqual(a, b, strict);
  }
  var ka = objectKeys(a);
  var kb = objectKeys(b);
  var key, i;
  // having the same number of owned properties (keys incorporates
  // hasOwnProperty)
  if (ka.length !== kb.length)
    return false;
  //the same set of keys (although not necessarily the same order),
  ka.sort();
  kb.sort();
  //~~~cheap key test
  for (i = ka.length - 1; i >= 0; i--) {
    if (ka[i] !== kb[i])
      return false;
  }
  //equivalent values for every corresponding key, and
  //~~~possibly expensive deep test
  for (i = ka.length - 1; i >= 0; i--) {
    key = ka[i];
    if (!_deepEqual(a[key], b[key], strict, actualVisitedObjects))
      return false;
  }
  return true;
}

// 8. The non-equivalence assertion tests for any deep inequality.
// assert.notDeepEqual(actual, expected, message_opt);

assert.notDeepEqual = function notDeepEqual(actual, expected, message) {
  if (_deepEqual(actual, expected, false)) {
    fail(actual, expected, message, 'notDeepEqual', assert.notDeepEqual);
  }
};

assert.notDeepStrictEqual = notDeepStrictEqual;
function notDeepStrictEqual(actual, expected, message) {
  if (_deepEqual(actual, expected, true)) {
    fail(actual, expected, message, 'notDeepStrictEqual', notDeepStrictEqual);
  }
}


// 9. The strict equality assertion tests strict equality, as determined by ===.
// assert.strictEqual(actual, expected, message_opt);

assert.strictEqual = function strictEqual(actual, expected, message) {
  if (actual !== expected) {
    fail(actual, expected, message, '===', assert.strictEqual);
  }
};

// 10. The strict non-equality assertion tests for strict inequality, as
// determined by !==.  assert.notStrictEqual(actual, expected, message_opt);

assert.notStrictEqual = function notStrictEqual(actual, expected, message) {
  if (actual === expected) {
    fail(actual, expected, message, '!==', assert.notStrictEqual);
  }
};

function expectedException(actual, expected) {
  if (!actual || !expected) {
    return false;
  }

  if (Object.prototype.toString.call(expected) == '[object RegExp]') {
    return expected.test(actual);
  }

  try {
    if (actual instanceof expected) {
      return true;
    }
  } catch (e) {
    // Ignore.  The instanceof check doesn't work for arrow functions.
  }

  if (Error.isPrototypeOf(expected)) {
    return false;
  }

  return expected.call({}, actual) === true;
}

function _tryBlock(block) {
  var error;
  try {
    block();
  } catch (e) {
    error = e;
  }
  return error;
}

function _throws(shouldThrow, block, expected, message) {
  var actual;

  if (typeof block !== 'function') {
    throw new TypeError('"block" argument must be a function');
  }

  if (typeof expected === 'string') {
    message = expected;
    expected = null;
  }

  actual = _tryBlock(block);

  message = (expected && expected.name ? ' (' + expected.name + ').' : '.') +
            (message ? ' ' + message : '.');

  if (shouldThrow && !actual) {
    fail(actual, expected, 'Missing expected exception' + message);
  }

  var userProvidedMessage = typeof message === 'string';
  var isUnwantedException = !shouldThrow && util.isError(actual);
  var isUnexpectedException = !shouldThrow && actual && !expected;

  if ((isUnwantedException &&
      userProvidedMessage &&
      expectedException(actual, expected)) ||
      isUnexpectedException) {
    fail(actual, expected, 'Got unwanted exception' + message);
  }

  if ((shouldThrow && actual && expected &&
      !expectedException(actual, expected)) || (!shouldThrow && actual)) {
    throw actual;
  }
}

// 11. Expected to throw an error:
// assert.throws(block, Error_opt, message_opt);

assert.throws = function(block, /*optional*/error, /*optional*/message) {
  _throws(true, block, error, message);
};

// EXTENSION! This is annoying to write outside this module.
assert.doesNotThrow = function(block, /*optional*/error, /*optional*/message) {
  _throws(false, block, error, message);
};

assert.ifError = function(err) { if (err) throw err; };

var objectKeys = Object.keys || function (obj) {
  var keys = [];
  for (var key in obj) {
    if (hasOwn.call(obj, key)) keys.push(key);
  }
  return keys;
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"util/":197}],4:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.default = asyncify;

var _isObject = require('lodash/isObject');

var _isObject2 = _interopRequireDefault(_isObject);

var _initialParams = require('./internal/initialParams');

var _initialParams2 = _interopRequireDefault(_initialParams);

var _setImmediate = require('./internal/setImmediate');

var _setImmediate2 = _interopRequireDefault(_setImmediate);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/**
 * Take a sync function and make it async, passing its return value to a
 * callback. This is useful for plugging sync functions into a waterfall,
 * series, or other async functions. Any arguments passed to the generated
 * function will be passed to the wrapped function (except for the final
 * callback argument). Errors thrown will be passed to the callback.
 *
 * If the function passed to `asyncify` returns a Promise, that promises's
 * resolved/rejected state will be used to call the callback, rather than simply
 * the synchronous return value.
 *
 * This also means you can asyncify ES2017 `async` functions.
 *
 * @name asyncify
 * @static
 * @memberOf module:Utils
 * @method
 * @alias wrapSync
 * @category Util
 * @param {Function} func - The synchronous function, or Promise-returning
 * function to convert to an {@link AsyncFunction}.
 * @returns {AsyncFunction} An asynchronous wrapper of the `func`. To be
 * invoked with `(args..., callback)`.
 * @example
 *
 * // passing a regular synchronous function
 * async.waterfall([
 *     async.apply(fs.readFile, filename, "utf8"),
 *     async.asyncify(JSON.parse),
 *     function (data, next) {
 *         // data is the result of parsing the text.
 *         // If there was a parsing error, it would have been caught.
 *     }
 * ], callback);
 *
 * // passing a function returning a promise
 * async.waterfall([
 *     async.apply(fs.readFile, filename, "utf8"),
 *     async.asyncify(function (contents) {
 *         return db.model.create(contents);
 *     }),
 *     function (model, next) {
 *         // `model` is the instantiated model object.
 *         // If there was an error, this function would be skipped.
 *     }
 * ], callback);
 *
 * // es2017 example, though `asyncify` is not needed if your JS environment
 * // supports async functions out of the box
 * var q = async.queue(async.asyncify(async function(file) {
 *     var intermediateStep = await processFile(file);
 *     return await somePromise(intermediateStep)
 * }));
 *
 * q.push(files);
 */
function asyncify(func) {
    return (0, _initialParams2.default)(function (args, callback) {
        var result;
        try {
            result = func.apply(this, args);
        } catch (e) {
            return callback(e);
        }
        // if result is Promise object
        if ((0, _isObject2.default)(result) && typeof result.then === 'function') {
            result.then(function (value) {
                invokeCallback(callback, null, value);
            }, function (err) {
                invokeCallback(callback, err.message ? err : new Error(err));
            });
        } else {
            callback(null, result);
        }
    });
}

function invokeCallback(callback, error, value) {
    try {
        callback(error, value);
    } catch (e) {
        (0, _setImmediate2.default)(rethrow, e);
    }
}

function rethrow(error) {
    throw error;
}
module.exports = exports['default'];
},{"./internal/initialParams":6,"./internal/setImmediate":9,"lodash/isObject":164}],5:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.default = DLL;
// Simple doubly linked list (https://en.wikipedia.org/wiki/Doubly_linked_list) implementation
// used for queues. This implementation assumes that the node provided by the user can be modified
// to adjust the next and last properties. We implement only the minimal functionality
// for queue support.
function DLL() {
    this.head = this.tail = null;
    this.length = 0;
}

function setInitial(dll, node) {
    dll.length = 1;
    dll.head = dll.tail = node;
}

DLL.prototype.removeLink = function (node) {
    if (node.prev) node.prev.next = node.next;else this.head = node.next;
    if (node.next) node.next.prev = node.prev;else this.tail = node.prev;

    node.prev = node.next = null;
    this.length -= 1;
    return node;
};

DLL.prototype.empty = function () {
    while (this.head) this.shift();
    return this;
};

DLL.prototype.insertAfter = function (node, newNode) {
    newNode.prev = node;
    newNode.next = node.next;
    if (node.next) node.next.prev = newNode;else this.tail = newNode;
    node.next = newNode;
    this.length += 1;
};

DLL.prototype.insertBefore = function (node, newNode) {
    newNode.prev = node.prev;
    newNode.next = node;
    if (node.prev) node.prev.next = newNode;else this.head = newNode;
    node.prev = newNode;
    this.length += 1;
};

DLL.prototype.unshift = function (node) {
    if (this.head) this.insertBefore(this.head, node);else setInitial(this, node);
};

DLL.prototype.push = function (node) {
    if (this.tail) this.insertAfter(this.tail, node);else setInitial(this, node);
};

DLL.prototype.shift = function () {
    return this.head && this.removeLink(this.head);
};

DLL.prototype.pop = function () {
    return this.tail && this.removeLink(this.tail);
};

DLL.prototype.toArray = function () {
    var arr = Array(this.length);
    var curr = this.head;
    for (var idx = 0; idx < this.length; idx++) {
        arr[idx] = curr.data;
        curr = curr.next;
    }
    return arr;
};

DLL.prototype.remove = function (testFn) {
    var curr = this.head;
    while (!!curr) {
        var next = curr.next;
        if (testFn(curr)) {
            this.removeLink(curr);
        }
        curr = next;
    }
    return this;
};
module.exports = exports["default"];
},{}],6:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

exports.default = function (fn) {
    return function () /*...args, callback*/{
        var args = (0, _slice2.default)(arguments);
        var callback = args.pop();
        fn.call(this, args, callback);
    };
};

var _slice = require('./slice');

var _slice2 = _interopRequireDefault(_slice);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

module.exports = exports['default'];
},{"./slice":10}],7:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.default = onlyOnce;
function onlyOnce(fn) {
    return function () {
        if (fn === null) throw new Error("Callback was already called.");
        var callFn = fn;
        fn = null;
        callFn.apply(this, arguments);
    };
}
module.exports = exports["default"];
},{}],8:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.default = queue;

var _baseIndexOf = require('lodash/_baseIndexOf');

var _baseIndexOf2 = _interopRequireDefault(_baseIndexOf);

var _isArray = require('lodash/isArray');

var _isArray2 = _interopRequireDefault(_isArray);

var _noop = require('lodash/noop');

var _noop2 = _interopRequireDefault(_noop);

var _onlyOnce = require('./onlyOnce');

var _onlyOnce2 = _interopRequireDefault(_onlyOnce);

var _setImmediate = require('./setImmediate');

var _setImmediate2 = _interopRequireDefault(_setImmediate);

var _DoublyLinkedList = require('./DoublyLinkedList');

var _DoublyLinkedList2 = _interopRequireDefault(_DoublyLinkedList);

var _wrapAsync = require('./wrapAsync');

var _wrapAsync2 = _interopRequireDefault(_wrapAsync);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function queue(worker, concurrency, payload) {
    if (concurrency == null) {
        concurrency = 1;
    } else if (concurrency === 0) {
        throw new Error('Concurrency must not be zero');
    }

    var _worker = (0, _wrapAsync2.default)(worker);
    var numRunning = 0;
    var workersList = [];

    var processingScheduled = false;
    function _insert(data, insertAtFront, callback) {
        if (callback != null && typeof callback !== 'function') {
            throw new Error('task callback must be a function');
        }
        q.started = true;
        if (!(0, _isArray2.default)(data)) {
            data = [data];
        }
        if (data.length === 0 && q.idle()) {
            // call drain immediately if there are no tasks
            return (0, _setImmediate2.default)(function () {
                q.drain();
            });
        }

        for (var i = 0, l = data.length; i < l; i++) {
            var item = {
                data: data[i],
                callback: callback || _noop2.default
            };

            if (insertAtFront) {
                q._tasks.unshift(item);
            } else {
                q._tasks.push(item);
            }
        }

        if (!processingScheduled) {
            processingScheduled = true;
            (0, _setImmediate2.default)(function () {
                processingScheduled = false;
                q.process();
            });
        }
    }

    function _next(tasks) {
        return function (err) {
            numRunning -= 1;

            for (var i = 0, l = tasks.length; i < l; i++) {
                var task = tasks[i];

                var index = (0, _baseIndexOf2.default)(workersList, task, 0);
                if (index === 0) {
                    workersList.shift();
                } else if (index > 0) {
                    workersList.splice(index, 1);
                }

                task.callback.apply(task, arguments);

                if (err != null) {
                    q.error(err, task.data);
                }
            }

            if (numRunning <= q.concurrency - q.buffer) {
                q.unsaturated();
            }

            if (q.idle()) {
                q.drain();
            }
            q.process();
        };
    }

    var isProcessing = false;
    var q = {
        _tasks: new _DoublyLinkedList2.default(),
        concurrency: concurrency,
        payload: payload,
        saturated: _noop2.default,
        unsaturated: _noop2.default,
        buffer: concurrency / 4,
        empty: _noop2.default,
        drain: _noop2.default,
        error: _noop2.default,
        started: false,
        paused: false,
        push: function (data, callback) {
            _insert(data, false, callback);
        },
        kill: function () {
            q.drain = _noop2.default;
            q._tasks.empty();
        },
        unshift: function (data, callback) {
            _insert(data, true, callback);
        },
        remove: function (testFn) {
            q._tasks.remove(testFn);
        },
        process: function () {
            // Avoid trying to start too many processing operations. This can occur
            // when callbacks resolve synchronously (#1267).
            if (isProcessing) {
                return;
            }
            isProcessing = true;
            while (!q.paused && numRunning < q.concurrency && q._tasks.length) {
                var tasks = [],
                    data = [];
                var l = q._tasks.length;
                if (q.payload) l = Math.min(l, q.payload);
                for (var i = 0; i < l; i++) {
                    var node = q._tasks.shift();
                    tasks.push(node);
                    workersList.push(node);
                    data.push(node.data);
                }

                numRunning += 1;

                if (q._tasks.length === 0) {
                    q.empty();
                }

                if (numRunning === q.concurrency) {
                    q.saturated();
                }

                var cb = (0, _onlyOnce2.default)(_next(tasks));
                _worker(data, cb);
            }
            isProcessing = false;
        },
        length: function () {
            return q._tasks.length;
        },
        running: function () {
            return numRunning;
        },
        workersList: function () {
            return workersList;
        },
        idle: function () {
            return q._tasks.length + numRunning === 0;
        },
        pause: function () {
            q.paused = true;
        },
        resume: function () {
            if (q.paused === false) {
                return;
            }
            q.paused = false;
            (0, _setImmediate2.default)(q.process);
        }
    };
    return q;
}
module.exports = exports['default'];
},{"./DoublyLinkedList":5,"./onlyOnce":7,"./setImmediate":9,"./wrapAsync":11,"lodash/_baseIndexOf":76,"lodash/isArray":159,"lodash/noop":171}],9:[function(require,module,exports){
(function (process){
'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.hasNextTick = exports.hasSetImmediate = undefined;
exports.fallback = fallback;
exports.wrap = wrap;

var _slice = require('./slice');

var _slice2 = _interopRequireDefault(_slice);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var hasSetImmediate = exports.hasSetImmediate = typeof setImmediate === 'function' && setImmediate;
var hasNextTick = exports.hasNextTick = typeof process === 'object' && typeof process.nextTick === 'function';

function fallback(fn) {
    setTimeout(fn, 0);
}

function wrap(defer) {
    return function (fn /*, ...args*/) {
        var args = (0, _slice2.default)(arguments, 1);
        defer(function () {
            fn.apply(null, args);
        });
    };
}

var _defer;

if (hasSetImmediate) {
    _defer = setImmediate;
} else if (hasNextTick) {
    _defer = process.nextTick;
} else {
    _defer = fallback;
}

exports.default = wrap(_defer);
}).call(this,require('_process'))

},{"./slice":10,"_process":180}],10:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.default = slice;
function slice(arrayLike, start) {
    start = start | 0;
    var newLen = Math.max(arrayLike.length - start, 0);
    var newArr = Array(newLen);
    for (var idx = 0; idx < newLen; idx++) {
        newArr[idx] = arrayLike[start + idx];
    }
    return newArr;
}
module.exports = exports["default"];
},{}],11:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.isAsync = undefined;

var _asyncify = require('../asyncify');

var _asyncify2 = _interopRequireDefault(_asyncify);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var supportsSymbol = typeof Symbol === 'function';

function isAsync(fn) {
    return supportsSymbol && fn[Symbol.toStringTag] === 'AsyncFunction';
}

function wrapAsync(asyncFn) {
    return isAsync(asyncFn) ? (0, _asyncify2.default)(asyncFn) : asyncFn;
}

exports.default = wrapAsync;
exports.isAsync = isAsync;
},{"../asyncify":4}],12:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

exports.default = function (worker, concurrency) {
  var _worker = (0, _wrapAsync2.default)(worker);
  return (0, _queue2.default)(function (items, cb) {
    _worker(items[0], cb);
  }, concurrency, 1);
};

var _queue = require('./internal/queue');

var _queue2 = _interopRequireDefault(_queue);

var _wrapAsync = require('./internal/wrapAsync');

var _wrapAsync2 = _interopRequireDefault(_wrapAsync);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

module.exports = exports['default'];

/**
 * A queue of tasks for the worker function to complete.
 * @typedef {Object} QueueObject
 * @memberOf module:ControlFlow
 * @property {Function} length - a function returning the number of items
 * waiting to be processed. Invoke with `queue.length()`.
 * @property {boolean} started - a boolean indicating whether or not any
 * items have been pushed and processed by the queue.
 * @property {Function} running - a function returning the number of items
 * currently being processed. Invoke with `queue.running()`.
 * @property {Function} workersList - a function returning the array of items
 * currently being processed. Invoke with `queue.workersList()`.
 * @property {Function} idle - a function returning false if there are items
 * waiting or being processed, or true if not. Invoke with `queue.idle()`.
 * @property {number} concurrency - an integer for determining how many `worker`
 * functions should be run in parallel. This property can be changed after a
 * `queue` is created to alter the concurrency on-the-fly.
 * @property {Function} push - add a new task to the `queue`. Calls `callback`
 * once the `worker` has finished processing the task. Instead of a single task,
 * a `tasks` array can be submitted. The respective callback is used for every
 * task in the list. Invoke with `queue.push(task, [callback])`,
 * @property {Function} unshift - add a new task to the front of the `queue`.
 * Invoke with `queue.unshift(task, [callback])`.
 * @property {Function} remove - remove items from the queue that match a test
 * function.  The test function will be passed an object with a `data` property,
 * and a `priority` property, if this is a
 * [priorityQueue]{@link module:ControlFlow.priorityQueue} object.
 * Invoked with `queue.remove(testFn)`, where `testFn` is of the form
 * `function ({data, priority}) {}` and returns a Boolean.
 * @property {Function} saturated - a callback that is called when the number of
 * running workers hits the `concurrency` limit, and further tasks will be
 * queued.
 * @property {Function} unsaturated - a callback that is called when the number
 * of running workers is less than the `concurrency` & `buffer` limits, and
 * further tasks will not be queued.
 * @property {number} buffer - A minimum threshold buffer in order to say that
 * the `queue` is `unsaturated`.
 * @property {Function} empty - a callback that is called when the last item
 * from the `queue` is given to a `worker`.
 * @property {Function} drain - a callback that is called when the last item
 * from the `queue` has returned from the `worker`.
 * @property {Function} error - a callback that is called when a task errors.
 * Has the signature `function(error, task)`.
 * @property {boolean} paused - a boolean for determining whether the queue is
 * in a paused state.
 * @property {Function} pause - a function that pauses the processing of tasks
 * until `resume()` is called. Invoke with `queue.pause()`.
 * @property {Function} resume - a function that resumes the processing of
 * queued tasks when the queue is paused. Invoke with `queue.resume()`.
 * @property {Function} kill - a function that removes the `drain` callback and
 * empties remaining tasks from the queue forcing it to go idle. No more tasks
 * should be pushed to the queue after calling this function. Invoke with `queue.kill()`.
 */

/**
 * Creates a `queue` object with the specified `concurrency`. Tasks added to the
 * `queue` are processed in parallel (up to the `concurrency` limit). If all
 * `worker`s are in progress, the task is queued until one becomes available.
 * Once a `worker` completes a `task`, that `task`'s callback is called.
 *
 * @name queue
 * @static
 * @memberOf module:ControlFlow
 * @method
 * @category Control Flow
 * @param {AsyncFunction} worker - An async function for processing a queued task.
 * If you want to handle errors from an individual task, pass a callback to
 * `q.push()`. Invoked with (task, callback).
 * @param {number} [concurrency=1] - An `integer` for determining how many
 * `worker` functions should be run in parallel.  If omitted, the concurrency
 * defaults to `1`.  If the concurrency is `0`, an error is thrown.
 * @returns {module:ControlFlow.QueueObject} A queue object to manage the tasks. Callbacks can
 * attached as certain properties to listen for specific events during the
 * lifecycle of the queue.
 * @example
 *
 * // create a queue object with concurrency 2
 * var q = async.queue(function(task, callback) {
 *     console.log('hello ' + task.name);
 *     callback();
 * }, 2);
 *
 * // assign a callback
 * q.drain = function() {
 *     console.log('all items have been processed');
 * };
 *
 * // add some items to the queue
 * q.push({name: 'foo'}, function(err) {
 *     console.log('finished processing foo');
 * });
 * q.push({name: 'bar'}, function (err) {
 *     console.log('finished processing bar');
 * });
 *
 * // add some items to the queue (batch-wise)
 * q.push([{name: 'baz'},{name: 'bay'},{name: 'bax'}], function(err) {
 *     console.log('finished processing item');
 * });
 *
 * // add some items to the front of the queue
 * q.unshift({name: 'bar'}, function (err) {
 *     console.log('finished processing bar');
 * });
 */
},{"./internal/queue":8,"./internal/wrapAsync":11}],13:[function(require,module,exports){

/**
 * Expose `Backoff`.
 */

module.exports = Backoff;

/**
 * Initialize backoff timer with `opts`.
 *
 * - `min` initial timeout in milliseconds [100]
 * - `max` max timeout [10000]
 * - `jitter` [0]
 * - `factor` [2]
 *
 * @param {Object} opts
 * @api public
 */

function Backoff(opts) {
  opts = opts || {};
  this.ms = opts.min || 100;
  this.max = opts.max || 10000;
  this.factor = opts.factor || 2;
  this.jitter = opts.jitter > 0 && opts.jitter <= 1 ? opts.jitter : 0;
  this.attempts = 0;
}

/**
 * Return the backoff duration.
 *
 * @return {Number}
 * @api public
 */

Backoff.prototype.duration = function(){
  var ms = this.ms * Math.pow(this.factor, this.attempts++);
  if (this.jitter) {
    var rand =  Math.random();
    var deviation = Math.floor(rand * this.jitter * ms);
    ms = (Math.floor(rand * 10) & 1) == 0  ? ms - deviation : ms + deviation;
  }
  return Math.min(ms, this.max) | 0;
};

/**
 * Reset the number of attempts.
 *
 * @api public
 */

Backoff.prototype.reset = function(){
  this.attempts = 0;
};

/**
 * Set the minimum duration
 *
 * @api public
 */

Backoff.prototype.setMin = function(min){
  this.ms = min;
};

/**
 * Set the maximum duration
 *
 * @api public
 */

Backoff.prototype.setMax = function(max){
  this.max = max;
};

/**
 * Set the jitter
 *
 * @api public
 */

Backoff.prototype.setJitter = function(jitter){
  this.jitter = jitter;
};


},{}],14:[function(require,module,exports){
/*
 * base64-arraybuffer
 * https://github.com/niklasvh/base64-arraybuffer
 *
 * Copyright (c) 2012 Niklas von Hertzen
 * Licensed under the MIT license.
 */
(function(){
  "use strict";

  var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

  // Use a lookup table to find the index.
  var lookup = new Uint8Array(256);
  for (var i = 0; i < chars.length; i++) {
    lookup[chars.charCodeAt(i)] = i;
  }

  exports.encode = function(arraybuffer) {
    var bytes = new Uint8Array(arraybuffer),
    i, len = bytes.length, base64 = "";

    for (i = 0; i < len; i+=3) {
      base64 += chars[bytes[i] >> 2];
      base64 += chars[((bytes[i] & 3) << 4) | (bytes[i + 1] >> 4)];
      base64 += chars[((bytes[i + 1] & 15) << 2) | (bytes[i + 2] >> 6)];
      base64 += chars[bytes[i + 2] & 63];
    }

    if ((len % 3) === 2) {
      base64 = base64.substring(0, base64.length - 1) + "=";
    } else if (len % 3 === 1) {
      base64 = base64.substring(0, base64.length - 2) + "==";
    }

    return base64;
  };

  exports.decode =  function(base64) {
    var bufferLength = base64.length * 0.75,
    len = base64.length, i, p = 0,
    encoded1, encoded2, encoded3, encoded4;

    if (base64[base64.length - 1] === "=") {
      bufferLength--;
      if (base64[base64.length - 2] === "=") {
        bufferLength--;
      }
    }

    var arraybuffer = new ArrayBuffer(bufferLength),
    bytes = new Uint8Array(arraybuffer);

    for (i = 0; i < len; i+=4) {
      encoded1 = lookup[base64.charCodeAt(i)];
      encoded2 = lookup[base64.charCodeAt(i+1)];
      encoded3 = lookup[base64.charCodeAt(i+2)];
      encoded4 = lookup[base64.charCodeAt(i+3)];

      bytes[p++] = (encoded1 << 2) | (encoded2 >> 4);
      bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2);
      bytes[p++] = ((encoded3 & 3) << 6) | (encoded4 & 63);
    }

    return arraybuffer;
  };
})();

},{}],15:[function(require,module,exports){
'use strict'

exports.byteLength = byteLength
exports.toByteArray = toByteArray
exports.fromByteArray = fromByteArray

var lookup = []
var revLookup = []
var Arr = typeof Uint8Array !== 'undefined' ? Uint8Array : Array

var code = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
for (var i = 0, len = code.length; i < len; ++i) {
  lookup[i] = code[i]
  revLookup[code.charCodeAt(i)] = i
}

revLookup['-'.charCodeAt(0)] = 62
revLookup['_'.charCodeAt(0)] = 63

function placeHoldersCount (b64) {
  var len = b64.length
  if (len % 4 > 0) {
    throw new Error('Invalid string. Length must be a multiple of 4')
  }

  // the number of equal signs (place holders)
  // if there are two placeholders, than the two characters before it
  // represent one byte
  // if there is only one, then the three characters before it represent 2 bytes
  // this is just a cheap hack to not do indexOf twice
  return b64[len - 2] === '=' ? 2 : b64[len - 1] === '=' ? 1 : 0
}

function byteLength (b64) {
  // base64 is 4/3 + up to two characters of the original data
  return (b64.length * 3 / 4) - placeHoldersCount(b64)
}

function toByteArray (b64) {
  var i, l, tmp, placeHolders, arr
  var len = b64.length
  placeHolders = placeHoldersCount(b64)

  arr = new Arr((len * 3 / 4) - placeHolders)

  // if there are placeholders, only get up to the last complete 4 chars
  l = placeHolders > 0 ? len - 4 : len

  var L = 0

  for (i = 0; i < l; i += 4) {
    tmp = (revLookup[b64.charCodeAt(i)] << 18) | (revLookup[b64.charCodeAt(i + 1)] << 12) | (revLookup[b64.charCodeAt(i + 2)] << 6) | revLookup[b64.charCodeAt(i + 3)]
    arr[L++] = (tmp >> 16) & 0xFF
    arr[L++] = (tmp >> 8) & 0xFF
    arr[L++] = tmp & 0xFF
  }

  if (placeHolders === 2) {
    tmp = (revLookup[b64.charCodeAt(i)] << 2) | (revLookup[b64.charCodeAt(i + 1)] >> 4)
    arr[L++] = tmp & 0xFF
  } else if (placeHolders === 1) {
    tmp = (revLookup[b64.charCodeAt(i)] << 10) | (revLookup[b64.charCodeAt(i + 1)] << 4) | (revLookup[b64.charCodeAt(i + 2)] >> 2)
    arr[L++] = (tmp >> 8) & 0xFF
    arr[L++] = tmp & 0xFF
  }

  return arr
}

function tripletToBase64 (num) {
  return lookup[num >> 18 & 0x3F] + lookup[num >> 12 & 0x3F] + lookup[num >> 6 & 0x3F] + lookup[num & 0x3F]
}

function encodeChunk (uint8, start, end) {
  var tmp
  var output = []
  for (var i = start; i < end; i += 3) {
    tmp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2])
    output.push(tripletToBase64(tmp))
  }
  return output.join('')
}

function fromByteArray (uint8) {
  var tmp
  var len = uint8.length
  var extraBytes = len % 3 // if we have 1 byte left, pad 2 bytes
  var output = ''
  var parts = []
  var maxChunkLength = 16383 // must be multiple of 3

  // go through the array every three bytes, we'll deal with trailing stuff later
  for (var i = 0, len2 = len - extraBytes; i < len2; i += maxChunkLength) {
    parts.push(encodeChunk(uint8, i, (i + maxChunkLength) > len2 ? len2 : (i + maxChunkLength)))
  }

  // pad the end with zeros, but make sure to not forget the extra bytes
  if (extraBytes === 1) {
    tmp = uint8[len - 1]
    output += lookup[tmp >> 2]
    output += lookup[(tmp << 4) & 0x3F]
    output += '=='
  } else if (extraBytes === 2) {
    tmp = (uint8[len - 2] << 8) + (uint8[len - 1])
    output += lookup[tmp >> 10]
    output += lookup[(tmp >> 4) & 0x3F]
    output += lookup[(tmp << 2) & 0x3F]
    output += '='
  }

  parts.push(output)

  return parts.join('')
}

},{}],16:[function(require,module,exports){
(function (global){
/**
 * Create a blob builder even when vendor prefixes exist
 */

var BlobBuilder = global.BlobBuilder
  || global.WebKitBlobBuilder
  || global.MSBlobBuilder
  || global.MozBlobBuilder;

/**
 * Check if Blob constructor is supported
 */

var blobSupported = (function() {
  try {
    var a = new Blob(['hi']);
    return a.size === 2;
  } catch(e) {
    return false;
  }
})();

/**
 * Check if Blob constructor supports ArrayBufferViews
 * Fails in Safari 6, so we need to map to ArrayBuffers there.
 */

var blobSupportsArrayBufferView = blobSupported && (function() {
  try {
    var b = new Blob([new Uint8Array([1,2])]);
    return b.size === 2;
  } catch(e) {
    return false;
  }
})();

/**
 * Check if BlobBuilder is supported
 */

var blobBuilderSupported = BlobBuilder
  && BlobBuilder.prototype.append
  && BlobBuilder.prototype.getBlob;

/**
 * Helper function that maps ArrayBufferViews to ArrayBuffers
 * Used by BlobBuilder constructor and old browsers that didn't
 * support it in the Blob constructor.
 */

function mapArrayBufferViews(ary) {
  for (var i = 0; i < ary.length; i++) {
    var chunk = ary[i];
    if (chunk.buffer instanceof ArrayBuffer) {
      var buf = chunk.buffer;

      // if this is a subarray, make a copy so we only
      // include the subarray region from the underlying buffer
      if (chunk.byteLength !== buf.byteLength) {
        var copy = new Uint8Array(chunk.byteLength);
        copy.set(new Uint8Array(buf, chunk.byteOffset, chunk.byteLength));
        buf = copy.buffer;
      }

      ary[i] = buf;
    }
  }
}

function BlobBuilderConstructor(ary, options) {
  options = options || {};

  var bb = new BlobBuilder();
  mapArrayBufferViews(ary);

  for (var i = 0; i < ary.length; i++) {
    bb.append(ary[i]);
  }

  return (options.type) ? bb.getBlob(options.type) : bb.getBlob();
};

function BlobConstructor(ary, options) {
  mapArrayBufferViews(ary);
  return new Blob(ary, options || {});
};

module.exports = (function() {
  if (blobSupported) {
    return blobSupportsArrayBufferView ? global.Blob : BlobConstructor;
  } else if (blobBuilderSupported) {
    return BlobBuilderConstructor;
  } else {
    return undefined;
  }
})();

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{}],17:[function(require,module,exports){

},{}],18:[function(require,module,exports){
arguments[4][17][0].apply(exports,arguments)
},{"dup":17}],19:[function(require,module,exports){
/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <https://feross.org>
 * @license  MIT
 */
/* eslint-disable no-proto */

'use strict'

var base64 = require('base64-js')
var ieee754 = require('ieee754')

exports.Buffer = Buffer
exports.SlowBuffer = SlowBuffer
exports.INSPECT_MAX_BYTES = 50

var K_MAX_LENGTH = 0x7fffffff
exports.kMaxLength = K_MAX_LENGTH

/**
 * If `Buffer.TYPED_ARRAY_SUPPORT`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Print warning and recommend using `buffer` v4.x which has an Object
 *               implementation (most compatible, even IE6)
 *
 * Browsers that support typed arrays are IE 10+, Firefox 4+, Chrome 7+, Safari 5.1+,
 * Opera 11.6+, iOS 4.2+.
 *
 * We report that the browser does not support typed arrays if the are not subclassable
 * using __proto__. Firefox 4-29 lacks support for adding new properties to `Uint8Array`
 * (See: https://bugzilla.mozilla.org/show_bug.cgi?id=695438). IE 10 lacks support
 * for __proto__ and has a buggy typed array implementation.
 */
Buffer.TYPED_ARRAY_SUPPORT = typedArraySupport()

if (!Buffer.TYPED_ARRAY_SUPPORT && typeof console !== 'undefined' &&
    typeof console.error === 'function') {
  console.error(
    'This browser lacks typed array (Uint8Array) support which is required by ' +
    '`buffer` v5.x. Use `buffer` v4.x if you require old browser support.'
  )
}

function typedArraySupport () {
  // Can typed array instances can be augmented?
  try {
    var arr = new Uint8Array(1)
    arr.__proto__ = {__proto__: Uint8Array.prototype, foo: function () { return 42 }}
    return arr.foo() === 42
  } catch (e) {
    return false
  }
}

function createBuffer (length) {
  if (length > K_MAX_LENGTH) {
    throw new RangeError('Invalid typed array length')
  }
  // Return an augmented `Uint8Array` instance
  var buf = new Uint8Array(length)
  buf.__proto__ = Buffer.prototype
  return buf
}

/**
 * The Buffer constructor returns instances of `Uint8Array` that have their
 * prototype changed to `Buffer.prototype`. Furthermore, `Buffer` is a subclass of
 * `Uint8Array`, so the returned instances will have all the node `Buffer` methods
 * and the `Uint8Array` methods. Square bracket notation works as expected -- it
 * returns a single octet.
 *
 * The `Uint8Array` prototype remains unmodified.
 */

function Buffer (arg, encodingOrOffset, length) {
  // Common case.
  if (typeof arg === 'number') {
    if (typeof encodingOrOffset === 'string') {
      throw new Error(
        'If encoding is specified then the first argument must be a string'
      )
    }
    return allocUnsafe(arg)
  }
  return from(arg, encodingOrOffset, length)
}

// Fix subarray() in ES2016. See: https://github.com/feross/buffer/pull/97
if (typeof Symbol !== 'undefined' && Symbol.species &&
    Buffer[Symbol.species] === Buffer) {
  Object.defineProperty(Buffer, Symbol.species, {
    value: null,
    configurable: true,
    enumerable: false,
    writable: false
  })
}

Buffer.poolSize = 8192 // not used by this implementation

function from (value, encodingOrOffset, length) {
  if (typeof value === 'number') {
    throw new TypeError('"value" argument must not be a number')
  }

  if (isArrayBuffer(value)) {
    return fromArrayBuffer(value, encodingOrOffset, length)
  }

  if (typeof value === 'string') {
    return fromString(value, encodingOrOffset)
  }

  return fromObject(value)
}

/**
 * Functionally equivalent to Buffer(arg, encoding) but throws a TypeError
 * if value is a number.
 * Buffer.from(str[, encoding])
 * Buffer.from(array)
 * Buffer.from(buffer)
 * Buffer.from(arrayBuffer[, byteOffset[, length]])
 **/
Buffer.from = function (value, encodingOrOffset, length) {
  return from(value, encodingOrOffset, length)
}

// Note: Change prototype *after* Buffer.from is defined to workaround Chrome bug:
// https://github.com/feross/buffer/pull/148
Buffer.prototype.__proto__ = Uint8Array.prototype
Buffer.__proto__ = Uint8Array

function assertSize (size) {
  if (typeof size !== 'number') {
    throw new TypeError('"size" argument must be a number')
  } else if (size < 0) {
    throw new RangeError('"size" argument must not be negative')
  }
}

function alloc (size, fill, encoding) {
  assertSize(size)
  if (size <= 0) {
    return createBuffer(size)
  }
  if (fill !== undefined) {
    // Only pay attention to encoding if it's a string. This
    // prevents accidentally sending in a number that would
    // be interpretted as a start offset.
    return typeof encoding === 'string'
      ? createBuffer(size).fill(fill, encoding)
      : createBuffer(size).fill(fill)
  }
  return createBuffer(size)
}

/**
 * Creates a new filled Buffer instance.
 * alloc(size[, fill[, encoding]])
 **/
Buffer.alloc = function (size, fill, encoding) {
  return alloc(size, fill, encoding)
}

function allocUnsafe (size) {
  assertSize(size)
  return createBuffer(size < 0 ? 0 : checked(size) | 0)
}

/**
 * Equivalent to Buffer(num), by default creates a non-zero-filled Buffer instance.
 * */
Buffer.allocUnsafe = function (size) {
  return allocUnsafe(size)
}
/**
 * Equivalent to SlowBuffer(num), by default creates a non-zero-filled Buffer instance.
 */
Buffer.allocUnsafeSlow = function (size) {
  return allocUnsafe(size)
}

function fromString (string, encoding) {
  if (typeof encoding !== 'string' || encoding === '') {
    encoding = 'utf8'
  }

  if (!Buffer.isEncoding(encoding)) {
    throw new TypeError('"encoding" must be a valid string encoding')
  }

  var length = byteLength(string, encoding) | 0
  var buf = createBuffer(length)

  var actual = buf.write(string, encoding)

  if (actual !== length) {
    // Writing a hex string, for example, that contains invalid characters will
    // cause everything after the first invalid character to be ignored. (e.g.
    // 'abxxcd' will be treated as 'ab')
    buf = buf.slice(0, actual)
  }

  return buf
}

function fromArrayLike (array) {
  var length = array.length < 0 ? 0 : checked(array.length) | 0
  var buf = createBuffer(length)
  for (var i = 0; i < length; i += 1) {
    buf[i] = array[i] & 255
  }
  return buf
}

function fromArrayBuffer (array, byteOffset, length) {
  if (byteOffset < 0 || array.byteLength < byteOffset) {
    throw new RangeError('\'offset\' is out of bounds')
  }

  if (array.byteLength < byteOffset + (length || 0)) {
    throw new RangeError('\'length\' is out of bounds')
  }

  var buf
  if (byteOffset === undefined && length === undefined) {
    buf = new Uint8Array(array)
  } else if (length === undefined) {
    buf = new Uint8Array(array, byteOffset)
  } else {
    buf = new Uint8Array(array, byteOffset, length)
  }

  // Return an augmented `Uint8Array` instance
  buf.__proto__ = Buffer.prototype
  return buf
}

function fromObject (obj) {
  if (Buffer.isBuffer(obj)) {
    var len = checked(obj.length) | 0
    var buf = createBuffer(len)

    if (buf.length === 0) {
      return buf
    }

    obj.copy(buf, 0, 0, len)
    return buf
  }

  if (obj) {
    if (isArrayBufferView(obj) || 'length' in obj) {
      if (typeof obj.length !== 'number' || numberIsNaN(obj.length)) {
        return createBuffer(0)
      }
      return fromArrayLike(obj)
    }

    if (obj.type === 'Buffer' && Array.isArray(obj.data)) {
      return fromArrayLike(obj.data)
    }
  }

  throw new TypeError('First argument must be a string, Buffer, ArrayBuffer, Array, or array-like object.')
}

function checked (length) {
  // Note: cannot use `length < K_MAX_LENGTH` here because that fails when
  // length is NaN (which is otherwise coerced to zero.)
  if (length >= K_MAX_LENGTH) {
    throw new RangeError('Attempt to allocate Buffer larger than maximum ' +
                         'size: 0x' + K_MAX_LENGTH.toString(16) + ' bytes')
  }
  return length | 0
}

function SlowBuffer (length) {
  if (+length != length) { // eslint-disable-line eqeqeq
    length = 0
  }
  return Buffer.alloc(+length)
}

Buffer.isBuffer = function isBuffer (b) {
  return b != null && b._isBuffer === true
}

Buffer.compare = function compare (a, b) {
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b)) {
    throw new TypeError('Arguments must be Buffers')
  }

  if (a === b) return 0

  var x = a.length
  var y = b.length

  for (var i = 0, len = Math.min(x, y); i < len; ++i) {
    if (a[i] !== b[i]) {
      x = a[i]
      y = b[i]
      break
    }
  }

  if (x < y) return -1
  if (y < x) return 1
  return 0
}

Buffer.isEncoding = function isEncoding (encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'latin1':
    case 'binary':
    case 'base64':
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return true
    default:
      return false
  }
}

Buffer.concat = function concat (list, length) {
  if (!Array.isArray(list)) {
    throw new TypeError('"list" argument must be an Array of Buffers')
  }

  if (list.length === 0) {
    return Buffer.alloc(0)
  }

  var i
  if (length === undefined) {
    length = 0
    for (i = 0; i < list.length; ++i) {
      length += list[i].length
    }
  }

  var buffer = Buffer.allocUnsafe(length)
  var pos = 0
  for (i = 0; i < list.length; ++i) {
    var buf = list[i]
    if (!Buffer.isBuffer(buf)) {
      throw new TypeError('"list" argument must be an Array of Buffers')
    }
    buf.copy(buffer, pos)
    pos += buf.length
  }
  return buffer
}

function byteLength (string, encoding) {
  if (Buffer.isBuffer(string)) {
    return string.length
  }
  if (isArrayBufferView(string) || isArrayBuffer(string)) {
    return string.byteLength
  }
  if (typeof string !== 'string') {
    string = '' + string
  }

  var len = string.length
  if (len === 0) return 0

  // Use a for loop to avoid recursion
  var loweredCase = false
  for (;;) {
    switch (encoding) {
      case 'ascii':
      case 'latin1':
      case 'binary':
        return len
      case 'utf8':
      case 'utf-8':
      case undefined:
        return utf8ToBytes(string).length
      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return len * 2
      case 'hex':
        return len >>> 1
      case 'base64':
        return base64ToBytes(string).length
      default:
        if (loweredCase) return utf8ToBytes(string).length // assume utf8
        encoding = ('' + encoding).toLowerCase()
        loweredCase = true
    }
  }
}
Buffer.byteLength = byteLength

function slowToString (encoding, start, end) {
  var loweredCase = false

  // No need to verify that "this.length <= MAX_UINT32" since it's a read-only
  // property of a typed array.

  // This behaves neither like String nor Uint8Array in that we set start/end
  // to their upper/lower bounds if the value passed is out of range.
  // undefined is handled specially as per ECMA-262 6th Edition,
  // Section 13.3.3.7 Runtime Semantics: KeyedBindingInitialization.
  if (start === undefined || start < 0) {
    start = 0
  }
  // Return early if start > this.length. Done here to prevent potential uint32
  // coercion fail below.
  if (start > this.length) {
    return ''
  }

  if (end === undefined || end > this.length) {
    end = this.length
  }

  if (end <= 0) {
    return ''
  }

  // Force coersion to uint32. This will also coerce falsey/NaN values to 0.
  end >>>= 0
  start >>>= 0

  if (end <= start) {
    return ''
  }

  if (!encoding) encoding = 'utf8'

  while (true) {
    switch (encoding) {
      case 'hex':
        return hexSlice(this, start, end)

      case 'utf8':
      case 'utf-8':
        return utf8Slice(this, start, end)

      case 'ascii':
        return asciiSlice(this, start, end)

      case 'latin1':
      case 'binary':
        return latin1Slice(this, start, end)

      case 'base64':
        return base64Slice(this, start, end)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return utf16leSlice(this, start, end)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = (encoding + '').toLowerCase()
        loweredCase = true
    }
  }
}

// This property is used by `Buffer.isBuffer` (and the `is-buffer` npm package)
// to detect a Buffer instance. It's not possible to use `instanceof Buffer`
// reliably in a browserify context because there could be multiple different
// copies of the 'buffer' package in use. This method works even for Buffer
// instances that were created from another copy of the `buffer` package.
// See: https://github.com/feross/buffer/issues/154
Buffer.prototype._isBuffer = true

function swap (b, n, m) {
  var i = b[n]
  b[n] = b[m]
  b[m] = i
}

Buffer.prototype.swap16 = function swap16 () {
  var len = this.length
  if (len % 2 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 16-bits')
  }
  for (var i = 0; i < len; i += 2) {
    swap(this, i, i + 1)
  }
  return this
}

Buffer.prototype.swap32 = function swap32 () {
  var len = this.length
  if (len % 4 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 32-bits')
  }
  for (var i = 0; i < len; i += 4) {
    swap(this, i, i + 3)
    swap(this, i + 1, i + 2)
  }
  return this
}

Buffer.prototype.swap64 = function swap64 () {
  var len = this.length
  if (len % 8 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 64-bits')
  }
  for (var i = 0; i < len; i += 8) {
    swap(this, i, i + 7)
    swap(this, i + 1, i + 6)
    swap(this, i + 2, i + 5)
    swap(this, i + 3, i + 4)
  }
  return this
}

Buffer.prototype.toString = function toString () {
  var length = this.length
  if (length === 0) return ''
  if (arguments.length === 0) return utf8Slice(this, 0, length)
  return slowToString.apply(this, arguments)
}

Buffer.prototype.equals = function equals (b) {
  if (!Buffer.isBuffer(b)) throw new TypeError('Argument must be a Buffer')
  if (this === b) return true
  return Buffer.compare(this, b) === 0
}

Buffer.prototype.inspect = function inspect () {
  var str = ''
  var max = exports.INSPECT_MAX_BYTES
  if (this.length > 0) {
    str = this.toString('hex', 0, max).match(/.{2}/g).join(' ')
    if (this.length > max) str += ' ... '
  }
  return '<Buffer ' + str + '>'
}

Buffer.prototype.compare = function compare (target, start, end, thisStart, thisEnd) {
  if (!Buffer.isBuffer(target)) {
    throw new TypeError('Argument must be a Buffer')
  }

  if (start === undefined) {
    start = 0
  }
  if (end === undefined) {
    end = target ? target.length : 0
  }
  if (thisStart === undefined) {
    thisStart = 0
  }
  if (thisEnd === undefined) {
    thisEnd = this.length
  }

  if (start < 0 || end > target.length || thisStart < 0 || thisEnd > this.length) {
    throw new RangeError('out of range index')
  }

  if (thisStart >= thisEnd && start >= end) {
    return 0
  }
  if (thisStart >= thisEnd) {
    return -1
  }
  if (start >= end) {
    return 1
  }

  start >>>= 0
  end >>>= 0
  thisStart >>>= 0
  thisEnd >>>= 0

  if (this === target) return 0

  var x = thisEnd - thisStart
  var y = end - start
  var len = Math.min(x, y)

  var thisCopy = this.slice(thisStart, thisEnd)
  var targetCopy = target.slice(start, end)

  for (var i = 0; i < len; ++i) {
    if (thisCopy[i] !== targetCopy[i]) {
      x = thisCopy[i]
      y = targetCopy[i]
      break
    }
  }

  if (x < y) return -1
  if (y < x) return 1
  return 0
}

// Finds either the first index of `val` in `buffer` at offset >= `byteOffset`,
// OR the last index of `val` in `buffer` at offset <= `byteOffset`.
//
// Arguments:
// - buffer - a Buffer to search
// - val - a string, Buffer, or number
// - byteOffset - an index into `buffer`; will be clamped to an int32
// - encoding - an optional encoding, relevant is val is a string
// - dir - true for indexOf, false for lastIndexOf
function bidirectionalIndexOf (buffer, val, byteOffset, encoding, dir) {
  // Empty buffer means no match
  if (buffer.length === 0) return -1

  // Normalize byteOffset
  if (typeof byteOffset === 'string') {
    encoding = byteOffset
    byteOffset = 0
  } else if (byteOffset > 0x7fffffff) {
    byteOffset = 0x7fffffff
  } else if (byteOffset < -0x80000000) {
    byteOffset = -0x80000000
  }
  byteOffset = +byteOffset  // Coerce to Number.
  if (numberIsNaN(byteOffset)) {
    // byteOffset: it it's undefined, null, NaN, "foo", etc, search whole buffer
    byteOffset = dir ? 0 : (buffer.length - 1)
  }

  // Normalize byteOffset: negative offsets start from the end of the buffer
  if (byteOffset < 0) byteOffset = buffer.length + byteOffset
  if (byteOffset >= buffer.length) {
    if (dir) return -1
    else byteOffset = buffer.length - 1
  } else if (byteOffset < 0) {
    if (dir) byteOffset = 0
    else return -1
  }

  // Normalize val
  if (typeof val === 'string') {
    val = Buffer.from(val, encoding)
  }

  // Finally, search either indexOf (if dir is true) or lastIndexOf
  if (Buffer.isBuffer(val)) {
    // Special case: looking for empty string/buffer always fails
    if (val.length === 0) {
      return -1
    }
    return arrayIndexOf(buffer, val, byteOffset, encoding, dir)
  } else if (typeof val === 'number') {
    val = val & 0xFF // Search for a byte value [0-255]
    if (typeof Uint8Array.prototype.indexOf === 'function') {
      if (dir) {
        return Uint8Array.prototype.indexOf.call(buffer, val, byteOffset)
      } else {
        return Uint8Array.prototype.lastIndexOf.call(buffer, val, byteOffset)
      }
    }
    return arrayIndexOf(buffer, [ val ], byteOffset, encoding, dir)
  }

  throw new TypeError('val must be string, number or Buffer')
}

function arrayIndexOf (arr, val, byteOffset, encoding, dir) {
  var indexSize = 1
  var arrLength = arr.length
  var valLength = val.length

  if (encoding !== undefined) {
    encoding = String(encoding).toLowerCase()
    if (encoding === 'ucs2' || encoding === 'ucs-2' ||
        encoding === 'utf16le' || encoding === 'utf-16le') {
      if (arr.length < 2 || val.length < 2) {
        return -1
      }
      indexSize = 2
      arrLength /= 2
      valLength /= 2
      byteOffset /= 2
    }
  }

  function read (buf, i) {
    if (indexSize === 1) {
      return buf[i]
    } else {
      return buf.readUInt16BE(i * indexSize)
    }
  }

  var i
  if (dir) {
    var foundIndex = -1
    for (i = byteOffset; i < arrLength; i++) {
      if (read(arr, i) === read(val, foundIndex === -1 ? 0 : i - foundIndex)) {
        if (foundIndex === -1) foundIndex = i
        if (i - foundIndex + 1 === valLength) return foundIndex * indexSize
      } else {
        if (foundIndex !== -1) i -= i - foundIndex
        foundIndex = -1
      }
    }
  } else {
    if (byteOffset + valLength > arrLength) byteOffset = arrLength - valLength
    for (i = byteOffset; i >= 0; i--) {
      var found = true
      for (var j = 0; j < valLength; j++) {
        if (read(arr, i + j) !== read(val, j)) {
          found = false
          break
        }
      }
      if (found) return i
    }
  }

  return -1
}

Buffer.prototype.includes = function includes (val, byteOffset, encoding) {
  return this.indexOf(val, byteOffset, encoding) !== -1
}

Buffer.prototype.indexOf = function indexOf (val, byteOffset, encoding) {
  return bidirectionalIndexOf(this, val, byteOffset, encoding, true)
}

Buffer.prototype.lastIndexOf = function lastIndexOf (val, byteOffset, encoding) {
  return bidirectionalIndexOf(this, val, byteOffset, encoding, false)
}

function hexWrite (buf, string, offset, length) {
  offset = Number(offset) || 0
  var remaining = buf.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }

  // must be an even number of digits
  var strLen = string.length
  if (strLen % 2 !== 0) throw new TypeError('Invalid hex string')

  if (length > strLen / 2) {
    length = strLen / 2
  }
  for (var i = 0; i < length; ++i) {
    var parsed = parseInt(string.substr(i * 2, 2), 16)
    if (numberIsNaN(parsed)) return i
    buf[offset + i] = parsed
  }
  return i
}

function utf8Write (buf, string, offset, length) {
  return blitBuffer(utf8ToBytes(string, buf.length - offset), buf, offset, length)
}

function asciiWrite (buf, string, offset, length) {
  return blitBuffer(asciiToBytes(string), buf, offset, length)
}

function latin1Write (buf, string, offset, length) {
  return asciiWrite(buf, string, offset, length)
}

function base64Write (buf, string, offset, length) {
  return blitBuffer(base64ToBytes(string), buf, offset, length)
}

function ucs2Write (buf, string, offset, length) {
  return blitBuffer(utf16leToBytes(string, buf.length - offset), buf, offset, length)
}

Buffer.prototype.write = function write (string, offset, length, encoding) {
  // Buffer#write(string)
  if (offset === undefined) {
    encoding = 'utf8'
    length = this.length
    offset = 0
  // Buffer#write(string, encoding)
  } else if (length === undefined && typeof offset === 'string') {
    encoding = offset
    length = this.length
    offset = 0
  // Buffer#write(string, offset[, length][, encoding])
  } else if (isFinite(offset)) {
    offset = offset >>> 0
    if (isFinite(length)) {
      length = length >>> 0
      if (encoding === undefined) encoding = 'utf8'
    } else {
      encoding = length
      length = undefined
    }
  } else {
    throw new Error(
      'Buffer.write(string, encoding, offset[, length]) is no longer supported'
    )
  }

  var remaining = this.length - offset
  if (length === undefined || length > remaining) length = remaining

  if ((string.length > 0 && (length < 0 || offset < 0)) || offset > this.length) {
    throw new RangeError('Attempt to write outside buffer bounds')
  }

  if (!encoding) encoding = 'utf8'

  var loweredCase = false
  for (;;) {
    switch (encoding) {
      case 'hex':
        return hexWrite(this, string, offset, length)

      case 'utf8':
      case 'utf-8':
        return utf8Write(this, string, offset, length)

      case 'ascii':
        return asciiWrite(this, string, offset, length)

      case 'latin1':
      case 'binary':
        return latin1Write(this, string, offset, length)

      case 'base64':
        // Warning: maxLength not taken into account in base64Write
        return base64Write(this, string, offset, length)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return ucs2Write(this, string, offset, length)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = ('' + encoding).toLowerCase()
        loweredCase = true
    }
  }
}

Buffer.prototype.toJSON = function toJSON () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
}

function base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return base64.fromByteArray(buf)
  } else {
    return base64.fromByteArray(buf.slice(start, end))
  }
}

function utf8Slice (buf, start, end) {
  end = Math.min(buf.length, end)
  var res = []

  var i = start
  while (i < end) {
    var firstByte = buf[i]
    var codePoint = null
    var bytesPerSequence = (firstByte > 0xEF) ? 4
      : (firstByte > 0xDF) ? 3
      : (firstByte > 0xBF) ? 2
      : 1

    if (i + bytesPerSequence <= end) {
      var secondByte, thirdByte, fourthByte, tempCodePoint

      switch (bytesPerSequence) {
        case 1:
          if (firstByte < 0x80) {
            codePoint = firstByte
          }
          break
        case 2:
          secondByte = buf[i + 1]
          if ((secondByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0x1F) << 0x6 | (secondByte & 0x3F)
            if (tempCodePoint > 0x7F) {
              codePoint = tempCodePoint
            }
          }
          break
        case 3:
          secondByte = buf[i + 1]
          thirdByte = buf[i + 2]
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0xC | (secondByte & 0x3F) << 0x6 | (thirdByte & 0x3F)
            if (tempCodePoint > 0x7FF && (tempCodePoint < 0xD800 || tempCodePoint > 0xDFFF)) {
              codePoint = tempCodePoint
            }
          }
          break
        case 4:
          secondByte = buf[i + 1]
          thirdByte = buf[i + 2]
          fourthByte = buf[i + 3]
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80 && (fourthByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0x12 | (secondByte & 0x3F) << 0xC | (thirdByte & 0x3F) << 0x6 | (fourthByte & 0x3F)
            if (tempCodePoint > 0xFFFF && tempCodePoint < 0x110000) {
              codePoint = tempCodePoint
            }
          }
      }
    }

    if (codePoint === null) {
      // we did not generate a valid codePoint so insert a
      // replacement char (U+FFFD) and advance only 1 byte
      codePoint = 0xFFFD
      bytesPerSequence = 1
    } else if (codePoint > 0xFFFF) {
      // encode to utf16 (surrogate pair dance)
      codePoint -= 0x10000
      res.push(codePoint >>> 10 & 0x3FF | 0xD800)
      codePoint = 0xDC00 | codePoint & 0x3FF
    }

    res.push(codePoint)
    i += bytesPerSequence
  }

  return decodeCodePointsArray(res)
}

// Based on http://stackoverflow.com/a/22747272/680742, the browser with
// the lowest limit is Chrome, with 0x10000 args.
// We go 1 magnitude less, for safety
var MAX_ARGUMENTS_LENGTH = 0x1000

function decodeCodePointsArray (codePoints) {
  var len = codePoints.length
  if (len <= MAX_ARGUMENTS_LENGTH) {
    return String.fromCharCode.apply(String, codePoints) // avoid extra slice()
  }

  // Decode in chunks to avoid "call stack size exceeded".
  var res = ''
  var i = 0
  while (i < len) {
    res += String.fromCharCode.apply(
      String,
      codePoints.slice(i, i += MAX_ARGUMENTS_LENGTH)
    )
  }
  return res
}

function asciiSlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; ++i) {
    ret += String.fromCharCode(buf[i] & 0x7F)
  }
  return ret
}

function latin1Slice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; ++i) {
    ret += String.fromCharCode(buf[i])
  }
  return ret
}

function hexSlice (buf, start, end) {
  var len = buf.length

  if (!start || start < 0) start = 0
  if (!end || end < 0 || end > len) end = len

  var out = ''
  for (var i = start; i < end; ++i) {
    out += toHex(buf[i])
  }
  return out
}

function utf16leSlice (buf, start, end) {
  var bytes = buf.slice(start, end)
  var res = ''
  for (var i = 0; i < bytes.length; i += 2) {
    res += String.fromCharCode(bytes[i] + (bytes[i + 1] * 256))
  }
  return res
}

Buffer.prototype.slice = function slice (start, end) {
  var len = this.length
  start = ~~start
  end = end === undefined ? len : ~~end

  if (start < 0) {
    start += len
    if (start < 0) start = 0
  } else if (start > len) {
    start = len
  }

  if (end < 0) {
    end += len
    if (end < 0) end = 0
  } else if (end > len) {
    end = len
  }

  if (end < start) end = start

  var newBuf = this.subarray(start, end)
  // Return an augmented `Uint8Array` instance
  newBuf.__proto__ = Buffer.prototype
  return newBuf
}

/*
 * Need to make sure that buffer isn't trying to write out of bounds.
 */
function checkOffset (offset, ext, length) {
  if ((offset % 1) !== 0 || offset < 0) throw new RangeError('offset is not uint')
  if (offset + ext > length) throw new RangeError('Trying to access beyond buffer length')
}

Buffer.prototype.readUIntLE = function readUIntLE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul
  }

  return val
}

Buffer.prototype.readUIntBE = function readUIntBE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) {
    checkOffset(offset, byteLength, this.length)
  }

  var val = this[offset + --byteLength]
  var mul = 1
  while (byteLength > 0 && (mul *= 0x100)) {
    val += this[offset + --byteLength] * mul
  }

  return val
}

Buffer.prototype.readUInt8 = function readUInt8 (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 1, this.length)
  return this[offset]
}

Buffer.prototype.readUInt16LE = function readUInt16LE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 2, this.length)
  return this[offset] | (this[offset + 1] << 8)
}

Buffer.prototype.readUInt16BE = function readUInt16BE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 2, this.length)
  return (this[offset] << 8) | this[offset + 1]
}

Buffer.prototype.readUInt32LE = function readUInt32LE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)

  return ((this[offset]) |
      (this[offset + 1] << 8) |
      (this[offset + 2] << 16)) +
      (this[offset + 3] * 0x1000000)
}

Buffer.prototype.readUInt32BE = function readUInt32BE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] * 0x1000000) +
    ((this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    this[offset + 3])
}

Buffer.prototype.readIntLE = function readIntLE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readIntBE = function readIntBE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var i = byteLength
  var mul = 1
  var val = this[offset + --i]
  while (i > 0 && (mul *= 0x100)) {
    val += this[offset + --i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readInt8 = function readInt8 (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 1, this.length)
  if (!(this[offset] & 0x80)) return (this[offset])
  return ((0xff - this[offset] + 1) * -1)
}

Buffer.prototype.readInt16LE = function readInt16LE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 2, this.length)
  var val = this[offset] | (this[offset + 1] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt16BE = function readInt16BE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 2, this.length)
  var val = this[offset + 1] | (this[offset] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt32LE = function readInt32LE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset]) |
    (this[offset + 1] << 8) |
    (this[offset + 2] << 16) |
    (this[offset + 3] << 24)
}

Buffer.prototype.readInt32BE = function readInt32BE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] << 24) |
    (this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    (this[offset + 3])
}

Buffer.prototype.readFloatLE = function readFloatLE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, true, 23, 4)
}

Buffer.prototype.readFloatBE = function readFloatBE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, false, 23, 4)
}

Buffer.prototype.readDoubleLE = function readDoubleLE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, true, 52, 8)
}

Buffer.prototype.readDoubleBE = function readDoubleBE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, false, 52, 8)
}

function checkInt (buf, value, offset, ext, max, min) {
  if (!Buffer.isBuffer(buf)) throw new TypeError('"buffer" argument must be a Buffer instance')
  if (value > max || value < min) throw new RangeError('"value" argument is out of bounds')
  if (offset + ext > buf.length) throw new RangeError('Index out of range')
}

Buffer.prototype.writeUIntLE = function writeUIntLE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) {
    var maxBytes = Math.pow(2, 8 * byteLength) - 1
    checkInt(this, value, offset, byteLength, maxBytes, 0)
  }

  var mul = 1
  var i = 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUIntBE = function writeUIntBE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) {
    var maxBytes = Math.pow(2, 8 * byteLength) - 1
    checkInt(this, value, offset, byteLength, maxBytes, 0)
  }

  var i = byteLength - 1
  var mul = 1
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUInt8 = function writeUInt8 (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 1, 0xff, 0)
  this[offset] = (value & 0xff)
  return offset + 1
}

Buffer.prototype.writeUInt16LE = function writeUInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  this[offset] = (value & 0xff)
  this[offset + 1] = (value >>> 8)
  return offset + 2
}

Buffer.prototype.writeUInt16BE = function writeUInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  this[offset] = (value >>> 8)
  this[offset + 1] = (value & 0xff)
  return offset + 2
}

Buffer.prototype.writeUInt32LE = function writeUInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  this[offset + 3] = (value >>> 24)
  this[offset + 2] = (value >>> 16)
  this[offset + 1] = (value >>> 8)
  this[offset] = (value & 0xff)
  return offset + 4
}

Buffer.prototype.writeUInt32BE = function writeUInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  this[offset] = (value >>> 24)
  this[offset + 1] = (value >>> 16)
  this[offset + 2] = (value >>> 8)
  this[offset + 3] = (value & 0xff)
  return offset + 4
}

Buffer.prototype.writeIntLE = function writeIntLE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    var limit = Math.pow(2, (8 * byteLength) - 1)

    checkInt(this, value, offset, byteLength, limit - 1, -limit)
  }

  var i = 0
  var mul = 1
  var sub = 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    if (value < 0 && sub === 0 && this[offset + i - 1] !== 0) {
      sub = 1
    }
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeIntBE = function writeIntBE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    var limit = Math.pow(2, (8 * byteLength) - 1)

    checkInt(this, value, offset, byteLength, limit - 1, -limit)
  }

  var i = byteLength - 1
  var mul = 1
  var sub = 0
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    if (value < 0 && sub === 0 && this[offset + i + 1] !== 0) {
      sub = 1
    }
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeInt8 = function writeInt8 (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 1, 0x7f, -0x80)
  if (value < 0) value = 0xff + value + 1
  this[offset] = (value & 0xff)
  return offset + 1
}

Buffer.prototype.writeInt16LE = function writeInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  this[offset] = (value & 0xff)
  this[offset + 1] = (value >>> 8)
  return offset + 2
}

Buffer.prototype.writeInt16BE = function writeInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  this[offset] = (value >>> 8)
  this[offset + 1] = (value & 0xff)
  return offset + 2
}

Buffer.prototype.writeInt32LE = function writeInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  this[offset] = (value & 0xff)
  this[offset + 1] = (value >>> 8)
  this[offset + 2] = (value >>> 16)
  this[offset + 3] = (value >>> 24)
  return offset + 4
}

Buffer.prototype.writeInt32BE = function writeInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  if (value < 0) value = 0xffffffff + value + 1
  this[offset] = (value >>> 24)
  this[offset + 1] = (value >>> 16)
  this[offset + 2] = (value >>> 8)
  this[offset + 3] = (value & 0xff)
  return offset + 4
}

function checkIEEE754 (buf, value, offset, ext, max, min) {
  if (offset + ext > buf.length) throw new RangeError('Index out of range')
  if (offset < 0) throw new RangeError('Index out of range')
}

function writeFloat (buf, value, offset, littleEndian, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 4, 3.4028234663852886e+38, -3.4028234663852886e+38)
  }
  ieee754.write(buf, value, offset, littleEndian, 23, 4)
  return offset + 4
}

Buffer.prototype.writeFloatLE = function writeFloatLE (value, offset, noAssert) {
  return writeFloat(this, value, offset, true, noAssert)
}

Buffer.prototype.writeFloatBE = function writeFloatBE (value, offset, noAssert) {
  return writeFloat(this, value, offset, false, noAssert)
}

function writeDouble (buf, value, offset, littleEndian, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 8, 1.7976931348623157E+308, -1.7976931348623157E+308)
  }
  ieee754.write(buf, value, offset, littleEndian, 52, 8)
  return offset + 8
}

Buffer.prototype.writeDoubleLE = function writeDoubleLE (value, offset, noAssert) {
  return writeDouble(this, value, offset, true, noAssert)
}

Buffer.prototype.writeDoubleBE = function writeDoubleBE (value, offset, noAssert) {
  return writeDouble(this, value, offset, false, noAssert)
}

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function copy (target, targetStart, start, end) {
  if (!start) start = 0
  if (!end && end !== 0) end = this.length
  if (targetStart >= target.length) targetStart = target.length
  if (!targetStart) targetStart = 0
  if (end > 0 && end < start) end = start

  // Copy 0 bytes; we're done
  if (end === start) return 0
  if (target.length === 0 || this.length === 0) return 0

  // Fatal error conditions
  if (targetStart < 0) {
    throw new RangeError('targetStart out of bounds')
  }
  if (start < 0 || start >= this.length) throw new RangeError('sourceStart out of bounds')
  if (end < 0) throw new RangeError('sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length) end = this.length
  if (target.length - targetStart < end - start) {
    end = target.length - targetStart + start
  }

  var len = end - start
  var i

  if (this === target && start < targetStart && targetStart < end) {
    // descending copy from end
    for (i = len - 1; i >= 0; --i) {
      target[i + targetStart] = this[i + start]
    }
  } else if (len < 1000) {
    // ascending copy from start
    for (i = 0; i < len; ++i) {
      target[i + targetStart] = this[i + start]
    }
  } else {
    Uint8Array.prototype.set.call(
      target,
      this.subarray(start, start + len),
      targetStart
    )
  }

  return len
}

// Usage:
//    buffer.fill(number[, offset[, end]])
//    buffer.fill(buffer[, offset[, end]])
//    buffer.fill(string[, offset[, end]][, encoding])
Buffer.prototype.fill = function fill (val, start, end, encoding) {
  // Handle string cases:
  if (typeof val === 'string') {
    if (typeof start === 'string') {
      encoding = start
      start = 0
      end = this.length
    } else if (typeof end === 'string') {
      encoding = end
      end = this.length
    }
    if (val.length === 1) {
      var code = val.charCodeAt(0)
      if (code < 256) {
        val = code
      }
    }
    if (encoding !== undefined && typeof encoding !== 'string') {
      throw new TypeError('encoding must be a string')
    }
    if (typeof encoding === 'string' && !Buffer.isEncoding(encoding)) {
      throw new TypeError('Unknown encoding: ' + encoding)
    }
  } else if (typeof val === 'number') {
    val = val & 255
  }

  // Invalid ranges are not set to a default, so can range check early.
  if (start < 0 || this.length < start || this.length < end) {
    throw new RangeError('Out of range index')
  }

  if (end <= start) {
    return this
  }

  start = start >>> 0
  end = end === undefined ? this.length : end >>> 0

  if (!val) val = 0

  var i
  if (typeof val === 'number') {
    for (i = start; i < end; ++i) {
      this[i] = val
    }
  } else {
    var bytes = Buffer.isBuffer(val)
      ? val
      : new Buffer(val, encoding)
    var len = bytes.length
    for (i = 0; i < end - start; ++i) {
      this[i + start] = bytes[i % len]
    }
  }

  return this
}

// HELPER FUNCTIONS
// ================

var INVALID_BASE64_RE = /[^+/0-9A-Za-z-_]/g

function base64clean (str) {
  // Node strips out invalid characters like \n and \t from the string, base64-js does not
  str = str.trim().replace(INVALID_BASE64_RE, '')
  // Node converts strings with length < 2 to ''
  if (str.length < 2) return ''
  // Node allows for non-padded base64 strings (missing trailing ===), base64-js does not
  while (str.length % 4 !== 0) {
    str = str + '='
  }
  return str
}

function toHex (n) {
  if (n < 16) return '0' + n.toString(16)
  return n.toString(16)
}

function utf8ToBytes (string, units) {
  units = units || Infinity
  var codePoint
  var length = string.length
  var leadSurrogate = null
  var bytes = []

  for (var i = 0; i < length; ++i) {
    codePoint = string.charCodeAt(i)

    // is surrogate component
    if (codePoint > 0xD7FF && codePoint < 0xE000) {
      // last char was a lead
      if (!leadSurrogate) {
        // no lead yet
        if (codePoint > 0xDBFF) {
          // unexpected trail
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        } else if (i + 1 === length) {
          // unpaired lead
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        }

        // valid lead
        leadSurrogate = codePoint

        continue
      }

      // 2 leads in a row
      if (codePoint < 0xDC00) {
        if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
        leadSurrogate = codePoint
        continue
      }

      // valid surrogate pair
      codePoint = (leadSurrogate - 0xD800 << 10 | codePoint - 0xDC00) + 0x10000
    } else if (leadSurrogate) {
      // valid bmp char, but last char was a lead
      if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
    }

    leadSurrogate = null

    // encode utf8
    if (codePoint < 0x80) {
      if ((units -= 1) < 0) break
      bytes.push(codePoint)
    } else if (codePoint < 0x800) {
      if ((units -= 2) < 0) break
      bytes.push(
        codePoint >> 0x6 | 0xC0,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x10000) {
      if ((units -= 3) < 0) break
      bytes.push(
        codePoint >> 0xC | 0xE0,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x110000) {
      if ((units -= 4) < 0) break
      bytes.push(
        codePoint >> 0x12 | 0xF0,
        codePoint >> 0xC & 0x3F | 0x80,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else {
      throw new Error('Invalid code point')
    }
  }

  return bytes
}

function asciiToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; ++i) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF)
  }
  return byteArray
}

function utf16leToBytes (str, units) {
  var c, hi, lo
  var byteArray = []
  for (var i = 0; i < str.length; ++i) {
    if ((units -= 2) < 0) break

    c = str.charCodeAt(i)
    hi = c >> 8
    lo = c % 256
    byteArray.push(lo)
    byteArray.push(hi)
  }

  return byteArray
}

function base64ToBytes (str) {
  return base64.toByteArray(base64clean(str))
}

function blitBuffer (src, dst, offset, length) {
  for (var i = 0; i < length; ++i) {
    if ((i + offset >= dst.length) || (i >= src.length)) break
    dst[i + offset] = src[i]
  }
  return i
}

// ArrayBuffers from another context (i.e. an iframe) do not pass the `instanceof` check
// but they should be treated as valid. See: https://github.com/feross/buffer/issues/166
function isArrayBuffer (obj) {
  return obj instanceof ArrayBuffer ||
    (obj != null && obj.constructor != null && obj.constructor.name === 'ArrayBuffer' &&
      typeof obj.byteLength === 'number')
}

// Node 0.10 supports `ArrayBuffer` but lacks `ArrayBuffer.isView`
function isArrayBufferView (obj) {
  return (typeof ArrayBuffer.isView === 'function') && ArrayBuffer.isView(obj)
}

function numberIsNaN (obj) {
  return obj !== obj // eslint-disable-line no-self-compare
}

},{"base64-js":15,"ieee754":43}],20:[function(require,module,exports){
/**
 * Slice reference.
 */

var slice = [].slice;

/**
 * Bind `obj` to `fn`.
 *
 * @param {Object} obj
 * @param {Function|String} fn or string
 * @return {Function}
 * @api public
 */

module.exports = function(obj, fn){
  if ('string' == typeof fn) fn = obj[fn];
  if ('function' != typeof fn) throw new Error('bind() requires a function');
  var args = slice.call(arguments, 2);
  return function(){
    return fn.apply(obj, args.concat(slice.call(arguments)));
  }
};

},{}],21:[function(require,module,exports){

/**
 * Expose `Emitter`.
 */

if (typeof module !== 'undefined') {
  module.exports = Emitter;
}

/**
 * Initialize a new `Emitter`.
 *
 * @api public
 */

function Emitter(obj) {
  if (obj) return mixin(obj);
};

/**
 * Mixin the emitter properties.
 *
 * @param {Object} obj
 * @return {Object}
 * @api private
 */

function mixin(obj) {
  for (var key in Emitter.prototype) {
    obj[key] = Emitter.prototype[key];
  }
  return obj;
}

/**
 * Listen on the given `event` with `fn`.
 *
 * @param {String} event
 * @param {Function} fn
 * @return {Emitter}
 * @api public
 */

Emitter.prototype.on =
Emitter.prototype.addEventListener = function(event, fn){
  this._callbacks = this._callbacks || {};
  (this._callbacks['$' + event] = this._callbacks['$' + event] || [])
    .push(fn);
  return this;
};

/**
 * Adds an `event` listener that will be invoked a single
 * time then automatically removed.
 *
 * @param {String} event
 * @param {Function} fn
 * @return {Emitter}
 * @api public
 */

Emitter.prototype.once = function(event, fn){
  function on() {
    this.off(event, on);
    fn.apply(this, arguments);
  }

  on.fn = fn;
  this.on(event, on);
  return this;
};

/**
 * Remove the given callback for `event` or all
 * registered callbacks.
 *
 * @param {String} event
 * @param {Function} fn
 * @return {Emitter}
 * @api public
 */

Emitter.prototype.off =
Emitter.prototype.removeListener =
Emitter.prototype.removeAllListeners =
Emitter.prototype.removeEventListener = function(event, fn){
  this._callbacks = this._callbacks || {};

  // all
  if (0 == arguments.length) {
    this._callbacks = {};
    return this;
  }

  // specific event
  var callbacks = this._callbacks['$' + event];
  if (!callbacks) return this;

  // remove all handlers
  if (1 == arguments.length) {
    delete this._callbacks['$' + event];
    return this;
  }

  // remove specific handler
  var cb;
  for (var i = 0; i < callbacks.length; i++) {
    cb = callbacks[i];
    if (cb === fn || cb.fn === fn) {
      callbacks.splice(i, 1);
      break;
    }
  }
  return this;
};

/**
 * Emit `event` with the given args.
 *
 * @param {String} event
 * @param {Mixed} ...
 * @return {Emitter}
 */

Emitter.prototype.emit = function(event){
  this._callbacks = this._callbacks || {};
  var args = [].slice.call(arguments, 1)
    , callbacks = this._callbacks['$' + event];

  if (callbacks) {
    callbacks = callbacks.slice(0);
    for (var i = 0, len = callbacks.length; i < len; ++i) {
      callbacks[i].apply(this, args);
    }
  }

  return this;
};

/**
 * Return array of callbacks for `event`.
 *
 * @param {String} event
 * @return {Array}
 * @api public
 */

Emitter.prototype.listeners = function(event){
  this._callbacks = this._callbacks || {};
  return this._callbacks['$' + event] || [];
};

/**
 * Check if this emitter has `event` handlers.
 *
 * @param {String} event
 * @return {Boolean}
 * @api public
 */

Emitter.prototype.hasListeners = function(event){
  return !! this.listeners(event).length;
};

},{}],22:[function(require,module,exports){

module.exports = function(a, b){
  var fn = function(){};
  fn.prototype = b.prototype;
  a.prototype = new fn;
  a.prototype.constructor = a;
};
},{}],23:[function(require,module,exports){
(function (process){
/**
 * This is the web browser implementation of `debug()`.
 *
 * Expose `debug()` as the module.
 */

exports = module.exports = require('./debug');
exports.log = log;
exports.formatArgs = formatArgs;
exports.save = save;
exports.load = load;
exports.useColors = useColors;
exports.storage = 'undefined' != typeof chrome
               && 'undefined' != typeof chrome.storage
                  ? chrome.storage.local
                  : localstorage();

/**
 * Colors.
 */

exports.colors = [
  'lightseagreen',
  'forestgreen',
  'goldenrod',
  'dodgerblue',
  'darkorchid',
  'crimson'
];

/**
 * Currently only WebKit-based Web Inspectors, Firefox >= v31,
 * and the Firebug extension (any Firefox version) are known
 * to support "%c" CSS customizations.
 *
 * TODO: add a `localStorage` variable to explicitly enable/disable colors
 */

function useColors() {
  // NB: In an Electron preload script, document will be defined but not fully
  // initialized. Since we know we're in Chrome, we'll just detect this case
  // explicitly
  if (typeof window !== 'undefined' && window.process && window.process.type === 'renderer') {
    return true;
  }

  // is webkit? http://stackoverflow.com/a/16459606/376773
  // document is undefined in react-native: https://github.com/facebook/react-native/pull/1632
  return (typeof document !== 'undefined' && document.documentElement && document.documentElement.style && document.documentElement.style.WebkitAppearance) ||
    // is firebug? http://stackoverflow.com/a/398120/376773
    (typeof window !== 'undefined' && window.console && (window.console.firebug || (window.console.exception && window.console.table))) ||
    // is firefox >= v31?
    // https://developer.mozilla.org/en-US/docs/Tools/Web_Console#Styling_messages
    (typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/) && parseInt(RegExp.$1, 10) >= 31) ||
    // double check webkit in userAgent just in case we are in a worker
    (typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.toLowerCase().match(/applewebkit\/(\d+)/));
}

/**
 * Map %j to `JSON.stringify()`, since no Web Inspectors do that by default.
 */

exports.formatters.j = function(v) {
  try {
    return JSON.stringify(v);
  } catch (err) {
    return '[UnexpectedJSONParseError]: ' + err.message;
  }
};


/**
 * Colorize log arguments if enabled.
 *
 * @api public
 */

function formatArgs(args) {
  var useColors = this.useColors;

  args[0] = (useColors ? '%c' : '')
    + this.namespace
    + (useColors ? ' %c' : ' ')
    + args[0]
    + (useColors ? '%c ' : ' ')
    + '+' + exports.humanize(this.diff);

  if (!useColors) return;

  var c = 'color: ' + this.color;
  args.splice(1, 0, c, 'color: inherit')

  // the final "%c" is somewhat tricky, because there could be other
  // arguments passed either before or after the %c, so we need to
  // figure out the correct index to insert the CSS into
  var index = 0;
  var lastC = 0;
  args[0].replace(/%[a-zA-Z%]/g, function(match) {
    if ('%%' === match) return;
    index++;
    if ('%c' === match) {
      // we only are interested in the *last* %c
      // (the user may have provided their own)
      lastC = index;
    }
  });

  args.splice(lastC, 0, c);
}

/**
 * Invokes `console.log()` when available.
 * No-op when `console.log` is not a "function".
 *
 * @api public
 */

function log() {
  // this hackery is required for IE8/9, where
  // the `console.log` function doesn't have 'apply'
  return 'object' === typeof console
    && console.log
    && Function.prototype.apply.call(console.log, console, arguments);
}

/**
 * Save `namespaces`.
 *
 * @param {String} namespaces
 * @api private
 */

function save(namespaces) {
  try {
    if (null == namespaces) {
      exports.storage.removeItem('debug');
    } else {
      exports.storage.debug = namespaces;
    }
  } catch(e) {}
}

/**
 * Load `namespaces`.
 *
 * @return {String} returns the previously persisted debug modes
 * @api private
 */

function load() {
  var r;
  try {
    r = exports.storage.debug;
  } catch(e) {}

  // If debug isn't set in LS, and we're in Electron, try to load $DEBUG
  if (!r && typeof process !== 'undefined' && 'env' in process) {
    r = process.env.DEBUG;
  }

  return r;
}

/**
 * Enable namespaces listed in `localStorage.debug` initially.
 */

exports.enable(load());

/**
 * Localstorage attempts to return the localstorage.
 *
 * This is necessary because safari throws
 * when a user disables cookies/localstorage
 * and you attempt to access it.
 *
 * @return {LocalStorage}
 * @api private
 */

function localstorage() {
  try {
    return window.localStorage;
  } catch (e) {}
}

}).call(this,require('_process'))

},{"./debug":24,"_process":180}],24:[function(require,module,exports){

/**
 * This is the common logic for both the Node.js and web browser
 * implementations of `debug()`.
 *
 * Expose `debug()` as the module.
 */

exports = module.exports = createDebug.debug = createDebug['default'] = createDebug;
exports.coerce = coerce;
exports.disable = disable;
exports.enable = enable;
exports.enabled = enabled;
exports.humanize = require('ms');

/**
 * The currently active debug mode names, and names to skip.
 */

exports.names = [];
exports.skips = [];

/**
 * Map of special "%n" handling functions, for the debug "format" argument.
 *
 * Valid key names are a single, lower or upper-case letter, i.e. "n" and "N".
 */

exports.formatters = {};

/**
 * Previous log timestamp.
 */

var prevTime;

/**
 * Select a color.
 * @param {String} namespace
 * @return {Number}
 * @api private
 */

function selectColor(namespace) {
  var hash = 0, i;

  for (i in namespace) {
    hash  = ((hash << 5) - hash) + namespace.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }

  return exports.colors[Math.abs(hash) % exports.colors.length];
}

/**
 * Create a debugger with the given `namespace`.
 *
 * @param {String} namespace
 * @return {Function}
 * @api public
 */

function createDebug(namespace) {

  function debug() {
    // disabled?
    if (!debug.enabled) return;

    var self = debug;

    // set `diff` timestamp
    var curr = +new Date();
    var ms = curr - (prevTime || curr);
    self.diff = ms;
    self.prev = prevTime;
    self.curr = curr;
    prevTime = curr;

    // turn the `arguments` into a proper Array
    var args = new Array(arguments.length);
    for (var i = 0; i < args.length; i++) {
      args[i] = arguments[i];
    }

    args[0] = exports.coerce(args[0]);

    if ('string' !== typeof args[0]) {
      // anything else let's inspect with %O
      args.unshift('%O');
    }

    // apply any `formatters` transformations
    var index = 0;
    args[0] = args[0].replace(/%([a-zA-Z%])/g, function(match, format) {
      // if we encounter an escaped % then don't increase the array index
      if (match === '%%') return match;
      index++;
      var formatter = exports.formatters[format];
      if ('function' === typeof formatter) {
        var val = args[index];
        match = formatter.call(self, val);

        // now we need to remove `args[index]` since it's inlined in the `format`
        args.splice(index, 1);
        index--;
      }
      return match;
    });

    // apply env-specific formatting (colors, etc.)
    exports.formatArgs.call(self, args);

    var logFn = debug.log || exports.log || console.log.bind(console);
    logFn.apply(self, args);
  }

  debug.namespace = namespace;
  debug.enabled = exports.enabled(namespace);
  debug.useColors = exports.useColors();
  debug.color = selectColor(namespace);

  // env-specific initialization logic for debug instances
  if ('function' === typeof exports.init) {
    exports.init(debug);
  }

  return debug;
}

/**
 * Enables a debug mode by namespaces. This can include modes
 * separated by a colon and wildcards.
 *
 * @param {String} namespaces
 * @api public
 */

function enable(namespaces) {
  exports.save(namespaces);

  exports.names = [];
  exports.skips = [];

  var split = (typeof namespaces === 'string' ? namespaces : '').split(/[\s,]+/);
  var len = split.length;

  for (var i = 0; i < len; i++) {
    if (!split[i]) continue; // ignore empty strings
    namespaces = split[i].replace(/\*/g, '.*?');
    if (namespaces[0] === '-') {
      exports.skips.push(new RegExp('^' + namespaces.substr(1) + '$'));
    } else {
      exports.names.push(new RegExp('^' + namespaces + '$'));
    }
  }
}

/**
 * Disable debug output.
 *
 * @api public
 */

function disable() {
  exports.enable('');
}

/**
 * Returns true if the given mode name is enabled, false otherwise.
 *
 * @param {String} name
 * @return {Boolean}
 * @api public
 */

function enabled(name) {
  var i, len;
  for (i = 0, len = exports.skips.length; i < len; i++) {
    if (exports.skips[i].test(name)) {
      return false;
    }
  }
  for (i = 0, len = exports.names.length; i < len; i++) {
    if (exports.names[i].test(name)) {
      return true;
    }
  }
  return false;
}

/**
 * Coerce `val`.
 *
 * @param {Mixed} val
 * @return {Mixed}
 * @api private
 */

function coerce(val) {
  if (val instanceof Error) return val.stack || val.message;
  return val;
}

},{"ms":175}],25:[function(require,module,exports){

module.exports = require('./socket');

/**
 * Exports parser
 *
 * @api public
 *
 */
module.exports.parser = require('engine.io-parser');

},{"./socket":26,"engine.io-parser":34}],26:[function(require,module,exports){
(function (global){
/**
 * Module dependencies.
 */

var transports = require('./transports/index');
var Emitter = require('component-emitter');
var debug = require('debug')('engine.io-client:socket');
var index = require('indexof');
var parser = require('engine.io-parser');
var parseuri = require('parseuri');
var parseqs = require('parseqs');

/**
 * Module exports.
 */

module.exports = Socket;

/**
 * Socket constructor.
 *
 * @param {String|Object} uri or options
 * @param {Object} options
 * @api public
 */

function Socket (uri, opts) {
  if (!(this instanceof Socket)) return new Socket(uri, opts);

  opts = opts || {};

  if (uri && 'object' === typeof uri) {
    opts = uri;
    uri = null;
  }

  if (uri) {
    uri = parseuri(uri);
    opts.hostname = uri.host;
    opts.secure = uri.protocol === 'https' || uri.protocol === 'wss';
    opts.port = uri.port;
    if (uri.query) opts.query = uri.query;
  } else if (opts.host) {
    opts.hostname = parseuri(opts.host).host;
  }

  this.secure = null != opts.secure ? opts.secure
    : (global.location && 'https:' === location.protocol);

  if (opts.hostname && !opts.port) {
    // if no port is specified manually, use the protocol default
    opts.port = this.secure ? '443' : '80';
  }

  this.agent = opts.agent || false;
  this.hostname = opts.hostname ||
    (global.location ? location.hostname : 'localhost');
  this.port = opts.port || (global.location && location.port
      ? location.port
      : (this.secure ? 443 : 80));
  this.query = opts.query || {};
  if ('string' === typeof this.query) this.query = parseqs.decode(this.query);
  this.upgrade = false !== opts.upgrade;
  this.path = (opts.path || '/engine.io').replace(/\/$/, '') + '/';
  this.forceJSONP = !!opts.forceJSONP;
  this.jsonp = false !== opts.jsonp;
  this.forceBase64 = !!opts.forceBase64;
  this.enablesXDR = !!opts.enablesXDR;
  this.timestampParam = opts.timestampParam || 't';
  this.timestampRequests = opts.timestampRequests;
  this.transports = opts.transports || ['polling', 'websocket'];
  this.transportOptions = opts.transportOptions || {};
  this.readyState = '';
  this.writeBuffer = [];
  this.prevBufferLen = 0;
  this.policyPort = opts.policyPort || 843;
  this.rememberUpgrade = opts.rememberUpgrade || false;
  this.binaryType = null;
  this.onlyBinaryUpgrades = opts.onlyBinaryUpgrades;
  this.perMessageDeflate = false !== opts.perMessageDeflate ? (opts.perMessageDeflate || {}) : false;

  if (true === this.perMessageDeflate) this.perMessageDeflate = {};
  if (this.perMessageDeflate && null == this.perMessageDeflate.threshold) {
    this.perMessageDeflate.threshold = 1024;
  }

  // SSL options for Node.js client
  this.pfx = opts.pfx || null;
  this.key = opts.key || null;
  this.passphrase = opts.passphrase || null;
  this.cert = opts.cert || null;
  this.ca = opts.ca || null;
  this.ciphers = opts.ciphers || null;
  this.rejectUnauthorized = opts.rejectUnauthorized === undefined ? true : opts.rejectUnauthorized;
  this.forceNode = !!opts.forceNode;

  // other options for Node.js client
  var freeGlobal = typeof global === 'object' && global;
  if (freeGlobal.global === freeGlobal) {
    if (opts.extraHeaders && Object.keys(opts.extraHeaders).length > 0) {
      this.extraHeaders = opts.extraHeaders;
    }

    if (opts.localAddress) {
      this.localAddress = opts.localAddress;
    }
  }

  // set on handshake
  this.id = null;
  this.upgrades = null;
  this.pingInterval = null;
  this.pingTimeout = null;

  // set on heartbeat
  this.pingIntervalTimer = null;
  this.pingTimeoutTimer = null;

  this.open();
}

Socket.priorWebsocketSuccess = false;

/**
 * Mix in `Emitter`.
 */

Emitter(Socket.prototype);

/**
 * Protocol version.
 *
 * @api public
 */

Socket.protocol = parser.protocol; // this is an int

/**
 * Expose deps for legacy compatibility
 * and standalone browser access.
 */

Socket.Socket = Socket;
Socket.Transport = require('./transport');
Socket.transports = require('./transports/index');
Socket.parser = require('engine.io-parser');

/**
 * Creates transport of the given type.
 *
 * @param {String} transport name
 * @return {Transport}
 * @api private
 */

Socket.prototype.createTransport = function (name) {
  debug('creating transport "%s"', name);
  var query = clone(this.query);

  // append engine.io protocol identifier
  query.EIO = parser.protocol;

  // transport name
  query.transport = name;

  // per-transport options
  var options = this.transportOptions[name] || {};

  // session id if we already have one
  if (this.id) query.sid = this.id;

  var transport = new transports[name]({
    query: query,
    socket: this,
    agent: options.agent || this.agent,
    hostname: options.hostname || this.hostname,
    port: options.port || this.port,
    secure: options.secure || this.secure,
    path: options.path || this.path,
    forceJSONP: options.forceJSONP || this.forceJSONP,
    jsonp: options.jsonp || this.jsonp,
    forceBase64: options.forceBase64 || this.forceBase64,
    enablesXDR: options.enablesXDR || this.enablesXDR,
    timestampRequests: options.timestampRequests || this.timestampRequests,
    timestampParam: options.timestampParam || this.timestampParam,
    policyPort: options.policyPort || this.policyPort,
    pfx: options.pfx || this.pfx,
    key: options.key || this.key,
    passphrase: options.passphrase || this.passphrase,
    cert: options.cert || this.cert,
    ca: options.ca || this.ca,
    ciphers: options.ciphers || this.ciphers,
    rejectUnauthorized: options.rejectUnauthorized || this.rejectUnauthorized,
    perMessageDeflate: options.perMessageDeflate || this.perMessageDeflate,
    extraHeaders: options.extraHeaders || this.extraHeaders,
    forceNode: options.forceNode || this.forceNode,
    localAddress: options.localAddress || this.localAddress,
    requestTimeout: options.requestTimeout || this.requestTimeout,
    protocols: options.protocols || void (0)
  });

  return transport;
};

function clone (obj) {
  var o = {};
  for (var i in obj) {
    if (obj.hasOwnProperty(i)) {
      o[i] = obj[i];
    }
  }
  return o;
}

/**
 * Initializes transport to use and starts probe.
 *
 * @api private
 */
Socket.prototype.open = function () {
  var transport;
  if (this.rememberUpgrade && Socket.priorWebsocketSuccess && this.transports.indexOf('websocket') !== -1) {
    transport = 'websocket';
  } else if (0 === this.transports.length) {
    // Emit error on next tick so it can be listened to
    var self = this;
    setTimeout(function () {
      self.emit('error', 'No transports available');
    }, 0);
    return;
  } else {
    transport = this.transports[0];
  }
  this.readyState = 'opening';

  // Retry with the next transport if the transport is disabled (jsonp: false)
  try {
    transport = this.createTransport(transport);
  } catch (e) {
    this.transports.shift();
    this.open();
    return;
  }

  transport.open();
  this.setTransport(transport);
};

/**
 * Sets the current transport. Disables the existing one (if any).
 *
 * @api private
 */

Socket.prototype.setTransport = function (transport) {
  debug('setting transport %s', transport.name);
  var self = this;

  if (this.transport) {
    debug('clearing existing transport %s', this.transport.name);
    this.transport.removeAllListeners();
  }

  // set up transport
  this.transport = transport;

  // set up transport listeners
  transport
  .on('drain', function () {
    self.onDrain();
  })
  .on('packet', function (packet) {
    self.onPacket(packet);
  })
  .on('error', function (e) {
    self.onError(e);
  })
  .on('close', function () {
    self.onClose('transport close');
  });
};

/**
 * Probes a transport.
 *
 * @param {String} transport name
 * @api private
 */

Socket.prototype.probe = function (name) {
  debug('probing transport "%s"', name);
  var transport = this.createTransport(name, { probe: 1 });
  var failed = false;
  var self = this;

  Socket.priorWebsocketSuccess = false;

  function onTransportOpen () {
    if (self.onlyBinaryUpgrades) {
      var upgradeLosesBinary = !this.supportsBinary && self.transport.supportsBinary;
      failed = failed || upgradeLosesBinary;
    }
    if (failed) return;

    debug('probe transport "%s" opened', name);
    transport.send([{ type: 'ping', data: 'probe' }]);
    transport.once('packet', function (msg) {
      if (failed) return;
      if ('pong' === msg.type && 'probe' === msg.data) {
        debug('probe transport "%s" pong', name);
        self.upgrading = true;
        self.emit('upgrading', transport);
        if (!transport) return;
        Socket.priorWebsocketSuccess = 'websocket' === transport.name;

        debug('pausing current transport "%s"', self.transport.name);
        self.transport.pause(function () {
          if (failed) return;
          if ('closed' === self.readyState) return;
          debug('changing transport and sending upgrade packet');

          cleanup();

          self.setTransport(transport);
          transport.send([{ type: 'upgrade' }]);
          self.emit('upgrade', transport);
          transport = null;
          self.upgrading = false;
          self.flush();
        });
      } else {
        debug('probe transport "%s" failed', name);
        var err = new Error('probe error');
        err.transport = transport.name;
        self.emit('upgradeError', err);
      }
    });
  }

  function freezeTransport () {
    if (failed) return;

    // Any callback called by transport should be ignored since now
    failed = true;

    cleanup();

    transport.close();
    transport = null;
  }

  // Handle any error that happens while probing
  function onerror (err) {
    var error = new Error('probe error: ' + err);
    error.transport = transport.name;

    freezeTransport();

    debug('probe transport "%s" failed because of error: %s', name, err);

    self.emit('upgradeError', error);
  }

  function onTransportClose () {
    onerror('transport closed');
  }

  // When the socket is closed while we're probing
  function onclose () {
    onerror('socket closed');
  }

  // When the socket is upgraded while we're probing
  function onupgrade (to) {
    if (transport && to.name !== transport.name) {
      debug('"%s" works - aborting "%s"', to.name, transport.name);
      freezeTransport();
    }
  }

  // Remove all listeners on the transport and on self
  function cleanup () {
    transport.removeListener('open', onTransportOpen);
    transport.removeListener('error', onerror);
    transport.removeListener('close', onTransportClose);
    self.removeListener('close', onclose);
    self.removeListener('upgrading', onupgrade);
  }

  transport.once('open', onTransportOpen);
  transport.once('error', onerror);
  transport.once('close', onTransportClose);

  this.once('close', onclose);
  this.once('upgrading', onupgrade);

  transport.open();
};

/**
 * Called when connection is deemed open.
 *
 * @api public
 */

Socket.prototype.onOpen = function () {
  debug('socket open');
  this.readyState = 'open';
  Socket.priorWebsocketSuccess = 'websocket' === this.transport.name;
  this.emit('open');
  this.flush();

  // we check for `readyState` in case an `open`
  // listener already closed the socket
  if ('open' === this.readyState && this.upgrade && this.transport.pause) {
    debug('starting upgrade probes');
    for (var i = 0, l = this.upgrades.length; i < l; i++) {
      this.probe(this.upgrades[i]);
    }
  }
};

/**
 * Handles a packet.
 *
 * @api private
 */

Socket.prototype.onPacket = function (packet) {
  if ('opening' === this.readyState || 'open' === this.readyState ||
      'closing' === this.readyState) {
    debug('socket receive: type "%s", data "%s"', packet.type, packet.data);

    this.emit('packet', packet);

    // Socket is live - any packet counts
    this.emit('heartbeat');

    switch (packet.type) {
      case 'open':
        this.onHandshake(JSON.parse(packet.data));
        break;

      case 'pong':
        this.setPing();
        this.emit('pong');
        break;

      case 'error':
        var err = new Error('server error');
        err.code = packet.data;
        this.onError(err);
        break;

      case 'message':
        this.emit('data', packet.data);
        this.emit('message', packet.data);
        break;
    }
  } else {
    debug('packet received with socket readyState "%s"', this.readyState);
  }
};

/**
 * Called upon handshake completion.
 *
 * @param {Object} handshake obj
 * @api private
 */

Socket.prototype.onHandshake = function (data) {
  this.emit('handshake', data);
  this.id = data.sid;
  this.transport.query.sid = data.sid;
  this.upgrades = this.filterUpgrades(data.upgrades);
  this.pingInterval = data.pingInterval;
  this.pingTimeout = data.pingTimeout;
  this.onOpen();
  // In case open handler closes socket
  if ('closed' === this.readyState) return;
  this.setPing();

  // Prolong liveness of socket on heartbeat
  this.removeListener('heartbeat', this.onHeartbeat);
  this.on('heartbeat', this.onHeartbeat);
};

/**
 * Resets ping timeout.
 *
 * @api private
 */

Socket.prototype.onHeartbeat = function (timeout) {
  clearTimeout(this.pingTimeoutTimer);
  var self = this;
  self.pingTimeoutTimer = setTimeout(function () {
    if ('closed' === self.readyState) return;
    self.onClose('ping timeout');
  }, timeout || (self.pingInterval + self.pingTimeout));
};

/**
 * Pings server every `this.pingInterval` and expects response
 * within `this.pingTimeout` or closes connection.
 *
 * @api private
 */

Socket.prototype.setPing = function () {
  var self = this;
  clearTimeout(self.pingIntervalTimer);
  self.pingIntervalTimer = setTimeout(function () {
    debug('writing ping packet - expecting pong within %sms', self.pingTimeout);
    self.ping();
    self.onHeartbeat(self.pingTimeout);
  }, self.pingInterval);
};

/**
* Sends a ping packet.
*
* @api private
*/

Socket.prototype.ping = function () {
  var self = this;
  this.sendPacket('ping', function () {
    self.emit('ping');
  });
};

/**
 * Called on `drain` event
 *
 * @api private
 */

Socket.prototype.onDrain = function () {
  this.writeBuffer.splice(0, this.prevBufferLen);

  // setting prevBufferLen = 0 is very important
  // for example, when upgrading, upgrade packet is sent over,
  // and a nonzero prevBufferLen could cause problems on `drain`
  this.prevBufferLen = 0;

  if (0 === this.writeBuffer.length) {
    this.emit('drain');
  } else {
    this.flush();
  }
};

/**
 * Flush write buffers.
 *
 * @api private
 */

Socket.prototype.flush = function () {
  if ('closed' !== this.readyState && this.transport.writable &&
    !this.upgrading && this.writeBuffer.length) {
    debug('flushing %d packets in socket', this.writeBuffer.length);
    this.transport.send(this.writeBuffer);
    // keep track of current length of writeBuffer
    // splice writeBuffer and callbackBuffer on `drain`
    this.prevBufferLen = this.writeBuffer.length;
    this.emit('flush');
  }
};

/**
 * Sends a message.
 *
 * @param {String} message.
 * @param {Function} callback function.
 * @param {Object} options.
 * @return {Socket} for chaining.
 * @api public
 */

Socket.prototype.write =
Socket.prototype.send = function (msg, options, fn) {
  this.sendPacket('message', msg, options, fn);
  return this;
};

/**
 * Sends a packet.
 *
 * @param {String} packet type.
 * @param {String} data.
 * @param {Object} options.
 * @param {Function} callback function.
 * @api private
 */

Socket.prototype.sendPacket = function (type, data, options, fn) {
  if ('function' === typeof data) {
    fn = data;
    data = undefined;
  }

  if ('function' === typeof options) {
    fn = options;
    options = null;
  }

  if ('closing' === this.readyState || 'closed' === this.readyState) {
    return;
  }

  options = options || {};
  options.compress = false !== options.compress;

  var packet = {
    type: type,
    data: data,
    options: options
  };
  this.emit('packetCreate', packet);
  this.writeBuffer.push(packet);
  if (fn) this.once('flush', fn);
  this.flush();
};

/**
 * Closes the connection.
 *
 * @api private
 */

Socket.prototype.close = function () {
  if ('opening' === this.readyState || 'open' === this.readyState) {
    this.readyState = 'closing';

    var self = this;

    if (this.writeBuffer.length) {
      this.once('drain', function () {
        if (this.upgrading) {
          waitForUpgrade();
        } else {
          close();
        }
      });
    } else if (this.upgrading) {
      waitForUpgrade();
    } else {
      close();
    }
  }

  function close () {
    self.onClose('forced close');
    debug('socket closing - telling transport to close');
    self.transport.close();
  }

  function cleanupAndClose () {
    self.removeListener('upgrade', cleanupAndClose);
    self.removeListener('upgradeError', cleanupAndClose);
    close();
  }

  function waitForUpgrade () {
    // wait for upgrade to finish since we can't send packets while pausing a transport
    self.once('upgrade', cleanupAndClose);
    self.once('upgradeError', cleanupAndClose);
  }

  return this;
};

/**
 * Called upon transport error
 *
 * @api private
 */

Socket.prototype.onError = function (err) {
  debug('socket error %j', err);
  Socket.priorWebsocketSuccess = false;
  this.emit('error', err);
  this.onClose('transport error', err);
};

/**
 * Called upon transport close.
 *
 * @api private
 */

Socket.prototype.onClose = function (reason, desc) {
  if ('opening' === this.readyState || 'open' === this.readyState || 'closing' === this.readyState) {
    debug('socket close with reason: "%s"', reason);
    var self = this;

    // clear timers
    clearTimeout(this.pingIntervalTimer);
    clearTimeout(this.pingTimeoutTimer);

    // stop event from firing again for transport
    this.transport.removeAllListeners('close');

    // ensure transport won't stay open
    this.transport.close();

    // ignore further transport communication
    this.transport.removeAllListeners();

    // set ready state
    this.readyState = 'closed';

    // clear session id
    this.id = null;

    // emit close event
    this.emit('close', reason, desc);

    // clean buffers after, so users can still
    // grab the buffers on `close` event
    self.writeBuffer = [];
    self.prevBufferLen = 0;
  }
};

/**
 * Filters upgrades, returning only those matching client transports.
 *
 * @param {Array} server upgrades
 * @api private
 *
 */

Socket.prototype.filterUpgrades = function (upgrades) {
  var filteredUpgrades = [];
  for (var i = 0, j = upgrades.length; i < j; i++) {
    if (~index(this.transports, upgrades[i])) filteredUpgrades.push(upgrades[i]);
  }
  return filteredUpgrades;
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"./transport":27,"./transports/index":28,"component-emitter":21,"debug":23,"engine.io-parser":34,"indexof":44,"parseqs":177,"parseuri":178}],27:[function(require,module,exports){
/**
 * Module dependencies.
 */

var parser = require('engine.io-parser');
var Emitter = require('component-emitter');

/**
 * Module exports.
 */

module.exports = Transport;

/**
 * Transport abstract constructor.
 *
 * @param {Object} options.
 * @api private
 */

function Transport (opts) {
  this.path = opts.path;
  this.hostname = opts.hostname;
  this.port = opts.port;
  this.secure = opts.secure;
  this.query = opts.query;
  this.timestampParam = opts.timestampParam;
  this.timestampRequests = opts.timestampRequests;
  this.readyState = '';
  this.agent = opts.agent || false;
  this.socket = opts.socket;
  this.enablesXDR = opts.enablesXDR;

  // SSL options for Node.js client
  this.pfx = opts.pfx;
  this.key = opts.key;
  this.passphrase = opts.passphrase;
  this.cert = opts.cert;
  this.ca = opts.ca;
  this.ciphers = opts.ciphers;
  this.rejectUnauthorized = opts.rejectUnauthorized;
  this.forceNode = opts.forceNode;

  // other options for Node.js client
  this.extraHeaders = opts.extraHeaders;
  this.localAddress = opts.localAddress;
}

/**
 * Mix in `Emitter`.
 */

Emitter(Transport.prototype);

/**
 * Emits an error.
 *
 * @param {String} str
 * @return {Transport} for chaining
 * @api public
 */

Transport.prototype.onError = function (msg, desc) {
  var err = new Error(msg);
  err.type = 'TransportError';
  err.description = desc;
  this.emit('error', err);
  return this;
};

/**
 * Opens the transport.
 *
 * @api public
 */

Transport.prototype.open = function () {
  if ('closed' === this.readyState || '' === this.readyState) {
    this.readyState = 'opening';
    this.doOpen();
  }

  return this;
};

/**
 * Closes the transport.
 *
 * @api private
 */

Transport.prototype.close = function () {
  if ('opening' === this.readyState || 'open' === this.readyState) {
    this.doClose();
    this.onClose();
  }

  return this;
};

/**
 * Sends multiple packets.
 *
 * @param {Array} packets
 * @api private
 */

Transport.prototype.send = function (packets) {
  if ('open' === this.readyState) {
    this.write(packets);
  } else {
    throw new Error('Transport not open');
  }
};

/**
 * Called upon open
 *
 * @api private
 */

Transport.prototype.onOpen = function () {
  this.readyState = 'open';
  this.writable = true;
  this.emit('open');
};

/**
 * Called with data.
 *
 * @param {String} data
 * @api private
 */

Transport.prototype.onData = function (data) {
  var packet = parser.decodePacket(data, this.socket.binaryType);
  this.onPacket(packet);
};

/**
 * Called with a decoded packet.
 */

Transport.prototype.onPacket = function (packet) {
  this.emit('packet', packet);
};

/**
 * Called upon close.
 *
 * @api private
 */

Transport.prototype.onClose = function () {
  this.readyState = 'closed';
  this.emit('close');
};

},{"component-emitter":21,"engine.io-parser":34}],28:[function(require,module,exports){
(function (global){
/**
 * Module dependencies
 */

var XMLHttpRequest = require('xmlhttprequest-ssl');
var XHR = require('./polling-xhr');
var JSONP = require('./polling-jsonp');
var websocket = require('./websocket');

/**
 * Export transports.
 */

exports.polling = polling;
exports.websocket = websocket;

/**
 * Polling transport polymorphic constructor.
 * Decides on xhr vs jsonp based on feature detection.
 *
 * @api private
 */

function polling (opts) {
  var xhr;
  var xd = false;
  var xs = false;
  var jsonp = false !== opts.jsonp;

  if (global.location) {
    var isSSL = 'https:' === location.protocol;
    var port = location.port;

    // some user agents have empty `location.port`
    if (!port) {
      port = isSSL ? 443 : 80;
    }

    xd = opts.hostname !== location.hostname || port !== opts.port;
    xs = opts.secure !== isSSL;
  }

  opts.xdomain = xd;
  opts.xscheme = xs;
  xhr = new XMLHttpRequest(opts);

  if ('open' in xhr && !opts.forceJSONP) {
    return new XHR(opts);
  } else {
    if (!jsonp) throw new Error('JSONP disabled');
    return new JSONP(opts);
  }
}

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"./polling-jsonp":29,"./polling-xhr":30,"./websocket":32,"xmlhttprequest-ssl":33}],29:[function(require,module,exports){
(function (global){

/**
 * Module requirements.
 */

var Polling = require('./polling');
var inherit = require('component-inherit');

/**
 * Module exports.
 */

module.exports = JSONPPolling;

/**
 * Cached regular expressions.
 */

var rNewline = /\n/g;
var rEscapedNewline = /\\n/g;

/**
 * Global JSONP callbacks.
 */

var callbacks;

/**
 * Noop.
 */

function empty () { }

/**
 * JSONP Polling constructor.
 *
 * @param {Object} opts.
 * @api public
 */

function JSONPPolling (opts) {
  Polling.call(this, opts);

  this.query = this.query || {};

  // define global callbacks array if not present
  // we do this here (lazily) to avoid unneeded global pollution
  if (!callbacks) {
    // we need to consider multiple engines in the same page
    if (!global.___eio) global.___eio = [];
    callbacks = global.___eio;
  }

  // callback identifier
  this.index = callbacks.length;

  // add callback to jsonp global
  var self = this;
  callbacks.push(function (msg) {
    self.onData(msg);
  });

  // append to query string
  this.query.j = this.index;

  // prevent spurious errors from being emitted when the window is unloaded
  if (global.document && global.addEventListener) {
    global.addEventListener('beforeunload', function () {
      if (self.script) self.script.onerror = empty;
    }, false);
  }
}

/**
 * Inherits from Polling.
 */

inherit(JSONPPolling, Polling);

/*
 * JSONP only supports binary as base64 encoded strings
 */

JSONPPolling.prototype.supportsBinary = false;

/**
 * Closes the socket.
 *
 * @api private
 */

JSONPPolling.prototype.doClose = function () {
  if (this.script) {
    this.script.parentNode.removeChild(this.script);
    this.script = null;
  }

  if (this.form) {
    this.form.parentNode.removeChild(this.form);
    this.form = null;
    this.iframe = null;
  }

  Polling.prototype.doClose.call(this);
};

/**
 * Starts a poll cycle.
 *
 * @api private
 */

JSONPPolling.prototype.doPoll = function () {
  var self = this;
  var script = document.createElement('script');

  if (this.script) {
    this.script.parentNode.removeChild(this.script);
    this.script = null;
  }

  script.async = true;
  script.src = this.uri();
  script.onerror = function (e) {
    self.onError('jsonp poll error', e);
  };

  var insertAt = document.getElementsByTagName('script')[0];
  if (insertAt) {
    insertAt.parentNode.insertBefore(script, insertAt);
  } else {
    (document.head || document.body).appendChild(script);
  }
  this.script = script;

  var isUAgecko = 'undefined' !== typeof navigator && /gecko/i.test(navigator.userAgent);

  if (isUAgecko) {
    setTimeout(function () {
      var iframe = document.createElement('iframe');
      document.body.appendChild(iframe);
      document.body.removeChild(iframe);
    }, 100);
  }
};

/**
 * Writes with a hidden iframe.
 *
 * @param {String} data to send
 * @param {Function} called upon flush.
 * @api private
 */

JSONPPolling.prototype.doWrite = function (data, fn) {
  var self = this;

  if (!this.form) {
    var form = document.createElement('form');
    var area = document.createElement('textarea');
    var id = this.iframeId = 'eio_iframe_' + this.index;
    var iframe;

    form.className = 'socketio';
    form.style.position = 'absolute';
    form.style.top = '-1000px';
    form.style.left = '-1000px';
    form.target = id;
    form.method = 'POST';
    form.setAttribute('accept-charset', 'utf-8');
    area.name = 'd';
    form.appendChild(area);
    document.body.appendChild(form);

    this.form = form;
    this.area = area;
  }

  this.form.action = this.uri();

  function complete () {
    initIframe();
    fn();
  }

  function initIframe () {
    if (self.iframe) {
      try {
        self.form.removeChild(self.iframe);
      } catch (e) {
        self.onError('jsonp polling iframe removal error', e);
      }
    }

    try {
      // ie6 dynamic iframes with target="" support (thanks Chris Lambacher)
      var html = '<iframe src="javascript:0" name="' + self.iframeId + '">';
      iframe = document.createElement(html);
    } catch (e) {
      iframe = document.createElement('iframe');
      iframe.name = self.iframeId;
      iframe.src = 'javascript:0';
    }

    iframe.id = self.iframeId;

    self.form.appendChild(iframe);
    self.iframe = iframe;
  }

  initIframe();

  // escape \n to prevent it from being converted into \r\n by some UAs
  // double escaping is required for escaped new lines because unescaping of new lines can be done safely on server-side
  data = data.replace(rEscapedNewline, '\\\n');
  this.area.value = data.replace(rNewline, '\\n');

  try {
    this.form.submit();
  } catch (e) {}

  if (this.iframe.attachEvent) {
    this.iframe.onreadystatechange = function () {
      if (self.iframe.readyState === 'complete') {
        complete();
      }
    };
  } else {
    this.iframe.onload = complete;
  }
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"./polling":31,"component-inherit":22}],30:[function(require,module,exports){
(function (global){
/**
 * Module requirements.
 */

var XMLHttpRequest = require('xmlhttprequest-ssl');
var Polling = require('./polling');
var Emitter = require('component-emitter');
var inherit = require('component-inherit');
var debug = require('debug')('engine.io-client:polling-xhr');

/**
 * Module exports.
 */

module.exports = XHR;
module.exports.Request = Request;

/**
 * Empty function
 */

function empty () {}

/**
 * XHR Polling constructor.
 *
 * @param {Object} opts
 * @api public
 */

function XHR (opts) {
  Polling.call(this, opts);
  this.requestTimeout = opts.requestTimeout;
  this.extraHeaders = opts.extraHeaders;

  if (global.location) {
    var isSSL = 'https:' === location.protocol;
    var port = location.port;

    // some user agents have empty `location.port`
    if (!port) {
      port = isSSL ? 443 : 80;
    }

    this.xd = opts.hostname !== global.location.hostname ||
      port !== opts.port;
    this.xs = opts.secure !== isSSL;
  }
}

/**
 * Inherits from Polling.
 */

inherit(XHR, Polling);

/**
 * XHR supports binary
 */

XHR.prototype.supportsBinary = true;

/**
 * Creates a request.
 *
 * @param {String} method
 * @api private
 */

XHR.prototype.request = function (opts) {
  opts = opts || {};
  opts.uri = this.uri();
  opts.xd = this.xd;
  opts.xs = this.xs;
  opts.agent = this.agent || false;
  opts.supportsBinary = this.supportsBinary;
  opts.enablesXDR = this.enablesXDR;

  // SSL options for Node.js client
  opts.pfx = this.pfx;
  opts.key = this.key;
  opts.passphrase = this.passphrase;
  opts.cert = this.cert;
  opts.ca = this.ca;
  opts.ciphers = this.ciphers;
  opts.rejectUnauthorized = this.rejectUnauthorized;
  opts.requestTimeout = this.requestTimeout;

  // other options for Node.js client
  opts.extraHeaders = this.extraHeaders;

  return new Request(opts);
};

/**
 * Sends data.
 *
 * @param {String} data to send.
 * @param {Function} called upon flush.
 * @api private
 */

XHR.prototype.doWrite = function (data, fn) {
  var isBinary = typeof data !== 'string' && data !== undefined;
  var req = this.request({ method: 'POST', data: data, isBinary: isBinary });
  var self = this;
  req.on('success', fn);
  req.on('error', function (err) {
    self.onError('xhr post error', err);
  });
  this.sendXhr = req;
};

/**
 * Starts a poll cycle.
 *
 * @api private
 */

XHR.prototype.doPoll = function () {
  debug('xhr poll');
  var req = this.request();
  var self = this;
  req.on('data', function (data) {
    self.onData(data);
  });
  req.on('error', function (err) {
    self.onError('xhr poll error', err);
  });
  this.pollXhr = req;
};

/**
 * Request constructor
 *
 * @param {Object} options
 * @api public
 */

function Request (opts) {
  this.method = opts.method || 'GET';
  this.uri = opts.uri;
  this.xd = !!opts.xd;
  this.xs = !!opts.xs;
  this.async = false !== opts.async;
  this.data = undefined !== opts.data ? opts.data : null;
  this.agent = opts.agent;
  this.isBinary = opts.isBinary;
  this.supportsBinary = opts.supportsBinary;
  this.enablesXDR = opts.enablesXDR;
  this.requestTimeout = opts.requestTimeout;

  // SSL options for Node.js client
  this.pfx = opts.pfx;
  this.key = opts.key;
  this.passphrase = opts.passphrase;
  this.cert = opts.cert;
  this.ca = opts.ca;
  this.ciphers = opts.ciphers;
  this.rejectUnauthorized = opts.rejectUnauthorized;

  // other options for Node.js client
  this.extraHeaders = opts.extraHeaders;

  this.create();
}

/**
 * Mix in `Emitter`.
 */

Emitter(Request.prototype);

/**
 * Creates the XHR object and sends the request.
 *
 * @api private
 */

Request.prototype.create = function () {
  var opts = { agent: this.agent, xdomain: this.xd, xscheme: this.xs, enablesXDR: this.enablesXDR };

  // SSL options for Node.js client
  opts.pfx = this.pfx;
  opts.key = this.key;
  opts.passphrase = this.passphrase;
  opts.cert = this.cert;
  opts.ca = this.ca;
  opts.ciphers = this.ciphers;
  opts.rejectUnauthorized = this.rejectUnauthorized;

  var xhr = this.xhr = new XMLHttpRequest(opts);
  var self = this;

  try {
    debug('xhr open %s: %s', this.method, this.uri);
    xhr.open(this.method, this.uri, this.async);
    try {
      if (this.extraHeaders) {
        xhr.setDisableHeaderCheck && xhr.setDisableHeaderCheck(true);
        for (var i in this.extraHeaders) {
          if (this.extraHeaders.hasOwnProperty(i)) {
            xhr.setRequestHeader(i, this.extraHeaders[i]);
          }
        }
      }
    } catch (e) {}

    if ('POST' === this.method) {
      try {
        if (this.isBinary) {
          xhr.setRequestHeader('Content-type', 'application/octet-stream');
        } else {
          xhr.setRequestHeader('Content-type', 'text/plain;charset=UTF-8');
        }
      } catch (e) {}
    }

    try {
      xhr.setRequestHeader('Accept', '*/*');
    } catch (e) {}

    // ie6 check
    if ('withCredentials' in xhr) {
      xhr.withCredentials = true;
    }

    if (this.requestTimeout) {
      xhr.timeout = this.requestTimeout;
    }

    if (this.hasXDR()) {
      xhr.onload = function () {
        self.onLoad();
      };
      xhr.onerror = function () {
        self.onError(xhr.responseText);
      };
    } else {
      xhr.onreadystatechange = function () {
        if (xhr.readyState === 2) {
          var contentType;
          try {
            contentType = xhr.getResponseHeader('Content-Type');
          } catch (e) {}
          if (contentType === 'application/octet-stream') {
            xhr.responseType = 'arraybuffer';
          }
        }
        if (4 !== xhr.readyState) return;
        if (200 === xhr.status || 1223 === xhr.status) {
          self.onLoad();
        } else {
          // make sure the `error` event handler that's user-set
          // does not throw in the same tick and gets caught here
          setTimeout(function () {
            self.onError(xhr.status);
          }, 0);
        }
      };
    }

    debug('xhr data %s', this.data);
    xhr.send(this.data);
  } catch (e) {
    // Need to defer since .create() is called directly fhrom the constructor
    // and thus the 'error' event can only be only bound *after* this exception
    // occurs.  Therefore, also, we cannot throw here at all.
    setTimeout(function () {
      self.onError(e);
    }, 0);
    return;
  }

  if (global.document) {
    this.index = Request.requestsCount++;
    Request.requests[this.index] = this;
  }
};

/**
 * Called upon successful response.
 *
 * @api private
 */

Request.prototype.onSuccess = function () {
  this.emit('success');
  this.cleanup();
};

/**
 * Called if we have data.
 *
 * @api private
 */

Request.prototype.onData = function (data) {
  this.emit('data', data);
  this.onSuccess();
};

/**
 * Called upon error.
 *
 * @api private
 */

Request.prototype.onError = function (err) {
  this.emit('error', err);
  this.cleanup(true);
};

/**
 * Cleans up house.
 *
 * @api private
 */

Request.prototype.cleanup = function (fromError) {
  if ('undefined' === typeof this.xhr || null === this.xhr) {
    return;
  }
  // xmlhttprequest
  if (this.hasXDR()) {
    this.xhr.onload = this.xhr.onerror = empty;
  } else {
    this.xhr.onreadystatechange = empty;
  }

  if (fromError) {
    try {
      this.xhr.abort();
    } catch (e) {}
  }

  if (global.document) {
    delete Request.requests[this.index];
  }

  this.xhr = null;
};

/**
 * Called upon load.
 *
 * @api private
 */

Request.prototype.onLoad = function () {
  var data;
  try {
    var contentType;
    try {
      contentType = this.xhr.getResponseHeader('Content-Type');
    } catch (e) {}
    if (contentType === 'application/octet-stream') {
      data = this.xhr.response || this.xhr.responseText;
    } else {
      data = this.xhr.responseText;
    }
  } catch (e) {
    this.onError(e);
  }
  if (null != data) {
    this.onData(data);
  }
};

/**
 * Check if it has XDomainRequest.
 *
 * @api private
 */

Request.prototype.hasXDR = function () {
  return 'undefined' !== typeof global.XDomainRequest && !this.xs && this.enablesXDR;
};

/**
 * Aborts the request.
 *
 * @api public
 */

Request.prototype.abort = function () {
  this.cleanup();
};

/**
 * Aborts pending requests when unloading the window. This is needed to prevent
 * memory leaks (e.g. when using IE) and to ensure that no spurious error is
 * emitted.
 */

Request.requestsCount = 0;
Request.requests = {};

if (global.document) {
  if (global.attachEvent) {
    global.attachEvent('onunload', unloadHandler);
  } else if (global.addEventListener) {
    global.addEventListener('beforeunload', unloadHandler, false);
  }
}

function unloadHandler () {
  for (var i in Request.requests) {
    if (Request.requests.hasOwnProperty(i)) {
      Request.requests[i].abort();
    }
  }
}

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"./polling":31,"component-emitter":21,"component-inherit":22,"debug":23,"xmlhttprequest-ssl":33}],31:[function(require,module,exports){
/**
 * Module dependencies.
 */

var Transport = require('../transport');
var parseqs = require('parseqs');
var parser = require('engine.io-parser');
var inherit = require('component-inherit');
var yeast = require('yeast');
var debug = require('debug')('engine.io-client:polling');

/**
 * Module exports.
 */

module.exports = Polling;

/**
 * Is XHR2 supported?
 */

var hasXHR2 = (function () {
  var XMLHttpRequest = require('xmlhttprequest-ssl');
  var xhr = new XMLHttpRequest({ xdomain: false });
  return null != xhr.responseType;
})();

/**
 * Polling interface.
 *
 * @param {Object} opts
 * @api private
 */

function Polling (opts) {
  var forceBase64 = (opts && opts.forceBase64);
  if (!hasXHR2 || forceBase64) {
    this.supportsBinary = false;
  }
  Transport.call(this, opts);
}

/**
 * Inherits from Transport.
 */

inherit(Polling, Transport);

/**
 * Transport name.
 */

Polling.prototype.name = 'polling';

/**
 * Opens the socket (triggers polling). We write a PING message to determine
 * when the transport is open.
 *
 * @api private
 */

Polling.prototype.doOpen = function () {
  this.poll();
};

/**
 * Pauses polling.
 *
 * @param {Function} callback upon buffers are flushed and transport is paused
 * @api private
 */

Polling.prototype.pause = function (onPause) {
  var self = this;

  this.readyState = 'pausing';

  function pause () {
    debug('paused');
    self.readyState = 'paused';
    onPause();
  }

  if (this.polling || !this.writable) {
    var total = 0;

    if (this.polling) {
      debug('we are currently polling - waiting to pause');
      total++;
      this.once('pollComplete', function () {
        debug('pre-pause polling complete');
        --total || pause();
      });
    }

    if (!this.writable) {
      debug('we are currently writing - waiting to pause');
      total++;
      this.once('drain', function () {
        debug('pre-pause writing complete');
        --total || pause();
      });
    }
  } else {
    pause();
  }
};

/**
 * Starts polling cycle.
 *
 * @api public
 */

Polling.prototype.poll = function () {
  debug('polling');
  this.polling = true;
  this.doPoll();
  this.emit('poll');
};

/**
 * Overloads onData to detect payloads.
 *
 * @api private
 */

Polling.prototype.onData = function (data) {
  var self = this;
  debug('polling got data %s', data);
  var callback = function (packet, index, total) {
    // if its the first message we consider the transport open
    if ('opening' === self.readyState) {
      self.onOpen();
    }

    // if its a close packet, we close the ongoing requests
    if ('close' === packet.type) {
      self.onClose();
      return false;
    }

    // otherwise bypass onData and handle the message
    self.onPacket(packet);
  };

  // decode payload
  parser.decodePayload(data, this.socket.binaryType, callback);

  // if an event did not trigger closing
  if ('closed' !== this.readyState) {
    // if we got data we're not polling
    this.polling = false;
    this.emit('pollComplete');

    if ('open' === this.readyState) {
      this.poll();
    } else {
      debug('ignoring poll - transport state "%s"', this.readyState);
    }
  }
};

/**
 * For polling, send a close packet.
 *
 * @api private
 */

Polling.prototype.doClose = function () {
  var self = this;

  function close () {
    debug('writing close packet');
    self.write([{ type: 'close' }]);
  }

  if ('open' === this.readyState) {
    debug('transport open - closing');
    close();
  } else {
    // in case we're trying to close while
    // handshaking is in progress (GH-164)
    debug('transport not open - deferring close');
    this.once('open', close);
  }
};

/**
 * Writes a packets payload.
 *
 * @param {Array} data packets
 * @param {Function} drain callback
 * @api private
 */

Polling.prototype.write = function (packets) {
  var self = this;
  this.writable = false;
  var callbackfn = function () {
    self.writable = true;
    self.emit('drain');
  };

  parser.encodePayload(packets, this.supportsBinary, function (data) {
    self.doWrite(data, callbackfn);
  });
};

/**
 * Generates uri for connection.
 *
 * @api private
 */

Polling.prototype.uri = function () {
  var query = this.query || {};
  var schema = this.secure ? 'https' : 'http';
  var port = '';

  // cache busting is forced
  if (false !== this.timestampRequests) {
    query[this.timestampParam] = yeast();
  }

  if (!this.supportsBinary && !query.sid) {
    query.b64 = 1;
  }

  query = parseqs.encode(query);

  // avoid port if default for schema
  if (this.port && (('https' === schema && Number(this.port) !== 443) ||
     ('http' === schema && Number(this.port) !== 80))) {
    port = ':' + this.port;
  }

  // prepend ? to query
  if (query.length) {
    query = '?' + query;
  }

  var ipv6 = this.hostname.indexOf(':') !== -1;
  return schema + '://' + (ipv6 ? '[' + this.hostname + ']' : this.hostname) + port + this.path + query;
};

},{"../transport":27,"component-inherit":22,"debug":23,"engine.io-parser":34,"parseqs":177,"xmlhttprequest-ssl":33,"yeast":203}],32:[function(require,module,exports){
(function (global){
/**
 * Module dependencies.
 */

var Transport = require('../transport');
var parser = require('engine.io-parser');
var parseqs = require('parseqs');
var inherit = require('component-inherit');
var yeast = require('yeast');
var debug = require('debug')('engine.io-client:websocket');
var BrowserWebSocket = global.WebSocket || global.MozWebSocket;
var NodeWebSocket;
if (typeof window === 'undefined') {
  try {
    NodeWebSocket = require('ws');
  } catch (e) { }
}

/**
 * Get either the `WebSocket` or `MozWebSocket` globals
 * in the browser or try to resolve WebSocket-compatible
 * interface exposed by `ws` for Node-like environment.
 */

var WebSocket = BrowserWebSocket;
if (!WebSocket && typeof window === 'undefined') {
  WebSocket = NodeWebSocket;
}

/**
 * Module exports.
 */

module.exports = WS;

/**
 * WebSocket transport constructor.
 *
 * @api {Object} connection options
 * @api public
 */

function WS (opts) {
  var forceBase64 = (opts && opts.forceBase64);
  if (forceBase64) {
    this.supportsBinary = false;
  }
  this.perMessageDeflate = opts.perMessageDeflate;
  this.usingBrowserWebSocket = BrowserWebSocket && !opts.forceNode;
  this.protocols = opts.protocols;
  if (!this.usingBrowserWebSocket) {
    WebSocket = NodeWebSocket;
  }
  Transport.call(this, opts);
}

/**
 * Inherits from Transport.
 */

inherit(WS, Transport);

/**
 * Transport name.
 *
 * @api public
 */

WS.prototype.name = 'websocket';

/*
 * WebSockets support binary
 */

WS.prototype.supportsBinary = true;

/**
 * Opens socket.
 *
 * @api private
 */

WS.prototype.doOpen = function () {
  if (!this.check()) {
    // let probe timeout
    return;
  }

  var uri = this.uri();
  var protocols = this.protocols;
  var opts = {
    agent: this.agent,
    perMessageDeflate: this.perMessageDeflate
  };

  // SSL options for Node.js client
  opts.pfx = this.pfx;
  opts.key = this.key;
  opts.passphrase = this.passphrase;
  opts.cert = this.cert;
  opts.ca = this.ca;
  opts.ciphers = this.ciphers;
  opts.rejectUnauthorized = this.rejectUnauthorized;
  if (this.extraHeaders) {
    opts.headers = this.extraHeaders;
  }
  if (this.localAddress) {
    opts.localAddress = this.localAddress;
  }

  try {
    this.ws = this.usingBrowserWebSocket ? (protocols ? new WebSocket(uri, protocols) : new WebSocket(uri)) : new WebSocket(uri, protocols, opts);
  } catch (err) {
    return this.emit('error', err);
  }

  if (this.ws.binaryType === undefined) {
    this.supportsBinary = false;
  }

  if (this.ws.supports && this.ws.supports.binary) {
    this.supportsBinary = true;
    this.ws.binaryType = 'nodebuffer';
  } else {
    this.ws.binaryType = 'arraybuffer';
  }

  this.addEventListeners();
};

/**
 * Adds event listeners to the socket
 *
 * @api private
 */

WS.prototype.addEventListeners = function () {
  var self = this;

  this.ws.onopen = function () {
    self.onOpen();
  };
  this.ws.onclose = function () {
    self.onClose();
  };
  this.ws.onmessage = function (ev) {
    self.onData(ev.data);
  };
  this.ws.onerror = function (e) {
    self.onError('websocket error', e);
  };
};

/**
 * Writes data to socket.
 *
 * @param {Array} array of packets.
 * @api private
 */

WS.prototype.write = function (packets) {
  var self = this;
  this.writable = false;

  // encodePacket efficient as it uses WS framing
  // no need for encodePayload
  var total = packets.length;
  for (var i = 0, l = total; i < l; i++) {
    (function (packet) {
      parser.encodePacket(packet, self.supportsBinary, function (data) {
        if (!self.usingBrowserWebSocket) {
          // always create a new object (GH-437)
          var opts = {};
          if (packet.options) {
            opts.compress = packet.options.compress;
          }

          if (self.perMessageDeflate) {
            var len = 'string' === typeof data ? global.Buffer.byteLength(data) : data.length;
            if (len < self.perMessageDeflate.threshold) {
              opts.compress = false;
            }
          }
        }

        // Sometimes the websocket has already been closed but the browser didn't
        // have a chance of informing us about it yet, in that case send will
        // throw an error
        try {
          if (self.usingBrowserWebSocket) {
            // TypeError is thrown when passing the second argument on Safari
            self.ws.send(data);
          } else {
            self.ws.send(data, opts);
          }
        } catch (e) {
          debug('websocket closed before onclose event');
        }

        --total || done();
      });
    })(packets[i]);
  }

  function done () {
    self.emit('flush');

    // fake drain
    // defer to next tick to allow Socket to clear writeBuffer
    setTimeout(function () {
      self.writable = true;
      self.emit('drain');
    }, 0);
  }
};

/**
 * Called upon close
 *
 * @api private
 */

WS.prototype.onClose = function () {
  Transport.prototype.onClose.call(this);
};

/**
 * Closes socket.
 *
 * @api private
 */

WS.prototype.doClose = function () {
  if (typeof this.ws !== 'undefined') {
    this.ws.close();
  }
};

/**
 * Generates uri for connection.
 *
 * @api private
 */

WS.prototype.uri = function () {
  var query = this.query || {};
  var schema = this.secure ? 'wss' : 'ws';
  var port = '';

  // avoid port if default for schema
  if (this.port && (('wss' === schema && Number(this.port) !== 443) ||
    ('ws' === schema && Number(this.port) !== 80))) {
    port = ':' + this.port;
  }

  // append timestamp to URI
  if (this.timestampRequests) {
    query[this.timestampParam] = yeast();
  }

  // communicate binary support capabilities
  if (!this.supportsBinary) {
    query.b64 = 1;
  }

  query = parseqs.encode(query);

  // prepend ? to query
  if (query.length) {
    query = '?' + query;
  }

  var ipv6 = this.hostname.indexOf(':') !== -1;
  return schema + '://' + (ipv6 ? '[' + this.hostname + ']' : this.hostname) + port + this.path + query;
};

/**
 * Feature detection for WebSocket.
 *
 * @return {Boolean} whether this transport is available.
 * @api public
 */

WS.prototype.check = function () {
  return !!WebSocket && !('__initialize' in WebSocket && this.name === WS.prototype.name);
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"../transport":27,"component-inherit":22,"debug":23,"engine.io-parser":34,"parseqs":177,"ws":17,"yeast":203}],33:[function(require,module,exports){
(function (global){
// browser shim for xmlhttprequest module

var hasCORS = require('has-cors');

module.exports = function (opts) {
  var xdomain = opts.xdomain;

  // scheme must be same when usign XDomainRequest
  // http://blogs.msdn.com/b/ieinternals/archive/2010/05/13/xdomainrequest-restrictions-limitations-and-workarounds.aspx
  var xscheme = opts.xscheme;

  // XDomainRequest has a flow of not sending cookie, therefore it should be disabled as a default.
  // https://github.com/Automattic/engine.io-client/pull/217
  var enablesXDR = opts.enablesXDR;

  // XMLHttpRequest can be disabled on IE
  try {
    if ('undefined' !== typeof XMLHttpRequest && (!xdomain || hasCORS)) {
      return new XMLHttpRequest();
    }
  } catch (e) { }

  // Use XDomainRequest for IE8 if enablesXDR is true
  // because loading bar keeps flashing when using jsonp-polling
  // https://github.com/yujiosaka/socke.io-ie8-loading-example
  try {
    if ('undefined' !== typeof XDomainRequest && !xscheme && enablesXDR) {
      return new XDomainRequest();
    }
  } catch (e) { }

  if (!xdomain) {
    try {
      return new global[['Active'].concat('Object').join('X')]('Microsoft.XMLHTTP');
    } catch (e) { }
  }
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"has-cors":42}],34:[function(require,module,exports){
(function (global){
/**
 * Module dependencies.
 */

var keys = require('./keys');
var hasBinary = require('has-binary2');
var sliceBuffer = require('arraybuffer.slice');
var after = require('after');
var utf8 = require('./utf8');

var base64encoder;
if (global && global.ArrayBuffer) {
  base64encoder = require('base64-arraybuffer');
}

/**
 * Check if we are running an android browser. That requires us to use
 * ArrayBuffer with polling transports...
 *
 * http://ghinda.net/jpeg-blob-ajax-android/
 */

var isAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);

/**
 * Check if we are running in PhantomJS.
 * Uploading a Blob with PhantomJS does not work correctly, as reported here:
 * https://github.com/ariya/phantomjs/issues/11395
 * @type boolean
 */
var isPhantomJS = typeof navigator !== 'undefined' && /PhantomJS/i.test(navigator.userAgent);

/**
 * When true, avoids using Blobs to encode payloads.
 * @type boolean
 */
var dontSendBlobs = isAndroid || isPhantomJS;

/**
 * Current protocol version.
 */

exports.protocol = 3;

/**
 * Packet types.
 */

var packets = exports.packets = {
    open:     0    // non-ws
  , close:    1    // non-ws
  , ping:     2
  , pong:     3
  , message:  4
  , upgrade:  5
  , noop:     6
};

var packetslist = keys(packets);

/**
 * Premade error packet.
 */

var err = { type: 'error', data: 'parser error' };

/**
 * Create a blob api even for blob builder when vendor prefixes exist
 */

var Blob = require('blob');

/**
 * Encodes a packet.
 *
 *     <packet type id> [ <data> ]
 *
 * Example:
 *
 *     5hello world
 *     3
 *     4
 *
 * Binary is encoded in an identical principle
 *
 * @api private
 */

exports.encodePacket = function (packet, supportsBinary, utf8encode, callback) {
  if (typeof supportsBinary === 'function') {
    callback = supportsBinary;
    supportsBinary = false;
  }

  if (typeof utf8encode === 'function') {
    callback = utf8encode;
    utf8encode = null;
  }

  var data = (packet.data === undefined)
    ? undefined
    : packet.data.buffer || packet.data;

  if (global.ArrayBuffer && data instanceof ArrayBuffer) {
    return encodeArrayBuffer(packet, supportsBinary, callback);
  } else if (Blob && data instanceof global.Blob) {
    return encodeBlob(packet, supportsBinary, callback);
  }

  // might be an object with { base64: true, data: dataAsBase64String }
  if (data && data.base64) {
    return encodeBase64Object(packet, callback);
  }

  // Sending data as a utf-8 string
  var encoded = packets[packet.type];

  // data fragment is optional
  if (undefined !== packet.data) {
    encoded += utf8encode ? utf8.encode(String(packet.data), { strict: false }) : String(packet.data);
  }

  return callback('' + encoded);

};

function encodeBase64Object(packet, callback) {
  // packet data is an object { base64: true, data: dataAsBase64String }
  var message = 'b' + exports.packets[packet.type] + packet.data.data;
  return callback(message);
}

/**
 * Encode packet helpers for binary types
 */

function encodeArrayBuffer(packet, supportsBinary, callback) {
  if (!supportsBinary) {
    return exports.encodeBase64Packet(packet, callback);
  }

  var data = packet.data;
  var contentArray = new Uint8Array(data);
  var resultBuffer = new Uint8Array(1 + data.byteLength);

  resultBuffer[0] = packets[packet.type];
  for (var i = 0; i < contentArray.length; i++) {
    resultBuffer[i+1] = contentArray[i];
  }

  return callback(resultBuffer.buffer);
}

function encodeBlobAsArrayBuffer(packet, supportsBinary, callback) {
  if (!supportsBinary) {
    return exports.encodeBase64Packet(packet, callback);
  }

  var fr = new FileReader();
  fr.onload = function() {
    packet.data = fr.result;
    exports.encodePacket(packet, supportsBinary, true, callback);
  };
  return fr.readAsArrayBuffer(packet.data);
}

function encodeBlob(packet, supportsBinary, callback) {
  if (!supportsBinary) {
    return exports.encodeBase64Packet(packet, callback);
  }

  if (dontSendBlobs) {
    return encodeBlobAsArrayBuffer(packet, supportsBinary, callback);
  }

  var length = new Uint8Array(1);
  length[0] = packets[packet.type];
  var blob = new Blob([length.buffer, packet.data]);

  return callback(blob);
}

/**
 * Encodes a packet with binary data in a base64 string
 *
 * @param {Object} packet, has `type` and `data`
 * @return {String} base64 encoded message
 */

exports.encodeBase64Packet = function(packet, callback) {
  var message = 'b' + exports.packets[packet.type];
  if (Blob && packet.data instanceof global.Blob) {
    var fr = new FileReader();
    fr.onload = function() {
      var b64 = fr.result.split(',')[1];
      callback(message + b64);
    };
    return fr.readAsDataURL(packet.data);
  }

  var b64data;
  try {
    b64data = String.fromCharCode.apply(null, new Uint8Array(packet.data));
  } catch (e) {
    // iPhone Safari doesn't let you apply with typed arrays
    var typed = new Uint8Array(packet.data);
    var basic = new Array(typed.length);
    for (var i = 0; i < typed.length; i++) {
      basic[i] = typed[i];
    }
    b64data = String.fromCharCode.apply(null, basic);
  }
  message += global.btoa(b64data);
  return callback(message);
};

/**
 * Decodes a packet. Changes format to Blob if requested.
 *
 * @return {Object} with `type` and `data` (if any)
 * @api private
 */

exports.decodePacket = function (data, binaryType, utf8decode) {
  if (data === undefined) {
    return err;
  }
  // String data
  if (typeof data === 'string') {
    if (data.charAt(0) === 'b') {
      return exports.decodeBase64Packet(data.substr(1), binaryType);
    }

    if (utf8decode) {
      data = tryDecode(data);
      if (data === false) {
        return err;
      }
    }
    var type = data.charAt(0);

    if (Number(type) != type || !packetslist[type]) {
      return err;
    }

    if (data.length > 1) {
      return { type: packetslist[type], data: data.substring(1) };
    } else {
      return { type: packetslist[type] };
    }
  }

  var asArray = new Uint8Array(data);
  var type = asArray[0];
  var rest = sliceBuffer(data, 1);
  if (Blob && binaryType === 'blob') {
    rest = new Blob([rest]);
  }
  return { type: packetslist[type], data: rest };
};

function tryDecode(data) {
  try {
    data = utf8.decode(data, { strict: false });
  } catch (e) {
    return false;
  }
  return data;
}

/**
 * Decodes a packet encoded in a base64 string
 *
 * @param {String} base64 encoded message
 * @return {Object} with `type` and `data` (if any)
 */

exports.decodeBase64Packet = function(msg, binaryType) {
  var type = packetslist[msg.charAt(0)];
  if (!base64encoder) {
    return { type: type, data: { base64: true, data: msg.substr(1) } };
  }

  var data = base64encoder.decode(msg.substr(1));

  if (binaryType === 'blob' && Blob) {
    data = new Blob([data]);
  }

  return { type: type, data: data };
};

/**
 * Encodes multiple messages (payload).
 *
 *     <length>:data
 *
 * Example:
 *
 *     11:hello world2:hi
 *
 * If any contents are binary, they will be encoded as base64 strings. Base64
 * encoded strings are marked with a b before the length specifier
 *
 * @param {Array} packets
 * @api private
 */

exports.encodePayload = function (packets, supportsBinary, callback) {
  if (typeof supportsBinary === 'function') {
    callback = supportsBinary;
    supportsBinary = null;
  }

  var isBinary = hasBinary(packets);

  if (supportsBinary && isBinary) {
    if (Blob && !dontSendBlobs) {
      return exports.encodePayloadAsBlob(packets, callback);
    }

    return exports.encodePayloadAsArrayBuffer(packets, callback);
  }

  if (!packets.length) {
    return callback('0:');
  }

  function setLengthHeader(message) {
    return message.length + ':' + message;
  }

  function encodeOne(packet, doneCallback) {
    exports.encodePacket(packet, !isBinary ? false : supportsBinary, false, function(message) {
      doneCallback(null, setLengthHeader(message));
    });
  }

  map(packets, encodeOne, function(err, results) {
    return callback(results.join(''));
  });
};

/**
 * Async array map using after
 */

function map(ary, each, done) {
  var result = new Array(ary.length);
  var next = after(ary.length, done);

  var eachWithIndex = function(i, el, cb) {
    each(el, function(error, msg) {
      result[i] = msg;
      cb(error, result);
    });
  };

  for (var i = 0; i < ary.length; i++) {
    eachWithIndex(i, ary[i], next);
  }
}

/*
 * Decodes data when a payload is maybe expected. Possible binary contents are
 * decoded from their base64 representation
 *
 * @param {String} data, callback method
 * @api public
 */

exports.decodePayload = function (data, binaryType, callback) {
  if (typeof data !== 'string') {
    return exports.decodePayloadAsBinary(data, binaryType, callback);
  }

  if (typeof binaryType === 'function') {
    callback = binaryType;
    binaryType = null;
  }

  var packet;
  if (data === '') {
    // parser error - ignoring payload
    return callback(err, 0, 1);
  }

  var length = '', n, msg;

  for (var i = 0, l = data.length; i < l; i++) {
    var chr = data.charAt(i);

    if (chr !== ':') {
      length += chr;
      continue;
    }

    if (length === '' || (length != (n = Number(length)))) {
      // parser error - ignoring payload
      return callback(err, 0, 1);
    }

    msg = data.substr(i + 1, n);

    if (length != msg.length) {
      // parser error - ignoring payload
      return callback(err, 0, 1);
    }

    if (msg.length) {
      packet = exports.decodePacket(msg, binaryType, false);

      if (err.type === packet.type && err.data === packet.data) {
        // parser error in individual packet - ignoring payload
        return callback(err, 0, 1);
      }

      var ret = callback(packet, i + n, l);
      if (false === ret) return;
    }

    // advance cursor
    i += n;
    length = '';
  }

  if (length !== '') {
    // parser error - ignoring payload
    return callback(err, 0, 1);
  }

};

/**
 * Encodes multiple messages (payload) as binary.
 *
 * <1 = binary, 0 = string><number from 0-9><number from 0-9>[...]<number
 * 255><data>
 *
 * Example:
 * 1 3 255 1 2 3, if the binary contents are interpreted as 8 bit integers
 *
 * @param {Array} packets
 * @return {ArrayBuffer} encoded payload
 * @api private
 */

exports.encodePayloadAsArrayBuffer = function(packets, callback) {
  if (!packets.length) {
    return callback(new ArrayBuffer(0));
  }

  function encodeOne(packet, doneCallback) {
    exports.encodePacket(packet, true, true, function(data) {
      return doneCallback(null, data);
    });
  }

  map(packets, encodeOne, function(err, encodedPackets) {
    var totalLength = encodedPackets.reduce(function(acc, p) {
      var len;
      if (typeof p === 'string'){
        len = p.length;
      } else {
        len = p.byteLength;
      }
      return acc + len.toString().length + len + 2; // string/binary identifier + separator = 2
    }, 0);

    var resultArray = new Uint8Array(totalLength);

    var bufferIndex = 0;
    encodedPackets.forEach(function(p) {
      var isString = typeof p === 'string';
      var ab = p;
      if (isString) {
        var view = new Uint8Array(p.length);
        for (var i = 0; i < p.length; i++) {
          view[i] = p.charCodeAt(i);
        }
        ab = view.buffer;
      }

      if (isString) { // not true binary
        resultArray[bufferIndex++] = 0;
      } else { // true binary
        resultArray[bufferIndex++] = 1;
      }

      var lenStr = ab.byteLength.toString();
      for (var i = 0; i < lenStr.length; i++) {
        resultArray[bufferIndex++] = parseInt(lenStr[i]);
      }
      resultArray[bufferIndex++] = 255;

      var view = new Uint8Array(ab);
      for (var i = 0; i < view.length; i++) {
        resultArray[bufferIndex++] = view[i];
      }
    });

    return callback(resultArray.buffer);
  });
};

/**
 * Encode as Blob
 */

exports.encodePayloadAsBlob = function(packets, callback) {
  function encodeOne(packet, doneCallback) {
    exports.encodePacket(packet, true, true, function(encoded) {
      var binaryIdentifier = new Uint8Array(1);
      binaryIdentifier[0] = 1;
      if (typeof encoded === 'string') {
        var view = new Uint8Array(encoded.length);
        for (var i = 0; i < encoded.length; i++) {
          view[i] = encoded.charCodeAt(i);
        }
        encoded = view.buffer;
        binaryIdentifier[0] = 0;
      }

      var len = (encoded instanceof ArrayBuffer)
        ? encoded.byteLength
        : encoded.size;

      var lenStr = len.toString();
      var lengthAry = new Uint8Array(lenStr.length + 1);
      for (var i = 0; i < lenStr.length; i++) {
        lengthAry[i] = parseInt(lenStr[i]);
      }
      lengthAry[lenStr.length] = 255;

      if (Blob) {
        var blob = new Blob([binaryIdentifier.buffer, lengthAry.buffer, encoded]);
        doneCallback(null, blob);
      }
    });
  }

  map(packets, encodeOne, function(err, results) {
    return callback(new Blob(results));
  });
};

/*
 * Decodes data when a payload is maybe expected. Strings are decoded by
 * interpreting each byte as a key code for entries marked to start with 0. See
 * description of encodePayloadAsBinary
 *
 * @param {ArrayBuffer} data, callback method
 * @api public
 */

exports.decodePayloadAsBinary = function (data, binaryType, callback) {
  if (typeof binaryType === 'function') {
    callback = binaryType;
    binaryType = null;
  }

  var bufferTail = data;
  var buffers = [];

  while (bufferTail.byteLength > 0) {
    var tailArray = new Uint8Array(bufferTail);
    var isString = tailArray[0] === 0;
    var msgLength = '';

    for (var i = 1; ; i++) {
      if (tailArray[i] === 255) break;

      // 310 = char length of Number.MAX_VALUE
      if (msgLength.length > 310) {
        return callback(err, 0, 1);
      }

      msgLength += tailArray[i];
    }

    bufferTail = sliceBuffer(bufferTail, 2 + msgLength.length);
    msgLength = parseInt(msgLength);

    var msg = sliceBuffer(bufferTail, 0, msgLength);
    if (isString) {
      try {
        msg = String.fromCharCode.apply(null, new Uint8Array(msg));
      } catch (e) {
        // iPhone Safari doesn't let you apply to typed arrays
        var typed = new Uint8Array(msg);
        msg = '';
        for (var i = 0; i < typed.length; i++) {
          msg += String.fromCharCode(typed[i]);
        }
      }
    }

    buffers.push(msg);
    bufferTail = sliceBuffer(bufferTail, msgLength);
  }

  var total = buffers.length;
  buffers.forEach(function(buffer, i) {
    callback(exports.decodePacket(buffer, binaryType, true), i, total);
  });
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"./keys":35,"./utf8":36,"after":1,"arraybuffer.slice":2,"base64-arraybuffer":14,"blob":16,"has-binary2":40}],35:[function(require,module,exports){

/**
 * Gets the keys for an object.
 *
 * @return {Array} keys
 * @api private
 */

module.exports = Object.keys || function keys (obj){
  var arr = [];
  var has = Object.prototype.hasOwnProperty;

  for (var i in obj) {
    if (has.call(obj, i)) {
      arr.push(i);
    }
  }
  return arr;
};

},{}],36:[function(require,module,exports){
(function (global){
/*! https://mths.be/utf8js v2.1.2 by @mathias */
;(function(root) {

	// Detect free variables `exports`
	var freeExports = typeof exports == 'object' && exports;

	// Detect free variable `module`
	var freeModule = typeof module == 'object' && module &&
		module.exports == freeExports && module;

	// Detect free variable `global`, from Node.js or Browserified code,
	// and use it as `root`
	var freeGlobal = typeof global == 'object' && global;
	if (freeGlobal.global === freeGlobal || freeGlobal.window === freeGlobal) {
		root = freeGlobal;
	}

	/*--------------------------------------------------------------------------*/

	var stringFromCharCode = String.fromCharCode;

	// Taken from https://mths.be/punycode
	function ucs2decode(string) {
		var output = [];
		var counter = 0;
		var length = string.length;
		var value;
		var extra;
		while (counter < length) {
			value = string.charCodeAt(counter++);
			if (value >= 0xD800 && value <= 0xDBFF && counter < length) {
				// high surrogate, and there is a next character
				extra = string.charCodeAt(counter++);
				if ((extra & 0xFC00) == 0xDC00) { // low surrogate
					output.push(((value & 0x3FF) << 10) + (extra & 0x3FF) + 0x10000);
				} else {
					// unmatched surrogate; only append this code unit, in case the next
					// code unit is the high surrogate of a surrogate pair
					output.push(value);
					counter--;
				}
			} else {
				output.push(value);
			}
		}
		return output;
	}

	// Taken from https://mths.be/punycode
	function ucs2encode(array) {
		var length = array.length;
		var index = -1;
		var value;
		var output = '';
		while (++index < length) {
			value = array[index];
			if (value > 0xFFFF) {
				value -= 0x10000;
				output += stringFromCharCode(value >>> 10 & 0x3FF | 0xD800);
				value = 0xDC00 | value & 0x3FF;
			}
			output += stringFromCharCode(value);
		}
		return output;
	}

	function checkScalarValue(codePoint, strict) {
		if (codePoint >= 0xD800 && codePoint <= 0xDFFF) {
			if (strict) {
				throw Error(
					'Lone surrogate U+' + codePoint.toString(16).toUpperCase() +
					' is not a scalar value'
				);
			}
			return false;
		}
		return true;
	}
	/*--------------------------------------------------------------------------*/

	function createByte(codePoint, shift) {
		return stringFromCharCode(((codePoint >> shift) & 0x3F) | 0x80);
	}

	function encodeCodePoint(codePoint, strict) {
		if ((codePoint & 0xFFFFFF80) == 0) { // 1-byte sequence
			return stringFromCharCode(codePoint);
		}
		var symbol = '';
		if ((codePoint & 0xFFFFF800) == 0) { // 2-byte sequence
			symbol = stringFromCharCode(((codePoint >> 6) & 0x1F) | 0xC0);
		}
		else if ((codePoint & 0xFFFF0000) == 0) { // 3-byte sequence
			if (!checkScalarValue(codePoint, strict)) {
				codePoint = 0xFFFD;
			}
			symbol = stringFromCharCode(((codePoint >> 12) & 0x0F) | 0xE0);
			symbol += createByte(codePoint, 6);
		}
		else if ((codePoint & 0xFFE00000) == 0) { // 4-byte sequence
			symbol = stringFromCharCode(((codePoint >> 18) & 0x07) | 0xF0);
			symbol += createByte(codePoint, 12);
			symbol += createByte(codePoint, 6);
		}
		symbol += stringFromCharCode((codePoint & 0x3F) | 0x80);
		return symbol;
	}

	function utf8encode(string, opts) {
		opts = opts || {};
		var strict = false !== opts.strict;

		var codePoints = ucs2decode(string);
		var length = codePoints.length;
		var index = -1;
		var codePoint;
		var byteString = '';
		while (++index < length) {
			codePoint = codePoints[index];
			byteString += encodeCodePoint(codePoint, strict);
		}
		return byteString;
	}

	/*--------------------------------------------------------------------------*/

	function readContinuationByte() {
		if (byteIndex >= byteCount) {
			throw Error('Invalid byte index');
		}

		var continuationByte = byteArray[byteIndex] & 0xFF;
		byteIndex++;

		if ((continuationByte & 0xC0) == 0x80) {
			return continuationByte & 0x3F;
		}

		// If we end up here, it’s not a continuation byte
		throw Error('Invalid continuation byte');
	}

	function decodeSymbol(strict) {
		var byte1;
		var byte2;
		var byte3;
		var byte4;
		var codePoint;

		if (byteIndex > byteCount) {
			throw Error('Invalid byte index');
		}

		if (byteIndex == byteCount) {
			return false;
		}

		// Read first byte
		byte1 = byteArray[byteIndex] & 0xFF;
		byteIndex++;

		// 1-byte sequence (no continuation bytes)
		if ((byte1 & 0x80) == 0) {
			return byte1;
		}

		// 2-byte sequence
		if ((byte1 & 0xE0) == 0xC0) {
			byte2 = readContinuationByte();
			codePoint = ((byte1 & 0x1F) << 6) | byte2;
			if (codePoint >= 0x80) {
				return codePoint;
			} else {
				throw Error('Invalid continuation byte');
			}
		}

		// 3-byte sequence (may include unpaired surrogates)
		if ((byte1 & 0xF0) == 0xE0) {
			byte2 = readContinuationByte();
			byte3 = readContinuationByte();
			codePoint = ((byte1 & 0x0F) << 12) | (byte2 << 6) | byte3;
			if (codePoint >= 0x0800) {
				return checkScalarValue(codePoint, strict) ? codePoint : 0xFFFD;
			} else {
				throw Error('Invalid continuation byte');
			}
		}

		// 4-byte sequence
		if ((byte1 & 0xF8) == 0xF0) {
			byte2 = readContinuationByte();
			byte3 = readContinuationByte();
			byte4 = readContinuationByte();
			codePoint = ((byte1 & 0x07) << 0x12) | (byte2 << 0x0C) |
				(byte3 << 0x06) | byte4;
			if (codePoint >= 0x010000 && codePoint <= 0x10FFFF) {
				return codePoint;
			}
		}

		throw Error('Invalid UTF-8 detected');
	}

	var byteArray;
	var byteCount;
	var byteIndex;
	function utf8decode(byteString, opts) {
		opts = opts || {};
		var strict = false !== opts.strict;

		byteArray = ucs2decode(byteString);
		byteCount = byteArray.length;
		byteIndex = 0;
		var codePoints = [];
		var tmp;
		while ((tmp = decodeSymbol(strict)) !== false) {
			codePoints.push(tmp);
		}
		return ucs2encode(codePoints);
	}

	/*--------------------------------------------------------------------------*/

	var utf8 = {
		'version': '2.1.2',
		'encode': utf8encode,
		'decode': utf8decode
	};

	// Some AMD build optimizers, like r.js, check for specific condition patterns
	// like the following:
	if (
		typeof define == 'function' &&
		typeof define.amd == 'object' &&
		define.amd
	) {
		define(function() {
			return utf8;
		});
	}	else if (freeExports && !freeExports.nodeType) {
		if (freeModule) { // in Node.js or RingoJS v0.8.0+
			freeModule.exports = utf8;
		} else { // in Narwhal or RingoJS v0.7.0-
			var object = {};
			var hasOwnProperty = object.hasOwnProperty;
			for (var key in utf8) {
				hasOwnProperty.call(utf8, key) && (freeExports[key] = utf8[key]);
			}
		}
	} else { // in Rhino or a web browser
		root.utf8 = utf8;
	}

}(this));

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{}],37:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

function EventEmitter() {
  this._events = this._events || {};
  this._maxListeners = this._maxListeners || undefined;
}
module.exports = EventEmitter;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
EventEmitter.defaultMaxListeners = 10;

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function(n) {
  if (!isNumber(n) || n < 0 || isNaN(n))
    throw TypeError('n must be a positive number');
  this._maxListeners = n;
  return this;
};

EventEmitter.prototype.emit = function(type) {
  var er, handler, len, args, i, listeners;

  if (!this._events)
    this._events = {};

  // If there is no 'error' event listener then throw.
  if (type === 'error') {
    if (!this._events.error ||
        (isObject(this._events.error) && !this._events.error.length)) {
      er = arguments[1];
      if (er instanceof Error) {
        throw er; // Unhandled 'error' event
      } else {
        // At least give some kind of context to the user
        var err = new Error('Uncaught, unspecified "error" event. (' + er + ')');
        err.context = er;
        throw err;
      }
    }
  }

  handler = this._events[type];

  if (isUndefined(handler))
    return false;

  if (isFunction(handler)) {
    switch (arguments.length) {
      // fast cases
      case 1:
        handler.call(this);
        break;
      case 2:
        handler.call(this, arguments[1]);
        break;
      case 3:
        handler.call(this, arguments[1], arguments[2]);
        break;
      // slower
      default:
        args = Array.prototype.slice.call(arguments, 1);
        handler.apply(this, args);
    }
  } else if (isObject(handler)) {
    args = Array.prototype.slice.call(arguments, 1);
    listeners = handler.slice();
    len = listeners.length;
    for (i = 0; i < len; i++)
      listeners[i].apply(this, args);
  }

  return true;
};

EventEmitter.prototype.addListener = function(type, listener) {
  var m;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events)
    this._events = {};

  // To avoid recursion in the case that type === "newListener"! Before
  // adding it to the listeners, first emit "newListener".
  if (this._events.newListener)
    this.emit('newListener', type,
              isFunction(listener.listener) ?
              listener.listener : listener);

  if (!this._events[type])
    // Optimize the case of one listener. Don't need the extra array object.
    this._events[type] = listener;
  else if (isObject(this._events[type]))
    // If we've already got an array, just append.
    this._events[type].push(listener);
  else
    // Adding the second element, need to change to array.
    this._events[type] = [this._events[type], listener];

  // Check for listener leak
  if (isObject(this._events[type]) && !this._events[type].warned) {
    if (!isUndefined(this._maxListeners)) {
      m = this._maxListeners;
    } else {
      m = EventEmitter.defaultMaxListeners;
    }

    if (m && m > 0 && this._events[type].length > m) {
      this._events[type].warned = true;
      console.error('(node) warning: possible EventEmitter memory ' +
                    'leak detected. %d listeners added. ' +
                    'Use emitter.setMaxListeners() to increase limit.',
                    this._events[type].length);
      if (typeof console.trace === 'function') {
        // not supported in IE 10
        console.trace();
      }
    }
  }

  return this;
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function(type, listener) {
  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  var fired = false;

  function g() {
    this.removeListener(type, g);

    if (!fired) {
      fired = true;
      listener.apply(this, arguments);
    }
  }

  g.listener = listener;
  this.on(type, g);

  return this;
};

// emits a 'removeListener' event iff the listener was removed
EventEmitter.prototype.removeListener = function(type, listener) {
  var list, position, length, i;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events || !this._events[type])
    return this;

  list = this._events[type];
  length = list.length;
  position = -1;

  if (list === listener ||
      (isFunction(list.listener) && list.listener === listener)) {
    delete this._events[type];
    if (this._events.removeListener)
      this.emit('removeListener', type, listener);

  } else if (isObject(list)) {
    for (i = length; i-- > 0;) {
      if (list[i] === listener ||
          (list[i].listener && list[i].listener === listener)) {
        position = i;
        break;
      }
    }

    if (position < 0)
      return this;

    if (list.length === 1) {
      list.length = 0;
      delete this._events[type];
    } else {
      list.splice(position, 1);
    }

    if (this._events.removeListener)
      this.emit('removeListener', type, listener);
  }

  return this;
};

EventEmitter.prototype.removeAllListeners = function(type) {
  var key, listeners;

  if (!this._events)
    return this;

  // not listening for removeListener, no need to emit
  if (!this._events.removeListener) {
    if (arguments.length === 0)
      this._events = {};
    else if (this._events[type])
      delete this._events[type];
    return this;
  }

  // emit removeListener for all listeners on all events
  if (arguments.length === 0) {
    for (key in this._events) {
      if (key === 'removeListener') continue;
      this.removeAllListeners(key);
    }
    this.removeAllListeners('removeListener');
    this._events = {};
    return this;
  }

  listeners = this._events[type];

  if (isFunction(listeners)) {
    this.removeListener(type, listeners);
  } else if (listeners) {
    // LIFO order
    while (listeners.length)
      this.removeListener(type, listeners[listeners.length - 1]);
  }
  delete this._events[type];

  return this;
};

EventEmitter.prototype.listeners = function(type) {
  var ret;
  if (!this._events || !this._events[type])
    ret = [];
  else if (isFunction(this._events[type]))
    ret = [this._events[type]];
  else
    ret = this._events[type].slice();
  return ret;
};

EventEmitter.prototype.listenerCount = function(type) {
  if (this._events) {
    var evlistener = this._events[type];

    if (isFunction(evlistener))
      return 1;
    else if (evlistener)
      return evlistener.length;
  }
  return 0;
};

EventEmitter.listenerCount = function(emitter, type) {
  return emitter.listenerCount(type);
};

function isFunction(arg) {
  return typeof arg === 'function';
}

function isNumber(arg) {
  return typeof arg === 'number';
}

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}

function isUndefined(arg) {
  return arg === void 0;
}

},{}],38:[function(require,module,exports){
var isFunction = require('is-function')

module.exports = forEach

var toString = Object.prototype.toString
var hasOwnProperty = Object.prototype.hasOwnProperty

function forEach(list, iterator, context) {
    if (!isFunction(iterator)) {
        throw new TypeError('iterator must be a function')
    }

    if (arguments.length < 3) {
        context = this
    }
    
    if (toString.call(list) === '[object Array]')
        forEachArray(list, iterator, context)
    else if (typeof list === 'string')
        forEachString(list, iterator, context)
    else
        forEachObject(list, iterator, context)
}

function forEachArray(array, iterator, context) {
    for (var i = 0, len = array.length; i < len; i++) {
        if (hasOwnProperty.call(array, i)) {
            iterator.call(context, array[i], i, array)
        }
    }
}

function forEachString(string, iterator, context) {
    for (var i = 0, len = string.length; i < len; i++) {
        // no such thing as a sparse string.
        iterator.call(context, string.charAt(i), i, string)
    }
}

function forEachObject(object, iterator, context) {
    for (var k in object) {
        if (hasOwnProperty.call(object, k)) {
            iterator.call(context, object[k], k, object)
        }
    }
}

},{"is-function":45}],39:[function(require,module,exports){
(function (global){
var win;

if (typeof window !== "undefined") {
    win = window;
} else if (typeof global !== "undefined") {
    win = global;
} else if (typeof self !== "undefined"){
    win = self;
} else {
    win = {};
}

module.exports = win;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{}],40:[function(require,module,exports){
(function (global){
/* global Blob File */

/*
 * Module requirements.
 */

var isArray = require('isarray');

var toString = Object.prototype.toString;
var withNativeBlob = typeof global.Blob === 'function' || toString.call(global.Blob) === '[object BlobConstructor]';
var withNativeFile = typeof global.File === 'function' || toString.call(global.File) === '[object FileConstructor]';

/**
 * Module exports.
 */

module.exports = hasBinary;

/**
 * Checks for binary data.
 *
 * Supports Buffer, ArrayBuffer, Blob and File.
 *
 * @param {Object} anything
 * @api public
 */

function hasBinary (obj) {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  if (isArray(obj)) {
    for (var i = 0, l = obj.length; i < l; i++) {
      if (hasBinary(obj[i])) {
        return true;
      }
    }
    return false;
  }

  if ((typeof global.Buffer === 'function' && global.Buffer.isBuffer && global.Buffer.isBuffer(obj)) ||
     (typeof global.ArrayBuffer === 'function' && obj instanceof ArrayBuffer) ||
     (withNativeBlob && obj instanceof Blob) ||
     (withNativeFile && obj instanceof File)
    ) {
    return true;
  }

  // see: https://github.com/Automattic/has-binary/pull/4
  if (obj.toJSON && typeof obj.toJSON === 'function' && arguments.length === 1) {
    return hasBinary(obj.toJSON(), true);
  }

  for (var key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key) && hasBinary(obj[key])) {
      return true;
    }
  }

  return false;
}

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"isarray":41}],41:[function(require,module,exports){
var toString = {}.toString;

module.exports = Array.isArray || function (arr) {
  return toString.call(arr) == '[object Array]';
};

},{}],42:[function(require,module,exports){

/**
 * Module exports.
 *
 * Logic borrowed from Modernizr:
 *
 *   - https://github.com/Modernizr/Modernizr/blob/master/feature-detects/cors.js
 */

try {
  module.exports = typeof XMLHttpRequest !== 'undefined' &&
    'withCredentials' in new XMLHttpRequest();
} catch (err) {
  // if XMLHttp support is disabled in IE then it will throw
  // when trying to create
  module.exports = false;
}

},{}],43:[function(require,module,exports){
exports.read = function (buffer, offset, isLE, mLen, nBytes) {
  var e, m
  var eLen = nBytes * 8 - mLen - 1
  var eMax = (1 << eLen) - 1
  var eBias = eMax >> 1
  var nBits = -7
  var i = isLE ? (nBytes - 1) : 0
  var d = isLE ? -1 : 1
  var s = buffer[offset + i]

  i += d

  e = s & ((1 << (-nBits)) - 1)
  s >>= (-nBits)
  nBits += eLen
  for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8) {}

  m = e & ((1 << (-nBits)) - 1)
  e >>= (-nBits)
  nBits += mLen
  for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8) {}

  if (e === 0) {
    e = 1 - eBias
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity)
  } else {
    m = m + Math.pow(2, mLen)
    e = e - eBias
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen)
}

exports.write = function (buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c
  var eLen = nBytes * 8 - mLen - 1
  var eMax = (1 << eLen) - 1
  var eBias = eMax >> 1
  var rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0)
  var i = isLE ? 0 : (nBytes - 1)
  var d = isLE ? 1 : -1
  var s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0

  value = Math.abs(value)

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0
    e = eMax
  } else {
    e = Math.floor(Math.log(value) / Math.LN2)
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--
      c *= 2
    }
    if (e + eBias >= 1) {
      value += rt / c
    } else {
      value += rt * Math.pow(2, 1 - eBias)
    }
    if (value * c >= 2) {
      e++
      c /= 2
    }

    if (e + eBias >= eMax) {
      m = 0
      e = eMax
    } else if (e + eBias >= 1) {
      m = (value * c - 1) * Math.pow(2, mLen)
      e = e + eBias
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen)
      e = 0
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8) {}

  e = (e << mLen) | m
  eLen += mLen
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8) {}

  buffer[offset + i - d] |= s * 128
}

},{}],44:[function(require,module,exports){

var indexOf = [].indexOf;

module.exports = function(arr, obj){
  if (indexOf) return arr.indexOf(obj);
  for (var i = 0; i < arr.length; ++i) {
    if (arr[i] === obj) return i;
  }
  return -1;
};
},{}],45:[function(require,module,exports){
module.exports = isFunction

var toString = Object.prototype.toString

function isFunction (fn) {
  var string = toString.call(fn)
  return string === '[object Function]' ||
    (typeof fn === 'function' && string !== '[object RegExp]') ||
    (typeof window !== 'undefined' &&
     // IE8 and below
     (fn === window.setTimeout ||
      fn === window.alert ||
      fn === window.confirm ||
      fn === window.prompt))
};

},{}],46:[function(require,module,exports){
var getNative = require('./_getNative'),
    root = require('./_root');

/* Built-in method references that are verified to be native. */
var DataView = getNative(root, 'DataView');

module.exports = DataView;

},{"./_getNative":105,"./_root":144}],47:[function(require,module,exports){
var hashClear = require('./_hashClear'),
    hashDelete = require('./_hashDelete'),
    hashGet = require('./_hashGet'),
    hashHas = require('./_hashHas'),
    hashSet = require('./_hashSet');

/**
 * Creates a hash object.
 *
 * @private
 * @constructor
 * @param {Array} [entries] The key-value pairs to cache.
 */
function Hash(entries) {
  var index = -1,
      length = entries == null ? 0 : entries.length;

  this.clear();
  while (++index < length) {
    var entry = entries[index];
    this.set(entry[0], entry[1]);
  }
}

// Add methods to `Hash`.
Hash.prototype.clear = hashClear;
Hash.prototype['delete'] = hashDelete;
Hash.prototype.get = hashGet;
Hash.prototype.has = hashHas;
Hash.prototype.set = hashSet;

module.exports = Hash;

},{"./_hashClear":113,"./_hashDelete":114,"./_hashGet":115,"./_hashHas":116,"./_hashSet":117}],48:[function(require,module,exports){
var listCacheClear = require('./_listCacheClear'),
    listCacheDelete = require('./_listCacheDelete'),
    listCacheGet = require('./_listCacheGet'),
    listCacheHas = require('./_listCacheHas'),
    listCacheSet = require('./_listCacheSet');

/**
 * Creates an list cache object.
 *
 * @private
 * @constructor
 * @param {Array} [entries] The key-value pairs to cache.
 */
function ListCache(entries) {
  var index = -1,
      length = entries == null ? 0 : entries.length;

  this.clear();
  while (++index < length) {
    var entry = entries[index];
    this.set(entry[0], entry[1]);
  }
}

// Add methods to `ListCache`.
ListCache.prototype.clear = listCacheClear;
ListCache.prototype['delete'] = listCacheDelete;
ListCache.prototype.get = listCacheGet;
ListCache.prototype.has = listCacheHas;
ListCache.prototype.set = listCacheSet;

module.exports = ListCache;

},{"./_listCacheClear":126,"./_listCacheDelete":127,"./_listCacheGet":128,"./_listCacheHas":129,"./_listCacheSet":130}],49:[function(require,module,exports){
var getNative = require('./_getNative'),
    root = require('./_root');

/* Built-in method references that are verified to be native. */
var Map = getNative(root, 'Map');

module.exports = Map;

},{"./_getNative":105,"./_root":144}],50:[function(require,module,exports){
var mapCacheClear = require('./_mapCacheClear'),
    mapCacheDelete = require('./_mapCacheDelete'),
    mapCacheGet = require('./_mapCacheGet'),
    mapCacheHas = require('./_mapCacheHas'),
    mapCacheSet = require('./_mapCacheSet');

/**
 * Creates a map cache object to store key-value pairs.
 *
 * @private
 * @constructor
 * @param {Array} [entries] The key-value pairs to cache.
 */
function MapCache(entries) {
  var index = -1,
      length = entries == null ? 0 : entries.length;

  this.clear();
  while (++index < length) {
    var entry = entries[index];
    this.set(entry[0], entry[1]);
  }
}

// Add methods to `MapCache`.
MapCache.prototype.clear = mapCacheClear;
MapCache.prototype['delete'] = mapCacheDelete;
MapCache.prototype.get = mapCacheGet;
MapCache.prototype.has = mapCacheHas;
MapCache.prototype.set = mapCacheSet;

module.exports = MapCache;

},{"./_mapCacheClear":131,"./_mapCacheDelete":132,"./_mapCacheGet":133,"./_mapCacheHas":134,"./_mapCacheSet":135}],51:[function(require,module,exports){
var getNative = require('./_getNative'),
    root = require('./_root');

/* Built-in method references that are verified to be native. */
var Promise = getNative(root, 'Promise');

module.exports = Promise;

},{"./_getNative":105,"./_root":144}],52:[function(require,module,exports){
var getNative = require('./_getNative'),
    root = require('./_root');

/* Built-in method references that are verified to be native. */
var Set = getNative(root, 'Set');

module.exports = Set;

},{"./_getNative":105,"./_root":144}],53:[function(require,module,exports){
var ListCache = require('./_ListCache'),
    stackClear = require('./_stackClear'),
    stackDelete = require('./_stackDelete'),
    stackGet = require('./_stackGet'),
    stackHas = require('./_stackHas'),
    stackSet = require('./_stackSet');

/**
 * Creates a stack cache object to store key-value pairs.
 *
 * @private
 * @constructor
 * @param {Array} [entries] The key-value pairs to cache.
 */
function Stack(entries) {
  var data = this.__data__ = new ListCache(entries);
  this.size = data.size;
}

// Add methods to `Stack`.
Stack.prototype.clear = stackClear;
Stack.prototype['delete'] = stackDelete;
Stack.prototype.get = stackGet;
Stack.prototype.has = stackHas;
Stack.prototype.set = stackSet;

module.exports = Stack;

},{"./_ListCache":48,"./_stackClear":146,"./_stackDelete":147,"./_stackGet":148,"./_stackHas":149,"./_stackSet":150}],54:[function(require,module,exports){
var root = require('./_root');

/** Built-in value references. */
var Symbol = root.Symbol;

module.exports = Symbol;

},{"./_root":144}],55:[function(require,module,exports){
var root = require('./_root');

/** Built-in value references. */
var Uint8Array = root.Uint8Array;

module.exports = Uint8Array;

},{"./_root":144}],56:[function(require,module,exports){
var getNative = require('./_getNative'),
    root = require('./_root');

/* Built-in method references that are verified to be native. */
var WeakMap = getNative(root, 'WeakMap');

module.exports = WeakMap;

},{"./_getNative":105,"./_root":144}],57:[function(require,module,exports){
/**
 * Adds the key-value `pair` to `map`.
 *
 * @private
 * @param {Object} map The map to modify.
 * @param {Array} pair The key-value pair to add.
 * @returns {Object} Returns `map`.
 */
function addMapEntry(map, pair) {
  // Don't return `map.set` because it's not chainable in IE 11.
  map.set(pair[0], pair[1]);
  return map;
}

module.exports = addMapEntry;

},{}],58:[function(require,module,exports){
/**
 * Adds `value` to `set`.
 *
 * @private
 * @param {Object} set The set to modify.
 * @param {*} value The value to add.
 * @returns {Object} Returns `set`.
 */
function addSetEntry(set, value) {
  // Don't return `set.add` because it's not chainable in IE 11.
  set.add(value);
  return set;
}

module.exports = addSetEntry;

},{}],59:[function(require,module,exports){
/**
 * A specialized version of `_.forEach` for arrays without support for
 * iteratee shorthands.
 *
 * @private
 * @param {Array} [array] The array to iterate over.
 * @param {Function} iteratee The function invoked per iteration.
 * @returns {Array} Returns `array`.
 */
function arrayEach(array, iteratee) {
  var index = -1,
      length = array == null ? 0 : array.length;

  while (++index < length) {
    if (iteratee(array[index], index, array) === false) {
      break;
    }
  }
  return array;
}

module.exports = arrayEach;

},{}],60:[function(require,module,exports){
/**
 * A specialized version of `_.filter` for arrays without support for
 * iteratee shorthands.
 *
 * @private
 * @param {Array} [array] The array to iterate over.
 * @param {Function} predicate The function invoked per iteration.
 * @returns {Array} Returns the new filtered array.
 */
function arrayFilter(array, predicate) {
  var index = -1,
      length = array == null ? 0 : array.length,
      resIndex = 0,
      result = [];

  while (++index < length) {
    var value = array[index];
    if (predicate(value, index, array)) {
      result[resIndex++] = value;
    }
  }
  return result;
}

module.exports = arrayFilter;

},{}],61:[function(require,module,exports){
var baseTimes = require('./_baseTimes'),
    isArguments = require('./isArguments'),
    isArray = require('./isArray'),
    isBuffer = require('./isBuffer'),
    isIndex = require('./_isIndex'),
    isTypedArray = require('./isTypedArray');

/** Used for built-in method references. */
var objectProto = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * Creates an array of the enumerable property names of the array-like `value`.
 *
 * @private
 * @param {*} value The value to query.
 * @param {boolean} inherited Specify returning inherited property names.
 * @returns {Array} Returns the array of property names.
 */
function arrayLikeKeys(value, inherited) {
  var isArr = isArray(value),
      isArg = !isArr && isArguments(value),
      isBuff = !isArr && !isArg && isBuffer(value),
      isType = !isArr && !isArg && !isBuff && isTypedArray(value),
      skipIndexes = isArr || isArg || isBuff || isType,
      result = skipIndexes ? baseTimes(value.length, String) : [],
      length = result.length;

  for (var key in value) {
    if ((inherited || hasOwnProperty.call(value, key)) &&
        !(skipIndexes && (
           // Safari 9 has enumerable `arguments.length` in strict mode.
           key == 'length' ||
           // Node.js 0.10 has enumerable non-index properties on buffers.
           (isBuff && (key == 'offset' || key == 'parent')) ||
           // PhantomJS 2 has enumerable non-index properties on typed arrays.
           (isType && (key == 'buffer' || key == 'byteLength' || key == 'byteOffset')) ||
           // Skip index properties.
           isIndex(key, length)
        ))) {
      result.push(key);
    }
  }
  return result;
}

module.exports = arrayLikeKeys;

},{"./_baseTimes":83,"./_isIndex":121,"./isArguments":158,"./isArray":159,"./isBuffer":161,"./isTypedArray":167}],62:[function(require,module,exports){
/**
 * A specialized version of `_.map` for arrays without support for iteratee
 * shorthands.
 *
 * @private
 * @param {Array} [array] The array to iterate over.
 * @param {Function} iteratee The function invoked per iteration.
 * @returns {Array} Returns the new mapped array.
 */
function arrayMap(array, iteratee) {
  var index = -1,
      length = array == null ? 0 : array.length,
      result = Array(length);

  while (++index < length) {
    result[index] = iteratee(array[index], index, array);
  }
  return result;
}

module.exports = arrayMap;

},{}],63:[function(require,module,exports){
/**
 * Appends the elements of `values` to `array`.
 *
 * @private
 * @param {Array} array The array to modify.
 * @param {Array} values The values to append.
 * @returns {Array} Returns `array`.
 */
function arrayPush(array, values) {
  var index = -1,
      length = values.length,
      offset = array.length;

  while (++index < length) {
    array[offset + index] = values[index];
  }
  return array;
}

module.exports = arrayPush;

},{}],64:[function(require,module,exports){
/**
 * A specialized version of `_.reduce` for arrays without support for
 * iteratee shorthands.
 *
 * @private
 * @param {Array} [array] The array to iterate over.
 * @param {Function} iteratee The function invoked per iteration.
 * @param {*} [accumulator] The initial value.
 * @param {boolean} [initAccum] Specify using the first element of `array` as
 *  the initial value.
 * @returns {*} Returns the accumulated value.
 */
function arrayReduce(array, iteratee, accumulator, initAccum) {
  var index = -1,
      length = array == null ? 0 : array.length;

  if (initAccum && length) {
    accumulator = array[++index];
  }
  while (++index < length) {
    accumulator = iteratee(accumulator, array[index], index, array);
  }
  return accumulator;
}

module.exports = arrayReduce;

},{}],65:[function(require,module,exports){
var baseAssignValue = require('./_baseAssignValue'),
    eq = require('./eq');

/** Used for built-in method references. */
var objectProto = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * Assigns `value` to `key` of `object` if the existing value is not equivalent
 * using [`SameValueZero`](http://ecma-international.org/ecma-262/7.0/#sec-samevaluezero)
 * for equality comparisons.
 *
 * @private
 * @param {Object} object The object to modify.
 * @param {string} key The key of the property to assign.
 * @param {*} value The value to assign.
 */
function assignValue(object, key, value) {
  var objValue = object[key];
  if (!(hasOwnProperty.call(object, key) && eq(objValue, value)) ||
      (value === undefined && !(key in object))) {
    baseAssignValue(object, key, value);
  }
}

module.exports = assignValue;

},{"./_baseAssignValue":69,"./eq":156}],66:[function(require,module,exports){
var eq = require('./eq');

/**
 * Gets the index at which the `key` is found in `array` of key-value pairs.
 *
 * @private
 * @param {Array} array The array to inspect.
 * @param {*} key The key to search for.
 * @returns {number} Returns the index of the matched value, else `-1`.
 */
function assocIndexOf(array, key) {
  var length = array.length;
  while (length--) {
    if (eq(array[length][0], key)) {
      return length;
    }
  }
  return -1;
}

module.exports = assocIndexOf;

},{"./eq":156}],67:[function(require,module,exports){
var copyObject = require('./_copyObject'),
    keys = require('./keys');

/**
 * The base implementation of `_.assign` without support for multiple sources
 * or `customizer` functions.
 *
 * @private
 * @param {Object} object The destination object.
 * @param {Object} source The source object.
 * @returns {Object} Returns `object`.
 */
function baseAssign(object, source) {
  return object && copyObject(source, keys(source), object);
}

module.exports = baseAssign;

},{"./_copyObject":96,"./keys":168}],68:[function(require,module,exports){
var copyObject = require('./_copyObject'),
    keysIn = require('./keysIn');

/**
 * The base implementation of `_.assignIn` without support for multiple sources
 * or `customizer` functions.
 *
 * @private
 * @param {Object} object The destination object.
 * @param {Object} source The source object.
 * @returns {Object} Returns `object`.
 */
function baseAssignIn(object, source) {
  return object && copyObject(source, keysIn(source), object);
}

module.exports = baseAssignIn;

},{"./_copyObject":96,"./keysIn":169}],69:[function(require,module,exports){
var defineProperty = require('./_defineProperty');

/**
 * The base implementation of `assignValue` and `assignMergeValue` without
 * value checks.
 *
 * @private
 * @param {Object} object The object to modify.
 * @param {string} key The key of the property to assign.
 * @param {*} value The value to assign.
 */
function baseAssignValue(object, key, value) {
  if (key == '__proto__' && defineProperty) {
    defineProperty(object, key, {
      'configurable': true,
      'enumerable': true,
      'value': value,
      'writable': true
    });
  } else {
    object[key] = value;
  }
}

module.exports = baseAssignValue;

},{"./_defineProperty":100}],70:[function(require,module,exports){
var Stack = require('./_Stack'),
    arrayEach = require('./_arrayEach'),
    assignValue = require('./_assignValue'),
    baseAssign = require('./_baseAssign'),
    baseAssignIn = require('./_baseAssignIn'),
    cloneBuffer = require('./_cloneBuffer'),
    copyArray = require('./_copyArray'),
    copySymbols = require('./_copySymbols'),
    copySymbolsIn = require('./_copySymbolsIn'),
    getAllKeys = require('./_getAllKeys'),
    getAllKeysIn = require('./_getAllKeysIn'),
    getTag = require('./_getTag'),
    initCloneArray = require('./_initCloneArray'),
    initCloneByTag = require('./_initCloneByTag'),
    initCloneObject = require('./_initCloneObject'),
    isArray = require('./isArray'),
    isBuffer = require('./isBuffer'),
    isObject = require('./isObject'),
    keys = require('./keys');

/** Used to compose bitmasks for cloning. */
var CLONE_DEEP_FLAG = 1,
    CLONE_FLAT_FLAG = 2,
    CLONE_SYMBOLS_FLAG = 4;

/** `Object#toString` result references. */
var argsTag = '[object Arguments]',
    arrayTag = '[object Array]',
    boolTag = '[object Boolean]',
    dateTag = '[object Date]',
    errorTag = '[object Error]',
    funcTag = '[object Function]',
    genTag = '[object GeneratorFunction]',
    mapTag = '[object Map]',
    numberTag = '[object Number]',
    objectTag = '[object Object]',
    regexpTag = '[object RegExp]',
    setTag = '[object Set]',
    stringTag = '[object String]',
    symbolTag = '[object Symbol]',
    weakMapTag = '[object WeakMap]';

var arrayBufferTag = '[object ArrayBuffer]',
    dataViewTag = '[object DataView]',
    float32Tag = '[object Float32Array]',
    float64Tag = '[object Float64Array]',
    int8Tag = '[object Int8Array]',
    int16Tag = '[object Int16Array]',
    int32Tag = '[object Int32Array]',
    uint8Tag = '[object Uint8Array]',
    uint8ClampedTag = '[object Uint8ClampedArray]',
    uint16Tag = '[object Uint16Array]',
    uint32Tag = '[object Uint32Array]';

/** Used to identify `toStringTag` values supported by `_.clone`. */
var cloneableTags = {};
cloneableTags[argsTag] = cloneableTags[arrayTag] =
cloneableTags[arrayBufferTag] = cloneableTags[dataViewTag] =
cloneableTags[boolTag] = cloneableTags[dateTag] =
cloneableTags[float32Tag] = cloneableTags[float64Tag] =
cloneableTags[int8Tag] = cloneableTags[int16Tag] =
cloneableTags[int32Tag] = cloneableTags[mapTag] =
cloneableTags[numberTag] = cloneableTags[objectTag] =
cloneableTags[regexpTag] = cloneableTags[setTag] =
cloneableTags[stringTag] = cloneableTags[symbolTag] =
cloneableTags[uint8Tag] = cloneableTags[uint8ClampedTag] =
cloneableTags[uint16Tag] = cloneableTags[uint32Tag] = true;
cloneableTags[errorTag] = cloneableTags[funcTag] =
cloneableTags[weakMapTag] = false;

/**
 * The base implementation of `_.clone` and `_.cloneDeep` which tracks
 * traversed objects.
 *
 * @private
 * @param {*} value The value to clone.
 * @param {boolean} bitmask The bitmask flags.
 *  1 - Deep clone
 *  2 - Flatten inherited properties
 *  4 - Clone symbols
 * @param {Function} [customizer] The function to customize cloning.
 * @param {string} [key] The key of `value`.
 * @param {Object} [object] The parent object of `value`.
 * @param {Object} [stack] Tracks traversed objects and their clone counterparts.
 * @returns {*} Returns the cloned value.
 */
function baseClone(value, bitmask, customizer, key, object, stack) {
  var result,
      isDeep = bitmask & CLONE_DEEP_FLAG,
      isFlat = bitmask & CLONE_FLAT_FLAG,
      isFull = bitmask & CLONE_SYMBOLS_FLAG;

  if (customizer) {
    result = object ? customizer(value, key, object, stack) : customizer(value);
  }
  if (result !== undefined) {
    return result;
  }
  if (!isObject(value)) {
    return value;
  }
  var isArr = isArray(value);
  if (isArr) {
    result = initCloneArray(value);
    if (!isDeep) {
      return copyArray(value, result);
    }
  } else {
    var tag = getTag(value),
        isFunc = tag == funcTag || tag == genTag;

    if (isBuffer(value)) {
      return cloneBuffer(value, isDeep);
    }
    if (tag == objectTag || tag == argsTag || (isFunc && !object)) {
      result = (isFlat || isFunc) ? {} : initCloneObject(value);
      if (!isDeep) {
        return isFlat
          ? copySymbolsIn(value, baseAssignIn(result, value))
          : copySymbols(value, baseAssign(result, value));
      }
    } else {
      if (!cloneableTags[tag]) {
        return object ? value : {};
      }
      result = initCloneByTag(value, tag, baseClone, isDeep);
    }
  }
  // Check for circular references and return its corresponding clone.
  stack || (stack = new Stack);
  var stacked = stack.get(value);
  if (stacked) {
    return stacked;
  }
  stack.set(value, result);

  var keysFunc = isFull
    ? (isFlat ? getAllKeysIn : getAllKeys)
    : (isFlat ? keysIn : keys);

  var props = isArr ? undefined : keysFunc(value);
  arrayEach(props || value, function(subValue, key) {
    if (props) {
      key = subValue;
      subValue = value[key];
    }
    // Recursively populate clone (susceptible to call stack limits).
    assignValue(result, key, baseClone(subValue, bitmask, customizer, key, value, stack));
  });
  return result;
}

module.exports = baseClone;

},{"./_Stack":53,"./_arrayEach":59,"./_assignValue":65,"./_baseAssign":67,"./_baseAssignIn":68,"./_cloneBuffer":88,"./_copyArray":95,"./_copySymbols":97,"./_copySymbolsIn":98,"./_getAllKeys":102,"./_getAllKeysIn":103,"./_getTag":110,"./_initCloneArray":118,"./_initCloneByTag":119,"./_initCloneObject":120,"./isArray":159,"./isBuffer":161,"./isObject":164,"./keys":168}],71:[function(require,module,exports){
var isObject = require('./isObject');

/** Built-in value references. */
var objectCreate = Object.create;

/**
 * The base implementation of `_.create` without support for assigning
 * properties to the created object.
 *
 * @private
 * @param {Object} proto The object to inherit from.
 * @returns {Object} Returns the new object.
 */
var baseCreate = (function() {
  function object() {}
  return function(proto) {
    if (!isObject(proto)) {
      return {};
    }
    if (objectCreate) {
      return objectCreate(proto);
    }
    object.prototype = proto;
    var result = new object;
    object.prototype = undefined;
    return result;
  };
}());

module.exports = baseCreate;

},{"./isObject":164}],72:[function(require,module,exports){
/**
 * The base implementation of `_.findIndex` and `_.findLastIndex` without
 * support for iteratee shorthands.
 *
 * @private
 * @param {Array} array The array to inspect.
 * @param {Function} predicate The function invoked per iteration.
 * @param {number} fromIndex The index to search from.
 * @param {boolean} [fromRight] Specify iterating from right to left.
 * @returns {number} Returns the index of the matched value, else `-1`.
 */
function baseFindIndex(array, predicate, fromIndex, fromRight) {
  var length = array.length,
      index = fromIndex + (fromRight ? 1 : -1);

  while ((fromRight ? index-- : ++index < length)) {
    if (predicate(array[index], index, array)) {
      return index;
    }
  }
  return -1;
}

module.exports = baseFindIndex;

},{}],73:[function(require,module,exports){
var arrayPush = require('./_arrayPush'),
    isArray = require('./isArray');

/**
 * The base implementation of `getAllKeys` and `getAllKeysIn` which uses
 * `keysFunc` and `symbolsFunc` to get the enumerable property names and
 * symbols of `object`.
 *
 * @private
 * @param {Object} object The object to query.
 * @param {Function} keysFunc The function to get the keys of `object`.
 * @param {Function} symbolsFunc The function to get the symbols of `object`.
 * @returns {Array} Returns the array of property names and symbols.
 */
function baseGetAllKeys(object, keysFunc, symbolsFunc) {
  var result = keysFunc(object);
  return isArray(object) ? result : arrayPush(result, symbolsFunc(object));
}

module.exports = baseGetAllKeys;

},{"./_arrayPush":63,"./isArray":159}],74:[function(require,module,exports){
var Symbol = require('./_Symbol'),
    getRawTag = require('./_getRawTag'),
    objectToString = require('./_objectToString');

/** `Object#toString` result references. */
var nullTag = '[object Null]',
    undefinedTag = '[object Undefined]';

/** Built-in value references. */
var symToStringTag = Symbol ? Symbol.toStringTag : undefined;

/**
 * The base implementation of `getTag` without fallbacks for buggy environments.
 *
 * @private
 * @param {*} value The value to query.
 * @returns {string} Returns the `toStringTag`.
 */
function baseGetTag(value) {
  if (value == null) {
    return value === undefined ? undefinedTag : nullTag;
  }
  return (symToStringTag && symToStringTag in Object(value))
    ? getRawTag(value)
    : objectToString(value);
}

module.exports = baseGetTag;

},{"./_Symbol":54,"./_getRawTag":107,"./_objectToString":142}],75:[function(require,module,exports){
/**
 * The base implementation of `_.hasIn` without support for deep paths.
 *
 * @private
 * @param {Object} [object] The object to query.
 * @param {Array|string} key The key to check.
 * @returns {boolean} Returns `true` if `key` exists, else `false`.
 */
function baseHasIn(object, key) {
  return object != null && key in Object(object);
}

module.exports = baseHasIn;

},{}],76:[function(require,module,exports){
var baseFindIndex = require('./_baseFindIndex'),
    baseIsNaN = require('./_baseIsNaN'),
    strictIndexOf = require('./_strictIndexOf');

/**
 * The base implementation of `_.indexOf` without `fromIndex` bounds checks.
 *
 * @private
 * @param {Array} array The array to inspect.
 * @param {*} value The value to search for.
 * @param {number} fromIndex The index to search from.
 * @returns {number} Returns the index of the matched value, else `-1`.
 */
function baseIndexOf(array, value, fromIndex) {
  return value === value
    ? strictIndexOf(array, value, fromIndex)
    : baseFindIndex(array, baseIsNaN, fromIndex);
}

module.exports = baseIndexOf;

},{"./_baseFindIndex":72,"./_baseIsNaN":78,"./_strictIndexOf":151}],77:[function(require,module,exports){
var baseGetTag = require('./_baseGetTag'),
    isObjectLike = require('./isObjectLike');

/** `Object#toString` result references. */
var argsTag = '[object Arguments]';

/**
 * The base implementation of `_.isArguments`.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an `arguments` object,
 */
function baseIsArguments(value) {
  return isObjectLike(value) && baseGetTag(value) == argsTag;
}

module.exports = baseIsArguments;

},{"./_baseGetTag":74,"./isObjectLike":165}],78:[function(require,module,exports){
/**
 * The base implementation of `_.isNaN` without support for number objects.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is `NaN`, else `false`.
 */
function baseIsNaN(value) {
  return value !== value;
}

module.exports = baseIsNaN;

},{}],79:[function(require,module,exports){
var isFunction = require('./isFunction'),
    isMasked = require('./_isMasked'),
    isObject = require('./isObject'),
    toSource = require('./_toSource');

/**
 * Used to match `RegExp`
 * [syntax characters](http://ecma-international.org/ecma-262/7.0/#sec-patterns).
 */
var reRegExpChar = /[\\^$.*+?()[\]{}|]/g;

/** Used to detect host constructors (Safari). */
var reIsHostCtor = /^\[object .+?Constructor\]$/;

/** Used for built-in method references. */
var funcProto = Function.prototype,
    objectProto = Object.prototype;

/** Used to resolve the decompiled source of functions. */
var funcToString = funcProto.toString;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/** Used to detect if a method is native. */
var reIsNative = RegExp('^' +
  funcToString.call(hasOwnProperty).replace(reRegExpChar, '\\$&')
  .replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g, '$1.*?') + '$'
);

/**
 * The base implementation of `_.isNative` without bad shim checks.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a native function,
 *  else `false`.
 */
function baseIsNative(value) {
  if (!isObject(value) || isMasked(value)) {
    return false;
  }
  var pattern = isFunction(value) ? reIsNative : reIsHostCtor;
  return pattern.test(toSource(value));
}

module.exports = baseIsNative;

},{"./_isMasked":124,"./_toSource":154,"./isFunction":162,"./isObject":164}],80:[function(require,module,exports){
var baseGetTag = require('./_baseGetTag'),
    isLength = require('./isLength'),
    isObjectLike = require('./isObjectLike');

/** `Object#toString` result references. */
var argsTag = '[object Arguments]',
    arrayTag = '[object Array]',
    boolTag = '[object Boolean]',
    dateTag = '[object Date]',
    errorTag = '[object Error]',
    funcTag = '[object Function]',
    mapTag = '[object Map]',
    numberTag = '[object Number]',
    objectTag = '[object Object]',
    regexpTag = '[object RegExp]',
    setTag = '[object Set]',
    stringTag = '[object String]',
    weakMapTag = '[object WeakMap]';

var arrayBufferTag = '[object ArrayBuffer]',
    dataViewTag = '[object DataView]',
    float32Tag = '[object Float32Array]',
    float64Tag = '[object Float64Array]',
    int8Tag = '[object Int8Array]',
    int16Tag = '[object Int16Array]',
    int32Tag = '[object Int32Array]',
    uint8Tag = '[object Uint8Array]',
    uint8ClampedTag = '[object Uint8ClampedArray]',
    uint16Tag = '[object Uint16Array]',
    uint32Tag = '[object Uint32Array]';

/** Used to identify `toStringTag` values of typed arrays. */
var typedArrayTags = {};
typedArrayTags[float32Tag] = typedArrayTags[float64Tag] =
typedArrayTags[int8Tag] = typedArrayTags[int16Tag] =
typedArrayTags[int32Tag] = typedArrayTags[uint8Tag] =
typedArrayTags[uint8ClampedTag] = typedArrayTags[uint16Tag] =
typedArrayTags[uint32Tag] = true;
typedArrayTags[argsTag] = typedArrayTags[arrayTag] =
typedArrayTags[arrayBufferTag] = typedArrayTags[boolTag] =
typedArrayTags[dataViewTag] = typedArrayTags[dateTag] =
typedArrayTags[errorTag] = typedArrayTags[funcTag] =
typedArrayTags[mapTag] = typedArrayTags[numberTag] =
typedArrayTags[objectTag] = typedArrayTags[regexpTag] =
typedArrayTags[setTag] = typedArrayTags[stringTag] =
typedArrayTags[weakMapTag] = false;

/**
 * The base implementation of `_.isTypedArray` without Node.js optimizations.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a typed array, else `false`.
 */
function baseIsTypedArray(value) {
  return isObjectLike(value) &&
    isLength(value.length) && !!typedArrayTags[baseGetTag(value)];
}

module.exports = baseIsTypedArray;

},{"./_baseGetTag":74,"./isLength":163,"./isObjectLike":165}],81:[function(require,module,exports){
var isPrototype = require('./_isPrototype'),
    nativeKeys = require('./_nativeKeys');

/** Used for built-in method references. */
var objectProto = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * The base implementation of `_.keys` which doesn't treat sparse arrays as dense.
 *
 * @private
 * @param {Object} object The object to query.
 * @returns {Array} Returns the array of property names.
 */
function baseKeys(object) {
  if (!isPrototype(object)) {
    return nativeKeys(object);
  }
  var result = [];
  for (var key in Object(object)) {
    if (hasOwnProperty.call(object, key) && key != 'constructor') {
      result.push(key);
    }
  }
  return result;
}

module.exports = baseKeys;

},{"./_isPrototype":125,"./_nativeKeys":139}],82:[function(require,module,exports){
var isObject = require('./isObject'),
    isPrototype = require('./_isPrototype'),
    nativeKeysIn = require('./_nativeKeysIn');

/** Used for built-in method references. */
var objectProto = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * The base implementation of `_.keysIn` which doesn't treat sparse arrays as dense.
 *
 * @private
 * @param {Object} object The object to query.
 * @returns {Array} Returns the array of property names.
 */
function baseKeysIn(object) {
  if (!isObject(object)) {
    return nativeKeysIn(object);
  }
  var isProto = isPrototype(object),
      result = [];

  for (var key in object) {
    if (!(key == 'constructor' && (isProto || !hasOwnProperty.call(object, key)))) {
      result.push(key);
    }
  }
  return result;
}

module.exports = baseKeysIn;

},{"./_isPrototype":125,"./_nativeKeysIn":140,"./isObject":164}],83:[function(require,module,exports){
/**
 * The base implementation of `_.times` without support for iteratee shorthands
 * or max array length checks.
 *
 * @private
 * @param {number} n The number of times to invoke `iteratee`.
 * @param {Function} iteratee The function invoked per iteration.
 * @returns {Array} Returns the array of results.
 */
function baseTimes(n, iteratee) {
  var index = -1,
      result = Array(n);

  while (++index < n) {
    result[index] = iteratee(index);
  }
  return result;
}

module.exports = baseTimes;

},{}],84:[function(require,module,exports){
var Symbol = require('./_Symbol'),
    arrayMap = require('./_arrayMap'),
    isArray = require('./isArray'),
    isSymbol = require('./isSymbol');

/** Used as references for various `Number` constants. */
var INFINITY = 1 / 0;

/** Used to convert symbols to primitives and strings. */
var symbolProto = Symbol ? Symbol.prototype : undefined,
    symbolToString = symbolProto ? symbolProto.toString : undefined;

/**
 * The base implementation of `_.toString` which doesn't convert nullish
 * values to empty strings.
 *
 * @private
 * @param {*} value The value to process.
 * @returns {string} Returns the string.
 */
function baseToString(value) {
  // Exit early for strings to avoid a performance hit in some environments.
  if (typeof value == 'string') {
    return value;
  }
  if (isArray(value)) {
    // Recursively convert values (susceptible to call stack limits).
    return arrayMap(value, baseToString) + '';
  }
  if (isSymbol(value)) {
    return symbolToString ? symbolToString.call(value) : '';
  }
  var result = (value + '');
  return (result == '0' && (1 / value) == -INFINITY) ? '-0' : result;
}

module.exports = baseToString;

},{"./_Symbol":54,"./_arrayMap":62,"./isArray":159,"./isSymbol":166}],85:[function(require,module,exports){
/**
 * The base implementation of `_.unary` without support for storing metadata.
 *
 * @private
 * @param {Function} func The function to cap arguments for.
 * @returns {Function} Returns the new capped function.
 */
function baseUnary(func) {
  return function(value) {
    return func(value);
  };
}

module.exports = baseUnary;

},{}],86:[function(require,module,exports){
var isArray = require('./isArray'),
    isKey = require('./_isKey'),
    stringToPath = require('./_stringToPath'),
    toString = require('./toString');

/**
 * Casts `value` to a path array if it's not one.
 *
 * @private
 * @param {*} value The value to inspect.
 * @param {Object} [object] The object to query keys on.
 * @returns {Array} Returns the cast property path array.
 */
function castPath(value, object) {
  if (isArray(value)) {
    return value;
  }
  return isKey(value, object) ? [value] : stringToPath(toString(value));
}

module.exports = castPath;

},{"./_isKey":122,"./_stringToPath":152,"./isArray":159,"./toString":174}],87:[function(require,module,exports){
var Uint8Array = require('./_Uint8Array');

/**
 * Creates a clone of `arrayBuffer`.
 *
 * @private
 * @param {ArrayBuffer} arrayBuffer The array buffer to clone.
 * @returns {ArrayBuffer} Returns the cloned array buffer.
 */
function cloneArrayBuffer(arrayBuffer) {
  var result = new arrayBuffer.constructor(arrayBuffer.byteLength);
  new Uint8Array(result).set(new Uint8Array(arrayBuffer));
  return result;
}

module.exports = cloneArrayBuffer;

},{"./_Uint8Array":55}],88:[function(require,module,exports){
var root = require('./_root');

/** Detect free variable `exports`. */
var freeExports = typeof exports == 'object' && exports && !exports.nodeType && exports;

/** Detect free variable `module`. */
var freeModule = freeExports && typeof module == 'object' && module && !module.nodeType && module;

/** Detect the popular CommonJS extension `module.exports`. */
var moduleExports = freeModule && freeModule.exports === freeExports;

/** Built-in value references. */
var Buffer = moduleExports ? root.Buffer : undefined,
    allocUnsafe = Buffer ? Buffer.allocUnsafe : undefined;

/**
 * Creates a clone of  `buffer`.
 *
 * @private
 * @param {Buffer} buffer The buffer to clone.
 * @param {boolean} [isDeep] Specify a deep clone.
 * @returns {Buffer} Returns the cloned buffer.
 */
function cloneBuffer(buffer, isDeep) {
  if (isDeep) {
    return buffer.slice();
  }
  var length = buffer.length,
      result = allocUnsafe ? allocUnsafe(length) : new buffer.constructor(length);

  buffer.copy(result);
  return result;
}

module.exports = cloneBuffer;

},{"./_root":144}],89:[function(require,module,exports){
var cloneArrayBuffer = require('./_cloneArrayBuffer');

/**
 * Creates a clone of `dataView`.
 *
 * @private
 * @param {Object} dataView The data view to clone.
 * @param {boolean} [isDeep] Specify a deep clone.
 * @returns {Object} Returns the cloned data view.
 */
function cloneDataView(dataView, isDeep) {
  var buffer = isDeep ? cloneArrayBuffer(dataView.buffer) : dataView.buffer;
  return new dataView.constructor(buffer, dataView.byteOffset, dataView.byteLength);
}

module.exports = cloneDataView;

},{"./_cloneArrayBuffer":87}],90:[function(require,module,exports){
var addMapEntry = require('./_addMapEntry'),
    arrayReduce = require('./_arrayReduce'),
    mapToArray = require('./_mapToArray');

/** Used to compose bitmasks for cloning. */
var CLONE_DEEP_FLAG = 1;

/**
 * Creates a clone of `map`.
 *
 * @private
 * @param {Object} map The map to clone.
 * @param {Function} cloneFunc The function to clone values.
 * @param {boolean} [isDeep] Specify a deep clone.
 * @returns {Object} Returns the cloned map.
 */
function cloneMap(map, isDeep, cloneFunc) {
  var array = isDeep ? cloneFunc(mapToArray(map), CLONE_DEEP_FLAG) : mapToArray(map);
  return arrayReduce(array, addMapEntry, new map.constructor);
}

module.exports = cloneMap;

},{"./_addMapEntry":57,"./_arrayReduce":64,"./_mapToArray":136}],91:[function(require,module,exports){
/** Used to match `RegExp` flags from their coerced string values. */
var reFlags = /\w*$/;

/**
 * Creates a clone of `regexp`.
 *
 * @private
 * @param {Object} regexp The regexp to clone.
 * @returns {Object} Returns the cloned regexp.
 */
function cloneRegExp(regexp) {
  var result = new regexp.constructor(regexp.source, reFlags.exec(regexp));
  result.lastIndex = regexp.lastIndex;
  return result;
}

module.exports = cloneRegExp;

},{}],92:[function(require,module,exports){
var addSetEntry = require('./_addSetEntry'),
    arrayReduce = require('./_arrayReduce'),
    setToArray = require('./_setToArray');

/** Used to compose bitmasks for cloning. */
var CLONE_DEEP_FLAG = 1;

/**
 * Creates a clone of `set`.
 *
 * @private
 * @param {Object} set The set to clone.
 * @param {Function} cloneFunc The function to clone values.
 * @param {boolean} [isDeep] Specify a deep clone.
 * @returns {Object} Returns the cloned set.
 */
function cloneSet(set, isDeep, cloneFunc) {
  var array = isDeep ? cloneFunc(setToArray(set), CLONE_DEEP_FLAG) : setToArray(set);
  return arrayReduce(array, addSetEntry, new set.constructor);
}

module.exports = cloneSet;

},{"./_addSetEntry":58,"./_arrayReduce":64,"./_setToArray":145}],93:[function(require,module,exports){
var Symbol = require('./_Symbol');

/** Used to convert symbols to primitives and strings. */
var symbolProto = Symbol ? Symbol.prototype : undefined,
    symbolValueOf = symbolProto ? symbolProto.valueOf : undefined;

/**
 * Creates a clone of the `symbol` object.
 *
 * @private
 * @param {Object} symbol The symbol object to clone.
 * @returns {Object} Returns the cloned symbol object.
 */
function cloneSymbol(symbol) {
  return symbolValueOf ? Object(symbolValueOf.call(symbol)) : {};
}

module.exports = cloneSymbol;

},{"./_Symbol":54}],94:[function(require,module,exports){
var cloneArrayBuffer = require('./_cloneArrayBuffer');

/**
 * Creates a clone of `typedArray`.
 *
 * @private
 * @param {Object} typedArray The typed array to clone.
 * @param {boolean} [isDeep] Specify a deep clone.
 * @returns {Object} Returns the cloned typed array.
 */
function cloneTypedArray(typedArray, isDeep) {
  var buffer = isDeep ? cloneArrayBuffer(typedArray.buffer) : typedArray.buffer;
  return new typedArray.constructor(buffer, typedArray.byteOffset, typedArray.length);
}

module.exports = cloneTypedArray;

},{"./_cloneArrayBuffer":87}],95:[function(require,module,exports){
/**
 * Copies the values of `source` to `array`.
 *
 * @private
 * @param {Array} source The array to copy values from.
 * @param {Array} [array=[]] The array to copy values to.
 * @returns {Array} Returns `array`.
 */
function copyArray(source, array) {
  var index = -1,
      length = source.length;

  array || (array = Array(length));
  while (++index < length) {
    array[index] = source[index];
  }
  return array;
}

module.exports = copyArray;

},{}],96:[function(require,module,exports){
var assignValue = require('./_assignValue'),
    baseAssignValue = require('./_baseAssignValue');

/**
 * Copies properties of `source` to `object`.
 *
 * @private
 * @param {Object} source The object to copy properties from.
 * @param {Array} props The property identifiers to copy.
 * @param {Object} [object={}] The object to copy properties to.
 * @param {Function} [customizer] The function to customize copied values.
 * @returns {Object} Returns `object`.
 */
function copyObject(source, props, object, customizer) {
  var isNew = !object;
  object || (object = {});

  var index = -1,
      length = props.length;

  while (++index < length) {
    var key = props[index];

    var newValue = customizer
      ? customizer(object[key], source[key], key, object, source)
      : undefined;

    if (newValue === undefined) {
      newValue = source[key];
    }
    if (isNew) {
      baseAssignValue(object, key, newValue);
    } else {
      assignValue(object, key, newValue);
    }
  }
  return object;
}

module.exports = copyObject;

},{"./_assignValue":65,"./_baseAssignValue":69}],97:[function(require,module,exports){
var copyObject = require('./_copyObject'),
    getSymbols = require('./_getSymbols');

/**
 * Copies own symbols of `source` to `object`.
 *
 * @private
 * @param {Object} source The object to copy symbols from.
 * @param {Object} [object={}] The object to copy symbols to.
 * @returns {Object} Returns `object`.
 */
function copySymbols(source, object) {
  return copyObject(source, getSymbols(source), object);
}

module.exports = copySymbols;

},{"./_copyObject":96,"./_getSymbols":108}],98:[function(require,module,exports){
var copyObject = require('./_copyObject'),
    getSymbolsIn = require('./_getSymbolsIn');

/**
 * Copies own and inherited symbols of `source` to `object`.
 *
 * @private
 * @param {Object} source The object to copy symbols from.
 * @param {Object} [object={}] The object to copy symbols to.
 * @returns {Object} Returns `object`.
 */
function copySymbolsIn(source, object) {
  return copyObject(source, getSymbolsIn(source), object);
}

module.exports = copySymbolsIn;

},{"./_copyObject":96,"./_getSymbolsIn":109}],99:[function(require,module,exports){
var root = require('./_root');

/** Used to detect overreaching core-js shims. */
var coreJsData = root['__core-js_shared__'];

module.exports = coreJsData;

},{"./_root":144}],100:[function(require,module,exports){
var getNative = require('./_getNative');

var defineProperty = (function() {
  try {
    var func = getNative(Object, 'defineProperty');
    func({}, '', {});
    return func;
  } catch (e) {}
}());

module.exports = defineProperty;

},{"./_getNative":105}],101:[function(require,module,exports){
(function (global){
/** Detect free variable `global` from Node.js. */
var freeGlobal = typeof global == 'object' && global && global.Object === Object && global;

module.exports = freeGlobal;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{}],102:[function(require,module,exports){
var baseGetAllKeys = require('./_baseGetAllKeys'),
    getSymbols = require('./_getSymbols'),
    keys = require('./keys');

/**
 * Creates an array of own enumerable property names and symbols of `object`.
 *
 * @private
 * @param {Object} object The object to query.
 * @returns {Array} Returns the array of property names and symbols.
 */
function getAllKeys(object) {
  return baseGetAllKeys(object, keys, getSymbols);
}

module.exports = getAllKeys;

},{"./_baseGetAllKeys":73,"./_getSymbols":108,"./keys":168}],103:[function(require,module,exports){
var baseGetAllKeys = require('./_baseGetAllKeys'),
    getSymbolsIn = require('./_getSymbolsIn'),
    keysIn = require('./keysIn');

/**
 * Creates an array of own and inherited enumerable property names and
 * symbols of `object`.
 *
 * @private
 * @param {Object} object The object to query.
 * @returns {Array} Returns the array of property names and symbols.
 */
function getAllKeysIn(object) {
  return baseGetAllKeys(object, keysIn, getSymbolsIn);
}

module.exports = getAllKeysIn;

},{"./_baseGetAllKeys":73,"./_getSymbolsIn":109,"./keysIn":169}],104:[function(require,module,exports){
var isKeyable = require('./_isKeyable');

/**
 * Gets the data for `map`.
 *
 * @private
 * @param {Object} map The map to query.
 * @param {string} key The reference key.
 * @returns {*} Returns the map data.
 */
function getMapData(map, key) {
  var data = map.__data__;
  return isKeyable(key)
    ? data[typeof key == 'string' ? 'string' : 'hash']
    : data.map;
}

module.exports = getMapData;

},{"./_isKeyable":123}],105:[function(require,module,exports){
var baseIsNative = require('./_baseIsNative'),
    getValue = require('./_getValue');

/**
 * Gets the native function at `key` of `object`.
 *
 * @private
 * @param {Object} object The object to query.
 * @param {string} key The key of the method to get.
 * @returns {*} Returns the function if it's native, else `undefined`.
 */
function getNative(object, key) {
  var value = getValue(object, key);
  return baseIsNative(value) ? value : undefined;
}

module.exports = getNative;

},{"./_baseIsNative":79,"./_getValue":111}],106:[function(require,module,exports){
var overArg = require('./_overArg');

/** Built-in value references. */
var getPrototype = overArg(Object.getPrototypeOf, Object);

module.exports = getPrototype;

},{"./_overArg":143}],107:[function(require,module,exports){
var Symbol = require('./_Symbol');

/** Used for built-in method references. */
var objectProto = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * Used to resolve the
 * [`toStringTag`](http://ecma-international.org/ecma-262/7.0/#sec-object.prototype.tostring)
 * of values.
 */
var nativeObjectToString = objectProto.toString;

/** Built-in value references. */
var symToStringTag = Symbol ? Symbol.toStringTag : undefined;

/**
 * A specialized version of `baseGetTag` which ignores `Symbol.toStringTag` values.
 *
 * @private
 * @param {*} value The value to query.
 * @returns {string} Returns the raw `toStringTag`.
 */
function getRawTag(value) {
  var isOwn = hasOwnProperty.call(value, symToStringTag),
      tag = value[symToStringTag];

  try {
    value[symToStringTag] = undefined;
    var unmasked = true;
  } catch (e) {}

  var result = nativeObjectToString.call(value);
  if (unmasked) {
    if (isOwn) {
      value[symToStringTag] = tag;
    } else {
      delete value[symToStringTag];
    }
  }
  return result;
}

module.exports = getRawTag;

},{"./_Symbol":54}],108:[function(require,module,exports){
var arrayFilter = require('./_arrayFilter'),
    stubArray = require('./stubArray');

/** Used for built-in method references. */
var objectProto = Object.prototype;

/** Built-in value references. */
var propertyIsEnumerable = objectProto.propertyIsEnumerable;

/* Built-in method references for those with the same name as other `lodash` methods. */
var nativeGetSymbols = Object.getOwnPropertySymbols;

/**
 * Creates an array of the own enumerable symbols of `object`.
 *
 * @private
 * @param {Object} object The object to query.
 * @returns {Array} Returns the array of symbols.
 */
var getSymbols = !nativeGetSymbols ? stubArray : function(object) {
  if (object == null) {
    return [];
  }
  object = Object(object);
  return arrayFilter(nativeGetSymbols(object), function(symbol) {
    return propertyIsEnumerable.call(object, symbol);
  });
};

module.exports = getSymbols;

},{"./_arrayFilter":60,"./stubArray":172}],109:[function(require,module,exports){
var arrayPush = require('./_arrayPush'),
    getPrototype = require('./_getPrototype'),
    getSymbols = require('./_getSymbols'),
    stubArray = require('./stubArray');

/* Built-in method references for those with the same name as other `lodash` methods. */
var nativeGetSymbols = Object.getOwnPropertySymbols;

/**
 * Creates an array of the own and inherited enumerable symbols of `object`.
 *
 * @private
 * @param {Object} object The object to query.
 * @returns {Array} Returns the array of symbols.
 */
var getSymbolsIn = !nativeGetSymbols ? stubArray : function(object) {
  var result = [];
  while (object) {
    arrayPush(result, getSymbols(object));
    object = getPrototype(object);
  }
  return result;
};

module.exports = getSymbolsIn;

},{"./_arrayPush":63,"./_getPrototype":106,"./_getSymbols":108,"./stubArray":172}],110:[function(require,module,exports){
var DataView = require('./_DataView'),
    Map = require('./_Map'),
    Promise = require('./_Promise'),
    Set = require('./_Set'),
    WeakMap = require('./_WeakMap'),
    baseGetTag = require('./_baseGetTag'),
    toSource = require('./_toSource');

/** `Object#toString` result references. */
var mapTag = '[object Map]',
    objectTag = '[object Object]',
    promiseTag = '[object Promise]',
    setTag = '[object Set]',
    weakMapTag = '[object WeakMap]';

var dataViewTag = '[object DataView]';

/** Used to detect maps, sets, and weakmaps. */
var dataViewCtorString = toSource(DataView),
    mapCtorString = toSource(Map),
    promiseCtorString = toSource(Promise),
    setCtorString = toSource(Set),
    weakMapCtorString = toSource(WeakMap);

/**
 * Gets the `toStringTag` of `value`.
 *
 * @private
 * @param {*} value The value to query.
 * @returns {string} Returns the `toStringTag`.
 */
var getTag = baseGetTag;

// Fallback for data views, maps, sets, and weak maps in IE 11 and promises in Node.js < 6.
if ((DataView && getTag(new DataView(new ArrayBuffer(1))) != dataViewTag) ||
    (Map && getTag(new Map) != mapTag) ||
    (Promise && getTag(Promise.resolve()) != promiseTag) ||
    (Set && getTag(new Set) != setTag) ||
    (WeakMap && getTag(new WeakMap) != weakMapTag)) {
  getTag = function(value) {
    var result = baseGetTag(value),
        Ctor = result == objectTag ? value.constructor : undefined,
        ctorString = Ctor ? toSource(Ctor) : '';

    if (ctorString) {
      switch (ctorString) {
        case dataViewCtorString: return dataViewTag;
        case mapCtorString: return mapTag;
        case promiseCtorString: return promiseTag;
        case setCtorString: return setTag;
        case weakMapCtorString: return weakMapTag;
      }
    }
    return result;
  };
}

module.exports = getTag;

},{"./_DataView":46,"./_Map":49,"./_Promise":51,"./_Set":52,"./_WeakMap":56,"./_baseGetTag":74,"./_toSource":154}],111:[function(require,module,exports){
/**
 * Gets the value at `key` of `object`.
 *
 * @private
 * @param {Object} [object] The object to query.
 * @param {string} key The key of the property to get.
 * @returns {*} Returns the property value.
 */
function getValue(object, key) {
  return object == null ? undefined : object[key];
}

module.exports = getValue;

},{}],112:[function(require,module,exports){
var castPath = require('./_castPath'),
    isArguments = require('./isArguments'),
    isArray = require('./isArray'),
    isIndex = require('./_isIndex'),
    isLength = require('./isLength'),
    toKey = require('./_toKey');

/**
 * Checks if `path` exists on `object`.
 *
 * @private
 * @param {Object} object The object to query.
 * @param {Array|string} path The path to check.
 * @param {Function} hasFunc The function to check properties.
 * @returns {boolean} Returns `true` if `path` exists, else `false`.
 */
function hasPath(object, path, hasFunc) {
  path = castPath(path, object);

  var index = -1,
      length = path.length,
      result = false;

  while (++index < length) {
    var key = toKey(path[index]);
    if (!(result = object != null && hasFunc(object, key))) {
      break;
    }
    object = object[key];
  }
  if (result || ++index != length) {
    return result;
  }
  length = object == null ? 0 : object.length;
  return !!length && isLength(length) && isIndex(key, length) &&
    (isArray(object) || isArguments(object));
}

module.exports = hasPath;

},{"./_castPath":86,"./_isIndex":121,"./_toKey":153,"./isArguments":158,"./isArray":159,"./isLength":163}],113:[function(require,module,exports){
var nativeCreate = require('./_nativeCreate');

/**
 * Removes all key-value entries from the hash.
 *
 * @private
 * @name clear
 * @memberOf Hash
 */
function hashClear() {
  this.__data__ = nativeCreate ? nativeCreate(null) : {};
  this.size = 0;
}

module.exports = hashClear;

},{"./_nativeCreate":138}],114:[function(require,module,exports){
/**
 * Removes `key` and its value from the hash.
 *
 * @private
 * @name delete
 * @memberOf Hash
 * @param {Object} hash The hash to modify.
 * @param {string} key The key of the value to remove.
 * @returns {boolean} Returns `true` if the entry was removed, else `false`.
 */
function hashDelete(key) {
  var result = this.has(key) && delete this.__data__[key];
  this.size -= result ? 1 : 0;
  return result;
}

module.exports = hashDelete;

},{}],115:[function(require,module,exports){
var nativeCreate = require('./_nativeCreate');

/** Used to stand-in for `undefined` hash values. */
var HASH_UNDEFINED = '__lodash_hash_undefined__';

/** Used for built-in method references. */
var objectProto = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * Gets the hash value for `key`.
 *
 * @private
 * @name get
 * @memberOf Hash
 * @param {string} key The key of the value to get.
 * @returns {*} Returns the entry value.
 */
function hashGet(key) {
  var data = this.__data__;
  if (nativeCreate) {
    var result = data[key];
    return result === HASH_UNDEFINED ? undefined : result;
  }
  return hasOwnProperty.call(data, key) ? data[key] : undefined;
}

module.exports = hashGet;

},{"./_nativeCreate":138}],116:[function(require,module,exports){
var nativeCreate = require('./_nativeCreate');

/** Used for built-in method references. */
var objectProto = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * Checks if a hash value for `key` exists.
 *
 * @private
 * @name has
 * @memberOf Hash
 * @param {string} key The key of the entry to check.
 * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
 */
function hashHas(key) {
  var data = this.__data__;
  return nativeCreate ? (data[key] !== undefined) : hasOwnProperty.call(data, key);
}

module.exports = hashHas;

},{"./_nativeCreate":138}],117:[function(require,module,exports){
var nativeCreate = require('./_nativeCreate');

/** Used to stand-in for `undefined` hash values. */
var HASH_UNDEFINED = '__lodash_hash_undefined__';

/**
 * Sets the hash `key` to `value`.
 *
 * @private
 * @name set
 * @memberOf Hash
 * @param {string} key The key of the value to set.
 * @param {*} value The value to set.
 * @returns {Object} Returns the hash instance.
 */
function hashSet(key, value) {
  var data = this.__data__;
  this.size += this.has(key) ? 0 : 1;
  data[key] = (nativeCreate && value === undefined) ? HASH_UNDEFINED : value;
  return this;
}

module.exports = hashSet;

},{"./_nativeCreate":138}],118:[function(require,module,exports){
/** Used for built-in method references. */
var objectProto = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * Initializes an array clone.
 *
 * @private
 * @param {Array} array The array to clone.
 * @returns {Array} Returns the initialized clone.
 */
function initCloneArray(array) {
  var length = array.length,
      result = array.constructor(length);

  // Add properties assigned by `RegExp#exec`.
  if (length && typeof array[0] == 'string' && hasOwnProperty.call(array, 'index')) {
    result.index = array.index;
    result.input = array.input;
  }
  return result;
}

module.exports = initCloneArray;

},{}],119:[function(require,module,exports){
var cloneArrayBuffer = require('./_cloneArrayBuffer'),
    cloneDataView = require('./_cloneDataView'),
    cloneMap = require('./_cloneMap'),
    cloneRegExp = require('./_cloneRegExp'),
    cloneSet = require('./_cloneSet'),
    cloneSymbol = require('./_cloneSymbol'),
    cloneTypedArray = require('./_cloneTypedArray');

/** `Object#toString` result references. */
var boolTag = '[object Boolean]',
    dateTag = '[object Date]',
    mapTag = '[object Map]',
    numberTag = '[object Number]',
    regexpTag = '[object RegExp]',
    setTag = '[object Set]',
    stringTag = '[object String]',
    symbolTag = '[object Symbol]';

var arrayBufferTag = '[object ArrayBuffer]',
    dataViewTag = '[object DataView]',
    float32Tag = '[object Float32Array]',
    float64Tag = '[object Float64Array]',
    int8Tag = '[object Int8Array]',
    int16Tag = '[object Int16Array]',
    int32Tag = '[object Int32Array]',
    uint8Tag = '[object Uint8Array]',
    uint8ClampedTag = '[object Uint8ClampedArray]',
    uint16Tag = '[object Uint16Array]',
    uint32Tag = '[object Uint32Array]';

/**
 * Initializes an object clone based on its `toStringTag`.
 *
 * **Note:** This function only supports cloning values with tags of
 * `Boolean`, `Date`, `Error`, `Number`, `RegExp`, or `String`.
 *
 * @private
 * @param {Object} object The object to clone.
 * @param {string} tag The `toStringTag` of the object to clone.
 * @param {Function} cloneFunc The function to clone values.
 * @param {boolean} [isDeep] Specify a deep clone.
 * @returns {Object} Returns the initialized clone.
 */
function initCloneByTag(object, tag, cloneFunc, isDeep) {
  var Ctor = object.constructor;
  switch (tag) {
    case arrayBufferTag:
      return cloneArrayBuffer(object);

    case boolTag:
    case dateTag:
      return new Ctor(+object);

    case dataViewTag:
      return cloneDataView(object, isDeep);

    case float32Tag: case float64Tag:
    case int8Tag: case int16Tag: case int32Tag:
    case uint8Tag: case uint8ClampedTag: case uint16Tag: case uint32Tag:
      return cloneTypedArray(object, isDeep);

    case mapTag:
      return cloneMap(object, isDeep, cloneFunc);

    case numberTag:
    case stringTag:
      return new Ctor(object);

    case regexpTag:
      return cloneRegExp(object);

    case setTag:
      return cloneSet(object, isDeep, cloneFunc);

    case symbolTag:
      return cloneSymbol(object);
  }
}

module.exports = initCloneByTag;

},{"./_cloneArrayBuffer":87,"./_cloneDataView":89,"./_cloneMap":90,"./_cloneRegExp":91,"./_cloneSet":92,"./_cloneSymbol":93,"./_cloneTypedArray":94}],120:[function(require,module,exports){
var baseCreate = require('./_baseCreate'),
    getPrototype = require('./_getPrototype'),
    isPrototype = require('./_isPrototype');

/**
 * Initializes an object clone.
 *
 * @private
 * @param {Object} object The object to clone.
 * @returns {Object} Returns the initialized clone.
 */
function initCloneObject(object) {
  return (typeof object.constructor == 'function' && !isPrototype(object))
    ? baseCreate(getPrototype(object))
    : {};
}

module.exports = initCloneObject;

},{"./_baseCreate":71,"./_getPrototype":106,"./_isPrototype":125}],121:[function(require,module,exports){
/** Used as references for various `Number` constants. */
var MAX_SAFE_INTEGER = 9007199254740991;

/** Used to detect unsigned integer values. */
var reIsUint = /^(?:0|[1-9]\d*)$/;

/**
 * Checks if `value` is a valid array-like index.
 *
 * @private
 * @param {*} value The value to check.
 * @param {number} [length=MAX_SAFE_INTEGER] The upper bounds of a valid index.
 * @returns {boolean} Returns `true` if `value` is a valid index, else `false`.
 */
function isIndex(value, length) {
  length = length == null ? MAX_SAFE_INTEGER : length;
  return !!length &&
    (typeof value == 'number' || reIsUint.test(value)) &&
    (value > -1 && value % 1 == 0 && value < length);
}

module.exports = isIndex;

},{}],122:[function(require,module,exports){
var isArray = require('./isArray'),
    isSymbol = require('./isSymbol');

/** Used to match property names within property paths. */
var reIsDeepProp = /\.|\[(?:[^[\]]*|(["'])(?:(?!\1)[^\\]|\\.)*?\1)\]/,
    reIsPlainProp = /^\w*$/;

/**
 * Checks if `value` is a property name and not a property path.
 *
 * @private
 * @param {*} value The value to check.
 * @param {Object} [object] The object to query keys on.
 * @returns {boolean} Returns `true` if `value` is a property name, else `false`.
 */
function isKey(value, object) {
  if (isArray(value)) {
    return false;
  }
  var type = typeof value;
  if (type == 'number' || type == 'symbol' || type == 'boolean' ||
      value == null || isSymbol(value)) {
    return true;
  }
  return reIsPlainProp.test(value) || !reIsDeepProp.test(value) ||
    (object != null && value in Object(object));
}

module.exports = isKey;

},{"./isArray":159,"./isSymbol":166}],123:[function(require,module,exports){
/**
 * Checks if `value` is suitable for use as unique object key.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is suitable, else `false`.
 */
function isKeyable(value) {
  var type = typeof value;
  return (type == 'string' || type == 'number' || type == 'symbol' || type == 'boolean')
    ? (value !== '__proto__')
    : (value === null);
}

module.exports = isKeyable;

},{}],124:[function(require,module,exports){
var coreJsData = require('./_coreJsData');

/** Used to detect methods masquerading as native. */
var maskSrcKey = (function() {
  var uid = /[^.]+$/.exec(coreJsData && coreJsData.keys && coreJsData.keys.IE_PROTO || '');
  return uid ? ('Symbol(src)_1.' + uid) : '';
}());

/**
 * Checks if `func` has its source masked.
 *
 * @private
 * @param {Function} func The function to check.
 * @returns {boolean} Returns `true` if `func` is masked, else `false`.
 */
function isMasked(func) {
  return !!maskSrcKey && (maskSrcKey in func);
}

module.exports = isMasked;

},{"./_coreJsData":99}],125:[function(require,module,exports){
/** Used for built-in method references. */
var objectProto = Object.prototype;

/**
 * Checks if `value` is likely a prototype object.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a prototype, else `false`.
 */
function isPrototype(value) {
  var Ctor = value && value.constructor,
      proto = (typeof Ctor == 'function' && Ctor.prototype) || objectProto;

  return value === proto;
}

module.exports = isPrototype;

},{}],126:[function(require,module,exports){
/**
 * Removes all key-value entries from the list cache.
 *
 * @private
 * @name clear
 * @memberOf ListCache
 */
function listCacheClear() {
  this.__data__ = [];
  this.size = 0;
}

module.exports = listCacheClear;

},{}],127:[function(require,module,exports){
var assocIndexOf = require('./_assocIndexOf');

/** Used for built-in method references. */
var arrayProto = Array.prototype;

/** Built-in value references. */
var splice = arrayProto.splice;

/**
 * Removes `key` and its value from the list cache.
 *
 * @private
 * @name delete
 * @memberOf ListCache
 * @param {string} key The key of the value to remove.
 * @returns {boolean} Returns `true` if the entry was removed, else `false`.
 */
function listCacheDelete(key) {
  var data = this.__data__,
      index = assocIndexOf(data, key);

  if (index < 0) {
    return false;
  }
  var lastIndex = data.length - 1;
  if (index == lastIndex) {
    data.pop();
  } else {
    splice.call(data, index, 1);
  }
  --this.size;
  return true;
}

module.exports = listCacheDelete;

},{"./_assocIndexOf":66}],128:[function(require,module,exports){
var assocIndexOf = require('./_assocIndexOf');

/**
 * Gets the list cache value for `key`.
 *
 * @private
 * @name get
 * @memberOf ListCache
 * @param {string} key The key of the value to get.
 * @returns {*} Returns the entry value.
 */
function listCacheGet(key) {
  var data = this.__data__,
      index = assocIndexOf(data, key);

  return index < 0 ? undefined : data[index][1];
}

module.exports = listCacheGet;

},{"./_assocIndexOf":66}],129:[function(require,module,exports){
var assocIndexOf = require('./_assocIndexOf');

/**
 * Checks if a list cache value for `key` exists.
 *
 * @private
 * @name has
 * @memberOf ListCache
 * @param {string} key The key of the entry to check.
 * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
 */
function listCacheHas(key) {
  return assocIndexOf(this.__data__, key) > -1;
}

module.exports = listCacheHas;

},{"./_assocIndexOf":66}],130:[function(require,module,exports){
var assocIndexOf = require('./_assocIndexOf');

/**
 * Sets the list cache `key` to `value`.
 *
 * @private
 * @name set
 * @memberOf ListCache
 * @param {string} key The key of the value to set.
 * @param {*} value The value to set.
 * @returns {Object} Returns the list cache instance.
 */
function listCacheSet(key, value) {
  var data = this.__data__,
      index = assocIndexOf(data, key);

  if (index < 0) {
    ++this.size;
    data.push([key, value]);
  } else {
    data[index][1] = value;
  }
  return this;
}

module.exports = listCacheSet;

},{"./_assocIndexOf":66}],131:[function(require,module,exports){
var Hash = require('./_Hash'),
    ListCache = require('./_ListCache'),
    Map = require('./_Map');

/**
 * Removes all key-value entries from the map.
 *
 * @private
 * @name clear
 * @memberOf MapCache
 */
function mapCacheClear() {
  this.size = 0;
  this.__data__ = {
    'hash': new Hash,
    'map': new (Map || ListCache),
    'string': new Hash
  };
}

module.exports = mapCacheClear;

},{"./_Hash":47,"./_ListCache":48,"./_Map":49}],132:[function(require,module,exports){
var getMapData = require('./_getMapData');

/**
 * Removes `key` and its value from the map.
 *
 * @private
 * @name delete
 * @memberOf MapCache
 * @param {string} key The key of the value to remove.
 * @returns {boolean} Returns `true` if the entry was removed, else `false`.
 */
function mapCacheDelete(key) {
  var result = getMapData(this, key)['delete'](key);
  this.size -= result ? 1 : 0;
  return result;
}

module.exports = mapCacheDelete;

},{"./_getMapData":104}],133:[function(require,module,exports){
var getMapData = require('./_getMapData');

/**
 * Gets the map value for `key`.
 *
 * @private
 * @name get
 * @memberOf MapCache
 * @param {string} key The key of the value to get.
 * @returns {*} Returns the entry value.
 */
function mapCacheGet(key) {
  return getMapData(this, key).get(key);
}

module.exports = mapCacheGet;

},{"./_getMapData":104}],134:[function(require,module,exports){
var getMapData = require('./_getMapData');

/**
 * Checks if a map value for `key` exists.
 *
 * @private
 * @name has
 * @memberOf MapCache
 * @param {string} key The key of the entry to check.
 * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
 */
function mapCacheHas(key) {
  return getMapData(this, key).has(key);
}

module.exports = mapCacheHas;

},{"./_getMapData":104}],135:[function(require,module,exports){
var getMapData = require('./_getMapData');

/**
 * Sets the map `key` to `value`.
 *
 * @private
 * @name set
 * @memberOf MapCache
 * @param {string} key The key of the value to set.
 * @param {*} value The value to set.
 * @returns {Object} Returns the map cache instance.
 */
function mapCacheSet(key, value) {
  var data = getMapData(this, key),
      size = data.size;

  data.set(key, value);
  this.size += data.size == size ? 0 : 1;
  return this;
}

module.exports = mapCacheSet;

},{"./_getMapData":104}],136:[function(require,module,exports){
/**
 * Converts `map` to its key-value pairs.
 *
 * @private
 * @param {Object} map The map to convert.
 * @returns {Array} Returns the key-value pairs.
 */
function mapToArray(map) {
  var index = -1,
      result = Array(map.size);

  map.forEach(function(value, key) {
    result[++index] = [key, value];
  });
  return result;
}

module.exports = mapToArray;

},{}],137:[function(require,module,exports){
var memoize = require('./memoize');

/** Used as the maximum memoize cache size. */
var MAX_MEMOIZE_SIZE = 500;

/**
 * A specialized version of `_.memoize` which clears the memoized function's
 * cache when it exceeds `MAX_MEMOIZE_SIZE`.
 *
 * @private
 * @param {Function} func The function to have its output memoized.
 * @returns {Function} Returns the new memoized function.
 */
function memoizeCapped(func) {
  var result = memoize(func, function(key) {
    if (cache.size === MAX_MEMOIZE_SIZE) {
      cache.clear();
    }
    return key;
  });

  var cache = result.cache;
  return result;
}

module.exports = memoizeCapped;

},{"./memoize":170}],138:[function(require,module,exports){
var getNative = require('./_getNative');

/* Built-in method references that are verified to be native. */
var nativeCreate = getNative(Object, 'create');

module.exports = nativeCreate;

},{"./_getNative":105}],139:[function(require,module,exports){
var overArg = require('./_overArg');

/* Built-in method references for those with the same name as other `lodash` methods. */
var nativeKeys = overArg(Object.keys, Object);

module.exports = nativeKeys;

},{"./_overArg":143}],140:[function(require,module,exports){
/**
 * This function is like
 * [`Object.keys`](http://ecma-international.org/ecma-262/7.0/#sec-object.keys)
 * except that it includes inherited enumerable properties.
 *
 * @private
 * @param {Object} object The object to query.
 * @returns {Array} Returns the array of property names.
 */
function nativeKeysIn(object) {
  var result = [];
  if (object != null) {
    for (var key in Object(object)) {
      result.push(key);
    }
  }
  return result;
}

module.exports = nativeKeysIn;

},{}],141:[function(require,module,exports){
var freeGlobal = require('./_freeGlobal');

/** Detect free variable `exports`. */
var freeExports = typeof exports == 'object' && exports && !exports.nodeType && exports;

/** Detect free variable `module`. */
var freeModule = freeExports && typeof module == 'object' && module && !module.nodeType && module;

/** Detect the popular CommonJS extension `module.exports`. */
var moduleExports = freeModule && freeModule.exports === freeExports;

/** Detect free variable `process` from Node.js. */
var freeProcess = moduleExports && freeGlobal.process;

/** Used to access faster Node.js helpers. */
var nodeUtil = (function() {
  try {
    return freeProcess && freeProcess.binding && freeProcess.binding('util');
  } catch (e) {}
}());

module.exports = nodeUtil;

},{"./_freeGlobal":101}],142:[function(require,module,exports){
/** Used for built-in method references. */
var objectProto = Object.prototype;

/**
 * Used to resolve the
 * [`toStringTag`](http://ecma-international.org/ecma-262/7.0/#sec-object.prototype.tostring)
 * of values.
 */
var nativeObjectToString = objectProto.toString;

/**
 * Converts `value` to a string using `Object.prototype.toString`.
 *
 * @private
 * @param {*} value The value to convert.
 * @returns {string} Returns the converted string.
 */
function objectToString(value) {
  return nativeObjectToString.call(value);
}

module.exports = objectToString;

},{}],143:[function(require,module,exports){
/**
 * Creates a unary function that invokes `func` with its argument transformed.
 *
 * @private
 * @param {Function} func The function to wrap.
 * @param {Function} transform The argument transform.
 * @returns {Function} Returns the new function.
 */
function overArg(func, transform) {
  return function(arg) {
    return func(transform(arg));
  };
}

module.exports = overArg;

},{}],144:[function(require,module,exports){
var freeGlobal = require('./_freeGlobal');

/** Detect free variable `self`. */
var freeSelf = typeof self == 'object' && self && self.Object === Object && self;

/** Used as a reference to the global object. */
var root = freeGlobal || freeSelf || Function('return this')();

module.exports = root;

},{"./_freeGlobal":101}],145:[function(require,module,exports){
/**
 * Converts `set` to an array of its values.
 *
 * @private
 * @param {Object} set The set to convert.
 * @returns {Array} Returns the values.
 */
function setToArray(set) {
  var index = -1,
      result = Array(set.size);

  set.forEach(function(value) {
    result[++index] = value;
  });
  return result;
}

module.exports = setToArray;

},{}],146:[function(require,module,exports){
var ListCache = require('./_ListCache');

/**
 * Removes all key-value entries from the stack.
 *
 * @private
 * @name clear
 * @memberOf Stack
 */
function stackClear() {
  this.__data__ = new ListCache;
  this.size = 0;
}

module.exports = stackClear;

},{"./_ListCache":48}],147:[function(require,module,exports){
/**
 * Removes `key` and its value from the stack.
 *
 * @private
 * @name delete
 * @memberOf Stack
 * @param {string} key The key of the value to remove.
 * @returns {boolean} Returns `true` if the entry was removed, else `false`.
 */
function stackDelete(key) {
  var data = this.__data__,
      result = data['delete'](key);

  this.size = data.size;
  return result;
}

module.exports = stackDelete;

},{}],148:[function(require,module,exports){
/**
 * Gets the stack value for `key`.
 *
 * @private
 * @name get
 * @memberOf Stack
 * @param {string} key The key of the value to get.
 * @returns {*} Returns the entry value.
 */
function stackGet(key) {
  return this.__data__.get(key);
}

module.exports = stackGet;

},{}],149:[function(require,module,exports){
/**
 * Checks if a stack value for `key` exists.
 *
 * @private
 * @name has
 * @memberOf Stack
 * @param {string} key The key of the entry to check.
 * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
 */
function stackHas(key) {
  return this.__data__.has(key);
}

module.exports = stackHas;

},{}],150:[function(require,module,exports){
var ListCache = require('./_ListCache'),
    Map = require('./_Map'),
    MapCache = require('./_MapCache');

/** Used as the size to enable large array optimizations. */
var LARGE_ARRAY_SIZE = 200;

/**
 * Sets the stack `key` to `value`.
 *
 * @private
 * @name set
 * @memberOf Stack
 * @param {string} key The key of the value to set.
 * @param {*} value The value to set.
 * @returns {Object} Returns the stack cache instance.
 */
function stackSet(key, value) {
  var data = this.__data__;
  if (data instanceof ListCache) {
    var pairs = data.__data__;
    if (!Map || (pairs.length < LARGE_ARRAY_SIZE - 1)) {
      pairs.push([key, value]);
      this.size = ++data.size;
      return this;
    }
    data = this.__data__ = new MapCache(pairs);
  }
  data.set(key, value);
  this.size = data.size;
  return this;
}

module.exports = stackSet;

},{"./_ListCache":48,"./_Map":49,"./_MapCache":50}],151:[function(require,module,exports){
/**
 * A specialized version of `_.indexOf` which performs strict equality
 * comparisons of values, i.e. `===`.
 *
 * @private
 * @param {Array} array The array to inspect.
 * @param {*} value The value to search for.
 * @param {number} fromIndex The index to search from.
 * @returns {number} Returns the index of the matched value, else `-1`.
 */
function strictIndexOf(array, value, fromIndex) {
  var index = fromIndex - 1,
      length = array.length;

  while (++index < length) {
    if (array[index] === value) {
      return index;
    }
  }
  return -1;
}

module.exports = strictIndexOf;

},{}],152:[function(require,module,exports){
var memoizeCapped = require('./_memoizeCapped');

/** Used to match property names within property paths. */
var reLeadingDot = /^\./,
    rePropName = /[^.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]|(?=(?:\.|\[\])(?:\.|\[\]|$))/g;

/** Used to match backslashes in property paths. */
var reEscapeChar = /\\(\\)?/g;

/**
 * Converts `string` to a property path array.
 *
 * @private
 * @param {string} string The string to convert.
 * @returns {Array} Returns the property path array.
 */
var stringToPath = memoizeCapped(function(string) {
  var result = [];
  if (reLeadingDot.test(string)) {
    result.push('');
  }
  string.replace(rePropName, function(match, number, quote, string) {
    result.push(quote ? string.replace(reEscapeChar, '$1') : (number || match));
  });
  return result;
});

module.exports = stringToPath;

},{"./_memoizeCapped":137}],153:[function(require,module,exports){
var isSymbol = require('./isSymbol');

/** Used as references for various `Number` constants. */
var INFINITY = 1 / 0;

/**
 * Converts `value` to a string key if it's not a string or symbol.
 *
 * @private
 * @param {*} value The value to inspect.
 * @returns {string|symbol} Returns the key.
 */
function toKey(value) {
  if (typeof value == 'string' || isSymbol(value)) {
    return value;
  }
  var result = (value + '');
  return (result == '0' && (1 / value) == -INFINITY) ? '-0' : result;
}

module.exports = toKey;

},{"./isSymbol":166}],154:[function(require,module,exports){
/** Used for built-in method references. */
var funcProto = Function.prototype;

/** Used to resolve the decompiled source of functions. */
var funcToString = funcProto.toString;

/**
 * Converts `func` to its source code.
 *
 * @private
 * @param {Function} func The function to convert.
 * @returns {string} Returns the source code.
 */
function toSource(func) {
  if (func != null) {
    try {
      return funcToString.call(func);
    } catch (e) {}
    try {
      return (func + '');
    } catch (e) {}
  }
  return '';
}

module.exports = toSource;

},{}],155:[function(require,module,exports){
var baseClone = require('./_baseClone');

/** Used to compose bitmasks for cloning. */
var CLONE_DEEP_FLAG = 1,
    CLONE_SYMBOLS_FLAG = 4;

/**
 * This method is like `_.clone` except that it recursively clones `value`.
 *
 * @static
 * @memberOf _
 * @since 1.0.0
 * @category Lang
 * @param {*} value The value to recursively clone.
 * @returns {*} Returns the deep cloned value.
 * @see _.clone
 * @example
 *
 * var objects = [{ 'a': 1 }, { 'b': 2 }];
 *
 * var deep = _.cloneDeep(objects);
 * console.log(deep[0] === objects[0]);
 * // => false
 */
function cloneDeep(value) {
  return baseClone(value, CLONE_DEEP_FLAG | CLONE_SYMBOLS_FLAG);
}

module.exports = cloneDeep;

},{"./_baseClone":70}],156:[function(require,module,exports){
/**
 * Performs a
 * [`SameValueZero`](http://ecma-international.org/ecma-262/7.0/#sec-samevaluezero)
 * comparison between two values to determine if they are equivalent.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to compare.
 * @param {*} other The other value to compare.
 * @returns {boolean} Returns `true` if the values are equivalent, else `false`.
 * @example
 *
 * var object = { 'a': 1 };
 * var other = { 'a': 1 };
 *
 * _.eq(object, object);
 * // => true
 *
 * _.eq(object, other);
 * // => false
 *
 * _.eq('a', 'a');
 * // => true
 *
 * _.eq('a', Object('a'));
 * // => false
 *
 * _.eq(NaN, NaN);
 * // => true
 */
function eq(value, other) {
  return value === other || (value !== value && other !== other);
}

module.exports = eq;

},{}],157:[function(require,module,exports){
var baseHasIn = require('./_baseHasIn'),
    hasPath = require('./_hasPath');

/**
 * Checks if `path` is a direct or inherited property of `object`.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Object
 * @param {Object} object The object to query.
 * @param {Array|string} path The path to check.
 * @returns {boolean} Returns `true` if `path` exists, else `false`.
 * @example
 *
 * var object = _.create({ 'a': _.create({ 'b': 2 }) });
 *
 * _.hasIn(object, 'a');
 * // => true
 *
 * _.hasIn(object, 'a.b');
 * // => true
 *
 * _.hasIn(object, ['a', 'b']);
 * // => true
 *
 * _.hasIn(object, 'b');
 * // => false
 */
function hasIn(object, path) {
  return object != null && hasPath(object, path, baseHasIn);
}

module.exports = hasIn;

},{"./_baseHasIn":75,"./_hasPath":112}],158:[function(require,module,exports){
var baseIsArguments = require('./_baseIsArguments'),
    isObjectLike = require('./isObjectLike');

/** Used for built-in method references. */
var objectProto = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/** Built-in value references. */
var propertyIsEnumerable = objectProto.propertyIsEnumerable;

/**
 * Checks if `value` is likely an `arguments` object.
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an `arguments` object,
 *  else `false`.
 * @example
 *
 * _.isArguments(function() { return arguments; }());
 * // => true
 *
 * _.isArguments([1, 2, 3]);
 * // => false
 */
var isArguments = baseIsArguments(function() { return arguments; }()) ? baseIsArguments : function(value) {
  return isObjectLike(value) && hasOwnProperty.call(value, 'callee') &&
    !propertyIsEnumerable.call(value, 'callee');
};

module.exports = isArguments;

},{"./_baseIsArguments":77,"./isObjectLike":165}],159:[function(require,module,exports){
/**
 * Checks if `value` is classified as an `Array` object.
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an array, else `false`.
 * @example
 *
 * _.isArray([1, 2, 3]);
 * // => true
 *
 * _.isArray(document.body.children);
 * // => false
 *
 * _.isArray('abc');
 * // => false
 *
 * _.isArray(_.noop);
 * // => false
 */
var isArray = Array.isArray;

module.exports = isArray;

},{}],160:[function(require,module,exports){
var isFunction = require('./isFunction'),
    isLength = require('./isLength');

/**
 * Checks if `value` is array-like. A value is considered array-like if it's
 * not a function and has a `value.length` that's an integer greater than or
 * equal to `0` and less than or equal to `Number.MAX_SAFE_INTEGER`.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is array-like, else `false`.
 * @example
 *
 * _.isArrayLike([1, 2, 3]);
 * // => true
 *
 * _.isArrayLike(document.body.children);
 * // => true
 *
 * _.isArrayLike('abc');
 * // => true
 *
 * _.isArrayLike(_.noop);
 * // => false
 */
function isArrayLike(value) {
  return value != null && isLength(value.length) && !isFunction(value);
}

module.exports = isArrayLike;

},{"./isFunction":162,"./isLength":163}],161:[function(require,module,exports){
var root = require('./_root'),
    stubFalse = require('./stubFalse');

/** Detect free variable `exports`. */
var freeExports = typeof exports == 'object' && exports && !exports.nodeType && exports;

/** Detect free variable `module`. */
var freeModule = freeExports && typeof module == 'object' && module && !module.nodeType && module;

/** Detect the popular CommonJS extension `module.exports`. */
var moduleExports = freeModule && freeModule.exports === freeExports;

/** Built-in value references. */
var Buffer = moduleExports ? root.Buffer : undefined;

/* Built-in method references for those with the same name as other `lodash` methods. */
var nativeIsBuffer = Buffer ? Buffer.isBuffer : undefined;

/**
 * Checks if `value` is a buffer.
 *
 * @static
 * @memberOf _
 * @since 4.3.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a buffer, else `false`.
 * @example
 *
 * _.isBuffer(new Buffer(2));
 * // => true
 *
 * _.isBuffer(new Uint8Array(2));
 * // => false
 */
var isBuffer = nativeIsBuffer || stubFalse;

module.exports = isBuffer;

},{"./_root":144,"./stubFalse":173}],162:[function(require,module,exports){
var baseGetTag = require('./_baseGetTag'),
    isObject = require('./isObject');

/** `Object#toString` result references. */
var asyncTag = '[object AsyncFunction]',
    funcTag = '[object Function]',
    genTag = '[object GeneratorFunction]',
    proxyTag = '[object Proxy]';

/**
 * Checks if `value` is classified as a `Function` object.
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a function, else `false`.
 * @example
 *
 * _.isFunction(_);
 * // => true
 *
 * _.isFunction(/abc/);
 * // => false
 */
function isFunction(value) {
  if (!isObject(value)) {
    return false;
  }
  // The use of `Object#toString` avoids issues with the `typeof` operator
  // in Safari 9 which returns 'object' for typed arrays and other constructors.
  var tag = baseGetTag(value);
  return tag == funcTag || tag == genTag || tag == asyncTag || tag == proxyTag;
}

module.exports = isFunction;

},{"./_baseGetTag":74,"./isObject":164}],163:[function(require,module,exports){
/** Used as references for various `Number` constants. */
var MAX_SAFE_INTEGER = 9007199254740991;

/**
 * Checks if `value` is a valid array-like length.
 *
 * **Note:** This method is loosely based on
 * [`ToLength`](http://ecma-international.org/ecma-262/7.0/#sec-tolength).
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a valid length, else `false`.
 * @example
 *
 * _.isLength(3);
 * // => true
 *
 * _.isLength(Number.MIN_VALUE);
 * // => false
 *
 * _.isLength(Infinity);
 * // => false
 *
 * _.isLength('3');
 * // => false
 */
function isLength(value) {
  return typeof value == 'number' &&
    value > -1 && value % 1 == 0 && value <= MAX_SAFE_INTEGER;
}

module.exports = isLength;

},{}],164:[function(require,module,exports){
/**
 * Checks if `value` is the
 * [language type](http://www.ecma-international.org/ecma-262/7.0/#sec-ecmascript-language-types)
 * of `Object`. (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an object, else `false`.
 * @example
 *
 * _.isObject({});
 * // => true
 *
 * _.isObject([1, 2, 3]);
 * // => true
 *
 * _.isObject(_.noop);
 * // => true
 *
 * _.isObject(null);
 * // => false
 */
function isObject(value) {
  var type = typeof value;
  return value != null && (type == 'object' || type == 'function');
}

module.exports = isObject;

},{}],165:[function(require,module,exports){
/**
 * Checks if `value` is object-like. A value is object-like if it's not `null`
 * and has a `typeof` result of "object".
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is object-like, else `false`.
 * @example
 *
 * _.isObjectLike({});
 * // => true
 *
 * _.isObjectLike([1, 2, 3]);
 * // => true
 *
 * _.isObjectLike(_.noop);
 * // => false
 *
 * _.isObjectLike(null);
 * // => false
 */
function isObjectLike(value) {
  return value != null && typeof value == 'object';
}

module.exports = isObjectLike;

},{}],166:[function(require,module,exports){
var baseGetTag = require('./_baseGetTag'),
    isObjectLike = require('./isObjectLike');

/** `Object#toString` result references. */
var symbolTag = '[object Symbol]';

/**
 * Checks if `value` is classified as a `Symbol` primitive or object.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a symbol, else `false`.
 * @example
 *
 * _.isSymbol(Symbol.iterator);
 * // => true
 *
 * _.isSymbol('abc');
 * // => false
 */
function isSymbol(value) {
  return typeof value == 'symbol' ||
    (isObjectLike(value) && baseGetTag(value) == symbolTag);
}

module.exports = isSymbol;

},{"./_baseGetTag":74,"./isObjectLike":165}],167:[function(require,module,exports){
var baseIsTypedArray = require('./_baseIsTypedArray'),
    baseUnary = require('./_baseUnary'),
    nodeUtil = require('./_nodeUtil');

/* Node.js helper references. */
var nodeIsTypedArray = nodeUtil && nodeUtil.isTypedArray;

/**
 * Checks if `value` is classified as a typed array.
 *
 * @static
 * @memberOf _
 * @since 3.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a typed array, else `false`.
 * @example
 *
 * _.isTypedArray(new Uint8Array);
 * // => true
 *
 * _.isTypedArray([]);
 * // => false
 */
var isTypedArray = nodeIsTypedArray ? baseUnary(nodeIsTypedArray) : baseIsTypedArray;

module.exports = isTypedArray;

},{"./_baseIsTypedArray":80,"./_baseUnary":85,"./_nodeUtil":141}],168:[function(require,module,exports){
var arrayLikeKeys = require('./_arrayLikeKeys'),
    baseKeys = require('./_baseKeys'),
    isArrayLike = require('./isArrayLike');

/**
 * Creates an array of the own enumerable property names of `object`.
 *
 * **Note:** Non-object values are coerced to objects. See the
 * [ES spec](http://ecma-international.org/ecma-262/7.0/#sec-object.keys)
 * for more details.
 *
 * @static
 * @since 0.1.0
 * @memberOf _
 * @category Object
 * @param {Object} object The object to query.
 * @returns {Array} Returns the array of property names.
 * @example
 *
 * function Foo() {
 *   this.a = 1;
 *   this.b = 2;
 * }
 *
 * Foo.prototype.c = 3;
 *
 * _.keys(new Foo);
 * // => ['a', 'b'] (iteration order is not guaranteed)
 *
 * _.keys('hi');
 * // => ['0', '1']
 */
function keys(object) {
  return isArrayLike(object) ? arrayLikeKeys(object) : baseKeys(object);
}

module.exports = keys;

},{"./_arrayLikeKeys":61,"./_baseKeys":81,"./isArrayLike":160}],169:[function(require,module,exports){
var arrayLikeKeys = require('./_arrayLikeKeys'),
    baseKeysIn = require('./_baseKeysIn'),
    isArrayLike = require('./isArrayLike');

/**
 * Creates an array of the own and inherited enumerable property names of `object`.
 *
 * **Note:** Non-object values are coerced to objects.
 *
 * @static
 * @memberOf _
 * @since 3.0.0
 * @category Object
 * @param {Object} object The object to query.
 * @returns {Array} Returns the array of property names.
 * @example
 *
 * function Foo() {
 *   this.a = 1;
 *   this.b = 2;
 * }
 *
 * Foo.prototype.c = 3;
 *
 * _.keysIn(new Foo);
 * // => ['a', 'b', 'c'] (iteration order is not guaranteed)
 */
function keysIn(object) {
  return isArrayLike(object) ? arrayLikeKeys(object, true) : baseKeysIn(object);
}

module.exports = keysIn;

},{"./_arrayLikeKeys":61,"./_baseKeysIn":82,"./isArrayLike":160}],170:[function(require,module,exports){
var MapCache = require('./_MapCache');

/** Error message constants. */
var FUNC_ERROR_TEXT = 'Expected a function';

/**
 * Creates a function that memoizes the result of `func`. If `resolver` is
 * provided, it determines the cache key for storing the result based on the
 * arguments provided to the memoized function. By default, the first argument
 * provided to the memoized function is used as the map cache key. The `func`
 * is invoked with the `this` binding of the memoized function.
 *
 * **Note:** The cache is exposed as the `cache` property on the memoized
 * function. Its creation may be customized by replacing the `_.memoize.Cache`
 * constructor with one whose instances implement the
 * [`Map`](http://ecma-international.org/ecma-262/7.0/#sec-properties-of-the-map-prototype-object)
 * method interface of `clear`, `delete`, `get`, `has`, and `set`.
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Function
 * @param {Function} func The function to have its output memoized.
 * @param {Function} [resolver] The function to resolve the cache key.
 * @returns {Function} Returns the new memoized function.
 * @example
 *
 * var object = { 'a': 1, 'b': 2 };
 * var other = { 'c': 3, 'd': 4 };
 *
 * var values = _.memoize(_.values);
 * values(object);
 * // => [1, 2]
 *
 * values(other);
 * // => [3, 4]
 *
 * object.a = 2;
 * values(object);
 * // => [1, 2]
 *
 * // Modify the result cache.
 * values.cache.set(object, ['a', 'b']);
 * values(object);
 * // => ['a', 'b']
 *
 * // Replace `_.memoize.Cache`.
 * _.memoize.Cache = WeakMap;
 */
function memoize(func, resolver) {
  if (typeof func != 'function' || (resolver != null && typeof resolver != 'function')) {
    throw new TypeError(FUNC_ERROR_TEXT);
  }
  var memoized = function() {
    var args = arguments,
        key = resolver ? resolver.apply(this, args) : args[0],
        cache = memoized.cache;

    if (cache.has(key)) {
      return cache.get(key);
    }
    var result = func.apply(this, args);
    memoized.cache = cache.set(key, result) || cache;
    return result;
  };
  memoized.cache = new (memoize.Cache || MapCache);
  return memoized;
}

// Expose `MapCache`.
memoize.Cache = MapCache;

module.exports = memoize;

},{"./_MapCache":50}],171:[function(require,module,exports){
/**
 * This method returns `undefined`.
 *
 * @static
 * @memberOf _
 * @since 2.3.0
 * @category Util
 * @example
 *
 * _.times(2, _.noop);
 * // => [undefined, undefined]
 */
function noop() {
  // No operation performed.
}

module.exports = noop;

},{}],172:[function(require,module,exports){
/**
 * This method returns a new empty array.
 *
 * @static
 * @memberOf _
 * @since 4.13.0
 * @category Util
 * @returns {Array} Returns the new empty array.
 * @example
 *
 * var arrays = _.times(2, _.stubArray);
 *
 * console.log(arrays);
 * // => [[], []]
 *
 * console.log(arrays[0] === arrays[1]);
 * // => false
 */
function stubArray() {
  return [];
}

module.exports = stubArray;

},{}],173:[function(require,module,exports){
/**
 * This method returns `false`.
 *
 * @static
 * @memberOf _
 * @since 4.13.0
 * @category Util
 * @returns {boolean} Returns `false`.
 * @example
 *
 * _.times(2, _.stubFalse);
 * // => [false, false]
 */
function stubFalse() {
  return false;
}

module.exports = stubFalse;

},{}],174:[function(require,module,exports){
var baseToString = require('./_baseToString');

/**
 * Converts `value` to a string. An empty string is returned for `null`
 * and `undefined` values. The sign of `-0` is preserved.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to convert.
 * @returns {string} Returns the converted string.
 * @example
 *
 * _.toString(null);
 * // => ''
 *
 * _.toString(-0);
 * // => '-0'
 *
 * _.toString([1, 2, 3]);
 * // => '1,2,3'
 */
function toString(value) {
  return value == null ? '' : baseToString(value);
}

module.exports = toString;

},{"./_baseToString":84}],175:[function(require,module,exports){
/**
 * Helpers.
 */

var s = 1000;
var m = s * 60;
var h = m * 60;
var d = h * 24;
var y = d * 365.25;

/**
 * Parse or format the given `val`.
 *
 * Options:
 *
 *  - `long` verbose formatting [false]
 *
 * @param {String|Number} val
 * @param {Object} [options]
 * @throws {Error} throw an error if val is not a non-empty string or a number
 * @return {String|Number}
 * @api public
 */

module.exports = function(val, options) {
  options = options || {};
  var type = typeof val;
  if (type === 'string' && val.length > 0) {
    return parse(val);
  } else if (type === 'number' && isNaN(val) === false) {
    return options.long ? fmtLong(val) : fmtShort(val);
  }
  throw new Error(
    'val is not a non-empty string or a valid number. val=' +
      JSON.stringify(val)
  );
};

/**
 * Parse the given `str` and return milliseconds.
 *
 * @param {String} str
 * @return {Number}
 * @api private
 */

function parse(str) {
  str = String(str);
  if (str.length > 100) {
    return;
  }
  var match = /^((?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|years?|yrs?|y)?$/i.exec(
    str
  );
  if (!match) {
    return;
  }
  var n = parseFloat(match[1]);
  var type = (match[2] || 'ms').toLowerCase();
  switch (type) {
    case 'years':
    case 'year':
    case 'yrs':
    case 'yr':
    case 'y':
      return n * y;
    case 'days':
    case 'day':
    case 'd':
      return n * d;
    case 'hours':
    case 'hour':
    case 'hrs':
    case 'hr':
    case 'h':
      return n * h;
    case 'minutes':
    case 'minute':
    case 'mins':
    case 'min':
    case 'm':
      return n * m;
    case 'seconds':
    case 'second':
    case 'secs':
    case 'sec':
    case 's':
      return n * s;
    case 'milliseconds':
    case 'millisecond':
    case 'msecs':
    case 'msec':
    case 'ms':
      return n;
    default:
      return undefined;
  }
}

/**
 * Short format for `ms`.
 *
 * @param {Number} ms
 * @return {String}
 * @api private
 */

function fmtShort(ms) {
  if (ms >= d) {
    return Math.round(ms / d) + 'd';
  }
  if (ms >= h) {
    return Math.round(ms / h) + 'h';
  }
  if (ms >= m) {
    return Math.round(ms / m) + 'm';
  }
  if (ms >= s) {
    return Math.round(ms / s) + 's';
  }
  return ms + 'ms';
}

/**
 * Long format for `ms`.
 *
 * @param {Number} ms
 * @return {String}
 * @api private
 */

function fmtLong(ms) {
  return plural(ms, d, 'day') ||
    plural(ms, h, 'hour') ||
    plural(ms, m, 'minute') ||
    plural(ms, s, 'second') ||
    ms + ' ms';
}

/**
 * Pluralization helper.
 */

function plural(ms, n, name) {
  if (ms < n) {
    return;
  }
  if (ms < n * 1.5) {
    return Math.floor(ms / n) + ' ' + name;
  }
  return Math.ceil(ms / n) + ' ' + name + 's';
}

},{}],176:[function(require,module,exports){
var trim = require('trim')
  , forEach = require('for-each')
  , isArray = function(arg) {
      return Object.prototype.toString.call(arg) === '[object Array]';
    }

module.exports = function (headers) {
  if (!headers)
    return {}

  var result = {}

  forEach(
      trim(headers).split('\n')
    , function (row) {
        var index = row.indexOf(':')
          , key = trim(row.slice(0, index)).toLowerCase()
          , value = trim(row.slice(index + 1))

        if (typeof(result[key]) === 'undefined') {
          result[key] = value
        } else if (isArray(result[key])) {
          result[key].push(value)
        } else {
          result[key] = [ result[key], value ]
        }
      }
  )

  return result
}
},{"for-each":38,"trim":194}],177:[function(require,module,exports){
/**
 * Compiles a querystring
 * Returns string representation of the object
 *
 * @param {Object}
 * @api private
 */

exports.encode = function (obj) {
  var str = '';

  for (var i in obj) {
    if (obj.hasOwnProperty(i)) {
      if (str.length) str += '&';
      str += encodeURIComponent(i) + '=' + encodeURIComponent(obj[i]);
    }
  }

  return str;
};

/**
 * Parses a simple querystring into an object
 *
 * @param {String} qs
 * @api private
 */

exports.decode = function(qs){
  var qry = {};
  var pairs = qs.split('&');
  for (var i = 0, l = pairs.length; i < l; i++) {
    var pair = pairs[i].split('=');
    qry[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1]);
  }
  return qry;
};

},{}],178:[function(require,module,exports){
/**
 * Parses an URI
 *
 * @author Steven Levithan <stevenlevithan.com> (MIT license)
 * @api private
 */

var re = /^(?:(?![^:@]+:[^:@\/]*@)(http|https|ws|wss):\/\/)?((?:(([^:@]*)(?::([^:@]*))?)?@)?((?:[a-f0-9]{0,4}:){2,7}[a-f0-9]{0,4}|[^:\/?#]*)(?::(\d*))?)(((\/(?:[^?#](?![^?#\/]*\.[^?#\/.]+(?:[?#]|$)))*\/?)?([^?#\/]*))(?:\?([^#]*))?(?:#(.*))?)/;

var parts = [
    'source', 'protocol', 'authority', 'userInfo', 'user', 'password', 'host', 'port', 'relative', 'path', 'directory', 'file', 'query', 'anchor'
];

module.exports = function parseuri(str) {
    var src = str,
        b = str.indexOf('['),
        e = str.indexOf(']');

    if (b != -1 && e != -1) {
        str = str.substring(0, b) + str.substring(b, e).replace(/:/g, ';') + str.substring(e, str.length);
    }

    var m = re.exec(str || ''),
        uri = {},
        i = 14;

    while (i--) {
        uri[parts[i]] = m[i] || '';
    }

    if (b != -1 && e != -1) {
        uri.source = src;
        uri.host = uri.host.substring(1, uri.host.length - 1).replace(/;/g, ':');
        uri.authority = uri.authority.replace('[', '').replace(']', '').replace(/;/g, ':');
        uri.ipv6uri = true;
    }

    return uri;
};

},{}],179:[function(require,module,exports){
(function (process){
// Generated by CoffeeScript 1.12.2
(function() {
  var getNanoSeconds, hrtime, loadTime, moduleLoadTime, nodeLoadTime, upTime;

  if ((typeof performance !== "undefined" && performance !== null) && performance.now) {
    module.exports = function() {
      return performance.now();
    };
  } else if ((typeof process !== "undefined" && process !== null) && process.hrtime) {
    module.exports = function() {
      return (getNanoSeconds() - nodeLoadTime) / 1e6;
    };
    hrtime = process.hrtime;
    getNanoSeconds = function() {
      var hr;
      hr = hrtime();
      return hr[0] * 1e9 + hr[1];
    };
    moduleLoadTime = getNanoSeconds();
    upTime = process.uptime() * 1e9;
    nodeLoadTime = moduleLoadTime - upTime;
  } else if (Date.now) {
    module.exports = function() {
      return Date.now() - loadTime;
    };
    loadTime = Date.now();
  } else {
    module.exports = function() {
      return new Date().getTime() - loadTime;
    };
    loadTime = new Date().getTime();
  }

}).call(this);



}).call(this,require('_process'))

},{"_process":180}],180:[function(require,module,exports){
// shim for using process in browser
var process = module.exports = {};

// cached from whatever global is present so that test runners that stub it
// don't break things.  But we need to wrap it in a try catch in case it is
// wrapped in strict mode code which doesn't define any globals.  It's inside a
// function because try/catches deoptimize in certain engines.

var cachedSetTimeout;
var cachedClearTimeout;

function defaultSetTimout() {
    throw new Error('setTimeout has not been defined');
}
function defaultClearTimeout () {
    throw new Error('clearTimeout has not been defined');
}
(function () {
    try {
        if (typeof setTimeout === 'function') {
            cachedSetTimeout = setTimeout;
        } else {
            cachedSetTimeout = defaultSetTimout;
        }
    } catch (e) {
        cachedSetTimeout = defaultSetTimout;
    }
    try {
        if (typeof clearTimeout === 'function') {
            cachedClearTimeout = clearTimeout;
        } else {
            cachedClearTimeout = defaultClearTimeout;
        }
    } catch (e) {
        cachedClearTimeout = defaultClearTimeout;
    }
} ())
function runTimeout(fun) {
    if (cachedSetTimeout === setTimeout) {
        //normal enviroments in sane situations
        return setTimeout(fun, 0);
    }
    // if setTimeout wasn't available but was latter defined
    if ((cachedSetTimeout === defaultSetTimout || !cachedSetTimeout) && setTimeout) {
        cachedSetTimeout = setTimeout;
        return setTimeout(fun, 0);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedSetTimeout(fun, 0);
    } catch(e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't trust the global object when called normally
            return cachedSetTimeout.call(null, fun, 0);
        } catch(e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error
            return cachedSetTimeout.call(this, fun, 0);
        }
    }


}
function runClearTimeout(marker) {
    if (cachedClearTimeout === clearTimeout) {
        //normal enviroments in sane situations
        return clearTimeout(marker);
    }
    // if clearTimeout wasn't available but was latter defined
    if ((cachedClearTimeout === defaultClearTimeout || !cachedClearTimeout) && clearTimeout) {
        cachedClearTimeout = clearTimeout;
        return clearTimeout(marker);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedClearTimeout(marker);
    } catch (e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't  trust the global object when called normally
            return cachedClearTimeout.call(null, marker);
        } catch (e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error.
            // Some versions of I.E. have different rules for clearTimeout vs setTimeout
            return cachedClearTimeout.call(this, marker);
        }
    }



}
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    if (!draining || !currentQueue) {
        return;
    }
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = runTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            if (currentQueue) {
                currentQueue[queueIndex].run();
            }
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    runClearTimeout(timeout);
}

process.nextTick = function (fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        runTimeout(drainQueue);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;
process.prependListener = noop;
process.prependOnceListener = noop;

process.listeners = function (name) { return [] }

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}],181:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

// If obj.hasOwnProperty has been overridden, then calling
// obj.hasOwnProperty(prop) will break.
// See: https://github.com/joyent/node/issues/1707
function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

module.exports = function(qs, sep, eq, options) {
  sep = sep || '&';
  eq = eq || '=';
  var obj = {};

  if (typeof qs !== 'string' || qs.length === 0) {
    return obj;
  }

  var regexp = /\+/g;
  qs = qs.split(sep);

  var maxKeys = 1000;
  if (options && typeof options.maxKeys === 'number') {
    maxKeys = options.maxKeys;
  }

  var len = qs.length;
  // maxKeys <= 0 means that we should not limit keys count
  if (maxKeys > 0 && len > maxKeys) {
    len = maxKeys;
  }

  for (var i = 0; i < len; ++i) {
    var x = qs[i].replace(regexp, '%20'),
        idx = x.indexOf(eq),
        kstr, vstr, k, v;

    if (idx >= 0) {
      kstr = x.substr(0, idx);
      vstr = x.substr(idx + 1);
    } else {
      kstr = x;
      vstr = '';
    }

    k = decodeURIComponent(kstr);
    v = decodeURIComponent(vstr);

    if (!hasOwnProperty(obj, k)) {
      obj[k] = v;
    } else if (isArray(obj[k])) {
      obj[k].push(v);
    } else {
      obj[k] = [obj[k], v];
    }
  }

  return obj;
};

var isArray = Array.isArray || function (xs) {
  return Object.prototype.toString.call(xs) === '[object Array]';
};

},{}],182:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

var stringifyPrimitive = function(v) {
  switch (typeof v) {
    case 'string':
      return v;

    case 'boolean':
      return v ? 'true' : 'false';

    case 'number':
      return isFinite(v) ? v : '';

    default:
      return '';
  }
};

module.exports = function(obj, sep, eq, name) {
  sep = sep || '&';
  eq = eq || '=';
  if (obj === null) {
    obj = undefined;
  }

  if (typeof obj === 'object') {
    return map(objectKeys(obj), function(k) {
      var ks = encodeURIComponent(stringifyPrimitive(k)) + eq;
      if (isArray(obj[k])) {
        return map(obj[k], function(v) {
          return ks + encodeURIComponent(stringifyPrimitive(v));
        }).join(sep);
      } else {
        return ks + encodeURIComponent(stringifyPrimitive(obj[k]));
      }
    }).join(sep);

  }

  if (!name) return '';
  return encodeURIComponent(stringifyPrimitive(name)) + eq +
         encodeURIComponent(stringifyPrimitive(obj));
};

var isArray = Array.isArray || function (xs) {
  return Object.prototype.toString.call(xs) === '[object Array]';
};

function map (xs, f) {
  if (xs.map) return xs.map(f);
  var res = [];
  for (var i = 0; i < xs.length; i++) {
    res.push(f(xs[i], i));
  }
  return res;
}

var objectKeys = Object.keys || function (obj) {
  var res = [];
  for (var key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) res.push(key);
  }
  return res;
};

},{}],183:[function(require,module,exports){
'use strict';

exports.decode = exports.parse = require('./decode');
exports.encode = exports.stringify = require('./encode');

},{"./decode":181,"./encode":182}],184:[function(require,module,exports){

/**
 * Module dependencies.
 */

var url = require('./url');
var parser = require('socket.io-parser');
var Manager = require('./manager');
var debug = require('debug')('socket.io-client');

/**
 * Module exports.
 */

module.exports = exports = lookup;

/**
 * Managers cache.
 */

var cache = exports.managers = {};

/**
 * Looks up an existing `Manager` for multiplexing.
 * If the user summons:
 *
 *   `io('http://localhost/a');`
 *   `io('http://localhost/b');`
 *
 * We reuse the existing instance based on same scheme/port/host,
 * and we initialize sockets for each namespace.
 *
 * @api public
 */

function lookup (uri, opts) {
  if (typeof uri === 'object') {
    opts = uri;
    uri = undefined;
  }

  opts = opts || {};

  var parsed = url(uri);
  var source = parsed.source;
  var id = parsed.id;
  var path = parsed.path;
  var sameNamespace = cache[id] && path in cache[id].nsps;
  var newConnection = opts.forceNew || opts['force new connection'] ||
                      false === opts.multiplex || sameNamespace;

  var io;

  if (newConnection) {
    debug('ignoring socket cache for %s', source);
    io = Manager(source, opts);
  } else {
    if (!cache[id]) {
      debug('new io instance for %s', source);
      cache[id] = Manager(source, opts);
    }
    io = cache[id];
  }
  if (parsed.query && !opts.query) {
    opts.query = parsed.query;
  }
  return io.socket(parsed.path, opts);
}

/**
 * Protocol version.
 *
 * @api public
 */

exports.protocol = parser.protocol;

/**
 * `connect`.
 *
 * @param {String} uri
 * @api public
 */

exports.connect = lookup;

/**
 * Expose constructors for standalone build.
 *
 * @api public
 */

exports.Manager = require('./manager');
exports.Socket = require('./socket');

},{"./manager":185,"./socket":187,"./url":188,"debug":23,"socket.io-parser":190}],185:[function(require,module,exports){

/**
 * Module dependencies.
 */

var eio = require('engine.io-client');
var Socket = require('./socket');
var Emitter = require('component-emitter');
var parser = require('socket.io-parser');
var on = require('./on');
var bind = require('component-bind');
var debug = require('debug')('socket.io-client:manager');
var indexOf = require('indexof');
var Backoff = require('backo2');

/**
 * IE6+ hasOwnProperty
 */

var has = Object.prototype.hasOwnProperty;

/**
 * Module exports
 */

module.exports = Manager;

/**
 * `Manager` constructor.
 *
 * @param {String} engine instance or engine uri/opts
 * @param {Object} options
 * @api public
 */

function Manager (uri, opts) {
  if (!(this instanceof Manager)) return new Manager(uri, opts);
  if (uri && ('object' === typeof uri)) {
    opts = uri;
    uri = undefined;
  }
  opts = opts || {};

  opts.path = opts.path || '/socket.io';
  this.nsps = {};
  this.subs = [];
  this.opts = opts;
  this.reconnection(opts.reconnection !== false);
  this.reconnectionAttempts(opts.reconnectionAttempts || Infinity);
  this.reconnectionDelay(opts.reconnectionDelay || 1000);
  this.reconnectionDelayMax(opts.reconnectionDelayMax || 5000);
  this.randomizationFactor(opts.randomizationFactor || 0.5);
  this.backoff = new Backoff({
    min: this.reconnectionDelay(),
    max: this.reconnectionDelayMax(),
    jitter: this.randomizationFactor()
  });
  this.timeout(null == opts.timeout ? 20000 : opts.timeout);
  this.readyState = 'closed';
  this.uri = uri;
  this.connecting = [];
  this.lastPing = null;
  this.encoding = false;
  this.packetBuffer = [];
  var _parser = opts.parser || parser;
  this.encoder = new _parser.Encoder();
  this.decoder = new _parser.Decoder();
  this.autoConnect = opts.autoConnect !== false;
  if (this.autoConnect) this.open();
}

/**
 * Propagate given event to sockets and emit on `this`
 *
 * @api private
 */

Manager.prototype.emitAll = function () {
  this.emit.apply(this, arguments);
  for (var nsp in this.nsps) {
    if (has.call(this.nsps, nsp)) {
      this.nsps[nsp].emit.apply(this.nsps[nsp], arguments);
    }
  }
};

/**
 * Update `socket.id` of all sockets
 *
 * @api private
 */

Manager.prototype.updateSocketIds = function () {
  for (var nsp in this.nsps) {
    if (has.call(this.nsps, nsp)) {
      this.nsps[nsp].id = this.generateId(nsp);
    }
  }
};

/**
 * generate `socket.id` for the given `nsp`
 *
 * @param {String} nsp
 * @return {String}
 * @api private
 */

Manager.prototype.generateId = function (nsp) {
  return (nsp === '/' ? '' : (nsp + '#')) + this.engine.id;
};

/**
 * Mix in `Emitter`.
 */

Emitter(Manager.prototype);

/**
 * Sets the `reconnection` config.
 *
 * @param {Boolean} true/false if it should automatically reconnect
 * @return {Manager} self or value
 * @api public
 */

Manager.prototype.reconnection = function (v) {
  if (!arguments.length) return this._reconnection;
  this._reconnection = !!v;
  return this;
};

/**
 * Sets the reconnection attempts config.
 *
 * @param {Number} max reconnection attempts before giving up
 * @return {Manager} self or value
 * @api public
 */

Manager.prototype.reconnectionAttempts = function (v) {
  if (!arguments.length) return this._reconnectionAttempts;
  this._reconnectionAttempts = v;
  return this;
};

/**
 * Sets the delay between reconnections.
 *
 * @param {Number} delay
 * @return {Manager} self or value
 * @api public
 */

Manager.prototype.reconnectionDelay = function (v) {
  if (!arguments.length) return this._reconnectionDelay;
  this._reconnectionDelay = v;
  this.backoff && this.backoff.setMin(v);
  return this;
};

Manager.prototype.randomizationFactor = function (v) {
  if (!arguments.length) return this._randomizationFactor;
  this._randomizationFactor = v;
  this.backoff && this.backoff.setJitter(v);
  return this;
};

/**
 * Sets the maximum delay between reconnections.
 *
 * @param {Number} delay
 * @return {Manager} self or value
 * @api public
 */

Manager.prototype.reconnectionDelayMax = function (v) {
  if (!arguments.length) return this._reconnectionDelayMax;
  this._reconnectionDelayMax = v;
  this.backoff && this.backoff.setMax(v);
  return this;
};

/**
 * Sets the connection timeout. `false` to disable
 *
 * @return {Manager} self or value
 * @api public
 */

Manager.prototype.timeout = function (v) {
  if (!arguments.length) return this._timeout;
  this._timeout = v;
  return this;
};

/**
 * Starts trying to reconnect if reconnection is enabled and we have not
 * started reconnecting yet
 *
 * @api private
 */

Manager.prototype.maybeReconnectOnOpen = function () {
  // Only try to reconnect if it's the first time we're connecting
  if (!this.reconnecting && this._reconnection && this.backoff.attempts === 0) {
    // keeps reconnection from firing twice for the same reconnection loop
    this.reconnect();
  }
};

/**
 * Sets the current transport `socket`.
 *
 * @param {Function} optional, callback
 * @return {Manager} self
 * @api public
 */

Manager.prototype.open =
Manager.prototype.connect = function (fn, opts) {
  debug('readyState %s', this.readyState);
  if (~this.readyState.indexOf('open')) return this;

  debug('opening %s', this.uri);
  this.engine = eio(this.uri, this.opts);
  var socket = this.engine;
  var self = this;
  this.readyState = 'opening';
  this.skipReconnect = false;

  // emit `open`
  var openSub = on(socket, 'open', function () {
    self.onopen();
    fn && fn();
  });

  // emit `connect_error`
  var errorSub = on(socket, 'error', function (data) {
    debug('connect_error');
    self.cleanup();
    self.readyState = 'closed';
    self.emitAll('connect_error', data);
    if (fn) {
      var err = new Error('Connection error');
      err.data = data;
      fn(err);
    } else {
      // Only do this if there is no fn to handle the error
      self.maybeReconnectOnOpen();
    }
  });

  // emit `connect_timeout`
  if (false !== this._timeout) {
    var timeout = this._timeout;
    debug('connect attempt will timeout after %d', timeout);

    // set timer
    var timer = setTimeout(function () {
      debug('connect attempt timed out after %d', timeout);
      openSub.destroy();
      socket.close();
      socket.emit('error', 'timeout');
      self.emitAll('connect_timeout', timeout);
    }, timeout);

    this.subs.push({
      destroy: function () {
        clearTimeout(timer);
      }
    });
  }

  this.subs.push(openSub);
  this.subs.push(errorSub);

  return this;
};

/**
 * Called upon transport open.
 *
 * @api private
 */

Manager.prototype.onopen = function () {
  debug('open');

  // clear old subs
  this.cleanup();

  // mark as open
  this.readyState = 'open';
  this.emit('open');

  // add new subs
  var socket = this.engine;
  this.subs.push(on(socket, 'data', bind(this, 'ondata')));
  this.subs.push(on(socket, 'ping', bind(this, 'onping')));
  this.subs.push(on(socket, 'pong', bind(this, 'onpong')));
  this.subs.push(on(socket, 'error', bind(this, 'onerror')));
  this.subs.push(on(socket, 'close', bind(this, 'onclose')));
  this.subs.push(on(this.decoder, 'decoded', bind(this, 'ondecoded')));
};

/**
 * Called upon a ping.
 *
 * @api private
 */

Manager.prototype.onping = function () {
  this.lastPing = new Date();
  this.emitAll('ping');
};

/**
 * Called upon a packet.
 *
 * @api private
 */

Manager.prototype.onpong = function () {
  this.emitAll('pong', new Date() - this.lastPing);
};

/**
 * Called with data.
 *
 * @api private
 */

Manager.prototype.ondata = function (data) {
  this.decoder.add(data);
};

/**
 * Called when parser fully decodes a packet.
 *
 * @api private
 */

Manager.prototype.ondecoded = function (packet) {
  this.emit('packet', packet);
};

/**
 * Called upon socket error.
 *
 * @api private
 */

Manager.prototype.onerror = function (err) {
  debug('error', err);
  this.emitAll('error', err);
};

/**
 * Creates a new socket for the given `nsp`.
 *
 * @return {Socket}
 * @api public
 */

Manager.prototype.socket = function (nsp, opts) {
  var socket = this.nsps[nsp];
  if (!socket) {
    socket = new Socket(this, nsp, opts);
    this.nsps[nsp] = socket;
    var self = this;
    socket.on('connecting', onConnecting);
    socket.on('connect', function () {
      socket.id = self.generateId(nsp);
    });

    if (this.autoConnect) {
      // manually call here since connecting event is fired before listening
      onConnecting();
    }
  }

  function onConnecting () {
    if (!~indexOf(self.connecting, socket)) {
      self.connecting.push(socket);
    }
  }

  return socket;
};

/**
 * Called upon a socket close.
 *
 * @param {Socket} socket
 */

Manager.prototype.destroy = function (socket) {
  var index = indexOf(this.connecting, socket);
  if (~index) this.connecting.splice(index, 1);
  if (this.connecting.length) return;

  this.close();
};

/**
 * Writes a packet.
 *
 * @param {Object} packet
 * @api private
 */

Manager.prototype.packet = function (packet) {
  debug('writing packet %j', packet);
  var self = this;
  if (packet.query && packet.type === 0) packet.nsp += '?' + packet.query;

  if (!self.encoding) {
    // encode, then write to engine with result
    self.encoding = true;
    this.encoder.encode(packet, function (encodedPackets) {
      for (var i = 0; i < encodedPackets.length; i++) {
        self.engine.write(encodedPackets[i], packet.options);
      }
      self.encoding = false;
      self.processPacketQueue();
    });
  } else { // add packet to the queue
    self.packetBuffer.push(packet);
  }
};

/**
 * If packet buffer is non-empty, begins encoding the
 * next packet in line.
 *
 * @api private
 */

Manager.prototype.processPacketQueue = function () {
  if (this.packetBuffer.length > 0 && !this.encoding) {
    var pack = this.packetBuffer.shift();
    this.packet(pack);
  }
};

/**
 * Clean up transport subscriptions and packet buffer.
 *
 * @api private
 */

Manager.prototype.cleanup = function () {
  debug('cleanup');

  var subsLength = this.subs.length;
  for (var i = 0; i < subsLength; i++) {
    var sub = this.subs.shift();
    sub.destroy();
  }

  this.packetBuffer = [];
  this.encoding = false;
  this.lastPing = null;

  this.decoder.destroy();
};

/**
 * Close the current socket.
 *
 * @api private
 */

Manager.prototype.close =
Manager.prototype.disconnect = function () {
  debug('disconnect');
  this.skipReconnect = true;
  this.reconnecting = false;
  if ('opening' === this.readyState) {
    // `onclose` will not fire because
    // an open event never happened
    this.cleanup();
  }
  this.backoff.reset();
  this.readyState = 'closed';
  if (this.engine) this.engine.close();
};

/**
 * Called upon engine close.
 *
 * @api private
 */

Manager.prototype.onclose = function (reason) {
  debug('onclose');

  this.cleanup();
  this.backoff.reset();
  this.readyState = 'closed';
  this.emit('close', reason);

  if (this._reconnection && !this.skipReconnect) {
    this.reconnect();
  }
};

/**
 * Attempt a reconnection.
 *
 * @api private
 */

Manager.prototype.reconnect = function () {
  if (this.reconnecting || this.skipReconnect) return this;

  var self = this;

  if (this.backoff.attempts >= this._reconnectionAttempts) {
    debug('reconnect failed');
    this.backoff.reset();
    this.emitAll('reconnect_failed');
    this.reconnecting = false;
  } else {
    var delay = this.backoff.duration();
    debug('will wait %dms before reconnect attempt', delay);

    this.reconnecting = true;
    var timer = setTimeout(function () {
      if (self.skipReconnect) return;

      debug('attempting reconnect');
      self.emitAll('reconnect_attempt', self.backoff.attempts);
      self.emitAll('reconnecting', self.backoff.attempts);

      // check again for the case socket closed in above events
      if (self.skipReconnect) return;

      self.open(function (err) {
        if (err) {
          debug('reconnect attempt error');
          self.reconnecting = false;
          self.reconnect();
          self.emitAll('reconnect_error', err.data);
        } else {
          debug('reconnect success');
          self.onreconnect();
        }
      });
    }, delay);

    this.subs.push({
      destroy: function () {
        clearTimeout(timer);
      }
    });
  }
};

/**
 * Called upon successful reconnect.
 *
 * @api private
 */

Manager.prototype.onreconnect = function () {
  var attempt = this.backoff.attempts;
  this.reconnecting = false;
  this.backoff.reset();
  this.updateSocketIds();
  this.emitAll('reconnect', attempt);
};

},{"./on":186,"./socket":187,"backo2":13,"component-bind":20,"component-emitter":21,"debug":23,"engine.io-client":25,"indexof":44,"socket.io-parser":190}],186:[function(require,module,exports){

/**
 * Module exports.
 */

module.exports = on;

/**
 * Helper for subscriptions.
 *
 * @param {Object|EventEmitter} obj with `Emitter` mixin or `EventEmitter`
 * @param {String} event name
 * @param {Function} callback
 * @api public
 */

function on (obj, ev, fn) {
  obj.on(ev, fn);
  return {
    destroy: function () {
      obj.removeListener(ev, fn);
    }
  };
}

},{}],187:[function(require,module,exports){

/**
 * Module dependencies.
 */

var parser = require('socket.io-parser');
var Emitter = require('component-emitter');
var toArray = require('to-array');
var on = require('./on');
var bind = require('component-bind');
var debug = require('debug')('socket.io-client:socket');
var parseqs = require('parseqs');

/**
 * Module exports.
 */

module.exports = exports = Socket;

/**
 * Internal events (blacklisted).
 * These events can't be emitted by the user.
 *
 * @api private
 */

var events = {
  connect: 1,
  connect_error: 1,
  connect_timeout: 1,
  connecting: 1,
  disconnect: 1,
  error: 1,
  reconnect: 1,
  reconnect_attempt: 1,
  reconnect_failed: 1,
  reconnect_error: 1,
  reconnecting: 1,
  ping: 1,
  pong: 1
};

/**
 * Shortcut to `Emitter#emit`.
 */

var emit = Emitter.prototype.emit;

/**
 * `Socket` constructor.
 *
 * @api public
 */

function Socket (io, nsp, opts) {
  this.io = io;
  this.nsp = nsp;
  this.json = this; // compat
  this.ids = 0;
  this.acks = {};
  this.receiveBuffer = [];
  this.sendBuffer = [];
  this.connected = false;
  this.disconnected = true;
  if (opts && opts.query) {
    this.query = opts.query;
  }
  if (this.io.autoConnect) this.open();
}

/**
 * Mix in `Emitter`.
 */

Emitter(Socket.prototype);

/**
 * Subscribe to open, close and packet events
 *
 * @api private
 */

Socket.prototype.subEvents = function () {
  if (this.subs) return;

  var io = this.io;
  this.subs = [
    on(io, 'open', bind(this, 'onopen')),
    on(io, 'packet', bind(this, 'onpacket')),
    on(io, 'close', bind(this, 'onclose'))
  ];
};

/**
 * "Opens" the socket.
 *
 * @api public
 */

Socket.prototype.open =
Socket.prototype.connect = function () {
  if (this.connected) return this;

  this.subEvents();
  this.io.open(); // ensure open
  if ('open' === this.io.readyState) this.onopen();
  this.emit('connecting');
  return this;
};

/**
 * Sends a `message` event.
 *
 * @return {Socket} self
 * @api public
 */

Socket.prototype.send = function () {
  var args = toArray(arguments);
  args.unshift('message');
  this.emit.apply(this, args);
  return this;
};

/**
 * Override `emit`.
 * If the event is in `events`, it's emitted normally.
 *
 * @param {String} event name
 * @return {Socket} self
 * @api public
 */

Socket.prototype.emit = function (ev) {
  if (events.hasOwnProperty(ev)) {
    emit.apply(this, arguments);
    return this;
  }

  var args = toArray(arguments);
  var packet = { type: parser.EVENT, data: args };

  packet.options = {};
  packet.options.compress = !this.flags || false !== this.flags.compress;

  // event ack callback
  if ('function' === typeof args[args.length - 1]) {
    debug('emitting packet with ack id %d', this.ids);
    this.acks[this.ids] = args.pop();
    packet.id = this.ids++;
  }

  if (this.connected) {
    this.packet(packet);
  } else {
    this.sendBuffer.push(packet);
  }

  delete this.flags;

  return this;
};

/**
 * Sends a packet.
 *
 * @param {Object} packet
 * @api private
 */

Socket.prototype.packet = function (packet) {
  packet.nsp = this.nsp;
  this.io.packet(packet);
};

/**
 * Called upon engine `open`.
 *
 * @api private
 */

Socket.prototype.onopen = function () {
  debug('transport is open - connecting');

  // write connect packet if necessary
  if ('/' !== this.nsp) {
    if (this.query) {
      var query = typeof this.query === 'object' ? parseqs.encode(this.query) : this.query;
      debug('sending connect packet with query %s', query);
      this.packet({type: parser.CONNECT, query: query});
    } else {
      this.packet({type: parser.CONNECT});
    }
  }
};

/**
 * Called upon engine `close`.
 *
 * @param {String} reason
 * @api private
 */

Socket.prototype.onclose = function (reason) {
  debug('close (%s)', reason);
  this.connected = false;
  this.disconnected = true;
  delete this.id;
  this.emit('disconnect', reason);
};

/**
 * Called with socket packet.
 *
 * @param {Object} packet
 * @api private
 */

Socket.prototype.onpacket = function (packet) {
  if (packet.nsp !== this.nsp) return;

  switch (packet.type) {
    case parser.CONNECT:
      this.onconnect();
      break;

    case parser.EVENT:
      this.onevent(packet);
      break;

    case parser.BINARY_EVENT:
      this.onevent(packet);
      break;

    case parser.ACK:
      this.onack(packet);
      break;

    case parser.BINARY_ACK:
      this.onack(packet);
      break;

    case parser.DISCONNECT:
      this.ondisconnect();
      break;

    case parser.ERROR:
      this.emit('error', packet.data);
      break;
  }
};

/**
 * Called upon a server event.
 *
 * @param {Object} packet
 * @api private
 */

Socket.prototype.onevent = function (packet) {
  var args = packet.data || [];
  debug('emitting event %j', args);

  if (null != packet.id) {
    debug('attaching ack callback to event');
    args.push(this.ack(packet.id));
  }

  if (this.connected) {
    emit.apply(this, args);
  } else {
    this.receiveBuffer.push(args);
  }
};

/**
 * Produces an ack callback to emit with an event.
 *
 * @api private
 */

Socket.prototype.ack = function (id) {
  var self = this;
  var sent = false;
  return function () {
    // prevent double callbacks
    if (sent) return;
    sent = true;
    var args = toArray(arguments);
    debug('sending ack %j', args);

    self.packet({
      type: parser.ACK,
      id: id,
      data: args
    });
  };
};

/**
 * Called upon a server acknowlegement.
 *
 * @param {Object} packet
 * @api private
 */

Socket.prototype.onack = function (packet) {
  var ack = this.acks[packet.id];
  if ('function' === typeof ack) {
    debug('calling ack %s with %j', packet.id, packet.data);
    ack.apply(this, packet.data);
    delete this.acks[packet.id];
  } else {
    debug('bad ack %s', packet.id);
  }
};

/**
 * Called upon server connect.
 *
 * @api private
 */

Socket.prototype.onconnect = function () {
  this.connected = true;
  this.disconnected = false;
  this.emit('connect');
  this.emitBuffered();
};

/**
 * Emit buffered events (received and emitted).
 *
 * @api private
 */

Socket.prototype.emitBuffered = function () {
  var i;
  for (i = 0; i < this.receiveBuffer.length; i++) {
    emit.apply(this, this.receiveBuffer[i]);
  }
  this.receiveBuffer = [];

  for (i = 0; i < this.sendBuffer.length; i++) {
    this.packet(this.sendBuffer[i]);
  }
  this.sendBuffer = [];
};

/**
 * Called upon server disconnect.
 *
 * @api private
 */

Socket.prototype.ondisconnect = function () {
  debug('server disconnect (%s)', this.nsp);
  this.destroy();
  this.onclose('io server disconnect');
};

/**
 * Called upon forced client/server side disconnections,
 * this method ensures the manager stops tracking us and
 * that reconnections don't get triggered for this.
 *
 * @api private.
 */

Socket.prototype.destroy = function () {
  if (this.subs) {
    // clean subscriptions to avoid reconnections
    for (var i = 0; i < this.subs.length; i++) {
      this.subs[i].destroy();
    }
    this.subs = null;
  }

  this.io.destroy(this);
};

/**
 * Disconnects the socket manually.
 *
 * @return {Socket} self
 * @api public
 */

Socket.prototype.close =
Socket.prototype.disconnect = function () {
  if (this.connected) {
    debug('performing disconnect (%s)', this.nsp);
    this.packet({ type: parser.DISCONNECT });
  }

  // remove socket from pool
  this.destroy();

  if (this.connected) {
    // fire events
    this.onclose('io client disconnect');
  }
  return this;
};

/**
 * Sets the compress flag.
 *
 * @param {Boolean} if `true`, compresses the sending data
 * @return {Socket} self
 * @api public
 */

Socket.prototype.compress = function (compress) {
  this.flags = this.flags || {};
  this.flags.compress = compress;
  return this;
};

},{"./on":186,"component-bind":20,"component-emitter":21,"debug":23,"parseqs":177,"socket.io-parser":190,"to-array":193}],188:[function(require,module,exports){
(function (global){

/**
 * Module dependencies.
 */

var parseuri = require('parseuri');
var debug = require('debug')('socket.io-client:url');

/**
 * Module exports.
 */

module.exports = url;

/**
 * URL parser.
 *
 * @param {String} url
 * @param {Object} An object meant to mimic window.location.
 *                 Defaults to window.location.
 * @api public
 */

function url (uri, loc) {
  var obj = uri;

  // default to window.location
  loc = loc || global.location;
  if (null == uri) uri = loc.protocol + '//' + loc.host;

  // relative path support
  if ('string' === typeof uri) {
    if ('/' === uri.charAt(0)) {
      if ('/' === uri.charAt(1)) {
        uri = loc.protocol + uri;
      } else {
        uri = loc.host + uri;
      }
    }

    if (!/^(https?|wss?):\/\//.test(uri)) {
      debug('protocol-less url %s', uri);
      if ('undefined' !== typeof loc) {
        uri = loc.protocol + '//' + uri;
      } else {
        uri = 'https://' + uri;
      }
    }

    // parse
    debug('parse %s', uri);
    obj = parseuri(uri);
  }

  // make sure we treat `localhost:80` and `localhost` equally
  if (!obj.port) {
    if (/^(http|ws)$/.test(obj.protocol)) {
      obj.port = '80';
    } else if (/^(http|ws)s$/.test(obj.protocol)) {
      obj.port = '443';
    }
  }

  obj.path = obj.path || '/';

  var ipv6 = obj.host.indexOf(':') !== -1;
  var host = ipv6 ? '[' + obj.host + ']' : obj.host;

  // define unique id
  obj.id = obj.protocol + '://' + host + ':' + obj.port;
  // define href
  obj.href = obj.protocol + '://' + host + (loc && loc.port === obj.port ? '' : (':' + obj.port));

  return obj;
}

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"debug":23,"parseuri":178}],189:[function(require,module,exports){
(function (global){
/*global Blob,File*/

/**
 * Module requirements
 */

var isArray = require('isarray');
var isBuf = require('./is-buffer');
var toString = Object.prototype.toString;
var withNativeBlob = typeof global.Blob === 'function' || toString.call(global.Blob) === '[object BlobConstructor]';
var withNativeFile = typeof global.File === 'function' || toString.call(global.File) === '[object FileConstructor]';

/**
 * Replaces every Buffer | ArrayBuffer in packet with a numbered placeholder.
 * Anything with blobs or files should be fed through removeBlobs before coming
 * here.
 *
 * @param {Object} packet - socket.io event packet
 * @return {Object} with deconstructed packet and list of buffers
 * @api public
 */

exports.deconstructPacket = function(packet) {
  var buffers = [];
  var packetData = packet.data;
  var pack = packet;
  pack.data = _deconstructPacket(packetData, buffers);
  pack.attachments = buffers.length; // number of binary 'attachments'
  return {packet: pack, buffers: buffers};
};

function _deconstructPacket(data, buffers) {
  if (!data) return data;

  if (isBuf(data)) {
    var placeholder = { _placeholder: true, num: buffers.length };
    buffers.push(data);
    return placeholder;
  } else if (isArray(data)) {
    var newData = new Array(data.length);
    for (var i = 0; i < data.length; i++) {
      newData[i] = _deconstructPacket(data[i], buffers);
    }
    return newData;
  } else if (typeof data === 'object' && !(data instanceof Date)) {
    var newData = {};
    for (var key in data) {
      newData[key] = _deconstructPacket(data[key], buffers);
    }
    return newData;
  }
  return data;
}

/**
 * Reconstructs a binary packet from its placeholder packet and buffers
 *
 * @param {Object} packet - event packet with placeholders
 * @param {Array} buffers - binary buffers to put in placeholder positions
 * @return {Object} reconstructed packet
 * @api public
 */

exports.reconstructPacket = function(packet, buffers) {
  packet.data = _reconstructPacket(packet.data, buffers);
  packet.attachments = undefined; // no longer useful
  return packet;
};

function _reconstructPacket(data, buffers) {
  if (!data) return data;

  if (data && data._placeholder) {
    return buffers[data.num]; // appropriate buffer (should be natural order anyway)
  } else if (isArray(data)) {
    for (var i = 0; i < data.length; i++) {
      data[i] = _reconstructPacket(data[i], buffers);
    }
  } else if (typeof data === 'object') {
    for (var key in data) {
      data[key] = _reconstructPacket(data[key], buffers);
    }
  }

  return data;
}

/**
 * Asynchronously removes Blobs or Files from data via
 * FileReader's readAsArrayBuffer method. Used before encoding
 * data as msgpack. Calls callback with the blobless data.
 *
 * @param {Object} data
 * @param {Function} callback
 * @api private
 */

exports.removeBlobs = function(data, callback) {
  function _removeBlobs(obj, curKey, containingObject) {
    if (!obj) return obj;

    // convert any blob
    if ((withNativeBlob && obj instanceof Blob) ||
        (withNativeFile && obj instanceof File)) {
      pendingBlobs++;

      // async filereader
      var fileReader = new FileReader();
      fileReader.onload = function() { // this.result == arraybuffer
        if (containingObject) {
          containingObject[curKey] = this.result;
        }
        else {
          bloblessData = this.result;
        }

        // if nothing pending its callback time
        if(! --pendingBlobs) {
          callback(bloblessData);
        }
      };

      fileReader.readAsArrayBuffer(obj); // blob -> arraybuffer
    } else if (isArray(obj)) { // handle array
      for (var i = 0; i < obj.length; i++) {
        _removeBlobs(obj[i], i, obj);
      }
    } else if (typeof obj === 'object' && !isBuf(obj)) { // and object
      for (var key in obj) {
        _removeBlobs(obj[key], key, obj);
      }
    }
  }

  var pendingBlobs = 0;
  var bloblessData = data;
  _removeBlobs(bloblessData);
  if (!pendingBlobs) {
    callback(bloblessData);
  }
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"./is-buffer":191,"isarray":192}],190:[function(require,module,exports){

/**
 * Module dependencies.
 */

var debug = require('debug')('socket.io-parser');
var Emitter = require('component-emitter');
var hasBin = require('has-binary2');
var binary = require('./binary');
var isBuf = require('./is-buffer');

/**
 * Protocol version.
 *
 * @api public
 */

exports.protocol = 4;

/**
 * Packet types.
 *
 * @api public
 */

exports.types = [
  'CONNECT',
  'DISCONNECT',
  'EVENT',
  'ACK',
  'ERROR',
  'BINARY_EVENT',
  'BINARY_ACK'
];

/**
 * Packet type `connect`.
 *
 * @api public
 */

exports.CONNECT = 0;

/**
 * Packet type `disconnect`.
 *
 * @api public
 */

exports.DISCONNECT = 1;

/**
 * Packet type `event`.
 *
 * @api public
 */

exports.EVENT = 2;

/**
 * Packet type `ack`.
 *
 * @api public
 */

exports.ACK = 3;

/**
 * Packet type `error`.
 *
 * @api public
 */

exports.ERROR = 4;

/**
 * Packet type 'binary event'
 *
 * @api public
 */

exports.BINARY_EVENT = 5;

/**
 * Packet type `binary ack`. For acks with binary arguments.
 *
 * @api public
 */

exports.BINARY_ACK = 6;

/**
 * Encoder constructor.
 *
 * @api public
 */

exports.Encoder = Encoder;

/**
 * Decoder constructor.
 *
 * @api public
 */

exports.Decoder = Decoder;

/**
 * A socket.io Encoder instance
 *
 * @api public
 */

function Encoder() {}

/**
 * Encode a packet as a single string if non-binary, or as a
 * buffer sequence, depending on packet type.
 *
 * @param {Object} obj - packet object
 * @param {Function} callback - function to handle encodings (likely engine.write)
 * @return Calls callback with Array of encodings
 * @api public
 */

Encoder.prototype.encode = function(obj, callback){
  if ((obj.type === exports.EVENT || obj.type === exports.ACK) && hasBin(obj.data)) {
    obj.type = obj.type === exports.EVENT ? exports.BINARY_EVENT : exports.BINARY_ACK;
  }

  debug('encoding packet %j', obj);

  if (exports.BINARY_EVENT === obj.type || exports.BINARY_ACK === obj.type) {
    encodeAsBinary(obj, callback);
  }
  else {
    var encoding = encodeAsString(obj);
    callback([encoding]);
  }
};

/**
 * Encode packet as string.
 *
 * @param {Object} packet
 * @return {String} encoded
 * @api private
 */

function encodeAsString(obj) {

  // first is type
  var str = '' + obj.type;

  // attachments if we have them
  if (exports.BINARY_EVENT === obj.type || exports.BINARY_ACK === obj.type) {
    str += obj.attachments + '-';
  }

  // if we have a namespace other than `/`
  // we append it followed by a comma `,`
  if (obj.nsp && '/' !== obj.nsp) {
    str += obj.nsp + ',';
  }

  // immediately followed by the id
  if (null != obj.id) {
    str += obj.id;
  }

  // json data
  if (null != obj.data) {
    str += JSON.stringify(obj.data);
  }

  debug('encoded %j as %s', obj, str);
  return str;
}

/**
 * Encode packet as 'buffer sequence' by removing blobs, and
 * deconstructing packet into object with placeholders and
 * a list of buffers.
 *
 * @param {Object} packet
 * @return {Buffer} encoded
 * @api private
 */

function encodeAsBinary(obj, callback) {

  function writeEncoding(bloblessData) {
    var deconstruction = binary.deconstructPacket(bloblessData);
    var pack = encodeAsString(deconstruction.packet);
    var buffers = deconstruction.buffers;

    buffers.unshift(pack); // add packet info to beginning of data list
    callback(buffers); // write all the buffers
  }

  binary.removeBlobs(obj, writeEncoding);
}

/**
 * A socket.io Decoder instance
 *
 * @return {Object} decoder
 * @api public
 */

function Decoder() {
  this.reconstructor = null;
}

/**
 * Mix in `Emitter` with Decoder.
 */

Emitter(Decoder.prototype);

/**
 * Decodes an ecoded packet string into packet JSON.
 *
 * @param {String} obj - encoded packet
 * @return {Object} packet
 * @api public
 */

Decoder.prototype.add = function(obj) {
  var packet;
  if (typeof obj === 'string') {
    packet = decodeString(obj);
    if (exports.BINARY_EVENT === packet.type || exports.BINARY_ACK === packet.type) { // binary packet's json
      this.reconstructor = new BinaryReconstructor(packet);

      // no attachments, labeled binary but no binary data to follow
      if (this.reconstructor.reconPack.attachments === 0) {
        this.emit('decoded', packet);
      }
    } else { // non-binary full packet
      this.emit('decoded', packet);
    }
  }
  else if (isBuf(obj) || obj.base64) { // raw binary data
    if (!this.reconstructor) {
      throw new Error('got binary data when not reconstructing a packet');
    } else {
      packet = this.reconstructor.takeBinaryData(obj);
      if (packet) { // received final buffer
        this.reconstructor = null;
        this.emit('decoded', packet);
      }
    }
  }
  else {
    throw new Error('Unknown type: ' + obj);
  }
};

/**
 * Decode a packet String (JSON data)
 *
 * @param {String} str
 * @return {Object} packet
 * @api private
 */

function decodeString(str) {
  var i = 0;
  // look up type
  var p = {
    type: Number(str.charAt(0))
  };

  if (null == exports.types[p.type]) return error();

  // look up attachments if type binary
  if (exports.BINARY_EVENT === p.type || exports.BINARY_ACK === p.type) {
    var buf = '';
    while (str.charAt(++i) !== '-') {
      buf += str.charAt(i);
      if (i == str.length) break;
    }
    if (buf != Number(buf) || str.charAt(i) !== '-') {
      throw new Error('Illegal attachments');
    }
    p.attachments = Number(buf);
  }

  // look up namespace (if any)
  if ('/' === str.charAt(i + 1)) {
    p.nsp = '';
    while (++i) {
      var c = str.charAt(i);
      if (',' === c) break;
      p.nsp += c;
      if (i === str.length) break;
    }
  } else {
    p.nsp = '/';
  }

  // look up id
  var next = str.charAt(i + 1);
  if ('' !== next && Number(next) == next) {
    p.id = '';
    while (++i) {
      var c = str.charAt(i);
      if (null == c || Number(c) != c) {
        --i;
        break;
      }
      p.id += str.charAt(i);
      if (i === str.length) break;
    }
    p.id = Number(p.id);
  }

  // look up json data
  if (str.charAt(++i)) {
    p = tryParse(p, str.substr(i));
  }

  debug('decoded %s as %j', str, p);
  return p;
}

function tryParse(p, str) {
  try {
    p.data = JSON.parse(str);
  } catch(e){
    return error();
  }
  return p; 
}

/**
 * Deallocates a parser's resources
 *
 * @api public
 */

Decoder.prototype.destroy = function() {
  if (this.reconstructor) {
    this.reconstructor.finishedReconstruction();
  }
};

/**
 * A manager of a binary event's 'buffer sequence'. Should
 * be constructed whenever a packet of type BINARY_EVENT is
 * decoded.
 *
 * @param {Object} packet
 * @return {BinaryReconstructor} initialized reconstructor
 * @api private
 */

function BinaryReconstructor(packet) {
  this.reconPack = packet;
  this.buffers = [];
}

/**
 * Method to be called when binary data received from connection
 * after a BINARY_EVENT packet.
 *
 * @param {Buffer | ArrayBuffer} binData - the raw binary data received
 * @return {null | Object} returns null if more binary data is expected or
 *   a reconstructed packet object if all buffers have been received.
 * @api private
 */

BinaryReconstructor.prototype.takeBinaryData = function(binData) {
  this.buffers.push(binData);
  if (this.buffers.length === this.reconPack.attachments) { // done with buffer list
    var packet = binary.reconstructPacket(this.reconPack, this.buffers);
    this.finishedReconstruction();
    return packet;
  }
  return null;
};

/**
 * Cleans up binary packet reconstruction variables.
 *
 * @api private
 */

BinaryReconstructor.prototype.finishedReconstruction = function() {
  this.reconPack = null;
  this.buffers = [];
};

function error() {
  return {
    type: exports.ERROR,
    data: 'parser error'
  };
}

},{"./binary":189,"./is-buffer":191,"component-emitter":21,"debug":23,"has-binary2":40}],191:[function(require,module,exports){
(function (global){

module.exports = isBuf;

/**
 * Returns true if obj is a buffer or an arraybuffer.
 *
 * @api private
 */

function isBuf(obj) {
  return (global.Buffer && global.Buffer.isBuffer(obj)) ||
         (global.ArrayBuffer && obj instanceof ArrayBuffer);
}

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{}],192:[function(require,module,exports){
arguments[4][41][0].apply(exports,arguments)
},{"dup":41}],193:[function(require,module,exports){
module.exports = toArray

function toArray(list, index) {
    var array = []

    index = index || 0

    for (var i = index || 0; i < list.length; i++) {
        array[i - index] = list[i]
    }

    return array
}

},{}],194:[function(require,module,exports){

exports = module.exports = trim;

function trim(str){
  return str.replace(/^\s*|\s*$/g, '');
}

exports.left = function(str){
  return str.replace(/^\s*/, '');
};

exports.right = function(str){
  return str.replace(/\s*$/, '');
};

},{}],195:[function(require,module,exports){
if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    var TempCtor = function () {}
    TempCtor.prototype = superCtor.prototype
    ctor.prototype = new TempCtor()
    ctor.prototype.constructor = ctor
  }
}

},{}],196:[function(require,module,exports){
module.exports = function isBuffer(arg) {
  return arg && typeof arg === 'object'
    && typeof arg.copy === 'function'
    && typeof arg.fill === 'function'
    && typeof arg.readUInt8 === 'function';
}
},{}],197:[function(require,module,exports){
(function (process,global){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var formatRegExp = /%[sdj%]/g;
exports.format = function(f) {
  if (!isString(f)) {
    var objects = [];
    for (var i = 0; i < arguments.length; i++) {
      objects.push(inspect(arguments[i]));
    }
    return objects.join(' ');
  }

  var i = 1;
  var args = arguments;
  var len = args.length;
  var str = String(f).replace(formatRegExp, function(x) {
    if (x === '%%') return '%';
    if (i >= len) return x;
    switch (x) {
      case '%s': return String(args[i++]);
      case '%d': return Number(args[i++]);
      case '%j':
        try {
          return JSON.stringify(args[i++]);
        } catch (_) {
          return '[Circular]';
        }
      default:
        return x;
    }
  });
  for (var x = args[i]; i < len; x = args[++i]) {
    if (isNull(x) || !isObject(x)) {
      str += ' ' + x;
    } else {
      str += ' ' + inspect(x);
    }
  }
  return str;
};


// Mark that a method should not be used.
// Returns a modified function which warns once by default.
// If --no-deprecation is set, then it is a no-op.
exports.deprecate = function(fn, msg) {
  // Allow for deprecating things in the process of starting up.
  if (isUndefined(global.process)) {
    return function() {
      return exports.deprecate(fn, msg).apply(this, arguments);
    };
  }

  if (process.noDeprecation === true) {
    return fn;
  }

  var warned = false;
  function deprecated() {
    if (!warned) {
      if (process.throwDeprecation) {
        throw new Error(msg);
      } else if (process.traceDeprecation) {
        console.trace(msg);
      } else {
        console.error(msg);
      }
      warned = true;
    }
    return fn.apply(this, arguments);
  }

  return deprecated;
};


var debugs = {};
var debugEnviron;
exports.debuglog = function(set) {
  if (isUndefined(debugEnviron))
    debugEnviron = process.env.NODE_DEBUG || '';
  set = set.toUpperCase();
  if (!debugs[set]) {
    if (new RegExp('\\b' + set + '\\b', 'i').test(debugEnviron)) {
      var pid = process.pid;
      debugs[set] = function() {
        var msg = exports.format.apply(exports, arguments);
        console.error('%s %d: %s', set, pid, msg);
      };
    } else {
      debugs[set] = function() {};
    }
  }
  return debugs[set];
};


/**
 * Echos the value of a value. Trys to print the value out
 * in the best way possible given the different types.
 *
 * @param {Object} obj The object to print out.
 * @param {Object} opts Optional options object that alters the output.
 */
/* legacy: obj, showHidden, depth, colors*/
function inspect(obj, opts) {
  // default options
  var ctx = {
    seen: [],
    stylize: stylizeNoColor
  };
  // legacy...
  if (arguments.length >= 3) ctx.depth = arguments[2];
  if (arguments.length >= 4) ctx.colors = arguments[3];
  if (isBoolean(opts)) {
    // legacy...
    ctx.showHidden = opts;
  } else if (opts) {
    // got an "options" object
    exports._extend(ctx, opts);
  }
  // set default options
  if (isUndefined(ctx.showHidden)) ctx.showHidden = false;
  if (isUndefined(ctx.depth)) ctx.depth = 2;
  if (isUndefined(ctx.colors)) ctx.colors = false;
  if (isUndefined(ctx.customInspect)) ctx.customInspect = true;
  if (ctx.colors) ctx.stylize = stylizeWithColor;
  return formatValue(ctx, obj, ctx.depth);
}
exports.inspect = inspect;


// http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
inspect.colors = {
  'bold' : [1, 22],
  'italic' : [3, 23],
  'underline' : [4, 24],
  'inverse' : [7, 27],
  'white' : [37, 39],
  'grey' : [90, 39],
  'black' : [30, 39],
  'blue' : [34, 39],
  'cyan' : [36, 39],
  'green' : [32, 39],
  'magenta' : [35, 39],
  'red' : [31, 39],
  'yellow' : [33, 39]
};

// Don't use 'blue' not visible on cmd.exe
inspect.styles = {
  'special': 'cyan',
  'number': 'yellow',
  'boolean': 'yellow',
  'undefined': 'grey',
  'null': 'bold',
  'string': 'green',
  'date': 'magenta',
  // "name": intentionally not styling
  'regexp': 'red'
};


function stylizeWithColor(str, styleType) {
  var style = inspect.styles[styleType];

  if (style) {
    return '\u001b[' + inspect.colors[style][0] + 'm' + str +
           '\u001b[' + inspect.colors[style][1] + 'm';
  } else {
    return str;
  }
}


function stylizeNoColor(str, styleType) {
  return str;
}


function arrayToHash(array) {
  var hash = {};

  array.forEach(function(val, idx) {
    hash[val] = true;
  });

  return hash;
}


function formatValue(ctx, value, recurseTimes) {
  // Provide a hook for user-specified inspect functions.
  // Check that value is an object with an inspect function on it
  if (ctx.customInspect &&
      value &&
      isFunction(value.inspect) &&
      // Filter out the util module, it's inspect function is special
      value.inspect !== exports.inspect &&
      // Also filter out any prototype objects using the circular check.
      !(value.constructor && value.constructor.prototype === value)) {
    var ret = value.inspect(recurseTimes, ctx);
    if (!isString(ret)) {
      ret = formatValue(ctx, ret, recurseTimes);
    }
    return ret;
  }

  // Primitive types cannot have properties
  var primitive = formatPrimitive(ctx, value);
  if (primitive) {
    return primitive;
  }

  // Look up the keys of the object.
  var keys = Object.keys(value);
  var visibleKeys = arrayToHash(keys);

  if (ctx.showHidden) {
    keys = Object.getOwnPropertyNames(value);
  }

  // IE doesn't make error fields non-enumerable
  // http://msdn.microsoft.com/en-us/library/ie/dww52sbt(v=vs.94).aspx
  if (isError(value)
      && (keys.indexOf('message') >= 0 || keys.indexOf('description') >= 0)) {
    return formatError(value);
  }

  // Some type of object without properties can be shortcutted.
  if (keys.length === 0) {
    if (isFunction(value)) {
      var name = value.name ? ': ' + value.name : '';
      return ctx.stylize('[Function' + name + ']', 'special');
    }
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    }
    if (isDate(value)) {
      return ctx.stylize(Date.prototype.toString.call(value), 'date');
    }
    if (isError(value)) {
      return formatError(value);
    }
  }

  var base = '', array = false, braces = ['{', '}'];

  // Make Array say that they are Array
  if (isArray(value)) {
    array = true;
    braces = ['[', ']'];
  }

  // Make functions say that they are functions
  if (isFunction(value)) {
    var n = value.name ? ': ' + value.name : '';
    base = ' [Function' + n + ']';
  }

  // Make RegExps say that they are RegExps
  if (isRegExp(value)) {
    base = ' ' + RegExp.prototype.toString.call(value);
  }

  // Make dates with properties first say the date
  if (isDate(value)) {
    base = ' ' + Date.prototype.toUTCString.call(value);
  }

  // Make error with message first say the error
  if (isError(value)) {
    base = ' ' + formatError(value);
  }

  if (keys.length === 0 && (!array || value.length == 0)) {
    return braces[0] + base + braces[1];
  }

  if (recurseTimes < 0) {
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    } else {
      return ctx.stylize('[Object]', 'special');
    }
  }

  ctx.seen.push(value);

  var output;
  if (array) {
    output = formatArray(ctx, value, recurseTimes, visibleKeys, keys);
  } else {
    output = keys.map(function(key) {
      return formatProperty(ctx, value, recurseTimes, visibleKeys, key, array);
    });
  }

  ctx.seen.pop();

  return reduceToSingleString(output, base, braces);
}


function formatPrimitive(ctx, value) {
  if (isUndefined(value))
    return ctx.stylize('undefined', 'undefined');
  if (isString(value)) {
    var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                                             .replace(/'/g, "\\'")
                                             .replace(/\\"/g, '"') + '\'';
    return ctx.stylize(simple, 'string');
  }
  if (isNumber(value))
    return ctx.stylize('' + value, 'number');
  if (isBoolean(value))
    return ctx.stylize('' + value, 'boolean');
  // For some reason typeof null is "object", so special case here.
  if (isNull(value))
    return ctx.stylize('null', 'null');
}


function formatError(value) {
  return '[' + Error.prototype.toString.call(value) + ']';
}


function formatArray(ctx, value, recurseTimes, visibleKeys, keys) {
  var output = [];
  for (var i = 0, l = value.length; i < l; ++i) {
    if (hasOwnProperty(value, String(i))) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          String(i), true));
    } else {
      output.push('');
    }
  }
  keys.forEach(function(key) {
    if (!key.match(/^\d+$/)) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          key, true));
    }
  });
  return output;
}


function formatProperty(ctx, value, recurseTimes, visibleKeys, key, array) {
  var name, str, desc;
  desc = Object.getOwnPropertyDescriptor(value, key) || { value: value[key] };
  if (desc.get) {
    if (desc.set) {
      str = ctx.stylize('[Getter/Setter]', 'special');
    } else {
      str = ctx.stylize('[Getter]', 'special');
    }
  } else {
    if (desc.set) {
      str = ctx.stylize('[Setter]', 'special');
    }
  }
  if (!hasOwnProperty(visibleKeys, key)) {
    name = '[' + key + ']';
  }
  if (!str) {
    if (ctx.seen.indexOf(desc.value) < 0) {
      if (isNull(recurseTimes)) {
        str = formatValue(ctx, desc.value, null);
      } else {
        str = formatValue(ctx, desc.value, recurseTimes - 1);
      }
      if (str.indexOf('\n') > -1) {
        if (array) {
          str = str.split('\n').map(function(line) {
            return '  ' + line;
          }).join('\n').substr(2);
        } else {
          str = '\n' + str.split('\n').map(function(line) {
            return '   ' + line;
          }).join('\n');
        }
      }
    } else {
      str = ctx.stylize('[Circular]', 'special');
    }
  }
  if (isUndefined(name)) {
    if (array && key.match(/^\d+$/)) {
      return str;
    }
    name = JSON.stringify('' + key);
    if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
      name = name.substr(1, name.length - 2);
      name = ctx.stylize(name, 'name');
    } else {
      name = name.replace(/'/g, "\\'")
                 .replace(/\\"/g, '"')
                 .replace(/(^"|"$)/g, "'");
      name = ctx.stylize(name, 'string');
    }
  }

  return name + ': ' + str;
}


function reduceToSingleString(output, base, braces) {
  var numLinesEst = 0;
  var length = output.reduce(function(prev, cur) {
    numLinesEst++;
    if (cur.indexOf('\n') >= 0) numLinesEst++;
    return prev + cur.replace(/\u001b\[\d\d?m/g, '').length + 1;
  }, 0);

  if (length > 60) {
    return braces[0] +
           (base === '' ? '' : base + '\n ') +
           ' ' +
           output.join(',\n  ') +
           ' ' +
           braces[1];
  }

  return braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
}


// NOTE: These type checking functions intentionally don't use `instanceof`
// because it is fragile and can be easily faked with `Object.create()`.
function isArray(ar) {
  return Array.isArray(ar);
}
exports.isArray = isArray;

function isBoolean(arg) {
  return typeof arg === 'boolean';
}
exports.isBoolean = isBoolean;

function isNull(arg) {
  return arg === null;
}
exports.isNull = isNull;

function isNullOrUndefined(arg) {
  return arg == null;
}
exports.isNullOrUndefined = isNullOrUndefined;

function isNumber(arg) {
  return typeof arg === 'number';
}
exports.isNumber = isNumber;

function isString(arg) {
  return typeof arg === 'string';
}
exports.isString = isString;

function isSymbol(arg) {
  return typeof arg === 'symbol';
}
exports.isSymbol = isSymbol;

function isUndefined(arg) {
  return arg === void 0;
}
exports.isUndefined = isUndefined;

function isRegExp(re) {
  return isObject(re) && objectToString(re) === '[object RegExp]';
}
exports.isRegExp = isRegExp;

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}
exports.isObject = isObject;

function isDate(d) {
  return isObject(d) && objectToString(d) === '[object Date]';
}
exports.isDate = isDate;

function isError(e) {
  return isObject(e) &&
      (objectToString(e) === '[object Error]' || e instanceof Error);
}
exports.isError = isError;

function isFunction(arg) {
  return typeof arg === 'function';
}
exports.isFunction = isFunction;

function isPrimitive(arg) {
  return arg === null ||
         typeof arg === 'boolean' ||
         typeof arg === 'number' ||
         typeof arg === 'string' ||
         typeof arg === 'symbol' ||  // ES6 symbol
         typeof arg === 'undefined';
}
exports.isPrimitive = isPrimitive;

exports.isBuffer = require('./support/isBuffer');

function objectToString(o) {
  return Object.prototype.toString.call(o);
}


function pad(n) {
  return n < 10 ? '0' + n.toString(10) : n.toString(10);
}


var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
              'Oct', 'Nov', 'Dec'];

// 26 Feb 16:19:34
function timestamp() {
  var d = new Date();
  var time = [pad(d.getHours()),
              pad(d.getMinutes()),
              pad(d.getSeconds())].join(':');
  return [d.getDate(), months[d.getMonth()], time].join(' ');
}


// log is just a thin wrapper to console.log that prepends a timestamp
exports.log = function() {
  console.log('%s - %s', timestamp(), exports.format.apply(exports, arguments));
};


/**
 * Inherit the prototype methods from one constructor into another.
 *
 * The Function.prototype.inherits from lang.js rewritten as a standalone
 * function (not on Function.prototype). NOTE: If this file is to be loaded
 * during bootstrapping this function needs to be rewritten using some native
 * functions as prototype setup using normal JavaScript does not work as
 * expected during bootstrapping (see mirror.js in r114903).
 *
 * @param {function} ctor Constructor function which needs to inherit the
 *     prototype.
 * @param {function} superCtor Constructor function to inherit prototype from.
 */
exports.inherits = require('inherits');

exports._extend = function(origin, add) {
  // Don't do anything if add isn't an object
  if (!add || !isObject(add)) return origin;

  var keys = Object.keys(add);
  var i = keys.length;
  while (i--) {
    origin[keys[i]] = add[keys[i]];
  }
  return origin;
};

function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

}).call(this,require('_process'),typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"./support/isBuffer":196,"_process":180,"inherits":195}],198:[function(require,module,exports){
/**
 * Convert array of 16 byte values to UUID string format of the form:
 * XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX
 */
var byteToHex = [];
for (var i = 0; i < 256; ++i) {
  byteToHex[i] = (i + 0x100).toString(16).substr(1);
}

function bytesToUuid(buf, offset) {
  var i = offset || 0;
  var bth = byteToHex;
  return bth[buf[i++]] + bth[buf[i++]] +
          bth[buf[i++]] + bth[buf[i++]] + '-' +
          bth[buf[i++]] + bth[buf[i++]] + '-' +
          bth[buf[i++]] + bth[buf[i++]] + '-' +
          bth[buf[i++]] + bth[buf[i++]] + '-' +
          bth[buf[i++]] + bth[buf[i++]] +
          bth[buf[i++]] + bth[buf[i++]] +
          bth[buf[i++]] + bth[buf[i++]];
}

module.exports = bytesToUuid;

},{}],199:[function(require,module,exports){
(function (global){
// Unique ID creation requires a high quality random # generator.  In the
// browser this is a little complicated due to unknown quality of Math.random()
// and inconsistent support for the `crypto` API.  We do the best we can via
// feature-detection
var rng;

var crypto = global.crypto || global.msCrypto; // for IE 11
if (crypto && crypto.getRandomValues) {
  // WHATWG crypto RNG - http://wiki.whatwg.org/wiki/Crypto
  var rnds8 = new Uint8Array(16); // eslint-disable-line no-undef
  rng = function whatwgRNG() {
    crypto.getRandomValues(rnds8);
    return rnds8;
  };
}

if (!rng) {
  // Math.random()-based (RNG)
  //
  // If all else fails, use Math.random().  It's fast, but is of unspecified
  // quality.
  var rnds = new Array(16);
  rng = function() {
    for (var i = 0, r; i < 16; i++) {
      if ((i & 0x03) === 0) r = Math.random() * 0x100000000;
      rnds[i] = r >>> ((i & 0x03) << 3) & 0xff;
    }

    return rnds;
  };
}

module.exports = rng;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{}],200:[function(require,module,exports){
var rng = require('./lib/rng');
var bytesToUuid = require('./lib/bytesToUuid');

function v4(options, buf, offset) {
  var i = buf && offset || 0;

  if (typeof(options) == 'string') {
    buf = options == 'binary' ? new Array(16) : null;
    options = null;
  }
  options = options || {};

  var rnds = options.random || (options.rng || rng)();

  // Per 4.4, set bits for version and `clock_seq_hi_and_reserved`
  rnds[6] = (rnds[6] & 0x0f) | 0x40;
  rnds[8] = (rnds[8] & 0x3f) | 0x80;

  // Copy bytes to buffer, if provided
  if (buf) {
    for (var ii = 0; ii < 16; ++ii) {
      buf[i + ii] = rnds[ii];
    }
  }

  return buf || bytesToUuid(rnds);
}

module.exports = v4;

},{"./lib/bytesToUuid":198,"./lib/rng":199}],201:[function(require,module,exports){
"use strict";
var window = require("global/window")
var isFunction = require("is-function")
var parseHeaders = require("parse-headers")
var xtend = require("xtend")

module.exports = createXHR
createXHR.XMLHttpRequest = window.XMLHttpRequest || noop
createXHR.XDomainRequest = "withCredentials" in (new createXHR.XMLHttpRequest()) ? createXHR.XMLHttpRequest : window.XDomainRequest

forEachArray(["get", "put", "post", "patch", "head", "delete"], function(method) {
    createXHR[method === "delete" ? "del" : method] = function(uri, options, callback) {
        options = initParams(uri, options, callback)
        options.method = method.toUpperCase()
        return _createXHR(options)
    }
})

function forEachArray(array, iterator) {
    for (var i = 0; i < array.length; i++) {
        iterator(array[i])
    }
}

function isEmpty(obj){
    for(var i in obj){
        if(obj.hasOwnProperty(i)) return false
    }
    return true
}

function initParams(uri, options, callback) {
    var params = uri

    if (isFunction(options)) {
        callback = options
        if (typeof uri === "string") {
            params = {uri:uri}
        }
    } else {
        params = xtend(options, {uri: uri})
    }

    params.callback = callback
    return params
}

function createXHR(uri, options, callback) {
    options = initParams(uri, options, callback)
    return _createXHR(options)
}

function _createXHR(options) {
    if(typeof options.callback === "undefined"){
        throw new Error("callback argument missing")
    }

    var called = false
    var callback = function cbOnce(err, response, body){
        if(!called){
            called = true
            options.callback(err, response, body)
        }
    }

    function readystatechange() {
        if (xhr.readyState === 4) {
            setTimeout(loadFunc, 0)
        }
    }

    function getBody() {
        // Chrome with requestType=blob throws errors arround when even testing access to responseText
        var body = undefined

        if (xhr.response) {
            body = xhr.response
        } else {
            body = xhr.responseText || getXml(xhr)
        }

        if (isJson) {
            try {
                body = JSON.parse(body)
            } catch (e) {}
        }

        return body
    }

    function errorFunc(evt) {
        clearTimeout(timeoutTimer)
        if(!(evt instanceof Error)){
            evt = new Error("" + (evt || "Unknown XMLHttpRequest Error") )
        }
        evt.statusCode = 0
        return callback(evt, failureResponse)
    }

    // will load the data & process the response in a special response object
    function loadFunc() {
        if (aborted) return
        var status
        clearTimeout(timeoutTimer)
        if(options.useXDR && xhr.status===undefined) {
            //IE8 CORS GET successful response doesn't have a status field, but body is fine
            status = 200
        } else {
            status = (xhr.status === 1223 ? 204 : xhr.status)
        }
        var response = failureResponse
        var err = null

        if (status !== 0){
            response = {
                body: getBody(),
                statusCode: status,
                method: method,
                headers: {},
                url: uri,
                rawRequest: xhr
            }
            if(xhr.getAllResponseHeaders){ //remember xhr can in fact be XDR for CORS in IE
                response.headers = parseHeaders(xhr.getAllResponseHeaders())
            }
        } else {
            err = new Error("Internal XMLHttpRequest Error")
        }
        return callback(err, response, response.body)
    }

    var xhr = options.xhr || null

    if (!xhr) {
        if (options.cors || options.useXDR) {
            xhr = new createXHR.XDomainRequest()
        }else{
            xhr = new createXHR.XMLHttpRequest()
        }
    }

    var key
    var aborted
    var uri = xhr.url = options.uri || options.url
    var method = xhr.method = options.method || "GET"
    var body = options.body || options.data
    var headers = xhr.headers = options.headers || {}
    var sync = !!options.sync
    var isJson = false
    var timeoutTimer
    var failureResponse = {
        body: undefined,
        headers: {},
        statusCode: 0,
        method: method,
        url: uri,
        rawRequest: xhr
    }

    if ("json" in options && options.json !== false) {
        isJson = true
        headers["accept"] || headers["Accept"] || (headers["Accept"] = "application/json") //Don't override existing accept header declared by user
        if (method !== "GET" && method !== "HEAD") {
            headers["content-type"] || headers["Content-Type"] || (headers["Content-Type"] = "application/json") //Don't override existing accept header declared by user
            body = JSON.stringify(options.json === true ? body : options.json)
        }
    }

    xhr.onreadystatechange = readystatechange
    xhr.onload = loadFunc
    xhr.onerror = errorFunc
    // IE9 must have onprogress be set to a unique function.
    xhr.onprogress = function () {
        // IE must die
    }
    xhr.onabort = function(){
        aborted = true;
    }
    xhr.ontimeout = errorFunc
    xhr.open(method, uri, !sync, options.username, options.password)
    //has to be after open
    if(!sync) {
        xhr.withCredentials = !!options.withCredentials
    }
    // Cannot set timeout with sync request
    // not setting timeout on the xhr object, because of old webkits etc. not handling that correctly
    // both npm's request and jquery 1.x use this kind of timeout, so this is being consistent
    if (!sync && options.timeout > 0 ) {
        timeoutTimer = setTimeout(function(){
            if (aborted) return
            aborted = true//IE9 may still call readystatechange
            xhr.abort("timeout")
            var e = new Error("XMLHttpRequest timeout")
            e.code = "ETIMEDOUT"
            errorFunc(e)
        }, options.timeout )
    }

    if (xhr.setRequestHeader) {
        for(key in headers){
            if(headers.hasOwnProperty(key)){
                xhr.setRequestHeader(key, headers[key])
            }
        }
    } else if (options.headers && !isEmpty(options.headers)) {
        throw new Error("Headers cannot be set on an XDomainRequest object")
    }

    if ("responseType" in options) {
        xhr.responseType = options.responseType
    }

    if ("beforeSend" in options &&
        typeof options.beforeSend === "function"
    ) {
        options.beforeSend(xhr)
    }

    // Microsoft Edge browser sends "undefined" when send is called with undefined value.
    // XMLHttpRequest spec says to pass null as body to indicate no body
    // See https://github.com/naugtur/xhr/issues/100.
    xhr.send(body || null)

    return xhr


}

function getXml(xhr) {
    if (xhr.responseType === "document") {
        return xhr.responseXML
    }
    var firefoxBugTakenEffect = xhr.responseXML && xhr.responseXML.documentElement.nodeName === "parsererror"
    if (xhr.responseType === "" && !firefoxBugTakenEffect) {
        return xhr.responseXML
    }

    return null
}

function noop() {}

},{"global/window":39,"is-function":45,"parse-headers":176,"xtend":202}],202:[function(require,module,exports){
module.exports = extend

var hasOwnProperty = Object.prototype.hasOwnProperty;

function extend() {
    var target = {}

    for (var i = 0; i < arguments.length; i++) {
        var source = arguments[i]

        for (var key in source) {
            if (hasOwnProperty.call(source, key)) {
                target[key] = source[key]
            }
        }
    }

    return target
}

},{}],203:[function(require,module,exports){
'use strict';

var alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_'.split('')
  , length = 64
  , map = {}
  , seed = 0
  , i = 0
  , prev;

/**
 * Return a string representing the specified number.
 *
 * @param {Number} num The number to convert.
 * @returns {String} The string representation of the number.
 * @api public
 */
function encode(num) {
  var encoded = '';

  do {
    encoded = alphabet[num % length] + encoded;
    num = Math.floor(num / length);
  } while (num > 0);

  return encoded;
}

/**
 * Return the integer value specified by the given string.
 *
 * @param {String} str The string to convert.
 * @returns {Number} The integer value represented by the string.
 * @api public
 */
function decode(str) {
  var decoded = 0;

  for (i = 0; i < str.length; i++) {
    decoded = decoded * length + map[str.charAt(i)];
  }

  return decoded;
}

/**
 * Yeast: A tiny growing id generator.
 *
 * @returns {String} A unique id.
 * @api public
 */
function yeast() {
  var now = encode(+new Date());

  if (now !== prev) return seed = 0, prev = now;
  return now +'.'+ encode(seed++);
}

//
// Map each character to its index.
//
for (; i < length; i++) map[alphabet[i]] = i;

//
// Expose the `yeast`, `encode` and `decode` functions.
//
yeast.encode = encode;
yeast.decode = decode;
module.exports = yeast;

},{}],204:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const events_1 = require("events");
const debug_1 = require("./debug");
const protocol_1 = require("./protocol");
class CollaborativeObject {
    constructor(document, id, type, sequenceNum, services) {
        this.document = document;
        this.id = id;
        this.type = type;
        this.sequenceNum = sequenceNum;
        this.services = services;
        // tslint:disable-next-line:variable-name
        this.__collaborativeObject__ = true;
        this.events = new events_1.EventEmitter();
        // Locally applied operations not yet sent to the server
        this.localOps = [];
        // Socketio acked messages timestamp.
        this.pingMap = {};
        // Sequence number for operations local to this client
        this.clientSequenceNumber = 0;
        // Min sequence number starts off at the initialized sequence number
        this.minSequenceNumber = sequenceNum;
        if (this.services) {
            this.listenForUpdates();
        }
    }
    get sequenceNumber() {
        return this.sequenceNum;
    }
    get minimumSequenceNumber() {
        return this.minSequenceNumber;
    }
    get referenceSequenceNumber() {
        return this.services.deltaConnection.referenceSequenceNumber;
    }
    on(event, listener) {
        this.events.on(event, listener);
        return this;
    }
    removeListener(event, listener) {
        this.events.removeListener(event, listener);
        return this;
    }
    removeAllListeners(event) {
        this.events.removeAllListeners(event);
        return this;
    }
    /**
     * Attaches the given collaborative object to its containing document
     */
    attach() {
        if (!this.isLocal()) {
            return this;
        }
        this.services = this.document.attach(this);
        // Listen for updates to create the delta manager
        this.listenForUpdates();
        // And then submit all pending operations.
        assert(this.localOps.length === 0);
        // Allow derived classes to perform custom operations
        this.attachCore();
        return this;
    }
    /**
     * Returns whether the given collaborative object is local
     */
    isLocal() {
        return !this.services;
    }
    /**
     * Creates a new message from the provided message that is relative to the given sequenceNumber. It is valid
     * to modify the passed in object in place.
     */
    transform(message, sequenceNumber) {
        message.referenceSequenceNumber = sequenceNumber;
        return message;
    }
    /**
     * Allows the distributive data type the ability to perform custom processing prior to a delta
     * being submitted to the server
     */
    // tslint:disable-next-line:no-empty
    submitCore(message) {
    }
    /**
     * Allows the distributive data type the ability to perform custom processing once an attach has happened
     */
    // tslint:disable-next-line:no-empty
    attachCore() {
    }
    /**
     * Processes a message by the local client
     */
    submitLocalOperation(contents) {
        // Local only operations we can discard as the attach will take care of them
        if (this.isLocal()) {
            return;
        }
        // Prep the message
        const message = {
            clientSequenceNumber: ++this.clientSequenceNumber,
            contents,
            referenceSequenceNumber: this.sequenceNumber,
            type: protocol_1.OperationType,
        };
        // Store the message for when it is ACKed and then submit to the server if connected
        this.localOps.push(message);
        if (this.services) {
            this.submit(message);
        }
    }
    listenForUpdates() {
        this.services.deltaConnection.on("op", (message) => {
            this.processRemoteMessage(message);
        });
        // Min sequence number changed
        this.services.deltaConnection.on("minSequenceNumber", (value) => {
            this.minSequenceNumber = value;
            this.processMinSequenceNumberChanged(this.minimumSequenceNumber);
        });
    }
    /**
     * Handles a message coming from the remote service
     */
    processRemoteMessage(message) {
        // server messages should only be delivered to this method in sequence number order
        assert.equal(this.sequenceNumber + 1, message.sequenceNumber);
        this.sequenceNum = message.sequenceNumber;
        this.minSequenceNumber = message.minimumSequenceNumber;
        if (message.type === protocol_1.OperationType && message.clientId === this.document.clientId) {
            // One of our messages was sequenced. We can remove it from the local message list. Given these arrive
            // in order we only need to check the beginning of the local list.
            if (this.localOps.length > 0 &&
                this.localOps[0].clientSequenceNumber === message.clientSequenceNumber) {
                this.localOps.shift();
            }
            else {
                debug_1.debug(`Duplicate ack received ${message.clientSequenceNumber}`);
            }
            // Add final trace.
            message.traces.push({ service: "client", action: "end", timestamp: Date.now() });
            // Add ping trace and remove from local map.
            if (message.clientSequenceNumber in this.pingMap) {
                // tslint:disable-next-line:max-line-length
                message.traces.push({ service: "ping", action: "end", timestamp: this.pingMap[message.clientSequenceNumber] });
                delete this.pingMap[message.clientSequenceNumber];
            }
            // Submit the latency message back to server.
            this.submitLatencyMessage(message);
        }
        this.processCore(message);
    }
    submit(message) {
        this.submitCore(message);
        this.services.deltaConnection.submit(message).then(() => {
            // Message acked by socketio. Store timestamp locally.
            this.pingMap[message.clientSequenceNumber] = Date.now();
        }, (error) => {
            // TODO need reconnection logic upon loss of connection
            debug_1.debug(`Lost connection to server: ${JSON.stringify(error)}`);
            this.events.emit("error", error);
        });
    }
    submitLatencyMessage(message) {
        const latencyMessage = {
            traces: message.traces,
        };
        this.document.submitLatencyMessage(latencyMessage);
    }
}
exports.CollaborativeObject = CollaborativeObject;

},{"./debug":205,"./protocol":212,"assert":3,"events":37}],205:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const registerDebug = require("debug");
exports.debug = registerDebug("routerlicious:api-core");

},{"debug":23}],206:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const events_1 = require("events");
const core_utils_1 = require("../core-utils");
class DeltaConnection {
    constructor(objectId, document) {
        this.objectId = objectId;
        this.document = document;
        this.events = new events_1.EventEmitter();
    }
    get minimumSequenceNumber() {
        return this.minSequenceNumber;
    }
    get referenceSequenceNumber() {
        return this.refSequenceNumber;
    }
    /**
     * The lowest sequence number tracked by this map. Will normally be the document minimum
     * sequence number but may be higher in the case of an attach after the MSN.
     */
    get baseSequenceNumber() {
        return this.rangeTracker.base;
    }
    /**
     * Sets the base mapping from a local sequence number to the document sequence number that matches it
     */
    setBaseMapping(sequenceNumber, documentSequenceNumber) {
        assert(!this.baseMappingIsSet());
        assert(sequenceNumber >= 0);
        this.sequenceNumber = sequenceNumber;
        this.minSequenceNumber = sequenceNumber;
        this.rangeTracker = new core_utils_1.RangeTracker(documentSequenceNumber, sequenceNumber);
        this.refSequenceNumber = documentSequenceNumber;
    }
    /**
     * Returns whether or not setBaseMapping has been called
     */
    baseMappingIsSet() {
        return !!this.rangeTracker;
    }
    on(event, listener) {
        this.events.on(event, listener);
        return this;
    }
    emit(message, clientId, documentSequenceNumber, documentMinimumSequenceNumber, origin, traces) {
        assert(this.baseMappingIsSet());
        const sequenceNumber = ++this.sequenceNumber;
        this.rangeTracker.add(documentSequenceNumber, sequenceNumber);
        // Take the max between our base and the new MSN. In the case of a new document our MSN may be greater.
        this.minSequenceNumber = this.rangeTracker.get(Math.max(this.rangeTracker.base, documentMinimumSequenceNumber));
        this.refSequenceNumber = message.referenceSequenceNumber;
        const sequencedObjectMessage = {
            clientId,
            clientSequenceNumber: message.clientSequenceNumber,
            contents: message.contents,
            minimumSequenceNumber: this.minSequenceNumber,
            origin,
            referenceSequenceNumber: this.refSequenceNumber,
            sequenceNumber,
            traces,
            type: message.type,
        };
        this.events.emit("op", sequencedObjectMessage);
    }
    transformDocumentSequenceNumber(value) {
        assert(this.baseMappingIsSet());
        return this.rangeTracker.get(value);
    }
    updateMinSequenceNumber(value) {
        assert(this.baseMappingIsSet());
        // The MSN may still be below the creation time for the object - don't update in this case
        if (value < this.rangeTracker.base) {
            return;
        }
        const newMinSequenceNumber = this.rangeTracker.get(value);
        this.rangeTracker.updateBase(value);
        // Notify clients when then number changed
        if (newMinSequenceNumber !== this.minimumSequenceNumber) {
            this.minSequenceNumber = newMinSequenceNumber;
            this.events.emit("minSequenceNumber", this.minSequenceNumber);
        }
    }
    /**
     * Send new messages to the server
     */
    submit(message) {
        return this.document.submitObjectMessage({ address: this.objectId, contents: message });
    }
}
exports.DeltaConnection = DeltaConnection;

},{"../core-utils":222,"assert":3,"events":37}],207:[function(require,module,exports){
"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const queue = require("async/queue");
const events_1 = require("events");
const core_utils_1 = require("../core-utils");
const debug_1 = require("./debug");
const protocol = require("./protocol");
// NOTE This class manages receiving deltas from the routerlicious service.
// There are the push notification versions as well the ones we're storing in a Mongo database.
// We might want to decrypt at the endpoint. But it might be easiest to start from here since it's all
// consolidated together.
/**
 * Helper class that manages incoming delta messages. This class ensures that collaborative objects receive delta
 * messages in order regardless of possible network conditions or timings causing out of order delivery.
 */
class DeltaManager {
    constructor(documentId, baseSequenceNumber, deltaStorage, deltaConnection) {
        this.documentId = documentId;
        this.baseSequenceNumber = baseSequenceNumber;
        this.deltaStorage = deltaStorage;
        this.deltaConnection = deltaConnection;
        this.pending = [];
        this.fetching = false;
        // Flag indicating whether or not we need to udpate the reference sequence number
        this.updateHasBeenRequested = false;
        // Flag indicating whether the client has only received messages
        this.readonly = true;
        // The minimum sequence number and last sequence number received from the server
        this.minSequenceNumber = 0;
        this.clientSequenceNumber = 0;
        this.emitter = new events_1.EventEmitter();
        // The MSN starts at the base the manager is initialized to
        this.minSequenceNumber = this.baseSequenceNumber;
        const throughputCounter = new core_utils_1.ThroughputCounter(debug_1.debug, `${this.documentId} `);
        const q = queue((op, callback) => {
            // Handle the op
            this.handleOp(op);
            callback();
            throughputCounter.acknolwedge();
        }, 1);
        // When the queue is drained reset our timer
        q.drain = () => {
            q.resume();
        };
        // listen for specific events
        this.deltaConnection.on("op", (messages) => {
            for (const message of messages) {
                throughputCounter.produce();
                q.push(message);
            }
        });
    }
    get referenceSequenceNumber() {
        return this.baseSequenceNumber;
    }
    get minimumSequenceNumber() {
        return this.minSequenceNumber;
    }
    /**
     * Submits a new delta operation
     */
    submit(type, contents) {
        // Start adding trace for the op.
        const traces = [{ service: "client", action: "start", timestamp: Date.now() }];
        const message = {
            clientSequenceNumber: this.clientSequenceNumber++,
            contents,
            encrypted: this.deltaConnection.encrypted,
            encryptedContents: null,
            referenceSequenceNumber: this.baseSequenceNumber,
            traces,
            type,
        };
        this.readonly = false;
        this.stopSequenceNumberUpdate();
        return this.deltaConnection.submit(message);
    }
    /**
     * Submits an acked roundtrip operation.
     */
    submitRoundtrip(type, contents) {
        return __awaiter(this, void 0, void 0, function* () {
            const message = {
                clientSequenceNumber: -1,
                contents: null,
                encrypted: this.deltaConnection.encrypted,
                encryptedContents: null,
                referenceSequenceNumber: -1,
                traces: contents.traces,
                type,
            };
            this.readonly = false;
            this.deltaConnection.submit(message);
        });
    }
    onDelta(listener) {
        this.emitter.addListener("op", listener);
    }
    handleOp(message) {
        // Incoming sequence numbers should be one higher than the previous ones seen. If not we have missed the
        // stream and need to query the server for the missing deltas.
        if (message.sequenceNumber !== this.baseSequenceNumber + 1) {
            this.handleOutOfOrderMessage(message);
        }
        else {
            this.emit(message);
        }
    }
    /**
     * Handles an out of order message retrieved from the server
     */
    handleOutOfOrderMessage(message) {
        if (message.sequenceNumber <= this.baseSequenceNumber) {
            debug_1.debug(`Received duplicate message ${this.documentId}@${message.sequenceNumber}`);
            return;
        }
        debug_1.debug(`Received out of order message ${message.sequenceNumber} ${this.baseSequenceNumber}`);
        this.pending.push(message);
        this.fetchMissingDeltas(this.baseSequenceNumber, message.sequenceNumber);
    }
    /**
     * Retrieves the missing deltas between the given sequence numbers
     */
    fetchMissingDeltas(from, to) {
        // Exit out early if we're already fetching deltas
        if (this.fetching) {
            return;
        }
        this.fetching = true;
        this.deltaStorage.get(from, to).then((messages) => {
            this.fetching = false;
            this.catchUp(messages);
        }, (error) => {
            // Retry on failure
            debug_1.debug(error);
            this.fetching = false;
            this.fetchMissingDeltas(from, to);
        });
    }
    catchUp(messages) {
        // Apply current operations
        for (const message of messages) {
            // Ignore sequence numbers prior to the base. This can happen at startup when we fetch all missing
            // deltas while also listening for updates
            if (message.sequenceNumber > this.baseSequenceNumber) {
                assert.equal(message.sequenceNumber, this.baseSequenceNumber + 1);
                this.emit(message);
            }
        }
        // Then sort pending operations and attempt to apply them again.
        // This could be optimized to stop handling messages once we realize we need to fetch mising values.
        // But for simplicity, and because catching up should be rare, we just process all of them.
        const pendingSorted = this.pending.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
        this.pending = [];
        for (const pendingMessage of pendingSorted) {
            this.handleOp(pendingMessage);
        }
    }
    /**
     * Acks the server to update the reference sequence number
     */
    updateSequenceNumber() {
        // Exit early for readonly clients. They don't take part in the minimum sequence number calculation.
        if (this.readonly) {
            return;
        }
        // The server maintains a time based window for the min sequence number. As such we want to periodically
        // send a heartbeat to get the latest sequence number once the window has moved past where we currently are.
        if (this.heartbeatTimer) {
            clearTimeout(this.heartbeatTimer);
        }
        this.heartbeatTimer = setTimeout(() => {
            this.submit(protocol.NoOp, null);
        }, 2000 + 1000);
        // If an update has already been requeested then mark this fact. We will wait until no updates have
        // been requested before sending the updated sequence number.
        if (this.updateSequenceNumberTimer) {
            this.updateHasBeenRequested = true;
            return;
        }
        // Clear an update in 100 ms
        this.updateSequenceNumberTimer = setTimeout(() => {
            this.updateSequenceNumberTimer = undefined;
            // If a second update wasn't requested then send an update message. Otherwise defer this until we
            // stop processing new messages.
            if (!this.updateHasBeenRequested) {
                this.submit(protocol.NoOp, null);
            }
            else {
                this.updateHasBeenRequested = false;
                this.updateSequenceNumber();
            }
        }, 100);
    }
    stopSequenceNumberUpdate() {
        if (this.updateSequenceNumberTimer) {
            clearTimeout(this.updateSequenceNumberTimer);
        }
        this.updateHasBeenRequested = false;
        this.updateSequenceNumberTimer = undefined;
    }
    /**
     * Revs the base sequence number based on the message and notifices the listener of the new message
     */
    emit(message) {
        return __awaiter(this, void 0, void 0, function* () {
            let emitMessage = message;
            // Watch the minimum sequence number and be ready to update as needed
            this.minSequenceNumber = message.minimumSequenceNumber;
            this.baseSequenceNumber = message.sequenceNumber;
            this.emitter.emit("op", emitMessage);
            // We will queue a message to update our reference sequence number upon receiving a server operation. This
            // allows the server to know our true reference sequence number and be able to correctly update the minimum
            // sequence number (MSN). We don't ackowledge other message types similarly (like a min sequence number update)
            // to avoid ackowledgement cycles (i.e. ack the MSN update, which updates the MSN, then ack the update, etc...).
            if (message.type !== protocol.NoOp) {
                this.updateSequenceNumber();
            }
        });
    }
}
exports.DeltaManager = DeltaManager;
// TODO I should put in some kind of plugin system for the below. We can use it to enable/disable encryption as well
// as control the message flow for debugging purposes, etc...
// import * as openpgp from "openpgp";
// submit() {
// const encryptedContents = this.deltaConnection.encrypted ? await this.encryptOp(contents) : "";
// emit() {
// if (message.encrypted) {
//     // Decrypt the contents of the message.
//     let decryptedContents = await this.decryptOp(message.encryptedContents);
//     // Verify integrity of decryption.
//     assert(JSON.stringify(decryptedContents) === JSON.stringify(message.contents));
//     emitMessage.encryptedContents = decryptedContents;
// }
// Expose the below as a plugin
// // Assign symmetric keys. NOTE: Move encryption entirely to DeltaConnection?
// this.privateKey = this.deltaConnection.privateKey;
// this.publicKey = this.deltaConnection.publicKey;
// // Private key for signing deltas related to this manager's document
// private privateKey;
// // Public key for decrypting deltas related to this manager's document
// private publicKey;
// // NOTE: perhaps unnecessary?
// private secretPassphrase = "";
// private async encryptOp(op: any): Promise<string> {
//     // Encode op as JSON string.
//     const opAsString = JSON.stringify(op);
//     const encryptionOptions = {
//         data: opAsString,
//         publicKeys: openpgp.key.readArmored(this.publicKey).keys,
//     };
//     return openpgp.encrypt(encryptionOptions).then((ciphertext) => {
//         return ciphertext.data;
//     });
// }
// private async decryptOp(encryptedOp: string): Promise<any> {
//     /**
//      * First, decrypt the private RSA key using the secret passphrase. Then, decrypt the message using the key.
//      */
//     let decryptedRSAPrivateKey = openpgp.key.readArmored(this.privateKey).keys[0];
//     decryptedRSAPrivateKey.decrypt(this.secretPassphrase);
//     const decryptionOptions = {
//         message: openpgp.message.readArmored(encryptedOp),
//         privateKey: decryptedRSAPrivateKey,
//     };
//     return openpgp.decrypt(decryptionOptions).then((plaintext) => {
//         return JSON.parse(plaintext.data);
//     });
// }

},{"../core-utils":222,"./debug":205,"./protocol":212,"assert":3,"async/queue":12,"events":37}],208:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Class that contains a collection of collaboration extensions
 */
class Registry {
    constructor() {
        this.extensions = [];
        this.extensionsMap = {};
    }
    /**
     * Registers a new extension
     * @param extension The extension to register
     */
    register(extension) {
        this.extensions.push(extension);
        this.extensionsMap[extension.type] = extension;
    }
    /**
     * Retrieves the extension with the given id
     * @param id ID for the extension to retrieve
     */
    getExtension(type) {
        if (!(type in this.extensionsMap)) {
            throw new Error("Extension not found");
        }
        return this.extensionsMap[type];
    }
}
exports.Registry = Registry;

},{}],209:[function(require,module,exports){
"use strict";
function __export(m) {
    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
}
Object.defineProperty(exports, "__esModule", { value: true });
__export(require("./collaborativeObject"));
__export(require("./deltaConnection"));
__export(require("./deltaManager"));
__export(require("./extension"));
__export(require("./protocol"));
__export(require("./storage"));
__export(require("./types"));
__export(require("./deltaManager"));
__export(require("./localObjectStorageService"));
__export(require("./objectStorageService"));

},{"./collaborativeObject":204,"./deltaConnection":206,"./deltaManager":207,"./extension":208,"./localObjectStorageService":210,"./objectStorageService":211,"./protocol":212,"./storage":213,"./types":214}],210:[function(require,module,exports){
(function (Buffer){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const storage = require("./storage");
class LocalObjectStorageService {
    constructor(tree) {
        this.tree = tree;
    }
    read(path) {
        const contents = this.readSync(path);
        return contents !== undefined ? Promise.resolve(contents) : Promise.reject("Not found");
    }
    /**
     * Provides a synchronous access point to locally stored data
     */
    readSync(path) {
        return this.readSyncInternal(path, this.tree);
    }
    readSyncInternal(path, tree) {
        for (const entry of this.tree.entries) {
            switch (entry.type) {
                case storage.TreeEntry[storage.TreeEntry.Blob]:
                    if (path === entry.path) {
                        const blob = entry.value;
                        return blob.encoding === "utf-8"
                            ? new Buffer(blob.contents).toString("base64")
                            : blob.contents;
                    }
                    break;
                case storage.TreeEntry[storage.TreeEntry.Tree]:
                    if (entry.path.indexOf(path) === 0) {
                        return this.readSyncInternal(path.substr(entry.path.length + 1), entry.value);
                    }
                    break;
                default:
                    break;
            }
        }
        return undefined;
    }
}
exports.LocalObjectStorageService = LocalObjectStorageService;

}).call(this,require("buffer").Buffer)

},{"./storage":213,"buffer":19}],211:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class ObjectStorageService {
    constructor(tree, storage) {
        this.storage = storage;
        this.flattenedTree = {};
        // Create a map from paths to blobs
        if (tree) {
            ObjectStorageService.flattenTree("", tree, this.flattenedTree);
        }
    }
    static flattenTree(base, tree, results) {
        // tslint:disable-next-line:forin
        for (const path in tree.trees) {
            ObjectStorageService.flattenTree(`${base}/${path}`, tree.trees[path], results);
        }
        // tslint:disable-next-line:forin
        for (const blob in tree.blobs) {
            results[`${base}${blob}`] = tree.blobs[blob];
        }
    }
    read(path) {
        const sha = this.getShaForPath(path);
        return this.storage.read(sha);
    }
    getShaForPath(path) {
        return this.flattenedTree[path];
    }
}
exports.ObjectStorageService = ObjectStorageService;

},{}],212:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// Delta operation application type
exports.OperationType = "op";
// Empty operation message. Used to send an updated reference sequence number.
exports.NoOp = "noop";
// Operation performed on a distributed data type
exports.ObjectOperation = "objOp";
// Save Operation performed on a distributed data type
exports.SaveOperation = "saveOp";
// Attaches a new object to the document
exports.AttachObject = "attach";
// System message sent to indicate a new client has joined the collaboration
exports.ClientJoin = "join";
// System message sent to indicate a client has left the collaboration
exports.ClientLeave = "leave";
// System message to indicate the creation of a new fork
exports.Fork = "fork";
// Message sent when forwarding a sequenced message to an upstream branch
exports.Integrate = "integrate";
// Message to indicate successful round trip.
exports.RoundTrip = "tripComplete";

},{}],213:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Type of entries that can be stored in a tree
 */
var TreeEntry;
(function (TreeEntry) {
    TreeEntry[TreeEntry["Blob"] = 0] = "Blob";
    TreeEntry[TreeEntry["Tree"] = 1] = "Tree";
})(TreeEntry = exports.TreeEntry || (exports.TreeEntry = {}));

},{}],214:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SAVE = "save";

},{}],215:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const registerDebug = require("debug");
exports.debug = registerDebug("routerlicious:api");

},{"debug":23}],216:[function(require,module,exports){
"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const events_1 = require("events");
const uuid = require("uuid/v4");
const performanceNow = require("performance-now");
const api_core_1 = require("../api-core");
const cell = require("../cell");
const core_utils_1 = require("../core-utils");
const ink = require("../ink");
const mapExtension = require("../map");
const mergeTree = require("../merge-tree");
const debug_1 = require("./debug");
const rootMapId = "root";
// Registered services to use when loading a document
let defaultDocumentService;
// The default registry for extensions
exports.defaultRegistry = new api_core_1.Registry();
exports.defaultDocumentOptions = Object.create(null);
exports.defaultRegistry.register(new mapExtension.MapExtension());
exports.defaultRegistry.register(new mergeTree.CollaboritiveStringExtension());
exports.defaultRegistry.register(new ink.InkExtension());
exports.defaultRegistry.register(new cell.CellExtension());
function registerExtension(extension) {
    exports.defaultRegistry.register(extension);
}
exports.registerExtension = registerExtension;
/**
 * Registers the default services to use for interacting with collaborative documents. To simplify the API it is
 * expected that the implementation provider of these will register themselves during startup prior to the user
 * requesting to load a collaborative object.
 */
function registerDocumentService(service) {
    defaultDocumentService = service;
}
exports.registerDocumentService = registerDocumentService;
function getDefaultDocumentService() {
    return defaultDocumentService;
}
exports.getDefaultDocumentService = getDefaultDocumentService;
/**
 * Polls for the root document
 */
function pollRoot(document, resolve, reject) {
    if (document.get("root")) {
        resolve();
    }
    else {
        const pauseAmount = 100;
        debug_1.debug(`Did not find root - waiting ${pauseAmount}ms`);
        setTimeout(() => pollRoot(document, resolve, reject), pauseAmount);
    }
}
/**
 * Returns a promie that resolves once the root map is available
 */
function waitForRoot(document) {
    return new Promise((resolve, reject) => pollRoot(document, resolve, reject));
}
/**
 * A document is a collection of collaborative types.
 */
class Document {
    /**
     * Constructs a new document from the provided details
     */
    constructor(document, registry, service, opts) {
        this.document = document;
        this.registry = registry;
        this.service = service;
        this.opts = opts;
        // Map from the object ID to the collaborative object for it. If the object is not yet attached its service
        // entries will be null
        this.distributedObjects = {};
        this.events = new events_1.EventEmitter();
        this.messagesSinceMSNChange = [];
        this.lastMinSequenceNumber = this.document.minimumSequenceNumber;
        if (this.document.deltaConnection !== null) {
            this.deltaManager = new api_core_1.DeltaManager(this.document.documentId, this.document.minimumSequenceNumber, this.document.deltaStorageService, this.document.deltaConnection);
            this.deltaManager.onDelta((message) => this.processRemoteMessage(message));
        }
    }
    static Load(id, registry, service, options, version, connect) {
        return __awaiter(this, void 0, void 0, function* () {
            debug_1.debug(`Document loading ${id} - ${performanceNow()}`);
            // Connect to the document
            const encryptedProperty = "encrypted";
            const document = yield service.connect(id, version, connect, options[encryptedProperty]);
            const returnValue = new Document(document, registry, service, options);
            // Load in distributed objects stored within the document
            for (const distributedObject of document.distributedObjects) {
                // const services = returnValue.getIdleObjectServices(distributedObject.id);
                const services = returnValue.getObjectServices(distributedObject.id);
                services.deltaConnection.setBaseMapping(distributedObject.sequenceNumber, document.minimumSequenceNumber);
                returnValue.loadInternal(distributedObject, services, document.snapshotOriginBranch);
            }
            // Apply pending deltas - first the list of transformed messages between the msn and sequence number
            // and then any pending deltas that have happened since that sequenceNumber
            returnValue.processPendingMessages(document.transformedMessages, document.snapshotOriginBranch !== id ? document.snapshotOriginBranch : null);
            assert.equal(returnValue.deltaManager.referenceSequenceNumber, document.sequenceNumber);
            // These messages were not contained within the snapshot
            returnValue.processPendingMessages(document.pendingDeltas);
            // If it's a new document we create the root map object - otherwise we wait for it to become available
            if (!document.existing) {
                returnValue.createAttached("root", mapExtension.MapExtension.Type);
            }
            else {
                yield waitForRoot(returnValue);
            }
            debug_1.debug(`Document loaded ${id} - ${performanceNow()}`);
            // And return the new object
            return returnValue;
        });
    }
    get clientId() {
        return this.document.clientId;
    }
    get id() {
        return this.document.documentId;
    }
    /**
     * Returns the parent branch for this document
     */
    get parentBranch() {
        return this.document.parentBranch;
    }
    get options() {
        return this.opts;
    }
    /**
     * Constructs a new collaborative object that can be attached to the document
     * @param type the identifier for the collaborative object type
     */
    create(type, id = uuid()) {
        const extension = this.registry.getExtension(type);
        const object = extension.create(this, id);
        // Store the unattached service in the object map
        this.upsertDistributedObject(object, null);
        return object;
    }
    /**
     * Loads the specified distributed object. Returns null if it does not exist
     *
     * This method should not be called directly. Instead access should be obtained through the root map
     * or another distributed object.
     *
     * @param id Identifier of the object to load
     */
    get(id) {
        return id in this.distributedObjects ? this.distributedObjects[id].object : null;
    }
    /**
     * Attaches the given object to the document which also makes it available to collaborators. The object is
     * expected to immediately submit delta messages for itself once being attached.
     *
     * @param object
     */
    attach(object) {
        // Get the object snapshot and include it in the initial attach
        const snapshot = object.snapshot();
        const message = {
            id: object.id,
            snapshot,
            type: object.type,
        };
        this.submitMessage(api_core_1.AttachObject, message);
        // Store a reference to the object in our list of objects and then get the services
        // used to attach it to the stream
        const services = this.getObjectServices(object.id);
        this.upsertDistributedObject(object, services);
        return services;
    }
    // pause + resume semantics on the op stream? To load a doc at a veresion?
    /**
     * Creates a new collaborative map
     */
    createMap() {
        return this.create(mapExtension.MapExtension.Type);
    }
    /**
     * Creates a new collaborative cell.
     * TODO (tanvir): replace this with type class.
     */
    createCell() {
        return this.create(cell.CellExtension.Type);
    }
    /**
     * Creates a new collaborative string
     */
    createString() {
        return this.create(mergeTree.CollaboritiveStringExtension.Type);
    }
    /**
     * Creates a new ink collaborative object
     */
    createInk() {
        return this.create(ink.InkExtension.Type);
    }
    /**
     * Retrieves the root collaborative object that the document is based on
     */
    getRoot() {
        return this.distributedObjects[rootMapId].object;
    }
    /**
     * Saves the document by performing a snapshot.
     */
    save(tag = null) {
        const saveMessage = { type: api_core_1.SAVE, message: tag };
        this.submitSaveMessage(saveMessage);
    }
    /**
     * Closes the document and detaches all listeners
     */
    close() {
        throw new Error("Not yet implemented");
    }
    submitObjectMessage(envelope) {
        return this.submitMessage(api_core_1.ObjectOperation, envelope);
    }
    submitSaveMessage(message) {
        return this.submitMessage(api_core_1.SaveOperation, message);
    }
    submitLatencyMessage(message) {
        this.deltaManager.submitRoundtrip(api_core_1.RoundTrip, message);
    }
    on(event, listener) {
        this.events.on(event, listener);
        return this;
    }
    removeListener(event, listener) {
        this.events.removeListener(event, listener);
        return this;
    }
    branch() {
        return this.service.branch(this.id);
    }
    /**
     * Called to snapshot the given document
     */
    snapshot(tagMessage = undefined) {
        return __awaiter(this, void 0, void 0, function* () {
            const entries = [];
            // TODO: support for branch snapshots. For now simply no-op when a branch snapshot is requested
            if (this.document.parentBranch) {
                debug_1.debug(`Skipping snapshot due to being branch of ${this.document.parentBranch}`);
                return;
            }
            // Transform ops in the window relative to the MSN - the window is all ops between the min sequence number
            // and the current sequence number
            assert.equal(this.deltaManager.referenceSequenceNumber - this.deltaManager.minimumSequenceNumber, this.messagesSinceMSNChange.length);
            const transformedMessages = [];
            for (const message of this.messagesSinceMSNChange) {
                transformedMessages.push(this.transform(message, this.deltaManager.minimumSequenceNumber));
            }
            entries.push({
                path: ".messages",
                type: api_core_1.TreeEntry[api_core_1.TreeEntry.Blob],
                value: {
                    contents: JSON.stringify(transformedMessages),
                    encoding: "utf-8",
                },
            });
            // tslint:disable-next-line:forin
            for (const objectId in this.distributedObjects) {
                const object = this.distributedObjects[objectId];
                if (this.shouldSnapshot(object)) {
                    debug_1.debug(`Snapshotting ${object.object.id}`);
                    const snapshot = object.object.snapshot();
                    // Add in the object attributes to the returned tree
                    const objectAttributes = {
                        sequenceNumber: object.connection.minimumSequenceNumber,
                        type: object.object.type,
                    };
                    snapshot.entries.push({
                        path: ".attributes",
                        type: api_core_1.TreeEntry[api_core_1.TreeEntry.Blob],
                        value: {
                            contents: JSON.stringify(objectAttributes),
                            encoding: "utf-8",
                        },
                    });
                    // And then store the tree
                    entries.push({
                        path: objectId,
                        type: api_core_1.TreeEntry[api_core_1.TreeEntry.Tree],
                        value: snapshot,
                    });
                }
            }
            // Save attributes for the document
            const documentAttributes = {
                branch: this.id,
                minimumSequenceNumber: this.deltaManager.minimumSequenceNumber,
                sequenceNumber: this.deltaManager.referenceSequenceNumber,
            };
            entries.push({
                path: ".attributes",
                type: api_core_1.TreeEntry[api_core_1.TreeEntry.Blob],
                value: {
                    contents: JSON.stringify(documentAttributes),
                    encoding: "utf-8",
                },
            });
            // Output the tree
            const root = {
                entries,
            };
            const message = `Commit @${this.deltaManager.referenceSequenceNumber}${core_utils_1.getOrDefault(tagMessage, "")}`;
            yield this.document.documentStorageService.write(root, message);
        });
    }
    /**
     * Helper function to determine if we should snapshot the given object. We only will snapshot non-local
     * objects whose time of attach is outside the collaboration window
     */
    shouldSnapshot(object) {
        // tslint:disable-next-line
        debug_1.debug(`${object.object.id} ${object.object.isLocal()} - ${object.connection.baseMappingIsSet()} - ${object.connection.baseSequenceNumber} >= ${this.deltaManager.minimumSequenceNumber}`);
        return !object.object.isLocal() &&
            object.connection.baseMappingIsSet() &&
            object.connection.baseSequenceNumber === this.deltaManager.minimumSequenceNumber;
    }
    /**
     * Transforms the given message relative to the provided sequence number
     */
    transform(message, sequenceNumber) {
        if (message.referenceSequenceNumber < this.deltaManager.minimumSequenceNumber) {
            // Allow the distributed data types to perform custom transformations
            if (message.type === api_core_1.ObjectOperation) {
                const envelope = message.contents;
                const objectDetails = this.distributedObjects[envelope.address];
                envelope.contents = objectDetails.object.transform(envelope.contents, objectDetails.connection.transformDocumentSequenceNumber(sequenceNumber));
            }
            message.referenceSequenceNumber = sequenceNumber;
        }
        message.minimumSequenceNumber = sequenceNumber;
        return message;
    }
    processPendingMessages(messages, parentBranch) {
        for (const message of messages) {
            // Append branch information when transforming for the case of messages stashed with the snapshot
            if (parentBranch) {
                message.origin = {
                    id: parentBranch,
                    minimumSequenceNumber: message.minimumSequenceNumber,
                    sequenceNumber: message.sequenceNumber,
                };
            }
            this.deltaManager.handleOp(message);
        }
    }
    submitMessage(type, contents) {
        return this.deltaManager.submit(type, contents);
    }
    createAttached(id, type) {
        const object = this.create(type, id);
        object.attach();
    }
    /**
     * Loads in a distributed object and stores it in the internal Document object map
     * @param distributedObject The distributed object to load
     */
    loadInternal(distributedObject, services, originBranch) {
        const extension = this.registry.getExtension(distributedObject.type);
        const value = extension.load(this, distributedObject.id, distributedObject.sequenceNumber, services, this.document.version, originBranch, distributedObject.header);
        this.upsertDistributedObject(value, services);
    }
    getObjectServices(id) {
        const connection = new api_core_1.DeltaConnection(id, this);
        return {
            deltaConnection: connection,
            objectStorage: this.getStorageService(id),
        };
    }
    getStorageService(id) {
        const tree = this.document.tree && id in this.document.tree.trees
            ? this.document.tree.trees[id]
            : null;
        return new api_core_1.ObjectStorageService(tree, this.document.documentStorageService);
    }
    upsertDistributedObject(object, services) {
        if (!(object.id in this.distributedObjects)) {
            this.distributedObjects[object.id] = {
                connection: services ? services.deltaConnection : null,
                object,
                storage: services ? services.objectStorage : null,
            };
        }
        else {
            const entry = this.distributedObjects[object.id];
            assert.equal(entry.object, object);
            entry.connection = services.deltaConnection;
            entry.storage = services.objectStorage;
        }
    }
    processRemoteMessage(message) {
        const minSequenceNumberChanged = this.lastMinSequenceNumber !== message.minimumSequenceNumber;
        this.lastMinSequenceNumber = message.minimumSequenceNumber;
        // Add the message to the list of pending messages so we can transform them during a snapshot
        this.messagesSinceMSNChange.push(message);
        if (message.type === api_core_1.ObjectOperation) {
            const envelope = message.contents;
            const objectDetails = this.distributedObjects[envelope.address];
            objectDetails.connection.emit(envelope.contents, message.clientId, message.sequenceNumber, message.minimumSequenceNumber, message.origin, message.traces);
        }
        else if (message.type === api_core_1.AttachObject) {
            const attachMessage = message.contents;
            // If a non-local operation then go and create the object - otherwise mark it as officially
            // attached.
            if (message.clientId !== this.document.clientId) {
                // create storage service that wraps the attach data
                const localStorage = new api_core_1.LocalObjectStorageService(attachMessage.snapshot);
                const header = localStorage.readSync("header");
                const connection = new api_core_1.DeltaConnection(attachMessage.id, this);
                connection.setBaseMapping(0, message.sequenceNumber);
                const distributedObject = {
                    header,
                    id: attachMessage.id,
                    sequenceNumber: 0,
                    type: attachMessage.type,
                };
                const services = {
                    deltaConnection: connection,
                    objectStorage: localStorage,
                };
                const origin = message.origin ? message.origin.id : this.id;
                this.loadInternal(distributedObject, services, origin);
            }
            else {
                this.distributedObjects[attachMessage.id].connection.setBaseMapping(0, message.sequenceNumber);
            }
        }
        if (minSequenceNumberChanged) {
            // Reset the list of messages we have received since the min sequence number changed
            let index = 0;
            for (; index < this.messagesSinceMSNChange.length; index++) {
                if (this.messagesSinceMSNChange[index].sequenceNumber > message.minimumSequenceNumber) {
                    break;
                }
            }
            this.messagesSinceMSNChange = this.messagesSinceMSNChange.slice(index);
            // tslint:disable-next-line:forin
            for (const objectId in this.distributedObjects) {
                const object = this.distributedObjects[objectId];
                if (!object.object.isLocal() && object.connection.baseMappingIsSet()) {
                    object.connection.updateMinSequenceNumber(message.minimumSequenceNumber);
                }
            }
        }
        this.events.emit("op", message);
    }
}
exports.Document = Document;
/**
 * Loads a specific version (commit) of the collaborative object
 */
function load(id, options = exports.defaultDocumentOptions, version = null, connect = true, registry = exports.defaultRegistry, service = defaultDocumentService) {
    return __awaiter(this, void 0, void 0, function* () {
        // Verify an extensions registry was provided
        if (!registry) {
            throw new Error("No extension registry provided");
        }
        // Verify we have services to load the document with
        if (!service) {
            throw new Error("Document service not provided to load call");
        }
        return Document.Load(id, registry, service, options, version, connect);
    });
}
exports.load = load;

},{"../api-core":209,"../cell":218,"../core-utils":222,"../ink":232,"../map":235,"../merge-tree":239,"./debug":215,"assert":3,"events":37,"performance-now":179,"uuid/v4":200}],217:[function(require,module,exports){
"use strict";
function __export(m) {
    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
}
Object.defineProperty(exports, "__esModule", { value: true });
__export(require("./document"));

},{"./document":216}],218:[function(require,module,exports){
(function (Buffer){
"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const hasIn = require("lodash/hasIn");
const api = require("../api-core");
;
var CellValueType;
(function (CellValueType) {
    // The value is another collaborative object
    CellValueType[CellValueType["Collaborative"] = 0] = "Collaborative";
    // The value is a plain JavaScript object
    CellValueType[CellValueType["Plain"] = 1] = "Plain";
})(CellValueType = exports.CellValueType || (exports.CellValueType = {}));
const snapshotFileName = "header";
/**
 * Implementation of a cell collaborative object
 */
class Cell extends api.CollaborativeObject {
    /**
     * Constructs a new collaborative cell. If the object is non-local an id and service interfaces will
     * be provided
     */
    constructor(document, id, sequenceNumber, services, version, header) {
        super(document, id, CellExtension.Type, sequenceNumber, services);
        this.data = header ? JSON.parse(Buffer.from(header, "base64").toString("utf-8")) : null;
    }
    /**
     * Retrieves the value of the cell.
     */
    get() {
        return __awaiter(this, void 0, void 0, function* () {
            return this.getCore();
        });
    }
    /**
     * Sets the value of the cell.
     */
    set(value) {
        return __awaiter(this, void 0, void 0, function* () {
            let operationValue;
            if (hasIn(value, "__collaborativeObject__")) {
                // Convert any local collaborative objects to our internal storage format
                const collaborativeObject = value;
                const collabCellValue = {
                    id: collaborativeObject.id,
                    type: collaborativeObject.type,
                };
                operationValue = {
                    type: CellValueType[CellValueType.Collaborative],
                    value: collabCellValue,
                };
            }
            else {
                operationValue = {
                    type: CellValueType[CellValueType.Plain],
                    value,
                };
            }
            const op = {
                type: "set",
                value: operationValue,
            };
            this.setCore(op.value);
            this.submitLocalOperation(op);
        });
    }
    // Deletes the value from the cell.
    delete() {
        return __awaiter(this, void 0, void 0, function* () {
            const op = {
                type: "delete",
            };
            this.deleteCore();
            this.submitLocalOperation(op);
        });
    }
    /**
     * Returns whether cell is empty or not.
     */
    empty() {
        return __awaiter(this, void 0, void 0, function* () {
            return this.data === null ? true : false;
        });
    }
    snapshot() {
        const tree = {
            entries: [
                {
                    path: snapshotFileName,
                    type: api.TreeEntry[api.TreeEntry.Blob],
                    value: {
                        contents: JSON.stringify(this.data),
                        encoding: "utf-8",
                    },
                },
            ],
        };
        return tree;
    }
    submitCore(message) {
        const op = message.contents;
        // We need to translate any local collaborative object sets to the serialized form
        if (op.type === "set" && op.value.type === CellValueType[CellValueType.Collaborative]) {
            // We need to attach the object prior to submitting the message
            const collabMapValue = op.value.value;
            const collabObject = this.document.get(collabMapValue.id);
            if (collabObject.isLocal()) {
                collabObject.attach();
            }
        }
    }
    processCore(message) {
        if (message.type === api.OperationType && message.clientId !== this.document.clientId) {
            const op = message.contents;
            switch (op.type) {
                case "set":
                    this.setCore(op.value);
                    break;
                case "delete":
                    this.deleteCore();
                    break;
                default:
                    throw new Error("Unknown operation");
            }
        }
        this.events.emit("op", message);
    }
    processMinSequenceNumberChanged(value) {
        // TODO need our own concept of the zamboni here
    }
    setCore(value) {
        this.data = value;
        this.events.emit("valueChanged", this.getCore());
    }
    deleteCore() {
        this.data = null;
        this.events.emit("delete");
    }
    getCore() {
        const value = this.data;
        if (value === null) {
            return undefined;
        }
        else if (value.type === CellValueType[CellValueType.Collaborative]) {
            const collabCellValue = value.value;
            return this.document.get(collabCellValue.id);
        }
        else {
            return value.value;
        }
    }
}
/**
 * The extension that defines the map
 */
class CellExtension {
    constructor() {
        this.type = CellExtension.Type;
    }
    load(document, id, sequenceNumber, services, version, headerOrigin, header) {
        return new Cell(document, id, sequenceNumber, services, version, header);
    }
    create(document, id) {
        return new Cell(document, id, 0);
    }
}
CellExtension.Type = "https://graph.microsoft.com/types/cell";
exports.CellExtension = CellExtension;

}).call(this,require("buffer").Buffer)

},{"../api-core":209,"buffer":19,"lodash/hasIn":157}],219:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const api = require("../api");
exports.api = api;
const core = require("../api-core");
exports.core = core;
const cell = require("../cell");
exports.cell = cell;
const utils = require("../core-utils");
exports.utils = utils;
const types = require("../data-types");
exports.types = types;
const ink = require("../ink");
exports.ink = ink;
const map = require("../map");
exports.map = map;
const MergeTree = require("../merge-tree");
exports.MergeTree = MergeTree;
const socketStorage = require("../socket-storage");
exports.socketStorage = socketStorage;
// Experimenting with the below model. The modules below will be bundled within client-api but are of use
// to dependencies of client-api (like the UI code). So exposing access so they can import the bundled version.
const assert = require("assert");
exports.assert = assert;
const debug = require("debug");
exports.debug = debug;
const socketIoClient = require("socket.io-client");
exports.socketIoClient = socketIoClient;

},{"../api":217,"../api-core":209,"../cell":218,"../core-utils":222,"../data-types":226,"../ink":232,"../map":235,"../merge-tree":239,"../socket-storage":253,"assert":3,"debug":23,"socket.io-client":184}],220:[function(require,module,exports){
(function (process){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_utils_1 = require("../core-utils");
const defaultBatchSize = 100;
class BatchManager {
    constructor(process, batchSize = defaultBatchSize) {
        this.process = process;
        this.batchSize = batchSize;
        this.pendingWork = {};
        // TODO should add in a max batch size to this to limit sent sizes
    }
    add(id, work) {
        if (!(id in this.pendingWork)) {
            this.pendingWork[id] = [];
        }
        this.pendingWork[id].push(work);
        // Start processing either depending on the batchsize or nexttick.
        if (this.pendingWork[id].length >= this.batchSize) {
            this.startWork();
        }
        process.nextTick(() => {
            this.startWork();
        });
    }
    /**
     * Resolves once all pending work is complete
     */
    drain() {
        return this.workPending ? this.workPending.promise : Promise.resolve();
    }
    startWork() {
        if (!this.workPending) {
            this.workPending = new core_utils_1.Deferred();
            // Clear the internal flags first to avoid issues in case any of the pending work calls back into
            // the batch manager. We could also do this with a second setImmediate call but avodiing in order
            // to process the work quicker.
            const pendingWork = this.pendingWork;
            this.pendingWork = {};
            this.workPending.resolve();
            this.workPending = null;
            // TODO - I may wish to have the processing return a promise and not attempt to perform another
            // batch of work until this current one is done (or has errored)
            this.processPendingWork(pendingWork);
        }
    }
    processPendingWork(pendingWork) {
        // TODO log to influx how much pending work there is. We want to limit the size of a batch
        // tslint:disable-next-line:forin
        for (const id in pendingWork) {
            this.process(id, pendingWork[id]);
        }
    }
}
exports.BatchManager = BatchManager;

}).call(this,require('_process'))

},{"../core-utils":222,"_process":180}],221:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Computes a histogram of data values
 */
class Histogram {
    /**
     * Constructs a new histogram. Increment is used to create buckets for the data
     */
    constructor(increment) {
        this.increment = increment;
        this.buckets = [];
    }
    /**
     * Adds a new value to the histogram
     */
    add(value) {
        const bucket = Math.floor(value / this.increment);
        this.ensureBucket(bucket);
        this.buckets[bucket]++;
    }
    /**
     * Ensures the given bucket exists
     */
    ensureBucket(bucket) {
        for (let i = this.buckets.length; i <= bucket; i++) {
            this.buckets.push(0);
        }
    }
}
exports.Histogram = Histogram;
/**
 * Helper class to monitor throughput
 */
class ThroughputCounter {
    constructor(log, prefix = "", intervalTime = 5000) {
        this.log = log;
        this.prefix = prefix;
        this.intervalTime = intervalTime;
        this.produceCounter = new RateCounter();
        this.acknolwedgeCounter = new RateCounter();
    }
    produce(count = 1) {
        this.produceCounter.increment(count);
        this.ensureTracking();
    }
    acknolwedge(count = 1) {
        this.acknolwedgeCounter.increment(count);
        this.ensureTracking();
    }
    ensureTracking() {
        if (this.interval) {
            return;
        }
        // Reset both counters when starting the interval
        this.produceCounter.reset();
        this.acknolwedgeCounter.reset();
        // Kick off the interval
        this.interval = setInterval(() => {
            const produce = 1000 * this.produceCounter.getValue() / this.produceCounter.elapsed();
            const ack = 1000 * this.acknolwedgeCounter.getValue() / this.acknolwedgeCounter.elapsed();
            this.log(`${this.prefix}Produce@ ${produce.toFixed(2)} msg/s - Ack@ ${ack.toFixed(2)} msg/s`);
            // If there was no activity within the interval disable it
            if (this.produceCounter.getValue() === 0 && this.acknolwedgeCounter.getValue() === 0) {
                clearInterval(this.interval);
                this.interval = undefined;
            }
            this.produceCounter.reset();
            this.acknolwedgeCounter.reset();
        }, this.intervalTime);
    }
}
exports.ThroughputCounter = ThroughputCounter;
/**
 * Simple class to help sample rate based counters
 */
class RateCounter {
    constructor() {
        this.samples = 0;
        this.value = 0;
        this.reset();
    }
    increment(value) {
        this.samples++;
        this.value += value;
        this.minimum = this.minimum === undefined ? value : Math.min(this.minimum, value);
        this.maximum = this.maximum === undefined ? value : Math.max(this.maximum, value);
    }
    /**
     * Starts the counter
     */
    reset() {
        this.value = 0;
        this.samples = 0;
        this.minimum = undefined;
        this.maximum = undefined;
        this.start = Date.now();
    }
    elapsed() {
        return Date.now() - this.start;
    }
    /**
     * Returns the total accumulated value
     */
    getValue() {
        return this.value;
    }
    /**
     * Minimum value seen
     */
    getMinimum() {
        return this.minimum;
    }
    /**
     * Maximum value seen
     */
    getMaximum() {
        return this.maximum;
    }
    /**
     * Total number of samples provided to the counter
     */
    getSamples() {
        return this.samples;
    }
    /**
     * Returns the rate for the counter
     */
    getRate() {
        return this.value / this.elapsed();
    }
}
exports.RateCounter = RateCounter;
;

},{}],222:[function(require,module,exports){
"use strict";
function __export(m) {
    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
}
Object.defineProperty(exports, "__esModule", { value: true });
__export(require("./batchManager"));
__export(require("./counters"));
__export(require("./promises"));
__export(require("./rangeTracker"));
__export(require("./utils"));

},{"./batchManager":220,"./counters":221,"./promises":223,"./rangeTracker":224,"./utils":225}],223:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
/**
 * A deferred creates a promise and the ability to resolve or reject it
 */
class Deferred {
    constructor() {
        this.p = new Promise((resolve, reject) => {
            this.res = resolve;
            this.rej = reject;
        });
    }
    /**
     * Retrieves the underlying promise for the deferred
     */
    get promise() {
        return this.p;
    }
    /**
     * Resolves the promise
     */
    resolve(value) {
        this.res(value);
    }
    /**
     * Rejects the promsie
     */
    reject(error) {
        this.rej(error);
    }
}
exports.Deferred = Deferred;
/**
 * Helper function that asserts that the given promise only resolves
 */
function assertNotRejected(promise) {
    // Assert that the given promise only resolves
    promise.catch((error) => {
        assert.ok(false);
    });
    return promise;
}
exports.assertNotRejected = assertNotRejected;

},{"assert":3}],224:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const cloneDeep = require("lodash/cloneDeep");
/**
 * Helper class that keeps track of the relation between two ranges in a 1:N fashion. Primary
 * is continuous and always maps to a single value in secondary above the base value. The range
 * defines an increasing step function.
 */
class RangeTracker {
    get base() {
        return this.ranges[0].primary;
    }
    get primaryHead() {
        return this.lastPrimary;
    }
    get secondaryHead() {
        return this.lastSecondary;
    }
    constructor(primary, secondary) {
        if (typeof primary === "number") {
            this.ranges = [{ length: 0, primary, secondary }];
            this.lastPrimary = primary;
            this.lastSecondary = secondary;
        }
        else {
            this.ranges = cloneDeep(primary.ranges);
            this.lastPrimary = primary.lastPrimary;
            this.lastSecondary = primary.lastSecondary;
        }
    }
    /**
     * Returns a serialized form of the RangeTracker
     */
    serialize() {
        return {
            lastPrimary: this.lastPrimary,
            lastSecondary: this.lastSecondary,
            ranges: cloneDeep(this.ranges),
        };
    }
    // primary is time - secondary is the MSN
    add(primary, secondary) {
        // Both values must continuously be increasing - we won't always track the last value we saw so we do so
        // below to check invariants
        assert(primary >= this.lastPrimary);
        assert(secondary >= this.lastSecondary);
        this.lastPrimary = primary;
        this.lastSecondary = secondary;
        // Get quicker references to the head of the range
        const head = this.ranges[this.ranges.length - 1];
        const primaryHead = head.primary + head.length;
        const secondaryHead = head.secondary + head.length;
        // Same secondary indicates this is not a true inflection point - we can ignore it
        if (secondary === secondaryHead) {
            return;
        }
        // New secondary - need to update the ranges
        if (primary === primaryHead) {
            // Technically this code path has us supporting N:N ranges. But we simply overwrite duplicate values to
            // preserve 1:N since you can only lookup from the primary to a secondary
            if (head.length === 0) {
                // No range represented - we can simply update secondary with the overwritten value
                head.secondary = secondary;
            }
            else {
                // The values in the range before this one are valid - but we need to create a new one for this update
                head.length--;
                this.ranges.push({ length: 0, primary, secondary });
            }
        }
        else {
            if (primaryHead + 1 === primary && secondaryHead + 1 === secondary) {
                // extend the length if both increase by the same amount
                head.length++;
            }
            else {
                // Insert a new node
                this.ranges.push({ length: 0, primary, secondary });
            }
        }
    }
    get(primary) {
        assert(primary >= this.ranges[0].primary);
        // Find the first range where the starting position is greater than the primary. Our target range is
        // the one before it.
        let index = 1;
        for (; index < this.ranges.length; index++) {
            if (primary < this.ranges[index].primary) {
                break;
            }
        }
        assert(primary >= this.ranges[index - 1].primary);
        // If the difference is within the stored range use it - otherwise add in the length - 1 as the highest
        // stored secondary value to use.
        const closestRange = this.ranges[index - 1];
        return Math.min(primary - closestRange.primary, closestRange.length) + closestRange.secondary;
    }
    updateBase(primary) {
        assert(primary >= this.ranges[0].primary);
        // Walk the ranges looking for the first one that is greater than the primary. Primary is then within the
        // previous index by definition (since it's less than the current index's primary but greather than the
        // previous index's primary) and we know primary must be greater than the base.
        let index = 1;
        for (; index < this.ranges.length; index++) {
            if (primary < this.ranges[index].primary) {
                break;
            }
        }
        assert(primary >= this.ranges[index - 1].primary);
        // Update the last range values
        const range = this.ranges[index - 1];
        const delta = primary - range.primary;
        range.secondary = range.secondary + Math.min(delta, range.length);
        range.length = Math.max(range.length - delta, 0);
        range.primary = primary;
        // And remove unnecessary ranges
        this.ranges = index - 1 > 0 ? this.ranges.slice(index - 1) : this.ranges;
        // assert that the lowest value is now the input to this method
        assert.equal(primary, this.ranges[0].primary);
    }
}
exports.RangeTracker = RangeTracker;

},{"assert":3,"lodash/cloneDeep":155}],225:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Returns the value of an object or sets to default if undefined.
 */
function getOrDefault(value, def) {
    return (value === undefined) ? def : value;
}
exports.getOrDefault = getOrDefault;

},{}],226:[function(require,module,exports){
"use strict";
function __export(m) {
    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
}
Object.defineProperty(exports, "__esModule", { value: true });
__export(require("./stream"));

},{"./stream":227}],227:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const uuid = require("uuid/v4");
/**
 * Fluent implementation of the IDelta interface to make creation the underlying operation easier.
 * Only one operation per delta is currently supported but it's expected this will expand to multiple in
 * the future
 */
class Delta {
    constructor(operations = []) {
        this.operations = operations;
    }
    /**
     * Composes two ink delta streams together - which is as simple as appending their operation
     * logs
     */
    compose(delta) {
        this.operations = this.operations.concat(delta.operations);
    }
    push(operation) {
        this.operations.push(operation);
    }
    clear(time = new Date().getTime()) {
        let clear = {};
        this.operations.push({ clear, time });
        return this;
    }
    stylusUp(point, pressure, id = uuid(), time = new Date().getTime()) {
        let stylusUp = {
            id,
            point,
            pressure,
        };
        this.operations.push({ stylusUp, time });
        return this;
    }
    stylusDown(point, pressure, pen, layer = 0, id = uuid(), time = new Date().getTime()) {
        let stylusDown = {
            id,
            layer,
            pen,
            point,
            pressure,
        };
        this.operations.push({ stylusDown, time });
        return this;
    }
    stylusMove(point, pressure, id = uuid(), time = new Date().getTime()) {
        let stylusMove = {
            id,
            point,
            pressure,
        };
        this.operations.push({ stylusMove, time });
        return this;
    }
}
exports.Delta = Delta;
/**
 * Retrieves the type of action contained within the operation
 */
function getActionType(operation) {
    if (operation.clear) {
        return ActionType.Clear;
    }
    else if (operation.stylusDown) {
        return ActionType.StylusDown;
    }
    else if (operation.stylusUp) {
        return ActionType.StylusUp;
    }
    else if (operation.stylusMove) {
        return ActionType.StylusMove;
    }
    else {
        throw "Unknown action";
    }
}
exports.getActionType = getActionType;
/**
 * Extracts the IStylusAction contained in the operation
 */
function getStylusAction(operation) {
    if (operation.stylusDown) {
        return operation.stylusDown;
    }
    else if (operation.stylusUp) {
        return operation.stylusUp;
    }
    else if (operation.stylusMove) {
        return operation.stylusMove;
    }
    else {
        throw "Unknown action";
    }
}
exports.getStylusAction = getStylusAction;
/**
 * Helper function to retrieve the ID of the stylus operation
 */
function getStylusId(operation) {
    let type = getActionType(operation);
    switch (type) {
        case ActionType.StylusDown:
            return operation.stylusDown.id;
        case ActionType.StylusUp:
            return operation.stylusUp.id;
        case ActionType.StylusMove:
            return operation.stylusMove.id;
        default:
            throw "Non-stylus event";
    }
}
exports.getStylusId = getStylusId;
/**
 * Type of action
 */
var ActionType;
(function (ActionType) {
    // Action of placing the stylus on the canvas
    ActionType[ActionType["StylusDown"] = 0] = "StylusDown";
    // Action of picking the stylus up from the canvas
    ActionType[ActionType["StylusUp"] = 1] = "StylusUp";
    // Stylus has moved on the canvas
    ActionType[ActionType["StylusMove"] = 2] = "StylusMove";
    // Canvas has been cleared
    ActionType[ActionType["Clear"] = 3] = "Clear";
})(ActionType = exports.ActionType || (exports.ActionType = {}));

},{"uuid/v4":200}],228:[function(require,module,exports){
"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const api = require("../api-core");
class GitManager {
    constructor(historian, repository) {
        this.historian = historian;
        this.repository = repository;
    }
    getHeader(id, sha) {
        return this.historian.getHeader(this.repository, sha);
    }
    getCommit(sha) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.historian.getCommit(this.repository, sha);
        });
    }
    /**
     * Reads the object with the given ID. We defer to the client implementation to do the actual read.
     */
    getCommits(sha, count) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.historian.getCommits(this.repository, sha, count);
        });
    }
    /**
     * Reads the object with the given ID. We defer to the client implementation to do the actual read.
     */
    getTree(root, recursive = true) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.historian.getTree(this.repository, root, recursive);
        });
    }
    getBlob(sha) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.historian.getBlob(this.repository, sha);
        });
    }
    /**
     * Retrieves the object at the given revision number
     */
    getContent(commit, path) {
        return this.historian.getContent(this.repository, path, commit);
    }
    createBlob(content, encoding) {
        const blob = {
            content,
            encoding,
        };
        return this.historian.createBlob(this.repository, blob);
    }
    createTree(files) {
        return __awaiter(this, void 0, void 0, function* () {
            // Kick off the work to create all the tree values
            const entriesP = [];
            for (const entry of files.entries) {
                switch (api.TreeEntry[entry.type]) {
                    case api.TreeEntry.Blob:
                        const entryAsBlob = entry.value;
                        const blobP = this.createBlob(entryAsBlob.contents, entryAsBlob.encoding);
                        entriesP.push(blobP);
                        break;
                    case api.TreeEntry.Tree:
                        const entryAsTree = entry.value;
                        const treeBlobP = this.createTree(entryAsTree);
                        entriesP.push(treeBlobP);
                        break;
                    default:
                        return Promise.reject("Unknown entry type");
                }
            }
            // Wait for them all to resolve
            const entries = yield Promise.all(entriesP);
            const tree = [];
            assert(entries.length === files.entries.length);
            // Construct a new tree from the collection of hashes
            for (let i = 0; i < files.entries.length; i++) {
                const isTree = files.entries[i].type === api.TreeEntry[api.TreeEntry.Tree];
                tree.push({
                    mode: isTree ? "040000" : "100644",
                    path: files.entries[i].path,
                    sha: entries[i].sha,
                    type: isTree ? "tree" : "blob",
                });
            }
            const requestBody = {
                tree,
            };
            const treeP = this.historian.createTree(this.repository, requestBody);
            return treeP;
        });
    }
    createCommit(commit) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.historian.createCommit(this.repository, commit);
        });
    }
    getRef(ref) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.historian
                .getRef(this.repository, `heads/${ref}`)
                .catch((error) => {
                if (error === 400 || error === 404) {
                    return null;
                }
                else {
                    return Promise.reject(error);
                }
            });
        });
    }
    upsertRef(branch, commitSha) {
        return __awaiter(this, void 0, void 0, function* () {
            // Update (force) the ref to the new commit
            const ref = {
                force: true,
                sha: commitSha,
            };
            return this.historian.updateRef(this.repository, `heads/${branch}`, ref);
        });
    }
    /**
     * Writes to the object with the given ID
     */
    write(branch, inputTree, message) {
        return __awaiter(this, void 0, void 0, function* () {
            const treeShaP = this.createTree(inputTree);
            const lastCommitP = this.getCommits(branch, 1);
            // TODO maybe I should make people provide the parent commit rather than get the last one?
            const joined = yield Promise.all([treeShaP, lastCommitP]);
            const tree = joined[0];
            const lastCommit = joined[1];
            // Construct a commit for the tree
            const commitParams = {
                author: {
                    date: new Date().toISOString(),
                    email: "kurtb@microsoft.com",
                    name: "Kurt Berglund",
                },
                message,
                parents: lastCommit.length > 0 ? [{ sha: lastCommit[0].sha, url: "" }] : [],
                tree: tree.sha,
            };
            const commit = yield this.historian.createCommit(this.repository, commitParams);
            yield this.upsertRef(branch, commit.sha);
            return commit;
        });
    }
}
exports.GitManager = GitManager;
function repositoryExists(historian, repository) {
    return __awaiter(this, void 0, void 0, function* () {
        const details = yield historian.getRepo(repository);
        return !!details;
    });
}
function createRepository(historian, repository) {
    const createParams = {
        name: repository,
    };
    return historian.createRepo(createParams);
}
function getOrCreateRepository(historian, repository) {
    return __awaiter(this, void 0, void 0, function* () {
        const exists = yield repositoryExists(historian, repository);
        if (!exists) {
            yield createRepository(historian, repository);
        }
        return new GitManager(historian, repository);
    });
}
exports.getOrCreateRepository = getOrCreateRepository;

},{"../api-core":209,"assert":3}],229:[function(require,module,exports){
"use strict";
function __export(m) {
    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
}
Object.defineProperty(exports, "__esModule", { value: true });
__export(require("./gitManager"));

},{"./gitManager":228}],230:[function(require,module,exports){
(function (Buffer){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const api = require("../api-core");
const extension_1 = require("./extension");
const snapshot_1 = require("./snapshot");
;
const snapshotFileName = "header";
class InkCollaborativeObject extends api.CollaborativeObject {
    constructor(document, id, sequenceNumber, services, version, header) {
        super(document, id, extension_1.InkExtension.Type, sequenceNumber, services);
        const data = header
            ? JSON.parse(Buffer.from(header, "base64").toString("utf-8"))
            : { layers: [], layerIndex: {} };
        this.inkSnapshot = snapshot_1.Snapshot.Clone(data);
    }
    snapshot() {
        const tree = {
            entries: [
                {
                    path: snapshotFileName,
                    type: api.TreeEntry[api.TreeEntry.Blob],
                    value: {
                        contents: JSON.stringify(this.inkSnapshot),
                        encoding: "utf-8",
                    },
                },
            ],
        };
        return tree;
    }
    getLayers() {
        return this.inkSnapshot.layers;
    }
    getLayer(key) {
        return this.inkSnapshot.layers[this.inkSnapshot.layerIndex[key]];
    }
    submitOp(op) {
        this.submitLocalOperation(op);
        this.inkSnapshot.apply(op);
    }
    processCore(message) {
        if (message.type === api.OperationType && message.clientId !== this.document.clientId) {
            this.inkSnapshot.apply(message.contents);
        }
        this.events.emit("op", message);
    }
    processMinSequenceNumberChanged(value) {
        // TODO need our own concept of the zamboni here
    }
}
exports.InkCollaborativeObject = InkCollaborativeObject;

}).call(this,require("buffer").Buffer)

},{"../api-core":209,"./extension":231,"./snapshot":233,"buffer":19}],231:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const collabObject_1 = require("./collabObject");
class InkExtension {
    constructor() {
        this.type = InkExtension.Type;
    }
    load(document, id, sequenceNumber, services, version, headerOrigin, header) {
        return new collabObject_1.InkCollaborativeObject(document, id, sequenceNumber, services, version, header);
    }
    create(document, id) {
        return new collabObject_1.InkCollaborativeObject(document, id, 0);
    }
}
InkExtension.Type = "https://graph.microsoft.com/types/ink";
exports.InkExtension = InkExtension;

},{"./collabObject":230}],232:[function(require,module,exports){
"use strict";
function __export(m) {
    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
}
Object.defineProperty(exports, "__esModule", { value: true });
__export(require("./extension"));
__export(require("./snapshot"));

},{"./extension":231,"./snapshot":233}],233:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const data_types_1 = require("../data-types");
class Snapshot {
    constructor(layers = [], layerIndex = {}) {
        this.layers = layers;
        this.layerIndex = layerIndex;
    }
    static Clone(snapshot) {
        return new Snapshot(snapshot.layers, snapshot.layerIndex);
    }
    apply(delta) {
        for (let operation of delta.operations) {
            this.applyOperation(operation);
        }
    }
    applyOperation(operation) {
        let actionType = data_types_1.getActionType(operation);
        switch (actionType) {
            case data_types_1.ActionType.Clear:
                this.processClearAction(operation);
                break;
            case data_types_1.ActionType.StylusUp:
                this.processStylusUpAction(operation);
                break;
            case data_types_1.ActionType.StylusDown:
                this.processStylusDownAction(operation);
                break;
            case data_types_1.ActionType.StylusMove:
                this.processStylusMoveAction(operation);
                break;
            default:
                throw "Unknown action type";
        }
    }
    processClearAction(operation) {
        this.layers = [];
        this.layerIndex = {};
    }
    processStylusUpAction(operation) {
        // TODO - longer term on ink up - or possibly earlier - we can attempt to smooth the provided ink
        this.addOperationToLayer(operation.stylusUp.id, operation);
    }
    processStylusDownAction(operation) {
        let layer = {
            id: operation.stylusDown.id,
            operations: [],
        };
        // Push if we are isnerting at the end - otherwise splice to insert at the specified location
        if (operation.stylusDown.layer === 0) {
            this.layers.push(layer);
        }
        else {
            this.layers.splice(this.layers.length - operation.stylusDown.layer, 0, layer);
        }
        // Create a reference to the specified layer
        let layerIndex = this.layers.length - 1 - operation.stylusDown.layer;
        this.layerIndex[layer.id] = layerIndex;
        // And move any after it down by one
        for (layerIndex = layerIndex + 1; layerIndex < this.layers.length; layerIndex++) {
            let layerId = this.layers[layerIndex].id;
            this.layerIndex[layerId] = this.layerIndex[layerId] + 1;
        }
        // And save the stylus down
        this.addOperationToLayer(operation.stylusDown.id, operation);
    }
    processStylusMoveAction(operation) {
        this.addOperationToLayer(operation.stylusMove.id, operation);
    }
    addOperationToLayer(id, operation) {
        let layerIndex = this.layerIndex[id];
        this.layers[layerIndex].operations.push(operation);
    }
}
exports.Snapshot = Snapshot;

},{"../data-types":226}],234:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class Counter {
    constructor(parentMap, key, min, max) {
        this.parentMap = parentMap;
        this.key = key;
        this.min = min;
        this.max = max;
    }
    init(value) {
        this.internalValue = value;
        return this;
    }
    set(value) {
        this.internalValue = value;
    }
    increment(value) {
        return this.parentMap.incrementCounter(this.key, value, this.min, this.max);
    }
    get() {
        return this.internalValue;
    }
    getMin() {
        return this.min;
    }
    getMax() {
        return this.max;
    }
}
exports.Counter = Counter;

},{}],235:[function(require,module,exports){
"use strict";
function __export(m) {
    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
}
Object.defineProperty(exports, "__esModule", { value: true });
__export(require("./map"));

},{"./map":236}],236:[function(require,module,exports){
(function (Buffer){
"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const hasIn = require("lodash/hasIn");
const api = require("../api-core");
const core_utils_1 = require("../core-utils");
const counter_1 = require("./counter");
const set_1 = require("./set");
var ValueType;
(function (ValueType) {
    // The value is a collaborative object
    ValueType[ValueType["Collaborative"] = 0] = "Collaborative";
    // The value is a plain JavaScript object
    ValueType[ValueType["Plain"] = 1] = "Plain";
    // The value is a counter
    ValueType[ValueType["Counter"] = 2] = "Counter";
    // The value is a set
    ValueType[ValueType["Set"] = 3] = "Set";
})(ValueType = exports.ValueType || (exports.ValueType = {}));
const snapshotFileName = "header";
/**
 * Copies all values from the provided MapView to the given Map
 */
function copyMap(from, to) {
    from.forEach((value, key) => {
        to.set(key, value);
    });
}
exports.copyMap = copyMap;
class MapView {
    constructor(document, id, data, events, submitLocalOperation) {
        this.document = document;
        this.events = events;
        this.submitLocalOperation = submitLocalOperation;
        this.data = new Map();
        // Initialize the map of values
        // tslint:disable-next-line:forin
        for (const key in data) {
            this.data.set(key, data[key]);
        }
    }
    forEach(callbackFn) {
        this.data.forEach((value, key) => {
            callbackFn(this.translateValue(value), key);
        });
    }
    get(key) {
        if (!this.data.has(key)) {
            return undefined;
        }
        const value = this.data.get(key);
        return this.translateValue(value);
    }
    wait(key) {
        return __awaiter(this, void 0, void 0, function* () {
            // Return immediately if the value already exists
            if (this.has(key)) {
                return this.get(key);
            }
            // Otherwise subscribe to changes
            return new Promise((resolve, reject) => {
                const callback = (value) => {
                    if (key === value.key) {
                        resolve(this.get(value.key));
                        this.events.removeListener("valueChanged", callback);
                    }
                };
                this.events.on("valueChanged", callback);
            });
        });
    }
    has(key) {
        return this.data.has(key);
    }
    set(key, value) {
        let operationValue;
        if (hasIn(value, "__collaborativeObject__")) {
            // Convert any local collaborative objects to our internal storage format
            const collaborativeObject = value;
            const collabMapValue = {
                id: collaborativeObject.id,
                type: collaborativeObject.type,
            };
            operationValue = {
                type: ValueType[ValueType.Collaborative],
                value: collabMapValue,
            };
        }
        else {
            operationValue = {
                type: ValueType[ValueType.Plain],
                value,
            };
        }
        const op = {
            key,
            type: "set",
            value: operationValue,
        };
        this.setCore(op.key, op.value);
        this.submitLocalOperation(op);
    }
    delete(key) {
        const op = {
            key,
            type: "delete",
        };
        this.deleteCore(op.key);
        this.submitLocalOperation(op);
    }
    keys() {
        return this.data.keys();
    }
    clear() {
        const op = {
            type: "clear",
        };
        this.clearCore();
        this.submitLocalOperation(op);
    }
    /**
     * Serializes the collaborative map to a JSON string
     */
    serialize() {
        const serialized = {};
        this.data.forEach((value, key) => {
            switch (value.type) {
                case ValueType[ValueType.Set]:
                    const set = value.value;
                    serialized[key] = { type: value.type, value: set.entries() };
                    break;
                case ValueType[ValueType.Counter]:
                    const counter = value.value;
                    serialized[key] = {
                        type: value.type,
                        value: {
                            max: counter.getMax(),
                            min: counter.getMin(),
                            value: counter.get(),
                        },
                    };
                    break;
                default:
                    serialized[key] = value;
            }
        });
        return JSON.stringify(serialized);
    }
    getMapValue(key) {
        if (!this.data.has(key)) {
            return undefined;
        }
        return this.data.get(key);
    }
    setCore(key, value) {
        this.data.set(key, value);
        this.events.emit("valueChanged", { key });
    }
    clearCore() {
        this.data.clear();
        this.events.emit("clear");
    }
    deleteCore(key) {
        this.data.delete(key);
        this.events.emit("valueChanged", { key });
    }
    initCounter(object, key, value, min, max) {
        const operationValue = {
            type: ValueType[ValueType.Counter],
            value: {
                value,
                min,
                max,
            },
        };
        const op = {
            key,
            type: "initCounter",
            value: operationValue,
        };
        this.submitLocalOperation(op);
        return this.initCounterCore(object, op.key, op.value);
    }
    loadCounter(object, key, value, min, max) {
        const newCounter = new counter_1.Counter(object, key, min, max);
        const newValue = { type: ValueType[ValueType.Counter], value: newCounter.init(value) };
        this.data.set(key, newValue);
    }
    initCounterCore(object, key, value) {
        const newCounter = new counter_1.Counter(object, key, value.value.min, value.value.max);
        newCounter.init(value.value.value);
        const newValue = { type: ValueType[ValueType.Counter], value: newCounter };
        this.data.set(key, newValue);
        this.events.emit("valueChanged", { key });
        this.events.emit("initCounter", { key, value: newValue.value });
        return newValue.value;
    }
    incrementCounter(key, value) {
        const operationValue = { type: ValueType[ValueType.Counter], value };
        const op = {
            key,
            type: "incrementCounter",
            value: operationValue,
        };
        this.submitLocalOperation(op);
        return this.incrementCounterCore(op.key, op.value);
    }
    incrementCounterCore(key, value) {
        const currentCounter = this.get(key);
        currentCounter.set(currentCounter.get() + value.value);
        this.events.emit("valueChanged", { key });
        this.events.emit("incrementCounter", { key, value: value.value });
        return currentCounter;
    }
    initSet(object, key, value) {
        const operationValue = { type: ValueType[ValueType.Set], value };
        const op = {
            key,
            type: "initSet",
            value: operationValue,
        };
        this.submitLocalOperation(op);
        return this.initSetCore(object, op.key, op.value);
    }
    loadSet(object, key, value) {
        const newSet = new set_1.DistributedSet(object, key);
        const newValue = { type: ValueType[ValueType.Set], value: newSet.init(value) };
        this.data.set(key, newValue);
    }
    initSetCore(object, key, value) {
        const newSet = new set_1.DistributedSet(object, key);
        newSet.init(value.value);
        const newValue = { type: ValueType[ValueType.Set], value: newSet };
        this.data.set(key, newValue);
        this.events.emit("valueChanged", { key });
        this.events.emit("setCreated", { key, value: newValue.value });
        return newValue.value;
    }
    insertSet(key, value) {
        const operationValue = { type: ValueType[ValueType.Set], value };
        const op = {
            key,
            type: "insertSet",
            value: operationValue,
        };
        this.insertSetCore(op.key, op.value);
        this.submitLocalOperation(op);
        return this.data.get(key).value;
    }
    insertSetCore(key, value) {
        const currentSet = this.get(key);
        currentSet.getInternalSet().add(value.value);
        this.events.emit("valueChanged", { key });
        this.events.emit("setElementAdded", { key, value: value.value });
    }
    deleteSet(key, value) {
        const operationValue = { type: ValueType[ValueType.Set], value };
        const op = {
            key,
            type: "deleteSet",
            value: operationValue,
        };
        this.deleteSetCore(op.key, op.value);
        this.submitLocalOperation(op);
        return this.data.get(key).value;
    }
    deleteSetCore(key, value) {
        const currentSet = this.get(key);
        currentSet.getInternalSet().delete(value.value);
        this.events.emit("valueChanged", { key });
        this.events.emit("setElementRemoved", { key, value: value.value });
    }
    translateValue(value) {
        if (value.type === ValueType[ValueType.Collaborative]) {
            const collabMapValue = value.value;
            return this.document.get(collabMapValue.id);
        }
        else {
            return value.value;
        }
    }
}
exports.MapView = MapView;
/**
 * Implementation of a map collaborative object
 */
class CollaborativeMap extends api.CollaborativeObject {
    /**
     * Constructs a new collaborative map. If the object is non-local an id and service interfaces will
     * be provided
     */
    constructor(document, id, sequenceNumber, services, version, header) {
        super(document, id, MapExtension.Type, sequenceNumber, services);
        const data = header ? JSON.parse(Buffer.from(header, "base64").toString("utf-8")) : {};
        this.view = new MapView(document, id, data, this.events, (op) => this.submitLocalOperation(op));
        this.deserialize();
    }
    keys() {
        return __awaiter(this, void 0, void 0, function* () {
            return Promise.resolve(Array.from(this.view.keys()));
        });
    }
    /**
     * Retrieves the value with the given key from the map.
     */
    get(key) {
        return Promise.resolve(this.view.get(key));
    }
    wait(key) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.view.wait(key);
        });
    }
    has(key) {
        return Promise.resolve(this.view.has(key));
    }
    set(key, value) {
        return Promise.resolve(this.view.set(key, value));
    }
    delete(key) {
        return Promise.resolve(this.view.delete(key));
    }
    clear() {
        return Promise.resolve(this.view.clear());
    }
    createCounter(key, value, min, max) {
        value = core_utils_1.getOrDefault(value, 0);
        min = core_utils_1.getOrDefault(min, Number.MIN_SAFE_INTEGER);
        max = core_utils_1.getOrDefault(max, Number.MAX_SAFE_INTEGER);
        if (!(typeof value === "number" && typeof min === "number" && typeof max === "number")) {
            throw new Error("parameters should be of number type!");
        }
        if (value < min || value > max) {
            throw new Error("Initial value exceeds the counter range!");
        }
        return this.view.initCounter(this, key, value, min, max);
    }
    incrementCounter(key, value, min, max) {
        if (typeof value !== "number") {
            throw new Error("Incremental amount should be a number.");
        }
        const compatible = this.ensureCompatibility(key, ValueType[ValueType.Counter]);
        if (compatible.reject !== null) {
            throw new Error("Incompatible type.");
        }
        const currentData = compatible.data;
        const currentValue = currentData.value;
        const nextValue = currentValue.get() + value;
        if ((nextValue < min) || (nextValue > max)) {
            throw new Error("Error: Counter range exceeded!");
        }
        return this.view.incrementCounter(key, value);
    }
    getCounterValue(key) {
        const compatible = this.ensureCompatibility(key, ValueType[ValueType.Counter]);
        return compatible.reject !== null ? compatible.reject : Promise.resolve(compatible.data.value);
    }
    createSet(key, value) {
        value = core_utils_1.getOrDefault(value, []);
        return this.view.initSet(this, key, value);
    }
    insertSet(key, value) {
        const compatible = this.ensureCompatibility(key, ValueType[ValueType.Set]);
        return compatible.reject !== null ? null : this.view.insertSet(key, value);
    }
    deleteSet(key, value) {
        const compatible = this.ensureCompatibility(key, ValueType[ValueType.Set]);
        return compatible.reject !== null ? null : this.view.deleteSet(key, value);
    }
    enumerateSet(key) {
        const compatible = this.ensureCompatibility(key, ValueType[ValueType.Set]);
        if (compatible.reject !== null) {
            return null;
        }
        const resultSet = compatible.data.value;
        return Array.from(resultSet.getInternalSet().values());
    }
    snapshot() {
        const tree = {
            entries: [
                {
                    path: snapshotFileName,
                    type: api.TreeEntry[api.TreeEntry.Blob],
                    value: {
                        contents: this.view.serialize(),
                        encoding: "utf-8",
                    },
                },
            ],
        };
        return tree;
    }
    /**
     * Returns a synchronous view of the map
     */
    getView() {
        return Promise.resolve(this.view);
    }
    submitCore(message) {
        // TODO chain these requests given the attach is async
        const op = message.contents;
        // We need to translate any local collaborative object sets to the serialized form
        if (op.type === "set" && op.value.type === ValueType[ValueType.Collaborative]) {
            // We need to attach the object prior to submitting the message so that its state is available
            // to upstream users following the attach
            const collabMapValue = op.value.value;
            const collabObject = this.document.get(collabMapValue.id);
            collabObject.attach();
        }
    }
    processMinSequenceNumberChanged(value) {
        // TODO need our own concept of the zamboni here
    }
    processCore(message) {
        if (message.type === api.OperationType && message.clientId !== this.document.clientId) {
            const op = message.contents;
            switch (op.type) {
                case "clear":
                    this.view.clearCore();
                    break;
                case "delete":
                    this.view.deleteCore(op.key);
                    break;
                case "set":
                    this.view.setCore(op.key, op.value);
                    break;
                case "initCounter":
                    this.view.initCounterCore(this, op.key, op.value);
                    break;
                case "incrementCounter":
                    this.view.incrementCounterCore(op.key, op.value);
                    break;
                case "initSet":
                    this.view.initSetCore(this, op.key, op.value);
                    break;
                case "insertSet":
                    this.view.insertSetCore(op.key, op.value);
                    break;
                case "deleteSet":
                    this.view.deleteSetCore(op.key, op.value);
                    break;
                default:
                    throw new Error("Unknown operation");
            }
        }
        this.events.emit("op", message);
    }
    // Deserializes the map values into specific types (e.g., set, counter etc.)
    deserialize() {
        const mapView = this.view;
        const keys = mapView.keys();
        for (let key of keys) {
            const value = mapView.getMapValue(key);
            if (value !== undefined) {
                switch (value.type) {
                    case ValueType[ValueType.Set]:
                        mapView.loadSet(this, key, value.value);
                        break;
                    case ValueType[ValueType.Counter]:
                        mapView.loadCounter(this, key, value.value.value, value.value.min, value.value.max);
                        break;
                    default:
                        break;
                }
            }
        }
    }
    // Check if key exists in the map and if the value type is of the desired type (e.g., set, counter etc.)
    ensureCompatibility(key, targetType) {
        const currentData = this.view.getMapValue(key);
        if (currentData === undefined) {
            return {
                data: null,
                reject: Promise.reject("Error: No key found!"),
            };
        }
        if (currentData.type !== targetType) {
            return {
                data: null,
                reject: Promise.reject("Error: Incompatible value type!"),
            };
        }
        return {
            data: currentData,
            reject: null,
        };
    }
}
exports.CollaborativeMap = CollaborativeMap;
/**
 * The extension that defines the map
 */
class MapExtension {
    constructor() {
        this.type = MapExtension.Type;
    }
    load(document, id, sequenceNumber, services, version, headerOrigin, header) {
        return new CollaborativeMap(document, id, sequenceNumber, services, version, header);
    }
    create(document, id) {
        return new CollaborativeMap(document, id, 0);
    }
}
MapExtension.Type = "https://graph.microsoft.com/types/map";
exports.MapExtension = MapExtension;

}).call(this,require("buffer").Buffer)

},{"../api-core":209,"../core-utils":222,"./counter":234,"./set":237,"buffer":19,"lodash/hasIn":157}],237:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class DistributedSet {
    constructor(parentMap, key) {
        this.parentMap = parentMap;
        this.key = key;
    }
    init(values) {
        this.internalSet = new Set(values);
        return this;
    }
    add(value) {
        return this.parentMap.insertSet(this.key, value);
    }
    delete(value) {
        return this.parentMap.deleteSet(this.key, value);
    }
    entries() {
        return this.parentMap.enumerateSet(this.key);
    }
    getInternalSet() {
        return this.internalSet;
    }
}
exports.DistributedSet = DistributedSet;

},{}],238:[function(require,module,exports){
"use strict";
// tslint:disable
Object.defineProperty(exports, "__esModule", { value: true });
class Stack {
    constructor() {
        this.items = [];
    }
    push(val) {
        this.items.push(val);
    }
    empty() {
        return this.items.length == 0;
    }
    top() {
        return this.items[this.items.length - 1];
    }
    pop() {
        return this.items.pop();
    }
}
exports.Stack = Stack;
function ListRemoveEntry(entry) {
    if (entry === undefined) {
        return undefined;
    }
    else if (entry.isHead) {
        return undefined;
    }
    else {
        entry.next.prev = entry.prev;
        entry.prev.next = entry.next;
    }
    return (entry);
}
exports.ListRemoveEntry = ListRemoveEntry;
function ListMakeEntry(data) {
    var entry = new List(false, data);
    entry.prev = entry;
    entry.next = entry;
    return entry;
}
exports.ListMakeEntry = ListMakeEntry;
function ListMakeHead() {
    var entry = new List(true, undefined);
    entry.prev = entry;
    entry.next = entry;
    return entry;
}
exports.ListMakeHead = ListMakeHead;
class List {
    constructor(isHead, data) {
        this.isHead = isHead;
        this.data = data;
    }
    clear() {
        if (this.isHead) {
            this.prev = this;
            this.next = this;
        }
    }
    add(data) {
        var entry = ListMakeEntry(data);
        this.prev.next = entry;
        entry.next = this;
        entry.prev = this.prev;
        this.prev = entry;
        return (entry);
    }
    dequeue() {
        if (!this.empty()) {
            let removedEntry = ListRemoveEntry(this.next);
            return removedEntry.data;
        }
    }
    enqueue(data) {
        return this.add(data);
    }
    walk(fn) {
        for (var entry = this.next; !(entry.isHead); entry = entry.next) {
            fn(entry.data, entry);
        }
    }
    some(fn, rev) {
        for (var entry = this; !(entry.isHead); entry = rev ? entry.prev : entry.next) {
            if (fn(entry.data, entry)) {
                return (entry.data);
            }
        }
    }
    count() {
        var entry;
        var i;
        entry = this.next;
        for (i = 0; !(entry.isHead); i++) {
            entry = entry.next;
        }
        return (i);
    }
    first() {
        if (!this.empty()) {
            return (this.next.data);
        }
    }
    last() {
        if (!this.empty()) {
            return (this.prev.data);
        }
    }
    empty() {
        return (this.next == this);
    }
    pushEntry(entry) {
        entry.isHead = false;
        entry.next = this.next;
        entry.prev = this;
        this.next = entry;
        entry.next.prev = entry;
    }
    push(data) {
        var entry = ListMakeEntry(data);
        entry.data = data;
        entry.isHead = false;
        entry.next = this.next;
        entry.prev = this;
        this.next = entry;
        entry.next.prev = entry;
    }
    popEntry(head) {
        if (this.next.isHead)
            return (undefined);
        else
            return (ListRemoveEntry(this.next));
    }
    insertEntry(entry) {
        entry.isHead = false;
        this.prev.next = entry;
        entry.next = this;
        entry.prev = this.prev;
        this.prev = entry;
        return entry;
    }
    insertAfter(data) {
        var entry = ListMakeEntry(data);
        entry.next = this.next;
        entry.prev = this;
        this.next = entry;
        entry.next.prev = entry;
        return (entry);
    }
    insertBefore(data) {
        var entry = ListMakeEntry(data);
        return this.insertEntryBefore(entry);
    }
    insertEntryBefore(entry) {
        this.prev.next = entry;
        entry.next = this;
        entry.prev = this.prev;
        this.prev = entry;
        return (entry);
    }
}
exports.List = List;
exports.numberComparer = {
    min: Number.MIN_VALUE,
    compare: (a, b) => a - b,
};
class Heap {
    constructor(a, comp) {
        this.comp = comp;
        this.L = [comp.min];
        for (var i = 0, len = a.length; i < len; i++) {
            this.add(a[i]);
        }
    }
    count() {
        return this.L.length - 1;
    }
    peek() {
        return this.L[1];
    }
    get() {
        var x = this.L[1];
        this.L[1] = this.L[this.count()];
        this.L.pop();
        this.fixdown(1);
        return x;
    }
    add(x) {
        this.L.push(x);
        this.fixup(this.count());
    }
    fixup(k) {
        while (k > 1 && (this.comp.compare(this.L[k >> 1], this.L[k]) > 0)) {
            var tmp = this.L[k >> 1];
            this.L[k >> 1] = this.L[k];
            this.L[k] = tmp;
            k = k >> 1;
        }
    }
    fixdown(k) {
        while ((k << 1) <= (this.count())) {
            var j = k << 1;
            if ((j < this.count()) && (this.comp.compare(this.L[j], this.L[j + 1]) > 0)) {
                j++;
            }
            if (this.comp.compare(this.L[k], this.L[j]) <= 0) {
                break;
            }
            var tmp = this.L[k];
            this.L[k] = this.L[j];
            this.L[j] = tmp;
            k = j;
        }
    }
}
exports.Heap = Heap;
// for testing
function LinearDictionary(compareKeys) {
    let a = [];
    function compareProps(a, b) {
        return compareKeys(a.key, b.key);
    }
    function diag() {
        console.log(`size is ${a.length}`);
    }
    function mapRange(action, accum, start, end) {
        if (start === undefined) {
            start = min().key;
        }
        if (end === undefined) {
            end = max().key;
        }
        for (let i = 0, len = a.length; i < len; i++) {
            if (compareKeys(start, a[i].key) <= 0) {
                let ecmp = compareKeys(end, a[i].key);
                if (ecmp < 0) {
                    break;
                }
                if (!action(a[i], accum)) {
                    break;
                }
            }
        }
    }
    function map(action, accum) {
        mapRange(action, accum);
    }
    function min() {
        if (a.length > 0) {
            return a[0];
        }
    }
    function max() {
        if (a.length > 0) {
            return a[a.length - 1];
        }
    }
    function get(key) {
        for (let i = 0, len = a.length; i < len; i++) {
            if (a[i].key == key) {
                return a[i];
            }
        }
    }
    function put(key, data) {
        if (key !== undefined) {
            if (data === undefined) {
                remove(key);
            }
            else {
                a.push({ key: key, data: data });
                a.sort(compareProps); // go to insertion sort if too slow
            }
        }
    }
    function remove(key) {
        if (key !== undefined) {
            for (let i = 0, len = a.length; i < len; i++) {
                if (a[i].key == key) {
                    a[i] = a[len - 1];
                    a.length--;
                    a.sort(compareProps);
                    break;
                }
            }
        }
    }
    return {
        min: min,
        max: max,
        map: map,
        mapRange: mapRange,
        remove: remove,
        get: get,
        put: put,
        diag: diag
    };
}
exports.LinearDictionary = LinearDictionary;
class RedBlackTree {
    constructor(compareKeys) {
        this.compareKeys = compareKeys;
    }
    makeNode(key, data, color, size) {
        return { key: key, data: data, color: color, size: size };
    }
    isRed(node) {
        return node && (node.color == 0 /* RED */);
    }
    nodeSize(node) {
        return node ? node.size : 0;
    }
    size() {
        return this.nodeSize(this.root);
    }
    isEmpty() {
        return this.root;
    }
    get(key) {
        if (key !== undefined) {
            return this.nodeGet(this.root, key);
        }
    }
    nodeGet(node, key) {
        while (node) {
            let cmp = this.compareKeys(key, node.key);
            if (cmp < 0) {
                node = node.left;
            }
            else if (cmp > 0) {
                node = node.right;
            }
            else {
                return node;
            }
        }
    }
    contains(key) {
        return this.get(key);
    }
    put(key, data, conflict) {
        if (key !== undefined) {
            if (data === undefined) {
                this.remove(key);
            }
            else {
                this.root = this.nodePut(this.root, key, data, conflict);
                this.root.color = 1 /* BLACK */;
            }
        }
    }
    nodePut(node, key, data, conflict) {
        if (!node) {
            return this.makeNode(key, data, 0 /* RED */, 1);
        }
        else {
            let cmp = this.compareKeys(key, node.key);
            if (cmp < 0) {
                node.left = this.nodePut(node.left, key, data, conflict);
            }
            else if (cmp > 0) {
                node.right = this.nodePut(node.right, key, data, conflict);
            }
            else {
                if (conflict) {
                    node.data = conflict(key, node.data, data);
                }
                else {
                    node.data = data;
                }
            }
            if (this.isRed(node.right) && (!this.isRed(node.left))) {
                node = this.rotateLeft(node);
            }
            if (this.isRed(node.left) && this.isRed(node.left.left)) {
                node = this.rotateRight(node);
            }
            if (this.isRed(node.left) && this.isRed(node.right)) {
                this.flipColors(node);
            }
            node.size = this.nodeSize(node.left) + this.nodeSize(node.right) + 1;
            return node;
        }
    }
    removeMin() {
        if (!this.isEmpty()) {
            if ((!this.isRed(this.root.left)) && (!this.isRed(this.root.right))) {
                this.root.color = 0 /* RED */;
            }
            this.root = this.nodeRemoveMin(this.root);
            if (!this.isEmpty()) {
                this.root.color = 1 /* BLACK */;
            }
        }
        // TODO: error on empty
    }
    nodeRemoveMin(node) {
        if (node.left) {
            if ((!this.isRed(node.left)) && (!this.isRed(node.left.left))) {
                node = this.moveRedLeft(node);
            }
            node.left = this.nodeRemoveMin(node.left);
            return this.balance(node);
        }
    }
    removeMax() {
        if (this.isEmpty()) {
            if ((!this.isRed(this.root.left)) && (!this.isRed(this.root.right))) {
                this.root.color = 0 /* RED */;
            }
            this.root = this.nodeRemoveMax(this.root);
            if (!this.isEmpty()) {
                this.root.color = 1 /* BLACK */;
            }
        }
        // TODO: error on empty
    }
    nodeRemoveMax(node) {
        if (this.isRed(node.left)) {
            node = this.rotateRight(node);
        }
        if (!node.right) {
            return undefined;
        }
        if ((!this.isRed(node.right)) && (!this.isRed(node.right.left))) {
            node = this.moveRedRight(node);
        }
        node.right = this.nodeRemoveMax(node.right);
        return this.balance(node);
    }
    remove(key) {
        if (key !== undefined) {
            if (!this.contains(key)) {
                return;
            }
            if ((!this.isRed(this.root.left)) && (!this.isRed(this.root.right))) {
                this.root.color = 0 /* RED */;
            }
            this.root = this.nodeRemove(this.root, key);
        }
        // TODO: error on undefined key
    }
    nodeRemove(node, key) {
        if (this.compareKeys(key, node.key) < 0) {
            if ((!this.isRed(node.left)) && (!this.isRed(node.left.left))) {
                node = this.moveRedLeft(node);
            }
            node.left = this.nodeRemove(node.left, key);
        }
        else {
            if (this.isRed(node.left)) {
                node = this.rotateRight(node);
            }
            if ((this.compareKeys(key, node.key) == 0) && (!node.right)) {
                return undefined;
            }
            if ((!this.isRed(node.right)) && (!this.isRed(node.right.left))) {
                node = this.moveRedRight(node);
            }
            if (this.compareKeys(key, node.key) == 0) {
                let subtreeMin = this.nodeMin(node.right);
                node.key = subtreeMin.key;
                node.data = subtreeMin.data;
                node.right = this.nodeRemoveMin(node.right);
            }
            else {
                node.right = this.nodeRemove(node.right, key);
            }
        }
        return this.balance(node);
    }
    height() {
        return this.nodeHeight(this.root);
    }
    nodeHeight(node) {
        if (node === undefined) {
            return -1;
        }
        else {
            return 1 + Math.max(this.nodeHeight(node.left), this.nodeHeight(node.right));
        }
    }
    floor(key) {
        if (!this.isEmpty()) {
            return this.nodeFloor(this.root, key);
        }
    }
    nodeFloor(node, key) {
        if (node) {
            let cmp = this.compareKeys(key, node.key);
            if (cmp == 0) {
                return node;
            }
            else if (cmp < 0) {
                return this.nodeFloor(node.left, key);
            }
            else {
                let rightFloor = this.nodeFloor(node.right, key);
                if (rightFloor) {
                    return rightFloor;
                }
                else {
                    return node;
                }
            }
        }
    }
    min() {
        if (!this.isEmpty()) {
            return this.nodeMin(this.root);
        }
        // TODO: error on empty
    }
    nodeMin(node) {
        if (!node.left) {
            return node;
        }
        else {
            return this.nodeMin(node.left);
        }
    }
    max() {
        if (!this.isEmpty()) {
            return this.nodeMax(this.root);
        }
        // TODO: error on empty
    }
    nodeMax(node) {
        if (!node.right) {
            return node;
        }
        else {
            return this.nodeMax(node.right);
        }
    }
    rotateRight(node) {
        let leftChild = node.left;
        node.left = leftChild.right;
        leftChild.right = node;
        leftChild.color = leftChild.right.color;
        leftChild.right.color = 0 /* RED */;
        leftChild.size = node.size;
        node.size = this.nodeSize(node.left) + this.nodeSize(node.right) + 1;
        return leftChild;
    }
    rotateLeft(node) {
        let rightChild = node.right;
        node.right = rightChild.left;
        rightChild.left = node;
        rightChild.color = rightChild.left.color;
        rightChild.left.color = 0 /* RED */;
        rightChild.size = node.size;
        node.size = this.nodeSize(node.left) + this.nodeSize(node.right) + 1;
        return rightChild;
    }
    oppositeColor(c) {
        return (c == 1 /* BLACK */) ? 0 /* RED */ : 1 /* BLACK */;
    }
    flipColors(node) {
        node.color = this.oppositeColor(node.color);
        node.left.color = this.oppositeColor(node.left.color);
        node.right.color = this.oppositeColor(node.right.color);
    }
    moveRedLeft(node) {
        this.flipColors(node);
        if (this.isRed(node.right.left)) {
            node.right = this.rotateRight(node.right);
            node = this.rotateLeft(node);
            this.flipColors(node);
        }
        return node;
    }
    moveRedRight(node) {
        this.flipColors(node);
        if (this.isRed(node.left.left)) {
            node = this.rotateRight(node);
            this.flipColors(node);
        }
        return node;
    }
    balance(node) {
        if (this.isRed(node.right)) {
            node = this.rotateLeft(node);
        }
        if (this.isRed(node.left) && this.isRed(node.left.left)) {
            node = this.rotateRight(node);
        }
        if (this.isRed(node.left) && (this.isRed(node.right))) {
            this.flipColors(node);
        }
        node.size = this.nodeSize(node.left) + this.nodeSize(node.right) + 1;
        return node;
    }
    mapRange(action, accum, start, end) {
        this.nodeMap(this.root, action, start, end);
    }
    map(action, accum) {
        // TODO: optimize to avoid comparisons
        this.nodeMap(this.root, action, accum);
    }
    nodeMap(node, action, accum, start, end) {
        if (!node) {
            return true;
        }
        if (start === undefined) {
            start = this.nodeMin(node).key;
        }
        if (end === undefined) {
            end = this.nodeMax(node).key;
        }
        let cmpStart = this.compareKeys(start, node.key);
        let cmpEnd = this.compareKeys(end, node.key);
        let go = true;
        if (cmpStart < 0) {
            go = this.nodeMap(node.left, action, accum, start, end);
        }
        if (go && (cmpStart <= 0) && (cmpEnd >= 0)) {
            go = action(node, accum);
        }
        if (go && (cmpEnd > 0)) {
            go = this.nodeMap(node.right, action, accum, start, end);
        }
        return go;
    }
    diag() {
        console.log(`Height is ${this.height()}`);
    }
}
exports.RedBlackTree = RedBlackTree;
class TST {
    constructor() {
        this.n = 0;
    }
    size() {
        return this.n;
    }
    contains(key) {
        return this.get(key);
    }
    get(key) {
        let x = this.nodeGet(this.root, key, 0);
        if (x === undefined) {
            return undefined;
        }
        return x.val;
    }
    nodeGet(x, key, d) {
        if (x === undefined) {
            return undefined;
        }
        let c = key.charAt(d);
        if (c < x.c) {
            return this.nodeGet(x.left, key, d);
        }
        else if (c > x.c) {
            return this.nodeGet(x.right, key, d);
        }
        else if (d < (key.length - 1)) {
            return this.nodeGet(x.mid, key, d + 1);
        }
        else
            return x;
    }
    put(key, val) {
        if (!this.contains(key)) {
            this.n++;
        }
        this.root = this.nodePut(this.root, key, val, 0);
        // console.log(`put ${key}`);
    }
    nodePut(x, key, val, d) {
        let c = key.charAt(d);
        if (x === undefined) {
            x = { c };
        }
        if (c < x.c) {
            x.left = this.nodePut(x.left, key, val, d);
        }
        else if (c > x.c) {
            x.right = this.nodePut(x.right, key, val, d);
        }
        else if (d < (key.length - 1)) {
            x.mid = this.nodePut(x.mid, key, val, d + 1);
        }
        else {
            x.val = val;
        }
        return x;
    }
    neighbors(text, distance = 2) {
        let q = [];
        this.nodeProximity(this.root, { text: "" }, 0, text, distance, q);
        q = q.filter(value => (value.text.length > 0));
        return q;
    }
    keysWithPrefix(text) {
        let q = [];
        let x = this.nodeGet(this.root, text, 0);
        if (x === undefined) {
            return q;
        }
        if (x.val !== undefined) {
            q.push(text);
        }
        this.collect(x.mid, { text }, q);
        return q;
    }
    collect(x, prefix, q) {
        if (x === undefined) {
            return;
        }
        this.collect(x.left, prefix, q);
        if (x.val !== undefined) {
            q.push(prefix.text + x.c);
        }
        this.collect(x.mid, { text: prefix.text + x.c }, q);
        this.collect(x.right, prefix, q);
    }
    patternCollect(x, prefix, d, pattern, q) {
        if (x === undefined) {
            return;
        }
        let c = pattern.charAt(d);
        if ((c === '.') || (c < x.c)) {
            this.patternCollect(x.left, prefix, d, pattern, q);
        }
        else if ((c === '.') || (c === x.c)) {
            if ((d === (pattern.length - 1)) && (x.val !== undefined)) {
                q.push(prefix.text + x.c);
            }
            else if (d < (pattern.length - 1)) {
                this.patternCollect(x.mid, { text: prefix.text + x.c }, d + 1, pattern, q);
            }
        }
        if ((c === '.') || (c > x.c)) {
            this.patternCollect(x.right, prefix, d, pattern, q);
        }
    }
    nodeProximity(x, prefix, d, pattern, distance, q) {
        if ((x === undefined) || (distance < 0)) {
            return;
        }
        let c = pattern.charAt(d);
        if ((distance > 0) || (c < x.c)) {
            this.nodeProximity(x.left, prefix, d, pattern, distance, q);
        }
        if (x.val !== undefined) {
            let remD = distance - (pattern.length - d);
            if (remD >= 0) {
                let invD = distance;
                if (c !== x.c) {
                    invD--;
                }
                q.push({ text: prefix.text + x.c, val: x.val, invDistance: invD });
            }
        }
        let recurD = (d < (pattern.length - 1)) ? d + 1 : d;
        if (c === x.c) {
            this.nodeProximity(x.mid, { text: prefix.text + x.c }, recurD, pattern, distance, q);
        }
        else {
            this.nodeProximity(x.mid, { text: prefix.text + x.c }, recurD, pattern, distance - 1, q);
        }
        if ((distance > 0) || (c > x.c)) {
            this.nodeProximity(x.right, prefix, d, pattern, distance, q);
        }
    }
    match(pattern) {
        let q = [];
        this.patternCollect(this.root, { text: "" }, 0, pattern, q);
        return q;
    }
}
exports.TST = TST;

},{}],239:[function(require,module,exports){
"use strict";
function __export(m) {
    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
}
Object.defineProperty(exports, "__esModule", { value: true });
const Collections = require("./collections");
exports.Collections = Collections;
__export(require("./mergeTree"));
__export(require("./ops"));
__export(require("./sharedString"));
__export(require("./properties"));
var text_1 = require("./text");
exports.loadSegments = text_1.loadSegments;

},{"./collections":238,"./mergeTree":240,"./ops":241,"./properties":242,"./sharedString":243,"./text":245}],240:[function(require,module,exports){
(function (process){
"use strict";
// tslint:disable
Object.defineProperty(exports, "__esModule", { value: true });
const Collections = require("./collections");
const ops = require("./ops");
const API = require("../api-core");
const Properties = require("./properties");
const assert = require("assert");
var SegmentType;
(function (SegmentType) {
    SegmentType[SegmentType["Base"] = 0] = "Base";
    SegmentType[SegmentType["Text"] = 1] = "Text";
    SegmentType[SegmentType["Marker"] = 2] = "Marker";
    SegmentType[SegmentType["External"] = 3] = "External";
})(SegmentType = exports.SegmentType || (exports.SegmentType = {}));
class MergeNode {
    isLeaf() {
        return false;
    }
}
exports.MergeNode = MergeNode;
function addTile(tile, tiles) {
    for (let tileLabel of tile.getTileLabels()) {
        tiles[tileLabel] = tile;
    }
}
function addTileIfNotPresent(tile, tiles) {
    for (let tileLabel of tile.getTileLabels()) {
        if (tiles[tileLabel] === undefined) {
            tiles[tileLabel] = tile;
        }
    }
}
function applyStackDelta(currentStackMap, deltaStackMap) {
    for (let label in deltaStackMap) {
        let deltaStack = deltaStackMap[label];
        if (!deltaStack.empty()) {
            let currentStack = currentStackMap[label];
            if (currentStack === undefined) {
                currentStack = new Collections.Stack();
                currentStackMap[label] = currentStack;
            }
            for (let delta of deltaStack.items) {
                applyRangeMarker(currentStack, delta);
            }
        }
    }
}
function applyRangeMarker(stack, delta) {
    if (delta.behaviors & ops.MarkerBehaviors.RangeBegin) {
        stack.push(delta);
    }
    else {
        // assume delta is end marker
        let top = stack.top();
        if (top && (top.behaviors & ops.MarkerBehaviors.RangeBegin)) {
            stack.pop();
        }
        else {
            stack.push(delta);
        }
    }
}
function addNodeMarkers(mergeTree, node, rightmostTiles, leftmostTiles, rangeStacks) {
    function updateRangeInfo(label, marker) {
        let stack = rangeStacks[label];
        if (stack === undefined) {
            stack = new Collections.Stack();
            rangeStacks[label] = stack;
        }
        applyRangeMarker(stack, marker);
    }
    if (node.isLeaf()) {
        let segment = node;
        if ((mergeTree.localNetLength(segment) > 0) && (segment.getType() == SegmentType.Marker)) {
            let marker = node;
            let markerId = marker.getId();
            if (markerId) {
                mergeTree.mapIdToSegment(markerId, marker);
            }
            if (marker.behaviors & ops.MarkerBehaviors.Tile) {
                addTile(marker, rightmostTiles);
                addTileIfNotPresent(marker, leftmostTiles);
            }
            if (marker.behaviors & (ops.MarkerBehaviors.RangeBegin | ops.MarkerBehaviors.RangeEnd)) {
                for (let label of marker.getRangeLabels()) {
                    updateRangeInfo(label, marker);
                }
            }
        }
    }
    else {
        let block = node;
        applyStackDelta(rangeStacks, block.rangeStacks);
        Properties.extend(rightmostTiles, block.rightmostTiles);
        Properties.extendIfUndefined(leftmostTiles, block.leftmostTiles);
    }
}
exports.MaxNodesInBlock = 8;
class MergeBlock extends MergeNode {
    constructor(childCount) {
        super();
        this.childCount = childCount;
        this.children = new Array(exports.MaxNodesInBlock);
    }
    hierBlock() {
        return undefined;
    }
}
exports.MergeBlock = MergeBlock;
class HierMergeBlock extends MergeBlock {
    constructor(childCount) {
        super(childCount);
        this.rightmostTiles = Properties.createMap();
        this.leftmostTiles = Properties.createMap();
        this.rangeStacks = Properties.createMap();
    }
    addNodeMarkers(mergeTree, node) {
        addNodeMarkers(mergeTree, node, this.rightmostTiles, this.leftmostTiles, this.rangeStacks);
    }
    hierBlock() {
        return this;
    }
    hierToString(indentCount) {
        let strbuf = "";
        for (let key in this.rangeStacks) {
            let stack = this.rangeStacks[key];
            strbuf += internedSpaces(indentCount);
            strbuf += `${key}: `;
            for (let item of stack.items) {
                strbuf += `${item.toString()} `;
            }
            strbuf += "\n";
        }
        return strbuf;
    }
}
function nodeTotalLength(mergeTree, node) {
    if (!node.isLeaf()) {
        return node.cachedLength;
    }
    else {
        return mergeTree.localNetLength(node);
    }
}
class BaseSegment extends MergeNode {
    constructor(seq, clientId) {
        super();
        this.seq = seq;
        this.clientId = clientId;
    }
    addLocalRef(lref) {
        if (!this.localRefs) {
            this.localRefs = [lref];
        }
        else {
            this.localRefs.push(lref);
        }
    }
    removeLocalRef(lref) {
        if (this.localRefs) {
            for (let i = 0, len = this.localRefs.length; i < len; i++) {
                if (lref === this.localRefs[i]) {
                    for (let j = i; j < (len - 1); j++) {
                        this.localRefs[j] = this.localRefs[j + 1];
                    }
                    this.localRefs.length--;
                    return lref;
                }
            }
        }
    }
    addProperties(newProps, op) {
        if ((!this.properties) || (op && (op.name === "rewrite"))) {
            this.properties = Properties.createMap();
        }
        Properties.extend(this.properties, newProps, op);
    }
    isLeaf() {
        return true;
    }
    cloneInto(b) {
        b.clientId = this.clientId;
        // TODO: deep clone properties
        b.properties = Properties.extend(Properties.createMap(), this.properties);
        b.removedClientId = this.removedClientId;
        // TODO: copy removed client overlap and branch removal info
        b.removedSeq = this.removedSeq;
        b.seq = this.seq;
    }
    canAppend(segment, mergeTree) {
        return false;
    }
}
exports.BaseSegment = BaseSegment;
/**
 * A non-collaborative placeholder for external content.
 */
class ExternalSegment extends BaseSegment {
    constructor(placeholderSeq, charLength, lengthBytes, binPosition) {
        super();
        this.placeholderSeq = placeholderSeq;
        this.charLength = charLength;
        this.lengthBytes = lengthBytes;
        this.binPosition = binPosition;
    }
    mergeTreeInsert(mergeTree, pos, refSeq, clientId, seq) {
        mergeTree.insert(pos, refSeq, clientId, seq, this, (block, pos, refSeq, clientId, seq, eseg) => mergeTree.blockInsert(block, pos, refSeq, clientId, seq, eseg));
    }
    clone() {
        throw new Error('clone not implemented');
    }
    append(segment) {
        throw new Error('Can not append to external segment');
    }
    getType() {
        return SegmentType.External;
    }
    removeRange(start, end) {
        throw new Error('Method not implemented.');
    }
    splitAt(pos) {
        throw new Error('Method not implemented.');
    }
}
exports.ExternalSegment = ExternalSegment;
exports.reservedTileLabelsKey = "markerTileLabels";
exports.reservedRangeLabelsKey = "markerRangeLabels";
exports.reservedMarkerIdKey = "markerId";
class Marker extends BaseSegment {
    constructor(behaviors, seq, clientId) {
        super(seq, clientId);
        this.behaviors = behaviors;
        this.cachedLength = 1;
    }
    static make(behavior, props, seq, clientId) {
        let marker = new Marker(behavior, seq, clientId);
        if (props) {
            marker.addProperties(props);
        }
        return marker;
    }
    clone() {
        let b = Marker.make(this.behaviors, this.properties, this.seq, this.clientId);
        this.cloneInto(b);
        return b;
    }
    hasTileLabels() {
        return (this.behaviors & ops.MarkerBehaviors.Tile) &&
            this.properties && this.properties[exports.reservedTileLabelsKey];
    }
    hasRangeLabels() {
        return (this.behaviors & (ops.MarkerBehaviors.RangeBegin | ops.MarkerBehaviors.RangeEnd)) &&
            this.properties && this.properties[exports.reservedRangeLabelsKey];
    }
    hasTileLabel(label) {
        if (this.hasTileLabels()) {
            for (let markerLabel of this.properties[exports.reservedTileLabelsKey]) {
                if (label === markerLabel) {
                    return true;
                }
            }
        }
        return false;
    }
    hasRangeLabel(label) {
        if (this.hasRangeLabels()) {
            for (let markerLabel of this.properties[exports.reservedRangeLabelsKey]) {
                if (label === markerLabel) {
                    return true;
                }
            }
        }
        return false;
    }
    getTileLabels() {
        if (this.hasTileLabels()) {
            return this.properties[exports.reservedTileLabelsKey];
        }
        else {
            return [];
        }
    }
    getRangeLabels() {
        if (this.hasRangeLabels()) {
            return this.properties[exports.reservedRangeLabelsKey];
        }
        else {
            return [];
        }
    }
    getId() {
        if (this.properties && this.properties[exports.reservedMarkerIdKey]) {
            return this.properties[exports.reservedMarkerIdKey];
        }
    }
    toString() {
        let bbuf = "";
        if (this.behaviors & ops.MarkerBehaviors.Tile) {
            bbuf += "Tile";
        }
        if (this.behaviors & ops.MarkerBehaviors.RangeBegin) {
            if (bbuf.length > 0) {
                bbuf += "; ";
            }
            bbuf += "RangeBegin";
        }
        if (this.behaviors & ops.MarkerBehaviors.RangeEnd) {
            if (bbuf.length > 0) {
                bbuf += "; ";
            }
            bbuf += "RangeEnd";
        }
        let lbuf = "";
        let id = this.getId();
        if (id) {
            bbuf += ` (${id}) `;
        }
        if (this.hasTileLabels()) {
            lbuf += "tile -- ";
            let labels = this.properties[exports.reservedTileLabelsKey];
            for (let i = 0, len = labels.length; i < len; i++) {
                let tileLabel = labels[i];
                if (i > 0) {
                    lbuf += "; ";
                }
                lbuf += tileLabel;
            }
        }
        if (this.hasRangeLabels()) {
            let rangeKind = "begin";
            if (this.behaviors & ops.MarkerBehaviors.RangeEnd) {
                rangeKind = "end";
            }
            if (this.hasTileLabels()) {
                lbuf += " ";
            }
            lbuf += `range ${rangeKind} -- `;
            let labels = this.properties[exports.reservedRangeLabelsKey];
            for (let i = 0, len = labels.length; i < len; i++) {
                let rangeLabel = labels[i];
                if (i > 0) {
                    lbuf += "; ";
                }
                lbuf += rangeLabel;
            }
        }
        return `M ${bbuf}: ${lbuf}`;
    }
    getType() {
        return SegmentType.Marker;
    }
    removeRange(start, end) {
        console.log("remove range called on marker");
        return false;
    }
    splitAt(pos) {
        return undefined;
    }
    canAppend(segment) {
        return false;
    }
    append(segment) {
        return undefined;
    }
}
exports.Marker = Marker;
class TextSegment extends BaseSegment {
    constructor(text, seq, clientId) {
        super(seq, clientId);
        this.text = text;
        this.cachedLength = text.length;
    }
    static make(text, props, seq, clientId) {
        let tseg = new TextSegment(text, seq, clientId);
        if (props) {
            tseg.addProperties(props);
        }
        return tseg;
    }
    splitLocalRefs(pos, leafSegment) {
        let aRefs = [];
        let bRefs = [];
        for (let localRef of this.localRefs) {
            if (localRef.offset < pos) {
                aRefs.push(localRef);
            }
            else {
                localRef.offset -= pos;
                bRefs.push(localRef);
            }
        }
        this.localRefs = aRefs;
        leafSegment.localRefs = bRefs;
    }
    splitAt(pos) {
        if (pos > 0) {
            let remainingText = this.text.substring(pos);
            this.text = this.text.substring(0, pos);
            this.cachedLength = this.text.length;
            let leafSegment = new TextSegment(remainingText, this.seq, this.clientId);
            if (this.properties) {
                leafSegment.addProperties(Properties.extend(Properties.createMap(), this.properties));
            }
            segmentCopy(this, leafSegment, true);
            if (this.localRefs) {
                this.splitLocalRefs(pos, leafSegment);
            }
            return leafSegment;
        }
    }
    clone() {
        let b = TextSegment.make(this.text, this.properties, this.seq, this.clientId);
        this.cloneInto(b);
        return b;
    }
    getType() {
        return SegmentType.Text;
    }
    // TODO: use function in properties.ts
    matchProperties(b) {
        if (this.properties) {
            if (!b.properties) {
                return false;
            }
            else {
                let bProps = b.properties;
                // for now, straightforward; later use hashing
                for (let key in this.properties) {
                    if (bProps[key] === undefined) {
                        return false;
                    }
                    else if (bProps[key] !== this.properties[key]) {
                        return false;
                    }
                }
                for (let key in bProps) {
                    if (this.properties[key] === undefined) {
                        return false;
                    }
                }
            }
        }
        else {
            if (b.properties) {
                return false;
            }
        }
        return true;
    }
    canAppend(segment, mergeTree) {
        if ((!this.removedSeq) && (this.text.charAt(this.text.length - 1) != '\n')) {
            if (segment.getType() === SegmentType.Text) {
                if (this.matchProperties(segment)) {
                    let branchId = mergeTree.getBranchId(this.clientId);
                    let segBranchId = mergeTree.getBranchId(segment.clientId);
                    if ((segBranchId === branchId) && (mergeTree.localNetLength(segment) > 0)) {
                        return ((this.cachedLength <= MergeTree.TextSegmentGranularity) ||
                            (segment.cachedLength <= MergeTree.TextSegmentGranularity));
                    }
                }
            }
        }
        return false;
    }
    toString() {
        return this.text;
    }
    append(segment) {
        if (segment.getType() === SegmentType.Text) {
            if (segment.localRefs) {
                let adj = this.text.length;
                for (let localRef of segment.localRefs) {
                    localRef.offset += adj;
                    localRef.segment = this;
                }
            }
            this.text += segment.text;
            this.cachedLength = this.text.length;
            return this;
        }
        else {
            throw new Error("can only append text segment");
        }
    }
    // TODO: retain removed text for undo
    // returns true if entire string removed
    removeRange(start, end) {
        let remnantString = "";
        let len = this.text.length;
        if (start > 0) {
            remnantString += this.text.substring(0, start);
        }
        if (end < len) {
            remnantString += this.text.substring(end);
        }
        this.text = remnantString;
        this.cachedLength = remnantString.length;
        return (remnantString.length == 0);
    }
}
exports.TextSegment = TextSegment;
function segmentCopy(from, to, propSegGroup = false) {
    to.parent = from.parent;
    to.removedClientId = from.removedClientId;
    to.removedSeq = from.removedSeq;
    if (from.removalsByBranch) {
        to.removalsByBranch = [];
        for (let i = 0, len = from.removalsByBranch.length; i < len; i++) {
            let fromRemovalInfo = from.removalsByBranch[i];
            if (fromRemovalInfo) {
                to.removalsByBranch[i] = {
                    removedClientId: fromRemovalInfo.removedClientId,
                    removedSeq: fromRemovalInfo.removedSeq,
                    removedClientOverlap: fromRemovalInfo.removedClientOverlap,
                };
            }
        }
    }
    to.seq = from.seq;
    to.clientId = from.clientId;
    to.removedClientOverlap = from.removedClientOverlap;
    to.segmentGroup = from.segmentGroup;
    if (to.segmentGroup) {
        if (propSegGroup) {
            addToSegmentGroup(to);
        }
        else {
            segmentGroupReplace(from, to);
        }
    }
}
function incrementalGatherText(segment, state) {
    if (segment.getType() == SegmentType.Text) {
        let textSegment = segment;
        if (MergeTree.traceGatherText) {
            console.log(`@cli ${this.collabWindow ? this.collabwindow.clientId : -1} gather seg seq ${textSegment.seq} rseq ${textSegment.removedSeq} text ${textSegment.text}`);
        }
        if ((state.start <= 0) && (state.end >= textSegment.text.length)) {
            state.context.text += textSegment.text;
        }
        else {
            if (state.end >= textSegment.text.length) {
                state.context.text += textSegment.text.substring(state.start);
            }
            else {
                state.context.text += textSegment.text.substring(state.start, state.end);
            }
        }
    }
    state.op = IncrementalExecOp.Go;
}
var IncrementalExecOp;
(function (IncrementalExecOp) {
    IncrementalExecOp[IncrementalExecOp["Go"] = 0] = "Go";
    IncrementalExecOp[IncrementalExecOp["Stop"] = 1] = "Stop";
    IncrementalExecOp[IncrementalExecOp["Yield"] = 2] = "Yield";
})(IncrementalExecOp = exports.IncrementalExecOp || (exports.IncrementalExecOp = {}));
class IncrementalMapState {
    constructor(block, actions, pos, refSeq, clientId, context, start, end, childIndex = 0) {
        this.block = block;
        this.actions = actions;
        this.pos = pos;
        this.refSeq = refSeq;
        this.clientId = clientId;
        this.context = context;
        this.start = start;
        this.end = end;
        this.childIndex = childIndex;
        this.op = IncrementalExecOp.Go;
    }
}
exports.IncrementalMapState = IncrementalMapState;
/**
 * Sequence numbers for collaborative segments start at 1 or greater.  Every segment marked
 * with sequence number zero will be counted as part of the requested string.
 */
exports.UniversalSequenceNumber = 0;
exports.UnassignedSequenceNumber = -1;
exports.TreeMaintainanceSequenceNumber = -2;
exports.LocalClientId = -1;
exports.NonCollabClient = -2;
class CollaborationWindow {
    constructor() {
        this.clientId = exports.LocalClientId;
        this.collaborating = false;
        // lowest-numbered segment in window; no client can reference a state before this one
        this.minSeq = 0;
        // highest-numbered segment in window and current 
        // reference segment for this client
        this.currentSeq = 0;
    }
    loadFrom(a) {
        this.clientId = a.clientId;
        this.collaborating = a.collaborating;
        this.localMinSeq = a.localMinSeq;
        this.globalMinSeq = a.globalMinSeq;
        this.minSeq = a.minSeq;
        this.currentSeq = a.currentSeq;
    }
}
exports.CollaborationWindow = CollaborationWindow;
/**
 * Returns the partial length whose sequence number is
 * the greatest sequence number within a that is
 * less than or equal to key.
 * @param {PartialLength[]} a array of partial segment lengths
 * @param {number} key sequence number
 */
function latestLEQ(a, key) {
    let best = -1;
    let lo = 0;
    let hi = a.length - 1;
    while (lo <= hi) {
        let mid = lo + Math.floor((hi - lo) / 2);
        if (a[mid].seq <= key) {
            if ((best < 0) || (a[best].seq < a[mid].seq)) {
                best = mid;
            }
            lo = mid + 1;
        }
        else {
            hi = mid - 1;
        }
    }
    return best;
}
function compareNumbers(a, b) {
    return a - b;
}
exports.compareNumbers = compareNumbers;
function compareStrings(a, b) {
    return a.localeCompare(b);
}
/**
 * Keep track of partial sums of segment lengths for all sequence numbers
 * in the current collaboration window (if any).  Only used during active
 * collaboration.
 */
class PartialSequenceLengths {
    constructor(minSeq) {
        this.minSeq = minSeq;
        this.minLength = 0;
        this.segmentCount = 0;
        this.partialLengths = [];
        this.clientSeqNumbers = [];
    }
    cliLatestLEQ(clientId, refSeq) {
        let cliSeqs = this.clientSeqNumbers[clientId];
        if (cliSeqs) {
            return latestLEQ(cliSeqs, refSeq);
        }
        else {
            return -1;
        }
    }
    cliLatest(clientId) {
        let cliSeqs = this.clientSeqNumbers[clientId];
        if (cliSeqs && (cliSeqs.length > 0)) {
            return cliSeqs.length - 1;
        }
        else {
            return -1;
        }
    }
    compare(b) {
        function comparePartialLengths(aList, bList) {
            let aLen = aList.length;
            let bLen = bList.length;
            if (aLen != bLen) {
                return false;
            }
            for (let i = 0; i < aLen; i++) {
                let aPartial = aList[i];
                let bPartial = bList[i];
                if ((aPartial.seq != bPartial.seq) || (aPartial.clientId != bPartial.clientId) ||
                    (aPartial.seglen != bPartial.seglen) || (aPartial.len != bPartial.len) || (aPartial.overlapClients && (!bPartial.overlapClients))) {
                    return false;
                }
            }
            return true;
        }
        if (!comparePartialLengths(this.partialLengths, b.partialLengths)) {
            return false;
        }
        for (let clientId in this.clientSeqNumbers) {
            if (!b.clientSeqNumbers[clientId]) {
                return false;
            }
            else if (!comparePartialLengths(this.clientSeqNumbers[clientId], b.clientSeqNumbers[clientId])) {
                return false;
            }
        }
        return true;
    }
    branchToString(glc, branchId = 0) {
        let buf = "";
        for (let partial of this.partialLengths) {
            buf += `(${partial.seq},${partial.len}) `;
        }
        for (let clientId in this.clientSeqNumbers) {
            if (this.clientSeqNumbers[clientId].length > 0) {
                buf += `Client `;
                if (glc) {
                    buf += `${glc(+clientId)}`;
                }
                else {
                    buf += `${clientId}`;
                }
                buf += '[';
                for (let partial of this.clientSeqNumbers[clientId]) {
                    buf += `(${partial.seq},${partial.len})`;
                }
                buf += ']';
            }
        }
        buf = `Br ${branchId}, min(seq ${this.minSeq}): ${this.minLength}; sc: ${this.segmentCount};` + buf;
        return buf;
    }
    toString(glc, indentCount = 0) {
        let buf = this.branchToString(glc);
        if (this.downstreamPartialLengths) {
            for (let i = 0, len = this.downstreamPartialLengths.length; i < len; i++) {
                buf += "\n";
                buf += internedSpaces(indentCount);
                buf += this.downstreamPartialLengths[i].branchToString(glc, i + 1);
            }
        }
        return buf;
    }
    getPartialLength(mergeTree, refSeq, clientId) {
        let branchId = mergeTree.getBranchId(clientId);
        if (MergeTree.traceTraversal) {
            console.log(`plen branch ${branchId}`);
        }
        if (branchId > 0) {
            return this.downstreamPartialLengths[branchId - 1].getBranchPartialLength(refSeq, clientId);
        }
        else {
            return this.getBranchPartialLength(refSeq, clientId);
        }
    }
    getBranchPartialLength(refSeq, clientId) {
        let pLen = this.minLength;
        let seqIndex = latestLEQ(this.partialLengths, refSeq);
        let cliLatestindex = this.cliLatest(clientId);
        let cliSeq = this.clientSeqNumbers[clientId];
        if (seqIndex >= 0) {
            pLen += this.partialLengths[seqIndex].len;
            if (cliLatestindex >= 0) {
                let cliLatest = cliSeq[cliLatestindex];
                if (cliLatest.seq > refSeq) {
                    pLen += cliLatest.len;
                    let precedingCliIndex = this.cliLatestLEQ(clientId, refSeq);
                    if (precedingCliIndex >= 0) {
                        pLen -= cliSeq[precedingCliIndex].len;
                    }
                }
            }
        }
        else {
            if (cliLatestindex >= 0) {
                let cliLatest = cliSeq[cliLatestindex];
                pLen += cliLatest.len;
            }
        }
        return pLen;
    }
    // clear away partial sums for sequence numbers earlier than the current window
    zamboni(segmentWindow) {
        function copyDown(partialLengths) {
            let mindex = latestLEQ(partialLengths, segmentWindow.minSeq);
            let minLength = 0;
            //console.log(`mindex ${mindex}`);
            if (mindex >= 0) {
                minLength = partialLengths[mindex].len;
                let seqCount = partialLengths.length;
                if (mindex <= (seqCount - 1)) {
                    // still some entries remaining
                    let remainingCount = (seqCount - mindex) - 1;
                    //copy down
                    for (let i = 0; i < remainingCount; i++) {
                        partialLengths[i] = partialLengths[i + mindex + 1];
                        partialLengths[i].len -= minLength;
                    }
                    partialLengths.length = remainingCount;
                }
            }
            return minLength;
        }
        this.minLength += copyDown(this.partialLengths);
        for (let clientId in this.clientSeqNumbers) {
            let cliPartials = this.clientSeqNumbers[clientId];
            if (cliPartials) {
                copyDown(cliPartials);
            }
        }
    }
    addClientSeqNumber(clientId, seq, seglen) {
        if (this.clientSeqNumbers[clientId] === undefined) {
            this.clientSeqNumbers[clientId] = [];
        }
        let cli = this.clientSeqNumbers[clientId];
        let pLen = seglen;
        if (cli.length > 0) {
            pLen += cli[cli.length - 1].len;
        }
        cli.push({ seq: seq, len: pLen, seglen: seglen });
    }
    // assumes sequence number already coalesced
    addClientSeqNumberFromPartial(partialLength) {
        this.addClientSeqNumber(partialLength.clientId, partialLength.seq, partialLength.seglen);
        if (partialLength.overlapClients) {
            partialLength.overlapClients.map((oc) => {
                this.addClientSeqNumber(oc.data.clientId, partialLength.seq, oc.data.seglen);
                return true;
            });
        }
    }
    update(mergeTree, block, seq, clientId, collabWindow) {
        let segBranchId = mergeTree.getBranchId(clientId);
        // console.log(`seg br ${segBranchId} cli ${glc(mergeTree, segment.clientId)} me ${glc(mergeTree, mergeTree.collabWindow.clientId)}`);
        if (segBranchId == 0) {
            this.updateBranch(mergeTree, 0, block, seq, clientId, collabWindow);
        }
        if (mergeTree.localBranchId > 0) {
            for (let i = 0; i < mergeTree.localBranchId; i++) {
                let branchId = i + 1;
                if (segBranchId <= branchId) {
                    this.downstreamPartialLengths[i].updateBranch(mergeTree, branchId, block, seq, clientId, collabWindow);
                }
            }
        }
    }
    // assume: seq is latest sequence number; no structural change to sub-tree, but a segment
    // with sequence number seq has been added within the sub-tree
    // TODO: assert client id matches
    updateBranch(mergeTree, branchId, node, seq, clientId, collabWindow) {
        let seqSeglen = 0;
        let segCount = 0;
        // compute length for seq across children
        for (let i = 0; i < node.childCount; i++) {
            let child = node.children[i];
            if (!child.isLeaf()) {
                let childBlock = child;
                let branchPartialLengths = childBlock.partialLengths.partialLengthsForBranch(branchId);
                let partialLengths = branchPartialLengths.partialLengths;
                let seqIndex = latestLEQ(partialLengths, seq);
                if (seqIndex >= 0) {
                    let leqPartial = partialLengths[seqIndex];
                    if (leqPartial.seq == seq) {
                        seqSeglen += leqPartial.seglen;
                    }
                }
                segCount += branchPartialLengths.segmentCount;
            }
            else {
                let segment = child;
                if (segment.seq == seq) {
                    seqSeglen += segment.cachedLength;
                }
                else {
                    let segBranchId = mergeTree.getBranchId(segment.clientId);
                    let removalInfo = mergeTree.getRemovalInfo(branchId, segBranchId, segment);
                    if (removalInfo.removedSeq === seq) {
                        seqSeglen -= segment.cachedLength;
                    }
                }
                segCount++;
            }
        }
        this.segmentCount = segCount;
        function addSeq(partialLengths, seq, clientId) {
            let seqPartialLen;
            let penultPartialLen;
            let leqIndex = latestLEQ(partialLengths, seq);
            if (leqIndex >= 0) {
                let pLen = partialLengths[leqIndex];
                if (pLen.seq == seq) {
                    seqPartialLen = pLen;
                    leqIndex = latestLEQ(partialLengths, seq - 1);
                    if (leqIndex >= 0) {
                        penultPartialLen = partialLengths[leqIndex];
                    }
                }
                else {
                    penultPartialLen = pLen;
                }
            }
            if (seqPartialLen === undefined) {
                seqPartialLen = {
                    seq: seq,
                    seglen: seqSeglen,
                    clientId: clientId
                };
                partialLengths.push(seqPartialLen);
            }
            else {
                seqPartialLen.seglen = seqSeglen;
                // assert client id matches
            }
            if (penultPartialLen !== undefined) {
                seqPartialLen.len = seqPartialLen.seglen + penultPartialLen.len;
            }
            else {
                seqPartialLen.len = seqPartialLen.seglen;
            }
        }
        addSeq(this.partialLengths, seq, clientId);
        if (this.clientSeqNumbers[clientId] === undefined) {
            this.clientSeqNumbers[clientId] = [];
        }
        addSeq(this.clientSeqNumbers[clientId], seq);
        //    console.log(this.toString());
        if (PartialSequenceLengths.options.zamboni) {
            this.zamboni(collabWindow);
        }
        //   console.log('ZZZ');
        //   console.log(this.toString());
    }
    static fromLeaves(mergeTree, branchId, combinedPartialLengths, block, collabWindow) {
        combinedPartialLengths.minLength = 0;
        combinedPartialLengths.segmentCount = block.childCount;
        function getOverlapClients(overlapClientids, seglen) {
            let bst = new Collections.RedBlackTree(compareNumbers);
            for (let clientId of overlapClientids) {
                bst.put(clientId, { clientId: clientId, seglen: seglen });
            }
            return bst;
        }
        function accumulateClientOverlap(partialLength, overlapClientIds, seglen) {
            if (partialLength.overlapClients) {
                for (let clientId of overlapClientIds) {
                    let ovlapClientNode = partialLength.overlapClients.get(clientId);
                    if (!ovlapClientNode) {
                        partialLength.overlapClients.put(clientId, { clientId: clientId, seglen: seglen });
                    }
                    else {
                        ovlapClientNode.data.seglen += seglen;
                    }
                }
            }
            else {
                partialLength.overlapClients = getOverlapClients(overlapClientIds, seglen);
            }
        }
        function insertSegment(segment, removedSeq = false, removalInfo = undefined) {
            let seq = segment.seq;
            let segmentLen = segment.cachedLength;
            let clientId = segment.clientId;
            let removedClientOverlap;
            if (removedSeq) {
                seq = removalInfo.removedSeq;
                segmentLen = -segmentLen;
                clientId = removalInfo.removedClientId;
                if (removalInfo.removedClientOverlap) {
                    removedClientOverlap = removalInfo.removedClientOverlap;
                }
            }
            let seqPartials = combinedPartialLengths.partialLengths;
            let seqPartialsLen = seqPartials.length;
            // find the first entry with sequence number greater or equal to seq
            let indexFirstGTE = 0;
            for (; indexFirstGTE < seqPartialsLen; indexFirstGTE++) {
                if (seqPartials[indexFirstGTE].seq >= seq) {
                    break;
                }
            }
            if ((indexFirstGTE < seqPartialsLen) && (seqPartials[indexFirstGTE].seq == seq)) {
                seqPartials[indexFirstGTE].seglen += segmentLen;
                if (removedClientOverlap) {
                    accumulateClientOverlap(seqPartials[indexFirstGTE], removedClientOverlap, segmentLen);
                }
            }
            else {
                let pLen;
                if (removedClientOverlap) {
                    let overlapClients = getOverlapClients(removedClientOverlap, segmentLen);
                    pLen = { seq: seq, clientId: clientId, len: 0, seglen: segmentLen, overlapClients: overlapClients };
                }
                else {
                    pLen = { seq: seq, clientId: clientId, len: 0, seglen: segmentLen };
                }
                if (indexFirstGTE < seqPartialsLen) {
                    // shift entries with greater sequence numbers
                    // TODO: investigate performance improvement using BST
                    for (let k = seqPartialsLen; k > indexFirstGTE; k--) {
                        seqPartials[k] = seqPartials[k - 1];
                    }
                    seqPartials[indexFirstGTE] = pLen;
                }
                else {
                    seqPartials.push(pLen);
                }
            }
        }
        function seqLTE(seq, minSeq) {
            return (seq != exports.UnassignedSequenceNumber) && (seq <= minSeq);
        }
        for (let i = 0; i < block.childCount; i++) {
            let child = block.children[i];
            if (child.isLeaf()) {
                // leaf segment
                let segment = child;
                let segBranchId = mergeTree.getBranchId(segment.clientId);
                // console.log(`seg br ${segBranchId} cli ${glc(mergeTree, segment.clientId)} me ${glc(mergeTree, mergeTree.collabWindow.clientId)}`);
                if (segBranchId <= branchId) {
                    if (seqLTE(segment.seq, collabWindow.minSeq)) {
                        combinedPartialLengths.minLength += segment.cachedLength;
                    }
                    else {
                        if (segment.seq != exports.UnassignedSequenceNumber) {
                            insertSegment(segment);
                        }
                    }
                    let removalInfo = mergeTree.getRemovalInfo(branchId, segBranchId, segment);
                    if (seqLTE(removalInfo.removedSeq, collabWindow.minSeq)) {
                        combinedPartialLengths.minLength -= segment.cachedLength;
                    }
                    else {
                        if ((removalInfo.removedSeq !== undefined) &&
                            (removalInfo.removedSeq != exports.UnassignedSequenceNumber)) {
                            insertSegment(segment, true, removalInfo);
                        }
                    }
                }
            }
        }
        // post-process correctly-ordered partials computing sums and creating
        // lists for each present client id
        let seqPartials = combinedPartialLengths.partialLengths;
        let seqPartialsLen = seqPartials.length;
        let prevLen = 0;
        for (let i = 0; i < seqPartialsLen; i++) {
            seqPartials[i].len = prevLen + seqPartials[i].seglen;
            prevLen = seqPartials[i].len;
            combinedPartialLengths.addClientSeqNumberFromPartial(seqPartials[i]);
        }
    }
    static combine(mergeTree, block, collabWindow, recur = false) {
        let partialLengthsTopBranch = PartialSequenceLengths.combineBranch(mergeTree, block, collabWindow, 0, recur);
        if (mergeTree.localBranchId > 0) {
            partialLengthsTopBranch.downstreamPartialLengths = [];
            for (let i = 0; i < mergeTree.localBranchId; i++) {
                partialLengthsTopBranch.downstreamPartialLengths[i] =
                    PartialSequenceLengths.combineBranch(mergeTree, block, collabWindow, i + 1, recur);
            }
        }
        return partialLengthsTopBranch;
    }
    partialLengthsForBranch(branchId) {
        if (branchId > 0) {
            return this.downstreamPartialLengths[branchId - 1];
        }
        else {
            return this;
        }
    }
    /**
     * Combine the partial lengths of block's children
     * @param {IMergeBlock} block an interior node; it is assumed that each interior node child of this block
     * has its partials up to date
     * @param {CollaborationWindow} collabWindow segment window fo the segment tree containing textSegmentBlock
     */
    static combineBranch(mergeTree, block, collabWindow, branchId, recur = false) {
        let combinedPartialLengths = new PartialSequenceLengths(collabWindow.minSeq);
        PartialSequenceLengths.fromLeaves(mergeTree, branchId, combinedPartialLengths, block, collabWindow);
        let prevPartial;
        function combineOverlapClients(a, b) {
            if (a.overlapClients) {
                if (b.overlapClients) {
                    b.overlapClients.map((bProp) => {
                        let aProp = a.overlapClients.get(bProp.key);
                        if (aProp) {
                            aProp.data.seglen += bProp.data.seglen;
                        }
                        else {
                            a.overlapClients.put(bProp.data.clientId, bProp.data);
                        }
                        return true;
                    });
                }
            }
            else {
                a.overlapClients = b.overlapClients;
            }
        }
        function addNext(partialLength) {
            let seq = partialLength.seq;
            let pLen = 0;
            if (prevPartial) {
                if (prevPartial.seq == partialLength.seq) {
                    prevPartial.seglen += partialLength.seglen;
                    prevPartial.len += partialLength.seglen;
                    combineOverlapClients(prevPartial, partialLength);
                    return;
                }
                else {
                    pLen = prevPartial.len;
                    // previous sequence number is finished
                    combinedPartialLengths.addClientSeqNumberFromPartial(prevPartial);
                }
            }
            prevPartial = {
                seq: seq,
                clientId: partialLength.clientId,
                len: pLen + partialLength.seglen,
                seglen: partialLength.seglen,
                overlapClients: partialLength.overlapClients
            };
            combinedPartialLengths.partialLengths.push(prevPartial);
        }
        let childPartials = [];
        for (let i = 0; i < block.childCount; i++) {
            let child = block.children[i];
            if (!child.isLeaf()) {
                let childBlock = child;
                if (recur) {
                    childBlock.partialLengths = PartialSequenceLengths.combine(mergeTree, childBlock, collabWindow, true);
                }
                childPartials.push(childBlock.partialLengths.partialLengthsForBranch(branchId));
            }
        }
        let childPartialsLen = childPartials.length;
        if (childPartialsLen != 0) {
            // some children are interior nodes
            if (combinedPartialLengths.partialLengths.length > 0) {
                // some children were leaves; add combined partials from these segments 
                childPartials.push(combinedPartialLengths);
                childPartialsLen++;
                combinedPartialLengths = new PartialSequenceLengths(collabWindow.minSeq);
            }
            let indices = new Array(childPartialsLen);
            let childPartialsCounts = new Array(childPartialsLen);
            for (let i = 0; i < childPartialsLen; i++) {
                indices[i] = 0;
                childPartialsCounts[i] = childPartials[i].partialLengths.length;
                combinedPartialLengths.minLength += childPartials[i].minLength;
                combinedPartialLengths.segmentCount += childPartials[i].segmentCount;
            }
            let outerIndexOfEarliest = 0;
            let earliestPartialLength;
            while (outerIndexOfEarliest >= 0) {
                outerIndexOfEarliest = -1;
                for (let k = 0; k < childPartialsLen; k++) {
                    // find next earliest sequence number 
                    if (indices[k] < childPartialsCounts[k]) {
                        let cpLen = childPartials[k].partialLengths[indices[k]];
                        if ((outerIndexOfEarliest < 0) || (cpLen.seq < earliestPartialLength.seq)) {
                            outerIndexOfEarliest = k;
                            earliestPartialLength = cpLen;
                        }
                    }
                }
                if (outerIndexOfEarliest >= 0) {
                    addNext(earliestPartialLength);
                    indices[outerIndexOfEarliest]++;
                }
            }
            // add client entry for last partial, if any
            if (prevPartial) {
                combinedPartialLengths.addClientSeqNumberFromPartial(prevPartial);
            }
        }
        // TODO: incremental zamboni during build
        //console.log(combinedPartialLengths.toString());
        //console.log(`ZZZ...(min ${segmentWindow.minSeq})`);
        if (PartialSequenceLengths.options.zamboni) {
            combinedPartialLengths.zamboni(collabWindow);
        }
        //console.log(combinedPartialLengths.toString());
        return combinedPartialLengths;
    }
}
PartialSequenceLengths.options = {
    zamboni: true
};
exports.PartialSequenceLengths = PartialSequenceLengths;
function addToSegmentGroup(segment) {
    segment.segmentGroup.segments.push(segment);
}
function removeFromSegmentGroup(segmentGroup, toRemove) {
    let index = segmentGroup.segments.indexOf(toRemove);
    if (index >= 0) {
        segmentGroup.segments.splice(index, 1);
    }
    toRemove.segmentGroup = undefined;
}
function segmentGroupReplace(currentSeg, newSegment) {
    let segmentGroup = currentSeg.segmentGroup;
    for (let i = 0, len = segmentGroup.segments.length; i < len; i++) {
        if (segmentGroup.segments[i] == currentSeg) {
            segmentGroup.segments[i] = newSegment;
            break;
        }
    }
    currentSeg.segmentGroup = undefined;
}
function clock() {
    if (process.hrtime) {
        return process.hrtime();
    }
    else {
        return Date.now();
    }
}
function elapsedMicroseconds(start) {
    if (process.hrtime) {
        let end = process.hrtime(start);
        let duration = Math.round((end[0] * 1000000) + (end[1] / 1000));
        return duration;
    }
    else {
        return 1000 * (Date.now() - start);
    }
}
/**
 * Used for in-memory testing.  This will queue a reference string for each client message.
 */
exports.useCheckQ = false;
function checkTextMatchRelative(refSeq, clientId, server, msg) {
    let client = server.clients[clientId];
    let serverText = server.mergeTree.getText(refSeq, clientId);
    let cliText = client.checkQ.dequeue();
    if ((cliText === undefined) || (cliText != serverText)) {
        console.log(`mismatch `);
        console.log(msg);
        //        console.log(serverText);
        //        console.log(cliText);
        console.log(server.mergeTree.toString());
        console.log(client.mergeTree.toString());
        return true;
    }
    return false;
}
let indentStrings = ["", " ", "  "];
function internedSpaces(n) {
    if (indentStrings[n] === undefined) {
        indentStrings[n] = "";
        for (let i = 0; i < n; i++) {
            indentStrings[n] += " ";
        }
    }
    return indentStrings[n];
}
exports.internedSpaces = internedSpaces;
class Client {
    constructor(initText, options) {
        this.accumTime = 0;
        this.localTime = 0;
        this.localOps = 0;
        this.accumWindowTime = 0;
        this.maxWindowTime = 0;
        this.accumWindow = 0;
        this.accumOps = 0;
        this.verboseOps = false;
        this.measureOps = false;
        this.clientSequenceNumber = 1;
        this.clientNameToIds = new Collections.RedBlackTree(compareStrings);
        this.shortClientIdMap = [];
        this.shortClientBranchIdMap = [];
        this.mergeTree = new MergeTree(initText, options);
        this.mergeTree.getLongClientId = id => this.getLongClientId(id);
        this.mergeTree.clientIdToBranchId = this.shortClientBranchIdMap;
        this.q = Collections.ListMakeHead();
        this.checkQ = Collections.ListMakeHead();
    }
    undoSingleSequenceNumber(undoSegments, redoSegments) {
        let len = undoSegments.length;
        let index = len - 1;
        let seq = undoSegments[index].seq;
        if (seq === 0) {
            return 0;
        }
        while (index >= 0) {
            let undoInfo = undoSegments[index];
            if (seq === undoInfo.seq) {
                this.mergeTree.cherryPickedUndo(undoInfo);
                redoSegments.push(undoInfo);
            }
            else {
                break;
            }
            index--;
        }
        undoSegments.length = index + 1;
        return seq;
    }
    historyToPct(pct) {
        let count = this.undoSegments.length + this.redoSegments.length;
        let curPct = this.undoSegments.length / count;
        let seq = -1;
        if (curPct >= pct) {
            while (curPct > pct) {
                seq = this.undoSingleSequenceNumber(this.undoSegments, this.redoSegments);
                curPct = this.undoSegments.length / count;
            }
        }
        else {
            while (curPct < pct) {
                seq = this.undoSingleSequenceNumber(this.redoSegments, this.undoSegments);
                curPct = this.undoSegments.length / count;
            }
        }
        return seq;
    }
    undo() {
        return this.undoSingleSequenceNumber(this.undoSegments, this.redoSegments);
    }
    redo() {
        return this.undoSingleSequenceNumber(this.redoSegments, this.undoSegments);
    }
    cloneFromSegments() {
        let clone = new Client("", this.mergeTree.options);
        let segments = [];
        this.mergeTree.blockCloneFromSegments(this.mergeTree.root, segments);
        clone.mergeTree.reloadFromSegments(segments);
        let undoSeg = [];
        for (let segment of segments) {
            if (segment.seq !== 0) {
                undoSeg.push({
                    seq: segment.seq,
                    seg: segment,
                    op: 0 /* INSERT */
                });
            }
            if (segment.removedSeq !== undefined) {
                undoSeg.push({
                    seq: segment.removedSeq,
                    seg: segment,
                    op: 1 /* REMOVE */
                });
            }
        }
        undoSeg = undoSeg.sort((a, b) => {
            if (b.seq === a.seq) {
                return 0;
            }
            else if (b.seq === exports.UnassignedSequenceNumber) {
                return -1;
            }
            else if (a.seq === exports.UnassignedSequenceNumber) {
                return 1;
            }
            else {
                return a.seq - b.seq;
            }
        });
        clone.undoSegments = undoSeg;
        clone.redoSegments = [];
        return clone;
    }
    getOrAddShortClientId(longClientId, branchId = 0) {
        if (!this.clientNameToIds.get(longClientId)) {
            this.addLongClientId(longClientId, branchId);
        }
        return this.getShortClientId(longClientId);
    }
    getShortClientId(longClientId) {
        return this.clientNameToIds.get(longClientId).data.clientId;
    }
    getLongClientId(clientId) {
        if (clientId >= 0) {
            return this.shortClientIdMap[clientId];
        }
        else {
            return "original";
        }
    }
    addLongClientId(longClientId, branchId = 0) {
        this.clientNameToIds.put(longClientId, {
            branchId,
            clientId: this.shortClientIdMap.length
        });
        this.shortClientIdMap.push(longClientId);
        this.shortClientBranchIdMap.push(branchId);
    }
    getBranchId(clientId) {
        return this.shortClientBranchIdMap[clientId];
    }
    // TODO: props, end
    makeInsertMarkerMsg(markerType, behaviors, pos, seq, refSeq, objectId) {
        return {
            clientId: this.longClientId,
            minimumSequenceNumber: undefined,
            clientSequenceNumber: this.clientSequenceNumber,
            sequenceNumber: seq,
            referenceSequenceNumber: refSeq,
            objectId: objectId,
            userId: undefined,
            offset: seq,
            origin: null,
            contents: {
                type: 0 /* INSERT */, marker: { type: markerType, behaviors }, pos1: pos
            },
            traces: [],
            type: API.OperationType,
        };
    }
    makeInsertMsg(text, pos, seq, refSeq, objectId) {
        return {
            clientId: this.longClientId,
            sequenceNumber: seq,
            referenceSequenceNumber: refSeq,
            clientSequenceNumber: this.clientSequenceNumber,
            minimumSequenceNumber: undefined,
            objectId: objectId,
            userId: undefined,
            offset: seq,
            origin: null,
            contents: {
                type: 0 /* INSERT */, text: text, pos1: pos
            },
            traces: [],
            type: API.OperationType,
        };
    }
    makeRemoveMsg(start, end, seq, refSeq, objectId) {
        return {
            clientId: this.longClientId,
            sequenceNumber: seq,
            referenceSequenceNumber: refSeq,
            clientSequenceNumber: this.clientSequenceNumber,
            minimumSequenceNumber: undefined,
            objectId: objectId,
            userId: undefined,
            offset: seq,
            origin: null,
            contents: {
                type: 1 /* REMOVE */, pos1: start, pos2: end,
            },
            traces: [],
            type: API.OperationType,
        };
    }
    makeAnnotateMsg(props, start, end, seq, refSeq, objectId) {
        return {
            clientId: this.longClientId,
            sequenceNumber: seq,
            referenceSequenceNumber: refSeq,
            objectId: objectId,
            clientSequenceNumber: this.clientSequenceNumber,
            userId: undefined,
            minimumSequenceNumber: undefined,
            offset: seq,
            origin: null,
            contents: {
                type: 2 /* ANNOTATE */, pos1: start, pos2: end, props
            },
            traces: [],
            type: API.OperationType,
        };
    }
    hasMessages() {
        return this.q.count() > 0;
    }
    enqueueMsg(msg) {
        this.q.enqueue(msg);
    }
    dequeueMsg() {
        return this.q.dequeue();
    }
    enqueueTestString() {
        this.checkQ.enqueue(this.getText());
    }
    transformOp(op, msg, toSequenceNumber) {
        if ((op.type == 2 /* ANNOTATE */) ||
            (op.type == 1 /* REMOVE */)) {
            let ranges = this.mergeTree.tardisRange(op.pos1, op.pos2, msg.referenceSequenceNumber, toSequenceNumber);
            if (ranges.length == 1) {
                op.pos1 = ranges[0].start;
                op.pos2 = ranges[0].end;
            }
            else {
                let groupOp = { type: 3 /* GROUP */ };
                groupOp.ops = ranges.map((range) => ({
                    type: op.type,
                    pos1: range.start,
                    pos2: range.end,
                }));
                return groupOp;
            }
        }
        else if (op.type == 0 /* INSERT */) {
            op.pos1 = this.mergeTree.tardisPosition(op.pos1, msg.referenceSequenceNumber, toSequenceNumber);
        }
        else if (op.type === 3 /* GROUP */) {
            for (let i = 0, len = op.ops.length; i < len; i++) {
                op.ops[i] = this.transformOp(op.ops[i], msg, toSequenceNumber);
            }
        }
        return op;
    }
    transform(msg, toSequenceNumber) {
        if (msg.referenceSequenceNumber >= toSequenceNumber) {
            return msg;
        }
        let op = msg.contents;
        msg.contents = this.transformOp(op, msg, toSequenceNumber);
    }
    checkContingentOps(groupOp, msg) {
        for (let memberOp of groupOp.ops) {
            // TODO: handle cancelling due to out of range or id not found
            if (memberOp.type === 2 /* ANNOTATE */) {
                if (memberOp.when) {
                    let whenClause = memberOp.when;
                    // for now assume single segment
                    let segoff = this.mergeTree.getContainingSegment(memberOp.pos1, msg.referenceSequenceNumber, this.getOrAddShortClientId(msg.clientId));
                    if (segoff) {
                        let baseSegment = segoff.segment;
                        if (!Properties.matchProperties(baseSegment.properties, whenClause.props)) {
                            return false;
                        }
                    }
                }
            }
        }
        return true;
    }
    applyOp(op, msg) {
        let clid = this.getOrAddShortClientId(msg.clientId);
        switch (op.type) {
            case 0 /* INSERT */:
                if (op.text !== undefined) {
                    this.insertTextRemote(op.text, op.pos1, op.props, msg.sequenceNumber, msg.referenceSequenceNumber, clid);
                }
                else {
                    this.insertMarkerRemote(op.marker, op.pos1, op.props, msg.sequenceNumber, msg.referenceSequenceNumber, clid);
                }
                break;
            case 1 /* REMOVE */:
                this.removeSegmentRemote(op.pos1, op.pos2, msg.sequenceNumber, msg.referenceSequenceNumber, clid);
                break;
            case 2 /* ANNOTATE */:
                this.annotateSegmentRemote(op.props, op.pos1, op.pos2, msg.sequenceNumber, msg.referenceSequenceNumber, clid, op.combiningOp);
                break;
            case 3 /* GROUP */: {
                let go = true;
                if (op.hasContingentOps) {
                    go = this.checkContingentOps(op, msg);
                }
                if (go) {
                    for (let memberOp of op.ops) {
                        this.applyOp(memberOp, msg);
                    }
                }
                break;
            }
        }
    }
    coreApplyMsg(msg) {
        this.applyOp(msg.contents, msg);
    }
    applyMsg(msg) {
        if ((msg !== undefined) && (msg.minimumSequenceNumber > this.mergeTree.getCollabWindow().minSeq)) {
            this.updateMinSeq(msg.minimumSequenceNumber);
        }
        // Ensure client ID is registered
        // TODO support for more than two branch IDs
        // The existance of msg.origin means we are a branch message - and so should be marked as 0
        // The non-existance of msg.origin indicates we are local - and should inherit the collab mode ID
        const branchId = msg.origin ? 0 : this.mergeTree.localBranchId;
        this.getOrAddShortClientId(msg.clientId, branchId);
        // Apply if an operation message
        if (msg.type === API.OperationType) {
            const operationMessage = msg;
            if (msg.clientId === this.longClientId) {
                let op = msg.contents;
                if (op.type !== 2 /* ANNOTATE */) {
                    let ack = true;
                    if (op.type === 3 /* GROUP */) {
                        if (op.hasContingentOps) {
                            let cancelled = this.checkContingentOps(op, msg);
                            if (cancelled) {
                                ack = false;
                                // TODO: undo segment group and re-do group op
                            }
                        }
                    }
                    if (ack) {
                        this.ackPendingSegment(operationMessage.sequenceNumber);
                    }
                }
            }
            else {
                this.coreApplyMsg(operationMessage);
            }
        }
    }
    applyMessages(msgCount) {
        while (msgCount > 0) {
            let msg = this.q.dequeue();
            if (msg) {
                this.applyMsg(msg);
            }
            else {
                break;
            }
            msgCount--;
        }
    }
    getLocalSequenceNumber() {
        let segWindow = this.mergeTree.getCollabWindow();
        if (segWindow.collaborating) {
            return exports.UnassignedSequenceNumber;
        }
        else {
            return exports.UniversalSequenceNumber;
        }
    }
    // TODO: hold group for ack if contingent
    localTransaction(groupOp) {
        this.mergeTree.startGroupOperation();
        for (let op of groupOp.ops) {
            switch (op.type) {
                case 0 /* INSERT */:
                    if (op.marker) {
                        this.insertMarkerLocal(op.pos1, op.marker.behaviors, op.props);
                    }
                    else {
                        this.insertTextLocal(op.text, op.pos1, op.props);
                    }
                    break;
                case 2 /* ANNOTATE */:
                    this.annotateSegmentLocal(op.props, op.pos1, op.pos2, op.combiningOp);
                    break;
                case 1 /* REMOVE */:
                    this.removeSegmentLocal(op.pos1, op.pos2);
                    break;
                case 3 /* GROUP */:
                    console.log("unhandled nested group op");
                    break;
            }
        }
        this.mergeTree.endGroupOperation();
    }
    annotateSegmentLocal(props, start, end, op) {
        let segWindow = this.mergeTree.getCollabWindow();
        let clientId = segWindow.clientId;
        let refSeq = segWindow.currentSeq;
        let seq = this.getLocalSequenceNumber();
        let clockStart;
        if (this.measureOps) {
            clockStart = clock();
        }
        this.mergeTree.annotateRange(props, start, end, refSeq, clientId, seq, op);
        if (this.measureOps) {
            this.localTime += elapsedMicroseconds(clockStart);
            this.localOps++;
        }
        if (this.verboseOps) {
            console.log(`annotate local cli ${this.getLongClientId(clientId)} ref seq ${refSeq}`);
        }
    }
    annotateSegmentRemote(props, start, end, seq, refSeq, clientId, combiningOp) {
        let clockStart;
        if (this.measureOps) {
            clockStart = clock();
        }
        this.mergeTree.annotateRange(props, start, end, refSeq, clientId, seq, combiningOp);
        this.mergeTree.getCollabWindow().currentSeq = seq;
        if (this.measureOps) {
            this.accumTime += elapsedMicroseconds(clockStart);
            this.accumOps++;
            this.accumWindow += (this.getCurrentSeq() - this.mergeTree.getCollabWindow().minSeq);
        }
        if (this.verboseOps) {
            console.log(`@cli ${this.getLongClientId(this.mergeTree.getCollabWindow().clientId)} seq ${seq} annotate remote start ${start} end ${end} refseq ${refSeq} cli ${clientId}`);
        }
    }
    removeSegmentLocal(start, end) {
        let segWindow = this.mergeTree.getCollabWindow();
        let clientId = segWindow.clientId;
        let refSeq = segWindow.currentSeq;
        let seq = this.getLocalSequenceNumber();
        let clockStart;
        if (this.measureOps) {
            clockStart = clock();
        }
        this.mergeTree.markRangeRemoved(start, end, refSeq, clientId, seq);
        if (this.measureOps) {
            this.localTime += elapsedMicroseconds(clockStart);
            this.localOps++;
        }
        if (this.verboseOps) {
            console.log(`remove local cli ${this.getLongClientId(clientId)} ref seq ${refSeq} [${start},${end})`);
        }
    }
    removeSegmentRemote(start, end, seq, refSeq, clientId) {
        let clockStart;
        if (this.measureOps) {
            clockStart = clock();
        }
        this.mergeTree.markRangeRemoved(start, end, refSeq, clientId, seq);
        this.mergeTree.getCollabWindow().currentSeq = seq;
        if (this.measureOps) {
            this.accumTime += elapsedMicroseconds(clockStart);
            this.accumOps++;
            this.accumWindow += (this.getCurrentSeq() - this.mergeTree.getCollabWindow().minSeq);
        }
        if (this.verboseOps) {
            console.log(`@cli ${this.getLongClientId(this.mergeTree.getCollabWindow().clientId)} seq ${seq} remove remote start ${start} end ${end} refseq ${refSeq} cli ${this.getLongClientId(clientId)}`);
        }
    }
    insertTextLocal(text, pos, props) {
        let segWindow = this.mergeTree.getCollabWindow();
        let clientId = segWindow.clientId;
        let refSeq = segWindow.currentSeq;
        let seq = this.getLocalSequenceNumber();
        let clockStart;
        if (this.measureOps) {
            clockStart = clock();
        }
        this.mergeTree.insertText(pos, refSeq, clientId, seq, text, props);
        if (this.measureOps) {
            this.localTime += elapsedMicroseconds(clockStart);
            this.localOps++;
        }
        if (this.verboseOps) {
            console.log(`insert local text ${text} pos ${pos} cli ${this.getLongClientId(clientId)} ref seq ${refSeq}`);
        }
    }
    insertMarkerLocal(pos, behaviors, props) {
        let segWindow = this.mergeTree.getCollabWindow();
        let clientId = segWindow.clientId;
        let refSeq = segWindow.currentSeq;
        let seq = this.getLocalSequenceNumber();
        let clockStart;
        if (this.measureOps) {
            clockStart = clock();
        }
        this.mergeTree.insertMarker(pos, refSeq, clientId, seq, behaviors, props);
        if (this.measureOps) {
            this.localTime += elapsedMicroseconds(clockStart);
            this.localOps++;
        }
        if (this.verboseOps) {
            console.log(`insert local marke pos ${pos} cli ${this.getLongClientId(clientId)} ref seq ${refSeq}`);
        }
    }
    insertMarkerRemote(marker, pos, props, seq, refSeq, clientId) {
        let clockStart;
        if (this.measureOps) {
            clockStart = clock();
        }
        this.mergeTree.insertMarker(pos, refSeq, clientId, seq, marker.behaviors, props);
        this.mergeTree.getCollabWindow().currentSeq = seq;
        if (this.measureOps) {
            this.accumTime += elapsedMicroseconds(clockStart);
            this.accumOps++;
            this.accumWindow += (this.getCurrentSeq() - this.mergeTree.getCollabWindow().minSeq);
        }
        if (this.verboseOps) {
            console.log(`@cli ${this.getLongClientId(this.mergeTree.getCollabWindow().clientId)} ${marker.toString()} seq ${seq} insert remote pos ${pos} refseq ${refSeq} cli ${clientId}`);
        }
    }
    insertTextRemote(text, pos, props, seq, refSeq, clientId) {
        let clockStart;
        if (this.measureOps) {
            clockStart = clock();
        }
        this.mergeTree.insertText(pos, refSeq, clientId, seq, text, props);
        this.mergeTree.getCollabWindow().currentSeq = seq;
        if (this.measureOps) {
            this.accumTime += elapsedMicroseconds(clockStart);
            this.accumOps++;
            this.accumWindow += (this.getCurrentSeq() - this.mergeTree.getCollabWindow().minSeq);
        }
        if (this.verboseOps) {
            console.log(`@cli ${this.getLongClientId(this.mergeTree.getCollabWindow().clientId)} text ${text} seq ${seq} insert remote pos ${pos} refseq ${refSeq} cli ${this.getLongClientId(clientId)}`);
        }
    }
    ackPendingSegment(seq) {
        let clockStart;
        if (this.measureOps) {
            clockStart = clock();
        }
        this.mergeTree.ackPendingSegment(seq);
        this.mergeTree.getCollabWindow().currentSeq = seq;
        if (this.measureOps) {
            this.accumTime += elapsedMicroseconds(clockStart);
            this.accumOps++;
            this.accumWindow += (this.getCurrentSeq() - this.mergeTree.getCollabWindow().minSeq);
        }
        if (this.verboseOps) {
            console.log(`@cli ${this.getLongClientId(this.mergeTree.getCollabWindow().clientId)} ack seq # ${seq}`);
        }
    }
    updateMinSeq(minSeq) {
        let clockStart;
        if (this.measureOps) {
            clockStart = clock();
        }
        this.mergeTree.updateGlobalMinSeq(minSeq);
        if (this.measureOps) {
            let elapsed = elapsedMicroseconds(clockStart);
            this.accumWindowTime += elapsed;
            if (elapsed > this.maxWindowTime) {
                this.maxWindowTime = elapsed;
            }
        }
    }
    getCurrentSeq() {
        return this.mergeTree.getCollabWindow().currentSeq;
    }
    getClientId() {
        return this.mergeTree.getCollabWindow().clientId;
    }
    getText(start, end) {
        let segmentWindow = this.mergeTree.getCollabWindow();
        return this.mergeTree.getText(segmentWindow.currentSeq, segmentWindow.clientId, false, start, end);
    }
    /**
     * Adds spaces for markers and components, so that position calculations account for them
     */
    getTextWithPlaceholders() {
        let segmentWindow = this.mergeTree.getCollabWindow();
        return this.mergeTree.getText(segmentWindow.currentSeq, segmentWindow.clientId, true);
    }
    getTextRangeWithPlaceholders(start, end) {
        let segmentWindow = this.mergeTree.getCollabWindow();
        return this.mergeTree.getText(segmentWindow.currentSeq, segmentWindow.clientId, true, start, end);
    }
    getLength() {
        let segmentWindow = this.mergeTree.getCollabWindow();
        return this.mergeTree.getLength(segmentWindow.currentSeq, segmentWindow.clientId);
    }
    relText(clientId, refSeq) {
        return `cli: ${this.getLongClientId(clientId)} refSeq: ${refSeq}: ` + this.mergeTree.getText(refSeq, clientId);
    }
    startCollaboration(longClientId, minSeq = 0, branchId = 0) {
        this.longClientId = longClientId;
        this.addLongClientId(longClientId, branchId);
        this.mergeTree.startCollaboration(this.getShortClientId(this.longClientId), minSeq, branchId);
    }
}
exports.Client = Client;
exports.clientSeqComparer = {
    min: { refSeq: -1, clientId: "" },
    compare: (a, b) => a.refSeq - b.refSeq
};
/**
 * Server for tests.  Simulates client communication by directing placing
 * messages in client queues.
 */
class TestServer extends Client {
    constructor(initText) {
        super(initText);
        this.seq = 1;
    }
    addUpstreamClients(upstreamClients) {
        // assumes addClients already called
        this.upstreamMap = new Collections.RedBlackTree(compareNumbers);
        for (let upstreamClient of upstreamClients) {
            this.clientSeqNumbers.add({
                refSeq: upstreamClient.getCurrentSeq(),
                clientId: upstreamClient.longClientId
            });
        }
    }
    addClients(clients) {
        this.clientSeqNumbers = new Collections.Heap([], exports.clientSeqComparer);
        this.clients = clients;
        for (let client of clients) {
            this.clientSeqNumbers.add({ refSeq: client.getCurrentSeq(), clientId: client.longClientId });
        }
    }
    addListeners(listeners) {
        this.listeners = listeners;
    }
    applyMsg(msg) {
        this.coreApplyMsg(msg);
        if (exports.useCheckQ) {
            let clid = this.getShortClientId(msg.clientId);
            return checkTextMatchRelative(msg.referenceSequenceNumber, clid, this, msg);
        }
        else {
            return false;
        }
    }
    // TODO: remove mappings when no longer needed using min seq 
    // in upstream message
    transformUpstreamMessage(msg) {
        if (msg.referenceSequenceNumber > 0) {
            msg.referenceSequenceNumber =
                this.upstreamMap.get(msg.referenceSequenceNumber).data;
        }
        msg.origin = {
            id: "A",
            sequenceNumber: msg.sequenceNumber,
            minimumSequenceNumber: msg.minimumSequenceNumber,
        };
        this.upstreamMap.put(msg.sequenceNumber, this.seq);
        msg.sequenceNumber = -1;
    }
    copyMsg(msg) {
        return {
            clientId: msg.clientId,
            clientSequenceNumber: msg.clientSequenceNumber,
            contents: msg.contents,
            minimumSequenceNumber: msg.minimumSequenceNumber,
            referenceSequenceNumber: msg.referenceSequenceNumber,
            sequenceNumber: msg.sequenceNumber,
            traces: msg.traces,
            type: msg.type
        };
    }
    applyMessages(msgCount) {
        while (msgCount > 0) {
            let msg = this.q.dequeue();
            if (msg) {
                if (msg.sequenceNumber >= 0) {
                    this.transformUpstreamMessage(msg);
                }
                msg.sequenceNumber = this.seq++;
                if (this.applyMsg(msg)) {
                    return true;
                }
                if (this.clients) {
                    let minCli = this.clientSeqNumbers.peek();
                    if (minCli && (minCli.clientId == msg.clientId) &&
                        (minCli.refSeq < msg.referenceSequenceNumber)) {
                        let cliSeq = this.clientSeqNumbers.get();
                        let oldSeq = cliSeq.refSeq;
                        cliSeq.refSeq = msg.referenceSequenceNumber;
                        this.clientSeqNumbers.add(cliSeq);
                        minCli = this.clientSeqNumbers.peek();
                        if (minCli.refSeq > oldSeq) {
                            msg.minimumSequenceNumber = minCli.refSeq;
                            this.updateMinSeq(minCli.refSeq);
                        }
                    }
                    for (let client of this.clients) {
                        client.enqueueMsg(msg);
                    }
                    if (this.listeners) {
                        for (let listener of this.listeners) {
                            listener.enqueueMsg(this.copyMsg(msg));
                        }
                    }
                }
            }
            else {
                break;
            }
            msgCount--;
        }
        return false;
    }
}
exports.TestServer = TestServer;
var LRUSegmentComparer = {
    min: { maxSeq: -2 },
    compare: (a, b) => a.maxSeq - b.maxSeq
};
function glc(mergeTree, id) {
    if (mergeTree.getLongClientId) {
        return mergeTree.getLongClientId(id);
    }
    else {
        return id.toString();
    }
}
function applyLeafRangeMarker(marker, searchInfo) {
    for (let rangeLabel of searchInfo.rangeLabels) {
        if (marker.hasRangeLabel(rangeLabel)) {
            let currentStack = searchInfo.stacks[rangeLabel];
            if (currentStack === undefined) {
                currentStack = new Collections.Stack();
                searchInfo.stacks[rangeLabel] = currentStack;
            }
            applyRangeMarker(currentStack, marker);
        }
    }
}
function recordRangeLeaf(segment, segpos, refSeq, clientId, start, end, searchInfo) {
    if (segment.getType() === SegmentType.Marker) {
        let marker = segment;
        if (marker.behaviors &
            (ops.MarkerBehaviors.RangeBegin | ops.MarkerBehaviors.RangeEnd)) {
            applyLeafRangeMarker(marker, searchInfo);
        }
    }
    return false;
}
function rangeShift(node, segpos, refSeq, clientId, offset, end, searchInfo) {
    if (node.isLeaf()) {
        let seg = node;
        if ((searchInfo.mergeTree.localNetLength(seg) > 0) && (seg.getType() === SegmentType.Marker)) {
            let marker = seg;
            if (marker.behaviors &
                (ops.MarkerBehaviors.RangeBegin | ops.MarkerBehaviors.RangeEnd)) {
                applyLeafRangeMarker(marker, searchInfo);
            }
        }
    }
    else {
        let block = node;
        applyStackDelta(searchInfo.stacks, block.rangeStacks);
    }
    return true;
}
function recordTileStart(segment, segpos, refSeq, clientId, start, end, searchInfo) {
    if (segment.getType() === SegmentType.Marker) {
        let marker = segment;
        if (marker.hasTileLabel(searchInfo.tileLabel)) {
            searchInfo.tileMarker = marker;
        }
    }
    return false;
}
function tileShift(node, segpos, refSeq, clientId, offset, end, searchInfo) {
    if (node.isLeaf()) {
        let seg = node;
        if ((searchInfo.mergeTree.localNetLength(seg) > 0) && (seg.getType() === SegmentType.Marker)) {
            let marker = seg;
            if (marker.hasTileLabel(searchInfo.tileLabel)) {
                searchInfo.tileMarker = marker;
            }
        }
    }
    else {
        let block = node;
        let marker;
        if (searchInfo.preceding) {
            marker = block.rightmostTiles[searchInfo.tileLabel];
        }
        else {
            marker = block.leftmostTiles[searchInfo.tileLabel];
        }
        if (marker !== undefined) {
            searchInfo.tileMarker = marker;
        }
    }
    return true;
}
// represents a sequence of text segments
class MergeTree {
    // TODO: make and use interface describing options
    constructor(text, options) {
        this.text = text;
        this.options = options;
        this.windowTime = 0;
        this.packTime = 0;
        this.blockUpdateMarkers = false;
        this.collabWindow = new CollaborationWindow();
        // TODO: change this to ES6 map; add remove on segment remove
        this.idToSegment = Properties.createMap();
        this.clientIdToBranchId = [];
        this.localBranchId = 0;
        this.ogatherText = (segment, pos, refSeq, clientId, start, end, accumText) => {
            if (segment.getType() == SegmentType.Text) {
                let textSegment = segment;
                if ((textSegment.removedSeq === undefined) || (textSegment.removedSeq == exports.UnassignedSequenceNumber) || (textSegment.removedSeq > refSeq)) {
                    if (MergeTree.traceGatherText) {
                        console.log(`@cli ${this.getLongClientId(this.collabWindow.clientId)} gather seg seq ${textSegment.seq} rseq ${textSegment.removedSeq} text ${textSegment.text}`);
                    }
                    if ((start <= 0) && (end >= textSegment.text.length)) {
                        accumText.textSegment.text += textSegment.text;
                    }
                    else {
                        if (start < 0) {
                            start = 0;
                        }
                        if (end >= textSegment.text.length) {
                            accumText.textSegment.text += textSegment.text.substring(start);
                        }
                        else {
                            accumText.textSegment.text += textSegment.text.substring(start, end);
                        }
                    }
                }
                else {
                    if (MergeTree.traceGatherText) {
                        console.log(`ignore seg seq ${textSegment.seq} rseq ${textSegment.removedSeq} text ${textSegment.text}`);
                    }
                }
            }
            else if (accumText.placeholders) {
                for (let i = 0; i < segment.cachedLength; i++) {
                    accumText.textSegment.text += " ";
                }
            }
            return true;
        };
        this.gatherText = (segment, pos, refSeq, clientId, start, end, accumText) => {
            if (segment.getType() == SegmentType.Text) {
                let textSegment = segment;
                if (MergeTree.traceGatherText) {
                    console.log(`@cli ${this.getLongClientId(this.collabWindow.clientId)} gather seg seq ${textSegment.seq} rseq ${textSegment.removedSeq} text ${textSegment.text}`);
                }
                if ((start <= 0) && (end >= textSegment.text.length)) {
                    accumText.textSegment.text += textSegment.text;
                }
                else {
                    if (start < 0) {
                        start = 0;
                    }
                    if (end >= textSegment.text.length) {
                        accumText.textSegment.text += textSegment.text.substring(start);
                    }
                    else {
                        accumText.textSegment.text += textSegment.text.substring(start, end);
                    }
                }
            }
            else if (accumText.placeholders) {
                for (let i = 0; i < segment.cachedLength; i++) {
                    accumText.textSegment.text += " ";
                }
            }
            return true;
        };
        this.splitLeafSegment = (segment, pos) => {
            let segmentChanges = {};
            if (pos > 0) {
                segmentChanges.next = segment.splitAt(pos);
            }
            return segmentChanges;
        };
        this.blockUpdateActions = MergeTree.initBlockUpdateActions;
        if (options) {
            if (options.blockUpdateMarkers) {
                this.blockUpdateMarkers = options.blockUpdateMarkers;
            }
            if (options.localMinSeq !== undefined) {
                this.collabWindow.localMinSeq = options.localMinSeq;
            }
        }
        this.root = this.initialTextNode(this.text);
    }
    makeBlock(childCount) {
        if (this.blockUpdateMarkers) {
            return new HierMergeBlock(childCount);
        }
        else {
            return new MergeBlock(childCount);
        }
    }
    initialTextNode(text) {
        let block = this.makeBlock(1);
        block.children[0] = new TextSegment(text, exports.UniversalSequenceNumber, exports.LocalClientId);
        block.children[0].parent = block;
        block.cachedLength = text.length;
        return block;
    }
    blockCloneFromSegments(block, segments) {
        for (let i = 0; i < block.childCount; i++) {
            let child = block.children[i];
            if (child.isLeaf()) {
                segments.push(this.segmentClone(block.children[i]));
            }
            else {
                this.blockCloneFromSegments(child, segments);
            }
        }
    }
    clone() {
        let options = {
            blockUpdateMarkers: this.blockUpdateMarkers,
            localMinSeq: this.collabWindow.localMinSeq
        };
        let b = new MergeTree("", options);
        // for now assume that b will not collaborate
        b.root = b.blockClone(this.root);
    }
    blockClone(block) {
        let bBlock = this.makeBlock(block.childCount);
        for (let i = 0; i < block.childCount; i++) {
            let child = block.children[i];
            if (child.isLeaf()) {
                bBlock.children[i] = this.segmentClone(block.children[i]);
            }
            else {
                bBlock.children[i] = this.blockClone(block.children[i]);
            }
        }
        this.nodeUpdateLengthNewStructure(bBlock);
        return bBlock;
    }
    segmentClone(segment) {
        let b = segment.clone();
        return b;
    }
    startGroupOperation() {
        // TODO: assert undefined
        this.transactionSegmentGroup = { segments: [] };
        this.pendingSegments.enqueue(this.transactionSegmentGroup);
    }
    endGroupOperation() {
        this.transactionSegmentGroup = undefined;
    }
    localNetLength(segment) {
        let segBranchId = this.getBranchId(segment.clientId);
        let removalInfo = segment;
        if (this.localBranchId > segBranchId) {
            removalInfo = this.getRemovalInfo(this.localBranchId, segBranchId, segment);
        }
        if (removalInfo.removedSeq !== undefined) {
            return 0;
        }
        else {
            return segment.cachedLength;
        }
    }
    getBranchId(clientId) {
        if ((this.clientIdToBranchId.length > clientId) && (clientId >= 0)) {
            return this.clientIdToBranchId[clientId];
        }
        else if (clientId === exports.LocalClientId) {
            return 0;
        }
        else {
            return this.localBranchId;
        }
    }
    // TODO: remove id when segment removed 
    mapIdToSegment(id, segment) {
        this.idToSegment[id] = segment;
    }
    addNode(block, node) {
        let index = block.childCount;
        block.children[block.childCount++] = node;
        node.parent = block;
        return index;
    }
    reloadFromSegments(segments) {
        let segCap = exports.MaxNodesInBlock - 1;
        const measureReloadTime = false;
        let buildMergeBlock = (nodes) => {
            const nodeCount = Math.ceil(nodes.length / segCap);
            const blocks = [];
            let nodeIndex = 0;
            for (let i = 0; i < nodeCount; i++) {
                let len = 0;
                blocks[i] = this.makeBlock(0);
                for (let j = 0; j < segCap; j++) {
                    if (nodeIndex < nodes.length) {
                        let childIndex = this.addNode(blocks[i], nodes[nodeIndex]);
                        len += nodes[nodeIndex].cachedLength;
                        if (this.blockUpdateMarkers) {
                            let hierBlock = blocks[i].hierBlock();
                            hierBlock.addNodeMarkers(this, nodes[nodeIndex]);
                        }
                        if (this.blockUpdateActions) {
                            this.blockUpdateActions.child(blocks[i], childIndex);
                        }
                    }
                    else {
                        break;
                    }
                    nodeIndex++;
                }
                blocks[i].cachedLength = len;
            }
            if (blocks.length == 1) {
                return blocks[0];
            }
            else {
                return buildMergeBlock(blocks);
            }
        };
        let clockStart;
        if (measureReloadTime) {
            clockStart = clock();
        }
        if (segments.length > 0) {
            this.root = this.makeBlock(1);
            let block = buildMergeBlock(segments);
            block.parent = this.root;
            this.root.children[0] = block;
            if (this.blockUpdateMarkers) {
                let hierRoot = this.root.hierBlock();
                hierRoot.addNodeMarkers(this, block);
            }
            if (this.blockUpdateActions) {
                this.blockUpdateActions.child(this.root, 0);
            }
            this.root.cachedLength = block.cachedLength;
        }
        else {
            this.root = this.makeBlock(0);
            this.root.cachedLength = 0;
        }
        if (measureReloadTime) {
            console.log(`reload time ${elapsedMicroseconds(clockStart)}`);
        }
    }
    // for now assume min starts at zero
    startCollaboration(localClientId, minSeq, branchId) {
        this.collabWindow.clientId = localClientId;
        this.collabWindow.minSeq = minSeq;
        this.collabWindow.collaborating = true;
        this.collabWindow.currentSeq = minSeq;
        this.localBranchId = branchId;
        this.segmentsToScour = new Collections.Heap([], LRUSegmentComparer);
        this.pendingSegments = Collections.ListMakeHead();
        let measureFullCollab = false;
        let clockStart;
        if (measureFullCollab) {
            clockStart = clock();
        }
        this.nodeUpdateLengthNewStructure(this.root, true);
        if (measureFullCollab) {
            console.log(`update partial lengths at start ${elapsedMicroseconds(clockStart)}`);
        }
    }
    addToLRUSet(segment, seq) {
        this.segmentsToScour.add({ segment: segment, maxSeq: seq });
    }
    underflow(node) {
        return node.childCount < (exports.MaxNodesInBlock / 2);
    }
    scourNode(node, holdNodes) {
        let prevSegment;
        for (let k = 0; k < node.childCount; k++) {
            let childNode = node.children[k];
            if (childNode.isLeaf()) {
                let segment = childNode;
                if ((segment.removedSeq !== undefined) && (segment.removedSeq !== exports.UnassignedSequenceNumber)) {
                    let createBrid = this.getBranchId(segment.clientId);
                    let removeBrid = this.getBranchId(segment.removedClientId);
                    if ((removeBrid != createBrid) || (segment.removedSeq > this.collabWindow.minSeq)) {
                        holdNodes.push(segment);
                    }
                    else {
                        if (MergeTree.traceZRemove) {
                            console.log(`${this.getLongClientId(this.collabWindow.clientId)}: Zremove ${segment.text}; cli ${this.getLongClientId(segment.clientId)}`);
                        }
                        segment.parent = undefined;
                    }
                    prevSegment = undefined;
                }
                else {
                    if ((segment.seq <= this.collabWindow.minSeq) &&
                        (!segment.segmentGroup) && (segment.seq != exports.UnassignedSequenceNumber)) {
                        if (prevSegment && prevSegment.canAppend(segment, this)) {
                            if (MergeTree.traceAppend) {
                                console.log(`${this.getLongClientId(this.collabWindow.clientId)}: append ${prevSegment.text} + ${segment.text}; cli ${this.getLongClientId(prevSegment.clientId)} + cli ${this.getLongClientId(segment.clientId)}`);
                            }
                            prevSegment.append(segment);
                            segment.parent = undefined;
                        }
                        else {
                            holdNodes.push(segment);
                            if (this.localNetLength(segment) > 0) {
                                prevSegment = segment;
                            }
                            else {
                                prevSegment = undefined;
                            }
                        }
                    }
                    else {
                        holdNodes.push(segment);
                        prevSegment = undefined;
                    }
                }
            }
            else {
                holdNodes.push(childNode);
                prevSegment = undefined;
            }
        }
    }
    // interior node with all node children
    pack(block) {
        let parent = block.parent;
        let children = parent.children;
        let childIndex;
        let childBlock;
        let holdNodes = [];
        for (childIndex = 0; childIndex < parent.childCount; childIndex++) {
            // debug assert not isLeaf()
            childBlock = children[childIndex];
            this.scourNode(childBlock, holdNodes);
            // will replace this block with a packed block
            childBlock.parent = undefined;
        }
        let totalNodeCount = holdNodes.length;
        let halfCount = exports.MaxNodesInBlock / 2;
        let childCount = Math.min(exports.MaxNodesInBlock - 1, Math.floor(totalNodeCount / halfCount));
        if (childCount < 1) {
            childCount = 1;
        }
        let baseCount = Math.floor(totalNodeCount / childCount);
        let extraCount = totalNodeCount % childCount;
        let packedBlocks = new Array(exports.MaxNodesInBlock);
        let readCount = 0;
        for (let nodeIndex = 0; nodeIndex < childCount; nodeIndex++) {
            let nodeCount = baseCount;
            if (extraCount > 0) {
                nodeCount++;
                extraCount--;
            }
            let packedBlock = this.makeBlock(nodeCount);
            for (let packedNodeIndex = 0; packedNodeIndex < nodeCount; packedNodeIndex++) {
                let nodeToPack = holdNodes[readCount++];
                packedBlock.children[packedNodeIndex] = nodeToPack;
                nodeToPack.parent = packedBlock;
            }
            packedBlock.parent = parent;
            packedBlocks[nodeIndex] = packedBlock;
            this.nodeUpdateLengthNewStructure(packedBlock);
        }
        if (readCount != totalNodeCount) {
            console.log(`total count ${totalNodeCount} readCount ${readCount}`);
        }
        parent.children = packedBlocks;
        parent.childCount = childCount;
        if (this.underflow(parent) && (parent.parent)) {
            this.pack(parent);
        }
        else {
            this.blockUpdatePathLengths(parent, exports.UnassignedSequenceNumber, -1, true);
        }
    }
    zamboniSegments() {
        //console.log(`scour line ${segmentsToScour.count()}`);
        let clockStart;
        if (MergeTree.options.measureWindowTime) {
            clockStart = clock();
        }
        let segmentToScour = this.segmentsToScour.peek();
        if (segmentToScour && (segmentToScour.maxSeq <= this.collabWindow.minSeq)) {
            for (let i = 0; i < MergeTree.zamboniSegmentsMaxCount; i++) {
                segmentToScour = this.segmentsToScour.get();
                if (segmentToScour && segmentToScour.segment.parent &&
                    (segmentToScour.maxSeq <= this.collabWindow.minSeq)) {
                    let block = segmentToScour.segment.parent;
                    let childrenCopy = [];
                    //                console.log(`scouring from ${segmentToScour.segment.seq}`);
                    this.scourNode(block, childrenCopy);
                    let newChildCount = childrenCopy.length;
                    if (newChildCount < block.childCount) {
                        block.childCount = newChildCount;
                        block.children = childrenCopy;
                        if (this.underflow(block) && block.parent) {
                            //nodeUpdatePathLengths(node, UnassignedSequenceNumber, -1, true);
                            let packClockStart;
                            if (MergeTree.options.measureWindowTime) {
                                packClockStart = clock();
                            }
                            this.pack(block);
                            if (MergeTree.options.measureWindowTime) {
                                this.packTime += elapsedMicroseconds(packClockStart);
                            }
                        }
                        else {
                            this.blockUpdatePathLengths(block, exports.UnassignedSequenceNumber, -1, true);
                        }
                    }
                }
                else {
                    break;
                }
            }
        }
        if (MergeTree.options.measureWindowTime) {
            this.windowTime += elapsedMicroseconds(clockStart);
        }
    }
    getCollabWindow() {
        return this.collabWindow;
    }
    getStats() {
        let nodeGetStats = (block) => {
            let stats = { maxHeight: 0, nodeCount: 0, leafCount: 0, removedLeafCount: 0, liveCount: 0, histo: [] };
            for (let k = 0; k < exports.MaxNodesInBlock; k++) {
                stats.histo[k] = 0;
            }
            for (let i = 0; i < block.childCount; i++) {
                let child = block.children[i];
                let height = 1;
                if (!child.isLeaf()) {
                    let childStats = nodeGetStats(child);
                    height = 1 + childStats.maxHeight;
                    stats.nodeCount += childStats.nodeCount;
                    stats.leafCount += childStats.leafCount;
                    stats.removedLeafCount += childStats.removedLeafCount;
                    stats.liveCount += childStats.liveCount;
                    for (let i = 0; i < exports.MaxNodesInBlock; i++) {
                        stats.histo[i] += childStats.histo[i];
                    }
                }
                else {
                    stats.leafCount++;
                    let segment = child;
                    if (segment.removedSeq !== undefined) {
                        stats.removedLeafCount++;
                    }
                }
                if (height > stats.maxHeight) {
                    stats.maxHeight = height;
                }
            }
            stats.histo[block.childCount]++;
            stats.nodeCount++;
            stats.liveCount += block.childCount;
            return stats;
        };
        let rootStats = nodeGetStats(this.root);
        if (MergeTree.options.measureWindowTime) {
            rootStats.windowTime = this.windowTime;
            rootStats.packTime = this.packTime;
        }
        return rootStats;
    }
    tardisPosition(pos, fromSeq, toSeq, toClientId = exports.NonCollabClient) {
        return this.tardisPositionFromClient(pos, fromSeq, toSeq, exports.NonCollabClient, toClientId);
    }
    tardisPositionFromClient(pos, fromSeq, toSeq, fromClientId, toClientId = exports.NonCollabClient) {
        if (fromSeq < toSeq) {
            if ((toSeq <= this.collabWindow.currentSeq) && (fromSeq >= this.collabWindow.minSeq)) {
                let segoff = this.getContainingSegment(pos, fromSeq, fromClientId);
                let toPos = this.getOffset(segoff.segment, toSeq, toClientId);
                let ret = toPos + segoff.offset;
                assert(ret !== undefined);
                return ret;
            }
            assert(false);
        }
        else {
            return pos;
        }
    }
    tardisRange(rangeStart, rangeEnd, fromSeq, toSeq, toClientId = exports.NonCollabClient) {
        let ranges = [];
        let recordRange = (segment, pos, refSeq, clientId, segStart, segEnd) => {
            let offset = this.getOffset(segment, toSeq, toClientId);
            if (segStart < 0) {
                segStart = 0;
            }
            if (segEnd > segment.cachedLength) {
                segEnd = segment.cachedLength;
            }
            ranges.push({ start: offset + segStart, end: offset + segEnd });
            return true;
        };
        this.mapRange({ leaf: recordRange }, fromSeq, exports.NonCollabClient, undefined, rangeStart, rangeEnd);
        return ranges;
    }
    getLength(refSeq, clientId) {
        return this.blockLength(this.root, refSeq, clientId);
    }
    getOffset(node, refSeq, clientId) {
        let totalOffset = 0;
        let parent = node.parent;
        let prevParent;
        while (parent) {
            let children = parent.children;
            for (let childIndex = 0; childIndex < parent.childCount; childIndex++) {
                let child = children[childIndex];
                if ((prevParent && (child == prevParent)) || (child == node)) {
                    break;
                }
                totalOffset += this.nodeLength(child, refSeq, clientId);
            }
            prevParent = parent;
            parent = parent.parent;
        }
        return totalOffset;
    }
    searchFromPos(pos, target) {
        let start = pos;
        let end = pos + MergeTree.searchChunkSize;
        let chunk = "";
        let found = false;
        while (!found) {
            if (end > this.root.cachedLength) {
                end = this.root.cachedLength;
            }
            chunk += this.getText(exports.UniversalSequenceNumber, this.collabWindow.clientId, false, start, end);
            let result = chunk.match(target);
            if (result !== null) {
                return { text: result[0], pos: result.index };
            }
            start += MergeTree.searchChunkSize;
            if (start >= this.root.cachedLength) {
                break;
            }
            end += MergeTree.searchChunkSize;
        }
    }
    incrementalGetText(refSeq, clientId, start, end) {
        if (start === undefined) {
            start = 0;
        }
        if (end === undefined) {
            end = this.blockLength(this.root, refSeq, clientId);
        }
        let context = new TextSegment("");
        let stack = new Collections.Stack();
        let initialState = new IncrementalMapState(this.root, { leaf: incrementalGatherText }, 0, refSeq, clientId, context, start, end, 0);
        stack.push(initialState);
        while (!stack.empty()) {
            this.incrementalBlockMap(stack);
        }
        return context.text;
    }
    getText(refSeq, clientId, placeholders = false, start, end) {
        if (start === undefined) {
            start = 0;
        }
        if (end === undefined) {
            end = this.blockLength(this.root, refSeq, clientId);
        }
        let accum = { textSegment: new TextSegment(""), placeholders };
        if (MergeTree.traceGatherText) {
            console.log(`get text on cli ${glc(this, this.collabWindow.clientId)} ref cli ${glc(this, clientId)} refSeq ${refSeq}`);
        }
        this.mapRange({ leaf: this.gatherText }, refSeq, clientId, accum, start, end);
        return accum.textSegment.text;
    }
    getContainingSegment(pos, refSeq, clientId) {
        let segment;
        let offset;
        let leaf = (leafSeg, segpos, refSeq, clientId, start) => {
            segment = leafSeg;
            offset = start;
            return false;
        };
        this.searchBlock(this.root, pos, 0, refSeq, clientId, { leaf });
        return { segment, offset };
    }
    blockLength(node, refSeq, clientId) {
        if ((this.collabWindow.collaborating) && (clientId != this.collabWindow.clientId)) {
            return node.partialLengths.getPartialLength(this, refSeq, clientId);
        }
        else {
            return node.cachedLength;
        }
    }
    getRemovalInfo(branchId, segBranchId, segment) {
        if (branchId > segBranchId) {
            let index = (branchId - segBranchId) - 1;
            if (!segment.removalsByBranch) {
                segment.removalsByBranch = [];
            }
            if (!segment.removalsByBranch[index]) {
                segment.removalsByBranch[index] = {};
            }
            return segment.removalsByBranch[index];
        }
        else {
            return segment;
        }
    }
    nodeLength(node, refSeq, clientId) {
        if ((!this.collabWindow.collaborating) || (this.collabWindow.clientId == clientId)) {
            // local client sees all segments, even when collaborating
            if (!node.isLeaf()) {
                return node.cachedLength;
            }
            else {
                return this.localNetLength(node);
            }
        }
        else {
            // sequence number within window 
            let branchId = this.getBranchId(clientId);
            if (!node.isLeaf()) {
                return node.partialLengths.getPartialLength(this, refSeq, clientId);
            }
            else {
                let segment = node;
                let segBranchId = this.getBranchId(segment.clientId);
                if ((segBranchId <= branchId) && ((segment.clientId === clientId) ||
                    ((segment.seq != exports.UnassignedSequenceNumber) && (segment.seq <= refSeq)))) {
                    let removalInfo = segment;
                    if (branchId > segBranchId) {
                        removalInfo = this.getRemovalInfo(branchId, segBranchId, segment);
                    }
                    // segment happened by reference sequence number or segment from requesting client
                    if (removalInfo.removedSeq !== undefined) {
                        if ((removalInfo.removedClientId === clientId) ||
                            (removalInfo.removedClientOverlap && (removalInfo.removedClientOverlap.indexOf(clientId) >= 0)) ||
                            ((removalInfo.removedSeq != exports.UnassignedSequenceNumber) && (removalInfo.removedSeq <= refSeq))) {
                            return 0;
                        }
                        else {
                            return segment.cachedLength;
                        }
                    }
                    else {
                        return segment.cachedLength;
                    }
                }
                else {
                    // segment invisible to client at reference sequence number/branch id/client id of op
                    return 0;
                }
            }
        }
    }
    updateLocalMinSeq(localMinSeq) {
        this.collabWindow.localMinSeq = localMinSeq;
        this.setMinSeq(Math.min(this.collabWindow.globalMinSeq, localMinSeq));
    }
    setMinSeq(minSeq) {
        if (minSeq > this.collabWindow.minSeq) {
            this.collabWindow.minSeq = minSeq;
            if (MergeTree.options.zamboniSegments) {
                this.zamboniSegments();
            }
        }
    }
    commitGlobalMin() {
        if (this.collabWindow.globalMinSeq !== undefined) {
            this.collabWindow.localMinSeq = this.collabWindow.globalMinSeq;
            this.setMinSeq(this.collabWindow.globalMinSeq);
        }
    }
    updateGlobalMinSeq(globalMinSeq) {
        if (this.collabWindow.localMinSeq === undefined) {
            this.setMinSeq(globalMinSeq);
        }
        else {
            this.collabWindow.globalMinSeq = globalMinSeq;
            this.setMinSeq(Math.min(globalMinSeq, this.collabWindow.localMinSeq));
        }
    }
    refPosToLocalPos(pos, refSeq, clientId) {
        let segoff = this.getContainingSegment(pos, refSeq, clientId);
        let localPos = segoff.offset + this.getOffset(segoff.segment, exports.UniversalSequenceNumber, this.collabWindow.clientId);
        return localPos;
    }
    getStackContext(startPos, clientId, rangeLabels) {
        let searchInfo = {
            mergeTree: this,
            stacks: Properties.createMap(),
            rangeLabels
        };
        this.search(startPos, exports.UniversalSequenceNumber, clientId, { leaf: recordRangeLeaf, shift: rangeShift }, searchInfo);
        return searchInfo.stacks;
    }
    // TODO: with annotation op change value
    cherryPickedUndo(undoInfo) {
        let segment = undoInfo.seg;
        // no branches 
        if (segment.removedSeq !== undefined) {
            segment.removedSeq = undefined;
            segment.removedClientId = undefined;
        }
        else {
            if (undoInfo.op === 1 /* REMOVE */) {
                segment.removedSeq = undoInfo.seq;
            }
            else {
                segment.removedSeq = exports.UnassignedSequenceNumber;
            }
            segment.removedClientId = this.collabWindow.clientId;
        }
        this.blockUpdatePathLengths(segment.parent, exports.UnassignedSequenceNumber, -1, true);
    }
    // TODO: filter function
    findTile(startPos, clientId, tileLabel, preceding = true) {
        let searchInfo = {
            mergeTree: this,
            preceding,
            tileLabel,
        };
        if (preceding) {
            this.search(startPos, exports.UniversalSequenceNumber, clientId, { leaf: recordTileStart, shift: tileShift }, searchInfo);
        }
        else {
            this.backwardSearch(startPos, exports.UniversalSequenceNumber, clientId, { leaf: recordTileStart, shift: tileShift }, searchInfo);
        }
        if (searchInfo.tileMarker) {
            let pos = this.getOffset(searchInfo.tileMarker, exports.UniversalSequenceNumber, clientId);
            return { tile: searchInfo.tileMarker, pos };
        }
    }
    search(pos, refSeq, clientId, actions, clientData) {
        return this.searchBlock(this.root, pos, 0, refSeq, clientId, actions, clientData);
    }
    searchBlock(block, pos, segpos, refSeq, clientId, actions, clientData) {
        let children = block.children;
        if (actions && actions.pre) {
            actions.pre(block, segpos, refSeq, clientId, undefined, undefined, clientData);
        }
        let contains = actions && actions.contains;
        for (let childIndex = 0; childIndex < block.childCount; childIndex++) {
            let child = children[childIndex];
            let len = this.nodeLength(child, refSeq, clientId);
            if (((!contains) && (pos < len)) || (contains && contains(child, pos, refSeq, clientId, undefined, undefined, clientData))) {
                // found entry containing pos
                if (!child.isLeaf()) {
                    return this.searchBlock(child, pos, segpos, refSeq, clientId, actions, clientData);
                }
                else {
                    if (actions && actions.leaf) {
                        actions.leaf(child, segpos, refSeq, clientId, pos, -1, clientData);
                    }
                    return child;
                }
            }
            else {
                if (actions && actions.shift) {
                    actions.shift(child, segpos, refSeq, clientId, pos, undefined, clientData);
                }
                pos -= len;
                segpos += len;
            }
        }
        if (actions && actions.post) {
            actions.post(block, segpos, refSeq, clientId, undefined, undefined, clientData);
        }
    }
    backwardSearch(pos, refSeq, clientId, actions, clientData) {
        return this.backwardSearchBlock(this.root, pos, this.getLength(refSeq, clientId), refSeq, clientId, actions, clientData);
    }
    backwardSearchBlock(block, pos, segEnd, refSeq, clientId, actions, clientData) {
        let children = block.children;
        if (actions && actions.pre) {
            actions.pre(block, segEnd, refSeq, clientId, undefined, undefined, clientData);
        }
        let contains = actions && actions.contains;
        for (let childIndex = block.childCount - 1; childIndex >= 0; childIndex--) {
            let child = children[childIndex];
            let len = this.nodeLength(child, refSeq, clientId);
            let segpos = segEnd - len;
            if (((!contains) && (pos >= segpos)) ||
                (contains && contains(child, pos, refSeq, clientId, undefined, undefined, clientData))) {
                // found entry containing pos
                if (!child.isLeaf()) {
                    return this.backwardSearchBlock(child, pos, segEnd, refSeq, clientId, actions, clientData);
                }
                else {
                    if (actions && actions.leaf) {
                        actions.leaf(child, segpos, refSeq, clientId, pos, -1, clientData);
                    }
                    return child;
                }
            }
            else {
                if (actions && actions.shift) {
                    actions.shift(child, segpos, refSeq, clientId, pos, undefined, clientData);
                }
                segEnd = segpos;
            }
        }
        if (actions && actions.post) {
            actions.post(block, segEnd, refSeq, clientId, undefined, undefined, clientData);
        }
    }
    updateRoot(splitNode, refSeq, clientId, seq) {
        if (splitNode !== undefined) {
            let newRoot = this.makeBlock(2);
            splitNode.parent = newRoot;
            this.root.parent = newRoot;
            newRoot.children[0] = this.root;
            newRoot.children[1] = splitNode;
            this.root = newRoot;
            this.nodeUpdateLengthNewStructure(this.root);
        }
    }
    /**
     * Assign sequence number to existing segment; update partial lengths to reflect the change
     * @param seq sequence number given by server to pending segment
     */
    ackPendingSegment(seq) {
        let pendingSegmentGroup = this.pendingSegments.dequeue();
        let nodesToUpdate = [];
        let clientId;
        let overwrite = false;
        if (pendingSegmentGroup !== undefined) {
            pendingSegmentGroup.segments.map((pendingSegment) => {
                if (pendingSegment.seq === exports.UnassignedSequenceNumber) {
                    pendingSegment.seq = seq;
                }
                else {
                    let segBranchId = this.getBranchId(pendingSegment.clientId);
                    let removalInfo = this.getRemovalInfo(this.localBranchId, segBranchId, pendingSegment);
                    if (removalInfo.removedSeq !== undefined) {
                        if (removalInfo.removedSeq != exports.UnassignedSequenceNumber) {
                            overwrite = true;
                            if (MergeTree.diagOverlappingRemove) {
                                console.log(`grump @seq ${seq} cli ${glc(this, this.collabWindow.clientId)} from ${pendingSegment.removedSeq} text ${pendingSegment.toString()}`);
                            }
                        }
                        else {
                            removalInfo.removedSeq = seq;
                        }
                    }
                }
                pendingSegment.segmentGroup = undefined;
                clientId = this.collabWindow.clientId;
                if (nodesToUpdate.indexOf(pendingSegment.parent) < 0) {
                    nodesToUpdate.push(pendingSegment.parent);
                }
            });
            for (let node of nodesToUpdate) {
                this.blockUpdatePathLengths(node, seq, clientId, overwrite);
                //nodeUpdatePathLengths(node, seq, clientId, true);
            }
        }
    }
    addToPendingList(segment, segmentGroup) {
        if (segmentGroup === undefined) {
            if (this.transactionSegmentGroup) {
                segmentGroup = this.transactionSegmentGroup;
            }
            else {
                segmentGroup = { segments: [] };
                this.pendingSegments.enqueue(segmentGroup);
            }
        }
        // TODO: share this group with UNDO
        segment.segmentGroup = segmentGroup;
        addToSegmentGroup(segment);
        return segmentGroup;
    }
    // assumes not collaborating for now
    appendSegment(segSpec, seq = exports.UniversalSequenceNumber) {
        let pos = this.root.cachedLength;
        if (segSpec.text) {
            this.insertText(pos, exports.UniversalSequenceNumber, exports.LocalClientId, seq, segSpec.text, segSpec.props);
        }
        else {
            // assume marker for now
            this.insertMarker(pos, exports.UniversalSequenceNumber, exports.LocalClientId, seq, segSpec.marker.behaviors, segSpec.props);
        }
    }
    getSegmentFromId(id) {
        return this.idToSegment[id];
    }
    insert(pos, refSeq, clientId, seq, segData, traverse) {
        this.ensureIntervalBoundary(pos, refSeq, clientId);
        //traceTraversal = true;
        let splitNode = traverse(this.root, pos, refSeq, clientId, seq, segData);
        //traceTraversal = false;
        this.updateRoot(splitNode, refSeq, clientId, seq);
    }
    insertMarker(pos, refSeq, clientId, seq, behaviors, props) {
        let marker = Marker.make(behaviors, props, seq, clientId);
        this.insert(pos, refSeq, clientId, seq, marker, (block, pos, refSeq, clientId, seq, marker) => this.blockInsert(block, pos, refSeq, clientId, seq, marker));
    }
    insertText(pos, refSeq, clientId, seq, text, props) {
        let newSegment = TextSegment.make(text, props, seq, clientId);
        // MergeTree.traceTraversal = true;
        this.insert(pos, refSeq, clientId, seq, text, (block, pos, refSeq, clientId, seq, text) => this.blockInsert(this.root, pos, refSeq, clientId, seq, newSegment));
        MergeTree.traceTraversal = false;
        if (this.collabWindow.collaborating && MergeTree.options.zamboniSegments &&
            (seq != exports.UnassignedSequenceNumber)) {
            this.zamboniSegments();
        }
    }
    blockInsert(block, pos, refSeq, clientId, seq, newSegment) {
        let segIsLocal = false;
        let checkSegmentIsLocal = (segment, pos, refSeq, clientId) => {
            if (segment.seq == exports.UnassignedSequenceNumber) {
                if (MergeTree.diagInsertTie) {
                    console.log(`@cli ${glc(this, this.collabWindow.clientId)}: promoting continue due to seq ${segment.seq} text ${segment.toString()} ref ${refSeq}`);
                }
                segIsLocal = true;
            }
            // only need to look at first segment that follows finished node
            return false;
        };
        let continueFrom = (node) => {
            segIsLocal = false;
            this.rightExcursion(node, checkSegmentIsLocal);
            if (MergeTree.diagInsertTie && segIsLocal && (newSegment.getType() === SegmentType.Text)) {
                let text = newSegment.toString();
                console.log(`@cli ${glc(this, this.collabWindow.clientId)}: attempting continue with seq ${seq} text ${text} ref ${refSeq}`);
            }
            return segIsLocal;
        };
        let onLeaf = (segment, pos) => {
            let saveIfLocal = (locSegment) => {
                // save segment so can assign sequence number when acked by server
                if (this.collabWindow.collaborating) {
                    if ((locSegment.seq == exports.UnassignedSequenceNumber) &&
                        (clientId == this.collabWindow.clientId)) {
                        this.addToPendingList(locSegment);
                    }
                    else if ((locSegment.seq >= this.collabWindow.minSeq) &&
                        MergeTree.options.zamboniSegments) {
                        this.addToLRUSet(locSegment, locSegment.seq);
                    }
                }
            };
            let segmentChanges = {};
            if (segment) {
                // insert before segment
                segmentChanges.replaceCurrent = newSegment;
                segmentChanges.next = segment;
            }
            else {
                segmentChanges.next = newSegment;
            }
            saveIfLocal(newSegment);
            return segmentChanges;
        };
        return this.insertingWalk(block, pos, refSeq, clientId, seq, newSegment.getType(), { leaf: onLeaf, continuePredicate: continueFrom });
    }
    ensureIntervalBoundary(pos, refSeq, clientId) {
        let splitNode = this.insertingWalk(this.root, pos, refSeq, clientId, exports.TreeMaintainanceSequenceNumber, SegmentType.Base, { leaf: this.splitLeafSegment });
        this.updateRoot(splitNode, refSeq, clientId, exports.TreeMaintainanceSequenceNumber);
    }
    // assume called only when pos == len
    breakTie(pos, len, seq, node, refSeq, clientId, segType) {
        if (node.isLeaf()) {
            let segment = node;
            // TODO: marker/marker tie break & collab markers
            if (pos == 0) {
                return segment.seq !== exports.UnassignedSequenceNumber;
            }
            else {
                return false;
            }
        }
        else {
            return true;
        }
    }
    // visit segments starting from node's right siblings, then up to node's parent
    leftExcursion(node, leafAction) {
        let actions = { leaf: leafAction };
        let go = true;
        let startNode = node;
        let parent = startNode.parent;
        while (parent) {
            let children = parent.children;
            let childIndex;
            let node;
            let matchedStart = false;
            for (childIndex = parent.childCount - 1; childIndex >= 0; childIndex--) {
                node = children[childIndex];
                if (matchedStart) {
                    if (!node.isLeaf()) {
                        let childBlock = node;
                        go = this.nodeMapReverse(childBlock, actions, 0, exports.UniversalSequenceNumber, this.collabWindow.clientId, undefined);
                    }
                    else {
                        go = leafAction(node, 0, exports.UniversalSequenceNumber, this.collabWindow.clientId, 0, 0);
                    }
                    if (!go) {
                        return;
                    }
                }
                else {
                    matchedStart = (startNode === node);
                }
            }
            startNode = parent;
            parent = parent.parent;
        }
    }
    // visit segments starting from node's right siblings, then up to node's parent
    rightExcursion(node, leafAction) {
        let actions = { leaf: leafAction };
        let go = true;
        let startNode = node;
        let parent = startNode.parent;
        while (parent) {
            let children = parent.children;
            let childIndex;
            let node;
            let matchedStart = false;
            for (childIndex = 0; childIndex < parent.childCount; childIndex++) {
                node = children[childIndex];
                if (matchedStart) {
                    if (!node.isLeaf()) {
                        let childBlock = node;
                        go = this.nodeMap(childBlock, actions, 0, exports.UniversalSequenceNumber, this.collabWindow.clientId, undefined);
                    }
                    else {
                        go = leafAction(node, 0, exports.UniversalSequenceNumber, this.collabWindow.clientId, 0, 0);
                    }
                    if (!go) {
                        return;
                    }
                }
                else {
                    matchedStart = (startNode === node);
                }
            }
            startNode = parent;
            parent = parent.parent;
        }
    }
    insertingWalk(block, pos, refSeq, clientId, seq, segType, context) {
        let children = block.children;
        let childIndex;
        let child;
        let newNode;
        let found = false;
        for (childIndex = 0; childIndex < block.childCount; childIndex++) {
            child = children[childIndex];
            let len = this.nodeLength(child, refSeq, clientId);
            if (MergeTree.traceTraversal) {
                let segInfo;
                if ((!child.isLeaf()) && this.collabWindow.collaborating) {
                    segInfo = `minLength: ${child.partialLengths.minLength}`;
                }
                else {
                    let segment = child;
                    segInfo = `cli: ${glc(this, segment.clientId)} seq: ${segment.seq} text: ${segment.toString()}`;
                    if (segment.removedSeq !== undefined) {
                        segInfo += ` rcli: ${glc(this, segment.removedClientId)} rseq: ${segment.removedSeq}`;
                    }
                }
                console.log(`@tcli: ${glc(this, this.collabWindow.clientId)} len: ${len} pos: ${pos} ` + segInfo);
            }
            if ((pos < len) || ((pos == len) && this.breakTie(pos, len, seq, child, refSeq, clientId, segType))) {
                // found entry containing pos
                found = true;
                if (!child.isLeaf()) {
                    let childBlock = child;
                    //internal node
                    let splitNode = this.insertingWalk(childBlock, pos, refSeq, clientId, seq, segType, context);
                    if (splitNode === undefined) {
                        this.blockUpdateLength(block, seq, clientId);
                        return undefined;
                    }
                    else if (splitNode == MergeTree.theUnfinishedNode) {
                        if (MergeTree.traceTraversal) {
                            console.log(`@cli ${glc(this, this.collabWindow.clientId)} unfinished bus pos ${pos} len ${len}`);
                        }
                        pos -= len; // act as if shifted segment
                        continue;
                    }
                    else {
                        newNode = splitNode;
                        childIndex++; // insert after
                    }
                }
                else {
                    if (MergeTree.traceTraversal) {
                        console.log(`@tcli: ${glc(this, this.collabWindow.clientId)}: leaf action`);
                    }
                    let segmentChanges = context.leaf(child, pos);
                    if (segmentChanges.replaceCurrent) {
                        block.children[childIndex] = segmentChanges.replaceCurrent;
                        segmentChanges.replaceCurrent.parent = block;
                    }
                    if (segmentChanges.next) {
                        newNode = segmentChanges.next;
                        childIndex++; // insert after
                    }
                    else {
                        // no change
                        return undefined;
                    }
                }
                break;
            }
            else {
                pos -= len;
            }
        }
        if (MergeTree.traceTraversal) {
            if ((!found) && (pos > 0)) {
                console.log(`inserting walk fell through pos ${pos} len: ${this.blockLength(this.root, refSeq, clientId)}`);
            }
        }
        if (!newNode) {
            if (pos == 0) {
                if ((seq != exports.UnassignedSequenceNumber) && context.continuePredicate &&
                    context.continuePredicate(block)) {
                    return MergeTree.theUnfinishedNode;
                }
                else {
                    if (MergeTree.traceTraversal) {
                        console.log(`@tcli: ${glc(this, this.collabWindow.clientId)}: leaf action pos 0`);
                    }
                    let segmentChanges = context.leaf(undefined, pos);
                    newNode = segmentChanges.next;
                    // assert segmentChanges.replaceCurrent === undefined
                }
            }
        }
        if (newNode) {
            for (let i = block.childCount; i > childIndex; i--) {
                block.children[i] = block.children[i - 1];
            }
            block.children[childIndex] = newNode;
            newNode.parent = block;
            block.childCount++;
            if (block.childCount < exports.MaxNodesInBlock) {
                this.blockUpdateLength(block, seq, clientId);
                return undefined;
            }
            else {
                return this.split(block);
            }
        }
        else {
            return undefined;
        }
    }
    split(node) {
        let halfCount = exports.MaxNodesInBlock / 2;
        let newNode = this.makeBlock(halfCount);
        node.childCount = halfCount;
        for (let i = 0; i < halfCount; i++) {
            newNode.children[i] = node.children[halfCount + i];
            node.children[halfCount + i] = undefined;
            newNode.children[i].parent = newNode;
        }
        this.nodeUpdateLengthNewStructure(node);
        this.nodeUpdateLengthNewStructure(newNode);
        return newNode;
    }
    addOverlappingClient(removalInfo, clientId) {
        if (!removalInfo.removedClientOverlap) {
            removalInfo.removedClientOverlap = [];
        }
        if (MergeTree.diagOverlappingRemove) {
            console.log(`added cli ${glc(this, clientId)} to rseq: ${removalInfo.removedSeq}`);
        }
        removalInfo.removedClientOverlap.push(clientId);
    }
    annotateRange(props, start, end, refSeq, clientId, seq, combiningOp) {
        this.ensureIntervalBoundary(start, refSeq, clientId);
        this.ensureIntervalBoundary(end, refSeq, clientId);
        let annotateSegment = (segment) => {
            let segType = segment.getType();
            if ((segType == SegmentType.Marker) || (segType == SegmentType.Text)) {
                let baseSeg = segment;
                baseSeg.addProperties(props, combiningOp);
            }
            return true;
        };
        this.mapRange({ leaf: annotateSegment }, refSeq, clientId, undefined, start, end);
    }
    markRangeRemoved(start, end, refSeq, clientId, seq) {
        this.ensureIntervalBoundary(start, refSeq, clientId);
        this.ensureIntervalBoundary(end, refSeq, clientId);
        let segmentGroup;
        let overwrite = false;
        let savedLocalRefs = [];
        let markRemoved = (segment, pos, start, end) => {
            let branchId = this.getBranchId(clientId);
            let segBranchId = this.getBranchId(segment.clientId);
            for (let brid = branchId; brid <= this.localBranchId; brid++) {
                let removalInfo = this.getRemovalInfo(brid, segBranchId, segment);
                if (removalInfo.removedSeq != undefined) {
                    if (MergeTree.diagOverlappingRemove) {
                        console.log(`yump @seq ${seq} cli ${glc(this, this.collabWindow.clientId)}: overlaps deleted segment ${removalInfo.removedSeq} text '${segment.toString()}'`);
                    }
                    overwrite = true;
                    if (removalInfo.removedSeq === exports.UnassignedSequenceNumber) {
                        // will only happen on local branch (brid === this.localBranchId)
                        // replace because comes later
                        removalInfo.removedClientId = clientId;
                        removalInfo.removedSeq = seq;
                        if (segment.segmentGroup) {
                            removeFromSegmentGroup(segment.segmentGroup, segment);
                        }
                        else {
                            console.log(`missing segment group for seq ${seq} ref seq ${refSeq}`);
                        }
                    }
                    else {
                        // do not replace earlier sequence number for remove
                        this.addOverlappingClient(removalInfo, clientId);
                    }
                }
                else {
                    removalInfo.removedClientId = clientId;
                    removalInfo.removedSeq = seq;
                    if (segment.localRefs && (brid === this.localBranchId)) {
                        savedLocalRefs.push(segment.localRefs);
                        segment.localRefs = undefined;
                    }
                }
            }
            // save segment so can assign removed sequence number when acked by server
            if (this.collabWindow.collaborating) {
                // use removal information 
                let removalInfo = this.getRemovalInfo(this.localBranchId, segBranchId, segment);
                if ((removalInfo.removedSeq === exports.UnassignedSequenceNumber) && (clientId === this.collabWindow.clientId)) {
                    segmentGroup = this.addToPendingList(segment, segmentGroup);
                }
                else {
                    if (MergeTree.options.zamboniSegments) {
                        this.addToLRUSet(segment, seq);
                    }
                }
                //console.log(`saved local removed seg with text: ${textSegment.text}`);
            }
            return true;
        };
        let afterMarkRemoved = (node, pos, start, end) => {
            if (overwrite) {
                this.nodeUpdateLengthNewStructure(node);
            }
            else {
                this.blockUpdateLength(node, seq, clientId);
            }
            return true;
        };
        // MergeTree.traceTraversal = true;
        this.mapRange({ leaf: markRemoved, post: afterMarkRemoved }, refSeq, clientId, undefined, start, end);
        if (savedLocalRefs.length > 0) {
            let afterSeg;
            for (let segSavedRefs of savedLocalRefs) {
                for (let localRef of segSavedRefs) {
                    if (localRef.slideOnRemove) {
                        if (!afterSeg) {
                            let afterSegOff = this.getContainingSegment(start, refSeq, clientId);
                            afterSeg = afterSegOff.segment;
                        }
                        localRef.segment = afterSeg;
                        localRef.offset = 0;
                        afterSeg.addLocalRef(localRef);
                    }
                }
            }
        }
        if (this.collabWindow.collaborating && (seq != exports.UnassignedSequenceNumber)) {
            if (MergeTree.options.zamboniSegments) {
                this.zamboniSegments();
            }
        }
        // MergeTree.traceTraversal = false;
    }
    removeRange(start, end, refSeq, clientId) {
        this.nodeRemoveRange(this.root, start, end, refSeq, clientId);
    }
    nodeRemoveRange(block, start, end, refSeq, clientId) {
        let children = block.children;
        let startIndex;
        if (start < 0) {
            startIndex = -1;
        }
        let endIndex = block.childCount;
        for (let childIndex = 0; childIndex < block.childCount; childIndex++) {
            let child = children[childIndex];
            let len = this.nodeLength(child, refSeq, clientId);
            if ((start >= 0) && (start < len)) {
                startIndex = childIndex;
                if (!child.isLeaf()) {
                    this.nodeRemoveRange(child, start, end, refSeq, clientId);
                }
                else {
                    let segment = child;
                    if (segment.removeRange(start, end)) {
                        startIndex--;
                    }
                }
            }
            // REVIEW: run this clause even if above clause runs
            if (end < len) {
                endIndex = childIndex;
                if (end > 0) {
                    if (endIndex > startIndex) {
                        if (!child.isLeaf()) {
                            this.nodeRemoveRange(child, start, end, refSeq, clientId);
                        }
                        else {
                            let segment = child;
                            if (segment.removeRange(0, end)) {
                                endIndex++;
                            }
                        }
                    }
                }
                break;
            }
            start -= len;
            end -= len;
        }
        let deleteCount = (endIndex - startIndex) - 1;
        let deleteStart = startIndex + 1;
        if (deleteCount > 0) {
            // delete nodes in middle of range
            let copyStart = deleteStart + deleteCount;
            let copyCount = block.childCount - copyStart;
            for (let j = 0; j < copyCount; j++) {
                children[deleteStart + j] = children[copyStart + j];
            }
            block.childCount -= deleteCount;
        }
        this.nodeUpdateLengthNewStructure(block);
    }
    nodeUpdateLengthNewStructure(node, recur = false) {
        this.blockUpdate(node);
        if (this.collabWindow.collaborating) {
            node.partialLengths = PartialSequenceLengths.combine(this, node, this.collabWindow, recur);
        }
    }
    blockUpdate(block) {
        let len = 0;
        let hierBlock;
        if (this.blockUpdateMarkers) {
            hierBlock = block.hierBlock();
            hierBlock.rightmostTiles = Properties.createMap();
            hierBlock.leftmostTiles = Properties.createMap();
            hierBlock.rangeStacks = {};
        }
        for (let i = 0; i < block.childCount; i++) {
            let child = block.children[i];
            len += nodeTotalLength(this, child);
            if (this.blockUpdateMarkers) {
                hierBlock.addNodeMarkers(this, child);
            }
            if (this.blockUpdateActions) {
                this.blockUpdateActions.child(block, i);
            }
        }
        block.cachedLength = len;
    }
    blockUpdatePathLengths(block, seq, clientId, newStructure = false) {
        while (block !== undefined) {
            if (newStructure) {
                this.nodeUpdateLengthNewStructure(block);
            }
            else {
                this.blockUpdateLength(block, seq, clientId);
            }
            block = block.parent;
        }
    }
    nodeCompareUpdateLength(node, seq, clientId) {
        this.blockUpdate(node);
        if (this.collabWindow.collaborating && (seq != exports.UnassignedSequenceNumber) && (seq != exports.TreeMaintainanceSequenceNumber)) {
            if (node.partialLengths !== undefined) {
                let bplStr = node.partialLengths.toString();
                node.partialLengths.update(this, node, seq, clientId, this.collabWindow);
                let tempPartialLengths = PartialSequenceLengths.combine(this, node, this.collabWindow);
                if (!tempPartialLengths.compare(node.partialLengths)) {
                    console.log(`partial sum update mismatch @cli ${glc(this, this.collabWindow.clientId)} seq ${seq} clientId ${glc(this, clientId)}`);
                    console.log(tempPartialLengths.toString());
                    console.log("b4 " + bplStr);
                    console.log(node.partialLengths.toString());
                }
            }
            else {
                node.partialLengths = PartialSequenceLengths.combine(this, node, this.collabWindow);
            }
        }
    }
    blockUpdateLength(node, seq, clientId) {
        this.blockUpdate(node);
        if (this.collabWindow.collaborating && (seq != exports.UnassignedSequenceNumber) && (seq != exports.TreeMaintainanceSequenceNumber)) {
            if (node.partialLengths !== undefined) {
                //nodeCompareUpdateLength(node, seq, clientId);
                if (MergeTree.options.incrementalUpdate) {
                    node.partialLengths.update(this, node, seq, clientId, this.collabWindow);
                }
                else {
                    node.partialLengths = PartialSequenceLengths.combine(this, node, this.collabWindow);
                }
            }
            else {
                node.partialLengths = PartialSequenceLengths.combine(this, node, this.collabWindow);
            }
        }
    }
    map(actions, refSeq, clientId, accum) {
        // TODO: optimize to avoid comparisons
        this.nodeMap(this.root, actions, 0, refSeq, clientId, accum);
    }
    mapRange(actions, refSeq, clientId, accum, start, end) {
        this.nodeMap(this.root, actions, 0, refSeq, clientId, accum, start, end);
    }
    rangeToString(start, end) {
        let strbuf = "";
        for (let childIndex = 0; childIndex < this.root.childCount; childIndex++) {
            let child = this.root.children[childIndex];
            if (!child.isLeaf()) {
                let block = child;
                let len = this.blockLength(block, exports.UniversalSequenceNumber, this.collabWindow.clientId);
                if ((start <= len) && (end > 0)) {
                    strbuf += this.nodeToString(block, strbuf, 0);
                }
                start -= len;
                end -= len;
            }
        }
        return strbuf;
    }
    nodeToString(block, strbuf, indentCount = 0) {
        strbuf += internedSpaces(indentCount);
        strbuf += `Node (len ${block.cachedLength}) p len (${block.parent ? block.parent.cachedLength : 0}) with ${block.childCount} live segments:\n`;
        if (this.blockUpdateMarkers) {
            strbuf += internedSpaces(indentCount);
            strbuf += block.hierToString(indentCount);
        }
        if (this.collabWindow.collaborating) {
            strbuf += internedSpaces(indentCount);
            strbuf += block.partialLengths.toString((id) => glc(this, id), indentCount) + '\n';
        }
        let children = block.children;
        for (let childIndex = 0; childIndex < block.childCount; childIndex++) {
            let child = children[childIndex];
            if (!child.isLeaf()) {
                strbuf = this.nodeToString(child, strbuf, indentCount + 4);
            }
            else {
                let segment = child;
                strbuf += internedSpaces(indentCount + 4);
                strbuf += `cli: ${glc(this, segment.clientId)} seq: ${segment.seq}`;
                let segBranchId = this.getBranchId(segment.clientId);
                let branchId = this.localBranchId;
                let removalInfo = this.getRemovalInfo(branchId, segBranchId, segment);
                if (removalInfo.removedSeq !== undefined) {
                    strbuf += ` rcli: ${glc(this, removalInfo.removedClientId)} rseq: ${removalInfo.removedSeq}`;
                }
                strbuf += "\n";
                strbuf += internedSpaces(indentCount + 4);
                strbuf += segment.toString();
                strbuf += "\n";
            }
        }
        return strbuf;
    }
    toString() {
        return this.nodeToString(this.root, "", 0);
    }
    incrementalBlockMap(stateStack) {
        while (!stateStack.empty()) {
            let state = stateStack.top();
            if (state.op != IncrementalExecOp.Go) {
                return;
            }
            if (state.childIndex == 0) {
                if (state.start === undefined) {
                    state.start = 0;
                }
                if (state.end === undefined) {
                    state.end = this.blockLength(state.block, state.refSeq, state.clientId);
                }
                if (state.actions.pre) {
                    state.actions.pre(state);
                }
            }
            if ((state.op == IncrementalExecOp.Go) && (state.childIndex < state.block.childCount)) {
                let child = state.block.children[state.childIndex];
                let len = this.nodeLength(child, state.refSeq, state.clientId);
                if (MergeTree.traceIncrTraversal) {
                    if (child.isLeaf()) {
                        console.log(`considering (r ${state.refSeq} c ${glc(this, state.clientId)}) seg with text ${child.text} len ${len} seq ${child.seq} rseq ${child.removedSeq} cli ${glc(this, child.clientId)}`);
                    }
                }
                if ((len > 0) && (state.start < len) && (state.end > 0)) {
                    if (!child.isLeaf()) {
                        let childState = new IncrementalMapState(child, state.actions, state.pos, state.refSeq, state.clientId, state.context, state.start, state.end, 0);
                        stateStack.push(childState);
                    }
                    else {
                        if (MergeTree.traceIncrTraversal) {
                            console.log(`action on seg with text ${child.text}`);
                        }
                        state.actions.leaf(child, state);
                    }
                }
                state.pos += len;
                state.start -= len;
                state.end -= len;
                state.childIndex++;
            }
            else {
                if (state.childIndex == state.block.childCount) {
                    if ((state.op == IncrementalExecOp.Go) && state.actions.post) {
                        state.actions.post(state);
                    }
                    stateStack.pop();
                }
            }
        }
    }
    nodeMap(node, actions, pos, refSeq, clientId, accum, start, end) {
        if (start === undefined) {
            start = 0;
        }
        if (end === undefined) {
            end = this.blockLength(node, refSeq, clientId);
        }
        let go = true;
        if (actions.pre) {
            go = actions.pre(node, pos, refSeq, clientId, start, end, accum);
        }
        let children = node.children;
        for (let childIndex = 0; childIndex < node.childCount; childIndex++) {
            let child = children[childIndex];
            let len = this.nodeLength(child, refSeq, clientId);
            if (MergeTree.traceTraversal) {
                let segInfo;
                if ((!child.isLeaf()) && this.collabWindow.collaborating) {
                    segInfo = `minLength: ${child.partialLengths.minLength}`;
                }
                else {
                    let segment = child;
                    segInfo = `cli: ${glc(this, segment.clientId)} seq: ${segment.seq} text: '${segment.toString()}'`;
                    if (segment.removedSeq !== undefined) {
                        segInfo += ` rcli: ${glc(this, segment.removedClientId)} rseq: ${segment.removedSeq}`;
                    }
                }
                console.log(`@tcli ${glc(this, this.collabWindow.clientId)}: map len: ${len} start: ${start} end: ${end} ` + segInfo);
            }
            let isLeaf = child.isLeaf();
            if (go && (end > 0) && (len > 0) && (start < len)) {
                // found entry containing pos
                if (!isLeaf) {
                    if (go) {
                        go = this.nodeMap(child, actions, pos, refSeq, clientId, accum, start, end);
                    }
                }
                else {
                    if (MergeTree.traceTraversal) {
                        console.log(`@tcli ${glc(this, this.collabWindow.clientId)}: map leaf action`);
                    }
                    go = actions.leaf(child, pos, refSeq, clientId, start, end, accum);
                }
            }
            if (!go) {
                break;
            }
            if (actions.shift) {
                actions.shift(child, pos, refSeq, clientId, start, end, accum);
            }
            pos += len;
            start -= len;
            end -= len;
        }
        if (go && actions.post) {
            go = actions.post(node, pos, refSeq, clientId, start, end, accum);
        }
        return go;
    }
    // straight call every segment; goes until leaf action returns false
    nodeMapReverse(block, actions, pos, refSeq, clientId, accum) {
        let go = true;
        let children = block.children;
        for (let childIndex = block.childCount - 1; childIndex >= 0; childIndex--) {
            let child = children[childIndex];
            let isLeaf = child.isLeaf();
            if (go) {
                // found entry containing pos
                if (!isLeaf) {
                    if (go) {
                        go = this.nodeMapReverse(child, actions, pos, refSeq, clientId, accum);
                    }
                }
                else {
                    go = actions.leaf(child, pos, refSeq, clientId, 0, 0, accum);
                }
            }
            if (!go) {
                break;
            }
        }
        return go;
    }
}
// must be an even number   
MergeTree.TextSegmentGranularity = 128;
MergeTree.zamboniSegmentsMaxCount = 2;
MergeTree.options = {
    incrementalUpdate: true,
    zamboniSegments: true,
    measureWindowTime: true,
};
MergeTree.searchChunkSize = 256;
MergeTree.traceAppend = false;
MergeTree.traceZRemove = false;
MergeTree.traceGatherText = false;
MergeTree.diagInsertTie = false;
MergeTree.skipLeftShift = true;
MergeTree.diagOverlappingRemove = false;
MergeTree.traceTraversal = false;
MergeTree.traceIncrTraversal = false;
MergeTree.theUnfinishedNode = { childCount: -1 };
exports.MergeTree = MergeTree;

}).call(this,require('_process'))

},{"../api-core":209,"./collections":238,"./ops":241,"./properties":242,"_process":180,"assert":3}],241:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// tslint:disable:no-bitwise
var MarkerBehaviors;
(function (MarkerBehaviors) {
    MarkerBehaviors[MarkerBehaviors["None"] = 0] = "None";
    MarkerBehaviors[MarkerBehaviors["Tile"] = 1] = "Tile";
    MarkerBehaviors[MarkerBehaviors["RangeBegin"] = 2] = "RangeBegin";
    MarkerBehaviors[MarkerBehaviors["RangeEnd"] = 4] = "RangeEnd";
    MarkerBehaviors[MarkerBehaviors["SlideOnRemove"] = 16] = "SlideOnRemove";
})(MarkerBehaviors = exports.MarkerBehaviors || (exports.MarkerBehaviors = {}));

},{}],242:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Collections = require("./collections");
// assume these are created with Object.create(null)
function combine(combiningInfo, currentValue, newValue) {
    if (currentValue === undefined) {
        currentValue = combiningInfo.defaultValue;
    }
    // fixed set of operations for now 
    switch (combiningInfo.name) {
        case "incr":
            currentValue += newValue;
            if (combiningInfo.minValue) {
                if (currentValue < combiningInfo.minValue) {
                    currentValue = combiningInfo.minValue;
                }
            }
            break;
    }
    return currentValue;
}
exports.combine = combine;
function matchProperties(a, b) {
    if (a) {
        if (!b) {
            return false;
        }
        else {
            // for now, straightforward; later use hashing
            for (let key in a) {
                if (b[key] === undefined) {
                    return false;
                }
                else if (b[key] !== a[key]) {
                    return false;
                }
            }
            for (let key in b) {
                if (a[key] === undefined) {
                    return false;
                }
            }
        }
    }
    else {
        if (b) {
            return false;
        }
    }
    return true;
}
exports.matchProperties = matchProperties;
function readContingentProperty(name, props, contingentProps) {
    let contingentPropList = contingentProps[name];
    if ((contingentPropList !== undefined) && (!contingentPropList.empty())) {
        return contingentPropList.last();
    }
    else {
        return props[name];
    }
}
exports.readContingentProperty = readContingentProperty;
function contingentExtend(contingentBase, base, extension, combiningOp) {
    if (extension !== undefined) {
        if ((typeof extension !== "object")) {
            console.log(`oh my ${extension}`);
        }
        for (let key in extension) {
            let v = extension[key];
            // TODO: consider some type constraints on ops
            let oldProp = readContingentProperty(key, base, contingentBase);
            let newProp;
            if (combiningOp) {
                newProp = combine(combiningOp, oldProp, v);
            }
            else {
                newProp = v;
            }
            if (contingentBase[key] === undefined) {
                contingentBase[key] = Collections.ListMakeHead();
            }
            contingentBase[key].enqueue(newProp);
        }
    }
    return base;
}
exports.contingentExtend = contingentExtend;
function extend(base, extension, combiningOp) {
    if (extension !== undefined) {
        if ((typeof extension !== "object")) {
            console.log(`oh my ${extension}`);
        }
        for (let key in extension) {
            let v = extension[key];
            if (v === null) {
                delete base[key];
            }
            else {
                // TODO: consider some type constraints on ops
                if (combiningOp && (combiningOp.name !== "rewrite")) {
                    base[key] = combine(combiningOp, base[key], v);
                }
                else {
                    base[key] = v;
                }
            }
        }
    }
    return base;
}
exports.extend = extend;
function extendIfUndefined(base, extension) {
    if (extension !== undefined) {
        if ((typeof extension !== "object")) {
            console.log(`oh my ${extension}`);
        }
        for (let key in extension) {
            if (base[key] === undefined) {
                base[key] = extension[key];
            }
        }
    }
    return base;
}
exports.extendIfUndefined = extendIfUndefined;
/** Create a MapLike with good performance. */
function createMap() {
    const map = Object.create(null); // tslint:disable-line:no-null-keyword
    // Using 'delete' on an object causes V8 to put the object in dictionary mode.
    // This disables creation of hidden classes, which are expensive when an object is
    // constantly changing shape.
    map["__"] = undefined;
    delete map["__"];
    return map;
}
exports.createMap = createMap;

},{"./collections":238}],243:[function(require,module,exports){
"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const performanceNow = require("performance-now");
const api = require("../api-core");
const core_utils_1 = require("../core-utils");
const MergeTree = require("./mergeTree");
const ops = require("./ops");
const Paparazzo = require("./snapshot");
class CollaboritiveStringExtension {
    constructor() {
        this.type = CollaboritiveStringExtension.Type;
    }
    load(document, id, sequenceNumber, services, version, headerOrigin, header) {
        let collaborativeString = new SharedString(document, id, sequenceNumber, services);
        collaborativeString.load(sequenceNumber, header, true, headerOrigin);
        return collaborativeString;
    }
    create(document, id, options) {
        let collaborativeString = new SharedString(document, id, 0);
        collaborativeString.load(0, null, false, document.id);
        return collaborativeString;
    }
}
CollaboritiveStringExtension.Type = "https://graph.microsoft.com/types/mergeTree";
exports.CollaboritiveStringExtension = CollaboritiveStringExtension;
function textsToSegments(texts) {
    let segments = [];
    for (let ptext of texts) {
        let segment;
        if (ptext.text !== undefined) {
            segment = MergeTree.TextSegment.make(ptext.text, ptext.props, MergeTree.UniversalSequenceNumber, MergeTree.LocalClientId);
        }
        else {
            // for now assume marker
            segment = MergeTree.Marker.make(ptext.marker.behaviors, ptext.props, MergeTree.UniversalSequenceNumber, MergeTree.LocalClientId);
        }
        segments.push(segment);
    }
    return segments;
}
class SharedString extends api.CollaborativeObject {
    constructor(document, id, sequenceNumber, services) {
        super(document, id, CollaboritiveStringExtension.Type, sequenceNumber, services);
        this.id = id;
        this.isLoaded = false;
        this.pendingMinSequenceNumber = 0;
        // Deferred that triggers once the object is loaded
        this.loadedDeferred = new core_utils_1.Deferred();
        this.client = new MergeTree.Client("", document.options);
    }
    get loaded() {
        return this.loadedDeferred.promise;
    }
    load(sequenceNumber, header, collaborative, originBranch) {
        return __awaiter(this, void 0, void 0, function* () {
            let chunk;
            console.log(`Async load ${this.id} - ${performanceNow()}`);
            if (header) {
                chunk = Paparazzo.Snapshot.processChunk(header);
                let segs = textsToSegments(chunk.segmentTexts);
                this.client.mergeTree.reloadFromSegments(segs);
                console.log(`Loading ${this.id} body - ${performanceNow()}`);
                chunk = yield Paparazzo.Snapshot.loadChunk(this.services, "body");
                console.log(`Loaded ${this.id} body - ${performanceNow()}`);
                for (let segSpec of chunk.segmentTexts) {
                    this.client.mergeTree.appendSegment(segSpec);
                }
            }
            else {
                chunk = Paparazzo.Snapshot.EmptyChunk;
            }
            // This should happen if we have collab services
            assert.equal(sequenceNumber, chunk.chunkSequenceNumber);
            if (collaborative) {
                console.log(`Start ${this.id} collab - ${performanceNow()}`);
                // TODO currently only assumes two levels of branching
                const branchId = originBranch === this.document.id ? 0 : 1;
                this.client.startCollaboration(this.document.clientId, sequenceNumber, branchId);
            }
            console.log(`Apply ${this.id} pending - ${performanceNow()}`);
            this.applyPending();
            console.log(`Load ${this.id} finished - ${performanceNow()}`);
            this.loadFinished(chunk);
        });
    }
    insertMarker(pos, behaviors, props) {
        const insertMessage = {
            marker: { behaviors },
            pos1: pos,
            props,
            type: 0 /* INSERT */,
        };
        this.client.insertMarkerLocal(pos, behaviors, props);
        this.submitLocalOperation(insertMessage);
    }
    insertText(text, pos, props) {
        const insertMessage = {
            pos1: pos,
            props,
            type: 0 /* INSERT */,
            text,
        };
        this.client.insertTextLocal(text, pos, props);
        this.submitLocalOperation(insertMessage);
    }
    removeText(start, end) {
        const removeMessage = {
            pos1: start,
            pos2: end,
            type: 1 /* REMOVE */,
        };
        this.client.removeSegmentLocal(start, end);
        this.submitLocalOperation(removeMessage);
    }
    annotateRangeFromPast(props, start, end, fromSeq) {
        let ranges = this.client.mergeTree.tardisRange(start, end, fromSeq, this.client.getCurrentSeq(), this.client.getClientId());
        ranges.map((range) => {
            this.annotateRange(props, range.start, range.end);
        });
    }
    transaction(groupOp) {
        this.client.localTransaction(groupOp);
        this.submitLocalOperation(groupOp);
    }
    annotateRange(props, start, end, op) {
        let annotateMessage = {
            pos1: start,
            pos2: end,
            props,
            type: 2 /* ANNOTATE */,
        };
        if (op) {
            annotateMessage.combiningOp = op;
        }
        this.client.annotateSegmentLocal(props, start, end, op);
        this.submitLocalOperation(annotateMessage);
    }
    setLocalMinSeq(lmseq) {
        this.client.mergeTree.updateLocalMinSeq(lmseq);
    }
    snapshot() {
        this.client.mergeTree.commitGlobalMin();
        let snap = new Paparazzo.Snapshot(this.client.mergeTree);
        snap.extractSync();
        return snap.emit();
    }
    transform(message, toSequenceNumber) {
        if (message.contents) {
            this.client.transform(message, toSequenceNumber);
        }
        message.referenceSequenceNumber = toSequenceNumber;
        return message;
    }
    processCore(message) {
        if (!this.isLoaded) {
            this.client.enqueueMsg(message);
            return;
        }
        this.applyMessage(message);
    }
    processMinSequenceNumberChanged(value) {
        // Apply directly once loaded - otherwise track so we can update later
        if (this.isLoaded) {
            this.client.updateMinSeq(value);
        }
        else {
            this.pendingMinSequenceNumber = value;
        }
    }
    attachCore() {
        this.client.startCollaboration(this.document.clientId, 0);
    }
    loadFinished(chunk) {
        this.isLoaded = true;
        this.loadedDeferred.resolve();
        this.events.emit("loadFinished", chunk, true);
    }
    applyPending() {
        while (this.client.hasMessages()) {
            const message = this.client.dequeueMsg();
            this.applyMessage(message);
        }
        // Update the MSN if larger than the set value
        if (this.pendingMinSequenceNumber > this.client.mergeTree.getCollabWindow().minSeq) {
            this.client.updateMinSeq(this.pendingMinSequenceNumber);
        }
    }
    applyMessage(message) {
        this.events.emit("pre-op", message);
        this.client.applyMsg(message);
        this.events.emit("op", message);
    }
}
exports.SharedString = SharedString;

},{"../api-core":209,"../core-utils":222,"./mergeTree":240,"./ops":241,"./snapshot":244,"assert":3,"performance-now":179}],244:[function(require,module,exports){
(function (Buffer){
"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const API = require("../api-core");
const Collections = require("./collections");
const MergeTree = require("./mergeTree");
class Snapshot {
    constructor(mergeTree, filename, onCompletion) {
        this.mergeTree = mergeTree;
        this.filename = filename;
        this.onCompletion = onCompletion;
        this.verify = false;
        this.segmentsTotalLengthChars = 0;
    }
    start() {
        fs.open(this.filename, 'w', (err, fd) => {
            // TODO: process err
            this.onOpen(fd);
        });
    }
    getCharLengthSegs(alltexts, approxCharLength, startIndex = 0) {
        //console.log(`start index ${startIndex}`);
        let texts = [];
        let lengthChars = 0;
        let segCount = 0;
        while ((lengthChars < approxCharLength) && ((startIndex + segCount) < alltexts.length)) {
            let ptext = alltexts[startIndex + segCount];
            segCount++;
            texts.push(ptext);
            if (ptext.text != undefined) {
                lengthChars += ptext.text.length;
            }
        }
        return {
            chunkStartSegmentIndex: startIndex,
            chunkSegmentCount: segCount,
            chunkLengthChars: lengthChars,
            totalLengthChars: this.header.segmentsTotalLength,
            totalSegmentCount: alltexts.length,
            chunkSequenceNumber: this.header.seq,
            segmentTexts: texts
        };
    }
    emit() {
        let chunk1 = this.getCharLengthSegs(this.texts, 10000);
        let chunk2 = this.getCharLengthSegs(this.texts, chunk1.totalLengthChars, chunk1.chunkSegmentCount);
        const tree = {
            entries: [
                {
                    path: "header",
                    type: API.TreeEntry[API.TreeEntry.Blob],
                    value: {
                        contents: JSON.stringify(chunk1),
                        encoding: "utf-8",
                    },
                },
                {
                    path: "body",
                    type: API.TreeEntry[API.TreeEntry.Blob],
                    value: {
                        contents: JSON.stringify(chunk2),
                        encoding: "utf-8",
                    },
                },
            ],
        };
        return tree;
    }
    extractSync() {
        let collabWindow = this.mergeTree.getCollabWindow();
        this.seq = collabWindow.minSeq;
        this.header = {
            segmentsTotalLength: this.mergeTree.getLength(this.mergeTree.collabWindow.minSeq, MergeTree.NonCollabClient),
            seq: this.mergeTree.collabWindow.minSeq,
        };
        let texts = [];
        let extractSegment = (segment, pos, refSeq, clientId, start, end) => {
            if ((segment.seq != MergeTree.UnassignedSequenceNumber) && (segment.seq <= this.seq) &&
                ((segment.removedSeq === undefined) || (segment.removedSeq == MergeTree.UnassignedSequenceNumber) ||
                    (segment.removedSeq > this.seq))) {
                switch (segment.getType()) {
                    case MergeTree.SegmentType.Text:
                        let textSegment = segment;
                        texts.push({ props: textSegment.properties, text: textSegment.text });
                        break;
                    case MergeTree.SegmentType.Marker:
                        // console.log("got here");
                        let markerSeg = segment;
                        texts.push({
                            props: markerSeg.properties,
                            marker: { behaviors: markerSeg.behaviors },
                        });
                        break;
                }
            }
            return true;
        };
        this.mergeTree.map({ leaf: extractSegment }, this.seq, MergeTree.NonCollabClient);
        this.texts = texts;
        return texts;
    }
    static loadChunk(services, path) {
        return __awaiter(this, void 0, void 0, function* () {
            let chunkAsString = yield services.objectStorage.read(path);
            return Snapshot.processChunk(chunkAsString);
        });
    }
    static processChunk(chunk) {
        return JSON.parse(Buffer.from(chunk, "base64").toString("utf-8"));
    }
    static loadSync(filename) {
        let segs = [];
        let buf = new Buffer(Snapshot.SnapshotHeaderSize);
        let fd = fs.openSync(filename, 'r');
        let expectedBytes = Snapshot.SnapshotHeaderSize;
        let actualBytes = fs.readSync(fd, buf, 0, expectedBytes, 0);
        if (actualBytes != expectedBytes) {
            console.log(`actual bytes read ${actualBytes} expected ${expectedBytes}`);
        }
        let offset = 0;
        let chunkCount = buf.readUInt32BE(offset);
        // let segmentsTotalLength = buf.readUInt32BE(offset + 4);
        // let indexOffset = buf.readUInt32BE(offset + 8);
        // let segmentsOffset = buf.readUInt32BE(offset + 12);
        // let seq = buf.readUInt32BE(offset + 16);
        let position = actualBytes;
        buf = new Buffer(Snapshot.SnapChunkMaxSize);
        let readChunk = () => {
            actualBytes = fs.readSync(fd, buf, 0, 4, position);
            let lengthBytes = buf.readUInt32BE(0);
            actualBytes = fs.readSync(fd, buf, 4, lengthBytes - 4, position + 4);
            let remainingBytes = actualBytes;
            let offset = 4;
            while (remainingBytes > 0) {
                let prevOffset = offset;
                let segmentLengthBytes = buf.readUInt32BE(offset);
                offset += 4;
                let text = buf.toString('utf8', offset, offset + segmentLengthBytes);
                offset += segmentLengthBytes;
                segs.push(new MergeTree.TextSegment(text, MergeTree.UniversalSequenceNumber, MergeTree.LocalClientId));
                remainingBytes -= (offset - prevOffset);
            }
            position += (actualBytes + 4);
        };
        for (let i = 0; i < chunkCount; i++) {
            readChunk();
        }
        fs.closeSync(fd);
        return segs;
    }
    onOpen(fd) {
        let collabWindow = this.mergeTree.getCollabWindow();
        this.fileDesriptor = fd;
        this.seq = collabWindow.minSeq;
        this.index = [{
                position: Snapshot.SnapshotHeaderSize,
                lengthChars: 0,
                lengthBytes: Snapshot.ChunkHeaderSize,
            }];
        this.stateStack = new Collections.Stack();
        if (this.verify) {
            this.writtenText = this.mergeTree.getText(this.seq, MergeTree.NonCollabClient);
        }
        let initialState = new MergeTree.IncrementalMapState(this.mergeTree.root, { leaf: (segment, state) => { this.emitSegment(segment, state); } }, 0, this.seq, MergeTree.NonCollabClient, this, 0, this.mergeTree.getLength(this.seq, MergeTree.NonCollabClient), 0);
        this.stateStack.push(initialState);
        this.step();
    }
    // TODO: generalize beyond strings
    emitSegment(segment, state) {
        if ((segment.seq != MergeTree.UnassignedSequenceNumber) && (segment.seq <= this.seq) &&
            (segment.getType() == MergeTree.SegmentType.Text)) {
            if ((segment.removedSeq === undefined) ||
                (segment.removedSeq == MergeTree.UnassignedSequenceNumber) ||
                (segment.removedSeq > this.seq)) {
                let textSegment = segment;
                let chunk = this.index[this.index.length - 1];
                let savedSegmentLength = Snapshot.SegmentLengthSize + Buffer.byteLength(textSegment.text, 'utf8');
                // TODO: get length as UTF8 encoded
                if ((chunk.lengthBytes + savedSegmentLength) > Snapshot.SnapChunkMaxSize) {
                    let newChunk = {
                        position: chunk.position + chunk.lengthBytes,
                        lengthBytes: Snapshot.ChunkHeaderSize,
                        lengthChars: 0
                    };
                    this.index.push(newChunk);
                    chunk.buffer = this.buffer;
                    this.pendingChunk = chunk;
                    chunk = newChunk;
                    this.buffer = undefined;
                }
                if (this.buffer === undefined) {
                    this.buffer = new Buffer(Snapshot.SnapChunkMaxSize);
                    this.buffer.fill(0);
                }
                chunk.lengthChars += textSegment.text.length;
                this.segmentsTotalLengthChars += textSegment.text.length;
                //            console.log(`seg ${textSegment.seq} text ${textSegment.text}`);
                chunk.lengthBytes = this.buffer.writeUInt32BE(savedSegmentLength - 4, chunk.lengthBytes);
                chunk.lengthBytes += this.buffer.write(textSegment.text, chunk.lengthBytes);
                if (this.pendingChunk) {
                    state.op = MergeTree.IncrementalExecOp.Yield;
                }
            }
        }
    }
    close(verify = false) {
        if (verify) {
            fs.close(this.fileDesriptor, (err) => { this.verifyFile(); });
        }
        else {
            fs.close(this.fileDesriptor, (err) => { this.onCompletion(); });
        }
    }
    verifyReadU32(buf, offset, u32) {
        let ru32 = buf.readUInt32BE(offset);
        if (ru32 != u32) {
            console.log(`uint32 mismatch offset ${offset} ${u32} vs. ${ru32}`);
        }
        return ru32;
    }
    verifyFile() {
        let buf = new Buffer(Snapshot.SnapChunkMaxSize);
        let fd = fs.openSync(this.filename, 'r');
        let expectedBytes = Snapshot.SnapshotHeaderSize;
        let actualBytes = fs.readSync(fd, buf, 0, expectedBytes, 0);
        if (actualBytes != expectedBytes) {
            console.log(`actual bytes read ${actualBytes} expected ${expectedBytes}`);
        }
        this.verifyReadU32(buf, 0, this.header.chunkCount);
        this.verifyReadU32(buf, 4, this.header.segmentsTotalLength);
        this.verifyReadU32(buf, 8, this.header.indexOffset);
        this.verifyReadU32(buf, 12, this.header.segmentsOffset);
        this.verifyReadU32(buf, 16, this.header.seq);
        let savedPositions = [];
        let position = actualBytes;
        let mergeTree = new MergeTree.MergeTree("");
        let readChunk = (chunk) => {
            expectedBytes = chunk.lengthBytes;
            savedPositions.push(position);
            actualBytes = fs.readSync(fd, buf, 0, chunk.lengthBytes, position);
            this.verifyReadU32(buf, 0, chunk.lengthBytes);
            if (actualBytes != expectedBytes) {
                console.log(`actual bytes read ${actualBytes} expected ${expectedBytes}`);
            }
            let remainingBytes = actualBytes - 4;
            let offset = 4;
            while (remainingBytes > 0) {
                let prevOffset = offset;
                let segmentLengthBytes = buf.readUInt32BE(offset);
                offset += 4;
                let text = buf.toString('utf8', offset, offset + segmentLengthBytes);
                offset += segmentLengthBytes;
                mergeTree.appendSegment({ text: text });
                remainingBytes -= (offset - prevOffset);
            }
            position += actualBytes;
        };
        for (let chunk of this.index) {
            readChunk(chunk);
        }
        let readText = mergeTree.getText(MergeTree.UniversalSequenceNumber, MergeTree.NonCollabClient);
        if (readText != this.writtenText) {
            console.log(`text mismatch in file verification seq ${this.seq}`);
            console.log(readText);
            console.log(this.writtenText);
            console.log(mergeTree.toString());
            console.log(this.mergeTree.toString());
        }
        let indexLength = this.header.chunkCount * Snapshot.IndexEntrySize;
        fs.readSync(fd, buf, 0, indexLength, this.header.indexOffset);
        let offset = 0;
        for (let i = 0, len = this.index.length; i < len; i++) {
            let chunk = this.index[i];
            if (savedPositions[i] != chunk.position) {
                console.log(`read logic mismatch chunk pos ${savedPositions[i]} ix ${chunk.position}`);
            }
            this.verifyReadU32(buf, offset, savedPositions[i]);
            this.verifyReadU32(buf, offset + 4, chunk.lengthBytes);
            this.verifyReadU32(buf, offset + 8, chunk.lengthChars);
            offset += Snapshot.IndexEntrySize;
        }
        fs.close(fd, (err) => { this.onCompletion(); });
    }
    writeIndexAndClose(indexPosition) {
        let indexSize = Snapshot.IndexEntrySize * this.index.length;
        let indexBuf = new Buffer(indexSize);
        let offset = 0;
        for (let i = 0; i < this.index.length; i++) {
            let chunk = this.index[i];
            offset = indexBuf.writeUInt32BE(chunk.position, offset);
            offset = indexBuf.writeUInt32BE(chunk.lengthBytes, offset);
            offset = indexBuf.writeUInt32BE(chunk.lengthChars, offset);
        }
        if (this.verify) {
            console.log(`index position ${indexPosition.toString(16)} #chunks ${this.index.length}`);
        }
        fs.write(this.fileDesriptor, indexBuf, 0, indexSize, indexPosition, (err, written, buf) => {
            // TODO: process err and check written == buffer size
            this.close(this.verify);
        });
    }
    writeHeader() {
        // header information
        let chunkCount = this.index.length;
        let segmentsSize = 0;
        for (let indexEntry of this.index) {
            segmentsSize += indexEntry.lengthBytes;
        }
        let overhang = segmentsSize % Snapshot.IndexAlignSize;
        if (overhang > 0) {
            segmentsSize += (Snapshot.IndexAlignSize - overhang);
        }
        let segmentsOffset = Snapshot.SnapshotHeaderSize;
        let indexOffset = segmentsOffset + segmentsSize;
        // for verification
        this.header = {
            chunkCount: chunkCount,
            segmentsTotalLength: this.segmentsTotalLengthChars,
            indexOffset: indexOffset,
            segmentsOffset: segmentsOffset,
            seq: this.seq
        };
        // write header
        let headerBuf = new Buffer(Snapshot.SnapshotHeaderSize);
        let offset = 0;
        offset = headerBuf.writeUInt32BE(chunkCount, offset);
        offset = headerBuf.writeUInt32BE(this.segmentsTotalLengthChars, offset);
        offset = headerBuf.writeUInt32BE(indexOffset, offset);
        offset = headerBuf.writeUInt32BE(segmentsOffset, offset);
        offset = headerBuf.writeUInt32BE(this.seq, offset);
        // assert offset == segmentsOffset
        fs.write(this.fileDesriptor, headerBuf, 0, Snapshot.SnapshotHeaderSize, 0, (err, written, buf) => {
            // TODO: process err and check written == buffer size
            this.writeIndexAndClose(indexOffset);
        });
    }
    writeLastChunk() {
        let chunk = this.index[this.index.length - 1];
        if (chunk.lengthBytes > 0) {
            this.buffer.writeUInt32BE(chunk.lengthBytes, 0);
            fs.write(this.fileDesriptor, this.buffer, 0, chunk.lengthBytes, chunk.position, (err, written, buf) => {
                // TODO: process err and check written == buffer size
                this.writeHeader();
            });
        }
    }
    step() {
        this.mergeTree.incrementalBlockMap(this.stateStack);
        if (this.stateStack.empty()) {
            this.writeLastChunk();
        }
        else {
            let state = this.stateStack.top();
            if (state.op == MergeTree.IncrementalExecOp.Yield) {
                state.op = MergeTree.IncrementalExecOp.Go;
                if (this.pendingChunk) {
                    let chunk = this.pendingChunk;
                    let buf = chunk.buffer;
                    buf.writeUInt32BE(chunk.lengthBytes, 0);
                    let pos = chunk.position;
                    this.pendingChunk = undefined;
                    fs.write(this.fileDesriptor, buf, 0, chunk.lengthBytes, pos, (err, written, buf) => {
                        // TODO: process err and check written == buffer size
                        this.step();
                    });
                }
            }
        }
    }
}
Snapshot.SnapChunkMaxSize = 0x20000;
Snapshot.SegmentLengthSize = 0x4;
Snapshot.SnapshotHeaderSize = 0x14;
Snapshot.IndexEntrySize = 0xC;
Snapshot.IndexAlignSize = 0x8;
Snapshot.ChunkHeaderSize = 0x4;
Snapshot.EmptyChunk = {
    chunkStartSegmentIndex: -1,
    chunkSegmentCount: -1,
    chunkLengthChars: -1,
    totalLengthChars: -1,
    totalSegmentCount: -1,
    chunkSequenceNumber: 0,
    segmentTexts: [],
};
exports.Snapshot = Snapshot;

}).call(this,require("buffer").Buffer)

},{"../api-core":209,"./collections":238,"./mergeTree":240,"buffer":19,"fs":18}],245:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const MergeTree = require("./mergeTree");
const ops = require("./ops");
// tslint:disable
function loadTextFromFile(filename, mergeTree, segLimit = 0) {
    let content = fs.readFileSync(filename, "utf8");
    return loadText(content, mergeTree, segLimit);
}
exports.loadTextFromFile = loadTextFromFile;
function loadTextFromFileWithMarkers(filename, mergeTree, segLimit = 0) {
    let content = fs.readFileSync(filename, "utf8");
    return loadText(content, mergeTree, segLimit, true);
}
exports.loadTextFromFileWithMarkers = loadTextFromFileWithMarkers;
function loadSegments(content, segLimit, markers = false) {
    content = content.replace(/^\uFEFF/, "");
    const seq = MergeTree.UniversalSequenceNumber;
    const cli = MergeTree.LocalClientId;
    let withProps = true;
    let paragraphs = content.split('\r\n');
    for (let i = 0, len = paragraphs.length; i < len; i++) {
        paragraphs[i] = paragraphs[i].replace(/\r\n/g, ' ').replace(/\u201c|\u201d/g, '"').replace(/\u2019/g, "'");
        if (!markers) {
            paragraphs[i] += "\n";
        }
    }
    let segments = [];
    for (let paragraph of paragraphs) {
        let pgMarker;
        if (markers) {
            pgMarker = MergeTree.Marker.make(ops.MarkerBehaviors.Tile, { [MergeTree.reservedTileLabelsKey]: ["pg"] }, seq, cli);
        }
        if (withProps) {
            if (paragraph.indexOf("Chapter") >= 0) {
                if (markers) {
                    pgMarker.addProperties({ header: 2 });
                    segments.push(new MergeTree.TextSegment(paragraph, seq, cli));
                }
                else {
                    segments.push(MergeTree.TextSegment.make(paragraph, { fontSize: "140%", lineHeight: "150%" }, seq, cli));
                }
            }
            else {
                let emphStrings = paragraph.split("_");
                for (let i = 0, len = emphStrings.length; i < len; i++) {
                    if (i & 1) {
                        if (emphStrings[i].length > 0) {
                            segments.push(MergeTree.TextSegment.make(emphStrings[i], { fontStyle: "italic" }, seq, cli));
                        }
                    }
                    else {
                        if (emphStrings[i].length > 0) {
                            segments.push(new MergeTree.TextSegment(emphStrings[i], seq, cli));
                        }
                    }
                }
            }
        }
        else {
            segments.push(new MergeTree.TextSegment(paragraph, seq, cli));
        }
        if (markers) {
            segments.push(pgMarker);
        }
    }
    if (segLimit > 0) {
        segments.length = segLimit;
    }
    return segments;
}
exports.loadSegments = loadSegments;
function loadText(content, mergeTree, segLimit, markers = false) {
    const segments = loadSegments(content, segLimit, markers);
    mergeTree.reloadFromSegments(segments);
    // console.log(`Number of Segments: ${segments.length}`);
    // console.log(`Height: ${mergeTree.getStats().maxHeight}`);
    //console.log(segTree.toString());
    return mergeTree;
}
exports.loadText = loadText;

},{"./mergeTree":240,"./ops":241,"fs":18}],246:[function(require,module,exports){
"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const querystring = require("querystring");
const request = require("request");
/**
 * Implementation of the IHistorian interface that calls out to a REST interface
 */
class Historian {
    constructor(endpoint) {
        this.endpoint = endpoint;
    }
    getHeader(repo, sha) {
        return this.get(`/repos/${encodeURIComponent(repo)}/headers/${encodeURIComponent(sha)}`);
    }
    getBlob(repo, sha) {
        return this.get(`/repos/${encodeURIComponent(repo)}/git/blobs/${encodeURIComponent(sha)}`);
    }
    createBlob(repo, blob) {
        return this.post(`/repos/${encodeURIComponent(repo)}/git/blobs`, blob);
    }
    getContent(repo, path, ref) {
        const query = querystring.stringify({ ref });
        return this.get(`/repos/${encodeURIComponent(repo)}/contents/${path}?${query}`);
    }
    getCommits(repo, sha, count) {
        const query = querystring.stringify({
            count,
            sha,
        });
        return this.get(`/repos/${encodeURIComponent(repo)}/commits?${query}`)
            .catch((error) => error === 400 ? [] : Promise.reject(error));
    }
    getCommit(repo, sha) {
        return this.get(`/repos/${encodeURIComponent(repo)}/git/commits/${encodeURIComponent(sha)}`);
    }
    createCommit(repo, commit) {
        return this.post(`/repos/${encodeURIComponent(repo)}/git/commits`, commit);
    }
    getRefs(repo) {
        return this.get(`/repos/${encodeURIComponent(repo)}/git/refs`);
    }
    getRef(repo, ref) {
        return this.get(`/repos/${encodeURIComponent(repo)}/git/refs/${ref}`);
    }
    createRef(repo, params) {
        return this.post(`/repos/${encodeURIComponent(repo)}/git/refs`, params);
    }
    updateRef(repo, ref, params) {
        return this.patch(`/repos/${encodeURIComponent(repo)}/git/refs/${ref}`, params);
    }
    deleteRef(repo, ref) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.delete(`/repos/${encodeURIComponent(repo)}/git/refs/${ref}`);
        });
    }
    createRepo(repo) {
        return this.post(`/repos`, repo);
    }
    getRepo(repo) {
        return this.get(`/repos/${encodeURIComponent(repo)}`)
            .catch((error) => error === 400 ? null : Promise.resolve(error));
    }
    createTag(repo, tag) {
        return this.post(`/repos/${encodeURIComponent(repo)}/git/tags`, tag);
    }
    getTag(repo, tag) {
        return this.get(`/repos/${encodeURIComponent(repo)}/git/tags/${tag}`);
    }
    createTree(repo, tree) {
        return this.post(`/repos/${encodeURIComponent(repo)}/git/trees`, tree);
    }
    getTree(repo, sha, recursive) {
        const query = querystring.stringify({ recursive: recursive ? 1 : 0 });
        return this.get(`/repos/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(sha)}?${query}`);
    }
    get(url) {
        const options = {
            json: true,
            method: "GET",
            url: `${this.endpoint}${url}`,
        };
        return this.request(options, 200);
    }
    post(url, requestBody) {
        const options = {
            body: requestBody,
            headers: {
                "Content-Type": "application/json",
            },
            json: true,
            method: "POST",
            url: `${this.endpoint}${url}`,
        };
        return this.request(options, 201);
    }
    delete(url) {
        const options = {
            method: "DELETE",
            url: `${this.endpoint}${url}`,
        };
        return this.request(options, 204);
    }
    patch(url, requestBody) {
        const options = {
            body: requestBody,
            headers: {
                "Content-Type": "application/json",
            },
            json: true,
            method: "PATCH",
            url: `${this.endpoint}${url}`,
        };
        return this.request(options, 200);
    }
    request(options, statusCode) {
        return new Promise((resolve, reject) => {
            request(options, (error, response, body) => {
                if (error) {
                    return reject(error);
                }
                else if (response.statusCode !== statusCode) {
                    return reject(response.statusCode);
                }
                else {
                    return resolve(response.body);
                }
            });
        });
    }
}
exports.Historian = Historian;

},{"querystring":183,"request":201}],247:[function(require,module,exports){
"use strict";
function __export(m) {
    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
}
Object.defineProperty(exports, "__esModule", { value: true });
__export(require("./historian"));

},{"./historian":246}],248:[function(require,module,exports){
"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Document access to underlying storage
 */
class DocumentStorageService {
    constructor(id, version, storage) {
        this.id = id;
        this.storage = storage;
    }
    read(sha) {
        return this.storage.read(sha);
    }
    write(tree, message) {
        return this.storage.write(this.id, tree, message);
    }
}
exports.DocumentStorageService = DocumentStorageService;
/**
 * Client side access to object storage.
 */
class BlobStorageService {
    constructor(manager) {
        this.manager = manager;
    }
    getHeader(id, version) {
        return this.manager.getHeader(id, version ? version.sha : null);
    }
    read(sha) {
        return __awaiter(this, void 0, void 0, function* () {
            const value = yield this.manager.getBlob(sha);
            return value.content;
        });
    }
    // TODO (mdaumi): Need to implement some kind of auth mechanism here.
    write(id, tree, message) {
        return this.manager.write(id, tree, message);
    }
}
exports.BlobStorageService = BlobStorageService;

},{}],249:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const registerDebug = require("debug");
exports.debug = registerDebug("routerlicious:socket-storage");

},{"debug":23}],250:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const querystring = require("querystring");
const request = require("request");
/**
 * Storage service limited to only being able to fetch documents for a specific document
 */
class DocumentDeltaStorageService {
    constructor(id, storageService) {
        this.id = id;
        this.storageService = storageService;
    }
    get(from, to) {
        return this.storageService.get(this.id, from, to);
    }
}
exports.DocumentDeltaStorageService = DocumentDeltaStorageService;
/**
 * Provides access to the underlying delta storage on the server
 */
class DeltaStorageService {
    constructor(url) {
        this.url = url;
    }
    get(id, from, to) {
        const query = querystring.stringify({ from, to });
        return new Promise((resolve, reject) => {
            request.get({ url: `${this.url}/deltas/${id}?${query}`, json: true }, (error, response, body) => {
                if (error) {
                    reject(error);
                }
                else if (response.statusCode !== 200) {
                    reject(response.statusCode);
                }
                else {
                    resolve(body);
                }
            });
        });
    }
}
exports.DeltaStorageService = DeltaStorageService;

},{"querystring":183,"request":201}],251:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const events_1 = require("events");
const core_utils_1 = require("../core-utils");
/**
 * Represents a connection to a stream of delta updates
 */
class DocumentDeltaConnection {
    constructor(service, documentId, clientId, encrypted, privateKey, publicKey) {
        this.service = service;
        this.documentId = documentId;
        this.clientId = clientId;
        this.encrypted = encrypted;
        this.privateKey = privateKey;
        this.publicKey = publicKey;
        this.emitter = new events_1.EventEmitter();
        this.submitManager = new core_utils_1.BatchManager((submitType, work) => {
            this.service.emit(submitType, this.clientId, work.map((message) => message.message), (error) => {
                if (error) {
                    work.forEach((message) => message.deferred.reject(error));
                }
                else {
                    work.forEach((message) => message.deferred.resolve());
                }
            });
        });
    }
    /**
     * Subscribe to events emitted by the document
     */
    on(event, listener) {
        this.service.registerForEvent(event, this);
        this.emitter.on(event, listener);
        return this;
    }
    /**
     * Submits a new delta operation to the server
     */
    submit(message) {
        const deferred = new core_utils_1.Deferred();
        this.submitManager.add("submitOp", { deferred, message });
        return deferred.promise;
    }
    /**
     * Updates the reference sequence number on the given connection to the provided value
     */
    updateReferenceSequenceNumber(objectId, message) {
        const deferred = new core_utils_1.Deferred();
        this.submitManager.add("updateReferenceSequenceNumber", { deferred, message });
        return deferred.promise;
    }
    /**
     * Dispatches the given event to any registered listeners.
     * This is an internal method.
     */
    dispatchEvent(name, ...args) {
        this.emitter.emit(name, ...args);
    }
}
exports.DocumentDeltaConnection = DocumentDeltaConnection;

},{"../core-utils":222,"events":37}],252:[function(require,module,exports){
"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const cloneDeep = require("lodash/cloneDeep");
const performanceNow = require("performance-now");
const request = require("request");
const io = require("socket.io-client");
const blobStorageService_1 = require("./blobStorageService");
const debug_1 = require("./debug");
const deltaStorageService_1 = require("./deltaStorageService");
const documentDeltaConnection_1 = require("./documentDeltaConnection");
const nullDeltaConnection_1 = require("./nullDeltaConnection");
function getEmptyHeader(id) {
    const emptyHeader = {
        attributes: {
            branch: id,
            minimumSequenceNumber: 0,
            sequenceNumber: 0,
        },
        distributedObjects: [],
        transformedMessages: [],
        tree: null,
    };
    return emptyHeader;
}
exports.getEmptyHeader = getEmptyHeader;
class DocumentResource {
    constructor(documentId, clientId, existing, version, parentBranch, deltaConnection, documentStorageService, deltaStorageService, distributedObjects, pendingDeltas, transformedMessages, snapshotOriginBranch, sequenceNumber, minimumSequenceNumber, tree) {
        this.documentId = documentId;
        this.clientId = clientId;
        this.existing = existing;
        this.version = version;
        this.parentBranch = parentBranch;
        this.deltaConnection = deltaConnection;
        this.documentStorageService = documentStorageService;
        this.deltaStorageService = deltaStorageService;
        this.distributedObjects = distributedObjects;
        this.pendingDeltas = pendingDeltas;
        this.transformedMessages = transformedMessages;
        this.snapshotOriginBranch = snapshotOriginBranch;
        this.sequenceNumber = sequenceNumber;
        this.minimumSequenceNumber = minimumSequenceNumber;
        this.tree = tree;
    }
}
exports.DocumentResource = DocumentResource;
/**
 * The DocumentService manages the Socket.IO connection and manages routing requests to connected
 * clients
 */
class DocumentService {
    constructor(url, deltaStorage, blobStorge, gitManager) {
        this.url = url;
        this.deltaStorage = deltaStorage;
        this.blobStorge = blobStorge;
        this.gitManager = gitManager;
        this.eventMap = {};
        debug_1.debug(`Creating document service ${performanceNow()}`);
        this.socket = io(url, { transports: ["websocket"] });
    }
    connect(id, version, connect, encrypted) {
        return __awaiter(this, void 0, void 0, function* () {
            debug_1.debug(`Connecting to ${id} - ${performanceNow()}`);
            if (!connect && !version) {
                return Promise.reject("Must specify a version if connect is set to false");
            }
            const connectMessage = { id, privateKey: null, publicKey: null, encrypted };
            // If a version is specified we will load it directly - otherwise will query historian for the latest
            // version and then load it
            if (version === undefined) {
                const commits = yield this.gitManager.getCommits(id, 1);
                version = commits.length > 0 ? commits[0] : null;
            }
            // Load in the header for the version. At this point if version is still null that means there are no
            // snapshots and we should start with an empty header.
            const headerP = version
                ? this.blobStorge.getHeader(id, version)
                : Promise.resolve(getEmptyHeader(id));
            const connectionP = connect
                ? new Promise((resolve, reject) => {
                    this.socket.emit("connectDocument", connectMessage, (error, response) => {
                        if (error) {
                            return reject(error);
                        }
                        else {
                            return resolve(response);
                        }
                    });
                })
                : Promise.resolve(null);
            const pendingDeltasP = headerP.then((header) => {
                return connect ? this.deltaStorage.get(id, header ? header.attributes.sequenceNumber : 0) : [];
            });
            // header *should* be enough to return the document. Pull it first as well as any pending delta
            // messages which should be taken into account before client logic.
            const [header, connection, pendingDeltas] = yield Promise.all([headerP, connectionP, pendingDeltasP]);
            debug_1.debug(`Connected to ${id} - ${performanceNow()}`);
            let deltaConnection;
            if (connect) {
                deltaConnection = new documentDeltaConnection_1.DocumentDeltaConnection(this, id, connection.clientId, encrypted, connection.privateKey, connection.publicKey);
            }
            else {
                deltaConnection = new nullDeltaConnection_1.NullDeltaConnection(id);
            }
            const deltaStorage = new deltaStorageService_1.DocumentDeltaStorageService(id, this.deltaStorage);
            const documentStorage = new blobStorageService_1.DocumentStorageService(id, version, this.blobStorge);
            const document = new DocumentResource(id, deltaConnection.clientId, connection ? connection.existing : true, version, connection ? connection.parentBranch : (header.attributes.branch !== id ? header.attributes.branch : null), deltaConnection, documentStorage, deltaStorage, header.distributedObjects, pendingDeltas, header.transformedMessages, header.attributes.branch, header.attributes.sequenceNumber, header.attributes.minimumSequenceNumber, header.tree);
            return document;
        });
    }
    branch(id) {
        return __awaiter(this, void 0, void 0, function* () {
            const forkId = yield this.createFork(id);
            return forkId;
        });
    }
    /**
     * Emits a message on the socket
     */
    emit(event, ...args) {
        this.socket.emit(event, ...args);
    }
    /**
     * Registers the given connection to receive events of the given type
     */
    registerForEvent(event, connection) {
        // See if we're already listening for the given event - if not start
        if (!(event in this.eventMap)) {
            this.eventMap[event] = {};
            this.socket.on(event, (documentId, message) => {
                this.handleMessage(event, documentId, message);
            });
        }
        // Register the object for the given event
        const objectMap = this.eventMap[event];
        if (!(connection.documentId in objectMap)) {
            objectMap[connection.documentId] = {};
        }
        // And finally store the connection as interested in the given event
        objectMap[connection.documentId][connection.clientId] = connection;
    }
    /**
     * Handles a message received from the other side of the socket. This message routes it to the connection
     * that has registered to receive events of that type.
     */
    handleMessage(event, documentId, message) {
        const objectMap = this.eventMap[event];
        if (!objectMap) {
            return;
        }
        const connectionMap = objectMap[documentId];
        if (!connectionMap) {
            return;
        }
        // Route message to all registered clients
        for (const clientId in connectionMap) {
            if (connectionMap[clientId]) {
                const clone = cloneDeep(message);
                connectionMap[clientId].dispatchEvent(event, clone);
            }
        }
    }
    createFork(id) {
        return new Promise((resolve, reject) => {
            request.post({ url: `${this.url}/documents/${id}/forks`, json: true }, (error, response, body) => {
                if (error) {
                    reject(error);
                }
                else if (response.statusCode !== 201) {
                    reject(response.statusCode);
                }
                else {
                    resolve(body);
                }
            });
        });
    }
}
exports.DocumentService = DocumentService;

},{"./blobStorageService":248,"./debug":249,"./deltaStorageService":250,"./documentDeltaConnection":251,"./nullDeltaConnection":254,"lodash/cloneDeep":155,"performance-now":179,"request":201,"socket.io-client":184}],253:[function(require,module,exports){
"use strict";
function __export(m) {
    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
}
Object.defineProperty(exports, "__esModule", { value: true });
__export(require("./deltaStorageService"));
__export(require("./documentService"));
__export(require("./blobStorageService"));
__export(require("./registration"));

},{"./blobStorageService":248,"./deltaStorageService":250,"./documentService":252,"./registration":255}],254:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Delta connection used when not connected to the server (i.e. loading an old version)
 */
class NullDeltaConnection {
    constructor(documentId) {
        this.documentId = documentId;
        this.clientId = "offline-client";
        this.encrypted = false;
        this.privateKey = null;
        this.publicKey = null;
    }
    on(event, listener) {
        return this;
    }
    submit(message) {
        return Promise.resolve();
    }
    dispatchEvent(name, ...args) {
        return;
    }
}
exports.NullDeltaConnection = NullDeltaConnection;

},{}],255:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const socketStorage = require(".");
const api = require("../api");
const git_storage_1 = require("../git-storage");
const services_client_1 = require("../services-client");
function getStorageServices(deltaUrl, blobUrl, repository) {
    const historian = new services_client_1.Historian(blobUrl);
    const gitManager = new git_storage_1.GitManager(historian, repository);
    const blobStorage = new socketStorage.BlobStorageService(gitManager);
    const deltaStorage = new socketStorage.DeltaStorageService(deltaUrl);
    return { blobStorage, deltaStorage, gitManager };
}
function getDefaultService(deltaUrl, blobUrl, repository) {
    const storage = getStorageServices(deltaUrl, blobUrl, repository);
    return new socketStorage.DocumentService(deltaUrl, storage.deltaStorage, storage.blobStorage, storage.gitManager);
}
function registerAsDefault(deltaUrl, blobUrl, repository) {
    const service = getDefaultService(deltaUrl, blobUrl, repository);
    api.registerDocumentService(service);
}
exports.registerAsDefault = registerAsDefault;

},{".":253,"../api":217,"../git-storage":229,"../services-client":247}]},{},[219])(219)
});
//# sourceMappingURL=api.js.map
