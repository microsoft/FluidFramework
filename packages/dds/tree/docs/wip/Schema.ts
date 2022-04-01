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

/**
 * SchemaIdentifier for a Tree.
 * Also known as "Definition"
 */
export type TreeSchemaIdentifier = SchemaIdentifier;

/**
 * Key / Name / Label for a field which is scoped to a specific TreeSchema.
 */
export type LocalFieldKey = string;

/**
 * SchemaIdentifier for a Field "global field",
 * meaning a field which has the same meaning for all usages withing the document (not scoped to a specific TreeSchema like LocalFieldKey).
 *
 * Note that the implementations should ensure that GlobalFieldKeys can never collide with LocalFieldKeys.
 * This can either be done in several ways
 * (keeping the two classes of fields separate, namespaceing/escaping, compressing one into numbers and leaving the other strings, etc.)
 */
export type GlobalFieldKey = SchemaIdentifier;

/**
 * Schema for how many children are allowed in a field.
 */
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

/**
 * Example for how we might want to handle values.
 *
 * This might be significantly different if we want to focus more on binary formats (need to work out how fluid GC would work with that).
 * For now, this is a simple easy to support setup.
 *
 * Note that use of non-Nothing values might be restricted in the actual user facing schema languages:
 * we could instead choose to get by with the only types supporting values being effectively builtin,
 * though this limitation could prevent users for updating/extending the primitive schema to allow the annotations they might want.
 *
 * An interesting alternative to this simple value Enum would be to use something more expressive here, like JsonSchema:
 * since this is modeling immutable data, we really just need a way to figure out which if these value schema allow super sets of each-other.
 */
export enum ValueSchema {
    Nothing,
    Number,
    String,
    Boolean,
    /**
     * Any Fluid serializable data.
     *
     * This includes Nothing / undefined.
     *
     * If it is desired to not include Nothing here, `anyNode` and `allowsValueSuperset` would need adjusting.
     */
    Serializable,
}

export interface FieldSchema {
    readonly multiplicity: Multiplicity;
    /**
     * If not specified, child types are unconstrained.
     * Note that even when unconstrained, children must still be in-schema for their own type.
     *
     * In the future, this could be extended to allow inlining a TreeSchema here (or some similar structural schema system).
     * Putting a structural schema here would be an interesting alternative to supporting values on Tree nodes:
     * ex: we could remove TreeSchema.value and allow ValueType here instead of a type set.
     */
    readonly types?: ReadonlySet<TreeSchemaIdentifier>;
}

export interface TreeSchema {
    /**
     * Schema for fields with with specific keys.
     *
     * This allows to the FieldSchema directly (as opposed to just supporting FieldSchemaIdentifier and having a central FieldKey -> FieldSchema map).
     * Referring to the FieldSchema directly improves interop with extraFields:
     * It also makes use-cases that want have simple short developer friendly field names able to use those names as the keys, and not need a separate field schema identifier.
     *
     * Having a single centralized map indexed by FieldSchemaIdentifier also offers some value: it can be used for fields which have the same meaning in multiple places,
     * and simplifies document root handling (since the root can just have a special `FieldSchemaIdentifier`).
     */
    readonly localFields: ReadonlyMap<LocalFieldKey, FieldSchema>;
    readonly globalFields: ReadonlySet<GlobalFieldKey>;

    /**
     * Constraint for local fields not mentioned in `localFields`.
     *
     * Allowing extraFields enables using trees like a map without having to insert localFields for all the keys.
     *
     * This implementation currently does not allow extra fields that are globalFields:
     * nothing prevents adding support for this,
     * either as part of these extra fields (and requiring them to meet this FieldSchema as well as their own),
     * or as a separate construct.
     * Support for them is simply omitted as it is not required by the use-cases in of this example implementation.
     *
     * Usually `Multiplicity.Value` should NOT be used here since no nodes can ever be in schema are in schema if you use `Multiplicity.Value` here (that would require infinite children).
     */
    readonly extraLocalFields: FieldSchema;

    readonly extraGlobalFields: boolean;

    readonly value: ValueSchema;
}

export interface Named<TName> {
    readonly name: TName;
}

export interface SchemaRepository {
    /**
     * All fields with the specified GlobalFieldKey must comply with the returned schema.
     */
    lookupGLobalFieldSchema(key: GlobalFieldKey): FieldSchema;

    /**
     * All trees with the specified identifier must comply with the returned schema.
     */
    lookupTreeSchema(identifier: TreeSchemaIdentifier): TreeSchema | undefined;
}

/**
 * Default field which only permits emptiness.
 */
export const emptyField: FieldSchema = {
    multiplicity: Multiplicity.Forbidden,
    types: new Set(),
};

/**
 * FieldSchema which is impossible for any data to be in schema with.
 */
export const neverField: FieldSchema = {
    multiplicity: Multiplicity.Value,
    types: new Set(),
};

/**
 * TreeSchema which is impossible for any data to be in schema with.
 */
export const neverTree: TreeSchema = {
    localFields: new Map(),
    globalFields: new Set(),
    extraLocalFields: neverField,
    extraGlobalFields: false,
    value: ValueSchema.Nothing,
};

/**
 * FieldSchema permits anything.
 * Note that children inside the field still have to be in schema.
 */
export const anyField: FieldSchema = {
    multiplicity: Multiplicity.Sequence,
};

/**
 * TreeSchema that permits anything.
 * Note that children under the fields (and global fields) still have to be in schema.
 */
export const anyTree: TreeSchema = {
    localFields: new Map(),
    globalFields: new Set(),
    extraLocalFields: anyField,
    extraGlobalFields: true,
    value: ValueSchema.Serializable,
};

/**
 * Example in memory version showing how stored schema could work.
 *
 * Actual version for use with fluid would probably need to either be copy on write, support clone,
 * have rollback/rebase of updates to handle local changes before they are sequenced.
 *
 * New instances default to permitting only empty documents.
 * Assuming a conventional `FieldSchemaIdentifier` use for the document root,
 * this default state can be incrementally updated permitting more and more possible documents.
 *
 * All states which were ever permitted (including the empty document) will remain valid for all time.
 * This means that updating the schema can be done without access to the document contents.
 * As long as the document content edits keep it in schema with the current (or any past) schema,
 * it will always be in schema for all future schema this StoredSchemaRepository might contain.
 */
export class StoredSchemaRepository implements SchemaRepository {
    /**
     * For now, the schema are just scored in maps.
     * There are a couple reasons we might not want this simple solution long term:
     * 1. We might want an easy/fast copy.
     * 2. We might want a way to reserve a large namespace of schema with the same schema
     * (ex: someone using data as field identifiers might want to reserve all fields identifiers starting with "foo." to have a specific schema).
     * Combined with support for such namespaces in the allowed sets in the schema objects, that might provide a decent alternative to extraFields (which is a bit odd).
     */
    private readonly fields: Map<LocalFieldKey, FieldSchema> = new Map();
    private readonly trees: Map<TreeSchemaIdentifier, TreeSchema> = new Map();

    public lookupGLobalFieldSchema(identifier: LocalFieldKey): FieldSchema {
        return this.fields.get(identifier) ?? neverField;
    }

    public lookupTreeSchema(identifier: TreeSchemaIdentifier): TreeSchema {
        return this.trees.get(identifier) ?? neverTree;
    }

    /**
     * Updates the specified schema iff all possible in schema data would remain in schema after the change.
     * @returns true iff update was performed.
     */
    public tryUpdateFieldSchema(
        identifier: LocalFieldKey,
        schema: FieldSchema
    ): boolean {
        if (
            allowsFieldSuperset(
                this,
                this.lookupGLobalFieldSchema(identifier),
                schema
            )
        ) {
            this.fields.set(identifier, schema);
            return true;
        }
        return false;
    }

    /**
     * Updates the specified schema iff all possible in schema data would remain in schema after the change.
     * @returns true iff update was performed.
     */
    public tryUpdateTreeSchema(
        identifier: TreeSchemaIdentifier,
        schema: TreeSchema
    ): boolean {
        const original = this.lookupTreeSchema(identifier);
        if (allowsTreeSuperset(this, original, schema)) {
            this.trees.set(identifier, schema);
            return true;
        }
        return false;
    }
}

/**
 * @returns true iff `superset` is a superset of `original`.
 *
 * This does not require a strict (aka proper) superset: equivalent schema will return true.
 */
export function allowsTreeSuperset(
    repo: SchemaRepository,
    original: TreeSchema,
    superset: TreeSchema
): boolean {
    if (isNeverTree(repo, original)) {
        return true;
    }
    if (!allowsValueSuperset(original.value, superset.value)) {
        return false;
    }
    if (
        !allowsFieldSuperset(
            repo,
            original.extraLocalFields,
            superset.extraLocalFields
        )
    ) {
        return false;
    }
    if (original.extraGlobalFields && !superset.extraGlobalFields) {
        return false;
    }
    if (
        !compareSets(
            original.globalFields,
            superset.globalFields,
            // true iff the original field must always be empty, or superset supports extra global fields.
            (originalField) =>
                superset.extraGlobalFields ||
                allowsFieldSuperset(
                    repo,
                    repo.lookupGLobalFieldSchema(originalField),
                    emptyField
                ),
            // true iff the new field can be empty, since it may be empty in original
            (supersetField) =>
                allowsFieldSuperset(
                    repo,
                    emptyField,
                    repo.lookupGLobalFieldSchema(supersetField)
                )
        )
    ) {
        return false;
    }

    if (
        !compareSets(
            original.localFields,
            superset.localFields,
            (originalField) =>
                allowsFieldSuperset(
                    repo,
                    original.localFields.get(originalField),
                    superset.extraLocalFields
                ),
            (supersetField) =>
                allowsFieldSuperset(
                    repo,
                    original.extraLocalFields,
                    repo.lookupGLobalFieldSchema(supersetField)
                )
        )
    ) {
        return false;
    }

    return true;
}

/**
 * @returns true iff `superset` is a superset of `original`.
 *
 * This does not require a strict (aka proper) superset: equivalent schema will return true.
 */
export function allowsValueSuperset(
    original: ValueSchema,
    superset: ValueSchema
): boolean {
    return original === superset || superset === ValueSchema.Serializable;
}

/**
 * @returns true iff `superset` is a superset of `original`.
 *
 * This does not require a strict (aka proper) superset: equivalent schema will return true.
 */
export function allowsFieldSuperset(
    repo: SchemaRepository,
    original: FieldSchema,
    superset: FieldSchema
): boolean {
    if (isNeverField(repo, original)) {
        return true;
    }
    if (
        !allowsMultiplicitySuperset(
            original.multiplicity,
            superset.multiplicity
        )
    ) {
        return false;
    }
    if (original.multiplicity === Multiplicity.Forbidden) {
        return true;
    }
    if (superset.types === undefined) {
        return true;
    }
    if (original.types === undefined) {
        return false;
    }
    for (const originalType of original.types) {
        if (!superset.types.has(originalType)) {
            return false;
        }
    }
    return true;
}

/**
 * @returns true iff `superset` is a superset of `original`.
 *
 * This does not require a strict (aka proper) superset: equivalent schema will return true.
 */
export function allowsMultiplicitySuperset(
    original: Multiplicity,
    superset: Multiplicity
): boolean {
    return (
        original === superset ||
        superset === Multiplicity.Sequence ||
        ((original === Multiplicity.Forbidden ||
            original === Multiplicity.Value) &&
            superset === Multiplicity.Optional)
    );
}

/**
 * @returns false iff any of the call backs returned false.
 */
export function compareSets<T>(
    a: ReadonlySet<T> | ReadonlyMap<T, unknown>,
    b: ReadonlySet<T> | ReadonlyMap<T, unknown>,
    aExtra: (t: T) => boolean,
    bExtra: (t: T) => boolean
): boolean {
    for (const item of a.keys()) {
        if (!b.has(item)) {
            if (!aExtra(item)) {
                return false;
            }
        }
    }
    for (const item of b.keys()) {
        if (!a.has(item)) {
            if (!bExtra(item)) {
                return false;
            }
        }
    }
    return true;
}

export function isNeverField(
    repo: SchemaRepository,
    field: FieldSchema
): boolean {
    if (
        field.multiplicity === Multiplicity.Value &&
        field.types !== undefined
    ) {
        for (const type of field.types) {
            if (!isNeverTree(repo, repo.lookupTreeSchema(type))) {
                return false;
            }
        }
        // This field requires at least one child, and there are no types permitted in it that can exist,
        // so this is a never field (field which no sequence of children content could ever be in schema for)
        return true;
    }
    return false;
}

export function isNeverTree(repo: SchemaRepository, tree: TreeSchema): boolean {
    if (tree.extraLocalFields.multiplicity == Multiplicity.Value) {
        return true;
    }
    for (const field of tree.localFields.values()) {
        if (isNeverField(repo, field)) {
            return true;
        }
    }
    for (const field of tree.globalFields) {
        if (isNeverField(repo, repo.lookupGLobalFieldSchema(field))) {
            return true;
        }
    }

    return false;
}
