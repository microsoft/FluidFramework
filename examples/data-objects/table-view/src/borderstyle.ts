/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const enum StyleIndex {
	Near = 0,
	Middle = 1,
	Far = 2,
}

export class BorderRect {
	public get min() {
		return [Math.min(this.start[0], this.end[0]), Math.min(this.start[1], this.end[1])];
	}
	public get max() {
		return [Math.max(this.start[0], this.end[0]), Math.max(this.start[1], this.end[1])];
	}

	public start = [NaN, NaN];
	public end = [NaN, NaN];
	constructor(private readonly styles: string[][]) {}

	public reset() {
		this.start = [NaN, NaN];
		this.end = [NaN, NaN];
	}

	public intersect(row: number, col: number) {
		const min = this.min;
		const max = this.max;
		return this.inRange(min[0], row, max[0]) && this.inRange(min[1], col, max[1]);
	}

	public getStyle(row: number, col: number) {
		if (!this.intersect(row, col)) {
			return "";
		}

		const min = this.min;
		const max = this.max;
		const vert = this.getStyleIndices(min[0], row, max[0]);
		const horiz = this.getStyleIndices(min[1], col, max[1]);
		return vert.reduce((vertAccum, vertIndex) => {
			const vertStyles = this.styles[vertIndex];
			return horiz.reduce(
				(horizAccum, horizIndex) => `${horizAccum} ${vertStyles[horizIndex]}`,
				vertAccum,
			);
		}, "");
	}

	private inRange(min: number, value: number, max: number) {
		return min <= value && value <= max;
	}

	private getStyleIndices(min: number, value: number, max: number) {
		const styles: number[] = [];
		if (value === min) {
			styles.push(StyleIndex.Near);
		}
		if (value === max) {
			styles.push(StyleIndex.Far);
		}
		if (styles.length === 0) {
			styles.push(StyleIndex.Middle);
		}
		return styles;
	}
}
