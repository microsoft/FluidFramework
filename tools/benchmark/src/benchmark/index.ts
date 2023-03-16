/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable no-param-reassign */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable no-new-func */
/* eslint-disable no-template-curly-in-string */
/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable unicorn/better-regex */
/* eslint-disable @typescript-eslint/no-implied-eval */
/* eslint-disable tsdoc/syntax */
/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/prefer-nullish-coalescing */
/* eslint-disable @typescript-eslint/restrict-plus-operands */
/* eslint-disable prefer-rest-params */

/**
 * The below code is a heavily modified and simplified version of Benchmark.js ported to TypeScript.
 * There is likely a lot more simplification possible, and string based function generation should probably be removed entirely,
 * but it works well enough it its current state.
 * See README.md in this this directory for more details.
 */

/*!
 * Benchmark.js
 * Copyright 2010-2016 Mathias Bynens
 * Based on JSLitmus.js, copyright Robert Kieffer
 * Modified by John-David Dalton
 * Modified by Microsoft
 * Available under MIT license
 */

import _ from "lodash";
import { BenchmarkRunningOptionsAsync, BenchmarkRunningOptionsSync } from "../Configuration";
import { defaults } from "../runBenchmark";

export interface Options {
	/**
	 * A flag to indicate that benchmark cycles will execute asynchronously
	 * by default.
	 */
	async?: boolean;
	/**
	 * A flag to indicate that the benchmark clock is deferred.
	 */
	defer?: boolean;

	/**
	 * The default number of times to execute a test on a benchmark's first cycle.
	 */
	initCount?: number;

	/**
	 * The maximum time a benchmark is allowed to run before finishing (secs).
	 *
	 * Note: Cycle delays aren't counted toward the maximum time.
	 */
	maxTime?: number;
	/**
	 * The minimum sample size required to perform statistical analysis.
	 */
	minSamples?: number;

	/**
	 * The time needed to reduce the percent uncertainty of measurement to 1% (secs).
	 */
	minTime?: number;

	/**
	 * An event listener called when the benchmark is aborted.
	 */
	onAbort?: () => void;

	/**
	 * An event listener called when the benchmark completes running.
	 */
	onComplete?: (event: Event) => void;
	/**
	 * An event listener called after each run cycle.
	 */
	onCycle?: (event: Event) => void;

	/**
	 * An event listener called when a test errors.
	 */
	onError?: () => void;
	/**
	 * An event listener called when the benchmark is reset.
	 */
	onReset?: () => void;

	setup?: () => void;

	teardown?: () => void;

	fn: (deferred: { resolve: Mocha.Done }) => void | Promise<unknown>;

	queued?: boolean;
}

/**
 * @public
 */
export interface Stats {
	moe: number;
	rme: number;
	sem: number;
	deviation: number;
	mean: number;
	sample: number[];
	variance: number;
}

/**
 * @public
 */
export interface Times {
	cycle: number;
	elapsed: number;
	period: number;
	timeStamp: number;
}

export interface Result {
	count: number;
	cycles: number;
	hz: number;
	error: Error;
	aborted: boolean;

	stats: Stats;
	times: Times;
}

/** Used to detect primitive types. */
const rePrimitive = /^(?:boolean|number|string|undefined)$/;

/** Used to make every compiled test unique. */
let uidCounter = 0;

/** Used to avoid hz of Infinity. */
const divisors = {
	1: 4096,
	2: 512,
	3: 64,
	4: 8,
	5: 0,
};

/**
 * T-Distribution two-tailed critical values for 95% confidence.
 * For more info see http://www.itl.nist.gov/div898/handbook/eda/section3/eda3672.htm.
 */
const tTable = {
	1: 12.706,
	2: 4.303,
	3: 3.182,
	4: 2.776,
	5: 2.571,
	6: 2.447,
	7: 2.365,
	8: 2.306,
	9: 2.262,
	10: 2.228,
	11: 2.201,
	12: 2.179,
	13: 2.16,
	14: 2.145,
	15: 2.131,
	16: 2.12,
	17: 2.11,
	18: 2.101,
	19: 2.093,
	20: 2.086,
	21: 2.08,
	22: 2.074,
	23: 2.069,
	24: 2.064,
	25: 2.06,
	26: 2.056,
	27: 2.052,
	28: 2.048,
	29: 2.045,
	30: 2.042,
	infinity: 1.96,
};

export const defaultOptions = {
	async: false,
	defer: false,
	initCount: 1,
	maxTime: 5,
	minSamples: 5,
	minTime: 0, // Adjusted below after picking timer
};

/** Native method shortcuts. */
const floor = Math.floor;
const max = Math.max;
const pow = Math.pow;
const shift = [].shift;
const sqrt = Math.sqrt;

/** Used to access Node.js's high resolution timer. */
const processObject = isHostType(globalThis, "process") && globalThis.process;

/** Used to integrity check compiled tests. */
const uid = `uid${+_.now()}`;

/** Used to avoid infinite recursion when methods call each other. */
const calledBy: any = {};

/**
 * Timer object used by `clock()` and `Deferred#resolve`.
 *
 * TODO: better types, don't modify this after creating, ensure use works when not getting high res timer.
 *
 * @type Object
 */
export let timer: any = {
	/**
	 * The timer namespace object or constructor.
	 *
	 * @private
	 * @memberOf timer
	 * @type {Function|Object}
	 */
	ns: Date,

	/**
	 * Starts the deferred timer.
	 *
	 * @private
	 * @memberOf timer
	 * @param {Object} deferred - The deferred instance.
	 */
	start: null, // Lazy defined in `clock()`.

	/**
	 * Stops the deferred timer.
	 *
	 * @private
	 * @memberOf timer
	 * @param {Object} deferred - The deferred instance.
	 */
	stop: null, // Lazy defined in `clock()`.
};

/**
 * Subset of Benchmark type which is output data.
 * Json compatible.
 * @public
 */
export interface BenchmarkData {
	aborted: boolean;
	readonly error?: Error;
	readonly count: number;
	readonly cycles: number;
	readonly hz: number;

	readonly stats: Stats;
	readonly times: Times;
}

export class Benchmark implements BenchmarkData {
	/**
	 * The number of times a test was executed.
	 * @type number
	 */
	count: number = 0;

	/**
	 * The number of cycles performed while benchmarking.
	 * @type number
	 */
	cycles: number = 0;

	/**
	 * The number of executions per second.
	 * @type number
	 */
	hz: number = 0;

	/**
	 * The compiled test function.
	 * @type {Function|string}
	 */
	compiled!: Function;

	/**
	 * The error object if the test failed.
	 * @type Object
	 */
	error?: Error;

	/**
	 * The test to benchmark.
	 */
	fn!: (deferred: { resolve: Mocha.Done }) => void | Promise<unknown>;

	/**
	 * A flag to indicate if the benchmark is aborted.
	 * @type boolean
	 */
	aborted: boolean = false;

	/**
	 * A flag to indicate if the benchmark is running.
	 * @type boolean
	 */
	running: boolean = false;

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
	setup: () => void = _.noop;

	/**
	 * Compiled into the test and executed immediately **after** the test loop.
	 */
	teardown: () => void = _.noop;

	/**
	 * An object of stats including mean, margin or error, and standard deviation.
	 * @type Object
	 */
	stats: Stats = {
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
	times: Times = {
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

	options: Options;

	_timerId: any;
	initCount!: number;
	async: boolean | undefined;
	_original: any;
	defer: any;
	events: any;
	minTime: any;
	minSamples: any;
	maxTime!: number;

	constructor(options: Options) {
		this.options = {
			...defaultOptions,
			...options,
		};

		_.forOwn(this.options, (value, key) => {
			if (value != null) {
				// Add event listeners.
				if (/^on[A-Z]/.test(key)) {
					_.each(key.split(" "), (key) => {
						this.on(key.slice(2).toLowerCase(), value as Function);
					});
				} else if (!_.has(this, key)) {
					this[key] = cloneDeep(value);
				}
			}
		});

		this.stats = cloneDeep(this.stats) as Stats;
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
	run(options?: Options): Benchmark {
		const event = new Event("start");

		// Set `running` to `false` so `reset()` won't call `abort()`.
		this.running = false;
		this.reset();
		this.running = true;

		this.count = this.initCount;
		this.times.timeStamp = +_.now();
		this.emit(event);

		if (!event.cancelled) {
			const cycleOptions: CycleOptions = {
				async: options?.async ?? this.async,
			};

			// For clones created within `compute()`.
			if (this._original) {
				if (this.defer) {
					new Deferred(this);
				} else {
					cycle(this, cycleOptions);
				}
			}
			// For original benchmarks.
			else {
				compute(this, cycleOptions);
			}
		}
		return this;
	}

	/**
	 * Executes all registered listeners of the specified event type.
	 *
	 * @param {Object|string} type - The event type or object.
	 * @param {...*} [args] - Arguments to invoke the listener with.
	 * @returns {*} Returns the return value of the last listener executed.
	 */
	emit(type: object | string): any {
		let listeners;
		const event = new Event(type);
		const events = this.events;
		const args = ((arguments[0] = event), arguments);

		event.currentTarget ??= this;
		event.target ??= this;
		delete event.result;

		if (events && (listeners = _.has(events, event.type) && events[event.type])) {
			_.each(listeners.slice(), (listener) => {
				if ((event.result = listener.apply(this, args)) === false) {
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
	listeners(type: string): any[] {
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
	off(type: string, listener: Function): object {
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
	on(type: string, listener: Function): object {
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
	abort(): object {
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
	 * @param options - Options object to overwrite cloned options.
	 * @returns The new benchmark instance.
	 */
	clone(options?: Options): Benchmark {
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
	 * Reset properties and abort if running.
	 *
	 * @returns {Object} The benchmark instance.
	 */
	reset(): Benchmark {
		if (this.running && !calledBy.abort) {
			// No worries, `reset()` is called within `abort()`.
			calledBy.reset = true;
			this.abort();
			delete calledBy.reset;
			return this;
		}
		let event;
		let index = 0;
		const changes: any[] = [];
		const queue: any[] = [];

		// A non-recursive solution to check if properties have changed.
		// For more information see http://www.jslab.dk/articles/non.recursive.preorder.traversal.part4.
		let data = {
			destination: this,
			source: {
				...(cloneDeep(this.constructor.prototype) as any),
				...this.options,
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
		if (changes.length && (this.emit((event = new Event("reset"))), !event.cancelled)) {
			_.each(changes, (data) => {
				data.destination[data.key] = data.value;
			});
		}
		return this;
	}
}

class Deferred {
	/**
	 * @param benchmark - The cloned benchmark instance.
	 */
	constructor(public readonly benchmark: Benchmark) {
		clock(this);
	}

	/**
	 * Handles cycling/completing the deferred benchmark.
	 */
	resolve() {
		const clone = this.benchmark;
		const bench = clone._original;

		if (bench.aborted) {
			// cycle() -> clone cycle/complete event -> compute()'s invoked bench.run() cycle/complete.
			this.teardown();
			clone.running = false;
			cycle(this);
		} else if (++this.cycles < clone.count) {
			clone.compiled.call(this, globalThis, timer);
		} else {
			timer.stop(this);
			this.teardown();
			// eslint-disable-next-line @typescript-eslint/no-floating-promises
			nextTick(() => {
				cycle(this);
			});
		}
	}
	teardown() {
		throw new Error("Method not implemented.");
	}

	/**
	 * The number of deferred cycles performed while benchmarking.
	 * @type number
	 */
	cycles: number = 0;

	/**
	 * The time taken to complete the deferred benchmark (secs).
	 * @type number
	 */
	elapsed: number = 0;

	/**
	 * @type number
	 */
	timeStamp: number = 0;
}

export class Event {
	/**
	 * A flag to indicate if the emitters listener iteration is aborted.
	 * @type boolean
	 */
	aborted: boolean = false;

	/**
	 * A flag to indicate if the default action is cancelled.
	 * @type boolean
	 */
	cancelled: boolean = false;

	/**
	 * The object whose listeners are currently being processed.
	 * @type Object
	 */
	currentTarget?: object = undefined;

	/**
	 * The return value of the last executed listener.
	 * @type Mixed
	 */
	result: any = undefined;

	/**
	 * The object to which the event was originally emitted.
	 * @type Object
	 */
	target?: object = undefined;

	/**
	 * A timestamp of when the event was created (ms).
	 * @type number
	 */
	timeStamp: number = 0;

	/**
	 * The event type.
	 * @type string
	 */
	type: string = "";

	/**
	 * The Event constructor.
	 * @param {Object|string} type - The event type.
	 */
	constructor(type: object | string) {
		if (type instanceof Event) {
			return type;
		}
		this.timeStamp = +_.now();
		Object.assign(this, typeof type == "string" ? { type } : type);
	}
}

/**
 * A specialized version of `_.cloneDeep` which only clones arrays and plain
 * objects assigning all other values by reference.
 *
 * @param {*} value - The value to clone.
 * @returns {*} The cloned value.
 */
const cloneDeep = _.partial(_.cloneDeepWith, _, (value) => {
	// Only clone primitives, arrays, and plain objects.
	if (!Array.isArray(value) && !_.isPlainObject(value)) {
		return value;
	}
});

const dummyPromise = Promise.resolve();

/**
 * Execute a call back on the next possible cycle
 * @param callback - a callback that will get execute in the promise next cycle
 * @returns A promise for completion of the callback
 */
const nextTick = async (callback: () => void): Promise<void> => dummyPromise.then(callback);

/**
 * Gets the name of the first argument from a function's source.
 *
 * @param {Function} fn - The function.
 * @returns {string} The argument name.
 */
function getFirstArgument(fn: Function): string {
	return (
		(!_.has(fn, "toString") && (/^[\s(]*function[^(]*\(([^\s,)]+)/.exec(fn as any) || 0)[1]) ||
		""
	);
}

/**
 * Computes the arithmetic mean of a sample.
 *
 * @param {Array} sample - The sample.
 * @returns {number} The mean.
 */
function getMean(sample: number[]): number {
	const v = _.reduce(sample, (sum: number, x: number) => {
		return sum + x;
	}) as number;
	return v / sample.length || 0;
}

/**
 * Host objects can return type values that are different from their actual
 * data type. The objects we are concerned with usually return non-primitive
 * types of "object", "function", or "unknown".
 *
 * @param {*} object - The owner of the property.
 * @param {string} property - The property to check.
 * @returns {boolean} Returns `true` if the property value is a non-primitive, else `false`.
 */
function isHostType(object: any, property: string): boolean {
	if (object == null) {
		return false;
	}
	const type = typeof object[property];
	return !rePrimitive.test(type) && (type !== "object" || !!object[property]);
}

interface InvokeOptions {
	args: { async: boolean };
	queued: true;
	onCycle: (event: Event) => void;
	onComplete: (event: Event) => void;
}

/**
 * Invokes a method on all items in an array.
 *
 * @static
 * @memberOf Benchmark
 * @param {Array} benches - Array of benchmarks to iterate over.
 * @param options2 - options object.
 * @param {...*} [args] - Arguments to invoke the method with.
 * @returns {Array} A new array of values returned from each method invoked.
 */
function invoke(benches: Benchmark[], options: InvokeOptions): any[] {
	let args;
	let bench: Benchmark;
	let index: number | boolean = -1;
	const eventProps: any = { currentTarget: benches };
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
		result[index as number] = bench.run(...args);
		// If synchronous return `true` until finished.
		return !async && getNext();
	}

	/**
	 * Fetches the next bench or executes `onComplete` callback.
	 */
	function getNext(event?: any) {
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
		options.onCycle?.call(benches, cycleEvent);

		// Choose next benchmark if not exiting early.
		if (!cycleEvent.aborted && raiseIndex() !== false) {
			bench = queued ? benches[0] : result[index as number];
			if (isAsync(bench)) {
				// eslint-disable-next-line @typescript-eslint/no-floating-promises
				nextTick(execute);
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
			options.onComplete?.call(benches, new Event(eventProps));
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
	function isAsync(object: Benchmark) {
		return object.defer;
	}

	/**
	 * Raises `index` to the next defined index or returns `false`.
	 */
	function raiseIndex() {
		(index as number)++;

		// If queued remove the previous bench.
		if (queued && (index as number) > 0) {
			shift.call(benches);
		}
		// If we reached the last index then return `false`.
		return (queued ? benches.length : (index as number) < result.length)
			? index
			: (index = false);
	}

	args = Array.isArray((args = "args" in options ? options.args : [])) ? args : [args];
	const queued = options.queued;

	// Start iterating over the array.
	if (raiseIndex() !== false) {
		// Emit "start" event.
		bench = result[index];
		eventProps.type = "start";
		eventProps.target = bench;

		// Start method execution.
		if (isAsync(bench)) {
			// eslint-disable-next-line @typescript-eslint/no-floating-promises
			nextTick(execute);
		} else {
			while (execute()) {}
		}
	}
	return result;
}

const templateData: any = {};
const timers = [{ ns: timer.ns, res: max(0.0015, getRes("ms")), unit: "ms" }];

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
if (!defaultOptions.minTime) {
	defaultOptions.minTime = max(timer.res / 2 / 0.01, 0.05);
}

/**
 * Clocks the time taken to execute a test per cycle (secs).
 *
 * @param {Object} bench - The benchmark instance.
 * @returns {number} The time taken.
 */
function clock(clone: Benchmark | Deferred) {
	let deferred: Deferred | undefined;

	if (clone instanceof Deferred) {
		deferred = clone;
		clone = deferred.benchmark;
	}
	const bench = clone._original;
	const count = (bench.count = clone.count);
	let result = 0;

	// Init `minTime` if needed.
	clone.minTime =
		bench.minTime || (bench.minTime = bench.options.minTime = defaultOptions.minTime);

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

	let compiled = (bench.compiled = clone.compiled = createCompiled(bench, deferred, funcBody));

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
		} catch (e: any) {
			bench.count = count;
			if (!clone.error) {
				clone.error = e ?? new Error(String(e));
			}
		}
	}
	// If no errors run the full test loop.
	if (!clone.error) {
		compiled = bench.compiled = clone.compiled = createCompiled(bench, deferred, funcBody);
		result = compiled.call(deferred || bench, globalThis, timer).elapsed;
	}
	return result;
}

/**
 * Computes stats on benchmark results.
 *
 * @param bench - The benchmark instance.
 * @param options - The options object.
 */
function compute(bench: Benchmark, options: CycleOptions) {
	const async = options.async;
	let elapsed = 0;
	const initCount = bench.initCount;
	const minSamples = bench.minSamples;
	const queue: any[] = [];
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
	function update(this: Benchmark, event) {
		const type = event.type;

		if (bench.running) {
			if (type === "start") {
				// Note: `clone.minTime` prop is inited in `clock()`.
				this.count = bench.initCount;
			} else {
				if (type === "error") {
					bench.error = this.error;
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
			this.events.abort.length = 0;
			this.abort();
		}
	}

	/**
	 * Determines if more clones should be queued or if cycling should stop.
	 */
	function evaluate(event: Event) {
		const clone = event.target as Benchmark;
		let done = bench.aborted;
		const now = +_.now();
		let size = sample.push(clone.times.period);
		let maxedOut =
			size >= minSamples && (elapsed += now - clone.times.timeStamp) / 1e3 > bench.maxTime;
		const times = bench.times;

		// Exit early for aborted or unclockable tests.
		if (done || clone.hz === Infinity) {
			maxedOut = !(size = sample.length = queue.length = 0);
		}

		if (!done) {
			bench.stats = computeStats(sample);

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
				bench.hz = 1 / bench.stats.mean;
				times.cycle = bench.stats.mean * bench.count;
				times.period = bench.stats.mean;
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
		args: { async: async === true },
		queued: true,
		onCycle: evaluate,
		onComplete() {
			bench.emit("complete");
		},
	});
}

export function computeStats(sample: number[]): Stats {
	const size = sample.length;
	// Compute the sample mean (estimate of the population mean).
	const mean = getMean(sample);
	// Compute the sample variance (estimate of the population variance).
	const varOf = function (sum, x) {
		return sum + pow(x - mean, 2);
	};
	const variance = _.reduce(sample, varOf, 0) / (size - 1) || 0;
	// Compute the sample standard deviation (estimate of the population standard deviation).
	const sd = sqrt(variance);
	// Compute the standard error of the mean (a.k.a. the standard deviation of the sampling distribution of the sample mean).
	const sem = sd / sqrt(size);
	// Compute the degrees of freedom.
	const df = size - 1;
	// Compute the critical value.
	const critical = tTable[Math.round(df) || 1] || tTable.infinity;
	// Compute the margin of error.
	const moe = sem * critical;
	// Compute the relative margin of error.
	const rme = (moe / mean) * 100 || 0;

	const stats: Stats = {
		deviation: sd,
		mean,
		moe,
		rme,
		sem,
		variance,
		sample,
	};
	return stats;
}

interface CycleOptions {
	async?: boolean;
}

/**
 * Cycles a benchmark until a run `count` can be established.
 *
 * @param {Object} clone - The cloned benchmark instance.
 * @param {Object} options - The options object.
 */
function cycle(clone: Benchmark | Deferred, options?: CycleOptions) {
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
	const async = options.async;
	const bench = clone._original;
	let count = clone.count;
	const times = clone.times;

	// Continue, if not aborted between cycles.
	if (clone.running) {
		// `minTime` is set to `defaultOptions.minTime` in `clock()`.
		cycles = ++clone.cycles;
		clocked = deferred ? deferred.elapsed : (clock as any)(clone);
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
		const period = (bench.times.period = times.period = clocked / count);
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
			(clone.compiled as any).call(deferred, globalThis, timer);
		} else if (async) {
			// eslint-disable-next-line @typescript-eslint/no-floating-promises
			nextTick(() => {
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

/**
 * Gets the current timer's minimum resolution (secs).
 */
function getRes(unit: string) {
	let measured;
	let begin;
	let count = 30;
	let divisor = 1e3;
	const ns = timer.ns;
	const sample: number[] = [];

	// Get average smallest measurable time.
	while (count--) {
		if (unit === "us") {
			divisor = 1e6;
			if (ns.stop) {
				ns.start();
				while (!(measured = ns.microseconds())) {}
			} else {
				begin = ns();
				while (!(measured = ns() - begin)) {}
			}
		} else if (unit === "ns") {
			divisor = 1e9;
			begin = (begin = ns())[0] + begin[1] / divisor;
			while (!(measured = (measured = ns())[0] + measured[1] / divisor - begin)) {}
			divisor = 1;
		} else if (ns.now) {
			begin = +ns.now();
			while (!(measured = +ns.now() - begin)) {}
		} else {
			begin = new ns().getTime();
			while (!(measured = new ns().getTime() - begin)) {}
		}
		// Check for broken timers.
		if (measured > 0) {
			sample.push(measured);
		} else {
			sample.push(Infinity);
			break;
		}
	}
	// Convert to seconds.
	return getMean(sample) / divisor;
}

/**
 * Interpolates a given template string.
 */
function interpolate(string) {
	// Replaces all occurrences of `#` with a unique number and template tokens with content.
	return _.template(string.replace(/#/g, /\d+/.exec(templateData.uid)))(templateData);
}

/**
 * Creates a compiled function from the given function `body`.
 */
function createCompiled(bench: Benchmark, deferred: Deferred | undefined, body: string) {
	const fn = bench.fn;
	const fnArg = deferred ? getFirstArgument(fn) || "deferred" : "";

	templateData.uid = uid + uidCounter++;

	Object.assign(templateData, {
		setup: interpolate("m#.setup()"),
		fn: interpolate(`m#.fn(${fnArg})`),
		fnArg,
		teardown: interpolate("m#.teardown()"),
	});

	// Use API of chosen timer.
	if (timer.unit === "ns") {
		Object.assign(templateData, {
			begin: interpolate("s#=n#()"),
			end: interpolate("r#=n#(s#);r#=r#[0]+(r#[1]/1e9)"),
		});
	} else if (timer.unit === "us") {
		if (timer.ns.stop) {
			Object.assign(templateData, {
				begin: interpolate("s#=n#.start()"),
				end: interpolate("r#=n#.microseconds()/1e6"),
			});
		} else {
			Object.assign(templateData, {
				begin: interpolate("s#=n#()"),
				end: interpolate("r#=(n#()-s#)/1e6"),
			});
		}
	} else if (timer.ns.now) {
		Object.assign(templateData, {
			begin: interpolate("s#=(+n#.now())"),
			end: interpolate("r#=((+n#.now())-s#)/1e3"),
		});
	} else {
		Object.assign(templateData, {
			begin: interpolate("s#=new n#().getTime()"),
			end: interpolate("r#=(new n#().getTime()-s#)/1e3"),
		});
	}
	// Define `timer` methods.
	timer.start = Function(
		interpolate("o#"),
		interpolate("var n#=this.ns,${begin};o#.elapsed=0;o#.timeStamp=s#"),
	);

	timer.stop = Function(
		interpolate("o#"),
		interpolate("var n#=this.ns,s#=o#.timeStamp,${end};o#.elapsed=r#"),
	);

	// Create compiled test.
	return Function(
		interpolate("window,t#"),
		`var global = window, clearTimeout = global.clearTimeout, setTimeout = global.setTimeout;\n${interpolate(
			body,
		)}`,
	);
}

/**
 * Run a performance benchmark and return its results.
 *
 * Here is how benchmarking works:
 *
 * ```
 *  For each benchmark
 *      For each sampled run
 *          // Run fn once to check for errors
 *          fn()
 *          // Run fn multiple times and measure results.
 *          for each Benchmark.count
 *              fn()
 * ```
 *
 * For the first few sampled runs, the benchmarking library is in an analysis phase. It uses these sample runs to
 * determine an iteration number that his at most 1% statistical uncertainty. It does this by incrementally increasing
 * the iterations until it hits a low uncertainty point.
 *
 * Optionally, setup and teardown functions can be provided via the `before` and `after` options.
 *
 * @public
 */
export function runBenchmarkSync(args: BenchmarkRunningOptionsSync): BenchmarkData {
	const timeStamp = +_.now();

	const options = {
		...defaults,
		...args,
	};

	// Run a garbage collection, if possible, before the test.
	// This helps noise from allocations before the test (ex: from previous tests or startup) from
	// impacting the test.
	global?.gc?.();

	let count = 1;

	while (
		doBatch(count, options.benchmarkFn, options.onCycle) < options.minSampleDurationSeconds
	) {
		count *= 2;
	}

	const samples: number[] = [];
	let totalTime = 0;
	while (
		samples.length < options.minSampleCount ||
		// TODO: exit before this if enough confidence is reached. (But what about low frequency noise?)
		totalTime < options.maxBenchmarkDurationSeconds
	) {
		const sample = doBatch(count, options.benchmarkFn, options.onCycle);
		totalTime += sample;
		samples.push(sample);
		// Exit if way too many samples to avoid out of memory.
		if (samples.length > 1000000) {
			break;
		}
	}
	return computeData(samples, count, timeStamp);
}

/**
 * Returns time to run `f` `count` times in seconds.
 */
function doBatch(
	count: number,
	f: () => void,
	onCycle: undefined | ((event: unknown) => void),
): number {
	let i = count;
	const n = timer.ns;
	const before: [number, number] = n();
	while (i--) {
		f();
	}
	const elapsed: [number, number] = n(before);
	onCycle?.(0);
	return elapsed[0] + elapsed[1] / 1e9;
}

/**
 * Run a performance benchmark and return its results.
 *
 * Here is how benchmarking works:
 *
 * ```
 *  For each benchmark
 *      For each sampled run
 *          // Run fn once to check for errors
 *          fn()
 *          // Run fn multiple times and measure results.
 *          for each Benchmark.count
 *              fn()
 * ```
 *
 * For the first few sampled runs, the benchmarking library is in an analysis phase. It uses these sample runs to
 * determine an iteration number that his at most 1% statistical uncertainty. It does this by incrementally increasing
 * the iterations until it hits a low uncertainty point.
 *
 * Optionally, setup and teardown functions can be provided via the `before` and `after` options.
 *
 * @public
 */
export async function runBenchmarkAsync(
	args: BenchmarkRunningOptionsAsync,
): Promise<BenchmarkData> {
	const timeStamp = +_.now();

	const options = {
		...defaults,
		...args,
	};

	// Run a garbage collection, if possible, before the test.
	// This helps noise from allocations before the test (ex: from previous tests or startup) from
	// impacting the test.
	global?.gc?.();

	let count = 1;

	// TODO: use consider using benchmark's algorithm for this.
	while (
		(await doBatchAsync(count, options.benchmarkFnAsync, options.onCycle)) <
		options.minSampleDurationSeconds
	) {
		count *= 2;
	}

	const samples: number[] = [];
	let totalTime = 0;
	while (
		samples.length < options.minSampleCount ||
		// TODO: exit before this if enough confidence is reached. (But what about low frequency noise?)
		totalTime < options.maxBenchmarkDurationSeconds
	) {
		const sample = await doBatchAsync(count, options.benchmarkFnAsync, options.onCycle);
		totalTime += sample;
		samples.push(sample);
		// Exit if way too many samples to avoid out of memory.
		if (samples.length > 1000000) {
			break;
		}
	}
	return computeData(samples, count, timeStamp);
}

/**
 * Returns time to run `f` `count` times in seconds.
 */
async function doBatchAsync(
	count: number,
	f: () => Promise<unknown>,
	onCycle: undefined | ((event: unknown) => void),
): Promise<number> {
	let i = count;
	const n = timer.ns;
	const before: [number, number] = n();
	while (i--) {
		await f();
	}
	const elapsed: [number, number] = n(before);
	onCycle?.(0);
	return elapsed[0] + elapsed[1] / 1e9;
}

function computeData(samples: number[], count: number, timeStamp: number): BenchmarkData {
	const now = +_.now();
	const stats: Stats = computeStats(samples.map((v) => v / count));
	const data: BenchmarkData = {
		hz: 1 / stats.mean,
		times: {
			cycle: stats.mean * count,
			period: stats.mean,
			elapsed: (now - timeStamp) / 1e3,
			timeStamp,
		},
		aborted: false,
		cycles: samples.length,
		stats,
		count,
	};
	return data;
}
