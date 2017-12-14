(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.pragueUi = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
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

},{}],2:[function(require,module,exports){
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

},{"_process":3}],3:[function(require,module,exports){
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

},{}],4:[function(require,module,exports){
/*jshint eqnull:true*/
(function (root) {
  "use strict";

  var GLOBAL_KEY = "Random";

  var imul = (typeof Math.imul !== "function" || Math.imul(0xffffffff, 5) !== -5 ?
    function (a, b) {
      var ah = (a >>> 16) & 0xffff;
      var al = a & 0xffff;
      var bh = (b >>> 16) & 0xffff;
      var bl = b & 0xffff;
      // the shift by 0 fixes the sign on the high part
      // the final |0 converts the unsigned value into a signed value
      return (al * bl) + (((ah * bl + al * bh) << 16) >>> 0) | 0;
    } :
    Math.imul);

  var stringRepeat = (typeof String.prototype.repeat === "function" && "x".repeat(3) === "xxx" ?
    function (x, y) {
      return x.repeat(y);
    } : function (pattern, count) {
      var result = "";
      while (count > 0) {
        if (count & 1) {
          result += pattern;
        }
        count >>= 1;
        pattern += pattern;
      }
      return result;
    });

  function Random(engine) {
    if (!(this instanceof Random)) {
      return new Random(engine);
    }

    if (engine == null) {
      engine = Random.engines.nativeMath;
    } else if (typeof engine !== "function") {
      throw new TypeError("Expected engine to be a function, got " + typeof engine);
    }
    this.engine = engine;
  }
  var proto = Random.prototype;

  Random.engines = {
    nativeMath: function () {
      return (Math.random() * 0x100000000) | 0;
    },
    mt19937: (function (Int32Array) {
      // http://en.wikipedia.org/wiki/Mersenne_twister
      function refreshData(data) {
        var k = 0;
        var tmp = 0;
        for (;
          (k | 0) < 227; k = (k + 1) | 0) {
          tmp = (data[k] & 0x80000000) | (data[(k + 1) | 0] & 0x7fffffff);
          data[k] = data[(k + 397) | 0] ^ (tmp >>> 1) ^ ((tmp & 0x1) ? 0x9908b0df : 0);
        }

        for (;
          (k | 0) < 623; k = (k + 1) | 0) {
          tmp = (data[k] & 0x80000000) | (data[(k + 1) | 0] & 0x7fffffff);
          data[k] = data[(k - 227) | 0] ^ (tmp >>> 1) ^ ((tmp & 0x1) ? 0x9908b0df : 0);
        }

        tmp = (data[623] & 0x80000000) | (data[0] & 0x7fffffff);
        data[623] = data[396] ^ (tmp >>> 1) ^ ((tmp & 0x1) ? 0x9908b0df : 0);
      }

      function temper(value) {
        value ^= value >>> 11;
        value ^= (value << 7) & 0x9d2c5680;
        value ^= (value << 15) & 0xefc60000;
        return value ^ (value >>> 18);
      }

      function seedWithArray(data, source) {
        var i = 1;
        var j = 0;
        var sourceLength = source.length;
        var k = Math.max(sourceLength, 624) | 0;
        var previous = data[0] | 0;
        for (;
          (k | 0) > 0; --k) {
          data[i] = previous = ((data[i] ^ imul((previous ^ (previous >>> 30)), 0x0019660d)) + (source[j] | 0) + (j | 0)) | 0;
          i = (i + 1) | 0;
          ++j;
          if ((i | 0) > 623) {
            data[0] = data[623];
            i = 1;
          }
          if (j >= sourceLength) {
            j = 0;
          }
        }
        for (k = 623;
          (k | 0) > 0; --k) {
          data[i] = previous = ((data[i] ^ imul((previous ^ (previous >>> 30)), 0x5d588b65)) - i) | 0;
          i = (i + 1) | 0;
          if ((i | 0) > 623) {
            data[0] = data[623];
            i = 1;
          }
        }
        data[0] = 0x80000000;
      }

      function mt19937() {
        var data = new Int32Array(624);
        var index = 0;
        var uses = 0;

        function next() {
          if ((index | 0) >= 624) {
            refreshData(data);
            index = 0;
          }

          var value = data[index];
          index = (index + 1) | 0;
          uses += 1;
          return temper(value) | 0;
        }
        next.getUseCount = function() {
          return uses;
        };
        next.discard = function (count) {
          uses += count;
          if ((index | 0) >= 624) {
            refreshData(data);
            index = 0;
          }
          while ((count - index) > 624) {
            count -= 624 - index;
            refreshData(data);
            index = 0;
          }
          index = (index + count) | 0;
          return next;
        };
        next.seed = function (initial) {
          var previous = 0;
          data[0] = previous = initial | 0;

          for (var i = 1; i < 624; i = (i + 1) | 0) {
            data[i] = previous = (imul((previous ^ (previous >>> 30)), 0x6c078965) + i) | 0;
          }
          index = 624;
          uses = 0;
          return next;
        };
        next.seedWithArray = function (source) {
          next.seed(0x012bd6aa);
          seedWithArray(data, source);
          return next;
        };
        next.autoSeed = function () {
          return next.seedWithArray(Random.generateEntropyArray());
        };
        return next;
      }

      return mt19937;
    }(typeof Int32Array === "function" ? Int32Array : Array)),
    browserCrypto: (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function" && typeof Int32Array === "function") ? (function () {
      var data = null;
      var index = 128;

      return function () {
        if (index >= 128) {
          if (data === null) {
            data = new Int32Array(128);
          }
          crypto.getRandomValues(data);
          index = 0;
        }

        return data[index++] | 0;
      };
    }()) : null
  };

  Random.generateEntropyArray = function () {
    var array = [];
    var engine = Random.engines.nativeMath;
    for (var i = 0; i < 16; ++i) {
      array[i] = engine() | 0;
    }
    array.push(new Date().getTime() | 0);
    return array;
  };

  function returnValue(value) {
    return function () {
      return value;
    };
  }

  // [-0x80000000, 0x7fffffff]
  Random.int32 = function (engine) {
    return engine() | 0;
  };
  proto.int32 = function () {
    return Random.int32(this.engine);
  };

  // [0, 0xffffffff]
  Random.uint32 = function (engine) {
    return engine() >>> 0;
  };
  proto.uint32 = function () {
    return Random.uint32(this.engine);
  };

  // [0, 0x1fffffffffffff]
  Random.uint53 = function (engine) {
    var high = engine() & 0x1fffff;
    var low = engine() >>> 0;
    return (high * 0x100000000) + low;
  };
  proto.uint53 = function () {
    return Random.uint53(this.engine);
  };

  // [0, 0x20000000000000]
  Random.uint53Full = function (engine) {
    while (true) {
      var high = engine() | 0;
      if (high & 0x200000) {
        if ((high & 0x3fffff) === 0x200000 && (engine() | 0) === 0) {
          return 0x20000000000000;
        }
      } else {
        var low = engine() >>> 0;
        return ((high & 0x1fffff) * 0x100000000) + low;
      }
    }
  };
  proto.uint53Full = function () {
    return Random.uint53Full(this.engine);
  };

  // [-0x20000000000000, 0x1fffffffffffff]
  Random.int53 = function (engine) {
    var high = engine() | 0;
    var low = engine() >>> 0;
    return ((high & 0x1fffff) * 0x100000000) + low + (high & 0x200000 ? -0x20000000000000 : 0);
  };
  proto.int53 = function () {
    return Random.int53(this.engine);
  };

  // [-0x20000000000000, 0x20000000000000]
  Random.int53Full = function (engine) {
    while (true) {
      var high = engine() | 0;
      if (high & 0x400000) {
        if ((high & 0x7fffff) === 0x400000 && (engine() | 0) === 0) {
          return 0x20000000000000;
        }
      } else {
        var low = engine() >>> 0;
        return ((high & 0x1fffff) * 0x100000000) + low + (high & 0x200000 ? -0x20000000000000 : 0);
      }
    }
  };
  proto.int53Full = function () {
    return Random.int53Full(this.engine);
  };

  function add(generate, addend) {
    if (addend === 0) {
      return generate;
    } else {
      return function (engine) {
        return generate(engine) + addend;
      };
    }
  }

  Random.integer = (function () {
    function isPowerOfTwoMinusOne(value) {
      return ((value + 1) & value) === 0;
    }

    function bitmask(masking) {
      return function (engine) {
        return engine() & masking;
      };
    }

    function downscaleToLoopCheckedRange(range) {
      var extendedRange = range + 1;
      var maximum = extendedRange * Math.floor(0x100000000 / extendedRange);
      return function (engine) {
        var value = 0;
        do {
          value = engine() >>> 0;
        } while (value >= maximum);
        return value % extendedRange;
      };
    }

    function downscaleToRange(range) {
      if (isPowerOfTwoMinusOne(range)) {
        return bitmask(range);
      } else {
        return downscaleToLoopCheckedRange(range);
      }
    }

    function isEvenlyDivisibleByMaxInt32(value) {
      return (value | 0) === 0;
    }

    function upscaleWithHighMasking(masking) {
      return function (engine) {
        var high = engine() & masking;
        var low = engine() >>> 0;
        return (high * 0x100000000) + low;
      };
    }

    function upscaleToLoopCheckedRange(extendedRange) {
      var maximum = extendedRange * Math.floor(0x20000000000000 / extendedRange);
      return function (engine) {
        var ret = 0;
        do {
          var high = engine() & 0x1fffff;
          var low = engine() >>> 0;
          ret = (high * 0x100000000) + low;
        } while (ret >= maximum);
        return ret % extendedRange;
      };
    }

    function upscaleWithinU53(range) {
      var extendedRange = range + 1;
      if (isEvenlyDivisibleByMaxInt32(extendedRange)) {
        var highRange = ((extendedRange / 0x100000000) | 0) - 1;
        if (isPowerOfTwoMinusOne(highRange)) {
          return upscaleWithHighMasking(highRange);
        }
      }
      return upscaleToLoopCheckedRange(extendedRange);
    }

    function upscaleWithinI53AndLoopCheck(min, max) {
      return function (engine) {
        var ret = 0;
        do {
          var high = engine() | 0;
          var low = engine() >>> 0;
          ret = ((high & 0x1fffff) * 0x100000000) + low + (high & 0x200000 ? -0x20000000000000 : 0);
        } while (ret < min || ret > max);
        return ret;
      };
    }

    return function (min, max) {
      min = Math.floor(min);
      max = Math.floor(max);
      if (min < -0x20000000000000 || !isFinite(min)) {
        throw new RangeError("Expected min to be at least " + (-0x20000000000000));
      } else if (max > 0x20000000000000 || !isFinite(max)) {
        throw new RangeError("Expected max to be at most " + 0x20000000000000);
      }

      var range = max - min;
      if (range <= 0 || !isFinite(range)) {
        return returnValue(min);
      } else if (range === 0xffffffff) {
        if (min === 0) {
          return Random.uint32;
        } else {
          return add(Random.int32, min + 0x80000000);
        }
      } else if (range < 0xffffffff) {
        return add(downscaleToRange(range), min);
      } else if (range === 0x1fffffffffffff) {
        return add(Random.uint53, min);
      } else if (range < 0x1fffffffffffff) {
        return add(upscaleWithinU53(range), min);
      } else if (max - 1 - min === 0x1fffffffffffff) {
        return add(Random.uint53Full, min);
      } else if (min === -0x20000000000000 && max === 0x20000000000000) {
        return Random.int53Full;
      } else if (min === -0x20000000000000 && max === 0x1fffffffffffff) {
        return Random.int53;
      } else if (min === -0x1fffffffffffff && max === 0x20000000000000) {
        return add(Random.int53, 1);
      } else if (max === 0x20000000000000) {
        return add(upscaleWithinI53AndLoopCheck(min - 1, max - 1), 1);
      } else {
        return upscaleWithinI53AndLoopCheck(min, max);
      }
    };
  }());
  proto.integer = function (min, max) {
    return Random.integer(min, max)(this.engine);
  };

  // [0, 1] (floating point)
  Random.realZeroToOneInclusive = function (engine) {
    return Random.uint53Full(engine) / 0x20000000000000;
  };
  proto.realZeroToOneInclusive = function () {
    return Random.realZeroToOneInclusive(this.engine);
  };

  // [0, 1) (floating point)
  Random.realZeroToOneExclusive = function (engine) {
    return Random.uint53(engine) / 0x20000000000000;
  };
  proto.realZeroToOneExclusive = function () {
    return Random.realZeroToOneExclusive(this.engine);
  };

  Random.real = (function () {
    function multiply(generate, multiplier) {
      if (multiplier === 1) {
        return generate;
      } else if (multiplier === 0) {
        return function () {
          return 0;
        };
      } else {
        return function (engine) {
          return generate(engine) * multiplier;
        };
      }
    }

    return function (left, right, inclusive) {
      if (!isFinite(left)) {
        throw new RangeError("Expected left to be a finite number");
      } else if (!isFinite(right)) {
        throw new RangeError("Expected right to be a finite number");
      }
      return add(
        multiply(
          inclusive ? Random.realZeroToOneInclusive : Random.realZeroToOneExclusive,
          right - left),
        left);
    };
  }());
  proto.real = function (min, max, inclusive) {
    return Random.real(min, max, inclusive)(this.engine);
  };

  Random.bool = (function () {
    function isLeastBitTrue(engine) {
      return (engine() & 1) === 1;
    }

    function lessThan(generate, value) {
      return function (engine) {
        return generate(engine) < value;
      };
    }

    function probability(percentage) {
      if (percentage <= 0) {
        return returnValue(false);
      } else if (percentage >= 1) {
        return returnValue(true);
      } else {
        var scaled = percentage * 0x100000000;
        if (scaled % 1 === 0) {
          return lessThan(Random.int32, (scaled - 0x80000000) | 0);
        } else {
          return lessThan(Random.uint53, Math.round(percentage * 0x20000000000000));
        }
      }
    }

    return function (numerator, denominator) {
      if (denominator == null) {
        if (numerator == null) {
          return isLeastBitTrue;
        }
        return probability(numerator);
      } else {
        if (numerator <= 0) {
          return returnValue(false);
        } else if (numerator >= denominator) {
          return returnValue(true);
        }
        return lessThan(Random.integer(0, denominator - 1), numerator);
      }
    };
  }());
  proto.bool = function (numerator, denominator) {
    return Random.bool(numerator, denominator)(this.engine);
  };

  function toInteger(value) {
    var number = +value;
    if (number < 0) {
      return Math.ceil(number);
    } else {
      return Math.floor(number);
    }
  }

  function convertSliceArgument(value, length) {
    if (value < 0) {
      return Math.max(value + length, 0);
    } else {
      return Math.min(value, length);
    }
  }
  Random.pick = function (engine, array, begin, end) {
    var length = array.length;
    var start = begin == null ? 0 : convertSliceArgument(toInteger(begin), length);
    var finish = end === void 0 ? length : convertSliceArgument(toInteger(end), length);
    if (start >= finish) {
      return void 0;
    }
    var distribution = Random.integer(start, finish - 1);
    return array[distribution(engine)];
  };
  proto.pick = function (array, begin, end) {
    return Random.pick(this.engine, array, begin, end);
  };

  function returnUndefined() {
    return void 0;
  }
  var slice = Array.prototype.slice;
  Random.picker = function (array, begin, end) {
    var clone = slice.call(array, begin, end);
    if (!clone.length) {
      return returnUndefined;
    }
    var distribution = Random.integer(0, clone.length - 1);
    return function (engine) {
      return clone[distribution(engine)];
    };
  };

  Random.shuffle = function (engine, array, downTo) {
    var length = array.length;
    if (length) {
      if (downTo == null) {
        downTo = 0;
      }
      for (var i = (length - 1) >>> 0; i > downTo; --i) {
        var distribution = Random.integer(0, i);
        var j = distribution(engine);
        if (i !== j) {
          var tmp = array[i];
          array[i] = array[j];
          array[j] = tmp;
        }
      }
    }
    return array;
  };
  proto.shuffle = function (array) {
    return Random.shuffle(this.engine, array);
  };

  Random.sample = function (engine, population, sampleSize) {
    if (sampleSize < 0 || sampleSize > population.length || !isFinite(sampleSize)) {
      throw new RangeError("Expected sampleSize to be within 0 and the length of the population");
    }

    if (sampleSize === 0) {
      return [];
    }

    var clone = slice.call(population);
    var length = clone.length;
    if (length === sampleSize) {
      return Random.shuffle(engine, clone, 0);
    }
    var tailLength = length - sampleSize;
    return Random.shuffle(engine, clone, tailLength - 1).slice(tailLength);
  };
  proto.sample = function (population, sampleSize) {
    return Random.sample(this.engine, population, sampleSize);
  };

  Random.die = function (sideCount) {
    return Random.integer(1, sideCount);
  };
  proto.die = function (sideCount) {
    return Random.die(sideCount)(this.engine);
  };

  Random.dice = function (sideCount, dieCount) {
    var distribution = Random.die(sideCount);
    return function (engine) {
      var result = [];
      result.length = dieCount;
      for (var i = 0; i < dieCount; ++i) {
        result[i] = distribution(engine);
      }
      return result;
    };
  };
  proto.dice = function (sideCount, dieCount) {
    return Random.dice(sideCount, dieCount)(this.engine);
  };

  // http://en.wikipedia.org/wiki/Universally_unique_identifier
  Random.uuid4 = (function () {
    function zeroPad(string, zeroCount) {
      return stringRepeat("0", zeroCount - string.length) + string;
    }

    return function (engine) {
      var a = engine() >>> 0;
      var b = engine() | 0;
      var c = engine() | 0;
      var d = engine() >>> 0;

      return (
        zeroPad(a.toString(16), 8) +
        "-" +
        zeroPad((b & 0xffff).toString(16), 4) +
        "-" +
        zeroPad((((b >> 4) & 0x0fff) | 0x4000).toString(16), 4) +
        "-" +
        zeroPad(((c & 0x3fff) | 0x8000).toString(16), 4) +
        "-" +
        zeroPad(((c >> 4) & 0xffff).toString(16), 4) +
        zeroPad(d.toString(16), 8));
    };
  }());
  proto.uuid4 = function () {
    return Random.uuid4(this.engine);
  };

  Random.string = (function () {
    // has 2**x chars, for faster uniform distribution
    var DEFAULT_STRING_POOL = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-";

    return function (pool) {
      if (pool == null) {
        pool = DEFAULT_STRING_POOL;
      }

      var length = pool.length;
      if (!length) {
        throw new Error("Expected pool not to be an empty string");
      }

      var distribution = Random.integer(0, length - 1);
      return function (engine, length) {
        var result = "";
        for (var i = 0; i < length; ++i) {
          var j = distribution(engine);
          result += pool.charAt(j);
        }
        return result;
      };
    };
  }());
  proto.string = function (length, pool) {
    return Random.string(pool)(this.engine, length);
  };

  Random.hex = (function () {
    var LOWER_HEX_POOL = "0123456789abcdef";
    var lowerHex = Random.string(LOWER_HEX_POOL);
    var upperHex = Random.string(LOWER_HEX_POOL.toUpperCase());

    return function (upper) {
      if (upper) {
        return upperHex;
      } else {
        return lowerHex;
      }
    };
  }());
  proto.hex = function (length, upper) {
    return Random.hex(upper)(this.engine, length);
  };

  Random.date = function (start, end) {
    if (!(start instanceof Date)) {
      throw new TypeError("Expected start to be a Date, got " + typeof start);
    } else if (!(end instanceof Date)) {
      throw new TypeError("Expected end to be a Date, got " + typeof end);
    }
    var distribution = Random.integer(start.getTime(), end.getTime());
    return function (engine) {
      return new Date(distribution(engine));
    };
  };
  proto.date = function (start, end) {
    return Random.date(start, end)(this.engine);
  };

  if (typeof define === "function" && define.amd) {
    define(function () {
      return Random;
    });
  } else if (typeof module !== "undefined" && typeof require === "function") {
    module.exports = Random;
  } else {
    (function () {
      var oldGlobal = root[GLOBAL_KEY];
      Random.noConflict = function () {
        root[GLOBAL_KEY] = oldGlobal;
        return this;
      };
    }());
    root[GLOBAL_KEY] = Random;
  }
}(this));
},{}],5:[function(require,module,exports){
(function (root, factory) {
	
	if (typeof define === 'function' && define.amd) {
		define([], factory);
	} 
	else if (typeof module !== "undefined" && module.exports) {
		module.exports = factory();
	} 
	else {
		root.ShapeDetector = factory();
	}
}(this, function () {

	var _nbSamplePoints;
	var _squareSize = 250;
	var _phi = 0.5 * (-1.0 + Math.sqrt(5.0));
	var _angleRange = deg2Rad(45.0);
	var _anglePrecision = deg2Rad(2.0);
	var _halfDiagonal = Math.sqrt(_squareSize * _squareSize + _squareSize * _squareSize) * 0.5;
	var _origin = { x: 0, y: 0 };

	function deg2Rad (d) {

		return d * Math.PI / 180.0;
	};

	function getDistance (a, b) {

		var dx = b.x - a.x;
		var dy = b.y - a.y;

		return Math.sqrt(dx * dx + dy * dy);
	};

	function Stroke (points, name) {

		this.points = points;
		this.name = name;
		this.processStroke();
	};

	Stroke.prototype.processStroke = function () {

		this.points = this.resample();
		this.setCentroid();
		this.points = this.rotateBy(-this.indicativeAngle());
		this.points = this.scaleToSquare();
		this.setCentroid();
		this.points = this.translateToOrigin();
		
		return this;
	};

	Stroke.prototype.resample = function () {

		var localDistance, q;
		var interval = this.strokeLength() / (_nbSamplePoints - 1);
		var distance = 0.0;
		var newPoints = [this.points[0]];

		for (var i = 1; i < this.points.length; i++) {
			localDistance = getDistance(this.points[i - 1], this.points[i]);

			if (distance + localDistance >= interval) {
				q = {
					x: this.points[i - 1].x + ((interval - distance) / localDistance) * (this.points[i].x - this.points[i - 1].x),
					y: this.points[i - 1].y + ((interval - distance) / localDistance) * (this.points[i].y - this.points[i - 1].y)
				};

				newPoints.push(q);
				this.points.splice(i, 0, q);
				distance = 0.0;
			} 
			else {
				distance += localDistance;
			}
		}
		
		if (newPoints.length === _nbSamplePoints - 1) {
			newPoints.push(this.points[this.points.length - 1]);
		}
		
		return newPoints;
	};

	Stroke.prototype.rotateBy = function (angle) {

		var point;
		var cos = Math.cos(angle);
		var sin = Math.sin(angle);
		var newPoints = [];
		
		for (var i = 0; i < this.points.length; i++) {
			point = this.points[i];

			newPoints.push({
				x: (point.x - this.c.x) * cos - (point.y - this.c.y) * sin + this.c.x,
				y: (point.x - this.c.x) * sin + (point.y - this.c.y) * cos + this.c.y
			});
		}

		return newPoints;
	};

	Stroke.prototype.scaleToSquare = function () {

		var point;
		var newPoints = []
		var box = {
			minX: +Infinity,
			maxX: -Infinity,
			minY: +Infinity,
			maxY: -Infinity
		};

		for (var i = 0; i < this.points.length; i++) {
			point = this.points[i];
			
			box.minX = Math.min(box.minX, point.x);
			box.minY = Math.min(box.minY, point.y);
			box.maxX = Math.max(box.maxX, point.x);
			box.maxY = Math.max(box.maxY, point.y);
		}

		box.width = box.maxX - box.minX;
		box.height = box.maxY - box.minY;

		for (i = 0; i < this.points.length; i++) {
			point = this.points[i];

			newPoints.push({
				x: point.x * (_squareSize / box.width),
				y: point.y * (_squareSize / box.height)
			});
		}

		return newPoints;
	};

	Stroke.prototype.translateToOrigin = function (points) {

		var point;
		var newPoints = [];
		
		for (var i = 0; i < this.points.length; i++) {
			point = this.points[i];
		
			newPoints.push({
				x: point.x + _origin.x - this.c.x,
				y: point.y + _origin.y - this.c.y
			});
		}

		return newPoints;
	};

	Stroke.prototype.setCentroid = function () {
		
		var point;
		this.c = {
			x: 0.0,
			y: 0.0
		};

		for (var i = 0; i < this.points.length; i++) {
			point = this.points[i];

			this.c.x += point.x;
			this.c.y += point.y;
		}

		this.c.x /= this.points.length;
		this.c.y /= this.points.length;
		
		return this;
	};

	Stroke.prototype.indicativeAngle = function () {

		return Math.atan2(this.c.y - this.points[0].y, this.c.x - this.points[0].x);
	};

	Stroke.prototype.strokeLength = function () {
		
		var d = 0.0;

		for (var i = 1; i < this.points.length; i++) {
			d += getDistance(this.points[i - 1], this.points[i]);
		}

		return d;
	};

	Stroke.prototype.distanceAtBestAngle = function (pattern) {
		
		var a = -_angleRange;
		var b = _angleRange;
		var x1 = _phi * a + (1.0 - _phi) * b;
		var f1 = this.distanceAtAngle(pattern, x1);
		var x2 = (1.0 - _phi) * a + _phi * b;
		var f2 = this.distanceAtAngle(pattern, x2);

		while (Math.abs(b - a) > _anglePrecision) {
			
			if (f1 < f2) {
				b = x2;
				x2 = x1;
				f2 = f1;
				x1 = _phi * a + (1.0 - _phi) * b;
				f1 = this.distanceAtAngle(pattern, x1);
			} 
			else {
				a = x1;
				x1 = x2;
				f1 = f2;
				x2 = (1.0 - _phi) * a + _phi * b;
				f2 = this.distanceAtAngle(pattern, x2);
			}
		}

		return Math.min(f1, f2);
	};

	Stroke.prototype.distanceAtAngle = function (pattern, angle) {

		var strokePoints = this.rotateBy(angle);
		var patternPoints = pattern.points;
		var d = 0.0;

		for (var i = 0; i < strokePoints.length; i++) {
			d += getDistance(strokePoints[i], patternPoints[i]);
		}

		return d / strokePoints.length;
	};

	function ShapeDetector (patterns, options) {

		options = options || {};
		this.threshold = options.threshold || 0;
		_nbSamplePoints = options.nbSamplePoints || 64;

		this.patterns = [];

		for (var i = 0; i < patterns.length; i++) {
			this.learn(patterns[i].name, patterns[i].points);
		}
	}

	ShapeDetector.defaultShapes = [
		{
			points: [{ x: 140.17500305175776, y: 420.52500915527327 }, { x: 157.69687843322748, y: 385.4812583923338 }, { x: 175.2187538146972, y: 350.4375076293944 }, { x: 192.7406291961669, y: 315.39375686645496 }, { x: 210.26250457763663, y: 280.3500061035155 }, { x: 227.78437995910636, y: 245.30625534057606 }, { x: 245.30625534057606, y: 210.26250457763663 }, { x: 262.8281307220458, y: 175.2187538146972 }, { x: 280.3500061035155, y: 140.17500305175776 }, { x: 280.3500061035155, y: 140.17500305175776 }, { x: 297.87188148498524, y: 175.2187538146972 }, { x: 315.39375686645496, y: 210.26250457763663 }, { x: 332.9156322479247, y: 245.30625534057606 }, { x: 350.4375076293944, y: 280.3500061035155 }, { x: 367.95938301086414, y: 315.39375686645496 }, { x: 385.4812583923338, y: 350.4375076293944 }, { x: 403.00313377380354, y: 385.4812583923338 }, { x: 420.52500915527327, y: 420.52500915527327 }, { x: 420.52500915527327, y: 420.52500915527327 }, { x: 385.4812583923338, y: 420.52500915527327 }, { x: 350.4375076293944, y: 420.52500915527327 }, { x: 315.39375686645496, y: 420.52500915527327 }, { x: 280.3500061035155, y: 420.52500915527327 }, { x: 245.30625534057606, y: 420.52500915527327 }, { x: 210.26250457763663, y: 420.52500915527327 }, { x: 175.2187538146972, y: 420.52500915527327 }, { x: 140.17500305175776, y: 420.52500915527327}],
			name: "triangle"
		},
		{
			points: [{ x: 280.3500061035155, y: 140.17500305175776 }, { x: 297.87188148498524, y: 175.2187538146972 }, { x: 315.39375686645496, y: 210.26250457763663 }, { x: 332.9156322479247, y: 245.30625534057606 }, { x: 350.4375076293944, y: 280.3500061035155 }, { x: 367.95938301086414, y: 315.39375686645496 }, { x: 385.4812583923338, y: 350.4375076293944 }, { x: 403.00313377380354, y: 385.4812583923338 }, { x: 420.52500915527327, y: 420.52500915527327 }, { x: 420.52500915527327, y: 420.52500915527327 }, { x: 385.4812583923338, y: 420.52500915527327 }, { x: 350.4375076293944, y: 420.52500915527327 }, { x: 315.39375686645496, y: 420.52500915527327 }, { x: 280.3500061035155, y: 420.52500915527327 }, { x: 245.30625534057606, y: 420.52500915527327 }, { x: 210.26250457763663, y: 420.52500915527327 }, { x: 175.2187538146972, y: 420.52500915527327 }, { x: 140.17500305175776, y: 420.52500915527327 }, { x: 140.17500305175776, y: 420.52500915527327 }, { x: 157.69687843322748, y: 385.4812583923338 }, { x: 175.2187538146972, y: 350.4375076293944 }, { x: 192.7406291961669, y: 315.39375686645496 }, { x: 210.26250457763663, y: 280.3500061035155 }, { x: 227.78437995910636, y: 245.30625534057606 }, { x: 245.30625534057606, y: 210.26250457763663 }, { x: 262.8281307220458, y: 175.2187538146972 }, { x: 280.3500061035155, y: 140.17500305175776}],
			name: "triangle"
		},
		{
			points:  [{ x: 420.52500915527327, y: 420.52500915527327 }, { x: 385.4812583923338, y: 420.52500915527327 }, { x: 350.4375076293944, y: 420.52500915527327 }, { x: 315.39375686645496, y: 420.52500915527327 }, { x: 280.3500061035155, y: 420.52500915527327 }, { x: 245.30625534057606, y: 420.52500915527327 }, { x: 210.26250457763663, y: 420.52500915527327 }, { x: 175.2187538146972, y: 420.52500915527327 }, { x: 140.17500305175776, y: 420.52500915527327 }, { x: 140.17500305175776, y: 420.52500915527327 }, { x: 157.69687843322748, y: 385.4812583923338 }, { x: 175.2187538146972, y: 350.4375076293944 }, { x: 192.7406291961669, y: 315.39375686645496 }, { x: 210.26250457763663, y: 280.3500061035155 }, { x: 227.78437995910636, y: 245.30625534057606 }, { x: 245.30625534057606, y: 210.26250457763663 }, { x: 262.8281307220458, y: 175.2187538146972 }, { x: 280.3500061035155, y: 140.17500305175776 }, { x: 280.3500061035155, y: 140.17500305175776 }, { x: 297.87188148498524, y: 175.2187538146972 }, { x: 315.39375686645496, y: 210.26250457763663 }, { x: 332.9156322479247, y: 245.30625534057606 }, { x: 350.4375076293944, y: 280.3500061035155 }, { x: 367.95938301086414, y: 315.39375686645496 }, { x: 385.4812583923338, y: 350.4375076293944 }, { x: 403.00313377380354, y: 385.4812583923338 }, { x: 420.52500915527327, y: 420.52500915527327}],
			name: "triangle"
		},
		{
			points: [{ x: 140.17500305175776, y: 420.52500915527327 }, { x: 175.2187538146972, y: 420.52500915527327 }, { x: 210.26250457763663, y: 420.52500915527327 }, { x: 245.30625534057606, y: 420.52500915527327 }, { x: 280.3500061035155, y: 420.52500915527327 }, { x: 315.39375686645496, y: 420.52500915527327 }, { x: 350.4375076293944, y: 420.52500915527327 }, { x: 385.4812583923338, y: 420.52500915527327 }, { x: 420.52500915527327, y: 420.52500915527327 }, { x: 420.52500915527327, y: 420.52500915527327 }, { x: 403.00313377380354, y: 385.4812583923338 }, { x: 385.4812583923338, y: 350.4375076293944 }, { x: 367.9593830108641, y: 315.39375686645496 }, { x: 350.4375076293944, y: 280.3500061035155 }, { x: 332.9156322479247, y: 245.30625534057606 }, { x: 315.39375686645496, y: 210.26250457763663 }, { x: 297.87188148498524, y: 175.2187538146972 }, { x: 280.3500061035155, y: 140.17500305175776 }, { x: 280.3500061035155, y: 140.17500305175776 }, { x: 262.8281307220458, y: 175.2187538146972 }, { x: 245.30625534057606, y: 210.26250457763663 }, { x: 227.78437995910636, y: 245.30625534057606 }, { x: 210.26250457763663, y: 280.3500061035155 }, { x: 192.7406291961669, y: 315.39375686645496 }, { x: 175.2187538146972, y: 350.4375076293944 }, { x: 157.69687843322748, y: 385.4812583923338 }, { x: 140.17500305175776, y: 420.52500915527327}],
			name: "triangle"
		},
		{
			points: [{ x: 420.52500915527327, y: 420.52500915527327 }, { x: 403.00313377380354, y: 385.4812583923338 }, { x: 385.4812583923338, y: 350.4375076293944 }, { x: 367.9593830108641, y: 315.39375686645496 }, { x: 350.4375076293944, y: 280.3500061035155 }, { x: 332.9156322479247, y: 245.30625534057606 }, { x: 315.39375686645496, y: 210.26250457763663 }, { x: 297.87188148498524, y: 175.2187538146972 }, { x: 280.3500061035155, y: 140.17500305175776 }, { x: 280.3500061035155, y: 140.17500305175776 }, { x: 262.8281307220458, y: 175.2187538146972 }, { x: 245.30625534057606, y: 210.26250457763663 }, { x: 227.78437995910636, y: 245.30625534057606 }, { x: 210.26250457763663, y: 280.3500061035155 }, { x: 192.7406291961669, y: 315.39375686645496 }, { x: 175.2187538146972, y: 350.4375076293944 }, { x: 157.69687843322748, y: 385.4812583923338 }, { x: 140.17500305175776, y: 420.52500915527327 }, { x: 140.17500305175776, y: 420.52500915527327 }, { x: 175.2187538146972, y: 420.52500915527327 }, { x: 210.26250457763663, y: 420.52500915527327 }, { x: 245.30625534057606, y: 420.52500915527327 }, { x: 280.3500061035155, y: 420.52500915527327 }, { x: 315.39375686645496, y: 420.52500915527327 }, { x: 350.4375076293944, y: 420.52500915527327 }, { x: 385.4812583923338, y: 420.52500915527327 }, { x: 420.52500915527327, y: 420.52500915527327}],
			name: "triangle"
		},
		{
			points: [{ x: 280.3500061035155, y: 140.17500305175776 }, { x: 262.8281307220458, y: 175.2187538146972 }, { x: 245.30625534057606, y: 210.26250457763663 }, { x: 227.78437995910636, y: 245.30625534057606 }, { x: 210.26250457763663, y: 280.3500061035155 }, { x: 192.7406291961669, y: 315.39375686645496 }, { x: 175.2187538146972, y: 350.4375076293944 }, { x: 157.69687843322748, y: 385.4812583923338 }, { x: 140.17500305175776, y: 420.52500915527327 }, { x: 140.17500305175776, y: 420.52500915527327 }, { x: 175.2187538146972, y: 420.52500915527327 }, { x: 210.26250457763663, y: 420.52500915527327 }, { x: 245.30625534057606, y: 420.52500915527327 }, { x: 280.3500061035155, y: 420.52500915527327 }, { x: 315.39375686645496, y: 420.52500915527327 }, { x: 350.4375076293944, y: 420.52500915527327 }, { x: 385.4812583923338, y: 420.52500915527327 }, { x: 420.52500915527327, y: 420.52500915527327 }, { x: 420.52500915527327, y: 420.52500915527327 }, { x: 403.00313377380354, y: 385.4812583923338 }, { x: 385.4812583923338, y: 350.4375076293944 }, { x: 367.9593830108641, y: 315.39375686645496 }, { x: 350.4375076293944, y: 280.3500061035155 }, { x: 332.9156322479247, y: 245.30625534057606 }, { x: 315.39375686645496, y: 210.26250457763663 }, { x: 297.87188148498524, y: 175.2187538146972 }, { x: 280.3500061035155, y: 140.17500305175776}],
			name: "triangle"
		},
		{
			points: [{ x: 140.17500305175776, y: 140.17500305175776 }, { x: 175.2187538146972, y: 140.17500305175776 }, { x: 210.26250457763663, y: 140.17500305175776 }, { x: 245.30625534057606, y: 140.17500305175776 }, { x: 280.3500061035155, y: 140.17500305175776 }, { x: 315.39375686645496, y: 140.17500305175776 }, { x: 350.4375076293944, y: 140.17500305175776 }, { x: 385.4812583923338, y: 140.17500305175776 }, { x: 420.52500915527327, y: 140.17500305175776 }, { x: 420.52500915527327, y: 140.17500305175776 }, { x: 420.52500915527327, y: 175.2187538146972 }, { x: 420.52500915527327, y: 210.26250457763663 }, { x: 420.52500915527327, y: 245.30625534057606 }, { x: 420.52500915527327, y: 280.3500061035155 }, { x: 420.52500915527327, y: 315.39375686645496 }, { x: 420.52500915527327, y: 350.4375076293944 }, { x: 420.52500915527327, y: 385.4812583923338 }, { x: 420.52500915527327, y: 420.52500915527327 }, { x: 420.52500915527327, y: 420.52500915527327 }, { x: 385.4812583923338, y: 420.52500915527327 }, { x: 350.4375076293944, y: 420.52500915527327 }, { x: 315.39375686645496, y: 420.52500915527327 }, { x: 280.3500061035155, y: 420.52500915527327 }, { x: 245.30625534057606, y: 420.52500915527327 }, { x: 210.26250457763663, y: 420.52500915527327 }, { x: 175.2187538146972, y: 420.52500915527327 }, { x: 140.17500305175776, y: 420.52500915527327 }, { x: 140.17500305175776, y: 420.52500915527327 }, { x: 140.17500305175776, y: 385.4812583923338 }, { x: 140.17500305175776, y: 350.4375076293944 }, { x: 140.17500305175776, y: 315.39375686645496 }, { x: 140.17500305175776, y: 280.3500061035155 }, { x: 140.17500305175776, y: 245.30625534057606 }, { x: 140.17500305175776, y: 210.26250457763663 }, { x: 140.17500305175776, y: 175.2187538146972 }, { x: 140.17500305175776, y: 140.17500305175776}],
			name: "square"
		},
		{
			points: [{ x: 420.52500915527327, y: 140.17500305175776 }, { x: 420.52500915527327, y: 175.2187538146972 }, { x: 420.52500915527327, y: 210.26250457763663 }, { x: 420.52500915527327, y: 245.30625534057606 }, { x: 420.52500915527327, y: 280.3500061035155 }, { x: 420.52500915527327, y: 315.39375686645496 }, { x: 420.52500915527327, y: 350.4375076293944 }, { x: 420.52500915527327, y: 385.4812583923338 }, { x: 420.52500915527327, y: 420.52500915527327 }, { x: 420.52500915527327, y: 420.52500915527327 }, { x: 385.4812583923338, y: 420.52500915527327 }, { x: 350.4375076293944, y: 420.52500915527327 }, { x: 315.39375686645496, y: 420.52500915527327 }, { x: 280.3500061035155, y: 420.52500915527327 }, { x: 245.30625534057606, y: 420.52500915527327 }, { x: 210.26250457763663, y: 420.52500915527327 }, { x: 175.2187538146972, y: 420.52500915527327 }, { x: 140.17500305175776, y: 420.52500915527327 }, { x: 140.17500305175776, y: 420.52500915527327 }, { x: 140.17500305175776, y: 385.4812583923338 }, { x: 140.17500305175776, y: 350.4375076293944 }, { x: 140.17500305175776, y: 315.39375686645496 }, { x: 140.17500305175776, y: 280.3500061035155 }, { x: 140.17500305175776, y: 245.30625534057606 }, { x: 140.17500305175776, y: 210.26250457763663 }, { x: 140.17500305175776, y: 175.2187538146972 }, { x: 140.17500305175776, y: 140.17500305175776 }, { x: 140.17500305175776, y: 140.17500305175776 }, { x: 175.2187538146972, y: 140.17500305175776 }, { x: 210.26250457763663, y: 140.17500305175776 }, { x: 245.30625534057606, y: 140.17500305175776 }, { x: 280.3500061035155, y: 140.17500305175776 }, { x: 315.39375686645496, y: 140.17500305175776 }, { x: 350.4375076293944, y: 140.17500305175776 }, { x: 385.4812583923338, y: 140.17500305175776 }, { x: 420.52500915527327, y: 140.17500305175776}],
			name: "square"
		},
		{
			points:  [{ x: 420.52500915527327, y: 420.52500915527327 }, { x: 385.4812583923338, y: 420.52500915527327 }, { x: 350.4375076293944, y: 420.52500915527327 }, { x: 315.39375686645496, y: 420.52500915527327 }, { x: 280.3500061035155, y: 420.52500915527327 }, { x: 245.30625534057606, y: 420.52500915527327 }, { x: 210.26250457763663, y: 420.52500915527327 }, { x: 175.2187538146972, y: 420.52500915527327 }, { x: 140.17500305175776, y: 420.52500915527327 }, { x: 140.17500305175776, y: 420.52500915527327 }, { x: 140.17500305175776, y: 385.4812583923338 }, { x: 140.17500305175776, y: 350.4375076293944 }, { x: 140.17500305175776, y: 315.39375686645496 }, { x: 140.17500305175776, y: 280.3500061035155 }, { x: 140.17500305175776, y: 245.30625534057606 }, { x: 140.17500305175776, y: 210.26250457763663 }, { x: 140.17500305175776, y: 175.2187538146972 }, { x: 140.17500305175776, y: 140.17500305175776 }, { x: 140.17500305175776, y: 140.17500305175776 }, { x: 175.2187538146972, y: 140.17500305175776 }, { x: 210.26250457763663, y: 140.17500305175776 }, { x: 245.30625534057606, y: 140.17500305175776 }, { x: 280.3500061035155, y: 140.17500305175776 }, { x: 315.39375686645496, y: 140.17500305175776 }, { x: 350.4375076293944, y: 140.17500305175776 }, { x: 385.4812583923338, y: 140.17500305175776 }, { x: 420.52500915527327, y: 140.17500305175776 }, { x: 420.52500915527327, y: 140.17500305175776 }, { x: 420.52500915527327, y: 175.2187538146972 }, { x: 420.52500915527327, y: 210.26250457763663 }, { x: 420.52500915527327, y: 245.30625534057606 }, { x: 420.52500915527327, y: 280.3500061035155 }, { x: 420.52500915527327, y: 315.39375686645496 }, { x: 420.52500915527327, y: 350.4375076293944 }, { x: 420.52500915527327, y: 385.4812583923338 }, { x: 420.52500915527327, y: 420.52500915527327}],
			name: "square"
		},
		{
			points: [{ x: 140.17500305175776, y: 420.52500915527327 }, { x: 140.17500305175776, y: 385.4812583923338 }, { x: 140.17500305175776, y: 350.4375076293944 }, { x: 140.17500305175776, y: 315.39375686645496 }, { x: 140.17500305175776, y: 280.3500061035155 }, { x: 140.17500305175776, y: 245.30625534057606 }, { x: 140.17500305175776, y: 210.26250457763663 }, { x: 140.17500305175776, y: 175.2187538146972 }, { x: 140.17500305175776, y: 140.17500305175776 }, { x: 140.17500305175776, y: 140.17500305175776 }, { x: 175.2187538146972, y: 140.17500305175776 }, { x: 210.26250457763663, y: 140.17500305175776 }, { x: 245.30625534057606, y: 140.17500305175776 }, { x: 280.3500061035155, y: 140.17500305175776 }, { x: 315.39375686645496, y: 140.17500305175776 }, { x: 350.4375076293944, y: 140.17500305175776 }, { x: 385.4812583923338, y: 140.17500305175776 }, { x: 420.52500915527327, y: 140.17500305175776 }, { x: 420.52500915527327, y: 140.17500305175776 }, { x: 420.52500915527327, y: 175.2187538146972 }, { x: 420.52500915527327, y: 210.26250457763663 }, { x: 420.52500915527327, y: 245.30625534057606 }, { x: 420.52500915527327, y: 280.3500061035155 }, { x: 420.52500915527327, y: 315.39375686645496 }, { x: 420.52500915527327, y: 350.4375076293944 }, { x: 420.52500915527327, y: 385.4812583923338 }, { x: 420.52500915527327, y: 420.52500915527327 }, { x: 420.52500915527327, y: 420.52500915527327 }, { x: 385.4812583923338, y: 420.52500915527327 }, { x: 350.4375076293944, y: 420.52500915527327 }, { x: 315.39375686645496, y: 420.52500915527327 }, { x: 280.3500061035155, y: 420.52500915527327 }, { x: 245.30625534057606, y: 420.52500915527327 }, { x: 210.26250457763663, y: 420.52500915527327 }, { x: 175.2187538146972, y: 420.52500915527327 }, { x: 140.17500305175776, y: 420.52500915527327}],
			name: "square"
		},
		{
			points:  [{ x: 140.17500305175776, y: 420.52500915527327 }, { x: 175.2187538146972, y: 420.52500915527327 }, { x: 210.26250457763663, y: 420.52500915527327 }, { x: 245.30625534057606, y: 420.52500915527327 }, { x: 280.3500061035155, y: 420.52500915527327 }, { x: 315.39375686645496, y: 420.52500915527327 }, { x: 350.4375076293944, y: 420.52500915527327 }, { x: 385.4812583923338, y: 420.52500915527327 }, { x: 420.52500915527327, y: 420.52500915527327 }, { x: 420.52500915527327, y: 420.52500915527327 }, { x: 420.52500915527327, y: 385.4812583923338 }, { x: 420.52500915527327, y: 350.4375076293944 }, { x: 420.52500915527327, y: 315.39375686645496 }, { x: 420.52500915527327, y: 280.3500061035155 }, { x: 420.52500915527327, y: 245.30625534057606 }, { x: 420.52500915527327, y: 210.26250457763663 }, { x: 420.52500915527327, y: 175.2187538146972 }, { x: 420.52500915527327, y: 140.17500305175776 }, { x: 420.52500915527327, y: 140.17500305175776 }, { x: 385.4812583923338, y: 140.17500305175776 }, { x: 350.4375076293944, y: 140.17500305175776 }, { x: 315.39375686645496, y: 140.17500305175776 }, { x: 280.3500061035155, y: 140.17500305175776 }, { x: 245.30625534057606, y: 140.17500305175776 }, { x: 210.26250457763663, y: 140.17500305175776 }, { x: 175.2187538146972, y: 140.17500305175776 }, { x: 140.17500305175776, y: 140.17500305175776 }, { x: 140.17500305175776, y: 140.17500305175776 }, { x: 140.17500305175776, y: 175.2187538146972 }, { x: 140.17500305175776, y: 210.26250457763663 }, { x: 140.17500305175776, y: 245.30625534057606 }, { x: 140.17500305175776, y: 280.3500061035155 }, { x: 140.17500305175776, y: 315.39375686645496 }, { x: 140.17500305175776, y: 350.4375076293944 }, { x: 140.17500305175776, y: 385.4812583923338 }, { x: 140.17500305175776, y: 420.52500915527327}],
			name: "square"
		},
		{
			points:  [{ x: 420.52500915527327, y: 420.52500915527327 }, { x: 420.52500915527327, y: 385.4812583923338 }, { x: 420.52500915527327, y: 350.4375076293944 }, { x: 420.52500915527327, y: 315.39375686645496 }, { x: 420.52500915527327, y: 280.3500061035155 }, { x: 420.52500915527327, y: 245.30625534057606 }, { x: 420.52500915527327, y: 210.26250457763663 }, { x: 420.52500915527327, y: 175.2187538146972 }, { x: 420.52500915527327, y: 140.17500305175776 }, { x: 420.52500915527327, y: 140.17500305175776 }, { x: 385.4812583923338, y: 140.17500305175776 }, { x: 350.4375076293944, y: 140.17500305175776 }, { x: 315.39375686645496, y: 140.17500305175776 }, { x: 280.3500061035155, y: 140.17500305175776 }, { x: 245.30625534057606, y: 140.17500305175776 }, { x: 210.26250457763663, y: 140.17500305175776 }, { x: 175.2187538146972, y: 140.17500305175776 }, { x: 140.17500305175776, y: 140.17500305175776 }, { x: 140.17500305175776, y: 140.17500305175776 }, { x: 140.17500305175776, y: 175.2187538146972 }, { x: 140.17500305175776, y: 210.26250457763663 }, { x: 140.17500305175776, y: 245.30625534057606 }, { x: 140.17500305175776, y: 280.3500061035155 }, { x: 140.17500305175776, y: 315.39375686645496 }, { x: 140.17500305175776, y: 350.4375076293944 }, { x: 140.17500305175776, y: 385.4812583923338 }, { x: 140.17500305175776, y: 420.52500915527327 }, { x: 140.17500305175776, y: 420.52500915527327 }, { x: 175.2187538146972, y: 420.52500915527327 }, { x: 210.26250457763663, y: 420.52500915527327 }, { x: 245.30625534057606, y: 420.52500915527327 }, { x: 280.3500061035155, y: 420.52500915527327 }, { x: 315.39375686645496, y: 420.52500915527327 }, { x: 350.4375076293944, y: 420.52500915527327 }, { x: 385.4812583923338, y: 420.52500915527327 }, { x: 420.52500915527327, y: 420.52500915527327}],
			name: "square"
		},
		{
			points: [{ x: 420.52500915527327, y: 140.17500305175776 }, { x: 385.4812583923338, y: 140.17500305175776 }, { x: 350.4375076293944, y: 140.17500305175776 }, { x: 315.39375686645496, y: 140.17500305175776 }, { x: 280.3500061035155, y: 140.17500305175776 }, { x: 245.30625534057606, y: 140.17500305175776 }, { x: 210.26250457763663, y: 140.17500305175776 }, { x: 175.2187538146972, y: 140.17500305175776 }, { x: 140.17500305175776, y: 140.17500305175776 }, { x: 140.17500305175776, y: 140.17500305175776 }, { x: 140.17500305175776, y: 175.2187538146972 }, { x: 140.17500305175776, y: 210.26250457763663 }, { x: 140.17500305175776, y: 245.30625534057606 }, { x: 140.17500305175776, y: 280.3500061035155 }, { x: 140.17500305175776, y: 315.39375686645496 }, { x: 140.17500305175776, y: 350.4375076293944 }, { x: 140.17500305175776, y: 385.4812583923338 }, { x: 140.17500305175776, y: 420.52500915527327 }, { x: 140.17500305175776, y: 420.52500915527327 }, { x: 175.2187538146972, y: 420.52500915527327 }, { x: 210.26250457763663, y: 420.52500915527327 }, { x: 245.30625534057606, y: 420.52500915527327 }, { x: 280.3500061035155, y: 420.52500915527327 }, { x: 315.39375686645496, y: 420.52500915527327 }, { x: 350.4375076293944, y: 420.52500915527327 }, { x: 385.4812583923338, y: 420.52500915527327 }, { x: 420.52500915527327, y: 420.52500915527327 }, { x: 420.52500915527327, y: 420.52500915527327 }, { x: 420.52500915527327, y: 385.4812583923338 }, { x: 420.52500915527327, y: 350.4375076293944 }, { x: 420.52500915527327, y: 315.39375686645496 }, { x: 420.52500915527327, y: 280.3500061035155 }, { x: 420.52500915527327, y: 245.30625534057606 }, { x: 420.52500915527327, y: 210.26250457763663 }, { x: 420.52500915527327, y: 175.2187538146972 }, { x: 420.52500915527327, y: 140.17500305175776}],
			name: "square"
		},
		{
			points: [{ x: 140.17500305175776, y: 140.17500305175776 }, { x: 140.17500305175776, y: 175.2187538146972 }, { x: 140.17500305175776, y: 210.26250457763663 }, { x: 140.17500305175776, y: 245.30625534057606 }, { x: 140.17500305175776, y: 280.3500061035155 }, { x: 140.17500305175776, y: 315.39375686645496 }, { x: 140.17500305175776, y: 350.4375076293944 }, { x: 140.17500305175776, y: 385.4812583923338 }, { x: 140.17500305175776, y: 420.52500915527327 }, { x: 140.17500305175776, y: 420.52500915527327 }, { x: 175.2187538146972, y: 420.52500915527327 }, { x: 210.26250457763663, y: 420.52500915527327 }, { x: 245.30625534057606, y: 420.52500915527327 }, { x: 280.3500061035155, y: 420.52500915527327 }, { x: 315.39375686645496, y: 420.52500915527327 }, { x: 350.4375076293944, y: 420.52500915527327 }, { x: 385.4812583923338, y: 420.52500915527327 }, { x: 420.52500915527327, y: 420.52500915527327 }, { x: 420.52500915527327, y: 420.52500915527327 }, { x: 420.52500915527327, y: 385.4812583923338 }, { x: 420.52500915527327, y: 350.4375076293944 }, { x: 420.52500915527327, y: 315.39375686645496 }, { x: 420.52500915527327, y: 280.3500061035155 }, { x: 420.52500915527327, y: 245.30625534057606 }, { x: 420.52500915527327, y: 210.26250457763663 }, { x: 420.52500915527327, y: 175.2187538146972 }, { x: 420.52500915527327, y: 140.17500305175776 }, { x: 420.52500915527327, y: 140.17500305175776 }, { x: 385.4812583923338, y: 140.17500305175776 }, { x: 350.4375076293944, y: 140.17500305175776 }, { x: 315.39375686645496, y: 140.17500305175776 }, { x: 280.3500061035155, y: 140.17500305175776 }, { x: 245.30625534057606, y: 140.17500305175776 }, { x: 210.26250457763663, y: 140.17500305175776 }, { x: 175.2187538146972, y: 140.17500305175776 }, { x: 140.17500305175776, y: 140.17500305175776}],
			name: "square"
		},
		{
			points: [{ x: 420.52500915527327, y: 280.3500061035155 }, { x: 418.3954358873965, y: 304.69113993790967 }, { x: 412.07142208989444, y: 328.29268073795373 }, { x: 401.74511972189896, y: 350.43750762939436 }, { x: 387.73028825550034, y: 370.4527612529582 }, { x: 370.4527612529582, y: 387.73028825550034 }, { x: 350.4375076293944, y: 401.74511972189896 }, { x: 328.2926807379538, y: 412.07142208989444 }, { x: 304.69113993790967, y: 418.3954358873965 }, { x: 280.3500061035155, y: 420.52500915527327 }, { x: 256.0088722691214, y: 418.3954358873965 }, { x: 232.4073314690773, y: 412.07142208989444 }, { x: 210.26250457763666, y: 401.74511972189896 }, { x: 190.2472509540728, y: 387.73028825550034 }, { x: 172.9697239515307, y: 370.4527612529582 }, { x: 158.95489248513206, y: 350.43750762939436 }, { x: 148.62859011713658, y: 328.2926807379538 }, { x: 142.30457631963455, y: 304.6911399379096 }, { x: 140.17500305175776, y: 280.3500061035155 }, { x: 142.30457631963455, y: 256.00887226912135 }, { x: 148.62859011713655, y: 232.4073314690773 }, { x: 158.9548924851321, y: 210.2625045776366 }, { x: 172.96972395153068, y: 190.2472509540728 }, { x: 190.24725095407277, y: 172.9697239515307 }, { x: 210.26250457763658, y: 158.95489248513212 }, { x: 232.40733146907718, y: 148.62859011713658 }, { x: 256.00887226912135, y: 142.30457631963455 }, { x: 280.3500061035155, y: 140.17500305175776 }, { x: 304.6911399379096, y: 142.30457631963455 }, { x: 328.2926807379537, y: 148.62859011713653 }, { x: 350.4375076293944, y: 158.9548924851321 }, { x: 370.4527612529582, y: 172.96972395153068 }, { x: 387.73028825550034, y: 190.24725095407274 }, { x: 401.7451197218989, y: 210.26250457763658 }, { x: 412.07142208989444, y: 232.4073314690773 }, { x: 418.39543588739645, y: 256.00887226912124 }, { x: 420.52500915527327, y: 280.35000610351545}],
			name: "circle"
		},
		{
			points: [{ x: 420.52500915527327, y: 280.3500061035155 }, { x: 418.3954358873965, y: 256.00887226912135 }, { x: 412.07142208989444, y: 232.4073314690773 }, { x: 401.74511972189896, y: 210.26250457763666 }, { x: 387.73028825550034, y: 190.2472509540728 }, { x: 370.4527612529582, y: 172.96972395153068 }, { x: 350.4375076293944, y: 158.9548924851321 }, { x: 328.2926807379538, y: 148.62859011713658 }, { x: 304.69113993790967, y: 142.30457631963455 }, { x: 280.3500061035155, y: 140.17500305175776 }, { x: 256.0088722691214, y: 142.30457631963455 }, { x: 232.4073314690773, y: 148.62859011713655 }, { x: 210.26250457763666, y: 158.95489248513206 }, { x: 190.2472509540728, y: 172.96972395153068 }, { x: 172.9697239515307, y: 190.24725095407277 }, { x: 158.95489248513206, y: 210.26250457763666 }, { x: 148.62859011713658, y: 232.40733146907723 }, { x: 142.30457631963455, y: 256.0088722691214 }, { x: 140.17500305175776, y: 280.3500061035155 }, { x: 142.30457631963455, y: 304.69113993790967 }, { x: 148.62859011713655, y: 328.29268073795373 }, { x: 158.9548924851321, y: 350.4375076293944 }, { x: 172.96972395153068, y: 370.4527612529582 }, { x: 190.24725095407277, y: 387.73028825550034 }, { x: 210.26250457763658, y: 401.7451197218989 }, { x: 232.40733146907718, y: 412.07142208989444 }, { x: 256.00887226912135, y: 418.3954358873965 }, { x: 280.3500061035155, y: 420.52500915527327 }, { x: 304.6911399379096, y: 418.3954358873965 }, { x: 328.2926807379537, y: 412.0714220898945 }, { x: 350.4375076293944, y: 401.74511972189896 }, { x: 370.4527612529582, y: 387.73028825550034 }, { x: 387.73028825550034, y: 370.4527612529583 }, { x: 401.7451197218989, y: 350.4375076293944 }, { x: 412.07142208989444, y: 328.29268073795373 }, { x: 418.39543588739645, y: 304.6911399379098 }, { x: 420.52500915527327, y: 280.35000610351557}],
			name: "circle"
		},
		{
			points: [{ x: 140.17500305175776, y: 280.3500061035155 }, { x: 142.30457631963455, y: 256.00887226912135 }, { x: 148.62859011713655, y: 232.4073314690773 }, { x: 158.95489248513206, y: 210.26250457763666 }, { x: 172.96972395153068, y: 190.2472509540728 }, { x: 190.2472509540728, y: 172.96972395153068 }, { x: 210.2625045776366, y: 158.9548924851321 }, { x: 232.40733146907726, y: 148.62859011713658 }, { x: 256.00887226912135, y: 142.30457631963455 }, { x: 280.3500061035155, y: 140.17500305175776 }, { x: 304.6911399379096, y: 142.30457631963455 }, { x: 328.29268073795373, y: 148.62859011713655 }, { x: 350.43750762939436, y: 158.95489248513206 }, { x: 370.4527612529582, y: 172.96972395153068 }, { x: 387.73028825550034, y: 190.24725095407277 }, { x: 401.74511972189896, y: 210.26250457763666 }, { x: 412.07142208989444, y: 232.40733146907723 }, { x: 418.3954358873965, y: 256.0088722691214 }, { x: 420.52500915527327, y: 280.3500061035155 }, { x: 418.3954358873965, y: 304.69113993790967 }, { x: 412.07142208989444, y: 328.29268073795373 }, { x: 401.74511972189896, y: 350.4375076293944 }, { x: 387.73028825550034, y: 370.4527612529582 }, { x: 370.4527612529582, y: 387.73028825550034 }, { x: 350.4375076293944, y: 401.7451197218989 }, { x: 328.29268073795384, y: 412.07142208989444 }, { x: 304.69113993790967, y: 418.3954358873965 }, { x: 280.3500061035155, y: 420.52500915527327 }, { x: 256.0088722691214, y: 418.3954358873965 }, { x: 232.40733146907735, y: 412.0714220898945 }, { x: 210.2625045776366, y: 401.74511972189896 }, { x: 190.2472509540728, y: 387.73028825550034 }, { x: 172.9697239515307, y: 370.4527612529583 }, { x: 158.95489248513212, y: 350.4375076293944 }, { x: 148.62859011713655, y: 328.29268073795373 }, { x: 142.30457631963458, y: 304.6911399379098 }, { x: 140.17500305175776, y: 280.35000610351557}],
			name: "circle"
		},
		{
			points: [{ x: 140.17500305175776, y: 280.3500061035155 }, { x: 142.30457631963455, y: 304.69113993790967 }, { x: 148.62859011713655, y: 328.29268073795373 }, { x: 158.95489248513206, y: 350.43750762939436 }, { x: 172.96972395153068, y: 370.4527612529582 }, { x: 190.2472509540728, y: 387.73028825550034 }, { x: 210.2625045776366, y: 401.74511972189896 }, { x: 232.40733146907726, y: 412.07142208989444 }, { x: 256.00887226912135, y: 418.3954358873965 }, { x: 280.3500061035155, y: 420.52500915527327 }, { x: 304.6911399379096, y: 418.3954358873965 }, { x: 328.29268073795373, y: 412.07142208989444 }, { x: 350.43750762939436, y: 401.74511972189896 }, { x: 370.4527612529582, y: 387.73028825550034 }, { x: 387.73028825550034, y: 370.4527612529582 }, { x: 401.74511972189896, y: 350.43750762939436 }, { x: 412.07142208989444, y: 328.2926807379538 }, { x: 418.3954358873965, y: 304.6911399379096 }, { x: 420.52500915527327, y: 280.3500061035155 }, { x: 418.3954358873965, y: 256.00887226912135 }, { x: 412.07142208989444, y: 232.4073314690773 }, { x: 401.74511972189896, y: 210.2625045776366 }, { x: 387.73028825550034, y: 190.2472509540728 }, { x: 370.4527612529582, y: 172.9697239515307 }, { x: 350.4375076293944, y: 158.95489248513212 }, { x: 328.29268073795384, y: 148.62859011713658 }, { x: 304.69113993790967, y: 142.30457631963455 }, { x: 280.3500061035155, y: 140.17500305175776 }, { x: 256.0088722691214, y: 142.30457631963455 }, { x: 232.40733146907735, y: 148.62859011713653 }, { x: 210.2625045776366, y: 158.9548924851321 }, { x: 190.2472509540728, y: 172.96972395153068 }, { x: 172.9697239515307, y: 190.24725095407274 }, { x: 158.95489248513212, y: 210.26250457763658 }, { x: 148.62859011713655, y: 232.4073314690773 }, { x: 142.30457631963458, y: 256.00887226912124 }, { x: 140.17500305175776, y: 280.35000610351545}],
			name: "circle"
		},
		{
			points: [{ x: 280.3500061035155, y: 420.52500915527327 }, { x: 304.6911399379096, y: 418.3954358873965 }, { x: 328.29268073795373, y: 412.07142208989444 }, { x: 350.43750762939436, y: 401.74511972189896 }, { x: 370.4527612529582, y: 387.73028825550034 }, { x: 387.73028825550034, y: 370.4527612529582 }, { x: 401.74511972189896, y: 350.43750762939436 }, { x: 412.07142208989444, y: 328.2926807379538 }, { x: 418.3954358873965, y: 304.6911399379096 }, { x: 420.52500915527327, y: 280.3500061035155 }, { x: 418.3954358873965, y: 256.00887226912135 }, { x: 412.07142208989444, y: 232.4073314690773 }, { x: 401.74511972189896, y: 210.2625045776366 }, { x: 387.73028825550034, y: 190.2472509540728 }, { x: 370.4527612529582, y: 172.9697239515307 }, { x: 350.4375076293944, y: 158.95489248513212 }, { x: 328.29268073795384, y: 148.62859011713658 }, { x: 304.69113993790967, y: 142.30457631963455 }, { x: 280.3500061035155, y: 140.17500305175776 }, { x: 256.0088722691214, y: 142.30457631963455 }, { x: 232.40733146907735, y: 148.62859011713653 }, { x: 210.2625045776366, y: 158.9548924851321 }, { x: 190.2472509540728, y: 172.96972395153068 }, { x: 172.9697239515307, y: 190.24725095407274 }, { x: 158.95489248513212, y: 210.26250457763658 }, { x: 148.62859011713655, y: 232.4073314690773 }, { x: 142.30457631963458, y: 256.00887226912124 }, { x: 140.17500305175776, y: 280.35000610351545 }, { x: 142.30457631963455, y: 304.6911399379096 }, { x: 148.62859011713658, y: 328.2926807379538 }, { x: 158.954892485132, y: 350.4375076293943 }, { x: 172.96972395153068, y: 370.4527612529582 }, { x: 190.24725095407274, y: 387.7302882555003 }, { x: 210.26250457763666, y: 401.74511972189896 }, { x: 232.40733146907718, y: 412.07142208989444 }, { x: 256.00887226912135, y: 418.3954358873965 }, { x: 280.35000610351545, y: 420.52500915527327}],
			name: "circle"
		},
		{
			points: [{ x: 280.3500061035155, y: 140.17500305175776 }, { x: 304.6911399379096, y: 142.30457631963455 }, { x: 328.29268073795373, y: 148.62859011713655 }, { x: 350.43750762939436, y: 158.95489248513206 }, { x: 370.4527612529582, y: 172.96972395153068 }, { x: 387.73028825550034, y: 190.24725095407277 }, { x: 401.74511972189896, y: 210.26250457763666 }, { x: 412.07142208989444, y: 232.40733146907723 }, { x: 418.3954358873965, y: 256.0088722691214 }, { x: 420.52500915527327, y: 280.3500061035155 }, { x: 418.3954358873965, y: 304.69113993790967 }, { x: 412.07142208989444, y: 328.29268073795373 }, { x: 401.74511972189896, y: 350.4375076293944 }, { x: 387.73028825550034, y: 370.4527612529582 }, { x: 370.4527612529582, y: 387.73028825550034 }, { x: 350.4375076293944, y: 401.7451197218989 }, { x: 328.29268073795384, y: 412.07142208989444 }, { x: 304.69113993790967, y: 418.3954358873965 }, { x: 280.3500061035155, y: 420.52500915527327 }, { x: 256.0088722691214, y: 418.3954358873965 }, { x: 232.40733146907735, y: 412.0714220898945 }, { x: 210.2625045776366, y: 401.74511972189896 }, { x: 190.2472509540728, y: 387.73028825550034 }, { x: 172.9697239515307, y: 370.4527612529583 }, { x: 158.95489248513212, y: 350.4375076293944 }, { x: 148.62859011713655, y: 328.29268073795373 }, { x: 142.30457631963458, y: 304.6911399379098 }, { x: 140.17500305175776, y: 280.35000610351557 }, { x: 142.30457631963455, y: 256.0088722691214 }, { x: 148.62859011713658, y: 232.40733146907723 }, { x: 158.954892485132, y: 210.26250457763672 }, { x: 172.96972395153068, y: 190.2472509540728 }, { x: 190.24725095407274, y: 172.96972395153074 }, { x: 210.26250457763666, y: 158.95489248513206 }, { x: 232.40733146907718, y: 148.6285901171366 }, { x: 256.00887226912135, y: 142.30457631963455 }, { x: 280.35000610351545, y: 140.17500305175776}],
			name: "circle"
		},
		{
			points: [{ x: 280.3500061035155, y: 140.17500305175776 }, { x: 256.0088722691214, y: 142.30457631963455 }, { x: 232.4073314690773, y: 148.62859011713655 }, { x: 210.26250457763666, y: 158.95489248513206 }, { x: 190.2472509540728, y: 172.96972395153068 }, { x: 172.9697239515307, y: 190.24725095407277 }, { x: 158.95489248513206, y: 210.26250457763666 }, { x: 148.62859011713658, y: 232.40733146907723 }, { x: 142.30457631963455, y: 256.0088722691214 }, { x: 140.17500305175776, y: 280.3500061035155 }, { x: 142.30457631963455, y: 304.69113993790967 }, { x: 148.62859011713655, y: 328.29268073795373 }, { x: 158.9548924851321, y: 350.4375076293944 }, { x: 172.96972395153068, y: 370.4527612529582 }, { x: 190.24725095407277, y: 387.73028825550034 }, { x: 210.26250457763658, y: 401.7451197218989 }, { x: 232.40733146907718, y: 412.07142208989444 }, { x: 256.00887226912135, y: 418.3954358873965 }, { x: 280.3500061035155, y: 420.52500915527327 }, { x: 304.6911399379096, y: 418.3954358873965 }, { x: 328.2926807379537, y: 412.0714220898945 }, { x: 350.4375076293944, y: 401.74511972189896 }, { x: 370.4527612529582, y: 387.73028825550034 }, { x: 387.73028825550034, y: 370.4527612529583 }, { x: 401.7451197218989, y: 350.4375076293944 }, { x: 412.07142208989444, y: 328.29268073795373 }, { x: 418.39543588739645, y: 304.6911399379098 }, { x: 420.52500915527327, y: 280.35000610351557 }, { x: 418.3954358873965, y: 256.0088722691214 }, { x: 412.07142208989444, y: 232.40733146907723 }, { x: 401.745119721899, y: 210.26250457763672 }, { x: 387.73028825550034, y: 190.2472509540728 }, { x: 370.4527612529583, y: 172.96972395153074 }, { x: 350.43750762939436, y: 158.95489248513206 }, { x: 328.29268073795384, y: 148.6285901171366 }, { x: 304.69113993790967, y: 142.30457631963455 }, { x: 280.35000610351557, y: 140.17500305175776}],
			name: "circle"
		},
		{
			points: [{ x: 280.3500061035155, y: 420.52500915527327 }, { x: 256.0088722691214, y: 418.3954358873965 }, { x: 232.4073314690773, y: 412.07142208989444 }, { x: 210.26250457763666, y: 401.74511972189896 }, { x: 190.2472509540728, y: 387.73028825550034 }, { x: 172.9697239515307, y: 370.4527612529582 }, { x: 158.95489248513206, y: 350.43750762939436 }, { x: 148.62859011713658, y: 328.2926807379538 }, { x: 142.30457631963455, y: 304.6911399379096 }, { x: 140.17500305175776, y: 280.3500061035155 }, { x: 142.30457631963455, y: 256.00887226912135 }, { x: 148.62859011713655, y: 232.4073314690773 }, { x: 158.9548924851321, y: 210.2625045776366 }, { x: 172.96972395153068, y: 190.2472509540728 }, { x: 190.24725095407277, y: 172.9697239515307 }, { x: 210.26250457763658, y: 158.95489248513212 }, { x: 232.40733146907718, y: 148.62859011713658 }, { x: 256.00887226912135, y: 142.30457631963455 }, { x: 280.3500061035155, y: 140.17500305175776 }, { x: 304.6911399379096, y: 142.30457631963455 }, { x: 328.2926807379537, y: 148.62859011713653 }, { x: 350.4375076293944, y: 158.9548924851321 }, { x: 370.4527612529582, y: 172.96972395153068 }, { x: 387.73028825550034, y: 190.24725095407274 }, { x: 401.7451197218989, y: 210.26250457763658 }, { x: 412.07142208989444, y: 232.4073314690773 }, { x: 418.39543588739645, y: 256.00887226912124 }, { x: 420.52500915527327, y: 280.35000610351545 }, { x: 418.3954358873965, y: 304.6911399379096 }, { x: 412.07142208989444, y: 328.2926807379538 }, { x: 401.745119721899, y: 350.4375076293943 }, { x: 387.73028825550034, y: 370.4527612529582 }, { x: 370.4527612529583, y: 387.7302882555003 }, { x: 350.43750762939436, y: 401.74511972189896 }, { x: 328.29268073795384, y: 412.07142208989444 }, { x: 304.69113993790967, y: 418.3954358873965 }, { x: 280.35000610351557, y: 420.52500915527327}],
			name: "circle"
		}
	];

	ShapeDetector.prototype.spot = function (points, patternName) {

		if (patternName == null) {
			patternName = '';
		}

		var distance, pattern, score;
		var stroke = new Stroke(points);
		var bestDistance = +Infinity;
		var bestPattern = null;
		var bestScore = 0;

		for (var i = 0; i < this.patterns.length; i++) {
			pattern = this.patterns[i];

			if (pattern.name.indexOf(patternName) > -1) {
				distance = stroke.distanceAtBestAngle(pattern);
				score = 1.0 - distance / _halfDiagonal;

				if (distance < bestDistance && score > this.threshold) {
					bestDistance = distance;
					bestPattern = pattern.name;
					bestScore = score;
				}
			}
		}

		return { pattern: bestPattern, score: bestScore };
	};

	ShapeDetector.prototype.learn = function (name, points) {

		return this.patterns.push(new Stroke(points, name));
	};

	return ShapeDetector;
}));
},{}],6:[function(require,module,exports){
"use strict";
// Packaging and re-exporting of prague UI framework
Object.defineProperty(exports, "__esModule", { value: true });
const ui = require("../ui");
exports.ui = ui;
const controls = require("../controls");
exports.controls = controls;

},{"../controls":17,"../ui":41}],7:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ui = require("../ui");
/**
 * Stack panel
 */
class Button extends ui.Component {
    constructor(element, desiredSize, classList) {
        super(element);
        this.desiredSize = desiredSize;
        const button = document.createElement("button");
        button.classList.add(...classList);
        element.appendChild(button);
        button.onclick = (mouseEvent) => {
            this.emit("click", mouseEvent);
        };
    }
    /**
     * Returns a size whose height is capped to the max child height
     */
    measure(size) {
        return {
            height: Math.min(size.height, this.desiredSize.height),
            width: Math.min(size.width, this.desiredSize.width),
        };
    }
}
exports.Button = Button;

},{"../ui":41}],8:[function(require,module,exports){
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
const ui = require("../ui");
class Chart extends ui.Component {
    constructor(element, cell) {
        super(element);
        this.cell = cell;
        this.lastSize = { width: -1, height: -1 };
        // tslint:disable-next-line:no-string-literal
        const Microsoft = typeof window !== "undefined" ? window["Microsoft"] : undefined;
        const DefaultHost = (Microsoft && Microsoft.Charts) ?
            new Microsoft.Charts.Host({ base: "https://charts.microsoft.com" }) : null;
        this.chart = new Microsoft.Charts.Chart(DefaultHost, element);
        this.chart.setRenderer(Microsoft.Charts.IvyRenderer.Svg);
        this.cell.on("valueChanged", () => {
            this.invalidateChart();
        });
    }
    resizeCore(rectangle) {
        if (rectangle.width !== this.lastSize.width || rectangle.height !== this.lastSize.height) {
            this.lastSize.width = rectangle.width;
            this.lastSize.height = rectangle.height;
            this.invalidateChart();
        }
    }
    getChartConfiguration() {
        return __awaiter(this, void 0, void 0, function* () {
            const config = yield this.cell.get();
            if (!config) {
                return null;
            }
            else {
                const size = this.size.size;
                config.size = size;
                return config;
            }
        });
    }
    invalidateChart() {
        this.getChartConfiguration().then((config) => {
            if (config) {
                this.chart.setConfiguration(config);
            }
        });
    }
}
exports.Chart = Chart;

},{"../ui":41}],9:[function(require,module,exports){
(function (global){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_api_1 = (typeof window !== "undefined" ? window['prague'] : typeof global !== "undefined" ? global['prague'] : null);
exports.debug = client_api_1.debug("routerlicious:controls");

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{}],10:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ui = require("../ui");
/**
 * Basic dock panel control
 */
class DockPanel extends ui.Component {
    constructor(element) {
        super(element);
    }
    addContent(content) {
        this.content = content;
        this.updateChildren();
    }
    addBottom(bottom) {
        this.bottom = bottom;
        this.updateChildren();
    }
    addTop(top) {
        this.top = top;
        this.updateChildren();
    }
    resizeCore(bounds) {
        let bottomOffset = 0;
        if (this.bottom) {
            const result = this.bottom.measure(bounds.size);
            bottomOffset = result.height;
        }
        let topOffset = 0;
        if (this.top) {
            const result = this.top.measure(bounds.size);
            topOffset = result.height;
        }
        let split = bounds.nipVertTopBottom(topOffset, bottomOffset);
        this.updateChildBoundsIfExists(this.top, split[0]);
        this.updateChildBoundsIfExists(this.content, split[1]);
        this.updateChildBoundsIfExists(this.bottom, split[2]);
    }
    /**
     * Updates the list of children and then forces a resize
     */
    updateChildren() {
        this.removeAllChildren();
        ui.removeAllChildren(this.element);
        this.addChildIfExists(this.content);
        this.addChildIfExists(this.bottom);
        this.addChildIfExists(this.top);
        this.resizeCore(this.size);
    }
    addChildIfExists(child) {
        if (child) {
            this.addChild(child);
            this.element.appendChild(child.element);
        }
    }
    updateChildBoundsIfExists(child, bounds) {
        if (child) {
            bounds.conformElement(child.element);
            child.resize(bounds);
        }
    }
}
exports.DockPanel = DockPanel;

},{"../ui":41}],11:[function(require,module,exports){
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
const ui = require("../ui");
/**
 * Basic collaborative video player
 */
class FlexVideo extends ui.Component {
    constructor(element, vid, videoRoot) {
        super(element);
        this.videoRoot = videoRoot;
        this.video = document.createElement("video");
        this.video.src = vid;
        this.video.controls = true;
        this.video.width = 320;
        this.video.height = 240;
        this.video.autoplay = false;
        this.video.poster = "https://i.pinimg.com/originals/1b/2d/d0/1b2dd03413192c57f8a097969d67d861.jpg";
        element.appendChild(this.video);
        this.setEventHandlers();
    }
    setEventHandlers() {
        return __awaiter(this, void 0, void 0, function* () {
            this.videoMap = yield this.videoRoot;
            this.videoMapView = yield this.videoMap.getView();
            this.video.onplay = () => this.handlePlay();
            this.video.onpause = () => this.handlePause();
            this.video.ontimeupdate = () => this.handleTimeUpdate();
            this.video.onload = () => this.handleLoad();
            this.videoMap.on("valueChanged", (changedValue) => __awaiter(this, void 0, void 0, function* () {
                switch (changedValue.key) {
                    case ("play"):
                        this.updatePlay(this.videoMapView.get(changedValue.key));
                        break;
                    case ("time"):
                        this.updateTime(this.videoMapView.get(changedValue.key));
                        break;
                    default:
                        console.log("default: " + changedValue.key);
                        break;
                }
            }));
        });
    }
    updatePlay(play) {
        if (play) {
            if (this.video.paused) {
                this.video.play();
            }
        }
        else {
            if (!this.video.paused) {
                this.video.pause();
            }
        }
    }
    updateTime(time) {
        if (Math.abs(this.video.currentTime - time) > 2) {
            this.video.currentTime = time;
        }
    }
    handleLoad() {
        this.videoMap.get("time").then((time) => {
            this.video.currentTime = time;
        });
        this.videoMap.get("play").then((play) => {
            this.updatePlay(play);
        });
    }
    handleTimeUpdate() {
        this.videoMap.set("time", this.video.currentTime);
    }
    handlePlay() {
        this.videoMap.set("play", true);
    }
    handlePause() {
        this.videoMap.set("play", false);
    }
}
exports.FlexVideo = FlexVideo;

},{"../ui":41}],12:[function(require,module,exports){
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
const ui = require("../ui");
const flexVideo_1 = require("./flexVideo");
/**
 * flex video app
 */
class FlexVideoCanvas extends ui.Component {
    constructor(element, doc, root) {
        super(element);
        const videoFrame = document.createElement("div");
        element.appendChild(videoFrame);
        this.video = new flexVideo_1.FlexVideo(videoFrame, "http://video.webmfiles.org/big-buck-bunny_trailer.webm", this.fetchVideoRoot(root, doc));
        this.addChild(this.video);
    }
    fetchVideoRoot(root, doc) {
        return __awaiter(this, void 0, void 0, function* () {
            const hasVideo = yield root.has("video");
            if (!hasVideo) {
                root.set("video", doc.createMap());
            }
            return root.get("video");
        });
    }
}
exports.FlexVideoCanvas = FlexVideoCanvas;

},{"../ui":41,"./flexVideo":11}],13:[function(require,module,exports){
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
const ui = require("../ui");
const button_1 = require("./button");
const chart_1 = require("./chart");
const debug_1 = require("./debug");
const dockPanel_1 = require("./dockPanel");
const inkCanvas_1 = require("./inkCanvas");
const popup_1 = require("./popup");
const stackPanel_1 = require("./stackPanel");
const colors = [
    { r: 253 / 255, g: 0 / 255, b: 12 / 255, a: 1 },
    { r: 134 / 255, g: 0 / 255, b: 56 / 255, a: 1 },
    { r: 253 / 255, g: 187 / 255, b: 48 / 255, a: 1 },
    { r: 255 / 255, g: 255 / 255, b: 81 / 255, a: 1 },
    { r: 0 / 255, g: 45 / 255, b: 98 / 255, a: 1 },
    { r: 255 / 255, g: 255 / 255, b: 255 / 255, a: 1 },
    { r: 246 / 255, g: 83 / 255, b: 20 / 255, a: 1 },
    { r: 0 / 255, g: 161 / 255, b: 241 / 255, a: 1 },
    { r: 124 / 255, g: 187 / 255, b: 0 / 255, a: 1 },
    { r: 8 / 255, g: 170 / 255, b: 51 / 255, a: 1 },
    { r: 0 / 255, g: 0 / 255, b: 0 / 255, a: 1 },
];
/**
 * Canvas app
 */
class FlexView extends ui.Component {
    constructor(element, doc, root) {
        super(element);
        this.components = [];
        const dockElement = document.createElement("div");
        element.appendChild(dockElement);
        this.dock = new dockPanel_1.DockPanel(dockElement);
        this.addChild(this.dock);
        // Add the ink canvas to the dock
        const inkCanvasElement = document.createElement("div");
        if (!root.has("ink")) {
            root.set("ink", doc.createInk());
        }
        this.ink = new inkCanvas_1.InkCanvas(inkCanvasElement, root.get("ink"));
        this.dock.addContent(this.ink);
        const stackPanelElement = document.createElement("div");
        const buttonSize = { width: 50, height: 50 };
        const stackPanel = new stackPanel_1.StackPanel(stackPanelElement, stackPanel_1.Orientation.Horizontal, ["navbar-prague"]);
        this.colorButton = new button_1.Button(document.createElement("div"), buttonSize, ["btn", "btn-palette", "prague-icon-pencil"]);
        const replayButton = new button_1.Button(document.createElement("div"), buttonSize, ["btn", "btn-palette", "prague-icon-replay"]);
        stackPanel.addChild(this.colorButton);
        stackPanel.addChild(replayButton);
        this.dock.addBottom(stackPanel);
        replayButton.on("click", (event) => {
            debug_1.debug("Replay button click");
            this.ink.replay();
        });
        this.colorButton.on("click", (event) => {
            debug_1.debug("Color button click");
            this.popup.toggle();
        });
        // These should turn into components
        this.colorStack = new stackPanel_1.StackPanel(document.createElement("div"), stackPanel_1.Orientation.Vertical, []);
        for (const color of colors) {
            const buttonElement = document.createElement("div");
            buttonElement.style.backgroundColor = ui.toColorString(color);
            const button = new button_1.Button(buttonElement, { width: 200, height: 50 }, ["btn-flat"]);
            this.colorStack.addChild(button);
            button.on("click", (event) => {
                this.ink.setPenColor(color);
                this.popup.toggle();
            });
        }
        // Popup to display the colors
        this.popup = new popup_1.Popup(document.createElement("div"));
        this.popup.addContent(this.colorStack);
        this.addChild(this.popup);
        this.element.appendChild(this.popup.element);
        // UI components on the flex view
        if (!root.has("components")) {
            root.set("components", doc.createMap());
        }
        this.processComponents(root.get("components"));
    }
    resizeCore(bounds) {
        // Update the base ink dock
        bounds.conformElement(this.dock.element);
        this.dock.resize(bounds);
        // Layout component windows
        for (const component of this.components) {
            const componentRect = new ui.Rectangle(component.position.x, component.position.y, component.size.width, component.size.height);
            componentRect.conformElement(component.component.element);
            component.component.resize(componentRect);
        }
        // Size the color swatch popup
        const colorButtonRect = ui.Rectangle.fromClientRect(this.colorButton.element.getBoundingClientRect());
        const popupSize = this.popup.measure(bounds);
        const rect = new ui.Rectangle(colorButtonRect.x, colorButtonRect.y - popupSize.height, popupSize.width, popupSize.height);
        rect.conformElement(this.popup.element);
        this.popup.resize(rect);
    }
    processComponents(components) {
        return __awaiter(this, void 0, void 0, function* () {
            const view = yield components.getView();
            // Pull in all the objects on the canvas
            // tslint:disable-next-line:forin
            for (let componentName of view.keys()) {
                const component = view.get(componentName);
                this.addComponent(component);
            }
            components.on("valueChanged", (event) => {
                if (view.has(event.key)) {
                    this.addComponent(view.get(event.key));
                }
            });
        });
    }
    addComponent(component) {
        return __awaiter(this, void 0, void 0, function* () {
            const details = yield component.getView();
            if (details.get("type") !== "chart") {
                return;
            }
            const size = details.get("size");
            const position = details.get("position");
            const chart = new chart_1.Chart(document.createElement("div"), details.get("data"));
            this.components.push({ size, position, component: chart });
            this.element.insertBefore(chart.element, this.element.lastChild);
            this.addChild(chart);
            this.resizeCore(this.size);
        });
    }
}
exports.FlexView = FlexView;

},{"../ui":41,"./button":7,"./chart":8,"./debug":9,"./dockPanel":10,"./inkCanvas":18,"./popup":21,"./stackPanel":27}],14:[function(require,module,exports){
(function (global){
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
const client_api_1 = (typeof window !== "undefined" ? window['prague'] : typeof global !== "undefined" ? global['prague'] : null);
const ui = require("../ui");
const debug_1 = require("./debug");
const dockPanel_1 = require("./dockPanel");
const flowView_1 = require("./flowView");
const inkCanvas_1 = require("./inkCanvas");
const layerPanel_1 = require("./layerPanel");
const overlayCanvas_1 = require("./overlayCanvas");
const status_1 = require("./status");
const title_1 = require("./title");
class FlowContainer extends ui.Component {
    constructor(element, collabDocument, sharedString, overlayMap, image, ink, options = undefined) {
        super(element);
        this.collabDocument = collabDocument;
        this.overlayMap = overlayMap;
        this.image = image;
        this.options = options;
        this.layerCache = {};
        this.activeLayers = {};
        // TODO the below code is becoming controller like and probably doesn't belong in a constructor. Likely
        // a better API model.
        // Title bar at the top
        const titleDiv = document.createElement("div");
        this.title = new title_1.Title(titleDiv);
        this.title.setTitle(collabDocument.id);
        this.title.setBackgroundColor(collabDocument.id);
        // Status bar at the bottom
        const statusDiv = document.createElement("div");
        statusDiv.style.borderTop = "1px solid gray";
        this.status = new status_1.Status(statusDiv);
        // FlowView holds the text
        const flowViewDiv = document.createElement("div");
        flowViewDiv.classList.add("flow-view");
        this.flowView = new flowView_1.FlowView(flowViewDiv, collabDocument, sharedString, this.status, this.options);
        // Create the optional full ink canvas
        const inkCanvas = ink ? new inkCanvas_1.InkCanvas(document.createElement("div"), ink) : null;
        if (inkCanvas) {
            inkCanvas.enableInkHitTest(false);
        }
        // Layer panel lets us put the overlay canvas on top of the text
        const layerPanelDiv = document.createElement("div");
        this.layerPanel = new layerPanel_1.LayerPanel(layerPanelDiv);
        // Overlay canvas for ink
        const overlayCanvasDiv = document.createElement("div");
        overlayCanvasDiv.classList.add("overlay-canvas");
        this.overlayCanvas = new overlayCanvas_1.OverlayCanvas(collabDocument, overlayCanvasDiv, layerPanelDiv);
        this.overlayCanvas.on("ink", (layer, model, start) => {
            this.overlayCanvas.enableInkHitTest(false);
            const position = this.flowView.getNearestPosition(start);
            this.overlayCanvas.enableInkHitTest(true);
            const location = this.flowView.getPositionLocation(position);
            const cursorOffset = {
                x: start.x - location.x,
                y: start.y - location.y,
            };
            this.layerCache[model.id] = layer;
            this.activeLayers[model.id] = { layer, active: true, cursorOffset };
            overlayMap.set(model.id, model);
            // Inserts the marker at the flow view's cursor position
            sharedString.insertMarker(position, client_api_1.MergeTree.MarkerBehaviors.None, { [client_api_1.MergeTree.reservedMarkerIdKey]: model.id });
        });
        this.status.on("dry", (value) => {
            debug_1.debug("Drying a layer");
        });
        // Update the scroll bar
        this.flowView.on("render", (renderInfo) => {
            const showScrollBar = renderInfo.range.min !== renderInfo.viewportStartPos ||
                renderInfo.range.max !== renderInfo.viewportEndPos;
            this.layerPanel.showScrollBar(showScrollBar);
            this.layerPanel.scrollBar.setRange(renderInfo.range);
            this.markLayersInactive();
            for (const marker of renderInfo.overlayMarkers) {
                this.addLayer(marker);
            }
            this.pruneInactiveLayers();
        });
        this.status.addOption("ink", "ink");
        this.status.on("ink", (value) => {
            this.overlayCanvas.enableInk(value);
            if (inkCanvas) {
                inkCanvas.enableInkHitTest(value);
            }
        });
        const spellOption = "spellchecker";
        const spellcheckOn = (this.options === undefined || this.options[spellOption] !== "disabled") ? true : false;
        this.status.addOption("spellcheck", "spellcheck", spellcheckOn);
        this.status.on("spellcheck", (value) => {
            this.initSpellcheck(value);
        });
        // For now only allow one level deep of branching
        this.status.addButton("Versions", `/sharedText/${this.collabDocument.id}/commits`, false);
        if (!this.collabDocument.parentBranch) {
            this.status.addButton("Branch", `/sharedText/${this.collabDocument.id}/fork`, true);
        }
        // Add children to the panel once we have both
        this.layerPanel.addChild(this.flowView);
        this.layerPanel.addChild(this.overlayCanvas);
        if (inkCanvas) {
            this.layerPanel.addChild(inkCanvas);
        }
        this.dockPanel = new dockPanel_1.DockPanel(element);
        this.addChild(this.dockPanel);
        // Use the dock panel to layout the viewport - layer panel as the content and then status bar at the bottom
        this.dockPanel.addTop(this.title);
        this.dockPanel.addContent(this.layerPanel);
        this.dockPanel.addBottom(this.status);
        // Intelligence image
        image.element.style.visibility = "hidden";
        this.addChild(image);
        element.appendChild(image.element);
    }
    trackInsights(insights) {
        this.updateInsights(insights);
        insights.on("valueChanged", () => {
            this.updateInsights(insights);
        });
    }
    resizeCore(bounds) {
        bounds.conformElement(this.dockPanel.element);
        this.dockPanel.resize(bounds);
        if (this.image) {
            let overlayRect = bounds.inner4(0.7, 0.05, 0.2, 0.1);
            overlayRect.conformElement(this.image.element);
            this.image.resize(overlayRect);
        }
    }
    addLayer(marker) {
        return __awaiter(this, void 0, void 0, function* () {
            const id = marker.id;
            const position = marker.position;
            const location = this.flowView.getPositionLocation(position);
            // TODO the async nature of this may cause rendering pauses - and in general the layer should already
            // exist. Should just make this a sync call.
            // Mark true prior to the async work
            if (this.activeLayers[id]) {
                this.activeLayers[id].active = true;
            }
            const ink = yield this.overlayMap.get(id);
            if (!(id in this.layerCache)) {
                const layer = new overlayCanvas_1.InkLayer(this.size, ink);
                this.layerCache[id] = layer;
            }
            if (!(id in this.activeLayers)) {
                const layer = this.layerCache[id];
                this.overlayCanvas.addLayer(layer);
                this.activeLayers[id] = {
                    active: true,
                    layer,
                    cursorOffset: { x: 0, y: 0 },
                };
            }
            const activeLayer = this.activeLayers[id];
            // Add in any cursor offset
            location.x += activeLayer.cursorOffset.x;
            location.y += activeLayer.cursorOffset.y;
            // Translate from global to local coordinates
            const bounds = this.flowView.element.getBoundingClientRect();
            const translated = { x: location.x - bounds.left, y: location.y - bounds.top };
            // Update the position unless we're in the process of drawing the layer
            this.activeLayers[id].layer.setPosition(translated);
        });
    }
    updateInsights(insights) {
        return __awaiter(this, void 0, void 0, function* () {
            const view = yield insights.getView();
            if (view.has("ResumeAnalytics") && this.image) {
                const resume = view.get("ResumeAnalytics");
                const probability = parseFloat(resume.resumeAnalyticsResult);
                if (probability !== 1 && probability > 0.7) {
                    this.image.setMessage(`${Math.round(probability * 100)}% sure I found a resume!`);
                    this.image.element.style.visibility = "visible";
                }
            }
            if (view.has("TextAnalytics")) {
                const analytics = view.get("TextAnalytics");
                if (analytics.language) {
                    this.status.add("li", analytics.language);
                }
                if (analytics.sentiment) {
                    const sentimentEmoji = analytics.sentiment > 0.7
                        ? "🙂"
                        : analytics.sentiment < 0.3 ? "🙁" : "😐";
                    this.status.add("si", sentimentEmoji);
                }
            }
        });
    }
    markLayersInactive() {
        // tslint:disable-next-line:forin
        for (const layer in this.activeLayers) {
            this.activeLayers[layer].active = false;
        }
    }
    pruneInactiveLayers() {
        // tslint:disable-next-line:forin
        for (const layerId in this.activeLayers) {
            if (!this.activeLayers[layerId].active) {
                const layer = this.activeLayers[layerId];
                delete this.activeLayers[layerId];
                this.overlayCanvas.removeLayer(layer.layer);
            }
        }
    }
    initSpellcheck(value) {
        if (value) {
            this.flowView.setViewOption({
                spellchecker: "enabled",
            });
        }
        else {
            this.flowView.setViewOption({
                spellchecker: "disabled",
            });
        }
        this.flowView.render();
    }
}
exports.FlowContainer = FlowContainer;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"../ui":41,"./debug":9,"./dockPanel":10,"./flowView":15,"./inkCanvas":18,"./layerPanel":19,"./overlayCanvas":20,"./status":28,"./title":29}],15:[function(require,module,exports){
(function (global){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// tslint:disable:no-bitwise whitespace
const performanceNow = require("performance-now");
const client_api_1 = (typeof window !== "undefined" ? window['prague'] : typeof global !== "undefined" ? global['prague'] : null);
const merge_tree_utils_1 = require("../merge-tree-utils");
const ui = require("../ui");
var CharacterCodes;
(function (CharacterCodes) {
    CharacterCodes[CharacterCodes["_"] = 95] = "_";
    CharacterCodes[CharacterCodes["$"] = 36] = "$";
    CharacterCodes[CharacterCodes["ampersand"] = 38] = "ampersand";
    CharacterCodes[CharacterCodes["asterisk"] = 42] = "asterisk";
    CharacterCodes[CharacterCodes["at"] = 64] = "at";
    CharacterCodes[CharacterCodes["backslash"] = 92] = "backslash";
    CharacterCodes[CharacterCodes["bar"] = 124] = "bar";
    CharacterCodes[CharacterCodes["caret"] = 94] = "caret";
    CharacterCodes[CharacterCodes["closeBrace"] = 125] = "closeBrace";
    CharacterCodes[CharacterCodes["closeBracket"] = 93] = "closeBracket";
    CharacterCodes[CharacterCodes["closeParen"] = 41] = "closeParen";
    CharacterCodes[CharacterCodes["colon"] = 58] = "colon";
    CharacterCodes[CharacterCodes["comma"] = 44] = "comma";
    CharacterCodes[CharacterCodes["dot"] = 46] = "dot";
    CharacterCodes[CharacterCodes["doubleQuote"] = 34] = "doubleQuote";
    CharacterCodes[CharacterCodes["equals"] = 61] = "equals";
    CharacterCodes[CharacterCodes["exclamation"] = 33] = "exclamation";
    CharacterCodes[CharacterCodes["hash"] = 35] = "hash";
    CharacterCodes[CharacterCodes["greaterThan"] = 62] = "greaterThan";
    CharacterCodes[CharacterCodes["lessThan"] = 60] = "lessThan";
    CharacterCodes[CharacterCodes["minus"] = 45] = "minus";
    CharacterCodes[CharacterCodes["openBrace"] = 123] = "openBrace";
    CharacterCodes[CharacterCodes["openBracket"] = 91] = "openBracket";
    CharacterCodes[CharacterCodes["openParen"] = 40] = "openParen";
    CharacterCodes[CharacterCodes["percent"] = 37] = "percent";
    CharacterCodes[CharacterCodes["plus"] = 43] = "plus";
    CharacterCodes[CharacterCodes["question"] = 63] = "question";
    CharacterCodes[CharacterCodes["semicolon"] = 59] = "semicolon";
    CharacterCodes[CharacterCodes["singleQuote"] = 39] = "singleQuote";
    CharacterCodes[CharacterCodes["slash"] = 47] = "slash";
    CharacterCodes[CharacterCodes["tilde"] = 126] = "tilde";
    CharacterCodes[CharacterCodes["linefeed"] = 10] = "linefeed";
    CharacterCodes[CharacterCodes["cr"] = 13] = "cr";
    CharacterCodes[CharacterCodes["_0"] = 48] = "_0";
    CharacterCodes[CharacterCodes["_9"] = 57] = "_9";
    CharacterCodes[CharacterCodes["a"] = 97] = "a";
    CharacterCodes[CharacterCodes["b"] = 98] = "b";
    CharacterCodes[CharacterCodes["g"] = 103] = "g";
    CharacterCodes[CharacterCodes["l"] = 108] = "l";
    CharacterCodes[CharacterCodes["z"] = 122] = "z";
    CharacterCodes[CharacterCodes["A"] = 65] = "A";
    CharacterCodes[CharacterCodes["B"] = 66] = "B";
    CharacterCodes[CharacterCodes["C"] = 67] = "C";
    CharacterCodes[CharacterCodes["D"] = 68] = "D";
    CharacterCodes[CharacterCodes["E"] = 69] = "E";
    CharacterCodes[CharacterCodes["F"] = 70] = "F";
    CharacterCodes[CharacterCodes["G"] = 71] = "G";
    CharacterCodes[CharacterCodes["H"] = 72] = "H";
    CharacterCodes[CharacterCodes["I"] = 73] = "I";
    CharacterCodes[CharacterCodes["J"] = 74] = "J";
    CharacterCodes[CharacterCodes["K"] = 75] = "K";
    CharacterCodes[CharacterCodes["L"] = 76] = "L";
    CharacterCodes[CharacterCodes["M"] = 77] = "M";
    CharacterCodes[CharacterCodes["N"] = 78] = "N";
    CharacterCodes[CharacterCodes["O"] = 79] = "O";
    CharacterCodes[CharacterCodes["P"] = 80] = "P";
    CharacterCodes[CharacterCodes["Q"] = 81] = "Q";
    CharacterCodes[CharacterCodes["R"] = 82] = "R";
    CharacterCodes[CharacterCodes["S"] = 83] = "S";
    CharacterCodes[CharacterCodes["T"] = 84] = "T";
    CharacterCodes[CharacterCodes["U"] = 85] = "U";
    CharacterCodes[CharacterCodes["V"] = 86] = "V";
    CharacterCodes[CharacterCodes["W"] = 87] = "W";
    CharacterCodes[CharacterCodes["X"] = 88] = "X";
    CharacterCodes[CharacterCodes["Y"] = 89] = "Y";
    CharacterCodes[CharacterCodes["Z"] = 90] = "Z";
    CharacterCodes[CharacterCodes["space"] = 32] = "space";
})(CharacterCodes || (CharacterCodes = {}));
function clearContentCaches(pgMarker) {
    pgMarker.cache = undefined;
    pgMarker.itemCache = undefined;
}
let viewOptions;
function namesToItems(names) {
    let items = new Array(names.length);
    for (let i = 0, len = names.length; i < len; i++) {
        items[i] = { key: names[i] };
    }
    return items;
}
exports.namesToItems = namesToItems;
function altsToItems(alts) {
    return alts.map((v) => ({ key: v.text }));
}
function selectionListBoxCreate(textRect, container, itemHeight, offsetY, varHeight) {
    let listContainer = document.createElement("div");
    let items;
    let itemCapacity;
    let selectionIndex = -1;
    let topSelection = 0;
    init();
    return {
        elm: listContainer,
        getSelectedKey,
        hide: () => {
            listContainer.style.visibility = "hidden";
        },
        items: () => items,
        prevItem,
        nextItem,
        removeHighlight,
        selectItem: selectItemByKey,
        show: () => {
            listContainer.style.visibility = "visible";
        },
        showSelectionList,
    };
    function selectItemByKey(key) {
        key = key.trim();
        if (selectionIndex >= 0) {
            if (items[selectionIndex].key === key) {
                return;
            }
        }
        for (let i = 0, len = items.length; i < len; i++) {
            if (items[i].key === key) {
                selectItem(i);
                break;
            }
        }
    }
    function getSelectedKey() {
        if (selectionIndex >= 0) {
            return items[selectionIndex].key;
        }
    }
    function prevItem() {
        if (selectionIndex > 0) {
            selectItem(selectionIndex - 1);
        }
    }
    function nextItem() {
        if (selectionIndex < (items.length - 1)) {
            selectItem(selectionIndex + 1);
        }
    }
    function init() {
        listContainer.style.boxShadow = "0px 3px 2px #bbbbbb";
        listContainer.style.backgroundColor = "white";
        listContainer.style.border = "#e5e5e5 solid 2px";
        updateRectangles();
        container.appendChild(listContainer);
    }
    function updateRectangles() {
        let width = textRect.width;
        let height = window.innerHeight / 3;
        let top;
        let bottom;
        let right;
        if ((textRect.x + textRect.width) > window.innerWidth) {
            right = textRect.x;
        }
        // TODO: use container div instead of window/doc body
        // TODO: right/left (for now assume go right)
        if ((height + textRect.y + offsetY + textRect.height) >= window.innerHeight) {
            bottom = window.innerHeight - textRect.y;
        }
        else {
            top = textRect.y + textRect.height;
        }
        itemCapacity = Math.floor(height / itemHeight);
        if (top !== undefined) {
            let listContainerRect = new ui.Rectangle(textRect.x, top, width, height);
            listContainerRect.height = itemCapacity * itemHeight;
            listContainerRect.conformElementMaxHeight(listContainer);
        }
        else {
            let listContainerRect = new ui.Rectangle(textRect.x, 0, width, height);
            listContainerRect.height = itemCapacity * itemHeight;
            listContainerRect.conformElementMaxHeightFromBottom(listContainer, bottom);
        }
        if (right !== undefined) {
            listContainer.style.right = (window.innerWidth - right) + "px";
            listContainer.style.left = "";
        }
        if (varHeight) {
            listContainer.style.paddingBottom = varHeight + "px";
        }
    }
    function removeHighlight() {
        if (selectionIndex >= 0) {
            if (items[selectionIndex].div) {
                items[selectionIndex].div.style.backgroundColor = "white";
            }
        }
    }
    function selectItem(indx) {
        // then scroll if necessary
        if (indx < topSelection) {
            topSelection = indx;
        }
        else if ((indx - topSelection) >= itemCapacity) {
            topSelection = (indx - itemCapacity) + 1;
        }
        if (selectionIndex !== indx) {
            selectionIndex = indx;
            updateSelectionList();
        }
    }
    function makeItemDiv(i, div) {
        let item = items[i];
        let itemDiv = div;
        itemDiv.style.fontSize = "18px";
        itemDiv.style.fontFamily = "Segoe UI";
        itemDiv.style.lineHeight = itemHeight + "px";
        itemDiv.style.whiteSpace = "pre";
        items[i].div = itemDiv;
        let itemSpan = document.createElement("span");
        itemSpan.innerText = "  " + item.key;
        itemDiv.appendChild(itemSpan);
        if (item.iconURL) {
            let icon = document.createElement("img");
            icon.style.cssFloat = "left";
            icon.style.height = itemHeight + "px";
            icon.style.width = itemHeight + "px";
            icon.setAttribute("src", item.iconURL);
            itemDiv.insertBefore(icon, itemSpan);
        }
        return itemDiv;
    }
    function showSelectionList(selectionItems, hintSelection) {
        topSelection = 0;
        items = selectionItems;
        clearSubtree(listContainer);
        selectionIndex = -1;
        if (selectionItems.length === 0) {
            return;
        }
        updateSelectionList();
        if (hintSelection) {
            selectItemByKey(hintSelection);
        }
        else {
            selectItem(0);
        }
    }
    function updateSelectionList() {
        clearSubtree(listContainer);
        let len = items.length;
        for (let i = 0; i < itemCapacity; i++) {
            let indx = i + topSelection;
            if (indx === len) {
                break;
            }
            else {
                let item = items[indx];
                if (!item.div) {
                    item.div = document.createElement("div");
                    listContainer.appendChild(item.div);
                    makeItemDiv(indx, item.div);
                }
                else {
                    listContainer.appendChild(item.div);
                }
                if (indx === selectionIndex) {
                    item.div.style.backgroundColor = "#aaaaff";
                }
                else {
                    item.div.style.backgroundColor = "white";
                }
            }
        }
    }
}
exports.selectionListBoxCreate = selectionListBoxCreate;
function elmOffToSegOff(elmOff, span) {
    if ((elmOff.elm !== span) && (elmOff.elm.parentElement !== span)) {
        console.log("did not hit span");
    }
    let offset = elmOff.offset;
    let prevSib = elmOff.node.previousSibling;
    if ((!prevSib) && (elmOff.elm !== span)) {
        prevSib = elmOff.elm.previousSibling;
    }
    while (prevSib) {
        switch (prevSib.nodeType) {
            case Node.ELEMENT_NODE:
                let innerSpan = prevSib;
                offset += innerSpan.innerText.length;
                break;
            case Node.TEXT_NODE:
                offset += prevSib.nodeValue.length;
                break;
            default:
                break;
        }
        prevSib = prevSib.previousSibling;
    }
    return offset;
}
let cachedCanvas;
const baseURI = typeof document !== "undefined" ? document.location.origin : "";
let underlineStringURL = `url("${baseURI}/public/images/underline.gif") bottom repeat-x`;
let underlinePaulStringURL = `url("${baseURI}/public/images/underline-paul.gif") bottom repeat-x`;
let underlinePaulGrammarStringURL = `url("${baseURI}/public/images/underline-paulgrammar.gif") bottom repeat-x`;
let underlinePaulGoldStringURL = `url("${baseURI}/public/images/underline-gold.gif") bottom repeat-x`;
function getTextWidth(text, font) {
    // re-use canvas object for better performance
    const canvas = cachedCanvas || (cachedCanvas = document.createElement("canvas"));
    const context = canvas.getContext("2d");
    context.font = font;
    const metrics = context.measureText(text);
    return metrics.width;
}
function getMultiTextWidth(texts, font) {
    // re-use canvas object for better performance
    const canvas = cachedCanvas || (cachedCanvas = document.createElement("canvas"));
    const context = canvas.getContext("2d");
    context.font = font;
    let sum = 0;
    for (let text of texts) {
        const metrics = context.measureText(text);
        sum += metrics.width;
    }
    return sum;
}
var ParagraphItemType;
(function (ParagraphItemType) {
    ParagraphItemType[ParagraphItemType["Block"] = 0] = "Block";
    ParagraphItemType[ParagraphItemType["Glue"] = 1] = "Glue";
    ParagraphItemType[ParagraphItemType["Penalty"] = 2] = "Penalty";
})(ParagraphItemType || (ParagraphItemType = {}));
function makeIPGBlock(width, text, textSegment) {
    return { type: ParagraphItemType.Block, width, text, textSegment };
}
function makeGlue(width, text, textSegment, stretch, shrink) {
    return { type: ParagraphItemType.Glue, width, text, textSegment, stretch, shrink };
}
// for now assume uniform line widths
function breakPGIntoLinesFF(items, lineWidth) {
    let breaks = [0];
    let posInPG = 0;
    let committedItemsWidth = 0;
    let blockRunWidth = 0;
    let blockRunPos = -1;
    let prevIsGlue = true;
    for (let item of items) {
        if (item.type === ParagraphItemType.Block) {
            if (prevIsGlue) {
                blockRunPos = posInPG;
                blockRunWidth = 0;
            }
            if ((committedItemsWidth + item.width) > lineWidth) {
                breaks.push(blockRunPos);
                committedItemsWidth = blockRunWidth;
            }
            posInPG += item.text.length;
            if (committedItemsWidth > lineWidth) {
                breaks.push(posInPG);
                committedItemsWidth = 0;
                blockRunWidth = 0;
                blockRunPos = posInPG;
            }
            else {
                blockRunWidth += item.width;
            }
            prevIsGlue = false;
        }
        else if (item.type === ParagraphItemType.Glue) {
            posInPG++;
            prevIsGlue = true;
        }
        committedItemsWidth += item.width;
    }
    return breaks;
}
class ParagraphLexer {
    constructor(tokenAction, actionContext) {
        this.tokenAction = tokenAction;
        this.actionContext = actionContext;
        this.state = 0 /* AccumBlockChars */;
        this.spaceCount = 0;
        this.textBuf = "";
    }
    reset() {
        this.state = 0 /* AccumBlockChars */;
        this.spaceCount = 0;
        this.textBuf = "";
        this.leadSegment = undefined;
    }
    lex(textSegment) {
        if (this.leadSegment && (!this.leadSegment.matchProperties(textSegment))) {
            this.emit();
            this.leadSegment = textSegment;
        }
        else if (!this.leadSegment) {
            this.leadSegment = textSegment;
        }
        let segText = textSegment.text;
        for (let i = 0, len = segText.length; i < len; i++) {
            let c = segText.charAt(i);
            if (c === " ") {
                if (this.state === 0 /* AccumBlockChars */) {
                    this.emitBlock();
                }
                this.state = 1 /* AccumSpaces */;
                this.spaceCount++;
            }
            else {
                if (this.state === 1 /* AccumSpaces */) {
                    this.emitGlue();
                }
                this.state = 0 /* AccumBlockChars */;
                this.textBuf += c;
            }
        }
        this.emit();
    }
    emit() {
        if (this.state === 0 /* AccumBlockChars */) {
            this.emitBlock();
        }
        else {
            this.emitGlue();
        }
    }
    emitGlue() {
        if (this.spaceCount > 0) {
            this.tokenAction(client_api_1.MergeTree.internedSpaces(this.spaceCount), ParagraphItemType.Glue, this.leadSegment, this.actionContext);
            this.spaceCount = 0;
        }
    }
    emitBlock() {
        if (this.textBuf.length > 0) {
            this.tokenAction(this.textBuf, ParagraphItemType.Block, this.leadSegment, this.actionContext);
            this.textBuf = "";
        }
    }
}
// global until remove old render
let textErrorRun;
function buildDocumentContext(viewportDiv) {
    let fontstr = "18px Times";
    viewportDiv.style.font = fontstr;
    let headerFontstr = "22px Times";
    let wordSpacing = getTextWidth(" ", fontstr);
    let headerDivHeight = 32;
    let computedStyle = window.getComputedStyle(viewportDiv);
    let defaultLineHeight = 1.2;
    let h = parseInt(computedStyle.fontSize, 10);
    let defaultLineDivHeight = Math.round(h * defaultLineHeight);
    let pgVspace = Math.round(h * 0.5);
    let boxVspace = 3;
    let tableVspace = pgVspace;
    let boxTopMargin = 3;
    let boxHMargin = 3;
    let indentWidthThreshold = 600;
    return {
        fontstr, headerFontstr, wordSpacing, headerDivHeight, defaultLineDivHeight,
        pgVspace, boxVspace, boxHMargin, boxTopMargin, tableVspace, indentWidthThreshold,
    };
}
function showPresence(presenceX, lineContext, presenceInfo) {
    if (!presenceInfo.cursor) {
        presenceInfo.cursor = new Cursor(lineContext.flowView.viewportDiv, presenceInfo.xformPos);
        presenceInfo.cursor.addPresenceInfo(presenceInfo);
    }
    presenceInfo.cursor.assignToLine(presenceX, lineContext.lineDivHeight, lineContext.lineDiv);
    presenceInfo.fresh = false;
}
function showPositionEndOfLine(lineContext, presenceInfo) {
    if ((!presenceInfo) || presenceInfo.fresh) {
        if (lineContext.deferredAttach) {
            addToRerenderList(lineContext);
        }
        else {
            if (lineContext.span) {
                let cursorBounds = lineContext.span.getBoundingClientRect();
                let lineDivBounds = lineContext.lineDiv.getBoundingClientRect();
                let cursorX = cursorBounds.width + (cursorBounds.left - lineDivBounds.left);
                if (!presenceInfo) {
                    lineContext.flowView.cursor.assignToLine(cursorX, lineContext.lineDivHeight, lineContext.lineDiv);
                }
                else {
                    showPresence(cursorX, lineContext, presenceInfo);
                }
            }
            else {
                if (lineContext.lineDiv.indentWidth !== undefined) {
                    if (!presenceInfo) {
                        lineContext.flowView.cursor.assignToLine(lineContext.lineDiv.indentWidth, lineContext.lineDivHeight, lineContext.lineDiv);
                    }
                    else {
                        showPresence(lineContext.lineDiv.indentWidth, lineContext, presenceInfo);
                    }
                }
                else {
                    if (!presenceInfo) {
                        lineContext.flowView.cursor.assignToLine(0, lineContext.lineDivHeight, lineContext.lineDiv);
                    }
                    else {
                        showPresence(0, lineContext, presenceInfo);
                    }
                }
            }
        }
    }
}
function addToRerenderList(lineContext) {
    if (!lineContext.reRenderList) {
        lineContext.reRenderList = [lineContext.lineDiv];
    }
    else {
        lineContext.reRenderList.push(lineContext.lineDiv);
    }
}
function showPositionInLine(lineContext, textStartPos, text, cursorPos, presenceInfo) {
    if ((!presenceInfo) || presenceInfo.fresh) {
        if (lineContext.deferredAttach) {
            addToRerenderList(lineContext);
        }
        else {
            let posX;
            let lineDivBounds = lineContext.lineDiv.getBoundingClientRect();
            if (cursorPos > textStartPos) {
                let preCursorText = text.substring(0, cursorPos - textStartPos);
                let temp = lineContext.span.innerText;
                lineContext.span.innerText = preCursorText;
                let cursorBounds = lineContext.span.getBoundingClientRect();
                posX = cursorBounds.width + (cursorBounds.left - lineDivBounds.left);
                // console.log(`cbounds w ${cursorBounds.width} posX ${posX} ldb ${lineDivBounds.left}`);
                lineContext.span.innerText = temp;
            }
            else {
                let cursorBounds = lineContext.span.getBoundingClientRect();
                posX = cursorBounds.left - lineDivBounds.left;
                // console.log(`cbounds whole l ${cursorBounds.left} posX ${posX} ldb ${lineDivBounds.left}`);
            }
            if (!presenceInfo) {
                lineContext.flowView.cursor.assignToLine(posX, lineContext.lineDivHeight, lineContext.lineDiv);
            }
            else {
                showPresence(posX, lineContext, presenceInfo);
            }
        }
    }
}
function endRenderSegments(marker) {
    return (marker.hasTileLabel("pg") ||
        ((marker.hasRangeLabel("box") &&
            (marker.behaviors & client_api_1.MergeTree.MarkerBehaviors.RangeEnd))));
}
function renderSegmentIntoLine(segment, segpos, refSeq, clientId, start, end, lineContext) {
    if (lineContext.lineDiv.linePos === undefined) {
        lineContext.lineDiv.linePos = segpos + start;
        lineContext.lineDiv.lineEnd = lineContext.lineDiv.linePos;
    }
    let segType = segment.getType();
    if (segType === client_api_1.MergeTree.SegmentType.Text) {
        if (start < 0) {
            start = 0;
        }
        if (end > segment.cachedLength) {
            end = segment.cachedLength;
        }
        let textSegment = segment;
        let text = textSegment.text.substring(start, end);
        let textStartPos = segpos + start;
        let textEndPos = segpos + end;
        lineContext.span = makeSegSpan(lineContext.flowView, text, textSegment, start, segpos);
        lineContext.contentDiv.appendChild(lineContext.span);
        lineContext.lineDiv.lineEnd += text.length;
        if ((lineContext.flowView.cursor.pos >= textStartPos) && (lineContext.flowView.cursor.pos <= textEndPos)) {
            showPositionInLine(lineContext, textStartPos, text, lineContext.flowView.cursor.pos);
        }
        let presenceInfo = lineContext.flowView.presenceInfoInRange(textStartPos, textEndPos);
        if (presenceInfo && (presenceInfo.xformPos !== lineContext.flowView.cursor.pos)) {
            showPositionInLine(lineContext, textStartPos, text, presenceInfo.xformPos, presenceInfo);
        }
    }
    else if (segType === client_api_1.MergeTree.SegmentType.Marker) {
        let marker = segment;
        // console.log(`marker pos: ${segpos}`);
        if (endRenderSegments(marker)) {
            if (lineContext.flowView.cursor.pos === segpos) {
                showPositionEndOfLine(lineContext);
            }
            else {
                let presenceInfo = lineContext.flowView.presenceInfoInRange(segpos, segpos);
                if (presenceInfo) {
                    showPositionEndOfLine(lineContext, presenceInfo);
                }
            }
            return false;
        }
        else {
            lineContext.lineDiv.lineEnd++;
        }
    }
    return true;
}
function findLineDiv(pos, flowView, dive = false) {
    return flowView.lineDivSelect((elm) => {
        if ((elm.linePos <= pos) && (elm.lineEnd >= pos)) {
            return elm;
        }
    }, flowView.viewportDiv, dive);
}
function decorateLineDiv(lineDiv, lineFontstr, lineDivHeight) {
    let indentSymbol = lineDiv.indentSymbol;
    let indentFontstr = lineFontstr;
    if (indentSymbol.font) {
        indentFontstr = indentSymbol.font;
    }
    let em = Math.round(getTextWidth("M", lineFontstr));
    let symbolWidth = getTextWidth(indentSymbol.text, indentFontstr);
    let symbolDiv = makeContentDiv(new ui.Rectangle(lineDiv.indentWidth - Math.floor(em + symbolWidth), 0, symbolWidth, lineDivHeight), indentFontstr);
    symbolDiv.innerText = indentSymbol.text;
    lineDiv.appendChild(symbolDiv);
}
function reRenderLine(lineDiv, flowView) {
    if (lineDiv) {
        let outerViewportBounds = ui.Rectangle.fromClientRect(flowView.viewportDiv.getBoundingClientRect());
        let lineDivBounds = lineDiv.getBoundingClientRect();
        let lineDivHeight = lineDivBounds.height;
        clearSubtree(lineDiv);
        let contentDiv = lineDiv;
        if (lineDiv.indentSymbol) {
            decorateLineDiv(lineDiv, lineDiv.style.font, lineDivHeight);
        }
        if (lineDiv.indentWidth) {
            contentDiv = makeContentDiv(new ui.Rectangle(lineDiv.indentWidth, 0, lineDiv.contentWidth, lineDivHeight), lineDiv.style.font);
            lineDiv.appendChild(contentDiv);
        }
        let lineContext = {
            contentDiv,
            flowView,
            lineDiv,
            lineDivHeight,
            markerPos: 0,
            pgMarker: undefined,
            span: undefined,
            outerViewportBounds,
        };
        let lineEnd = lineDiv.lineEnd;
        let end = lineEnd;
        if (end === lineDiv.linePos) {
            end++;
        }
        flowView.client.mergeTree.mapRange({ leaf: renderSegmentIntoLine }, client_api_1.MergeTree.UniversalSequenceNumber, flowView.client.getClientId(), lineContext, lineDiv.linePos, end);
        lineDiv.lineEnd = lineEnd;
    }
}
let randomIndent = false;
function getIndentPct(pgMarker) {
    if (pgMarker.properties && (pgMarker.properties.indentLevel !== undefined)) {
        return pgMarker.properties.indentLevel * 0.05;
    }
    else if (pgMarker.properties && pgMarker.properties.blockquote) {
        return 0.10;
    }
    else {
        if (randomIndent) {
            return 0.2 * Math.random();
        }
        else {
            return 0.0;
        }
    }
}
function getIndentSymbol(pgMarker) {
    let indentLevel = pgMarker.properties.indentLevel;
    indentLevel = indentLevel % pgMarker.listHeadCache.series.length;
    let series = pgMarker.listHeadCache.series[indentLevel];
    let seriesSource = listSeries;
    if (pgMarker.properties.listKind === 1) {
        seriesSource = symbolSeries;
    }
    series = series % seriesSource.length;
    return seriesSource[series](pgMarker.listCache.itemCounts[indentLevel]);
}
function getPrecedingTile(flowView, tile, tilePos, label, filter, precedingTileCache) {
    if (precedingTileCache) {
        for (let i = precedingTileCache.length - 1; i >= 0; i--) {
            let candidate = precedingTileCache[i];
            if (filter(candidate.tile)) {
                return candidate;
            }
        }
    }
    while (tilePos > 0) {
        tilePos = tilePos - 1;
        let prevTileInfo = findTile(flowView, tilePos, label);
        if (prevTileInfo && filter(prevTileInfo.tile)) {
            return prevTileInfo;
        }
    }
}
function isListTile(tile) {
    return tile.hasTileLabel("list");
}
function numberSuffix(itemIndex, suffix) {
    return { text: itemIndex.toString() + suffix };
}
// TODO: more than 26
function alphaSuffix(itemIndex, suffix, little = false) {
    let code = (itemIndex - 1) + CharacterCodes.A;
    if (little) {
        code += 32;
    }
    let prefix = String.fromCharCode(code);
    return { text: prefix + suffix };
}
// TODO: more than 10
let romanNumbers = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
function roman(itemIndex, little = false) {
    let text = romanNumbers[itemIndex - 1] + ".";
    if (little) {
        text = text.toLowerCase();
    }
    return { text };
}
// let wingdingLetters = ["l", "m", "n", "R", "S", "T", "s","w"];
let unicodeBullets = [
    "\u2022", "\u25E6", "\u25AA", "\u2731", "\u272F", "\u2729", "\u273F",
    "\u2745", "\u2739", "\u2720", "\u2722",
];
function itemSymbols(itemIndex, indentLevel) {
    //    let wingdingLetter = wingdingLetters[indentLevel - 1];
    let wingdingLetter = unicodeBullets[indentLevel - 1];
    //    return { text: wingdingLetter, font: "12px Wingdings" };
    return { text: wingdingLetter };
}
let listSeries = [
    (itemIndex) => numberSuffix(itemIndex, "."),
    (itemIndex) => numberSuffix(itemIndex, ")"),
    (itemIndex) => alphaSuffix(itemIndex, ".", true),
    (itemIndex) => alphaSuffix(itemIndex, ")", true),
    (itemIndex) => alphaSuffix(itemIndex, "."),
    (itemIndex) => alphaSuffix(itemIndex, ")"),
    (itemIndex) => roman(itemIndex, true),
    (itemIndex) => roman(itemIndex),
];
let symbolSeries = [
    (itemIndex) => itemSymbols(itemIndex, 1),
    (itemIndex) => itemSymbols(itemIndex, 2),
    (itemIndex) => itemSymbols(itemIndex, 3),
    (itemIndex) => itemSymbols(itemIndex, 4),
    (itemIndex) => itemSymbols(itemIndex, 5),
    (itemIndex) => itemSymbols(itemIndex, 6),
    (itemIndex) => itemSymbols(itemIndex, 7),
    (itemIndex) => itemSymbols(itemIndex, 8),
    (itemIndex) => itemSymbols(itemIndex, 9),
    (itemIndex) => itemSymbols(itemIndex, 10),
    (itemIndex) => itemSymbols(itemIndex, 11),
];
function convertToListHead(tile) {
    tile.listHeadCache = {
        series: tile.properties.series,
        tile,
    };
    tile.listCache = { itemCounts: [0, 1] };
}
/**
 * maximum number of characters before a preceding list paragraph deemed irrelevant
 */
let maxListDistance = 400;
function getListCacheInfo(flowView, tile, tilePos, precedingTileCache) {
    if (isListTile(tile)) {
        if (tile.listCache === undefined) {
            if (tile.properties.series) {
                convertToListHead(tile);
            }
            else {
                let listKind = tile.properties.listKind;
                let precedingTilePos = getPrecedingTile(flowView, tile, tilePos, "list", (t) => isListTile(t) && (t.properties.listKind === listKind), precedingTileCache);
                if (precedingTilePos && ((tilePos - precedingTilePos.pos) < maxListDistance)) {
                    getListCacheInfo(flowView, precedingTilePos.tile, precedingTilePos.pos, precedingTileCache);
                    let precedingTile = precedingTilePos.tile;
                    tile.listHeadCache = precedingTile.listHeadCache;
                    let indentLevel = tile.properties.indentLevel;
                    let precedingItemCount = precedingTile.listCache.itemCounts[indentLevel];
                    let itemCounts = precedingTile.listCache.itemCounts.slice();
                    if (indentLevel < itemCounts.length) {
                        itemCounts[indentLevel] = precedingItemCount + 1;
                    }
                    else {
                        itemCounts[indentLevel] = 1;
                    }
                    for (let i = indentLevel + 1; i < itemCounts.length; i++) {
                        itemCounts[i] = 0;
                    }
                    tile.listCache = { itemCounts };
                }
                else {
                    // doesn't race because re-render is deferred
                    let series;
                    if (tile.properties.listKind === 0) {
                        series = [0, 0, 2, 6, 3, 7, 2, 6, 3, 7];
                    }
                    else {
                        series = [0, 0, 1, 2, 0, 1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 4, 5, 6];
                    }
                    flowView.sharedString.annotateRange({ series }, tilePos, tilePos + 1);
                    convertToListHead(tile);
                }
            }
        }
    }
}
function getContentPct(pgMarker) {
    if (pgMarker.properties && pgMarker.properties.contentWidth) {
        return pgMarker.properties.contentWidth;
    }
    else if (pgMarker.properties && pgMarker.properties.blockquote) {
        return 0.8;
    }
    else {
        if (randomIndent) {
            return 0.5 + (0.5 * Math.random());
        }
        else {
            return 1.0;
        }
    }
}
function makeContentDiv(r, lineFontstr) {
    let contentDiv = document.createElement("div");
    contentDiv.style.font = lineFontstr;
    contentDiv.style.whiteSpace = "pre";
    contentDiv.onclick = (e) => {
        let targetDiv = e.target;
        if (targetDiv.lastElementChild) {
            // tslint:disable-next-line:max-line-length
            console.log(`div click at ${e.clientX},${e.clientY} rightmost span with text ${targetDiv.lastElementChild.innerHTML}`);
        }
    };
    r.conformElement(contentDiv);
    return contentDiv;
}
let tableIdSuffix = 0;
let boxIdSuffix = 0;
let rowIdSuffix = 0;
function createMarkerOp(pos1, id, behaviors, rangeLabels, tileLabels) {
    let props = {};
    if (id.length > 0) {
        props[client_api_1.MergeTree.reservedMarkerIdKey] = id;
    }
    if (rangeLabels.length > 0) {
        props[client_api_1.MergeTree.reservedRangeLabelsKey] = rangeLabels;
    }
    if (tileLabels) {
        props[client_api_1.MergeTree.reservedTileLabelsKey] = tileLabels;
    }
    return {
        marker: { behaviors },
        pos1,
        props,
        type: 0 /* INSERT */,
    };
}
// linear search for now (can stash column index on box but then need to invalidate)
/*function insertColumn(table: TableView, box: BoxView) {
    for (let columnIndex = 0, colCount = table.columns.length; columnIndex < colCount; columnIndex++) {
        let column = table.columns[columnIndex];
        for (let colBox of column.boxes) {
            if (colBox === box) {
                table.insertColumnRight(box, columnIndex);
            }
        }
    }
}
*/
let endPrefix = "end-";
function createBox(opList, idBase, pos, word) {
    let boxId = idBase + `box${boxIdSuffix++}`;
    opList.push(createMarkerOp(pos, boxId, client_api_1.MergeTree.MarkerBehaviors.RangeBegin, ["box"]));
    pos++;
    if (word) {
        let insertStringOp = {
            pos1: pos,
            text: word,
            type: 0 /* INSERT */,
        };
        opList.push(insertStringOp);
        pos += word.length;
    }
    let pgOp = createMarkerOp(pos, boxId + "C", client_api_1.MergeTree.MarkerBehaviors.Tile, [], ["pg"]);
    opList.push(pgOp);
    pos++;
    opList.push(createMarkerOp(pos, endPrefix + boxId, client_api_1.MergeTree.MarkerBehaviors.RangeEnd, ["box"]));
    pos++;
    return pos;
}
function createTable(pos, flowView, nrows = 3, nboxes = 3) {
    let pgAtStart = true;
    if (pos > 0) {
        let segoff = flowView.client.mergeTree.getContainingSegment(pos - 1, client_api_1.MergeTree.UniversalSequenceNumber, flowView.client.getClientId());
        if (segoff.segment.getType() === client_api_1.MergeTree.SegmentType.Marker) {
            let marker = segoff.segment;
            if (marker.hasTileLabel("pg")) {
                pgAtStart = false;
            }
        }
    }
    let content = ["aardvark", "racoon", "jackelope", "springbok", "tiger", "lion", "eland", "anaconda", "fox"];
    let idBase = flowView.client.longClientId;
    idBase += `T${tableIdSuffix++}`;
    let opList = [];
    if (pgAtStart) {
        // TODO: copy pg properties from pg marker after pos
        let pgOp = createMarkerOp(pos, "", client_api_1.MergeTree.MarkerBehaviors.Tile, [], ["pg"]);
        opList.push(pgOp);
        pos++;
    }
    opList.push(createMarkerOp(pos, idBase, client_api_1.MergeTree.MarkerBehaviors.RangeBegin, ["table"]));
    pos++;
    for (let row = 0; row < nrows; row++) {
        let rowId = idBase + `row${rowIdSuffix++}`;
        opList.push(createMarkerOp(pos, rowId, client_api_1.MergeTree.MarkerBehaviors.RangeBegin, ["row"]));
        pos++;
        for (let box = 0; box < nboxes; box++) {
            pos = createBox(opList, idBase, pos, content[(box + (nboxes * row)) % content.length]);
        }
        opList.push(createMarkerOp(pos, endPrefix + rowId, client_api_1.MergeTree.MarkerBehaviors.RangeEnd, ["row"]));
        pos++;
    }
    opList.push(createMarkerOp(pos, endPrefix + idBase, client_api_1.MergeTree.MarkerBehaviors.RangeEnd |
        client_api_1.MergeTree.MarkerBehaviors.Tile, ["table"], ["pg"]));
    pos++;
    let groupOp = {
        ops: opList,
        type: 3 /* GROUP */,
    };
    flowView.sharedString.transaction(groupOp);
}
class TableView {
    constructor(tableMarker, endTableMarker) {
        this.tableMarker = tableMarker;
        this.endTableMarker = endTableMarker;
        this.minContentWidth = 0;
        this.indentPct = 0.0;
        this.contentPct = 1.0;
        this.rows = [];
        this.columns = [];
    }
    nextBox(box) {
        let retNext = false;
        for (let rowIndex = 0, rowCount = this.rows.length; rowIndex < rowCount; rowIndex++) {
            let row = this.rows[rowIndex];
            for (let boxIndex = 0, boxCount = row.boxes.length; boxIndex < boxCount; boxIndex++) {
                let rowBox = row.boxes[boxIndex];
                if (retNext) {
                    return rowBox;
                }
                if (rowBox === box) {
                    retNext = true;
                }
            }
        }
    }
    prevBox(box) {
        let retPrev = false;
        for (let rowIndex = this.rows.length - 1; rowIndex >= 0; rowIndex--) {
            let row = this.rows[rowIndex];
            for (let boxIndex = row.boxes.length - 1; boxIndex >= 0; boxIndex--) {
                let rowBox = row.boxes[boxIndex];
                if (retPrev) {
                    return rowBox;
                }
                if (rowBox === box) {
                    retPrev = true;
                }
            }
        }
    }
    findPrecedingRow(rowView) {
        let prevRow;
        for (let rowIndex = 0, rowCount = this.rows.length; rowIndex < rowCount; rowIndex++) {
            let row = this.rows[rowIndex];
            if (row === rowView) {
                return prevRow;
            }
            prevRow = row;
        }
    }
    findNextRow(rowView) {
        let nextRow;
        for (let rowIndex = this.rows.length - 1; rowIndex >= 0; rowIndex--) {
            let row = this.rows[rowIndex];
            if (row === rowView) {
                return nextRow;
            }
            nextRow = row;
        }
    }
    /*
        public insertColumnRight(requestingBox: BoxView, columnIndex: number, flowView: FlowView) {
            let column = this.columns[columnIndex];
            let opList = <SharedString.IMergeTreeOp[]>[];
            let client = flowView.client;
            let mergeTree = client.mergeTree;
            let tablePos = mergeTree.getOffset(this.tableMarker, SharedString.UniversalSequenceNumber,
                client.getClientId());
            let horizVersion = this.tableMarker.properties["horizVersion"];
            let versionIncr = <SharedString.IMergeTreeAnnotateMsg>{
                combiningOp: { name: "incr", defaultValue: 0 },
                pos1: tablePos,
                pos2: tablePos + 1,
                props: { horizVersion: 1 },
                type: SharedString.MergeTreeDeltaType.ANNOTATE,
                when: { props: { horizVersion } },
            };
            opList.push(versionIncr);
            let idBase = this.tableMarker.getId();
            for (let rowIndex = 0, len = column.boxes.length; rowIndex < len; rowIndex++) {
                let box = column.boxes[rowIndex];
                opList.push(<SharedString.Inser)
            }
        }
    */
    updateWidth(w) {
        this.width = w;
        let proportionalWidthPerColumn = Math.floor(this.width / this.columns.length);
        // assume remaining width positive for now
        // assume uniform number of columns in rows for now (later update each row separately)
        let abscondedWidth = 0;
        let totalWidth = 0;
        for (let i = 0, len = this.columns.length; i < len; i++) {
            let col = this.columns[i];
            // TODO: borders
            if (col.minContentWidth > proportionalWidthPerColumn) {
                col.width = col.minContentWidth;
                abscondedWidth += col.width;
                proportionalWidthPerColumn = Math.floor((this.width - abscondedWidth) / (len - i));
            }
            else {
                col.width = proportionalWidthPerColumn;
            }
            totalWidth += col.width;
            if (i === (len - 1)) {
                if (totalWidth < this.width) {
                    col.width += (this.width - totalWidth);
                }
            }
            for (let box of col.boxes) {
                box.specWidth = col.width;
            }
        }
    }
}
class ColumnView {
    constructor(columnIndex) {
        this.columnIndex = columnIndex;
        this.minContentWidth = 0;
        this.width = 0;
        this.boxes = [];
    }
}
function findRowParent(lineDiv) {
    let parent = lineDiv.parentElement;
    while (parent) {
        if (parent.rowView) {
            return parent;
        }
        parent = parent.parentElement;
    }
}
class RowView {
    constructor(rowMarker, endRowMarker) {
        this.rowMarker = rowMarker;
        this.endRowMarker = endRowMarker;
        this.minContentWidth = 0;
        this.boxes = [];
    }
    findClosestBox(x) {
        let bestBox;
        let bestDistance = -1;
        for (let box of this.boxes) {
            let bounds = box.div.getBoundingClientRect();
            let center = bounds.left + (bounds.width / 2);
            let distance = Math.abs(center - x);
            if ((distance < bestDistance) || (bestDistance < 0)) {
                bestBox = box;
                bestDistance = distance;
            }
        }
        return bestBox;
    }
}
class BoxView {
    constructor(marker, endMarker) {
        this.marker = marker;
        this.endMarker = endMarker;
        this.minContentWidth = 0;
        this.specWidth = 0;
    }
}
function parseBox(boxStartPos, docContext, flowView) {
    let mergeTree = flowView.client.mergeTree;
    let boxMarkerSegOff = mergeTree.getContainingSegment(boxStartPos, client_api_1.MergeTree.UniversalSequenceNumber, flowView.client.getClientId());
    let boxMarker = boxMarkerSegOff.segment;
    let id = boxMarker.getId();
    let endId = "end-" + id;
    let endBoxMarker = mergeTree.getSegmentFromId(endId);
    let endBoxPos = mergeTree.getOffset(endBoxMarker, client_api_1.MergeTree.UniversalSequenceNumber, flowView.client.getClientId());
    boxMarker.view = new BoxView(boxMarker, endBoxMarker);
    let nextPos = boxStartPos + boxMarker.cachedLength;
    while (nextPos < endBoxPos) {
        let segoff = mergeTree.getContainingSegment(nextPos, client_api_1.MergeTree.UniversalSequenceNumber, flowView.client.getClientId());
        // TODO: model error checking
        let segment = segoff.segment;
        if (segment.getType() === client_api_1.MergeTree.SegmentType.Marker) {
            let marker = segoff.segment;
            if (marker.hasRangeLabel("table")) {
                let tableMarker = marker;
                parseTable(tableMarker, nextPos, docContext, flowView);
                if (tableMarker.view.minContentWidth > boxMarker.view.minContentWidth) {
                    boxMarker.view.minContentWidth = tableMarker.view.minContentWidth;
                }
                let endTableMarker = tableMarker.view.endTableMarker;
                nextPos = mergeTree.getOffset(endTableMarker, client_api_1.MergeTree.UniversalSequenceNumber, flowView.client.getClientId());
                nextPos += endTableMarker.cachedLength;
            }
            else {
                // empty paragraph
                nextPos++;
            }
        }
        else {
            // text segment
            let tilePos = findTile(flowView, nextPos, "pg", false);
            let pgMarker = tilePos.tile;
            if (!pgMarker.itemCache) {
                let itemsContext = {
                    curPGMarker: pgMarker,
                    docContext,
                    itemInfo: { items: [], minWidth: 0 },
                };
                let paragraphLexer = new ParagraphLexer(tokenToItems, itemsContext);
                itemsContext.paragraphLexer = paragraphLexer;
                mergeTree.mapRange({ leaf: segmentToItems }, client_api_1.MergeTree.UniversalSequenceNumber, flowView.client.getClientId(), itemsContext, nextPos, tilePos.pos);
                pgMarker.itemCache = itemsContext.itemInfo;
            }
            nextPos = tilePos.pos + 1;
            if (pgMarker.itemCache.minWidth > boxMarker.view.minContentWidth) {
                boxMarker.view.minContentWidth = pgMarker.itemCache.minWidth;
            }
        }
    }
    // console.log(`parsed box ${boxMarker.getId()}`);
    return boxMarker;
}
function parseRow(rowStartPos, docContext, flowView) {
    let mergeTree = flowView.client.mergeTree;
    let rowMarkerSegOff = mergeTree.getContainingSegment(rowStartPos, client_api_1.MergeTree.UniversalSequenceNumber, flowView.client.getClientId());
    let rowMarker = rowMarkerSegOff.segment;
    let id = rowMarker.getId();
    let endId = "end-" + id;
    let endRowMarker = mergeTree.getSegmentFromId(endId);
    let endRowPos = mergeTree.getOffset(endRowMarker, client_api_1.MergeTree.UniversalSequenceNumber, flowView.client.getClientId());
    rowMarker.view = new RowView(rowMarker, endRowMarker);
    let nextPos = rowStartPos + rowMarker.cachedLength;
    while (nextPos < endRowPos) {
        let boxMarker = parseBox(nextPos, docContext, flowView);
        rowMarker.view.minContentWidth += boxMarker.view.minContentWidth;
        rowMarker.view.boxes.push(boxMarker.view);
        let endBoxPos = mergeTree.getOffset(boxMarker.view.endMarker, client_api_1.MergeTree.UniversalSequenceNumber, flowView.client.getClientId());
        nextPos = endBoxPos + boxMarker.view.endMarker.cachedLength;
    }
    return rowMarker;
}
function parseTable(tableMarker, tableMarkerPos, docContext, flowView) {
    let mergeTree = flowView.client.mergeTree;
    let id = tableMarker.getId();
    let endId = "end-" + id;
    let endTableMarker = mergeTree.getSegmentFromId(endId);
    let endTablePos = mergeTree.getOffset(endTableMarker, client_api_1.MergeTree.UniversalSequenceNumber, flowView.client.getClientId());
    let tableView = new TableView(tableMarker, endTableMarker);
    tableMarker.view = tableView;
    let nextPos = tableMarkerPos + tableMarker.cachedLength;
    let rowIndex = 0;
    while (nextPos < endTablePos) {
        let rowMarker = parseRow(nextPos, docContext, flowView);
        let rowView = rowMarker.view;
        rowView.table = tableView;
        rowView.pos = nextPos;
        for (let i = 0, len = rowView.boxes.length; i < len; i++) {
            let box = rowView.boxes[i];
            if (!tableView.columns[i]) {
                tableView.columns[i] = new ColumnView(i);
            }
            let columnView = tableView.columns[i];
            columnView.boxes[rowIndex] = box;
            if (box.minContentWidth > columnView.minContentWidth) {
                columnView.minContentWidth = box.minContentWidth;
            }
        }
        if (rowMarker.view.minContentWidth > tableView.minContentWidth) {
            tableView.minContentWidth = rowMarker.view.minContentWidth;
        }
        let endRowPos = mergeTree.getOffset(rowMarker.view.endRowMarker, client_api_1.MergeTree.UniversalSequenceNumber, flowView.client.getClientId());
        tableView.rows[rowIndex++] = rowView;
        rowView.endPos = endRowPos;
        nextPos = endRowPos + rowMarker.view.endRowMarker.cachedLength;
    }
    return tableView;
}
function isInnerBox(boxView, layoutInfo) {
    return (!layoutInfo.startingPosStack) || (!layoutInfo.startingPosStack.box) ||
        (layoutInfo.startingPosStack.box.empty()) ||
        (layoutInfo.startingPosStack.box.items.length === (layoutInfo.stackIndex + 1));
}
function renderBox(boxView, layoutInfo, defer = false, rightmost = false) {
    let boxRect = new ui.Rectangle(0, 0, boxView.specWidth, 0);
    let boxViewportWidth = boxView.specWidth - (2 * layoutInfo.docContext.boxHMargin);
    let boxViewportRect = new ui.Rectangle(layoutInfo.docContext.boxHMargin, 0, boxViewportWidth, 0);
    let boxDiv = document.createElement("div");
    boxView.div = boxDiv;
    boxRect.conformElementOpenHeight(boxDiv);
    if (!rightmost) {
        boxDiv.style.borderRight = "1px solid black";
    }
    let client = layoutInfo.flowView.client;
    let mergeTree = client.mergeTree;
    let transferDeferredHeight = false;
    boxView.viewport = new Viewport(layoutInfo.viewport.remainingHeight(), document.createElement("div"), boxViewportWidth);
    boxViewportRect.conformElementOpenHeight(boxView.viewport.div);
    boxDiv.appendChild(boxView.viewport.div);
    boxView.viewport.vskip(layoutInfo.docContext.boxTopMargin);
    let boxLayoutInfo = {
        deferredAttach: true,
        docContext: layoutInfo.docContext,
        endMarker: boxView.endMarker,
        flowView: layoutInfo.flowView,
        requestedPosition: layoutInfo.requestedPosition,
        stackIndex: layoutInfo.stackIndex,
        startingPosStack: layoutInfo.startingPosStack,
        viewport: boxView.viewport,
    };
    // TODO: deferred height calculation for starting in middle of box
    if (isInnerBox(boxView, layoutInfo)) {
        let boxPos = mergeTree.getOffset(boxView.marker, client_api_1.MergeTree.UniversalSequenceNumber, client.getClientId());
        boxLayoutInfo.startPos = boxPos + boxView.marker.cachedLength;
    }
    else {
        let nextTable = layoutInfo.startingPosStack.table.items[layoutInfo.stackIndex + 1];
        boxLayoutInfo.startPos = getOffset(layoutInfo.flowView, nextTable);
        boxLayoutInfo.stackIndex = layoutInfo.stackIndex + 1;
    }
    boxView.renderOutput = renderFlow(boxLayoutInfo, defer);
    if (transferDeferredHeight && (boxView.renderOutput.deferredHeight > 0)) {
        layoutInfo.deferUntilHeight = boxView.renderOutput.deferredHeight;
    }
    boxView.renderedHeight = boxLayoutInfo.viewport.getLineTop();
    if (boxLayoutInfo.reRenderList) {
        if (!layoutInfo.reRenderList) {
            layoutInfo.reRenderList = [];
        }
        for (let lineDiv of boxLayoutInfo.reRenderList) {
            layoutInfo.reRenderList.push(lineDiv);
        }
    }
}
function setRowBorders(rowDiv, top = false) {
    rowDiv.style.borderLeft = "1px solid black";
    rowDiv.style.borderRight = "1px solid black";
    if (top) {
        rowDiv.style.borderTop = "1px solid black";
    }
    rowDiv.style.borderBottom = "1px solid black";
}
function renderTable(table, docContext, layoutInfo, defer = false) {
    let flowView = layoutInfo.flowView;
    let mergeTree = flowView.client.mergeTree;
    let tablePos = mergeTree.getOffset(table, client_api_1.MergeTree.UniversalSequenceNumber, flowView.client.getClientId());
    let tableView = parseTable(table, tablePos, docContext, flowView);
    // let docContext = buildDocumentContext(viewportDiv);
    let viewportWidth = parseInt(layoutInfo.viewport.div.style.width, 10);
    let tableWidth = Math.floor(tableView.contentPct * viewportWidth);
    tableView.updateWidth(tableWidth);
    let tableIndent = Math.floor(tableView.indentPct * viewportWidth);
    let startRow;
    let startBox;
    if (layoutInfo.startingPosStack) {
        if (layoutInfo.startingPosStack.row &&
            (layoutInfo.startingPosStack.row.items.length > layoutInfo.stackIndex)) {
            let startRowMarker = layoutInfo.startingPosStack.row.items[layoutInfo.stackIndex];
            startRow = startRowMarker.view;
        }
        if (layoutInfo.startingPosStack.box &&
            (layoutInfo.startingPosStack.box.items.length > layoutInfo.stackIndex)) {
            let startBoxMarker = layoutInfo.startingPosStack.box.items[layoutInfo.stackIndex];
            startBox = startBoxMarker.view;
        }
    }
    let foundStartRow = (startRow === undefined);
    let tableHeight = 0;
    let deferredHeight = 0;
    let topRow = (layoutInfo.startingPosStack !== undefined) && (layoutInfo.stackIndex === 0);
    let firstRendered = true;
    for (let rowIndex = 0, rowCount = tableView.rows.length; rowIndex < rowCount; rowIndex++) {
        let rowView = tableView.rows[rowIndex];
        let rowHeight = 0;
        if (startRow === rowView) {
            foundStartRow = true;
        }
        let renderRow = (!defer) && (deferredHeight >= layoutInfo.deferUntilHeight) && foundStartRow;
        let rowDiv;
        if (renderRow) {
            let rowRect = new ui.Rectangle(tableIndent, layoutInfo.viewport.getLineTop(), tableWidth, 0);
            rowDiv = document.createElement("div");
            rowDiv.rowView = rowView;
            setRowBorders(rowDiv, firstRendered);
            firstRendered = false;
            rowRect.conformElementOpenHeight(rowDiv);
            if (topRow && startBox) {
                renderBox(startBox, layoutInfo, defer, startBox === rowView.boxes[rowView.boxes.length - 1]);
                deferredHeight += startBox.renderOutput.deferredHeight;
                rowHeight = startBox.renderedHeight;
            }
        }
        let boxX = 0;
        for (let boxIndex = 0, boxCount = rowView.boxes.length; boxIndex < boxCount; boxIndex++) {
            let box = rowView.boxes[boxIndex];
            if (!topRow || (box !== startBox)) {
                renderBox(box, layoutInfo, defer, box === rowView.boxes[rowView.boxes.length - 1]);
                if (rowHeight < box.renderedHeight) {
                    rowHeight = box.renderedHeight;
                }
                deferredHeight += box.renderOutput.deferredHeight;
                if (renderRow) {
                    box.viewport.div.style.height = `${box.renderedHeight}px`;
                    box.div.style.height = `${box.renderedHeight}px`;
                    box.div.style.left = `${boxX}px`;
                    rowDiv.appendChild(box.div);
                }
                boxX += box.specWidth;
            }
        }
        if (renderRow) {
            let heightVal = `${rowHeight}px`;
            for (let boxIndex = 0, boxCount = rowView.boxes.length; boxIndex < boxCount; boxIndex++) {
                let box = rowView.boxes[boxIndex];
                box.div.style.height = heightVal;
            }
            tableHeight += rowHeight;
            layoutInfo.viewport.commitLineDiv(rowDiv, rowHeight);
            rowDiv.style.height = heightVal;
            rowDiv.linePos = rowView.pos;
            rowDiv.lineEnd = rowView.endPos;
            layoutInfo.viewport.div.appendChild(rowDiv);
        }
        if (topRow) {
            topRow = false;
            layoutInfo.startingPosStack = undefined;
        }
    }
    if (layoutInfo.reRenderList) {
        for (let lineDiv of layoutInfo.reRenderList) {
            reRenderLine(lineDiv, flowView);
        }
        layoutInfo.reRenderList = undefined;
    }
    tableView.deferredHeight = deferredHeight;
    tableView.renderedHeight = tableHeight;
}
function renderTree(viewportDiv, requestedPosition, flowView) {
    let client = flowView.client;
    let docContext = buildDocumentContext(viewportDiv);
    let outerViewportHeight = parseInt(viewportDiv.style.height, 10);
    let outerViewportWidth = parseInt(viewportDiv.style.width, 10);
    let outerViewport = new Viewport(outerViewportHeight, viewportDiv, outerViewportWidth);
    let startingPosStack = client.mergeTree.getStackContext(requestedPosition, client.getClientId(), ["table", "box", "row"]);
    let layoutContext = {
        docContext,
        flowView,
        requestedPosition,
        viewport: outerViewport,
    };
    if (startingPosStack.table && (!startingPosStack.table.empty())) {
        let outerTable = startingPosStack.table.items[0];
        let outerTablePos = flowView.client.mergeTree.getOffset(outerTable, client_api_1.MergeTree.UniversalSequenceNumber, flowView.client.getClientId());
        layoutContext.startPos = outerTablePos;
        layoutContext.stackIndex = 0;
        layoutContext.startingPosStack = startingPosStack;
    }
    else {
        let previousTileInfo = findTile(flowView, requestedPosition, "pg");
        if (previousTileInfo) {
            layoutContext.startPos = previousTileInfo.pos + 1;
        }
        else {
            layoutContext.startPos = 0;
        }
    }
    return renderFlow(layoutContext);
}
function tokenToItems(text, type, leadSegment, itemsContext) {
    let docContext = itemsContext.docContext;
    let lfontstr = docContext.fontstr;
    let divHeight = docContext.defaultLineDivHeight;
    if (itemsContext.curPGMarker.properties && (itemsContext.curPGMarker.properties.header !== undefined)) {
        lfontstr = docContext.headerFontstr;
        divHeight = docContext.headerDivHeight;
    }
    if (leadSegment.properties) {
        let fontSize = leadSegment.properties.fontSize;
        if (fontSize !== undefined) {
            lfontstr = `${fontSize} Times`;
            divHeight = +fontSize;
        }
        let lineHeight = leadSegment.properties.lineHeight;
        if (lineHeight !== undefined) {
            divHeight = +lineHeight;
        }
        let fontStyle = leadSegment.properties.fontStyle;
        if (fontStyle) {
            lfontstr = fontStyle + " " + lfontstr;
        }
    }
    let textWidth = getTextWidth(text, lfontstr);
    if (textWidth > itemsContext.itemInfo.minWidth) {
        itemsContext.itemInfo.minWidth = textWidth;
    }
    if (type === ParagraphItemType.Block) {
        let block = makeIPGBlock(textWidth, text, leadSegment);
        if (divHeight !== itemsContext.docContext.defaultLineDivHeight) {
            block.height = divHeight;
        }
        itemsContext.itemInfo.items.push(block);
    }
    else {
        itemsContext.itemInfo.items.push(makeGlue(textWidth, text, leadSegment, docContext.wordSpacing / 2, docContext.wordSpacing / 3));
    }
}
function isEndBox(marker) {
    return (marker.behaviors & client_api_1.MergeTree.MarkerBehaviors.RangeEnd) &&
        marker.hasRangeLabel("box");
}
function segmentToItems(segment, segpos, refSeq, clientId, start, end, context) {
    if (segment.getType() === client_api_1.MergeTree.SegmentType.Text) {
        let textSegment = segment;
        context.paragraphLexer.lex(textSegment);
    }
    else if (segment.getType() === client_api_1.MergeTree.SegmentType.Marker) {
        let marker = segment;
        if (marker.hasTileLabel("pg") || isEndBox(marker)) {
            context.nextPGPos = segpos;
            return false;
        }
    }
    return true;
}
function gatherOverlayLayer(segment, segpos, refSeq, clientId, start, end, context) {
    if (segment.getType() === client_api_1.MergeTree.SegmentType.Marker) {
        let marker = segment;
        if (marker.behaviors === client_api_1.MergeTree.MarkerBehaviors.None) {
            context.push({ id: marker.getId(), position: segpos });
        }
    }
    return true;
}
function closestNorth(lineDivs, y) {
    let best = -1;
    let lo = 0;
    let hi = lineDivs.length - 1;
    while (lo <= hi) {
        let bestBounds;
        let mid = lo + Math.floor((hi - lo) / 2);
        let lineDiv = lineDivs[mid];
        let bounds = lineDiv.getBoundingClientRect();
        if (bounds.bottom <= y) {
            if (!bestBounds || (best < 0) || (bestBounds.bottom < bounds.bottom)) {
                best = mid;
                bestBounds = bounds;
            }
            lo = mid + 1;
        }
        else {
            hi = mid - 1;
        }
    }
    return best;
}
function closestSouth(lineDivs, y) {
    let best = -1;
    let lo = 0;
    let hi = lineDivs.length - 1;
    while (lo <= hi) {
        let bestBounds;
        let mid = lo + Math.floor((hi - lo) / 2);
        let lineDiv = lineDivs[mid];
        let bounds = lineDiv.getBoundingClientRect();
        if (bounds.bottom >= y) {
            if (!bestBounds || (best < 0) || (bestBounds.bottom > bounds.bottom)) {
                best = mid;
                bestBounds = bounds;
            }
            lo = mid + 1;
        }
        else {
            hi = mid - 1;
        }
    }
    return best;
}
class Viewport {
    constructor(maxHeight, div, width) {
        this.maxHeight = maxHeight;
        this.div = div;
        this.width = width;
        // keep these in order
        this.lineDivs = [];
        this.visibleRanges = [];
        this.currentLineStart = -1;
        this.lineTop = 0;
    }
    startLine(heightEstimate) {
        // TODO: update width relative to started line
    }
    firstLineDiv() {
        if (this.lineDivs.length > 0) {
            return this.lineDivs[0];
        }
    }
    lastLineDiv() {
        if (this.lineDivs.length > 0) {
            return this.lineDivs[this.lineDivs.length - 1];
        }
    }
    currentLineWidth() {
        return this.width;
    }
    vskip(h) {
        this.lineTop += h;
    }
    getLineTop() {
        return this.lineTop;
    }
    setLineTop(v) {
        this.lineTop = v;
    }
    commitLineDiv(lineDiv, h) {
        this.lineTop += h;
        this.lineDivs.push(lineDiv);
    }
    findClosestLineDiv(up = true, y) {
        let bestIndex = -1;
        if (up) {
            bestIndex = closestNorth(this.lineDivs, y);
        }
        else {
            bestIndex = closestSouth(this.lineDivs, y);
        }
        if (bestIndex >= 0) {
            return this.lineDivs[bestIndex];
        }
    }
    remainingHeight() {
        return this.maxHeight - this.lineTop;
    }
    setWidth(w) {
        this.width = w;
    }
}
function renderFlow(layoutContext, deferWhole = false) {
    let flowView = layoutContext.flowView;
    let client = flowView.client;
    // TODO: for stable viewports cache the geometry and the divs
    // TODO: cache all this pre-amble in style blocks; override with pg properties
    let docContext = layoutContext.docContext;
    let viewportStartPos = -1;
    let lastLineDiv = undefined;
    function makeLineDiv(r, lineFontstr) {
        let lineDiv = makeContentDiv(r, lineFontstr);
        layoutContext.viewport.div.appendChild(lineDiv);
        lastLineDiv = lineDiv;
        return lineDiv;
    }
    let currentPos = layoutContext.startPos;
    let curPGMarker;
    let curPGMarkerPos;
    let itemsContext = {
        docContext,
    };
    if (layoutContext.deferUntilHeight === undefined) {
        layoutContext.deferUntilHeight = 0;
    }
    let deferredHeight = 0;
    let deferredPGs = (layoutContext.containingPGMarker !== undefined);
    let paragraphLexer = new ParagraphLexer(tokenToItems, itemsContext);
    itemsContext.paragraphLexer = paragraphLexer;
    textErrorRun = undefined;
    function renderPG(endPGMarker, pgStartPos, indentWidth, indentSymbol, contentWidth) {
        let pgBreaks = endPGMarker.cache.breaks;
        let lineDiv;
        let lineDivHeight = docContext.defaultLineDivHeight;
        let span;
        for (let breakIndex = 0, len = pgBreaks.length; breakIndex < len; breakIndex++) {
            let lineStart = pgBreaks[breakIndex] + pgStartPos;
            let lineEnd;
            if (breakIndex < (len - 1)) {
                lineEnd = pgBreaks[breakIndex + 1] + pgStartPos;
            }
            else {
                lineEnd = undefined;
            }
            let lineFontstr = docContext.fontstr;
            lineDivHeight = docContext.defaultLineDivHeight;
            if (endPGMarker.properties && (endPGMarker.properties.header !== undefined)) {
                // TODO: header levels etc.
                lineDivHeight = docContext.headerDivHeight;
                lineFontstr = docContext.headerFontstr;
            }
            let lineOK = (!(deferredPGs || deferWhole)) && (layoutContext.deferUntilHeight <= deferredHeight);
            if (lineOK && ((lineEnd === undefined) || (lineEnd > layoutContext.requestedPosition))) {
                lineDiv = makeLineDiv(new ui.Rectangle(0, layoutContext.viewport.getLineTop(), layoutContext.viewport.currentLineWidth(), lineDivHeight), lineFontstr);
                let contentDiv = lineDiv;
                if (indentWidth > 0) {
                    contentDiv = makeContentDiv(new ui.Rectangle(indentWidth, 0, contentWidth, lineDivHeight), lineFontstr);
                    lineDiv.indentWidth = indentWidth;
                    lineDiv.contentWidth = indentWidth;
                    if (indentSymbol && (breakIndex === 0)) {
                        lineDiv.indentSymbol = indentSymbol;
                        decorateLineDiv(lineDiv, lineFontstr, lineDivHeight);
                    }
                    lineDiv.appendChild(contentDiv);
                }
                let lineContext = {
                    contentDiv, deferredAttach: layoutContext.deferredAttach, flowView: layoutContext.flowView,
                    lineDiv, lineDivHeight, span,
                };
                if (viewportStartPos < 0) {
                    viewportStartPos = lineStart;
                }
                client.mergeTree.mapRange({ leaf: renderSegmentIntoLine }, client_api_1.MergeTree.UniversalSequenceNumber, client.getClientId(), lineContext, lineStart, lineEnd);
                span = lineContext.span;
                if (lineContext.reRenderList) {
                    if (!layoutContext.reRenderList) {
                        layoutContext.reRenderList = [];
                    }
                    for (let ldiv of lineContext.reRenderList) {
                        layoutContext.reRenderList.push(ldiv);
                    }
                }
                layoutContext.viewport.commitLineDiv(lineDiv, lineDivHeight);
            }
            else {
                deferredHeight += lineDivHeight;
            }
            if (layoutContext.viewport.remainingHeight() < docContext.defaultLineDivHeight) {
                // no more room for lines
                // TODO: record end viewport char
                break;
            }
        }
    }
    let fetchLog = false;
    let segoff;
    let totalLength = client.getLength();
    // TODO: use end of doc marker
    do {
        if (!segoff) {
            segoff = getContainingSegment(flowView, currentPos);
        }
        if (fetchLog) {
            console.log(`got segment ${segoff.segment.toString()}`);
        }
        if (!segoff.segment) {
            break;
        }
        if ((segoff.segment.getType() === client_api_1.MergeTree.SegmentType.Marker) &&
            (segoff.segment.hasRangeLabel("table"))) {
            let marker = segoff.segment;
            // TODO: branches
            let tableView;
            if (marker.removedSeq === undefined) {
                renderTable(marker, docContext, layoutContext, deferredPGs);
                tableView = marker.view;
                deferredHeight += tableView.deferredHeight;
                layoutContext.viewport.vskip(layoutContext.docContext.tableVspace);
            }
            else {
                tableView = parseTable(marker, currentPos, docContext, flowView);
            }
            let endTablePos = getOffset(layoutContext.flowView, tableView.endTableMarker);
            currentPos = endTablePos + 1;
            segoff = undefined;
            // TODO: if reached end of viewport, get pos ranges
        }
        else {
            if (segoff.segment.getType() === client_api_1.MergeTree.SegmentType.Marker) {
                // empty paragraph
                curPGMarker = segoff.segment;
                if (fetchLog) {
                    console.log("empty pg");
                    if (curPGMarker.itemCache) {
                        console.log(`length items ${curPGMarker.itemCache.items.length}`);
                    }
                }
                curPGMarkerPos = currentPos;
            }
            else {
                let curTilePos = findTile(flowView, currentPos, "pg", false);
                curPGMarker = curTilePos.tile;
                curPGMarkerPos = curTilePos.pos;
            }
            itemsContext.curPGMarker = curPGMarker;
            // TODO: only set this to undefined if text changed
            curPGMarker.listCache = undefined;
            getListCacheInfo(layoutContext.flowView, curPGMarker, curPGMarkerPos);
            let indentPct = 0.0;
            let contentPct = 1.0;
            let indentWidth = 0;
            let contentWidth = layoutContext.viewport.currentLineWidth();
            let indentSymbol = undefined;
            if (curPGMarker.listCache) {
                indentSymbol = getIndentSymbol(curPGMarker);
            }
            if (indentPct === 0.0) {
                indentPct = getIndentPct(curPGMarker);
            }
            if (contentPct === 1.0) {
                contentPct = getContentPct(curPGMarker);
            }
            if (indentPct !== 0.0) {
                indentWidth = Math.floor(indentPct * layoutContext.viewport.currentLineWidth());
                if (docContext.indentWidthThreshold >= layoutContext.viewport.currentLineWidth()) {
                    let em2 = Math.round(2 * getTextWidth("M", docContext.fontstr));
                    indentWidth = em2 + indentWidth;
                }
            }
            contentWidth = Math.floor(contentPct * layoutContext.viewport.currentLineWidth()) - indentWidth;
            if (contentWidth > layoutContext.viewport.currentLineWidth()) {
                // tslint:disable:max-line-length
                console.log(`egregious content width ${contentWidth} bound ${layoutContext.viewport.currentLineWidth()}`);
            }
            if (flowView.historyClient) {
                clearContentCaches(curPGMarker);
            }
            if ((!curPGMarker.cache) || (curPGMarker.cache.singleLineWidth !== contentWidth)) {
                if (!curPGMarker.itemCache) {
                    itemsContext.itemInfo = { items: [], minWidth: 0 };
                    client.mergeTree.mapRange({ leaf: segmentToItems }, client_api_1.MergeTree.UniversalSequenceNumber, client.getClientId(), itemsContext, currentPos, curPGMarkerPos + 1);
                    curPGMarker.itemCache = itemsContext.itemInfo;
                }
                else {
                    itemsContext.itemInfo = curPGMarker.itemCache;
                }
                let breaks = breakPGIntoLinesFF(itemsContext.itemInfo.items, contentWidth);
                curPGMarker.cache = { breaks, singleLineWidth: contentWidth };
            }
            paragraphLexer.reset();
            // TODO: more accurate end of document reasoning
            if (currentPos < totalLength) {
                renderPG(curPGMarker, currentPos, indentWidth, indentSymbol, contentWidth);
                currentPos = curPGMarkerPos + curPGMarker.cachedLength;
                if (currentPos >= totalLength) {
                    break;
                }
                segoff = getContainingSegment(flowView, currentPos);
                if (segoff.segment.getType() === client_api_1.MergeTree.SegmentType.Marker) {
                    let marker = segoff.segment;
                    if (marker.hasRangeLabel("box") && (marker.behaviors & client_api_1.MergeTree.MarkerBehaviors.RangeEnd)) {
                        layoutContext.viewport.vskip(layoutContext.docContext.boxVspace);
                        break;
                    }
                }
                if (!deferredPGs) {
                    layoutContext.viewport.vskip(docContext.pgVspace);
                }
                if (lastLineDiv) {
                    lastLineDiv.lineEnd = curPGMarkerPos;
                }
            }
            else {
                break;
            }
        }
    } while (layoutContext.viewport.remainingHeight() >= docContext.defaultLineDivHeight);
    // Find overlay annotations
    const viewportEndPos = currentPos;
    const overlayMarkers = [];
    client.mergeTree.mapRange({ leaf: gatherOverlayLayer }, client_api_1.MergeTree.UniversalSequenceNumber, client.getClientId(), overlayMarkers, viewportStartPos, viewportEndPos);
    return {
        deferredHeight,
        overlayMarkers,
        viewportStartPos,
        viewportEndPos,
    };
}
function makeSegSpan(context, segText, textSegment, offsetFromSegpos, segpos) {
    let span = document.createElement("span");
    span.innerText = segText;
    span.seg = textSegment;
    span.segPos = segpos;
    let textErr = false;
    const spellOption = "spellchecker";
    if (textSegment.properties) {
        // tslint:disable-next-line
        for (let key in textSegment.properties) {
            if (key === "textError" && (viewOptions === undefined || viewOptions[spellOption] !== "disabled")) {
                textErr = true;
                if (textErrorRun === undefined) {
                    textErrorRun = {
                        end: segpos + offsetFromSegpos + segText.length,
                        start: segpos + offsetFromSegpos,
                    };
                }
                else {
                    textErrorRun.end += segText.length;
                }
                let textErrorInfo = textSegment.properties[key];
                let slb;
                span.textErrorRun = textErrorRun;
                if (textErrorInfo.color === "paul") {
                    span.style.background = underlinePaulStringURL;
                }
                else if (textErrorInfo.color === "paulgreen") {
                    span.style.background = underlinePaulGrammarStringURL;
                }
                else if (textErrorInfo.color === "paulgolden") {
                    span.style.background = underlinePaulGoldStringURL;
                }
                else {
                    span.style.background = underlineStringURL;
                }
                if (textErrorInfo.alternates.length > 0) {
                    span.onmousedown = (e) => {
                        function cancelIntellisense(ev) {
                            if (slb) {
                                document.body.removeChild(slb.elm);
                                slb = undefined;
                            }
                        }
                        function acceptIntellisense(ev) {
                            cancelIntellisense(ev);
                            let itemElm = ev.target;
                            let text = itemElm.innerText.trim();
                            context.sharedString.removeText(span.textErrorRun.start, span.textErrorRun.end);
                            context.sharedString.insertText(text, span.textErrorRun.start);
                            context.localQueueRender(span.textErrorRun.start);
                        }
                        function selectItem(ev) {
                            let itemElm = ev.target;
                            if (slb) {
                                slb.selectItem(itemElm.innerText);
                            }
                            // console.log(`highlight ${itemElm.innerText}`);
                        }
                        console.log(`button ${e.button}`);
                        if ((e.button === 2) || ((e.button === 0) && (e.ctrlKey))) {
                            let spanBounds = ui.Rectangle.fromClientRect(span.getBoundingClientRect());
                            spanBounds.width = Math.floor(window.innerWidth / 4);
                            slb = selectionListBoxCreate(spanBounds, document.body, 24, 0, 12);
                            slb.showSelectionList(altsToItems(textErrorInfo.alternates));
                            span.onmouseup = cancelIntellisense;
                            document.body.onmouseup = cancelIntellisense;
                            slb.elm.onmouseup = acceptIntellisense;
                            slb.elm.onmousemove = selectItem;
                        }
                        else if (e.button === 0) {
                            context.clickSpan(e.clientX, e.clientY, span);
                        }
                    };
                }
            }
            else {
                span.style[key] = textSegment.properties[key];
            }
        }
    }
    if (!textErr) {
        textErrorRun = undefined;
    }
    if (offsetFromSegpos > 0) {
        span.offset = offsetFromSegpos;
    }
    return span;
}
function pointerToElementOffsetWebkit(x, y) {
    let range = document.caretRangeFromPoint(x, y);
    if (range) {
        let result = {
            elm: range.startContainer.parentElement,
            node: range.startContainer,
            offset: range.startOffset,
        };
        range.detach();
        return result;
    }
}
function clearSubtree(elm) {
    while (elm.lastChild) {
        elm.removeChild(elm.lastChild);
    }
}
exports.clearSubtree = clearSubtree;
let presenceColors = ["darkgreen", "sienna", "olive", "purple"];
class Cursor {
    constructor(viewportDiv, pos = 0) {
        this.viewportDiv = viewportDiv;
        this.pos = pos;
        this.off = true;
        this.presenceInfoUpdated = true;
        this.blinkCount = 0;
        this.bgColor = "blue";
        this.blinker = () => {
            if (this.off) {
                this.show();
            }
            else {
                this.hide();
            }
            this.off = !this.off;
            if (this.blinkCount > 0) {
                this.blinkCount--;
                if (this.presenceInfo) {
                    let opacity = 0.5 + (0.5 * Math.exp(-0.05 * (30 - this.blinkCount)));
                    if (this.blinkCount <= 20) {
                        opacity = 0.0;
                    }
                    else if (this.blinkCount > 26) {
                        opacity = 1.0;
                    }
                    this.presenceDiv.style.opacity = `${opacity}`;
                }
                this.blinkTimer = setTimeout(this.blinker, 500);
            }
            else {
                if (this.presenceInfo) {
                    this.presenceDiv.style.opacity = "0.0";
                }
                this.show();
            }
        };
        this.makeSpan();
    }
    addPresenceInfo(presenceInfo) {
        // for now, color
        let presenceColorIndex = presenceInfo.clientId % presenceColors.length;
        this.bgColor = presenceColors[presenceColorIndex];
        this.presenceInfo = presenceInfo;
        this.makePresenceDiv();
        this.show();
    }
    hide() {
        this.editSpan.style.visibility = "hidden";
    }
    show() {
        this.editSpan.style.backgroundColor = this.bgColor;
        this.editSpan.style.visibility = "visible";
        if (this.presenceInfo) {
            this.presenceDiv.style.visibility = "visible";
        }
    }
    makePresenceDiv() {
        this.presenceDiv = document.createElement("div");
        this.presenceDiv.innerText = this.presenceInfo.key;
        this.presenceDiv.style.zIndex = "1";
        this.presenceDiv.style.position = "absolute";
        this.presenceDiv.style.color = "white";
        this.presenceDiv.style.backgroundColor = this.bgColor;
        this.presenceDiv.style.font = "14px Arial";
        this.presenceDiv.style.border = `3px solid ${this.bgColor}`;
        this.presenceDiv.style.borderTopRightRadius = "1em";
    }
    makeSpan() {
        this.editSpan = document.createElement("span");
        this.editSpan.innerText = "\uFEFF";
        this.editSpan.style.zIndex = "1";
        this.editSpan.style.position = "absolute";
        this.editSpan.style.left = "0px";
        this.editSpan.style.top = "0px";
        this.editSpan.style.width = "2px";
        this.show();
    }
    lineDiv() {
        return this.editSpan.parentElement;
    }
    updateView(flowView) {
        let lineDiv = this.lineDiv();
        if (lineDiv && (lineDiv.linePos <= this.pos) && (lineDiv.lineEnd > this.pos)) {
            reRenderLine(lineDiv, flowView);
        }
        else {
            let foundLineDiv = findLineDiv(this.pos, flowView, true);
            if (foundLineDiv) {
                reRenderLine(foundLineDiv, flowView);
            }
            else {
                flowView.render(flowView.topChar, true);
            }
        }
    }
    rect() {
        return this.editSpan.getBoundingClientRect();
    }
    assignToLine(x, h, lineDiv) {
        this.editSpan.style.left = `${x}px`;
        this.editSpan.style.height = `${h}px`;
        if (this.editSpan.parentElement) {
            this.editSpan.parentElement.removeChild(this.editSpan);
        }
        lineDiv.appendChild(this.editSpan);
        if (this.presenceInfo) {
            let bannerHeight = 20;
            let halfBannerHeight = bannerHeight / 2;
            this.presenceDiv.style.left = `${x}px`;
            this.presenceDiv.style.height = `${bannerHeight}px`;
            this.presenceDiv.style.top = `-${halfBannerHeight}px`;
            if (this.presenceDiv.parentElement) {
                this.presenceDiv.parentElement.removeChild(this.presenceDiv);
            }
            this.presenceDiv.style.opacity = "1.0";
            lineDiv.appendChild(this.presenceDiv);
        }
        if (this.blinkTimer) {
            clearTimeout(this.blinkTimer);
        }
        this.blinkCursor();
    }
    blinkCursor() {
        this.blinkCount = 30;
        this.off = true;
        this.blinkTimer = setTimeout(this.blinker, 20);
    }
}
exports.Cursor = Cursor;
var KeyCode;
(function (KeyCode) {
    KeyCode[KeyCode["backspace"] = 8] = "backspace";
    KeyCode[KeyCode["TAB"] = 9] = "TAB";
    KeyCode[KeyCode["esc"] = 27] = "esc";
    KeyCode[KeyCode["pageUp"] = 33] = "pageUp";
    KeyCode[KeyCode["pageDown"] = 34] = "pageDown";
    KeyCode[KeyCode["end"] = 35] = "end";
    KeyCode[KeyCode["home"] = 36] = "home";
    KeyCode[KeyCode["leftArrow"] = 37] = "leftArrow";
    KeyCode[KeyCode["upArrow"] = 38] = "upArrow";
    KeyCode[KeyCode["rightArrow"] = 39] = "rightArrow";
    KeyCode[KeyCode["downArrow"] = 40] = "downArrow";
    KeyCode[KeyCode["letter_a"] = 65] = "letter_a";
    KeyCode[KeyCode["letter_z"] = 90] = "letter_z";
})(KeyCode || (KeyCode = {}));
function getLocalRefPos(flowView, localRef) {
    return flowView.client.mergeTree.getOffset(localRef.segment, client_api_1.MergeTree.UniversalSequenceNumber, flowView.client.getClientId()) + localRef.offset;
}
function getContainingSegment(flowView, pos) {
    return flowView.client.mergeTree.getContainingSegment(pos, client_api_1.MergeTree.UniversalSequenceNumber, flowView.client.getClientId());
}
function findTile(flowView, startPos, tileType, preceding = true) {
    return flowView.client.mergeTree.findTile(startPos, flowView.client.getClientId(), tileType, preceding);
}
function getOffset(flowView, segment) {
    return flowView.client.mergeTree.getOffset(segment, client_api_1.MergeTree.UniversalSequenceNumber, flowView.client.getClientId());
}
function preventD(e) {
    e.returnValue = false;
    e.preventDefault();
    return false;
}
class FlowView extends ui.Component {
    constructor(element, collabDocument, sharedString, status, options = undefined) {
        super(element);
        this.collabDocument = collabDocument;
        this.sharedString = sharedString;
        this.status = status;
        this.options = options;
        this.ticking = false;
        this.wheelTicking = false;
        this.topChar = -1;
        this.presenceVector = [];
        this.lastVerticalX = -1;
        this.pendingRender = false;
        this.diagCharPort = false;
        this.client = sharedString.client;
        this.viewportDiv = document.createElement("div");
        this.element.appendChild(this.viewportDiv);
        this.statusMessage("li", " ");
        this.statusMessage("si", " ");
        sharedString.on("op", (msg) => {
            if (msg.clientId !== this.client.longClientId) {
                let delta = msg.contents;
                if (this.applyOp(delta, msg)) {
                    this.queueRender(msg);
                }
            }
        });
        this.cursor = new Cursor(this.viewportDiv);
        this.setViewOption(this.options);
    }
    treeForViewport() {
        console.log(this.sharedString.client.mergeTree.rangeToString(this.viewportStartPos, this.viewportEndPos));
    }
    measureClone() {
        let clock = Date.now();
        this.client.cloneFromSegments();
        console.log(`clone took ${Date.now() - clock}ms`);
    }
    xUpdateHistoryBubble(x) {
        let widgetDivBounds = this.historyWidget.getBoundingClientRect();
        let w = widgetDivBounds.width - 14;
        let diffX = x - (widgetDivBounds.left + 7);
        if (diffX <= 0) {
            diffX = 0;
        }
        let pct = diffX / w;
        let l = 7 + Math.floor(pct * w);
        let seq = this.client.historyToPct(pct);
        this.historyVersion.innerText = `Version @${seq}`;
        this.historyBubble.style.left = `${l}px`;
        this.cursor.pos = FlowView.docStartPosition;
        this.localQueueRender(FlowView.docStartPosition);
    }
    updateHistoryBubble(seq) {
        let widgetDivBounds = this.historyWidget.getBoundingClientRect();
        let w = widgetDivBounds.width - 14;
        let count = this.client.undoSegments.length + this.client.redoSegments.length;
        let pct = this.client.undoSegments.length / count;
        let l = 7 + Math.floor(pct * w);
        this.historyBubble.style.left = `${l}px`;
        this.historyVersion.innerText = `Version @${seq}`;
    }
    makeHistoryWidget() {
        let bounds = ui.Rectangle.fromClientRect(this.status.element.getBoundingClientRect());
        let x = Math.floor(bounds.width / 2);
        let y = 2;
        let widgetRect = new ui.Rectangle(x, y, Math.floor(bounds.width * 0.4), (bounds.height - 4));
        let widgetDiv = document.createElement("div");
        widgetRect.conformElement(widgetDiv);
        widgetDiv.style.zIndex = "3";
        let bubble = document.createElement("div");
        widgetDiv.style.borderRadius = "6px";
        bubble.style.position = "absolute";
        bubble.style.width = "8px";
        bubble.style.height = `${bounds.height - 6}px`;
        bubble.style.borderRadius = "5px";
        bubble.style.top = "1px";
        bubble.style.left = `${widgetRect.width - 7}px`;
        bubble.style.backgroundColor = "pink";
        widgetDiv.style.backgroundColor = "rgba(179,179,179,0.3)";
        widgetDiv.appendChild(bubble);
        let versionSpan = document.createElement("span");
        widgetDiv.appendChild(versionSpan);
        versionSpan.innerText = "History";
        versionSpan.style.padding = "3px";
        this.historyVersion = versionSpan;
        this.historyWidget = widgetDiv;
        this.historyBubble = bubble;
        let clickHistory = (ev) => {
            this.xUpdateHistoryBubble(ev.clientX);
        };
        let mouseDownBubble = (ev) => {
            widgetDiv.onmousemove = clickHistory;
        };
        let cancelHistory = (ev) => {
            widgetDiv.onmousemove = preventD;
        };
        bubble.onmousedown = mouseDownBubble;
        widgetDiv.onmouseup = cancelHistory;
        widgetDiv.onmousemove = preventD;
        bubble.onmouseup = cancelHistory;
        this.status.addSlider(this.historyWidget);
    }
    goHistorical() {
        if (!this.historyClient) {
            this.historyClient = this.client.cloneFromSegments();
            this.savedClient = this.client;
            this.client = this.historyClient;
            this.makeHistoryWidget();
        }
    }
    backToTheFuture() {
        if (this.historyClient) {
            this.client = this.savedClient;
            this.historyClient = undefined;
            this.status.removeSlider();
            this.topChar = 0;
            this.localQueueRender(0);
        }
    }
    historyBack() {
        this.goHistorical();
        if (this.client.undoSegments.length > 0) {
            let seq = this.client.undo();
            this.updateHistoryBubble(seq);
            this.cursor.pos = FlowView.docStartPosition;
            this.localQueueRender(FlowView.docStartPosition);
        }
    }
    historyForward() {
        this.goHistorical();
        if (this.client.redoSegments.length > 0) {
            let seq = this.client.redo();
            this.updateHistoryBubble(seq);
            this.cursor.pos = FlowView.docStartPosition;
            this.localQueueRender(FlowView.docStartPosition);
        }
    }
    addPresenceMap(presenceMap) {
        this.presenceMap = presenceMap;
        presenceMap.on("valueChanged", (delta) => {
            this.remotePresenceUpdate(delta);
        });
        presenceMap.getView().then((v) => {
            this.presenceMapView = v;
            this.updatePresence();
        });
    }
    presenceInfoInRange(start, end) {
        for (let i = 0, len = this.presenceVector.length; i < len; i++) {
            let presenceInfo = this.presenceVector[i];
            if (presenceInfo) {
                if ((start <= presenceInfo.xformPos) && (presenceInfo.xformPos <= end)) {
                    return presenceInfo;
                }
            }
        }
    }
    updatePresencePositions() {
        for (let i = 0, len = this.presenceVector.length; i < len; i++) {
            let remotePresenceInfo = this.presenceVector[i];
            if (remotePresenceInfo) {
                remotePresenceInfo.xformPos = getLocalRefPos(this, remotePresenceInfo.localRef);
            }
        }
    }
    updatePresenceVector(localPresenceInfo) {
        localPresenceInfo.xformPos = getLocalRefPos(this, localPresenceInfo.localRef);
        let presentPresence = this.presenceVector[localPresenceInfo.clientId];
        let tempXformPos = -1;
        if (presentPresence) {
            if (presentPresence.cursor) {
                localPresenceInfo.cursor = presentPresence.cursor;
                localPresenceInfo.cursor.presenceInfo = localPresenceInfo;
                localPresenceInfo.cursor.presenceInfoUpdated = true;
            }
            let baseSegment = presentPresence.localRef.segment;
            baseSegment.removeLocalRef(presentPresence.localRef);
            tempXformPos = presentPresence.xformPos;
        }
        this.presenceVector[localPresenceInfo.clientId] = localPresenceInfo;
        if (localPresenceInfo.xformPos !== tempXformPos) {
            this.presenceQueueRender(localPresenceInfo);
        }
    }
    remotePresenceFromEdit(longClientId, refseq, oldpos, posAdjust = 0) {
        let remotePosInfo = {
            clientId: this.client.getOrAddShortClientId(longClientId),
            key: longClientId,
            origPos: oldpos + posAdjust,
            refseq,
        };
        this.remotePresenceToLocal(remotePosInfo, posAdjust);
    }
    remotePresenceToLocal(remotePresenceInfo, posAdjust = 0) {
        let segoff = this.client.mergeTree.getContainingSegment(remotePresenceInfo.origPos, remotePresenceInfo.refseq, remotePresenceInfo.clientId);
        if (segoff.segment === undefined) {
            if (remotePresenceInfo.origPos === this.client.getLength()) {
                segoff = this.client.mergeTree.getContainingSegment(remotePresenceInfo.origPos, remotePresenceInfo.refseq, remotePresenceInfo.clientId);
                if (segoff.segment) {
                    segoff.offset++;
                }
            }
        }
        if (segoff.segment) {
            let localPresenceInfo = {
                clientId: remotePresenceInfo.clientId,
                fresh: true,
                key: remotePresenceInfo.key,
                localRef: {
                    offset: segoff.offset,
                    segment: segoff.segment,
                    slideOnRemove: true,
                },
            };
            this.updatePresenceVector(localPresenceInfo);
        }
    }
    remotePresenceUpdate(delta) {
        if (delta.key !== this.client.longClientId) {
            let remotePresenceInfo = this.presenceMapView.get(delta.key);
            remotePresenceInfo.key = delta.key;
            remotePresenceInfo.clientId = this.client.getOrAddShortClientId(delta.key);
            this.remotePresenceToLocal(remotePresenceInfo);
        }
    }
    updatePresence() {
        if (this.presenceMapView) {
            let presenceInfo = {
                origPos: this.cursor.pos,
                refseq: this.client.getCurrentSeq(),
            };
            this.presenceMapView.set(this.client.longClientId, presenceInfo);
        }
    }
    statusMessage(key, msg) {
        this.status.add(key, msg);
    }
    firstLineDiv() {
        return this.lineDivSelect((elm) => (elm), this.viewportDiv, false);
    }
    lastLineDiv() {
        return this.lineDivSelect((elm) => (elm), this.viewportDiv, false, true);
    }
    /**
     * Returns the (x, y) coordinate of the given position relative to the FlowView's coordinate system or null
     * if the position is not visible.
     */
    getPositionLocation(position) {
        const lineDiv = findLineDiv(position, this, true);
        if (!lineDiv) {
            return null;
        }
        // Estimate placement location
        const text = this.client.getText(lineDiv.linePos, position);
        const textWidth = getTextWidth(text, lineDiv.style.font);
        const lineDivRect = lineDiv.getBoundingClientRect();
        const location = { x: lineDivRect.left + textWidth, y: lineDivRect.bottom };
        return location;
    }
    /**
     * Retrieves the nearest sequence position relative to the given viewport location
     */
    getNearestPosition(location) {
        const lineDivs = [];
        this.lineDivSelect((lineDiv) => {
            lineDivs.push(lineDiv);
            return null;
        }, this.viewportDiv, false);
        // Search for the nearest line divs to the element
        const closestUp = closestNorth(lineDivs, location.y);
        const closestDown = closestSouth(lineDivs, location.y);
        // And then the nearest location within them
        let distance = Number.MAX_VALUE;
        let position;
        if (closestUp !== -1) {
            const upPosition = this.getPosFromPixels(lineDivs[closestUp], location.x);
            const upLocation = this.getPositionLocation(upPosition);
            distance = ui.distanceSquared(location, upLocation);
            position = upPosition;
        }
        if (closestDown !== -1) {
            const downPosition = this.getPosFromPixels(lineDivs[closestDown], location.x);
            const downLocation = this.getPositionLocation(downPosition);
            const downDistance = ui.distanceSquared(location, downLocation);
            if (downDistance < distance) {
                distance = downDistance;
                position = downPosition;
            }
        }
        return position;
    }
    checkRow(lineDiv, fn, rev) {
        let rowDiv = lineDiv;
        let oldRowDiv;
        while (rowDiv && (rowDiv !== oldRowDiv) && rowDiv.rowView) {
            oldRowDiv = rowDiv;
            lineDiv = undefined;
            for (let box of rowDiv.rowView.boxes) {
                let innerDiv = this.lineDivSelect(fn, box.viewport.div, true, rev);
                if (innerDiv) {
                    lineDiv = innerDiv;
                    rowDiv = innerDiv;
                    break;
                }
            }
        }
        return lineDiv;
    }
    lineDivSelect(fn, viewportDiv, dive = false, rev) {
        if (rev) {
            let elm = viewportDiv.lastElementChild;
            while (elm) {
                if (elm.linePos !== undefined) {
                    let lineDiv = fn(elm);
                    if (lineDiv) {
                        if (dive) {
                            lineDiv = this.checkRow(lineDiv, fn, rev);
                        }
                        return lineDiv;
                    }
                }
                elm = elm.previousElementSibling;
            }
        }
        else {
            let elm = viewportDiv.firstElementChild;
            while (elm) {
                if (elm.linePos !== undefined) {
                    let lineDiv = fn(elm);
                    if (lineDiv) {
                        if (dive) {
                            lineDiv = this.checkRow(lineDiv, fn, rev);
                        }
                        return lineDiv;
                    }
                }
                elm = elm.nextElementSibling;
            }
        }
    }
    clickSpan(x, y, elm) {
        let span = elm;
        let elmOff = pointerToElementOffsetWebkit(x, y);
        if (elmOff) {
            let computed = elmOffToSegOff(elmOff, span);
            if (span.offset) {
                computed += span.offset;
            }
            this.cursor.pos = span.segPos + computed;
            let tilePos = findTile(this, this.cursor.pos, "pg", false);
            if (tilePos) {
                this.curPG = tilePos.tile;
            }
            this.updatePresence();
            this.cursor.updateView(this);
            return true;
        }
    }
    getPosFromPixels(targetLineDiv, x) {
        let position = undefined;
        if (targetLineDiv && (targetLineDiv.linePos !== undefined)) {
            let y;
            let targetLineBounds = targetLineDiv.getBoundingClientRect();
            y = targetLineBounds.top + Math.floor(targetLineBounds.height / 2);
            let elm = document.elementFromPoint(x, y);
            if (elm.tagName === "DIV") {
                if ((targetLineDiv.lineEnd - targetLineDiv.linePos) === 1) {
                    // empty line
                    position = targetLineDiv.linePos;
                }
                else if (targetLineDiv === elm) {
                    if (targetLineDiv.indentWidth !== undefined) {
                        let relX = x - targetLineBounds.left;
                        if (relX <= targetLineDiv.indentWidth) {
                            position = targetLineDiv.linePos;
                        }
                        else {
                            position = targetLineDiv.lineEnd;
                        }
                    }
                    else {
                        position = targetLineDiv.lineEnd;
                    }
                }
                else {
                    // content div
                    if (x <= targetLineBounds.left) {
                        position = targetLineDiv.linePos;
                    }
                    else {
                        position = targetLineDiv.lineEnd;
                    }
                }
            }
            else if (elm.tagName === "SPAN") {
                let span = elm;
                let elmOff = pointerToElementOffsetWebkit(x, y);
                if (elmOff) {
                    let computed = elmOffToSegOff(elmOff, span);
                    if (span.offset) {
                        computed += span.offset;
                    }
                    position = span.segPos + computed;
                }
            }
        }
        return position;
    }
    // TODO: handle symbol div
    setCursorPosFromPixels(targetLineDiv, x) {
        const position = this.getPosFromPixels(targetLineDiv, x);
        if (position) {
            this.cursor.pos = position;
            return true;
        }
        else {
            return false;
        }
    }
    getCanonicalX() {
        let cursorRect = this.cursor.rect();
        let x;
        if (this.lastVerticalX >= 0) {
            x = this.lastVerticalX;
        }
        else {
            x = Math.floor(cursorRect.left);
            this.lastVerticalX = x;
        }
        return x;
    }
    cursorRev() {
        if (this.cursor.pos > FlowView.docStartPosition) {
            this.cursor.pos--;
            let segoff = getContainingSegment(this, this.cursor.pos);
            if (segoff.segment.getType() !== client_api_1.MergeTree.SegmentType.Text) {
                // REVIEW: assume marker for now (could be external later)
                let marker = segoff.segment;
                if ((marker.behaviors & client_api_1.MergeTree.MarkerBehaviors.Tile) &&
                    (marker.hasTileLabel("pg"))) {
                    if (marker.hasRangeLabel("table") && (marker.behaviors & client_api_1.MergeTree.MarkerBehaviors.RangeEnd)) {
                        this.cursorRev();
                    }
                }
                else {
                    this.cursorRev();
                }
            }
        }
    }
    cursorFwd() {
        if (this.cursor.pos < (this.client.getLength() - 1)) {
            this.cursor.pos++;
            let segoff = this.client.mergeTree.getContainingSegment(this.cursor.pos, client_api_1.MergeTree.UniversalSequenceNumber, this.client.getClientId());
            if (segoff.segment.getType() !== client_api_1.MergeTree.SegmentType.Text) {
                // REVIEW: assume marker for now
                let marker = segoff.segment;
                if ((marker.behaviors & client_api_1.MergeTree.MarkerBehaviors.Tile) &&
                    (marker.hasTileLabel("pg"))) {
                    if (marker.hasRangeLabel("table") && (marker.behaviors & client_api_1.MergeTree.MarkerBehaviors.RangeEnd)) {
                        this.cursorFwd();
                    }
                    else {
                        return;
                    }
                }
                else if (marker.behaviors & client_api_1.MergeTree.MarkerBehaviors.RangeBegin) {
                    if (marker.hasRangeLabel("table")) {
                        this.cursor.pos += 3;
                    }
                    else if (marker.hasRangeLabel("row")) {
                        this.cursor.pos += 2;
                    }
                    else if (marker.hasRangeLabel("box")) {
                        this.cursor.pos += 1;
                    }
                    else {
                        this.cursorFwd();
                    }
                }
                else if (marker.behaviors & client_api_1.MergeTree.MarkerBehaviors.RangeEnd) {
                    if (marker.hasRangeLabel("row")) {
                        this.cursorFwd();
                    }
                    else if (marker.hasRangeLabel("table")) {
                        this.cursor.pos += 2;
                    }
                    else {
                        this.cursorFwd();
                    }
                }
                else {
                    this.cursorFwd();
                }
            }
        }
    }
    verticalMove(lineCount) {
        let up = lineCount < 0;
        let lineDiv = this.cursor.lineDiv();
        let targetLineDiv;
        if (lineCount < 0) {
            targetLineDiv = lineDiv.previousElementSibling;
        }
        else {
            targetLineDiv = lineDiv.nextElementSibling;
        }
        let x = this.getCanonicalX();
        // if line div is row, then find line in box closest to x
        function checkInTable() {
            let rowDiv = targetLineDiv;
            while (rowDiv && rowDiv.rowView) {
                if (rowDiv.rowView) {
                    let box = rowDiv.rowView.findClosestBox(x);
                    if (box) {
                        if (up) {
                            targetLineDiv = box.viewport.lastLineDiv();
                        }
                        else {
                            targetLineDiv = box.viewport.firstLineDiv();
                        }
                        rowDiv = targetLineDiv;
                    }
                    else {
                        break;
                    }
                }
            }
        }
        if (targetLineDiv) {
            checkInTable();
            return this.setCursorPosFromPixels(targetLineDiv, x);
        }
        else {
            // TODO: handle nested tables
            // go out to row containing this line (line may be at top or bottom of box)
            let rowDiv = findRowParent(lineDiv);
            if (rowDiv && rowDiv.rowView) {
                let rowView = rowDiv.rowView;
                let tableView = rowView.table;
                let targetRow;
                if (up) {
                    targetRow = tableView.findPrecedingRow(rowView);
                }
                else {
                    targetRow = tableView.findNextRow(rowView);
                }
                if (targetRow) {
                    let box = targetRow.findClosestBox(x);
                    if (box) {
                        if (up) {
                            targetLineDiv = box.viewport.lastLineDiv();
                        }
                        else {
                            targetLineDiv = box.viewport.firstLineDiv();
                        }
                    }
                    return this.setCursorPosFromPixels(targetLineDiv, x);
                }
                else {
                    // top or bottom row of table
                    if (up) {
                        targetLineDiv = rowDiv.previousElementSibling;
                    }
                    else {
                        targetLineDiv = rowDiv.nextElementSibling;
                    }
                    if (targetLineDiv) {
                        checkInTable();
                        return this.setCursorPosFromPixels(targetLineDiv, x);
                    }
                }
            }
        }
    }
    viewportCharCount() {
        return this.viewportEndPos - this.viewportStartPos;
    }
    setEdit(docRoot) {
        this.docRoot = docRoot;
        window.oncontextmenu = preventD;
        this.element.onmousemove = preventD;
        this.element.onmouseup = preventD;
        this.element.onselectstart = preventD;
        this.element.onmousedown = (e) => {
            if (e.button === 0) {
                let span = e.target;
                let segspan;
                if (span.seg) {
                    segspan = span;
                }
                else {
                    segspan = span.parentElement;
                }
                if (segspan && segspan.seg) {
                    this.clickSpan(e.clientX, e.clientY, segspan);
                }
                e.preventDefault();
                e.returnValue = false;
                return false;
            }
            else if (e.button === 2) {
                e.preventDefault();
                e.returnValue = false;
                return false;
            }
        };
        this.element.onmousewheel = (e) => {
            if (!this.wheelTicking) {
                let factor = 20;
                let inputDelta = e.wheelDelta;
                if (Math.abs(e.wheelDelta) === 120) {
                    inputDelta = e.wheelDelta / 6;
                }
                else {
                    inputDelta = e.wheelDelta / 2;
                }
                let delta = factor * inputDelta;
                // tslint:disable-next-line:max-line-length
                // console.log(`top char: ${this.topChar - delta} factor ${factor}; delta: ${delta} wheel: ${e.wheelDeltaY} ${e.wheelDelta} ${e.detail}`);
                setTimeout(() => {
                    this.render(Math.floor(this.topChar - delta));
                    this.apresScroll(delta < 0);
                    this.wheelTicking = false;
                }, 20);
                this.wheelTicking = true;
            }
            e.preventDefault();
            e.returnValue = false;
        };
        let keydownHandler = (e) => {
            let saveLastVertX = this.lastVerticalX;
            let specialKey = true;
            this.lastVerticalX = -1;
            if (e.ctrlKey && (e.keyCode !== 17)) {
                this.keyCmd(e.keyCode);
            }
            else if (e.keyCode === KeyCode.TAB) {
                this.handleTAB(e.shiftKey);
            }
            else if (e.keyCode === KeyCode.backspace) {
                this.cursor.pos--;
                this.sharedString.removeText(this.cursor.pos, this.cursor.pos + 1);
                this.localQueueRender(this.cursor.pos);
            }
            else if (((e.keyCode === KeyCode.pageUp) || (e.keyCode === KeyCode.pageDown)) && (!this.ticking)) {
                setTimeout(() => {
                    this.scroll(e.keyCode === KeyCode.pageUp);
                    this.ticking = false;
                }, 20);
                this.ticking = true;
            }
            else if (e.keyCode === KeyCode.home) {
                this.cursor.pos = FlowView.docStartPosition;
                this.render(FlowView.docStartPosition);
            }
            else if (e.keyCode === KeyCode.end) {
                let halfport = Math.floor(this.viewportCharCount() / 2);
                let topChar = this.client.getLength() - halfport;
                this.cursor.pos = topChar;
                this.updatePresence();
                this.render(topChar);
            }
            else if (e.keyCode === KeyCode.rightArrow) {
                if (this.cursor.pos < (this.client.getLength() - 1)) {
                    if (this.cursor.pos === this.viewportEndPos) {
                        this.scroll(false, true);
                    }
                    this.cursorFwd();
                    this.updatePresence();
                    this.cursor.updateView(this);
                }
            }
            else if (e.keyCode === KeyCode.leftArrow) {
                if (this.cursor.pos > FlowView.docStartPosition) {
                    if (this.cursor.pos === this.viewportStartPos) {
                        this.scroll(true, true);
                    }
                    this.cursorRev();
                    this.updatePresence();
                    this.cursor.updateView(this);
                }
            }
            else if ((e.keyCode === KeyCode.upArrow) || (e.keyCode === KeyCode.downArrow)) {
                this.lastVerticalX = saveLastVertX;
                let lineCount = 1;
                if (e.keyCode === KeyCode.upArrow) {
                    lineCount = -1;
                }
                let vpEnd = this.viewportEndPos;
                let maxPos = this.client.getLength() - 1;
                if (vpEnd < maxPos) {
                    if (!this.verticalMove(lineCount)) {
                        this.scroll(lineCount < 0, true);
                        if (lineCount > 0) {
                            while (vpEnd === this.viewportEndPos) {
                                if (this.cursor.pos > maxPos) {
                                    this.cursor.pos = maxPos;
                                    break;
                                }
                                this.scroll(lineCount < 0, true);
                            }
                        }
                        this.verticalMove(lineCount);
                    }
                    if (this.cursor.pos > maxPos) {
                        this.cursor.pos = maxPos;
                    }
                    this.updatePresence();
                    this.cursor.updateView(this);
                }
            }
            else {
                if (!e.ctrlKey) {
                    specialKey = false;
                }
            }
            if (specialKey) {
                e.preventDefault();
                e.returnValue = false;
            }
        };
        let keypressHandler = (e) => {
            let pos = this.cursor.pos;
            this.cursor.pos++;
            let code = e.charCode;
            if (code === CharacterCodes.cr) {
                // TODO: other labels; for now assume only list/pg tile labels
                let curTilePos = findTile(this, pos, "pg", false);
                let pgMarker = curTilePos.tile;
                let pgPos = curTilePos.pos;
                clearContentCaches(pgMarker);
                let curProps = pgMarker.properties;
                let newProps = client_api_1.MergeTree.createMap();
                let newLabels = ["pg"];
                if (isListTile(pgMarker)) {
                    newLabels.push("list");
                    newProps.indentLevel = curProps.indentLevel;
                    newProps.listKind = curProps.listKind;
                }
                newProps[client_api_1.MergeTree.reservedTileLabelsKey] = newLabels;
                // TODO: place in group op
                // old marker gets new props
                this.sharedString.annotateRange(newProps, pgPos, pgPos + 1, { name: "rewrite" });
                // new marker gets existing props
                this.sharedString.insertMarker(pos, client_api_1.MergeTree.MarkerBehaviors.Tile, curProps);
            }
            else {
                this.sharedString.insertText(String.fromCharCode(code), pos);
                this.updatePGInfo(pos);
            }
            this.localQueueRender(this.cursor.pos);
        };
        // Register for keyboard messages
        this.on("keydown", keydownHandler);
        this.on("keypress", keypressHandler);
    }
    viewTileProps() {
        let searchPos = this.cursor.pos;
        if (this.cursor.pos === this.cursor.lineDiv().lineEnd) {
            searchPos--;
        }
        let tileInfo = findTile(this, searchPos, "pg");
        if (tileInfo) {
            let buf = "";
            if (tileInfo.tile.properties) {
                // tslint:disable:forin
                for (let key in tileInfo.tile.properties) {
                    buf += ` { ${key}: ${tileInfo.tile.properties[key]} }`;
                }
            }
            let lc = !!tileInfo.tile.listCache;
            console.log(`tile at pos ${tileInfo.pos} with props${buf} and list cache: ${lc}`);
        }
    }
    setList(listKind = 0) {
        let searchPos = this.cursor.pos;
        let tileInfo = findTile(this, searchPos, "pg", false);
        if (tileInfo) {
            let tile = tileInfo.tile;
            let listStatus = false;
            if (tile.hasTileLabel("list")) {
                listStatus = true;
            }
            let curLabels = tile.properties[client_api_1.MergeTree.reservedTileLabelsKey];
            if (listStatus) {
                let remainingLabels = curLabels.filter((l) => l !== "list");
                this.sharedString.annotateRange({
                    [client_api_1.MergeTree.reservedTileLabelsKey]: remainingLabels,
                    series: null,
                }, tileInfo.pos, tileInfo.pos + 1);
            }
            else {
                let augLabels = curLabels.slice();
                augLabels.push("list");
                let indentLevel = 1;
                if (tile.properties && tile.properties.indentLevel) {
                    indentLevel = tile.properties.indentLevel;
                }
                this.sharedString.annotateRange({
                    [client_api_1.MergeTree.reservedTileLabelsKey]: augLabels,
                    indentLevel,
                    listKind,
                }, tileInfo.pos, tileInfo.pos + 1);
            }
            tile.listCache = undefined;
            this.localQueueRender(this.cursor.pos);
        }
    }
    // TODO: tab stops in non-list, non-table paragraphs
    handleTAB(shift = false) {
        let searchPos = this.cursor.pos;
        let tileInfo = findTile(this, searchPos, "pg", false);
        if (tileInfo) {
            let cursorContext = this.client.mergeTree.getStackContext(tileInfo.pos, this.client.getClientId(), ["table", "box", "row"]);
            if (cursorContext.table && (!cursorContext.table.empty())) {
                let tableMarker = cursorContext.table.top();
                let tableView = tableMarker.view;
                if (cursorContext.box && (!cursorContext.box.empty())) {
                    let box = cursorContext.box.top();
                    let toBox;
                    if (shift) {
                        toBox = tableView.prevBox(box.view);
                    }
                    else {
                        toBox = tableView.nextBox(box.view);
                    }
                    if (toBox) {
                        let offset = this.client.mergeTree.getOffset(toBox.marker, client_api_1.MergeTree.UniversalSequenceNumber, this.client.getClientId());
                        this.cursor.pos = offset + 1;
                    }
                    else {
                        if (shift) {
                            let offset = this.client.mergeTree.getOffset(tableView.tableMarker, client_api_1.MergeTree.UniversalSequenceNumber, this.client.getClientId());
                            this.cursor.pos = offset - 1;
                        }
                        else {
                            let endOffset = this.client.mergeTree.getOffset(tableView.endTableMarker, client_api_1.MergeTree.UniversalSequenceNumber, this.client.getClientId());
                            this.cursor.pos = endOffset + 1;
                        }
                    }
                    this.updatePresence();
                    this.cursor.updateView(this);
                }
            }
            else {
                let tile = tileInfo.tile;
                this.increaseIndent(tile, tileInfo.pos, shift);
            }
        }
    }
    toggleBlockquote() {
        let tileInfo = findTile(this, this.cursor.pos, "pg", false);
        if (tileInfo) {
            let tile = tileInfo.tile;
            let props = tile.properties;
            if (props && props.blockquote) {
                this.sharedString.annotateRange({ blockquote: false }, tileInfo.pos, tileInfo.pos + 1);
            }
            else {
                this.sharedString.annotateRange({ blockquote: true }, tileInfo.pos, tileInfo.pos + 1);
            }
            this.localQueueRender(this.cursor.pos);
        }
    }
    keyCmd(charCode) {
        switch (charCode) {
            case CharacterCodes.U:
                this.historyBack();
                break;
            case CharacterCodes.J:
                this.historyForward();
                break;
            case CharacterCodes.Q:
                this.backToTheFuture();
                break;
            case CharacterCodes.R:
                this.updatePGInfo(this.cursor.pos - 1);
                createTable(this.cursor.pos, this);
                this.localQueueRender(this.cursor.pos);
                break;
            case CharacterCodes.K:
                this.toggleBlockquote();
                break;
            case CharacterCodes.L:
                this.setList();
                break;
            case CharacterCodes.B:
                this.setList(1);
                break;
            case CharacterCodes.G:
                this.viewTileProps();
                break;
            case CharacterCodes.S:
                this.collabDocument.save();
                break;
            default:
                console.log(`got command key ${String.fromCharCode(charCode)}`);
                break;
        }
    }
    testWordInfo() {
        let text = this.sharedString.client.getText();
        let nonWhitespace = text.split(/\s+/g);
        console.log(`non ws count: ${nonWhitespace.length}`);
        let obj = new Object();
        for (let nws of nonWhitespace) {
            if (!obj[nws]) {
                obj[nws] = 1;
            }
            else {
                obj[nws]++;
            }
        }
        let count = 0;
        let uniques = [];
        for (let key in obj) {
            if (obj.hasOwnProperty(key)) {
                count++;
                uniques.push(key);
            }
        }
        console.log(`${count} unique`);
        let clock = Date.now();
        getMultiTextWidth(uniques, "18px Times");
        console.log(`unique pp cost: ${Date.now() - clock}ms`);
    }
    preScroll() {
        if (this.lastVerticalX === -1) {
            let rect = this.cursor.rect();
            this.lastVerticalX = rect.left;
        }
    }
    apresScroll(up) {
        if ((this.cursor.pos < this.viewportStartPos) ||
            (this.cursor.pos >= this.viewportEndPos)) {
            let x = this.getCanonicalX();
            if (up) {
                this.setCursorPosFromPixels(this.firstLineDiv(), x);
            }
            else {
                this.setCursorPosFromPixels(this.lastLineDiv(), x);
            }
            this.updatePresence();
            this.cursor.updateView(this);
        }
    }
    scroll(up, one = false) {
        let scrollTo = this.topChar;
        if (one) {
            if (up) {
                let firstLineDiv = this.firstLineDiv();
                scrollTo = firstLineDiv.linePos - 2;
                if (scrollTo < 0) {
                    return;
                }
            }
            else {
                let nextFirstLineDiv = this.firstLineDiv().nextElementSibling;
                if (nextFirstLineDiv) {
                    scrollTo = nextFirstLineDiv.linePos;
                }
                else {
                    return;
                }
            }
        }
        else {
            let len = this.client.getLength();
            let halfport = Math.floor(this.viewportCharCount() / 2);
            if ((up && (this.topChar === 0)) || ((!up) && (this.topChar > (len - halfport)))) {
                return;
            }
            if (up) {
                scrollTo -= halfport;
            }
            else {
                scrollTo += halfport;
            }
            if (scrollTo >= len) {
                scrollTo = len - 1;
            }
        }
        this.preScroll();
        this.render(scrollTo);
        this.apresScroll(up);
    }
    render(topChar, changed = false) {
        let len = this.client.getLength();
        if (len === 0) {
            return;
        }
        if (topChar !== undefined) {
            if (((this.topChar === topChar) || ((this.topChar === -1) && (topChar < 0)))
                && (!changed)) {
                return;
            }
            this.topChar = topChar;
            if (this.topChar < 0) {
                this.topChar = 0;
            }
            if (this.topChar >= len) {
                this.topChar = len - (this.viewportCharCount() / 2);
            }
        }
        let clk = Date.now();
        // TODO: consider using markers for presence info once splice segments during pg render
        this.updatePresencePositions();
        clearSubtree(this.viewportDiv);
        // this.viewportDiv.appendChild(this.cursor.editSpan);
        let renderOutput = renderTree(this.viewportDiv, this.topChar, this);
        this.viewportStartPos = renderOutput.viewportStartPos;
        this.viewportEndPos = renderOutput.viewportEndPos;
        if (this.diagCharPort || true) {
            this.statusMessage("render", `&nbsp ${Date.now() - clk}ms`);
        }
        if (this.diagCharPort) {
            this.statusMessage("diagCharPort", `&nbsp sp: (${this.topChar}) ep: ${this.viewportEndPos} cp: ${this.cursor.pos}`);
        }
        this.emit("render", {
            overlayMarkers: renderOutput.overlayMarkers,
            range: { min: 1, max: this.client.getLength(), value: this.viewportStartPos },
            viewportEndPos: this.viewportEndPos,
            viewportStartPos: this.viewportStartPos,
        });
    }
    loadFinished(clockStart = 0) {
        this.render(0, true);
        if (clockStart > 0) {
            // tslint:disable-next-line:max-line-length
            console.log(`time to edit/impression: ${this.timeToEdit} time to load: ${Date.now() - clockStart}ms len: ${this.sharedString.client.getLength()} - ${performanceNow()}`);
        }
        const presenceMap = this.docRoot.get("presence");
        this.addPresenceMap(presenceMap);
        // this.testWordInfo();
    }
    randomWordMove() {
        let client = this.sharedString.client;
        let word1 = merge_tree_utils_1.findRandomWord(client.mergeTree, client.getClientId());
        if (word1) {
            let removeStart = word1.pos;
            let removeEnd = removeStart + word1.text.length;
            this.sharedString.removeText(removeStart, removeEnd);
            let word2 = merge_tree_utils_1.findRandomWord(client.mergeTree, client.getClientId());
            while (!word2) {
                word2 = merge_tree_utils_1.findRandomWord(client.mergeTree, client.getClientId());
            }
            let pos = word2.pos + word2.text.length;
            this.sharedString.insertText(word1.text, pos);
        }
    }
    randomWordMoveStart() {
        this.randWordTimer = setInterval(() => {
            for (let i = 0; i < 3; i++) {
                this.randomWordMove();
            }
        }, 10);
    }
    randomWordMoveEnd() {
        clearInterval(this.randWordTimer);
    }
    updatePGInfo(changePos) {
        let tileInfo = findTile(this, changePos, "pg", false);
        if (tileInfo) {
            let tile = tileInfo.tile;
            clearContentCaches(tile);
        }
        else {
            console.log("did not find pg to clear");
        }
    }
    localQueueRender(updatePos) {
        this.updatePGInfo(updatePos);
        this.pendingRender = true;
        window.requestAnimationFrame(() => {
            this.pendingRender = false;
            this.render(this.topChar, true);
        });
    }
    setViewOption(options) {
        viewOptions = options;
    }
    resizeCore(bounds) {
        this.viewportRect = bounds.inner(0.92);
        ui.Rectangle.conformElementToRect(this.viewportDiv, this.viewportRect);
        if (this.client.getLength() > 0) {
            this.render(this.topChar, true);
        }
    }
    increaseIndent(tile, pos, decrease = false) {
        tile.listCache = undefined;
        if (decrease && tile.properties.indentLevel > 0) {
            this.sharedString.annotateRange({ indentLevel: -1 }, pos, pos + 1, { name: "incr", defaultValue: 1, minValue: 0 });
        }
        else if (!decrease) {
            this.sharedString.annotateRange({ indentLevel: 1 }, pos, pos + 1, { name: "incr", defaultValue: 0 });
        }
        this.localQueueRender(this.cursor.pos);
    }
    // TODO: paragraph spanning changes and annotations
    // TODO: generalize this by using transform fwd
    applyOp(delta, msg) {
        // tslint:disable:switch-default
        switch (delta.type) {
            case 0 /* INSERT */:
                let adjLength = 1;
                if (delta.marker) {
                    this.updatePGInfo(delta.pos1 - 1);
                }
                else if (delta.pos1 <= this.cursor.pos) {
                    adjLength = delta.text.length;
                    this.cursor.pos += delta.text.length;
                }
                this.remotePresenceFromEdit(msg.clientId, msg.referenceSequenceNumber, delta.pos1, adjLength);
                this.updatePGInfo(delta.pos1);
                return true;
            case 1 /* REMOVE */:
                if (delta.pos2 <= this.cursor.pos) {
                    this.cursor.pos -= (delta.pos2 - delta.pos1);
                }
                else if (this.cursor.pos >= delta.pos1) {
                    this.cursor.pos = delta.pos1;
                }
                this.remotePresenceFromEdit(msg.clientId, msg.referenceSequenceNumber, delta.pos1);
                this.updatePGInfo(delta.pos1);
                return true;
            case 3 /* GROUP */: {
                let opAffectsViewport = false;
                for (let groupOp of delta.ops) {
                    opAffectsViewport = opAffectsViewport || this.applyOp(groupOp, msg);
                }
                return opAffectsViewport;
            }
            case 2 /* ANNOTATE */: {
                return this.posInViewport(delta.pos1) || this.posInViewport(delta.pos2 - 1);
            }
        }
    }
    posInViewport(pos) {
        return ((this.viewportEndPos > pos) && (pos >= this.viewportStartPos));
    }
    presenceQueueRender(remotePosInfo) {
        if ((!this.pendingRender) && (this.posInViewport(remotePosInfo.xformPos))) {
            this.pendingRender = true;
            window.requestAnimationFrame(() => {
                this.pendingRender = false;
                this.render(this.topChar, true);
            });
        }
    }
    queueRender(msg) {
        if ((!this.pendingRender) && msg && msg.contents) {
            this.pendingRender = true;
            window.requestAnimationFrame(() => {
                this.pendingRender = false;
                this.render(this.topChar, true);
            });
        }
    }
}
FlowView.docStartPosition = 0;
exports.FlowView = FlowView;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"../merge-tree-utils":32,"../ui":41,"performance-now":2}],16:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ui = require("../ui");
class Image extends ui.Component {
    constructor(element, src) {
        super(element);
        this.message = document.createElement("span");
        this.message.style.height = "auto";
        this.message.style.height = "auto";
        this.message.style.padding = "5px";
        this.message.style.borderRadius = "8px";
        this.message.style.backgroundColor = "rgba(0, 240, 20, 0.5)";
        element.appendChild(this.message);
        this.image = document.createElement("img");
        this.image.src = src;
        this.image.alt = "Your Buddy!";
        element.appendChild(this.image);
    }
    setMessage(message) {
        this.message.innerText = message;
    }
    resizeCore(bounds) {
        bounds.x = 0;
        bounds.y = 0;
        const overlayInnerRects = bounds.nipHoriz(Math.floor(bounds.width * 0.6));
        overlayInnerRects[0].conformElement(this.message);
        overlayInnerRects[1].conformElement(this.image);
    }
}
exports.Image = Image;

},{"../ui":41}],17:[function(require,module,exports){
"use strict";
function __export(m) {
    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
}
Object.defineProperty(exports, "__esModule", { value: true });
__export(require("./dockPanel"));
__export(require("./flowContainer"));
__export(require("./flexView"));
__export(require("./flowView"));
__export(require("./image"));
__export(require("./flexVideo"));
__export(require("./flexVideoCanvas"));
__export(require("./youtubeVideo"));
__export(require("./youtubeVideoCanvas"));
__export(require("./layerPanel"));
__export(require("./popup"));
__export(require("./status"));
__export(require("./overlayCanvas"));
__export(require("./shapeRecognizer"));
__export(require("./title"));

},{"./dockPanel":10,"./flexVideo":11,"./flexVideoCanvas":12,"./flexView":13,"./flowContainer":14,"./flowView":15,"./image":16,"./layerPanel":19,"./overlayCanvas":20,"./popup":21,"./shapeRecognizer":23,"./status":28,"./title":29,"./youtubeVideo":30,"./youtubeVideoCanvas":31}],18:[function(require,module,exports){
(function (global){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_api_1 = (typeof window !== "undefined" ? window['prague'] : typeof global !== "undefined" ? global['prague'] : null);
const ui = require("../ui");
const overlayCanvas_1 = require("./overlayCanvas");
const index_1 = require("./shapes/index");
class EventPoint {
    constructor(relative, evt) {
        let offset = $(relative).offset();
        this.rawPosition = {
            x: evt.pageX - offset.left,
            y: evt.pageY - offset.top,
        };
        this.properties = { isEraser: false };
    }
}
class InkCanvas extends ui.Component {
    // constructor
    constructor(element, model) {
        super(element);
        this.model = model;
        this.penID = -1;
        this.lastLayerRenderOp = {};
        this.model.on("op", (op) => {
            // Update the canvas
            this.addAndDrawStroke(op.contents, false);
        });
        this.model.on("load", () => {
            this.redraw();
        });
        // setup canvas
        this.canvasWrapper = document.createElement("div");
        this.canvasWrapper.classList.add("drawSurface");
        this.canvas = document.createElement("canvas");
        this.canvasWrapper.appendChild(this.canvas);
        element.appendChild(this.canvasWrapper);
        // get context
        this.context = this.canvas.getContext("2d");
        let bb = false;
        this.canvas.addEventListener("pointerdown", (evt) => this.handlePointerDown(evt), bb);
        this.canvas.addEventListener("pointermove", (evt) => this.handlePointerMove(evt), bb);
        this.canvas.addEventListener("pointerup", (evt) => this.handlePointerUp(evt), bb);
        this.currentPen = {
            color: { r: 0, g: 161 / 255, b: 241 / 255, a: 0 },
            thickness: 7,
        };
    }
    /**
     * Used to just enable/disable the ink events. Should only be used when needing to temporarily
     * disable ink (for DOM hit testing events, for example). The enableInk event is probably what you really want.
     */
    enableInkHitTest(enable) {
        this.element.style.pointerEvents = enable ? "auto" : "none";
    }
    setPenColor(color) {
        this.currentPen.color = color;
    }
    replay() {
        this.clearCanvas();
        const layers = this.model.getLayers();
        // Time of the first operation in layer 0 is our starting time
        let startTime = layers[0].operations[0].time;
        for (let layer of layers) {
            this.animateLayer(layer, 0, startTime);
        }
    }
    /**
     * Resizes the canvas
     */
    resizeCore(bounds) {
        // Updates the size of the canvas
        this.canvas.width = bounds.width;
        this.canvas.height = bounds.height;
        // And then redraw the canvas
        this.redraw();
    }
    // We will accept pen down or mouse left down as the start of a stroke.
    // We will accept touch down or mouse right down as the start of a touch.
    handlePointerDown(evt) {
        this.penID = evt.pointerId;
        if ((evt.pointerType === "pen") || ((evt.pointerType === "mouse") && (evt.button === 0))) {
            // Anchor and clear any current selection.
            let pt = new EventPoint(this.canvas, evt);
            let delta = new client_api_1.types.Delta().stylusDown(pt.rawPosition, evt.pressure, this.currentPen);
            this.currentStylusActionId = delta.operations[0].stylusDown.id;
            this.addAndDrawStroke(delta, true);
            evt.returnValue = false;
        }
    }
    handlePointerMove(evt) {
        if (evt.pointerId === this.penID) {
            let pt = new EventPoint(this.canvas, evt);
            let delta = new client_api_1.types.Delta().stylusMove(pt.rawPosition, evt.pressure, this.currentStylusActionId);
            this.addAndDrawStroke(delta, true);
            evt.returnValue = false;
        }
        return false;
    }
    handlePointerUp(evt) {
        if (evt.pointerId === this.penID) {
            this.penID = -1;
            let pt = new EventPoint(this.canvas, evt);
            evt.returnValue = false;
            let delta = new client_api_1.types.Delta().stylusUp(pt.rawPosition, evt.pressure, this.currentStylusActionId);
            this.currentStylusActionId = undefined;
            this.addAndDrawStroke(delta, true);
        }
        return false;
    }
    animateLayer(layer, operationIndex, startTime) {
        if (operationIndex >= layer.operations.length) {
            return;
        }
        // Draw the requested stroke
        let currentOperation = layer.operations[operationIndex];
        let previousOperation = layer.operations[Math.max(0, operationIndex - 1)];
        let time = operationIndex === 0
            ? currentOperation.time - startTime
            : currentOperation.time - previousOperation.time;
        setTimeout(() => {
            this.drawStroke(layer, currentOperation, previousOperation);
            this.animateLayer(layer, operationIndex + 1, startTime);
        }, time);
    }
    /**
     * Clears the canvas
     */
    clearCanvas() {
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
    redraw() {
        this.clearCanvas();
        const layers = this.model.getLayers();
        for (let layer of layers) {
            let previous = layer.operations[0];
            for (let operation of layer.operations) {
                this.drawStroke(layer, operation, previous);
                previous = operation;
            }
        }
    }
    drawStroke(layer, current, previous) {
        let type = client_api_1.types.getActionType(current);
        let shapes;
        let currentAction = client_api_1.types.getStylusAction(current);
        let previousAction = client_api_1.types.getStylusAction(previous);
        let pen = layer.operations[0].stylusDown.pen;
        switch (type) {
            case client_api_1.types.ActionType.StylusDown:
                shapes = this.getShapes(currentAction, currentAction, pen, overlayCanvas_1.SegmentCircleInclusive.End);
                break;
            case client_api_1.types.ActionType.StylusMove:
                shapes = this.getShapes(previousAction, currentAction, pen, overlayCanvas_1.SegmentCircleInclusive.End);
                break;
            case client_api_1.types.ActionType.StylusUp:
                shapes = this.getShapes(previousAction, currentAction, pen, overlayCanvas_1.SegmentCircleInclusive.End);
                break;
            default:
                break;
        }
        if (shapes) {
            this.context.fillStyle = ui.toColorStringNoAlpha(pen.color);
            for (let shape of shapes) {
                this.context.beginPath();
                shape.render(this.context, { x: 0, y: 0 });
                this.context.closePath();
                this.context.fill();
            }
        }
    }
    addAndDrawStroke(delta, submit) {
        if (submit) {
            this.model.submitOp(delta);
        }
        let dirtyLayers = {};
        for (let operation of delta.operations) {
            let type = client_api_1.types.getActionType(operation);
            if (type === client_api_1.types.ActionType.Clear) {
                this.clearCanvas();
                this.lastLayerRenderOp = {};
                dirtyLayers = {};
            }
            else {
                // Get the layer the delta applies to
                let stylusId = client_api_1.types.getStylusId(operation);
                dirtyLayers[stylusId] = true;
            }
        }
        // Render all the dirty layers
        // tslint:disable-next-line:forin
        for (let id in dirtyLayers) {
            let index = this.lastLayerRenderOp[id] || 0;
            const layer = this.model.getLayer(id);
            for (; index < layer.operations.length; index++) {
                // render the stroke
                this.drawStroke(layer, layer.operations[index], layer.operations[Math.max(0, index - 1)]);
            }
            this.lastLayerRenderOp[id] = index;
        }
    }
    /***
     * given start point and end point, get MixInk shapes to render. The returned MixInk
     * shapes may contain one or two circles whose center is either start point or end point.
     * Enum SegmentCircleInclusive determins whether circle is in the return list.
     * Besides circles, a trapezoid that serves as a bounding box of two stroke point is also returned.
     */
    getShapes(startPoint, endPoint, pen, circleInclusive) {
        let dirVector = new ui.Vector(endPoint.point.x - startPoint.point.x, endPoint.point.y - startPoint.point.y);
        let len = dirVector.length();
        let shapes = new Array();
        let trapezoidP0;
        let trapezoidP1;
        let trapezoidP2;
        let trapezoidP3;
        let normalizedLateralVector;
        // Scale by a power curve to trend towards thicker values
        let widthAtStart = pen.thickness * Math.pow(startPoint.pressure, 0.5) / 2;
        let widthAtEnd = pen.thickness * Math.pow(endPoint.pressure, 0.5) / 2;
        // Just draws a circle on small values??
        if (len + Math.min(widthAtStart, widthAtEnd) <= Math.max(widthAtStart, widthAtEnd)) {
            let center = widthAtStart >= widthAtEnd ? startPoint : endPoint;
            shapes.push(new index_1.Circle({ x: center.point.x, y: center.point.y }, widthAtEnd));
            return shapes;
        }
        if (len === 0) {
            return null;
        }
        if (widthAtStart !== widthAtEnd) {
            let angle = Math.acos(Math.abs(widthAtStart - widthAtEnd) / len);
            if (widthAtStart < widthAtEnd) {
                angle = Math.PI - angle;
            }
            normalizedLateralVector = ui.Vector.normalize(ui.Vector.rotate(dirVector, -angle));
            trapezoidP0 = new ui.Point(startPoint.point.x + widthAtStart * normalizedLateralVector.x, startPoint.point.y + widthAtStart * normalizedLateralVector.y);
            trapezoidP3 = new ui.Point(endPoint.point.x + widthAtEnd * normalizedLateralVector.x, endPoint.point.y + widthAtEnd * normalizedLateralVector.y);
            normalizedLateralVector = ui.Vector.normalize(ui.Vector.rotate(dirVector, angle));
            trapezoidP2 = new ui.Point(endPoint.point.x + widthAtEnd * normalizedLateralVector.x, endPoint.point.y + widthAtEnd * normalizedLateralVector.y);
            trapezoidP1 = new ui.Point(startPoint.point.x + widthAtStart * normalizedLateralVector.x, startPoint.point.y + widthAtStart * normalizedLateralVector.y);
        }
        else {
            normalizedLateralVector = new ui.Vector(-dirVector.y / len, dirVector.x / len);
            trapezoidP0 = new ui.Point(startPoint.point.x + widthAtStart * normalizedLateralVector.x, startPoint.point.y + widthAtStart * normalizedLateralVector.y);
            trapezoidP1 = new ui.Point(startPoint.point.x - widthAtStart * normalizedLateralVector.x, startPoint.point.y - widthAtStart * normalizedLateralVector.y);
            trapezoidP2 = new ui.Point(endPoint.point.x - widthAtEnd * normalizedLateralVector.x, endPoint.point.y - widthAtEnd * normalizedLateralVector.y);
            trapezoidP3 = new ui.Point(endPoint.point.x + widthAtEnd * normalizedLateralVector.x, endPoint.point.y + widthAtEnd * normalizedLateralVector.y);
        }
        let polygon = new index_1.Polygon([trapezoidP0, trapezoidP3, trapezoidP2, trapezoidP1]);
        shapes.push(polygon);
        switch (circleInclusive) {
            case overlayCanvas_1.SegmentCircleInclusive.None:
                break;
            case overlayCanvas_1.SegmentCircleInclusive.Both:
                shapes.push(new index_1.Circle({ x: startPoint.point.x, y: startPoint.point.y }, widthAtStart));
                shapes.push(new index_1.Circle({ x: endPoint.point.x, y: endPoint.point.y }, widthAtEnd));
                break;
            case overlayCanvas_1.SegmentCircleInclusive.Start:
                shapes.push(new index_1.Circle({ x: startPoint.point.x, y: startPoint.point.y }, widthAtStart));
                break;
            case overlayCanvas_1.SegmentCircleInclusive.End:
                shapes.push(new index_1.Circle({ x: endPoint.point.x, y: endPoint.point.y }, widthAtEnd));
                break;
            default:
                break;
        }
        return shapes;
    }
}
exports.InkCanvas = InkCanvas;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"../ui":41,"./overlayCanvas":20,"./shapes/index":25}],19:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ui = require("../ui");
const scrollBar_1 = require("./scrollBar");
const scrollAreaWidth = 18;
/**
 * A layer panel stacks children in a z order defined by their child index. It is used to overlay layers
 * on top of each other.
 *
 * TODO: This is becoming more of a custom flow view specific control rather than an abstract control
 */
class LayerPanel extends ui.Component {
    constructor(element) {
        super(element);
        this.scrollBarVisible = false;
        // Scrollbar
        const scrollBarElement = document.createElement("div");
        this.scrollBar = new scrollBar_1.ScrollBar(scrollBarElement);
        this.addChild(this.scrollBar);
        this.element.appendChild(this.scrollBar.element);
    }
    /**
     * Adds a new child to the stack
     */
    addChild(component) {
        super.addChild(component, this.getChildren().length - 1);
        this.element.insertBefore(component.element, this.element.lastChild);
    }
    showScrollBar(show) {
        if (this.scrollBarVisible !== show) {
            this.scrollBarVisible = show;
            this.resizeCore(this.size);
        }
    }
    resizeCore(bounds) {
        // TODO this is a temporary fix - need to change resize to just have a size and not a rectangle. Parent
        // will position the element. Child only needs to lay itself out within a size. System will then do any
        // geometry transforms to correctly place in screen space.
        bounds = new ui.Rectangle(0, 0, bounds.width, bounds.height);
        let scrollBounds;
        let contentBounds;
        if (this.scrollBarVisible) {
            const nippedBounds = bounds.nipHorizRight(scrollAreaWidth);
            scrollBounds = nippedBounds[1];
            contentBounds = nippedBounds[0];
            this.scrollBar.element.style.display = "block";
            scrollBounds.conformElement(this.scrollBar.element);
            this.scrollBar.resize(scrollBounds);
        }
        else {
            contentBounds = bounds;
            this.scrollBar.element.style.display = "none";
        }
        const children = this.getChildren();
        for (let i = 0; i < children.length - 1; i++) {
            const child = children[i];
            contentBounds.conformElement(child.element);
            child.resize(contentBounds);
        }
    }
}
exports.LayerPanel = LayerPanel;

},{"../ui":41,"./scrollBar":22}],20:[function(require,module,exports){
(function (global){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_api_1 = (typeof window !== "undefined" ? window['prague'] : typeof global !== "undefined" ? global['prague'] : null);
const ui = require("../ui");
const debug_1 = require("./debug");
const recognizer = require("./shapeRecognizer");
const index_1 = require("./shapes/index");
var SegmentCircleInclusive;
(function (SegmentCircleInclusive) {
    SegmentCircleInclusive[SegmentCircleInclusive["None"] = 0] = "None";
    SegmentCircleInclusive[SegmentCircleInclusive["Both"] = 1] = "Both";
    SegmentCircleInclusive[SegmentCircleInclusive["Start"] = 2] = "Start";
    SegmentCircleInclusive[SegmentCircleInclusive["End"] = 3] = "End";
})(SegmentCircleInclusive = exports.SegmentCircleInclusive || (exports.SegmentCircleInclusive = {}));
const DryTimer = 5000;
const RecoTimer = 200;
// Padding around a drawing context - used to avoid extra copies
const CanvasPadding = 100;
/**
 * Helper method to resize a HTML5 canvas
 */
function sizeCanvas(canvas, size) {
    canvas.width = size.width;
    canvas.style.width = `${size.width}px`;
    canvas.height = size.height;
    canvas.style.height = `${size.height}px`;
}
/**
 * Adds padding to next if is different from the current value
 */
function padLeft(current, next, padding) {
    return current !== next ? Math.floor(next - padding) : current;
}
/**
 * Adds padding to next if is different from the current value
 */
function padRight(current, next, padding) {
    return current !== next ? Math.ceil(next + padding) : current;
}
/**
 * The drawing context provides access to a logical canvas that is infinite in size. In reality it's backed by a
 * fixed size canvas that fits all instructions sent to it.
 *
 * TODO: Not quite a DrawingContext in the traditional sense but close. Probably should rename or move into the
 * layer and expose more traditional getContext like calls.
 */
class DrawingContext {
    constructor(size) {
        this.canvas = document.createElement("canvas");
        this.lastOperation = null;
        this.canvasOffset = { x: 0, y: 0 };
        this.context = this.canvas.getContext("2d");
        if (size) {
            sizeCanvas(this.canvas, size);
        }
        this.updatePosition();
    }
    get offset() {
        return this.canvasOffset;
    }
    clear() {
        this.lastOperation = null;
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
    // store instructions used to render itself? i.e. the total path? Or defer to someone else to actually
    // do the re-render with a context?
    drawStroke(current) {
        let type = client_api_1.types.getActionType(current);
        let shapes;
        let currentAction = client_api_1.types.getStylusAction(current);
        let previousAction = client_api_1.types.getStylusAction(this.lastOperation || current);
        switch (type) {
            case client_api_1.types.ActionType.StylusDown:
                this.pen = current.stylusDown.pen;
                shapes = this.getShapes(currentAction, currentAction, this.pen, SegmentCircleInclusive.End);
                break;
            case client_api_1.types.ActionType.StylusMove:
                client_api_1.assert(this.pen);
                shapes = this.getShapes(previousAction, currentAction, this.pen, SegmentCircleInclusive.End);
                break;
            case client_api_1.types.ActionType.StylusUp:
                client_api_1.assert(this.pen);
                shapes = this.getShapes(previousAction, currentAction, this.pen, SegmentCircleInclusive.End);
                break;
            default:
                break;
        }
        if (shapes) {
            // Update canvas bounds
            let unionedBounds;
            for (let shape of shapes) {
                const bounds = shape.getBounds();
                if (!unionedBounds) {
                    unionedBounds = bounds;
                }
                else {
                    unionedBounds = unionedBounds.union(bounds);
                }
            }
            this.ensureCanvas(unionedBounds);
            this.context.fillStyle = ui.toColorStringNoAlpha(this.pen.color);
            for (let shape of shapes) {
                this.context.beginPath();
                shape.render(this.context, this.offset);
                this.context.closePath();
                this.context.fill();
            }
        }
        this.lastOperation = current;
    }
    /**
     * Updates the positioning of the canvas so that the logical (0, 0) is at pixel (0, 0)
     */
    updatePosition() {
        this.canvas.style.position = "relative";
        this.canvas.style.left = `${this.offset.x}px`;
        this.canvas.style.top = `${this.offset.y}px`;
    }
    /**
     * Ensures that the canvas is large enough to render the given bounds
     */
    ensureCanvas(bounds) {
        const canvasBounds = new ui.Rectangle(this.offset.x, this.offset.y, this.canvas.width, this.canvas.height);
        if (canvasBounds.contains(bounds)) {
            return;
        }
        const newBounds = canvasBounds.union(bounds);
        // Capture the max values of both prior to adjusting the min
        const canvasMax = { x: newBounds.x + newBounds.width, y: newBounds.y + newBounds.height };
        const newMax = { x: newBounds.x + newBounds.width, y: newBounds.y + newBounds.height };
        // Update the min values
        newBounds.x = padLeft(canvasBounds.x, newBounds.x, CanvasPadding);
        newBounds.y = padLeft(canvasBounds.y, newBounds.y, CanvasPadding);
        // Update the max values - and then width/height
        newMax.x = padRight(canvasMax.x, newMax.x, CanvasPadding);
        newMax.y = padRight(canvasMax.y, newMax.y, CanvasPadding);
        newBounds.width = newMax.x - newBounds.x;
        newBounds.height = newMax.y - newBounds.y;
        // Need to resize the canvas
        const newCanvas = document.createElement("canvas");
        sizeCanvas(newCanvas, newBounds.size);
        const newContext = newCanvas.getContext("2d");
        newContext.drawImage(this.canvas, this.offset.x - newBounds.x, this.offset.y - newBounds.y);
        // Swap the canvas elements
        if (this.canvas.parentNode) {
            this.canvas.parentNode.insertBefore(newCanvas, this.canvas);
            this.canvas.remove();
        }
        this.canvas = newCanvas;
        this.context = newContext;
        this.canvasOffset = { x: newBounds.x, y: newBounds.y };
        this.updatePosition();
    }
    /**
     * given start point and end point, get MixInk shapes to render. The returned MixInk
     * shapes may contain one or two circles whose center is either start point or end point.
     * Enum SegmentCircleInclusive determins whether circle is in the return list.
     * Besides circles, a trapezoid that serves as a bounding box of two stroke point is also returned.
     */
    getShapes(startPoint, endPoint, pen, circleInclusive) {
        let dirVector = new ui.Vector(endPoint.point.x - startPoint.point.x, endPoint.point.y - startPoint.point.y);
        let len = dirVector.length();
        let shapes = new Array();
        let trapezoidP0;
        let trapezoidP1;
        let trapezoidP2;
        let trapezoidP3;
        let normalizedLateralVector;
        // Scale by a power curve to trend towards thicker values
        let widthAtStart = pen.thickness * Math.pow(startPoint.pressure, 0.5) / 2;
        let widthAtEnd = pen.thickness * Math.pow(endPoint.pressure, 0.5) / 2;
        // Just draws a circle on small values??
        if (len + Math.min(widthAtStart, widthAtEnd) <= Math.max(widthAtStart, widthAtEnd)) {
            let center = widthAtStart >= widthAtEnd ? startPoint : endPoint;
            shapes.push(new index_1.Circle({ x: center.point.x, y: center.point.y }, widthAtEnd));
            return shapes;
        }
        if (len === 0) {
            return null;
        }
        if (widthAtStart !== widthAtEnd) {
            let angle = Math.acos(Math.abs(widthAtStart - widthAtEnd) / len);
            if (widthAtStart < widthAtEnd) {
                angle = Math.PI - angle;
            }
            normalizedLateralVector = ui.Vector.normalize(ui.Vector.rotate(dirVector, -angle));
            trapezoidP0 = new ui.Point(startPoint.point.x + widthAtStart * normalizedLateralVector.x, startPoint.point.y + widthAtStart * normalizedLateralVector.y);
            trapezoidP3 = new ui.Point(endPoint.point.x + widthAtEnd * normalizedLateralVector.x, endPoint.point.y + widthAtEnd * normalizedLateralVector.y);
            normalizedLateralVector = ui.Vector.normalize(ui.Vector.rotate(dirVector, angle));
            trapezoidP2 = new ui.Point(endPoint.point.x + widthAtEnd * normalizedLateralVector.x, endPoint.point.y + widthAtEnd * normalizedLateralVector.y);
            trapezoidP1 = new ui.Point(startPoint.point.x + widthAtStart * normalizedLateralVector.x, startPoint.point.y + widthAtStart * normalizedLateralVector.y);
        }
        else {
            normalizedLateralVector = new ui.Vector(-dirVector.y / len, dirVector.x / len);
            trapezoidP0 = new ui.Point(startPoint.point.x + widthAtStart * normalizedLateralVector.x, startPoint.point.y + widthAtStart * normalizedLateralVector.y);
            trapezoidP1 = new ui.Point(startPoint.point.x - widthAtStart * normalizedLateralVector.x, startPoint.point.y - widthAtStart * normalizedLateralVector.y);
            trapezoidP2 = new ui.Point(endPoint.point.x - widthAtEnd * normalizedLateralVector.x, endPoint.point.y - widthAtEnd * normalizedLateralVector.y);
            trapezoidP3 = new ui.Point(endPoint.point.x + widthAtEnd * normalizedLateralVector.x, endPoint.point.y + widthAtEnd * normalizedLateralVector.y);
        }
        let polygon = new index_1.Polygon([trapezoidP0, trapezoidP3, trapezoidP2, trapezoidP1]);
        shapes.push(polygon);
        switch (circleInclusive) {
            case SegmentCircleInclusive.None:
                break;
            case SegmentCircleInclusive.Both:
                shapes.push(new index_1.Circle({ x: startPoint.point.x, y: startPoint.point.y }, widthAtStart));
                shapes.push(new index_1.Circle({ x: endPoint.point.x, y: endPoint.point.y }, widthAtEnd));
                break;
            case SegmentCircleInclusive.Start:
                shapes.push(new index_1.Circle({ x: startPoint.point.x, y: startPoint.point.y }, widthAtStart));
                break;
            case SegmentCircleInclusive.End:
                shapes.push(new index_1.Circle({ x: endPoint.point.x, y: endPoint.point.y }, widthAtEnd));
                break;
            default:
                break;
        }
        return shapes;
    }
}
exports.DrawingContext = DrawingContext;
/**
 * Graphics drawing layer
 */
class Layer {
    constructor(size) {
        this.position = { x: 0, y: 0 };
        this.node = document.createElement("div");
        this.drawingContext = new DrawingContext();
        this.node.appendChild(this.drawingContext.canvas);
        this.updatePosition();
    }
    setPosition(position) {
        this.position = position;
        this.updatePosition();
    }
    updatePosition() {
        this.node.style.position = "absolute";
        this.node.style.left = `${this.position.x}px`;
        this.node.style.top = `${this.position.y}px`;
    }
}
exports.Layer = Layer;
/**
 * Used to render ink
 */
class InkLayer extends Layer {
    constructor(size, model) {
        super(size);
        this.model = model;
        // Listen for updates and re-render
        this.model.on("op", (op) => {
            const delta = op.contents;
            for (const operation of delta.operations) {
                this.drawingContext.drawStroke(operation);
            }
        });
        const layers = this.model.getLayers();
        for (const layer of layers) {
            for (const operation of layer.operations) {
                this.drawingContext.drawStroke(operation);
            }
        }
    }
    drawDelta(delta) {
        this.model.submitOp(delta);
        for (const operation of delta.operations) {
            this.drawingContext.drawStroke(operation);
        }
    }
}
exports.InkLayer = InkLayer;
/**
 * API access to a drawing context that can be used to render elements
 */
class OverlayCanvas extends ui.Component {
    // TODO composite layers together
    // private canvas: HTMLCanvasElement;
    /**
     * Constructs a new OverlayCanvas.
     *
     * We require the parent element so we can register for entry/exit events on it. To allow non-ink
     * events to pass through the overlay we need to disable it when the pen is not being used. But once
     * disabled we won't receive the event to enable it. We can't wrap the canvas with a div either because
     * that element would then receive all events and events wouldn't pass through to the content under the
     * overlay. For that reason we ask the parent element to provide a div we can use to track pen entry/exit.
     */
    constructor(document, container, eventTarget) {
        super(container);
        this.document = document;
        this.layers = [];
        this.inkEventsEnabled = false;
        this.penHovering = false;
        this.forceInk = false;
        this.activePen = {
            color: { r: 0, g: 161 / 255, b: 241 / 255, a: 0 },
            thickness: 7,
        };
        this.pointsToRecognize = [];
        // No pointer events by default
        container.style.pointerEvents = "none";
        // Track ink events on the eventTarget in order to enable/disable pointer events
        this.trackInkEvents(eventTarget);
        // Ink handling messages
        container.addEventListener("pointerdown", (evt) => this.handlePointerDown(evt));
        container.addEventListener("pointermove", (evt) => this.handlePointerMove(evt));
        container.addEventListener("pointerup", (evt) => this.handlePointerUp(evt));
    }
    addLayer(layer) {
        this.layers.push(layer);
        this.element.appendChild(layer.node);
    }
    removeLayer(layer) {
        const index = this.layers.indexOf(layer);
        this.layers.splice(index, 1);
        layer.node.remove();
    }
    /**
     * Sets the current pen
     */
    setPen(pen) {
        this.activePen = { color: pen.color, thickness: pen.thickness };
    }
    enableInk(enable) {
        this.enableInkCore(this.penHovering, enable);
    }
    /**
     * Used to just enable/disable the ink events. Should only be used when needing to temporarily
     * disable ink (for DOM hit testing events, for example). The enableInk event is probably what you really want.
     */
    enableInkHitTest(enable) {
        this.element.style.pointerEvents = enable ? "auto" : "none";
    }
    /**
     * Tracks ink events on the provided element and enables/disables the ink layer based on them
     */
    trackInkEvents(eventTarget) {
        // Pointer events used to enable/disable the overlay canvas ink handling
        // A pen entering the element causes us to enable ink events. If the pointer already has entered
        // via the mouse we won't get another event for the pen. In this case we also watch move events
        // to be able to toggle the ink layer. A pen leaving disables ink.
        eventTarget.addEventListener("pointerenter", (event) => {
            if (event.pointerType === "pen") {
                this.enableInkCore(true, this.forceInk);
            }
        });
        eventTarget.addEventListener("pointerleave", (event) => {
            if (event.pointerType === "pen") {
                this.enableInkCore(false, this.forceInk);
            }
        });
        // Tracking pointermove is used to work around not receiving a pen event if the mouse already
        // entered the element without leaving
        eventTarget.addEventListener("pointermove", (event) => {
            if (event.pointerType === "pen") {
                this.enableInkCore(true, this.forceInk);
            }
        });
    }
    /**
     * Updates the hovering and force fields and then enables or disables ink based on their values.
     */
    enableInkCore(hovering, force) {
        this.penHovering = hovering;
        this.forceInk = force;
        const enable = this.forceInk || this.penHovering;
        if (this.inkEventsEnabled !== enable) {
            this.inkEventsEnabled = enable;
            this.enableInkHitTest(enable);
        }
    }
    handlePointerDown(evt) {
        // Only support pen events
        if (evt.pointerType === "pen" || (evt.pointerType === "mouse" && evt.button === 0)) {
            let translatedPoint = this.translatePoint(this.element, evt);
            this.pointsToRecognize.push(translatedPoint);
            // Create a new layer if doesn't already exist
            if (!this.activeLayer) {
                // Create a new layer at the position of the pointer down
                const model = this.document.createInk();
                this.activeLayer = new InkLayer({ width: 0, height: 0 }, model);
                this.activeLayer.setPosition(translatedPoint);
                this.addLayer(this.activeLayer);
                this.emit("ink", this.activeLayer, model, { x: evt.pageX, y: evt.pageY });
            }
            this.stopDryTimer();
            this.stopRecoTimer();
            // Capture ink events
            this.activePointerId = evt.pointerId;
            this.element.setPointerCapture(this.activePointerId);
            let delta = new client_api_1.types.Delta().stylusDown(this.translateToLayer(translatedPoint, this.activeLayer), evt.pressure, this.activePen);
            this.currentStylusActionId = delta.operations[0].stylusDown.id;
            this.activeLayer.drawDelta(delta);
            evt.returnValue = false;
        }
    }
    handlePointerMove(evt) {
        if (evt.pointerId === this.activePointerId) {
            let translatedPoint = this.translatePoint(this.element, evt);
            this.pointsToRecognize.push(translatedPoint);
            let delta = new client_api_1.types.Delta().stylusMove(this.translateToLayer(translatedPoint, this.activeLayer), evt.pressure, this.currentStylusActionId);
            this.activeLayer.drawDelta(delta);
            evt.returnValue = false;
        }
        return false;
    }
    handlePointerUp(evt) {
        if (evt.pointerId === this.activePointerId) {
            let translatedPoint = this.translatePoint(this.element, evt);
            this.pointsToRecognize.push(translatedPoint);
            evt.returnValue = false;
            let delta = new client_api_1.types.Delta().stylusUp(this.translateToLayer(translatedPoint, this.activeLayer), evt.pressure, this.currentStylusActionId);
            this.currentStylusActionId = undefined;
            this.activeLayer.drawDelta(delta);
            // Release the event
            this.element.releasePointerCapture(this.activePointerId);
            this.activePointerId = undefined;
            this.startDryTimer();
            this.startRecoTimer();
        }
        return false;
    }
    startDryTimer() {
        this.dryTimer = setTimeout(() => {
            this.dryInk();
        }, DryTimer);
    }
    stopDryTimer() {
        if (this.dryTimer) {
            clearTimeout(this.dryTimer);
            this.dryTimer = undefined;
        }
    }
    startRecoTimer() {
        this.recoTimer = setTimeout(() => {
            this.recognizeShape();
        }, RecoTimer);
    }
    stopRecoTimer() {
        if (this.recoTimer) {
            clearTimeout(this.recoTimer);
            this.recoTimer = undefined;
        }
    }
    recognizeShape() {
        // The console output can be used to train more shapes.
        // console.log(this.printStroke());
        const shapeType = recognizer.recognizeShape(this.pointsToRecognize);
        if (shapeType !== undefined) {
            console.log(`Shape type: ${shapeType.pattern}`);
            console.log(`Score: ${shapeType.score}`);
        }
        else {
            console.log(`Unrecognized shape!`);
        }
        // Clear the strokes.
        this.pointsToRecognize = [];
    }
    dryInk() {
        debug_1.debug("Drying the ink");
        this.dryTimer = undefined;
        // TODO allow ability to close a collab stream
        this.emit("dry", this.activeLayer);
        this.activeLayer = undefined;
    }
    translatePoint(relative, event) {
        const boundingRect = relative.getBoundingClientRect();
        const offset = {
            x: boundingRect.left + document.body.scrollLeft,
            y: boundingRect.top + document.body.scrollTop,
        };
        return {
            x: event.pageX - offset.x,
            y: event.pageY - offset.y,
        };
    }
    translateToLayer(position, layer) {
        return {
            x: position.x - layer.position.x,
            y: position.y - layer.position.y,
        };
    }
}
exports.OverlayCanvas = OverlayCanvas;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"../ui":41,"./debug":9,"./shapeRecognizer":23,"./shapes/index":25}],21:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ui = require("../ui");
/**
 * Basic dock panel control
 */
class Popup extends ui.Component {
    constructor(element) {
        super(element);
        this.visible = false;
        this.element.style.display = "none";
    }
    addContent(content) {
        this.content = content;
        this.addChild(content);
        this.element.appendChild(content.element);
        this.resizeCore(this.size);
    }
    toggle() {
        this.visible = !this.visible;
        this.element.style.display = this.visible ? "block" : "none";
    }
    measure(size) {
        return this.content ? this.content.measure(size) : size;
    }
    resizeCore(bounds) {
        if (this.content) {
            this.content.resize(bounds);
        }
    }
}
exports.Popup = Popup;

},{"../ui":41}],22:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ui = require("../ui");
// TODO will want to emit events for clicking the thing, etc...
class ScrollBar extends ui.Component {
    constructor(element) {
        super(element);
        this.range = { value: 0, min: 0, max: 0 };
        this.track = document.createElement("div");
        this.track.style.backgroundColor = "pink";
        this.track.style.borderRadius = "5px";
        this.track.style.position = "absolute";
        this.element.appendChild(this.track);
    }
    /**
     * Sets the value of the track
     */
    set value(value) {
        this.range.value = value;
        this.updateTrack();
    }
    set min(value) {
        this.range.min = value;
        this.updateTrack();
    }
    set max(value) {
        this.range.max = value;
        this.updateTrack();
    }
    setRange(range) {
        this.range = { value: range.value, min: range.min, max: range.max };
        this.updateTrack();
    }
    resizeCore(bounds) {
        this.updateTrack();
    }
    /**
     * Updates the scroll bar's track element
     */
    updateTrack() {
        const rangeLength = this.range.max - this.range.min;
        const frac = rangeLength !== 0 ? (this.range.value - this.range.min) / rangeLength : 0;
        const height = Math.max(3, rangeLength !== 0 ? this.size.height / rangeLength : 0, 0);
        const top = frac * this.size.height;
        const left = 3;
        // The below will get put in some kind of updateTrack call
        this.track.style.width = `${Math.max(12, this.size.width - 6)}px`;
        this.track.style.height = `${height}px`;
        this.track.style.left = `${left}px`;
        this.track.style.top = `${top}px`;
    }
}
exports.ScrollBar = ScrollBar;

},{"../ui":41}],23:[function(require,module,exports){
"use strict";
// tslint:disable:max-line-length
Object.defineProperty(exports, "__esModule", { value: true });
const ShapeDetector = require("shape-detector");
const defaultShapes = [
    {
        name: "rectangle",
        points: [{ x: 140.17500305175776, y: 140.17500305175776 }, { x: 175.2187538146972, y: 140.17500305175776 }, { x: 210.26250457763663, y: 140.17500305175776 }, { x: 245.30625534057606, y: 140.17500305175776 }, { x: 280.3500061035155, y: 140.17500305175776 }, { x: 315.39375686645496, y: 140.17500305175776 }, { x: 350.4375076293944, y: 140.17500305175776 }, { x: 385.4812583923338, y: 140.17500305175776 }, { x: 420.52500915527327, y: 140.17500305175776 }, { x: 420.52500915527327, y: 140.17500305175776 }, { x: 420.52500915527327, y: 175.2187538146972 }, { x: 420.52500915527327, y: 210.26250457763663 }, { x: 420.52500915527327, y: 245.30625534057606 }, { x: 420.52500915527327, y: 280.3500061035155 }, { x: 420.52500915527327, y: 315.39375686645496 }, { x: 420.52500915527327, y: 350.4375076293944 }, { x: 420.52500915527327, y: 385.4812583923338 }, { x: 420.52500915527327, y: 420.52500915527327 }, { x: 420.52500915527327, y: 420.52500915527327 }, { x: 385.4812583923338, y: 420.52500915527327 }, { x: 350.4375076293944, y: 420.52500915527327 }, { x: 315.39375686645496, y: 420.52500915527327 }, { x: 280.3500061035155, y: 420.52500915527327 }, { x: 245.30625534057606, y: 420.52500915527327 }, { x: 210.26250457763663, y: 420.52500915527327 }, { x: 175.2187538146972, y: 420.52500915527327 }, { x: 140.17500305175776, y: 420.52500915527327 }, { x: 140.17500305175776, y: 420.52500915527327 }, { x: 140.17500305175776, y: 385.4812583923338 }, { x: 140.17500305175776, y: 350.4375076293944 }, { x: 140.17500305175776, y: 315.39375686645496 }, { x: 140.17500305175776, y: 280.3500061035155 }, { x: 140.17500305175776, y: 245.30625534057606 }, { x: 140.17500305175776, y: 210.26250457763663 }, { x: 140.17500305175776, y: 175.2187538146972 }, { x: 140.17500305175776, y: 140.17500305175776 }],
    },
    {
        name: "rectangle",
        points: [{ x: 420.52500915527327, y: 140.17500305175776 }, { x: 420.52500915527327, y: 175.2187538146972 }, { x: 420.52500915527327, y: 210.26250457763663 }, { x: 420.52500915527327, y: 245.30625534057606 }, { x: 420.52500915527327, y: 280.3500061035155 }, { x: 420.52500915527327, y: 315.39375686645496 }, { x: 420.52500915527327, y: 350.4375076293944 }, { x: 420.52500915527327, y: 385.4812583923338 }, { x: 420.52500915527327, y: 420.52500915527327 }, { x: 420.52500915527327, y: 420.52500915527327 }, { x: 385.4812583923338, y: 420.52500915527327 }, { x: 350.4375076293944, y: 420.52500915527327 }, { x: 315.39375686645496, y: 420.52500915527327 }, { x: 280.3500061035155, y: 420.52500915527327 }, { x: 245.30625534057606, y: 420.52500915527327 }, { x: 210.26250457763663, y: 420.52500915527327 }, { x: 175.2187538146972, y: 420.52500915527327 }, { x: 140.17500305175776, y: 420.52500915527327 }, { x: 140.17500305175776, y: 420.52500915527327 }, { x: 140.17500305175776, y: 385.4812583923338 }, { x: 140.17500305175776, y: 350.4375076293944 }, { x: 140.17500305175776, y: 315.39375686645496 }, { x: 140.17500305175776, y: 280.3500061035155 }, { x: 140.17500305175776, y: 245.30625534057606 }, { x: 140.17500305175776, y: 210.26250457763663 }, { x: 140.17500305175776, y: 175.2187538146972 }, { x: 140.17500305175776, y: 140.17500305175776 }, { x: 140.17500305175776, y: 140.17500305175776 }, { x: 175.2187538146972, y: 140.17500305175776 }, { x: 210.26250457763663, y: 140.17500305175776 }, { x: 245.30625534057606, y: 140.17500305175776 }, { x: 280.3500061035155, y: 140.17500305175776 }, { x: 315.39375686645496, y: 140.17500305175776 }, { x: 350.4375076293944, y: 140.17500305175776 }, { x: 385.4812583923338, y: 140.17500305175776 }, { x: 420.52500915527327, y: 140.17500305175776 }],
    },
    {
        name: "rectangle",
        points: [{ x: 420.52500915527327, y: 420.52500915527327 }, { x: 385.4812583923338, y: 420.52500915527327 }, { x: 350.4375076293944, y: 420.52500915527327 }, { x: 315.39375686645496, y: 420.52500915527327 }, { x: 280.3500061035155, y: 420.52500915527327 }, { x: 245.30625534057606, y: 420.52500915527327 }, { x: 210.26250457763663, y: 420.52500915527327 }, { x: 175.2187538146972, y: 420.52500915527327 }, { x: 140.17500305175776, y: 420.52500915527327 }, { x: 140.17500305175776, y: 420.52500915527327 }, { x: 140.17500305175776, y: 385.4812583923338 }, { x: 140.17500305175776, y: 350.4375076293944 }, { x: 140.17500305175776, y: 315.39375686645496 }, { x: 140.17500305175776, y: 280.3500061035155 }, { x: 140.17500305175776, y: 245.30625534057606 }, { x: 140.17500305175776, y: 210.26250457763663 }, { x: 140.17500305175776, y: 175.2187538146972 }, { x: 140.17500305175776, y: 140.17500305175776 }, { x: 140.17500305175776, y: 140.17500305175776 }, { x: 175.2187538146972, y: 140.17500305175776 }, { x: 210.26250457763663, y: 140.17500305175776 }, { x: 245.30625534057606, y: 140.17500305175776 }, { x: 280.3500061035155, y: 140.17500305175776 }, { x: 315.39375686645496, y: 140.17500305175776 }, { x: 350.4375076293944, y: 140.17500305175776 }, { x: 385.4812583923338, y: 140.17500305175776 }, { x: 420.52500915527327, y: 140.17500305175776 }, { x: 420.52500915527327, y: 140.17500305175776 }, { x: 420.52500915527327, y: 175.2187538146972 }, { x: 420.52500915527327, y: 210.26250457763663 }, { x: 420.52500915527327, y: 245.30625534057606 }, { x: 420.52500915527327, y: 280.3500061035155 }, { x: 420.52500915527327, y: 315.39375686645496 }, { x: 420.52500915527327, y: 350.4375076293944 }, { x: 420.52500915527327, y: 385.4812583923338 }, { x: 420.52500915527327, y: 420.52500915527327 }],
    },
    {
        name: "rectangle",
        points: [{ x: 140.17500305175776, y: 420.52500915527327 }, { x: 140.17500305175776, y: 385.4812583923338 }, { x: 140.17500305175776, y: 350.4375076293944 }, { x: 140.17500305175776, y: 315.39375686645496 }, { x: 140.17500305175776, y: 280.3500061035155 }, { x: 140.17500305175776, y: 245.30625534057606 }, { x: 140.17500305175776, y: 210.26250457763663 }, { x: 140.17500305175776, y: 175.2187538146972 }, { x: 140.17500305175776, y: 140.17500305175776 }, { x: 140.17500305175776, y: 140.17500305175776 }, { x: 175.2187538146972, y: 140.17500305175776 }, { x: 210.26250457763663, y: 140.17500305175776 }, { x: 245.30625534057606, y: 140.17500305175776 }, { x: 280.3500061035155, y: 140.17500305175776 }, { x: 315.39375686645496, y: 140.17500305175776 }, { x: 350.4375076293944, y: 140.17500305175776 }, { x: 385.4812583923338, y: 140.17500305175776 }, { x: 420.52500915527327, y: 140.17500305175776 }, { x: 420.52500915527327, y: 140.17500305175776 }, { x: 420.52500915527327, y: 175.2187538146972 }, { x: 420.52500915527327, y: 210.26250457763663 }, { x: 420.52500915527327, y: 245.30625534057606 }, { x: 420.52500915527327, y: 280.3500061035155 }, { x: 420.52500915527327, y: 315.39375686645496 }, { x: 420.52500915527327, y: 350.4375076293944 }, { x: 420.52500915527327, y: 385.4812583923338 }, { x: 420.52500915527327, y: 420.52500915527327 }, { x: 420.52500915527327, y: 420.52500915527327 }, { x: 385.4812583923338, y: 420.52500915527327 }, { x: 350.4375076293944, y: 420.52500915527327 }, { x: 315.39375686645496, y: 420.52500915527327 }, { x: 280.3500061035155, y: 420.52500915527327 }, { x: 245.30625534057606, y: 420.52500915527327 }, { x: 210.26250457763663, y: 420.52500915527327 }, { x: 175.2187538146972, y: 420.52500915527327 }, { x: 140.17500305175776, y: 420.52500915527327 }],
    },
    {
        name: "rectangle",
        points: [{ x: 140.17500305175776, y: 420.52500915527327 }, { x: 175.2187538146972, y: 420.52500915527327 }, { x: 210.26250457763663, y: 420.52500915527327 }, { x: 245.30625534057606, y: 420.52500915527327 }, { x: 280.3500061035155, y: 420.52500915527327 }, { x: 315.39375686645496, y: 420.52500915527327 }, { x: 350.4375076293944, y: 420.52500915527327 }, { x: 385.4812583923338, y: 420.52500915527327 }, { x: 420.52500915527327, y: 420.52500915527327 }, { x: 420.52500915527327, y: 420.52500915527327 }, { x: 420.52500915527327, y: 385.4812583923338 }, { x: 420.52500915527327, y: 350.4375076293944 }, { x: 420.52500915527327, y: 315.39375686645496 }, { x: 420.52500915527327, y: 280.3500061035155 }, { x: 420.52500915527327, y: 245.30625534057606 }, { x: 420.52500915527327, y: 210.26250457763663 }, { x: 420.52500915527327, y: 175.2187538146972 }, { x: 420.52500915527327, y: 140.17500305175776 }, { x: 420.52500915527327, y: 140.17500305175776 }, { x: 385.4812583923338, y: 140.17500305175776 }, { x: 350.4375076293944, y: 140.17500305175776 }, { x: 315.39375686645496, y: 140.17500305175776 }, { x: 280.3500061035155, y: 140.17500305175776 }, { x: 245.30625534057606, y: 140.17500305175776 }, { x: 210.26250457763663, y: 140.17500305175776 }, { x: 175.2187538146972, y: 140.17500305175776 }, { x: 140.17500305175776, y: 140.17500305175776 }, { x: 140.17500305175776, y: 140.17500305175776 }, { x: 140.17500305175776, y: 175.2187538146972 }, { x: 140.17500305175776, y: 210.26250457763663 }, { x: 140.17500305175776, y: 245.30625534057606 }, { x: 140.17500305175776, y: 280.3500061035155 }, { x: 140.17500305175776, y: 315.39375686645496 }, { x: 140.17500305175776, y: 350.4375076293944 }, { x: 140.17500305175776, y: 385.4812583923338 }, { x: 140.17500305175776, y: 420.52500915527327 }],
    },
    {
        name: "rectangle",
        points: [{ x: 420.52500915527327, y: 420.52500915527327 }, { x: 420.52500915527327, y: 385.4812583923338 }, { x: 420.52500915527327, y: 350.4375076293944 }, { x: 420.52500915527327, y: 315.39375686645496 }, { x: 420.52500915527327, y: 280.3500061035155 }, { x: 420.52500915527327, y: 245.30625534057606 }, { x: 420.52500915527327, y: 210.26250457763663 }, { x: 420.52500915527327, y: 175.2187538146972 }, { x: 420.52500915527327, y: 140.17500305175776 }, { x: 420.52500915527327, y: 140.17500305175776 }, { x: 385.4812583923338, y: 140.17500305175776 }, { x: 350.4375076293944, y: 140.17500305175776 }, { x: 315.39375686645496, y: 140.17500305175776 }, { x: 280.3500061035155, y: 140.17500305175776 }, { x: 245.30625534057606, y: 140.17500305175776 }, { x: 210.26250457763663, y: 140.17500305175776 }, { x: 175.2187538146972, y: 140.17500305175776 }, { x: 140.17500305175776, y: 140.17500305175776 }, { x: 140.17500305175776, y: 140.17500305175776 }, { x: 140.17500305175776, y: 175.2187538146972 }, { x: 140.17500305175776, y: 210.26250457763663 }, { x: 140.17500305175776, y: 245.30625534057606 }, { x: 140.17500305175776, y: 280.3500061035155 }, { x: 140.17500305175776, y: 315.39375686645496 }, { x: 140.17500305175776, y: 350.4375076293944 }, { x: 140.17500305175776, y: 385.4812583923338 }, { x: 140.17500305175776, y: 420.52500915527327 }, { x: 140.17500305175776, y: 420.52500915527327 }, { x: 175.2187538146972, y: 420.52500915527327 }, { x: 210.26250457763663, y: 420.52500915527327 }, { x: 245.30625534057606, y: 420.52500915527327 }, { x: 280.3500061035155, y: 420.52500915527327 }, { x: 315.39375686645496, y: 420.52500915527327 }, { x: 350.4375076293944, y: 420.52500915527327 }, { x: 385.4812583923338, y: 420.52500915527327 }, { x: 420.52500915527327, y: 420.52500915527327 }],
    },
    {
        name: "rectangle",
        points: [{ x: 420.52500915527327, y: 140.17500305175776 }, { x: 385.4812583923338, y: 140.17500305175776 }, { x: 350.4375076293944, y: 140.17500305175776 }, { x: 315.39375686645496, y: 140.17500305175776 }, { x: 280.3500061035155, y: 140.17500305175776 }, { x: 245.30625534057606, y: 140.17500305175776 }, { x: 210.26250457763663, y: 140.17500305175776 }, { x: 175.2187538146972, y: 140.17500305175776 }, { x: 140.17500305175776, y: 140.17500305175776 }, { x: 140.17500305175776, y: 140.17500305175776 }, { x: 140.17500305175776, y: 175.2187538146972 }, { x: 140.17500305175776, y: 210.26250457763663 }, { x: 140.17500305175776, y: 245.30625534057606 }, { x: 140.17500305175776, y: 280.3500061035155 }, { x: 140.17500305175776, y: 315.39375686645496 }, { x: 140.17500305175776, y: 350.4375076293944 }, { x: 140.17500305175776, y: 385.4812583923338 }, { x: 140.17500305175776, y: 420.52500915527327 }, { x: 140.17500305175776, y: 420.52500915527327 }, { x: 175.2187538146972, y: 420.52500915527327 }, { x: 210.26250457763663, y: 420.52500915527327 }, { x: 245.30625534057606, y: 420.52500915527327 }, { x: 280.3500061035155, y: 420.52500915527327 }, { x: 315.39375686645496, y: 420.52500915527327 }, { x: 350.4375076293944, y: 420.52500915527327 }, { x: 385.4812583923338, y: 420.52500915527327 }, { x: 420.52500915527327, y: 420.52500915527327 }, { x: 420.52500915527327, y: 420.52500915527327 }, { x: 420.52500915527327, y: 385.4812583923338 }, { x: 420.52500915527327, y: 350.4375076293944 }, { x: 420.52500915527327, y: 315.39375686645496 }, { x: 420.52500915527327, y: 280.3500061035155 }, { x: 420.52500915527327, y: 245.30625534057606 }, { x: 420.52500915527327, y: 210.26250457763663 }, { x: 420.52500915527327, y: 175.2187538146972 }, { x: 420.52500915527327, y: 140.17500305175776 }],
    },
    {
        name: "rectangle",
        points: [{ x: 140.17500305175776, y: 140.17500305175776 }, { x: 140.17500305175776, y: 175.2187538146972 }, { x: 140.17500305175776, y: 210.26250457763663 }, { x: 140.17500305175776, y: 245.30625534057606 }, { x: 140.17500305175776, y: 280.3500061035155 }, { x: 140.17500305175776, y: 315.39375686645496 }, { x: 140.17500305175776, y: 350.4375076293944 }, { x: 140.17500305175776, y: 385.4812583923338 }, { x: 140.17500305175776, y: 420.52500915527327 }, { x: 140.17500305175776, y: 420.52500915527327 }, { x: 175.2187538146972, y: 420.52500915527327 }, { x: 210.26250457763663, y: 420.52500915527327 }, { x: 245.30625534057606, y: 420.52500915527327 }, { x: 280.3500061035155, y: 420.52500915527327 }, { x: 315.39375686645496, y: 420.52500915527327 }, { x: 350.4375076293944, y: 420.52500915527327 }, { x: 385.4812583923338, y: 420.52500915527327 }, { x: 420.52500915527327, y: 420.52500915527327 }, { x: 420.52500915527327, y: 420.52500915527327 }, { x: 420.52500915527327, y: 385.4812583923338 }, { x: 420.52500915527327, y: 350.4375076293944 }, { x: 420.52500915527327, y: 315.39375686645496 }, { x: 420.52500915527327, y: 280.3500061035155 }, { x: 420.52500915527327, y: 245.30625534057606 }, { x: 420.52500915527327, y: 210.26250457763663 }, { x: 420.52500915527327, y: 175.2187538146972 }, { x: 420.52500915527327, y: 140.17500305175776 }, { x: 420.52500915527327, y: 140.17500305175776 }, { x: 385.4812583923338, y: 140.17500305175776 }, { x: 350.4375076293944, y: 140.17500305175776 }, { x: 315.39375686645496, y: 140.17500305175776 }, { x: 280.3500061035155, y: 140.17500305175776 }, { x: 245.30625534057606, y: 140.17500305175776 }, { x: 210.26250457763663, y: 140.17500305175776 }, { x: 175.2187538146972, y: 140.17500305175776 }, { x: 140.17500305175776, y: 140.17500305175776 }],
    },
    {
        name: "circle",
        points: [{ x: 420.52500915527327, y: 280.3500061035155 }, { x: 418.3954358873965, y: 304.69113993790967 }, { x: 412.07142208989444, y: 328.29268073795373 }, { x: 401.74511972189896, y: 350.43750762939436 }, { x: 387.73028825550034, y: 370.4527612529582 }, { x: 370.4527612529582, y: 387.73028825550034 }, { x: 350.4375076293944, y: 401.74511972189896 }, { x: 328.2926807379538, y: 412.07142208989444 }, { x: 304.69113993790967, y: 418.3954358873965 }, { x: 280.3500061035155, y: 420.52500915527327 }, { x: 256.0088722691214, y: 418.3954358873965 }, { x: 232.4073314690773, y: 412.07142208989444 }, { x: 210.26250457763666, y: 401.74511972189896 }, { x: 190.2472509540728, y: 387.73028825550034 }, { x: 172.9697239515307, y: 370.4527612529582 }, { x: 158.95489248513206, y: 350.43750762939436 }, { x: 148.62859011713658, y: 328.2926807379538 }, { x: 142.30457631963455, y: 304.6911399379096 }, { x: 140.17500305175776, y: 280.3500061035155 }, { x: 142.30457631963455, y: 256.00887226912135 }, { x: 148.62859011713655, y: 232.4073314690773 }, { x: 158.9548924851321, y: 210.2625045776366 }, { x: 172.96972395153068, y: 190.2472509540728 }, { x: 190.24725095407277, y: 172.9697239515307 }, { x: 210.26250457763658, y: 158.95489248513212 }, { x: 232.40733146907718, y: 148.62859011713658 }, { x: 256.00887226912135, y: 142.30457631963455 }, { x: 280.3500061035155, y: 140.17500305175776 }, { x: 304.6911399379096, y: 142.30457631963455 }, { x: 328.2926807379537, y: 148.62859011713653 }, { x: 350.4375076293944, y: 158.9548924851321 }, { x: 370.4527612529582, y: 172.96972395153068 }, { x: 387.73028825550034, y: 190.24725095407274 }, { x: 401.7451197218989, y: 210.26250457763658 }, { x: 412.07142208989444, y: 232.4073314690773 }, { x: 418.39543588739645, y: 256.00887226912124 }, { x: 420.52500915527327, y: 280.35000610351545 }],
    },
    {
        name: "circle",
        points: [{ x: 420.52500915527327, y: 280.3500061035155 }, { x: 418.3954358873965, y: 256.00887226912135 }, { x: 412.07142208989444, y: 232.4073314690773 }, { x: 401.74511972189896, y: 210.26250457763666 }, { x: 387.73028825550034, y: 190.2472509540728 }, { x: 370.4527612529582, y: 172.96972395153068 }, { x: 350.4375076293944, y: 158.9548924851321 }, { x: 328.2926807379538, y: 148.62859011713658 }, { x: 304.69113993790967, y: 142.30457631963455 }, { x: 280.3500061035155, y: 140.17500305175776 }, { x: 256.0088722691214, y: 142.30457631963455 }, { x: 232.4073314690773, y: 148.62859011713655 }, { x: 210.26250457763666, y: 158.95489248513206 }, { x: 190.2472509540728, y: 172.96972395153068 }, { x: 172.9697239515307, y: 190.24725095407277 }, { x: 158.95489248513206, y: 210.26250457763666 }, { x: 148.62859011713658, y: 232.40733146907723 }, { x: 142.30457631963455, y: 256.0088722691214 }, { x: 140.17500305175776, y: 280.3500061035155 }, { x: 142.30457631963455, y: 304.69113993790967 }, { x: 148.62859011713655, y: 328.29268073795373 }, { x: 158.9548924851321, y: 350.4375076293944 }, { x: 172.96972395153068, y: 370.4527612529582 }, { x: 190.24725095407277, y: 387.73028825550034 }, { x: 210.26250457763658, y: 401.7451197218989 }, { x: 232.40733146907718, y: 412.07142208989444 }, { x: 256.00887226912135, y: 418.3954358873965 }, { x: 280.3500061035155, y: 420.52500915527327 }, { x: 304.6911399379096, y: 418.3954358873965 }, { x: 328.2926807379537, y: 412.0714220898945 }, { x: 350.4375076293944, y: 401.74511972189896 }, { x: 370.4527612529582, y: 387.73028825550034 }, { x: 387.73028825550034, y: 370.4527612529583 }, { x: 401.7451197218989, y: 350.4375076293944 }, { x: 412.07142208989444, y: 328.29268073795373 }, { x: 418.39543588739645, y: 304.6911399379098 }, { x: 420.52500915527327, y: 280.35000610351557 }],
    },
    {
        name: "circle",
        points: [{ x: 140.17500305175776, y: 280.3500061035155 }, { x: 142.30457631963455, y: 256.00887226912135 }, { x: 148.62859011713655, y: 232.4073314690773 }, { x: 158.95489248513206, y: 210.26250457763666 }, { x: 172.96972395153068, y: 190.2472509540728 }, { x: 190.2472509540728, y: 172.96972395153068 }, { x: 210.2625045776366, y: 158.9548924851321 }, { x: 232.40733146907726, y: 148.62859011713658 }, { x: 256.00887226912135, y: 142.30457631963455 }, { x: 280.3500061035155, y: 140.17500305175776 }, { x: 304.6911399379096, y: 142.30457631963455 }, { x: 328.29268073795373, y: 148.62859011713655 }, { x: 350.43750762939436, y: 158.95489248513206 }, { x: 370.4527612529582, y: 172.96972395153068 }, { x: 387.73028825550034, y: 190.24725095407277 }, { x: 401.74511972189896, y: 210.26250457763666 }, { x: 412.07142208989444, y: 232.40733146907723 }, { x: 418.3954358873965, y: 256.0088722691214 }, { x: 420.52500915527327, y: 280.3500061035155 }, { x: 418.3954358873965, y: 304.69113993790967 }, { x: 412.07142208989444, y: 328.29268073795373 }, { x: 401.74511972189896, y: 350.4375076293944 }, { x: 387.73028825550034, y: 370.4527612529582 }, { x: 370.4527612529582, y: 387.73028825550034 }, { x: 350.4375076293944, y: 401.7451197218989 }, { x: 328.29268073795384, y: 412.07142208989444 }, { x: 304.69113993790967, y: 418.3954358873965 }, { x: 280.3500061035155, y: 420.52500915527327 }, { x: 256.0088722691214, y: 418.3954358873965 }, { x: 232.40733146907735, y: 412.0714220898945 }, { x: 210.2625045776366, y: 401.74511972189896 }, { x: 190.2472509540728, y: 387.73028825550034 }, { x: 172.9697239515307, y: 370.4527612529583 }, { x: 158.95489248513212, y: 350.4375076293944 }, { x: 148.62859011713655, y: 328.29268073795373 }, { x: 142.30457631963458, y: 304.6911399379098 }, { x: 140.17500305175776, y: 280.35000610351557 }],
    },
    {
        name: "circle",
        points: [{ x: 140.17500305175776, y: 280.3500061035155 }, { x: 142.30457631963455, y: 304.69113993790967 }, { x: 148.62859011713655, y: 328.29268073795373 }, { x: 158.95489248513206, y: 350.43750762939436 }, { x: 172.96972395153068, y: 370.4527612529582 }, { x: 190.2472509540728, y: 387.73028825550034 }, { x: 210.2625045776366, y: 401.74511972189896 }, { x: 232.40733146907726, y: 412.07142208989444 }, { x: 256.00887226912135, y: 418.3954358873965 }, { x: 280.3500061035155, y: 420.52500915527327 }, { x: 304.6911399379096, y: 418.3954358873965 }, { x: 328.29268073795373, y: 412.07142208989444 }, { x: 350.43750762939436, y: 401.74511972189896 }, { x: 370.4527612529582, y: 387.73028825550034 }, { x: 387.73028825550034, y: 370.4527612529582 }, { x: 401.74511972189896, y: 350.43750762939436 }, { x: 412.07142208989444, y: 328.2926807379538 }, { x: 418.3954358873965, y: 304.6911399379096 }, { x: 420.52500915527327, y: 280.3500061035155 }, { x: 418.3954358873965, y: 256.00887226912135 }, { x: 412.07142208989444, y: 232.4073314690773 }, { x: 401.74511972189896, y: 210.2625045776366 }, { x: 387.73028825550034, y: 190.2472509540728 }, { x: 370.4527612529582, y: 172.9697239515307 }, { x: 350.4375076293944, y: 158.95489248513212 }, { x: 328.29268073795384, y: 148.62859011713658 }, { x: 304.69113993790967, y: 142.30457631963455 }, { x: 280.3500061035155, y: 140.17500305175776 }, { x: 256.0088722691214, y: 142.30457631963455 }, { x: 232.40733146907735, y: 148.62859011713653 }, { x: 210.2625045776366, y: 158.9548924851321 }, { x: 190.2472509540728, y: 172.96972395153068 }, { x: 172.9697239515307, y: 190.24725095407274 }, { x: 158.95489248513212, y: 210.26250457763658 }, { x: 148.62859011713655, y: 232.4073314690773 }, { x: 142.30457631963458, y: 256.00887226912124 }, { x: 140.17500305175776, y: 280.35000610351545 }],
    },
    {
        name: "circle",
        points: [{ x: 280.3500061035155, y: 420.52500915527327 }, { x: 304.6911399379096, y: 418.3954358873965 }, { x: 328.29268073795373, y: 412.07142208989444 }, { x: 350.43750762939436, y: 401.74511972189896 }, { x: 370.4527612529582, y: 387.73028825550034 }, { x: 387.73028825550034, y: 370.4527612529582 }, { x: 401.74511972189896, y: 350.43750762939436 }, { x: 412.07142208989444, y: 328.2926807379538 }, { x: 418.3954358873965, y: 304.6911399379096 }, { x: 420.52500915527327, y: 280.3500061035155 }, { x: 418.3954358873965, y: 256.00887226912135 }, { x: 412.07142208989444, y: 232.4073314690773 }, { x: 401.74511972189896, y: 210.2625045776366 }, { x: 387.73028825550034, y: 190.2472509540728 }, { x: 370.4527612529582, y: 172.9697239515307 }, { x: 350.4375076293944, y: 158.95489248513212 }, { x: 328.29268073795384, y: 148.62859011713658 }, { x: 304.69113993790967, y: 142.30457631963455 }, { x: 280.3500061035155, y: 140.17500305175776 }, { x: 256.0088722691214, y: 142.30457631963455 }, { x: 232.40733146907735, y: 148.62859011713653 }, { x: 210.2625045776366, y: 158.9548924851321 }, { x: 190.2472509540728, y: 172.96972395153068 }, { x: 172.9697239515307, y: 190.24725095407274 }, { x: 158.95489248513212, y: 210.26250457763658 }, { x: 148.62859011713655, y: 232.4073314690773 }, { x: 142.30457631963458, y: 256.00887226912124 }, { x: 140.17500305175776, y: 280.35000610351545 }, { x: 142.30457631963455, y: 304.6911399379096 }, { x: 148.62859011713658, y: 328.2926807379538 }, { x: 158.954892485132, y: 350.4375076293943 }, { x: 172.96972395153068, y: 370.4527612529582 }, { x: 190.24725095407274, y: 387.7302882555003 }, { x: 210.26250457763666, y: 401.74511972189896 }, { x: 232.40733146907718, y: 412.07142208989444 }, { x: 256.00887226912135, y: 418.3954358873965 }, { x: 280.35000610351545, y: 420.52500915527327 }],
    },
    {
        name: "circle",
        points: [{ x: 280.3500061035155, y: 140.17500305175776 }, { x: 304.6911399379096, y: 142.30457631963455 }, { x: 328.29268073795373, y: 148.62859011713655 }, { x: 350.43750762939436, y: 158.95489248513206 }, { x: 370.4527612529582, y: 172.96972395153068 }, { x: 387.73028825550034, y: 190.24725095407277 }, { x: 401.74511972189896, y: 210.26250457763666 }, { x: 412.07142208989444, y: 232.40733146907723 }, { x: 418.3954358873965, y: 256.0088722691214 }, { x: 420.52500915527327, y: 280.3500061035155 }, { x: 418.3954358873965, y: 304.69113993790967 }, { x: 412.07142208989444, y: 328.29268073795373 }, { x: 401.74511972189896, y: 350.4375076293944 }, { x: 387.73028825550034, y: 370.4527612529582 }, { x: 370.4527612529582, y: 387.73028825550034 }, { x: 350.4375076293944, y: 401.7451197218989 }, { x: 328.29268073795384, y: 412.07142208989444 }, { x: 304.69113993790967, y: 418.3954358873965 }, { x: 280.3500061035155, y: 420.52500915527327 }, { x: 256.0088722691214, y: 418.3954358873965 }, { x: 232.40733146907735, y: 412.0714220898945 }, { x: 210.2625045776366, y: 401.74511972189896 }, { x: 190.2472509540728, y: 387.73028825550034 }, { x: 172.9697239515307, y: 370.4527612529583 }, { x: 158.95489248513212, y: 350.4375076293944 }, { x: 148.62859011713655, y: 328.29268073795373 }, { x: 142.30457631963458, y: 304.6911399379098 }, { x: 140.17500305175776, y: 280.35000610351557 }, { x: 142.30457631963455, y: 256.0088722691214 }, { x: 148.62859011713658, y: 232.40733146907723 }, { x: 158.954892485132, y: 210.26250457763672 }, { x: 172.96972395153068, y: 190.2472509540728 }, { x: 190.24725095407274, y: 172.96972395153074 }, { x: 210.26250457763666, y: 158.95489248513206 }, { x: 232.40733146907718, y: 148.6285901171366 }, { x: 256.00887226912135, y: 142.30457631963455 }, { x: 280.35000610351545, y: 140.17500305175776 }],
    },
    {
        name: "circle",
        points: [{ x: 280.3500061035155, y: 140.17500305175776 }, { x: 256.0088722691214, y: 142.30457631963455 }, { x: 232.4073314690773, y: 148.62859011713655 }, { x: 210.26250457763666, y: 158.95489248513206 }, { x: 190.2472509540728, y: 172.96972395153068 }, { x: 172.9697239515307, y: 190.24725095407277 }, { x: 158.95489248513206, y: 210.26250457763666 }, { x: 148.62859011713658, y: 232.40733146907723 }, { x: 142.30457631963455, y: 256.0088722691214 }, { x: 140.17500305175776, y: 280.3500061035155 }, { x: 142.30457631963455, y: 304.69113993790967 }, { x: 148.62859011713655, y: 328.29268073795373 }, { x: 158.9548924851321, y: 350.4375076293944 }, { x: 172.96972395153068, y: 370.4527612529582 }, { x: 190.24725095407277, y: 387.73028825550034 }, { x: 210.26250457763658, y: 401.7451197218989 }, { x: 232.40733146907718, y: 412.07142208989444 }, { x: 256.00887226912135, y: 418.3954358873965 }, { x: 280.3500061035155, y: 420.52500915527327 }, { x: 304.6911399379096, y: 418.3954358873965 }, { x: 328.2926807379537, y: 412.0714220898945 }, { x: 350.4375076293944, y: 401.74511972189896 }, { x: 370.4527612529582, y: 387.73028825550034 }, { x: 387.73028825550034, y: 370.4527612529583 }, { x: 401.7451197218989, y: 350.4375076293944 }, { x: 412.07142208989444, y: 328.29268073795373 }, { x: 418.39543588739645, y: 304.6911399379098 }, { x: 420.52500915527327, y: 280.35000610351557 }, { x: 418.3954358873965, y: 256.0088722691214 }, { x: 412.07142208989444, y: 232.40733146907723 }, { x: 401.745119721899, y: 210.26250457763672 }, { x: 387.73028825550034, y: 190.2472509540728 }, { x: 370.4527612529583, y: 172.96972395153074 }, { x: 350.43750762939436, y: 158.95489248513206 }, { x: 328.29268073795384, y: 148.6285901171366 }, { x: 304.69113993790967, y: 142.30457631963455 }, { x: 280.35000610351557, y: 140.17500305175776 }],
    },
    {
        name: "circle",
        points: [{ x: 280.3500061035155, y: 420.52500915527327 }, { x: 256.0088722691214, y: 418.3954358873965 }, { x: 232.4073314690773, y: 412.07142208989444 }, { x: 210.26250457763666, y: 401.74511972189896 }, { x: 190.2472509540728, y: 387.73028825550034 }, { x: 172.9697239515307, y: 370.4527612529582 }, { x: 158.95489248513206, y: 350.43750762939436 }, { x: 148.62859011713658, y: 328.2926807379538 }, { x: 142.30457631963455, y: 304.6911399379096 }, { x: 140.17500305175776, y: 280.3500061035155 }, { x: 142.30457631963455, y: 256.00887226912135 }, { x: 148.62859011713655, y: 232.4073314690773 }, { x: 158.9548924851321, y: 210.2625045776366 }, { x: 172.96972395153068, y: 190.2472509540728 }, { x: 190.24725095407277, y: 172.9697239515307 }, { x: 210.26250457763658, y: 158.95489248513212 }, { x: 232.40733146907718, y: 148.62859011713658 }, { x: 256.00887226912135, y: 142.30457631963455 }, { x: 280.3500061035155, y: 140.17500305175776 }, { x: 304.6911399379096, y: 142.30457631963455 }, { x: 328.2926807379537, y: 148.62859011713653 }, { x: 350.4375076293944, y: 158.9548924851321 }, { x: 370.4527612529582, y: 172.96972395153068 }, { x: 387.73028825550034, y: 190.24725095407274 }, { x: 401.7451197218989, y: 210.26250457763658 }, { x: 412.07142208989444, y: 232.4073314690773 }, { x: 418.39543588739645, y: 256.00887226912124 }, { x: 420.52500915527327, y: 280.35000610351545 }, { x: 418.3954358873965, y: 304.6911399379096 }, { x: 412.07142208989444, y: 328.2926807379538 }, { x: 401.745119721899, y: 350.4375076293943 }, { x: 387.73028825550034, y: 370.4527612529582 }, { x: 370.4527612529583, y: 387.7302882555003 }, { x: 350.43750762939436, y: 401.74511972189896 }, { x: 328.29268073795384, y: 412.07142208989444 }, { x: 304.69113993790967, y: 418.3954358873965 }, { x: 280.35000610351557, y: 420.52500915527327 }],
    },
];
const detector = new ShapeDetector(defaultShapes);
function recognizeShape(stroke) {
    return detector.spot(stroke);
}
exports.recognizeShape = recognizeShape;

},{"shape-detector":5}],24:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ui_1 = require("../../ui");
class Circle {
    constructor(center, radius) {
        this.center = center;
        this.radius = radius;
    }
    render(context2D, offset) {
        const x = this.center.x - offset.x;
        const y = this.center.y - offset.y;
        context2D.moveTo(x, y);
        context2D.arc(x, y, this.radius, 0, Math.PI * 2);
    }
    getBounds() {
        return new ui_1.Rectangle(this.center.x, this.center.y, this.radius, this.radius);
    }
}
exports.Circle = Circle;

},{"../../ui":41}],25:[function(require,module,exports){
"use strict";
function __export(m) {
    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
}
Object.defineProperty(exports, "__esModule", { value: true });
__export(require("./circle"));
__export(require("./polygon"));

},{"./circle":24,"./polygon":26}],26:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ui_1 = require("../../ui");
class Polygon {
    /**
     * Constructs a new polygon composed of the given points. The polygon
     * takes ownership of the passed in array of points.
     */
    constructor(points) {
        this.points = points;
        // TODO need to add an "empty" rectangle concept - until then 0, 0 is empty
        let minX = points.length > 0 ? points[0].x : 0;
        let minY = points.length > 0 ? points[0].y : 0;
        let maxX = minX;
        let maxY = minY;
        for (const point of points) {
            minX = Math.min(minX, point.x);
            maxX = Math.max(maxX, point.x);
            minY = Math.min(minY, point.y);
            maxY = Math.max(maxY, point.y);
        }
        this.bounds = new ui_1.Rectangle(minX, minY, maxX - minX, maxY - minY);
    }
    render(context, offset) {
        if (this.points.length === 0) {
            return;
        }
        // Move to the first point
        context.moveTo(this.points[0].x - offset.x, this.points[0].y - offset.y);
        // Draw the rest of the segments
        for (let i = 1; i < this.points.length; i++) {
            context.lineTo(this.points[i].x - offset.x, this.points[i].y - offset.y);
        }
        // And then close the shape
        context.lineTo(this.points[0].x - offset.x, this.points[0].y - offset.y);
    }
    getBounds() {
        return this.bounds;
    }
}
exports.Polygon = Polygon;

},{"../../ui":41}],27:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ui = require("../ui");
/**
 * Orientation of the stack panel
 */
var Orientation;
(function (Orientation) {
    Orientation[Orientation["Horizontal"] = 0] = "Horizontal";
    Orientation[Orientation["Vertical"] = 1] = "Vertical";
})(Orientation = exports.Orientation || (exports.Orientation = {}));
/**
 * Stack panel
 */
class StackPanel extends ui.Component {
    constructor(element, orientation, classList) {
        super(element);
        this.orientation = orientation;
        element.classList.add(...classList);
    }
    /**
     * Adds a new child to the stack
     */
    addChild(component) {
        super.addChild(component);
        this.element.appendChild(component.element);
    }
    /**
     * Returns a size whose height is capped to the max child height
     */
    measure(size) {
        let fixed = 0;
        let variable = 0;
        const children = this.getChildren();
        for (const child of children) {
            const measurement = child.measure(size);
            // Update the fixed and variable components depending on the orientation of the stack panel.
            // The algorithm selects the max value from the fixed orientation and then adds together the variable sizes
            fixed = Math.max(fixed, this.orientation === Orientation.Horizontal ? measurement.height : measurement.width);
            variable += this.orientation === Orientation.Horizontal ? measurement.width : measurement.height;
        }
        // Cap against the specified size
        return {
            height: Math.min(size.height, this.orientation === Orientation.Horizontal ? fixed : variable),
            width: Math.min(size.width, this.orientation === Orientation.Horizontal ? variable : fixed),
        };
    }
    resizeCore(bounds) {
        bounds = new ui.Rectangle(0, 0, bounds.width, bounds.height);
        // layout is very primitive right now... the below is tailored for a list of buttons
        const children = this.getChildren();
        let remainingBounds = bounds;
        for (const child of children) {
            const measurement = child.measure(remainingBounds.size);
            const updatedBounds = this.orientation === Orientation.Horizontal
                ? remainingBounds.nipHoriz(measurement.width)
                : remainingBounds.nipVert(measurement.height);
            updatedBounds[0].conformElement(child.element);
            child.resize(updatedBounds[0]);
            remainingBounds = updatedBounds[1];
        }
    }
}
exports.StackPanel = StackPanel;

},{"../ui":41}],28:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ui = require("../ui");
class Status extends ui.Component {
    constructor(element) {
        super(element);
        this.info = [];
        this.commands = [];
        this.element.classList.add("status-bar");
        this.element.style.backgroundColor = "#F1F1F1";
        // Insert options into toolbar
        this.listElement = document.createElement("ul");
    }
    add(key, msg, showKey = false) {
        let i = this.findKV(key);
        if (i < 0) {
            i = this.info.length;
            this.info.push({ key, msg, showKey });
        }
        else {
            this.info[i].msg = msg;
            this.info[i].showKey = showKey;
        }
        this.renderBar();
    }
    remove(key) {
        let i = this.findKV(key);
        if (i >= 0) {
            this.info.splice(i, 1);
        }
        this.renderBar();
    }
    addOption(event, text, value = undefined) {
        const element = document.createElement("li");
        this.listElement.appendChild(element);
        const input = document.createElement("input");
        input.type = "checkbox";
        input.onchange = (changeEvent) => {
            this.emit(event, input.checked);
        };
        input.defaultChecked = (value === undefined) ? false : value;
        const title = document.createTextNode(text);
        this.listElement.appendChild(input);
        this.listElement.appendChild(title);
        this.commands.push({ element, event, text });
    }
    /**
     * Adds a clickable button to the status bar does a form post on the action target
     */
    addButton(text, action, post) {
        const element = document.createElement("li");
        this.listElement.appendChild(element);
        if (post) {
            const form = document.createElement("form");
            form.classList.add("inline-form");
            form.action = action;
            form.method = "post";
            form.target = "_blank";
            element.appendChild(form);
            const button = document.createElement("input");
            button.classList.add("btn", "btn-default", "btn-xs");
            button.type = "submit";
            button.value = text;
            form.appendChild(button);
        }
        else {
            const button = document.createElement("a");
            button.classList.add("btn", "btn-default", "btn-xs");
            button.href = action;
            button.target = "_blank";
            button.innerText = text;
            element.appendChild(button);
        }
    }
    removeOption(event) {
        const index = this.commands.findIndex((value) => value.event === event);
        if (index !== -1) {
            const removed = this.commands.splice(index, 1);
            removed[0].element.remove();
        }
    }
    addSlider(sliderDiv) {
        this.sliderElement = sliderDiv;
        this.renderBar();
    }
    removeSlider() {
        this.sliderElement = undefined;
        this.renderBar();
    }
    renderBar() {
        let buf = "";
        let first = true;
        for (let kv of this.info) {
            buf += "<span>";
            if (!first) {
                if (kv.showKey) {
                    buf += ";  ";
                }
                else {
                    buf += " ";
                }
            }
            first = false;
            if (kv.showKey) {
                buf += `${kv.key}: ${kv.msg}`;
            }
            else {
                buf += `${kv.msg}`;
            }
            buf += "<\span>";
        }
        this.element.innerHTML = buf;
        // Add options
        this.element.appendChild(this.listElement);
        if (this.sliderElement) {
            this.element.appendChild(this.sliderElement);
        }
    }
    measure(size) {
        return { width: size.width, height: 30 };
    }
    findKV(key) {
        for (let i = 0, len = this.info.length; i < len; i++) {
            if (this.info[i].key === key) {
                return i;
            }
        }
        return -1;
    }
}
exports.Status = Status;

},{"../ui":41}],29:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ui = require("../ui");
class Title extends ui.Component {
    constructor(element) {
        super(element);
        this.viewportDiv = document.createElement("div");
        this.element.appendChild(this.viewportDiv);
        this.viewportDiv.classList.add("title-bar");
    }
    measure(size) {
        return { width: size.width, height: 40 };
    }
    setTitle(title) {
        this.viewportDiv.innerHTML = `<span style="font-size:20px;font-family:Book Antiqua">${title}</span>`;
    }
    setBackgroundColor(title) {
        const rgb = this.hexToRGB(this.intToHex(this.hashCode(title)));
        const gradient = `linear-gradient(to right, rgba(${rgb[0]},${rgb[1]},${rgb[2]},0),
                          rgba(${rgb[0]},${rgb[1]},${rgb[2]},1))`;
        this.element.style.background = gradient;
    }
    resizeCore(bounds) {
        this.viewportRect = bounds.inner(0.92);
        ui.Rectangle.conformElementToRect(this.viewportDiv, this.viewportRect);
    }
    // Implementation of java String#hashCode
    hashCode(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            /* tslint:disable:no-bitwise */
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        return hash;
    }
    // Integer to RGB color converter.
    intToHex(code) {
        /* tslint:disable:no-bitwise */
        let c = (code & 0x00FFFFFF).toString(16).toUpperCase();
        return "00000".substring(0, 6 - c.length) + c;
    }
    hexToRGB(hex) {
        if (hex.length === 3) {
            hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
        }
        let num = parseInt(hex, 16);
        return [num >> 16, num >> 8 & 255, num & 255];
    }
}
exports.Title = Title;

},{"../ui":41}],30:[function(require,module,exports){
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
const ui = require("../ui");
class VideoState {
    constructor(playing, elapsedTime, lastChangeUTC, vid) {
        this.playing = playing;
        this.elapsedTime = elapsedTime;
        this.lastChangeUTC = lastChangeUTC;
        this.vid = vid;
    }
}
/**
 * Basic collaborative youtube video player
 */
class YouTubeVideo extends ui.Component {
    constructor(element, videoPlayer, videoRoot) {
        super(element);
        this.videoPlayer = videoPlayer;
        this.videoRoot = videoRoot;
        this.setEventHandlers();
    }
    setEventHandlers() {
        return __awaiter(this, void 0, void 0, function* () {
            this.videoMap = yield this.videoRoot;
            this.videoMapView = yield this.videoMap.getView();
            this.setVideoPlayerHandlers();
            this.setVideoMapHandlers();
        });
    }
    setVideoPlayerHandlers() {
        return __awaiter(this, void 0, void 0, function* () {
            this.videoPlayer.addEventListener("onReady", (x) => {
                let incomingState = JSON.parse(this.videoMapView.get("state"));
                // This is a hack... play is getting auto triggered
                this.handleState(incomingState);
                setTimeout(() => this.pauseVideo(incomingState), 500);
            });
            this.videoPlayer.addEventListener("onStateChange", (state) => {
                let stateChange = state;
                let localState = this.getState();
                switch (stateChange.data) {
                    case (YT.PlayerState.UNSTARTED):// -1
                        break;
                    case (YT.PlayerState.CUED):// 5
                        break;
                    case (YT.PlayerState.BUFFERING):// 3
                        break;
                    case (YT.PlayerState.PAUSED):// 2
                        // Buffer Event
                        let incomingState = JSON.parse(this.videoMapView.get("state"));
                        if (Math.abs(localState.elapsedTime
                            - this.getElapsedTime(incomingState)) > 2 && incomingState.playing) {
                            this.videoPlayer.playVideo();
                        }
                        else {
                            this.updateState();
                        }
                        break;
                    case (YT.PlayerState.PLAYING):// 1
                        this.updateState();
                        break;
                    default:
                        console.log(stateChange);
                }
            });
        });
    }
    setVideoMapHandlers() {
        return __awaiter(this, void 0, void 0, function* () {
            this.videoMap.on("valueChanged", (changedValue) => {
                switch (changedValue.key) {
                    case ("state"):
                        this.handleState(JSON.parse(this.videoMapView.get(changedValue.key)));
                        break;
                    default:
                        console.log("default: " + changedValue.key);
                        break;
                }
            });
        });
    }
    getState() {
        let playing = (this.videoPlayer.getPlayerState() === YT.PlayerState.PLAYING);
        return new VideoState(playing, this.videoPlayer.getCurrentTime(), Date.now(), null);
    }
    pauseVideo(incomingState) {
        if (!incomingState.playing) {
            this.videoPlayer.pauseVideo();
        }
    }
    updateState() {
        this.videoMapView.set("state", JSON.stringify(this.getState()));
    }
    // Replicate the incoming state
    handleState(incomingState) {
        let localState = this.getState();
        if (!incomingState.playing) {
            this.videoPlayer.pauseVideo();
            this.videoPlayer.seekTo(incomingState.elapsedTime, true);
        }
        else {
            // elapsed time + the difference current and when "incoming" was recorded
            let elapsedTime = this.getElapsedTime(incomingState);
            if (Math.abs(elapsedTime - localState.elapsedTime) > 1) {
                this.videoPlayer.seekTo(elapsedTime, true);
            }
            this.videoPlayer.playVideo();
        }
    }
    getElapsedTime(incomingState) {
        let elapsedTime = 0;
        if (Math.abs(incomingState.lastChangeUTC - Date.now()) < this.videoPlayer.getDuration() * 1000) {
            elapsedTime = incomingState.elapsedTime + Date.now() / 1000 - incomingState.lastChangeUTC / 1000;
        }
        else {
            elapsedTime = incomingState.elapsedTime;
        }
        return elapsedTime;
    }
}
exports.YouTubeVideo = YouTubeVideo;

},{"../ui":41}],31:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ui = require("../ui");
const youtubeVideo_1 = require("./youtubeVideo");
/**
 * youtube video app
 */
class YouTubeVideoCanvas extends ui.Component {
    constructor(elem, doc, root) {
        super(elem);
        this.elem = elem;
        this.player = null;
        window.onYouTubeIframeAPIReady = () => { this.onYouTubeIframeAPIReady(); };
        // this.elem = element;
        this.elem.addEventListener("YouTube-Loaded", (e) => {
            const video = new youtubeVideo_1.YouTubeVideo(document.createElement("div"), this.player, this.fetchVideoRoot(root, doc));
            this.addChild(video);
        });
        const playerDiv = document.createElement("div");
        playerDiv.id = "player";
        elem.appendChild(playerDiv);
        let tag = document.createElement("script");
        tag.src = "https://www.youtube.com/iframe_api";
        elem.appendChild(tag);
    }
    onYouTubeIframeAPIReady() {
        let player = new YT.Player("player", {
            height: 390,
            playerVars: {
                autoplay: 0 /* NoAutoPlay */,
                start: 0,
            },
            videoId: this.youtubeIdParser("https://www.youtube.com/watch?v=-Of_yz-4iXs"),
            width: 640,
        });
        this.player = player;
        this.elem.dispatchEvent(new Event("YouTube-Loaded"));
    }
    // TODO: Consider replacing this with "oembed"
    youtubeIdParser(url) {
        let regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#\&\?]*).*/;
        let match = url.match(regExp);
        return (match && match[7].length === 11) ? match[7] : null;
    }
    fetchVideoRoot(root, doc) {
        // TODO: Make sure the root.get promise works...
        root.has("youTubeVideo").then((hasVideo) => {
            if (!hasVideo) {
                root.set("youTubeVideo", doc.createMap());
            }
        });
        return root.get("youTubeVideo");
    }
}
exports.YouTubeVideoCanvas = YouTubeVideoCanvas;

},{"../ui":41,"./youtubeVideo":30}],32:[function(require,module,exports){
"use strict";
function __export(m) {
    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
}
Object.defineProperty(exports, "__esModule", { value: true });
__export(require("./random"));

},{"./random":33}],33:[function(require,module,exports){
(function (global){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const random = require("random-js");
const client_api_1 = (typeof window !== "undefined" ? window['prague'] : typeof global !== "undefined" ? global['prague'] : null);
let mt = random.engines.mt19937();
mt.seedWithArray([0xdeadbeef, 0xfeedbed]);
function findRandomWord(mergeTree, clientId) {
    let len = mergeTree.getLength(client_api_1.MergeTree.UniversalSequenceNumber, clientId);
    let pos = random.integer(0, len)(mt);
    // let textAtPos = mergeTree.getText(MergeTree.UniversalSequenceNumber, clientId, pos, pos + 10);
    // console.log(textAtPos);
    let nextWord = mergeTree.searchFromPos(pos, /\s\w+\b/);
    if (nextWord) {
        nextWord.pos += pos;
        // console.log(`next word is '${nextWord.text}' len ${nextWord.text.length} at pos ${nextWord.pos}`);
    }
    return nextWord;
}
exports.findRandomWord = findRandomWord;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"random-js":4}],34:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ui = require("../ui");
const debug_1 = require("./debug");
// The majority of this can likely be abstracted behind interfaces - drawing inspiration from other
// UI frameworks. For now we keep it simple and have this class manage the lifetime of the UI framework.
/**
 * Hosts a UI container within the browser
 */
class BrowserContainerHost {
    constructor() {
        this.root = null;
    }
    attach(root) {
        debug_1.debug("Attaching new component to browser host");
        // Make note of the root node
        if (this.root) {
            throw new Error("A component has already been attached");
        }
        this.root = root;
        // Listen for resize messages and propagate them to child elements
        window.addEventListener("resize", () => {
            debug_1.debug("resize");
            this.resize();
        });
        // Throttle the resizes?
        // Input event handling
        document.body.onkeydown = (e) => {
            this.root.emit("keydown", e);
        };
        document.body.onkeypress = (e) => {
            this.root.emit("keypress", e);
        };
        ui.removeAllChildren(document.body);
        document.body.appendChild(root.element);
        // Trigger initial resize due to attach
        this.resize();
    }
    resize() {
        const clientRect = document.body.getBoundingClientRect();
        const newSize = ui.Rectangle.fromClientRect(clientRect);
        newSize.conformElement(this.root.element);
        this.root.resize(newSize);
    }
}
exports.BrowserContainerHost = BrowserContainerHost;
// export default class BackBoard extends ui.Component {
//     public myNameIs: string = "BackBoard Instance";
//     public pointerId: number = -1;
//     private gesture: MSGesture;
//     constructor(element: HTMLDivElement, private appObject: Canvas, htmlId: string) {
//       super(element);
//       // tslint:disable-next-line:no-string-literal
//       this.element["sysObject"] = this;
//       // tslint:disable-next-line:no-string-literal
//       if (window["MSGesture"]) {
//         this.gesture = new MSGesture();
//         this.gesture.target = this.element;
//         this.element.addEventListener("MSGestureChange", (evt) => this.gestureListener(evt), false);
//         this.element.addEventListener("MSGestureTap", (evt) => this.gestureListener(evt), false);
//       }
//       this.element.addEventListener("pointerdown", (evt) => this.eventListener(evt), false);
//     }
//     public eventListener(evt) {
//       // tslint:disable-next-line:no-string-literal
//       let so = this["sysObject"];
//       if (so === undefined) {
//         // how did we get here?
//         // some bubbeling?
//       } else {
//         // so.pointerId = evt.pointerId;
//         if (evt.type === "pointerdown") {
//           if (so.gesture) {
//             so.gesture.addPointer(evt.pointerId);
//           }
//         }
//       }
//     }
//     public gestureListener(evt) {
//       if (evt.type === "MSGestureTap") {
//         // Unselect everything that is selected
//         this.appObject.unselectAll();
//         let t = evt.gestureObject.target;
//         if (t !== undefined && t !== null) {
//           // hide the sheet of glass everything is under
//           // it is a div that is the canvas
//           ui.makeElementVisible(t, false);
//           // try if to get an element from the point
//           let elem = <HTMLElement> document.elementFromPoint(evt.clientX, evt.clientY);
//           // should we check if this thing is selectable ???
//           if (elem.classList.contains("selectable")) {
//             // set the selected style on it
//             elem.classList.add("stickySelected");
//             // put it above the glass
//             elem.style.zIndex = "10";
//           }
//           // make the canvas visible again
//           ui.makeElementVisible(t, true);
//           evt.stopPropagation();
//         }
//       }
//     }
//   }

},{"../ui":41,"./debug":36}],35:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const events_1 = require("events");
const geometry_1 = require("./geometry");
// Composition or inheritence for the below?
class Component {
    constructor(element) {
        this.element = element;
        this.size = new geometry_1.Rectangle(0, 0, 0, 0);
        this.events = new events_1.EventEmitter();
        this.children = [];
    }
    on(event, listener) {
        this.events.on(event, listener);
        return this;
    }
    emit(event, ...args) {
        this.events.emit(event, ...args);
        for (const child of this.children) {
            child.emit(event, ...args);
        }
    }
    getChildren() {
        // Probably will want a way to avoid providing direct access to the underlying array
        return this.children;
    }
    /**
     * Allows the element to provide a desired size relative to the rectangle provided. By default returns
     * the provided size.
     */
    measure(size) {
        return size;
    }
    resize(rectangle) {
        this.size = rectangle;
        this.resizeCore(rectangle);
        this.events.emit("resize", rectangle);
    }
    // For the child management functions we may want to just make the dervied class do this. Could help them
    // provide better context on their tracked nodes.
    addChild(component, index = -1) {
        if (index === -1) {
            this.children.push(component);
        }
        else {
            this.children.splice(index, 0, component);
        }
    }
    removeChild(component) {
        const index = this.children.lastIndexOf(component);
        if (index !== -1) {
            this.children.splice(index, 1);
        }
    }
    removeAllChildren() {
        this.children = [];
    }
    /**
     * Allows derived class to do custom processing based on the resize
     */
    resizeCore(rectangle) {
        return;
    }
}
exports.Component = Component;

},{"./geometry":37,"events":1}],36:[function(require,module,exports){
(function (global){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_api_1 = (typeof window !== "undefined" ? window['prague'] : typeof global !== "undefined" ? global['prague'] : null);
exports.debug = client_api_1.debug("routerlicious:ui");

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{}],37:[function(require,module,exports){
"use strict";
function __export(m) {
    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
}
Object.defineProperty(exports, "__esModule", { value: true });
__export(require("./point"));
__export(require("./rectangle"));
__export(require("./vector"));

},{"./point":38,"./rectangle":39,"./vector":40}],38:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function distanceSquared(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
}
exports.distanceSquared = distanceSquared;
class Point {
    // Constructor
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }
}
exports.Point = Point;

},{}],39:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class Rectangle {
    constructor(x, y, width, height) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
    }
    static fromClientRect(cr) {
        return new Rectangle(cr.left, cr.top, cr.width, cr.height);
    }
    static conformElementToRect(elm, rect) {
        rect.conformElement(elm);
        return elm;
    }
    /**
     * Size of the rectangle
     */
    get size() {
        return { width: this.width, height: this.height };
    }
    square() {
        let len = this.width;
        let adj = 0;
        if (len > this.height) {
            len = this.height;
            adj = (this.width - len) / 2;
            return new Square(this.x + adj, this.y, len);
        }
        else {
            adj = (this.height - len) / 2;
            return new Square(this.x, this.y + adj, len);
        }
    }
    union(other) {
        let minX = Math.min(this.x, other.x);
        let minY = Math.min(this.y, other.y);
        let maxX = Math.max(this.x + this.width, other.x + other.width);
        let maxY = Math.max(this.y + this.height, other.y + other.height);
        return new Rectangle(minX, minY, maxX - minX, maxY - minY);
    }
    contains(other) {
        return other.x >= this.x &&
            (other.x + other.width <= this.x + this.width) &&
            other.y >= this.y &&
            (other.y + other.height <= this.y + this.height);
    }
    nipVert(pixels) {
        return [
            new Rectangle(this.x, this.y, this.width, pixels),
            new Rectangle(this.x, this.y + pixels, this.width, this.height - pixels),
        ];
    }
    nipVertBottom(pixels) {
        return [
            new Rectangle(this.x, this.y, this.width, this.height - pixels),
            new Rectangle(this.x, this.y + (this.height - pixels), this.width, pixels),
        ];
    }
    nipVertTopBottom(topPixels, bottomPixels) {
        return [
            new Rectangle(this.x, this.y, this.width, topPixels),
            new Rectangle(this.x, this.y + topPixels, this.width, this.height - topPixels - bottomPixels),
            new Rectangle(this.x, this.y + (this.height - bottomPixels), this.width, bottomPixels),
        ];
    }
    nipHoriz(pixels) {
        return [
            new Rectangle(this.x, this.y, pixels, this.height),
            new Rectangle(this.x + pixels, this.y, this.width - pixels, this.height),
        ];
    }
    nipHorizRight(pixels) {
        return [
            new Rectangle(this.x, this.y, this.width - pixels, this.height),
            new Rectangle(this.x + (this.width - pixels), this.y, pixels, this.height),
        ];
    }
    conformElementMaxHeight(elm) {
        elm.style.position = "absolute";
        elm.style.left = this.x + "px";
        elm.style.width = this.width + "px";
        elm.style.top = this.y + "px";
        elm.style.maxHeight = this.height + "px";
    }
    conformElementMaxHeightFromBottom(elm, bottom) {
        elm.style.position = "absolute";
        elm.style.left = this.x + "px";
        elm.style.width = this.width + "px";
        elm.style.bottom = bottom + "px";
        elm.style.maxHeight = this.height + "px";
    }
    conformElementOpenHeight(elm) {
        elm.style.position = "absolute";
        elm.style.left = this.x + "px";
        elm.style.width = this.width + "px";
        elm.style.top = this.y + "px";
    }
    conformElement(elm) {
        elm.style.position = "absolute";
        elm.style.left = `${this.x}px`;
        elm.style.top = `${this.y}px`;
        elm.style.width = `${this.width}px`;
        elm.style.height = `${this.height}px`;
        return elm;
    }
    inner4(xfactor, yfactor, widthFactor, heightFactor) {
        let ix = this.x + Math.round(xfactor * this.width);
        let iy = this.y + Math.round(yfactor * this.height);
        let iw = Math.floor(this.width * widthFactor);
        let ih = Math.floor(this.height * heightFactor);
        return (new Rectangle(ix, iy, iw, ih));
    }
    inner(factor) {
        let iw = Math.round(factor * this.width);
        let ih = Math.round(factor * this.height);
        let ix = this.x + Math.floor((this.width - iw) / 2);
        let iy = this.y + Math.floor((this.height - ih) / 2);
        return (new Rectangle(ix, iy, iw, ih));
    }
    innerAbs(pixels) {
        let iw = this.width - (2 * pixels);
        let ih = this.height - (2 * pixels);
        let ix = this.x + pixels;
        let iy = this.y + pixels;
        return (new Rectangle(ix, iy, iw, ih));
    }
    proportionalSplitHoriz(...proportionalWidths) {
        let totalPropWidth = 0;
        let i;
        for (i = 0; i < proportionalWidths.length; i++) {
            totalPropWidth += proportionalWidths[i];
        }
        let totalWidth = 0;
        let widths = [];
        for (i = 0; i < proportionalWidths.length; i++) {
            widths[i] = (proportionalWidths[i] / totalPropWidth) * this.width;
            totalWidth += widths[i];
        }
        let extraWidth = this.width - totalWidth;
        /* Add back round-off error equally to all rectangles */
        i = 0;
        while (extraWidth > 0) {
            widths[i]++;
            extraWidth--;
            if ((++i) === widths.length) {
                i = 0;
            }
        }
        let rects = [];
        let curX = this.x;
        for (i = 0; i < widths.length; i++) {
            rects[i] = new Rectangle(curX, this.y, widths[i], this.height);
            curX += widths[i];
        }
        return rects;
    }
    proportionalSplitVert(...proportionalHeights) {
        let totalPropHeight = 0;
        let i;
        for (i = 0; i < proportionalHeights.length; i++) {
            totalPropHeight += proportionalHeights[i];
        }
        let totalHeight = 0;
        let heights = [];
        for (i = 0; i < proportionalHeights.length; i++) {
            heights[i] = (proportionalHeights[i] / totalPropHeight) * this.height;
            totalHeight += heights[i];
        }
        let extraHeight = this.height - totalHeight;
        /* Add back round-off error equally to all rectangles */
        i = 0;
        while (extraHeight > 0) {
            heights[i]++;
            extraHeight--;
            if ((++i) === heights.length) {
                i = 0;
            }
        }
        let rects = [];
        let curY = this.y;
        for (i = 0; i < heights.length; i++) {
            rects[i] = new Rectangle(this.x, curY, this.width, heights[i]);
            curY += heights[i];
        }
        return rects;
    }
    within(x, y) {
        return (this.x <= x) && (this.y <= y) && ((this.x + this.width) >= x) && ((this.y + this.height) >= y);
    }
    subDivideHorizAbs(width) {
        let n = Math.ceil(this.width / width);
        return this.subDivideHoriz(n);
    }
    subDivideHoriz(n) {
        let rects = [];
        let tileWidth = this.width / n;
        let rem = this.width % n;
        let tileX = this.x;
        for (let i = 0; i < n; i++) {
            rects[i] = new Rectangle(tileX, this.y, tileWidth, this.height);
            if (rem > 0) {
                rects[i].width++;
                rem--;
            }
            tileX += rects[i].width;
        }
        return rects;
    }
    subDivideVertAbs(height, peanutButter = true) {
        let n = Math.ceil(this.height / height);
        return this.subDivideVert(n, peanutButter);
    }
    subDivideVertAbsEnclosed(height, peanutButter = true) {
        let n = Math.ceil(this.height / height);
        return this.subDivideVertEnclosed(n, peanutButter);
    }
    subDivideVertEnclosed(n, peanutButter = true) {
        let rects = [];
        let tileHeight = Math.floor(this.height / n);
        let rem = this.height % n;
        let tileY = 0;
        for (let i = 0; i < n; i++) {
            rects[i] = new Rectangle(0, tileY, this.width, tileHeight);
            if (peanutButter && (rem > 0)) {
                rects[i].height++;
                rem--;
            }
            tileY += rects[i].height;
        }
        return rects;
    }
    subDivideVert(n, peanutButter = true) {
        let rects = [];
        let tileHeight = Math.floor(this.height / n);
        let rem = this.height % n;
        let tileY = this.y;
        for (let i = 0; i < n; i++) {
            rects[i] = new Rectangle(this.x, tileY, this.width, tileHeight);
            if (peanutButter && (rem > 0)) {
                rects[i].height++;
                rem--;
            }
            tileY += rects[i].height;
        }
        return rects;
    }
}
exports.Rectangle = Rectangle;
class Square extends Rectangle {
    constructor(x, y, len) {
        super(x, y, len, len);
        this.len = len;
    }
}
exports.Square = Square;

},{}],40:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class Vector {
    // Constructor
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }
    /**
     * Returns the vector resulting from rotating vector by angle
     */
    static rotate(vector, angle) {
        return new Vector(vector.x * Math.cos(angle) - vector.y * Math.sin(angle), vector.x * Math.sin(angle) + vector.y * Math.cos(angle));
    }
    /**
     * Returns the normalized form of the given vector
     */
    static normalize(vector) {
        let length = vector.length();
        return new Vector(vector.x / length, vector.y / length);
    }
    length() {
        return Math.sqrt(this.x * this.x + this.y * this.y);
    }
}
exports.Vector = Vector;

},{}],41:[function(require,module,exports){
"use strict";
function __export(m) {
    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
}
Object.defineProperty(exports, "__esModule", { value: true });
__export(require("./browserContainerHost"));
__export(require("./component"));
__export(require("./geometry"));
__export(require("./utils"));

},{"./browserContainerHost":34,"./component":35,"./geometry":37,"./utils":42}],42:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// Utility to fetch elements by ID
function id(elementId) {
    return (document.getElementById(elementId));
}
exports.id = id;
function makeElementVisible(elem, visible) {
    elem.style.display = visible ? "block" : "none";
}
exports.makeElementVisible = makeElementVisible;
// Convenience function used by color converters.
function byteHex(num) {
    let hex = num.toString(16);
    if (hex.length === 1) {
        hex = "0" + hex;
    }
    return hex;
}
exports.byteHex = byteHex;
function toColorStringNoAlpha(color) {
    return "#" + byteHex(color.r * 255) + byteHex(color.g * 255) + byteHex(color.b * 255);
}
exports.toColorStringNoAlpha = toColorStringNoAlpha;
/**
 * Converts an RGB component in the range [0,1] to [0,255]
 */
function toRGBInteger(value) {
    return Math.round(value * 255);
}
/**
 * Converts the provided color to a rgba CSS color string
 */
function toColorString(color) {
    const r = toRGBInteger(color.r);
    const g = toRGBInteger(color.g);
    const b = toRGBInteger(color.b);
    return `rgba(${r}, ${g}, ${b}, ${color.a})`;
}
exports.toColorString = toColorString;
// Helper function to support HTML hexColor Strings
function hexStrToRGBA(hexStr) {
    // RGBA color object
    let colorObject = { r: 1, g: 1, b: 1, a: 1 };
    // remove hash if it exists
    hexStr = hexStr.replace("#", "");
    if (hexStr.length === 6) {
        // No Alpha
        colorObject.r = parseInt(hexStr.slice(0, 2), 16) / 255;
        colorObject.g = parseInt(hexStr.slice(2, 4), 16) / 255;
        colorObject.b = parseInt(hexStr.slice(4, 6), 16) / 255;
        colorObject.a = parseInt("0xFF", 16) / 255;
    }
    else if (hexStr.length === 8) {
        // Alpha
        colorObject.r = parseInt(hexStr.slice(0, 2), 16) / 255;
        colorObject.g = parseInt(hexStr.slice(2, 4), 16) / 255;
        colorObject.b = parseInt(hexStr.slice(4, 6), 16) / 255;
        colorObject.a = parseInt(hexStr.slice(6, 8), 16) / 255;
    }
    else if (hexStr.length === 3) {
        // Shorthand hex color
        let rVal = hexStr.slice(0, 1);
        let gVal = hexStr.slice(1, 2);
        let bVal = hexStr.slice(2, 3);
        colorObject.r = parseInt(rVal + rVal, 16) / 255;
        colorObject.g = parseInt(gVal + gVal, 16) / 255;
        colorObject.b = parseInt(bVal + bVal, 16) / 255;
    }
    else {
        throw new Error("Invalid HexString length. Expected either 8, 6, or 3. The actual length was " + hexStr.length);
    }
    return colorObject;
}
exports.hexStrToRGBA = hexStrToRGBA;
// Convert from the few color names used in this app to Windows.UI.Input.Inking"s color code.
// If it isn"t one of those, then decode the hex string.  Otherwise return gray.
// The alpha component is always set to full (255).
function toColorStruct(color) {
    switch (color) {
        // Ink colors
        case "Black": return { r: 0x00, g: 0x00, b: 0x00, a: 0xff };
        case "Blue": return { r: 0x00, g: 0x00, b: 0xff, a: 0xff };
        case "Red": return { r: 0xff, g: 0x00, b: 0x00, a: 0xff };
        case "Green": return { r: 0x00, g: 0xff, b: 0x00, a: 0xff };
        // Highlighting colors
        case "Yellow": return { r: 0xff, g: 0xff, b: 0x00, a: 0xff };
        case "Aqua": return { r: 0x66, g: 0xcd, b: 0xaa, a: 0xff };
        case "Lime": return { r: 0x00, g: 0xff, b: 0x00, a: 0xff };
        // Select colors
        case "Gold": return { r: 0xff, g: 0xd7, b: 0x00, a: 0xff };
        case "White": return { r: 0xff, g: 0xff, b: 0xff, a: 0xff };
        default:
            return hexStrToRGBA(color);
    }
}
exports.toColorStruct = toColorStruct;
// ----------------------------------------------------------------------
// URL/Path parsing stuff
// ----------------------------------------------------------------------
function breakFilePath(path) {
    let m = path.match(/(.*)[\/\\]([^\/\\]+)\.(\w+)/);
    if (m) {
        return { source: m[0], path: m[1], filename: m[2], ext: m[3] };
    }
    else {
        return { source: m[0], path: "", filename: "", ext: "" };
    }
}
exports.breakFilePath = breakFilePath;
function parseURL(url) {
    let a = document.createElement("a");
    a.href = url;
    let parts = breakFilePath(a.pathname);
    return {
        ext: parts.ext,
        file: parts.filename,
        hash: a.hash.replace("#", ""),
        host: a.hostname,
        params: () => {
            let ret = {};
            let seg = a.search.replace(/^\?/, "").split("&");
            let len = seg.length;
            let i = 0;
            let s;
            for (; i < len; i++) {
                if (!seg[i]) {
                    continue;
                }
                s = seg[i].split("=");
                ret[s[0]] = s[1];
            }
            return ret;
        },
        path: parts.path,
        port: a.port,
        protocol: a.protocol.replace(":", ""),
        query: a.search,
        segments: parts.path.replace(/^\//, "").split("/"),
        source: url,
    };
}
exports.parseURL = parseURL;
// Following recomendations of https://developer.mozilla.org/en-US/docs/Web/Events/resize to
// throttle computationally expensive events
function throttle(type, name, obj) {
    obj = obj || window;
    let running = false;
    obj.addEventListener(type, () => {
        if (running) {
            return;
        }
        running = true;
        requestAnimationFrame(() => {
            obj.dispatchEvent(new CustomEvent(name));
            running = false;
        });
    });
}
exports.throttle = throttle;
;
/**
 * Helper class that throttles calling the provided callback based on
 * an animation frame timer
 */
class AnimationFrameThrottler {
    constructor(callback) {
        this.callback = callback;
        this.running = false;
    }
    trigger() {
        if (this.running) {
            return;
        }
        this.running = true;
        requestAnimationFrame(() => {
            this.callback();
            this.running = false;
        });
    }
}
exports.AnimationFrameThrottler = AnimationFrameThrottler;
function removeAllChildren(element) {
    // Remove any existing children and attach ourselves
    while (element.hasChildNodes()) {
        element.removeChild(element.lastChild);
    }
}
exports.removeAllChildren = removeAllChildren;

},{}]},{},[6])(6)
});
//# sourceMappingURL=ui.js.map
