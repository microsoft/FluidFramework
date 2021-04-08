/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
import { PropertyFactory } from "@fluid-experimental/property-properties"

import { PropertyProxy } from './propertyProxy';
import { PropertyProxyErrors } from './errors';
import { Utilities } from './utilities';

/**
 * The function returns an iterator for {@link external::SetProperty}.
 * @param {ComponentSet} target The {@link ComponentMap} that holds a reference
 * to the {@link external:SetProperty SetProperty}.
 * @return {Iterator} An iterator.
 * @hidden
 */
const createSetIterator = (target) => function* () {
  const property = target.getProperty();
  const keys = property.getIds();
  for (let i = 0; i < keys.length; i++) {
    yield PropertyProxy.proxify(property.get(keys[i]));
  }
};

/**
 * ComponentSet extends Set in such a way that a referenced HFDM {@link external:SetProperty SetProperty}
 * can be modified and accessed directly.
 * @extends Set
 * @hidden
 */
class ComponentSet extends Set {
  /**
   * Sets the {@link external:SetProperty SetProperty} to operate on sets the Symbol.iterator attribute.
   * @param {external:SetProperty} property The {@link external:SetProperty SetProperty} to operate on.
   */
  constructor(property) {
    super();
    Object.defineProperty(this, 'property', { enumerable: false, value: property });
    this[Symbol.iterator] = createSetIterator(this);
  }

  /**
   * Retrieves the length of the array returned by {@link external:SetProperty#getIds} to infer
   * the size (number of entries).
   * @return {Number} The size of the {@link external:SetProperty SetProperty}.
   */
  get size() {
    return this.property.getIds().length;
  }

  /**
   * Returns the wrapped {@link external:SetProperty SetProperty} property.
   * @return {external:SetProperty} The wrapped {@link external:SetProperty SetProperty}.
   */
  getProperty() {
    return this.property;
  }

  /**
   * @inheritdoc
   */
  add(value) {
    let valueIsProperty = false;
    if (PropertyFactory.instanceOf(value, 'BaseProperty')) {
      valueIsProperty = true;
    } else {
      /* eslint-disable-next-line no-param-reassign */
      value = PropertyFactory.create(this.property.getTypeid(), 'single', value);
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
    Utilities.wrapWithPushPopModifiedEventScope(this.property, () => {
      this.property.clear();
    });
  }

  /**
   * @inheritdoc
   */
  delete(value) {
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
    const entriesIterator = function* () {
      for (let i = 0; i < keys.length; i++) {
        const proxy = PropertyProxy.proxify(this.property.get(keys[i]));
        yield [proxy, proxy];
      }
    };

    return entriesIterator.call(this);
  }

  /**
   * @inheritdoc
   */
  forEach(func) {
    const keys = this.property.getIds();
    for (let i = 0; i < keys.length; i++) {
      const value = PropertyProxy.proxify(this.property.get(keys[i]));
      func(value, value, this);
    }
  }

  /**
   * @inheritdoc
   */
  has(value) {
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
   * @param {external:NamedProperty} value The entry in the set for which a guid is queried.
   * @return {String} The guid of the passed {@link external:NamedProperty NamedProperty}.
   */
  _getGuid(value) {
    // HFDM set uses the guid field of NamedProperty for equality
    let guid = value.guid;
    // It might be that the user inserts a value ist not proxied
    if (!guid) {
      guid = value.getId();
    }
    // If there is still no valid guid
    if (!guid) {
      throw new Error(PropertyProxyErrors.INVALID_GUID);
    }
    return guid;
  }

  /**
   * Removes the entry with the passed guid from the wrapped {@link external:SetProperty SetProperty}.
   * @param {String} guid The guid of the entry to be removed.
   */
  _deleteById(guid) {
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
