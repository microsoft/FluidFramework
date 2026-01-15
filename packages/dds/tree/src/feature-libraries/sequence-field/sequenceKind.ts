import { Multiplicity, forbiddenFieldKindIdentifier } from "../../core/index.js";
import {
	sequenceIdentifier,
	identifierFieldIdentifier,
	requiredIdentifier,
	optionalIdentifier,
} from "../fieldKindIdentifiers.js";
import { FlexFieldKind } from "../modular-schema/index.js";
import { sequenceFieldChangeHandler } from "./sequenceFieldChangeHandler.js";

/**
 * 0 or more items.
 */
export const sequence = new FlexFieldKind(sequenceIdentifier, Multiplicity.Sequence, {
	changeHandler: sequenceFieldChangeHandler,
	allowMonotonicUpgradeFrom: new Set([
		requiredIdentifier,
		optionalIdentifier,
		identifierFieldIdentifier,
		forbiddenFieldKindIdentifier,
	]),
});
