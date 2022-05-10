/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* globals should, sinon, expect */
import { DataBinder } from '../data_binder/dataBinder';
import {
  DataBinding,
  onValuesChanged,
  onPathChanged,
  onPropertyChanged
} from '../data_binder/dataBinding';
import { catchConsoleErrors } from './catchConsoleError';
import { ModificationContext } from '../data_binder/modificationContext';
import { MockSharedPropertyTree } from './mockSharedPropertyTree';
import { BaseProperty, PropertyFactory } from '@fluid-experimental/property-properties';

describe('Decorated DataBinding', function() {
  catchConsoleErrors();
  let workspace, dataBinder;
  let testProp, dataBindingInstance;
  const infoTemplate = {
    properties: [
      { id: 'name', typeid: 'String' },
      { id: 'lastName', typeid: 'String' },
      { id: 'nickname', typeid: 'String' }
    ],
    typeid: 'test:personInfo-1.0.0'
  };

  const personTemplate = {
    inherits: ['test:personInfo-1.0.0'],
    properties: [
      { id: 'parent', typeid: 'test:personInfo-1.0.0' }
    ],
    typeid: 'test:person-1.0.0'
  };

  const createPerson = function() {
    return PropertyFactory.create(personTemplate.typeid);
  };

  const logData = [];
  const log = function(target, property, descriptor) {
    const original = descriptor.value;
    descriptor.value = jest.fn(function(...args) {
      let path = args[0].getAbsolutePath();
      if (path[0] === '/') {
        path = path.slice(1);
      }
      logData.push(property + ' ' + path);
      return original.apply(this, args);
    });
    return descriptor;
  };

  // A decorator which adds a spy to a class method. This spy is per class and not per instance.
  const spyDecorator = function(target, property, descriptor) {
    const original = descriptor.value;
    descriptor.value = jest.fn(function(...args) {
      return original.apply(this, args);
    });
    return descriptor;
  };

  /**
   * ES6 dataBindingInstance test class
   */
  class TestDataBindingClass extends DataBinding {

    /**
     * A callback to test the onPropertyChanged decorator registration.
     */
    @onPropertyChanged('name', ['modify'])
    @spyDecorator
    onPropertyRegisteredCallback() {
    }

    /**
     * Another callback to test the onPathChanged decorator registration.
     */
    @onPathChanged('lastName', ['modify'])
    @spyDecorator
    onPathRegisteredCallback() {
    }

    /**
     * Yet another callback to test the onValuesChanged decorator registration.
     */
    @onValuesChanged('nickname', ['modify'])
    @spyDecorator
    onValuesRegisteredCallback() {
    }

    /**
     * A callback to test if stacked registrations are feasible with decorators.
     */
    @onValuesChanged('parent.lastName', ['modify'])
    @onValuesChanged('parent.name', ['modify'])
    @spyDecorator
    commonCallback() {
    }

    /**
     * A callback to test if it is possible to register a decorated callback.
     * @param {ModificationContext} in_context The modification context
     */
    @onPathChanged('parent.lastName', ['modify'])
    @onPathChanged('parent.name', ['modify'])
    @log
    emptyCallback(in_context) {
    }

    /**
     * Another callback to showcase that decorator order matters.
     * @param {ModificationContext} in_context The modification context
     */
    @onPathChanged('parent.lastName', ['modify'])
    @log
    @onPathChanged('parent.name', ['modify'])
    anotherEmptyCallback(in_context) {
    }
  }

  beforeAll(async function() {
    PropertyFactory.register(personTemplate);
    PropertyFactory.register(infoTemplate);

    workspace = await MockSharedPropertyTree();
    dataBinder = new DataBinder();
    dataBinder.attachTo(workspace);
    dataBinder.register('View', personTemplate.typeid, TestDataBindingClass);
    testProp = createPerson();
    workspace.root.insert('person', testProp);
    dataBindingInstance = dataBinder.resolve('person', 'View');
  });

  it('should have instantiated a TestDataBindingClass data binding', function() {
    expect(dataBindingInstance).toBeDefined();
    expect(dataBindingInstance).toBeInstanceOf(TestDataBindingClass);
  });

  it('should call onPropertyChange callback', function() {
    dataBindingInstance = dataBinder.resolve('person', 'View');
    testProp.get(['name']).setValue('John Foo');
    expect(dataBindingInstance.onPropertyRegisteredCallback).toHaveBeenCalledTimes(1);
    expect(dataBindingInstance.onPropertyRegisteredCallback.mock.calls[0][0]).toBeInstanceOf(BaseProperty);
  });

  it('should call onPathRegisteredCallback callback', function() {
    testProp.get(['lastName']).setValue('Bar');
    expect(dataBindingInstance.onPathRegisteredCallback).toHaveBeenCalledTimes(1);
    expect(dataBindingInstance.onPathRegisteredCallback.mock.calls[0][0]).toBeInstanceOf(ModificationContext);
  });

  it('should call onValuesRegisteredCallback callback', function() {
    testProp.get(['nickname']).setValue('Johnnie');
    expect(dataBindingInstance.onValuesRegisteredCallback).toHaveBeenCalledTimes(1);
    expect(dataBindingInstance.onValuesRegisteredCallback.mock.calls[0][0]).toEqual(testProp.get(['nickname']).value);
  });

  it('should register commonCallback for each of the stacked calls of the registration decorators', function() {
    let new_value = 'John Foobar';
    testProp.get(['parent', 'name']).setValue(new_value);
    expect(dataBindingInstance.commonCallback.mock.calls[0][0]).toEqual(new_value);
    new_value = 'Bar';
    testProp.get(['parent', 'lastName']).setValue(new_value);
    expect(dataBindingInstance.commonCallback.mock.calls[1][0]).toEqual(new_value);
    expect(dataBindingInstance.commonCallback).toHaveBeenCalledTimes(2);
  });

  it('should call decorated callbacks if some decorator changes the callback', function() {
    // Assuming a callback changes the callback function, e.g. a simple logging decorator,
    // the decorated callback should be registered. This is based on decorator order as callbacks are
    // chained.
    // @f
    // @g
    // @method
    // is evaluated as f(g(method))
    // if g doesn't change the methods descriptor value f(g(method)) will be f(method). This is why we can
    // stack our registration callbacks as they do not modify the descriptor.

    // logDecoratorSpy.mockClear();
    dataBindingInstance.emptyCallback.mockClear();
    dataBindingInstance.anotherEmptyCallback.mockClear();
    logData.length = 0;
    let new_value = 'John Foobartoo';
    testProp.get(['parent', 'name']).setValue(new_value);
    // only emptyCallback is log decorated for parent.name and contains a spy
    // as @log is underneath the corresponding registration callback.
    expect(dataBindingInstance.emptyCallback).toHaveBeenCalledTimes(1);
    expect(logData.length).toEqual(1);
    expect(logData[0]).toEqual('emptyCallback person.parent.name');
    new_value = 'Foobarthree';
    testProp.get(['parent', 'lastName']).setValue(new_value);
    // emptyCallback and anotherEmptyCallback are bot log decorated for parent.lastName
    // as @log is underneath the registration decorator.
    expect(dataBindingInstance.emptyCallback).toHaveBeenCalledTimes(2);
    expect(dataBindingInstance.anotherEmptyCallback).toHaveBeenCalledTimes(1);
    expect(logData.length).toEqual(3);
    // should be in this order as we registered the emptyCallback callback first
    expect(logData[1]).toEqual('emptyCallback person.parent.lastName');
    expect(logData[2]).toEqual('anotherEmptyCallback person.parent.lastName');
  });

  it('should trigger the callback once', function() {
    const anotherPerson = createPerson();
    workspace.root.insert('anotherPerson', anotherPerson);
    const anotherDataBindingInstance = dataBinder.resolve('anotherPerson', 'View');
    // We need to reset the spy, as it is per class and was already called for our dataBindingInstance.
    anotherDataBindingInstance.onPropertyRegisteredCallback.mockClear();
    expect(anotherDataBindingInstance.onPropertyRegisteredCallback).toHaveBeenCalledTimes(0);
    expect(dataBindingInstance.onPropertyRegisteredCallback).toHaveBeenCalledTimes(
      anotherDataBindingInstance.onPropertyRegisteredCallback.mock.calls.length);
    anotherPerson.get(['name']).setValue('Jack Foobar');
    expect(anotherDataBindingInstance.onPropertyRegisteredCallback).toHaveBeenCalledTimes(1);
  });

  it('Documentation example - onValuesChanged decorator', function() {
    /* eslint-disable require-jsdoc */
    // SnippetStart{onValueDecorator}
    var orderEntrySchema = {
      typeid: 'autodesk.samples:orderEntry-1.0.0',
      properties: [
        { id: 'productId', typeid: 'String' },
        { id: 'quantity', typeid: 'Int64' },
        { id: 'price', typeid: 'Float64' }
      ]
    };

    const eventLog = [];
    class OrderEntryDataBinding extends DataBinding {
      // Callback called when the 'quantity' sub-property is created/changed
      @onValuesChanged('quantity', ['insert', 'modify'])
      changeQuantity(value) {
        eventLog.push('Quantity changed: ' + value);
      }

      // Callback called when the 'price' sub-property is created/changed
      @onValuesChanged('price', ['insert', 'modify'])
      changePrice(value) {
        eventLog.push('Price changed: ' + value);
      }
    }
    // SnippetEnd{onValueDecorator}
    /* eslint-enable require-jsdoc */

    PropertyFactory.register(orderEntrySchema);
    dataBinder.register('MODEL', orderEntrySchema.typeid, OrderEntryDataBinding);
    const order = PropertyFactory.create(orderEntrySchema.typeid);
    workspace.root.insert('order', order);

    expect(eventLog.length).toEqual(2);
    order.get('price').setValue(100);
    expect(eventLog.length).toEqual(3);
    order.get('quantity').setValue(100);
    expect(eventLog.length).toEqual(4);
  });
});
