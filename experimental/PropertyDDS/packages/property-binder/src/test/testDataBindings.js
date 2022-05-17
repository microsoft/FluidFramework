/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* globals sinon */
import { DataBinding } from '../data_binder/dataBinding';

// Define the DataBinding classes. Must be done here due to the inheritance

/**
 * @class
 */
class ParentDataBinding extends DataBinding {
  /**
   * @inheritDoc
   */
  constructor(params) {
    super(params);
    var that = this;

    this.params = params;
    this.onPreModify = jest.fn();
    this.onModify = jest.fn();
    this.onPreRemove = jest.fn();
    this.onRemove = jest.fn(function(in_removalContext) {
      // Make sure, we always have a symmetric number of preRemove calls
      expect(that.onPreRemove).toHaveBeenCalledTimes(1);
    });

    this.onPostCreate = jest.fn();
  }
}
ParentDataBinding.prototype.__debuggingName = 'ParentDataBinding';

/**
 * @class
 */
class DerivedDataBinding extends ParentDataBinding {
}

DerivedDataBinding.prototype.__debuggingName = 'DerivedDataBinding';

/**
 * @class
 */
class DerivedDerivedDataBinding extends DerivedDataBinding {
}

DerivedDerivedDataBinding.prototype.__debuggingName = 'DerivedDerivedDataBinding';

/**
 * @class
 */
class ChildDataBinding extends DataBinding {
  /**
   * @inheritDoc
   */
  constructor(params) {
    super(params);
    var that = this;

    this.params = params;

    this.onPreModify = jest.fn();
    this.onModify = jest.fn();
    this.onPreRemove = jest.fn();
    this.onRemove = jest.fn(function(in_removalContext) {
      // Make sure, we always have a symmetric number of preRemove calls
      expect(that.onPreRemove).toHaveBeenCalledTimes(1);
    });

    this.onPostCreate = jest.fn();
  }
}
ChildDataBinding.prototype.__debuggingName = 'ChildDataBinding';

/**
 * @class
 */
class PrimitiveChildrenDataBinding extends DataBinding {
  /**
   * @inheritDoc
   */
  constructor(params) {
    super(params);
    var that = this;

    this.params = params;

    this.onPreModify = jest.fn();
    this.onModify = jest.fn();
    this.onPreRemove = jest.fn();
    this.onRemove = jest.fn(function(in_removalContext) {
      // Make sure, we always have a symmetric number of preRemove calls
      expect(that.onPreRemove).toHaveBeenCalledTimes(1);
    });

    this.onPostCreate = jest.fn();
  }
}

PrimitiveChildrenDataBinding.prototype.__debuggingName = 'PrimitiveChildrenDataBinding';

/**
 * @class
 */
class InheritedChildDataBinding extends DataBinding {
  /**
   * @inheritDoc
   */
  constructor(params) {
    super(params);
    var that = this;

    this.params = params;

    this.onPreModify = jest.fn();
    this.onModify = jest.fn();
    this.onPreRemove = jest.fn();
    this.onRemove = jest.fn(function(in_removalContext) {
      // Make sure, we always have a symmetric number of preRemove calls
      expect(that.onPreRemove).toHaveBeenCalledTimes(1);
    });

    this.onPostCreate = jest.fn();
  }
}

InheritedChildDataBinding.prototype.__debuggingName = 'InheritedChildDataBinding';

export {
  ParentDataBinding,
  DerivedDataBinding,
  DerivedDerivedDataBinding,
  ChildDataBinding,
  PrimitiveChildrenDataBinding,
  InheritedChildDataBinding
};
