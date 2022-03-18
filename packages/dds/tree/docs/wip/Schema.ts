/**
 * Example internal schema representation types.
 */

/**
 * Stable identifier, used when persisting data.
 *
 * This intentionally does not support any concept of versioning or name-spacing:
 * users of it can include versions and namespaces in if they want, or features for them could be added later.
 *
 * Can be used either:
 * 1. Record just this in the persisted data.
 * When loading the data, see if the loader has a schema with a matching name, and if so, use that.
 * Optionally validate loaded data against schema.
 * 2. Persist the whole schema. Use the identifier to associate it with schema when loading to check that the schema match.
 */
export type SchemaIdentifier = string;

export enum Multiplicity {
    /**
     * Exactly one item.
     */
    Value,
    /**
     * 0 or 1 items.
     */
    Optional,
    /**
     * 0 or more items.
     */
    Sequence,
    /**
     * Exactly 0 items.
     */
    Forbidden,
}

export enum Value {
    Nothing,
    Number,
    String,
    Boolean,
    /**
     * Any Fluid serializable data.
     */
    Serializable,
}

export interface FieldContent {
    multiplicity: Multiplicity;
    /**
     * If not specified, child types are unconstrained.
     */
    types?: Type[];
}

export interface Field {
    content: FieldContent;
    /**
     * Stable identifier, used when persisting data.
     *
     * Can be used either:
     * 1. Record just this in the persisted data. When loading the data, see if the loader has a schema with a matching name, and if so, use that.
     * 2. Persist the whole schema. Use the identifier to associate it with schema when loading to check that the schema match.
     */
    name: string;
}

export interface Type {
    name: string;
    fields: Field[];
    extraFields?: FieldContent;
    value: Value;
}
