/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable no-new-func */
/* eslint-disable no-template-curly-in-string */
/* eslint-disable jsdoc/require-hyphen-before-param-description */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable unicorn/better-regex */
/* eslint-disable no-func-assign */
/* eslint-disable @typescript-eslint/no-this-alias */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-implied-eval */
/* eslint-disable @typescript-eslint/restrict-plus-operands */
/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable no-param-reassign */
/* eslint-disable @typescript-eslint/prefer-optional-chain */
/* eslint-disable tsdoc/syntax */
/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/*!
 * Benchmark.js
 * Copyright 2010-2016 Mathias Bynens
 * Based on JSLitmus.js, copyright Robert Kieffer
 * Modified by John-David Dalton
 * Available under MIT license
 */

import _ from "lodash";
import {
	tTable,
	Event,
	Deferred,
	cloneDeep,
	delay,
	getMean,
	timer,
	uTable,
	processObject,
	calledBy,
	divisors,
	counter,
	defaultOptions,
	getRes,
	createCompiled,
} from "./benchmark";

/* -------------------------------------------------------------------------- */

/** Native method shortcuts. */
const abs = Math.abs;
const floor = Math.floor;
const max = Math.max;
const min = Math.min;
const pow = Math.pow;
const shift = [].shift;
const sqrt = Math.sqrt;

/* ------------------------------------------------------------------------ */
class Benchmark {
	/**
	 * The number of times a test was executed.
	 * @type number
	 */
	count = 0;

	/**
	 * The number of cycles performed while benchmarking.
	 * @type number
	 */
	cycles = 0;

	/**
	 * The number of executions per second.
	 * @type number
	 */
	hz = 0;

	/**
	 * The compiled test function.
	 * @type {Function|string}
	 */
	compiled = undefined;

	/**
	 * The error object if the test failed.
	 * @type Object
	 */
	error = undefined;

	/**
	 * The test to benchmark.
	 * @type {Function|string}
	 */
	fn = undefined;

	/**
	 * A flag to indicate if the benchmark is aborted.
	 * @type boolean
	 */
	aborted = false;

	/**
	 * A flag to indicate if the benchmark is running.
	 * @type boolean
	 */
	running = false;

	/**
	 * Compiled into the test and executed immediately **before** the test loop.
	 * @type {Function|string}
	 * @example
	 *
	 * // basic usage
	 * var bench = Benchmark({
	 *   'setup': function() {
	 *     var c = this.count,
	 *         element = document.getElementById('container');
	 *     while (c--) {
	 *       element.appendChild(document.createElement('div'));
	 *     }
	 *   },
	 *   'fn': function() {
	 *     element.removeChild(element.lastChild);
	 *   }
	 * });
	 *
	 * // compiles to something like:
	 * var c = this.count,
	 *     element = document.getElementById('container');
	 * while (c--) {
	 *   element.appendChild(document.createElement('div'));
	 * }
	 * var start = new Date;
	 * while (count--) {
	 *   element.removeChild(element.lastChild);
	 * }
	 * var end = new Date - start;
	 *
	 * // or using strings
	 * var bench = Benchmark({
	 *   'setup': '\
	 *     var a = 0;\n\
	 *     (function() {\n\
	 *       (function() {\n\
	 *         (function() {',
	 *   'fn': 'a += 1;',
	 *   'teardown': '\
	 *          }())\n\
	 *        }())\n\
	 *      }())'
	 * });
	 *
	 * // compiles to something like:
	 * var a = 0;
	 * (function() {
	 *   (function() {
	 *     (function() {
	 *       var start = new Date;
	 *       while (count--) {
	 *         a += 1;
	 *       }
	 *       var end = new Date - start;
	 *     }())
	 *   }())
	 * }())
	 */
	setup = _.noop;

	/**
	 * Compiled into the test and executed immediately **after** the test loop.
	 * @type {Function|string}
	 */
	teardown = _.noop;

	/**
	 * An object of stats including mean, margin or error, and standard deviation.
	 * @type Object
	 */
	stats = {
		/**
		 * The margin of error.
		 *
		 * @memberOf Benchmark#stats
		 * @type number
		 */
		moe: 0,

		/**
		 * The relative margin of error (expressed as a percentage of the mean).
		 *
		 * @memberOf Benchmark#stats
		 * @type number
		 */
		rme: 0,

		/**
		 * The standard error of the mean.
		 *
		 * @memberOf Benchmark#stats
		 * @type number
		 */
		sem: 0,

		/**
		 * The sample standard deviation.
		 *
		 * @memberOf Benchmark#stats
		 * @type number
		 */
		deviation: 0,

		/**
		 * The sample arithmetic mean (secs).
		 *
		 * @memberOf Benchmark#stats
		 * @type number
		 */
		mean: 0,

		/**
		 * The array of sampled periods.
		 *
		 * @memberOf Benchmark#stats
		 * @type Array
		 */
		sample: [],

		/**
		 * The sample variance.
		 *
		 * @memberOf Benchmark#stats
		 * @type number
		 */
		variance: 0,
	};

	/**
	 * An object of timing data including cycle, elapsed, period, start, and stop.
	 * @type Object
	 */
	times = {
		/**
		 * The time taken to complete the last cycle (secs).
		 *
		 * @memberOf Benchmark#times
		 * @type number
		 */
		cycle: 0,

		/**
		 * The time taken to complete the benchmark (secs).
		 *
		 * @memberOf Benchmark#times
		 * @type number
		 */
		elapsed: 0,

		/**
		 * The time taken to execute the test once (secs).
		 *
		 * @memberOf Benchmark#times
		 * @type number
		 */
		period: 0,

		/**
		 * A timestamp of when the benchmark started (ms).
		 *
		 * @memberOf Benchmark#times
		 * @type number
		 */
		timeStamp: 0,
	};

	/**
	 * The Benchmark constructor.
	 * @param {Object} [options={}] Options object.
	 * @example
	 *
	 * var bench = new Benchmark({
	 *
	 *   // benchmark name
	 *   'name': 'foo',
	 *
	 *   // benchmark test as a string
	 *   'fn': '[1,2,3,4].sort()'
	 * });
	 */
	constructor(options) {
		this.options = {
			...defaultOptions,
			...options,
		};

		_.forOwn(this.options, (value, key) => {
			if (value != null) {
				// Add event listeners.
				if (/^on[A-Z]/.test(key)) {
					_.each(key.split(" "), (key) => {
						this.on(key.slice(2).toLowerCase(), value);
					});
				} else if (!_.has(this, key)) {
					this[key] = cloneDeep(value);
				}
			}
		});

		this.id ??= ++counter;
		this.stats = cloneDeep(this.stats);
		this.times = { ...this.times };
	}

	/**
	 * Runs the benchmark.
	 * @param {Object} [options={}] - Options object.
	 * @returns {Object} The benchmark instance.
	 * @example
	 *
	 * // basic usage
	 * bench.run();
	 *
	 * // or with options
	 * bench.run({ 'async': true });
	 */
	run(options) {
		const bench = this;
		const event = new Event("start");

		// Set `running` to `false` so `reset()` won't call `abort()`.
		bench.running = false;
		bench.reset();
		bench.running = true;

		bench.count = bench.initCount;
		bench.times.timeStamp = +_.now();
		bench.emit(event);

		if (!event.cancelled) {
			options = {
				async: (options = options && options.async) == null ? bench.async : options,
			};

			// For clones created within `compute()`.
			if (bench._original) {
				if (bench.defer) {
					new Deferred(bench);
				} else {
					cycle(bench, options);
				}
			}
			// For original benchmarks.
			else {
				compute(bench, options);
			}
		}
		return bench;
	}

	/**
	 * Executes all registered listeners of the specified event type.
	 *
	 * @param {Object|string} type - The event type or object.
	 * @param {...*} [args] - Arguments to invoke the listener with.
	 * @returns {*} Returns the return value of the last listener executed.
	 */
	emit(type) {
		let listeners;
		const object = this;
		const event = new Event(type);
		const events = object.events;
		const args = ((arguments[0] = event), arguments);

		event.currentTarget ??= object;
		event.target ??= object;
		delete event.result;

		if (events && (listeners = _.has(events, event.type) && events[event.type])) {
			_.each(listeners.slice(), (listener) => {
				if ((event.result = listener.apply(object, args)) === false) {
					event.cancelled = true;
				}
				return !event.aborted;
			});
		}
		return event.result;
	}

	/**
	 * Returns an array of event listeners for a given type that can be manipulated
	 * to add or remove listeners.
	 *
	 * @param {string} type - The event type.
	 * @returns {Array} The listeners array.
	 */
	listeners(type) {
		this.events ??= {};
		return _.has(this.events, type) ? this.events[type] : (this.events[type] = []);
	}

	/**
	 * Unregisters a listener for the specified event type(s),
	 * or unregisters all listeners for the specified event type(s),
	 * or unregisters all listeners for all event types.
	 *
	 * @param {string} [type] - The event type.
	 * @param {Function} [listener] - The function to unregister.
	 * @returns {Object} The current instance.
	 * @example
	 *
	 * // unregister a listener for an event type
	 * bench.off('cycle', listener);
	 *
	 * // unregister a listener for multiple event types
	 * bench.off('start cycle', listener);
	 *
	 * // unregister all listeners for an event type
	 * bench.off('cycle');
	 *
	 * // unregister all listeners for multiple event types
	 * bench.off('start cycle complete');
	 *
	 * // unregister all listeners for all event types
	 * bench.off();
	 */
	off(type, listener) {
		const events = this.events;

		if (!events) {
			return this;
		}
		_.each(type ? type.split(" ") : events, (listeners, type) => {
			let index;
			if (typeof listeners == "string") {
				type = listeners;
				listeners = _.has(events, type) && events[type];
			}
			if (listeners) {
				if (listener) {
					index = _.indexOf(listeners, listener);
					if (index > -1) {
						listeners.splice(index, 1);
					}
				} else {
					listeners.length = 0;
				}
			}
		});
		return this;
	}

	/**
	 * Registers a listener for the specified event type(s).
	 *
	 * @param {string} type - The event type.
	 * @param {Function} listener - The function to register.
	 * @returns {Object} The current instance.
	 * @example
	 *
	 * // register a listener for an event type
	 * bench.on('cycle', listener);
	 *
	 * // register a listener for multiple event types
	 * bench.on('start cycle', listener);
	 */
	on(type, listener) {
		this.events ??= {};

		_.each(type.split(" "), (type) => {
			(_.has(this.events, type) ? this.events[type] : (this.events[type] = [])).push(
				listener,
			);
		});
		return this;
	}

	/* ------------------------------------------------------------------------ */

	/**
	 * Aborts the benchmark without recording times.
	 * @returns {Object} The benchmark instance.
	 */
	abort() {
		const resetting = calledBy.reset;

		if (this.running) {
			const event = new Event("abort");
			this.emit(event);
			if (!event.cancelled || resetting) {
				// Avoid infinite recursion.
				calledBy.abort = true;
				this.reset();
				delete calledBy.abort;

				clearTimeout(this._timerId);
				delete this._timerId;

				if (!resetting) {
					this.aborted = true;
					this.running = false;
				}
			}
		}
		return this;
	}

	/**
	 * Creates a new benchmark using the same test and options.
	 *
	 * @param {Object} options - Options object to overwrite cloned options.
	 * @returns {Object} The new benchmark instance.
	 * @example
	 *
	 * var bizarro = bench.clone({
	 *   'name': 'doppelganger'
	 * });
	 */
	clone(options) {
		const result = new Benchmark({ ...this, ...options });

		// Correct the `options` object.
		result.options = { ...this.options, ...options };

		// Copy own custom properties.
		_.forOwn(this, (value, key) => {
			if (!_.has(result, key)) {
				result[key] = cloneDeep(value);
			}
		});

		return result;
	}

	/**
	 * Determines if a benchmark is faster than another.
	 *
	 * @param {Object} other - The benchmark to compare.
	 * @returns {number} Returns `-1` if slower, `1` if faster, and `0` if indeterminate.
	 */
	compare(other) {
		// Exit early if comparing the same benchmark.
		if (this === other) {
			return 0;
		}
		let zStat;
		const sample1 = this.stats.sample;
		const sample2 = other.stats.sample;
		const size1 = sample1.length;
		const size2 = sample2.length;
		const maxSize = max(size1, size2);
		const minSize = min(size1, size2);
		const u1 = getU(sample1, sample2);
		const u2 = getU(sample2, sample1);
		const u = min(u1, u2);

		function getScore(xA, sampleB) {
			return _.reduce(
				sampleB,
				(total, xB) => {
					return total + (xB > xA ? 0 : xB < xA ? 1 : 0.5);
				},
				0,
			);
		}

		function getU(sampleA, sampleB) {
			return _.reduce(
				sampleA,
				(total, xA) => {
					return total + getScore(xA, sampleB);
				},
				0,
			);
		}

		function getZ(u) {
			return (u - (size1 * size2) / 2) / sqrt((size1 * size2 * (size1 + size2 + 1)) / 12);
		}
		// Reject the null hypothesis the two samples come from the
		// same population (i.e. have the same median) if...
		if (size1 + size2 > 30) {
			// ...the z-stat is greater than 1.96 or less than -1.96
			// http://www.statisticslectures.com/topics/mannwhitneyu/
			zStat = getZ(u);
			return abs(zStat) > 1.96 ? (u === u1 ? 1 : -1) : 0;
		}
		// ...the U value is less than or equal the critical U value.
		const critical = maxSize < 5 || minSize < 3 ? 0 : uTable[maxSize][minSize - 3];
		return u <= critical ? (u === u1 ? 1 : -1) : 0;
	}

	/**
	 * Reset properties and abort if running.
	 *
	 * @returns {Object} The benchmark instance.
	 */
	reset() {
		const bench = this;
		if (bench.running && !calledBy.abort) {
			// No worries, `reset()` is called within `abort()`.
			calledBy.reset = true;
			bench.abort();
			delete calledBy.reset;
			return bench;
		}
		let event;
		let index = 0;
		const changes = [];
		const queue = [];

		// A non-recursive solution to check if properties have changed.
		// For more information see http://www.jslab.dk/articles/non.recursive.preorder.traversal.part4.
		let data = {
			destination: bench,
			source: {
				...cloneDeep(bench.constructor.prototype),
				...bench.options,
			},
		};

		do {
			_.forOwn(data.source, (value, key) => {
				let changed;
				const destination = data.destination;
				let currValue = destination[key];

				// Skip pseudo private properties and event listeners.
				if (/^_|^events$|^on[A-Z]/.test(key)) {
					return;
				}
				if (_.isObjectLike(value)) {
					if (Array.isArray(value)) {
						// Check if an array value has changed to a non-array value.
						if (!Array.isArray(currValue)) {
							changed = true;
							currValue = [];
						}
						// Check if an array has changed its length.
						if (currValue.length !== value.length) {
							changed = true;
							currValue = currValue.slice(0, value.length);
							currValue.length = value.length;
						}
					}
					// Check if an object has changed to a non-object value.
					else if (!_.isObjectLike(currValue)) {
						changed = true;
						currValue = {};
					}
					// Register a changed object.
					if (changed) {
						changes.push({ destination, key, value: currValue });
					}
					queue.push({ destination: currValue, source: value });
				}
				// Register a changed primitive.
				else if (!_.eq(currValue, value) && value !== undefined) {
					changes.push({ destination, key, value });
				}
			});
		} while ((data = queue[index++]));

		// If changed emit the `reset` event and if it isn't cancelled reset the benchmark.
		if (changes.length && (bench.emit((event = new Event("reset"))), !event.cancelled)) {
			_.each(changes, (data) => {
				data.destination[data.key] = data.value;
			});
		}
		return bench;
	}
}

class Deferred {
	/**
	 * @param {Object} clone - The cloned benchmark instance.
	 */
	constructor(clone) {
		this.benchmark = clone;
		clock(this);
	}

	/**
	 * Handles cycling/completing the deferred benchmark.
	 */
	resolve() {
		const deferred = this;
		const clone = deferred.benchmark;
		const bench = clone._original;

		if (bench.aborted) {
			// cycle() -> clone cycle/complete event -> compute()'s invoked bench.run() cycle/complete.
			deferred.teardown();
			clone.running = false;
			cycle(deferred);
		} else if (++deferred.cycles < clone.count) {
			clone.compiled.call(deferred, globalThis, timer);
		} else {
			timer.stop(deferred);
			deferred.teardown();
			delay(clone, () => {
				cycle(deferred);
			});
		}
	}

	/**
	 * The deferred benchmark instance.
	 * @type Object
	 */
	benchmark = null;

	/**
	 * The number of deferred cycles performed while benchmarking.
	 * @type number
	 */
	cycles = 0;

	/**
	 * The time taken to complete the deferred benchmark (secs).
	 * @type number
	 */
	elapsed = 0;

	/**
	 * @type number
	 */
	timeStamp = 0;
}

/* ------------------------------------------------------------------------ */

/**
 * Invokes a method on all items in an array.
 *
 * @static
 * @memberOf Benchmark
 * @param {Array} benches - Array of benchmarks to iterate over.
 * @param {Object|string} name - The name of the method to invoke OR options object.
 * @param {...*} [args] Arguments to invoke the method with.
 * @returns {Array} A new array of values returned from each method invoked.
 * @example
 *
 *
 * // invoke `run(true)`, treat benchmarks as a queue, and register invoke callbacks
 * Benchmark.invoke(benches, {
 *
 *   // invoke the `run` method
 *   'name': 'run',
 *
 *   // pass a single argument
 *   'args': true,
 *
 *   // treat as queue, removing benchmarks from front of `benches` until empty
 *   'queued': true,
 *
 *   // called before any benchmarks have been invoked.
 *   'onStart': onStart,
 *
 *   // called between invoking benchmarks
 *   'onCycle': onCycle,
 *
 *   // called after all benchmarks have been invoked.
 *   'onComplete': onComplete
 * });
 */
function invoke(benches, name) {
	let args;
	let bench;
	let index = -1;
	const eventProps = { currentTarget: benches };
	let options = { onStart: _.noop, onCycle: _.noop, onComplete: _.noop };
	const result = _.toArray(benches);

	/**
	 * Invokes the method of the current object and if synchronous, fetches the next.
	 */
	function execute() {
		let listeners;
		const async = isAsync(bench);

		if (async) {
			// Use `getNext` as the first listener.
			bench.on("complete", getNext);
			listeners = bench.events.complete;
			listeners.splice(0, 0, listeners.pop());
		}
		// Execute method.
		result[index] = _.isFunction(bench && bench[name])
			? bench[name].apply(bench, args)
			: undefined;
		// If synchronous return `true` until finished.
		return !async && getNext();
	}

	/**
	 * Fetches the next bench or executes `onComplete` callback.
	 */
	function getNext(event) {
		const last = bench;
		const async = isAsync(last);

		if (async) {
			last.off("complete", getNext);
			last.emit("complete");
		}
		// Emit "cycle" event.
		eventProps.type = "cycle";
		eventProps.target = last;
		const cycleEvent = new Event(eventProps);
		options.onCycle.call(benches, cycleEvent);

		// Choose next benchmark if not exiting early.
		if (!cycleEvent.aborted && raiseIndex() !== false) {
			bench = queued ? benches[0] : result[index];
			if (isAsync(bench)) {
				delay(bench, execute);
			} else if (async) {
				// Resume execution if previously asynchronous but now synchronous.
				while (execute()) {}
			} else {
				// Continue synchronous execution.
				return true;
			}
		} else {
			// Emit "complete" event.
			eventProps.type = "complete";
			options.onComplete.call(benches, new Event(eventProps));
		}
		// When used as a listener `event.aborted = true` will cancel the rest of
		// the "complete" listeners because they were already called above and when
		// used as part of `getNext` the `return false` will exit the execution while-loop.
		if (event) {
			event.aborted = true;
		} else {
			return false;
		}
	}

	/**
	 * Checks if invoking `Benchmark#run` with asynchronous cycles.
	 */
	function isAsync(object) {
		// Avoid using `instanceof` here because of IE memory leak issues with host objects.
		const async = args[0] && args[0].async;
		return (
			name === "run" &&
			object instanceof Benchmark &&
			((async == null ? object.options.async : async) || object.defer)
		);
	}

	/**
	 * Raises `index` to the next defined index or returns `false`.
	 */
	function raiseIndex() {
		index++;

		// If queued remove the previous bench.
		if (queued && index > 0) {
			shift.call(benches);
		}
		// If we reached the last index then return `false`.
		return (queued ? benches.length : index < result.length) ? index : (index = false);
	}

	options = Object.assign(options, name);
	name = options.name;
	args = Array.isArray((args = "args" in options ? options.args : [])) ? args : [args];
	const queued = options.queued;

	// Start iterating over the array.
	if (raiseIndex() !== false) {
		// Emit "start" event.
		bench = result[index];
		eventProps.type = "start";
		eventProps.target = bench;
		options.onStart.call(benches, new Event(eventProps));

		// Start method execution.
		if (isAsync(bench)) {
			delay(bench, execute);
		} else {
			while (execute()) {}
		}
	}
	return result;
}

/* ------------------------------------------------------------------------ */

/* ------------------------------------------------------------------------ */

/**
 * Clocks the time taken to execute a test per cycle (secs).
 *
 * @private
 * @param {Object} bench - The benchmark instance.
 * @returns {number} The time taken.
 */
function clock() {
	const options = defaultOptions;
	const templateData = {};
	const timers = [{ ns: timer.ns, res: max(0.0015, getRes("ms")), unit: "ms" }];

	// Lazy define for hi-res timers.
	clock = function (clone) {
		let deferred;

		if (clone instanceof Deferred) {
			deferred = clone;
			clone = deferred.benchmark;
		}
		const bench = clone._original;
		const count = (bench.count = clone.count);
		const id = bench.id;
		const name = bench.name || (typeof id == "number" ? `<Test #${id}>` : id);
		let result = 0;

		// Init `minTime` if needed.
		clone.minTime = bench.minTime || (bench.minTime = bench.options.minTime = options.minTime);

		// Compile in setup/teardown functions and the test loop.
		// Create a new compiled test, instead of using the cached `bench.compiled`,
		// to avoid potential engine optimizations enabled over the life of the test.
		let funcBody = deferred
			? "var d#=this,${fnArg}=d#,m#=d#.benchmark._original,f#=m#.fn,su#=m#.setup,td#=m#.teardown;" +
			  // When `deferred.cycles` is `0` then...
			  "if(!d#.cycles){" +
			  // set `deferred.fn`,
			  'd#.fn=function(){var ${fnArg}=d#;if(typeof f#=="function"){try{${fn}\n}catch(e#){f#(d#)}}else{${fn}\n}};' +
			  // set `deferred.teardown`,
			  'd#.teardown=function(){d#.cycles=0;if(typeof td#=="function"){try{${teardown}\n}catch(e#){td#()}}else{${teardown}\n}};' +
			  // execute the benchmark's `setup`,
			  'if(typeof su#=="function"){try{${setup}\n}catch(e#){su#()}}else{${setup}\n};' +
			  // start timer,
			  "t#.start(d#);" +
			  // and then execute `deferred.fn` and return a dummy object.
			  '}d#.fn();return{uid:"${uid}"}'
			: "var r#,s#,m#=this,f#=m#.fn,i#=m#.count,n#=t#.ns;${setup}\n${begin};" +
			  'while(i#--){${fn}\n}${end};${teardown}\nreturn{elapsed:r#,uid:"${uid}"}';

		let compiled =
			(bench.compiled =
			clone.compiled =
				createCompiled(bench, deferred, funcBody));
		const isEmpty = !templateData.fn;

		if (!deferred) {
			funcBody =
				`var r#,s#,m#=this,f#=m#.fn,i#=m#.count,n#=t#.ns;\${setup}\n\${begin};m#.f#=f#;while(i#--){m#.f#()}\${end};` +
				`delete m#.f#;\${teardown}\nreturn{elapsed:r#}`;

			compiled = createCompiled(bench, deferred, funcBody);

			try {
				// Pretest one more time to check for errors.
				bench.count = 1;
				compiled.call(bench, globalThis, timer);
				bench.count = count;
				delete clone.error;
			} catch (e) {
				bench.count = count;
				if (!clone.error) {
					clone.error = e || new Error(String(e));
				}
			}
		}
		// If no errors run the full test loop.
		if (!clone.error) {
			compiled = bench.compiled = clone.compiled = createCompiled(bench, deferred, funcBody);
			// eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
			result = compiled.call(deferred || bench, globalThis, timer).elapsed;
		}
		return result;
	};

	/* ---------------------------------------------------------------------- */

	/**
	 * Interpolates a given template string.
	 */
	function interpolate(string) {
		// Replaces all occurrences of `#` with a unique number and template tokens with content.
		return _.template(string.replace(/#/g, /\d+/.exec(templateData.uid)))(templateData);
	}

	/* ---------------------------------------------------------------------- */

	// Detect Chrome's microsecond timer:
	// enable benchmarking via the --enable-benchmarking command
	// line switch in at least Chrome 7 to use chrome.Interval
	try {
		// eslint-disable-next-line no-constant-condition
		if ((timer.ns = new (globalThis.chrome ?? globalThis.chromium).Interval())) {
			timers.push({ ns: timer.ns, res: getRes("us"), unit: "us" });
		}
	} catch (e) {}

	// Detect Node.js's nanosecond resolution timer available in Node.js >= 0.8.
	if (processObject && typeof (timer.ns = processObject.hrtime) == "function") {
		timers.push({ ns: timer.ns, res: getRes("ns"), unit: "ns" });
	}
	// Pick timer with highest resolution.
	timer = _.minBy(timers, "res");

	// Error if there are no working timers.
	if (timer.res === Infinity) {
		throw new Error("Benchmark.js was unable to find a working timer.");
	}
	// Resolve time span required to achieve a percent uncertainty of at most 1%.
	// For more information see http://spiff.rit.edu/classes/phys273/uncert/uncert.html.
	if (!options.minTime) {
		options.minTime = max(timer.res / 2 / 0.01, 0.05);
	}
	return clock.apply(null, arguments);
}

/* ------------------------------------------------------------------------ */

/**
 * Computes stats on benchmark results.
 *
 * @private
 * @param {Object} bench - The benchmark instance.
 * @param {Object} options - The options object.
 */
function compute(bench, options) {
	options ??= {};

	const async = options.async;
	let elapsed = 0;
	const initCount = bench.initCount;
	const minSamples = bench.minSamples;
	const queue = [];
	const sample = bench.stats.sample;

	/**
	 * Adds a clone to the queue.
	 */
	function enqueue() {
		queue.push(
			Object.assign(bench.clone(), {
				_original: bench,
				events: {
					abort: [update],
					cycle: [update],
					error: [update],
					start: [update],
				},
			}),
		);
	}

	/**
	 * Updates the clone/original benchmarks to keep their data in sync.
	 */
	function update(event) {
		const clone = this;
		const type = event.type;

		if (bench.running) {
			if (type === "start") {
				// Note: `clone.minTime` prop is inited in `clock()`.
				clone.count = bench.initCount;
			} else {
				if (type === "error") {
					bench.error = clone.error;
				}
				if (type === "abort") {
					bench.abort();
					bench.emit("cycle");
				} else {
					event.currentTarget = event.target = bench;
					bench.emit(event);
				}
			}
		} else if (bench.aborted) {
			// Clear abort listeners to avoid triggering bench's abort/cycle again.
			clone.events.abort.length = 0;
			clone.abort();
		}
	}

	/**
	 * Determines if more clones should be queued or if cycling should stop.
	 */
	function evaluate(event) {
		let critical;
		let df;
		let mean;
		let moe;
		let rme;
		let sd;
		let sem;
		let variance;
		const clone = event.target;
		let done = bench.aborted;
		const now = +_.now();
		let size = sample.push(clone.times.period);
		let maxedOut =
			size >= minSamples && (elapsed += now - clone.times.timeStamp) / 1e3 > bench.maxTime;
		const times = bench.times;
		const varOf = function (sum, x) {
			return sum + pow(x - mean, 2);
		};

		// Exit early for aborted or unclockable tests.
		if (done || clone.hz === Infinity) {
			maxedOut = !(size = sample.length = queue.length = 0);
		}

		if (!done) {
			// Compute the sample mean (estimate of the population mean).
			mean = getMean(sample);
			// Compute the sample variance (estimate of the population variance).
			variance = _.reduce(sample, varOf, 0) / (size - 1) || 0;
			// Compute the sample standard deviation (estimate of the population standard deviation).
			sd = sqrt(variance);
			// Compute the standard error of the mean (a.k.a. the standard deviation of the sampling distribution of the sample mean).
			sem = sd / sqrt(size);
			// Compute the degrees of freedom.
			df = size - 1;
			// Compute the critical value.
			critical = tTable[Math.round(df) || 1] || tTable.infinity;
			// Compute the margin of error.
			moe = sem * critical;
			// Compute the relative margin of error.
			rme = (moe / mean) * 100 || 0;

			Object.assign(bench.stats, {
				deviation: sd,
				mean,
				moe,
				rme,
				sem,
				variance,
			});

			// Abort the cycle loop when the minimum sample size has been collected
			// and the elapsed time exceeds the maximum time allowed per benchmark.
			// We don't count cycle delays toward the max time because delays may be
			// increased by browsers that clamp timeouts for inactive tabs. For more
			// information see https://developer.mozilla.org/en/window.setTimeout#Inactive_tabs.
			if (maxedOut) {
				// Reset the `initCount` in case the benchmark is rerun.
				bench.initCount = initCount;
				bench.running = false;
				done = true;
				times.elapsed = (now - times.timeStamp) / 1e3;
			}
			if (bench.hz !== Infinity) {
				bench.hz = 1 / mean;
				times.cycle = mean * bench.count;
				times.period = mean;
			}
		}
		// If time permits, increase sample size to reduce the margin of error.
		if (queue.length < 2 && !maxedOut) {
			enqueue();
		}
		// Abort the `invoke` cycle when done.
		event.aborted = done;
	}

	// Init queue and begin.
	enqueue();
	invoke(queue, {
		name: "run",
		args: { async },
		queued: true,
		onCycle: evaluate,
		onComplete() {
			bench.emit("complete");
		},
	});
}

/* ------------------------------------------------------------------------ */

/**
 * Cycles a benchmark until a run `count` can be established.
 *
 * @private
 * @param {Object} clone - The cloned benchmark instance.
 * @param {Object} options - The options object.
 */
function cycle(clone, options) {
	options ??= {};

	let deferred;
	if (clone instanceof Deferred) {
		deferred = clone;
		clone = clone.benchmark;
	}
	let clocked;
	let cycles;
	let divisor;
	let event;
	let minTime;
	let period;
	const async = options.async;
	const bench = clone._original;
	let count = clone.count;
	const times = clone.times;

	// Continue, if not aborted between cycles.
	if (clone.running) {
		// `minTime` is set to `defaultOptions.minTime` in `clock()`.
		cycles = ++clone.cycles;
		clocked = deferred ? deferred.elapsed : clock(clone);
		minTime = clone.minTime;

		if (cycles > bench.cycles) {
			bench.cycles = cycles;
		}
		if (clone.error) {
			event = new Event("error");
			event.message = clone.error;
			clone.emit(event);
			if (!event.cancelled) {
				clone.abort();
			}
		}
	}
	// Continue, if not errored.
	if (clone.running) {
		// Compute the time taken to complete last test cycle.
		bench.times.cycle = times.cycle = clocked;
		// Compute the seconds per operation.
		period = bench.times.period = times.period = clocked / count;
		// Compute the ops per second.
		bench.hz = clone.hz = 1 / period;
		// Avoid working our way up to this next time.
		bench.initCount = clone.initCount = count;
		// Do we need to do another cycle?
		clone.running = clocked < minTime;

		if (clone.running) {
			// Tests may clock at `0` when `initCount` is a small number,
			// to avoid that we set its count to something a bit higher.
			if (!clocked && (divisor = divisors[clone.cycles]) != null) {
				count = floor(4e6 / divisor);
			}
			// Calculate how many more iterations it will take to achieve the `minTime`.
			if (count <= clone.count) {
				count += Math.ceil((minTime - clocked) / period);
			}
			clone.running = count !== Infinity;
		}
	}
	// Should we exit early?
	event = new Event("cycle");
	clone.emit(event);
	if (event.aborted) {
		clone.abort();
	}
	// Figure out what to do next.
	if (clone.running) {
		// Start a new cycle.
		clone.count = count;
		if (deferred) {
			clone.compiled.call(deferred, globalThis, timer);
		} else if (async) {
			delay(clone, () => {
				cycle(clone, options);
			});
		} else {
			cycle(clone);
		}
	} else {
		// We're done.
		clone.emit("complete");
	}
}

// eslint-disable-next-line import/no-default-export
export { Benchmark as default, Benchmark, Deferred, Event };
