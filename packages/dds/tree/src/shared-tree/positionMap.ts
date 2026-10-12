/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import type {
	DeltaRoot,
	DeltaFieldMap,
	DeltaDetachedNodeId,
	FieldKey,
} from "../core/index.js";
import { brand } from "../util/index.js";

/**
 * Paths in a position map are immutable and relative to that map's input or output state.
 */
export type PositionNodePath = readonly { readonly field: FieldKey; readonly index: number }[];
export interface PositionFieldPath {
	readonly parent: PositionNodePath;
	readonly field: FieldKey;
}
export interface FieldPosition {
	readonly field: PositionFieldPath;
	readonly index: number;
}

/**
 * A piece maps integer indices in [start, end) either by translation or to a constant.
 * An absent destination represents deleted content.
 */
interface Piece {
	readonly start: number;
	readonly end: number;
	readonly field: PositionFieldPath | undefined;
	readonly offset: number;
	readonly constant?: number;
}
interface FieldMapping {
	readonly field: PositionFieldPath;
	readonly nodes: readonly Piece[];
	readonly before: readonly Piece[];
	readonly after: readonly Piece[];
	readonly lengthDelta: number;
}

function key(field: PositionFieldPath): string {
	return JSON.stringify([field.parent, field.field]);
}

function findPiece(pieces: readonly Piece[], index: number): Piece {
	let low = 0;
	let high = pieces.length;
	while (low + 1 < high) {
		const middle = Math.floor((low + high) / 2);
		const candidate = pieces[middle];
		assert(candidate !== undefined, "Expected a position-map interval");
		if (candidate.start <= index) {
			low = middle;
		} else {
			high = middle;
		}
	}
	const piece = pieces[low];
	assert(
		piece !== undefined && piece.start <= index && index < piece.end,
		"Missing position-map interval",
	);
	return piece;
}

function evaluate(piece: Piece, index: number): FieldPosition | undefined {
	return piece.field === undefined
		? undefined
		: { field: piece.field, index: piece.constant ?? index + piece.offset };
}

function appendPiece(pieces: Piece[], piece: Piece): void {
	if (piece.end <= piece.start) {
		return;
	}
	const last = pieces[pieces.length - 1];
	if (
		last?.end === piece.start &&
		last.offset === piece.offset &&
		last.constant === piece.constant &&
		(last.field === piece.field ||
			(last.field !== undefined &&
				piece.field !== undefined &&
				key(last.field) === key(piece.field)))
	) {
		pieces[pieces.length - 1] = { ...last, end: piece.end };
	} else {
		pieces.push(piece);
	}
}

/**
 * A sparse mapping of changed fields. Unlisted fields retain their contents but can move with their parent.
 */
class DirectionalMap {
	public constructor(public readonly fields: ReadonlyMap<string, FieldMapping>) {}

	public node(path: PositionNodePath): PositionNodePath | undefined {
		if (path.length === 0) {
			return path;
		}
		const last = path[path.length - 1];
		assert(last !== undefined, "Expected a node path step");
		const position = this.point(
			{ parent: path.slice(0, -1), field: last.field },
			last.index,
			"nodes",
		);
		return position === undefined
			? undefined
			: [...position.field.parent, { field: position.field.field, index: position.index }];
	}

	public field(field: PositionFieldPath): PositionFieldPath | undefined {
		const parent = this.node(field.parent);
		return parent === undefined ? undefined : { parent, field: field.field };
	}

	public point(
		field: PositionFieldPath,
		index: number,
		mode: "nodes" | "before" | "after",
	): FieldPosition | undefined {
		const mapping = this.fields.get(key(field));
		if (mapping !== undefined) {
			return evaluate(findPiece(mapping[mode], index), index);
		}
		const destination = this.field(field);
		return destination === undefined ? undefined : { field: destination, index };
	}
}

function composePieces(
	pieces: readonly Piece[],
	second: DirectionalMap,
	mode: "nodes" | "before" | "after",
): Piece[] {
	const result: Piece[] = [];
	for (const piece of pieces) {
		if (piece.field === undefined) {
			appendPiece(result, piece);
			continue;
		}
		if (piece.constant !== undefined) {
			const destination = second.point(piece.field, piece.constant, mode);
			appendPiece(result, {
				start: piece.start,
				end: piece.end,
				field: destination?.field,
				offset: 0,
				...(destination === undefined ? {} : { constant: destination.index }),
			});
			continue;
		}
		const mapping = second.fields.get(key(piece.field));
		if (mapping === undefined) {
			appendPiece(result, { ...piece, field: second.field(piece.field) });
			continue;
		}
		let start = piece.start;
		while (start < piece.end) {
			const next = findPiece(mapping[mode], start + piece.offset);
			const end = Math.min(piece.end, next.end - piece.offset);
			appendPiece(result, {
				start,
				end,
				field: next.field,
				offset: next.constant === undefined ? piece.offset + next.offset : 0,
				...(next.constant === undefined ? {} : { constant: next.constant }),
			});
			start = end;
		}
	}
	return result;
}

function composeDirection(
	first: DirectionalMap,
	second: DirectionalMap,
	firstInverse: DirectionalMap,
): DirectionalMap {
	const fields = new Map<string, PositionFieldPath>();
	for (const [id, mapping] of first.fields) {
		fields.set(id, mapping.field);
	}
	for (const mapping of second.fields.values()) {
		const source = firstInverse.field(mapping.field);
		if (source !== undefined) {
			fields.set(key(source), source);
		}
	}
	const composed = new Map<string, FieldMapping>();
	for (const [id, field] of fields) {
		const firstMapping = first.fields.get(id);
		const middle = first.field(field);
		const identity: Piece[] = [{ start: 0, end: Infinity, field: middle, offset: 0 }];
		const secondMapping = middle === undefined ? undefined : second.fields.get(key(middle));
		composed.set(id, {
			field,
			nodes: composePieces(firstMapping?.nodes ?? identity, second, "nodes"),
			before: composePieces(firstMapping?.before ?? identity, second, "before"),
			after: composePieces(firstMapping?.after ?? identity, second, "after"),
			lengthDelta: (firstMapping?.lengthDelta ?? 0) + (secondMapping?.lengthDelta ?? 0),
		});
	}
	return new DirectionalMap(composed);
}

/**
 * Composable, bidirectional node maps and forward gap maps.
 * Composition preserves deletion collapse, even if later edits revive the deleted nodes.
 */
export class PositionMap {
	private constructor(
		private readonly forward: DirectionalMap,
		private readonly backward: DirectionalMap,
		public readonly supported: boolean = true,
	) {}

	public static readonly identity = new PositionMap(
		new DirectionalMap(new Map()),
		new DirectionalMap(new Map()),
	);
	public static readonly unsupported = new PositionMap(
		new DirectionalMap(new Map()),
		new DirectionalMap(new Map()),
		false,
	);

	public static compose(first: PositionMap, second: PositionMap): PositionMap {
		if (!first.supported || !second.supported) {
			return PositionMap.unsupported;
		}
		return new PositionMap(
			composeDirection(first.forward, second.forward, first.backward),
			composeDirection(second.backward, first.backward, second.forward),
		);
	}

	public static fromDelta(delta: DeltaRoot): PositionMap {
		const builder = new DeltaPositionMap(delta);
		return new PositionMap(builder.build(false), builder.build(true));
	}

	public sourceField(field: PositionFieldPath): PositionFieldPath | undefined {
		return this.backward.field(field);
	}

	public lengthDelta(source: PositionFieldPath): number {
		return this.forward.fields.get(key(source))?.lengthDelta ?? 0;
	}

	public resolve(
		position: FieldPosition,
		affinity: "before" | "after",
	): FieldPosition | undefined {
		return this.forward.point(position.field, position.index, affinity);
	}
}

interface RawPiece {
	readonly start: number;
	readonly end: number;
	readonly otherStart: number;
	readonly id?: DeltaDetachedNodeId;
	readonly detached: boolean;
	readonly after: number;
}
interface RawField {
	path: PositionFieldPath;
	readonly input: RawPiece[];
	readonly output: RawPiece[];
	readonly lengthDelta: number;
}
interface Endpoint {
	readonly field: RawField;
	readonly piece: RawPiece;
	readonly minor: number;
	readonly end: number;
}

/**
 * Indexes both sides of a delta before resolving destinations, so cross-field moves
 * do not depend on visitation order.
 */
class DeltaPositionMap {
	private readonly fields = new Map<string, RawField>();
	private readonly detaches = new Map<DeltaDetachedNodeId["major"], Endpoint[]>();
	private readonly attaches = new Map<DeltaDetachedNodeId["major"], Endpoint[]>();
	private readonly outputParents = new Map<RawField, PositionNodePath | undefined>();
	private readonly detachedRoots = new Map<FieldKey, DeltaDetachedNodeId["major"]>();

	public constructor(private readonly delta: DeltaRoot) {
		if (delta.fields !== undefined) {
			this.collect(delta.fields, []);
		}
		for (const global of delta.global ?? []) {
			const normalized = this.rename(global.id, 1)[0];
			assert(normalized !== undefined, "Expected a renamed detached root");
			const field: FieldKey = brand(
				`position-detached:${JSON.stringify(normalized.id.major ?? null)}`,
			);
			this.detachedRoots.set(field, normalized.id.major);
			this.collect(global.fields, [{ field, index: normalized.id.minor }]);
		}
		for (const endpoints of [this.detaches, this.attaches]) {
			for (const entries of endpoints.values()) {
				entries.sort((a, b) => a.minor - b.minor);
			}
		}
		// A global change can target a node detached elsewhere in this same delta.
		// Give it that node's input path; newly created or previously removed roots
		// keep a private detached path and can still receive moved content.
		const records = [...this.fields.values()];
		for (const record of records) {
			record.path = { parent: this.sourceNode(record.path.parent), field: record.path.field };
		}
		this.fields.clear();
		for (const record of records) {
			this.fields.set(key(record.path), record);
		}
	}

	private rename(
		id: DeltaDetachedNodeId,
		count: number,
		remaining = this.delta.rename ?? [],
	): { id: DeltaDetachedNodeId; count: number; offset: number }[] {
		for (let i = 0; i < remaining.length; i++) {
			const rename = remaining[i];
			assert(rename !== undefined, "Expected a detached-root rename");
			if (rename.oldId.major !== id.major) {
				continue;
			}
			const start = Math.max(id.minor, rename.oldId.minor);
			const end = Math.min(id.minor + count, rename.oldId.minor + rename.count);
			if (start >= end) {
				continue;
			}
			const rest = remaining.filter((_, index) => index !== i);
			const result: { id: DeltaDetachedNodeId; count: number; offset: number }[] = [];
			if (start > id.minor) {
				result.push(...this.rename(id, start - id.minor, rest));
			}
			// Renames are simultaneous: A -> B and B -> C move the original A to B,
			// not to C. Attach IDs already name the post-rename roots.
			result.push({
				id: { ...rename.newId, minor: rename.newId.minor + start - rename.oldId.minor },
				count: end - start,
				offset: start - id.minor,
			});
			if (end < id.minor + count) {
				for (const part of this.rename({ ...id, minor: end }, id.minor + count - end, rest)) {
					result.push({ ...part, offset: part.offset + end - id.minor });
				}
			}
			return result;
		}
		return [{ id, count, offset: 0 }];
	}

	private normalize(pieces: readonly RawPiece[]): RawPiece[] {
		return pieces.flatMap((piece) =>
			piece.id === undefined
				? [piece]
				: this.rename(piece.id, piece.end - piece.start).map((part) => ({
						...piece,
						start: piece.start + part.offset,
						end: piece.start + part.offset + part.count,
						id: part.id,
					})),
		);
	}

	private sourceNode(path: PositionNodePath): PositionNodePath {
		const root = path[0];
		if (root === undefined || !this.detachedRoots.has(root.field)) {
			return path;
		}
		const major = this.detachedRoots.get(root.field);
		const endpoint = this.endpointAt(this.detaches.get(major) ?? [], root.index);
		if (endpoint === undefined) {
			return path;
		}
		return [
			...this.sourceNode(endpoint.field.path.parent),
			{
				field: endpoint.field.path.field,
				index: endpoint.piece.start + root.index - endpoint.minor,
			},
			...path.slice(1),
		];
	}

	private collect(fields: DeltaFieldMap, parent: PositionNodePath): void {
		for (const [field, marks] of fields) {
			const path = { parent, field };
			const input: RawPiece[] = [];
			const output: RawPiece[] = [];
			let read = 0;
			let write = 0;
			for (const mark of marks.marks) {
				const consumes = mark.detach !== undefined || mark.attach === undefined;
				const produces = mark.attach !== undefined || mark.detach === undefined;
				if (mark.fields !== undefined) {
					this.collect(mark.fields, [...parent, { field, index: read }]);
				}
				if (consumes) {
					input.push({
						start: read,
						end: read + mark.count,
						otherStart: write,
						detached: mark.detach !== undefined,
						...(mark.detach === undefined ? {} : { id: mark.detach }),
						after: write + (mark.attach === undefined ? 0 : mark.count),
					});
				}
				if (produces) {
					output.push({
						start: write,
						end: write + mark.count,
						otherStart: read,
						detached: mark.attach !== undefined,
						...(mark.attach === undefined ? {} : { id: mark.attach }),
						after: read + (mark.detach === undefined ? 0 : mark.count),
					});
				}
				read += consumes ? mark.count : 0;
				write += produces ? mark.count : 0;
			}
			input.push({
				start: read,
				end: Infinity,
				otherStart: write,
				detached: false,
				after: write,
			});
			output.push({
				start: write,
				end: Infinity,
				otherStart: read,
				detached: false,
				after: read,
			});
			const record = {
				path,
				input: this.normalize(input),
				output,
				lengthDelta: write - read,
			};
			this.fields.set(key(path), record);
			this.register(record, record.input, this.detaches);
			this.register(record, record.output, this.attaches);
		}
	}

	private register(
		field: RawField,
		pieces: readonly RawPiece[],
		map: Map<DeltaDetachedNodeId["major"], Endpoint[]>,
	): void {
		for (const piece of pieces) {
			if (piece.id !== undefined) {
				let entries = map.get(piece.id.major);
				if (entries === undefined) {
					entries = [];
					map.set(piece.id.major, entries);
				}
				entries.push({
					field,
					piece,
					minor: piece.id.minor,
					end: piece.id.minor + piece.end - piece.start,
				});
			}
		}
	}

	private endpoints(piece: RawPiece, reverse: boolean): readonly Endpoint[] {
		return piece.id === undefined
			? []
			: ((reverse ? this.detaches : this.attaches).get(piece.id.major) ?? []);
	}

	private outputParent(field: RawField): PositionNodePath | undefined {
		if (!this.outputParents.has(field)) {
			this.outputParents.set(field, this.forwardNode(field.path.parent));
		}
		return this.outputParents.get(field);
	}

	private forwardNode(path: PositionNodePath): PositionNodePath | undefined {
		if (path.length === 0) {
			return path;
		}
		const root = path[0];
		assert(root !== undefined, "Expected a node path root");
		if (path.length === 1 && this.detachedRoots.has(root.field)) {
			const endpoint = this.endpointAt(
				this.attaches.get(this.detachedRoots.get(root.field)) ?? [],
				root.index,
			);
			if (endpoint === undefined) {
				return undefined;
			}
			const destinationParent = this.outputParent(endpoint.field);
			return destinationParent === undefined
				? undefined
				: [
						...destinationParent,
						{
							field: endpoint.field.path.field,
							index: endpoint.piece.start + root.index - endpoint.minor,
						},
					];
		}
		const step = path[path.length - 1];
		assert(step !== undefined, "Expected a node path step");
		const parent = path.slice(0, -1);
		const record = this.fields.get(key({ parent, field: step.field }));
		if (record === undefined) {
			const mappedParent = this.forwardNode(parent);
			return mappedParent === undefined ? undefined : [...mappedParent, step];
		}
		const piece = this.rawAt(record.input, step.index);
		if (!piece.detached) {
			const mappedParent = this.outputParent(record);
			return mappedParent === undefined
				? undefined
				: [
						...mappedParent,
						{ field: step.field, index: piece.otherStart + step.index - piece.start },
					];
		}
		assert(piece.id !== undefined, "A detached interval must have an ID");
		const minor = piece.id.minor + step.index - piece.start;
		const destination = this.endpointAt(this.endpoints(piece, false), minor);
		if (destination === undefined) {
			return undefined;
		}
		const movedParent = this.outputParent(destination.field);
		return movedParent === undefined
			? undefined
			: [
					...movedParent,
					{
						field: destination.field.path.field,
						index: destination.piece.start + minor - destination.minor,
					},
				];
	}

	private rawAt(pieces: readonly RawPiece[], index: number): RawPiece {
		let low = 0;
		let high = pieces.length;
		while (low + 1 < high) {
			const middle = Math.floor((low + high) / 2);
			const candidate = pieces[middle];
			assert(candidate !== undefined, "Expected a delta interval");
			if (candidate.start <= index) {
				low = middle;
			} else {
				high = middle;
			}
		}
		const piece = pieces[low];
		assert(piece !== undefined, "Expected a delta interval");
		return piece;
	}

	private endpointAt(entries: readonly Endpoint[], minor: number): Endpoint | undefined {
		let low = 0;
		let high = entries.length;
		while (low < high) {
			const middle = Math.floor((low + high) / 2);
			const candidate = entries[middle];
			assert(candidate !== undefined, "Expected a move endpoint");
			if (candidate.minor <= minor) {
				low = middle + 1;
			} else {
				high = middle;
			}
		}
		const entry = entries[low - 1];
		return entry !== undefined && minor < entry.end ? entry : undefined;
	}

	public build(reverse: boolean): DirectionalMap {
		const result = new Map<string, FieldMapping>();
		for (const record of this.fields.values()) {
			const outputParent = this.outputParent(record);
			const outputField =
				outputParent === undefined
					? undefined
					: { parent: outputParent, field: record.path.field };
			if (reverse && outputField === undefined) {
				continue;
			}
			const source = reverse ? outputField : record.path;
			assert(source !== undefined, "Expected a source field");
			const destination = reverse ? record.path : outputField;
			const nodes: Piece[] = [];
			const before: Piece[] = [
				{ start: 0, end: 1, field: destination, offset: 0, constant: 0 },
			];
			const after: Piece[] = [];
			for (const raw of reverse ? record.output : record.input) {
				const pieces = this.expand(raw, reverse, destination);
				for (const piece of pieces) {
					appendPiece(nodes, piece);
					const deleted = piece.field === undefined;
					appendPiece(before, {
						start: piece.start + 1,
						end: piece.end + 1,
						field: deleted ? destination : piece.field,
						offset: piece.offset,
						...(deleted ? { constant: raw.otherStart } : {}),
					});
					appendPiece(after, {
						...piece,
						field: deleted ? destination : piece.field,
						...(deleted ? { constant: raw.after } : {}),
					});
				}
			}
			result.set(key(source), {
				field: source,
				nodes,
				before,
				after,
				lengthDelta: reverse ? -record.lengthDelta : record.lengthDelta,
			});
		}
		return new DirectionalMap(result);
	}

	private expand(
		piece: RawPiece,
		reverse: boolean,
		destination: PositionFieldPath | undefined,
	): Piece[] {
		if (!piece.detached) {
			return [
				{
					start: piece.start,
					end: piece.end,
					field: destination,
					offset: piece.otherStart - piece.start,
				},
			];
		}
		assert(piece.id !== undefined, "Expected an attach or detach ID");
		const entries = this.endpoints(piece, reverse);
		const result: Piece[] = [];
		let start = piece.start;
		while (start < piece.end) {
			const minor = piece.id.minor + start - piece.start;
			const endpoint = this.endpointAt(entries, minor);
			if (endpoint === undefined) {
				// Find the next destination interval when only part of a detached range is moved.
				let low = 0;
				let high = entries.length;
				while (low < high) {
					const middle = Math.floor((low + high) / 2);
					const candidate = entries[middle];
					assert(candidate !== undefined, "Expected a move endpoint");
					if (candidate.minor <= minor) {
						low = middle + 1;
					} else {
						high = middle;
					}
				}
				const end = Math.min(piece.end, start + ((entries[low]?.minor ?? Infinity) - minor));
				appendPiece(result, { start, end, field: undefined, offset: 0 });
				start = end;
			} else {
				const end = Math.min(piece.end, start + endpoint.end - minor);
				const parent = reverse
					? endpoint.field.path.parent
					: this.outputParent(endpoint.field);
				appendPiece(result, {
					start,
					end,
					field:
						parent === undefined ? undefined : { parent, field: endpoint.field.path.field },
					offset: endpoint.piece.start + minor - endpoint.minor - start,
				});
				start = end;
			}
		}
		return result;
	}
}
