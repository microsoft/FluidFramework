/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/ban-types */
// Type definitions for Benchmark v2.1.4
// Project: https://benchmarkjs.com
// Definitions by: Asana <https://asana.com>
//                 Charlie Fish <https://github.com/fishcharlie>
//                 Blair Zajac <https://github.com/blair>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped

declare class Benchmark {
	constructor(options: Benchmark.Options);

	id: number;
	name?: string;
	count: number;
	cycles: number;
	hz: number;
	compiled: Function | string;
	error: Error;
	fn: Function | string;
	aborted: boolean;
	running: boolean;
	setup: Function | string;
	teardown: Function | string;

	stats: Benchmark.Stats;
	times: Benchmark.Times;

	abort(): Benchmark;
	clone(options: Benchmark.Options): Benchmark;
	compare(benchmark: Benchmark): number;
	emit(type: string | Object): any;
	listeners(type: string): Function[];
	off(type?: string, listener?: Function): Benchmark;
	off(types: string[]): Benchmark;
	on(type?: string, listener?: Function): Benchmark;
	on(types: string[]): Benchmark;
	reset(): Benchmark;
	run(options?: Benchmark.Options): Benchmark;
	toString(): string;
}

declare namespace Benchmark {
	export interface Options {
		async?: boolean | undefined;
		defer?: boolean | undefined;
		delay?: number | undefined;
		id?: string | undefined;
		initCount?: number | undefined;
		maxTime?: number | undefined;
		minSamples?: number | undefined;
		minTime?: number | undefined;
		name?: string | undefined;
		onAbort?: Function | undefined;
		onComplete?: Function | undefined;
		onCycle?: Function | undefined;
		onError?: Function | undefined;
		onReset?: Function | undefined;
		onStart?: Function | undefined;
		setup?: Function | string | undefined;
		teardown?: Function | string | undefined;
		fn?: Function | string | undefined;
		queued?: boolean | undefined;
	}

	export interface Stats {
		moe: number;
		rme: number;
		sem: number;
		deviation: number;
		mean: number;
		sample: any[];
		variance: number;
	}

	export interface Times {
		cycle: number;
		elapsed: number;
		period: number;
		timeStamp: number;
	}

	export class Deferred {
		constructor(clone: Benchmark);

		benchmark: Benchmark;
		cycles: number;
		elapsed: number;
		timeStamp: number;

		resolve(): void;
	}

	export interface Target {
		options: Options;
		async?: boolean | undefined;
		defer?: boolean | undefined;
		delay?: number | undefined;
		initCount?: number | undefined;
		maxTime?: number | undefined;
		minSamples?: number | undefined;
		minTime?: number | undefined;
		name?: string | undefined;
		fn?: Function | undefined;
		id: number;
		stats?: Stats | undefined;
		times?: Times | undefined;
		running: boolean;
		count?: number | undefined;
		compiled?: Function | undefined;
		cycles?: number | undefined;
		hz?: number | undefined;
	}

	export class Event {
		constructor(type: string | Object);

		aborted: boolean;
		cancelled: boolean;
		currentTarget: Object;
		result: any;
		target: Target;
		timeStamp: number;
		type: string;
	}
}

export = Benchmark;
