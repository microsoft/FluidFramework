/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import { PositionMap } from "./positionMap.js";

interface Block {
	readonly start: number;
	readonly end: number;
	readonly map: PositionMap;
	readonly children?: readonly [Block, Block];
}

/**
 * A forest of power-of-two history blocks.
 * Appending merges equally sized trailing blocks, so each change participates in at most
 * logarithmically many compositions over an append-only history.
 * Prefix trimming and suffix replacement reuse existing subtrees.
 */
export class PositionHistory {
	private blocks: Block[] = [];
	public start = 0;
	public end = 0;

	public append(map: PositionMap): void {
		let block: Block = { start: this.end, end: ++this.end, map };
		while (this.blocks.length > 0) {
			const last = this.blocks[this.blocks.length - 1];
			assert(last !== undefined, "Expected a trailing history block");
			if (last.end - last.start !== block.end - block.start) {
				break;
			}
			this.blocks.pop();
			block = {
				start: last.start,
				end: block.end,
				map: PositionMap.compose(last.map, block.map),
				children: [last, block],
			};
		}
		this.blocks.push(block);
	}

	public trim(end: number): void {
		assert(this.start <= end && end <= this.end, "Invalid position-history prefix");
		this.blocks = this.range(end, this.end);
		this.start = end;
	}

	public truncate(start: number): void {
		assert(this.start <= start && start <= this.end, "Invalid position-history suffix");
		this.blocks = this.range(this.start, start);
		this.end = start;
	}

	public maps(start: number): readonly PositionMap[] {
		return this.range(start, this.end).map((block) => block.map);
	}

	private range(start: number, end: number): Block[] {
		assert(
			this.start <= start && start <= end && end <= this.end,
			"Invalid position-history range",
		);
		const result: Block[] = [];
		const visit = (block: Block): void => {
			if (block.end <= start || block.start >= end) {
				return;
			}
			if (start <= block.start && block.end <= end) {
				result.push(block);
				return;
			}
			assert(
				block.children !== undefined,
				"A partially selected history block must have children",
			);
			visit(block.children[0]);
			visit(block.children[1]);
		};
		for (const block of this.blocks) {
			visit(block);
		}
		return result;
	}
}
