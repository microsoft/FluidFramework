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
export type SchemaIdentifier = string & {
    readonly SchemaIdentifier: "3965006b-66d0-41d6-bb04-bd6873b528b4";
};

/**
 * SchemaIdentifier for a Tree.
 * Also known as "Definition"
 */
export type TreeSchemaIdentifier = SchemaIdentifier & {
    readonly TreeSchemaIdentifier: "ffc4b4b6-a4d8-4479-9636-fe6c6a1a4a7f";
};

/**
 * Key / Name / Label for a field which is scoped to a specific TreeSchema.
 */
export type LocalFieldKey = string & {
    readonly TreeSchemaIdentifier: "1108736b-ebb5-4924-9a25-d4dbabd83fc5";
};

/**
 * SchemaIdentifier for a Field "global field",
 * meaning a field which has the same meaning for all usages withing the document (not scoped to a specific TreeSchema like LocalFieldKey).
 *
 * Note that the implementations should ensure that GlobalFieldKeys can never collide with LocalFieldKeys.
 * This can either be done in several ways
 * (keeping the two classes of fields separate, namespaceing/escaping, compressing one into numbers and leaving the other strings, etc.)
 */
export type GlobalFieldKey = SchemaIdentifier & {
    readonly TreeSchemaIdentifier: "7cc802f9-3360-4176-bbbf-cab23320d80b";
};

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
     * The set of allowed child types.
     * Providing multiple values here allows polymorphism, tagged union style.
     *
     * If not specified, child types are unconstrained (equivalent to the set containing every TreeSchemaIdentifier defined in the document).
     * Note that even when unconstrained, children must still be in-schema for their own type.
     *
     * In the future, this could be extended to allow inlining a TreeSchema here (or some similar structural schema system).
     * For structural types which could go here, there are a few interesting options:
     * - Allow replacing the whole set with a structural type for terminal / non-tree data, and use this as a replacement for values on the tree nodes.
     * - Allow expression structural constraints for child trees, for example requiring specific traits (ex: via TreeSchema), instead of by type.
     * There are two ways this could work:
     *      - Constrain the child nodes based on their shape: this makes schema safe editing difficult because nodes would incur extra editing constraints to prevent them from going out of schema based on their location in such a field.
     *      - Constrain the types allowed based on which types guarantee their data will always meet the constraints. Care would need to be taken to make sure this is sound for the schema updating mechanisms.
     */
    readonly types?: ReadonlySet<TreeSchemaIdentifier>;
}

export interface TreeSchema {
    /**
     * Schema for fields with keys scoped to this TreeSchema.
     *
     * This refers to the FieldSchema directly (as opposed to just supporting FieldSchemaIdentifier and having a central FieldKey -> FieldSchema map).
     * This allows os short friendly field keys which can ergonomically used as field names in code.
     * It also interoperates well with extraLocalFields being used as a map with arbitrary data as keys.
     */
    readonly localFields: ReadonlyMap<LocalFieldKey, FieldSchema>;

    /**
     * Schema for fields with keys scoped to the whole document.
     *
     * Having a centralized map indexed by FieldSchemaIdentifier can be used for fields which have the same meaning in multiple places,
     * and simplifies document root handling (since the root can just have a special `FieldSchemaIdentifier`).
     */
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

    /**
     * If true, GlobalFieldKeys other than the ones listed above in globalFields may be used to store data on this tree node.
     * Such fields must still be in schema with their global FieldSchema.
     */
    readonly extraGlobalFields: boolean;

    /**
     * There are several approaches for how to store actual data in the tree (special node types, special field contents, data on nodes etc.)
     * as well as several options about how the data should be modeled at this level (byte sequence? javascript type? json?),
     * as well as options for how much of this would be exposed in the schema language (ex: would all nodes with values be special built-ins, or could any schema add them?)
     *
     * A simple easy to do in javascript approach is taken here: this is not intended to be a suggestion of what approach to take, or what to expose in the schema language.
     * This is simply one approach that can work for modeling them in the internal schema representation.
     */
    readonly value: ValueSchema;
}

export interface Named<TName> {
    readonly name: TName;
}

export type NamedTreeSchema = TreeSchema & Named<TreeSchemaIdentifier>;

export interface SchemaRepository {
    /**
     * All fields with the specified GlobalFieldKey must comply with the returned schema.
     */
    lookupGlobalFieldSchema(key: GlobalFieldKey): FieldSchema;

    /**
     * All trees with the specified identifier must comply with the returned schema.
     */
    lookupTreeSchema(identifier: TreeSchemaIdentifier): TreeSchema;

    readonly globalFieldSchema: ReadonlyMap<GlobalFieldKey, FieldSchema>;
    readonly treeSchema: ReadonlyMap<TreeSchemaIdentifier, TreeSchema>;
}

export const emptySet: ReadonlySet<never> = new Set();
export const emptyMap: ReadonlyMap<any, never> = new Map<any, never>();

/**
 * Default field which only permits emptiness.
 */
export const emptyField: FieldSchema = {
    multiplicity: Multiplicity.Forbidden,
    types: emptySet,
};

/**
 * FieldSchema which is impossible for any data to be in schema with.
 */
export const neverField: FieldSchema = {
    multiplicity: Multiplicity.Value,
    types: emptySet,
};

/**
 * TreeSchema which is impossible for any data to be in schema with.
 */
export const neverTree: TreeSchema = {
    localFields: emptyMap,
    globalFields: emptySet,
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
    localFields: emptyMap,
    globalFields: emptySet,
    extraLocalFields: anyField,
    extraGlobalFields: true,
    value: ValueSchema.Serializable,
};

/**
 * Example in memory SchemaRepository showing how stored schema could work.
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
 *
 * This approach means that stored schema can be updated to permit data in new formats without having to look at any document content.
 * This is valuable for large document scenarios where no user has the entire document loaded, but still need to add some new types to the document.
 *
 * The ergonomics issues caused by the stored schema permitting all old date-formats can be addressed be using a schema on read system (schematize)
 * to apply a more restricted "view schema" when reading document content.
 *
 * The above design pattern (combining stored and view schema this way to support partial checkouts with stored schema that can be updated)
 * is the intended usage pattern for typical users, but other configurations of these systems are possible:
 * Systems which have access to the document content could permit additional kinds of schema changes.
 * For example, a system which keeps the whole document in memory, or is willing to page through all the data when doing the change could permit:
 * - arbitrary schema changes as long as all the data currently complies
 * - schema changes coupled with instructions for how to updated old data
 * While this is possible, it is not the focus of this design since such users have strictly less implementation constraints.
 */
export class StoredSchemaRepository implements SchemaRepository {
    /**
     * For now, the schema are just scored in maps.
     * There are a couple reasons we might not want this simple solution long term:
     * 1. We might want an easy/fast copy.
     * 2. We might want a way to reserve a large namespace of schema with the same schema.
     * The way extraFields has been structured mitigates the need for this, but it still might be useful.
     *
     * (ex: someone using data as field identifiers might want to reserve all fields identifiers starting with "foo." to have a specific schema).
     * Combined with support for such namespaces in the allowed sets in the schema objects, that might provide a decent alternative to extraFields (which is a bit odd).
     */
    private readonly fields: Map<GlobalFieldKey, FieldSchema> = new Map();
    private readonly trees: Map<TreeSchemaIdentifier, TreeSchema> = new Map();

    public get globalFieldSchema(): ReadonlyMap<GlobalFieldKey, FieldSchema> {
        return this.fields;
    }

    public get treeSchema(): ReadonlyMap<TreeSchemaIdentifier, TreeSchema> {
        return this.trees;
    }

    public lookupGlobalFieldSchema(identifier: GlobalFieldKey): FieldSchema {
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
        identifier: GlobalFieldKey,
        schema: FieldSchema
    ): boolean {
        if (
            allowsFieldSuperset(
                this,
                this.lookupGlobalFieldSchema(identifier),
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
                    repo.lookupGlobalFieldSchema(originalField),
                    emptyField
                ),
            // true iff the new field can be empty, since it may be empty in original
            (supersetField) =>
                allowsFieldSuperset(
                    repo,
                    emptyField,
                    repo.lookupGlobalFieldSchema(supersetField)
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
                    superset.localFields.get(supersetField)
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
    originalRepo: SchemaRepository,
    original: FieldSchema,
    superset: FieldSchema
): boolean {
    if (isNeverField(originalRepo, original)) {
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
 *
 * A version of this that assumes a specific root field could be slightly more permissive in some simple cases,
 * however if any extra fields and fields with unconstrained types are reachable, it would have to compare everything anyway.
 */
export function allowsRepoSuperset(
    original: SchemaRepository,
    superset: SchemaRepository
): boolean {
    for (const [key, schema] of original.globalFieldSchema) {
        // TODO: I think its ok to use the field from superset here, but I should confirm it is, and document why.
        if (
            !allowsFieldSuperset(
                original,
                schema,
                superset.lookupGlobalFieldSchema(key)
            )
        ) {
            return false;
        }
    }
    for (const [key, schema] of original.treeSchema) {
        // TODO: I think its ok to use the tree from superset here, but I should confirm it is, and document why.
        if (
            !allowsTreeSuperset(
                original,
                schema,
                superset.lookupTreeSchema(key)
            )
        ) {
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
        if (isNeverField(repo, repo.lookupGlobalFieldSchema(field))) {
            return true;
        }
    }

    return false;
}

export enum Compatibility {
    Compatible,
    RequiresAdapters,
    Incompatible,
}

export type Adapters = {}; // TODO

/**
 * Determines the compatibility of a stored document (based on its stored schema) with a viewer (based on its view schema).
 *
 * Adapters can be provided to handle differences between the two schema.
 *
 * TODO: this API violates the parse don't validate design philosophy. It should be wrapped with (or replaced by) a parse style API.
 */
export function checkCompatibility(
    stored: SchemaRepository,
    view: SchemaRepository,
    adapters: Adapters
): {
    read: Compatibility;
    write: Compatibility;
    writeAllowingStoredSchemaUpdates: Compatibility;
} {
    // TODO: use adapters
    const read = allowsRepoSuperset(stored, view)
        ? Compatibility.Compatible
        : Compatibility.Incompatible;
    const write = allowsRepoSuperset(view, stored)
        ? Compatibility.Compatible
        : Compatibility.Incompatible;

    // TODO: compute this (and maybe include the set of schema changes needed for it?).
    // Maybe updates would happen lazily when needed to store data?
    // When willingness to updates can avoid need for some adapters, how should it be decided if the adapter should be used to avoid the update?
    const writeAllowingStoredSchemaUpdates = write;

    return { read, write, writeAllowingStoredSchemaUpdates };
}
