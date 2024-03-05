/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IInkStroke } from "./interfaces.js";

/**
 * Ink snapshot interface.
 */
export interface ISerializableInk {
	/**
	 * Collection of ink strokes.
	 */
	strokes: IInkStroke[];

	/**
	 * Stores a mapping from the provided key to its index in strokes. Since
	 * ISerializableInk is serialized we need to use an index.
	 */
	strokeIndex: { [key: string]: number };
}

/**
 * Maintains a live record of the data that can be used for snapshotting.
 */
export class InkData {
	/**
	 * {@inheritDoc ISerializableInk.strokes}
	 */
	private strokes: IInkStroke[];

	/**
	 * {@inheritDoc ISerializableInk.strokeIndex}
	 */
	private strokeIndex: { [key: string]: number };

	/**
	 * Construct a new InkData.
	 * @param snapshot - Existing data to initialize with
	 */
	constructor(snapshot?: ISerializableInk) {
		this.strokes = snapshot?.strokes ?? [];
		this.strokeIndex = snapshot?.strokeIndex ?? {};
	}

	/**
	 * {@inheritDoc IInk.getStrokes}
	 */
	public getStrokes(): IInkStroke[] {
		return this.strokes;
	}

	/**
	 * {@inheritDoc IInk.getStroke}
	 */
	public getStroke(key: string): IInkStroke {
		return this.strokes[this.strokeIndex[key]];
	}

	/**
	 * Clear all stored data.
	 */
	public clear(): void {
		this.strokes = [];
		this.strokeIndex = {};
	}

	/**
	 * Add the given stroke to the stored data.
	 * @param stroke - The stroke to add
	 */
	public addStroke(stroke: IInkStroke): void {
		this.strokes.push(stroke);
		this.strokeIndex[stroke.id] = this.strokes.length - 1;
	}

	/**
	 * Get a JSON-compatible representation of the stored data.
	 * @returns The JSON-compatible object
	 */
	public getSerializable(): ISerializableInk {
		return {
			strokes: this.strokes,
			strokeIndex: this.strokeIndex,
		};
	}
}
