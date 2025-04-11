// /*!
//  * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
//  * Licensed under the MIT License.
//  */

// import { assert } from "@fluidframework/core-utils/internal";
// import {
// 	makeChangeAtomId,
// 	offsetChangeAtomId,
// 	type ChangeAtomId,
// 	type ChangeEncodingContext,
// 	type ExclusiveMapTree,
// 	type FieldKindIdentifier,
// 	type Multiplicity,
// } from "../../../core/index.js";
// import {
// 	FieldKindWithEditor,
// 	genericFieldKind,
// 	mapTreeFieldFromCursor,
// 	ModularChangeFamily,
// 	type FieldChangeHandler,
// 	type FieldEditor,
// 	type ModularChangeset,
// } from "../../../feature-libraries/index.js";
// import type { ICodecFamily } from "../../../codec/index.js";
// import type { ChangeAtomIdBTree, FieldChangeMap } from "../../../feature-libraries/modular-schema/modularChangeTypes.js";
// import { getOrAddEmptyToMap, hasSome, newTupleBTree } from "../../../util/index.js";
// import { getChangeHandler } from "../../../feature-libraries/modular-schema/modularChangeFamily.js";

// // TODO: stronger typing
// /* eslint-disable @typescript-eslint/no-explicit-any */

// export class DebugableFieldKindWithEditor<
// 	TEditor extends FieldEditor<any> = FieldEditor<any>,
// 	TMultiplicity extends Multiplicity = Multiplicity,
// 	TName extends string = string,
// > extends FieldKindWithEditor<TEditor, TMultiplicity, TName> {}

// /* eslint-enable @typescript-eslint/no-explicit-any */

// export interface Story {
// 	readonly nodes: Record<string, NodeJourney>;
// 	// TODO: add constraint information
// }

// export interface NodeJourney {
// 	readonly start: JourneyStart;
// 	// readonly waypoints: readonly JourneyWaypoint[];
// 	readonly end: JourneyEnd;
// }

// export type JourneyLocation = Created | Detached | Attached | Destroyed;
// export type JourneyStart = Created | Detached | Attached;
// export type JourneyWaypoint = Detached | Attached;
// export type JourneyEnd = Detached | Attached | Destroyed;

// export interface Created {
// 	readonly type: "created";
// 	readonly subtype: "built" | "refreshed";
// 	readonly id: ChangeAtomId;
// 	readonly content: ExclusiveMapTree;
// }

// export interface Destroyed {
// 	readonly type: "destroyed";
// 	readonly id: ChangeAtomId;
// }

// export interface Detached {
// 	readonly type: "detached";
// 	readonly id: ChangeAtomId;
// }

// export interface Attached {
// 	readonly type: "attached";
// 	readonly path: DownPath;
// }

// export interface DownPathHop {
// 	readonly field: string;
// 	readonly index: number;
// }

// export interface DownPathRoot {
// 	readonly id?: ChangeAtomId;
// }

// export type DownPath = readonly [DownPathRoot, ...DownPathHop[]];

// export class DebugableModularChangeFamily extends ModularChangeFamily {
// 	public override readonly fieldKinds: ReadonlyMap<
// 		FieldKindIdentifier,
// 		DebugableFieldKindWithEditor
// 	>;

// 	public constructor(
// 		fieldKinds: ReadonlyMap<FieldKindIdentifier, DebugableFieldKindWithEditor>,
// 		codecs: ICodecFamily<ModularChangeset, ChangeEncodingContext>,
// 	) {
// 		super(fieldKinds, codecs);
// 		this.fieldKinds = fieldKinds;
// 	}

// 	public toStory(change: ModularChangeset): Story {
// 		// const build = new Map<string, Built>();
// 		// const refresh = new Map<string, Refreshed>();
// 		// const destroy = new Map<string, Destroyed>();
// 		// const attach = new Map<string, Attached>();
// 		// const detach = new Map<string, Detached>();
// 		const paths = new Map<string, JourneyLocation[]>();

// 		if (change.builds !== undefined) {
// 			for (const [[revision, localId], chunk] of change.builds.entries()) {
// 				const startId = makeChangeAtomId(localId, revision);
// 				const mapTrees = mapTreeFieldFromCursor(chunk.cursor());
// 				let iNode = 0;
// 				for (const mapTree of mapTrees) {
// 					const created: Created = {
// 						type: "created",
// 						subtype: "built",
// 						id: offsetChangeAtomId(startId, iNode),
// 						content: mapTree,
// 					};
// 					const path = pathToString(pathFromId(created));
// 					assert(!paths.has(path), "Path should not be duplicated");
// 					paths.set(path, [created]);
// 					iNode += 1;
// 				}
// 			}
// 		}

// 		if (change.refreshers !== undefined) {
// 			for (const [[revision, localId], chunk] of change.refreshers.entries()) {
// 				const startId = makeChangeAtomId(localId, revision);
// 				const mapTrees = mapTreeFieldFromCursor(chunk.cursor());
// 				let iNode = 0;
// 				for (const mapTree of mapTrees) {
// 					const created: Created = {
// 						type: "created",
// 						subtype: "refreshed",
// 						id: offsetChangeAtomId(startId, iNode),
// 						content: mapTree,
// 					};
// 					const path = pathToString(pathFromId(created));
// 					assert(!paths.has(path), "Path should not be duplicated");
// 					paths.set(path, [created]);
// 					iNode += 1;
// 				}
// 			}
// 		}

// 		const waypoints: readonly JourneyWaypoint[] = Array.from(waypointsFromFieldChanges(change.fieldChanges));

// 		if (change.destroys !== undefined) {
// 			for (const [[revision, localId], count] of change.destroys.entries()) {
// 				const startId = makeChangeAtomId(localId, revision);
// 				for (let iNode = 0; iNode < count; iNode += 1) {
// 					const destroyed: Destroyed = {
// 						type: "destroyed",
// 						id: offsetChangeAtomId(startId, iNode),
// 					};
// 					const path = pathToString(pathFromId(destroyed));
// 					const progress = getOrAddEmptyToMap(paths, path);
// 					progress.push(destroyed);
// 				}
// 			}
// 		}

// 		const nodes: Record<string, NodeJourney> = {};
// 		for (const [path, journey] of paths) {
// 			assert(hasSome(journey), "Journey should not be empty");
// 			const start = journey[0];
// 			const end = journey[journey.length - 1];
// 			assert(
// 				start.type === "created" || start.type === "detached" || start.type === "attached",
// 				"Invalid start type",
// 			);
// 			assert(
// 				end.type === "destroyed" || end.type === "detached" || end.type === "attached",
// 				"Invalid end type",
// 			);
// 			nodes[path] = { start, end };
// 		}
// 		return { nodes };
// 	}

// 	protected *waypointsFromFieldChanges(change: ModularChangeset, fieldChanges: FieldChangeMap): Generator<JourneyWaypoint> {
// 		for (const [fieldKey, fieldChange] of fieldChanges) {
// 			const handler = this.getDebugHandler(fieldChange.fieldKind);
// 			handler.
// 		}
// 		yield return;
// 	}

// 	protected getDebugHandler(kind: FieldKindIdentifier): FieldChangeHandler<any, FieldEditor<any>> {
// 		if (kind === genericFieldKind.identifier) {
// 			return genericFieldKind.changeHandler;
// 		}
// 		const fieldKind = this.fieldKinds.get(kind);
// 		assert(fieldKind !== undefined, "Unknown field kind");
// 		return fieldKind.changeHandler;
// 	}
// }

// function pathFromId(hasId: { readonly id: ChangeAtomId }): DownPath {
// 	return [{ id: hasId.id }];
// }

// function pathToString(path: DownPath): string {
// 	const root = path[0];
// 	const hops = hopsToString(path.slice(1) as DownPathHop[]);
// 	if (root.id !== undefined) {
// 		return `${root.id.localId}@${root.id.revision}.${hops}`;
// 	}
// 	return `${hops}`;
// }

// function hopsToString(path: readonly DownPathHop[]): string {
// 	return path.map((hop) => `${hop.field}[${hop.index}]`).join(".");
// }
