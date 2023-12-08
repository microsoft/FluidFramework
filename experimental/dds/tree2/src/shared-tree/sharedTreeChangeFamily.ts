/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICodecFamily, ICodecOptions } from "../codec";
import { ChangeFamily, ChangeRebaser, TaggedChange, tagChange } from "../core";
import { fieldKinds, ModularChangeFamily, ModularChangeset } from "../feature-libraries";
import { RevisionTagCodec } from "../shared-tree-core";
import { Mutable, fail } from "../util";
import { makeSharedTreeChangeCodecFamily } from "./sharedTreeChangeCodecs";
import { SharedTreeChange } from "./sharedTreeChangeTypes";
import { SharedTreeEditBuilder } from "./sharedTreeEditBuilder";

/**
 * Implementation of {@link ChangeFamily} that combines edits to fields and schema changes.
 *
 * @sealed
 */
export class SharedTreeChangeFamily
	implements
		ChangeFamily<SharedTreeEditBuilder, SharedTreeChange>,
		ChangeRebaser<SharedTreeChange>
{
	public static emptyChange: SharedTreeChange = {
		changes: [],
	};

	public readonly codecs: ICodecFamily<SharedTreeChange>;
	private readonly modularChangeFamily: ModularChangeFamily;

	public constructor(codecOptions: ICodecOptions) {
		this.modularChangeFamily = new ModularChangeFamily(fieldKinds, codecOptions);
		this.codecs = makeSharedTreeChangeCodecFamily(
			fieldKinds,
			new RevisionTagCodec(),
			codecOptions,
		);
	}

	public buildEditor(changeReceiver: (change: SharedTreeChange) => void): SharedTreeEditBuilder {
		return new SharedTreeEditBuilder(this.modularChangeFamily, changeReceiver);
	}

	public compose(changes: TaggedChange<SharedTreeChange>[]): SharedTreeChange {
		const newChanges: Mutable<SharedTreeChange["changes"]> = [];
		const dataChangeRun: TaggedChange<ModularChangeset>[] = [];
		for (const topChange of changes) {
			for (const change of topChange.change.changes) {
				if (change.type === "schema") {
					if (dataChangeRun.length > 0) {
						newChanges.push({
							type: "data",
							innerChange: this.modularChangeFamily.compose(dataChangeRun),
						});
					}
					newChanges.push(change);
				} else {
					dataChangeRun.push(tagChange(change.innerChange, topChange.revision));
				}
			}
		}
		return { changes: newChanges };
	}

	public invert(change: TaggedChange<SharedTreeChange>, isRollback: boolean): SharedTreeChange {
		const invertInnerChange: (
			innerChange: SharedTreeChange["changes"][number],
		) => SharedTreeChange["changes"][number] = (innerChange) => {
			switch (innerChange.type) {
				case "data":
					return {
						type: "data",
						innerChange: this.modularChangeFamily.invert(
							tagChange(innerChange.innerChange, change.revision),
							isRollback,
						),
					};
				case "schema": {
					if (innerChange.innerChange.schema === undefined) {
						return {
							type: "schema",
							innerChange: {},
						};
					}
					return {
						type: "schema",
						innerChange: {
							schema: {
								new: innerChange.innerChange.schema.old,
								old: innerChange.innerChange.schema.new,
							},
						},
					};
				}
				default:
					fail("Unknown SharedTree change type.");
			}
		};
		return {
			changes: change.change.changes.map(invertInnerChange).reverse(),
		};
	}

	public rebase(
		change: SharedTreeChange,
		over: TaggedChange<SharedTreeChange>,
	): SharedTreeChange {
		throw new Error("Not implemented");
	}

	public get rebaser(): ChangeRebaser<SharedTreeChange> {
		return this;
	}
}
