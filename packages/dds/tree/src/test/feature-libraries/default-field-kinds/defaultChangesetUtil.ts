/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	makeAnonChange,
	type RevisionMetadataSource,
	type RevisionTag,
	type TaggedChange,
} from "../../../core/index.js";
import {
	fieldKindConfigurations,
	fieldKinds,
	intoDelta,
	makeFieldBatchCodec,
	makeModularChangeCodecFamily,
	ModularChangeFamily,
	type DefaultChangeset,
	type FieldKindConfiguration,
	type ModularChangeset,
} from "../../../feature-libraries/index.js";
import {
	rebaseRevisionMetadataFromInfo,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/modular-schema/modularChangeFamily.js";
import { strict as assert } from "node:assert";
import type { ICodecOptions } from "../../../index.js";
import { ajvValidator } from "../../codec/index.js";
import { defaultRevInfosFromChanges, testRevisionTagCodec } from "../../utils.js";
import type { BoundFieldChangeRebaser } from "../../exhaustiveRebaserUtils.js";
import {
	assertEqual,
	assertModularChangesetsEqual,
	empty,
	isModularEmpty,
	normalizeDelta,
	// eslint-disable-next-line import/no-internal-modules
} from "../modular-schema/modularChangesetUtil.js";
// eslint-disable-next-line import/no-internal-modules
import type { RebaseRevisionMetadata } from "../../../feature-libraries/modular-schema/index.js";

const codecOptions: ICodecOptions = {
	jsonValidator: ajvValidator,
};

const fieldKindConfiguration: FieldKindConfiguration =
	fieldKindConfigurations.get(4) ?? assert.fail("Field kind configuration not found");
assert(
	fieldKindConfigurations.get(5) === undefined,
	"There's a newer configuration. It probably should be used.",
);

const codec = makeModularChangeCodecFamily(
	new Map([[1, fieldKindConfiguration]]),
	testRevisionTagCodec,
	makeFieldBatchCodec(codecOptions, 1),
	codecOptions,
);

export const defaultFamily = new ModularChangeFamily(fieldKinds, codec);

export const defaultFieldRebaser: BoundFieldChangeRebaser<DefaultChangeset> = {
	rebase: rebaseModular,
	rebaseComposed: rebaseComposedModular,
	compose: composeModular,
	invert: invertModular,
	inlineRevision: inlineRevisionModular,
	assertEqual: assertModularEqual,
	createEmpty: empty,
	isEmpty: isModularEmpty,
	assertChangesetsEquivalent: assertModularChangesetsEquivalent,
};

function rebaseModular(
	change: TaggedChange<ModularChangeset>,
	base: TaggedChange<ModularChangeset>,
	metadataArg?: RebaseRevisionMetadata,
): ModularChangeset {
	const metadata =
		metadataArg ??
		rebaseRevisionMetadataFromInfo(defaultRevInfosFromChanges([base]), undefined, [
			base.revision,
		]);
	return defaultFamily.rebase(change, base, metadata);
}

function rebaseComposedModular(
	metadata: RebaseRevisionMetadata,
	change: TaggedChange<ModularChangeset>,
	...baseChanges: TaggedChange<ModularChangeset>[]
): ModularChangeset {
	const composed =
		baseChanges.length === 0
			? makeAnonChange(empty())
			: baseChanges.reduce((change1, change2) =>
					makeAnonChange(composeModular(change1, change2)),
				);

	return rebaseModular(change, composed, metadata);
}

function composeModular(
	change1: TaggedChange<ModularChangeset>,
	change2: TaggedChange<ModularChangeset>,
	metadata?: RevisionMetadataSource,
): ModularChangeset {
	return defaultFamily.compose([change1, change2]);
}

function invertModular(
	change: TaggedChange<ModularChangeset>,
	revision: RevisionTag,
	isRollback: boolean,
): ModularChangeset {
	return defaultFamily.invert(change, isRollback, revision);
}

export function assertModularChangesetsEquivalent(
	change1: TaggedChange<ModularChangeset>,
	change2: TaggedChange<ModularChangeset>,
) {
	const actualDelta = normalizeDelta(intoDelta(change1));
	const expectedDelta = normalizeDelta(intoDelta(change2));
	assertEqual(actualDelta, expectedDelta);
}

function assertModularEqual(
	a: TaggedChange<ModularChangeset> | undefined,
	b: TaggedChange<ModularChangeset> | undefined,
): void {
	if (a === undefined || b === undefined) {
		assert.equal(a, b);
		return;
	}

	assert(a.revision === b.revision && a.rollbackOf === b.rollbackOf);
	assertModularChangesetsEqual(a.change, b.change);
}

function inlineRevisionModular(
	change: ModularChangeset,
	revision: RevisionTag,
): ModularChangeset {
	return defaultFamily.changeRevision(change, revision);
}
