import type { StateSchemaValidator } from "@fluidframework/presence/alpha";
import { type Static, Type } from "@sinclair/typebox";
// eslint-disable-next-line import/no-internal-modules
import { Value } from "@sinclair/typebox/value";

/**
 * IMousePosition is the data that individual session clients share via presence.
 */
export type IMousePosition = Static<typeof IMousePosition>;

export const IMousePosition = Type.Object({
	x: Type.Number(),
	y: Type.Number(),
});

export const IMousePositionValidator: StateSchemaValidator<IMousePosition> = (maybeValid) => {
	window.alert("Validator called");
	console.debug(`Validator called with`, maybeValid);
	// const isValid = Value.Parse(IMousePosition, maybeValid);

	// Will throw if the value is invalid.
	Value.Assert(IMousePosition, maybeValid);

	// Will throw if the value is invalid.
	// const parsed = Value.Parse(IMousePosition, maybeValid);

	// console.debug(parsed);
	return maybeValid;
};
