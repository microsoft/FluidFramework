/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview Implement a general Eventing mechanism for decoupled objects.
 * Certain kinds of events (DocumentAdd, DocumentRemove, etc...) cannot be
 * registered against an object because the object may be volatile – i.e. the
 * Document may not yet exist, or it may change. Still there are times where
 * you want your events to be always called regardless of how volatile the object
 * is. For this the volatile object must implement the triggering – as it would do
 * with EventEmitter, and the receiving end has to register with Core.Events singleton
 *
 * NOTE: The class is named "HfdmEventEmitter" and not simply "EventEmitter" because
 * jsdoc seems to be having issue generating the documentation properly when the
 * class has a named which is already part of the NodeJS language. However the
 * documentation uses "EventEmitter" and "property-common.Events.EventEmitter" because
 * it is simpler to the reader who does not need to know about internal names
 * for module-robotized classes.
 */

(function() {

  var { generateGUID } = require('./guid_utils');
  var _ = require('lodash');

  /**
   * @license
   * Copyright Joyent, Inc. and other Node contributors.

   * Permission is hereby granted, free of charge, to any person obtaining a
   * copy of this software and associated documentation files (the
   * "Software"), to deal in the Software without restriction, including
   * without limitation the rights to use, copy, modify, merge, publish,
   * distribute, sublicense, and/or sell copies of the Software, and to permit
   * persons to whom the Software is furnished to do so, subject to the
   * following conditions:
   *
   * The above copyright notice and this permission notice shall be included
   * in all copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
   * OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
   * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
   * NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
   * DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
   * OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
   * USE OR OTHER DEALINGS IN THE SOFTWARE.
   */

  var isFunction = function(arg) {
    return typeof arg === 'function';
  };

  var isNumber = function(arg) {
    return typeof arg === 'number';
  };

  var isObject = function(arg) {
    return typeof arg === 'object' && arg !== null;
  };

  var isUndefined = function(arg) {
    return arg === undefined;
  };

  /**
   * @classdesc Implement a general Eventing mechanism for decoupled objects.
   * @constructor
   *
   * @alias property-common.Events.EventEmitter
   */
  var HfdmEventEmitter = function() {
    this._events = this._events || {};
    this._maxListeners = this._maxListeners || undefined;

    /**
     * Backwards compatibility shim.
     * Maps the event registration keys to the callback functions
     * @type {Object}
     */
    this._keyToFunctionMap = {};
  };

  // Backwards-compat with node 0.10.x
  HfdmEventEmitter.EventEmitter = HfdmEventEmitter;

  HfdmEventEmitter.prototype._events = undefined;
  HfdmEventEmitter.prototype._maxListeners = undefined;

  /**
   * By default EventEmitters will print a warning if more than 10 listeners are
   * added to it. This is a useful default which helps finding memory leaks.
   * @type {Number}
   */
  HfdmEventEmitter.defaultMaxListeners = 10;

  /**
   * Increment the maximum number of listeners an EventEmitter instance can
   * take. Set to zero for unlimited.
   * @param  {number} n Maximum number of listeners.
   * @return {property-common.Events.EventEmitter} This object.
   */
  HfdmEventEmitter.prototype.setMaxListeners = function(n) {
    if (!isNumber(n) || n < 0 || isNaN(n)) {
      throw new TypeError('n must be a positive number');
    }
    this._maxListeners = n;
    return this;
  };

  /**
   * Transmit an event to the listeners for a given type of event.
   *
   * Arguments can be transmitted to the listener by adding them to the call
   * to emit. For example: <pre>
   *    obj.emit('someEvent', arg1, arg2); </pre>
   * This will emit an event of type "someEvent" and will pass arg1 and arg2 to
   * the listener.
   *
   * @param  {string} type A string representing the type of event to emit.
   * @return {boolean}     Returns true if the event had listeners, false otherwise.
   */
  HfdmEventEmitter.prototype.emit = function(type) {
    var er, handler, len, args, i, listeners;

    if (!this._events) {
      this._events = {};
    }

    // If there is no 'error' event listener then throw.
    if (type === 'error') {
      if (!this._events.error ||
          (isObject(this._events.error) && !this._events.error.length)) {
        er = arguments[1];
        if (er instanceof Error) {
          throw er; // Unhandled 'error' event
        } else {
          throw new TypeError('Uncaught, unspecified "error" event.');
        }
      }
    }

    handler = this._events[type];

    if (isUndefined(handler)) {
      return false;
    }

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

  /**
   * Add a listener for a given type of event.
   *
   * @param  {string} type A string representing the type of event upon which the
   *   listener will be notified.
   * @param  {function} listener The function to call when the "type" of event
   *   is emitted.
   * @return {property-common.Events.EventEmitter} This object.
   */
  HfdmEventEmitter.prototype.addListener = function(type, listener) {
    var m;

    if (!isFunction(listener)) {
      throw new TypeError('listener must be a function');
    }

    if (!this._events) {
      this._events = {};
    }

    // To avoid recursion in the case that type === "newListener"! Before
    // adding it to the listeners, first emit "newListener".
    if (this._events.newListener) {
      this.emit('newListener', type,
                isFunction(listener.listener) ?
                listener.listener : listener);
    }

    if (!this._events[type]) {
      // Optimize the case of one listener. Don't need the extra array object.
      this._events[type] = listener;
    } else if (isObject(this._events[type])) {
      // If we've already got an array, just append.
      this._events[type].push(listener);
    } else {
      // Adding the second element, need to change to array.
      this._events[type] = [this._events[type], listener];
    }

    // Check for listener leak
    if (isObject(this._events[type]) && !this._events[type].warned) {
      if (isUndefined(this._maxListeners)) {
        m = HfdmEventEmitter.defaultMaxListeners;
      } else {
        m = this._maxListeners;
      }

      if (m && m > 0 && this._events[type].length > m) {
        this._events[type].warned = true;
        const errorMessage = '(node) warning: possible EventEmitter memory ' +
                      'leak detected. %d listeners added. ' +
                      'Use emitter.setMaxListeners() to increase limit.' +
                      this._events[type].length;
        if (typeof console.trace === 'function') {
          // not supported in IE 10
          console.trace(errorMessage);
        } else {
          console.error(errorMessage);
        }
      }
    }

    return this;
  };

  /**
   * Alias to addListener.
   *
   * @memberof property-common.Events.EventEmitter.prototype
   * @method on
   * @see property-common.Events.EventEmitter#addListener
   */
  HfdmEventEmitter.prototype.on = HfdmEventEmitter.prototype.addListener;

  /**
   * Add a temporary listener for a given type of event. This listener will be
   * notified the first time the event is emitted and then will be removed from
   * the listener list.
   *
   * @param  {string} type A string representing the type of event upon which the
   *   listener will be notified.
   * @param  {function} listener The function to call when the "type" of event
   *   is emitted. Will be called only once for this type of event unless re-added
   *   afterward.
   * @return {property-common.Events.EventEmitter} This object.
   */
  HfdmEventEmitter.prototype.once = function(type, listener) {
    if (!isFunction(listener)) {
      throw new TypeError('listener must be a function');
    }

    var fired = false;

    var that = this;
    var g = function() {
      that.removeListener(type, g);

      if (!fired) {
        fired = true;
        listener.apply(this, arguments);
      }
    };

    g.listener = listener;
    this.on(type, g);

    return this;
  };

  /**
   * Remove a listener for a given type of event. Iff a listener was removed,
   * an event 'removeListener' will be emitted.
   *
   * @param  {string} type A string representing the type of event on which the
   *   listener was attached.
   * @param  {function} listener The function to remove from the list of functions
   *   listening for the "type" event.
   * @return {property-common.Events.EventEmitter} This object.
   */
  HfdmEventEmitter.prototype.removeListener = function(type, listener) {
    var list, position, length, i;

    if (!isFunction(listener)) {
      throw new TypeError('listener must be a function');
    }

    if (!this._events || !this._events[type]) {
      return this;
    }

    list = this._events[type];
    length = list.length;
    position = -1;

    if (list === listener ||
        (isFunction(list.listener) && list.listener === listener)) {
      delete this._events[type];
      if (this._events.removeListener) {
        this.emit('removeListener', type, listener);
      }

    } else if (isObject(list)) {
      for (i = length; i-- > 0;) {
        if (list[i] === listener ||
            (list[i].listener && list[i].listener === listener)) {
          position = i;
          break;
        }
      }

      if (position < 0) {
        return this;
      }

      if (list.length === 1) {
        list.length = 0;
        delete this._events[type];
      } else {
        list.splice(position, 1);
      }

      if (this._events.removeListener) {
        this.emit('removeListener', type, listener);
      }
    }

    return this;
  };

  /**
   * Alias to removeListener.
   *
   * @memberof property-common.Events.EventEmitter.prototype
   * @method off
   * @see property-common.Events.EventEmitter#removeListener
   */
  HfdmEventEmitter.prototype.off = HfdmEventEmitter.prototype.removeListener;

  /**
   * Remove all listener for a given type of event.
   *
   * @param  {string} type A string representing the type of event on which the
   *   listener was attached.
   * @return {property-common.Events.EventEmitter} This object.
   */
  HfdmEventEmitter.prototype.removeAllListeners = function(type) {
    var key, listeners;

    if (!this._events) {
      return this;
    }

    // not listening for removeListener, no need to emit
    if (!this._events.removeListener) {
      if (arguments.length === 0) {
        this._events = {};
      } else if (this._events[type]) {
        delete this._events[type];
      }
      return this;
    }

    // emit removeListener for all listeners on all events
    if (arguments.length === 0) {
      var keys = _.keys(this._events);
      var l = keys.length;
      for (var i = 0; i < l; i++) {
        var key = keys[i];
        if (key === 'removeListener') {
          continue;
        }
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

  /**
   * Get the list of listeners for a given type of event.
   *
   * @param  {string} type A string representing the type of event for which we
   *   want to get the list of listeners.
   * @return {Array.<function>} An array of listeners.
   */
  HfdmEventEmitter.prototype.listeners = function(type) {
    var ret;
    if (!this._events || !this._events[type]) {
      ret = [];
    } else if (isFunction(this._events[type])) {
      ret = [this._events[type]];
    } else {
      ret = this._events[type].slice();
    }
    return ret;
  };

  /**
   * Get the number of listeners for a given type of event.
   *
   * @param  {string} type A string representing the type of event for which we
   *   want to get the number of listeners.
   * @return {number} The number of listeners
   */
  HfdmEventEmitter.prototype.listenerCount = function(type) {
    if (this._events) {
      var evlistener = this._events[type];

      if (isFunction(evlistener)) {
        return 1;
      } else if (evlistener) {
        return evlistener.length;
      }
    }
    return 0;
  };

  /**
   * Get the number of listeners for a given emitter for a type of event.
   *
   * @param  {property-common.Events.EventEmitter} emitter The emitter for this we want to
   *   count the listeners.
   * @param  {string} type A string representing the type of event for which we
   *   want to get the number of listeners.
   * @return {number} The number of listeners
   */
  HfdmEventEmitter.listenerCount = function(emitter, type) {
    return emitter.listenerCount(type);
  };

  /**
   * Trigger an event
   * @param {string} in_event Event handle
   * @param {object} in_caller The context in which we want to invoke the callback
   * @param {Array|*|undefined} [in_argsArr] Optionnally, a single argument
   *    or ( if necessary ) an Array containing all the arguments to pass along to
   *    the listener.
   */
  HfdmEventEmitter.prototype.trigger = function( in_event, in_caller, in_argsArr ) {
    var listeners = this.listeners(in_event);
    if (listeners.length > 0) {

      if (arguments.length >= 3 && !_.isArray(in_argsArr)) {
        in_argsArr = [in_argsArr];
      }

      listeners.forEach(function(listener) {
        listener.apply(in_caller, in_argsArr );
      });

    }
  };

  /**
   * Register to an event.
   * @param {string} in_event Event handle to register to
   * @param {function} in_cb Callback function
   * @return {string} Unique key associated with the registration. This key
   * should be given to the unregister() method
   */
  HfdmEventEmitter.prototype.register = function( in_event, in_cb ) {
    var key = generateGUID();
    this._keyToFunctionMap[key] = in_cb;

    this.on(in_event, in_cb);

    return key;
  };

  /**
   * Unregister an event callback, based on the key returned by .register
   * @param {string} in_event id to register for
   * @param {string} in_key key given by .register
   * @return {boolean} true iff the callback was unregistered
   */
  HfdmEventEmitter.prototype.unregister = function( in_event, in_key ) {
    var callback = this._keyToFunctionMap[in_key];

    if (callback) {
      delete this._keyToFunctionMap[in_key];

      this.off(in_event, callback);
    }

    return !!callback;
  };

  /**
   * Mutate the prototype of a constructor so as to mix in the EventEmitter
   * methods. This is useful when you want to make your class an EventEmitter,
   * but it inherits from some non-EventEmitter class.
   *
   * @param {function} in_constructor The object we want to transform into an emitter.
   * @return {function} the constructor passed in
   */
  HfdmEventEmitter.makeEventEmitter = function(in_constructor) {
    in_constructor.prototype.setMaxListeners = HfdmEventEmitter.prototype.setMaxListeners;
    in_constructor.prototype.addListener = HfdmEventEmitter.prototype.addListener;
    in_constructor.prototype.on = HfdmEventEmitter.prototype.on;
    in_constructor.prototype.once = HfdmEventEmitter.prototype.once;
    in_constructor.prototype.removeListener = HfdmEventEmitter.prototype.removeListener;
    in_constructor.prototype.off = HfdmEventEmitter.prototype.off;
    in_constructor.prototype.removeAllListeners = HfdmEventEmitter.prototype.removeAllListeners;
    in_constructor.prototype.listeners = HfdmEventEmitter.prototype.listeners;
    in_constructor.prototype.emit = HfdmEventEmitter.prototype.emit;
    in_constructor.prototype.trigger = HfdmEventEmitter.prototype.trigger;
    in_constructor.prototype.listenerCount = HfdmEventEmitter.prototype.listenerCount;
    in_constructor.prototype.register = HfdmEventEmitter.prototype.register;
    in_constructor.prototype.unregister = HfdmEventEmitter.prototype.unregister;
    return in_constructor;
  };
  module.exports = { Singleton: new HfdmEventEmitter(), EventEmitter: HfdmEventEmitter };

})();
