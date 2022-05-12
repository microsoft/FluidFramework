/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { NamedProperty, PropertyFactory, SetProperty } from "@fluid-experimental/property-properties";

import { PropertyProxy } from "./propertyProxy";
import { PropertyProxyErrors } from "./errors";
import { forceType, Utilities } from "./utilities";

/**
 * The function returns an iterator for {@link external::SetProperty}.
 * @param target The {@link ComponentSet} that holds a reference
 * to the {@link external:SetProperty SetProperty}.
 * @return An iterator.
 * @hidden
 */
const createSetIterator = (target: ComponentSet) => function*() {
    const property = target.getProperty();
    const keys = property.getIds();
    for (const key of keys) {
        const property_to_proxy = property.get(key);
        if (property_to_proxy) {
            yield PropertyProxy.proxify(property_to_proxy);
        } else {
            throw new Error(PropertyProxyErrors.INVALID_PROPERTY);
        }
    }
};

/**
 * ComponentSet extends Set in such a way that a referenced {@link external:SetProperty SetProperty}
 * can be modified and accessed directly.
 * @extends Set
 * @hidden
 */
class ComponentSet extends Set {
    // workaround, necessary for typescript to handle Object.defineProperty
    // https://github.com/microsoft/TypeScript/issues/28694
    private readonly property!: SetProperty;
    /**
     * Sets the {@link external:SetProperty SetProperty} to operate on sets the Symbol.iterator attribute.
     * @param property The {@link external:SetProperty SetProperty} to operate on.
     */
    constructor(property: SetProperty) {
        super();
        Object.defineProperty(this, "property", { enumerable: false, value: property });
        this[Symbol.iterator] = createSetIterator(this);
    }

    /**
     * Retrieves the length of the array returned by {@link external:SetProperty#getIds} to infer
     * the size (number of entries).
     * @return The size of the {@link external:SetProperty SetProperty}.
     */
    get size() {
        return this.property.getIds().length;
    }

    /**
     * Returns the wrapped {@link external:SetProperty SetProperty} property.
     * @return The wrapped {@link external:SetProperty SetProperty}.
     */
    getProperty() {
        return this.property;
    }

    /**
     * @inheritdoc
     */
    add(value: NamedProperty) {
        let valueIsProperty = false;
        if (PropertyFactory.instanceOf(value, "BaseProperty")) {
            valueIsProperty = true;
        } else {
            /* eslint-disable-next-line no-param-reassign */
            value = PropertyFactory.create(this.property.getTypeid(), "single", value);
        }

        // Only delete if value is already a property
        if (valueIsProperty) {
            this.delete(value);
        }
        this.property.insert(value);

        return this;
    }

    /**
     * @inheritdoc
     */
    clear() {
        Utilities.wrapWithPushPopNotificationDelayScope(this.property, () => {
            this.property.clear();
        });
    }

    /**
     * @inheritdoc
     */
    delete(value: NamedProperty) {
        if (!this.has(value)) {
            return false;
        }

        const guid = this._getGuid(value);
        this._deleteById(guid);
        return true;
    }

    /**
     * @inheritdoc
     */
    entries() {
        const keys = this.property.getIds();
        const entriesIterator = function*(this: ComponentSet): Generator<[any, any]> {
            for (const key of keys) {
                const property_to_proxy = this.property.get(key);
                if (property_to_proxy) {
                    const proxy = PropertyProxy.proxify(property_to_proxy);
                    yield [proxy, proxy];
                } else {
                    throw new Error(PropertyProxyErrors.INVALID_PROPERTY);
                }
            }
        };

        return entriesIterator.call(this);
    }

    /**
     * @inheritdoc
     */
    forEach(func: (value, key, set) => void) {
        const keys = this.property.getIds();
        for (const key of keys) {
            const property_to_proxy = this.property.get(key);
            if (property_to_proxy) {
                const value = PropertyProxy.proxify(property_to_proxy);
                func(value, value, this);
            } else {
                throw new Error(PropertyProxyErrors.INVALID_PROPERTY);
            }
        }
    }

    /**
     * @inheritdoc
     */
    has(value: NamedProperty) {
        const guid = this._getGuid(value);
        return this.property.has(guid);
    }

    /**
     * @inheritdoc
     */
    values() {
        return createSetIterator(this)();
    }

    /**
     * Obtains the guid from a {@link external:NamedProperty NamedProperty} that is
     * part of a {@link external:SetProperty SetProperty}.
     * @param value The entry in the set for which a guid is queried.
     * @return The guid of the passed {@link external:NamedProperty NamedProperty}.
     */
    // TODO(marcus): inline interface is a workaround it represents a proxy of NamedProperty that
    // should have a field guid
    _getGuid(value: NamedProperty | { guid?: string; }) {
        // The set property uses the guid field of NamedProperty for equalit
        let guid: string | undefined;

        if ("guid" in value) {
            guid = value.guid;
        }
        // It might be that the user inserts a value ist not proxied
        if (guid === undefined && forceType<NamedProperty>(value)) {
            guid = value.getId();
        }
        // If there is still no valid guid
        if (guid === undefined) {
            throw new Error(PropertyProxyErrors.INVALID_GUID);
        }
        return guid;
    }

    /**
     * Removes the entry with the passed guid from the wrapped {@link external:SetProperty SetProperty}.
     * @param guid The guid of the entry to be removed.
     */
    _deleteById(guid: string) {
        this.property.remove(guid);
    }

    /**
     * @inheritdoc
     */
    toJSON() {
        return {};
    }
}

export { ComponentSet };
