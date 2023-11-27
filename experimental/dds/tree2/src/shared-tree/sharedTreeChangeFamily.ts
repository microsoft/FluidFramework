/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICodecFamily, ICodecOptions } from "../codec";
import { ChangeFamily, ChangeRebaser, Delta, TaggedChange } from "../core";
import { fieldKinds, ModularChangeFamily, SchemaChangeFamily } from "../feature-libraries";
import { makeSharedTreeChangeCodecFamily } from "./sharedTreeChangeCodecs";
import { SharedTreeChange } from "./sharedTreeChangeTypes";
import { SharedTreeEditBuilder } from "./sharedTreeEditBuilder";

/**
 * Implementation of {@link ChangeFamily} based on the default set of supported field kinds.
 *
 * @sealed
 */
export class SharedTreeChangeFamily
	implements
		ChangeFamily<SharedTreeEditBuilder, SharedTreeChange>,
		ChangeRebaser<SharedTreeChange>
{
	public readonly codecs: ICodecFamily<SharedTreeChange>;
	private readonly modularChangeFamily: ModularChangeFamily;
	private readonly schemaChangeFamily: SchemaChangeFamily;

	public constructor(codecOptions: ICodecOptions) {
		this.modularChangeFamily = new ModularChangeFamily(fieldKinds, codecOptions);
		this.schemaChangeFamily = new SchemaChangeFamily(codecOptions);
		this.codecs = makeSharedTreeChangeCodecFamily(fieldKinds, codecOptions);
	}

	public buildEditor(changeReceiver: (change: SharedTreeChange) => void): SharedTreeEditBuilder {
		return new SharedTreeEditBuilder(
			this.schemaChangeFamily,
			this.modularChangeFamily,
			changeReceiver,
		);
	}

	public compose(changes: TaggedChange<SharedTreeChange>[]): SharedTreeChange {
		throw new Error("Not implemented");
	}

	public invert(change: TaggedChange<SharedTreeChange>, isRollback: boolean): SharedTreeChange {
		throw new Error("Not implemented");
	}

	public rebase(
		change: SharedTreeChange,
		over: TaggedChange<SharedTreeChange>,
	): SharedTreeChange {
		throw new Error("Not implemented");
	}

	public intoDelta(change: TaggedChange<SharedTreeChange>): Delta.Root {
		throw new Error("Not implemented");
	}

	public get rebaser(): ChangeRebaser<SharedTreeChange> {
		return this;
	}
}
