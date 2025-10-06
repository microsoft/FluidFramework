/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SequenceEvent } from "@fluidframework/sequence/legacy";

import { emptyObject } from "../util/index.js";

import { Layout } from "./layout.js";

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IFormatterState {}

export abstract class Formatter<TState extends IFormatterState> {
	public abstract begin(
		layout: Layout,
		init: Readonly<Partial<TState>>,
		prevState: Readonly<TState> | undefined,
	): Readonly<TState>;

	public abstract visit(
		layout: Layout,
		state: Readonly<TState>,
	): { consumed: boolean; state: Readonly<TState> };

	public abstract end(layout: Layout, state: Readonly<TState>);

	public toString() {
		return this.constructor.name;
	}
}

export abstract class RootFormatter<TState extends IFormatterState> extends Formatter<TState> {
	public abstract onChange(layout: Layout, e: SequenceEvent);

	public prepare(layout: Layout, start: number, end: number) {
		return { start, end };
	}
}

export class BootstrapFormatter<
	TFormatter extends RootFormatter<TState>,
	TState extends IFormatterState,
> extends RootFormatter<IFormatterState> {
	constructor(private readonly formatter: Readonly<TFormatter>) {
		super();
	}

	public begin(): never {
		throw new Error();
	}

	public visit(layout: Layout, state: Readonly<IFormatterState>) {
		layout.pushFormat(this.formatter, emptyObject);
		return { state, consumed: false };
	}

	public end(): never {
		throw new Error();
	}

	public onChange(layout: Layout, e: SequenceEvent) {
		this.formatter.onChange(layout, e);
	}
	public prepare(layout: Layout, start: number, end: number) {
		return this.formatter.prepare(layout, start, end);
	}
}
