"use strict";

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

(function (f) {
    if ((typeof exports === "undefined" ? "undefined" : _typeof(exports)) === "object" && typeof module !== "undefined") {
        module.exports = f();
    } else if (typeof define === "function" && define.amd) {
        define([], f);
    } else {
        var g;if (typeof window !== "undefined") {
            g = window;
        } else if (typeof global !== "undefined") {
            g = global;
        } else if (typeof self !== "undefined") {
            g = self;
        } else {
            g = this;
        }g.pragueUi = f();
    }
})(function () {
    var define, module, exports;return function e(t, n, r) {
        function s(o, u) {
            if (!n[o]) {
                if (!t[o]) {
                    var a = typeof require == "function" && require;if (!u && a) return a(o, !0);if (i) return i(o, !0);var f = new Error("Cannot find module '" + o + "'");throw f.code = "MODULE_NOT_FOUND", f;
                }var l = n[o] = { exports: {} };t[o][0].call(l.exports, function (e) {
                    var n = t[o][1][e];return s(n ? n : e);
                }, l, l.exports, e, t, n, r);
            }return n[o].exports;
        }var i = typeof require == "function" && require;for (var o = 0; o < r.length; o++) {
            s(r[o]);
        }return s;
    }({ 1: [function (require, module, exports) {
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
            EventEmitter.prototype.setMaxListeners = function (n) {
                if (!isNumber(n) || n < 0 || isNaN(n)) throw TypeError('n must be a positive number');
                this._maxListeners = n;
                return this;
            };

            EventEmitter.prototype.emit = function (type) {
                var er, handler, len, args, i, listeners;

                if (!this._events) this._events = {};

                // If there is no 'error' event listener then throw.
                if (type === 'error') {
                    if (!this._events.error || isObject(this._events.error) && !this._events.error.length) {
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

                if (isUndefined(handler)) return false;

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
                    for (i = 0; i < len; i++) {
                        listeners[i].apply(this, args);
                    }
                }

                return true;
            };

            EventEmitter.prototype.addListener = function (type, listener) {
                var m;

                if (!isFunction(listener)) throw TypeError('listener must be a function');

                if (!this._events) this._events = {};

                // To avoid recursion in the case that type === "newListener"! Before
                // adding it to the listeners, first emit "newListener".
                if (this._events.newListener) this.emit('newListener', type, isFunction(listener.listener) ? listener.listener : listener);

                if (!this._events[type])
                    // Optimize the case of one listener. Don't need the extra array object.
                    this._events[type] = listener;else if (isObject(this._events[type]))
                    // If we've already got an array, just append.
                    this._events[type].push(listener);else
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
                        console.error('(node) warning: possible EventEmitter memory ' + 'leak detected. %d listeners added. ' + 'Use emitter.setMaxListeners() to increase limit.', this._events[type].length);
                        if (typeof console.trace === 'function') {
                            // not supported in IE 10
                            console.trace();
                        }
                    }
                }

                return this;
            };

            EventEmitter.prototype.on = EventEmitter.prototype.addListener;

            EventEmitter.prototype.once = function (type, listener) {
                if (!isFunction(listener)) throw TypeError('listener must be a function');

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
            EventEmitter.prototype.removeListener = function (type, listener) {
                var list, position, length, i;

                if (!isFunction(listener)) throw TypeError('listener must be a function');

                if (!this._events || !this._events[type]) return this;

                list = this._events[type];
                length = list.length;
                position = -1;

                if (list === listener || isFunction(list.listener) && list.listener === listener) {
                    delete this._events[type];
                    if (this._events.removeListener) this.emit('removeListener', type, listener);
                } else if (isObject(list)) {
                    for (i = length; i-- > 0;) {
                        if (list[i] === listener || list[i].listener && list[i].listener === listener) {
                            position = i;
                            break;
                        }
                    }

                    if (position < 0) return this;

                    if (list.length === 1) {
                        list.length = 0;
                        delete this._events[type];
                    } else {
                        list.splice(position, 1);
                    }

                    if (this._events.removeListener) this.emit('removeListener', type, listener);
                }

                return this;
            };

            EventEmitter.prototype.removeAllListeners = function (type) {
                var key, listeners;

                if (!this._events) return this;

                // not listening for removeListener, no need to emit
                if (!this._events.removeListener) {
                    if (arguments.length === 0) this._events = {};else if (this._events[type]) delete this._events[type];
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
                    while (listeners.length) {
                        this.removeListener(type, listeners[listeners.length - 1]);
                    }
                }
                delete this._events[type];

                return this;
            };

            EventEmitter.prototype.listeners = function (type) {
                var ret;
                if (!this._events || !this._events[type]) ret = [];else if (isFunction(this._events[type])) ret = [this._events[type]];else ret = this._events[type].slice();
                return ret;
            };

            EventEmitter.prototype.listenerCount = function (type) {
                if (this._events) {
                    var evlistener = this._events[type];

                    if (isFunction(evlistener)) return 1;else if (evlistener) return evlistener.length;
                }
                return 0;
            };

            EventEmitter.listenerCount = function (emitter, type) {
                return emitter.listenerCount(type);
            };

            function isFunction(arg) {
                return typeof arg === 'function';
            }

            function isNumber(arg) {
                return typeof arg === 'number';
            }

            function isObject(arg) {
                return (typeof arg === "undefined" ? "undefined" : _typeof(arg)) === 'object' && arg !== null;
            }

            function isUndefined(arg) {
                return arg === void 0;
            }
        }, {}], 2: [function (require, module, exports) {
            (function (process) {
                // Generated by CoffeeScript 1.12.2
                (function () {
                    var getNanoSeconds, hrtime, loadTime, moduleLoadTime, nodeLoadTime, upTime;

                    if (typeof performance !== "undefined" && performance !== null && performance.now) {
                        module.exports = function () {
                            return performance.now();
                        };
                    } else if (typeof process !== "undefined" && process !== null && process.hrtime) {
                        module.exports = function () {
                            return (getNanoSeconds() - nodeLoadTime) / 1e6;
                        };
                        hrtime = process.hrtime;
                        getNanoSeconds = function getNanoSeconds() {
                            var hr;
                            hr = hrtime();
                            return hr[0] * 1e9 + hr[1];
                        };
                        moduleLoadTime = getNanoSeconds();
                        upTime = process.uptime() * 1e9;
                        nodeLoadTime = moduleLoadTime - upTime;
                    } else if (Date.now) {
                        module.exports = function () {
                            return Date.now() - loadTime;
                        };
                        loadTime = Date.now();
                    } else {
                        module.exports = function () {
                            return new Date().getTime() - loadTime;
                        };
                        loadTime = new Date().getTime();
                    }
                }).call(this);
            }).call(this, require('_process'));
        }, { "_process": 3 }], 3: [function (require, module, exports) {
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
            function defaultClearTimeout() {
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
            })();
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
                } catch (e) {
                    try {
                        // When we are in I.E. but the script has been evaled so I.E. doesn't trust the global object when called normally
                        return cachedSetTimeout.call(null, fun, 0);
                    } catch (e) {
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
                } catch (e) {
                    try {
                        // When we are in I.E. but the script has been evaled so I.E. doesn't  trust the global object when called normally
                        return cachedClearTimeout.call(null, marker);
                    } catch (e) {
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
                while (len) {
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

            process.listeners = function (name) {
                return [];
            };

            process.binding = function (name) {
                throw new Error('process.binding is not supported');
            };

            process.cwd = function () {
                return '/';
            };
            process.chdir = function (dir) {
                throw new Error('process.chdir is not supported');
            };
            process.umask = function () {
                return 0;
            };
        }, {}], 4: [function (require, module, exports) {
            /*jshint eqnull:true*/
            (function (root) {
                "use strict";

                var GLOBAL_KEY = "Random";

                var imul = typeof Math.imul !== "function" || Math.imul(0xffffffff, 5) !== -5 ? function (a, b) {
                    var ah = a >>> 16 & 0xffff;
                    var al = a & 0xffff;
                    var bh = b >>> 16 & 0xffff;
                    var bl = b & 0xffff;
                    // the shift by 0 fixes the sign on the high part
                    // the final |0 converts the unsigned value into a signed value
                    return al * bl + (ah * bl + al * bh << 16 >>> 0) | 0;
                } : Math.imul;

                var stringRepeat = typeof String.prototype.repeat === "function" && "x".repeat(3) === "xxx" ? function (x, y) {
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
                };

                function Random(engine) {
                    if (!(this instanceof Random)) {
                        return new Random(engine);
                    }

                    if (engine == null) {
                        engine = Random.engines.nativeMath;
                    } else if (typeof engine !== "function") {
                        throw new TypeError("Expected engine to be a function, got " + (typeof engine === "undefined" ? "undefined" : _typeof(engine)));
                    }
                    this.engine = engine;
                }
                var proto = Random.prototype;

                Random.engines = {
                    nativeMath: function nativeMath() {
                        return Math.random() * 0x100000000 | 0;
                    },
                    mt19937: function (Int32Array) {
                        // http://en.wikipedia.org/wiki/Mersenne_twister
                        function refreshData(data) {
                            var k = 0;
                            var tmp = 0;
                            for (; (k | 0) < 227; k = k + 1 | 0) {
                                tmp = data[k] & 0x80000000 | data[k + 1 | 0] & 0x7fffffff;
                                data[k] = data[k + 397 | 0] ^ tmp >>> 1 ^ (tmp & 0x1 ? 0x9908b0df : 0);
                            }

                            for (; (k | 0) < 623; k = k + 1 | 0) {
                                tmp = data[k] & 0x80000000 | data[k + 1 | 0] & 0x7fffffff;
                                data[k] = data[k - 227 | 0] ^ tmp >>> 1 ^ (tmp & 0x1 ? 0x9908b0df : 0);
                            }

                            tmp = data[623] & 0x80000000 | data[0] & 0x7fffffff;
                            data[623] = data[396] ^ tmp >>> 1 ^ (tmp & 0x1 ? 0x9908b0df : 0);
                        }

                        function temper(value) {
                            value ^= value >>> 11;
                            value ^= value << 7 & 0x9d2c5680;
                            value ^= value << 15 & 0xefc60000;
                            return value ^ value >>> 18;
                        }

                        function seedWithArray(data, source) {
                            var i = 1;
                            var j = 0;
                            var sourceLength = source.length;
                            var k = Math.max(sourceLength, 624) | 0;
                            var previous = data[0] | 0;
                            for (; (k | 0) > 0; --k) {
                                data[i] = previous = (data[i] ^ imul(previous ^ previous >>> 30, 0x0019660d)) + (source[j] | 0) + (j | 0) | 0;
                                i = i + 1 | 0;
                                ++j;
                                if ((i | 0) > 623) {
                                    data[0] = data[623];
                                    i = 1;
                                }
                                if (j >= sourceLength) {
                                    j = 0;
                                }
                            }
                            for (k = 623; (k | 0) > 0; --k) {
                                data[i] = previous = (data[i] ^ imul(previous ^ previous >>> 30, 0x5d588b65)) - i | 0;
                                i = i + 1 | 0;
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
                                index = index + 1 | 0;
                                uses += 1;
                                return temper(value) | 0;
                            }
                            next.getUseCount = function () {
                                return uses;
                            };
                            next.discard = function (count) {
                                uses += count;
                                if ((index | 0) >= 624) {
                                    refreshData(data);
                                    index = 0;
                                }
                                while (count - index > 624) {
                                    count -= 624 - index;
                                    refreshData(data);
                                    index = 0;
                                }
                                index = index + count | 0;
                                return next;
                            };
                            next.seed = function (initial) {
                                var previous = 0;
                                data[0] = previous = initial | 0;

                                for (var i = 1; i < 624; i = i + 1 | 0) {
                                    data[i] = previous = imul(previous ^ previous >>> 30, 0x6c078965) + i | 0;
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
                    }(typeof Int32Array === "function" ? Int32Array : Array),
                    browserCrypto: typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function" && typeof Int32Array === "function" ? function () {
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
                    }() : null
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
                    return high * 0x100000000 + low;
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
                            return (high & 0x1fffff) * 0x100000000 + low;
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
                    return (high & 0x1fffff) * 0x100000000 + low + (high & 0x200000 ? -0x20000000000000 : 0);
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
                            return (high & 0x1fffff) * 0x100000000 + low + (high & 0x200000 ? -0x20000000000000 : 0);
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

                Random.integer = function () {
                    function isPowerOfTwoMinusOne(value) {
                        return (value + 1 & value) === 0;
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
                            return high * 0x100000000 + low;
                        };
                    }

                    function upscaleToLoopCheckedRange(extendedRange) {
                        var maximum = extendedRange * Math.floor(0x20000000000000 / extendedRange);
                        return function (engine) {
                            var ret = 0;
                            do {
                                var high = engine() & 0x1fffff;
                                var low = engine() >>> 0;
                                ret = high * 0x100000000 + low;
                            } while (ret >= maximum);
                            return ret % extendedRange;
                        };
                    }

                    function upscaleWithinU53(range) {
                        var extendedRange = range + 1;
                        if (isEvenlyDivisibleByMaxInt32(extendedRange)) {
                            var highRange = (extendedRange / 0x100000000 | 0) - 1;
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
                                ret = (high & 0x1fffff) * 0x100000000 + low + (high & 0x200000 ? -0x20000000000000 : 0);
                            } while (ret < min || ret > max);
                            return ret;
                        };
                    }

                    return function (min, max) {
                        min = Math.floor(min);
                        max = Math.floor(max);
                        if (min < -0x20000000000000 || !isFinite(min)) {
                            throw new RangeError("Expected min to be at least " + -0x20000000000000);
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
                }();
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

                Random.real = function () {
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
                        return add(multiply(inclusive ? Random.realZeroToOneInclusive : Random.realZeroToOneExclusive, right - left), left);
                    };
                }();
                proto.real = function (min, max, inclusive) {
                    return Random.real(min, max, inclusive)(this.engine);
                };

                Random.bool = function () {
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
                                return lessThan(Random.int32, scaled - 0x80000000 | 0);
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
                }();
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
                        for (var i = length - 1 >>> 0; i > downTo; --i) {
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
                Random.uuid4 = function () {
                    function zeroPad(string, zeroCount) {
                        return stringRepeat("0", zeroCount - string.length) + string;
                    }

                    return function (engine) {
                        var a = engine() >>> 0;
                        var b = engine() | 0;
                        var c = engine() | 0;
                        var d = engine() >>> 0;

                        return zeroPad(a.toString(16), 8) + "-" + zeroPad((b & 0xffff).toString(16), 4) + "-" + zeroPad((b >> 4 & 0x0fff | 0x4000).toString(16), 4) + "-" + zeroPad((c & 0x3fff | 0x8000).toString(16), 4) + "-" + zeroPad((c >> 4 & 0xffff).toString(16), 4) + zeroPad(d.toString(16), 8);
                    };
                }();
                proto.uuid4 = function () {
                    return Random.uuid4(this.engine);
                };

                Random.string = function () {
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
                }();
                proto.string = function (length, pool) {
                    return Random.string(pool)(this.engine, length);
                };

                Random.hex = function () {
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
                }();
                proto.hex = function (length, upper) {
                    return Random.hex(upper)(this.engine, length);
                };

                Random.date = function (start, end) {
                    if (!(start instanceof Date)) {
                        throw new TypeError("Expected start to be a Date, got " + (typeof start === "undefined" ? "undefined" : _typeof(start)));
                    } else if (!(end instanceof Date)) {
                        throw new TypeError("Expected end to be a Date, got " + (typeof end === "undefined" ? "undefined" : _typeof(end)));
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
                    })();
                    root[GLOBAL_KEY] = Random;
                }
            })(this);
        }, {}], 5: [function (require, module, exports) {
            (function (root, factory) {

                if (typeof define === 'function' && define.amd) {
                    define([], factory);
                } else if (typeof module !== "undefined" && module.exports) {
                    module.exports = factory();
                } else {
                    root.ShapeDetector = factory();
                }
            })(this, function () {

                var _nbSamplePoints;
                var _squareSize = 250;
                var _phi = 0.5 * (-1.0 + Math.sqrt(5.0));
                var _angleRange = deg2Rad(45.0);
                var _anglePrecision = deg2Rad(2.0);
                var _halfDiagonal = Math.sqrt(_squareSize * _squareSize + _squareSize * _squareSize) * 0.5;
                var _origin = { x: 0, y: 0 };

                function deg2Rad(d) {

                    return d * Math.PI / 180.0;
                };

                function getDistance(a, b) {

                    var dx = b.x - a.x;
                    var dy = b.y - a.y;

                    return Math.sqrt(dx * dx + dy * dy);
                };

                function Stroke(points, name) {

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
                                x: this.points[i - 1].x + (interval - distance) / localDistance * (this.points[i].x - this.points[i - 1].x),
                                y: this.points[i - 1].y + (interval - distance) / localDistance * (this.points[i].y - this.points[i - 1].y)
                            };

                            newPoints.push(q);
                            this.points.splice(i, 0, q);
                            distance = 0.0;
                        } else {
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
                    var newPoints = [];
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
                        } else {
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

                function ShapeDetector(patterns, options) {

                    options = options || {};
                    this.threshold = options.threshold || 0;
                    _nbSamplePoints = options.nbSamplePoints || 64;

                    this.patterns = [];

                    for (var i = 0; i < patterns.length; i++) {
                        this.learn(patterns[i].name, patterns[i].points);
                    }
                }

                ShapeDetector.defaultShapes = [{
                    points: [{ x: 140.17500305175776, y: 420.52500915527327 }, { x: 157.69687843322748, y: 385.4812583923338 }, { x: 175.2187538146972, y: 350.4375076293944 }, { x: 192.7406291961669, y: 315.39375686645496 }, { x: 210.26250457763663, y: 280.3500061035155 }, { x: 227.78437995910636, y: 245.30625534057606 }, { x: 245.30625534057606, y: 210.26250457763663 }, { x: 262.8281307220458, y: 175.2187538146972 }, { x: 280.3500061035155, y: 140.17500305175776 }, { x: 280.3500061035155, y: 140.17500305175776 }, { x: 297.87188148498524, y: 175.2187538146972 }, { x: 315.39375686645496, y: 210.26250457763663 }, { x: 332.9156322479247, y: 245.30625534057606 }, { x: 350.4375076293944, y: 280.3500061035155 }, { x: 367.95938301086414, y: 315.39375686645496 }, { x: 385.4812583923338, y: 350.4375076293944 }, { x: 403.00313377380354, y: 385.4812583923338 }, { x: 420.52500915527327, y: 420.52500915527327 }, { x: 420.52500915527327, y: 420.52500915527327 }, { x: 385.4812583923338, y: 420.52500915527327 }, { x: 350.4375076293944, y: 420.52500915527327 }, { x: 315.39375686645496, y: 420.52500915527327 }, { x: 280.3500061035155, y: 420.52500915527327 }, { x: 245.30625534057606, y: 420.52500915527327 }, { x: 210.26250457763663, y: 420.52500915527327 }, { x: 175.2187538146972, y: 420.52500915527327 }, { x: 140.17500305175776, y: 420.52500915527327 }],
                    name: "triangle"
                }, {
                    points: [{ x: 280.3500061035155, y: 140.17500305175776 }, { x: 297.87188148498524, y: 175.2187538146972 }, { x: 315.39375686645496, y: 210.26250457763663 }, { x: 332.9156322479247, y: 245.30625534057606 }, { x: 350.4375076293944, y: 280.3500061035155 }, { x: 367.95938301086414, y: 315.39375686645496 }, { x: 385.4812583923338, y: 350.4375076293944 }, { x: 403.00313377380354, y: 385.4812583923338 }, { x: 420.52500915527327, y: 420.52500915527327 }, { x: 420.52500915527327, y: 420.52500915527327 }, { x: 385.4812583923338, y: 420.52500915527327 }, { x: 350.4375076293944, y: 420.52500915527327 }, { x: 315.39375686645496, y: 420.52500915527327 }, { x: 280.3500061035155, y: 420.52500915527327 }, { x: 245.30625534057606, y: 420.52500915527327 }, { x: 210.26250457763663, y: 420.52500915527327 }, { x: 175.2187538146972, y: 420.52500915527327 }, { x: 140.17500305175776, y: 420.52500915527327 }, { x: 140.17500305175776, y: 420.52500915527327 }, { x: 157.69687843322748, y: 385.4812583923338 }, { x: 175.2187538146972, y: 350.4375076293944 }, { x: 192.7406291961669, y: 315.39375686645496 }, { x: 210.26250457763663, y: 280.3500061035155 }, { x: 227.78437995910636, y: 245.30625534057606 }, { x: 245.30625534057606, y: 210.26250457763663 }, { x: 262.8281307220458, y: 175.2187538146972 }, { x: 280.3500061035155, y: 140.17500305175776 }],
                    name: "triangle"
                }, {
                    points: [{ x: 420.52500915527327, y: 420.52500915527327 }, { x: 385.4812583923338, y: 420.52500915527327 }, { x: 350.4375076293944, y: 420.52500915527327 }, { x: 315.39375686645496, y: 420.52500915527327 }, { x: 280.3500061035155, y: 420.52500915527327 }, { x: 245.30625534057606, y: 420.52500915527327 }, { x: 210.26250457763663, y: 420.52500915527327 }, { x: 175.2187538146972, y: 420.52500915527327 }, { x: 140.17500305175776, y: 420.52500915527327 }, { x: 140.17500305175776, y: 420.52500915527327 }, { x: 157.69687843322748, y: 385.4812583923338 }, { x: 175.2187538146972, y: 350.4375076293944 }, { x: 192.7406291961669, y: 315.39375686645496 }, { x: 210.26250457763663, y: 280.3500061035155 }, { x: 227.78437995910636, y: 245.30625534057606 }, { x: 245.30625534057606, y: 210.26250457763663 }, { x: 262.8281307220458, y: 175.2187538146972 }, { x: 280.3500061035155, y: 140.17500305175776 }, { x: 280.3500061035155, y: 140.17500305175776 }, { x: 297.87188148498524, y: 175.2187538146972 }, { x: 315.39375686645496, y: 210.26250457763663 }, { x: 332.9156322479247, y: 245.30625534057606 }, { x: 350.4375076293944, y: 280.3500061035155 }, { x: 367.95938301086414, y: 315.39375686645496 }, { x: 385.4812583923338, y: 350.4375076293944 }, { x: 403.00313377380354, y: 385.4812583923338 }, { x: 420.52500915527327, y: 420.52500915527327 }],
                    name: "triangle"
                }, {
                    points: [{ x: 140.17500305175776, y: 420.52500915527327 }, { x: 175.2187538146972, y: 420.52500915527327 }, { x: 210.26250457763663, y: 420.52500915527327 }, { x: 245.30625534057606, y: 420.52500915527327 }, { x: 280.3500061035155, y: 420.52500915527327 }, { x: 315.39375686645496, y: 420.52500915527327 }, { x: 350.4375076293944, y: 420.52500915527327 }, { x: 385.4812583923338, y: 420.52500915527327 }, { x: 420.52500915527327, y: 420.52500915527327 }, { x: 420.52500915527327, y: 420.52500915527327 }, { x: 403.00313377380354, y: 385.4812583923338 }, { x: 385.4812583923338, y: 350.4375076293944 }, { x: 367.9593830108641, y: 315.39375686645496 }, { x: 350.4375076293944, y: 280.3500061035155 }, { x: 332.9156322479247, y: 245.30625534057606 }, { x: 315.39375686645496, y: 210.26250457763663 }, { x: 297.87188148498524, y: 175.2187538146972 }, { x: 280.3500061035155, y: 140.17500305175776 }, { x: 280.3500061035155, y: 140.17500305175776 }, { x: 262.8281307220458, y: 175.2187538146972 }, { x: 245.30625534057606, y: 210.26250457763663 }, { x: 227.78437995910636, y: 245.30625534057606 }, { x: 210.26250457763663, y: 280.3500061035155 }, { x: 192.7406291961669, y: 315.39375686645496 }, { x: 175.2187538146972, y: 350.4375076293944 }, { x: 157.69687843322748, y: 385.4812583923338 }, { x: 140.17500305175776, y: 420.52500915527327 }],
                    name: "triangle"
                }, {
                    points: [{ x: 420.52500915527327, y: 420.52500915527327 }, { x: 403.00313377380354, y: 385.4812583923338 }, { x: 385.4812583923338, y: 350.4375076293944 }, { x: 367.9593830108641, y: 315.39375686645496 }, { x: 350.4375076293944, y: 280.3500061035155 }, { x: 332.9156322479247, y: 245.30625534057606 }, { x: 315.39375686645496, y: 210.26250457763663 }, { x: 297.87188148498524, y: 175.2187538146972 }, { x: 280.3500061035155, y: 140.17500305175776 }, { x: 280.3500061035155, y: 140.17500305175776 }, { x: 262.8281307220458, y: 175.2187538146972 }, { x: 245.30625534057606, y: 210.26250457763663 }, { x: 227.78437995910636, y: 245.30625534057606 }, { x: 210.26250457763663, y: 280.3500061035155 }, { x: 192.7406291961669, y: 315.39375686645496 }, { x: 175.2187538146972, y: 350.4375076293944 }, { x: 157.69687843322748, y: 385.4812583923338 }, { x: 140.17500305175776, y: 420.52500915527327 }, { x: 140.17500305175776, y: 420.52500915527327 }, { x: 175.2187538146972, y: 420.52500915527327 }, { x: 210.26250457763663, y: 420.52500915527327 }, { x: 245.30625534057606, y: 420.52500915527327 }, { x: 280.3500061035155, y: 420.52500915527327 }, { x: 315.39375686645496, y: 420.52500915527327 }, { x: 350.4375076293944, y: 420.52500915527327 }, { x: 385.4812583923338, y: 420.52500915527327 }, { x: 420.52500915527327, y: 420.52500915527327 }],
                    name: "triangle"
                }, {
                    points: [{ x: 280.3500061035155, y: 140.17500305175776 }, { x: 262.8281307220458, y: 175.2187538146972 }, { x: 245.30625534057606, y: 210.26250457763663 }, { x: 227.78437995910636, y: 245.30625534057606 }, { x: 210.26250457763663, y: 280.3500061035155 }, { x: 192.7406291961669, y: 315.39375686645496 }, { x: 175.2187538146972, y: 350.4375076293944 }, { x: 157.69687843322748, y: 385.4812583923338 }, { x: 140.17500305175776, y: 420.52500915527327 }, { x: 140.17500305175776, y: 420.52500915527327 }, { x: 175.2187538146972, y: 420.52500915527327 }, { x: 210.26250457763663, y: 420.52500915527327 }, { x: 245.30625534057606, y: 420.52500915527327 }, { x: 280.3500061035155, y: 420.52500915527327 }, { x: 315.39375686645496, y: 420.52500915527327 }, { x: 350.4375076293944, y: 420.52500915527327 }, { x: 385.4812583923338, y: 420.52500915527327 }, { x: 420.52500915527327, y: 420.52500915527327 }, { x: 420.52500915527327, y: 420.52500915527327 }, { x: 403.00313377380354, y: 385.4812583923338 }, { x: 385.4812583923338, y: 350.4375076293944 }, { x: 367.9593830108641, y: 315.39375686645496 }, { x: 350.4375076293944, y: 280.3500061035155 }, { x: 332.9156322479247, y: 245.30625534057606 }, { x: 315.39375686645496, y: 210.26250457763663 }, { x: 297.87188148498524, y: 175.2187538146972 }, { x: 280.3500061035155, y: 140.17500305175776 }],
                    name: "triangle"
                }, {
                    points: [{ x: 140.17500305175776, y: 140.17500305175776 }, { x: 175.2187538146972, y: 140.17500305175776 }, { x: 210.26250457763663, y: 140.17500305175776 }, { x: 245.30625534057606, y: 140.17500305175776 }, { x: 280.3500061035155, y: 140.17500305175776 }, { x: 315.39375686645496, y: 140.17500305175776 }, { x: 350.4375076293944, y: 140.17500305175776 }, { x: 385.4812583923338, y: 140.17500305175776 }, { x: 420.52500915527327, y: 140.17500305175776 }, { x: 420.52500915527327, y: 140.17500305175776 }, { x: 420.52500915527327, y: 175.2187538146972 }, { x: 420.52500915527327, y: 210.26250457763663 }, { x: 420.52500915527327, y: 245.30625534057606 }, { x: 420.52500915527327, y: 280.3500061035155 }, { x: 420.52500915527327, y: 315.39375686645496 }, { x: 420.52500915527327, y: 350.4375076293944 }, { x: 420.52500915527327, y: 385.4812583923338 }, { x: 420.52500915527327, y: 420.52500915527327 }, { x: 420.52500915527327, y: 420.52500915527327 }, { x: 385.4812583923338, y: 420.52500915527327 }, { x: 350.4375076293944, y: 420.52500915527327 }, { x: 315.39375686645496, y: 420.52500915527327 }, { x: 280.3500061035155, y: 420.52500915527327 }, { x: 245.30625534057606, y: 420.52500915527327 }, { x: 210.26250457763663, y: 420.52500915527327 }, { x: 175.2187538146972, y: 420.52500915527327 }, { x: 140.17500305175776, y: 420.52500915527327 }, { x: 140.17500305175776, y: 420.52500915527327 }, { x: 140.17500305175776, y: 385.4812583923338 }, { x: 140.17500305175776, y: 350.4375076293944 }, { x: 140.17500305175776, y: 315.39375686645496 }, { x: 140.17500305175776, y: 280.3500061035155 }, { x: 140.17500305175776, y: 245.30625534057606 }, { x: 140.17500305175776, y: 210.26250457763663 }, { x: 140.17500305175776, y: 175.2187538146972 }, { x: 140.17500305175776, y: 140.17500305175776 }],
                    name: "square"
                }, {
                    points: [{ x: 420.52500915527327, y: 140.17500305175776 }, { x: 420.52500915527327, y: 175.2187538146972 }, { x: 420.52500915527327, y: 210.26250457763663 }, { x: 420.52500915527327, y: 245.30625534057606 }, { x: 420.52500915527327, y: 280.3500061035155 }, { x: 420.52500915527327, y: 315.39375686645496 }, { x: 420.52500915527327, y: 350.4375076293944 }, { x: 420.52500915527327, y: 385.4812583923338 }, { x: 420.52500915527327, y: 420.52500915527327 }, { x: 420.52500915527327, y: 420.52500915527327 }, { x: 385.4812583923338, y: 420.52500915527327 }, { x: 350.4375076293944, y: 420.52500915527327 }, { x: 315.39375686645496, y: 420.52500915527327 }, { x: 280.3500061035155, y: 420.52500915527327 }, { x: 245.30625534057606, y: 420.52500915527327 }, { x: 210.26250457763663, y: 420.52500915527327 }, { x: 175.2187538146972, y: 420.52500915527327 }, { x: 140.17500305175776, y: 420.52500915527327 }, { x: 140.17500305175776, y: 420.52500915527327 }, { x: 140.17500305175776, y: 385.4812583923338 }, { x: 140.17500305175776, y: 350.4375076293944 }, { x: 140.17500305175776, y: 315.39375686645496 }, { x: 140.17500305175776, y: 280.3500061035155 }, { x: 140.17500305175776, y: 245.30625534057606 }, { x: 140.17500305175776, y: 210.26250457763663 }, { x: 140.17500305175776, y: 175.2187538146972 }, { x: 140.17500305175776, y: 140.17500305175776 }, { x: 140.17500305175776, y: 140.17500305175776 }, { x: 175.2187538146972, y: 140.17500305175776 }, { x: 210.26250457763663, y: 140.17500305175776 }, { x: 245.30625534057606, y: 140.17500305175776 }, { x: 280.3500061035155, y: 140.17500305175776 }, { x: 315.39375686645496, y: 140.17500305175776 }, { x: 350.4375076293944, y: 140.17500305175776 }, { x: 385.4812583923338, y: 140.17500305175776 }, { x: 420.52500915527327, y: 140.17500305175776 }],
                    name: "square"
                }, {
                    points: [{ x: 420.52500915527327, y: 420.52500915527327 }, { x: 385.4812583923338, y: 420.52500915527327 }, { x: 350.4375076293944, y: 420.52500915527327 }, { x: 315.39375686645496, y: 420.52500915527327 }, { x: 280.3500061035155, y: 420.52500915527327 }, { x: 245.30625534057606, y: 420.52500915527327 }, { x: 210.26250457763663, y: 420.52500915527327 }, { x: 175.2187538146972, y: 420.52500915527327 }, { x: 140.17500305175776, y: 420.52500915527327 }, { x: 140.17500305175776, y: 420.52500915527327 }, { x: 140.17500305175776, y: 385.4812583923338 }, { x: 140.17500305175776, y: 350.4375076293944 }, { x: 140.17500305175776, y: 315.39375686645496 }, { x: 140.17500305175776, y: 280.3500061035155 }, { x: 140.17500305175776, y: 245.30625534057606 }, { x: 140.17500305175776, y: 210.26250457763663 }, { x: 140.17500305175776, y: 175.2187538146972 }, { x: 140.17500305175776, y: 140.17500305175776 }, { x: 140.17500305175776, y: 140.17500305175776 }, { x: 175.2187538146972, y: 140.17500305175776 }, { x: 210.26250457763663, y: 140.17500305175776 }, { x: 245.30625534057606, y: 140.17500305175776 }, { x: 280.3500061035155, y: 140.17500305175776 }, { x: 315.39375686645496, y: 140.17500305175776 }, { x: 350.4375076293944, y: 140.17500305175776 }, { x: 385.4812583923338, y: 140.17500305175776 }, { x: 420.52500915527327, y: 140.17500305175776 }, { x: 420.52500915527327, y: 140.17500305175776 }, { x: 420.52500915527327, y: 175.2187538146972 }, { x: 420.52500915527327, y: 210.26250457763663 }, { x: 420.52500915527327, y: 245.30625534057606 }, { x: 420.52500915527327, y: 280.3500061035155 }, { x: 420.52500915527327, y: 315.39375686645496 }, { x: 420.52500915527327, y: 350.4375076293944 }, { x: 420.52500915527327, y: 385.4812583923338 }, { x: 420.52500915527327, y: 420.52500915527327 }],
                    name: "square"
                }, {
                    points: [{ x: 140.17500305175776, y: 420.52500915527327 }, { x: 140.17500305175776, y: 385.4812583923338 }, { x: 140.17500305175776, y: 350.4375076293944 }, { x: 140.17500305175776, y: 315.39375686645496 }, { x: 140.17500305175776, y: 280.3500061035155 }, { x: 140.17500305175776, y: 245.30625534057606 }, { x: 140.17500305175776, y: 210.26250457763663 }, { x: 140.17500305175776, y: 175.2187538146972 }, { x: 140.17500305175776, y: 140.17500305175776 }, { x: 140.17500305175776, y: 140.17500305175776 }, { x: 175.2187538146972, y: 140.17500305175776 }, { x: 210.26250457763663, y: 140.17500305175776 }, { x: 245.30625534057606, y: 140.17500305175776 }, { x: 280.3500061035155, y: 140.17500305175776 }, { x: 315.39375686645496, y: 140.17500305175776 }, { x: 350.4375076293944, y: 140.17500305175776 }, { x: 385.4812583923338, y: 140.17500305175776 }, { x: 420.52500915527327, y: 140.17500305175776 }, { x: 420.52500915527327, y: 140.17500305175776 }, { x: 420.52500915527327, y: 175.2187538146972 }, { x: 420.52500915527327, y: 210.26250457763663 }, { x: 420.52500915527327, y: 245.30625534057606 }, { x: 420.52500915527327, y: 280.3500061035155 }, { x: 420.52500915527327, y: 315.39375686645496 }, { x: 420.52500915527327, y: 350.4375076293944 }, { x: 420.52500915527327, y: 385.4812583923338 }, { x: 420.52500915527327, y: 420.52500915527327 }, { x: 420.52500915527327, y: 420.52500915527327 }, { x: 385.4812583923338, y: 420.52500915527327 }, { x: 350.4375076293944, y: 420.52500915527327 }, { x: 315.39375686645496, y: 420.52500915527327 }, { x: 280.3500061035155, y: 420.52500915527327 }, { x: 245.30625534057606, y: 420.52500915527327 }, { x: 210.26250457763663, y: 420.52500915527327 }, { x: 175.2187538146972, y: 420.52500915527327 }, { x: 140.17500305175776, y: 420.52500915527327 }],
                    name: "square"
                }, {
                    points: [{ x: 140.17500305175776, y: 420.52500915527327 }, { x: 175.2187538146972, y: 420.52500915527327 }, { x: 210.26250457763663, y: 420.52500915527327 }, { x: 245.30625534057606, y: 420.52500915527327 }, { x: 280.3500061035155, y: 420.52500915527327 }, { x: 315.39375686645496, y: 420.52500915527327 }, { x: 350.4375076293944, y: 420.52500915527327 }, { x: 385.4812583923338, y: 420.52500915527327 }, { x: 420.52500915527327, y: 420.52500915527327 }, { x: 420.52500915527327, y: 420.52500915527327 }, { x: 420.52500915527327, y: 385.4812583923338 }, { x: 420.52500915527327, y: 350.4375076293944 }, { x: 420.52500915527327, y: 315.39375686645496 }, { x: 420.52500915527327, y: 280.3500061035155 }, { x: 420.52500915527327, y: 245.30625534057606 }, { x: 420.52500915527327, y: 210.26250457763663 }, { x: 420.52500915527327, y: 175.2187538146972 }, { x: 420.52500915527327, y: 140.17500305175776 }, { x: 420.52500915527327, y: 140.17500305175776 }, { x: 385.4812583923338, y: 140.17500305175776 }, { x: 350.4375076293944, y: 140.17500305175776 }, { x: 315.39375686645496, y: 140.17500305175776 }, { x: 280.3500061035155, y: 140.17500305175776 }, { x: 245.30625534057606, y: 140.17500305175776 }, { x: 210.26250457763663, y: 140.17500305175776 }, { x: 175.2187538146972, y: 140.17500305175776 }, { x: 140.17500305175776, y: 140.17500305175776 }, { x: 140.17500305175776, y: 140.17500305175776 }, { x: 140.17500305175776, y: 175.2187538146972 }, { x: 140.17500305175776, y: 210.26250457763663 }, { x: 140.17500305175776, y: 245.30625534057606 }, { x: 140.17500305175776, y: 280.3500061035155 }, { x: 140.17500305175776, y: 315.39375686645496 }, { x: 140.17500305175776, y: 350.4375076293944 }, { x: 140.17500305175776, y: 385.4812583923338 }, { x: 140.17500305175776, y: 420.52500915527327 }],
                    name: "square"
                }, {
                    points: [{ x: 420.52500915527327, y: 420.52500915527327 }, { x: 420.52500915527327, y: 385.4812583923338 }, { x: 420.52500915527327, y: 350.4375076293944 }, { x: 420.52500915527327, y: 315.39375686645496 }, { x: 420.52500915527327, y: 280.3500061035155 }, { x: 420.52500915527327, y: 245.30625534057606 }, { x: 420.52500915527327, y: 210.26250457763663 }, { x: 420.52500915527327, y: 175.2187538146972 }, { x: 420.52500915527327, y: 140.17500305175776 }, { x: 420.52500915527327, y: 140.17500305175776 }, { x: 385.4812583923338, y: 140.17500305175776 }, { x: 350.4375076293944, y: 140.17500305175776 }, { x: 315.39375686645496, y: 140.17500305175776 }, { x: 280.3500061035155, y: 140.17500305175776 }, { x: 245.30625534057606, y: 140.17500305175776 }, { x: 210.26250457763663, y: 140.17500305175776 }, { x: 175.2187538146972, y: 140.17500305175776 }, { x: 140.17500305175776, y: 140.17500305175776 }, { x: 140.17500305175776, y: 140.17500305175776 }, { x: 140.17500305175776, y: 175.2187538146972 }, { x: 140.17500305175776, y: 210.26250457763663 }, { x: 140.17500305175776, y: 245.30625534057606 }, { x: 140.17500305175776, y: 280.3500061035155 }, { x: 140.17500305175776, y: 315.39375686645496 }, { x: 140.17500305175776, y: 350.4375076293944 }, { x: 140.17500305175776, y: 385.4812583923338 }, { x: 140.17500305175776, y: 420.52500915527327 }, { x: 140.17500305175776, y: 420.52500915527327 }, { x: 175.2187538146972, y: 420.52500915527327 }, { x: 210.26250457763663, y: 420.52500915527327 }, { x: 245.30625534057606, y: 420.52500915527327 }, { x: 280.3500061035155, y: 420.52500915527327 }, { x: 315.39375686645496, y: 420.52500915527327 }, { x: 350.4375076293944, y: 420.52500915527327 }, { x: 385.4812583923338, y: 420.52500915527327 }, { x: 420.52500915527327, y: 420.52500915527327 }],
                    name: "square"
                }, {
                    points: [{ x: 420.52500915527327, y: 140.17500305175776 }, { x: 385.4812583923338, y: 140.17500305175776 }, { x: 350.4375076293944, y: 140.17500305175776 }, { x: 315.39375686645496, y: 140.17500305175776 }, { x: 280.3500061035155, y: 140.17500305175776 }, { x: 245.30625534057606, y: 140.17500305175776 }, { x: 210.26250457763663, y: 140.17500305175776 }, { x: 175.2187538146972, y: 140.17500305175776 }, { x: 140.17500305175776, y: 140.17500305175776 }, { x: 140.17500305175776, y: 140.17500305175776 }, { x: 140.17500305175776, y: 175.2187538146972 }, { x: 140.17500305175776, y: 210.26250457763663 }, { x: 140.17500305175776, y: 245.30625534057606 }, { x: 140.17500305175776, y: 280.3500061035155 }, { x: 140.17500305175776, y: 315.39375686645496 }, { x: 140.17500305175776, y: 350.4375076293944 }, { x: 140.17500305175776, y: 385.4812583923338 }, { x: 140.17500305175776, y: 420.52500915527327 }, { x: 140.17500305175776, y: 420.52500915527327 }, { x: 175.2187538146972, y: 420.52500915527327 }, { x: 210.26250457763663, y: 420.52500915527327 }, { x: 245.30625534057606, y: 420.52500915527327 }, { x: 280.3500061035155, y: 420.52500915527327 }, { x: 315.39375686645496, y: 420.52500915527327 }, { x: 350.4375076293944, y: 420.52500915527327 }, { x: 385.4812583923338, y: 420.52500915527327 }, { x: 420.52500915527327, y: 420.52500915527327 }, { x: 420.52500915527327, y: 420.52500915527327 }, { x: 420.52500915527327, y: 385.4812583923338 }, { x: 420.52500915527327, y: 350.4375076293944 }, { x: 420.52500915527327, y: 315.39375686645496 }, { x: 420.52500915527327, y: 280.3500061035155 }, { x: 420.52500915527327, y: 245.30625534057606 }, { x: 420.52500915527327, y: 210.26250457763663 }, { x: 420.52500915527327, y: 175.2187538146972 }, { x: 420.52500915527327, y: 140.17500305175776 }],
                    name: "square"
                }, {
                    points: [{ x: 140.17500305175776, y: 140.17500305175776 }, { x: 140.17500305175776, y: 175.2187538146972 }, { x: 140.17500305175776, y: 210.26250457763663 }, { x: 140.17500305175776, y: 245.30625534057606 }, { x: 140.17500305175776, y: 280.3500061035155 }, { x: 140.17500305175776, y: 315.39375686645496 }, { x: 140.17500305175776, y: 350.4375076293944 }, { x: 140.17500305175776, y: 385.4812583923338 }, { x: 140.17500305175776, y: 420.52500915527327 }, { x: 140.17500305175776, y: 420.52500915527327 }, { x: 175.2187538146972, y: 420.52500915527327 }, { x: 210.26250457763663, y: 420.52500915527327 }, { x: 245.30625534057606, y: 420.52500915527327 }, { x: 280.3500061035155, y: 420.52500915527327 }, { x: 315.39375686645496, y: 420.52500915527327 }, { x: 350.4375076293944, y: 420.52500915527327 }, { x: 385.4812583923338, y: 420.52500915527327 }, { x: 420.52500915527327, y: 420.52500915527327 }, { x: 420.52500915527327, y: 420.52500915527327 }, { x: 420.52500915527327, y: 385.4812583923338 }, { x: 420.52500915527327, y: 350.4375076293944 }, { x: 420.52500915527327, y: 315.39375686645496 }, { x: 420.52500915527327, y: 280.3500061035155 }, { x: 420.52500915527327, y: 245.30625534057606 }, { x: 420.52500915527327, y: 210.26250457763663 }, { x: 420.52500915527327, y: 175.2187538146972 }, { x: 420.52500915527327, y: 140.17500305175776 }, { x: 420.52500915527327, y: 140.17500305175776 }, { x: 385.4812583923338, y: 140.17500305175776 }, { x: 350.4375076293944, y: 140.17500305175776 }, { x: 315.39375686645496, y: 140.17500305175776 }, { x: 280.3500061035155, y: 140.17500305175776 }, { x: 245.30625534057606, y: 140.17500305175776 }, { x: 210.26250457763663, y: 140.17500305175776 }, { x: 175.2187538146972, y: 140.17500305175776 }, { x: 140.17500305175776, y: 140.17500305175776 }],
                    name: "square"
                }, {
                    points: [{ x: 420.52500915527327, y: 280.3500061035155 }, { x: 418.3954358873965, y: 304.69113993790967 }, { x: 412.07142208989444, y: 328.29268073795373 }, { x: 401.74511972189896, y: 350.43750762939436 }, { x: 387.73028825550034, y: 370.4527612529582 }, { x: 370.4527612529582, y: 387.73028825550034 }, { x: 350.4375076293944, y: 401.74511972189896 }, { x: 328.2926807379538, y: 412.07142208989444 }, { x: 304.69113993790967, y: 418.3954358873965 }, { x: 280.3500061035155, y: 420.52500915527327 }, { x: 256.0088722691214, y: 418.3954358873965 }, { x: 232.4073314690773, y: 412.07142208989444 }, { x: 210.26250457763666, y: 401.74511972189896 }, { x: 190.2472509540728, y: 387.73028825550034 }, { x: 172.9697239515307, y: 370.4527612529582 }, { x: 158.95489248513206, y: 350.43750762939436 }, { x: 148.62859011713658, y: 328.2926807379538 }, { x: 142.30457631963455, y: 304.6911399379096 }, { x: 140.17500305175776, y: 280.3500061035155 }, { x: 142.30457631963455, y: 256.00887226912135 }, { x: 148.62859011713655, y: 232.4073314690773 }, { x: 158.9548924851321, y: 210.2625045776366 }, { x: 172.96972395153068, y: 190.2472509540728 }, { x: 190.24725095407277, y: 172.9697239515307 }, { x: 210.26250457763658, y: 158.95489248513212 }, { x: 232.40733146907718, y: 148.62859011713658 }, { x: 256.00887226912135, y: 142.30457631963455 }, { x: 280.3500061035155, y: 140.17500305175776 }, { x: 304.6911399379096, y: 142.30457631963455 }, { x: 328.2926807379537, y: 148.62859011713653 }, { x: 350.4375076293944, y: 158.9548924851321 }, { x: 370.4527612529582, y: 172.96972395153068 }, { x: 387.73028825550034, y: 190.24725095407274 }, { x: 401.7451197218989, y: 210.26250457763658 }, { x: 412.07142208989444, y: 232.4073314690773 }, { x: 418.39543588739645, y: 256.00887226912124 }, { x: 420.52500915527327, y: 280.35000610351545 }],
                    name: "circle"
                }, {
                    points: [{ x: 420.52500915527327, y: 280.3500061035155 }, { x: 418.3954358873965, y: 256.00887226912135 }, { x: 412.07142208989444, y: 232.4073314690773 }, { x: 401.74511972189896, y: 210.26250457763666 }, { x: 387.73028825550034, y: 190.2472509540728 }, { x: 370.4527612529582, y: 172.96972395153068 }, { x: 350.4375076293944, y: 158.9548924851321 }, { x: 328.2926807379538, y: 148.62859011713658 }, { x: 304.69113993790967, y: 142.30457631963455 }, { x: 280.3500061035155, y: 140.17500305175776 }, { x: 256.0088722691214, y: 142.30457631963455 }, { x: 232.4073314690773, y: 148.62859011713655 }, { x: 210.26250457763666, y: 158.95489248513206 }, { x: 190.2472509540728, y: 172.96972395153068 }, { x: 172.9697239515307, y: 190.24725095407277 }, { x: 158.95489248513206, y: 210.26250457763666 }, { x: 148.62859011713658, y: 232.40733146907723 }, { x: 142.30457631963455, y: 256.0088722691214 }, { x: 140.17500305175776, y: 280.3500061035155 }, { x: 142.30457631963455, y: 304.69113993790967 }, { x: 148.62859011713655, y: 328.29268073795373 }, { x: 158.9548924851321, y: 350.4375076293944 }, { x: 172.96972395153068, y: 370.4527612529582 }, { x: 190.24725095407277, y: 387.73028825550034 }, { x: 210.26250457763658, y: 401.7451197218989 }, { x: 232.40733146907718, y: 412.07142208989444 }, { x: 256.00887226912135, y: 418.3954358873965 }, { x: 280.3500061035155, y: 420.52500915527327 }, { x: 304.6911399379096, y: 418.3954358873965 }, { x: 328.2926807379537, y: 412.0714220898945 }, { x: 350.4375076293944, y: 401.74511972189896 }, { x: 370.4527612529582, y: 387.73028825550034 }, { x: 387.73028825550034, y: 370.4527612529583 }, { x: 401.7451197218989, y: 350.4375076293944 }, { x: 412.07142208989444, y: 328.29268073795373 }, { x: 418.39543588739645, y: 304.6911399379098 }, { x: 420.52500915527327, y: 280.35000610351557 }],
                    name: "circle"
                }, {
                    points: [{ x: 140.17500305175776, y: 280.3500061035155 }, { x: 142.30457631963455, y: 256.00887226912135 }, { x: 148.62859011713655, y: 232.4073314690773 }, { x: 158.95489248513206, y: 210.26250457763666 }, { x: 172.96972395153068, y: 190.2472509540728 }, { x: 190.2472509540728, y: 172.96972395153068 }, { x: 210.2625045776366, y: 158.9548924851321 }, { x: 232.40733146907726, y: 148.62859011713658 }, { x: 256.00887226912135, y: 142.30457631963455 }, { x: 280.3500061035155, y: 140.17500305175776 }, { x: 304.6911399379096, y: 142.30457631963455 }, { x: 328.29268073795373, y: 148.62859011713655 }, { x: 350.43750762939436, y: 158.95489248513206 }, { x: 370.4527612529582, y: 172.96972395153068 }, { x: 387.73028825550034, y: 190.24725095407277 }, { x: 401.74511972189896, y: 210.26250457763666 }, { x: 412.07142208989444, y: 232.40733146907723 }, { x: 418.3954358873965, y: 256.0088722691214 }, { x: 420.52500915527327, y: 280.3500061035155 }, { x: 418.3954358873965, y: 304.69113993790967 }, { x: 412.07142208989444, y: 328.29268073795373 }, { x: 401.74511972189896, y: 350.4375076293944 }, { x: 387.73028825550034, y: 370.4527612529582 }, { x: 370.4527612529582, y: 387.73028825550034 }, { x: 350.4375076293944, y: 401.7451197218989 }, { x: 328.29268073795384, y: 412.07142208989444 }, { x: 304.69113993790967, y: 418.3954358873965 }, { x: 280.3500061035155, y: 420.52500915527327 }, { x: 256.0088722691214, y: 418.3954358873965 }, { x: 232.40733146907735, y: 412.0714220898945 }, { x: 210.2625045776366, y: 401.74511972189896 }, { x: 190.2472509540728, y: 387.73028825550034 }, { x: 172.9697239515307, y: 370.4527612529583 }, { x: 158.95489248513212, y: 350.4375076293944 }, { x: 148.62859011713655, y: 328.29268073795373 }, { x: 142.30457631963458, y: 304.6911399379098 }, { x: 140.17500305175776, y: 280.35000610351557 }],
                    name: "circle"
                }, {
                    points: [{ x: 140.17500305175776, y: 280.3500061035155 }, { x: 142.30457631963455, y: 304.69113993790967 }, { x: 148.62859011713655, y: 328.29268073795373 }, { x: 158.95489248513206, y: 350.43750762939436 }, { x: 172.96972395153068, y: 370.4527612529582 }, { x: 190.2472509540728, y: 387.73028825550034 }, { x: 210.2625045776366, y: 401.74511972189896 }, { x: 232.40733146907726, y: 412.07142208989444 }, { x: 256.00887226912135, y: 418.3954358873965 }, { x: 280.3500061035155, y: 420.52500915527327 }, { x: 304.6911399379096, y: 418.3954358873965 }, { x: 328.29268073795373, y: 412.07142208989444 }, { x: 350.43750762939436, y: 401.74511972189896 }, { x: 370.4527612529582, y: 387.73028825550034 }, { x: 387.73028825550034, y: 370.4527612529582 }, { x: 401.74511972189896, y: 350.43750762939436 }, { x: 412.07142208989444, y: 328.2926807379538 }, { x: 418.3954358873965, y: 304.6911399379096 }, { x: 420.52500915527327, y: 280.3500061035155 }, { x: 418.3954358873965, y: 256.00887226912135 }, { x: 412.07142208989444, y: 232.4073314690773 }, { x: 401.74511972189896, y: 210.2625045776366 }, { x: 387.73028825550034, y: 190.2472509540728 }, { x: 370.4527612529582, y: 172.9697239515307 }, { x: 350.4375076293944, y: 158.95489248513212 }, { x: 328.29268073795384, y: 148.62859011713658 }, { x: 304.69113993790967, y: 142.30457631963455 }, { x: 280.3500061035155, y: 140.17500305175776 }, { x: 256.0088722691214, y: 142.30457631963455 }, { x: 232.40733146907735, y: 148.62859011713653 }, { x: 210.2625045776366, y: 158.9548924851321 }, { x: 190.2472509540728, y: 172.96972395153068 }, { x: 172.9697239515307, y: 190.24725095407274 }, { x: 158.95489248513212, y: 210.26250457763658 }, { x: 148.62859011713655, y: 232.4073314690773 }, { x: 142.30457631963458, y: 256.00887226912124 }, { x: 140.17500305175776, y: 280.35000610351545 }],
                    name: "circle"
                }, {
                    points: [{ x: 280.3500061035155, y: 420.52500915527327 }, { x: 304.6911399379096, y: 418.3954358873965 }, { x: 328.29268073795373, y: 412.07142208989444 }, { x: 350.43750762939436, y: 401.74511972189896 }, { x: 370.4527612529582, y: 387.73028825550034 }, { x: 387.73028825550034, y: 370.4527612529582 }, { x: 401.74511972189896, y: 350.43750762939436 }, { x: 412.07142208989444, y: 328.2926807379538 }, { x: 418.3954358873965, y: 304.6911399379096 }, { x: 420.52500915527327, y: 280.3500061035155 }, { x: 418.3954358873965, y: 256.00887226912135 }, { x: 412.07142208989444, y: 232.4073314690773 }, { x: 401.74511972189896, y: 210.2625045776366 }, { x: 387.73028825550034, y: 190.2472509540728 }, { x: 370.4527612529582, y: 172.9697239515307 }, { x: 350.4375076293944, y: 158.95489248513212 }, { x: 328.29268073795384, y: 148.62859011713658 }, { x: 304.69113993790967, y: 142.30457631963455 }, { x: 280.3500061035155, y: 140.17500305175776 }, { x: 256.0088722691214, y: 142.30457631963455 }, { x: 232.40733146907735, y: 148.62859011713653 }, { x: 210.2625045776366, y: 158.9548924851321 }, { x: 190.2472509540728, y: 172.96972395153068 }, { x: 172.9697239515307, y: 190.24725095407274 }, { x: 158.95489248513212, y: 210.26250457763658 }, { x: 148.62859011713655, y: 232.4073314690773 }, { x: 142.30457631963458, y: 256.00887226912124 }, { x: 140.17500305175776, y: 280.35000610351545 }, { x: 142.30457631963455, y: 304.6911399379096 }, { x: 148.62859011713658, y: 328.2926807379538 }, { x: 158.954892485132, y: 350.4375076293943 }, { x: 172.96972395153068, y: 370.4527612529582 }, { x: 190.24725095407274, y: 387.7302882555003 }, { x: 210.26250457763666, y: 401.74511972189896 }, { x: 232.40733146907718, y: 412.07142208989444 }, { x: 256.00887226912135, y: 418.3954358873965 }, { x: 280.35000610351545, y: 420.52500915527327 }],
                    name: "circle"
                }, {
                    points: [{ x: 280.3500061035155, y: 140.17500305175776 }, { x: 304.6911399379096, y: 142.30457631963455 }, { x: 328.29268073795373, y: 148.62859011713655 }, { x: 350.43750762939436, y: 158.95489248513206 }, { x: 370.4527612529582, y: 172.96972395153068 }, { x: 387.73028825550034, y: 190.24725095407277 }, { x: 401.74511972189896, y: 210.26250457763666 }, { x: 412.07142208989444, y: 232.40733146907723 }, { x: 418.3954358873965, y: 256.0088722691214 }, { x: 420.52500915527327, y: 280.3500061035155 }, { x: 418.3954358873965, y: 304.69113993790967 }, { x: 412.07142208989444, y: 328.29268073795373 }, { x: 401.74511972189896, y: 350.4375076293944 }, { x: 387.73028825550034, y: 370.4527612529582 }, { x: 370.4527612529582, y: 387.73028825550034 }, { x: 350.4375076293944, y: 401.7451197218989 }, { x: 328.29268073795384, y: 412.07142208989444 }, { x: 304.69113993790967, y: 418.3954358873965 }, { x: 280.3500061035155, y: 420.52500915527327 }, { x: 256.0088722691214, y: 418.3954358873965 }, { x: 232.40733146907735, y: 412.0714220898945 }, { x: 210.2625045776366, y: 401.74511972189896 }, { x: 190.2472509540728, y: 387.73028825550034 }, { x: 172.9697239515307, y: 370.4527612529583 }, { x: 158.95489248513212, y: 350.4375076293944 }, { x: 148.62859011713655, y: 328.29268073795373 }, { x: 142.30457631963458, y: 304.6911399379098 }, { x: 140.17500305175776, y: 280.35000610351557 }, { x: 142.30457631963455, y: 256.0088722691214 }, { x: 148.62859011713658, y: 232.40733146907723 }, { x: 158.954892485132, y: 210.26250457763672 }, { x: 172.96972395153068, y: 190.2472509540728 }, { x: 190.24725095407274, y: 172.96972395153074 }, { x: 210.26250457763666, y: 158.95489248513206 }, { x: 232.40733146907718, y: 148.6285901171366 }, { x: 256.00887226912135, y: 142.30457631963455 }, { x: 280.35000610351545, y: 140.17500305175776 }],
                    name: "circle"
                }, {
                    points: [{ x: 280.3500061035155, y: 140.17500305175776 }, { x: 256.0088722691214, y: 142.30457631963455 }, { x: 232.4073314690773, y: 148.62859011713655 }, { x: 210.26250457763666, y: 158.95489248513206 }, { x: 190.2472509540728, y: 172.96972395153068 }, { x: 172.9697239515307, y: 190.24725095407277 }, { x: 158.95489248513206, y: 210.26250457763666 }, { x: 148.62859011713658, y: 232.40733146907723 }, { x: 142.30457631963455, y: 256.0088722691214 }, { x: 140.17500305175776, y: 280.3500061035155 }, { x: 142.30457631963455, y: 304.69113993790967 }, { x: 148.62859011713655, y: 328.29268073795373 }, { x: 158.9548924851321, y: 350.4375076293944 }, { x: 172.96972395153068, y: 370.4527612529582 }, { x: 190.24725095407277, y: 387.73028825550034 }, { x: 210.26250457763658, y: 401.7451197218989 }, { x: 232.40733146907718, y: 412.07142208989444 }, { x: 256.00887226912135, y: 418.3954358873965 }, { x: 280.3500061035155, y: 420.52500915527327 }, { x: 304.6911399379096, y: 418.3954358873965 }, { x: 328.2926807379537, y: 412.0714220898945 }, { x: 350.4375076293944, y: 401.74511972189896 }, { x: 370.4527612529582, y: 387.73028825550034 }, { x: 387.73028825550034, y: 370.4527612529583 }, { x: 401.7451197218989, y: 350.4375076293944 }, { x: 412.07142208989444, y: 328.29268073795373 }, { x: 418.39543588739645, y: 304.6911399379098 }, { x: 420.52500915527327, y: 280.35000610351557 }, { x: 418.3954358873965, y: 256.0088722691214 }, { x: 412.07142208989444, y: 232.40733146907723 }, { x: 401.745119721899, y: 210.26250457763672 }, { x: 387.73028825550034, y: 190.2472509540728 }, { x: 370.4527612529583, y: 172.96972395153074 }, { x: 350.43750762939436, y: 158.95489248513206 }, { x: 328.29268073795384, y: 148.6285901171366 }, { x: 304.69113993790967, y: 142.30457631963455 }, { x: 280.35000610351557, y: 140.17500305175776 }],
                    name: "circle"
                }, {
                    points: [{ x: 280.3500061035155, y: 420.52500915527327 }, { x: 256.0088722691214, y: 418.3954358873965 }, { x: 232.4073314690773, y: 412.07142208989444 }, { x: 210.26250457763666, y: 401.74511972189896 }, { x: 190.2472509540728, y: 387.73028825550034 }, { x: 172.9697239515307, y: 370.4527612529582 }, { x: 158.95489248513206, y: 350.43750762939436 }, { x: 148.62859011713658, y: 328.2926807379538 }, { x: 142.30457631963455, y: 304.6911399379096 }, { x: 140.17500305175776, y: 280.3500061035155 }, { x: 142.30457631963455, y: 256.00887226912135 }, { x: 148.62859011713655, y: 232.4073314690773 }, { x: 158.9548924851321, y: 210.2625045776366 }, { x: 172.96972395153068, y: 190.2472509540728 }, { x: 190.24725095407277, y: 172.9697239515307 }, { x: 210.26250457763658, y: 158.95489248513212 }, { x: 232.40733146907718, y: 148.62859011713658 }, { x: 256.00887226912135, y: 142.30457631963455 }, { x: 280.3500061035155, y: 140.17500305175776 }, { x: 304.6911399379096, y: 142.30457631963455 }, { x: 328.2926807379537, y: 148.62859011713653 }, { x: 350.4375076293944, y: 158.9548924851321 }, { x: 370.4527612529582, y: 172.96972395153068 }, { x: 387.73028825550034, y: 190.24725095407274 }, { x: 401.7451197218989, y: 210.26250457763658 }, { x: 412.07142208989444, y: 232.4073314690773 }, { x: 418.39543588739645, y: 256.00887226912124 }, { x: 420.52500915527327, y: 280.35000610351545 }, { x: 418.3954358873965, y: 304.6911399379096 }, { x: 412.07142208989444, y: 328.2926807379538 }, { x: 401.745119721899, y: 350.4375076293943 }, { x: 387.73028825550034, y: 370.4527612529582 }, { x: 370.4527612529583, y: 387.7302882555003 }, { x: 350.43750762939436, y: 401.74511972189896 }, { x: 328.29268073795384, y: 412.07142208989444 }, { x: 304.69113993790967, y: 418.3954358873965 }, { x: 280.35000610351557, y: 420.52500915527327 }],
                    name: "circle"
                }];

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
            });
        }, {}], 6: [function (require, module, exports) {
            "use strict";
            // Packaging and re-exporting of prague UI framework

            Object.defineProperty(exports, "__esModule", { value: true });
            var ui = require("../ui");
            exports.ui = ui;
            var controls = require("../controls");
            exports.controls = controls;
        }, { "../controls": 17, "../ui": 41 }], 7: [function (require, module, exports) {
            "use strict";

            Object.defineProperty(exports, "__esModule", { value: true });
            var ui = require("../ui");
            /**
             * Stack panel
             */

            var Button = function (_ui$Component) {
                _inherits(Button, _ui$Component);

                function Button(element, desiredSize, classList) {
                    var _button$classList;

                    _classCallCheck(this, Button);

                    var _this = _possibleConstructorReturn(this, (Button.__proto__ || Object.getPrototypeOf(Button)).call(this, element));

                    _this.desiredSize = desiredSize;
                    var button = document.createElement("button");
                    (_button$classList = button.classList).add.apply(_button$classList, _toConsumableArray(classList));
                    element.appendChild(button);
                    button.onclick = function (mouseEvent) {
                        _this.emit("click", mouseEvent);
                    };
                    return _this;
                }
                /**
                 * Returns a size whose height is capped to the max child height
                 */


                _createClass(Button, [{
                    key: "measure",
                    value: function measure(size) {
                        return {
                            height: Math.min(size.height, this.desiredSize.height),
                            width: Math.min(size.width, this.desiredSize.width)
                        };
                    }
                }]);

                return Button;
            }(ui.Component);

            exports.Button = Button;
        }, { "../ui": 41 }], 8: [function (require, module, exports) {
            "use strict";

            var __awaiter = this && this.__awaiter || function (thisArg, _arguments, P, generator) {
                return new (P || (P = Promise))(function (resolve, reject) {
                    function fulfilled(value) {
                        try {
                            step(generator.next(value));
                        } catch (e) {
                            reject(e);
                        }
                    }
                    function rejected(value) {
                        try {
                            step(generator["throw"](value));
                        } catch (e) {
                            reject(e);
                        }
                    }
                    function step(result) {
                        result.done ? resolve(result.value) : new P(function (resolve) {
                            resolve(result.value);
                        }).then(fulfilled, rejected);
                    }
                    step((generator = generator.apply(thisArg, _arguments || [])).next());
                });
            };
            Object.defineProperty(exports, "__esModule", { value: true });
            var ui = require("../ui");

            var Chart = function (_ui$Component2) {
                _inherits(Chart, _ui$Component2);

                function Chart(element, cell) {
                    _classCallCheck(this, Chart);

                    var _this2 = _possibleConstructorReturn(this, (Chart.__proto__ || Object.getPrototypeOf(Chart)).call(this, element));

                    _this2.cell = cell;
                    _this2.lastSize = { width: -1, height: -1 };
                    // tslint:disable-next-line:no-string-literal
                    var Microsoft = typeof window !== "undefined" ? window["Microsoft"] : undefined;
                    var DefaultHost = Microsoft && Microsoft.Charts ? new Microsoft.Charts.Host({ base: "https://charts.microsoft.com" }) : null;
                    _this2.chart = new Microsoft.Charts.Chart(DefaultHost, element);
                    _this2.chart.setRenderer(Microsoft.Charts.IvyRenderer.Svg);
                    _this2.cell.on("valueChanged", function () {
                        _this2.invalidateChart();
                    });
                    return _this2;
                }

                _createClass(Chart, [{
                    key: "resizeCore",
                    value: function resizeCore(rectangle) {
                        if (rectangle.width !== this.lastSize.width || rectangle.height !== this.lastSize.height) {
                            this.lastSize.width = rectangle.width;
                            this.lastSize.height = rectangle.height;
                            this.invalidateChart();
                        }
                    }
                }, {
                    key: "getChartConfiguration",
                    value: function getChartConfiguration() {
                        return __awaiter(this, void 0, void 0, /*#__PURE__*/regeneratorRuntime.mark(function _callee() {
                            var config, size;
                            return regeneratorRuntime.wrap(function _callee$(_context) {
                                while (1) {
                                    switch (_context.prev = _context.next) {
                                        case 0:
                                            _context.next = 2;
                                            return this.cell.get();

                                        case 2:
                                            config = _context.sent;

                                            if (config) {
                                                _context.next = 7;
                                                break;
                                            }

                                            return _context.abrupt("return", null);

                                        case 7:
                                            size = this.size.size;

                                            config.size = size;
                                            return _context.abrupt("return", config);

                                        case 10:
                                        case "end":
                                            return _context.stop();
                                    }
                                }
                            }, _callee, this);
                        }));
                    }
                }, {
                    key: "invalidateChart",
                    value: function invalidateChart() {
                        var _this3 = this;

                        this.getChartConfiguration().then(function (config) {
                            if (config) {
                                _this3.chart.setConfiguration(config);
                            }
                        });
                    }
                }]);

                return Chart;
            }(ui.Component);

            exports.Chart = Chart;
        }, { "../ui": 41 }], 9: [function (require, module, exports) {
            (function (global) {
                "use strict";

                Object.defineProperty(exports, "__esModule", { value: true });
                var client_api_1 = typeof window !== "undefined" ? window['prague'] : typeof global !== "undefined" ? global['prague'] : null;
                exports.debug = client_api_1.debug("routerlicious:controls");
            }).call(this, typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {});
        }, {}], 10: [function (require, module, exports) {
            "use strict";

            Object.defineProperty(exports, "__esModule", { value: true });
            var ui = require("../ui");
            /**
             * Basic dock panel control
             */

            var DockPanel = function (_ui$Component3) {
                _inherits(DockPanel, _ui$Component3);

                function DockPanel(element) {
                    _classCallCheck(this, DockPanel);

                    return _possibleConstructorReturn(this, (DockPanel.__proto__ || Object.getPrototypeOf(DockPanel)).call(this, element));
                }

                _createClass(DockPanel, [{
                    key: "addContent",
                    value: function addContent(content) {
                        this.content = content;
                        this.updateChildren();
                    }
                }, {
                    key: "addBottom",
                    value: function addBottom(bottom) {
                        this.bottom = bottom;
                        this.updateChildren();
                    }
                }, {
                    key: "addTop",
                    value: function addTop(top) {
                        this.top = top;
                        this.updateChildren();
                    }
                }, {
                    key: "resizeCore",
                    value: function resizeCore(bounds) {
                        var bottomOffset = 0;
                        if (this.bottom) {
                            var result = this.bottom.measure(bounds.size);
                            bottomOffset = result.height;
                        }
                        var topOffset = 0;
                        if (this.top) {
                            var _result = this.top.measure(bounds.size);
                            topOffset = _result.height;
                        }
                        var split = bounds.nipVertTopBottom(topOffset, bottomOffset);
                        this.updateChildBoundsIfExists(this.top, split[0]);
                        this.updateChildBoundsIfExists(this.content, split[1]);
                        this.updateChildBoundsIfExists(this.bottom, split[2]);
                    }
                    /**
                     * Updates the list of children and then forces a resize
                     */

                }, {
                    key: "updateChildren",
                    value: function updateChildren() {
                        this.removeAllChildren();
                        ui.removeAllChildren(this.element);
                        this.addChildIfExists(this.content);
                        this.addChildIfExists(this.bottom);
                        this.addChildIfExists(this.top);
                        this.resizeCore(this.size);
                    }
                }, {
                    key: "addChildIfExists",
                    value: function addChildIfExists(child) {
                        if (child) {
                            this.addChild(child);
                            this.element.appendChild(child.element);
                        }
                    }
                }, {
                    key: "updateChildBoundsIfExists",
                    value: function updateChildBoundsIfExists(child, bounds) {
                        if (child) {
                            bounds.conformElement(child.element);
                            child.resize(bounds);
                        }
                    }
                }]);

                return DockPanel;
            }(ui.Component);

            exports.DockPanel = DockPanel;
        }, { "../ui": 41 }], 11: [function (require, module, exports) {
            "use strict";

            var __awaiter = this && this.__awaiter || function (thisArg, _arguments, P, generator) {
                return new (P || (P = Promise))(function (resolve, reject) {
                    function fulfilled(value) {
                        try {
                            step(generator.next(value));
                        } catch (e) {
                            reject(e);
                        }
                    }
                    function rejected(value) {
                        try {
                            step(generator["throw"](value));
                        } catch (e) {
                            reject(e);
                        }
                    }
                    function step(result) {
                        result.done ? resolve(result.value) : new P(function (resolve) {
                            resolve(result.value);
                        }).then(fulfilled, rejected);
                    }
                    step((generator = generator.apply(thisArg, _arguments || [])).next());
                });
            };
            Object.defineProperty(exports, "__esModule", { value: true });
            var ui = require("../ui");
            /**
             * Basic collaborative video player
             */

            var FlexVideo = function (_ui$Component4) {
                _inherits(FlexVideo, _ui$Component4);

                function FlexVideo(element, vid, videoRoot) {
                    _classCallCheck(this, FlexVideo);

                    var _this5 = _possibleConstructorReturn(this, (FlexVideo.__proto__ || Object.getPrototypeOf(FlexVideo)).call(this, element));

                    _this5.videoRoot = videoRoot;
                    _this5.video = document.createElement("video");
                    _this5.video.src = vid;
                    _this5.video.controls = true;
                    _this5.video.width = 320;
                    _this5.video.height = 240;
                    _this5.video.autoplay = false;
                    _this5.video.poster = "https://i.pinimg.com/originals/1b/2d/d0/1b2dd03413192c57f8a097969d67d861.jpg";
                    element.appendChild(_this5.video);
                    _this5.setEventHandlers();
                    return _this5;
                }

                _createClass(FlexVideo, [{
                    key: "setEventHandlers",
                    value: function setEventHandlers() {
                        return __awaiter(this, void 0, void 0, /*#__PURE__*/regeneratorRuntime.mark(function _callee3() {
                            var _this6 = this;

                            return regeneratorRuntime.wrap(function _callee3$(_context3) {
                                while (1) {
                                    switch (_context3.prev = _context3.next) {
                                        case 0:
                                            _context3.next = 2;
                                            return this.videoRoot;

                                        case 2:
                                            this.videoMap = _context3.sent;
                                            _context3.next = 5;
                                            return this.videoMap.getView();

                                        case 5:
                                            this.videoMapView = _context3.sent;

                                            this.video.onplay = function () {
                                                return _this6.handlePlay();
                                            };
                                            this.video.onpause = function () {
                                                return _this6.handlePause();
                                            };
                                            this.video.ontimeupdate = function () {
                                                return _this6.handleTimeUpdate();
                                            };
                                            this.video.onload = function () {
                                                return _this6.handleLoad();
                                            };
                                            this.videoMap.on("valueChanged", function (changedValue) {
                                                return __awaiter(_this6, void 0, void 0, /*#__PURE__*/regeneratorRuntime.mark(function _callee2() {
                                                    return regeneratorRuntime.wrap(function _callee2$(_context2) {
                                                        while (1) {
                                                            switch (_context2.prev = _context2.next) {
                                                                case 0:
                                                                    _context2.t0 = changedValue.key;
                                                                    _context2.next = _context2.t0 === "play" ? 3 : _context2.t0 === "time" ? 5 : 7;
                                                                    break;

                                                                case 3:
                                                                    this.updatePlay(this.videoMapView.get(changedValue.key));
                                                                    return _context2.abrupt("break", 9);

                                                                case 5:
                                                                    this.updateTime(this.videoMapView.get(changedValue.key));
                                                                    return _context2.abrupt("break", 9);

                                                                case 7:
                                                                    console.log("default: " + changedValue.key);
                                                                    return _context2.abrupt("break", 9);

                                                                case 9:
                                                                case "end":
                                                                    return _context2.stop();
                                                            }
                                                        }
                                                    }, _callee2, this);
                                                }));
                                            });

                                        case 11:
                                        case "end":
                                            return _context3.stop();
                                    }
                                }
                            }, _callee3, this);
                        }));
                    }
                }, {
                    key: "updatePlay",
                    value: function updatePlay(play) {
                        if (play) {
                            if (this.video.paused) {
                                this.video.play();
                            }
                        } else {
                            if (!this.video.paused) {
                                this.video.pause();
                            }
                        }
                    }
                }, {
                    key: "updateTime",
                    value: function updateTime(time) {
                        if (Math.abs(this.video.currentTime - time) > 2) {
                            this.video.currentTime = time;
                        }
                    }
                }, {
                    key: "handleLoad",
                    value: function handleLoad() {
                        var _this7 = this;

                        this.videoMap.get("time").then(function (time) {
                            _this7.video.currentTime = time;
                        });
                        this.videoMap.get("play").then(function (play) {
                            _this7.updatePlay(play);
                        });
                    }
                }, {
                    key: "handleTimeUpdate",
                    value: function handleTimeUpdate() {
                        this.videoMap.set("time", this.video.currentTime);
                    }
                }, {
                    key: "handlePlay",
                    value: function handlePlay() {
                        this.videoMap.set("play", true);
                    }
                }, {
                    key: "handlePause",
                    value: function handlePause() {
                        this.videoMap.set("play", false);
                    }
                }]);

                return FlexVideo;
            }(ui.Component);

            exports.FlexVideo = FlexVideo;
        }, { "../ui": 41 }], 12: [function (require, module, exports) {
            "use strict";

            var __awaiter = this && this.__awaiter || function (thisArg, _arguments, P, generator) {
                return new (P || (P = Promise))(function (resolve, reject) {
                    function fulfilled(value) {
                        try {
                            step(generator.next(value));
                        } catch (e) {
                            reject(e);
                        }
                    }
                    function rejected(value) {
                        try {
                            step(generator["throw"](value));
                        } catch (e) {
                            reject(e);
                        }
                    }
                    function step(result) {
                        result.done ? resolve(result.value) : new P(function (resolve) {
                            resolve(result.value);
                        }).then(fulfilled, rejected);
                    }
                    step((generator = generator.apply(thisArg, _arguments || [])).next());
                });
            };
            Object.defineProperty(exports, "__esModule", { value: true });
            var ui = require("../ui");
            var flexVideo_1 = require("./flexVideo");
            /**
             * flex video app
             */

            var FlexVideoCanvas = function (_ui$Component5) {
                _inherits(FlexVideoCanvas, _ui$Component5);

                function FlexVideoCanvas(element, doc, root) {
                    _classCallCheck(this, FlexVideoCanvas);

                    var _this8 = _possibleConstructorReturn(this, (FlexVideoCanvas.__proto__ || Object.getPrototypeOf(FlexVideoCanvas)).call(this, element));

                    var videoFrame = document.createElement("div");
                    element.appendChild(videoFrame);
                    _this8.video = new flexVideo_1.FlexVideo(videoFrame, "http://video.webmfiles.org/big-buck-bunny_trailer.webm", _this8.fetchVideoRoot(root, doc));
                    _this8.addChild(_this8.video);
                    return _this8;
                }

                _createClass(FlexVideoCanvas, [{
                    key: "fetchVideoRoot",
                    value: function fetchVideoRoot(root, doc) {
                        return __awaiter(this, void 0, void 0, /*#__PURE__*/regeneratorRuntime.mark(function _callee4() {
                            var hasVideo;
                            return regeneratorRuntime.wrap(function _callee4$(_context4) {
                                while (1) {
                                    switch (_context4.prev = _context4.next) {
                                        case 0:
                                            _context4.next = 2;
                                            return root.has("video");

                                        case 2:
                                            hasVideo = _context4.sent;

                                            if (!hasVideo) {
                                                root.set("video", doc.createMap());
                                            }
                                            return _context4.abrupt("return", root.get("video"));

                                        case 5:
                                        case "end":
                                            return _context4.stop();
                                    }
                                }
                            }, _callee4, this);
                        }));
                    }
                }]);

                return FlexVideoCanvas;
            }(ui.Component);

            exports.FlexVideoCanvas = FlexVideoCanvas;
        }, { "../ui": 41, "./flexVideo": 11 }], 13: [function (require, module, exports) {
            "use strict";

            var __awaiter = this && this.__awaiter || function (thisArg, _arguments, P, generator) {
                return new (P || (P = Promise))(function (resolve, reject) {
                    function fulfilled(value) {
                        try {
                            step(generator.next(value));
                        } catch (e) {
                            reject(e);
                        }
                    }
                    function rejected(value) {
                        try {
                            step(generator["throw"](value));
                        } catch (e) {
                            reject(e);
                        }
                    }
                    function step(result) {
                        result.done ? resolve(result.value) : new P(function (resolve) {
                            resolve(result.value);
                        }).then(fulfilled, rejected);
                    }
                    step((generator = generator.apply(thisArg, _arguments || [])).next());
                });
            };
            Object.defineProperty(exports, "__esModule", { value: true });
            var ui = require("../ui");
            var button_1 = require("./button");
            var chart_1 = require("./chart");
            var debug_1 = require("./debug");
            var dockPanel_1 = require("./dockPanel");
            var inkCanvas_1 = require("./inkCanvas");
            var popup_1 = require("./popup");
            var stackPanel_1 = require("./stackPanel");
            var colors = [{ r: 253 / 255, g: 0 / 255, b: 12 / 255, a: 1 }, { r: 134 / 255, g: 0 / 255, b: 56 / 255, a: 1 }, { r: 253 / 255, g: 187 / 255, b: 48 / 255, a: 1 }, { r: 255 / 255, g: 255 / 255, b: 81 / 255, a: 1 }, { r: 0 / 255, g: 45 / 255, b: 98 / 255, a: 1 }, { r: 255 / 255, g: 255 / 255, b: 255 / 255, a: 1 }, { r: 246 / 255, g: 83 / 255, b: 20 / 255, a: 1 }, { r: 0 / 255, g: 161 / 255, b: 241 / 255, a: 1 }, { r: 124 / 255, g: 187 / 255, b: 0 / 255, a: 1 }, { r: 8 / 255, g: 170 / 255, b: 51 / 255, a: 1 }, { r: 0 / 255, g: 0 / 255, b: 0 / 255, a: 1 }];
            /**
             * Canvas app
             */

            var FlexView = function (_ui$Component6) {
                _inherits(FlexView, _ui$Component6);

                function FlexView(element, doc, root) {
                    _classCallCheck(this, FlexView);

                    var _this9 = _possibleConstructorReturn(this, (FlexView.__proto__ || Object.getPrototypeOf(FlexView)).call(this, element));

                    _this9.components = [];
                    var dockElement = document.createElement("div");
                    element.appendChild(dockElement);
                    _this9.dock = new dockPanel_1.DockPanel(dockElement);
                    _this9.addChild(_this9.dock);
                    // Add the ink canvas to the dock
                    var inkCanvasElement = document.createElement("div");
                    if (!root.has("ink")) {
                        root.set("ink", doc.createInk());
                    }
                    _this9.ink = new inkCanvas_1.InkCanvas(inkCanvasElement, root.get("ink"));
                    _this9.dock.addContent(_this9.ink);
                    var stackPanelElement = document.createElement("div");
                    var buttonSize = { width: 50, height: 50 };
                    var stackPanel = new stackPanel_1.StackPanel(stackPanelElement, stackPanel_1.Orientation.Horizontal, ["navbar-prague"]);
                    _this9.colorButton = new button_1.Button(document.createElement("div"), buttonSize, ["btn", "btn-palette", "prague-icon-pencil"]);
                    var replayButton = new button_1.Button(document.createElement("div"), buttonSize, ["btn", "btn-palette", "prague-icon-replay"]);
                    stackPanel.addChild(_this9.colorButton);
                    stackPanel.addChild(replayButton);
                    _this9.dock.addBottom(stackPanel);
                    replayButton.on("click", function (event) {
                        debug_1.debug("Replay button click");
                        _this9.ink.replay();
                    });
                    _this9.colorButton.on("click", function (event) {
                        debug_1.debug("Color button click");
                        _this9.popup.toggle();
                    });
                    // These should turn into components
                    _this9.colorStack = new stackPanel_1.StackPanel(document.createElement("div"), stackPanel_1.Orientation.Vertical, []);

                    var _loop = function _loop(color) {
                        var buttonElement = document.createElement("div");
                        buttonElement.style.backgroundColor = ui.toColorString(color);
                        var button = new button_1.Button(buttonElement, { width: 200, height: 50 }, ["btn-flat"]);
                        _this9.colorStack.addChild(button);
                        button.on("click", function (event) {
                            _this9.ink.setPenColor(color);
                            _this9.popup.toggle();
                        });
                    };

                    var _iteratorNormalCompletion = true;
                    var _didIteratorError = false;
                    var _iteratorError = undefined;

                    try {
                        for (var _iterator = colors[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                            var color = _step.value;

                            _loop(color);
                        }
                        // Popup to display the colors
                    } catch (err) {
                        _didIteratorError = true;
                        _iteratorError = err;
                    } finally {
                        try {
                            if (!_iteratorNormalCompletion && _iterator.return) {
                                _iterator.return();
                            }
                        } finally {
                            if (_didIteratorError) {
                                throw _iteratorError;
                            }
                        }
                    }

                    _this9.popup = new popup_1.Popup(document.createElement("div"));
                    _this9.popup.addContent(_this9.colorStack);
                    _this9.addChild(_this9.popup);
                    _this9.element.appendChild(_this9.popup.element);
                    // UI components on the flex view
                    if (!root.has("components")) {
                        root.set("components", doc.createMap());
                    }
                    _this9.processComponents(root.get("components"));
                    return _this9;
                }

                _createClass(FlexView, [{
                    key: "resizeCore",
                    value: function resizeCore(bounds) {
                        // Update the base ink dock
                        bounds.conformElement(this.dock.element);
                        this.dock.resize(bounds);
                        // Layout component windows
                        var _iteratorNormalCompletion2 = true;
                        var _didIteratorError2 = false;
                        var _iteratorError2 = undefined;

                        try {
                            for (var _iterator2 = this.components[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
                                var component = _step2.value;

                                var componentRect = new ui.Rectangle(component.position.x, component.position.y, component.size.width, component.size.height);
                                componentRect.conformElement(component.component.element);
                                component.component.resize(componentRect);
                            }
                            // Size the color swatch popup
                        } catch (err) {
                            _didIteratorError2 = true;
                            _iteratorError2 = err;
                        } finally {
                            try {
                                if (!_iteratorNormalCompletion2 && _iterator2.return) {
                                    _iterator2.return();
                                }
                            } finally {
                                if (_didIteratorError2) {
                                    throw _iteratorError2;
                                }
                            }
                        }

                        var colorButtonRect = ui.Rectangle.fromClientRect(this.colorButton.element.getBoundingClientRect());
                        var popupSize = this.popup.measure(bounds);
                        var rect = new ui.Rectangle(colorButtonRect.x, colorButtonRect.y - popupSize.height, popupSize.width, popupSize.height);
                        rect.conformElement(this.popup.element);
                        this.popup.resize(rect);
                    }
                }, {
                    key: "processComponents",
                    value: function processComponents(components) {
                        return __awaiter(this, void 0, void 0, /*#__PURE__*/regeneratorRuntime.mark(function _callee5() {
                            var _this10 = this;

                            var view, _iteratorNormalCompletion3, _didIteratorError3, _iteratorError3, _iterator3, _step3, componentName, component;

                            return regeneratorRuntime.wrap(function _callee5$(_context5) {
                                while (1) {
                                    switch (_context5.prev = _context5.next) {
                                        case 0:
                                            _context5.next = 2;
                                            return components.getView();

                                        case 2:
                                            view = _context5.sent;

                                            // Pull in all the objects on the canvas
                                            // tslint:disable-next-line:forin
                                            _iteratorNormalCompletion3 = true;
                                            _didIteratorError3 = false;
                                            _iteratorError3 = undefined;
                                            _context5.prev = 6;
                                            for (_iterator3 = view.keys()[Symbol.iterator](); !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
                                                componentName = _step3.value;
                                                component = view.get(componentName);

                                                this.addComponent(component);
                                            }
                                            _context5.next = 14;
                                            break;

                                        case 10:
                                            _context5.prev = 10;
                                            _context5.t0 = _context5["catch"](6);
                                            _didIteratorError3 = true;
                                            _iteratorError3 = _context5.t0;

                                        case 14:
                                            _context5.prev = 14;
                                            _context5.prev = 15;

                                            if (!_iteratorNormalCompletion3 && _iterator3.return) {
                                                _iterator3.return();
                                            }

                                        case 17:
                                            _context5.prev = 17;

                                            if (!_didIteratorError3) {
                                                _context5.next = 20;
                                                break;
                                            }

                                            throw _iteratorError3;

                                        case 20:
                                            return _context5.finish(17);

                                        case 21:
                                            return _context5.finish(14);

                                        case 22:
                                            components.on("valueChanged", function (event) {
                                                if (view.has(event.key)) {
                                                    _this10.addComponent(view.get(event.key));
                                                }
                                            });

                                        case 23:
                                        case "end":
                                            return _context5.stop();
                                    }
                                }
                            }, _callee5, this, [[6, 10, 14, 22], [15,, 17, 21]]);
                        }));
                    }
                }, {
                    key: "addComponent",
                    value: function addComponent(component) {
                        return __awaiter(this, void 0, void 0, /*#__PURE__*/regeneratorRuntime.mark(function _callee6() {
                            var details, size, position, chart;
                            return regeneratorRuntime.wrap(function _callee6$(_context6) {
                                while (1) {
                                    switch (_context6.prev = _context6.next) {
                                        case 0:
                                            _context6.next = 2;
                                            return component.getView();

                                        case 2:
                                            details = _context6.sent;

                                            if (!(details.get("type") !== "chart")) {
                                                _context6.next = 5;
                                                break;
                                            }

                                            return _context6.abrupt("return");

                                        case 5:
                                            size = details.get("size");
                                            position = details.get("position");
                                            chart = new chart_1.Chart(document.createElement("div"), details.get("data"));

                                            this.components.push({ size: size, position: position, component: chart });
                                            this.element.insertBefore(chart.element, this.element.lastChild);
                                            this.addChild(chart);
                                            this.resizeCore(this.size);

                                        case 12:
                                        case "end":
                                            return _context6.stop();
                                    }
                                }
                            }, _callee6, this);
                        }));
                    }
                }]);

                return FlexView;
            }(ui.Component);

            exports.FlexView = FlexView;
        }, { "../ui": 41, "./button": 7, "./chart": 8, "./debug": 9, "./dockPanel": 10, "./inkCanvas": 18, "./popup": 21, "./stackPanel": 27 }], 14: [function (require, module, exports) {
            (function (global) {
                "use strict";

                var __awaiter = this && this.__awaiter || function (thisArg, _arguments, P, generator) {
                    return new (P || (P = Promise))(function (resolve, reject) {
                        function fulfilled(value) {
                            try {
                                step(generator.next(value));
                            } catch (e) {
                                reject(e);
                            }
                        }
                        function rejected(value) {
                            try {
                                step(generator["throw"](value));
                            } catch (e) {
                                reject(e);
                            }
                        }
                        function step(result) {
                            result.done ? resolve(result.value) : new P(function (resolve) {
                                resolve(result.value);
                            }).then(fulfilled, rejected);
                        }
                        step((generator = generator.apply(thisArg, _arguments || [])).next());
                    });
                };
                Object.defineProperty(exports, "__esModule", { value: true });
                var client_api_1 = typeof window !== "undefined" ? window['prague'] : typeof global !== "undefined" ? global['prague'] : null;
                var ui = require("../ui");
                var debug_1 = require("./debug");
                var dockPanel_1 = require("./dockPanel");
                var flowView_1 = require("./flowView");
                var inkCanvas_1 = require("./inkCanvas");
                var layerPanel_1 = require("./layerPanel");
                var overlayCanvas_1 = require("./overlayCanvas");
                var status_1 = require("./status");
                var title_1 = require("./title");

                var FlowContainer = function (_ui$Component7) {
                    _inherits(FlowContainer, _ui$Component7);

                    function FlowContainer(element, collabDocument, sharedString, overlayMap, image, ink) {
                        var options = arguments.length > 6 && arguments[6] !== undefined ? arguments[6] : undefined;

                        _classCallCheck(this, FlowContainer);

                        var _this11 = _possibleConstructorReturn(this, (FlowContainer.__proto__ || Object.getPrototypeOf(FlowContainer)).call(this, element));

                        _this11.collabDocument = collabDocument;
                        _this11.overlayMap = overlayMap;
                        _this11.image = image;
                        _this11.options = options;
                        _this11.layerCache = {};
                        _this11.activeLayers = {};
                        // TODO the below code is becoming controller like and probably doesn't belong in a constructor. Likely
                        // a better API model.
                        // Title bar at the top
                        var titleDiv = document.createElement("div");
                        _this11.title = new title_1.Title(titleDiv);
                        _this11.title.setTitle(collabDocument.id);
                        _this11.title.setBackgroundColor(collabDocument.id);
                        // Status bar at the bottom
                        var statusDiv = document.createElement("div");
                        statusDiv.style.borderTop = "1px solid gray";
                        _this11.status = new status_1.Status(statusDiv);
                        // FlowView holds the text
                        var flowViewDiv = document.createElement("div");
                        flowViewDiv.classList.add("flow-view");
                        _this11.flowView = new flowView_1.FlowView(flowViewDiv, collabDocument, sharedString, _this11.status, _this11.options);
                        // Create the optional full ink canvas
                        var inkCanvas = ink ? new inkCanvas_1.InkCanvas(document.createElement("div"), ink) : null;
                        if (inkCanvas) {
                            inkCanvas.enableInkHitTest(false);
                        }
                        // Layer panel lets us put the overlay canvas on top of the text
                        var layerPanelDiv = document.createElement("div");
                        _this11.layerPanel = new layerPanel_1.LayerPanel(layerPanelDiv);
                        // Overlay canvas for ink
                        var overlayCanvasDiv = document.createElement("div");
                        overlayCanvasDiv.classList.add("overlay-canvas");
                        _this11.overlayCanvas = new overlayCanvas_1.OverlayCanvas(collabDocument, overlayCanvasDiv, layerPanelDiv);
                        _this11.overlayCanvas.on("ink", function (layer, model, start) {
                            _this11.overlayCanvas.enableInkHitTest(false);
                            var position = _this11.flowView.getNearestPosition(start);
                            _this11.overlayCanvas.enableInkHitTest(true);
                            var location = _this11.flowView.getPositionLocation(position);
                            var cursorOffset = {
                                x: start.x - location.x,
                                y: start.y - location.y
                            };
                            _this11.layerCache[model.id] = layer;
                            _this11.activeLayers[model.id] = { layer: layer, active: true, cursorOffset: cursorOffset };
                            overlayMap.set(model.id, model);
                            // Inserts the marker at the flow view's cursor position
                            sharedString.insertMarker(position, client_api_1.MergeTree.MarkerBehaviors.None, _defineProperty({}, client_api_1.MergeTree.reservedMarkerIdKey, model.id));
                        });
                        _this11.status.on("dry", function (value) {
                            debug_1.debug("Drying a layer");
                        });
                        // Update the scroll bar
                        _this11.flowView.on("render", function (renderInfo) {
                            var showScrollBar = renderInfo.range.min !== renderInfo.viewportStartPos || renderInfo.range.max !== renderInfo.viewportEndPos;
                            _this11.layerPanel.showScrollBar(showScrollBar);
                            _this11.layerPanel.scrollBar.setRange(renderInfo.range);
                            _this11.markLayersInactive();
                            var _iteratorNormalCompletion4 = true;
                            var _didIteratorError4 = false;
                            var _iteratorError4 = undefined;

                            try {
                                for (var _iterator4 = renderInfo.overlayMarkers[Symbol.iterator](), _step4; !(_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done); _iteratorNormalCompletion4 = true) {
                                    var marker = _step4.value;

                                    _this11.addLayer(marker);
                                }
                            } catch (err) {
                                _didIteratorError4 = true;
                                _iteratorError4 = err;
                            } finally {
                                try {
                                    if (!_iteratorNormalCompletion4 && _iterator4.return) {
                                        _iterator4.return();
                                    }
                                } finally {
                                    if (_didIteratorError4) {
                                        throw _iteratorError4;
                                    }
                                }
                            }

                            _this11.pruneInactiveLayers();
                        });
                        _this11.status.addOption("ink", "ink");
                        _this11.status.on("ink", function (value) {
                            _this11.overlayCanvas.enableInk(value);
                            if (inkCanvas) {
                                inkCanvas.enableInkHitTest(value);
                            }
                        });
                        var spellOption = "spellchecker";
                        var spellcheckOn = _this11.options === undefined || _this11.options[spellOption] !== "disabled" ? true : false;
                        _this11.status.addOption("spellcheck", "spellcheck", spellcheckOn);
                        _this11.status.on("spellcheck", function (value) {
                            _this11.initSpellcheck(value);
                        });
                        // For now only allow one level deep of branching
                        _this11.status.addButton("Versions", "/sharedText/" + _this11.collabDocument.id + "/commits", false);
                        if (!_this11.collabDocument.parentBranch) {
                            _this11.status.addButton("Branch", "/sharedText/" + _this11.collabDocument.id + "/fork", true);
                        }
                        // Add children to the panel once we have both
                        _this11.layerPanel.addChild(_this11.flowView);
                        _this11.layerPanel.addChild(_this11.overlayCanvas);
                        if (inkCanvas) {
                            _this11.layerPanel.addChild(inkCanvas);
                        }
                        _this11.dockPanel = new dockPanel_1.DockPanel(element);
                        _this11.addChild(_this11.dockPanel);
                        // Use the dock panel to layout the viewport - layer panel as the content and then status bar at the bottom
                        _this11.dockPanel.addTop(_this11.title);
                        _this11.dockPanel.addContent(_this11.layerPanel);
                        _this11.dockPanel.addBottom(_this11.status);
                        // Intelligence image
                        image.element.style.visibility = "hidden";
                        _this11.addChild(image);
                        element.appendChild(image.element);
                        return _this11;
                    }

                    _createClass(FlowContainer, [{
                        key: "trackInsights",
                        value: function trackInsights(insights) {
                            var _this12 = this;

                            this.updateInsights(insights);
                            insights.on("valueChanged", function () {
                                _this12.updateInsights(insights);
                            });
                        }
                    }, {
                        key: "resizeCore",
                        value: function resizeCore(bounds) {
                            bounds.conformElement(this.dockPanel.element);
                            this.dockPanel.resize(bounds);
                            if (this.image) {
                                var overlayRect = bounds.inner4(0.7, 0.05, 0.2, 0.1);
                                overlayRect.conformElement(this.image.element);
                                this.image.resize(overlayRect);
                            }
                        }
                    }, {
                        key: "addLayer",
                        value: function addLayer(marker) {
                            return __awaiter(this, void 0, void 0, /*#__PURE__*/regeneratorRuntime.mark(function _callee7() {
                                var id, position, location, ink, layer, _layer, activeLayer, bounds, translated;

                                return regeneratorRuntime.wrap(function _callee7$(_context7) {
                                    while (1) {
                                        switch (_context7.prev = _context7.next) {
                                            case 0:
                                                id = marker.id;
                                                position = marker.position;
                                                location = this.flowView.getPositionLocation(position);
                                                // TODO the async nature of this may cause rendering pauses - and in general the layer should already
                                                // exist. Should just make this a sync call.
                                                // Mark true prior to the async work

                                                if (this.activeLayers[id]) {
                                                    this.activeLayers[id].active = true;
                                                }
                                                _context7.next = 6;
                                                return this.overlayMap.get(id);

                                            case 6:
                                                ink = _context7.sent;

                                                if (!(id in this.layerCache)) {
                                                    layer = new overlayCanvas_1.InkLayer(this.size, ink);

                                                    this.layerCache[id] = layer;
                                                }
                                                if (!(id in this.activeLayers)) {
                                                    _layer = this.layerCache[id];

                                                    this.overlayCanvas.addLayer(_layer);
                                                    this.activeLayers[id] = {
                                                        active: true,
                                                        layer: _layer,
                                                        cursorOffset: { x: 0, y: 0 }
                                                    };
                                                }
                                                activeLayer = this.activeLayers[id];
                                                // Add in any cursor offset

                                                location.x += activeLayer.cursorOffset.x;
                                                location.y += activeLayer.cursorOffset.y;
                                                // Translate from global to local coordinates
                                                bounds = this.flowView.element.getBoundingClientRect();
                                                translated = { x: location.x - bounds.left, y: location.y - bounds.top };
                                                // Update the position unless we're in the process of drawing the layer

                                                this.activeLayers[id].layer.setPosition(translated);

                                            case 15:
                                            case "end":
                                                return _context7.stop();
                                        }
                                    }
                                }, _callee7, this);
                            }));
                        }
                    }, {
                        key: "updateInsights",
                        value: function updateInsights(insights) {
                            return __awaiter(this, void 0, void 0, /*#__PURE__*/regeneratorRuntime.mark(function _callee8() {
                                var view, resume, probability, analytics, sentimentEmoji;
                                return regeneratorRuntime.wrap(function _callee8$(_context8) {
                                    while (1) {
                                        switch (_context8.prev = _context8.next) {
                                            case 0:
                                                _context8.next = 2;
                                                return insights.getView();

                                            case 2:
                                                view = _context8.sent;

                                                if (view.has("ResumeAnalytics") && this.image) {
                                                    resume = view.get("ResumeAnalytics");
                                                    probability = parseFloat(resume.resumeAnalyticsResult);

                                                    if (probability !== 1 && probability > 0.7) {
                                                        this.image.setMessage(Math.round(probability * 100) + "% sure I found a resume!");
                                                        this.image.element.style.visibility = "visible";
                                                    }
                                                }
                                                if (view.has("TextAnalytics")) {
                                                    analytics = view.get("TextAnalytics");

                                                    if (analytics.language) {
                                                        this.status.add("li", analytics.language);
                                                    }
                                                    if (analytics.sentiment) {
                                                        sentimentEmoji = analytics.sentiment > 0.7 ? "🙂" : analytics.sentiment < 0.3 ? "🙁" : "😐";

                                                        this.status.add("si", sentimentEmoji);
                                                    }
                                                }

                                            case 5:
                                            case "end":
                                                return _context8.stop();
                                        }
                                    }
                                }, _callee8, this);
                            }));
                        }
                    }, {
                        key: "markLayersInactive",
                        value: function markLayersInactive() {
                            // tslint:disable-next-line:forin
                            for (var layer in this.activeLayers) {
                                this.activeLayers[layer].active = false;
                            }
                        }
                    }, {
                        key: "pruneInactiveLayers",
                        value: function pruneInactiveLayers() {
                            // tslint:disable-next-line:forin
                            for (var layerId in this.activeLayers) {
                                if (!this.activeLayers[layerId].active) {
                                    var layer = this.activeLayers[layerId];
                                    delete this.activeLayers[layerId];
                                    this.overlayCanvas.removeLayer(layer.layer);
                                }
                            }
                        }
                    }, {
                        key: "initSpellcheck",
                        value: function initSpellcheck(value) {
                            if (value) {
                                this.flowView.setViewOption({
                                    spellchecker: "enabled"
                                });
                            } else {
                                this.flowView.setViewOption({
                                    spellchecker: "disabled"
                                });
                            }
                            this.flowView.render();
                        }
                    }]);

                    return FlowContainer;
                }(ui.Component);

                exports.FlowContainer = FlowContainer;
            }).call(this, typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {});
        }, { "../ui": 41, "./debug": 9, "./dockPanel": 10, "./flowView": 15, "./inkCanvas": 18, "./layerPanel": 19, "./overlayCanvas": 20, "./status": 28, "./title": 29 }], 15: [function (require, module, exports) {
            (function (global) {
                "use strict";

                Object.defineProperty(exports, "__esModule", { value: true });
                // tslint:disable:no-bitwise whitespace
                var performanceNow = require("performance-now");
                var client_api_1 = typeof window !== "undefined" ? window['prague'] : typeof global !== "undefined" ? global['prague'] : null;
                var merge_tree_utils_1 = require("../merge-tree-utils");
                var ui = require("../ui");
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
                var viewOptions = void 0;
                function namesToItems(names) {
                    var items = new Array(names.length);
                    for (var i = 0, len = names.length; i < len; i++) {
                        items[i] = { key: names[i] };
                    }
                    return items;
                }
                exports.namesToItems = namesToItems;
                function altsToItems(alts) {
                    return alts.map(function (v) {
                        return { key: v.text };
                    });
                }
                function selectionListBoxCreate(textRect, container, itemHeight, offsetY, varHeight) {
                    var listContainer = document.createElement("div");
                    var _items = void 0;
                    var itemCapacity = void 0;
                    var selectionIndex = -1;
                    var topSelection = 0;
                    init();
                    return {
                        elm: listContainer,
                        getSelectedKey: getSelectedKey,
                        hide: function hide() {
                            listContainer.style.visibility = "hidden";
                        },
                        items: function items() {
                            return _items;
                        },
                        prevItem: prevItem,
                        nextItem: nextItem,
                        removeHighlight: removeHighlight,
                        selectItem: selectItemByKey,
                        show: function show() {
                            listContainer.style.visibility = "visible";
                        },
                        showSelectionList: showSelectionList
                    };
                    function selectItemByKey(key) {
                        key = key.trim();
                        if (selectionIndex >= 0) {
                            if (_items[selectionIndex].key === key) {
                                return;
                            }
                        }
                        for (var i = 0, len = _items.length; i < len; i++) {
                            if (_items[i].key === key) {
                                selectItem(i);
                                break;
                            }
                        }
                    }
                    function getSelectedKey() {
                        if (selectionIndex >= 0) {
                            return _items[selectionIndex].key;
                        }
                    }
                    function prevItem() {
                        if (selectionIndex > 0) {
                            selectItem(selectionIndex - 1);
                        }
                    }
                    function nextItem() {
                        if (selectionIndex < _items.length - 1) {
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
                        var width = textRect.width;
                        var height = window.innerHeight / 3;
                        var top = void 0;
                        var bottom = void 0;
                        var right = void 0;
                        if (textRect.x + textRect.width > window.innerWidth) {
                            right = textRect.x;
                        }
                        // TODO: use container div instead of window/doc body
                        // TODO: right/left (for now assume go right)
                        if (height + textRect.y + offsetY + textRect.height >= window.innerHeight) {
                            bottom = window.innerHeight - textRect.y;
                        } else {
                            top = textRect.y + textRect.height;
                        }
                        itemCapacity = Math.floor(height / itemHeight);
                        if (top !== undefined) {
                            var listContainerRect = new ui.Rectangle(textRect.x, top, width, height);
                            listContainerRect.height = itemCapacity * itemHeight;
                            listContainerRect.conformElementMaxHeight(listContainer);
                        } else {
                            var _listContainerRect = new ui.Rectangle(textRect.x, 0, width, height);
                            _listContainerRect.height = itemCapacity * itemHeight;
                            _listContainerRect.conformElementMaxHeightFromBottom(listContainer, bottom);
                        }
                        if (right !== undefined) {
                            listContainer.style.right = window.innerWidth - right + "px";
                            listContainer.style.left = "";
                        }
                        if (varHeight) {
                            listContainer.style.paddingBottom = varHeight + "px";
                        }
                    }
                    function removeHighlight() {
                        if (selectionIndex >= 0) {
                            if (_items[selectionIndex].div) {
                                _items[selectionIndex].div.style.backgroundColor = "white";
                            }
                        }
                    }
                    function selectItem(indx) {
                        // then scroll if necessary
                        if (indx < topSelection) {
                            topSelection = indx;
                        } else if (indx - topSelection >= itemCapacity) {
                            topSelection = indx - itemCapacity + 1;
                        }
                        if (selectionIndex !== indx) {
                            selectionIndex = indx;
                            updateSelectionList();
                        }
                    }
                    function makeItemDiv(i, div) {
                        var item = _items[i];
                        var itemDiv = div;
                        itemDiv.style.fontSize = "18px";
                        itemDiv.style.fontFamily = "Segoe UI";
                        itemDiv.style.lineHeight = itemHeight + "px";
                        itemDiv.style.whiteSpace = "pre";
                        _items[i].div = itemDiv;
                        var itemSpan = document.createElement("span");
                        itemSpan.innerText = "  " + item.key;
                        itemDiv.appendChild(itemSpan);
                        if (item.iconURL) {
                            var icon = document.createElement("img");
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
                        _items = selectionItems;
                        clearSubtree(listContainer);
                        selectionIndex = -1;
                        if (selectionItems.length === 0) {
                            return;
                        }
                        updateSelectionList();
                        if (hintSelection) {
                            selectItemByKey(hintSelection);
                        } else {
                            selectItem(0);
                        }
                    }
                    function updateSelectionList() {
                        clearSubtree(listContainer);
                        var len = _items.length;
                        for (var i = 0; i < itemCapacity; i++) {
                            var indx = i + topSelection;
                            if (indx === len) {
                                break;
                            } else {
                                var item = _items[indx];
                                if (!item.div) {
                                    item.div = document.createElement("div");
                                    listContainer.appendChild(item.div);
                                    makeItemDiv(indx, item.div);
                                } else {
                                    listContainer.appendChild(item.div);
                                }
                                if (indx === selectionIndex) {
                                    item.div.style.backgroundColor = "#aaaaff";
                                } else {
                                    item.div.style.backgroundColor = "white";
                                }
                            }
                        }
                    }
                }
                exports.selectionListBoxCreate = selectionListBoxCreate;
                function elmOffToSegOff(elmOff, span) {
                    if (elmOff.elm !== span && elmOff.elm.parentElement !== span) {
                        console.log("did not hit span");
                    }
                    var offset = elmOff.offset;
                    var prevSib = elmOff.node.previousSibling;
                    if (!prevSib && elmOff.elm !== span) {
                        prevSib = elmOff.elm.previousSibling;
                    }
                    while (prevSib) {
                        switch (prevSib.nodeType) {
                            case Node.ELEMENT_NODE:
                                var innerSpan = prevSib;
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
                var cachedCanvas = void 0;
                var baseURI = typeof document !== "undefined" ? document.location.origin : "";
                var underlineStringURL = "url(\"" + baseURI + "/public/images/underline.gif\") bottom repeat-x";
                var underlinePaulStringURL = "url(\"" + baseURI + "/public/images/underline-paul.gif\") bottom repeat-x";
                var underlinePaulGrammarStringURL = "url(\"" + baseURI + "/public/images/underline-paulgrammar.gif\") bottom repeat-x";
                var underlinePaulGoldStringURL = "url(\"" + baseURI + "/public/images/underline-gold.gif\") bottom repeat-x";
                function getTextWidth(text, font) {
                    // re-use canvas object for better performance
                    var canvas = cachedCanvas || (cachedCanvas = document.createElement("canvas"));
                    var context = canvas.getContext("2d");
                    context.font = font;
                    var metrics = context.measureText(text);
                    return metrics.width;
                }
                function getMultiTextWidth(texts, font) {
                    // re-use canvas object for better performance
                    var canvas = cachedCanvas || (cachedCanvas = document.createElement("canvas"));
                    var context = canvas.getContext("2d");
                    context.font = font;
                    var sum = 0;
                    var _iteratorNormalCompletion5 = true;
                    var _didIteratorError5 = false;
                    var _iteratorError5 = undefined;

                    try {
                        for (var _iterator5 = texts[Symbol.iterator](), _step5; !(_iteratorNormalCompletion5 = (_step5 = _iterator5.next()).done); _iteratorNormalCompletion5 = true) {
                            var text = _step5.value;

                            var metrics = context.measureText(text);
                            sum += metrics.width;
                        }
                    } catch (err) {
                        _didIteratorError5 = true;
                        _iteratorError5 = err;
                    } finally {
                        try {
                            if (!_iteratorNormalCompletion5 && _iterator5.return) {
                                _iterator5.return();
                            }
                        } finally {
                            if (_didIteratorError5) {
                                throw _iteratorError5;
                            }
                        }
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
                    return { type: ParagraphItemType.Block, width: width, text: text, textSegment: textSegment };
                }
                function makeGlue(width, text, textSegment, stretch, shrink) {
                    return { type: ParagraphItemType.Glue, width: width, text: text, textSegment: textSegment, stretch: stretch, shrink: shrink };
                }
                // for now assume uniform line widths
                function breakPGIntoLinesFF(items, lineWidth) {
                    var breaks = [0];
                    var posInPG = 0;
                    var committedItemsWidth = 0;
                    var blockRunWidth = 0;
                    var blockRunPos = -1;
                    var prevIsGlue = true;
                    var _iteratorNormalCompletion6 = true;
                    var _didIteratorError6 = false;
                    var _iteratorError6 = undefined;

                    try {
                        for (var _iterator6 = items[Symbol.iterator](), _step6; !(_iteratorNormalCompletion6 = (_step6 = _iterator6.next()).done); _iteratorNormalCompletion6 = true) {
                            var item = _step6.value;

                            if (item.type === ParagraphItemType.Block) {
                                if (prevIsGlue) {
                                    blockRunPos = posInPG;
                                    blockRunWidth = 0;
                                }
                                if (committedItemsWidth + item.width > lineWidth) {
                                    breaks.push(blockRunPos);
                                    committedItemsWidth = blockRunWidth;
                                }
                                posInPG += item.text.length;
                                if (committedItemsWidth > lineWidth) {
                                    breaks.push(posInPG);
                                    committedItemsWidth = 0;
                                    blockRunWidth = 0;
                                    blockRunPos = posInPG;
                                } else {
                                    blockRunWidth += item.width;
                                }
                                prevIsGlue = false;
                            } else if (item.type === ParagraphItemType.Glue) {
                                posInPG++;
                                prevIsGlue = true;
                            }
                            committedItemsWidth += item.width;
                        }
                    } catch (err) {
                        _didIteratorError6 = true;
                        _iteratorError6 = err;
                    } finally {
                        try {
                            if (!_iteratorNormalCompletion6 && _iterator6.return) {
                                _iterator6.return();
                            }
                        } finally {
                            if (_didIteratorError6) {
                                throw _iteratorError6;
                            }
                        }
                    }

                    return breaks;
                }

                var ParagraphLexer = function () {
                    function ParagraphLexer(tokenAction, actionContext) {
                        _classCallCheck(this, ParagraphLexer);

                        this.tokenAction = tokenAction;
                        this.actionContext = actionContext;
                        this.state = 0 /* AccumBlockChars */;
                        this.spaceCount = 0;
                        this.textBuf = "";
                    }

                    _createClass(ParagraphLexer, [{
                        key: "reset",
                        value: function reset() {
                            this.state = 0 /* AccumBlockChars */;
                            this.spaceCount = 0;
                            this.textBuf = "";
                            this.leadSegment = undefined;
                        }
                    }, {
                        key: "lex",
                        value: function lex(textSegment) {
                            if (this.leadSegment && !this.leadSegment.matchProperties(textSegment)) {
                                this.emit();
                                this.leadSegment = textSegment;
                            } else if (!this.leadSegment) {
                                this.leadSegment = textSegment;
                            }
                            var segText = textSegment.text;
                            for (var i = 0, len = segText.length; i < len; i++) {
                                var c = segText.charAt(i);
                                if (c === " ") {
                                    if (this.state === 0 /* AccumBlockChars */) {
                                            this.emitBlock();
                                        }
                                    this.state = 1 /* AccumSpaces */;
                                    this.spaceCount++;
                                } else {
                                    if (this.state === 1 /* AccumSpaces */) {
                                            this.emitGlue();
                                        }
                                    this.state = 0 /* AccumBlockChars */;
                                    this.textBuf += c;
                                }
                            }
                            this.emit();
                        }
                    }, {
                        key: "emit",
                        value: function emit() {
                            if (this.state === 0 /* AccumBlockChars */) {
                                    this.emitBlock();
                                } else {
                                this.emitGlue();
                            }
                        }
                    }, {
                        key: "emitGlue",
                        value: function emitGlue() {
                            if (this.spaceCount > 0) {
                                this.tokenAction(client_api_1.MergeTree.internedSpaces(this.spaceCount), ParagraphItemType.Glue, this.leadSegment, this.actionContext);
                                this.spaceCount = 0;
                            }
                        }
                    }, {
                        key: "emitBlock",
                        value: function emitBlock() {
                            if (this.textBuf.length > 0) {
                                this.tokenAction(this.textBuf, ParagraphItemType.Block, this.leadSegment, this.actionContext);
                                this.textBuf = "";
                            }
                        }
                    }]);

                    return ParagraphLexer;
                }();
                // global until remove old render


                var textErrorRun = void 0;
                function buildDocumentContext(viewportDiv) {
                    var fontstr = "18px Times";
                    viewportDiv.style.font = fontstr;
                    var headerFontstr = "22px Times";
                    var wordSpacing = getTextWidth(" ", fontstr);
                    var headerDivHeight = 32;
                    var computedStyle = window.getComputedStyle(viewportDiv);
                    var defaultLineHeight = 1.2;
                    var h = parseInt(computedStyle.fontSize, 10);
                    var defaultLineDivHeight = Math.round(h * defaultLineHeight);
                    var pgVspace = Math.round(h * 0.5);
                    var boxVspace = 3;
                    var tableVspace = pgVspace;
                    var boxTopMargin = 3;
                    var boxHMargin = 3;
                    var indentWidthThreshold = 600;
                    return {
                        fontstr: fontstr, headerFontstr: headerFontstr, wordSpacing: wordSpacing, headerDivHeight: headerDivHeight, defaultLineDivHeight: defaultLineDivHeight,
                        pgVspace: pgVspace, boxVspace: boxVspace, boxHMargin: boxHMargin, boxTopMargin: boxTopMargin, tableVspace: tableVspace, indentWidthThreshold: indentWidthThreshold
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
                    if (!presenceInfo || presenceInfo.fresh) {
                        if (lineContext.deferredAttach) {
                            addToRerenderList(lineContext);
                        } else {
                            if (lineContext.span) {
                                var cursorBounds = lineContext.span.getBoundingClientRect();
                                var lineDivBounds = lineContext.lineDiv.getBoundingClientRect();
                                var cursorX = cursorBounds.width + (cursorBounds.left - lineDivBounds.left);
                                if (!presenceInfo) {
                                    lineContext.flowView.cursor.assignToLine(cursorX, lineContext.lineDivHeight, lineContext.lineDiv);
                                } else {
                                    showPresence(cursorX, lineContext, presenceInfo);
                                }
                            } else {
                                if (lineContext.lineDiv.indentWidth !== undefined) {
                                    if (!presenceInfo) {
                                        lineContext.flowView.cursor.assignToLine(lineContext.lineDiv.indentWidth, lineContext.lineDivHeight, lineContext.lineDiv);
                                    } else {
                                        showPresence(lineContext.lineDiv.indentWidth, lineContext, presenceInfo);
                                    }
                                } else {
                                    if (!presenceInfo) {
                                        lineContext.flowView.cursor.assignToLine(0, lineContext.lineDivHeight, lineContext.lineDiv);
                                    } else {
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
                    } else {
                        lineContext.reRenderList.push(lineContext.lineDiv);
                    }
                }
                function showPositionInLine(lineContext, textStartPos, text, cursorPos, presenceInfo) {
                    if (!presenceInfo || presenceInfo.fresh) {
                        if (lineContext.deferredAttach) {
                            addToRerenderList(lineContext);
                        } else {
                            var posX = void 0;
                            var lineDivBounds = lineContext.lineDiv.getBoundingClientRect();
                            if (cursorPos > textStartPos) {
                                var preCursorText = text.substring(0, cursorPos - textStartPos);
                                var temp = lineContext.span.innerText;
                                lineContext.span.innerText = preCursorText;
                                var cursorBounds = lineContext.span.getBoundingClientRect();
                                posX = cursorBounds.width + (cursorBounds.left - lineDivBounds.left);
                                // console.log(`cbounds w ${cursorBounds.width} posX ${posX} ldb ${lineDivBounds.left}`);
                                lineContext.span.innerText = temp;
                            } else {
                                var _cursorBounds = lineContext.span.getBoundingClientRect();
                                posX = _cursorBounds.left - lineDivBounds.left;
                                // console.log(`cbounds whole l ${cursorBounds.left} posX ${posX} ldb ${lineDivBounds.left}`);
                            }
                            if (!presenceInfo) {
                                lineContext.flowView.cursor.assignToLine(posX, lineContext.lineDivHeight, lineContext.lineDiv);
                            } else {
                                showPresence(posX, lineContext, presenceInfo);
                            }
                        }
                    }
                }
                function endRenderSegments(marker) {
                    return marker.hasTileLabel("pg") || marker.hasRangeLabel("box") && marker.behaviors & client_api_1.MergeTree.MarkerBehaviors.RangeEnd;
                }
                function renderSegmentIntoLine(segment, segpos, refSeq, clientId, start, end, lineContext) {
                    if (lineContext.lineDiv.linePos === undefined) {
                        lineContext.lineDiv.linePos = segpos + start;
                        lineContext.lineDiv.lineEnd = lineContext.lineDiv.linePos;
                    }
                    var segType = segment.getType();
                    if (segType === client_api_1.MergeTree.SegmentType.Text) {
                        if (start < 0) {
                            start = 0;
                        }
                        if (end > segment.cachedLength) {
                            end = segment.cachedLength;
                        }
                        var textSegment = segment;
                        var text = textSegment.text.substring(start, end);
                        var textStartPos = segpos + start;
                        var textEndPos = segpos + end;
                        lineContext.span = makeSegSpan(lineContext.flowView, text, textSegment, start, segpos);
                        lineContext.contentDiv.appendChild(lineContext.span);
                        lineContext.lineDiv.lineEnd += text.length;
                        if (lineContext.flowView.cursor.pos >= textStartPos && lineContext.flowView.cursor.pos <= textEndPos) {
                            showPositionInLine(lineContext, textStartPos, text, lineContext.flowView.cursor.pos);
                        }
                        var presenceInfo = lineContext.flowView.presenceInfoInRange(textStartPos, textEndPos);
                        if (presenceInfo && presenceInfo.xformPos !== lineContext.flowView.cursor.pos) {
                            showPositionInLine(lineContext, textStartPos, text, presenceInfo.xformPos, presenceInfo);
                        }
                    } else if (segType === client_api_1.MergeTree.SegmentType.Marker) {
                        var marker = segment;
                        // console.log(`marker pos: ${segpos}`);
                        if (endRenderSegments(marker)) {
                            if (lineContext.flowView.cursor.pos === segpos) {
                                showPositionEndOfLine(lineContext);
                            } else {
                                var _presenceInfo = lineContext.flowView.presenceInfoInRange(segpos, segpos);
                                if (_presenceInfo) {
                                    showPositionEndOfLine(lineContext, _presenceInfo);
                                }
                            }
                            return false;
                        } else {
                            lineContext.lineDiv.lineEnd++;
                        }
                    }
                    return true;
                }
                function findLineDiv(pos, flowView) {
                    var dive = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : false;

                    return flowView.lineDivSelect(function (elm) {
                        if (elm.linePos <= pos && elm.lineEnd >= pos) {
                            return elm;
                        }
                    }, flowView.viewportDiv, dive);
                }
                function decorateLineDiv(lineDiv, lineFontstr, lineDivHeight) {
                    var indentSymbol = lineDiv.indentSymbol;
                    var indentFontstr = lineFontstr;
                    if (indentSymbol.font) {
                        indentFontstr = indentSymbol.font;
                    }
                    var em = Math.round(getTextWidth("M", lineFontstr));
                    var symbolWidth = getTextWidth(indentSymbol.text, indentFontstr);
                    var symbolDiv = makeContentDiv(new ui.Rectangle(lineDiv.indentWidth - Math.floor(em + symbolWidth), 0, symbolWidth, lineDivHeight), indentFontstr);
                    symbolDiv.innerText = indentSymbol.text;
                    lineDiv.appendChild(symbolDiv);
                }
                function reRenderLine(lineDiv, flowView) {
                    if (lineDiv) {
                        var outerViewportBounds = ui.Rectangle.fromClientRect(flowView.viewportDiv.getBoundingClientRect());
                        var lineDivBounds = lineDiv.getBoundingClientRect();
                        var lineDivHeight = lineDivBounds.height;
                        clearSubtree(lineDiv);
                        var contentDiv = lineDiv;
                        if (lineDiv.indentSymbol) {
                            decorateLineDiv(lineDiv, lineDiv.style.font, lineDivHeight);
                        }
                        if (lineDiv.indentWidth) {
                            contentDiv = makeContentDiv(new ui.Rectangle(lineDiv.indentWidth, 0, lineDiv.contentWidth, lineDivHeight), lineDiv.style.font);
                            lineDiv.appendChild(contentDiv);
                        }
                        var lineContext = {
                            contentDiv: contentDiv,
                            flowView: flowView,
                            lineDiv: lineDiv,
                            lineDivHeight: lineDivHeight,
                            markerPos: 0,
                            pgMarker: undefined,
                            span: undefined,
                            outerViewportBounds: outerViewportBounds
                        };
                        var lineEnd = lineDiv.lineEnd;
                        var end = lineEnd;
                        if (end === lineDiv.linePos) {
                            end++;
                        }
                        flowView.client.mergeTree.mapRange({ leaf: renderSegmentIntoLine }, client_api_1.MergeTree.UniversalSequenceNumber, flowView.client.getClientId(), lineContext, lineDiv.linePos, end);
                        lineDiv.lineEnd = lineEnd;
                    }
                }
                var randomIndent = false;
                function getIndentPct(pgMarker) {
                    if (pgMarker.properties && pgMarker.properties.indentLevel !== undefined) {
                        return pgMarker.properties.indentLevel * 0.05;
                    } else if (pgMarker.properties && pgMarker.properties.blockquote) {
                        return 0.10;
                    } else {
                        if (randomIndent) {
                            return 0.2 * Math.random();
                        } else {
                            return 0.0;
                        }
                    }
                }
                function getIndentSymbol(pgMarker) {
                    var indentLevel = pgMarker.properties.indentLevel;
                    indentLevel = indentLevel % pgMarker.listHeadCache.series.length;
                    var series = pgMarker.listHeadCache.series[indentLevel];
                    var seriesSource = listSeries;
                    if (pgMarker.properties.listKind === 1) {
                        seriesSource = symbolSeries;
                    }
                    series = series % seriesSource.length;
                    return seriesSource[series](pgMarker.listCache.itemCounts[indentLevel]);
                }
                function getPrecedingTile(flowView, tile, tilePos, label, filter, precedingTileCache) {
                    if (precedingTileCache) {
                        for (var i = precedingTileCache.length - 1; i >= 0; i--) {
                            var candidate = precedingTileCache[i];
                            if (filter(candidate.tile)) {
                                return candidate;
                            }
                        }
                    }
                    while (tilePos > 0) {
                        tilePos = tilePos - 1;
                        var prevTileInfo = findTile(flowView, tilePos, label);
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
                function alphaSuffix(itemIndex, suffix) {
                    var little = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : false;

                    var code = itemIndex - 1 + CharacterCodes.A;
                    if (little) {
                        code += 32;
                    }
                    var prefix = String.fromCharCode(code);
                    return { text: prefix + suffix };
                }
                // TODO: more than 10
                var romanNumbers = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
                function roman(itemIndex) {
                    var little = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;

                    var text = romanNumbers[itemIndex - 1] + ".";
                    if (little) {
                        text = text.toLowerCase();
                    }
                    return { text: text };
                }
                // let wingdingLetters = ["l", "m", "n", "R", "S", "T", "s","w"];
                var unicodeBullets = ["\u2022", "\u25E6", "\u25AA", "\u2731", "\u272F", "\u2729", "\u273F", "\u2745", "\u2739", "\u2720", "\u2722"];
                function itemSymbols(itemIndex, indentLevel) {
                    //    let wingdingLetter = wingdingLetters[indentLevel - 1];
                    var wingdingLetter = unicodeBullets[indentLevel - 1];
                    //    return { text: wingdingLetter, font: "12px Wingdings" };
                    return { text: wingdingLetter };
                }
                var listSeries = [function (itemIndex) {
                    return numberSuffix(itemIndex, ".");
                }, function (itemIndex) {
                    return numberSuffix(itemIndex, ")");
                }, function (itemIndex) {
                    return alphaSuffix(itemIndex, ".", true);
                }, function (itemIndex) {
                    return alphaSuffix(itemIndex, ")", true);
                }, function (itemIndex) {
                    return alphaSuffix(itemIndex, ".");
                }, function (itemIndex) {
                    return alphaSuffix(itemIndex, ")");
                }, function (itemIndex) {
                    return roman(itemIndex, true);
                }, function (itemIndex) {
                    return roman(itemIndex);
                }];
                var symbolSeries = [function (itemIndex) {
                    return itemSymbols(itemIndex, 1);
                }, function (itemIndex) {
                    return itemSymbols(itemIndex, 2);
                }, function (itemIndex) {
                    return itemSymbols(itemIndex, 3);
                }, function (itemIndex) {
                    return itemSymbols(itemIndex, 4);
                }, function (itemIndex) {
                    return itemSymbols(itemIndex, 5);
                }, function (itemIndex) {
                    return itemSymbols(itemIndex, 6);
                }, function (itemIndex) {
                    return itemSymbols(itemIndex, 7);
                }, function (itemIndex) {
                    return itemSymbols(itemIndex, 8);
                }, function (itemIndex) {
                    return itemSymbols(itemIndex, 9);
                }, function (itemIndex) {
                    return itemSymbols(itemIndex, 10);
                }, function (itemIndex) {
                    return itemSymbols(itemIndex, 11);
                }];
                function convertToListHead(tile) {
                    tile.listHeadCache = {
                        series: tile.properties.series,
                        tile: tile
                    };
                    tile.listCache = { itemCounts: [0, 1] };
                }
                /**
                 * maximum number of characters before a preceding list paragraph deemed irrelevant
                 */
                var maxListDistance = 400;
                function getListCacheInfo(flowView, tile, tilePos, precedingTileCache) {
                    if (isListTile(tile)) {
                        if (tile.listCache === undefined) {
                            if (tile.properties.series) {
                                convertToListHead(tile);
                            } else {
                                var listKind = tile.properties.listKind;
                                var precedingTilePos = getPrecedingTile(flowView, tile, tilePos, "list", function (t) {
                                    return isListTile(t) && t.properties.listKind === listKind;
                                }, precedingTileCache);
                                if (precedingTilePos && tilePos - precedingTilePos.pos < maxListDistance) {
                                    getListCacheInfo(flowView, precedingTilePos.tile, precedingTilePos.pos, precedingTileCache);
                                    var precedingTile = precedingTilePos.tile;
                                    tile.listHeadCache = precedingTile.listHeadCache;
                                    var indentLevel = tile.properties.indentLevel;
                                    var precedingItemCount = precedingTile.listCache.itemCounts[indentLevel];
                                    var itemCounts = precedingTile.listCache.itemCounts.slice();
                                    if (indentLevel < itemCounts.length) {
                                        itemCounts[indentLevel] = precedingItemCount + 1;
                                    } else {
                                        itemCounts[indentLevel] = 1;
                                    }
                                    for (var i = indentLevel + 1; i < itemCounts.length; i++) {
                                        itemCounts[i] = 0;
                                    }
                                    tile.listCache = { itemCounts: itemCounts };
                                } else {
                                    // doesn't race because re-render is deferred
                                    var series = void 0;
                                    if (tile.properties.listKind === 0) {
                                        series = [0, 0, 2, 6, 3, 7, 2, 6, 3, 7];
                                    } else {
                                        series = [0, 0, 1, 2, 0, 1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 4, 5, 6];
                                    }
                                    flowView.sharedString.annotateRange({ series: series }, tilePos, tilePos + 1);
                                    convertToListHead(tile);
                                }
                            }
                        }
                    }
                }
                function getContentPct(pgMarker) {
                    if (pgMarker.properties && pgMarker.properties.contentWidth) {
                        return pgMarker.properties.contentWidth;
                    } else if (pgMarker.properties && pgMarker.properties.blockquote) {
                        return 0.8;
                    } else {
                        if (randomIndent) {
                            return 0.5 + 0.5 * Math.random();
                        } else {
                            return 1.0;
                        }
                    }
                }
                function makeContentDiv(r, lineFontstr) {
                    var contentDiv = document.createElement("div");
                    contentDiv.style.font = lineFontstr;
                    contentDiv.style.whiteSpace = "pre";
                    contentDiv.onclick = function (e) {
                        var targetDiv = e.target;
                        if (targetDiv.lastElementChild) {
                            // tslint:disable-next-line:max-line-length
                            console.log("div click at " + e.clientX + "," + e.clientY + " rightmost span with text " + targetDiv.lastElementChild.innerHTML);
                        }
                    };
                    r.conformElement(contentDiv);
                    return contentDiv;
                }
                var tableIdSuffix = 0;
                var boxIdSuffix = 0;
                var rowIdSuffix = 0;
                function createMarkerOp(pos1, id, behaviors, rangeLabels, tileLabels) {
                    var props = {};
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
                        marker: { behaviors: behaviors },
                        pos1: pos1,
                        props: props,
                        type: 0 /* INSERT */
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
                var endPrefix = "end-";
                function createBox(opList, idBase, pos, word) {
                    var boxId = idBase + ("box" + boxIdSuffix++);
                    opList.push(createMarkerOp(pos, boxId, client_api_1.MergeTree.MarkerBehaviors.RangeBegin, ["box"]));
                    pos++;
                    if (word) {
                        var insertStringOp = {
                            pos1: pos,
                            text: word,
                            type: 0 /* INSERT */
                        };
                        opList.push(insertStringOp);
                        pos += word.length;
                    }
                    var pgOp = createMarkerOp(pos, boxId + "C", client_api_1.MergeTree.MarkerBehaviors.Tile, [], ["pg"]);
                    opList.push(pgOp);
                    pos++;
                    opList.push(createMarkerOp(pos, endPrefix + boxId, client_api_1.MergeTree.MarkerBehaviors.RangeEnd, ["box"]));
                    pos++;
                    return pos;
                }
                function createTable(pos, flowView) {
                    var nrows = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 3;
                    var nboxes = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : 3;

                    var pgAtStart = true;
                    if (pos > 0) {
                        var segoff = flowView.client.mergeTree.getContainingSegment(pos - 1, client_api_1.MergeTree.UniversalSequenceNumber, flowView.client.getClientId());
                        if (segoff.segment.getType() === client_api_1.MergeTree.SegmentType.Marker) {
                            var marker = segoff.segment;
                            if (marker.hasTileLabel("pg")) {
                                pgAtStart = false;
                            }
                        }
                    }
                    var content = ["aardvark", "racoon", "jackelope", "springbok", "tiger", "lion", "eland", "anaconda", "fox"];
                    var idBase = flowView.client.longClientId;
                    idBase += "T" + tableIdSuffix++;
                    var opList = [];
                    if (pgAtStart) {
                        // TODO: copy pg properties from pg marker after pos
                        var pgOp = createMarkerOp(pos, "", client_api_1.MergeTree.MarkerBehaviors.Tile, [], ["pg"]);
                        opList.push(pgOp);
                        pos++;
                    }
                    opList.push(createMarkerOp(pos, idBase, client_api_1.MergeTree.MarkerBehaviors.RangeBegin, ["table"]));
                    pos++;
                    for (var row = 0; row < nrows; row++) {
                        var rowId = idBase + ("row" + rowIdSuffix++);
                        opList.push(createMarkerOp(pos, rowId, client_api_1.MergeTree.MarkerBehaviors.RangeBegin, ["row"]));
                        pos++;
                        for (var box = 0; box < nboxes; box++) {
                            pos = createBox(opList, idBase, pos, content[(box + nboxes * row) % content.length]);
                        }
                        opList.push(createMarkerOp(pos, endPrefix + rowId, client_api_1.MergeTree.MarkerBehaviors.RangeEnd, ["row"]));
                        pos++;
                    }
                    opList.push(createMarkerOp(pos, endPrefix + idBase, client_api_1.MergeTree.MarkerBehaviors.RangeEnd | client_api_1.MergeTree.MarkerBehaviors.Tile, ["table"], ["pg"]));
                    pos++;
                    var groupOp = {
                        ops: opList,
                        type: 3 /* GROUP */
                    };
                    flowView.sharedString.transaction(groupOp);
                }

                var TableView = function () {
                    function TableView(tableMarker, endTableMarker) {
                        _classCallCheck(this, TableView);

                        this.tableMarker = tableMarker;
                        this.endTableMarker = endTableMarker;
                        this.minContentWidth = 0;
                        this.indentPct = 0.0;
                        this.contentPct = 1.0;
                        this.rows = [];
                        this.columns = [];
                    }

                    _createClass(TableView, [{
                        key: "nextBox",
                        value: function nextBox(box) {
                            var retNext = false;
                            for (var rowIndex = 0, rowCount = this.rows.length; rowIndex < rowCount; rowIndex++) {
                                var row = this.rows[rowIndex];
                                for (var boxIndex = 0, boxCount = row.boxes.length; boxIndex < boxCount; boxIndex++) {
                                    var rowBox = row.boxes[boxIndex];
                                    if (retNext) {
                                        return rowBox;
                                    }
                                    if (rowBox === box) {
                                        retNext = true;
                                    }
                                }
                            }
                        }
                    }, {
                        key: "prevBox",
                        value: function prevBox(box) {
                            var retPrev = false;
                            for (var rowIndex = this.rows.length - 1; rowIndex >= 0; rowIndex--) {
                                var row = this.rows[rowIndex];
                                for (var boxIndex = row.boxes.length - 1; boxIndex >= 0; boxIndex--) {
                                    var rowBox = row.boxes[boxIndex];
                                    if (retPrev) {
                                        return rowBox;
                                    }
                                    if (rowBox === box) {
                                        retPrev = true;
                                    }
                                }
                            }
                        }
                    }, {
                        key: "findPrecedingRow",
                        value: function findPrecedingRow(rowView) {
                            var prevRow = void 0;
                            for (var rowIndex = 0, rowCount = this.rows.length; rowIndex < rowCount; rowIndex++) {
                                var row = this.rows[rowIndex];
                                if (row === rowView) {
                                    return prevRow;
                                }
                                prevRow = row;
                            }
                        }
                    }, {
                        key: "findNextRow",
                        value: function findNextRow(rowView) {
                            var nextRow = void 0;
                            for (var rowIndex = this.rows.length - 1; rowIndex >= 0; rowIndex--) {
                                var row = this.rows[rowIndex];
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

                    }, {
                        key: "updateWidth",
                        value: function updateWidth(w) {
                            this.width = w;
                            var proportionalWidthPerColumn = Math.floor(this.width / this.columns.length);
                            // assume remaining width positive for now
                            // assume uniform number of columns in rows for now (later update each row separately)
                            var abscondedWidth = 0;
                            var totalWidth = 0;
                            for (var i = 0, len = this.columns.length; i < len; i++) {
                                var col = this.columns[i];
                                // TODO: borders
                                if (col.minContentWidth > proportionalWidthPerColumn) {
                                    col.width = col.minContentWidth;
                                    abscondedWidth += col.width;
                                    proportionalWidthPerColumn = Math.floor((this.width - abscondedWidth) / (len - i));
                                } else {
                                    col.width = proportionalWidthPerColumn;
                                }
                                totalWidth += col.width;
                                if (i === len - 1) {
                                    if (totalWidth < this.width) {
                                        col.width += this.width - totalWidth;
                                    }
                                }
                                var _iteratorNormalCompletion7 = true;
                                var _didIteratorError7 = false;
                                var _iteratorError7 = undefined;

                                try {
                                    for (var _iterator7 = col.boxes[Symbol.iterator](), _step7; !(_iteratorNormalCompletion7 = (_step7 = _iterator7.next()).done); _iteratorNormalCompletion7 = true) {
                                        var box = _step7.value;

                                        box.specWidth = col.width;
                                    }
                                } catch (err) {
                                    _didIteratorError7 = true;
                                    _iteratorError7 = err;
                                } finally {
                                    try {
                                        if (!_iteratorNormalCompletion7 && _iterator7.return) {
                                            _iterator7.return();
                                        }
                                    } finally {
                                        if (_didIteratorError7) {
                                            throw _iteratorError7;
                                        }
                                    }
                                }
                            }
                        }
                    }]);

                    return TableView;
                }();

                var ColumnView = function ColumnView(columnIndex) {
                    _classCallCheck(this, ColumnView);

                    this.columnIndex = columnIndex;
                    this.minContentWidth = 0;
                    this.width = 0;
                    this.boxes = [];
                };

                function findRowParent(lineDiv) {
                    var parent = lineDiv.parentElement;
                    while (parent) {
                        if (parent.rowView) {
                            return parent;
                        }
                        parent = parent.parentElement;
                    }
                }

                var RowView = function () {
                    function RowView(rowMarker, endRowMarker) {
                        _classCallCheck(this, RowView);

                        this.rowMarker = rowMarker;
                        this.endRowMarker = endRowMarker;
                        this.minContentWidth = 0;
                        this.boxes = [];
                    }

                    _createClass(RowView, [{
                        key: "findClosestBox",
                        value: function findClosestBox(x) {
                            var bestBox = void 0;
                            var bestDistance = -1;
                            var _iteratorNormalCompletion8 = true;
                            var _didIteratorError8 = false;
                            var _iteratorError8 = undefined;

                            try {
                                for (var _iterator8 = this.boxes[Symbol.iterator](), _step8; !(_iteratorNormalCompletion8 = (_step8 = _iterator8.next()).done); _iteratorNormalCompletion8 = true) {
                                    var box = _step8.value;

                                    var bounds = box.div.getBoundingClientRect();
                                    var center = bounds.left + bounds.width / 2;
                                    var distance = Math.abs(center - x);
                                    if (distance < bestDistance || bestDistance < 0) {
                                        bestBox = box;
                                        bestDistance = distance;
                                    }
                                }
                            } catch (err) {
                                _didIteratorError8 = true;
                                _iteratorError8 = err;
                            } finally {
                                try {
                                    if (!_iteratorNormalCompletion8 && _iterator8.return) {
                                        _iterator8.return();
                                    }
                                } finally {
                                    if (_didIteratorError8) {
                                        throw _iteratorError8;
                                    }
                                }
                            }

                            return bestBox;
                        }
                    }]);

                    return RowView;
                }();

                var BoxView = function BoxView(marker, endMarker) {
                    _classCallCheck(this, BoxView);

                    this.marker = marker;
                    this.endMarker = endMarker;
                    this.minContentWidth = 0;
                    this.specWidth = 0;
                };

                function parseBox(boxStartPos, docContext, flowView) {
                    var mergeTree = flowView.client.mergeTree;
                    var boxMarkerSegOff = mergeTree.getContainingSegment(boxStartPos, client_api_1.MergeTree.UniversalSequenceNumber, flowView.client.getClientId());
                    var boxMarker = boxMarkerSegOff.segment;
                    var id = boxMarker.getId();
                    var endId = "end-" + id;
                    var endBoxMarker = mergeTree.getSegmentFromId(endId);
                    var endBoxPos = mergeTree.getOffset(endBoxMarker, client_api_1.MergeTree.UniversalSequenceNumber, flowView.client.getClientId());
                    boxMarker.view = new BoxView(boxMarker, endBoxMarker);
                    var nextPos = boxStartPos + boxMarker.cachedLength;
                    while (nextPos < endBoxPos) {
                        var segoff = mergeTree.getContainingSegment(nextPos, client_api_1.MergeTree.UniversalSequenceNumber, flowView.client.getClientId());
                        // TODO: model error checking
                        var segment = segoff.segment;
                        if (segment.getType() === client_api_1.MergeTree.SegmentType.Marker) {
                            var marker = segoff.segment;
                            if (marker.hasRangeLabel("table")) {
                                var tableMarker = marker;
                                parseTable(tableMarker, nextPos, docContext, flowView);
                                if (tableMarker.view.minContentWidth > boxMarker.view.minContentWidth) {
                                    boxMarker.view.minContentWidth = tableMarker.view.minContentWidth;
                                }
                                var endTableMarker = tableMarker.view.endTableMarker;
                                nextPos = mergeTree.getOffset(endTableMarker, client_api_1.MergeTree.UniversalSequenceNumber, flowView.client.getClientId());
                                nextPos += endTableMarker.cachedLength;
                            } else {
                                // empty paragraph
                                nextPos++;
                            }
                        } else {
                            // text segment
                            var tilePos = findTile(flowView, nextPos, "pg", false);
                            var pgMarker = tilePos.tile;
                            if (!pgMarker.itemCache) {
                                var itemsContext = {
                                    curPGMarker: pgMarker,
                                    docContext: docContext,
                                    itemInfo: { items: [], minWidth: 0 }
                                };
                                var paragraphLexer = new ParagraphLexer(tokenToItems, itemsContext);
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
                    var mergeTree = flowView.client.mergeTree;
                    var rowMarkerSegOff = mergeTree.getContainingSegment(rowStartPos, client_api_1.MergeTree.UniversalSequenceNumber, flowView.client.getClientId());
                    var rowMarker = rowMarkerSegOff.segment;
                    var id = rowMarker.getId();
                    var endId = "end-" + id;
                    var endRowMarker = mergeTree.getSegmentFromId(endId);
                    var endRowPos = mergeTree.getOffset(endRowMarker, client_api_1.MergeTree.UniversalSequenceNumber, flowView.client.getClientId());
                    rowMarker.view = new RowView(rowMarker, endRowMarker);
                    var nextPos = rowStartPos + rowMarker.cachedLength;
                    while (nextPos < endRowPos) {
                        var boxMarker = parseBox(nextPos, docContext, flowView);
                        rowMarker.view.minContentWidth += boxMarker.view.minContentWidth;
                        rowMarker.view.boxes.push(boxMarker.view);
                        var endBoxPos = mergeTree.getOffset(boxMarker.view.endMarker, client_api_1.MergeTree.UniversalSequenceNumber, flowView.client.getClientId());
                        nextPos = endBoxPos + boxMarker.view.endMarker.cachedLength;
                    }
                    return rowMarker;
                }
                function parseTable(tableMarker, tableMarkerPos, docContext, flowView) {
                    var mergeTree = flowView.client.mergeTree;
                    var id = tableMarker.getId();
                    var endId = "end-" + id;
                    var endTableMarker = mergeTree.getSegmentFromId(endId);
                    var endTablePos = mergeTree.getOffset(endTableMarker, client_api_1.MergeTree.UniversalSequenceNumber, flowView.client.getClientId());
                    var tableView = new TableView(tableMarker, endTableMarker);
                    tableMarker.view = tableView;
                    var nextPos = tableMarkerPos + tableMarker.cachedLength;
                    var rowIndex = 0;
                    while (nextPos < endTablePos) {
                        var rowMarker = parseRow(nextPos, docContext, flowView);
                        var rowView = rowMarker.view;
                        rowView.table = tableView;
                        rowView.pos = nextPos;
                        for (var i = 0, len = rowView.boxes.length; i < len; i++) {
                            var box = rowView.boxes[i];
                            if (!tableView.columns[i]) {
                                tableView.columns[i] = new ColumnView(i);
                            }
                            var columnView = tableView.columns[i];
                            columnView.boxes[rowIndex] = box;
                            if (box.minContentWidth > columnView.minContentWidth) {
                                columnView.minContentWidth = box.minContentWidth;
                            }
                        }
                        if (rowMarker.view.minContentWidth > tableView.minContentWidth) {
                            tableView.minContentWidth = rowMarker.view.minContentWidth;
                        }
                        var endRowPos = mergeTree.getOffset(rowMarker.view.endRowMarker, client_api_1.MergeTree.UniversalSequenceNumber, flowView.client.getClientId());
                        tableView.rows[rowIndex++] = rowView;
                        rowView.endPos = endRowPos;
                        nextPos = endRowPos + rowMarker.view.endRowMarker.cachedLength;
                    }
                    return tableView;
                }
                function isInnerBox(boxView, layoutInfo) {
                    return !layoutInfo.startingPosStack || !layoutInfo.startingPosStack.box || layoutInfo.startingPosStack.box.empty() || layoutInfo.startingPosStack.box.items.length === layoutInfo.stackIndex + 1;
                }
                function renderBox(boxView, layoutInfo) {
                    var defer = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : false;
                    var rightmost = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : false;

                    var boxRect = new ui.Rectangle(0, 0, boxView.specWidth, 0);
                    var boxViewportWidth = boxView.specWidth - 2 * layoutInfo.docContext.boxHMargin;
                    var boxViewportRect = new ui.Rectangle(layoutInfo.docContext.boxHMargin, 0, boxViewportWidth, 0);
                    var boxDiv = document.createElement("div");
                    boxView.div = boxDiv;
                    boxRect.conformElementOpenHeight(boxDiv);
                    if (!rightmost) {
                        boxDiv.style.borderRight = "1px solid black";
                    }
                    var client = layoutInfo.flowView.client;
                    var mergeTree = client.mergeTree;
                    var transferDeferredHeight = false;
                    boxView.viewport = new Viewport(layoutInfo.viewport.remainingHeight(), document.createElement("div"), boxViewportWidth);
                    boxViewportRect.conformElementOpenHeight(boxView.viewport.div);
                    boxDiv.appendChild(boxView.viewport.div);
                    boxView.viewport.vskip(layoutInfo.docContext.boxTopMargin);
                    var boxLayoutInfo = {
                        deferredAttach: true,
                        docContext: layoutInfo.docContext,
                        endMarker: boxView.endMarker,
                        flowView: layoutInfo.flowView,
                        requestedPosition: layoutInfo.requestedPosition,
                        stackIndex: layoutInfo.stackIndex,
                        startingPosStack: layoutInfo.startingPosStack,
                        viewport: boxView.viewport
                    };
                    // TODO: deferred height calculation for starting in middle of box
                    if (isInnerBox(boxView, layoutInfo)) {
                        var boxPos = mergeTree.getOffset(boxView.marker, client_api_1.MergeTree.UniversalSequenceNumber, client.getClientId());
                        boxLayoutInfo.startPos = boxPos + boxView.marker.cachedLength;
                    } else {
                        var nextTable = layoutInfo.startingPosStack.table.items[layoutInfo.stackIndex + 1];
                        boxLayoutInfo.startPos = getOffset(layoutInfo.flowView, nextTable);
                        boxLayoutInfo.stackIndex = layoutInfo.stackIndex + 1;
                    }
                    boxView.renderOutput = renderFlow(boxLayoutInfo, defer);
                    if (transferDeferredHeight && boxView.renderOutput.deferredHeight > 0) {
                        layoutInfo.deferUntilHeight = boxView.renderOutput.deferredHeight;
                    }
                    boxView.renderedHeight = boxLayoutInfo.viewport.getLineTop();
                    if (boxLayoutInfo.reRenderList) {
                        if (!layoutInfo.reRenderList) {
                            layoutInfo.reRenderList = [];
                        }
                        var _iteratorNormalCompletion9 = true;
                        var _didIteratorError9 = false;
                        var _iteratorError9 = undefined;

                        try {
                            for (var _iterator9 = boxLayoutInfo.reRenderList[Symbol.iterator](), _step9; !(_iteratorNormalCompletion9 = (_step9 = _iterator9.next()).done); _iteratorNormalCompletion9 = true) {
                                var lineDiv = _step9.value;

                                layoutInfo.reRenderList.push(lineDiv);
                            }
                        } catch (err) {
                            _didIteratorError9 = true;
                            _iteratorError9 = err;
                        } finally {
                            try {
                                if (!_iteratorNormalCompletion9 && _iterator9.return) {
                                    _iterator9.return();
                                }
                            } finally {
                                if (_didIteratorError9) {
                                    throw _iteratorError9;
                                }
                            }
                        }
                    }
                }
                function setRowBorders(rowDiv) {
                    var top = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;

                    rowDiv.style.borderLeft = "1px solid black";
                    rowDiv.style.borderRight = "1px solid black";
                    if (top) {
                        rowDiv.style.borderTop = "1px solid black";
                    }
                    rowDiv.style.borderBottom = "1px solid black";
                }
                function renderTable(table, docContext, layoutInfo) {
                    var defer = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : false;

                    var flowView = layoutInfo.flowView;
                    var mergeTree = flowView.client.mergeTree;
                    var tablePos = mergeTree.getOffset(table, client_api_1.MergeTree.UniversalSequenceNumber, flowView.client.getClientId());
                    var tableView = parseTable(table, tablePos, docContext, flowView);
                    // let docContext = buildDocumentContext(viewportDiv);
                    var viewportWidth = parseInt(layoutInfo.viewport.div.style.width, 10);
                    var tableWidth = Math.floor(tableView.contentPct * viewportWidth);
                    tableView.updateWidth(tableWidth);
                    var tableIndent = Math.floor(tableView.indentPct * viewportWidth);
                    var startRow = void 0;
                    var startBox = void 0;
                    if (layoutInfo.startingPosStack) {
                        if (layoutInfo.startingPosStack.row && layoutInfo.startingPosStack.row.items.length > layoutInfo.stackIndex) {
                            var startRowMarker = layoutInfo.startingPosStack.row.items[layoutInfo.stackIndex];
                            startRow = startRowMarker.view;
                        }
                        if (layoutInfo.startingPosStack.box && layoutInfo.startingPosStack.box.items.length > layoutInfo.stackIndex) {
                            var startBoxMarker = layoutInfo.startingPosStack.box.items[layoutInfo.stackIndex];
                            startBox = startBoxMarker.view;
                        }
                    }
                    var foundStartRow = startRow === undefined;
                    var tableHeight = 0;
                    var deferredHeight = 0;
                    var topRow = layoutInfo.startingPosStack !== undefined && layoutInfo.stackIndex === 0;
                    var firstRendered = true;
                    for (var rowIndex = 0, rowCount = tableView.rows.length; rowIndex < rowCount; rowIndex++) {
                        var rowView = tableView.rows[rowIndex];
                        var rowHeight = 0;
                        if (startRow === rowView) {
                            foundStartRow = true;
                        }
                        var renderRow = !defer && deferredHeight >= layoutInfo.deferUntilHeight && foundStartRow;
                        var rowDiv = void 0;
                        if (renderRow) {
                            var rowRect = new ui.Rectangle(tableIndent, layoutInfo.viewport.getLineTop(), tableWidth, 0);
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
                        var boxX = 0;
                        for (var boxIndex = 0, boxCount = rowView.boxes.length; boxIndex < boxCount; boxIndex++) {
                            var box = rowView.boxes[boxIndex];
                            if (!topRow || box !== startBox) {
                                renderBox(box, layoutInfo, defer, box === rowView.boxes[rowView.boxes.length - 1]);
                                if (rowHeight < box.renderedHeight) {
                                    rowHeight = box.renderedHeight;
                                }
                                deferredHeight += box.renderOutput.deferredHeight;
                                if (renderRow) {
                                    box.viewport.div.style.height = box.renderedHeight + "px";
                                    box.div.style.height = box.renderedHeight + "px";
                                    box.div.style.left = boxX + "px";
                                    rowDiv.appendChild(box.div);
                                }
                                boxX += box.specWidth;
                            }
                        }
                        if (renderRow) {
                            var heightVal = rowHeight + "px";
                            for (var _boxIndex = 0, _boxCount = rowView.boxes.length; _boxIndex < _boxCount; _boxIndex++) {
                                var _box = rowView.boxes[_boxIndex];
                                _box.div.style.height = heightVal;
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
                        var _iteratorNormalCompletion10 = true;
                        var _didIteratorError10 = false;
                        var _iteratorError10 = undefined;

                        try {
                            for (var _iterator10 = layoutInfo.reRenderList[Symbol.iterator](), _step10; !(_iteratorNormalCompletion10 = (_step10 = _iterator10.next()).done); _iteratorNormalCompletion10 = true) {
                                var lineDiv = _step10.value;

                                reRenderLine(lineDiv, flowView);
                            }
                        } catch (err) {
                            _didIteratorError10 = true;
                            _iteratorError10 = err;
                        } finally {
                            try {
                                if (!_iteratorNormalCompletion10 && _iterator10.return) {
                                    _iterator10.return();
                                }
                            } finally {
                                if (_didIteratorError10) {
                                    throw _iteratorError10;
                                }
                            }
                        }

                        layoutInfo.reRenderList = undefined;
                    }
                    tableView.deferredHeight = deferredHeight;
                    tableView.renderedHeight = tableHeight;
                }
                function renderTree(viewportDiv, requestedPosition, flowView) {
                    var client = flowView.client;
                    var docContext = buildDocumentContext(viewportDiv);
                    var outerViewportHeight = parseInt(viewportDiv.style.height, 10);
                    var outerViewportWidth = parseInt(viewportDiv.style.width, 10);
                    var outerViewport = new Viewport(outerViewportHeight, viewportDiv, outerViewportWidth);
                    var startingPosStack = client.mergeTree.getStackContext(requestedPosition, client.getClientId(), ["table", "box", "row"]);
                    var layoutContext = {
                        docContext: docContext,
                        flowView: flowView,
                        requestedPosition: requestedPosition,
                        viewport: outerViewport
                    };
                    if (startingPosStack.table && !startingPosStack.table.empty()) {
                        var outerTable = startingPosStack.table.items[0];
                        var outerTablePos = flowView.client.mergeTree.getOffset(outerTable, client_api_1.MergeTree.UniversalSequenceNumber, flowView.client.getClientId());
                        layoutContext.startPos = outerTablePos;
                        layoutContext.stackIndex = 0;
                        layoutContext.startingPosStack = startingPosStack;
                    } else {
                        var previousTileInfo = findTile(flowView, requestedPosition, "pg");
                        if (previousTileInfo) {
                            layoutContext.startPos = previousTileInfo.pos + 1;
                        } else {
                            layoutContext.startPos = 0;
                        }
                    }
                    return renderFlow(layoutContext);
                }
                function tokenToItems(text, type, leadSegment, itemsContext) {
                    var docContext = itemsContext.docContext;
                    var lfontstr = docContext.fontstr;
                    var divHeight = docContext.defaultLineDivHeight;
                    if (itemsContext.curPGMarker.properties && itemsContext.curPGMarker.properties.header !== undefined) {
                        lfontstr = docContext.headerFontstr;
                        divHeight = docContext.headerDivHeight;
                    }
                    if (leadSegment.properties) {
                        var fontSize = leadSegment.properties.fontSize;
                        if (fontSize !== undefined) {
                            lfontstr = fontSize + " Times";
                            divHeight = +fontSize;
                        }
                        var lineHeight = leadSegment.properties.lineHeight;
                        if (lineHeight !== undefined) {
                            divHeight = +lineHeight;
                        }
                        var fontStyle = leadSegment.properties.fontStyle;
                        if (fontStyle) {
                            lfontstr = fontStyle + " " + lfontstr;
                        }
                    }
                    var textWidth = getTextWidth(text, lfontstr);
                    if (textWidth > itemsContext.itemInfo.minWidth) {
                        itemsContext.itemInfo.minWidth = textWidth;
                    }
                    if (type === ParagraphItemType.Block) {
                        var block = makeIPGBlock(textWidth, text, leadSegment);
                        if (divHeight !== itemsContext.docContext.defaultLineDivHeight) {
                            block.height = divHeight;
                        }
                        itemsContext.itemInfo.items.push(block);
                    } else {
                        itemsContext.itemInfo.items.push(makeGlue(textWidth, text, leadSegment, docContext.wordSpacing / 2, docContext.wordSpacing / 3));
                    }
                }
                function isEndBox(marker) {
                    return marker.behaviors & client_api_1.MergeTree.MarkerBehaviors.RangeEnd && marker.hasRangeLabel("box");
                }
                function segmentToItems(segment, segpos, refSeq, clientId, start, end, context) {
                    if (segment.getType() === client_api_1.MergeTree.SegmentType.Text) {
                        var textSegment = segment;
                        context.paragraphLexer.lex(textSegment);
                    } else if (segment.getType() === client_api_1.MergeTree.SegmentType.Marker) {
                        var marker = segment;
                        if (marker.hasTileLabel("pg") || isEndBox(marker)) {
                            context.nextPGPos = segpos;
                            return false;
                        }
                    }
                    return true;
                }
                function gatherOverlayLayer(segment, segpos, refSeq, clientId, start, end, context) {
                    if (segment.getType() === client_api_1.MergeTree.SegmentType.Marker) {
                        var marker = segment;
                        if (marker.behaviors === client_api_1.MergeTree.MarkerBehaviors.None) {
                            context.push({ id: marker.getId(), position: segpos });
                        }
                    }
                    return true;
                }
                function closestNorth(lineDivs, y) {
                    var best = -1;
                    var lo = 0;
                    var hi = lineDivs.length - 1;
                    while (lo <= hi) {
                        var bestBounds = void 0;
                        var mid = lo + Math.floor((hi - lo) / 2);
                        var lineDiv = lineDivs[mid];
                        var bounds = lineDiv.getBoundingClientRect();
                        if (bounds.bottom <= y) {
                            if (!bestBounds || best < 0 || bestBounds.bottom < bounds.bottom) {
                                best = mid;
                                bestBounds = bounds;
                            }
                            lo = mid + 1;
                        } else {
                            hi = mid - 1;
                        }
                    }
                    return best;
                }
                function closestSouth(lineDivs, y) {
                    var best = -1;
                    var lo = 0;
                    var hi = lineDivs.length - 1;
                    while (lo <= hi) {
                        var bestBounds = void 0;
                        var mid = lo + Math.floor((hi - lo) / 2);
                        var lineDiv = lineDivs[mid];
                        var bounds = lineDiv.getBoundingClientRect();
                        if (bounds.bottom >= y) {
                            if (!bestBounds || best < 0 || bestBounds.bottom > bounds.bottom) {
                                best = mid;
                                bestBounds = bounds;
                            }
                            lo = mid + 1;
                        } else {
                            hi = mid - 1;
                        }
                    }
                    return best;
                }

                var Viewport = function () {
                    function Viewport(maxHeight, div, width) {
                        _classCallCheck(this, Viewport);

                        this.maxHeight = maxHeight;
                        this.div = div;
                        this.width = width;
                        // keep these in order
                        this.lineDivs = [];
                        this.visibleRanges = [];
                        this.currentLineStart = -1;
                        this.lineTop = 0;
                    }

                    _createClass(Viewport, [{
                        key: "startLine",
                        value: function startLine(heightEstimate) {
                            // TODO: update width relative to started line
                        }
                    }, {
                        key: "firstLineDiv",
                        value: function firstLineDiv() {
                            if (this.lineDivs.length > 0) {
                                return this.lineDivs[0];
                            }
                        }
                    }, {
                        key: "lastLineDiv",
                        value: function lastLineDiv() {
                            if (this.lineDivs.length > 0) {
                                return this.lineDivs[this.lineDivs.length - 1];
                            }
                        }
                    }, {
                        key: "currentLineWidth",
                        value: function currentLineWidth() {
                            return this.width;
                        }
                    }, {
                        key: "vskip",
                        value: function vskip(h) {
                            this.lineTop += h;
                        }
                    }, {
                        key: "getLineTop",
                        value: function getLineTop() {
                            return this.lineTop;
                        }
                    }, {
                        key: "setLineTop",
                        value: function setLineTop(v) {
                            this.lineTop = v;
                        }
                    }, {
                        key: "commitLineDiv",
                        value: function commitLineDiv(lineDiv, h) {
                            this.lineTop += h;
                            this.lineDivs.push(lineDiv);
                        }
                    }, {
                        key: "findClosestLineDiv",
                        value: function findClosestLineDiv() {
                            var up = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : true;
                            var y = arguments[1];

                            var bestIndex = -1;
                            if (up) {
                                bestIndex = closestNorth(this.lineDivs, y);
                            } else {
                                bestIndex = closestSouth(this.lineDivs, y);
                            }
                            if (bestIndex >= 0) {
                                return this.lineDivs[bestIndex];
                            }
                        }
                    }, {
                        key: "remainingHeight",
                        value: function remainingHeight() {
                            return this.maxHeight - this.lineTop;
                        }
                    }, {
                        key: "setWidth",
                        value: function setWidth(w) {
                            this.width = w;
                        }
                    }]);

                    return Viewport;
                }();

                function renderFlow(layoutContext) {
                    var deferWhole = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;

                    var flowView = layoutContext.flowView;
                    var client = flowView.client;
                    // TODO: for stable viewports cache the geometry and the divs
                    // TODO: cache all this pre-amble in style blocks; override with pg properties
                    var docContext = layoutContext.docContext;
                    var viewportStartPos = -1;
                    var lastLineDiv = undefined;
                    function makeLineDiv(r, lineFontstr) {
                        var lineDiv = makeContentDiv(r, lineFontstr);
                        layoutContext.viewport.div.appendChild(lineDiv);
                        lastLineDiv = lineDiv;
                        return lineDiv;
                    }
                    var currentPos = layoutContext.startPos;
                    var curPGMarker = void 0;
                    var curPGMarkerPos = void 0;
                    var itemsContext = {
                        docContext: docContext
                    };
                    if (layoutContext.deferUntilHeight === undefined) {
                        layoutContext.deferUntilHeight = 0;
                    }
                    var deferredHeight = 0;
                    var deferredPGs = layoutContext.containingPGMarker !== undefined;
                    var paragraphLexer = new ParagraphLexer(tokenToItems, itemsContext);
                    itemsContext.paragraphLexer = paragraphLexer;
                    textErrorRun = undefined;
                    function renderPG(endPGMarker, pgStartPos, indentWidth, indentSymbol, contentWidth) {
                        var pgBreaks = endPGMarker.cache.breaks;
                        var lineDiv = void 0;
                        var lineDivHeight = docContext.defaultLineDivHeight;
                        var span = void 0;
                        for (var breakIndex = 0, len = pgBreaks.length; breakIndex < len; breakIndex++) {
                            var lineStart = pgBreaks[breakIndex] + pgStartPos;
                            var lineEnd = void 0;
                            if (breakIndex < len - 1) {
                                lineEnd = pgBreaks[breakIndex + 1] + pgStartPos;
                            } else {
                                lineEnd = undefined;
                            }
                            var lineFontstr = docContext.fontstr;
                            lineDivHeight = docContext.defaultLineDivHeight;
                            if (endPGMarker.properties && endPGMarker.properties.header !== undefined) {
                                // TODO: header levels etc.
                                lineDivHeight = docContext.headerDivHeight;
                                lineFontstr = docContext.headerFontstr;
                            }
                            var lineOK = !(deferredPGs || deferWhole) && layoutContext.deferUntilHeight <= deferredHeight;
                            if (lineOK && (lineEnd === undefined || lineEnd > layoutContext.requestedPosition)) {
                                lineDiv = makeLineDiv(new ui.Rectangle(0, layoutContext.viewport.getLineTop(), layoutContext.viewport.currentLineWidth(), lineDivHeight), lineFontstr);
                                var contentDiv = lineDiv;
                                if (indentWidth > 0) {
                                    contentDiv = makeContentDiv(new ui.Rectangle(indentWidth, 0, contentWidth, lineDivHeight), lineFontstr);
                                    lineDiv.indentWidth = indentWidth;
                                    lineDiv.contentWidth = indentWidth;
                                    if (indentSymbol && breakIndex === 0) {
                                        lineDiv.indentSymbol = indentSymbol;
                                        decorateLineDiv(lineDiv, lineFontstr, lineDivHeight);
                                    }
                                    lineDiv.appendChild(contentDiv);
                                }
                                var lineContext = {
                                    contentDiv: contentDiv, deferredAttach: layoutContext.deferredAttach, flowView: layoutContext.flowView,
                                    lineDiv: lineDiv, lineDivHeight: lineDivHeight, span: span
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
                                    var _iteratorNormalCompletion11 = true;
                                    var _didIteratorError11 = false;
                                    var _iteratorError11 = undefined;

                                    try {
                                        for (var _iterator11 = lineContext.reRenderList[Symbol.iterator](), _step11; !(_iteratorNormalCompletion11 = (_step11 = _iterator11.next()).done); _iteratorNormalCompletion11 = true) {
                                            var ldiv = _step11.value;

                                            layoutContext.reRenderList.push(ldiv);
                                        }
                                    } catch (err) {
                                        _didIteratorError11 = true;
                                        _iteratorError11 = err;
                                    } finally {
                                        try {
                                            if (!_iteratorNormalCompletion11 && _iterator11.return) {
                                                _iterator11.return();
                                            }
                                        } finally {
                                            if (_didIteratorError11) {
                                                throw _iteratorError11;
                                            }
                                        }
                                    }
                                }
                                layoutContext.viewport.commitLineDiv(lineDiv, lineDivHeight);
                            } else {
                                deferredHeight += lineDivHeight;
                            }
                            if (layoutContext.viewport.remainingHeight() < docContext.defaultLineDivHeight) {
                                // no more room for lines
                                // TODO: record end viewport char
                                break;
                            }
                        }
                    }
                    var fetchLog = false;
                    var segoff = void 0;
                    var totalLength = client.getLength();
                    // TODO: use end of doc marker
                    do {
                        if (!segoff) {
                            segoff = getContainingSegment(flowView, currentPos);
                        }
                        if (fetchLog) {
                            console.log("got segment " + segoff.segment.toString());
                        }
                        if (!segoff.segment) {
                            break;
                        }
                        if (segoff.segment.getType() === client_api_1.MergeTree.SegmentType.Marker && segoff.segment.hasRangeLabel("table")) {
                            var marker = segoff.segment;
                            // TODO: branches
                            var tableView = void 0;
                            if (marker.removedSeq === undefined) {
                                renderTable(marker, docContext, layoutContext, deferredPGs);
                                tableView = marker.view;
                                deferredHeight += tableView.deferredHeight;
                                layoutContext.viewport.vskip(layoutContext.docContext.tableVspace);
                            } else {
                                tableView = parseTable(marker, currentPos, docContext, flowView);
                            }
                            var endTablePos = getOffset(layoutContext.flowView, tableView.endTableMarker);
                            currentPos = endTablePos + 1;
                            segoff = undefined;
                            // TODO: if reached end of viewport, get pos ranges
                        } else {
                            if (segoff.segment.getType() === client_api_1.MergeTree.SegmentType.Marker) {
                                // empty paragraph
                                curPGMarker = segoff.segment;
                                if (fetchLog) {
                                    console.log("empty pg");
                                    if (curPGMarker.itemCache) {
                                        console.log("length items " + curPGMarker.itemCache.items.length);
                                    }
                                }
                                curPGMarkerPos = currentPos;
                            } else {
                                var curTilePos = findTile(flowView, currentPos, "pg", false);
                                curPGMarker = curTilePos.tile;
                                curPGMarkerPos = curTilePos.pos;
                            }
                            itemsContext.curPGMarker = curPGMarker;
                            // TODO: only set this to undefined if text changed
                            curPGMarker.listCache = undefined;
                            getListCacheInfo(layoutContext.flowView, curPGMarker, curPGMarkerPos);
                            var indentPct = 0.0;
                            var contentPct = 1.0;
                            var indentWidth = 0;
                            var contentWidth = layoutContext.viewport.currentLineWidth();
                            var indentSymbol = undefined;
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
                                    var em2 = Math.round(2 * getTextWidth("M", docContext.fontstr));
                                    indentWidth = em2 + indentWidth;
                                }
                            }
                            contentWidth = Math.floor(contentPct * layoutContext.viewport.currentLineWidth()) - indentWidth;
                            if (contentWidth > layoutContext.viewport.currentLineWidth()) {
                                // tslint:disable:max-line-length
                                console.log("egregious content width " + contentWidth + " bound " + layoutContext.viewport.currentLineWidth());
                            }
                            if (flowView.historyClient) {
                                clearContentCaches(curPGMarker);
                            }
                            if (!curPGMarker.cache || curPGMarker.cache.singleLineWidth !== contentWidth) {
                                if (!curPGMarker.itemCache) {
                                    itemsContext.itemInfo = { items: [], minWidth: 0 };
                                    client.mergeTree.mapRange({ leaf: segmentToItems }, client_api_1.MergeTree.UniversalSequenceNumber, client.getClientId(), itemsContext, currentPos, curPGMarkerPos + 1);
                                    curPGMarker.itemCache = itemsContext.itemInfo;
                                } else {
                                    itemsContext.itemInfo = curPGMarker.itemCache;
                                }
                                var breaks = breakPGIntoLinesFF(itemsContext.itemInfo.items, contentWidth);
                                curPGMarker.cache = { breaks: breaks, singleLineWidth: contentWidth };
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
                                    var _marker = segoff.segment;
                                    if (_marker.hasRangeLabel("box") && _marker.behaviors & client_api_1.MergeTree.MarkerBehaviors.RangeEnd) {
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
                            } else {
                                break;
                            }
                        }
                    } while (layoutContext.viewport.remainingHeight() >= docContext.defaultLineDivHeight);
                    // Find overlay annotations
                    var viewportEndPos = currentPos;
                    var overlayMarkers = [];
                    client.mergeTree.mapRange({ leaf: gatherOverlayLayer }, client_api_1.MergeTree.UniversalSequenceNumber, client.getClientId(), overlayMarkers, viewportStartPos, viewportEndPos);
                    return {
                        deferredHeight: deferredHeight,
                        overlayMarkers: overlayMarkers,
                        viewportStartPos: viewportStartPos,
                        viewportEndPos: viewportEndPos
                    };
                }
                function makeSegSpan(context, segText, textSegment, offsetFromSegpos, segpos) {
                    var span = document.createElement("span");
                    span.innerText = segText;
                    span.seg = textSegment;
                    span.segPos = segpos;
                    var textErr = false;
                    var spellOption = "spellchecker";
                    if (textSegment.properties) {
                        // tslint:disable-next-line
                        for (var key in textSegment.properties) {
                            if (key === "textError" && (viewOptions === undefined || viewOptions[spellOption] !== "disabled")) {
                                (function () {
                                    textErr = true;
                                    if (textErrorRun === undefined) {
                                        textErrorRun = {
                                            end: segpos + offsetFromSegpos + segText.length,
                                            start: segpos + offsetFromSegpos
                                        };
                                    } else {
                                        textErrorRun.end += segText.length;
                                    }
                                    var textErrorInfo = textSegment.properties[key];
                                    var slb = void 0;
                                    span.textErrorRun = textErrorRun;
                                    if (textErrorInfo.color === "paul") {
                                        span.style.background = underlinePaulStringURL;
                                    } else if (textErrorInfo.color === "paulgreen") {
                                        span.style.background = underlinePaulGrammarStringURL;
                                    } else if (textErrorInfo.color === "paulgolden") {
                                        span.style.background = underlinePaulGoldStringURL;
                                    } else {
                                        span.style.background = underlineStringURL;
                                    }
                                    if (textErrorInfo.alternates.length > 0) {
                                        span.onmousedown = function (e) {
                                            function cancelIntellisense(ev) {
                                                if (slb) {
                                                    document.body.removeChild(slb.elm);
                                                    slb = undefined;
                                                }
                                            }
                                            function acceptIntellisense(ev) {
                                                cancelIntellisense(ev);
                                                var itemElm = ev.target;
                                                var text = itemElm.innerText.trim();
                                                context.sharedString.removeText(span.textErrorRun.start, span.textErrorRun.end);
                                                context.sharedString.insertText(text, span.textErrorRun.start);
                                                context.localQueueRender(span.textErrorRun.start);
                                            }
                                            function selectItem(ev) {
                                                var itemElm = ev.target;
                                                if (slb) {
                                                    slb.selectItem(itemElm.innerText);
                                                }
                                                // console.log(`highlight ${itemElm.innerText}`);
                                            }
                                            console.log("button " + e.button);
                                            if (e.button === 2 || e.button === 0 && e.ctrlKey) {
                                                var spanBounds = ui.Rectangle.fromClientRect(span.getBoundingClientRect());
                                                spanBounds.width = Math.floor(window.innerWidth / 4);
                                                slb = selectionListBoxCreate(spanBounds, document.body, 24, 0, 12);
                                                slb.showSelectionList(altsToItems(textErrorInfo.alternates));
                                                span.onmouseup = cancelIntellisense;
                                                document.body.onmouseup = cancelIntellisense;
                                                slb.elm.onmouseup = acceptIntellisense;
                                                slb.elm.onmousemove = selectItem;
                                            } else if (e.button === 0) {
                                                context.clickSpan(e.clientX, e.clientY, span);
                                            }
                                        };
                                    }
                                })();
                            } else {
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
                    var range = document.caretRangeFromPoint(x, y);
                    if (range) {
                        var result = {
                            elm: range.startContainer.parentElement,
                            node: range.startContainer,
                            offset: range.startOffset
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
                var presenceColors = ["darkgreen", "sienna", "olive", "purple"];

                var Cursor = function () {
                    function Cursor(viewportDiv) {
                        var _this13 = this;

                        var pos = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;

                        _classCallCheck(this, Cursor);

                        this.viewportDiv = viewportDiv;
                        this.pos = pos;
                        this.off = true;
                        this.presenceInfoUpdated = true;
                        this.blinkCount = 0;
                        this.bgColor = "blue";
                        this.blinker = function () {
                            if (_this13.off) {
                                _this13.show();
                            } else {
                                _this13.hide();
                            }
                            _this13.off = !_this13.off;
                            if (_this13.blinkCount > 0) {
                                _this13.blinkCount--;
                                if (_this13.presenceInfo) {
                                    var opacity = 0.5 + 0.5 * Math.exp(-0.05 * (30 - _this13.blinkCount));
                                    if (_this13.blinkCount <= 20) {
                                        opacity = 0.0;
                                    } else if (_this13.blinkCount > 26) {
                                        opacity = 1.0;
                                    }
                                    _this13.presenceDiv.style.opacity = "" + opacity;
                                }
                                _this13.blinkTimer = setTimeout(_this13.blinker, 500);
                            } else {
                                if (_this13.presenceInfo) {
                                    _this13.presenceDiv.style.opacity = "0.0";
                                }
                                _this13.show();
                            }
                        };
                        this.makeSpan();
                    }

                    _createClass(Cursor, [{
                        key: "addPresenceInfo",
                        value: function addPresenceInfo(presenceInfo) {
                            // for now, color
                            var presenceColorIndex = presenceInfo.clientId % presenceColors.length;
                            this.bgColor = presenceColors[presenceColorIndex];
                            this.presenceInfo = presenceInfo;
                            this.makePresenceDiv();
                            this.show();
                        }
                    }, {
                        key: "hide",
                        value: function hide() {
                            this.editSpan.style.visibility = "hidden";
                        }
                    }, {
                        key: "show",
                        value: function show() {
                            this.editSpan.style.backgroundColor = this.bgColor;
                            this.editSpan.style.visibility = "visible";
                            if (this.presenceInfo) {
                                this.presenceDiv.style.visibility = "visible";
                            }
                        }
                    }, {
                        key: "makePresenceDiv",
                        value: function makePresenceDiv() {
                            this.presenceDiv = document.createElement("div");
                            this.presenceDiv.innerText = this.presenceInfo.key;
                            this.presenceDiv.style.zIndex = "1";
                            this.presenceDiv.style.position = "absolute";
                            this.presenceDiv.style.color = "white";
                            this.presenceDiv.style.backgroundColor = this.bgColor;
                            this.presenceDiv.style.font = "14px Arial";
                            this.presenceDiv.style.border = "3px solid " + this.bgColor;
                            this.presenceDiv.style.borderTopRightRadius = "1em";
                        }
                    }, {
                        key: "makeSpan",
                        value: function makeSpan() {
                            this.editSpan = document.createElement("span");
                            this.editSpan.innerText = "\uFEFF";
                            this.editSpan.style.zIndex = "1";
                            this.editSpan.style.position = "absolute";
                            this.editSpan.style.left = "0px";
                            this.editSpan.style.top = "0px";
                            this.editSpan.style.width = "2px";
                            this.show();
                        }
                    }, {
                        key: "lineDiv",
                        value: function lineDiv() {
                            return this.editSpan.parentElement;
                        }
                    }, {
                        key: "updateView",
                        value: function updateView(flowView) {
                            var lineDiv = this.lineDiv();
                            if (lineDiv && lineDiv.linePos <= this.pos && lineDiv.lineEnd > this.pos) {
                                reRenderLine(lineDiv, flowView);
                            } else {
                                var foundLineDiv = findLineDiv(this.pos, flowView, true);
                                if (foundLineDiv) {
                                    reRenderLine(foundLineDiv, flowView);
                                } else {
                                    flowView.render(flowView.topChar, true);
                                }
                            }
                        }
                    }, {
                        key: "rect",
                        value: function rect() {
                            return this.editSpan.getBoundingClientRect();
                        }
                    }, {
                        key: "assignToLine",
                        value: function assignToLine(x, h, lineDiv) {
                            this.editSpan.style.left = x + "px";
                            this.editSpan.style.height = h + "px";
                            if (this.editSpan.parentElement) {
                                this.editSpan.parentElement.removeChild(this.editSpan);
                            }
                            lineDiv.appendChild(this.editSpan);
                            if (this.presenceInfo) {
                                var bannerHeight = 20;
                                var halfBannerHeight = bannerHeight / 2;
                                this.presenceDiv.style.left = x + "px";
                                this.presenceDiv.style.height = bannerHeight + "px";
                                this.presenceDiv.style.top = "-" + halfBannerHeight + "px";
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
                    }, {
                        key: "blinkCursor",
                        value: function blinkCursor() {
                            this.blinkCount = 30;
                            this.off = true;
                            this.blinkTimer = setTimeout(this.blinker, 20);
                        }
                    }]);

                    return Cursor;
                }();

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
                function findTile(flowView, startPos, tileType) {
                    var preceding = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : true;

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

                var FlowView = function (_ui$Component8) {
                    _inherits(FlowView, _ui$Component8);

                    function FlowView(element, collabDocument, sharedString, status) {
                        var options = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : undefined;

                        _classCallCheck(this, FlowView);

                        var _this14 = _possibleConstructorReturn(this, (FlowView.__proto__ || Object.getPrototypeOf(FlowView)).call(this, element));

                        _this14.collabDocument = collabDocument;
                        _this14.sharedString = sharedString;
                        _this14.status = status;
                        _this14.options = options;
                        _this14.ticking = false;
                        _this14.wheelTicking = false;
                        _this14.topChar = -1;
                        _this14.presenceVector = [];
                        _this14.lastVerticalX = -1;
                        _this14.pendingRender = false;
                        _this14.diagCharPort = false;
                        _this14.client = sharedString.client;
                        _this14.viewportDiv = document.createElement("div");
                        _this14.element.appendChild(_this14.viewportDiv);
                        _this14.statusMessage("li", " ");
                        _this14.statusMessage("si", " ");
                        sharedString.on("op", function (msg) {
                            if (msg.clientId !== _this14.client.longClientId) {
                                var delta = msg.contents;
                                if (_this14.applyOp(delta, msg)) {
                                    _this14.queueRender(msg);
                                }
                            }
                        });
                        _this14.cursor = new Cursor(_this14.viewportDiv);
                        _this14.setViewOption(_this14.options);
                        return _this14;
                    }

                    _createClass(FlowView, [{
                        key: "treeForViewport",
                        value: function treeForViewport() {
                            console.log(this.sharedString.client.mergeTree.rangeToString(this.viewportStartPos, this.viewportEndPos));
                        }
                    }, {
                        key: "measureClone",
                        value: function measureClone() {
                            var clock = Date.now();
                            this.client.cloneFromSegments();
                            console.log("clone took " + (Date.now() - clock) + "ms");
                        }
                    }, {
                        key: "xUpdateHistoryBubble",
                        value: function xUpdateHistoryBubble(x) {
                            var widgetDivBounds = this.historyWidget.getBoundingClientRect();
                            var w = widgetDivBounds.width - 14;
                            var diffX = x - (widgetDivBounds.left + 7);
                            if (diffX <= 0) {
                                diffX = 0;
                            }
                            var pct = diffX / w;
                            var l = 7 + Math.floor(pct * w);
                            var seq = this.client.historyToPct(pct);
                            this.historyVersion.innerText = "Version @" + seq;
                            this.historyBubble.style.left = l + "px";
                            this.cursor.pos = FlowView.docStartPosition;
                            this.localQueueRender(FlowView.docStartPosition);
                        }
                    }, {
                        key: "updateHistoryBubble",
                        value: function updateHistoryBubble(seq) {
                            var widgetDivBounds = this.historyWidget.getBoundingClientRect();
                            var w = widgetDivBounds.width - 14;
                            var count = this.client.undoSegments.length + this.client.redoSegments.length;
                            var pct = this.client.undoSegments.length / count;
                            var l = 7 + Math.floor(pct * w);
                            this.historyBubble.style.left = l + "px";
                            this.historyVersion.innerText = "Version @" + seq;
                        }
                    }, {
                        key: "makeHistoryWidget",
                        value: function makeHistoryWidget() {
                            var _this15 = this;

                            var bounds = ui.Rectangle.fromClientRect(this.status.element.getBoundingClientRect());
                            var x = Math.floor(bounds.width / 2);
                            var y = 2;
                            var widgetRect = new ui.Rectangle(x, y, Math.floor(bounds.width * 0.4), bounds.height - 4);
                            var widgetDiv = document.createElement("div");
                            widgetRect.conformElement(widgetDiv);
                            widgetDiv.style.zIndex = "3";
                            var bubble = document.createElement("div");
                            widgetDiv.style.borderRadius = "6px";
                            bubble.style.position = "absolute";
                            bubble.style.width = "8px";
                            bubble.style.height = bounds.height - 6 + "px";
                            bubble.style.borderRadius = "5px";
                            bubble.style.top = "1px";
                            bubble.style.left = widgetRect.width - 7 + "px";
                            bubble.style.backgroundColor = "pink";
                            widgetDiv.style.backgroundColor = "rgba(179,179,179,0.3)";
                            widgetDiv.appendChild(bubble);
                            var versionSpan = document.createElement("span");
                            widgetDiv.appendChild(versionSpan);
                            versionSpan.innerText = "History";
                            versionSpan.style.padding = "3px";
                            this.historyVersion = versionSpan;
                            this.historyWidget = widgetDiv;
                            this.historyBubble = bubble;
                            var clickHistory = function clickHistory(ev) {
                                _this15.xUpdateHistoryBubble(ev.clientX);
                            };
                            var mouseDownBubble = function mouseDownBubble(ev) {
                                widgetDiv.onmousemove = clickHistory;
                            };
                            var cancelHistory = function cancelHistory(ev) {
                                widgetDiv.onmousemove = preventD;
                            };
                            bubble.onmousedown = mouseDownBubble;
                            widgetDiv.onmouseup = cancelHistory;
                            widgetDiv.onmousemove = preventD;
                            bubble.onmouseup = cancelHistory;
                            this.status.addSlider(this.historyWidget);
                        }
                    }, {
                        key: "goHistorical",
                        value: function goHistorical() {
                            if (!this.historyClient) {
                                this.historyClient = this.client.cloneFromSegments();
                                this.savedClient = this.client;
                                this.client = this.historyClient;
                                this.makeHistoryWidget();
                            }
                        }
                    }, {
                        key: "backToTheFuture",
                        value: function backToTheFuture() {
                            if (this.historyClient) {
                                this.client = this.savedClient;
                                this.historyClient = undefined;
                                this.status.removeSlider();
                                this.topChar = 0;
                                this.localQueueRender(0);
                            }
                        }
                    }, {
                        key: "historyBack",
                        value: function historyBack() {
                            this.goHistorical();
                            if (this.client.undoSegments.length > 0) {
                                var seq = this.client.undo();
                                this.updateHistoryBubble(seq);
                                this.cursor.pos = FlowView.docStartPosition;
                                this.localQueueRender(FlowView.docStartPosition);
                            }
                        }
                    }, {
                        key: "historyForward",
                        value: function historyForward() {
                            this.goHistorical();
                            if (this.client.redoSegments.length > 0) {
                                var seq = this.client.redo();
                                this.updateHistoryBubble(seq);
                                this.cursor.pos = FlowView.docStartPosition;
                                this.localQueueRender(FlowView.docStartPosition);
                            }
                        }
                    }, {
                        key: "addPresenceMap",
                        value: function addPresenceMap(presenceMap) {
                            var _this16 = this;

                            this.presenceMap = presenceMap;
                            presenceMap.on("valueChanged", function (delta) {
                                _this16.remotePresenceUpdate(delta);
                            });
                            presenceMap.getView().then(function (v) {
                                _this16.presenceMapView = v;
                                _this16.updatePresence();
                            });
                        }
                    }, {
                        key: "presenceInfoInRange",
                        value: function presenceInfoInRange(start, end) {
                            for (var i = 0, len = this.presenceVector.length; i < len; i++) {
                                var presenceInfo = this.presenceVector[i];
                                if (presenceInfo) {
                                    if (start <= presenceInfo.xformPos && presenceInfo.xformPos <= end) {
                                        return presenceInfo;
                                    }
                                }
                            }
                        }
                    }, {
                        key: "updatePresencePositions",
                        value: function updatePresencePositions() {
                            for (var i = 0, len = this.presenceVector.length; i < len; i++) {
                                var remotePresenceInfo = this.presenceVector[i];
                                if (remotePresenceInfo) {
                                    remotePresenceInfo.xformPos = getLocalRefPos(this, remotePresenceInfo.localRef);
                                }
                            }
                        }
                    }, {
                        key: "updatePresenceVector",
                        value: function updatePresenceVector(localPresenceInfo) {
                            localPresenceInfo.xformPos = getLocalRefPos(this, localPresenceInfo.localRef);
                            var presentPresence = this.presenceVector[localPresenceInfo.clientId];
                            var tempXformPos = -1;
                            if (presentPresence) {
                                if (presentPresence.cursor) {
                                    localPresenceInfo.cursor = presentPresence.cursor;
                                    localPresenceInfo.cursor.presenceInfo = localPresenceInfo;
                                    localPresenceInfo.cursor.presenceInfoUpdated = true;
                                }
                                var baseSegment = presentPresence.localRef.segment;
                                baseSegment.removeLocalRef(presentPresence.localRef);
                                tempXformPos = presentPresence.xformPos;
                            }
                            localPresenceInfo.localRef.segment.addLocalRef(localPresenceInfo.localRef);
                            this.presenceVector[localPresenceInfo.clientId] = localPresenceInfo;
                            if (localPresenceInfo.xformPos !== tempXformPos) {
                                this.presenceQueueRender(localPresenceInfo);
                            }
                        }
                    }, {
                        key: "remotePresenceFromEdit",
                        value: function remotePresenceFromEdit(longClientId, refseq, oldpos) {
                            var posAdjust = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : 0;

                            var remotePosInfo = {
                                clientId: this.client.getOrAddShortClientId(longClientId),
                                key: longClientId,
                                origPos: oldpos + posAdjust,
                                refseq: refseq
                            };
                            this.remotePresenceToLocal(remotePosInfo, posAdjust);
                        }
                    }, {
                        key: "remotePresenceToLocal",
                        value: function remotePresenceToLocal(remotePresenceInfo) {
                            var posAdjust = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;

                            var segoff = this.client.mergeTree.getContainingSegment(remotePresenceInfo.origPos, remotePresenceInfo.refseq, remotePresenceInfo.clientId);
                            if (segoff.segment === undefined) {
                                if (remotePresenceInfo.origPos === this.client.getLength()) {
                                    segoff = this.client.mergeTree.getContainingSegment(remotePresenceInfo.origPos, remotePresenceInfo.refseq, remotePresenceInfo.clientId);
                                    if (segoff.segment) {
                                        segoff.offset++;
                                    }
                                }
                            }
                            if (segoff.segment) {
                                var localPresenceInfo = {
                                    clientId: remotePresenceInfo.clientId,
                                    fresh: true,
                                    key: remotePresenceInfo.key,
                                    localRef: {
                                        offset: segoff.offset,
                                        segment: segoff.segment,
                                        slideOnRemove: true
                                    }
                                };
                                this.updatePresenceVector(localPresenceInfo);
                            }
                        }
                    }, {
                        key: "remotePresenceUpdate",
                        value: function remotePresenceUpdate(delta) {
                            if (delta.key !== this.client.longClientId) {
                                var remotePresenceInfo = this.presenceMapView.get(delta.key);
                                remotePresenceInfo.key = delta.key;
                                remotePresenceInfo.clientId = this.client.getOrAddShortClientId(delta.key);
                                this.remotePresenceToLocal(remotePresenceInfo);
                            }
                        }
                    }, {
                        key: "updatePresence",
                        value: function updatePresence() {
                            if (this.presenceMapView) {
                                var presenceInfo = {
                                    origPos: this.cursor.pos,
                                    refseq: this.client.getCurrentSeq()
                                };
                                this.presenceMapView.set(this.client.longClientId, presenceInfo);
                            }
                        }
                    }, {
                        key: "statusMessage",
                        value: function statusMessage(key, msg) {
                            this.status.add(key, msg);
                        }
                    }, {
                        key: "firstLineDiv",
                        value: function firstLineDiv() {
                            return this.lineDivSelect(function (elm) {
                                return elm;
                            }, this.viewportDiv, false);
                        }
                    }, {
                        key: "lastLineDiv",
                        value: function lastLineDiv() {
                            return this.lineDivSelect(function (elm) {
                                return elm;
                            }, this.viewportDiv, false, true);
                        }
                        /**
                         * Returns the (x, y) coordinate of the given position relative to the FlowView's coordinate system or null
                         * if the position is not visible.
                         */

                    }, {
                        key: "getPositionLocation",
                        value: function getPositionLocation(position) {
                            var lineDiv = findLineDiv(position, this, true);
                            if (!lineDiv) {
                                return null;
                            }
                            // Estimate placement location
                            var text = this.client.getText(lineDiv.linePos, position);
                            var textWidth = getTextWidth(text, lineDiv.style.font);
                            var lineDivRect = lineDiv.getBoundingClientRect();
                            var location = { x: lineDivRect.left + textWidth, y: lineDivRect.bottom };
                            return location;
                        }
                        /**
                         * Retrieves the nearest sequence position relative to the given viewport location
                         */

                    }, {
                        key: "getNearestPosition",
                        value: function getNearestPosition(location) {
                            var lineDivs = [];
                            this.lineDivSelect(function (lineDiv) {
                                lineDivs.push(lineDiv);
                                return null;
                            }, this.viewportDiv, false);
                            // Search for the nearest line divs to the element
                            var closestUp = closestNorth(lineDivs, location.y);
                            var closestDown = closestSouth(lineDivs, location.y);
                            // And then the nearest location within them
                            var distance = Number.MAX_VALUE;
                            var position = void 0;
                            if (closestUp !== -1) {
                                var upPosition = this.getPosFromPixels(lineDivs[closestUp], location.x);
                                var upLocation = this.getPositionLocation(upPosition);
                                distance = ui.distanceSquared(location, upLocation);
                                position = upPosition;
                            }
                            if (closestDown !== -1) {
                                var downPosition = this.getPosFromPixels(lineDivs[closestDown], location.x);
                                var downLocation = this.getPositionLocation(downPosition);
                                var downDistance = ui.distanceSquared(location, downLocation);
                                if (downDistance < distance) {
                                    distance = downDistance;
                                    position = downPosition;
                                }
                            }
                            return position;
                        }
                    }, {
                        key: "checkRow",
                        value: function checkRow(lineDiv, fn, rev) {
                            var rowDiv = lineDiv;
                            var oldRowDiv = void 0;
                            while (rowDiv && rowDiv !== oldRowDiv && rowDiv.rowView) {
                                oldRowDiv = rowDiv;
                                lineDiv = undefined;
                                var _iteratorNormalCompletion12 = true;
                                var _didIteratorError12 = false;
                                var _iteratorError12 = undefined;

                                try {
                                    for (var _iterator12 = rowDiv.rowView.boxes[Symbol.iterator](), _step12; !(_iteratorNormalCompletion12 = (_step12 = _iterator12.next()).done); _iteratorNormalCompletion12 = true) {
                                        var box = _step12.value;

                                        var innerDiv = this.lineDivSelect(fn, box.viewport.div, true, rev);
                                        if (innerDiv) {
                                            lineDiv = innerDiv;
                                            rowDiv = innerDiv;
                                            break;
                                        }
                                    }
                                } catch (err) {
                                    _didIteratorError12 = true;
                                    _iteratorError12 = err;
                                } finally {
                                    try {
                                        if (!_iteratorNormalCompletion12 && _iterator12.return) {
                                            _iterator12.return();
                                        }
                                    } finally {
                                        if (_didIteratorError12) {
                                            throw _iteratorError12;
                                        }
                                    }
                                }
                            }
                            return lineDiv;
                        }
                    }, {
                        key: "lineDivSelect",
                        value: function lineDivSelect(fn, viewportDiv) {
                            var dive = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : false;
                            var rev = arguments[3];

                            if (rev) {
                                var elm = viewportDiv.lastElementChild;
                                while (elm) {
                                    if (elm.linePos !== undefined) {
                                        var lineDiv = fn(elm);
                                        if (lineDiv) {
                                            if (dive) {
                                                lineDiv = this.checkRow(lineDiv, fn, rev);
                                            }
                                            return lineDiv;
                                        }
                                    }
                                    elm = elm.previousElementSibling;
                                }
                            } else {
                                var _elm = viewportDiv.firstElementChild;
                                while (_elm) {
                                    if (_elm.linePos !== undefined) {
                                        var _lineDiv = fn(_elm);
                                        if (_lineDiv) {
                                            if (dive) {
                                                _lineDiv = this.checkRow(_lineDiv, fn, rev);
                                            }
                                            return _lineDiv;
                                        }
                                    }
                                    _elm = _elm.nextElementSibling;
                                }
                            }
                        }
                    }, {
                        key: "clickSpan",
                        value: function clickSpan(x, y, elm) {
                            var span = elm;
                            var elmOff = pointerToElementOffsetWebkit(x, y);
                            if (elmOff) {
                                var computed = elmOffToSegOff(elmOff, span);
                                if (span.offset) {
                                    computed += span.offset;
                                }
                                this.cursor.pos = span.segPos + computed;
                                var tilePos = findTile(this, this.cursor.pos, "pg", false);
                                if (tilePos) {
                                    this.curPG = tilePos.tile;
                                }
                                this.updatePresence();
                                this.cursor.updateView(this);
                                return true;
                            }
                        }
                    }, {
                        key: "getPosFromPixels",
                        value: function getPosFromPixels(targetLineDiv, x) {
                            var position = undefined;
                            if (targetLineDiv && targetLineDiv.linePos !== undefined) {
                                var y = void 0;
                                var targetLineBounds = targetLineDiv.getBoundingClientRect();
                                y = targetLineBounds.top + Math.floor(targetLineBounds.height / 2);
                                var elm = document.elementFromPoint(x, y);
                                if (elm.tagName === "DIV") {
                                    if (targetLineDiv.lineEnd - targetLineDiv.linePos === 1) {
                                        // empty line
                                        position = targetLineDiv.linePos;
                                    } else if (targetLineDiv === elm) {
                                        if (targetLineDiv.indentWidth !== undefined) {
                                            var relX = x - targetLineBounds.left;
                                            if (relX <= targetLineDiv.indentWidth) {
                                                position = targetLineDiv.linePos;
                                            } else {
                                                position = targetLineDiv.lineEnd;
                                            }
                                        } else {
                                            position = targetLineDiv.lineEnd;
                                        }
                                    } else {
                                        // content div
                                        if (x <= targetLineBounds.left) {
                                            position = targetLineDiv.linePos;
                                        } else {
                                            position = targetLineDiv.lineEnd;
                                        }
                                    }
                                } else if (elm.tagName === "SPAN") {
                                    var span = elm;
                                    var elmOff = pointerToElementOffsetWebkit(x, y);
                                    if (elmOff) {
                                        var computed = elmOffToSegOff(elmOff, span);
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

                    }, {
                        key: "setCursorPosFromPixels",
                        value: function setCursorPosFromPixels(targetLineDiv, x) {
                            var position = this.getPosFromPixels(targetLineDiv, x);
                            if (position) {
                                this.cursor.pos = position;
                                return true;
                            } else {
                                return false;
                            }
                        }
                    }, {
                        key: "getCanonicalX",
                        value: function getCanonicalX() {
                            var cursorRect = this.cursor.rect();
                            var x = void 0;
                            if (this.lastVerticalX >= 0) {
                                x = this.lastVerticalX;
                            } else {
                                x = Math.floor(cursorRect.left);
                                this.lastVerticalX = x;
                            }
                            return x;
                        }
                    }, {
                        key: "cursorRev",
                        value: function cursorRev() {
                            if (this.cursor.pos > FlowView.docStartPosition) {
                                this.cursor.pos--;
                                var segoff = getContainingSegment(this, this.cursor.pos);
                                if (segoff.segment.getType() !== client_api_1.MergeTree.SegmentType.Text) {
                                    // REVIEW: assume marker for now (could be external later)
                                    var marker = segoff.segment;
                                    if (marker.behaviors & client_api_1.MergeTree.MarkerBehaviors.Tile && marker.hasTileLabel("pg")) {
                                        if (marker.hasRangeLabel("table") && marker.behaviors & client_api_1.MergeTree.MarkerBehaviors.RangeEnd) {
                                            this.cursorRev();
                                        }
                                    } else {
                                        this.cursorRev();
                                    }
                                }
                            }
                        }
                    }, {
                        key: "cursorFwd",
                        value: function cursorFwd() {
                            if (this.cursor.pos < this.client.getLength() - 1) {
                                this.cursor.pos++;
                                var segoff = this.client.mergeTree.getContainingSegment(this.cursor.pos, client_api_1.MergeTree.UniversalSequenceNumber, this.client.getClientId());
                                if (segoff.segment.getType() !== client_api_1.MergeTree.SegmentType.Text) {
                                    // REVIEW: assume marker for now
                                    var marker = segoff.segment;
                                    if (marker.behaviors & client_api_1.MergeTree.MarkerBehaviors.Tile && marker.hasTileLabel("pg")) {
                                        if (marker.hasRangeLabel("table") && marker.behaviors & client_api_1.MergeTree.MarkerBehaviors.RangeEnd) {
                                            this.cursorFwd();
                                        } else {
                                            return;
                                        }
                                    } else if (marker.behaviors & client_api_1.MergeTree.MarkerBehaviors.RangeBegin) {
                                        if (marker.hasRangeLabel("table")) {
                                            this.cursor.pos += 3;
                                        } else if (marker.hasRangeLabel("row")) {
                                            this.cursor.pos += 2;
                                        } else if (marker.hasRangeLabel("box")) {
                                            this.cursor.pos += 1;
                                        } else {
                                            this.cursorFwd();
                                        }
                                    } else if (marker.behaviors & client_api_1.MergeTree.MarkerBehaviors.RangeEnd) {
                                        if (marker.hasRangeLabel("row")) {
                                            this.cursorFwd();
                                        } else if (marker.hasRangeLabel("table")) {
                                            this.cursor.pos += 2;
                                        } else {
                                            this.cursorFwd();
                                        }
                                    } else {
                                        this.cursorFwd();
                                    }
                                }
                            }
                        }
                    }, {
                        key: "verticalMove",
                        value: function verticalMove(lineCount) {
                            var up = lineCount < 0;
                            var lineDiv = this.cursor.lineDiv();
                            var targetLineDiv = void 0;
                            if (lineCount < 0) {
                                targetLineDiv = lineDiv.previousElementSibling;
                            } else {
                                targetLineDiv = lineDiv.nextElementSibling;
                            }
                            var x = this.getCanonicalX();
                            // if line div is row, then find line in box closest to x
                            function checkInTable() {
                                var rowDiv = targetLineDiv;
                                while (rowDiv && rowDiv.rowView) {
                                    if (rowDiv.rowView) {
                                        var box = rowDiv.rowView.findClosestBox(x);
                                        if (box) {
                                            if (up) {
                                                targetLineDiv = box.viewport.lastLineDiv();
                                            } else {
                                                targetLineDiv = box.viewport.firstLineDiv();
                                            }
                                            rowDiv = targetLineDiv;
                                        } else {
                                            break;
                                        }
                                    }
                                }
                            }
                            if (targetLineDiv) {
                                checkInTable();
                                return this.setCursorPosFromPixels(targetLineDiv, x);
                            } else {
                                // TODO: handle nested tables
                                // go out to row containing this line (line may be at top or bottom of box)
                                var rowDiv = findRowParent(lineDiv);
                                if (rowDiv && rowDiv.rowView) {
                                    var rowView = rowDiv.rowView;
                                    var tableView = rowView.table;
                                    var targetRow = void 0;
                                    if (up) {
                                        targetRow = tableView.findPrecedingRow(rowView);
                                    } else {
                                        targetRow = tableView.findNextRow(rowView);
                                    }
                                    if (targetRow) {
                                        var box = targetRow.findClosestBox(x);
                                        if (box) {
                                            if (up) {
                                                targetLineDiv = box.viewport.lastLineDiv();
                                            } else {
                                                targetLineDiv = box.viewport.firstLineDiv();
                                            }
                                        }
                                        return this.setCursorPosFromPixels(targetLineDiv, x);
                                    } else {
                                        // top or bottom row of table
                                        if (up) {
                                            targetLineDiv = rowDiv.previousElementSibling;
                                        } else {
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
                    }, {
                        key: "viewportCharCount",
                        value: function viewportCharCount() {
                            return this.viewportEndPos - this.viewportStartPos;
                        }
                    }, {
                        key: "setEdit",
                        value: function setEdit(docRoot) {
                            var _this17 = this;

                            this.docRoot = docRoot;
                            window.oncontextmenu = preventD;
                            this.element.onmousemove = preventD;
                            this.element.onmouseup = preventD;
                            this.element.onselectstart = preventD;
                            this.element.onmousedown = function (e) {
                                if (e.button === 0) {
                                    var span = e.target;
                                    var segspan = void 0;
                                    if (span.seg) {
                                        segspan = span;
                                    } else {
                                        segspan = span.parentElement;
                                    }
                                    if (segspan && segspan.seg) {
                                        _this17.clickSpan(e.clientX, e.clientY, segspan);
                                    }
                                    e.preventDefault();
                                    e.returnValue = false;
                                    return false;
                                } else if (e.button === 2) {
                                    e.preventDefault();
                                    e.returnValue = false;
                                    return false;
                                }
                            };
                            this.element.onmousewheel = function (e) {
                                if (!_this17.wheelTicking) {
                                    var factor = 20;
                                    var inputDelta = e.wheelDelta;
                                    if (Math.abs(e.wheelDelta) === 120) {
                                        inputDelta = e.wheelDelta / 6;
                                    } else {
                                        inputDelta = e.wheelDelta / 2;
                                    }
                                    var delta = factor * inputDelta;
                                    // tslint:disable-next-line:max-line-length
                                    // console.log(`top char: ${this.topChar - delta} factor ${factor}; delta: ${delta} wheel: ${e.wheelDeltaY} ${e.wheelDelta} ${e.detail}`);
                                    setTimeout(function () {
                                        _this17.render(Math.floor(_this17.topChar - delta));
                                        _this17.apresScroll(delta < 0);
                                        _this17.wheelTicking = false;
                                    }, 20);
                                    _this17.wheelTicking = true;
                                }
                                e.preventDefault();
                                e.returnValue = false;
                            };
                            var keydownHandler = function keydownHandler(e) {
                                var saveLastVertX = _this17.lastVerticalX;
                                var specialKey = true;
                                _this17.lastVerticalX = -1;
                                if (e.ctrlKey && e.keyCode !== 17) {
                                    _this17.keyCmd(e.keyCode);
                                } else if (e.keyCode === KeyCode.TAB) {
                                    _this17.handleTAB(e.shiftKey);
                                } else if (e.keyCode === KeyCode.backspace) {
                                    _this17.cursor.pos--;
                                    _this17.sharedString.removeText(_this17.cursor.pos, _this17.cursor.pos + 1);
                                    _this17.localQueueRender(_this17.cursor.pos);
                                } else if ((e.keyCode === KeyCode.pageUp || e.keyCode === KeyCode.pageDown) && !_this17.ticking) {
                                    setTimeout(function () {
                                        _this17.scroll(e.keyCode === KeyCode.pageUp);
                                        _this17.ticking = false;
                                    }, 20);
                                    _this17.ticking = true;
                                } else if (e.keyCode === KeyCode.home) {
                                    _this17.cursor.pos = FlowView.docStartPosition;
                                    _this17.render(FlowView.docStartPosition);
                                } else if (e.keyCode === KeyCode.end) {
                                    var halfport = Math.floor(_this17.viewportCharCount() / 2);
                                    var topChar = _this17.client.getLength() - halfport;
                                    _this17.cursor.pos = topChar;
                                    _this17.updatePresence();
                                    _this17.render(topChar);
                                } else if (e.keyCode === KeyCode.rightArrow) {
                                    if (_this17.cursor.pos < _this17.client.getLength() - 1) {
                                        if (_this17.cursor.pos === _this17.viewportEndPos) {
                                            _this17.scroll(false, true);
                                        }
                                        _this17.cursorFwd();
                                        _this17.updatePresence();
                                        _this17.cursor.updateView(_this17);
                                    }
                                } else if (e.keyCode === KeyCode.leftArrow) {
                                    if (_this17.cursor.pos > FlowView.docStartPosition) {
                                        if (_this17.cursor.pos === _this17.viewportStartPos) {
                                            _this17.scroll(true, true);
                                        }
                                        _this17.cursorRev();
                                        _this17.updatePresence();
                                        _this17.cursor.updateView(_this17);
                                    }
                                } else if (e.keyCode === KeyCode.upArrow || e.keyCode === KeyCode.downArrow) {
                                    _this17.lastVerticalX = saveLastVertX;
                                    var lineCount = 1;
                                    if (e.keyCode === KeyCode.upArrow) {
                                        lineCount = -1;
                                    }
                                    var vpEnd = _this17.viewportEndPos;
                                    var maxPos = _this17.client.getLength() - 1;
                                    if (vpEnd < maxPos) {
                                        if (!_this17.verticalMove(lineCount)) {
                                            _this17.scroll(lineCount < 0, true);
                                            if (lineCount > 0) {
                                                while (vpEnd === _this17.viewportEndPos) {
                                                    if (_this17.cursor.pos > maxPos) {
                                                        _this17.cursor.pos = maxPos;
                                                        break;
                                                    }
                                                    _this17.scroll(lineCount < 0, true);
                                                }
                                            }
                                            _this17.verticalMove(lineCount);
                                        }
                                        if (_this17.cursor.pos > maxPos) {
                                            _this17.cursor.pos = maxPos;
                                        }
                                        _this17.updatePresence();
                                        _this17.cursor.updateView(_this17);
                                    }
                                } else {
                                    if (!e.ctrlKey) {
                                        specialKey = false;
                                    }
                                }
                                if (specialKey) {
                                    e.preventDefault();
                                    e.returnValue = false;
                                }
                            };
                            var keypressHandler = function keypressHandler(e) {
                                var pos = _this17.cursor.pos;
                                _this17.cursor.pos++;
                                var code = e.charCode;
                                if (code === CharacterCodes.cr) {
                                    // TODO: other labels; for now assume only list/pg tile labels
                                    var curTilePos = findTile(_this17, pos, "pg", false);
                                    var pgMarker = curTilePos.tile;
                                    var pgPos = curTilePos.pos;
                                    clearContentCaches(pgMarker);
                                    var curProps = pgMarker.properties;
                                    var newProps = client_api_1.MergeTree.createMap();
                                    var newLabels = ["pg"];
                                    if (isListTile(pgMarker)) {
                                        newLabels.push("list");
                                        newProps.indentLevel = curProps.indentLevel;
                                        newProps.listKind = curProps.listKind;
                                    }
                                    newProps[client_api_1.MergeTree.reservedTileLabelsKey] = newLabels;
                                    // TODO: place in group op
                                    // old marker gets new props
                                    _this17.sharedString.annotateRange(newProps, pgPos, pgPos + 1, { name: "rewrite" });
                                    // new marker gets existing props
                                    _this17.sharedString.insertMarker(pos, client_api_1.MergeTree.MarkerBehaviors.Tile, curProps);
                                } else {
                                    _this17.sharedString.insertText(String.fromCharCode(code), pos);
                                    _this17.updatePGInfo(pos);
                                }
                                _this17.localQueueRender(_this17.cursor.pos);
                            };
                            // Register for keyboard messages
                            this.on("keydown", keydownHandler);
                            this.on("keypress", keypressHandler);
                        }
                    }, {
                        key: "viewTileProps",
                        value: function viewTileProps() {
                            var searchPos = this.cursor.pos;
                            if (this.cursor.pos === this.cursor.lineDiv().lineEnd) {
                                searchPos--;
                            }
                            var tileInfo = findTile(this, searchPos, "pg");
                            if (tileInfo) {
                                var buf = "";
                                if (tileInfo.tile.properties) {
                                    // tslint:disable:forin
                                    for (var key in tileInfo.tile.properties) {
                                        buf += " { " + key + ": " + tileInfo.tile.properties[key] + " }";
                                    }
                                }
                                var lc = !!tileInfo.tile.listCache;
                                console.log("tile at pos " + tileInfo.pos + " with props" + buf + " and list cache: " + lc);
                            }
                        }
                    }, {
                        key: "setList",
                        value: function setList() {
                            var listKind = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 0;

                            var searchPos = this.cursor.pos;
                            var tileInfo = findTile(this, searchPos, "pg", false);
                            if (tileInfo) {
                                var tile = tileInfo.tile;
                                var listStatus = false;
                                if (tile.hasTileLabel("list")) {
                                    listStatus = true;
                                }
                                var curLabels = tile.properties[client_api_1.MergeTree.reservedTileLabelsKey];
                                if (listStatus) {
                                    var _sharedString$annotat;

                                    var remainingLabels = curLabels.filter(function (l) {
                                        return l !== "list";
                                    });
                                    this.sharedString.annotateRange((_sharedString$annotat = {}, _defineProperty(_sharedString$annotat, client_api_1.MergeTree.reservedTileLabelsKey, remainingLabels), _defineProperty(_sharedString$annotat, "series", null), _sharedString$annotat), tileInfo.pos, tileInfo.pos + 1);
                                } else {
                                    var _sharedString$annotat2;

                                    var augLabels = curLabels.slice();
                                    augLabels.push("list");
                                    var indentLevel = 1;
                                    if (tile.properties && tile.properties.indentLevel) {
                                        indentLevel = tile.properties.indentLevel;
                                    }
                                    this.sharedString.annotateRange((_sharedString$annotat2 = {}, _defineProperty(_sharedString$annotat2, client_api_1.MergeTree.reservedTileLabelsKey, augLabels), _defineProperty(_sharedString$annotat2, "indentLevel", indentLevel), _defineProperty(_sharedString$annotat2, "listKind", listKind), _sharedString$annotat2), tileInfo.pos, tileInfo.pos + 1);
                                }
                                tile.listCache = undefined;
                                this.localQueueRender(this.cursor.pos);
                            }
                        }
                        // TODO: tab stops in non-list, non-table paragraphs

                    }, {
                        key: "handleTAB",
                        value: function handleTAB() {
                            var shift = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : false;

                            var searchPos = this.cursor.pos;
                            var tileInfo = findTile(this, searchPos, "pg", false);
                            if (tileInfo) {
                                var cursorContext = this.client.mergeTree.getStackContext(tileInfo.pos, this.client.getClientId(), ["table", "box", "row"]);
                                if (cursorContext.table && !cursorContext.table.empty()) {
                                    var tableMarker = cursorContext.table.top();
                                    var tableView = tableMarker.view;
                                    if (cursorContext.box && !cursorContext.box.empty()) {
                                        var box = cursorContext.box.top();
                                        var toBox = void 0;
                                        if (shift) {
                                            toBox = tableView.prevBox(box.view);
                                        } else {
                                            toBox = tableView.nextBox(box.view);
                                        }
                                        if (toBox) {
                                            var offset = this.client.mergeTree.getOffset(toBox.marker, client_api_1.MergeTree.UniversalSequenceNumber, this.client.getClientId());
                                            this.cursor.pos = offset + 1;
                                        } else {
                                            if (shift) {
                                                var _offset = this.client.mergeTree.getOffset(tableView.tableMarker, client_api_1.MergeTree.UniversalSequenceNumber, this.client.getClientId());
                                                this.cursor.pos = _offset - 1;
                                            } else {
                                                var endOffset = this.client.mergeTree.getOffset(tableView.endTableMarker, client_api_1.MergeTree.UniversalSequenceNumber, this.client.getClientId());
                                                this.cursor.pos = endOffset + 1;
                                            }
                                        }
                                        this.updatePresence();
                                        this.cursor.updateView(this);
                                    }
                                } else {
                                    var tile = tileInfo.tile;
                                    this.increaseIndent(tile, tileInfo.pos, shift);
                                }
                            }
                        }
                    }, {
                        key: "toggleBlockquote",
                        value: function toggleBlockquote() {
                            var tileInfo = findTile(this, this.cursor.pos, "pg", false);
                            if (tileInfo) {
                                var tile = tileInfo.tile;
                                var props = tile.properties;
                                if (props && props.blockquote) {
                                    this.sharedString.annotateRange({ blockquote: false }, tileInfo.pos, tileInfo.pos + 1);
                                } else {
                                    this.sharedString.annotateRange({ blockquote: true }, tileInfo.pos, tileInfo.pos + 1);
                                }
                                this.localQueueRender(this.cursor.pos);
                            }
                        }
                    }, {
                        key: "keyCmd",
                        value: function keyCmd(charCode) {
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
                                    console.log("got command key " + String.fromCharCode(charCode));
                                    break;
                            }
                        }
                    }, {
                        key: "testWordInfo",
                        value: function testWordInfo() {
                            var text = this.sharedString.client.getText();
                            var nonWhitespace = text.split(/\s+/g);
                            console.log("non ws count: " + nonWhitespace.length);
                            var obj = new Object();
                            var _iteratorNormalCompletion13 = true;
                            var _didIteratorError13 = false;
                            var _iteratorError13 = undefined;

                            try {
                                for (var _iterator13 = nonWhitespace[Symbol.iterator](), _step13; !(_iteratorNormalCompletion13 = (_step13 = _iterator13.next()).done); _iteratorNormalCompletion13 = true) {
                                    var nws = _step13.value;

                                    if (!obj[nws]) {
                                        obj[nws] = 1;
                                    } else {
                                        obj[nws]++;
                                    }
                                }
                            } catch (err) {
                                _didIteratorError13 = true;
                                _iteratorError13 = err;
                            } finally {
                                try {
                                    if (!_iteratorNormalCompletion13 && _iterator13.return) {
                                        _iterator13.return();
                                    }
                                } finally {
                                    if (_didIteratorError13) {
                                        throw _iteratorError13;
                                    }
                                }
                            }

                            var count = 0;
                            var uniques = [];
                            for (var key in obj) {
                                if (obj.hasOwnProperty(key)) {
                                    count++;
                                    uniques.push(key);
                                }
                            }
                            console.log(count + " unique");
                            var clock = Date.now();
                            getMultiTextWidth(uniques, "18px Times");
                            console.log("unique pp cost: " + (Date.now() - clock) + "ms");
                        }
                    }, {
                        key: "preScroll",
                        value: function preScroll() {
                            if (this.lastVerticalX === -1) {
                                var rect = this.cursor.rect();
                                this.lastVerticalX = rect.left;
                            }
                        }
                    }, {
                        key: "apresScroll",
                        value: function apresScroll(up) {
                            if (this.cursor.pos < this.viewportStartPos || this.cursor.pos >= this.viewportEndPos) {
                                var x = this.getCanonicalX();
                                if (up) {
                                    this.setCursorPosFromPixels(this.firstLineDiv(), x);
                                } else {
                                    this.setCursorPosFromPixels(this.lastLineDiv(), x);
                                }
                                this.updatePresence();
                                this.cursor.updateView(this);
                            }
                        }
                    }, {
                        key: "scroll",
                        value: function scroll(up) {
                            var one = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;

                            var scrollTo = this.topChar;
                            if (one) {
                                if (up) {
                                    var firstLineDiv = this.firstLineDiv();
                                    scrollTo = firstLineDiv.linePos - 2;
                                    if (scrollTo < 0) {
                                        return;
                                    }
                                } else {
                                    var nextFirstLineDiv = this.firstLineDiv().nextElementSibling;
                                    if (nextFirstLineDiv) {
                                        scrollTo = nextFirstLineDiv.linePos;
                                    } else {
                                        return;
                                    }
                                }
                            } else {
                                var len = this.client.getLength();
                                var halfport = Math.floor(this.viewportCharCount() / 2);
                                if (up && this.topChar === 0 || !up && this.topChar > len - halfport) {
                                    return;
                                }
                                if (up) {
                                    scrollTo -= halfport;
                                } else {
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
                    }, {
                        key: "render",
                        value: function render(topChar) {
                            var changed = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;

                            var len = this.client.getLength();
                            if (len === 0) {
                                return;
                            }
                            if (topChar !== undefined) {
                                if ((this.topChar === topChar || this.topChar === -1 && topChar < 0) && !changed) {
                                    return;
                                }
                                this.topChar = topChar;
                                if (this.topChar < 0) {
                                    this.topChar = 0;
                                }
                                if (this.topChar >= len) {
                                    this.topChar = len - this.viewportCharCount() / 2;
                                }
                            }
                            var clk = Date.now();
                            // TODO: consider using markers for presence info once splice segments during pg render
                            this.updatePresencePositions();
                            clearSubtree(this.viewportDiv);
                            // this.viewportDiv.appendChild(this.cursor.editSpan);
                            var renderOutput = renderTree(this.viewportDiv, this.topChar, this);
                            this.viewportStartPos = renderOutput.viewportStartPos;
                            this.viewportEndPos = renderOutput.viewportEndPos;
                            if (this.diagCharPort || true) {
                                this.statusMessage("render", "&nbsp " + (Date.now() - clk) + "ms");
                            }
                            if (this.diagCharPort) {
                                this.statusMessage("diagCharPort", "&nbsp sp: (" + this.topChar + ") ep: " + this.viewportEndPos + " cp: " + this.cursor.pos);
                            }
                            this.emit("render", {
                                overlayMarkers: renderOutput.overlayMarkers,
                                range: { min: 1, max: this.client.getLength(), value: this.viewportStartPos },
                                viewportEndPos: this.viewportEndPos,
                                viewportStartPos: this.viewportStartPos
                            });
                        }
                    }, {
                        key: "loadFinished",
                        value: function loadFinished() {
                            var clockStart = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 0;

                            this.render(0, true);
                            if (clockStart > 0) {
                                // tslint:disable-next-line:max-line-length
                                console.log("time to edit/impression: " + this.timeToEdit + " time to load: " + (Date.now() - clockStart) + "ms len: " + this.sharedString.client.getLength() + " - " + performanceNow());
                            }
                            var presenceMap = this.docRoot.get("presence");
                            this.addPresenceMap(presenceMap);
                            // this.testWordInfo();
                        }
                    }, {
                        key: "randomWordMove",
                        value: function randomWordMove() {
                            var client = this.sharedString.client;
                            var word1 = merge_tree_utils_1.findRandomWord(client.mergeTree, client.getClientId());
                            if (word1) {
                                var removeStart = word1.pos;
                                var removeEnd = removeStart + word1.text.length;
                                this.sharedString.removeText(removeStart, removeEnd);
                                var word2 = merge_tree_utils_1.findRandomWord(client.mergeTree, client.getClientId());
                                while (!word2) {
                                    word2 = merge_tree_utils_1.findRandomWord(client.mergeTree, client.getClientId());
                                }
                                var pos = word2.pos + word2.text.length;
                                this.sharedString.insertText(word1.text, pos);
                            }
                        }
                    }, {
                        key: "randomWordMoveStart",
                        value: function randomWordMoveStart() {
                            var _this18 = this;

                            this.randWordTimer = setInterval(function () {
                                for (var i = 0; i < 3; i++) {
                                    _this18.randomWordMove();
                                }
                            }, 10);
                        }
                    }, {
                        key: "randomWordMoveEnd",
                        value: function randomWordMoveEnd() {
                            clearInterval(this.randWordTimer);
                        }
                    }, {
                        key: "updatePGInfo",
                        value: function updatePGInfo(changePos) {
                            var tileInfo = findTile(this, changePos, "pg", false);
                            if (tileInfo) {
                                var tile = tileInfo.tile;
                                clearContentCaches(tile);
                            } else {
                                console.log("did not find pg to clear");
                            }
                        }
                    }, {
                        key: "localQueueRender",
                        value: function localQueueRender(updatePos) {
                            var _this19 = this;

                            this.updatePGInfo(updatePos);
                            this.pendingRender = true;
                            window.requestAnimationFrame(function () {
                                _this19.pendingRender = false;
                                _this19.render(_this19.topChar, true);
                            });
                        }
                    }, {
                        key: "setViewOption",
                        value: function setViewOption(options) {
                            viewOptions = options;
                        }
                    }, {
                        key: "resizeCore",
                        value: function resizeCore(bounds) {
                            this.viewportRect = bounds.inner(0.92);
                            ui.Rectangle.conformElementToRect(this.viewportDiv, this.viewportRect);
                            if (this.client.getLength() > 0) {
                                this.render(this.topChar, true);
                            }
                        }
                    }, {
                        key: "increaseIndent",
                        value: function increaseIndent(tile, pos) {
                            var decrease = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : false;

                            tile.listCache = undefined;
                            if (decrease && tile.properties.indentLevel > 0) {
                                this.sharedString.annotateRange({ indentLevel: -1 }, pos, pos + 1, { name: "incr", defaultValue: 1, minValue: 0 });
                            } else if (!decrease) {
                                this.sharedString.annotateRange({ indentLevel: 1 }, pos, pos + 1, { name: "incr", defaultValue: 0 });
                            }
                            this.localQueueRender(this.cursor.pos);
                        }
                        // TODO: paragraph spanning changes and annotations
                        // TODO: generalize this by using transform fwd

                    }, {
                        key: "applyOp",
                        value: function applyOp(delta, msg) {
                            // tslint:disable:switch-default
                            switch (delta.type) {
                                case 0 /* INSERT */:
                                    var adjLength = 1;
                                    if (delta.marker) {
                                        this.updatePGInfo(delta.pos1 - 1);
                                    } else if (delta.pos1 <= this.cursor.pos) {
                                        adjLength = delta.text.length;
                                        this.cursor.pos += delta.text.length;
                                    }
                                    this.remotePresenceFromEdit(msg.clientId, msg.referenceSequenceNumber, delta.pos1, adjLength);
                                    this.updatePGInfo(delta.pos1);
                                    return true;
                                case 1 /* REMOVE */:
                                    if (delta.pos2 <= this.cursor.pos) {
                                        this.cursor.pos -= delta.pos2 - delta.pos1;
                                    } else if (this.cursor.pos >= delta.pos1) {
                                        this.cursor.pos = delta.pos1;
                                    }
                                    this.remotePresenceFromEdit(msg.clientId, msg.referenceSequenceNumber, delta.pos1);
                                    this.updatePGInfo(delta.pos1);
                                    return true;
                                case 3 /* GROUP */:
                                    {
                                        var opAffectsViewport = false;
                                        var _iteratorNormalCompletion14 = true;
                                        var _didIteratorError14 = false;
                                        var _iteratorError14 = undefined;

                                        try {
                                            for (var _iterator14 = delta.ops[Symbol.iterator](), _step14; !(_iteratorNormalCompletion14 = (_step14 = _iterator14.next()).done); _iteratorNormalCompletion14 = true) {
                                                var groupOp = _step14.value;

                                                opAffectsViewport = opAffectsViewport || this.applyOp(groupOp, msg);
                                            }
                                        } catch (err) {
                                            _didIteratorError14 = true;
                                            _iteratorError14 = err;
                                        } finally {
                                            try {
                                                if (!_iteratorNormalCompletion14 && _iterator14.return) {
                                                    _iterator14.return();
                                                }
                                            } finally {
                                                if (_didIteratorError14) {
                                                    throw _iteratorError14;
                                                }
                                            }
                                        }

                                        return opAffectsViewport;
                                    }
                                case 2 /* ANNOTATE */:
                                    {
                                        return this.posInViewport(delta.pos1) || this.posInViewport(delta.pos2 - 1);
                                    }
                            }
                        }
                    }, {
                        key: "posInViewport",
                        value: function posInViewport(pos) {
                            return this.viewportEndPos > pos && pos >= this.viewportStartPos;
                        }
                    }, {
                        key: "presenceQueueRender",
                        value: function presenceQueueRender(remotePosInfo) {
                            var _this20 = this;

                            if (!this.pendingRender && this.posInViewport(remotePosInfo.xformPos)) {
                                this.pendingRender = true;
                                window.requestAnimationFrame(function () {
                                    _this20.pendingRender = false;
                                    _this20.render(_this20.topChar, true);
                                });
                            }
                        }
                    }, {
                        key: "queueRender",
                        value: function queueRender(msg) {
                            var _this21 = this;

                            if (!this.pendingRender && msg && msg.contents) {
                                this.pendingRender = true;
                                window.requestAnimationFrame(function () {
                                    _this21.pendingRender = false;
                                    _this21.render(_this21.topChar, true);
                                });
                            }
                        }
                    }]);

                    return FlowView;
                }(ui.Component);

                FlowView.docStartPosition = 0;
                exports.FlowView = FlowView;
            }).call(this, typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {});
        }, { "../merge-tree-utils": 32, "../ui": 41, "performance-now": 2 }], 16: [function (require, module, exports) {
            "use strict";

            Object.defineProperty(exports, "__esModule", { value: true });
            var ui = require("../ui");

            var Image = function (_ui$Component9) {
                _inherits(Image, _ui$Component9);

                function Image(element, src) {
                    _classCallCheck(this, Image);

                    var _this22 = _possibleConstructorReturn(this, (Image.__proto__ || Object.getPrototypeOf(Image)).call(this, element));

                    _this22.message = document.createElement("span");
                    _this22.message.style.height = "auto";
                    _this22.message.style.height = "auto";
                    _this22.message.style.padding = "5px";
                    _this22.message.style.borderRadius = "8px";
                    _this22.message.style.backgroundColor = "rgba(0, 240, 20, 0.5)";
                    element.appendChild(_this22.message);
                    _this22.image = document.createElement("img");
                    _this22.image.src = src;
                    _this22.image.alt = "Your Buddy!";
                    element.appendChild(_this22.image);
                    return _this22;
                }

                _createClass(Image, [{
                    key: "setMessage",
                    value: function setMessage(message) {
                        this.message.innerText = message;
                    }
                }, {
                    key: "resizeCore",
                    value: function resizeCore(bounds) {
                        bounds.x = 0;
                        bounds.y = 0;
                        var overlayInnerRects = bounds.nipHoriz(Math.floor(bounds.width * 0.6));
                        overlayInnerRects[0].conformElement(this.message);
                        overlayInnerRects[1].conformElement(this.image);
                    }
                }]);

                return Image;
            }(ui.Component);

            exports.Image = Image;
        }, { "../ui": 41 }], 17: [function (require, module, exports) {
            "use strict";

            function __export(m) {
                for (var p in m) {
                    if (!exports.hasOwnProperty(p)) exports[p] = m[p];
                }
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
        }, { "./dockPanel": 10, "./flexVideo": 11, "./flexVideoCanvas": 12, "./flexView": 13, "./flowContainer": 14, "./flowView": 15, "./image": 16, "./layerPanel": 19, "./overlayCanvas": 20, "./popup": 21, "./shapeRecognizer": 23, "./status": 28, "./title": 29, "./youtubeVideo": 30, "./youtubeVideoCanvas": 31 }], 18: [function (require, module, exports) {
            (function (global) {
                "use strict";

                Object.defineProperty(exports, "__esModule", { value: true });
                var client_api_1 = typeof window !== "undefined" ? window['prague'] : typeof global !== "undefined" ? global['prague'] : null;
                var ui = require("../ui");
                var overlayCanvas_1 = require("./overlayCanvas");
                var index_1 = require("./shapes/index");

                var EventPoint = function EventPoint(relative, evt) {
                    _classCallCheck(this, EventPoint);

                    var offset = $(relative).offset();
                    this.rawPosition = {
                        x: evt.pageX - offset.left,
                        y: evt.pageY - offset.top
                    };
                    this.properties = { isEraser: false };
                };

                var InkCanvas = function (_ui$Component10) {
                    _inherits(InkCanvas, _ui$Component10);

                    // constructor
                    function InkCanvas(element, model) {
                        _classCallCheck(this, InkCanvas);

                        var _this23 = _possibleConstructorReturn(this, (InkCanvas.__proto__ || Object.getPrototypeOf(InkCanvas)).call(this, element));

                        _this23.model = model;
                        _this23.penID = -1;
                        _this23.lastLayerRenderOp = {};
                        _this23.model.on("op", function (op) {
                            // Update the canvas
                            _this23.addAndDrawStroke(op.contents, false);
                        });
                        _this23.model.on("load", function () {
                            _this23.redraw();
                        });
                        // setup canvas
                        _this23.canvasWrapper = document.createElement("div");
                        _this23.canvasWrapper.classList.add("drawSurface");
                        _this23.canvas = document.createElement("canvas");
                        _this23.canvasWrapper.appendChild(_this23.canvas);
                        element.appendChild(_this23.canvasWrapper);
                        // get context
                        _this23.context = _this23.canvas.getContext("2d");
                        var bb = false;
                        _this23.canvas.addEventListener("pointerdown", function (evt) {
                            return _this23.handlePointerDown(evt);
                        }, bb);
                        _this23.canvas.addEventListener("pointermove", function (evt) {
                            return _this23.handlePointerMove(evt);
                        }, bb);
                        _this23.canvas.addEventListener("pointerup", function (evt) {
                            return _this23.handlePointerUp(evt);
                        }, bb);
                        _this23.currentPen = {
                            color: { r: 0, g: 161 / 255, b: 241 / 255, a: 0 },
                            thickness: 7
                        };
                        return _this23;
                    }
                    /**
                     * Used to just enable/disable the ink events. Should only be used when needing to temporarily
                     * disable ink (for DOM hit testing events, for example). The enableInk event is probably what you really want.
                     */


                    _createClass(InkCanvas, [{
                        key: "enableInkHitTest",
                        value: function enableInkHitTest(enable) {
                            this.element.style.pointerEvents = enable ? "auto" : "none";
                        }
                    }, {
                        key: "setPenColor",
                        value: function setPenColor(color) {
                            this.currentPen.color = color;
                        }
                    }, {
                        key: "replay",
                        value: function replay() {
                            this.clearCanvas();
                            var layers = this.model.getLayers();
                            // Time of the first operation in layer 0 is our starting time
                            var startTime = layers[0].operations[0].time;
                            var _iteratorNormalCompletion15 = true;
                            var _didIteratorError15 = false;
                            var _iteratorError15 = undefined;

                            try {
                                for (var _iterator15 = layers[Symbol.iterator](), _step15; !(_iteratorNormalCompletion15 = (_step15 = _iterator15.next()).done); _iteratorNormalCompletion15 = true) {
                                    var layer = _step15.value;

                                    this.animateLayer(layer, 0, startTime);
                                }
                            } catch (err) {
                                _didIteratorError15 = true;
                                _iteratorError15 = err;
                            } finally {
                                try {
                                    if (!_iteratorNormalCompletion15 && _iterator15.return) {
                                        _iterator15.return();
                                    }
                                } finally {
                                    if (_didIteratorError15) {
                                        throw _iteratorError15;
                                    }
                                }
                            }
                        }
                        /**
                         * Resizes the canvas
                         */

                    }, {
                        key: "resizeCore",
                        value: function resizeCore(bounds) {
                            // Updates the size of the canvas
                            this.canvas.width = bounds.width;
                            this.canvas.height = bounds.height;
                            // And then redraw the canvas
                            this.redraw();
                        }
                        // We will accept pen down or mouse left down as the start of a stroke.
                        // We will accept touch down or mouse right down as the start of a touch.

                    }, {
                        key: "handlePointerDown",
                        value: function handlePointerDown(evt) {
                            this.penID = evt.pointerId;
                            if (evt.pointerType === "pen" || evt.pointerType === "mouse" && evt.button === 0) {
                                // Anchor and clear any current selection.
                                var pt = new EventPoint(this.canvas, evt);
                                var delta = new client_api_1.types.Delta().stylusDown(pt.rawPosition, evt.pressure, this.currentPen);
                                this.currentStylusActionId = delta.operations[0].stylusDown.id;
                                this.addAndDrawStroke(delta, true);
                                evt.returnValue = false;
                            }
                        }
                    }, {
                        key: "handlePointerMove",
                        value: function handlePointerMove(evt) {
                            if (evt.pointerId === this.penID) {
                                var pt = new EventPoint(this.canvas, evt);
                                var delta = new client_api_1.types.Delta().stylusMove(pt.rawPosition, evt.pressure, this.currentStylusActionId);
                                this.addAndDrawStroke(delta, true);
                                evt.returnValue = false;
                            }
                            return false;
                        }
                    }, {
                        key: "handlePointerUp",
                        value: function handlePointerUp(evt) {
                            if (evt.pointerId === this.penID) {
                                this.penID = -1;
                                var pt = new EventPoint(this.canvas, evt);
                                evt.returnValue = false;
                                var delta = new client_api_1.types.Delta().stylusUp(pt.rawPosition, evt.pressure, this.currentStylusActionId);
                                this.currentStylusActionId = undefined;
                                this.addAndDrawStroke(delta, true);
                            }
                            return false;
                        }
                    }, {
                        key: "animateLayer",
                        value: function animateLayer(layer, operationIndex, startTime) {
                            var _this24 = this;

                            if (operationIndex >= layer.operations.length) {
                                return;
                            }
                            // Draw the requested stroke
                            var currentOperation = layer.operations[operationIndex];
                            var previousOperation = layer.operations[Math.max(0, operationIndex - 1)];
                            var time = operationIndex === 0 ? currentOperation.time - startTime : currentOperation.time - previousOperation.time;
                            setTimeout(function () {
                                _this24.drawStroke(layer, currentOperation, previousOperation);
                                _this24.animateLayer(layer, operationIndex + 1, startTime);
                            }, time);
                        }
                        /**
                         * Clears the canvas
                         */

                    }, {
                        key: "clearCanvas",
                        value: function clearCanvas() {
                            this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
                        }
                    }, {
                        key: "redraw",
                        value: function redraw() {
                            this.clearCanvas();
                            var layers = this.model.getLayers();
                            var _iteratorNormalCompletion16 = true;
                            var _didIteratorError16 = false;
                            var _iteratorError16 = undefined;

                            try {
                                for (var _iterator16 = layers[Symbol.iterator](), _step16; !(_iteratorNormalCompletion16 = (_step16 = _iterator16.next()).done); _iteratorNormalCompletion16 = true) {
                                    var layer = _step16.value;

                                    var previous = layer.operations[0];
                                    var _iteratorNormalCompletion17 = true;
                                    var _didIteratorError17 = false;
                                    var _iteratorError17 = undefined;

                                    try {
                                        for (var _iterator17 = layer.operations[Symbol.iterator](), _step17; !(_iteratorNormalCompletion17 = (_step17 = _iterator17.next()).done); _iteratorNormalCompletion17 = true) {
                                            var operation = _step17.value;

                                            this.drawStroke(layer, operation, previous);
                                            previous = operation;
                                        }
                                    } catch (err) {
                                        _didIteratorError17 = true;
                                        _iteratorError17 = err;
                                    } finally {
                                        try {
                                            if (!_iteratorNormalCompletion17 && _iterator17.return) {
                                                _iterator17.return();
                                            }
                                        } finally {
                                            if (_didIteratorError17) {
                                                throw _iteratorError17;
                                            }
                                        }
                                    }
                                }
                            } catch (err) {
                                _didIteratorError16 = true;
                                _iteratorError16 = err;
                            } finally {
                                try {
                                    if (!_iteratorNormalCompletion16 && _iterator16.return) {
                                        _iterator16.return();
                                    }
                                } finally {
                                    if (_didIteratorError16) {
                                        throw _iteratorError16;
                                    }
                                }
                            }
                        }
                    }, {
                        key: "drawStroke",
                        value: function drawStroke(layer, current, previous) {
                            var type = client_api_1.types.getActionType(current);
                            var shapes = void 0;
                            var currentAction = client_api_1.types.getStylusAction(current);
                            var previousAction = client_api_1.types.getStylusAction(previous);
                            var pen = layer.operations[0].stylusDown.pen;
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
                                var _iteratorNormalCompletion18 = true;
                                var _didIteratorError18 = false;
                                var _iteratorError18 = undefined;

                                try {
                                    for (var _iterator18 = shapes[Symbol.iterator](), _step18; !(_iteratorNormalCompletion18 = (_step18 = _iterator18.next()).done); _iteratorNormalCompletion18 = true) {
                                        var shape = _step18.value;

                                        this.context.beginPath();
                                        shape.render(this.context, { x: 0, y: 0 });
                                        this.context.closePath();
                                        this.context.fill();
                                    }
                                } catch (err) {
                                    _didIteratorError18 = true;
                                    _iteratorError18 = err;
                                } finally {
                                    try {
                                        if (!_iteratorNormalCompletion18 && _iterator18.return) {
                                            _iterator18.return();
                                        }
                                    } finally {
                                        if (_didIteratorError18) {
                                            throw _iteratorError18;
                                        }
                                    }
                                }
                            }
                        }
                    }, {
                        key: "addAndDrawStroke",
                        value: function addAndDrawStroke(delta, submit) {
                            if (submit) {
                                this.model.submitOp(delta);
                            }
                            var dirtyLayers = {};
                            var _iteratorNormalCompletion19 = true;
                            var _didIteratorError19 = false;
                            var _iteratorError19 = undefined;

                            try {
                                for (var _iterator19 = delta.operations[Symbol.iterator](), _step19; !(_iteratorNormalCompletion19 = (_step19 = _iterator19.next()).done); _iteratorNormalCompletion19 = true) {
                                    var operation = _step19.value;

                                    var type = client_api_1.types.getActionType(operation);
                                    if (type === client_api_1.types.ActionType.Clear) {
                                        this.clearCanvas();
                                        this.lastLayerRenderOp = {};
                                        dirtyLayers = {};
                                    } else {
                                        // Get the layer the delta applies to
                                        var stylusId = client_api_1.types.getStylusId(operation);
                                        dirtyLayers[stylusId] = true;
                                    }
                                }
                                // Render all the dirty layers
                                // tslint:disable-next-line:forin
                            } catch (err) {
                                _didIteratorError19 = true;
                                _iteratorError19 = err;
                            } finally {
                                try {
                                    if (!_iteratorNormalCompletion19 && _iterator19.return) {
                                        _iterator19.return();
                                    }
                                } finally {
                                    if (_didIteratorError19) {
                                        throw _iteratorError19;
                                    }
                                }
                            }

                            for (var id in dirtyLayers) {
                                var index = this.lastLayerRenderOp[id] || 0;
                                var layer = this.model.getLayer(id);
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

                    }, {
                        key: "getShapes",
                        value: function getShapes(startPoint, endPoint, pen, circleInclusive) {
                            var dirVector = new ui.Vector(endPoint.point.x - startPoint.point.x, endPoint.point.y - startPoint.point.y);
                            var len = dirVector.length();
                            var shapes = new Array();
                            var trapezoidP0 = void 0;
                            var trapezoidP1 = void 0;
                            var trapezoidP2 = void 0;
                            var trapezoidP3 = void 0;
                            var normalizedLateralVector = void 0;
                            // Scale by a power curve to trend towards thicker values
                            var widthAtStart = pen.thickness * Math.pow(startPoint.pressure, 0.5) / 2;
                            var widthAtEnd = pen.thickness * Math.pow(endPoint.pressure, 0.5) / 2;
                            // Just draws a circle on small values??
                            if (len + Math.min(widthAtStart, widthAtEnd) <= Math.max(widthAtStart, widthAtEnd)) {
                                var center = widthAtStart >= widthAtEnd ? startPoint : endPoint;
                                shapes.push(new index_1.Circle({ x: center.point.x, y: center.point.y }, widthAtEnd));
                                return shapes;
                            }
                            if (len === 0) {
                                return null;
                            }
                            if (widthAtStart !== widthAtEnd) {
                                var angle = Math.acos(Math.abs(widthAtStart - widthAtEnd) / len);
                                if (widthAtStart < widthAtEnd) {
                                    angle = Math.PI - angle;
                                }
                                normalizedLateralVector = ui.Vector.normalize(ui.Vector.rotate(dirVector, -angle));
                                trapezoidP0 = new ui.Point(startPoint.point.x + widthAtStart * normalizedLateralVector.x, startPoint.point.y + widthAtStart * normalizedLateralVector.y);
                                trapezoidP3 = new ui.Point(endPoint.point.x + widthAtEnd * normalizedLateralVector.x, endPoint.point.y + widthAtEnd * normalizedLateralVector.y);
                                normalizedLateralVector = ui.Vector.normalize(ui.Vector.rotate(dirVector, angle));
                                trapezoidP2 = new ui.Point(endPoint.point.x + widthAtEnd * normalizedLateralVector.x, endPoint.point.y + widthAtEnd * normalizedLateralVector.y);
                                trapezoidP1 = new ui.Point(startPoint.point.x + widthAtStart * normalizedLateralVector.x, startPoint.point.y + widthAtStart * normalizedLateralVector.y);
                            } else {
                                normalizedLateralVector = new ui.Vector(-dirVector.y / len, dirVector.x / len);
                                trapezoidP0 = new ui.Point(startPoint.point.x + widthAtStart * normalizedLateralVector.x, startPoint.point.y + widthAtStart * normalizedLateralVector.y);
                                trapezoidP1 = new ui.Point(startPoint.point.x - widthAtStart * normalizedLateralVector.x, startPoint.point.y - widthAtStart * normalizedLateralVector.y);
                                trapezoidP2 = new ui.Point(endPoint.point.x - widthAtEnd * normalizedLateralVector.x, endPoint.point.y - widthAtEnd * normalizedLateralVector.y);
                                trapezoidP3 = new ui.Point(endPoint.point.x + widthAtEnd * normalizedLateralVector.x, endPoint.point.y + widthAtEnd * normalizedLateralVector.y);
                            }
                            var polygon = new index_1.Polygon([trapezoidP0, trapezoidP3, trapezoidP2, trapezoidP1]);
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
                    }]);

                    return InkCanvas;
                }(ui.Component);

                exports.InkCanvas = InkCanvas;
            }).call(this, typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {});
        }, { "../ui": 41, "./overlayCanvas": 20, "./shapes/index": 25 }], 19: [function (require, module, exports) {
            "use strict";

            Object.defineProperty(exports, "__esModule", { value: true });
            var ui = require("../ui");
            var scrollBar_1 = require("./scrollBar");
            var scrollAreaWidth = 18;
            /**
             * A layer panel stacks children in a z order defined by their child index. It is used to overlay layers
             * on top of each other.
             *
             * TODO: This is becoming more of a custom flow view specific control rather than an abstract control
             */

            var LayerPanel = function (_ui$Component11) {
                _inherits(LayerPanel, _ui$Component11);

                function LayerPanel(element) {
                    _classCallCheck(this, LayerPanel);

                    var _this25 = _possibleConstructorReturn(this, (LayerPanel.__proto__ || Object.getPrototypeOf(LayerPanel)).call(this, element));

                    _this25.scrollBarVisible = false;
                    // Scrollbar
                    var scrollBarElement = document.createElement("div");
                    _this25.scrollBar = new scrollBar_1.ScrollBar(scrollBarElement);
                    _this25.addChild(_this25.scrollBar);
                    _this25.element.appendChild(_this25.scrollBar.element);
                    return _this25;
                }
                /**
                 * Adds a new child to the stack
                 */


                _createClass(LayerPanel, [{
                    key: "addChild",
                    value: function addChild(component) {
                        _get(LayerPanel.prototype.__proto__ || Object.getPrototypeOf(LayerPanel.prototype), "addChild", this).call(this, component, this.getChildren().length - 1);
                        this.element.insertBefore(component.element, this.element.lastChild);
                    }
                }, {
                    key: "showScrollBar",
                    value: function showScrollBar(show) {
                        if (this.scrollBarVisible !== show) {
                            this.scrollBarVisible = show;
                            this.resizeCore(this.size);
                        }
                    }
                }, {
                    key: "resizeCore",
                    value: function resizeCore(bounds) {
                        // TODO this is a temporary fix - need to change resize to just have a size and not a rectangle. Parent
                        // will position the element. Child only needs to lay itself out within a size. System will then do any
                        // geometry transforms to correctly place in screen space.
                        bounds = new ui.Rectangle(0, 0, bounds.width, bounds.height);
                        var scrollBounds = void 0;
                        var contentBounds = void 0;
                        if (this.scrollBarVisible) {
                            var nippedBounds = bounds.nipHorizRight(scrollAreaWidth);
                            scrollBounds = nippedBounds[1];
                            contentBounds = nippedBounds[0];
                            this.scrollBar.element.style.display = "block";
                            scrollBounds.conformElement(this.scrollBar.element);
                            this.scrollBar.resize(scrollBounds);
                        } else {
                            contentBounds = bounds;
                            this.scrollBar.element.style.display = "none";
                        }
                        var children = this.getChildren();
                        for (var i = 0; i < children.length - 1; i++) {
                            var child = children[i];
                            contentBounds.conformElement(child.element);
                            child.resize(contentBounds);
                        }
                    }
                }]);

                return LayerPanel;
            }(ui.Component);

            exports.LayerPanel = LayerPanel;
        }, { "../ui": 41, "./scrollBar": 22 }], 20: [function (require, module, exports) {
            (function (global) {
                "use strict";

                Object.defineProperty(exports, "__esModule", { value: true });
                var client_api_1 = typeof window !== "undefined" ? window['prague'] : typeof global !== "undefined" ? global['prague'] : null;
                var ui = require("../ui");
                var debug_1 = require("./debug");
                var recognizer = require("./shapeRecognizer");
                var index_1 = require("./shapes/index");
                var SegmentCircleInclusive;
                (function (SegmentCircleInclusive) {
                    SegmentCircleInclusive[SegmentCircleInclusive["None"] = 0] = "None";
                    SegmentCircleInclusive[SegmentCircleInclusive["Both"] = 1] = "Both";
                    SegmentCircleInclusive[SegmentCircleInclusive["Start"] = 2] = "Start";
                    SegmentCircleInclusive[SegmentCircleInclusive["End"] = 3] = "End";
                })(SegmentCircleInclusive = exports.SegmentCircleInclusive || (exports.SegmentCircleInclusive = {}));
                var DryTimer = 5000;
                var RecoTimer = 200;
                // Padding around a drawing context - used to avoid extra copies
                var CanvasPadding = 100;
                /**
                 * Helper method to resize a HTML5 canvas
                 */
                function sizeCanvas(canvas, size) {
                    canvas.width = size.width;
                    canvas.style.width = size.width + "px";
                    canvas.height = size.height;
                    canvas.style.height = size.height + "px";
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

                var DrawingContext = function () {
                    function DrawingContext(size) {
                        _classCallCheck(this, DrawingContext);

                        this.canvas = document.createElement("canvas");
                        this.lastOperation = null;
                        this.canvasOffset = { x: 0, y: 0 };
                        this.context = this.canvas.getContext("2d");
                        if (size) {
                            sizeCanvas(this.canvas, size);
                        }
                        this.updatePosition();
                    }

                    _createClass(DrawingContext, [{
                        key: "clear",
                        value: function clear() {
                            this.lastOperation = null;
                            this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
                        }
                        // store instructions used to render itself? i.e. the total path? Or defer to someone else to actually
                        // do the re-render with a context?

                    }, {
                        key: "drawStroke",
                        value: function drawStroke(current) {
                            var type = client_api_1.types.getActionType(current);
                            var shapes = void 0;
                            var currentAction = client_api_1.types.getStylusAction(current);
                            var previousAction = client_api_1.types.getStylusAction(this.lastOperation || current);
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
                                var unionedBounds = void 0;
                                var _iteratorNormalCompletion20 = true;
                                var _didIteratorError20 = false;
                                var _iteratorError20 = undefined;

                                try {
                                    for (var _iterator20 = shapes[Symbol.iterator](), _step20; !(_iteratorNormalCompletion20 = (_step20 = _iterator20.next()).done); _iteratorNormalCompletion20 = true) {
                                        var shape = _step20.value;

                                        var bounds = shape.getBounds();
                                        if (!unionedBounds) {
                                            unionedBounds = bounds;
                                        } else {
                                            unionedBounds = unionedBounds.union(bounds);
                                        }
                                    }
                                } catch (err) {
                                    _didIteratorError20 = true;
                                    _iteratorError20 = err;
                                } finally {
                                    try {
                                        if (!_iteratorNormalCompletion20 && _iterator20.return) {
                                            _iterator20.return();
                                        }
                                    } finally {
                                        if (_didIteratorError20) {
                                            throw _iteratorError20;
                                        }
                                    }
                                }

                                this.ensureCanvas(unionedBounds);
                                this.context.fillStyle = ui.toColorStringNoAlpha(this.pen.color);
                                var _iteratorNormalCompletion21 = true;
                                var _didIteratorError21 = false;
                                var _iteratorError21 = undefined;

                                try {
                                    for (var _iterator21 = shapes[Symbol.iterator](), _step21; !(_iteratorNormalCompletion21 = (_step21 = _iterator21.next()).done); _iteratorNormalCompletion21 = true) {
                                        var _shape = _step21.value;

                                        this.context.beginPath();
                                        _shape.render(this.context, this.offset);
                                        this.context.closePath();
                                        this.context.fill();
                                    }
                                } catch (err) {
                                    _didIteratorError21 = true;
                                    _iteratorError21 = err;
                                } finally {
                                    try {
                                        if (!_iteratorNormalCompletion21 && _iterator21.return) {
                                            _iterator21.return();
                                        }
                                    } finally {
                                        if (_didIteratorError21) {
                                            throw _iteratorError21;
                                        }
                                    }
                                }
                            }
                            this.lastOperation = current;
                        }
                        /**
                         * Updates the positioning of the canvas so that the logical (0, 0) is at pixel (0, 0)
                         */

                    }, {
                        key: "updatePosition",
                        value: function updatePosition() {
                            this.canvas.style.position = "relative";
                            this.canvas.style.left = this.offset.x + "px";
                            this.canvas.style.top = this.offset.y + "px";
                        }
                        /**
                         * Ensures that the canvas is large enough to render the given bounds
                         */

                    }, {
                        key: "ensureCanvas",
                        value: function ensureCanvas(bounds) {
                            var canvasBounds = new ui.Rectangle(this.offset.x, this.offset.y, this.canvas.width, this.canvas.height);
                            if (canvasBounds.contains(bounds)) {
                                return;
                            }
                            var newBounds = canvasBounds.union(bounds);
                            // Capture the max values of both prior to adjusting the min
                            var canvasMax = { x: newBounds.x + newBounds.width, y: newBounds.y + newBounds.height };
                            var newMax = { x: newBounds.x + newBounds.width, y: newBounds.y + newBounds.height };
                            // Update the min values
                            newBounds.x = padLeft(canvasBounds.x, newBounds.x, CanvasPadding);
                            newBounds.y = padLeft(canvasBounds.y, newBounds.y, CanvasPadding);
                            // Update the max values - and then width/height
                            newMax.x = padRight(canvasMax.x, newMax.x, CanvasPadding);
                            newMax.y = padRight(canvasMax.y, newMax.y, CanvasPadding);
                            newBounds.width = newMax.x - newBounds.x;
                            newBounds.height = newMax.y - newBounds.y;
                            // Need to resize the canvas
                            var newCanvas = document.createElement("canvas");
                            sizeCanvas(newCanvas, newBounds.size);
                            var newContext = newCanvas.getContext("2d");
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

                    }, {
                        key: "getShapes",
                        value: function getShapes(startPoint, endPoint, pen, circleInclusive) {
                            var dirVector = new ui.Vector(endPoint.point.x - startPoint.point.x, endPoint.point.y - startPoint.point.y);
                            var len = dirVector.length();
                            var shapes = new Array();
                            var trapezoidP0 = void 0;
                            var trapezoidP1 = void 0;
                            var trapezoidP2 = void 0;
                            var trapezoidP3 = void 0;
                            var normalizedLateralVector = void 0;
                            // Scale by a power curve to trend towards thicker values
                            var widthAtStart = pen.thickness * Math.pow(startPoint.pressure, 0.5) / 2;
                            var widthAtEnd = pen.thickness * Math.pow(endPoint.pressure, 0.5) / 2;
                            // Just draws a circle on small values??
                            if (len + Math.min(widthAtStart, widthAtEnd) <= Math.max(widthAtStart, widthAtEnd)) {
                                var center = widthAtStart >= widthAtEnd ? startPoint : endPoint;
                                shapes.push(new index_1.Circle({ x: center.point.x, y: center.point.y }, widthAtEnd));
                                return shapes;
                            }
                            if (len === 0) {
                                return null;
                            }
                            if (widthAtStart !== widthAtEnd) {
                                var angle = Math.acos(Math.abs(widthAtStart - widthAtEnd) / len);
                                if (widthAtStart < widthAtEnd) {
                                    angle = Math.PI - angle;
                                }
                                normalizedLateralVector = ui.Vector.normalize(ui.Vector.rotate(dirVector, -angle));
                                trapezoidP0 = new ui.Point(startPoint.point.x + widthAtStart * normalizedLateralVector.x, startPoint.point.y + widthAtStart * normalizedLateralVector.y);
                                trapezoidP3 = new ui.Point(endPoint.point.x + widthAtEnd * normalizedLateralVector.x, endPoint.point.y + widthAtEnd * normalizedLateralVector.y);
                                normalizedLateralVector = ui.Vector.normalize(ui.Vector.rotate(dirVector, angle));
                                trapezoidP2 = new ui.Point(endPoint.point.x + widthAtEnd * normalizedLateralVector.x, endPoint.point.y + widthAtEnd * normalizedLateralVector.y);
                                trapezoidP1 = new ui.Point(startPoint.point.x + widthAtStart * normalizedLateralVector.x, startPoint.point.y + widthAtStart * normalizedLateralVector.y);
                            } else {
                                normalizedLateralVector = new ui.Vector(-dirVector.y / len, dirVector.x / len);
                                trapezoidP0 = new ui.Point(startPoint.point.x + widthAtStart * normalizedLateralVector.x, startPoint.point.y + widthAtStart * normalizedLateralVector.y);
                                trapezoidP1 = new ui.Point(startPoint.point.x - widthAtStart * normalizedLateralVector.x, startPoint.point.y - widthAtStart * normalizedLateralVector.y);
                                trapezoidP2 = new ui.Point(endPoint.point.x - widthAtEnd * normalizedLateralVector.x, endPoint.point.y - widthAtEnd * normalizedLateralVector.y);
                                trapezoidP3 = new ui.Point(endPoint.point.x + widthAtEnd * normalizedLateralVector.x, endPoint.point.y + widthAtEnd * normalizedLateralVector.y);
                            }
                            var polygon = new index_1.Polygon([trapezoidP0, trapezoidP3, trapezoidP2, trapezoidP1]);
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
                    }, {
                        key: "offset",
                        get: function get() {
                            return this.canvasOffset;
                        }
                    }]);

                    return DrawingContext;
                }();

                exports.DrawingContext = DrawingContext;
                /**
                 * Graphics drawing layer
                 */

                var Layer = function () {
                    function Layer(size) {
                        _classCallCheck(this, Layer);

                        this.position = { x: 0, y: 0 };
                        this.node = document.createElement("div");
                        this.drawingContext = new DrawingContext();
                        this.node.appendChild(this.drawingContext.canvas);
                        this.updatePosition();
                    }

                    _createClass(Layer, [{
                        key: "setPosition",
                        value: function setPosition(position) {
                            this.position = position;
                            this.updatePosition();
                        }
                    }, {
                        key: "updatePosition",
                        value: function updatePosition() {
                            this.node.style.position = "absolute";
                            this.node.style.left = this.position.x + "px";
                            this.node.style.top = this.position.y + "px";
                        }
                    }]);

                    return Layer;
                }();

                exports.Layer = Layer;
                /**
                 * Used to render ink
                 */

                var InkLayer = function (_Layer) {
                    _inherits(InkLayer, _Layer);

                    function InkLayer(size, model) {
                        _classCallCheck(this, InkLayer);

                        var _this26 = _possibleConstructorReturn(this, (InkLayer.__proto__ || Object.getPrototypeOf(InkLayer)).call(this, size));

                        _this26.model = model;
                        // Listen for updates and re-render
                        _this26.model.on("op", function (op) {
                            var delta = op.contents;
                            var _iteratorNormalCompletion22 = true;
                            var _didIteratorError22 = false;
                            var _iteratorError22 = undefined;

                            try {
                                for (var _iterator22 = delta.operations[Symbol.iterator](), _step22; !(_iteratorNormalCompletion22 = (_step22 = _iterator22.next()).done); _iteratorNormalCompletion22 = true) {
                                    var operation = _step22.value;

                                    _this26.drawingContext.drawStroke(operation);
                                }
                            } catch (err) {
                                _didIteratorError22 = true;
                                _iteratorError22 = err;
                            } finally {
                                try {
                                    if (!_iteratorNormalCompletion22 && _iterator22.return) {
                                        _iterator22.return();
                                    }
                                } finally {
                                    if (_didIteratorError22) {
                                        throw _iteratorError22;
                                    }
                                }
                            }
                        });
                        var layers = _this26.model.getLayers();
                        var _iteratorNormalCompletion23 = true;
                        var _didIteratorError23 = false;
                        var _iteratorError23 = undefined;

                        try {
                            for (var _iterator23 = layers[Symbol.iterator](), _step23; !(_iteratorNormalCompletion23 = (_step23 = _iterator23.next()).done); _iteratorNormalCompletion23 = true) {
                                var layer = _step23.value;
                                var _iteratorNormalCompletion24 = true;
                                var _didIteratorError24 = false;
                                var _iteratorError24 = undefined;

                                try {
                                    for (var _iterator24 = layer.operations[Symbol.iterator](), _step24; !(_iteratorNormalCompletion24 = (_step24 = _iterator24.next()).done); _iteratorNormalCompletion24 = true) {
                                        var operation = _step24.value;

                                        _this26.drawingContext.drawStroke(operation);
                                    }
                                } catch (err) {
                                    _didIteratorError24 = true;
                                    _iteratorError24 = err;
                                } finally {
                                    try {
                                        if (!_iteratorNormalCompletion24 && _iterator24.return) {
                                            _iterator24.return();
                                        }
                                    } finally {
                                        if (_didIteratorError24) {
                                            throw _iteratorError24;
                                        }
                                    }
                                }
                            }
                        } catch (err) {
                            _didIteratorError23 = true;
                            _iteratorError23 = err;
                        } finally {
                            try {
                                if (!_iteratorNormalCompletion23 && _iterator23.return) {
                                    _iterator23.return();
                                }
                            } finally {
                                if (_didIteratorError23) {
                                    throw _iteratorError23;
                                }
                            }
                        }

                        return _this26;
                    }

                    _createClass(InkLayer, [{
                        key: "drawDelta",
                        value: function drawDelta(delta) {
                            this.model.submitOp(delta);
                            var _iteratorNormalCompletion25 = true;
                            var _didIteratorError25 = false;
                            var _iteratorError25 = undefined;

                            try {
                                for (var _iterator25 = delta.operations[Symbol.iterator](), _step25; !(_iteratorNormalCompletion25 = (_step25 = _iterator25.next()).done); _iteratorNormalCompletion25 = true) {
                                    var operation = _step25.value;

                                    this.drawingContext.drawStroke(operation);
                                }
                            } catch (err) {
                                _didIteratorError25 = true;
                                _iteratorError25 = err;
                            } finally {
                                try {
                                    if (!_iteratorNormalCompletion25 && _iterator25.return) {
                                        _iterator25.return();
                                    }
                                } finally {
                                    if (_didIteratorError25) {
                                        throw _iteratorError25;
                                    }
                                }
                            }
                        }
                    }]);

                    return InkLayer;
                }(Layer);

                exports.InkLayer = InkLayer;
                /**
                 * API access to a drawing context that can be used to render elements
                 */

                var OverlayCanvas = function (_ui$Component12) {
                    _inherits(OverlayCanvas, _ui$Component12);

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
                    function OverlayCanvas(document, container, eventTarget) {
                        _classCallCheck(this, OverlayCanvas);

                        var _this27 = _possibleConstructorReturn(this, (OverlayCanvas.__proto__ || Object.getPrototypeOf(OverlayCanvas)).call(this, container));

                        _this27.document = document;
                        _this27.layers = [];
                        _this27.inkEventsEnabled = false;
                        _this27.penHovering = false;
                        _this27.forceInk = false;
                        _this27.activePen = {
                            color: { r: 0, g: 161 / 255, b: 241 / 255, a: 0 },
                            thickness: 7
                        };
                        _this27.pointsToRecognize = [];
                        // No pointer events by default
                        container.style.pointerEvents = "none";
                        // Track ink events on the eventTarget in order to enable/disable pointer events
                        _this27.trackInkEvents(eventTarget);
                        // Ink handling messages
                        container.addEventListener("pointerdown", function (evt) {
                            return _this27.handlePointerDown(evt);
                        });
                        container.addEventListener("pointermove", function (evt) {
                            return _this27.handlePointerMove(evt);
                        });
                        container.addEventListener("pointerup", function (evt) {
                            return _this27.handlePointerUp(evt);
                        });
                        return _this27;
                    }

                    _createClass(OverlayCanvas, [{
                        key: "addLayer",
                        value: function addLayer(layer) {
                            this.layers.push(layer);
                            this.element.appendChild(layer.node);
                        }
                    }, {
                        key: "removeLayer",
                        value: function removeLayer(layer) {
                            var index = this.layers.indexOf(layer);
                            this.layers.splice(index, 1);
                            layer.node.remove();
                        }
                        /**
                         * Sets the current pen
                         */

                    }, {
                        key: "setPen",
                        value: function setPen(pen) {
                            this.activePen = { color: pen.color, thickness: pen.thickness };
                        }
                    }, {
                        key: "enableInk",
                        value: function enableInk(enable) {
                            this.enableInkCore(this.penHovering, enable);
                        }
                        /**
                         * Used to just enable/disable the ink events. Should only be used when needing to temporarily
                         * disable ink (for DOM hit testing events, for example). The enableInk event is probably what you really want.
                         */

                    }, {
                        key: "enableInkHitTest",
                        value: function enableInkHitTest(enable) {
                            this.element.style.pointerEvents = enable ? "auto" : "none";
                        }
                        /**
                         * Tracks ink events on the provided element and enables/disables the ink layer based on them
                         */

                    }, {
                        key: "trackInkEvents",
                        value: function trackInkEvents(eventTarget) {
                            var _this28 = this;

                            // Pointer events used to enable/disable the overlay canvas ink handling
                            // A pen entering the element causes us to enable ink events. If the pointer already has entered
                            // via the mouse we won't get another event for the pen. In this case we also watch move events
                            // to be able to toggle the ink layer. A pen leaving disables ink.
                            eventTarget.addEventListener("pointerenter", function (event) {
                                if (event.pointerType === "pen") {
                                    _this28.enableInkCore(true, _this28.forceInk);
                                }
                            });
                            eventTarget.addEventListener("pointerleave", function (event) {
                                if (event.pointerType === "pen") {
                                    _this28.enableInkCore(false, _this28.forceInk);
                                }
                            });
                            // Tracking pointermove is used to work around not receiving a pen event if the mouse already
                            // entered the element without leaving
                            eventTarget.addEventListener("pointermove", function (event) {
                                if (event.pointerType === "pen") {
                                    _this28.enableInkCore(true, _this28.forceInk);
                                }
                            });
                        }
                        /**
                         * Updates the hovering and force fields and then enables or disables ink based on their values.
                         */

                    }, {
                        key: "enableInkCore",
                        value: function enableInkCore(hovering, force) {
                            this.penHovering = hovering;
                            this.forceInk = force;
                            var enable = this.forceInk || this.penHovering;
                            if (this.inkEventsEnabled !== enable) {
                                this.inkEventsEnabled = enable;
                                this.enableInkHitTest(enable);
                            }
                        }
                    }, {
                        key: "handlePointerDown",
                        value: function handlePointerDown(evt) {
                            // Only support pen events
                            if (evt.pointerType === "pen" || evt.pointerType === "mouse" && evt.button === 0) {
                                var translatedPoint = this.translatePoint(this.element, evt);
                                this.pointsToRecognize.push(translatedPoint);
                                // Create a new layer if doesn't already exist
                                if (!this.activeLayer) {
                                    // Create a new layer at the position of the pointer down
                                    var model = this.document.createInk();
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
                                var delta = new client_api_1.types.Delta().stylusDown(this.translateToLayer(translatedPoint, this.activeLayer), evt.pressure, this.activePen);
                                this.currentStylusActionId = delta.operations[0].stylusDown.id;
                                this.activeLayer.drawDelta(delta);
                                evt.returnValue = false;
                            }
                        }
                    }, {
                        key: "handlePointerMove",
                        value: function handlePointerMove(evt) {
                            if (evt.pointerId === this.activePointerId) {
                                var translatedPoint = this.translatePoint(this.element, evt);
                                this.pointsToRecognize.push(translatedPoint);
                                var delta = new client_api_1.types.Delta().stylusMove(this.translateToLayer(translatedPoint, this.activeLayer), evt.pressure, this.currentStylusActionId);
                                this.activeLayer.drawDelta(delta);
                                evt.returnValue = false;
                            }
                            return false;
                        }
                    }, {
                        key: "handlePointerUp",
                        value: function handlePointerUp(evt) {
                            if (evt.pointerId === this.activePointerId) {
                                var translatedPoint = this.translatePoint(this.element, evt);
                                this.pointsToRecognize.push(translatedPoint);
                                evt.returnValue = false;
                                var delta = new client_api_1.types.Delta().stylusUp(this.translateToLayer(translatedPoint, this.activeLayer), evt.pressure, this.currentStylusActionId);
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
                    }, {
                        key: "startDryTimer",
                        value: function startDryTimer() {
                            var _this29 = this;

                            this.dryTimer = setTimeout(function () {
                                _this29.dryInk();
                            }, DryTimer);
                        }
                    }, {
                        key: "stopDryTimer",
                        value: function stopDryTimer() {
                            if (this.dryTimer) {
                                clearTimeout(this.dryTimer);
                                this.dryTimer = undefined;
                            }
                        }
                    }, {
                        key: "startRecoTimer",
                        value: function startRecoTimer() {
                            var _this30 = this;

                            this.recoTimer = setTimeout(function () {
                                _this30.recognizeShape();
                            }, RecoTimer);
                        }
                    }, {
                        key: "stopRecoTimer",
                        value: function stopRecoTimer() {
                            if (this.recoTimer) {
                                clearTimeout(this.recoTimer);
                                this.recoTimer = undefined;
                            }
                        }
                    }, {
                        key: "recognizeShape",
                        value: function recognizeShape() {
                            // The console output can be used to train more shapes.
                            // console.log(this.printStroke());
                            var shapeType = recognizer.recognizeShape(this.pointsToRecognize);
                            if (shapeType !== undefined) {
                                console.log("Shape type: " + shapeType.pattern);
                                console.log("Score: " + shapeType.score);
                            } else {
                                console.log("Unrecognized shape!");
                            }
                            // Clear the strokes.
                            this.pointsToRecognize = [];
                        }
                    }, {
                        key: "dryInk",
                        value: function dryInk() {
                            debug_1.debug("Drying the ink");
                            this.dryTimer = undefined;
                            // TODO allow ability to close a collab stream
                            this.emit("dry", this.activeLayer);
                            this.activeLayer = undefined;
                        }
                    }, {
                        key: "translatePoint",
                        value: function translatePoint(relative, event) {
                            var boundingRect = relative.getBoundingClientRect();
                            var offset = {
                                x: boundingRect.left + document.body.scrollLeft,
                                y: boundingRect.top + document.body.scrollTop
                            };
                            return {
                                x: event.pageX - offset.x,
                                y: event.pageY - offset.y
                            };
                        }
                    }, {
                        key: "translateToLayer",
                        value: function translateToLayer(position, layer) {
                            return {
                                x: position.x - layer.position.x,
                                y: position.y - layer.position.y
                            };
                        }
                    }]);

                    return OverlayCanvas;
                }(ui.Component);

                exports.OverlayCanvas = OverlayCanvas;
            }).call(this, typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {});
        }, { "../ui": 41, "./debug": 9, "./shapeRecognizer": 23, "./shapes/index": 25 }], 21: [function (require, module, exports) {
            "use strict";

            Object.defineProperty(exports, "__esModule", { value: true });
            var ui = require("../ui");
            /**
             * Basic dock panel control
             */

            var Popup = function (_ui$Component13) {
                _inherits(Popup, _ui$Component13);

                function Popup(element) {
                    _classCallCheck(this, Popup);

                    var _this31 = _possibleConstructorReturn(this, (Popup.__proto__ || Object.getPrototypeOf(Popup)).call(this, element));

                    _this31.visible = false;
                    _this31.element.style.display = "none";
                    return _this31;
                }

                _createClass(Popup, [{
                    key: "addContent",
                    value: function addContent(content) {
                        this.content = content;
                        this.addChild(content);
                        this.element.appendChild(content.element);
                        this.resizeCore(this.size);
                    }
                }, {
                    key: "toggle",
                    value: function toggle() {
                        this.visible = !this.visible;
                        this.element.style.display = this.visible ? "block" : "none";
                    }
                }, {
                    key: "measure",
                    value: function measure(size) {
                        return this.content ? this.content.measure(size) : size;
                    }
                }, {
                    key: "resizeCore",
                    value: function resizeCore(bounds) {
                        if (this.content) {
                            this.content.resize(bounds);
                        }
                    }
                }]);

                return Popup;
            }(ui.Component);

            exports.Popup = Popup;
        }, { "../ui": 41 }], 22: [function (require, module, exports) {
            "use strict";

            Object.defineProperty(exports, "__esModule", { value: true });
            var ui = require("../ui");
            // TODO will want to emit events for clicking the thing, etc...

            var ScrollBar = function (_ui$Component14) {
                _inherits(ScrollBar, _ui$Component14);

                function ScrollBar(element) {
                    _classCallCheck(this, ScrollBar);

                    var _this32 = _possibleConstructorReturn(this, (ScrollBar.__proto__ || Object.getPrototypeOf(ScrollBar)).call(this, element));

                    _this32.range = { value: 0, min: 0, max: 0 };
                    _this32.track = document.createElement("div");
                    _this32.track.style.backgroundColor = "pink";
                    _this32.track.style.borderRadius = "5px";
                    _this32.track.style.position = "absolute";
                    _this32.element.appendChild(_this32.track);
                    return _this32;
                }
                /**
                 * Sets the value of the track
                 */


                _createClass(ScrollBar, [{
                    key: "setRange",
                    value: function setRange(range) {
                        this.range = { value: range.value, min: range.min, max: range.max };
                        this.updateTrack();
                    }
                }, {
                    key: "resizeCore",
                    value: function resizeCore(bounds) {
                        this.updateTrack();
                    }
                    /**
                     * Updates the scroll bar's track element
                     */

                }, {
                    key: "updateTrack",
                    value: function updateTrack() {
                        var rangeLength = this.range.max - this.range.min;
                        var frac = rangeLength !== 0 ? (this.range.value - this.range.min) / rangeLength : 0;
                        var height = Math.max(3, rangeLength !== 0 ? this.size.height / rangeLength : 0, 0);
                        var top = frac * this.size.height;
                        var left = 3;
                        // The below will get put in some kind of updateTrack call
                        this.track.style.width = Math.max(12, this.size.width - 6) + "px";
                        this.track.style.height = height + "px";
                        this.track.style.left = left + "px";
                        this.track.style.top = top + "px";
                    }
                }, {
                    key: "value",
                    set: function set(value) {
                        this.range.value = value;
                        this.updateTrack();
                    }
                }, {
                    key: "min",
                    set: function set(value) {
                        this.range.min = value;
                        this.updateTrack();
                    }
                }, {
                    key: "max",
                    set: function set(value) {
                        this.range.max = value;
                        this.updateTrack();
                    }
                }]);

                return ScrollBar;
            }(ui.Component);

            exports.ScrollBar = ScrollBar;
        }, { "../ui": 41 }], 23: [function (require, module, exports) {
            "use strict";
            // tslint:disable:max-line-length

            Object.defineProperty(exports, "__esModule", { value: true });
            var ShapeDetector = require("shape-detector");
            var defaultShapes = [{
                name: "rectangle",
                points: [{ x: 140.17500305175776, y: 140.17500305175776 }, { x: 175.2187538146972, y: 140.17500305175776 }, { x: 210.26250457763663, y: 140.17500305175776 }, { x: 245.30625534057606, y: 140.17500305175776 }, { x: 280.3500061035155, y: 140.17500305175776 }, { x: 315.39375686645496, y: 140.17500305175776 }, { x: 350.4375076293944, y: 140.17500305175776 }, { x: 385.4812583923338, y: 140.17500305175776 }, { x: 420.52500915527327, y: 140.17500305175776 }, { x: 420.52500915527327, y: 140.17500305175776 }, { x: 420.52500915527327, y: 175.2187538146972 }, { x: 420.52500915527327, y: 210.26250457763663 }, { x: 420.52500915527327, y: 245.30625534057606 }, { x: 420.52500915527327, y: 280.3500061035155 }, { x: 420.52500915527327, y: 315.39375686645496 }, { x: 420.52500915527327, y: 350.4375076293944 }, { x: 420.52500915527327, y: 385.4812583923338 }, { x: 420.52500915527327, y: 420.52500915527327 }, { x: 420.52500915527327, y: 420.52500915527327 }, { x: 385.4812583923338, y: 420.52500915527327 }, { x: 350.4375076293944, y: 420.52500915527327 }, { x: 315.39375686645496, y: 420.52500915527327 }, { x: 280.3500061035155, y: 420.52500915527327 }, { x: 245.30625534057606, y: 420.52500915527327 }, { x: 210.26250457763663, y: 420.52500915527327 }, { x: 175.2187538146972, y: 420.52500915527327 }, { x: 140.17500305175776, y: 420.52500915527327 }, { x: 140.17500305175776, y: 420.52500915527327 }, { x: 140.17500305175776, y: 385.4812583923338 }, { x: 140.17500305175776, y: 350.4375076293944 }, { x: 140.17500305175776, y: 315.39375686645496 }, { x: 140.17500305175776, y: 280.3500061035155 }, { x: 140.17500305175776, y: 245.30625534057606 }, { x: 140.17500305175776, y: 210.26250457763663 }, { x: 140.17500305175776, y: 175.2187538146972 }, { x: 140.17500305175776, y: 140.17500305175776 }]
            }, {
                name: "rectangle",
                points: [{ x: 420.52500915527327, y: 140.17500305175776 }, { x: 420.52500915527327, y: 175.2187538146972 }, { x: 420.52500915527327, y: 210.26250457763663 }, { x: 420.52500915527327, y: 245.30625534057606 }, { x: 420.52500915527327, y: 280.3500061035155 }, { x: 420.52500915527327, y: 315.39375686645496 }, { x: 420.52500915527327, y: 350.4375076293944 }, { x: 420.52500915527327, y: 385.4812583923338 }, { x: 420.52500915527327, y: 420.52500915527327 }, { x: 420.52500915527327, y: 420.52500915527327 }, { x: 385.4812583923338, y: 420.52500915527327 }, { x: 350.4375076293944, y: 420.52500915527327 }, { x: 315.39375686645496, y: 420.52500915527327 }, { x: 280.3500061035155, y: 420.52500915527327 }, { x: 245.30625534057606, y: 420.52500915527327 }, { x: 210.26250457763663, y: 420.52500915527327 }, { x: 175.2187538146972, y: 420.52500915527327 }, { x: 140.17500305175776, y: 420.52500915527327 }, { x: 140.17500305175776, y: 420.52500915527327 }, { x: 140.17500305175776, y: 385.4812583923338 }, { x: 140.17500305175776, y: 350.4375076293944 }, { x: 140.17500305175776, y: 315.39375686645496 }, { x: 140.17500305175776, y: 280.3500061035155 }, { x: 140.17500305175776, y: 245.30625534057606 }, { x: 140.17500305175776, y: 210.26250457763663 }, { x: 140.17500305175776, y: 175.2187538146972 }, { x: 140.17500305175776, y: 140.17500305175776 }, { x: 140.17500305175776, y: 140.17500305175776 }, { x: 175.2187538146972, y: 140.17500305175776 }, { x: 210.26250457763663, y: 140.17500305175776 }, { x: 245.30625534057606, y: 140.17500305175776 }, { x: 280.3500061035155, y: 140.17500305175776 }, { x: 315.39375686645496, y: 140.17500305175776 }, { x: 350.4375076293944, y: 140.17500305175776 }, { x: 385.4812583923338, y: 140.17500305175776 }, { x: 420.52500915527327, y: 140.17500305175776 }]
            }, {
                name: "rectangle",
                points: [{ x: 420.52500915527327, y: 420.52500915527327 }, { x: 385.4812583923338, y: 420.52500915527327 }, { x: 350.4375076293944, y: 420.52500915527327 }, { x: 315.39375686645496, y: 420.52500915527327 }, { x: 280.3500061035155, y: 420.52500915527327 }, { x: 245.30625534057606, y: 420.52500915527327 }, { x: 210.26250457763663, y: 420.52500915527327 }, { x: 175.2187538146972, y: 420.52500915527327 }, { x: 140.17500305175776, y: 420.52500915527327 }, { x: 140.17500305175776, y: 420.52500915527327 }, { x: 140.17500305175776, y: 385.4812583923338 }, { x: 140.17500305175776, y: 350.4375076293944 }, { x: 140.17500305175776, y: 315.39375686645496 }, { x: 140.17500305175776, y: 280.3500061035155 }, { x: 140.17500305175776, y: 245.30625534057606 }, { x: 140.17500305175776, y: 210.26250457763663 }, { x: 140.17500305175776, y: 175.2187538146972 }, { x: 140.17500305175776, y: 140.17500305175776 }, { x: 140.17500305175776, y: 140.17500305175776 }, { x: 175.2187538146972, y: 140.17500305175776 }, { x: 210.26250457763663, y: 140.17500305175776 }, { x: 245.30625534057606, y: 140.17500305175776 }, { x: 280.3500061035155, y: 140.17500305175776 }, { x: 315.39375686645496, y: 140.17500305175776 }, { x: 350.4375076293944, y: 140.17500305175776 }, { x: 385.4812583923338, y: 140.17500305175776 }, { x: 420.52500915527327, y: 140.17500305175776 }, { x: 420.52500915527327, y: 140.17500305175776 }, { x: 420.52500915527327, y: 175.2187538146972 }, { x: 420.52500915527327, y: 210.26250457763663 }, { x: 420.52500915527327, y: 245.30625534057606 }, { x: 420.52500915527327, y: 280.3500061035155 }, { x: 420.52500915527327, y: 315.39375686645496 }, { x: 420.52500915527327, y: 350.4375076293944 }, { x: 420.52500915527327, y: 385.4812583923338 }, { x: 420.52500915527327, y: 420.52500915527327 }]
            }, {
                name: "rectangle",
                points: [{ x: 140.17500305175776, y: 420.52500915527327 }, { x: 140.17500305175776, y: 385.4812583923338 }, { x: 140.17500305175776, y: 350.4375076293944 }, { x: 140.17500305175776, y: 315.39375686645496 }, { x: 140.17500305175776, y: 280.3500061035155 }, { x: 140.17500305175776, y: 245.30625534057606 }, { x: 140.17500305175776, y: 210.26250457763663 }, { x: 140.17500305175776, y: 175.2187538146972 }, { x: 140.17500305175776, y: 140.17500305175776 }, { x: 140.17500305175776, y: 140.17500305175776 }, { x: 175.2187538146972, y: 140.17500305175776 }, { x: 210.26250457763663, y: 140.17500305175776 }, { x: 245.30625534057606, y: 140.17500305175776 }, { x: 280.3500061035155, y: 140.17500305175776 }, { x: 315.39375686645496, y: 140.17500305175776 }, { x: 350.4375076293944, y: 140.17500305175776 }, { x: 385.4812583923338, y: 140.17500305175776 }, { x: 420.52500915527327, y: 140.17500305175776 }, { x: 420.52500915527327, y: 140.17500305175776 }, { x: 420.52500915527327, y: 175.2187538146972 }, { x: 420.52500915527327, y: 210.26250457763663 }, { x: 420.52500915527327, y: 245.30625534057606 }, { x: 420.52500915527327, y: 280.3500061035155 }, { x: 420.52500915527327, y: 315.39375686645496 }, { x: 420.52500915527327, y: 350.4375076293944 }, { x: 420.52500915527327, y: 385.4812583923338 }, { x: 420.52500915527327, y: 420.52500915527327 }, { x: 420.52500915527327, y: 420.52500915527327 }, { x: 385.4812583923338, y: 420.52500915527327 }, { x: 350.4375076293944, y: 420.52500915527327 }, { x: 315.39375686645496, y: 420.52500915527327 }, { x: 280.3500061035155, y: 420.52500915527327 }, { x: 245.30625534057606, y: 420.52500915527327 }, { x: 210.26250457763663, y: 420.52500915527327 }, { x: 175.2187538146972, y: 420.52500915527327 }, { x: 140.17500305175776, y: 420.52500915527327 }]
            }, {
                name: "rectangle",
                points: [{ x: 140.17500305175776, y: 420.52500915527327 }, { x: 175.2187538146972, y: 420.52500915527327 }, { x: 210.26250457763663, y: 420.52500915527327 }, { x: 245.30625534057606, y: 420.52500915527327 }, { x: 280.3500061035155, y: 420.52500915527327 }, { x: 315.39375686645496, y: 420.52500915527327 }, { x: 350.4375076293944, y: 420.52500915527327 }, { x: 385.4812583923338, y: 420.52500915527327 }, { x: 420.52500915527327, y: 420.52500915527327 }, { x: 420.52500915527327, y: 420.52500915527327 }, { x: 420.52500915527327, y: 385.4812583923338 }, { x: 420.52500915527327, y: 350.4375076293944 }, { x: 420.52500915527327, y: 315.39375686645496 }, { x: 420.52500915527327, y: 280.3500061035155 }, { x: 420.52500915527327, y: 245.30625534057606 }, { x: 420.52500915527327, y: 210.26250457763663 }, { x: 420.52500915527327, y: 175.2187538146972 }, { x: 420.52500915527327, y: 140.17500305175776 }, { x: 420.52500915527327, y: 140.17500305175776 }, { x: 385.4812583923338, y: 140.17500305175776 }, { x: 350.4375076293944, y: 140.17500305175776 }, { x: 315.39375686645496, y: 140.17500305175776 }, { x: 280.3500061035155, y: 140.17500305175776 }, { x: 245.30625534057606, y: 140.17500305175776 }, { x: 210.26250457763663, y: 140.17500305175776 }, { x: 175.2187538146972, y: 140.17500305175776 }, { x: 140.17500305175776, y: 140.17500305175776 }, { x: 140.17500305175776, y: 140.17500305175776 }, { x: 140.17500305175776, y: 175.2187538146972 }, { x: 140.17500305175776, y: 210.26250457763663 }, { x: 140.17500305175776, y: 245.30625534057606 }, { x: 140.17500305175776, y: 280.3500061035155 }, { x: 140.17500305175776, y: 315.39375686645496 }, { x: 140.17500305175776, y: 350.4375076293944 }, { x: 140.17500305175776, y: 385.4812583923338 }, { x: 140.17500305175776, y: 420.52500915527327 }]
            }, {
                name: "rectangle",
                points: [{ x: 420.52500915527327, y: 420.52500915527327 }, { x: 420.52500915527327, y: 385.4812583923338 }, { x: 420.52500915527327, y: 350.4375076293944 }, { x: 420.52500915527327, y: 315.39375686645496 }, { x: 420.52500915527327, y: 280.3500061035155 }, { x: 420.52500915527327, y: 245.30625534057606 }, { x: 420.52500915527327, y: 210.26250457763663 }, { x: 420.52500915527327, y: 175.2187538146972 }, { x: 420.52500915527327, y: 140.17500305175776 }, { x: 420.52500915527327, y: 140.17500305175776 }, { x: 385.4812583923338, y: 140.17500305175776 }, { x: 350.4375076293944, y: 140.17500305175776 }, { x: 315.39375686645496, y: 140.17500305175776 }, { x: 280.3500061035155, y: 140.17500305175776 }, { x: 245.30625534057606, y: 140.17500305175776 }, { x: 210.26250457763663, y: 140.17500305175776 }, { x: 175.2187538146972, y: 140.17500305175776 }, { x: 140.17500305175776, y: 140.17500305175776 }, { x: 140.17500305175776, y: 140.17500305175776 }, { x: 140.17500305175776, y: 175.2187538146972 }, { x: 140.17500305175776, y: 210.26250457763663 }, { x: 140.17500305175776, y: 245.30625534057606 }, { x: 140.17500305175776, y: 280.3500061035155 }, { x: 140.17500305175776, y: 315.39375686645496 }, { x: 140.17500305175776, y: 350.4375076293944 }, { x: 140.17500305175776, y: 385.4812583923338 }, { x: 140.17500305175776, y: 420.52500915527327 }, { x: 140.17500305175776, y: 420.52500915527327 }, { x: 175.2187538146972, y: 420.52500915527327 }, { x: 210.26250457763663, y: 420.52500915527327 }, { x: 245.30625534057606, y: 420.52500915527327 }, { x: 280.3500061035155, y: 420.52500915527327 }, { x: 315.39375686645496, y: 420.52500915527327 }, { x: 350.4375076293944, y: 420.52500915527327 }, { x: 385.4812583923338, y: 420.52500915527327 }, { x: 420.52500915527327, y: 420.52500915527327 }]
            }, {
                name: "rectangle",
                points: [{ x: 420.52500915527327, y: 140.17500305175776 }, { x: 385.4812583923338, y: 140.17500305175776 }, { x: 350.4375076293944, y: 140.17500305175776 }, { x: 315.39375686645496, y: 140.17500305175776 }, { x: 280.3500061035155, y: 140.17500305175776 }, { x: 245.30625534057606, y: 140.17500305175776 }, { x: 210.26250457763663, y: 140.17500305175776 }, { x: 175.2187538146972, y: 140.17500305175776 }, { x: 140.17500305175776, y: 140.17500305175776 }, { x: 140.17500305175776, y: 140.17500305175776 }, { x: 140.17500305175776, y: 175.2187538146972 }, { x: 140.17500305175776, y: 210.26250457763663 }, { x: 140.17500305175776, y: 245.30625534057606 }, { x: 140.17500305175776, y: 280.3500061035155 }, { x: 140.17500305175776, y: 315.39375686645496 }, { x: 140.17500305175776, y: 350.4375076293944 }, { x: 140.17500305175776, y: 385.4812583923338 }, { x: 140.17500305175776, y: 420.52500915527327 }, { x: 140.17500305175776, y: 420.52500915527327 }, { x: 175.2187538146972, y: 420.52500915527327 }, { x: 210.26250457763663, y: 420.52500915527327 }, { x: 245.30625534057606, y: 420.52500915527327 }, { x: 280.3500061035155, y: 420.52500915527327 }, { x: 315.39375686645496, y: 420.52500915527327 }, { x: 350.4375076293944, y: 420.52500915527327 }, { x: 385.4812583923338, y: 420.52500915527327 }, { x: 420.52500915527327, y: 420.52500915527327 }, { x: 420.52500915527327, y: 420.52500915527327 }, { x: 420.52500915527327, y: 385.4812583923338 }, { x: 420.52500915527327, y: 350.4375076293944 }, { x: 420.52500915527327, y: 315.39375686645496 }, { x: 420.52500915527327, y: 280.3500061035155 }, { x: 420.52500915527327, y: 245.30625534057606 }, { x: 420.52500915527327, y: 210.26250457763663 }, { x: 420.52500915527327, y: 175.2187538146972 }, { x: 420.52500915527327, y: 140.17500305175776 }]
            }, {
                name: "rectangle",
                points: [{ x: 140.17500305175776, y: 140.17500305175776 }, { x: 140.17500305175776, y: 175.2187538146972 }, { x: 140.17500305175776, y: 210.26250457763663 }, { x: 140.17500305175776, y: 245.30625534057606 }, { x: 140.17500305175776, y: 280.3500061035155 }, { x: 140.17500305175776, y: 315.39375686645496 }, { x: 140.17500305175776, y: 350.4375076293944 }, { x: 140.17500305175776, y: 385.4812583923338 }, { x: 140.17500305175776, y: 420.52500915527327 }, { x: 140.17500305175776, y: 420.52500915527327 }, { x: 175.2187538146972, y: 420.52500915527327 }, { x: 210.26250457763663, y: 420.52500915527327 }, { x: 245.30625534057606, y: 420.52500915527327 }, { x: 280.3500061035155, y: 420.52500915527327 }, { x: 315.39375686645496, y: 420.52500915527327 }, { x: 350.4375076293944, y: 420.52500915527327 }, { x: 385.4812583923338, y: 420.52500915527327 }, { x: 420.52500915527327, y: 420.52500915527327 }, { x: 420.52500915527327, y: 420.52500915527327 }, { x: 420.52500915527327, y: 385.4812583923338 }, { x: 420.52500915527327, y: 350.4375076293944 }, { x: 420.52500915527327, y: 315.39375686645496 }, { x: 420.52500915527327, y: 280.3500061035155 }, { x: 420.52500915527327, y: 245.30625534057606 }, { x: 420.52500915527327, y: 210.26250457763663 }, { x: 420.52500915527327, y: 175.2187538146972 }, { x: 420.52500915527327, y: 140.17500305175776 }, { x: 420.52500915527327, y: 140.17500305175776 }, { x: 385.4812583923338, y: 140.17500305175776 }, { x: 350.4375076293944, y: 140.17500305175776 }, { x: 315.39375686645496, y: 140.17500305175776 }, { x: 280.3500061035155, y: 140.17500305175776 }, { x: 245.30625534057606, y: 140.17500305175776 }, { x: 210.26250457763663, y: 140.17500305175776 }, { x: 175.2187538146972, y: 140.17500305175776 }, { x: 140.17500305175776, y: 140.17500305175776 }]
            }, {
                name: "circle",
                points: [{ x: 420.52500915527327, y: 280.3500061035155 }, { x: 418.3954358873965, y: 304.69113993790967 }, { x: 412.07142208989444, y: 328.29268073795373 }, { x: 401.74511972189896, y: 350.43750762939436 }, { x: 387.73028825550034, y: 370.4527612529582 }, { x: 370.4527612529582, y: 387.73028825550034 }, { x: 350.4375076293944, y: 401.74511972189896 }, { x: 328.2926807379538, y: 412.07142208989444 }, { x: 304.69113993790967, y: 418.3954358873965 }, { x: 280.3500061035155, y: 420.52500915527327 }, { x: 256.0088722691214, y: 418.3954358873965 }, { x: 232.4073314690773, y: 412.07142208989444 }, { x: 210.26250457763666, y: 401.74511972189896 }, { x: 190.2472509540728, y: 387.73028825550034 }, { x: 172.9697239515307, y: 370.4527612529582 }, { x: 158.95489248513206, y: 350.43750762939436 }, { x: 148.62859011713658, y: 328.2926807379538 }, { x: 142.30457631963455, y: 304.6911399379096 }, { x: 140.17500305175776, y: 280.3500061035155 }, { x: 142.30457631963455, y: 256.00887226912135 }, { x: 148.62859011713655, y: 232.4073314690773 }, { x: 158.9548924851321, y: 210.2625045776366 }, { x: 172.96972395153068, y: 190.2472509540728 }, { x: 190.24725095407277, y: 172.9697239515307 }, { x: 210.26250457763658, y: 158.95489248513212 }, { x: 232.40733146907718, y: 148.62859011713658 }, { x: 256.00887226912135, y: 142.30457631963455 }, { x: 280.3500061035155, y: 140.17500305175776 }, { x: 304.6911399379096, y: 142.30457631963455 }, { x: 328.2926807379537, y: 148.62859011713653 }, { x: 350.4375076293944, y: 158.9548924851321 }, { x: 370.4527612529582, y: 172.96972395153068 }, { x: 387.73028825550034, y: 190.24725095407274 }, { x: 401.7451197218989, y: 210.26250457763658 }, { x: 412.07142208989444, y: 232.4073314690773 }, { x: 418.39543588739645, y: 256.00887226912124 }, { x: 420.52500915527327, y: 280.35000610351545 }]
            }, {
                name: "circle",
                points: [{ x: 420.52500915527327, y: 280.3500061035155 }, { x: 418.3954358873965, y: 256.00887226912135 }, { x: 412.07142208989444, y: 232.4073314690773 }, { x: 401.74511972189896, y: 210.26250457763666 }, { x: 387.73028825550034, y: 190.2472509540728 }, { x: 370.4527612529582, y: 172.96972395153068 }, { x: 350.4375076293944, y: 158.9548924851321 }, { x: 328.2926807379538, y: 148.62859011713658 }, { x: 304.69113993790967, y: 142.30457631963455 }, { x: 280.3500061035155, y: 140.17500305175776 }, { x: 256.0088722691214, y: 142.30457631963455 }, { x: 232.4073314690773, y: 148.62859011713655 }, { x: 210.26250457763666, y: 158.95489248513206 }, { x: 190.2472509540728, y: 172.96972395153068 }, { x: 172.9697239515307, y: 190.24725095407277 }, { x: 158.95489248513206, y: 210.26250457763666 }, { x: 148.62859011713658, y: 232.40733146907723 }, { x: 142.30457631963455, y: 256.0088722691214 }, { x: 140.17500305175776, y: 280.3500061035155 }, { x: 142.30457631963455, y: 304.69113993790967 }, { x: 148.62859011713655, y: 328.29268073795373 }, { x: 158.9548924851321, y: 350.4375076293944 }, { x: 172.96972395153068, y: 370.4527612529582 }, { x: 190.24725095407277, y: 387.73028825550034 }, { x: 210.26250457763658, y: 401.7451197218989 }, { x: 232.40733146907718, y: 412.07142208989444 }, { x: 256.00887226912135, y: 418.3954358873965 }, { x: 280.3500061035155, y: 420.52500915527327 }, { x: 304.6911399379096, y: 418.3954358873965 }, { x: 328.2926807379537, y: 412.0714220898945 }, { x: 350.4375076293944, y: 401.74511972189896 }, { x: 370.4527612529582, y: 387.73028825550034 }, { x: 387.73028825550034, y: 370.4527612529583 }, { x: 401.7451197218989, y: 350.4375076293944 }, { x: 412.07142208989444, y: 328.29268073795373 }, { x: 418.39543588739645, y: 304.6911399379098 }, { x: 420.52500915527327, y: 280.35000610351557 }]
            }, {
                name: "circle",
                points: [{ x: 140.17500305175776, y: 280.3500061035155 }, { x: 142.30457631963455, y: 256.00887226912135 }, { x: 148.62859011713655, y: 232.4073314690773 }, { x: 158.95489248513206, y: 210.26250457763666 }, { x: 172.96972395153068, y: 190.2472509540728 }, { x: 190.2472509540728, y: 172.96972395153068 }, { x: 210.2625045776366, y: 158.9548924851321 }, { x: 232.40733146907726, y: 148.62859011713658 }, { x: 256.00887226912135, y: 142.30457631963455 }, { x: 280.3500061035155, y: 140.17500305175776 }, { x: 304.6911399379096, y: 142.30457631963455 }, { x: 328.29268073795373, y: 148.62859011713655 }, { x: 350.43750762939436, y: 158.95489248513206 }, { x: 370.4527612529582, y: 172.96972395153068 }, { x: 387.73028825550034, y: 190.24725095407277 }, { x: 401.74511972189896, y: 210.26250457763666 }, { x: 412.07142208989444, y: 232.40733146907723 }, { x: 418.3954358873965, y: 256.0088722691214 }, { x: 420.52500915527327, y: 280.3500061035155 }, { x: 418.3954358873965, y: 304.69113993790967 }, { x: 412.07142208989444, y: 328.29268073795373 }, { x: 401.74511972189896, y: 350.4375076293944 }, { x: 387.73028825550034, y: 370.4527612529582 }, { x: 370.4527612529582, y: 387.73028825550034 }, { x: 350.4375076293944, y: 401.7451197218989 }, { x: 328.29268073795384, y: 412.07142208989444 }, { x: 304.69113993790967, y: 418.3954358873965 }, { x: 280.3500061035155, y: 420.52500915527327 }, { x: 256.0088722691214, y: 418.3954358873965 }, { x: 232.40733146907735, y: 412.0714220898945 }, { x: 210.2625045776366, y: 401.74511972189896 }, { x: 190.2472509540728, y: 387.73028825550034 }, { x: 172.9697239515307, y: 370.4527612529583 }, { x: 158.95489248513212, y: 350.4375076293944 }, { x: 148.62859011713655, y: 328.29268073795373 }, { x: 142.30457631963458, y: 304.6911399379098 }, { x: 140.17500305175776, y: 280.35000610351557 }]
            }, {
                name: "circle",
                points: [{ x: 140.17500305175776, y: 280.3500061035155 }, { x: 142.30457631963455, y: 304.69113993790967 }, { x: 148.62859011713655, y: 328.29268073795373 }, { x: 158.95489248513206, y: 350.43750762939436 }, { x: 172.96972395153068, y: 370.4527612529582 }, { x: 190.2472509540728, y: 387.73028825550034 }, { x: 210.2625045776366, y: 401.74511972189896 }, { x: 232.40733146907726, y: 412.07142208989444 }, { x: 256.00887226912135, y: 418.3954358873965 }, { x: 280.3500061035155, y: 420.52500915527327 }, { x: 304.6911399379096, y: 418.3954358873965 }, { x: 328.29268073795373, y: 412.07142208989444 }, { x: 350.43750762939436, y: 401.74511972189896 }, { x: 370.4527612529582, y: 387.73028825550034 }, { x: 387.73028825550034, y: 370.4527612529582 }, { x: 401.74511972189896, y: 350.43750762939436 }, { x: 412.07142208989444, y: 328.2926807379538 }, { x: 418.3954358873965, y: 304.6911399379096 }, { x: 420.52500915527327, y: 280.3500061035155 }, { x: 418.3954358873965, y: 256.00887226912135 }, { x: 412.07142208989444, y: 232.4073314690773 }, { x: 401.74511972189896, y: 210.2625045776366 }, { x: 387.73028825550034, y: 190.2472509540728 }, { x: 370.4527612529582, y: 172.9697239515307 }, { x: 350.4375076293944, y: 158.95489248513212 }, { x: 328.29268073795384, y: 148.62859011713658 }, { x: 304.69113993790967, y: 142.30457631963455 }, { x: 280.3500061035155, y: 140.17500305175776 }, { x: 256.0088722691214, y: 142.30457631963455 }, { x: 232.40733146907735, y: 148.62859011713653 }, { x: 210.2625045776366, y: 158.9548924851321 }, { x: 190.2472509540728, y: 172.96972395153068 }, { x: 172.9697239515307, y: 190.24725095407274 }, { x: 158.95489248513212, y: 210.26250457763658 }, { x: 148.62859011713655, y: 232.4073314690773 }, { x: 142.30457631963458, y: 256.00887226912124 }, { x: 140.17500305175776, y: 280.35000610351545 }]
            }, {
                name: "circle",
                points: [{ x: 280.3500061035155, y: 420.52500915527327 }, { x: 304.6911399379096, y: 418.3954358873965 }, { x: 328.29268073795373, y: 412.07142208989444 }, { x: 350.43750762939436, y: 401.74511972189896 }, { x: 370.4527612529582, y: 387.73028825550034 }, { x: 387.73028825550034, y: 370.4527612529582 }, { x: 401.74511972189896, y: 350.43750762939436 }, { x: 412.07142208989444, y: 328.2926807379538 }, { x: 418.3954358873965, y: 304.6911399379096 }, { x: 420.52500915527327, y: 280.3500061035155 }, { x: 418.3954358873965, y: 256.00887226912135 }, { x: 412.07142208989444, y: 232.4073314690773 }, { x: 401.74511972189896, y: 210.2625045776366 }, { x: 387.73028825550034, y: 190.2472509540728 }, { x: 370.4527612529582, y: 172.9697239515307 }, { x: 350.4375076293944, y: 158.95489248513212 }, { x: 328.29268073795384, y: 148.62859011713658 }, { x: 304.69113993790967, y: 142.30457631963455 }, { x: 280.3500061035155, y: 140.17500305175776 }, { x: 256.0088722691214, y: 142.30457631963455 }, { x: 232.40733146907735, y: 148.62859011713653 }, { x: 210.2625045776366, y: 158.9548924851321 }, { x: 190.2472509540728, y: 172.96972395153068 }, { x: 172.9697239515307, y: 190.24725095407274 }, { x: 158.95489248513212, y: 210.26250457763658 }, { x: 148.62859011713655, y: 232.4073314690773 }, { x: 142.30457631963458, y: 256.00887226912124 }, { x: 140.17500305175776, y: 280.35000610351545 }, { x: 142.30457631963455, y: 304.6911399379096 }, { x: 148.62859011713658, y: 328.2926807379538 }, { x: 158.954892485132, y: 350.4375076293943 }, { x: 172.96972395153068, y: 370.4527612529582 }, { x: 190.24725095407274, y: 387.7302882555003 }, { x: 210.26250457763666, y: 401.74511972189896 }, { x: 232.40733146907718, y: 412.07142208989444 }, { x: 256.00887226912135, y: 418.3954358873965 }, { x: 280.35000610351545, y: 420.52500915527327 }]
            }, {
                name: "circle",
                points: [{ x: 280.3500061035155, y: 140.17500305175776 }, { x: 304.6911399379096, y: 142.30457631963455 }, { x: 328.29268073795373, y: 148.62859011713655 }, { x: 350.43750762939436, y: 158.95489248513206 }, { x: 370.4527612529582, y: 172.96972395153068 }, { x: 387.73028825550034, y: 190.24725095407277 }, { x: 401.74511972189896, y: 210.26250457763666 }, { x: 412.07142208989444, y: 232.40733146907723 }, { x: 418.3954358873965, y: 256.0088722691214 }, { x: 420.52500915527327, y: 280.3500061035155 }, { x: 418.3954358873965, y: 304.69113993790967 }, { x: 412.07142208989444, y: 328.29268073795373 }, { x: 401.74511972189896, y: 350.4375076293944 }, { x: 387.73028825550034, y: 370.4527612529582 }, { x: 370.4527612529582, y: 387.73028825550034 }, { x: 350.4375076293944, y: 401.7451197218989 }, { x: 328.29268073795384, y: 412.07142208989444 }, { x: 304.69113993790967, y: 418.3954358873965 }, { x: 280.3500061035155, y: 420.52500915527327 }, { x: 256.0088722691214, y: 418.3954358873965 }, { x: 232.40733146907735, y: 412.0714220898945 }, { x: 210.2625045776366, y: 401.74511972189896 }, { x: 190.2472509540728, y: 387.73028825550034 }, { x: 172.9697239515307, y: 370.4527612529583 }, { x: 158.95489248513212, y: 350.4375076293944 }, { x: 148.62859011713655, y: 328.29268073795373 }, { x: 142.30457631963458, y: 304.6911399379098 }, { x: 140.17500305175776, y: 280.35000610351557 }, { x: 142.30457631963455, y: 256.0088722691214 }, { x: 148.62859011713658, y: 232.40733146907723 }, { x: 158.954892485132, y: 210.26250457763672 }, { x: 172.96972395153068, y: 190.2472509540728 }, { x: 190.24725095407274, y: 172.96972395153074 }, { x: 210.26250457763666, y: 158.95489248513206 }, { x: 232.40733146907718, y: 148.6285901171366 }, { x: 256.00887226912135, y: 142.30457631963455 }, { x: 280.35000610351545, y: 140.17500305175776 }]
            }, {
                name: "circle",
                points: [{ x: 280.3500061035155, y: 140.17500305175776 }, { x: 256.0088722691214, y: 142.30457631963455 }, { x: 232.4073314690773, y: 148.62859011713655 }, { x: 210.26250457763666, y: 158.95489248513206 }, { x: 190.2472509540728, y: 172.96972395153068 }, { x: 172.9697239515307, y: 190.24725095407277 }, { x: 158.95489248513206, y: 210.26250457763666 }, { x: 148.62859011713658, y: 232.40733146907723 }, { x: 142.30457631963455, y: 256.0088722691214 }, { x: 140.17500305175776, y: 280.3500061035155 }, { x: 142.30457631963455, y: 304.69113993790967 }, { x: 148.62859011713655, y: 328.29268073795373 }, { x: 158.9548924851321, y: 350.4375076293944 }, { x: 172.96972395153068, y: 370.4527612529582 }, { x: 190.24725095407277, y: 387.73028825550034 }, { x: 210.26250457763658, y: 401.7451197218989 }, { x: 232.40733146907718, y: 412.07142208989444 }, { x: 256.00887226912135, y: 418.3954358873965 }, { x: 280.3500061035155, y: 420.52500915527327 }, { x: 304.6911399379096, y: 418.3954358873965 }, { x: 328.2926807379537, y: 412.0714220898945 }, { x: 350.4375076293944, y: 401.74511972189896 }, { x: 370.4527612529582, y: 387.73028825550034 }, { x: 387.73028825550034, y: 370.4527612529583 }, { x: 401.7451197218989, y: 350.4375076293944 }, { x: 412.07142208989444, y: 328.29268073795373 }, { x: 418.39543588739645, y: 304.6911399379098 }, { x: 420.52500915527327, y: 280.35000610351557 }, { x: 418.3954358873965, y: 256.0088722691214 }, { x: 412.07142208989444, y: 232.40733146907723 }, { x: 401.745119721899, y: 210.26250457763672 }, { x: 387.73028825550034, y: 190.2472509540728 }, { x: 370.4527612529583, y: 172.96972395153074 }, { x: 350.43750762939436, y: 158.95489248513206 }, { x: 328.29268073795384, y: 148.6285901171366 }, { x: 304.69113993790967, y: 142.30457631963455 }, { x: 280.35000610351557, y: 140.17500305175776 }]
            }, {
                name: "circle",
                points: [{ x: 280.3500061035155, y: 420.52500915527327 }, { x: 256.0088722691214, y: 418.3954358873965 }, { x: 232.4073314690773, y: 412.07142208989444 }, { x: 210.26250457763666, y: 401.74511972189896 }, { x: 190.2472509540728, y: 387.73028825550034 }, { x: 172.9697239515307, y: 370.4527612529582 }, { x: 158.95489248513206, y: 350.43750762939436 }, { x: 148.62859011713658, y: 328.2926807379538 }, { x: 142.30457631963455, y: 304.6911399379096 }, { x: 140.17500305175776, y: 280.3500061035155 }, { x: 142.30457631963455, y: 256.00887226912135 }, { x: 148.62859011713655, y: 232.4073314690773 }, { x: 158.9548924851321, y: 210.2625045776366 }, { x: 172.96972395153068, y: 190.2472509540728 }, { x: 190.24725095407277, y: 172.9697239515307 }, { x: 210.26250457763658, y: 158.95489248513212 }, { x: 232.40733146907718, y: 148.62859011713658 }, { x: 256.00887226912135, y: 142.30457631963455 }, { x: 280.3500061035155, y: 140.17500305175776 }, { x: 304.6911399379096, y: 142.30457631963455 }, { x: 328.2926807379537, y: 148.62859011713653 }, { x: 350.4375076293944, y: 158.9548924851321 }, { x: 370.4527612529582, y: 172.96972395153068 }, { x: 387.73028825550034, y: 190.24725095407274 }, { x: 401.7451197218989, y: 210.26250457763658 }, { x: 412.07142208989444, y: 232.4073314690773 }, { x: 418.39543588739645, y: 256.00887226912124 }, { x: 420.52500915527327, y: 280.35000610351545 }, { x: 418.3954358873965, y: 304.6911399379096 }, { x: 412.07142208989444, y: 328.2926807379538 }, { x: 401.745119721899, y: 350.4375076293943 }, { x: 387.73028825550034, y: 370.4527612529582 }, { x: 370.4527612529583, y: 387.7302882555003 }, { x: 350.43750762939436, y: 401.74511972189896 }, { x: 328.29268073795384, y: 412.07142208989444 }, { x: 304.69113993790967, y: 418.3954358873965 }, { x: 280.35000610351557, y: 420.52500915527327 }]
            }];
            var detector = new ShapeDetector(defaultShapes);
            function recognizeShape(stroke) {
                return detector.spot(stroke);
            }
            exports.recognizeShape = recognizeShape;
        }, { "shape-detector": 5 }], 24: [function (require, module, exports) {
            "use strict";

            Object.defineProperty(exports, "__esModule", { value: true });
            var ui_1 = require("../../ui");

            var Circle = function () {
                function Circle(center, radius) {
                    _classCallCheck(this, Circle);

                    this.center = center;
                    this.radius = radius;
                }

                _createClass(Circle, [{
                    key: "render",
                    value: function render(context2D, offset) {
                        var x = this.center.x - offset.x;
                        var y = this.center.y - offset.y;
                        context2D.moveTo(x, y);
                        context2D.arc(x, y, this.radius, 0, Math.PI * 2);
                    }
                }, {
                    key: "getBounds",
                    value: function getBounds() {
                        return new ui_1.Rectangle(this.center.x, this.center.y, this.radius, this.radius);
                    }
                }]);

                return Circle;
            }();

            exports.Circle = Circle;
        }, { "../../ui": 41 }], 25: [function (require, module, exports) {
            "use strict";

            function __export(m) {
                for (var p in m) {
                    if (!exports.hasOwnProperty(p)) exports[p] = m[p];
                }
            }
            Object.defineProperty(exports, "__esModule", { value: true });
            __export(require("./circle"));
            __export(require("./polygon"));
        }, { "./circle": 24, "./polygon": 26 }], 26: [function (require, module, exports) {
            "use strict";

            Object.defineProperty(exports, "__esModule", { value: true });
            var ui_1 = require("../../ui");

            var Polygon = function () {
                /**
                 * Constructs a new polygon composed of the given points. The polygon
                 * takes ownership of the passed in array of points.
                 */
                function Polygon(points) {
                    _classCallCheck(this, Polygon);

                    this.points = points;
                    // TODO need to add an "empty" rectangle concept - until then 0, 0 is empty
                    var minX = points.length > 0 ? points[0].x : 0;
                    var minY = points.length > 0 ? points[0].y : 0;
                    var maxX = minX;
                    var maxY = minY;
                    var _iteratorNormalCompletion26 = true;
                    var _didIteratorError26 = false;
                    var _iteratorError26 = undefined;

                    try {
                        for (var _iterator26 = points[Symbol.iterator](), _step26; !(_iteratorNormalCompletion26 = (_step26 = _iterator26.next()).done); _iteratorNormalCompletion26 = true) {
                            var point = _step26.value;

                            minX = Math.min(minX, point.x);
                            maxX = Math.max(maxX, point.x);
                            minY = Math.min(minY, point.y);
                            maxY = Math.max(maxY, point.y);
                        }
                    } catch (err) {
                        _didIteratorError26 = true;
                        _iteratorError26 = err;
                    } finally {
                        try {
                            if (!_iteratorNormalCompletion26 && _iterator26.return) {
                                _iterator26.return();
                            }
                        } finally {
                            if (_didIteratorError26) {
                                throw _iteratorError26;
                            }
                        }
                    }

                    this.bounds = new ui_1.Rectangle(minX, minY, maxX - minX, maxY - minY);
                }

                _createClass(Polygon, [{
                    key: "render",
                    value: function render(context, offset) {
                        if (this.points.length === 0) {
                            return;
                        }
                        // Move to the first point
                        context.moveTo(this.points[0].x - offset.x, this.points[0].y - offset.y);
                        // Draw the rest of the segments
                        for (var i = 1; i < this.points.length; i++) {
                            context.lineTo(this.points[i].x - offset.x, this.points[i].y - offset.y);
                        }
                        // And then close the shape
                        context.lineTo(this.points[0].x - offset.x, this.points[0].y - offset.y);
                    }
                }, {
                    key: "getBounds",
                    value: function getBounds() {
                        return this.bounds;
                    }
                }]);

                return Polygon;
            }();

            exports.Polygon = Polygon;
        }, { "../../ui": 41 }], 27: [function (require, module, exports) {
            "use strict";

            Object.defineProperty(exports, "__esModule", { value: true });
            var ui = require("../ui");
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

            var StackPanel = function (_ui$Component15) {
                _inherits(StackPanel, _ui$Component15);

                function StackPanel(element, orientation, classList) {
                    var _element$classList;

                    _classCallCheck(this, StackPanel);

                    var _this33 = _possibleConstructorReturn(this, (StackPanel.__proto__ || Object.getPrototypeOf(StackPanel)).call(this, element));

                    _this33.orientation = orientation;
                    (_element$classList = element.classList).add.apply(_element$classList, _toConsumableArray(classList));
                    return _this33;
                }
                /**
                 * Adds a new child to the stack
                 */


                _createClass(StackPanel, [{
                    key: "addChild",
                    value: function addChild(component) {
                        _get(StackPanel.prototype.__proto__ || Object.getPrototypeOf(StackPanel.prototype), "addChild", this).call(this, component);
                        this.element.appendChild(component.element);
                    }
                    /**
                     * Returns a size whose height is capped to the max child height
                     */

                }, {
                    key: "measure",
                    value: function measure(size) {
                        var fixed = 0;
                        var variable = 0;
                        var children = this.getChildren();
                        var _iteratorNormalCompletion27 = true;
                        var _didIteratorError27 = false;
                        var _iteratorError27 = undefined;

                        try {
                            for (var _iterator27 = children[Symbol.iterator](), _step27; !(_iteratorNormalCompletion27 = (_step27 = _iterator27.next()).done); _iteratorNormalCompletion27 = true) {
                                var child = _step27.value;

                                var measurement = child.measure(size);
                                // Update the fixed and variable components depending on the orientation of the stack panel.
                                // The algorithm selects the max value from the fixed orientation and then adds together the variable sizes
                                fixed = Math.max(fixed, this.orientation === Orientation.Horizontal ? measurement.height : measurement.width);
                                variable += this.orientation === Orientation.Horizontal ? measurement.width : measurement.height;
                            }
                            // Cap against the specified size
                        } catch (err) {
                            _didIteratorError27 = true;
                            _iteratorError27 = err;
                        } finally {
                            try {
                                if (!_iteratorNormalCompletion27 && _iterator27.return) {
                                    _iterator27.return();
                                }
                            } finally {
                                if (_didIteratorError27) {
                                    throw _iteratorError27;
                                }
                            }
                        }

                        return {
                            height: Math.min(size.height, this.orientation === Orientation.Horizontal ? fixed : variable),
                            width: Math.min(size.width, this.orientation === Orientation.Horizontal ? variable : fixed)
                        };
                    }
                }, {
                    key: "resizeCore",
                    value: function resizeCore(bounds) {
                        bounds = new ui.Rectangle(0, 0, bounds.width, bounds.height);
                        // layout is very primitive right now... the below is tailored for a list of buttons
                        var children = this.getChildren();
                        var remainingBounds = bounds;
                        var _iteratorNormalCompletion28 = true;
                        var _didIteratorError28 = false;
                        var _iteratorError28 = undefined;

                        try {
                            for (var _iterator28 = children[Symbol.iterator](), _step28; !(_iteratorNormalCompletion28 = (_step28 = _iterator28.next()).done); _iteratorNormalCompletion28 = true) {
                                var child = _step28.value;

                                var measurement = child.measure(remainingBounds.size);
                                var updatedBounds = this.orientation === Orientation.Horizontal ? remainingBounds.nipHoriz(measurement.width) : remainingBounds.nipVert(measurement.height);
                                updatedBounds[0].conformElement(child.element);
                                child.resize(updatedBounds[0]);
                                remainingBounds = updatedBounds[1];
                            }
                        } catch (err) {
                            _didIteratorError28 = true;
                            _iteratorError28 = err;
                        } finally {
                            try {
                                if (!_iteratorNormalCompletion28 && _iterator28.return) {
                                    _iterator28.return();
                                }
                            } finally {
                                if (_didIteratorError28) {
                                    throw _iteratorError28;
                                }
                            }
                        }
                    }
                }]);

                return StackPanel;
            }(ui.Component);

            exports.StackPanel = StackPanel;
        }, { "../ui": 41 }], 28: [function (require, module, exports) {
            "use strict";

            Object.defineProperty(exports, "__esModule", { value: true });
            var ui = require("../ui");

            var Status = function (_ui$Component16) {
                _inherits(Status, _ui$Component16);

                function Status(element) {
                    _classCallCheck(this, Status);

                    var _this34 = _possibleConstructorReturn(this, (Status.__proto__ || Object.getPrototypeOf(Status)).call(this, element));

                    _this34.info = [];
                    _this34.commands = [];
                    _this34.element.classList.add("status-bar");
                    _this34.element.style.backgroundColor = "#F1F1F1";
                    // Insert options into toolbar
                    _this34.listElement = document.createElement("ul");
                    return _this34;
                }

                _createClass(Status, [{
                    key: "add",
                    value: function add(key, msg) {
                        var showKey = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : false;

                        var i = this.findKV(key);
                        if (i < 0) {
                            i = this.info.length;
                            this.info.push({ key: key, msg: msg, showKey: showKey });
                        } else {
                            this.info[i].msg = msg;
                            this.info[i].showKey = showKey;
                        }
                        this.renderBar();
                    }
                }, {
                    key: "remove",
                    value: function remove(key) {
                        var i = this.findKV(key);
                        if (i >= 0) {
                            this.info.splice(i, 1);
                        }
                        this.renderBar();
                    }
                }, {
                    key: "addOption",
                    value: function addOption(event, text) {
                        var _this35 = this;

                        var value = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : undefined;

                        var element = document.createElement("li");
                        this.listElement.appendChild(element);
                        var input = document.createElement("input");
                        input.type = "checkbox";
                        input.onchange = function (changeEvent) {
                            _this35.emit(event, input.checked);
                        };
                        input.defaultChecked = value === undefined ? false : value;
                        var title = document.createTextNode(text);
                        this.listElement.appendChild(input);
                        this.listElement.appendChild(title);
                        this.commands.push({ element: element, event: event, text: text });
                    }
                    /**
                     * Adds a clickable button to the status bar does a form post on the action target
                     */

                }, {
                    key: "addButton",
                    value: function addButton(text, action, post) {
                        var element = document.createElement("li");
                        this.listElement.appendChild(element);
                        if (post) {
                            var form = document.createElement("form");
                            form.classList.add("inline-form");
                            form.action = action;
                            form.method = "post";
                            form.target = "_blank";
                            element.appendChild(form);
                            var button = document.createElement("input");
                            button.classList.add("btn", "btn-default", "btn-xs");
                            button.type = "submit";
                            button.value = text;
                            form.appendChild(button);
                        } else {
                            var _button = document.createElement("a");
                            _button.classList.add("btn", "btn-default", "btn-xs");
                            _button.href = action;
                            _button.target = "_blank";
                            _button.innerText = text;
                            element.appendChild(_button);
                        }
                    }
                }, {
                    key: "removeOption",
                    value: function removeOption(event) {
                        var index = this.commands.findIndex(function (value) {
                            return value.event === event;
                        });
                        if (index !== -1) {
                            var removed = this.commands.splice(index, 1);
                            removed[0].element.remove();
                        }
                    }
                }, {
                    key: "addSlider",
                    value: function addSlider(sliderDiv) {
                        this.sliderElement = sliderDiv;
                        this.renderBar();
                    }
                }, {
                    key: "removeSlider",
                    value: function removeSlider() {
                        this.sliderElement = undefined;
                        this.renderBar();
                    }
                }, {
                    key: "renderBar",
                    value: function renderBar() {
                        var buf = "";
                        var first = true;
                        var _iteratorNormalCompletion29 = true;
                        var _didIteratorError29 = false;
                        var _iteratorError29 = undefined;

                        try {
                            for (var _iterator29 = this.info[Symbol.iterator](), _step29; !(_iteratorNormalCompletion29 = (_step29 = _iterator29.next()).done); _iteratorNormalCompletion29 = true) {
                                var kv = _step29.value;

                                buf += "<span>";
                                if (!first) {
                                    if (kv.showKey) {
                                        buf += ";  ";
                                    } else {
                                        buf += " ";
                                    }
                                }
                                first = false;
                                if (kv.showKey) {
                                    buf += kv.key + ": " + kv.msg;
                                } else {
                                    buf += "" + kv.msg;
                                }
                                buf += "<\span>";
                            }
                        } catch (err) {
                            _didIteratorError29 = true;
                            _iteratorError29 = err;
                        } finally {
                            try {
                                if (!_iteratorNormalCompletion29 && _iterator29.return) {
                                    _iterator29.return();
                                }
                            } finally {
                                if (_didIteratorError29) {
                                    throw _iteratorError29;
                                }
                            }
                        }

                        this.element.innerHTML = buf;
                        // Add options
                        this.element.appendChild(this.listElement);
                        if (this.sliderElement) {
                            this.element.appendChild(this.sliderElement);
                        }
                    }
                }, {
                    key: "measure",
                    value: function measure(size) {
                        return { width: size.width, height: 30 };
                    }
                }, {
                    key: "findKV",
                    value: function findKV(key) {
                        for (var i = 0, len = this.info.length; i < len; i++) {
                            if (this.info[i].key === key) {
                                return i;
                            }
                        }
                        return -1;
                    }
                }]);

                return Status;
            }(ui.Component);

            exports.Status = Status;
        }, { "../ui": 41 }], 29: [function (require, module, exports) {
            "use strict";

            Object.defineProperty(exports, "__esModule", { value: true });
            var ui = require("../ui");

            var Title = function (_ui$Component17) {
                _inherits(Title, _ui$Component17);

                function Title(element) {
                    _classCallCheck(this, Title);

                    var _this36 = _possibleConstructorReturn(this, (Title.__proto__ || Object.getPrototypeOf(Title)).call(this, element));

                    _this36.viewportDiv = document.createElement("div");
                    _this36.element.appendChild(_this36.viewportDiv);
                    _this36.viewportDiv.classList.add("title-bar");
                    return _this36;
                }

                _createClass(Title, [{
                    key: "measure",
                    value: function measure(size) {
                        return { width: size.width, height: 40 };
                    }
                }, {
                    key: "setTitle",
                    value: function setTitle(title) {
                        this.viewportDiv.innerHTML = "<span style=\"font-size:20px;font-family:Book Antiqua\">" + title + "</span>";
                    }
                }, {
                    key: "setBackgroundColor",
                    value: function setBackgroundColor(title) {
                        var rgb = this.hexToRGB(this.intToHex(this.hashCode(title)));
                        var gradient = "linear-gradient(to right, rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ",0),\n                          rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ",1))";
                        this.element.style.background = gradient;
                    }
                }, {
                    key: "resizeCore",
                    value: function resizeCore(bounds) {
                        this.viewportRect = bounds.inner(0.92);
                        ui.Rectangle.conformElementToRect(this.viewportDiv, this.viewportRect);
                    }
                    // Implementation of java String#hashCode

                }, {
                    key: "hashCode",
                    value: function hashCode(str) {
                        var hash = 0;
                        for (var i = 0; i < str.length; i++) {
                            /* tslint:disable:no-bitwise */
                            hash = str.charCodeAt(i) + ((hash << 5) - hash);
                        }
                        return hash;
                    }
                    // Integer to RGB color converter.

                }, {
                    key: "intToHex",
                    value: function intToHex(code) {
                        /* tslint:disable:no-bitwise */
                        var c = (code & 0x00FFFFFF).toString(16).toUpperCase();
                        return "00000".substring(0, 6 - c.length) + c;
                    }
                }, {
                    key: "hexToRGB",
                    value: function hexToRGB(hex) {
                        if (hex.length === 3) {
                            hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
                        }
                        var num = parseInt(hex, 16);
                        return [num >> 16, num >> 8 & 255, num & 255];
                    }
                }]);

                return Title;
            }(ui.Component);

            exports.Title = Title;
        }, { "../ui": 41 }], 30: [function (require, module, exports) {
            "use strict";

            var __awaiter = this && this.__awaiter || function (thisArg, _arguments, P, generator) {
                return new (P || (P = Promise))(function (resolve, reject) {
                    function fulfilled(value) {
                        try {
                            step(generator.next(value));
                        } catch (e) {
                            reject(e);
                        }
                    }
                    function rejected(value) {
                        try {
                            step(generator["throw"](value));
                        } catch (e) {
                            reject(e);
                        }
                    }
                    function step(result) {
                        result.done ? resolve(result.value) : new P(function (resolve) {
                            resolve(result.value);
                        }).then(fulfilled, rejected);
                    }
                    step((generator = generator.apply(thisArg, _arguments || [])).next());
                });
            };
            Object.defineProperty(exports, "__esModule", { value: true });
            var ui = require("../ui");

            var VideoState = function VideoState(playing, elapsedTime, lastChangeUTC, vid) {
                _classCallCheck(this, VideoState);

                this.playing = playing;
                this.elapsedTime = elapsedTime;
                this.lastChangeUTC = lastChangeUTC;
                this.vid = vid;
            };
            /**
             * Basic collaborative youtube video player
             */


            var YouTubeVideo = function (_ui$Component18) {
                _inherits(YouTubeVideo, _ui$Component18);

                function YouTubeVideo(element, videoPlayer, videoRoot) {
                    _classCallCheck(this, YouTubeVideo);

                    var _this37 = _possibleConstructorReturn(this, (YouTubeVideo.__proto__ || Object.getPrototypeOf(YouTubeVideo)).call(this, element));

                    _this37.videoPlayer = videoPlayer;
                    _this37.videoRoot = videoRoot;
                    _this37.setEventHandlers();
                    return _this37;
                }

                _createClass(YouTubeVideo, [{
                    key: "setEventHandlers",
                    value: function setEventHandlers() {
                        return __awaiter(this, void 0, void 0, /*#__PURE__*/regeneratorRuntime.mark(function _callee9() {
                            return regeneratorRuntime.wrap(function _callee9$(_context9) {
                                while (1) {
                                    switch (_context9.prev = _context9.next) {
                                        case 0:
                                            _context9.next = 2;
                                            return this.videoRoot;

                                        case 2:
                                            this.videoMap = _context9.sent;
                                            _context9.next = 5;
                                            return this.videoMap.getView();

                                        case 5:
                                            this.videoMapView = _context9.sent;

                                            this.setVideoPlayerHandlers();
                                            this.setVideoMapHandlers();

                                        case 8:
                                        case "end":
                                            return _context9.stop();
                                    }
                                }
                            }, _callee9, this);
                        }));
                    }
                }, {
                    key: "setVideoPlayerHandlers",
                    value: function setVideoPlayerHandlers() {
                        return __awaiter(this, void 0, void 0, /*#__PURE__*/regeneratorRuntime.mark(function _callee10() {
                            var _this38 = this;

                            return regeneratorRuntime.wrap(function _callee10$(_context10) {
                                while (1) {
                                    switch (_context10.prev = _context10.next) {
                                        case 0:
                                            this.videoPlayer.addEventListener("onReady", function (x) {
                                                var incomingState = JSON.parse(_this38.videoMapView.get("state"));
                                                // This is a hack... play is getting auto triggered
                                                _this38.handleState(incomingState);
                                                setTimeout(function () {
                                                    return _this38.pauseVideo(incomingState);
                                                }, 500);
                                            });
                                            this.videoPlayer.addEventListener("onStateChange", function (state) {
                                                var stateChange = state;
                                                var localState = _this38.getState();
                                                switch (stateChange.data) {
                                                    case YT.PlayerState.UNSTARTED:
                                                        // -1
                                                        break;
                                                    case YT.PlayerState.CUED:
                                                        // 5
                                                        break;
                                                    case YT.PlayerState.BUFFERING:
                                                        // 3
                                                        break;
                                                    case YT.PlayerState.PAUSED:
                                                        // 2
                                                        // Buffer Event
                                                        var incomingState = JSON.parse(_this38.videoMapView.get("state"));
                                                        if (Math.abs(localState.elapsedTime - _this38.getElapsedTime(incomingState)) > 2 && incomingState.playing) {
                                                            _this38.videoPlayer.playVideo();
                                                        } else {
                                                            _this38.updateState();
                                                        }
                                                        break;
                                                    case YT.PlayerState.PLAYING:
                                                        // 1
                                                        _this38.updateState();
                                                        break;
                                                    default:
                                                        console.log(stateChange);
                                                }
                                            });

                                        case 2:
                                        case "end":
                                            return _context10.stop();
                                    }
                                }
                            }, _callee10, this);
                        }));
                    }
                }, {
                    key: "setVideoMapHandlers",
                    value: function setVideoMapHandlers() {
                        return __awaiter(this, void 0, void 0, /*#__PURE__*/regeneratorRuntime.mark(function _callee11() {
                            var _this39 = this;

                            return regeneratorRuntime.wrap(function _callee11$(_context11) {
                                while (1) {
                                    switch (_context11.prev = _context11.next) {
                                        case 0:
                                            this.videoMap.on("valueChanged", function (changedValue) {
                                                switch (changedValue.key) {
                                                    case "state":
                                                        _this39.handleState(JSON.parse(_this39.videoMapView.get(changedValue.key)));
                                                        break;
                                                    default:
                                                        console.log("default: " + changedValue.key);
                                                        break;
                                                }
                                            });

                                        case 1:
                                        case "end":
                                            return _context11.stop();
                                    }
                                }
                            }, _callee11, this);
                        }));
                    }
                }, {
                    key: "getState",
                    value: function getState() {
                        var playing = this.videoPlayer.getPlayerState() === YT.PlayerState.PLAYING;
                        return new VideoState(playing, this.videoPlayer.getCurrentTime(), Date.now(), null);
                    }
                }, {
                    key: "pauseVideo",
                    value: function pauseVideo(incomingState) {
                        if (!incomingState.playing) {
                            this.videoPlayer.pauseVideo();
                        }
                    }
                }, {
                    key: "updateState",
                    value: function updateState() {
                        this.videoMapView.set("state", JSON.stringify(this.getState()));
                    }
                    // Replicate the incoming state

                }, {
                    key: "handleState",
                    value: function handleState(incomingState) {
                        var localState = this.getState();
                        if (!incomingState.playing) {
                            this.videoPlayer.pauseVideo();
                            this.videoPlayer.seekTo(incomingState.elapsedTime, true);
                        } else {
                            // elapsed time + the difference current and when "incoming" was recorded
                            var elapsedTime = this.getElapsedTime(incomingState);
                            if (Math.abs(elapsedTime - localState.elapsedTime) > 1) {
                                this.videoPlayer.seekTo(elapsedTime, true);
                            }
                            this.videoPlayer.playVideo();
                        }
                    }
                }, {
                    key: "getElapsedTime",
                    value: function getElapsedTime(incomingState) {
                        var elapsedTime = 0;
                        if (Math.abs(incomingState.lastChangeUTC - Date.now()) < this.videoPlayer.getDuration() * 1000) {
                            elapsedTime = incomingState.elapsedTime + Date.now() / 1000 - incomingState.lastChangeUTC / 1000;
                        } else {
                            elapsedTime = incomingState.elapsedTime;
                        }
                        return elapsedTime;
                    }
                }]);

                return YouTubeVideo;
            }(ui.Component);

            exports.YouTubeVideo = YouTubeVideo;
        }, { "../ui": 41 }], 31: [function (require, module, exports) {
            "use strict";

            Object.defineProperty(exports, "__esModule", { value: true });
            var ui = require("../ui");
            var youtubeVideo_1 = require("./youtubeVideo");
            /**
             * youtube video app
             */

            var YouTubeVideoCanvas = function (_ui$Component19) {
                _inherits(YouTubeVideoCanvas, _ui$Component19);

                function YouTubeVideoCanvas(elem, doc, root) {
                    _classCallCheck(this, YouTubeVideoCanvas);

                    var _this40 = _possibleConstructorReturn(this, (YouTubeVideoCanvas.__proto__ || Object.getPrototypeOf(YouTubeVideoCanvas)).call(this, elem));

                    _this40.elem = elem;
                    _this40.player = null;
                    window.onYouTubeIframeAPIReady = function () {
                        _this40.onYouTubeIframeAPIReady();
                    };
                    // this.elem = element;
                    _this40.elem.addEventListener("YouTube-Loaded", function (e) {
                        var video = new youtubeVideo_1.YouTubeVideo(document.createElement("div"), _this40.player, _this40.fetchVideoRoot(root, doc));
                        _this40.addChild(video);
                    });
                    var playerDiv = document.createElement("div");
                    playerDiv.id = "player";
                    elem.appendChild(playerDiv);
                    var tag = document.createElement("script");
                    tag.src = "https://www.youtube.com/iframe_api";
                    elem.appendChild(tag);
                    return _this40;
                }

                _createClass(YouTubeVideoCanvas, [{
                    key: "onYouTubeIframeAPIReady",
                    value: function onYouTubeIframeAPIReady() {
                        var player = new YT.Player("player", {
                            height: 390,
                            playerVars: {
                                autoplay: 0 /* NoAutoPlay */
                                , start: 0
                            },
                            videoId: this.youtubeIdParser("https://www.youtube.com/watch?v=-Of_yz-4iXs"),
                            width: 640
                        });
                        this.player = player;
                        this.elem.dispatchEvent(new Event("YouTube-Loaded"));
                    }
                    // TODO: Consider replacing this with "oembed"

                }, {
                    key: "youtubeIdParser",
                    value: function youtubeIdParser(url) {
                        var regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#\&\?]*).*/;
                        var match = url.match(regExp);
                        return match && match[7].length === 11 ? match[7] : null;
                    }
                }, {
                    key: "fetchVideoRoot",
                    value: function fetchVideoRoot(root, doc) {
                        // TODO: Make sure the root.get promise works...
                        root.has("youTubeVideo").then(function (hasVideo) {
                            if (!hasVideo) {
                                root.set("youTubeVideo", doc.createMap());
                            }
                        });
                        return root.get("youTubeVideo");
                    }
                }]);

                return YouTubeVideoCanvas;
            }(ui.Component);

            exports.YouTubeVideoCanvas = YouTubeVideoCanvas;
        }, { "../ui": 41, "./youtubeVideo": 30 }], 32: [function (require, module, exports) {
            "use strict";

            function __export(m) {
                for (var p in m) {
                    if (!exports.hasOwnProperty(p)) exports[p] = m[p];
                }
            }
            Object.defineProperty(exports, "__esModule", { value: true });
            __export(require("./random"));
        }, { "./random": 33 }], 33: [function (require, module, exports) {
            (function (global) {
                "use strict";

                Object.defineProperty(exports, "__esModule", { value: true });
                var random = require("random-js");
                var client_api_1 = typeof window !== "undefined" ? window['prague'] : typeof global !== "undefined" ? global['prague'] : null;
                var mt = random.engines.mt19937();
                mt.seedWithArray([0xdeadbeef, 0xfeedbed]);
                function findRandomWord(mergeTree, clientId) {
                    var len = mergeTree.getLength(client_api_1.MergeTree.UniversalSequenceNumber, clientId);
                    var pos = random.integer(0, len)(mt);
                    // let textAtPos = mergeTree.getText(MergeTree.UniversalSequenceNumber, clientId, pos, pos + 10);
                    // console.log(textAtPos);
                    var nextWord = mergeTree.searchFromPos(pos, /\s\w+\b/);
                    if (nextWord) {
                        nextWord.pos += pos;
                        // console.log(`next word is '${nextWord.text}' len ${nextWord.text.length} at pos ${nextWord.pos}`);
                    }
                    return nextWord;
                }
                exports.findRandomWord = findRandomWord;
            }).call(this, typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {});
        }, { "random-js": 4 }], 34: [function (require, module, exports) {
            "use strict";

            Object.defineProperty(exports, "__esModule", { value: true });
            var ui = require("../ui");
            var debug_1 = require("./debug");
            // The majority of this can likely be abstracted behind interfaces - drawing inspiration from other
            // UI frameworks. For now we keep it simple and have this class manage the lifetime of the UI framework.
            /**
             * Hosts a UI container within the browser
             */

            var BrowserContainerHost = function () {
                function BrowserContainerHost() {
                    _classCallCheck(this, BrowserContainerHost);

                    this.root = null;
                }

                _createClass(BrowserContainerHost, [{
                    key: "attach",
                    value: function attach(root) {
                        var _this41 = this;

                        debug_1.debug("Attaching new component to browser host");
                        // Make note of the root node
                        if (this.root) {
                            throw new Error("A component has already been attached");
                        }
                        this.root = root;
                        // Listen for resize messages and propagate them to child elements
                        window.addEventListener("resize", function () {
                            debug_1.debug("resize");
                            _this41.resize();
                        });
                        // Throttle the resizes?
                        // Input event handling
                        document.body.onkeydown = function (e) {
                            _this41.root.emit("keydown", e);
                        };
                        document.body.onkeypress = function (e) {
                            _this41.root.emit("keypress", e);
                        };
                        ui.removeAllChildren(document.body);
                        document.body.appendChild(root.element);
                        // Trigger initial resize due to attach
                        this.resize();
                    }
                }, {
                    key: "resize",
                    value: function resize() {
                        var clientRect = document.body.getBoundingClientRect();
                        var newSize = ui.Rectangle.fromClientRect(clientRect);
                        newSize.conformElement(this.root.element);
                        this.root.resize(newSize);
                    }
                }]);

                return BrowserContainerHost;
            }();

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
        }, { "../ui": 41, "./debug": 36 }], 35: [function (require, module, exports) {
            "use strict";

            Object.defineProperty(exports, "__esModule", { value: true });
            var events_1 = require("events");
            var geometry_1 = require("./geometry");
            // Composition or inheritence for the below?

            var Component = function () {
                function Component(element) {
                    _classCallCheck(this, Component);

                    this.element = element;
                    this.size = new geometry_1.Rectangle(0, 0, 0, 0);
                    this.events = new events_1.EventEmitter();
                    this.children = [];
                }

                _createClass(Component, [{
                    key: "on",
                    value: function on(event, listener) {
                        this.events.on(event, listener);
                        return this;
                    }
                }, {
                    key: "emit",
                    value: function emit(event) {
                        var _events;

                        for (var _len = arguments.length, args = Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
                            args[_key - 1] = arguments[_key];
                        }

                        (_events = this.events).emit.apply(_events, [event].concat(args));
                        var _iteratorNormalCompletion30 = true;
                        var _didIteratorError30 = false;
                        var _iteratorError30 = undefined;

                        try {
                            for (var _iterator30 = this.children[Symbol.iterator](), _step30; !(_iteratorNormalCompletion30 = (_step30 = _iterator30.next()).done); _iteratorNormalCompletion30 = true) {
                                var child = _step30.value;

                                child.emit.apply(child, [event].concat(args));
                            }
                        } catch (err) {
                            _didIteratorError30 = true;
                            _iteratorError30 = err;
                        } finally {
                            try {
                                if (!_iteratorNormalCompletion30 && _iterator30.return) {
                                    _iterator30.return();
                                }
                            } finally {
                                if (_didIteratorError30) {
                                    throw _iteratorError30;
                                }
                            }
                        }
                    }
                }, {
                    key: "getChildren",
                    value: function getChildren() {
                        // Probably will want a way to avoid providing direct access to the underlying array
                        return this.children;
                    }
                    /**
                     * Allows the element to provide a desired size relative to the rectangle provided. By default returns
                     * the provided size.
                     */

                }, {
                    key: "measure",
                    value: function measure(size) {
                        return size;
                    }
                }, {
                    key: "resize",
                    value: function resize(rectangle) {
                        this.size = rectangle;
                        this.resizeCore(rectangle);
                        this.events.emit("resize", rectangle);
                    }
                    // For the child management functions we may want to just make the dervied class do this. Could help them
                    // provide better context on their tracked nodes.

                }, {
                    key: "addChild",
                    value: function addChild(component) {
                        var index = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : -1;

                        if (index === -1) {
                            this.children.push(component);
                        } else {
                            this.children.splice(index, 0, component);
                        }
                    }
                }, {
                    key: "removeChild",
                    value: function removeChild(component) {
                        var index = this.children.lastIndexOf(component);
                        if (index !== -1) {
                            this.children.splice(index, 1);
                        }
                    }
                }, {
                    key: "removeAllChildren",
                    value: function removeAllChildren() {
                        this.children = [];
                    }
                    /**
                     * Allows derived class to do custom processing based on the resize
                     */

                }, {
                    key: "resizeCore",
                    value: function resizeCore(rectangle) {
                        return;
                    }
                }]);

                return Component;
            }();

            exports.Component = Component;
        }, { "./geometry": 37, "events": 1 }], 36: [function (require, module, exports) {
            (function (global) {
                "use strict";

                Object.defineProperty(exports, "__esModule", { value: true });
                var client_api_1 = typeof window !== "undefined" ? window['prague'] : typeof global !== "undefined" ? global['prague'] : null;
                exports.debug = client_api_1.debug("routerlicious:ui");
            }).call(this, typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {});
        }, {}], 37: [function (require, module, exports) {
            "use strict";

            function __export(m) {
                for (var p in m) {
                    if (!exports.hasOwnProperty(p)) exports[p] = m[p];
                }
            }
            Object.defineProperty(exports, "__esModule", { value: true });
            __export(require("./point"));
            __export(require("./rectangle"));
            __export(require("./vector"));
        }, { "./point": 38, "./rectangle": 39, "./vector": 40 }], 38: [function (require, module, exports) {
            "use strict";

            Object.defineProperty(exports, "__esModule", { value: true });
            function distanceSquared(a, b) {
                var dx = a.x - b.x;
                var dy = a.y - b.y;
                return dx * dx + dy * dy;
            }
            exports.distanceSquared = distanceSquared;

            var Point =
            // Constructor
            function Point(x, y) {
                _classCallCheck(this, Point);

                this.x = x;
                this.y = y;
            };

            exports.Point = Point;
        }, {}], 39: [function (require, module, exports) {
            "use strict";

            Object.defineProperty(exports, "__esModule", { value: true });

            var Rectangle = function () {
                function Rectangle(x, y, width, height) {
                    _classCallCheck(this, Rectangle);

                    this.x = x;
                    this.y = y;
                    this.width = width;
                    this.height = height;
                }

                _createClass(Rectangle, [{
                    key: "square",
                    value: function square() {
                        var len = this.width;
                        var adj = 0;
                        if (len > this.height) {
                            len = this.height;
                            adj = (this.width - len) / 2;
                            return new Square(this.x + adj, this.y, len);
                        } else {
                            adj = (this.height - len) / 2;
                            return new Square(this.x, this.y + adj, len);
                        }
                    }
                }, {
                    key: "union",
                    value: function union(other) {
                        var minX = Math.min(this.x, other.x);
                        var minY = Math.min(this.y, other.y);
                        var maxX = Math.max(this.x + this.width, other.x + other.width);
                        var maxY = Math.max(this.y + this.height, other.y + other.height);
                        return new Rectangle(minX, minY, maxX - minX, maxY - minY);
                    }
                }, {
                    key: "contains",
                    value: function contains(other) {
                        return other.x >= this.x && other.x + other.width <= this.x + this.width && other.y >= this.y && other.y + other.height <= this.y + this.height;
                    }
                }, {
                    key: "nipVert",
                    value: function nipVert(pixels) {
                        return [new Rectangle(this.x, this.y, this.width, pixels), new Rectangle(this.x, this.y + pixels, this.width, this.height - pixels)];
                    }
                }, {
                    key: "nipVertBottom",
                    value: function nipVertBottom(pixels) {
                        return [new Rectangle(this.x, this.y, this.width, this.height - pixels), new Rectangle(this.x, this.y + (this.height - pixels), this.width, pixels)];
                    }
                }, {
                    key: "nipVertTopBottom",
                    value: function nipVertTopBottom(topPixels, bottomPixels) {
                        return [new Rectangle(this.x, this.y, this.width, topPixels), new Rectangle(this.x, this.y + topPixels, this.width, this.height - topPixels - bottomPixels), new Rectangle(this.x, this.y + (this.height - bottomPixels), this.width, bottomPixels)];
                    }
                }, {
                    key: "nipHoriz",
                    value: function nipHoriz(pixels) {
                        return [new Rectangle(this.x, this.y, pixels, this.height), new Rectangle(this.x + pixels, this.y, this.width - pixels, this.height)];
                    }
                }, {
                    key: "nipHorizRight",
                    value: function nipHorizRight(pixels) {
                        return [new Rectangle(this.x, this.y, this.width - pixels, this.height), new Rectangle(this.x + (this.width - pixels), this.y, pixels, this.height)];
                    }
                }, {
                    key: "conformElementMaxHeight",
                    value: function conformElementMaxHeight(elm) {
                        elm.style.position = "absolute";
                        elm.style.left = this.x + "px";
                        elm.style.width = this.width + "px";
                        elm.style.top = this.y + "px";
                        elm.style.maxHeight = this.height + "px";
                    }
                }, {
                    key: "conformElementMaxHeightFromBottom",
                    value: function conformElementMaxHeightFromBottom(elm, bottom) {
                        elm.style.position = "absolute";
                        elm.style.left = this.x + "px";
                        elm.style.width = this.width + "px";
                        elm.style.bottom = bottom + "px";
                        elm.style.maxHeight = this.height + "px";
                    }
                }, {
                    key: "conformElementOpenHeight",
                    value: function conformElementOpenHeight(elm) {
                        elm.style.position = "absolute";
                        elm.style.left = this.x + "px";
                        elm.style.width = this.width + "px";
                        elm.style.top = this.y + "px";
                    }
                }, {
                    key: "conformElement",
                    value: function conformElement(elm) {
                        elm.style.position = "absolute";
                        elm.style.left = this.x + "px";
                        elm.style.top = this.y + "px";
                        elm.style.width = this.width + "px";
                        elm.style.height = this.height + "px";
                        return elm;
                    }
                }, {
                    key: "inner4",
                    value: function inner4(xfactor, yfactor, widthFactor, heightFactor) {
                        var ix = this.x + Math.round(xfactor * this.width);
                        var iy = this.y + Math.round(yfactor * this.height);
                        var iw = Math.floor(this.width * widthFactor);
                        var ih = Math.floor(this.height * heightFactor);
                        return new Rectangle(ix, iy, iw, ih);
                    }
                }, {
                    key: "inner",
                    value: function inner(factor) {
                        var iw = Math.round(factor * this.width);
                        var ih = Math.round(factor * this.height);
                        var ix = this.x + Math.floor((this.width - iw) / 2);
                        var iy = this.y + Math.floor((this.height - ih) / 2);
                        return new Rectangle(ix, iy, iw, ih);
                    }
                }, {
                    key: "innerAbs",
                    value: function innerAbs(pixels) {
                        var iw = this.width - 2 * pixels;
                        var ih = this.height - 2 * pixels;
                        var ix = this.x + pixels;
                        var iy = this.y + pixels;
                        return new Rectangle(ix, iy, iw, ih);
                    }
                }, {
                    key: "proportionalSplitHoriz",
                    value: function proportionalSplitHoriz() {
                        var totalPropWidth = 0;
                        var i = void 0;

                        for (var _len2 = arguments.length, proportionalWidths = Array(_len2), _key2 = 0; _key2 < _len2; _key2++) {
                            proportionalWidths[_key2] = arguments[_key2];
                        }

                        for (i = 0; i < proportionalWidths.length; i++) {
                            totalPropWidth += proportionalWidths[i];
                        }
                        var totalWidth = 0;
                        var widths = [];
                        for (i = 0; i < proportionalWidths.length; i++) {
                            widths[i] = proportionalWidths[i] / totalPropWidth * this.width;
                            totalWidth += widths[i];
                        }
                        var extraWidth = this.width - totalWidth;
                        /* Add back round-off error equally to all rectangles */
                        i = 0;
                        while (extraWidth > 0) {
                            widths[i]++;
                            extraWidth--;
                            if (++i === widths.length) {
                                i = 0;
                            }
                        }
                        var rects = [];
                        var curX = this.x;
                        for (i = 0; i < widths.length; i++) {
                            rects[i] = new Rectangle(curX, this.y, widths[i], this.height);
                            curX += widths[i];
                        }
                        return rects;
                    }
                }, {
                    key: "proportionalSplitVert",
                    value: function proportionalSplitVert() {
                        var totalPropHeight = 0;
                        var i = void 0;

                        for (var _len3 = arguments.length, proportionalHeights = Array(_len3), _key3 = 0; _key3 < _len3; _key3++) {
                            proportionalHeights[_key3] = arguments[_key3];
                        }

                        for (i = 0; i < proportionalHeights.length; i++) {
                            totalPropHeight += proportionalHeights[i];
                        }
                        var totalHeight = 0;
                        var heights = [];
                        for (i = 0; i < proportionalHeights.length; i++) {
                            heights[i] = proportionalHeights[i] / totalPropHeight * this.height;
                            totalHeight += heights[i];
                        }
                        var extraHeight = this.height - totalHeight;
                        /* Add back round-off error equally to all rectangles */
                        i = 0;
                        while (extraHeight > 0) {
                            heights[i]++;
                            extraHeight--;
                            if (++i === heights.length) {
                                i = 0;
                            }
                        }
                        var rects = [];
                        var curY = this.y;
                        for (i = 0; i < heights.length; i++) {
                            rects[i] = new Rectangle(this.x, curY, this.width, heights[i]);
                            curY += heights[i];
                        }
                        return rects;
                    }
                }, {
                    key: "within",
                    value: function within(x, y) {
                        return this.x <= x && this.y <= y && this.x + this.width >= x && this.y + this.height >= y;
                    }
                }, {
                    key: "subDivideHorizAbs",
                    value: function subDivideHorizAbs(width) {
                        var n = Math.ceil(this.width / width);
                        return this.subDivideHoriz(n);
                    }
                }, {
                    key: "subDivideHoriz",
                    value: function subDivideHoriz(n) {
                        var rects = [];
                        var tileWidth = this.width / n;
                        var rem = this.width % n;
                        var tileX = this.x;
                        for (var i = 0; i < n; i++) {
                            rects[i] = new Rectangle(tileX, this.y, tileWidth, this.height);
                            if (rem > 0) {
                                rects[i].width++;
                                rem--;
                            }
                            tileX += rects[i].width;
                        }
                        return rects;
                    }
                }, {
                    key: "subDivideVertAbs",
                    value: function subDivideVertAbs(height) {
                        var peanutButter = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : true;

                        var n = Math.ceil(this.height / height);
                        return this.subDivideVert(n, peanutButter);
                    }
                }, {
                    key: "subDivideVertAbsEnclosed",
                    value: function subDivideVertAbsEnclosed(height) {
                        var peanutButter = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : true;

                        var n = Math.ceil(this.height / height);
                        return this.subDivideVertEnclosed(n, peanutButter);
                    }
                }, {
                    key: "subDivideVertEnclosed",
                    value: function subDivideVertEnclosed(n) {
                        var peanutButter = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : true;

                        var rects = [];
                        var tileHeight = Math.floor(this.height / n);
                        var rem = this.height % n;
                        var tileY = 0;
                        for (var i = 0; i < n; i++) {
                            rects[i] = new Rectangle(0, tileY, this.width, tileHeight);
                            if (peanutButter && rem > 0) {
                                rects[i].height++;
                                rem--;
                            }
                            tileY += rects[i].height;
                        }
                        return rects;
                    }
                }, {
                    key: "subDivideVert",
                    value: function subDivideVert(n) {
                        var peanutButter = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : true;

                        var rects = [];
                        var tileHeight = Math.floor(this.height / n);
                        var rem = this.height % n;
                        var tileY = this.y;
                        for (var i = 0; i < n; i++) {
                            rects[i] = new Rectangle(this.x, tileY, this.width, tileHeight);
                            if (peanutButter && rem > 0) {
                                rects[i].height++;
                                rem--;
                            }
                            tileY += rects[i].height;
                        }
                        return rects;
                    }
                }, {
                    key: "size",

                    /**
                     * Size of the rectangle
                     */
                    get: function get() {
                        return { width: this.width, height: this.height };
                    }
                }], [{
                    key: "fromClientRect",
                    value: function fromClientRect(cr) {
                        return new Rectangle(cr.left, cr.top, cr.width, cr.height);
                    }
                }, {
                    key: "conformElementToRect",
                    value: function conformElementToRect(elm, rect) {
                        rect.conformElement(elm);
                        return elm;
                    }
                }]);

                return Rectangle;
            }();

            exports.Rectangle = Rectangle;

            var Square = function (_Rectangle) {
                _inherits(Square, _Rectangle);

                function Square(x, y, len) {
                    _classCallCheck(this, Square);

                    var _this42 = _possibleConstructorReturn(this, (Square.__proto__ || Object.getPrototypeOf(Square)).call(this, x, y, len, len));

                    _this42.len = len;
                    return _this42;
                }

                return Square;
            }(Rectangle);

            exports.Square = Square;
        }, {}], 40: [function (require, module, exports) {
            "use strict";

            Object.defineProperty(exports, "__esModule", { value: true });

            var Vector = function () {
                // Constructor
                function Vector(x, y) {
                    _classCallCheck(this, Vector);

                    this.x = x;
                    this.y = y;
                }
                /**
                 * Returns the vector resulting from rotating vector by angle
                 */


                _createClass(Vector, [{
                    key: "length",
                    value: function length() {
                        return Math.sqrt(this.x * this.x + this.y * this.y);
                    }
                }], [{
                    key: "rotate",
                    value: function rotate(vector, angle) {
                        return new Vector(vector.x * Math.cos(angle) - vector.y * Math.sin(angle), vector.x * Math.sin(angle) + vector.y * Math.cos(angle));
                    }
                    /**
                     * Returns the normalized form of the given vector
                     */

                }, {
                    key: "normalize",
                    value: function normalize(vector) {
                        var length = vector.length();
                        return new Vector(vector.x / length, vector.y / length);
                    }
                }]);

                return Vector;
            }();

            exports.Vector = Vector;
        }, {}], 41: [function (require, module, exports) {
            "use strict";

            function __export(m) {
                for (var p in m) {
                    if (!exports.hasOwnProperty(p)) exports[p] = m[p];
                }
            }
            Object.defineProperty(exports, "__esModule", { value: true });
            __export(require("./browserContainerHost"));
            __export(require("./component"));
            __export(require("./geometry"));
            __export(require("./utils"));
        }, { "./browserContainerHost": 34, "./component": 35, "./geometry": 37, "./utils": 42 }], 42: [function (require, module, exports) {
            "use strict";

            Object.defineProperty(exports, "__esModule", { value: true });
            // Utility to fetch elements by ID
            function id(elementId) {
                return document.getElementById(elementId);
            }
            exports.id = id;
            function makeElementVisible(elem, visible) {
                elem.style.display = visible ? "block" : "none";
            }
            exports.makeElementVisible = makeElementVisible;
            // Convenience function used by color converters.
            function byteHex(num) {
                var hex = num.toString(16);
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
                var r = toRGBInteger(color.r);
                var g = toRGBInteger(color.g);
                var b = toRGBInteger(color.b);
                return "rgba(" + r + ", " + g + ", " + b + ", " + color.a + ")";
            }
            exports.toColorString = toColorString;
            // Helper function to support HTML hexColor Strings
            function hexStrToRGBA(hexStr) {
                // RGBA color object
                var colorObject = { r: 1, g: 1, b: 1, a: 1 };
                // remove hash if it exists
                hexStr = hexStr.replace("#", "");
                if (hexStr.length === 6) {
                    // No Alpha
                    colorObject.r = parseInt(hexStr.slice(0, 2), 16) / 255;
                    colorObject.g = parseInt(hexStr.slice(2, 4), 16) / 255;
                    colorObject.b = parseInt(hexStr.slice(4, 6), 16) / 255;
                    colorObject.a = parseInt("0xFF", 16) / 255;
                } else if (hexStr.length === 8) {
                    // Alpha
                    colorObject.r = parseInt(hexStr.slice(0, 2), 16) / 255;
                    colorObject.g = parseInt(hexStr.slice(2, 4), 16) / 255;
                    colorObject.b = parseInt(hexStr.slice(4, 6), 16) / 255;
                    colorObject.a = parseInt(hexStr.slice(6, 8), 16) / 255;
                } else if (hexStr.length === 3) {
                    // Shorthand hex color
                    var rVal = hexStr.slice(0, 1);
                    var gVal = hexStr.slice(1, 2);
                    var bVal = hexStr.slice(2, 3);
                    colorObject.r = parseInt(rVal + rVal, 16) / 255;
                    colorObject.g = parseInt(gVal + gVal, 16) / 255;
                    colorObject.b = parseInt(bVal + bVal, 16) / 255;
                } else {
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
                    case "Black":
                        return { r: 0x00, g: 0x00, b: 0x00, a: 0xff };
                    case "Blue":
                        return { r: 0x00, g: 0x00, b: 0xff, a: 0xff };
                    case "Red":
                        return { r: 0xff, g: 0x00, b: 0x00, a: 0xff };
                    case "Green":
                        return { r: 0x00, g: 0xff, b: 0x00, a: 0xff };
                    // Highlighting colors
                    case "Yellow":
                        return { r: 0xff, g: 0xff, b: 0x00, a: 0xff };
                    case "Aqua":
                        return { r: 0x66, g: 0xcd, b: 0xaa, a: 0xff };
                    case "Lime":
                        return { r: 0x00, g: 0xff, b: 0x00, a: 0xff };
                    // Select colors
                    case "Gold":
                        return { r: 0xff, g: 0xd7, b: 0x00, a: 0xff };
                    case "White":
                        return { r: 0xff, g: 0xff, b: 0xff, a: 0xff };
                    default:
                        return hexStrToRGBA(color);
                }
            }
            exports.toColorStruct = toColorStruct;
            // ----------------------------------------------------------------------
            // URL/Path parsing stuff
            // ----------------------------------------------------------------------
            function breakFilePath(path) {
                var m = path.match(/(.*)[\/\\]([^\/\\]+)\.(\w+)/);
                if (m) {
                    return { source: m[0], path: m[1], filename: m[2], ext: m[3] };
                } else {
                    return { source: m[0], path: "", filename: "", ext: "" };
                }
            }
            exports.breakFilePath = breakFilePath;
            function parseURL(url) {
                var a = document.createElement("a");
                a.href = url;
                var parts = breakFilePath(a.pathname);
                return {
                    ext: parts.ext,
                    file: parts.filename,
                    hash: a.hash.replace("#", ""),
                    host: a.hostname,
                    params: function params() {
                        var ret = {};
                        var seg = a.search.replace(/^\?/, "").split("&");
                        var len = seg.length;
                        var i = 0;
                        var s = void 0;
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
                    source: url
                };
            }
            exports.parseURL = parseURL;
            // Following recomendations of https://developer.mozilla.org/en-US/docs/Web/Events/resize to
            // throttle computationally expensive events
            function throttle(type, name, obj) {
                obj = obj || window;
                var running = false;
                obj.addEventListener(type, function () {
                    if (running) {
                        return;
                    }
                    running = true;
                    requestAnimationFrame(function () {
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

            var AnimationFrameThrottler = function () {
                function AnimationFrameThrottler(callback) {
                    _classCallCheck(this, AnimationFrameThrottler);

                    this.callback = callback;
                    this.running = false;
                }

                _createClass(AnimationFrameThrottler, [{
                    key: "trigger",
                    value: function trigger() {
                        var _this43 = this;

                        if (this.running) {
                            return;
                        }
                        this.running = true;
                        requestAnimationFrame(function () {
                            _this43.callback();
                            _this43.running = false;
                        });
                    }
                }]);

                return AnimationFrameThrottler;
            }();

            exports.AnimationFrameThrottler = AnimationFrameThrottler;
            function removeAllChildren(element) {
                // Remove any existing children and attach ourselves
                while (element.hasChildNodes()) {
                    element.removeChild(element.lastChild);
                }
            }
            exports.removeAllChildren = removeAllChildren;
        }, {}] }, {}, [6])(6);
});
//# sourceMappingURL=ui.js.map