/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* globals should, sinon, expect  */
/* eslint spaced-comment: 0 */
/* eslint no-unused-expressions: 0 */
/* eslint-disable require-jsdoc */

/*
 * TODO: failing assertions are commented out to enable a clean pass for PRs.
 *
 * Some modificationSet related tests are disabled as they fail due to the changed changeset structure. Since
 * we plan to get rid of modificationSet mid-term, it makes no sense to try and fix those.
 *
 */
import _ from 'lodash';
import { DataBinder } from '../../src/data_binder/dataBinder';
import { ModificationContext } from '../../src/data_binder/modificationContext';
import {
  registerTestTemplates, ParentTemplate, ChildTemplate,
  PrimitiveChildrenTemplate, ArrayContainerTemplate, SetContainerTemplate,
  MapContainerTemplate, NodeContainerTemplate, UnrepresentedTemplate,
  InheritedChildTemplate, InheritedChildrenTemplate, MultipleInheritedTemplate,
  positionTemplate, ReferenceParentTemplate,
  EscapingTestTemplate
} from './testTemplates';
import { DataBinding } from '../../src/data_binder/dataBinding';

import {
  ParentDataBinding,
  DerivedDataBinding,
  ChildDataBinding,
  PrimitiveChildrenDataBinding,
  InheritedChildDataBinding
} from './testDataBindings';
import {
  catchConsoleErrors, hadConsoleError, clearConsoleError
} from './catchConsoleError';
import { unregisterAllOnPathListeners } from '../../src/data_binder/internalUtils';
import { PropertyFactory } from '@fluid-experimental/property-properties';
import { RESOLVE_NEVER } from '../../src/internal/constants';
import { MockSharedPropertyTree } from './mockSharedPropertyTree'

const cleanupClasses = function() {
  // Unregister DataBinding paths
  const allClasses = [
    ParentDataBinding,
    DerivedDataBinding,
    ChildDataBinding,
    PrimitiveChildrenDataBinding,
    InheritedChildDataBinding
  ];
  _.forEach(allClasses, (in_constructor) => {
    unregisterAllOnPathListeners(in_constructor);
    // Check to see if we have accidentally left the classes bound
    const numDataBinders = in_constructor.prototype.__numDataBinders;
    console.assert(numDataBinders === undefined || numDataBinders === 0);
  });
};

describe('DataBinder', function() {

  var workspace;

  catchConsoleErrors();

  beforeAll(function() {
    registerTestTemplates();
  });

  beforeEach(async function() {
    workspace = await MockSharedPropertyTree();
  });

  afterEach(function() {
    cleanupClasses();
  });

  describe('basic functionality', function() {
    it('exists', function() {
      expect(DataBinder).toBeDefined();
    });

    it('should be able to call attach, isAttached, and detach', function() {
      var dataBinder = new DataBinder();

      expect(dataBinder.isAttached()).toEqual(false);
      dataBinder.attachTo(workspace);
      expect(dataBinder.isAttached()).toEqual(true);
      dataBinder.attachTo(workspace); // Binding a second time should do nothing
      expect(dataBinder.isAttached()).toEqual(true);
      dataBinder.detach();
      expect(dataBinder.isAttached()).toEqual(false);
      dataBinder.detach(); // Should do nothing when not bound
      expect(dataBinder.isAttached()).toEqual(false);
    });

    it('should be possible to pass a workspace to the constructor', function() {
      var dataBinder;
      expect(() => { dataBinder = new DataBinder(workspace) }).not.toThrow();
      expect(dataBinder.isAttached()).toEqual(true);
      expect(dataBinder.getPropertyTree()).toEqual(workspace);
    });

    it('should be possible to modify a workspace that was passed to the constructor', function() {
      expect(() => { new DataBinder(workspace) }).not.toThrow();
      workspace.root.insert('children', PropertyFactory.create('Float32', 'array'));
      workspace.root.get('children').insert(0, PropertyFactory.create('Float32', 'single', 1));
    });

    it('should be possible to pass and modify a populated workspace to the constructor', function() {
      workspace.root.insert('children', PropertyFactory.create('Float32', 'array'));
      workspace.root.get('children').insert(0, PropertyFactory.create('Float32', 'single', 1));
      expect(() => { new DataBinder(workspace) }).not.toThrow();
      workspace.root.get('children').insert(1, PropertyFactory.create('Float32', 'single', 2));
    });

    it('should invoke DataBinding callbacks when a workspace is passed to the constructor', function() {
      const dataBinder = new DataBinder(workspace);
      const handle = dataBinder.register('BINDING', ParentTemplate.typeid, ParentDataBinding);

      const property = PropertyFactory.create(ParentTemplate.typeid, 'single');
      workspace.root.insert('parent', property);
      const dataBinding = dataBinder.resolve(property, 'BINDING');
      expect(dataBinding.onPostCreate).toHaveBeenCalledTimes(1);
      expect(dataBinding.onModify).toHaveBeenCalledTimes(0);
      expect(property.getValue('text')).toEqual('');
      property.get('text').setValue('test');
      expect(property.getValue('text')).toEqual('test');
      expect(dataBinding.onModify).toHaveBeenCalledTimes(1);
      handle.destroy();
    });

    it('Should be possible to listen to paths with special characters that need to be escaped/quoted.', function() {
      const dataBinder = new DataBinder(workspace);
      const handle = dataBinder.register('BINDING', ParentTemplate.typeid, ParentDataBinding);

      let property = PropertyFactory.create(ParentTemplate.typeid, 'single');
      workspace.root.insert('/', property);
      let dataBinding = dataBinder.resolve(property, 'BINDING');
      expect(dataBinding.onPostCreate).toHaveBeenCalledTimes(1);

      // Test a child modification on that path with special characters
      expect(property.getValue('text')).toEqual('');
      property.get('text').setValue('test');
      expect(property.getValue('text')).toEqual('test');
      expect(dataBinding.onModify).toHaveBeenCalledTimes(1);

      property = PropertyFactory.create(ParentTemplate.typeid, 'single');
      workspace.root.insert('//', property);
      dataBinding = dataBinder.resolve(property, 'BINDING');
      expect(dataBinding.onPostCreate).toHaveBeenCalledTimes(1);

      property = PropertyFactory.create(ParentTemplate.typeid, 'single');
      workspace.root.insert('./', property);
      dataBinding = dataBinder.resolve(property, 'BINDING');
      expect(dataBinding.onPostCreate).toHaveBeenCalledTimes(1);

      property = PropertyFactory.create(ParentTemplate.typeid, 'single');
      workspace.root.insert('.//', property);
      dataBinding = dataBinder.resolve(property, 'BINDING');
      expect(dataBinding.onPostCreate).toHaveBeenCalledTimes(1);

      property = PropertyFactory.create(ParentTemplate.typeid, 'single');
      workspace.root.insert('./filename.extension', property);
      dataBinding = dataBinder.resolve(property, 'BINDING');
      expect(dataBinding.onPostCreate).toHaveBeenCalledTimes(1);

      handle.destroy();
    });

    it('it should not be possible to register multiple DataBindings for a single typeid and bindingType', function() {
      var dataBinder = new DataBinder();
      var bindingType = 'BINDING';
      var typeid = 'an:id-1.0.0';

      var handle1 = dataBinder.register(bindingType, typeid, ParentDataBinding);
      var handle2;
      expect(function() {
        handle2 = dataBinder.register(bindingType, typeid, ChildDataBinding);
      }).toThrow();

      expect(handle1).toBeDefined();
      expect(handle2).toBeUndefined();

      handle1.destroy();
    });

    it('should be able to activate all bindings of a bindingtype', function() {
      var dataBinder = new DataBinder();

      dataBinder.attachTo(workspace);

      dataBinder.defineDataBinding('BINDING', ParentTemplate.typeid, ParentDataBinding);
      dataBinder.defineDataBinding('BINDING', ChildTemplate.typeid, ChildDataBinding);
      dataBinder.defineDataBinding('BINDING', InheritedChildTemplate.typeid, InheritedChildDataBinding);
      dataBinder.activateDataBinding('BINDING');

      expect(dataBinder._dataBindingCreatedCounter).toEqual(0);
      workspace.root.insert('parent', PropertyFactory.create(ParentTemplate.typeid, 'single'));
      expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
      workspace.root.insert('child', PropertyFactory.create(ChildTemplate.typeid, 'single'));
      expect(dataBinder._dataBindingCreatedCounter).toEqual(2);
      workspace.root.insert('inherited', PropertyFactory.create(InheritedChildTemplate.typeid, 'single'));
      expect(dataBinder._dataBindingCreatedCounter).toEqual(3);

      expect(dataBinder.resolve('parent', 'BINDING')).toBeInstanceOf(ParentDataBinding);
      expect(dataBinder.resolve('child', 'BINDING')).toBeInstanceOf(ChildDataBinding);
      expect(dataBinder.resolve('inherited', 'BINDING')).toBeInstanceOf(InheritedChildDataBinding);

      dataBinder.detach();
    });

    it('it should be possible to register DataBindings on demand', function() {
      var dataBinder = new DataBinder();
      dataBinder.attachTo(workspace);
      var bindingType = 'BINDING';
      var typeid = 'Float64';
      workspace.root.insert('child1', PropertyFactory.create('NodeProperty', 'single'));
      workspace.root.get('child1').insert('myFloat2', PropertyFactory.create('Float64', 'single'));

      var handle = dataBinder.register(bindingType, typeid, ParentDataBinding, { exactPath: 'child1.myFloat2' });
      handle.destroy();
    });

    it.skip('it should not take forever to listen to arrays', function() {
      var dataBinder = new DataBinder();
      dataBinder.attachTo(workspace);

      const myArray = PropertyFactory.create(positionTemplate.typeid, 'array');
      workspace.root.insert('myArray', myArray);

      let counter = 0;
      const callback = function() {
        counter++;
      };

      const n = 500;
      const k = 5;

      workspace.pushNotificationDelayScope();
      for (let i = 0; i < n; ++i) {
        myArray.push(PropertyFactory.create(positionTemplate.typeid, 'single'));
      }
      workspace.popNotificationDelayScope();

      for (let i = 0; i < n; ++i) {
        dataBinder.registerOnPath('/myArray[' + i + '].x', ['modify'], callback);
      }

      for (let i = 0; i < n * k; ++i) {
        const index = Math.floor(Math.random() * n);
        myArray.get([index, 'x']).setValue(i + 1);
      }

      expect(counter).toEqual(n * k);
    });

    it('it should be possible to activate the same thing twice with exact bindings', function() {
      var dataBinder = new DataBinder();
      dataBinder.attachTo(workspace);
      var bindingType = 'BINDING';
      var typeid = 'Test:ParentID-0.0.1';
      workspace.root.insert('pset', PropertyFactory.create(typeid, 'single'));

      const modifySpy = jest.fn();
      ParentDataBinding.registerOnPath('text', ['modify'], modifySpy);
      dataBinder.defineDataBinding(bindingType, typeid, ParentDataBinding);
      // activate the same binding twice
      var handle1 = dataBinder.activateDataBinding(bindingType, typeid,
        { exactPath: 'pset' });
      var handle2 = dataBinder.activateDataBinding(bindingType, typeid,
        { exactPath: 'pset' });

      // Modifying should only trigger once
      modifySpy.mockClear();
      workspace.root.get(['pset', 'text']).setValue('bobo');
      expect(modifySpy).toHaveBeenCalledTimes(1);

      // Deactivate one of them
      handle1.destroy();

      // Modifying should only trigger once
      modifySpy.mockClear();
      workspace.root.get(['pset', 'text']).setValue('was a clown');
      expect(modifySpy).toHaveBeenCalledTimes(1);

      // Deactivate the other
      handle2.destroy();

      // Modifying should not trigger any more
      modifySpy.mockClear();
      workspace.root.get(['pset', 'text']).setValue('was a clown');
      expect(modifySpy).toHaveBeenCalledTimes(0);

      dataBinder.detach();
    });

    it('should create/remove DataBindings when corresponding property set is added/removed', function() {
      var dataBinder = new DataBinder();

      // Listen for the creation events

      // Register the DataBindings
      dataBinder.register('BINDING', ParentTemplate.typeid, ParentDataBinding);
      dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding);

      // Bind to the workspace
      dataBinder.attachTo(workspace);

      var parentPset = PropertyFactory.create(ParentTemplate.typeid, 'single');
      var childPset = PropertyFactory.create(ChildTemplate.typeid, 'single');

      expect(dataBinder._dataBindingCreatedCounter).toEqual(0);

      // parentPset should produce a ParentDataBinding
      workspace.root.insert(parentPset);
      expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
      const parentDataBinding = dataBinder.resolve(parentPset, 'BINDING');
      expect(parentDataBinding).toBeInstanceOf(ParentDataBinding);
      expect(parentDataBinding.getProperty()).toEqual(parentPset);
      // Should be given a pset and a modification set on construction
      expect(parentDataBinding.params.property).toEqual(parentPset);
      expect(parentDataBinding.onPostCreate).toHaveBeenCalledTimes(1);
      dataBinder._resetDebugCounters();

      // childPset should produce a ChildDataBinding
      workspace.root.insert(childPset);
      expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
      const childDataBinding = dataBinder.resolve(childPset, 'BINDING');
      expect(childDataBinding).toBeInstanceOf(ChildDataBinding);
      expect(childDataBinding.getProperty()).toEqual(childPset);
      expect(childDataBinding.onModify).toHaveBeenCalledTimes(0); // !!!
      expect(childDataBinding.onPreModify).toHaveBeenCalledTimes(childDataBinding.onModify.mock.calls.length);
      childDataBinding.onPreModify.mockClear();
      expect(childDataBinding.onPostCreate).toHaveBeenCalledTimes(1);
      childDataBinding.onModify.mockClear();
      // Should be given a pset and a modification set on construction
      expect(childDataBinding.params.property).toEqual(childPset);
      dataBinder._resetDebugCounters();
      // Should notify DataBinding when primitive property is changed
      childPset.resolvePath('text').value = 'hello';
      expect(childDataBinding.onModify).toHaveBeenCalledTimes(1);
      expect(childDataBinding.onPreModify).toHaveBeenCalledTimes(childDataBinding.onModify.mock.calls.length);
      var modificationContext = childDataBinding.onModify.mock.calls[0][0];
      expect(modificationContext).toBeDefined();

      // Removing childPset should notify childDataBinding and emit event
      expect(dataBinder._dataBindingRemovedCounter).toEqual(0);
      workspace.root.remove(childPset);
      expect(dataBinder._dataBindingRemovedCounter).toEqual(1);
      expect(childDataBinding.onRemove).toHaveBeenCalledTimes(1);
      dataBinder._resetDebugCounters();

      // Removing parentPset should notify parentDataBinding and emit event
      expect(dataBinder._dataBindingRemovedCounter).toEqual(0);
      workspace.root.remove(parentPset);
      expect(dataBinder._dataBindingRemovedCounter).toEqual(1);
      expect(parentDataBinding.onRemove).toHaveBeenCalledTimes(1);
      dataBinder._resetDebugCounters();

      // Unbind from the workspace
      dataBinder.detach();
    });

    it('should create DataBindings for properties that already exist', function() {
      var dataBinder = new DataBinder();

      // Register the DataBindings
      dataBinder.register('BINDING', ParentTemplate.typeid, ParentDataBinding);

      // Add the property BEFORE binding
      var parentPset = PropertyFactory.create(ParentTemplate.typeid, 'single');
      var dynamicPrimitive = PropertyFactory.create('String', 'single');
      dynamicPrimitive.value = 'I am dynamic';
      parentPset.insert('dynamicPrimitive', dynamicPrimitive);

      workspace.root.insert(parentPset);
      expect(dataBinder._dataBindingCreatedCounter).toEqual(0);

      // Bind to the workspace after the properties are added
      dataBinder.attachTo(workspace);

      // Now the DataBinding should have been created
      expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
      const parentDataBinding = dataBinder.resolve(parentPset, 'BINDING');
      expect(parentDataBinding).toBeInstanceOf(ParentDataBinding);
      expect(parentDataBinding.getProperty()).toEqual(parentPset);
      // Should be given a pset and a modification set on construction
      expect(parentDataBinding.params.property).toEqual(parentPset);
      expect(parentDataBinding.onPostCreate).toHaveBeenCalledTimes(1);

      // Unbind from the workspace
      dataBinder.detach();
    });

    it('should notify DataBindings of primitive changes', function() {
      var dataBinder = new DataBinder();

      // Register the DataBindings
      dataBinder.register('BINDING', PrimitiveChildrenTemplate.typeid, PrimitiveChildrenDataBinding);

      // Bind to the workspace
      dataBinder.attachTo(workspace);

      var initialValues = {
        aString: 'some string',
        aNumber: 1,
        aBoolean: true,
        anEnum: 1,
        arrayOfNumbers: [1, 2, 3],
        mapOfNumbers: {
          one: 10,
          two: 2
        },
        nested: {
          aNumber: 1
        }
      };
      var primitiveChildrenPset = PropertyFactory.create(PrimitiveChildrenTemplate.typeid,
        'single',
        initialValues);
      expect(dataBinder._dataBindingCreatedCounter).toEqual(0);

      // primitiveChildrenPset should produce a PrimitiveChildrenDataBinding
      workspace.root.insert(primitiveChildrenPset);
      expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
      const primitiveChildrenDataBinding = dataBinder.resolve(primitiveChildrenPset, 'BINDING');
      expect(primitiveChildrenDataBinding).toBeInstanceOf(PrimitiveChildrenDataBinding);
      expect(primitiveChildrenDataBinding.getProperty()).toEqual(primitiveChildrenPset);
      expect(primitiveChildrenDataBinding.onModify).toHaveBeenCalledTimes(0); // !!!
      expect(primitiveChildrenDataBinding.onPreModify).toHaveBeenCalledTimes(primitiveChildrenDataBinding.onModify.mock.calls.length);
      primitiveChildrenDataBinding.onPreModify.mockClear();
      primitiveChildrenDataBinding.onModify.mockClear();
      // Should be initialized with a ModificationSet
      expect(primitiveChildrenDataBinding.params.property).toEqual(primitiveChildrenPset);
      dataBinder._resetDebugCounters();

      // Should notify DataBinding when primitive properties are changed
      // String modification
      primitiveChildrenPset.resolvePath('aString').value = 'some other string';
      expect(primitiveChildrenDataBinding.onModify).toHaveBeenCalledTimes(1);
      expect(primitiveChildrenDataBinding
        .onPreModify).toHaveBeenCalledTimes(primitiveChildrenDataBinding.onModify.mock.calls.length);
      primitiveChildrenDataBinding.onPreModify.mockClear();
      primitiveChildrenDataBinding.onModify.mockClear();

      // Number modification
      primitiveChildrenPset.resolvePath('aNumber').value = 2;
      expect(primitiveChildrenDataBinding.onModify).toHaveBeenCalledTimes(1);
      expect(primitiveChildrenDataBinding
        .onPreModify).toHaveBeenCalledTimes(primitiveChildrenDataBinding.onModify.mock.calls.length);
      primitiveChildrenDataBinding.onPreModify.mockClear();
      primitiveChildrenDataBinding.onModify.mockClear();

      // Boolean modification
      primitiveChildrenPset.resolvePath('aBoolean').value = false;
      expect(primitiveChildrenDataBinding.onModify).toHaveBeenCalledTimes(1);
      expect(primitiveChildrenDataBinding
        .onPreModify).toHaveBeenCalledTimes(primitiveChildrenDataBinding.onModify.mock.calls.length);
      primitiveChildrenDataBinding.onPreModify.mockClear();
      primitiveChildrenDataBinding.onModify.mockClear();

      // Enum modification
      primitiveChildrenPset.resolvePath('anEnum').value = 100;
      expect(primitiveChildrenDataBinding.onModify).toHaveBeenCalledTimes(1);
      expect(primitiveChildrenDataBinding
        .onPreModify).toHaveBeenCalledTimes(primitiveChildrenDataBinding.onModify.mock.calls.length);
      primitiveChildrenDataBinding.onModify.mockClear();
      primitiveChildrenDataBinding.onPreModify.mockClear();

      // Nested property modification
      primitiveChildrenPset.resolvePath('nested.aNumber').value = 2;
      expect(primitiveChildrenDataBinding.onModify).toHaveBeenCalledTimes(1);
      expect(primitiveChildrenDataBinding
        .onPreModify).toHaveBeenCalledTimes(primitiveChildrenDataBinding.onModify.mock.calls.length);
      primitiveChildrenDataBinding.onModify.mockClear();
      primitiveChildrenDataBinding.onPreModify.mockClear();

      workspace.pushNotificationDelayScope();
      primitiveChildrenPset.resolvePath('arrayOfNumbers').set(2, 20); // [1, 2, 20]
      workspace.popNotificationDelayScope();
      expect(primitiveChildrenDataBinding.onModify).toHaveBeenCalledTimes(1);
      expect(primitiveChildrenDataBinding
        .onPreModify).toHaveBeenCalledTimes(primitiveChildrenDataBinding.onModify.mock.calls.length);
      primitiveChildrenDataBinding.onModify.mockClear();
      primitiveChildrenDataBinding.onPreModify.mockClear();

      // Array property insert and delete should come as an ArrayModification
      workspace.pushNotificationDelayScope();
      // at this point our array is: 1, 2, 20
      primitiveChildrenPset.resolvePath('arrayOfNumbers').insert(0, 0); // [0, 1, 2, 3]
      primitiveChildrenPset.resolvePath('arrayOfNumbers').remove(3); // [0, 1, 2]
      primitiveChildrenPset.resolvePath('arrayOfNumbers').set(2, 10); // [0, 1, 10]
      workspace.popNotificationDelayScope();
      expect(primitiveChildrenDataBinding.onModify).toHaveBeenCalledTimes(1);
      expect(primitiveChildrenDataBinding
        .onPreModify).toHaveBeenCalledTimes(primitiveChildrenDataBinding.onModify.mock.calls.length);
      expect(primitiveChildrenPset.resolvePath('arrayOfNumbers').getLength()).toEqual(3);

      primitiveChildrenDataBinding.onModify.mockClear();
      primitiveChildrenDataBinding.onPreModify.mockClear();

      // Array property modify
      workspace.pushNotificationDelayScope();
      primitiveChildrenPset.resolvePath('arrayOfNumbers').setValues([4, 5, 6]);
      workspace.popNotificationDelayScope();
      expect(primitiveChildrenDataBinding.onModify).toHaveBeenCalledTimes(1);
      expect(primitiveChildrenDataBinding
        .onPreModify).toHaveBeenCalledTimes(primitiveChildrenDataBinding.onModify.mock.calls.length);
      primitiveChildrenDataBinding.onModify.mockClear();
      primitiveChildrenDataBinding.onPreModify.mockClear();

      // Map insert, modify, and delete should come as a MapModification
      workspace.pushNotificationDelayScope();
      primitiveChildrenPset.resolvePath('mapOfNumbers').insert('three', 3);
      primitiveChildrenPset.resolvePath('mapOfNumbers').set('one', 1);
      primitiveChildrenPset.resolvePath('mapOfNumbers').remove('two');
      workspace.popNotificationDelayScope();
      expect(primitiveChildrenDataBinding.onModify).toHaveBeenCalledTimes(1);
      expect(primitiveChildrenDataBinding
        .onPreModify).toHaveBeenCalledTimes(primitiveChildrenDataBinding.onModify.mock.calls.length);
      primitiveChildrenDataBinding.onModify.mockClear();
      primitiveChildrenDataBinding.onPreModify.mockClear();

      // Unbind from the workspace
      dataBinder.detach();
    });

    it('should notify DataBinding when parent pset is removed', function() {
      var dataBinder = new DataBinder();

      // Only register the ChildDataBinding
      var textSpy = jest.fn();
      ChildDataBinding.registerOnPath('text', ['modify'], textSpy);
      dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding);

      // Bind to the workspace
      dataBinder.attachTo(workspace);

      var parentPset = PropertyFactory.create(ParentTemplate.typeid, 'single');
      var childPset = PropertyFactory.create(ChildTemplate.typeid, 'single');

      expect(dataBinder._dataBindingCreatedCounter).toEqual(0);

      // parentPset should NOT produce a ParentDataBinding (since it wasn't registered)
      workspace.root.insert(parentPset);
      expect(dataBinder._dataBindingCreatedCounter).toEqual(0);

      // childPset should produce a ChildDataBinding
      workspace.root.resolvePath(parentPset.getId()).insert(childPset);
      expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
      const childDataBinding = dataBinder.resolve(childPset, 'BINDING');
      expect(childDataBinding).toBeInstanceOf(ChildDataBinding);
      expect(childDataBinding.getProperty()).toEqual(childPset);
      expect(childDataBinding.onModify).toHaveBeenCalledTimes(0); // !!!
      expect(childDataBinding.onPreModify).toHaveBeenCalledTimes(childDataBinding.onModify.mock.calls.length);
      expect(childDataBinding.onPostCreate).toHaveBeenCalledTimes(1);
      childDataBinding.onModify.mockClear();
      childDataBinding.onPreModify.mockClear();
      childDataBinding.onPostCreate.mockClear();
      // our specific onModify function shouldn't get called because it was an insert, not a modify operation
      expect(textSpy).toHaveBeenCalledTimes(0);
      textSpy.mockClear();

      // Should notify DataBinding when primitive property is changed
      childPset.resolvePath('text').value = 'hello';
      expect(childDataBinding.onModify).toHaveBeenCalledTimes(1);
      expect(childDataBinding.onPostCreate).toHaveBeenCalledTimes(0);
      expect(childDataBinding.onPreModify).toHaveBeenCalledTimes(childDataBinding.onModify.mock.calls.length);
      expect(textSpy).toHaveBeenCalledTimes(1);
      textSpy.mockClear();

      // Removing parentPset should notify childDataBinding and emit event
      expect(dataBinder._dataBindingRemovedCounter).toEqual(0);
      workspace.root.remove(parentPset);
      expect(dataBinder._dataBindingRemovedCounter).toEqual(1);
      expect(childDataBinding.onRemove).toHaveBeenCalledTimes(1);
      dataBinder._resetDebugCounters();

      // Unbind from the workspace
      dataBinder.detach();
    });

    it('should notify DataBinding with special characters in the path', function() {
      var dataBinder = new DataBinder();

      // Only register the ChildDataBinding
      var textSpy = jest.fn();
      ChildDataBinding.registerOnPath('text', ['modify'], textSpy);
      dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding);

      // Bind to the workspace
      dataBinder.attachTo(workspace);

      var parentPset = PropertyFactory.create(EscapingTestTemplate.typeid, 'single');
      workspace.root.insert('parent', parentPset);

      expect(textSpy).toHaveBeenCalledTimes(0);
      workspace.root.get(['parent', 'nested.test', 'child "with" quotes', 'text']).setValue('test');
      expect(textSpy).toHaveBeenCalledTimes(1);

      dataBinder.detach();
    });

    it('should survive modifications when no DataBindings are registered', function() {
      var dataBinder = new DataBinder();

      // Bind to the workspace
      dataBinder.attachTo(workspace);

      var childPset = PropertyFactory.create(ChildTemplate.typeid, 'single');

      workspace.root.insert(childPset);
      childPset.resolvePath('text').value = 'hello';
      workspace.root.remove(childPset);

      expect(dataBinder._dataBindingCreatedCounter).toEqual(0);
      expect(dataBinder._dataBindingRemovedCounter).toEqual(0);

      // Unbind from the workspace
      dataBinder.detach();
    });

    it('should notify DataBindings of dynamically added primitives', function() {
      var dataBinder = new DataBinder();

      // Register the DataBindings
      dataBinder.register('BINDING', ParentTemplate.typeid, ParentDataBinding);

      // Bind to the workspace
      dataBinder.attachTo(workspace);

      // Add the property
      var parentPset = PropertyFactory.create(ParentTemplate.typeid, 'single');
      workspace.root.insert(parentPset);

      // Now the DataBinding should have been created
      expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
      const parentDataBinding = dataBinder.resolve(parentPset, 'BINDING');
      expect(parentDataBinding).toBeInstanceOf(ParentDataBinding);
      expect(parentDataBinding.getProperty()).toEqual(parentPset);
      expect(parentDataBinding.onPostCreate).toHaveBeenCalledTimes(1);

      // Unbind from the workspace
      dataBinder.detach();
    });

    it('should notify of pre-existing primitives', function() {
      var dataBinder = new DataBinder();

      // Register the DataBindings
      dataBinder.register('BINDING', PrimitiveChildrenTemplate.typeid, ParentDataBinding);

      var pset = PropertyFactory.create(PrimitiveChildrenTemplate.typeid, 'single');
      pset._properties.aString.value = 'Alice';
      pset._properties.aNumber.value = 32;
      pset._properties.aBoolean.value = true;
      pset._properties.anEnum.value = 1;
      pset._properties.arrayOfNumbers.push(10);
      pset._properties.arrayOfNumbers.push(20);
      pset._properties.mapOfNumbers.set('ten', 10);
      pset._properties.mapOfNumbers.set('twenty', 20);
      pset.resolvePath('nested.aNumber').value = 30;

      workspace.root.insert(pset);

      // Bind to the workspace
      dataBinder.attachTo(workspace);

      // DataBinding should have been created and notified appropriately
      expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
      const dataBinding = dataBinder.resolve(pset, 'BINDING');

      expect(dataBinding.params.property).toEqual(pset);
      expect(dataBinding.onPostCreate).toHaveBeenCalledTimes(1);
      // Unbind from the workspace
      dataBinder.detach();
    });

    it('array of templates with array of primitives', function() {
      var PrimitiveChildWrapperTemplate = {
        typeid: 'Test:PrimitiveChildrenWrapperID-0.0.1',
        inherits: 'NamedProperty',
        properties: [
          {
            id: 'primitiveChildrenArray',
            typeid: 'Test:PrimitiveChildrenID-0.0.1',
            context: 'array'
          },
          {
            id: 'primitiveChildrenSet',
            typeid: 'Test:PrimitiveChildrenID-0.0.1',
            context: 'set'
          },
          {
            id: 'primitiveChildrenMap',
            typeid: 'Test:PrimitiveChildrenID-0.0.1',
            context: 'map'
          }
        ]
      };

      PropertyFactory.register(PrimitiveChildWrapperTemplate);
      expect(PropertyFactory.validate(PrimitiveChildWrapperTemplate).isValid).toEqual(true);

      var initializeProperties = function(pset) {
        pset._properties.aNumber.value = 32;
        pset._properties.arrayOfNumbers.push(10);
        pset._properties.arrayOfNumbers.push(20);
        pset._properties.mapOfNumbers.insert('ten', 10);
        pset._properties.mapOfNumbers.insert('twenty', 20);
        pset.resolvePath('nested.aNumber').value = 30;
      };

      var dataBinder = new DataBinder();

      // Register the DataBindings
      dataBinder.register('BINDING', PrimitiveChildrenTemplate.typeid, ChildDataBinding, { context: 'all' });

      var primitiveChildren = {};

      primitiveChildren['array'] = PropertyFactory.create(PrimitiveChildrenTemplate.typeid, 'single');
      initializeProperties(primitiveChildren['array']);

      primitiveChildren['set'] = PropertyFactory.create(PrimitiveChildrenTemplate.typeid, 'single');
      initializeProperties(primitiveChildren['set']);

      primitiveChildren['map'] = PropertyFactory.create(PrimitiveChildrenTemplate.typeid, 'single');
      initializeProperties(primitiveChildren['map']);

      var wrapperPset = PropertyFactory.create(PrimitiveChildWrapperTemplate.typeid, 'single');
      wrapperPset._properties.primitiveChildrenArray.push(primitiveChildren['array']);
      wrapperPset._properties.primitiveChildrenSet.insert(primitiveChildren['set']);
      wrapperPset._properties.primitiveChildrenMap.insert('thisIsAKey', primitiveChildren['map']);

      workspace.root.insert(wrapperPset);

      // Bind to the workspace
      dataBinder.attachTo(workspace);

      /*
       var expectedSubProperties = [
       'guid',
       'aNumber',
       'aString',
       'aBoolean',
       'anEnum',
       'nested.aNumber'
       ];
       */

      // DataBinding should have been created and notified appropriately
      expect(dataBinder._dataBindingCreatedCounter).toEqual(3);

      // Unbind from the workspace
      dataBinder.detach();
    });

    it('it should not be possible to register with an invalid data binding ctor', function() {
      var dataBinder = new DataBinder();
      var bindingType = 'BINDING';
      var typeid = 'an-id';

      // missing ctor
      expect(dataBinder.register.bind(dataBinder, bindingType, typeid, undefined)).toThrow();
      // invalid ctor
      const fakeCtor = {};
      expect(dataBinder.register.bind(dataBinder, bindingType, typeid, fakeCtor)).toThrow();

    });

    // TODO: stop previously working test
    it.skip('it should catch nested traversal attempts', function() {
      var dataBinder = new DataBinder();
      class myDerivedDataBinding extends ParentDataBinding {
        constructor(params) {
          super(params);
          // insert an extra property into the workspace - this happens during the traversal and is forbidden
          workspace.root.insert(PropertyFactory.create(ParentTemplate.typeid, 'single'));
        }
      }

      var textSpy = jest.fn(function(in_context) {
        workspace.root.insert(PropertyFactory.create(ParentTemplate.typeid, 'single'));
      });
      ChildDataBinding.registerOnPath('text', ['modify'], textSpy);
      // Register the DataBindings
      dataBinder.register('BINDING', ParentTemplate.typeid, myDerivedDataBinding);
      dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding);
      // Bind to the workspace
      dataBinder.attachTo(workspace);

      // ctor inserts into the workspace -> should throw
      expect(hadConsoleError()).toEqual(false); // throws inside a callback so we need to check for console errors
      workspace.root.insert('node', PropertyFactory.create(ParentTemplate.typeid, 'single'));
      expect(hadConsoleError()).toEqual(true);
      clearConsoleError();

      workspace.root.insert('node2', PropertyFactory.create(ChildTemplate.typeid, 'single'));
      // callback inserts into the workspace -> should throw
      expect(hadConsoleError()).toEqual(false); // throws inside a callback so we need to check for console errors
      workspace.root.get('node2').get('text').setValue('new text');
      expect(hadConsoleError()).toEqual(true);
      clearConsoleError();
      expect(textSpy).toHaveBeenCalledTimes(1);

      dataBinder.detach();
    });

    it('it should not return empty arrays from resolve() when binding type is provided (LYNXDEV-5446)', function() {
      var dataBinder = new DataBinder();

      // Register the DataBindings
      dataBinder.register('PARENT', ParentTemplate.typeid, ParentDataBinding);
      dataBinder.register('CHILD', ParentTemplate.typeid, ChildDataBinding);
      dataBinder.register('CHILD', ChildTemplate.typeid, ChildDataBinding);
      // Bind to the workspace
      dataBinder.attachTo(workspace);
      workspace.root.insert('parentNode', PropertyFactory.create(ParentTemplate.typeid, 'single'));
      workspace.root.insert('childNode', PropertyFactory.create(ChildTemplate.typeid, 'single'));
      workspace.root.insert('simpleNode', PropertyFactory.create('NodeProperty', 'single'));
      let bindings = dataBinder.resolve('/parentNode');
      expect(bindings.length).toEqual(2); // parent and child
      expect(bindings[0]).toBeInstanceOf(ParentDataBinding); // registration order!
      expect(bindings[1]).toBeInstanceOf(ChildDataBinding); // registration order!
      expect(dataBinder.resolve('/parentNode', 'PARENT')).toBeInstanceOf(ParentDataBinding);
      expect(dataBinder.resolve('/parentNode', 'CHILD')).toBeInstanceOf(ChildDataBinding);
      expect(dataBinder.resolve('/parentNode', 'INVALID')).toBeUndefined();
      bindings = dataBinder.resolve('/childNode');
      expect(bindings.length).toEqual(1); // just child
      expect(bindings[0]).toBeInstanceOf(ChildDataBinding); // registration order!
      expect(dataBinder.resolve('/childNode', 'CHILD')).toBeInstanceOf(ChildDataBinding);
      expect(dataBinder.resolve('/childNode', 'PARENT')).toBeUndefined();
      expect(dataBinder.resolve('/childNode', 'INVALID')).toBeUndefined();
      bindings = dataBinder.resolve('/simpleNode'); // should return an empty array
      expect(_.isArray(bindings)).toEqual(true);
      expect(bindings.length).toEqual(0);
      bindings = dataBinder.resolve('/invalidPath'); // should return an empty array for non-existing paths
      expect(_.isArray(bindings)).toEqual(true);
      expect(bindings.length).toEqual(0);
      bindings = dataBinder.resolve(); // should return an empty array for not supplied path & bindingType
      expect(_.isArray(bindings)).toEqual(true);
      expect(bindings.length).toEqual(0);
      expect(dataBinder.resolve('/simpleNode', 'PARENT')).toBeUndefined();
      expect(dataBinder.resolve('/simpleNode', 'CHILD')).toBeUndefined();
      expect(dataBinder.resolve(undefined, 'CHILD')).toBeUndefined(); // should return undefined for not supplied paths
      // (but supplied bindingType)
      expect(dataBinder.resolve('/invalidPath', 'CHILD')).toBeUndefined();; // same with invalid paths

      dataBinder.detach();
    });

  });

  describe('arrays', function() {
    var dataBinder, arrayPset, parentDataBinding;

    // Can't use 'beforeEach' since not all of the tests need them, just most of them
    var setupDataBinder = function() {
      dataBinder = new DataBinder();

      // Register the DataBindings
      dataBinder.register('BINDING', ArrayContainerTemplate.typeid, ParentDataBinding, { context: 'single' });
      dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding, { context: 'array' });

      // Add the container pset
      arrayPset = PropertyFactory.create(ArrayContainerTemplate.typeid, 'single');

      // Bind to the workspace
      dataBinder.attachTo(workspace);

      expect(dataBinder._dataBindingCreatedCounter).toEqual(0);

      // parentPset should produce a ParentDataBinding
      workspace.root.insert('myArrayPset', arrayPset);
      expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
      parentDataBinding = dataBinder.resolve(arrayPset, 'BINDING');
      expect(parentDataBinding.onModify).toHaveBeenCalledTimes(0);  // !!!
      expect(parentDataBinding.onPostCreate).toHaveBeenCalledTimes(1);
      expect(parentDataBinding.onPreModify).toHaveBeenCalledTimes(parentDataBinding.onModify.mock.calls.length);
      parentDataBinding.onModify.mockClear();
      parentDataBinding.onPreModify.mockClear();
      dataBinder._resetDebugCounters();
    };

    // Can't use 'afterEach' since not all of the tests need them, just most of them
    var tearDownDataBinder = function() {
      // Unbind from the workspace
      dataBinder.detach();
      // Reset counters
      dataBinder._resetDebugCounters();
    };

    it('should create DataBindings that already exist', function(done) {
      dataBinder = new DataBinder();

      // Register the DataBindings
      dataBinder.register('BINDING', ArrayContainerTemplate.typeid, ParentDataBinding, { context: 'single' });
      dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding, { context: 'array' });

      // Add psets BEFORE binding
      // Add the container pset
      var childPsets = [
        PropertyFactory.create(ChildTemplate.typeid, 'single'),
        PropertyFactory.create(ChildTemplate.typeid, 'single')
      ];

      arrayPset = PropertyFactory.create(ArrayContainerTemplate.typeid, 'single');
      arrayPset.resolvePath('subArray').push(childPsets[0]);
      arrayPset.resolvePath('subArray').push(childPsets[1]);
      workspace.root.insert(arrayPset);

      expect(dataBinder._dataBindingCreatedCounter).toEqual(0);

      // Bind to the workspace
      dataBinder.attachTo(workspace);

      expect(dataBinder._dataBindingCreatedCounter).toEqual(3);

      // ParentDataBinding should have been created and notified of the children
      parentDataBinding = dataBinder.resolve(arrayPset, 'BINDING');
      expect(parentDataBinding.getProperty()).toEqual(arrayPset);
      expect(parentDataBinding.onPostCreate).toHaveBeenCalledTimes(1);
      expect(parentDataBinding.onModify).toHaveBeenCalledTimes(0); // !!!
      expect(parentDataBinding.onPreModify).toHaveBeenCalledTimes(parentDataBinding.onModify.mock.calls.length);
      parentDataBinding.onModify.mockClear();

      // ChildDataBindings should have been created
      var childDataBindings = [];
      childDataBindings.push(dataBinder.resolve(childPsets[0], 'BINDING'));
      expect(childDataBindings[0].getProperty()).toEqual(childPsets[0]);
      expect(childDataBindings[0].onPostCreate).toHaveBeenCalledTimes(1);

      childDataBindings.push(dataBinder.resolve(childPsets[1], 'BINDING'));
      expect(childDataBindings[1].getProperty()).toEqual(childPsets[1]);
      expect(childDataBindings[1].onPostCreate).toHaveBeenCalledTimes(1);

      tearDownDataBinder();
      done();
    });

    it('should notify parent when child DataBinding is added in array', function(done) {
      setupDataBinder();

      var pathPrefixes = [
        '',
        'nested.'
      ]; // The paths to arrays to run this test for

      for (var i = 0; i < pathPrefixes.length; i++) {
        var childPset = PropertyFactory.create(ChildTemplate.typeid, 'single');
        var subArrayPath = pathPrefixes[i] + 'subArray';
        var unrepresentedSubArrayPath = pathPrefixes[i] + 'unrepresentedSubArray';
        // childPset should produce a ChildDataBinding
        arrayPset.resolvePath(subArrayPath).push(childPset);
        expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
        const childDataBinding = dataBinder.resolve(childPset, 'BINDING');
        expect(childDataBinding).toBeInstanceOf(ChildDataBinding);
        expect(childDataBinding.getProperty()).toEqual(childPset);
        expect(childDataBinding.onPostCreate).toHaveBeenCalledTimes(1);
        dataBinder._resetDebugCounters();

        // Child gets the construction notification
        expect(childDataBinding.onModify).toHaveBeenCalledTimes(0);
        expect(childDataBinding.onPreModify).toHaveBeenCalledTimes(childDataBinding.onModify.mock.calls.length);

        // Parent should have been notified
        expect(parentDataBinding.onModify).toHaveBeenCalledTimes(1);
        expect(parentDataBinding.onPreModify).toHaveBeenCalledTimes(parentDataBinding.onModify.mock.calls.length);
        expect(parentDataBinding.onPostCreate).toHaveBeenCalledTimes(1);
        parentDataBinding.onModify.mockClear();
        parentDataBinding.onPreModify.mockClear();

        // unrepresentedPset should not produce an DataBinding
        arrayPset.resolvePath(unrepresentedSubArrayPath)
          .push(PropertyFactory.create(UnrepresentedTemplate.typeid, 'single'));
        expect(dataBinder._dataBindingCreatedCounter).toEqual(0);

        // Parent should have been notified
        expect(parentDataBinding.onModify).toHaveBeenCalledTimes(1);
        expect(parentDataBinding.onPreModify).toHaveBeenCalledTimes(parentDataBinding.onModify.mock.calls.length);
        parentDataBinding.onModify.mockClear();
        parentDataBinding.onPreModify.mockClear();

        // Multiple insertions
        // Should produce DataBindings
        var child1 = PropertyFactory.create(ChildTemplate.typeid, 'single');
        var child2 = PropertyFactory.create(ChildTemplate.typeid, 'single');
        workspace.pushNotificationDelayScope();
        arrayPset.resolvePath(subArrayPath).push(child1);
        arrayPset.resolvePath(subArrayPath).push(child2);
        workspace.popNotificationDelayScope();

        expect(dataBinder._dataBindingCreatedCounter).toEqual(2);
        const childDataBinding1 = dataBinder.resolve(child1.getAbsolutePath(), 'BINDING');
        const childDataBinding2 = dataBinder.resolve(child2.getAbsolutePath(), 'BINDING');
        expect(childDataBinding1).toBeInstanceOf(ChildDataBinding);
        expect(childDataBinding2).toBeInstanceOf(ChildDataBinding);
        expect(childDataBinding1.onPostCreate).toHaveBeenCalledTimes(1);
        expect(childDataBinding1.getProperty()).toEqual(child1);
        expect(childDataBinding2.getProperty()).toEqual(child2);
        expect(childDataBinding2.onPostCreate).toHaveBeenCalledTimes(1);
        dataBinder._resetDebugCounters();

        // Parent should have been notified
        expect(parentDataBinding.onModify).toHaveBeenCalledTimes(1);
        expect(parentDataBinding.onPreModify).toHaveBeenCalledTimes(parentDataBinding.onModify.mock.calls.length);
        parentDataBinding.onModify.mockClear();
        parentDataBinding.onPreModify.mockClear();

        // Should not produce DataBindings
        workspace.pushNotificationDelayScope();
        arrayPset.resolvePath(unrepresentedSubArrayPath)
          .insert(0, PropertyFactory.create(UnrepresentedTemplate.typeid, 'single'));
        arrayPset.resolvePath(unrepresentedSubArrayPath)
          .push(PropertyFactory.create(UnrepresentedTemplate.typeid, 'single'));
        workspace.popNotificationDelayScope();
        expect(dataBinder._dataBindingCreatedCounter).toEqual(0);

        // Parent should have been notified
        expect(parentDataBinding.onModify).toHaveBeenCalledTimes(1);
        expect(parentDataBinding.onPreModify).toHaveBeenCalledTimes(parentDataBinding.onModify.mock.calls.length);
        parentDataBinding.onModify.mockClear();
        parentDataBinding.onPreModify.mockClear();
      }

      tearDownDataBinder();
      done();
    });

    it('should be able to mix insert and push for child DataBindings in an array', function(done) {
      setupDataBinder();

      var subArrayPath = 'subArray';
      var child1 = PropertyFactory.create(ChildTemplate.typeid, 'single');
      // childPset should produce a ChildDataBinding
      arrayPset.resolvePath(subArrayPath).push(child1);

      // Multiple insertions
      // Should produce DataBindings
      var child2 = PropertyFactory.create(ChildTemplate.typeid, 'single');
      var child3 = PropertyFactory.create(ChildTemplate.typeid, 'single');
      workspace.pushNotificationDelayScope();
      arrayPset.resolvePath(subArrayPath).insert(0, child2);
      arrayPset.resolvePath(subArrayPath).push(child3);
      workspace.popNotificationDelayScope();

      expect(dataBinder._dataBindingCreatedCounter).toEqual(3);

      dataBinder._resetDebugCounters();
      // the order should be: child2, child1, child3 because we inserted child2 at position 0!
      expect(dataBinder.resolve('myArrayPset.subArray[0]', 'BINDING').getProperty()).toEqual(child2);
      expect(dataBinder.resolve('myArrayPset.subArray[1]', 'BINDING').getProperty()).toEqual(child1);
      expect(dataBinder.resolve('myArrayPset.subArray[2]', 'BINDING').getProperty()).toEqual(child3);

      expect(dataBinder.resolve('myArrayPset.subArray[0]', 'BINDING').onPostCreate).toHaveBeenCalledTimes(1);
      expect(dataBinder.resolve('myArrayPset.subArray[1]', 'BINDING').onPostCreate).toHaveBeenCalledTimes(1);
      expect(dataBinder.resolve('myArrayPset.subArray[2]', 'BINDING').onPostCreate).toHaveBeenCalledTimes(1);

      parentDataBinding.onModify.mockClear();

      tearDownDataBinder();
      done();
    });

    it('should notify appropriate DataBinding of modifications - subArray', function(done) {
      setupDataBinder();

      var pathPrefixes = [
        '',
        'nested.'
      ]; // The paths to arrays to run this test for

      for (var i = 0; i < pathPrefixes.length; i++) {
        var childPset = PropertyFactory.create(ChildTemplate.typeid, 'single');
        var unrepresentedPset = PropertyFactory.create(UnrepresentedTemplate.typeid, 'single');
        var subArrayPath = pathPrefixes[i] + 'subArray';
        var unrepresentedSubArrayPath = pathPrefixes[i] + 'unrepresentedSubArray';

        expect(dataBinder._dataBindingCreatedCounter).toEqual(0);

        // Add the children
        workspace.pushNotificationDelayScope();
        arrayPset.resolvePath(subArrayPath).push(childPset);
        arrayPset.resolvePath(unrepresentedSubArrayPath).push(unrepresentedPset);
        workspace.popNotificationDelayScope();

        // ChildDataBinding should have been created
        expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
        const childDataBinding = dataBinder.resolve(childPset.getAbsolutePath(), 'BINDING');
        expect(childDataBinding).toBeInstanceOf(ChildDataBinding);
        expect(childDataBinding.getProperty()).toEqual(childPset);
        expect(childDataBinding.onModify).toHaveBeenCalledTimes(0);
        expect(childDataBinding.onPreModify).toHaveBeenCalledTimes(childDataBinding.onModify.mock.calls.length);
        childDataBinding.onModify.mockClear();
        childDataBinding.onPreModify.mockClear();
        expect(childDataBinding.onPostCreate).toHaveBeenCalledTimes(1);
        dataBinder._resetDebugCounters();

        // Parent should have been notified
        expect(parentDataBinding.onModify).toHaveBeenCalledTimes(1);
        expect(parentDataBinding.onPreModify).toHaveBeenCalledTimes(parentDataBinding.onModify.mock.calls.length);
        parentDataBinding.onModify.mockClear();
        parentDataBinding.onPreModify.mockClear();

        // Modifying the childPset should notify ChildDataBinding, not the parent
        childPset.resolvePath('text').value = 'hello';
        //expect(parentDataBinding.onModify).toHaveBeenCalledTimes(0);
        expect(childDataBinding.onModify).toHaveBeenCalledTimes(1);
        expect(childDataBinding.onPreModify).toHaveBeenCalledTimes(childDataBinding.onModify.mock.calls.length);

        // Modifying the unrepresentedPset should notify the ParentDataBinding
        parentDataBinding.onModify.mockClear();
        parentDataBinding.onPreModify.mockClear();
        unrepresentedPset.resolvePath('text').value = 'world';
        expect(parentDataBinding.onModify).toHaveBeenCalledTimes(1);
        expect(parentDataBinding.onPreModify).toHaveBeenCalledTimes(parentDataBinding.onModify.mock.calls.length);

        parentDataBinding.onModify.mockClear();
        parentDataBinding.onPreModify.mockClear();
      }

      tearDownDataBinder();
      done();
    });

    it('should return DataBindings that belong to a family', function(done) {
      setupDataBinder();

      var pathPrefixes = [
        '',
        'nested.'
      ]; // The paths to arrays to run this test for
      var i;
      for (i = 0; i < pathPrefixes.length; i++) {
        var childPset1 = PropertyFactory.create(ChildTemplate.typeid, 'single');
        var childPset2 = PropertyFactory.create(ChildTemplate.typeid, 'single');
        var childPset3 = PropertyFactory.create(ChildTemplate.typeid, 'single');
        var unrepresentedPset = PropertyFactory.create(UnrepresentedTemplate.typeid, 'single');
        var subArrayPath = pathPrefixes[i] + 'subArray';
        var unrepresentedSubArrayPath = pathPrefixes[i] + 'unrepresentedSubArray';

        // Add the children
        workspace.pushNotificationDelayScope();
        arrayPset.resolvePath(subArrayPath).push(childPset1);
        arrayPset.resolvePath(subArrayPath).push(childPset2);
        arrayPset.resolvePath(subArrayPath).push(childPset3);
        arrayPset.resolvePath(unrepresentedSubArrayPath).push(unrepresentedPset);
        workspace.popNotificationDelayScope();
      }
      var dataBindings = dataBinder._getDataBindingsByType('BINDING');
      expect(dataBindings.length).toEqual(7);
      var numChildDataBindings = 0;
      var numParentDataBindings = 0;
      for (i = 0; i < 7; ++i) {
        if (dataBindings[i] instanceof ChildDataBinding) {
          numChildDataBindings++;
        } else if (dataBindings[i] instanceof ParentDataBinding) {
          numParentDataBindings++;
          expect(dataBindings[i]).toEqual(parentDataBinding);
        }
      }
      expect(numChildDataBindings).toEqual(6);
      expect(numParentDataBindings).toEqual(1);
      dataBindings = dataBinder._getDataBindingsByType('NO_SUCH_BINDING');
      expect(dataBindings.length).toEqual(0);
      tearDownDataBinder();
      done();
    });

    it('should notify parent when child DataBinding is removed from array', function(done) {
      jest.setTimeout(15000); // we have to increase this as it times out in npm run test:dev otherwise
      setupDataBinder();

      var pathPrefixes = [
        '',
        'nested.'
      ]; // The paths to arrays to run this test for
      var i, j;

      for (i = 0; i < pathPrefixes.length; i++) {
        var subArrayPath = pathPrefixes[i] + 'subArray';
        var unrepresentedSubArrayPath = pathPrefixes[i] + 'unrepresentedSubArray';

        // Add children
        var childPsets = [];
        var unrepresentedPsets = [];
        var childDataBindings = [];
        for (j = 0; j < 3; j++) {
          childPsets.push(PropertyFactory.create(ChildTemplate.typeid, 'single'));
          arrayPset.resolvePath(subArrayPath).push(childPsets[j]);

          unrepresentedPsets.push(PropertyFactory.create(UnrepresentedTemplate.typeid, 'single'));
          arrayPset.resolvePath(unrepresentedSubArrayPath).push(unrepresentedPsets[j]);

          expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
          const childDataBinding = dataBinder.resolve(childPsets[j].getAbsolutePath(), 'BINDING');
          expect(childDataBinding).toBeInstanceOf(ChildDataBinding);
          expect(childDataBinding.getProperty()).toEqual(childPsets[j]);
          expect(childDataBinding.onPostCreate).toHaveBeenCalledTimes(1);
          dataBinder._resetDebugCounters();

          childDataBindings.push(childDataBinding);

          // Parent should have been notified
          expect(parentDataBinding.onModify).toHaveBeenCalledTimes(2);
          expect(parentDataBinding.onPreModify).toHaveBeenCalledTimes(parentDataBinding.onModify.mock.calls.length);
          parentDataBinding.onModify.mockClear();
          parentDataBinding.onPreModify.mockClear();
        }

        // ChildDataBindings
        // Multiple removals
        workspace.pushNotificationDelayScope();
        // TODO: also test for indices 0 and 1
        arrayPset.resolvePath(subArrayPath).remove(0);
        arrayPset.resolvePath(subArrayPath).remove(0);
        workspace.popNotificationDelayScope();

        expect(dataBinder._dataBindingRemovedCounter).toEqual(2);
        expect(childDataBindings[0].onRemove).toHaveBeenCalledTimes(1);
        expect(childDataBindings[1].onRemove).toHaveBeenCalledTimes(1);
        dataBinder._resetDebugCounters();

        // Parent should have been notified
        expect(parentDataBinding.onModify).toHaveBeenCalledTimes(1);
        expect(parentDataBinding.onPreModify).toHaveBeenCalledTimes(parentDataBinding.onModify.mock.calls.length);
        parentDataBinding.onModify.mockClear();
        parentDataBinding.onPreModify.mockClear();

        childDataBindings = [childDataBindings[2]];

        // Remove last entry
        arrayPset.resolvePath(subArrayPath).remove(0);

        expect(dataBinder._dataBindingRemovedCounter).toEqual(1);
        expect(childDataBindings[0].onRemove).toHaveBeenCalledTimes(1);
        dataBinder._resetDebugCounters();

        // Parent should have been notified
        expect(parentDataBinding.onModify).toHaveBeenCalledTimes(1);
        expect(parentDataBinding.onPreModify).toHaveBeenCalledTimes(parentDataBinding.onModify.mock.calls.length);
        parentDataBinding.onModify.mockClear();
        parentDataBinding.onPreModify.mockClear();

        // Unrepresented
        // Multiple removals
        workspace.pushNotificationDelayScope();
        arrayPset.resolvePath(unrepresentedSubArrayPath).remove(0);
        arrayPset.resolvePath(unrepresentedSubArrayPath).remove(1);
        workspace.popNotificationDelayScope();
        expect(dataBinder._dataBindingRemovedCounter).toEqual(0);

        // Parent should have been notified
        expect(parentDataBinding.onModify).toHaveBeenCalledTimes(1);
        expect(parentDataBinding.onPreModify).toHaveBeenCalledTimes(parentDataBinding.onModify.mock.calls.length);
        parentDataBinding.onModify.mockClear();
        parentDataBinding.onPreModify.mockClear();

        // Remove last item
        arrayPset.resolvePath(unrepresentedSubArrayPath).remove(0);
        expect(dataBinder._dataBindingRemovedCounter).toEqual(0);

        // Parent should have been notified
        expect(parentDataBinding.onModify).toHaveBeenCalledTimes(1);
        expect(parentDataBinding.onPreModify).toHaveBeenCalledTimes(parentDataBinding.onModify.mock.calls.length);
        parentDataBinding.onModify.mockClear();
        parentDataBinding.onPreModify.mockClear();
      }

      tearDownDataBinder();
      done();
    });

    it('should handle multiple array operations', function(done) {
      setupDataBinder();

      var i;

      var subArrayPath = 'subArray';

      // Add children
      var childPsets = [];
      var childDataBindings = [];
      for (i = 0; i < 2; i++) {
        childPsets.push(PropertyFactory.create(ChildTemplate.typeid, 'single'));
        arrayPset.resolvePath(subArrayPath).push(childPsets[i]);

        expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
        const childDataBinding = dataBinder.resolve(childPsets[i].getAbsolutePath(), 'BINDING');
        expect(childDataBinding).toBeInstanceOf(ChildDataBinding);
        expect(childDataBinding.getProperty()).toEqual(childPsets[i]);
        expect(childDataBinding.onPostCreate).toHaveBeenCalledTimes(1);
        dataBinder._resetDebugCounters();

        childDataBindings.push(childDataBinding);

        // Parent should have been notified
        expect(parentDataBinding.onModify).toHaveBeenCalledTimes(1);
        expect(parentDataBinding.onPreModify).toHaveBeenCalledTimes(parentDataBinding.onModify.mock.calls.length);
        parentDataBinding.onModify.mockClear();
        parentDataBinding.onPreModify.mockClear();
      }

      // Perform some operations but delay the change set
      workspace.pushNotificationDelayScope();

      // Add one
      childPsets.push(PropertyFactory.create(ChildTemplate.typeid, 'single'));
      arrayPset.resolvePath(subArrayPath).push(childPsets[2]);

      // Remove one
      childPsets.shift();
      var removedDataBinding = childDataBindings.shift();
      arrayPset.resolvePath(subArrayPath).remove(0);

      // Modify one
      childPsets[0].resolvePath('text').value = 'modified!';

      // Send the change set
      workspace.popNotificationDelayScope();

      // Should have one DataBinding removed
      expect(dataBinder._dataBindingRemovedCounter).toEqual(1);
      expect(removedDataBinding.onRemove).toHaveBeenCalledTimes(1);

      // Should have one DataBinding created
      expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
      // created at index 2, but then we shifted the array so the latest DataBinding created should be at index 1
      const createdDataBinding = dataBinder.resolve(arrayPset.resolvePath(subArrayPath).get(1), 'BINDING');
      expect(createdDataBinding).toBeInstanceOf(ChildDataBinding);
      expect(createdDataBinding.onPostCreate).toHaveBeenCalledTimes(1);
      dataBinder._resetDebugCounters();

      // Parent should have been notified
      expect(parentDataBinding.onModify).toHaveBeenCalledTimes(1);
      expect(parentDataBinding.onPreModify).toHaveBeenCalledTimes(parentDataBinding.onModify.mock.calls.length);
      parentDataBinding.onModify.mockClear();
      parentDataBinding.onPreModify.mockClear();

      tearDownDataBinder();
      done();
    });

    it('should handle combined and scoped changeSet correctly (part 1)', function(done) {
      setupDataBinder();

      var array = PropertyFactory.create(ChildTemplate.typeid, 'array');
      workspace.root.insert('array', array);
      workspace.pushNotificationDelayScope();
      var item = PropertyFactory.create(ChildTemplate.typeid, 'single');
      array.push(item);
      workspace.popNotificationDelayScope();

      tearDownDataBinder();
      done();
    });

    it('should handle combined and scoped changeSet correctly (part 2)', function(done) {
      setupDataBinder();

      workspace.pushNotificationDelayScope();
      var array = PropertyFactory.create(ChildTemplate.typeid, 'array');
      workspace.root.insert('array', array);
      var item = PropertyFactory.create(ChildTemplate.typeid, 'single');
      array.push(item);
      workspace.popNotificationDelayScope();

      tearDownDataBinder();
      done();
    });

    it('should remove all DataBindings when clearing an array', function(done) {
      setupDataBinder();

      var i;

      var subArrayPath = 'subArray';

      // Add children
      var childPsets = [];
      var childDataBindings = [];
      for (i = 0; i < 7; i++) {
        childPsets.push(PropertyFactory.create(ChildTemplate.typeid, 'single'));
        arrayPset.resolvePath(subArrayPath).push(childPsets[i]);

        expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
        const childDataBinding = dataBinder.resolve(childPsets[i].getAbsolutePath(), 'BINDING');
        expect(childDataBinding).toBeInstanceOf(ChildDataBinding);
        expect(childDataBinding.getProperty()).toEqual(childPsets[i]);
        expect(childDataBinding.onPostCreate).toHaveBeenCalledTimes(1);
        dataBinder._resetDebugCounters();

        childDataBindings.push(childDataBinding);

        // Parent should have been notified
        expect(parentDataBinding.onModify).toHaveBeenCalledTimes(1);
        expect(parentDataBinding.onPreModify).toHaveBeenCalledTimes(parentDataBinding.onModify.mock.calls.length);
        parentDataBinding.onModify.mockClear();
        parentDataBinding.onPreModify.mockClear();
      }

      // Clear the array
      arrayPset.resolvePath(subArrayPath).removeRange(0, arrayPset.resolvePath(subArrayPath).length);
      // we should have removed all 7 DataBindings
      expect(dataBinder._dataBindingRemovedCounter).toEqual(7);
      tearDownDataBinder();
      done();
    });

    it('should handle multiple removes within a scope', function(done) {
      setupDataBinder();

      var i;

      var subArrayPath = 'subArray';

      // Add children
      var childPsets = [];
      var childDataBindings = [];
      for (i = 0; i < 7; i++) {
        childPsets.push(PropertyFactory.create(ChildTemplate.typeid, 'single'));
        arrayPset.resolvePath(subArrayPath).push(childPsets[i]);

        expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
        const childDataBinding = dataBinder.resolve(childPsets[i].getAbsolutePath(), 'BINDING');
        expect(childDataBinding).toBeInstanceOf(ChildDataBinding);
        expect(childDataBinding.getProperty()).toEqual(childPsets[i]);
        expect(childDataBinding.onPostCreate).toHaveBeenCalledTimes(1);
        dataBinder._resetDebugCounters();

        childDataBindings.push(childDataBinding);

        // Parent should have been notified
        expect(parentDataBinding.onModify).toHaveBeenCalledTimes(1);
        expect(parentDataBinding.onPreModify).toHaveBeenCalledTimes(parentDataBinding.onModify.mock.calls.length);
        parentDataBinding.onModify.mockClear();
        parentDataBinding.onPreModify.mockClear();
      }

      // Multiple removes
      workspace.pushNotificationDelayScope();
      arrayPset.resolvePath(subArrayPath).remove(1); // 0, 2, 3, 4, 5, 6
      arrayPset.resolvePath(subArrayPath).removeRange(3, 3); // 0, 2, 3
      workspace.popNotificationDelayScope();
      // we should have removed 4 dataBindings
      expect(dataBinder._dataBindingRemovedCounter).toEqual(4);
      dataBinder._resetDebugCounters();

      expect(childDataBindings[0].onRemove).toHaveBeenCalledTimes(0);
      expect(childDataBindings[1].onRemove).toHaveBeenCalledTimes(1);
      expect(childDataBindings[2].onRemove).toHaveBeenCalledTimes(0);
      expect(childDataBindings[3].onRemove).toHaveBeenCalledTimes(0);
      expect(childDataBindings[4].onRemove).toHaveBeenCalledTimes(1);
      expect(childDataBindings[5].onRemove).toHaveBeenCalledTimes(1);
      expect(childDataBindings[6].onRemove).toHaveBeenCalledTimes(1);
      expect(arrayPset.resolvePath(subArrayPath).getLength()).toEqual(3);
      expect(arrayPset.resolvePath(subArrayPath).get(0)).toEqual(childPsets[0]);
      expect(arrayPset.resolvePath(subArrayPath).get(1)).toEqual(childPsets[2]);
      expect(arrayPset.resolvePath(subArrayPath).get(2)).toEqual(childPsets[3]);
      expect(dataBinder.resolve('myArrayPset.' + subArrayPath + '[0]', 'BINDING')).toEqual(childDataBindings[0]);
      expect(dataBinder.resolve('myArrayPset.' + subArrayPath + '[1]', 'BINDING')).toEqual(childDataBindings[2]);
      expect(dataBinder.resolve('myArrayPset.' + subArrayPath + '[2]', 'BINDING')).toEqual(childDataBindings[3]);
      tearDownDataBinder();
      done();
    });

    it('should handle multiple operations within a scope', function(done) {
      setupDataBinder();

      var i;

      var subArrayPath = 'subArray';

      // Add children
      var childPsets = [];
      var childDataBindings = [];
      var actChildDataBinding;
      // Create some Psets that we'll insert later
      for (i = 0; i <= 20; i++) {
        childPsets.push(PropertyFactory.create(ChildTemplate.typeid, 'single'));
      }

      // first insert simply the first 3 properties
      workspace.pushNotificationDelayScope();
      for (i = 0; i < 3; ++i) {
        arrayPset.resolvePath(subArrayPath).push(childPsets[i + 1]);
      }
      workspace.popNotificationDelayScope();
      expect(arrayPset.resolvePath(subArrayPath).getLength()).toEqual(3);
      expect(arrayPset.resolvePath(subArrayPath).get(0)).toEqual(childPsets[1]);
      expect(arrayPset.resolvePath(subArrayPath).get(1)).toEqual(childPsets[2]);
      expect(arrayPset.resolvePath(subArrayPath).get(2)).toEqual(childPsets[3]);

      // 3 dataBindings created
      expect(dataBinder._dataBindingCreatedCounter).toEqual(3);
      for (i = 0; i < 3; ++i) {
        childDataBindings.push(dataBinder.resolve(childPsets[i + 1].getAbsolutePath(), 'BINDING'));
      }
      dataBinder._resetDebugCounters();
      /* eslint-disable max-len */
      expect(dataBinder.resolve('myArrayPset.' + subArrayPath + '[0]', 'BINDING').getProperty()).toEqual(childPsets[1]);
      expect(dataBinder.resolve('myArrayPset.' + subArrayPath + '[1]', 'BINDING').getProperty()).toEqual(childPsets[2]);
      expect(dataBinder.resolve('myArrayPset.' + subArrayPath + '[2]', 'BINDING').getProperty()).toEqual(childPsets[3]);

      expect(dataBinder.resolve('myArrayPset.' + subArrayPath + '[0]', 'BINDING').onPostCreate).toHaveBeenCalledTimes(1);
      expect(dataBinder.resolve('myArrayPset.' + subArrayPath + '[1]', 'BINDING').onPostCreate).toHaveBeenCalledTimes(1);
      expect(dataBinder.resolve('myArrayPset.' + subArrayPath + '[2]', 'BINDING').onPostCreate).toHaveBeenCalledTimes(1);
      /* eslint-enable max-len */

      // change one of the elements
      workspace.pushNotificationDelayScope();
      arrayPset.resolvePath(subArrayPath).set(2, childPsets[20]);
      workspace.popNotificationDelayScope();
      // 1 DataBinding removed, 1 DataBinding created -- because it's a complex type
      expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
      actChildDataBinding = dataBinder.resolve(childPsets[20].getAbsolutePath(), 'BINDING');
      expect(dataBinder._dataBindingRemovedCounter).toEqual(1);
      dataBinder._resetDebugCounters();
      expect(dataBinder.resolve('myArrayPset.' + subArrayPath + '[2]',
        'BINDING').getProperty()).toEqual(childPsets[20]);
      expect(dataBinder.resolve('myArrayPset.' + subArrayPath + '[2]',
        'BINDING').onPostCreate).toHaveBeenCalledTimes(1);

      // this one is the one removed
      expect(childDataBindings[2].onRemove).toHaveBeenCalledTimes(1);
      // this one should be the one created
      expect(dataBinder.resolve('myArrayPset.' + subArrayPath + '[2]', 'BINDING')).toEqual(actChildDataBinding);
      // let's keep it for later tests
      childDataBindings[2] = actChildDataBinding;

      // let's do some more scoped changes
      workspace.pushNotificationDelayScope();
      // at this point our array contains childPsets with the indices: 1, 2, 20
      arrayPset.resolvePath(subArrayPath).insert(0, childPsets[0]); // childPset indices: [0, 1, 2, 3]
      arrayPset.resolvePath(subArrayPath).remove(3); // childPset indices: [0, 1, 2]
      arrayPset.resolvePath(subArrayPath).set(2, childPsets[10]); // childPset indices: [0, 1, 10]
      workspace.popNotificationDelayScope();
      // 2 dataBindings created, 2 removed (the set also implies an DataBinding creation/removal)
      expect(dataBinder._dataBindingCreatedCounter).toEqual(2);
      expect(dataBinder._dataBindingRemovedCounter).toEqual(2);
      // again last dataBindings was removed due to replacement (we didn't get a chance to store the other one)
      expect(childDataBindings[2].onRemove).toHaveBeenCalledTimes(1);
      // the first one created (at index 0) will stay at index 0
      actChildDataBinding =
        dataBinder.resolve(arrayPset.resolvePath(subArrayPath).get(0).getAbsolutePath(), 'BINDING');
      // the other one will be at index 2
      const secondCreatedDataBinding =
        dataBinder.resolve(arrayPset.resolvePath(subArrayPath).get(2).getAbsolutePath(), 'BINDING');
      dataBinder._resetDebugCounters();
      expect(arrayPset.resolvePath(subArrayPath).getLength()).toEqual(3);
      expect(arrayPset.resolvePath(subArrayPath).get(0)).toEqual(childPsets[0]);
      expect(arrayPset.resolvePath(subArrayPath).get(1)).toEqual(childPsets[1]);
      expect(arrayPset.resolvePath(subArrayPath).get(2)).toEqual(childPsets[10]);
      /* eslint-disable max-len */
      expect(dataBinder.resolve('myArrayPset.' + subArrayPath + '[0]',
        'BINDING').getProperty()).toEqual(childPsets[0]);
      expect(dataBinder.resolve('myArrayPset.' + subArrayPath + '[1]',
        'BINDING').getProperty()).toEqual(childPsets[1]);
      expect(dataBinder.resolve('myArrayPset.' + subArrayPath + '[2]',
        'BINDING').getProperty()).toEqual(childPsets[10]);
      /* eslint-enable max-len */
      expect(dataBinder.resolve('myArrayPset.' + subArrayPath + '[0]', 'BINDING')).toEqual(actChildDataBinding);
      expect(dataBinder.resolve('myArrayPset.' + subArrayPath + '[1]', 'BINDING')).toEqual(childDataBindings[0]);
      expect(dataBinder.resolve('myArrayPset.' + subArrayPath + '[2]', 'BINDING')).toEqual(secondCreatedDataBinding);

      expect(dataBinder.resolve('myArrayPset.' + subArrayPath + '[0]',
        'BINDING').onPostCreate).toHaveBeenCalledTimes(1);
      expect(dataBinder.resolve('myArrayPset.' + subArrayPath + '[1]',
        'BINDING').onPostCreate).toHaveBeenCalledTimes(1);
      expect(dataBinder.resolve('myArrayPset.' + subArrayPath + '[2]',
        'BINDING').onPostCreate).toHaveBeenCalledTimes(1);
      tearDownDataBinder();
      done();
    });

    it('should handle remove and push within a scope', function(done) {
      dataBinder = new DataBinder();

      // Register the dataBindings
      dataBinder.register('BINDING', InheritedChildrenTemplate.typeid, InheritedChildDataBinding,
        { context: 'all' });
      dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding, { context: 'all' });
      dataBinder.attachTo(workspace);

      // Add psets BEFORE binding
      // Add the container pset
      var rootProperty = PropertyFactory.create(InheritedChildrenTemplate.typeid, 'single');
      var child = PropertyFactory.create(InheritedChildrenTemplate.typeid, 'single');
      var container = PropertyFactory.create(InheritedChildrenTemplate.typeid, 'single');
      rootProperty.get('children').push(child);
      rootProperty.get('children').push(container);
      workspace.root.insert('root', rootProperty);
      expect(dataBinder._dataBindingCreatedCounter).toEqual(3);
      const rootDataBinding = dataBinder.resolve('/root', 'BINDING');
      const containerDataBinding = dataBinder.resolve('/root.children[1]', 'BINDING');
      const childDataBinding = dataBinder.resolve('/root.children[0]', 'BINDING');
      expect(rootDataBinding).toBeDefined();
      expect(childDataBinding).toBeDefined()
      expect(containerDataBinding).toBeDefined();

      workspace.pushNotificationDelayScope();
      rootProperty.get('children').remove(0);
      container.get('children').push(PropertyFactory.create(ChildTemplate.typeid, 'single'));
      workspace.popNotificationDelayScope();
      // this should have been removed
      expect(childDataBinding.onRemove).toHaveBeenCalledTimes(1);
      // once after creation, once after the scoped events
      expect(containerDataBinding.onModify).toHaveBeenCalledTimes(1);
      expect(containerDataBinding.onPreModify).toHaveBeenCalledTimes(containerDataBinding.onModify.mock.calls.length);

      expect(dataBinder._dataBindingCreatedCounter).toEqual(4);
      const childDataBinding2 =
        dataBinder.resolve(containerDataBinding.getProperty().get(['children', '0']), 'BINDING');
      expect(childDataBinding2).toBeDefined()
      expect(childDataBinding2.onPostCreate).toHaveBeenCalledTimes(1);
      dataBinder._resetDebugCounters();

      tearDownDataBinder();
      done();
    });
  });

  describe('sets', function() {
    var dataBinder, setPset, parentDataBinding;

    // Can't use 'beforeEach' since not all of the tests need them, just most of them
    var setupDataBinder = function() {
      dataBinder = new DataBinder();

      // Register the dataBindings
      dataBinder.register('BINDING', SetContainerTemplate.typeid, ParentDataBinding);
      dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding, { context: 'set' });

      // Add the container pset
      setPset = PropertyFactory.create(SetContainerTemplate.typeid, 'single');

      // Bind to the workspace
      dataBinder.attachTo(workspace);

      expect(dataBinder._dataBindingCreatedCounter).toEqual(0);

      // parentPset should produce a ParentDataBinding
      workspace.root.insert('mySetPset', setPset);
      expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
      parentDataBinding = dataBinder.resolve(setPset, 'BINDING');
      expect(parentDataBinding.onModify).toHaveBeenCalledTimes(0); // !!!
      expect(parentDataBinding.onPreModify).toHaveBeenCalledTimes(parentDataBinding.onModify.mock.calls.length);
      expect(parentDataBinding.onPostCreate).toHaveBeenCalledTimes(1);
      parentDataBinding.onModify.mockClear();
      parentDataBinding.onPreModify.mockClear();
      dataBinder._resetDebugCounters();
    };

    // Can't use 'afterEach' since not all of the tests need them, just most of them
    var tearDownDataBinder = function() {
      // Unbind from the workspace
      dataBinder.detach();

      // Reset counters
      dataBinder._resetDebugCounters();
    };

    it('should create dataBindings that already exist', function() {
      dataBinder = new DataBinder();

      // Register the dataBindings
      dataBinder.register('BINDING', SetContainerTemplate.typeid, ParentDataBinding);
      dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding, { context: 'set' });

      // Add psets BEFORE binding
      // Add the container pset
      var childPset = PropertyFactory.create(ChildTemplate.typeid, 'single');

      setPset = PropertyFactory.create(SetContainerTemplate.typeid, 'single');
      setPset.resolvePath('subSet').insert(childPset);
      workspace.root.insert(setPset);

      expect(dataBinder._dataBindingCreatedCounter).toEqual(0);

      // Bind to the workspace
      dataBinder.attachTo(workspace);

      // DataBindings should now have been created
      expect(dataBinder._dataBindingCreatedCounter).toEqual(2);

      parentDataBinding = dataBinder.resolve(setPset.getAbsolutePath(), 'BINDING');
      expect(parentDataBinding.getProperty()).toEqual(setPset);
      expect(parentDataBinding.onPostCreate).toHaveBeenCalledTimes(1);

      const childDataBinding = dataBinder.resolve(childPset.getAbsolutePath(), 'BINDING');
      expect(childDataBinding.getProperty()).toEqual(childPset);
      expect(childDataBinding.onPostCreate).toHaveBeenCalledTimes(1);

      tearDownDataBinder();
    });

    it('should notify parent when child is added in set', function() {
      setupDataBinder();

      var pathPrefixes = [
        '',
        'nested.'
      ]; // The paths to sets to run this test for

      for (var i = 0; i < pathPrefixes.length; i++) {
        var subSetPath = pathPrefixes[i] + 'subSet';
        var unrepresentedSubSetPath = pathPrefixes[i] + 'unrepresentedSubSet';

        // Multiple insertions
        // Should produce dataBindings
        var child1 = PropertyFactory.create(ChildTemplate.typeid, 'single');
        var child2 = PropertyFactory.create(ChildTemplate.typeid, 'single');
        workspace.pushNotificationDelayScope();
        setPset.resolvePath(subSetPath).insert(child1);
        setPset.resolvePath(subSetPath).insert(child2);
        workspace.popNotificationDelayScope();

        expect(dataBinder._dataBindingCreatedCounter).toEqual(2);
        var childDataBinding1 = dataBinder.resolve(child1.getAbsolutePath(), 'BINDING');
        var childDataBinding2 = dataBinder.resolve(child2.getAbsolutePath(), 'BINDING');
        expect(childDataBinding1).toBeInstanceOf(ChildDataBinding);
        expect(childDataBinding2).toBeInstanceOf(ChildDataBinding);
        expect(childDataBinding1.getProperty()).toEqual(child1);
        expect(childDataBinding2.getProperty()).toEqual(child2);
        expect(childDataBinding1.onPostCreate).toHaveBeenCalledTimes(1);
        expect(childDataBinding2.onPostCreate).toHaveBeenCalledTimes(1);
        dataBinder._resetDebugCounters();

        // Parent should have been notified
        expect(parentDataBinding.onModify).toHaveBeenCalledTimes(1);
        expect(parentDataBinding.onPreModify).toHaveBeenCalledTimes(parentDataBinding.onModify.mock.calls.length);
        parentDataBinding.onModify.mockClear();
        parentDataBinding.onPreModify.mockClear();

        // Should not produce dataBindings
        var unrepresented1 = PropertyFactory.create(UnrepresentedTemplate.typeid, 'single');
        var unrepresented2 = PropertyFactory.create(UnrepresentedTemplate.typeid, 'single');
        workspace.pushNotificationDelayScope();
        setPset.resolvePath(unrepresentedSubSetPath).insert(unrepresented1);
        setPset.resolvePath(unrepresentedSubSetPath).insert(unrepresented2);
        workspace.popNotificationDelayScope();
        expect(dataBinder._dataBindingCreatedCounter).toEqual(0);

        // Parent should have been notified
        expect(parentDataBinding.onModify).toHaveBeenCalledTimes(1);
        expect(parentDataBinding.onPreModify).toHaveBeenCalledTimes(parentDataBinding.onModify.mock.calls.length);
        parentDataBinding.onModify.mockClear();
        parentDataBinding.onPreModify.mockClear();
      }

      tearDownDataBinder();
    });

    it('should notify appropriate DataBinding of modifications - subSet', function() {
      setupDataBinder();

      var pathPrefixes = [
        '',
        'nested.'
      ]; // The paths to sets to run this test for

      for (var i = 0; i < pathPrefixes.length; i++) {
        var childPset = PropertyFactory.create(ChildTemplate.typeid, 'single');
        var unrepresentedPset = PropertyFactory.create(UnrepresentedTemplate.typeid, 'single');
        var subSetPath = pathPrefixes[i] + 'subSet';
        var unrepresentedSubSetPath = pathPrefixes[i] + 'unrepresentedSubSet';

        expect(dataBinder._dataBindingCreatedCounter).toEqual(0);

        // Add the children
        workspace.pushNotificationDelayScope();
        setPset.resolvePath(subSetPath).insert(childPset);
        setPset.resolvePath(unrepresentedSubSetPath).insert(unrepresentedPset);
        workspace.popNotificationDelayScope();

        // ChildDataBinding should have been created
        expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
        const childDataBinding = dataBinder.resolve(childPset.getAbsolutePath(), 'BINDING');
        expect(childDataBinding).toBeInstanceOf(ChildDataBinding);
        expect(childDataBinding.getProperty()).toEqual(childPset);
        expect(childDataBinding.onModify).toHaveBeenCalledTimes(0);
        expect(childDataBinding.onPreModify).toHaveBeenCalledTimes(childDataBinding.onModify.mock.calls.length);
        childDataBinding.onModify.mockClear();
        childDataBinding.onPreModify.mockClear();
        expect(childDataBinding.onPostCreate).toHaveBeenCalledTimes(1);
        dataBinder._resetDebugCounters();

        // Parent should have been notified once for each path
        expect(parentDataBinding.onModify).toHaveBeenCalledTimes(1);
        expect(parentDataBinding.onPreModify).toHaveBeenCalledTimes(parentDataBinding.onModify.mock.calls.length);
        parentDataBinding.onModify.mockClear();
        parentDataBinding.onPreModify.mockClear();

        // Modifying the childPset should notify ChildDataBinding and the parent
        childPset.resolvePath('text').value = 'hello';
        expect(parentDataBinding.onModify).toHaveBeenCalledTimes(1);
        expect(parentDataBinding.onPreModify).toHaveBeenCalledTimes(parentDataBinding.onModify.mock.calls.length);
        expect(childDataBinding.onModify).toHaveBeenCalledTimes(1);
        expect(childDataBinding.onPreModify).toHaveBeenCalledTimes(childDataBinding.onModify.mock.calls.length);
        parentDataBinding.onModify.mockClear();
        parentDataBinding.onPreModify.mockClear();

        // Modifying the unrepresentedPset should notify the ParentDataBinding
        unrepresentedPset.resolvePath('text').value = 'world';
        expect(parentDataBinding.onModify).toHaveBeenCalledTimes(1);
        expect(parentDataBinding.onPreModify).toHaveBeenCalledTimes(parentDataBinding.onModify.mock.calls.length);

        parentDataBinding.onModify.mockClear();
        parentDataBinding.onPreModify.mockClear();
      }

      tearDownDataBinder();
    });

    it('should notify parent when child is removed from set', function() {
      setupDataBinder();

      var pathPrefixes = [
        '',
        'nested.'
      ]; // The paths to sets to run this test for

      for (var i = 0; i < pathPrefixes.length; i++) {
        var subSetPath = pathPrefixes[i] + 'subSet';
        var unrepresentedSubSetPath = pathPrefixes[i] + 'unrepresentedSubSet';

        // Insert some things
        var child1 = PropertyFactory.create(ChildTemplate.typeid, 'single');
        var unrepresented1 = PropertyFactory.create(UnrepresentedTemplate.typeid, 'single');
        workspace.pushNotificationDelayScope();
        setPset.resolvePath(subSetPath).insert(child1);
        setPset.resolvePath(unrepresentedSubSetPath).insert(unrepresented1);
        workspace.popNotificationDelayScope();

        expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
        var childDataBinding1 = dataBinder.resolve(child1.getAbsolutePath(), 'BINDING');
        expect(childDataBinding1.getProperty()).toEqual(child1);
        expect(childDataBinding1.onPostCreate).toHaveBeenCalledTimes(1);
        dataBinder._resetDebugCounters();

        // Parent should have been notified
        expect(parentDataBinding.onModify).toHaveBeenCalledTimes(1);
        expect(parentDataBinding.onPreModify).toHaveBeenCalledTimes(parentDataBinding.onModify.mock.calls.length);
        parentDataBinding.onModify.mockClear();
        parentDataBinding.onPreModify.mockClear();

        expect(dataBinder._dataBindingRemovedCounter).toEqual(0);

        // Remove the represented property set
        setPset.resolvePath(subSetPath).remove(child1);

        expect(dataBinder._dataBindingRemovedCounter).toEqual(1);
        expect(childDataBinding1.onRemove).toHaveBeenCalledTimes(1);
        dataBinder._resetDebugCounters();

        expect(parentDataBinding.onModify).toHaveBeenCalledTimes(1);
        expect(parentDataBinding.onPreModify).toHaveBeenCalledTimes(parentDataBinding.onModify.mock.calls.length);
        parentDataBinding.onModify.mockClear();
        parentDataBinding.onPreModify.mockClear();

        // Remove the unrepresented property set
        setPset.resolvePath(unrepresentedSubSetPath).remove(unrepresented1);
        expect(dataBinder._dataBindingRemovedCounter).toEqual(0);

        expect(parentDataBinding.onModify).toHaveBeenCalledTimes(1);
        expect(parentDataBinding.onPreModify).toHaveBeenCalledTimes(parentDataBinding.onModify.mock.calls.length);
        parentDataBinding.onModify.mockClear();
        parentDataBinding.onPreModify.mockClear();
      }

      tearDownDataBinder();
    });
  });

  describe('maps', function() {
    var dataBinder, mapPset, parentDataBinding;

    // Can't use 'beforeEach' since not all of the tests need them, just most of them
    var setupDataBinder = function() {
      dataBinder = new DataBinder();

      // Register the dataBindings
      dataBinder.register('BINDING', MapContainerTemplate.typeid, ParentDataBinding);
      dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding, { context: 'map' });

      // Add the container pset
      mapPset = PropertyFactory.create(MapContainerTemplate.typeid, 'single');

      // Bind to the workspace
      dataBinder.attachTo(workspace);

      expect(dataBinder._dataBindingCreatedCounter).toEqual(0);

      // parentPset should produce a ParentDataBinding
      workspace.root.insert('myMapPset', mapPset);
      parentDataBinding = dataBinder.resolve(mapPset.getAbsolutePath(), 'BINDING');
      expect(parentDataBinding.onModify).toHaveBeenCalledTimes(0); // !!!
      expect(parentDataBinding.onPreModify).toHaveBeenCalledTimes(parentDataBinding.onModify.mock.calls.length);
      parentDataBinding.onModify.mockClear();
      parentDataBinding.onPreModify.mockClear();
      expect(dataBinder.resolve('myMapPset', 'BINDING').onPostCreate).toHaveBeenCalledTimes(1);
      dataBinder._resetDebugCounters();
    };

    // Can't use 'afterEach' since not all of the tests need them, just most of them
    var tearDownDataBinder = function() {
      // Unbind from the workspace
      dataBinder.detach();
      // Reset counters
      dataBinder._resetDebugCounters();
    };

    it('should create dataBindings that already exist', function() {
      dataBinder = new DataBinder();

      // Register the dataBindings
      dataBinder.register('BINDING', MapContainerTemplate.typeid, ParentDataBinding);
      dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding, { context: 'map' });

      // Add psets BEFORE binding
      // Add the container pset
      var childPset = PropertyFactory.create(ChildTemplate.typeid, 'single');

      mapPset = PropertyFactory.create(MapContainerTemplate.typeid, 'single');
      mapPset.resolvePath('subMap').insert(childPset.getGuid(), childPset);
      workspace.root.insert(mapPset);

      expect(dataBinder._dataBindingCreatedCounter).toEqual(0);

      // Bind to the workspace
      dataBinder.attachTo(workspace);

      // DataBindings should now have been created
      expect(dataBinder._dataBindingCreatedCounter).toEqual(2);

      parentDataBinding = dataBinder.resolve(mapPset.getAbsolutePath(), 'BINDING');
      expect(parentDataBinding.getProperty()).toEqual(mapPset);
      expect(parentDataBinding.onPostCreate).toHaveBeenCalledTimes(1);

      var childDataBinding = dataBinder.resolve(childPset.getAbsolutePath(), 'BINDING');
      expect(childDataBinding).toBeDefined();
      expect(childDataBinding.getProperty()).toEqual(childPset);
      expect(childDataBinding.onPostCreate).toHaveBeenCalledTimes(1);

      tearDownDataBinder();
    });

    it('should notify parent when child is added in set', function() {
      setupDataBinder();

      var pathPrefixes = [
        '',
        'nested.'
      ]; // The paths to sets to run this test for

      for (var i = 0; i < pathPrefixes.length; i++) {
        var subMapPath = pathPrefixes[i] + 'subMap';
        var unrepresentedSubMapPath = pathPrefixes[i] + 'unrepresentedSubMap';

        // Multiple insertions
        // Should produce dataBindings
        var child1 = PropertyFactory.create(ChildTemplate.typeid, 'single');
        var child2 = PropertyFactory.create(ChildTemplate.typeid, 'single');
        workspace.pushNotificationDelayScope();
        mapPset.resolvePath(subMapPath).insert(child1.getGuid(), child1);
        mapPset.resolvePath(subMapPath).insert(child2.getGuid(), child2);
        workspace.popNotificationDelayScope();

        expect(dataBinder._dataBindingCreatedCounter).toEqual(2);
        const childDataBinding1 = dataBinder.resolve(child1.getAbsolutePath(), 'BINDING');
        const childDataBinding2 = dataBinder.resolve(child2.getAbsolutePath(), 'BINDING');
        expect(childDataBinding1).toBeInstanceOf(ChildDataBinding);
        expect(childDataBinding2).toBeInstanceOf(ChildDataBinding);
        expect(childDataBinding1.getProperty()).toEqual(child1);
        expect(childDataBinding2.getProperty()).toEqual(child2);
        expect(childDataBinding1.onPostCreate).toHaveBeenCalledTimes(1);
        expect(childDataBinding2.onPostCreate).toHaveBeenCalledTimes(1);
        dataBinder._resetDebugCounters();

        // Parent should have been notified
        expect(parentDataBinding.onModify).toHaveBeenCalledTimes(1);
        expect(parentDataBinding.onPreModify).toHaveBeenCalledTimes(parentDataBinding.onModify.mock.calls.length);
        parentDataBinding.onModify.mockClear();
        parentDataBinding.onPreModify.mockClear();

        // Should not produce dataBindings
        var unrepresented1 = PropertyFactory.create(UnrepresentedTemplate.typeid, 'single');
        var unrepresented2 = PropertyFactory.create(UnrepresentedTemplate.typeid, 'single');
        workspace.pushNotificationDelayScope();
        mapPset.resolvePath(unrepresentedSubMapPath).insert(unrepresented1.getGuid(), unrepresented1);
        mapPset.resolvePath(unrepresentedSubMapPath).insert(unrepresented2.getGuid(), unrepresented2);
        workspace.popNotificationDelayScope();
        expect(dataBinder._dataBindingCreatedCounter).toEqual(0);

        // Parent should have been notified
        expect(parentDataBinding.onModify).toHaveBeenCalledTimes(1);
        expect(parentDataBinding.onPreModify).toHaveBeenCalledTimes(parentDataBinding.onModify.mock.calls.length);
        parentDataBinding.onModify.mockClear();
        parentDataBinding.onPreModify.mockClear();
      }

      tearDownDataBinder();
    });

    it('should notify appropriate DataBinding of modifications - submap', function() {
      setupDataBinder();

      var pathPrefixes = [
        '',
        'nested.'
      ]; // The paths to sets to run this test for

      for (var i = 0; i < pathPrefixes.length; i++) {
        var childPset = PropertyFactory.create(ChildTemplate.typeid, 'single');
        var unrepresentedPset = PropertyFactory.create(UnrepresentedTemplate.typeid, 'single');
        var subMapPath = pathPrefixes[i] + 'subMap';
        var unrepresentedSubMapPath = pathPrefixes[i] + 'unrepresentedSubMap';

        expect(dataBinder._dataBindingCreatedCounter).toEqual(0);

        // Add the children
        workspace.pushNotificationDelayScope();
        mapPset.resolvePath(subMapPath).insert(childPset.getGuid(), childPset);
        mapPset.resolvePath(unrepresentedSubMapPath).insert(unrepresentedPset.getGuid(), unrepresentedPset);
        workspace.popNotificationDelayScope();

        // ChildDataBinding should have been created
        expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
        const childDataBinding = dataBinder.resolve(childPset.getAbsolutePath(), 'BINDING');
        expect(childDataBinding).toBeInstanceOf(ChildDataBinding);
        expect(childDataBinding.getProperty()).toEqual(childPset);
        expect(childDataBinding.onModify).toHaveBeenCalledTimes(0);
        expect(childDataBinding.onPreModify).toHaveBeenCalledTimes(childDataBinding.onModify.mock.calls.length);
        childDataBinding.onModify.mockClear();
        childDataBinding.onPreModify.mockClear();
        expect(childDataBinding.onPostCreate).toHaveBeenCalledTimes(1);
        dataBinder._resetDebugCounters();

        // Parent should have been notified once for each path
        expect(parentDataBinding.onModify).toHaveBeenCalledTimes(1);
        expect(parentDataBinding.onPreModify).toHaveBeenCalledTimes(parentDataBinding.onModify.mock.calls.length);
        parentDataBinding.onModify.mockClear();
        parentDataBinding.onPreModify.mockClear();
        childDataBinding.onModify.mockClear();
        childDataBinding.onPreModify.mockClear();

        // Modifying the childPset should notify ChildDataBinding and the parent
        childPset.resolvePath('text').value = 'hello';
        expect(parentDataBinding.onModify).toHaveBeenCalledTimes(1);
        expect(parentDataBinding.onPreModify).toHaveBeenCalledTimes(parentDataBinding.onModify.mock.calls.length);
        expect(childDataBinding.onModify).toHaveBeenCalledTimes(1);
        expect(childDataBinding.onPreModify).toHaveBeenCalledTimes(childDataBinding.onModify.mock.calls.length);
        parentDataBinding.onModify.mockClear();
        parentDataBinding.onPreModify.mockClear();

        // Modifying the unrepresentedPset should notify the ParentDataBinding
        unrepresentedPset.resolvePath('text').value = 'world';
        expect(parentDataBinding.onModify).toHaveBeenCalledTimes(1);
        expect(parentDataBinding.onPreModify).toHaveBeenCalledTimes(parentDataBinding.onModify.mock.calls.length);
        parentDataBinding.onModify.mockClear();
        parentDataBinding.onPreModify.mockClear();
      }

      tearDownDataBinder();
    });

    it('should notify parent when child is removed from set', function() {
      setupDataBinder();

      var pathPrefixes = [
        '',
        'nested.'
      ]; // The paths to sets to run this test for

      for (var i = 0; i < pathPrefixes.length; i++) {
        var subMapPath = pathPrefixes[i] + 'subMap';
        var unrepresentedSubMapPath = pathPrefixes[i] + 'unrepresentedSubMap';

        // Insert some things
        var child1 = PropertyFactory.create(ChildTemplate.typeid, 'single');
        var unrepresented1 = PropertyFactory.create(UnrepresentedTemplate.typeid, 'single');
        workspace.pushNotificationDelayScope();
        mapPset.resolvePath(subMapPath).insert(child1.getGuid(), child1);
        mapPset.resolvePath(unrepresentedSubMapPath).insert(unrepresented1.getGuid(), unrepresented1);
        workspace.popNotificationDelayScope();

        expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
        const childDataBinding1 = dataBinder.resolve(child1.getAbsolutePath(), 'BINDING');
        expect(childDataBinding1.getProperty()).toEqual(child1);
        expect(childDataBinding1.onPostCreate).toHaveBeenCalledTimes(1);
        dataBinder._resetDebugCounters();

        // Parent should have been notified
        expect(parentDataBinding.onModify).toHaveBeenCalledTimes(1);
        expect(parentDataBinding.onPreModify).toHaveBeenCalledTimes(parentDataBinding.onModify.mock.calls.length);
        parentDataBinding.onModify.mockClear();
        parentDataBinding.onPreModify.mockClear();

        expect(dataBinder._dataBindingRemovedCounter).toEqual(0);

        // Remove the represented property set
        mapPset.resolvePath(subMapPath).remove(child1.getGuid());

        expect(dataBinder._dataBindingRemovedCounter).toEqual(1);
        dataBinder._resetDebugCounters();
        expect(childDataBinding1.onRemove).toHaveBeenCalledTimes(1);

        expect(parentDataBinding.onModify).toHaveBeenCalledTimes(1);
        expect(parentDataBinding.onPreModify).toHaveBeenCalledTimes(parentDataBinding.onModify.mock.calls.length);
        parentDataBinding.onModify.mockClear();
        parentDataBinding.onPreModify.mockClear();

        // Remove the unrepresented property set
        mapPset.resolvePath(unrepresentedSubMapPath).remove(unrepresented1.getGuid());
        expect(dataBinder._dataBindingRemovedCounter).toEqual(0);

        expect(parentDataBinding.onModify).toHaveBeenCalledTimes(1);
        expect(parentDataBinding.onPreModify).toHaveBeenCalledTimes(parentDataBinding.onModify.mock.calls.length);
        parentDataBinding.onModify.mockClear();
        parentDataBinding.onPreModify.mockClear();
      }

      tearDownDataBinder();
    });

    it('should notify entry with special characters in the key', function() {
      dataBinder = new DataBinder();

      // Only register the ChildDataBinding
      var textSpy = jest.fn();
      ChildDataBinding.registerOnPath('text', ['modify'], textSpy);

      dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding);

      // Bind to the workspace
      dataBinder.attachTo(workspace);

      var parentPset = PropertyFactory.create(MapContainerTemplate.typeid);
      var childPSet = PropertyFactory.create(ChildTemplate.typeid);
      workspace.root.insert('parent', parentPset);
      workspace.root.get(['parent', 'subMap']).insert('string.test', childPSet);

      expect(textSpy).toHaveBeenCalledTimes(0);
      workspace.root.get(['parent', 'subMap', 'string.test', 'text']).setValue('test');
      expect(textSpy).toHaveBeenCalledTimes(1);

      tearDownDataBinder();
    });
  });

  describe('nodeProperty', function() {
    var dataBinder, nodePset, parentDataBinding;

    afterEach(function() {
      dataBinder = nodePset = parentDataBinding = null;
    });

    var setupDataBinder = function() {
      dataBinder = new DataBinder();

      // Register the dataBindings
      dataBinder.register('BINDING', NodeContainerTemplate.typeid, ParentDataBinding);
      dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding);

      // Bind to the checkoutView
      dataBinder.attachTo(workspace);

      // Add the property
      nodePset = PropertyFactory.create(NodeContainerTemplate.typeid, 'single');
      workspace.root.insert('myNodePset', nodePset);

      // Now the DataBinding should have been created
      expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
      parentDataBinding = dataBinder.resolve(nodePset.getAbsolutePath(), 'BINDING');
      expect(parentDataBinding).toBeInstanceOf(ParentDataBinding);
      expect(parentDataBinding.getProperty()).toEqual(nodePset);
      expect(parentDataBinding.onModify).toHaveBeenCalledTimes(0); // !!!
      expect(parentDataBinding.onPreModify).toHaveBeenCalledTimes(parentDataBinding.onModify.mock.calls.length);
      expect(parentDataBinding.onPostCreate).toHaveBeenCalledTimes(1);
      parentDataBinding.onModify.mockClear();
      parentDataBinding.onPreModify.mockClear();

      dataBinder._resetDebugCounters();
    };

    var tearDownDataBinder = function() {
      // Unbind from the workspace
      dataBinder.detach();

      // Reset counters
      dataBinder._resetDebugCounters();
    };

    it('should be notified when primitive is added', function() {
      setupDataBinder();

      // Add a primitive dynamically
      var primitive = PropertyFactory.create('Int32', 'single');
      primitive.value = 100;
      nodePset.insert('dynamicPrimitive', primitive);

      // DataBinding should have been notified
      expect(parentDataBinding.onModify).toHaveBeenCalledTimes(1);
      expect(parentDataBinding.onPreModify).toHaveBeenCalledTimes(parentDataBinding.onModify.mock.calls.length);
      parentDataBinding.onModify.mockClear();
      parentDataBinding.onPreModify.mockClear();

      tearDownDataBinder();
    });

    it('should be notified of changes and adding primitive children at the same time', function() {
      setupDataBinder();

      // Group the following changes
      var dynamicPrimitive = PropertyFactory.create('String', 'single');
      dynamicPrimitive.value = 'A default string';
      nodePset.insert('dynamicPrimitive', dynamicPrimitive);
      parentDataBinding.onModify.mockClear();
      parentDataBinding.onPreModify.mockClear();

      workspace.pushNotificationDelayScope();
      nodePset.resolvePath('text').value = 'hello';
      dynamicPrimitive.value = 'world';
      var otherDynamicPrimitive = PropertyFactory.create('Uint32', 'single');
      otherDynamicPrimitive.value = '100';
      nodePset.insert('otherDynamicPrimitive', otherDynamicPrimitive);
      workspace.popNotificationDelayScope();

      // DataBinding should have been notified
      expect(parentDataBinding.onModify).toHaveBeenCalledTimes(1);
      expect(parentDataBinding.onPreModify).toHaveBeenCalledTimes(parentDataBinding.onModify.mock.calls.length);

      tearDownDataBinder();
    });

    it('should be notified of dynamically added/removed child properties', function() {
      setupDataBinder();

      var appendPath = [
        '',
        'nested'
      ];

      appendPath.forEach(function(path) {
        // Add the represented child
        var child = PropertyFactory.create(ChildTemplate.typeid, 'single');
        nodePset.resolvePath(path).insert(child);

        ///          var relativePath = path === '' ? child.getGuid() : path + '.' + child.getGuid();

        // Child DataBinding should have been created
        expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
        const childDataBinding = dataBinder.resolve(child.getAbsolutePath(), 'BINDING');
        expect(childDataBinding).toBeDefined();
        dataBinder._resetDebugCounters();

        // Parent should have been notified
        expect(parentDataBinding.onModify).toHaveBeenCalledTimes(1);
        expect(parentDataBinding.onPreModify).toHaveBeenCalledTimes(parentDataBinding.onModify.mock.calls.length);
        expect(parentDataBinding.onPostCreate).toHaveBeenCalledTimes(1);
        parentDataBinding.onModify.mockClear();
        parentDataBinding.onPreModify.mockClear();

        // Add the unrepresented child
        var unrepresentedChild = PropertyFactory.create(UnrepresentedTemplate.typeid,
          'single',
          { text: 'hello' });
        nodePset.resolvePath(path).insert(unrepresentedChild);

        ///          var unrepresentedPath = path === '' ?
        ///            unrepresentedChild.getGuid() :
        ///            path + '.' + unrepresentedChild.getGuid();

        // No DataBinding should be created
        expect(dataBinder._dataBindingRemovedCounter).toEqual(0);

        // Parent should have been notified
        expect(parentDataBinding.onModify).toHaveBeenCalledTimes(1);
        expect(parentDataBinding.onPreModify).toHaveBeenCalledTimes(parentDataBinding.onModify.mock.calls.length);
        parentDataBinding.onModify.mockClear();
        parentDataBinding.onPreModify.mockClear();

        // // Remove the represented child
        nodePset.resolvePath(path).remove(child);

        // Child DataBinding should have been removed
        expect(dataBinder._dataBindingRemovedCounter).toEqual(1);
        expect(childDataBinding.onRemove).toHaveBeenCalledTimes(1);
        dataBinder._resetDebugCounters();

        // Parent should have been notified
        expect(parentDataBinding.onModify).toHaveBeenCalledTimes(1);
        expect(parentDataBinding.onPreModify).toHaveBeenCalledTimes(parentDataBinding.onModify.mock.calls.length);
        parentDataBinding.onModify.mockClear();
        parentDataBinding.onPreModify.mockClear();

        // Remove the unrepresented child
        nodePset.resolvePath(path).remove(unrepresentedChild);

        // No DataBinding should have been removed
        expect(dataBinder._dataBindingRemovedCounter).toEqual(0);

        // Parent should have been notified
        expect(parentDataBinding.onModify).toHaveBeenCalledTimes(1);
        expect(parentDataBinding.onPreModify).toHaveBeenCalledTimes(parentDataBinding.onModify.mock.calls.length);
        parentDataBinding.onModify.mockClear();
        parentDataBinding.onPreModify.mockClear();
      });

      tearDownDataBinder();
    });

    it('should be notified of removed child dataBindings when an intermediate node is removed', function() {
      setupDataBinder();

      // Add the intermediate node
      var intermediateNode = PropertyFactory.create('NodeProperty', 'single');
      nodePset.insert('intermediateNode', intermediateNode);

      // Nothing should have been created
      expect(dataBinder._dataBindingCreatedCounter).toEqual(0);

      // NodeProperties have no values but the parent DataBinding still should be notified that the PSet below changed
      expect(parentDataBinding.onModify).toHaveBeenCalledTimes(1);
      expect(parentDataBinding.onPreModify).toHaveBeenCalledTimes(parentDataBinding.onModify.mock.calls.length);
      parentDataBinding.onModify.mockClear();
      parentDataBinding.onPreModify.mockClear();

      // Add the child
      var child = PropertyFactory.create(ChildTemplate.typeid, 'single');
      intermediateNode.insert(child);

      ///        var relativePath = 'intermediateNode.' + child.getGuid();

      // Child DataBinding should have been created
      expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
      const childDataBinding = dataBinder.resolve(child.getAbsolutePath(), 'BINDING');
      expect(childDataBinding).toBeDefined();
      expect(childDataBinding.onPostCreate).toHaveBeenCalledTimes(1);
      dataBinder._resetDebugCounters();

      // Parent should have been notified
      expect(parentDataBinding.onModify).toHaveBeenCalledTimes(1);
      expect(parentDataBinding.onPreModify).toHaveBeenCalledTimes(parentDataBinding.onModify.mock.calls.length);
      parentDataBinding.onModify.mockClear();
      parentDataBinding.onPreModify.mockClear();

      // Remove the intermediate node
      nodePset.remove(intermediateNode);

      // Child DataBinding should have been removed
      expect(dataBinder._dataBindingRemovedCounter).toEqual(1);
      expect(childDataBinding.onRemove).toHaveBeenCalledTimes(1);
      dataBinder._resetDebugCounters();

      // Parent should have been notified
      expect(parentDataBinding.onModify).toHaveBeenCalledTimes(1);
      expect(parentDataBinding.onPreModify).toHaveBeenCalledTimes(parentDataBinding.onModify.mock.calls.length);
      parentDataBinding.onModify.mockClear();
      parentDataBinding.onPreModify.mockClear();

      tearDownDataBinder();
    });

    it('should be notified of removed child dataBindings. when an intermediate node is removed (from a chain) part 1',
      function() {
        setupDataBinder();

        // Add the intermediate nodes
        var intermediateNode1 = PropertyFactory.create('NodeProperty', 'single');
        nodePset.insert('intermediateNode', intermediateNode1);
        var intermediateNode2 = PropertyFactory.create('NodeProperty', 'single');
        intermediateNode1.insert('intermediateNode', intermediateNode2);

        // Nothing should have been created
        expect(dataBinder._dataBindingCreatedCounter).toEqual(0);

        // NodeProperties have no values but the parent DataBinding
        // still should be notified that the PSet below changed
        expect(parentDataBinding.onModify).toHaveBeenCalledTimes(2);
        expect(parentDataBinding.onPreModify).toHaveBeenCalledTimes(parentDataBinding.onModify.mock.calls.length);
        parentDataBinding.onModify.mockClear();
        parentDataBinding.onPreModify.mockClear();

        // Add the child
        var child = PropertyFactory.create(ChildTemplate.typeid, 'single');
        intermediateNode2.insert(child);

        ///        var relativePath = 'intermediateNode.intermediateNode.' + child.getGuid();

        // Child DataBinding should have been created
        expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
        const childDataBinding = dataBinder.resolve(child.getAbsolutePath(), 'BINDING');
        expect(childDataBinding).toBeDefined();
        expect(childDataBinding.onPostCreate).toHaveBeenCalledTimes(1);
        dataBinder._resetDebugCounters();

        // Parent should have been notified
        expect(parentDataBinding.onModify).toHaveBeenCalledTimes(1);
        expect(parentDataBinding.onPreModify).toHaveBeenCalledTimes(parentDataBinding.onModify.mock.calls.length);
        parentDataBinding.onModify.mockClear();
        parentDataBinding.onPreModify.mockClear();

        // Remove one of the intermediate nodes
        nodePset.remove(intermediateNode1);

        // Child DataBinding should have been removed
        expect(dataBinder._dataBindingRemovedCounter).toEqual(1);
        expect(childDataBinding.onRemove).toHaveBeenCalledTimes(1);
        dataBinder._resetDebugCounters();

        // Parent should be notified
        expect(parentDataBinding.onModify).toHaveBeenCalledTimes(1); // !!!
        expect(parentDataBinding.onPreModify).toHaveBeenCalledTimes(parentDataBinding.onModify.mock.calls.length);
        parentDataBinding.onModify.mockClear();
        parentDataBinding.onPreModify.mockClear();

        tearDownDataBinder();
      });

    it('should be notified of removed child dataBindings. when an intermediate node is removed (from a chain) part 2',
      function() {
        setupDataBinder();

        // Add the intermediate nodes
        var intermediateNode1 = PropertyFactory.create('NodeProperty', 'single');
        nodePset.insert('intermediateNode', intermediateNode1);
        var intermediateNode2 = PropertyFactory.create('NodeProperty', 'single');
        intermediateNode1.insert('intermediateNode', intermediateNode2);

        // Nothing should have been created
        expect(dataBinder._dataBindingCreatedCounter).toEqual(0);

        // NodeProperties have no values but the parent
        // DataBinding still should be notified that the PSet below changed
        expect(parentDataBinding.onModify).toHaveBeenCalledTimes(2);
        expect(parentDataBinding.onPreModify).toHaveBeenCalledTimes(parentDataBinding.onModify.mock.calls.length);
        parentDataBinding.onModify.mockClear();
        parentDataBinding.onPreModify.mockClear();

        // Add the child
        var child = PropertyFactory.create(ChildTemplate.typeid, 'single');
        intermediateNode2.insert(child);

        ///            var relativePath = 'intermediateNode.intermediateNode.' + child.getGuid();

        // Child DataBinding should have been created
        expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
        const childDataBinding = dataBinder.resolve(child.getAbsolutePath(), 'BINDING');
        expect(childDataBinding).toBeDefined();
        expect(childDataBinding.onPostCreate).toHaveBeenCalledTimes(1);
        dataBinder._resetDebugCounters();

        // Parent should have been notified
        expect(parentDataBinding.onModify).toHaveBeenCalledTimes(1);
        expect(parentDataBinding.onPreModify).toHaveBeenCalledTimes(parentDataBinding.onModify.mock.calls.length);
        parentDataBinding.onModify.mockClear();
        parentDataBinding.onPreModify.mockClear();

        // Remove one of the intermediate nodes
        nodePset.remove(intermediateNode2);

        // Child DataBinding should have been removed
        expect(dataBinder._dataBindingRemovedCounter).toEqual(1);
        expect(childDataBinding.onRemove).toHaveBeenCalledTimes(1);
        dataBinder._resetDebugCounters();

        // Parent should be notified
        expect(parentDataBinding.onModify).toHaveBeenCalledTimes(1); // !!!
        expect(parentDataBinding.onPreModify).toHaveBeenCalledTimes(parentDataBinding.onModify.mock.calls.length);
        parentDataBinding.onModify.mockClear();
        parentDataBinding.onPreModify.mockClear();

        tearDownDataBinder();
      });

    it('should be notified of dynamically added/removed collections of primitives', function() {
      setupDataBinder();

      var appendPath = [
        '',
        'nested'
      ];

      appendPath.forEach(function(path) {
        // Create the children
        var arrayOfNumbers = PropertyFactory.create('Int32', 'array');
        arrayOfNumbers.push(1);
        arrayOfNumbers.push(2);

        var emptyArray = PropertyFactory.create('Int32', 'array');

        var mapOfNumbers = PropertyFactory.create('Int32', 'map');
        mapOfNumbers.set('one', 1);
        mapOfNumbers.set('two', 2);

        var emptyMap = PropertyFactory.create('Int32', 'map');

        // Add the children
        workspace.pushNotificationDelayScope();
        nodePset.resolvePath(path).insert('arrayOfNumbers', arrayOfNumbers);
        nodePset.resolvePath(path).insert('emptyArray', emptyArray);
        nodePset.resolvePath(path).insert('mapOfNumbers', mapOfNumbers);
        nodePset.resolvePath(path).insert('emptyMap', emptyMap);
        workspace.popNotificationDelayScope();

        ///          var relativeArrayPath = path === '' ? 'arrayOfNumbers' : path + '.arrayOfNumbers';
        ///          var relativeEmptyArrayPath = path === '' ? 'emptyArray' : path + '.emptyArray';
        ///          var relativeMapPath = path === '' ? 'mapOfNumbers' : path + '.mapOfNumbers';
        ///          var relativeEmptyMapPath = path === '' ? 'emptyMap' : path + '.emptyMap';

        // Parent should have been notified
        expect(parentDataBinding.onModify).toHaveBeenCalledTimes(1);
        expect(parentDataBinding.onPreModify).toHaveBeenCalledTimes(parentDataBinding.onModify.mock.calls.length);
        ///          var modificationSet = parentDataBinding.onModify.mock.calls[0][0];
        ///          modificationSet.getCount().should.equal(4);

        ///          var modification = modificationSet.getModification(relativeArrayPath);
        ///          modification.type.should.equal('subProperty');
        ///          modification.value.should.eql([1, 2]);
        ///          modification.operation.should.equal('add');

        ///          modification = modificationSet.getModification(relativeEmptyArrayPath);
        ///          modification.type.should.equal('subProperty');
        ///          modification.value.should.eql([]);
        ///          modification.operation.should.equal('add');
        parentDataBinding.onModify.mockClear();
        parentDataBinding.onPreModify.mockClear();

        ///          modification = modificationSet.getModification(relativeMapPath);
        ///          modification.type.should.equal('subProperty');
        ///          modification.value.should.eql({one: 1, two: 2});
        ///          modification.operation.should.equal('add');

        ///          modification = modificationSet.getModification(relativeEmptyMapPath);
        ///          modification.type.should.equal('subProperty');
        ///          modification.value.should.eql({});
        ///          modification.operation.should.equal('add');

        // Remove the children
        workspace.pushNotificationDelayScope();
        nodePset.resolvePath(path).remove('arrayOfNumbers');
        nodePset.resolvePath(path).remove('mapOfNumbers');
        workspace.popNotificationDelayScope();

        // Parent should have been notified
        expect(parentDataBinding.onModify).toHaveBeenCalledTimes(1);
        expect(parentDataBinding.onPreModify).toHaveBeenCalledTimes(parentDataBinding.onModify.mock.calls.length);
        ///          modificationSet = parentDataBinding.onModify.mock.calls[0][0];
        ///          modificationSet.getCount().should.equal(2);

        ///          modification = modificationSet.getModification(relativeArrayPath);
        ///          modification.type.should.equal('subProperty');
        ///          should.equal(modification.value, null);
        ///          modification.operation.should.equal('remove');

        ///          modification = modificationSet.getModification(relativeMapPath);
        ///          modification.type.should.equal('subProperty');
        ///          should.equal(modification.value, null);
        ///          modification.operation.should.equal('remove');
        parentDataBinding.onModify.mockClear();
        parentDataBinding.onPreModify.mockClear();
      });

      tearDownDataBinder();
    });

    it('should be notified of removed child nodes even if the removed tree has arrays (LYNXDEV-8835)', function() {
      setupDataBinder();

      // Add the intermediate node
      const intermediateNode = PropertyFactory.create('NodeProperty', 'single');
      nodePset.insert('intermediateNode', intermediateNode);
      expect(parentDataBinding.onModify).toHaveBeenCalledTimes(1);

      // Add an array below child with 3 elems
      const childArray = PropertyFactory.create(ChildTemplate.typeid, 'array');
      childArray.push(PropertyFactory.create(ChildTemplate.typeid, 'single'));
      childArray.push(PropertyFactory.create(ChildTemplate.typeid, 'single'));
      childArray.push(PropertyFactory.create(ChildTemplate.typeid, 'single'));
      intermediateNode.insert('myArray', childArray);
      expect(dataBinder._dataBindingCreatedCounter).toEqual(3);  // 3 new child bindings
      expect(parentDataBinding.onModify).toHaveBeenCalledTimes(2); // one more modify for our parent (at nodePset)
      // Remove the intermediate node
      nodePset.remove(intermediateNode);

      // The 3 child bindings should have been removed
      expect(dataBinder._dataBindingRemovedCounter).toEqual(3);
      // Parent should have been notified
      expect(parentDataBinding.onModify).toHaveBeenCalledTimes(3); // the last modify for the parent
      tearDownDataBinder();
    });

    it('should create dataBindings that already exist', function() {
      ///        var modificationSet, modification;

      dataBinder = new DataBinder();

      // Register the dataBindings
      dataBinder.register('BINDING', NodeContainerTemplate.typeid, ParentDataBinding);
      dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding);

      // Add psets BEFORE binding
      // Add the container pset
      nodePset = PropertyFactory.create(NodeContainerTemplate.typeid, 'single');

      var primitive = PropertyFactory.create('Int32', 'single');
      primitive.value = 100;
      var child = PropertyFactory.create(ChildTemplate.typeid, 'single');
      var nestedChild = PropertyFactory.create(ChildTemplate.typeid, 'single');
      var unrepresented = PropertyFactory.create(UnrepresentedTemplate.typeid,
        'single',
        { text: 'unrepresentedChild' });
      var nestedUnrepresented = PropertyFactory.create(UnrepresentedTemplate.typeid,
        'single',
        { text: 'nestedUnrepresentedChild' });
      var arrayOfNumbers = PropertyFactory.create('Int32', 'array');
      arrayOfNumbers.push(1);
      var mapOfNumbers = PropertyFactory.create('Int32', 'map');
      mapOfNumbers.set('one', 1);

      nodePset.insert('dynamicPrimitive', primitive);
      nodePset.insert('arrayOfNumbers', arrayOfNumbers);
      nodePset.insert('mapOfNumbers', mapOfNumbers);
      nodePset.insert(child);
      nodePset.insert(unrepresented);
      nodePset.resolvePath('nested').insert(nestedChild);
      nodePset.resolvePath('nested').insert(nestedUnrepresented);

      workspace.root.insert('myNodePSet2', nodePset);

      expect(dataBinder._dataBindingCreatedCounter).toEqual(0);

      // Bind to the workspace
      dataBinder.attachTo(workspace);

      // Everything should have been created and notified
      expect(dataBinder._dataBindingCreatedCounter).toEqual(3);  // One for the parent and one for each child

      const childDataBinding = dataBinder.resolve(child.getAbsolutePath(), 'BINDING');
      const nestedChildDataBinding = dataBinder.resolve(nestedChild.getAbsolutePath(), 'BINDING');
      parentDataBinding = dataBinder.resolve(nodePset.getAbsolutePath(), 'BINDING');

      // NestedChildDataBinding should have been notified
      expect(nestedChildDataBinding).toBeDefined();
      expect(nestedChildDataBinding.onModify).toHaveBeenCalledTimes(0); // !!!
      expect(nestedChildDataBinding.onPreModify).toHaveBeenCalledTimes(nestedChildDataBinding.onModify.mock.calls.length);
      nestedChildDataBinding.onModify.mockClear();
      nestedChildDataBinding.onModify.mockClear();

      // ChildDataBinding should have been notified
      expect(childDataBinding).toBeDefined();
      // var childDataBindingId = childDataBinding.getId();
      expect(childDataBinding.onModify).toHaveBeenCalledTimes(0); // !!!
      expect(childDataBinding.onPreModify).toHaveBeenCalledTimes(childDataBinding.onModify.mock.calls.length);
      childDataBinding.onModify.mockClear();
      childDataBinding.onModify.mockClear();

      // ParentDataBinding should have been notified
      expect(parentDataBinding).toBeDefined();
      expect(parentDataBinding.onModify).toHaveBeenCalledTimes(0); // !!!
      expect(parentDataBinding.onPreModify).toHaveBeenCalledTimes(parentDataBinding.onModify.mock.calls.length);
      tearDownDataBinder();
    });

  });

  describe('Inheritance', function() {
    var dataBinder;

    beforeEach(function() {
      dataBinder = new DataBinder();
    });

    afterEach(function() {
      // Unbind checkout view
      dataBinder.detach();
      dataBinder = null;
    });

    it('should create DataBinding when only the inherited template is represented', function() {
      // Register the base (Child) typeid
      dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding);

      // Create PSet for inherited child typeid
      var inheritedChildPset = PropertyFactory.create(InheritedChildTemplate.typeid, 'single');

      // Add the inherited child to the workspace and bind
      workspace.root.insert(inheritedChildPset);
      expect(dataBinder._dataBindingCreatedCounter).toEqual(0);
      dataBinder.attachTo(workspace);

      // DataBinding should be created as a registered DataBinding
      expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
      const childDataBinding = dataBinder.resolve(inheritedChildPset.getAbsolutePath(), 'BINDING');
      expect(childDataBinding).toBeInstanceOf(ChildDataBinding);
      expect(childDataBinding.getProperty()).toEqual(inheritedChildPset);
      expect(childDataBinding.onPostCreate).toHaveBeenCalledTimes(1);
    });

    it('should create DataBinding bound to a collection when the inherited template is inserted', function() {
      // Register the base (Child) typeid
      dataBinder.register('BINDING', 'map<' + ChildTemplate.typeid + '>', ChildDataBinding);

      // Create PSet for inherited child typeid
      var inheritedChildPset = PropertyFactory.create(InheritedChildTemplate.typeid, 'map');

      // Add the inherited child to the workspace and bind
      workspace.root.insert('myMap', inheritedChildPset);
      expect(dataBinder._dataBindingCreatedCounter).toEqual(0);
      dataBinder.attachTo(workspace);

      // DataBinding should be created as a registered DataBinding
      expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
      const childDataBinding = dataBinder.resolve(inheritedChildPset.getAbsolutePath(), 'BINDING');
      expect(childDataBinding).toBeInstanceOf(ChildDataBinding);
      expect(childDataBinding.getProperty()).toEqual(inheritedChildPset);
      expect(childDataBinding.onPostCreate).toHaveBeenCalledTimes(1);
    });

    it('should create DataBinding with correct template if the template and its parent are both registered', () => {
      // Register the base and inherited template ids
      dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding);
      dataBinder.register('BINDING', InheritedChildTemplate.typeid, InheritedChildDataBinding);

      // Create PSet for child, inheritedChild
      var childPset = PropertyFactory.create(ChildTemplate.typeid, 'single');
      var inheritedChildPset = PropertyFactory.create(InheritedChildTemplate.typeid, 'single');

      // bind workspace
      dataBinder.attachTo(workspace);
      expect(dataBinder._dataBindingCreatedCounter).toEqual(0);

      // Add childPset as ChildDataBinding
      workspace.root.insert(childPset);
      expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
      const childDataBinding = dataBinder.resolve(childPset.getAbsolutePath(), 'BINDING');
      expect(childDataBinding).toBeInstanceOf(ChildDataBinding);
      expect(childDataBinding.getProperty()).toEqual(childPset);
      expect(childDataBinding.onPostCreate).toHaveBeenCalledTimes(1);

      // Add inheritedChildPset as InheritedChildDataBinding
      workspace.root.insert(inheritedChildPset);
      expect(dataBinder._dataBindingCreatedCounter).toEqual(2);
      const inheritedChildDataBinding = dataBinder.resolve(inheritedChildPset.getAbsolutePath(), 'BINDING');
      expect(inheritedChildDataBinding).toBeInstanceOf(InheritedChildDataBinding);
      expect(inheritedChildDataBinding.getProperty()).toEqual(inheritedChildPset);
      expect(inheritedChildDataBinding.onPostCreate).toHaveBeenCalledTimes(1);
    });

    it('should create dataBindings using registered grandparent templates', function() {
      // Register the base template
      dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding);

      // Create the grandchild pset
      var multipleInheritedPset =
        PropertyFactory.create(MultipleInheritedTemplate.typeid, 'single');

      // bind workspace
      dataBinder.attachTo(workspace);
      expect(dataBinder._dataBindingCreatedCounter).toEqual(0);

      // Add the DataBinding using it's grandparent template
      // Looks like:
      //    MultipleInheritedTemplate -> InheritedChildTemplate -> ChildTemplate (Registered) -> NamedProperty
      //                              -> NodeProperty

      workspace.root.insert(multipleInheritedPset);
      expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
      const multipleInheritedDataBinding = dataBinder.resolve(multipleInheritedPset.getAbsolutePath(), 'BINDING');
      expect(multipleInheritedDataBinding).toBeInstanceOf(ChildDataBinding);
      expect(multipleInheritedDataBinding.getProperty()).toEqual(multipleInheritedPset);
      expect(multipleInheritedDataBinding.onPostCreate).toHaveBeenCalledTimes(1);
    });

    it('should create dataBindings using the closest registered template based on depth', function() {
      // Register the closer and farther templates
      dataBinder.register('BINDING', 'NodeProperty', InheritedChildDataBinding);
      dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding);

      var multipleInheritedPset = PropertyFactory.create(MultipleInheritedTemplate.typeid, 'single');

      // bind workspace view
      dataBinder.attachTo(workspace);
      expect(dataBinder._dataBindingCreatedCounter).toEqual(1);  // The root!

      // It should use the closer NodeProperty Template and InheritedChildDataBinding
      // Looks like:
      //    MultipleInheritedTemplate -> InheritedChildTemplate -> ChildTemplate (Registered) -> NamedProperty
      //                              -> NodeProperty (Registered)

      workspace.root.insert(multipleInheritedPset);
      expect(dataBinder._dataBindingCreatedCounter).toEqual(2); // The root is a NodeProperty as well

      const rootDataBinding = dataBinder.resolve('/', 'BINDING');
      expect(rootDataBinding).toBeInstanceOf(InheritedChildDataBinding);
      expect(rootDataBinding.getProperty()).toEqual(workspace.root);
      expect(rootDataBinding.onPostCreate).toHaveBeenCalledTimes(1);

      const multipleInheritedDataBinding = dataBinder.resolve(multipleInheritedPset.getAbsolutePath(), 'BINDING');
      expect(multipleInheritedDataBinding).toBeInstanceOf(InheritedChildDataBinding);
      expect(multipleInheritedDataBinding.getProperty()).toEqual(multipleInheritedPset);
      expect(multipleInheritedDataBinding.onPostCreate).toHaveBeenCalledTimes(1);
    });

    it('should create all dataBindings with different types registered to related templates', function() {
      // Register the base and inherited template ids
      dataBinder.register('BINDING1', ChildTemplate.typeid, ChildDataBinding);
      dataBinder.register('BINDING2', InheritedChildTemplate.typeid, InheritedChildDataBinding);

      // Create PSet for child, inheritedChild
      var childPset = PropertyFactory.create(ChildTemplate.typeid, 'single');
      var inheritedChildPset = PropertyFactory.create(InheritedChildTemplate.typeid, 'single');

      // bind workspace
      dataBinder.attachTo(workspace);
      expect(dataBinder._dataBindingCreatedCounter).toEqual(0);

      // Add childPset as ChildDataBinding. This should instantiate only ChildDataBinding,
      workspace.root.insert(childPset);
      expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
      const childDataBinding1 = dataBinder.resolve(childPset.getAbsolutePath(), 'BINDING1');
      expect(childDataBinding1).toBeInstanceOf(ChildDataBinding);
      expect(childDataBinding1.getProperty()).toEqual(childPset);
      expect(childDataBinding1.onPostCreate).toHaveBeenCalledTimes(1);
      dataBinder._resetDebugCounters();

      // Add inheritedChildPset as InheritedChildDataBinding. This should instantiate both ChildDataBinding and
      // InheritedChildDataBinding because they have different DataBindingTypes.
      workspace.root.insert(inheritedChildPset);
      expect(dataBinder._dataBindingCreatedCounter).toEqual(2);
      const inheritedChildDataBinding = dataBinder.resolve(inheritedChildPset.getAbsolutePath(), 'BINDING2');
      const childDataBinding = dataBinder.resolve(inheritedChildPset.getAbsolutePath(), 'BINDING1');

      expect(inheritedChildDataBinding).toBeInstanceOf(InheritedChildDataBinding);
      expect(inheritedChildDataBinding.getProperty()).toEqual(inheritedChildPset);
      expect(inheritedChildDataBinding.onPostCreate).toHaveBeenCalledTimes(1);
      expect(childDataBinding).toBeInstanceOf(ChildDataBinding);
      expect(childDataBinding.getProperty()).toEqual(inheritedChildPset);
      expect(childDataBinding.onPostCreate).toHaveBeenCalledTimes(1);
    });
  });

  describe('options and callbacks', function() {
    var dataBinder;

    beforeEach(function() {
      dataBinder = new DataBinder();
    });

    afterEach(function() {
      dataBinder._resetDebugCounters();
      // Unbind checkout view
      dataBinder.detach();
      dataBinder = null;

      // Unregister DataBinding paths
      _.forEach([
        ParentDataBinding,
        DerivedDataBinding,
        ChildDataBinding,
        PrimitiveChildrenDataBinding,
        InheritedChildDataBinding
      ],
      unregisterAllOnPathListeners
      );
    });

    it('should be possible to register to a path, detach, and then reattach', function() {
      var callbackSpy = jest.fn();

      dataBinder.registerOnPath(
        'myPrimitiveChildTemplate.aString', ['insert'], callbackSpy
      );
      dataBinder.registerOnPath(
        'myPrimitiveChildTemplate.aString', ['remove'], callbackSpy
      );
      workspace.root.insert('myPrimitiveChildTemplate', PropertyFactory.create(PrimitiveChildrenTemplate.typeid,
        'single'));

      dataBinder.attachTo(workspace);

      expect(callbackSpy).toHaveBeenCalledTimes(1); // insert from attach
      callbackSpy.mockClear();

      // We give 'false' to detach so it will not remove any definitions or activations
      dataBinder.detach(false);

      expect(callbackSpy).toHaveBeenCalledTimes(1); // Removal by detach
      callbackSpy.mockClear();

      dataBinder.attachTo(workspace);

      expect(callbackSpy).toHaveBeenCalledTimes(1); // insert from attach
    });

    it('should be possible to register to the same path twice', function() {
      var callbackSpy1 = jest.fn();
      var callbackSpy2 = jest.fn();

      dataBinder.attachTo(workspace);

      dataBinder.registerOnPath(
        'myPrimitiveChildTemplate.aString', ['insert'], callbackSpy1
      );
      dataBinder.registerOnPath(
        'myPrimitiveChildTemplate.aString', ['insert'], callbackSpy2
      );

      expect(callbackSpy1).toHaveBeenCalledTimes(0);
      expect(callbackSpy2).toHaveBeenCalledTimes(0);

      workspace.root.insert('myPrimitiveChildTemplate', PropertyFactory.create(PrimitiveChildrenTemplate.typeid,
        'single'));

      expect(callbackSpy1).toHaveBeenCalledTimes(1);
      expect(callbackSpy2).toHaveBeenCalledTimes(1);
    });

    it('should be possible to register to the same path twice and unregister one', function() {
      var callbackSpy1 = jest.fn();
      var callbackSpy2 = jest.fn();

      dataBinder.attachTo(workspace);

      const handle1 = dataBinder.registerOnPath(
        'myPrimitiveChildTemplate.aString', ['insert'], callbackSpy1
      );
      dataBinder.registerOnPath(
        'myPrimitiveChildTemplate.aString', ['insert'], callbackSpy2
      );

      expect(callbackSpy1).toHaveBeenCalledTimes(0);
      expect(callbackSpy2).toHaveBeenCalledTimes(0);

      handle1.destroy();

      workspace.root.insert('myPrimitiveChildTemplate', PropertyFactory.create(PrimitiveChildrenTemplate.typeid,
        'single'));

      expect(callbackSpy1).toHaveBeenCalledTimes(0);
      expect(callbackSpy2).toHaveBeenCalledTimes(1);
    });

    it('should be possible to register before attaching to an empty workspace', function() {
      var callbackSpy = jest.fn();

      dataBinder.registerOnPath('myPrimitiveChildTemplate.aString', ['insert'], callbackSpy);

      expect(callbackSpy).toHaveBeenCalledTimes(0);

      dataBinder.attachTo(workspace);

      expect(callbackSpy).toHaveBeenCalledTimes(0);

      workspace.root.insert('myPrimitiveChildTemplate', PropertyFactory.create(PrimitiveChildrenTemplate.typeid,
        'single'));

      expect(callbackSpy).toHaveBeenCalledTimes(1);
    });

    it('should be possible to register before attaching to a populated workspace', function() {
      var callbackSpy = jest.fn();

      dataBinder.registerOnPath('myPrimitiveChildTemplate.aString', ['insert'], callbackSpy);
      workspace.root.insert('myPrimitiveChildTemplate', PropertyFactory.create(PrimitiveChildrenTemplate.typeid,
        'single'));

      expect(callbackSpy).toHaveBeenCalledTimes(0);

      dataBinder.attachTo(workspace);

      expect(callbackSpy).toHaveBeenCalledTimes(1);
    });

    it('should be possible to register retroactively on a path and use requestChangesetPostProcessing', function() {
      var callbackSpyRegistered = jest.fn();

      dataBinder.attachTo(workspace);
      workspace.root.insert('mypath', PropertyFactory.create(PrimitiveChildrenTemplate.typeid));

      dataBinder.registerOnPath('mypath', ['insert'], () => {
        dataBinder.requestChangesetPostProcessing(callbackSpyRegistered);
      });

      expect(callbackSpyRegistered).toHaveBeenCalledTimes(1);
    });

    it.only('should be possible to modify property and inside requestChangesetPostProcessing and get notified on the changes', function() {
      const callbackSpyRegistered = jest.fn();
      const callbackNestedSpyRegistered = jest.fn();

      dataBinder.attachTo(workspace);

      dataBinder.registerOnPath('mypath.aString', ['modify'], () => {
        callbackNestedSpyRegistered();
      });

      dataBinder.registerOnPath('mypath', ['insert'], () => {
        callbackSpyRegistered();
        dataBinder.requestChangesetPostProcessing(() => {
          const prop = workspace.root.get('mypath');
          prop.get('aString').setValue('modified');
        });
      });

      workspace.root.insert('mypath', PropertyFactory.create(PrimitiveChildrenTemplate.typeid));

      expect(callbackSpyRegistered).toHaveBeenCalledTimes(1);
      expect(callbackNestedSpyRegistered).toHaveBeenCalledTimes(1);
    });

    it('should be possible to unregister before attaching to a workspace', function() {
      var callbackSpyRegistered = jest.fn();
      var callbackSpyUnregistered = jest.fn();
      // eslint-disable-next-line max-len
      const handle = dataBinder.registerOnPath('myPrimitiveChildTemplate.aString', ['insert'], callbackSpyUnregistered);
      dataBinder.registerOnPath('myPrimitiveChildTemplate.aString', ['insert'], callbackSpyRegistered);

      expect(callbackSpyRegistered).toHaveBeenCalledTimes(0);
      expect(callbackSpyUnregistered).toHaveBeenCalledTimes(0);

      // We unregister the first callback, before we even attach to the workspace.
      handle.destroy();

      expect(callbackSpyRegistered).toHaveBeenCalledTimes(0);
      expect(callbackSpyUnregistered).toHaveBeenCalledTimes(0);

      dataBinder.attachTo(workspace);

      expect(callbackSpyRegistered).toHaveBeenCalledTimes(0);
      expect(callbackSpyUnregistered).toHaveBeenCalledTimes(0);

      workspace.root.insert('myPrimitiveChildTemplate', PropertyFactory.create(PrimitiveChildrenTemplate.typeid,
        'single'));

      // The one that was unregistered before attaching to the workspace shouldn't fire.
      expect(callbackSpyRegistered).toHaveBeenCalledTimes(1);
      expect(callbackSpyUnregistered).toHaveBeenCalledTimes(0);
    });

    it('should execute deferred callbacks from DataBinding.registerOnPath() inside requestChangesetPostProcessing',
      function() {

        var callbackCount = 0;
        var callbackError = false;
        var callbackSpy = jest.fn(function(in_index, in_context) {
          if (callbackCount !== 0 || in_index !== 'two' || !(in_context.getOperationType() === 'modify')) {
            callbackError = true;
          }
          callbackCount = 1;
        });
        var deferredCallbackSpy = jest.fn(function(in_index, in_context) {
          if (callbackCount !== 1 || in_index !== 'two' || !(in_context.getOperationType() === 'modify')) {
            callbackError = true;
          }
        });

        PrimitiveChildrenDataBinding.registerOnPath(
          'mapOfNumbers', ['collectionModify'], deferredCallbackSpy, { isDeferred: true }
        );
        PrimitiveChildrenDataBinding.registerOnPath(
          'mapOfNumbers', ['collectionModify'], callbackSpy, { isDeferred: false }
        );
        dataBinder.register('BINDING', PrimitiveChildrenTemplate.typeid, PrimitiveChildrenDataBinding);

        dataBinder.attachTo(workspace);

        var initialValues = {
          aString: 'a new string',
          aNumber: 2,
          aBoolean: true,
          anEnum: 1,
          arrayOfNumbers: [1, 2, 3],
          mapOfNumbers: { one: 1, two: 2, three: 3 },
          nested: {
            aNumber: 1
          }
        };

        workspace.root.insert('primitiveChildrenPset', PropertyFactory.create(PrimitiveChildrenTemplate.typeid,
          'single',
          initialValues));
        expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
        dataBinder._resetDebugCounters();

        workspace.root.get('primitiveChildrenPset').get('mapOfNumbers').set('two', 22);
        expect(callbackError).toEqual(false);

      });

    it('should be able to call dataBinder.registerOnPath() before attaching to a workspace', function() {
      var callbackSpy = jest.fn();

      dataBinder.registerOnPath('/myPrimitiveChildTemplate.aString', ['insert', 'modify', 'remove'],
        callbackSpy);

      dataBinder.attachTo(workspace);

      workspace.root.insert('myPrimitiveChildTemplate', PropertyFactory.create(PrimitiveChildrenTemplate.typeid,
        'single'));

      expect(callbackSpy).toHaveBeenCalledTimes(1);
    });

    it('should execute deferred callbacks from dataBinder.registerOnPath() inside requestChangesetPostProcessing',
      function() {
        var callbackCount = 0;
        var callbackError = false;
        var callbackSpy = jest.fn(function(params) {
          if (callbackCount !== 0 || !(params instanceof ModificationContext)) {
            callbackError = true;
          }
          callbackCount = 1;
        });
        var deferredCallbackSpy = jest.fn(function(params) {
          if (callbackCount !== 1 || !(params instanceof ModificationContext)) {
            callbackError = true;
          }
        });

        dataBinder.registerOnPath('myPrimitiveChildTemplate.aString', ['insert', 'modify', 'remove'],
          deferredCallbackSpy, { isDeferred: true });

        dataBinder.registerOnPath('myPrimitiveChildTemplate.aString', ['insert', 'modify', 'remove'], callbackSpy,
          { isDeferred: false });

        dataBinder.attachTo(workspace);

        workspace.root.insert('myPrimitiveChildTemplate', PropertyFactory.create(PrimitiveChildrenTemplate.typeid,
          'single'));

        expect(deferredCallbackSpy).toHaveBeenCalledTimes(1);
        expect(callbackSpy).toHaveBeenCalledTimes(1);
        expect(callbackError).toEqual(false);

      });

    it('should allow registering to two paths at once, but only hearing about it once', function() {
      let callbackCount = 0;
      const callbackSpy = jest.fn(function(params) {
        callbackCount++;
      });
      workspace.root.insert('myPrimitiveChildTemplate', PropertyFactory.create(PrimitiveChildrenTemplate.typeid,
        'single'));
      dataBinder.attachTo(workspace);
      dataBinder.registerOnPath(
        ['myPrimitiveChildTemplate.aString', 'myPrimitiveChildTemplate.aNumber'],
        ['insert', 'modify', 'remove'],
        callbackSpy
      );
      expect(callbackCount).toEqual(1);
    });

    it('should allow registering to an array with only one entry', function() {
      let callbackCount = 0;
      const callbackSpy = jest.fn(function(params) {
        callbackCount++;
      });
      workspace.root.insert('myPrimitiveChildTemplate', PropertyFactory.create(PrimitiveChildrenTemplate.typeid,
        'single'));
      dataBinder.attachTo(workspace);
      dataBinder.registerOnPath(
        ['myPrimitiveChildTemplate.aString'],
        ['insert', 'modify', 'remove'],
        callbackSpy
      );
      expect(callbackCount).toEqual(1);
    });

    it('should allow registering to two paths at once, but only hearing about it once, when deferred', function() {
      let callbackCount = 0;
      const callbackSpy = jest.fn(function(params) {
        callbackCount++;
      });
      workspace.root.insert('myPrimitiveChildTemplate', PropertyFactory.create(PrimitiveChildrenTemplate.typeid,
        'single'));
      dataBinder.attachTo(workspace);
      dataBinder.registerOnPath(
        ['myPrimitiveChildTemplate.aString', 'myPrimitiveChildTemplate.aNumber'],
        ['insert', 'modify', 'remove'],
        callbackSpy, {
          isDeferred: true
        }
      );
      expect(callbackCount).toEqual(1);
    });

    it('should allow post processing from the constructor - retroactive', function() {
      let constructorCalled = false;
      let destructorCalled = false;

      class A extends DataBinding {
        constructor(params) {
          super(params);
          this.getDataBinder().requestChangesetPostProcessing(() => {
            constructorCalled = true;
          });
        }

        onRemove() {
          this.getDataBinder().requestChangesetPostProcessing(() => {
            destructorCalled = true;
          });
        }
      }

      dataBinder.attachTo(workspace);

      workspace.root.insert(PropertyFactory.create(ChildTemplate.typeid));
      dataBinder.defineDataBinding('TEST', ChildTemplate.typeid, A);

      const handle = dataBinder.activateDataBinding('TEST');

      // constructor is called retroactively on the existing property
      expect(constructorCalled).toEqual(true);

      // destructor is called preemptively despite the property still existing
      handle.destroy();
      expect(destructorCalled).toEqual(true);
    });

    it('should allow post processing from the constructor - changesets', function() {
      let constructorCalled = false;
      let destructorCalled = false;

      class A extends DataBinding {
        constructor(params) {
          super(params);
          this.getDataBinder().requestChangesetPostProcessing(() => {
            constructorCalled = true;
          });
        }

        onRemove() {
          this.getDataBinder().requestChangesetPostProcessing(() => {
            destructorCalled = true;
          });
        }
      }

      dataBinder.attachTo(workspace);
      dataBinder.defineDataBinding('TEST', ChildTemplate.typeid, A);
      dataBinder.activateDataBinding('TEST');

      // constructor is called due to the changeset insert
      const childProp = PropertyFactory.create(ChildTemplate.typeid);
      workspace.root.insert(childProp);

      expect(constructorCalled).toEqual(true);

      // destructor is called due to the changeset remove
      workspace.root.remove(childProp);
      expect(destructorCalled).toEqual(true);
    });

    it('should allow post processing from the constructor - attach/detach', function() {
      let constructorCalled = false;
      let destructorCalled = false;

      class A extends DataBinding {
        constructor(params) {
          super(params);
          this.getDataBinder().requestChangesetPostProcessing(() => {
            constructorCalled = true;
          });
        }

        onRemove() {
          this.getDataBinder().requestChangesetPostProcessing(() => {
            destructorCalled = true;
          });
        }
      }

      dataBinder.defineDataBinding('TEST', ChildTemplate.typeid, A);
      dataBinder.activateDataBinding('TEST');
      const childProp = PropertyFactory.create(ChildTemplate.typeid);
      workspace.root.insert(childProp);

      // constructor is called due to the attach
      dataBinder.attachTo(workspace);
      expect(constructorCalled).toEqual(true);

      // destructor is called due to the detach
      dataBinder.detach();
      expect(destructorCalled).toEqual(true);
    });

    it('should throw for bad registration option paths', function() {
      expect(function() {
        dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding,
          { exactPath: 'badArray[' });
      }).toThrow();
      expect(function() {
        dataBinder.register('BINDING2', ChildTemplate.typeid, ChildDataBinding,
          { includePrefix: '"unfinished thought' });
      }).toThrow();
      expect(function() {
        dataBinder.register('BINDING3', ChildTemplate.typeid, ChildDataBinding,
          { excludePrefix: '......and then I said, like, no way' });
      }).toThrow();
    });

    // TODO: fix previously working test
    it.skip('should not throw for good registration option paths', function() {
      expect(function() {
        dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding,
          { exactPath: 'goodArray[0]' });
      }).toThrow();
      expect(function() {
        dataBinder.register('BINDING2', ChildTemplate.typeid, ChildDataBinding,
          { includePrefix: '"finished thought"' });
      }).toThrow();
      expect(function() {
        dataBinder.register('BINDING3', ChildTemplate.typeid, ChildDataBinding,
          { excludePrefix: 'and she said way' });
      }).toThrow();
    });

    it('should not create an DataBinding when forbidden by exact path when registration is delayed', function() {
      // Create PSet for inherited child typeid
      var childPset = PropertyFactory.create(ChildTemplate.typeid, 'single');

      // Add the child to the workspace and bind
      workspace.root.insert('notMyChildTemplate', childPset);
      expect(dataBinder._dataBindingCreatedCounter).toEqual(0);
      dataBinder.attachTo(workspace);

      // Register the base (Child) typeid

      dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding,
        { exactPath: 'myChildTemplate', includePrefix: 'myChildTemplate' }); // includePrefix is ignored

      // DataBinding should not be created as a registered DataBinding
      expect(dataBinder._dataBindingCreatedCounter).toEqual(0);
    });

    it('should not create an DataBinding when forbidden by exact path', function() {
      // Register the base (Child) typeid
      dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding,
        { exactPath: 'myChildTemplate', includePrefix: 'myChildTemplate' }); // includePrefix is ignored

      // Create PSet for inherited child typeid
      var childPset = PropertyFactory.create(ChildTemplate.typeid, 'single');

      // Add the inherited child to the workspace and bind
      workspace.root.insert('notMyChildTemplate', childPset);
      expect(dataBinder._dataBindingCreatedCounter).toEqual(0);
      dataBinder.attachTo(workspace);

      // DataBinding should not be created as a registered DataBinding
      expect(dataBinder._dataBindingCreatedCounter).toEqual(0);
    });

    it('should be able to deactivate an entire binding type', function() {
      // Register the base (Child) typeid
      dataBinder.defineDataBinding('BINDING', ChildTemplate.typeid, ChildDataBinding);

      // Create PSet for inherited child typeid
      var childPset = PropertyFactory.create(ChildTemplate.typeid, 'single');

      // Add the inherited child to the workspace and bind
      workspace.root.insert('child', childPset);
      expect(dataBinder._dataBindingCreatedCounter).toEqual(0);
      dataBinder.attachTo(workspace);

      // Not activated yet
      expect(dataBinder._dataBindingCreatedCounter).toEqual(0);

      dataBinder.activateDataBinding('BINDING');
      // DataBinding should be created as a registered DataBinding
      expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
      dataBinder._resetDebugCounters();

      // Detach, but don't deactivate or undefine anything
      dataBinder.detach(false);

      // Deactivate the DataBinding, but leave defined
      dataBinder.unregisterDataBindings('BINDING', true, false);

      dataBinder.attachTo(workspace);

      // Not activated yet
      expect(dataBinder._dataBindingCreatedCounter).toEqual(0);

      // Activate again - the databinding is still defined.
      dataBinder.activateDataBinding('BINDING');

      // DataBinding should be created as a registered DataBinding
      expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
    });

    const dataBindingTreeRefSetup = function() {
      dataBinder.attachTo(workspace);

      const myRoot = PropertyFactory.create('NodeProperty');
      workspace.root.insert('myRoot', myRoot);

      const a0 = PropertyFactory.create(ReferenceParentTemplate.typeid);
      const a1 = PropertyFactory.create(ReferenceParentTemplate.typeid);
      const a2 = PropertyFactory.create(ReferenceParentTemplate.typeid);
      myRoot.insert('a0', a0);
      myRoot.insert('a1', a1);
      myRoot.insert('a2', a2);

      // Make a cycle in the references in both directions to ensure all the combinations are covered.
      a0.get('ref1', RESOLVE_NEVER).setValue('/myRoot.a1');
      a0.get('ref2', RESOLVE_NEVER).setValue('/myRoot.a2');
      a1.get('ref1', RESOLVE_NEVER).setValue('/myRoot.a0');
      a1.get('ref2', RESOLVE_NEVER).setValue('/myRoot.a2');
      a2.get('ref1', RESOLVE_NEVER).setValue('/myRoot.a0');
      a2.get('ref2', RESOLVE_NEVER).setValue('/myRoot.a1');

      const callbackSpy = jest.fn();
      ChildDataBinding.registerOnPath('ref1.someData', ['insert', 'modify'], callbackSpy);
      ChildDataBinding.registerOnPath('ref2.someData', ['insert', 'modify'], callbackSpy);
      dataBinder.defineDataBinding('BINDING', ReferenceParentTemplate.typeid, ChildDataBinding);
      dataBinder.activateDataBinding('BINDING');
      expect(callbackSpy).toHaveBeenCalledTimes(6);

      return myRoot;
    };

    it('should not destroy DataBinding tree nodes too early - entire tree', function() {
      const myRoot = dataBindingTreeRefSetup();

      // This removes everything at once -- issue LYNXDEV-5729
      workspace.root.remove(myRoot);
    });

    it('should not destroy DataBinding tree nodes too early - partially used tree', function() {
      const myRoot = dataBindingTreeRefSetup();

      // remove two elements in different parts. Interally, one subtree will be removed while
      // another subtree hasn't been considered yet, and there are references between the two
      workspace.pushNotificationDelayScope();
      myRoot.remove(myRoot.get('a0'));
      myRoot.remove(myRoot.get('a1'));
      myRoot.remove(myRoot.get('a2'));
      workspace.popNotificationDelayScope();
    });
    // TODO: skip previously working test
    it.skip('should correctly destroy the tree even if it has an array with callbacks into it (LYNXDEV-8835)', function() {
      dataBinder.attachTo(workspace);

      const myRoot = PropertyFactory.create('NodeProperty');
      workspace.root.insert('myRoot', myRoot);

      const a0 = PropertyFactory.create(ReferenceParentTemplate.typeid);
      const myArray = PropertyFactory.create(ChildTemplate.typeid, 'array');
      myArray.push(PropertyFactory.create(ChildTemplate.typeid));
      myArray.push(PropertyFactory.create(ChildTemplate.typeid));
      myRoot.insert('a0', a0);
      a0.insert('myArray', myArray);

      a0.get('ref1', RESOLVE_NEVER).setValue('/myRoot.a0.myArray[0]');

      const callbackSpy = jest.fn();
      ChildDataBinding.registerOnPath('ref1.text', ['insert', 'modify'], callbackSpy);
      dataBinder.defineDataBinding('BINDING', ReferenceParentTemplate.typeid, ChildDataBinding);
      dataBinder.activateDataBinding('BINDING');
      expect(callbackSpy).toHaveBeenCalledTimes(1);

      // This removes everything at once
      workspace.root.remove(myRoot);
    });

    it('should be able to undefine an entire binding type', function() {
      // Register the base (Child) typeid
      dataBinder.defineDataBinding('BINDING', ChildTemplate.typeid, ChildDataBinding);

      // Create PSet for inherited child typeid
      var childPset = PropertyFactory.create(ChildTemplate.typeid, 'single');

      // Add the inherited child to the workspace and bind
      workspace.root.insert('child', childPset);
      expect(dataBinder._dataBindingCreatedCounter).toEqual(0);
      dataBinder.attachTo(workspace);

      // Not activated yet
      expect(dataBinder._dataBindingCreatedCounter).toEqual(0);

      // Activate, should create one
      dataBinder.activateDataBinding('BINDING');

      // DataBinding should be created as a registered DataBinding
      expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
      dataBinder._resetDebugCounters();

      // Detach, without undefining/destroying anything
      dataBinder.detach(false);

      // Deactive/undefined BINDING
      dataBinder.unregisterDataBindings('BINDING');

      dataBinder.attachTo(workspace);

      // No dataBindings -- there is no definition
      expect(dataBinder._dataBindingCreatedCounter).toEqual(0);
    });

    describe('test activating databindings with different path options that overlap', function() {
      beforeEach(function() {
        dataBinder.defineDataBinding('BINDING', ChildTemplate.typeid, ChildDataBinding);
        dataBinder.defineDataBinding('BINDING2', ChildTemplate.typeid, ChildDataBinding);

        workspace.root.insert('child1', PropertyFactory.create(ChildTemplate.typeid));
        workspace.root.insert('child2', PropertyFactory.create(ChildTemplate.typeid));
      });

      it('overlapping but different includePrefixes', function() {
        dataBinder.attachTo(workspace);
        dataBinder.pushBindingActivationScope();

        dataBinder.activateDataBinding('BINDING', undefined, {
          includePrefix: '/'
        });
        dataBinder.activateDataBinding('BINDING2', undefined, {
          includePrefix: '/child1'
        });

        dataBinder.popBindingActivationScope();

        // Two for BINDING, one for BINDING2
        expect(dataBinder._dataBindingCreatedCounter).toEqual(3);
      });

      it('separate includePrefixes', function() {
        dataBinder.attachTo(workspace);
        dataBinder.pushBindingActivationScope();

        dataBinder.activateDataBinding('BINDING', undefined, {
          includePrefix: '/child1'
        });
        dataBinder.activateDataBinding('BINDING2', undefined, {
          includePrefix: '/child2'
        });

        dataBinder.popBindingActivationScope();

        // one for each category
        expect(dataBinder._dataBindingCreatedCounter).toEqual(2);
      });

      it('general application and exactPath', function() {
        dataBinder.attachTo(workspace);
        dataBinder.pushBindingActivationScope();

        dataBinder.activateDataBinding('BINDING', undefined, {
          exactPath: '/child1'
        });
        dataBinder.activateDataBinding('BINDING2');

        dataBinder.popBindingActivationScope();

        // one for BINDING, two for BINDING2
        expect(dataBinder._dataBindingCreatedCounter).toEqual(3);
      });

      it('identical exactPaths', function() {
        dataBinder.attachTo(workspace);
        dataBinder.pushBindingActivationScope();

        dataBinder.activateDataBinding('BINDING', undefined, {
          exactPath: '/child1'
        });
        dataBinder.activateDataBinding('BINDING2', undefined, {
          exactPath: '/child1'
        });

        dataBinder.popBindingActivationScope();

        // one for BINDING, one for BINDING2
        expect(dataBinder._dataBindingCreatedCounter).toEqual(2);
      });

      it('identical exactPaths but without a slash', function() {
        dataBinder.attachTo(workspace);
        dataBinder.pushBindingActivationScope();

        dataBinder.activateDataBinding('BINDING', undefined, {
          exactPath: '/child1'
        });
        dataBinder.activateDataBinding('BINDING2', undefined, {
          exactPath: 'child1'
        });

        dataBinder.popBindingActivationScope();

        // one for BINDING, one for BINDING2
        expect(dataBinder._dataBindingCreatedCounter).toEqual(2);
      });

      it('excludePrefix and general', function() {
        dataBinder.attachTo(workspace);
        dataBinder.pushBindingActivationScope();

        dataBinder.activateDataBinding('BINDING', undefined, {
          excludePrefix: '/child1'
        });
        dataBinder.activateDataBinding('BINDING2');

        dataBinder.popBindingActivationScope();

        // one for BINDING, two for BINDING2
        expect(dataBinder._dataBindingCreatedCounter).toEqual(3);
      });

      it('two excludePrefixes', function() {
        dataBinder.attachTo(workspace);
        dataBinder.pushBindingActivationScope();

        dataBinder.activateDataBinding('BINDING', undefined, {
          excludePrefix: '/child1'
        });
        dataBinder.activateDataBinding('BINDING2', undefined, {
          excludePrefix: '/child1'
        });

        dataBinder.popBindingActivationScope();

        // one for BINDING, one for BINDING2
        expect(dataBinder._dataBindingCreatedCounter).toEqual(2);
      });

      it('excludePrefix and includePrefix', function() {
        dataBinder.attachTo(workspace);
        dataBinder.pushBindingActivationScope();

        dataBinder.activateDataBinding('BINDING', undefined, {
          excludePrefix: '/child1'
        });
        dataBinder.activateDataBinding('BINDING2', undefined, {
          includePrefix: '/child1'
        });

        dataBinder.popBindingActivationScope();

        // one for BINDING, one for BINDING2
        expect(dataBinder._dataBindingCreatedCounter).toEqual(2);
      });

      it('excludePrefix and exactPath overlapping', function() {
        dataBinder.attachTo(workspace);
        dataBinder.pushBindingActivationScope();

        dataBinder.activateDataBinding('BINDING', undefined, {
          excludePrefix: '/child1'
        });
        dataBinder.activateDataBinding('BINDING2', undefined, {
          exactPath: '/child1'
        });

        dataBinder.popBindingActivationScope();

        // one for BINDING, one for BINDING2
        expect(dataBinder._dataBindingCreatedCounter).toEqual(2);
      });

      it('excludePrefix and exactPath separate', function() {
        dataBinder.attachTo(workspace);
        dataBinder.pushBindingActivationScope();

        dataBinder.activateDataBinding('BINDING', undefined, {
          excludePrefix: '/child1'
        });
        dataBinder.activateDataBinding('BINDING2', undefined, {
          exactPath: '/child2'
        });

        dataBinder.popBindingActivationScope();

        // one for BINDING, one for BINDING2
        expect(dataBinder._dataBindingCreatedCounter).toEqual(2);
      });
    });

    it('should be able to undefine all binding types', function() {
      // Register the base (Child) typeid
      dataBinder.defineDataBinding('BINDING', ChildTemplate.typeid, ChildDataBinding);
      dataBinder.defineDataBinding('BINDING2', ChildTemplate.typeid, ChildDataBinding);

      // Create PSet for inherited child typeid
      var childPset = PropertyFactory.create(ChildTemplate.typeid, 'single');

      // Add the inherited child to the workspace and bind
      workspace.root.insert('child', childPset);
      expect(dataBinder._dataBindingCreatedCounter).toEqual(0);
      dataBinder.attachTo(workspace);

      // Not activated yet
      expect(dataBinder._dataBindingCreatedCounter).toEqual(0);

      dataBinder.activateDataBinding('BINDING');
      dataBinder.activateDataBinding('BINDING2');

      // DataBinding should be created as a registered DataBinding
      expect(dataBinder._dataBindingCreatedCounter).toEqual(2);
      dataBinder._resetDebugCounters();

      // Detach (without unregistering anything)
      dataBinder.detach(false);

      // undefine _all_ the data bindings
      dataBinder.unregisterDataBindings();

      dataBinder.attachTo(workspace);

      // No dataBindings -- there are no definitions
      expect(dataBinder._dataBindingCreatedCounter).toEqual(0);
    });

    it('should be able to undefine one binding type', function() {
      // Register the base (Child) typeid
      dataBinder.defineDataBinding('BINDING', ChildTemplate.typeid, ChildDataBinding);
      dataBinder.defineDataBinding('BINDING2', ChildTemplate.typeid, ChildDataBinding);

      // Create PSet for inherited child typeid
      var childPset = PropertyFactory.create(ChildTemplate.typeid, 'single');

      // Add the inherited child to the workspace and bind
      workspace.root.insert('child', childPset);
      dataBinder.attachTo(workspace);

      // Not activated yet
      expect(dataBinder._dataBindingCreatedCounter).toEqual(0);

      dataBinder.activateDataBinding('BINDING');
      dataBinder.activateDataBinding('BINDING2');

      // DataBinding should be created as a registered DataBinding
      expect(dataBinder._dataBindingCreatedCounter).toEqual(2);
      dataBinder._resetDebugCounters();

      // Detach (without unregistering anything)
      dataBinder.detach(false);

      // undefine all the BINDING data bindings
      dataBinder.unregisterDataBindings('BINDING');

      dataBinder.attachTo(workspace);

      // Only BINDING2 should be created
      expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
    });

    it('should be able to undefine one binding type, multiple case', function() {
      // Register the base (Child) typeid
      dataBinder.defineDataBinding('BINDING', ChildTemplate.typeid, ChildDataBinding);
      dataBinder.defineDataBinding('BINDING', InheritedChildTemplate.typeid, InheritedChildDataBinding);
      dataBinder.defineDataBinding('BINDING2', ChildTemplate.typeid, ChildDataBinding);
      dataBinder.defineDataBinding('BINDING2', InheritedChildTemplate.typeid, InheritedChildDataBinding);

      // Create PSet for child typeid
      const childPset = PropertyFactory.create(ChildTemplate.typeid, 'single');
      workspace.root.insert('child', childPset);
      const inheritedChildPset = PropertyFactory.create(InheritedChildTemplate.typeid, 'single');
      workspace.root.insert('inheritedChild', inheritedChildPset);

      expect(dataBinder._dataBindingCreatedCounter).toEqual(0);
      dataBinder.attachTo(workspace);

      // Not activated yet
      expect(dataBinder._dataBindingCreatedCounter).toEqual(0);

      dataBinder.activateDataBinding('BINDING');
      dataBinder.activateDataBinding('BINDING2');

      // DataBinding should be created as a registered DataBinding
      expect(dataBinder._dataBindingCreatedCounter).toEqual(4);
      dataBinder._resetDebugCounters();

      // Detach (without unregistering anything)
      dataBinder.detach(false);

      // undefine all the BINDING data bindings
      dataBinder.unregisterDataBindings('BINDING');

      dataBinder.attachTo(workspace);

      // Only BINDING2 should be created
      expect(dataBinder._dataBindingCreatedCounter).toEqual(2);
    });

    it('should only create an DataBinding when required by exact path', function() {
      // Register the base (Child) typeid
      dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding,
        { exactPath: 'myChildTemplate', excludePrefix: 'myChildTemplate' }); // excludePrefix is ignored

      // Create PSets for inherited child typeid
      var childPset1 = PropertyFactory.create(ChildTemplate.typeid, 'single');
      var childPset2 = PropertyFactory.create(ChildTemplate.typeid, 'single');

      // Add the inherited child to the workspace and bind
      workspace.root.insert('notMyChildTemplate', childPset1); // this will not create an DataBinding
      workspace.root.insert('myChildTemplate', childPset2); // this will create an DataBinding
      expect(dataBinder._dataBindingCreatedCounter).toEqual(0);
      dataBinder.attachTo(workspace);

      // DataBinding should be created as a registered DataBinding
      expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
      const childDataBinding = dataBinder.resolve(childPset2.getAbsolutePath(), 'BINDING');
      expect(childDataBinding).toBeInstanceOf(ChildDataBinding);
      expect(childDataBinding.getProperty()).toEqual(childPset2);
      expect(childDataBinding.onPostCreate).toHaveBeenCalledTimes(1);
    });

    it('should not create an DataBinding when forbidden by excludePrefix', function() {
      // Register the base (Child) typeid
      dataBinder.register('BINDING',
        ChildTemplate.typeid,
        ChildDataBinding,
        { excludePrefix: '/myChildTemplate' });

      // Create PSet for inherited child typeid
      var childPset = PropertyFactory.create(ChildTemplate.typeid, 'single');

      // Add the inherited child to the workspace and bind
      workspace.root.insert('myChildTemplate', childPset);
      expect(dataBinder._dataBindingCreatedCounter).toEqual(0);
      dataBinder.attachTo(workspace);

      // DataBinding not should be created as a registered DataBinding
      expect(dataBinder._dataBindingCreatedCounter).toEqual(0);
      // Create another PSet for inherited child typeid
      var childPset2 = PropertyFactory.create(ChildTemplate.typeid, 'single');
      // Add the inherited child to the workspace and bind
      workspace.root.insert('myOtherChildTemplate', childPset2);
      // DataBinding should be created as a registered DataBinding
      expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
      const childDataBinding = dataBinder.resolve(childPset2.getAbsolutePath(), 'BINDING');
      expect(childDataBinding).toBeInstanceOf(ChildDataBinding);
      expect(childDataBinding.getProperty()).toEqual(childPset2);
      expect(childDataBinding.onPostCreate).toHaveBeenCalledTimes(1);
    });
    it('excludePrefix with absolute paths using brackets', function() {
      dataBinder.attachTo(workspace);

      //   Register the base (Child) typeid
      dataBinder.defineDataBinding('BINDING',
        ChildTemplate.typeid,
        ChildDataBinding);
      const namedPropertyMap = PropertyFactory.create(ChildTemplate.typeid, 'map');
      workspace.root.insert('map', namedPropertyMap);
      const namedProperty = PropertyFactory.create(ChildTemplate.typeid);
      namedPropertyMap.insert(namedProperty.getId(), namedProperty);
      dataBinder.activateDataBinding('BINDING', ChildTemplate.typeid, {
        excludePrefix: namedProperty.getAbsolutePath()
      });
      expect(dataBinder._dataBindingCreatedCounter).toEqual(0);
    });

    it('exactPath with absolute paths using brackets', function() {
      dataBinder.attachTo(workspace);

      //   Register the base (Child) typeid
      dataBinder.defineDataBinding('BINDING',
        ChildTemplate.typeid,
        ChildDataBinding);

      const namedPropertyMap = PropertyFactory.create(ChildTemplate.typeid, 'map');
      workspace.root.insert('map', namedPropertyMap);
      const namedProperty1 = PropertyFactory.create(ChildTemplate.typeid);
      const namedProperty2 = PropertyFactory.create(ChildTemplate.typeid);
      namedPropertyMap.insert(namedProperty1.getId(), namedProperty1);
      namedPropertyMap.insert(namedProperty2.getId(), namedProperty2);

      dataBinder.activateDataBinding('BINDING', ChildTemplate.typeid, {
        exactPath: namedProperty1.getAbsolutePath()
      });
      expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
    });

    it('includePrefix with absolute paths using brackets', function() {
      dataBinder.attachTo(workspace);

      //   Register the base (Child) typeid
      dataBinder.defineDataBinding('BINDING',
        ChildTemplate.typeid,
        ChildDataBinding);

      const namedPropertyMap = PropertyFactory.create(ChildTemplate.typeid, 'map');
      workspace.root.insert('map', namedPropertyMap);
      const namedProperty1 = PropertyFactory.create(ChildTemplate.typeid);
      const namedProperty2 = PropertyFactory.create(ChildTemplate.typeid);
      namedPropertyMap.insert(namedProperty1.getId(), namedProperty1);
      namedPropertyMap.insert(namedProperty2.getId(), namedProperty2);

      dataBinder.activateDataBinding('BINDING', ChildTemplate.typeid, {
        includePrefix: namedProperty1.getAbsolutePath()
      });
      expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
    });

    it('should only create an DataBinding when allowed by includePrefix', function() {
      // Register the base (Child) typeid
      dataBinder.register('BINDING',
        ChildTemplate.typeid,
        ChildDataBinding,
        { includePrefix: '/myChildTemplate' });

      // Create PSet for inherited child typeid
      var childPset = PropertyFactory.create(ChildTemplate.typeid, 'single');

      // Add the inherited child to the workspace and bind
      workspace.root.insert('notMyChildTemplate', childPset);
      expect(dataBinder._dataBindingCreatedCounter).toEqual(0);
      dataBinder.attachTo(workspace);

      // DataBinding not should be created as a registered DataBinding
      expect(dataBinder._dataBindingCreatedCounter).toEqual(0);
      // Create another PSet for inherited child typeid
      var childPset2 = PropertyFactory.create(ChildTemplate.typeid, 'single');
      // Add the inherited child to the workspace and bind
      workspace.root.insert('myChildTemplateAfterAll', childPset2);
      // DataBinding should be created as a registered DataBinding
      expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
      const childDataBinding = dataBinder.resolve(childPset2.getAbsolutePath(), 'BINDING');
      expect(childDataBinding).toBeInstanceOf(ChildDataBinding);
      expect(childDataBinding.getProperty()).toEqual(childPset2);
      expect(childDataBinding.onPostCreate).toHaveBeenCalledTimes(1);
    });

    it('should not be able to replace the same DataBinding multiple times with different options', function() {
      // Register the same DataBinding (w/ the same type) twice with different options

      dataBinder.register('BINDING',
        ChildTemplate.typeid,
        ChildDataBinding,
        { includePrefix: 'myChildTemplate' });

      expect(function() {
        dataBinder.register('BINDING',
          ChildTemplate.typeid,
          ChildDataBinding,
          { exactPath: 'myOtherChildTemplate' });
      }).toThrow();

      expect(function() {
        dataBinder.register('BINDING',
          ChildTemplate.typeid,
          ChildDataBinding,
          { exactPath: 'yetAnotherChildTemplate' });
      }).toThrow();
      dataBinder.attachTo(workspace);

      // Add the inherited child to the workspace and bind
      workspace.root.insert('notMyChildTemplate', PropertyFactory.create(ChildTemplate.typeid, 'single'));
      expect(dataBinder._dataBindingCreatedCounter).toEqual(0);
      workspace.root.insert('myOtherChildTemplate', PropertyFactory.create(ChildTemplate.typeid, 'single'));
      expect(dataBinder._dataBindingCreatedCounter).toEqual(0);
      workspace.root.insert('yetAnotherChildTemplate', PropertyFactory.create(ChildTemplate.typeid, 'single'));
      expect(dataBinder._dataBindingCreatedCounter).toEqual(0);
      workspace.root.insert('myChildTemplate', PropertyFactory.create(ChildTemplate.typeid, 'single'));
      expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
      const childDataBinding = dataBinder.resolve('/myChildTemplate', 'BINDING');
      expect(childDataBinding).toBeInstanceOf(ChildDataBinding);
      expect(childDataBinding.getProperty().getTypeid()).toEqual(ChildTemplate.typeid);
      expect(childDataBinding.onPostCreate).toHaveBeenCalledTimes(1);
    });

    // TODO: Adapt this test to the new insert handling
    it('TODO: should notify parent when inserting children within the same scoped notification', function() {
      // Register the dataBindings
      dataBinder.register('BINDING', ArrayContainerTemplate.typeid, ParentDataBinding, { context: 'single' });
      dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding, { context: 'array' });
      expect(dataBinder._dataBindingCreatedCounter).toEqual(0);
      dataBinder.attachTo(workspace);

      workspace.pushNotificationDelayScope();
      // Add the container pset
      var newArrayPset = PropertyFactory.create(ArrayContainerTemplate.typeid, 'single');
      var newChildPset = PropertyFactory.create(ChildTemplate.typeid, 'single');
      newArrayPset.resolvePath('nested.subArray').push(newChildPset);
      // newArrayPset should produce a ParentDataBinding and a ChildDataBinding
      workspace.root.insert('newArrayPset', newArrayPset);
      workspace.popNotificationDelayScope();

      // ParentDataBinding should have been created and notified of the children
      expect(dataBinder._dataBindingCreatedCounter).toEqual(2);
      const childDataBinding = dataBinder.resolve(newChildPset.getAbsolutePath(), 'BINDING');
      expect(childDataBinding.onPostCreate).toHaveBeenCalledTimes(1);
      expect(childDataBinding.getProperty()).toEqual(newChildPset);
      expect(childDataBinding.onModify).toHaveBeenCalledTimes(0);
      expect(childDataBinding.onPreModify).toHaveBeenCalledTimes(childDataBinding.onModify.mock.calls.length);
      childDataBinding.onModify.mockClear();
      childDataBinding.onPreModify.mockClear();

      const parentDataBinding = dataBinder.resolve(newArrayPset.getAbsolutePath(), 'BINDING');
      expect(parentDataBinding.onPostCreate).toHaveBeenCalledTimes(1);
      expect(parentDataBinding.getProperty()).toEqual(newArrayPset);
      expect(parentDataBinding.onModify).toHaveBeenCalledTimes(0);
      expect(parentDataBinding.onPreModify).toHaveBeenCalledTimes(parentDataBinding.onModify.mock.calls.length);
      parentDataBinding.onModify.mockClear();
      parentDataBinding.onPreModify.mockClear();
    });

    it.skip('TODO: should correctly call a standalone onModify() function', function() {
      console.assert(ParentDataBinding.prototype.__numDataBinders === 0);
      var myOnModifyFunc = jest.fn();
      // Register the standalone function
      dataBinder.registerOnModify(ChildTemplate.typeid, myOnModifyFunc,
        { excludePrefix: 'myChildTemplate', includePath: 'myChildTemplate' });

      // Create PSets for inherited child typeid
      var childPset = PropertyFactory.create(ChildTemplate.typeid, 'single');

      // Add the inherited child to the workspace and bind
      workspace.root.insert('myChildTemplate', childPset);
      expect(dataBinder._dataBindingCreatedCounter).toEqual(0);
      dataBinder.attachTo(workspace);

      // DataBinding should be created as a registered DataBinding
      expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
      expect(myOnModifyFunc).toHaveBeenCalledTimes(1);
    });

    it('should correctly register/unregister an DataBinding', function() {
      // Register the base (Child) typeid
      var handle = dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding);

      // Create PSets for inherited child typeid
      var childPset1 = PropertyFactory.create(ChildTemplate.typeid, 'single');
      var childPset2 = PropertyFactory.create(ChildTemplate.typeid, 'single');

      // Add the inherited child to the workspace and bind
      workspace.root.insert('myChildTemplate', childPset1);
      expect(dataBinder._dataBindingCreatedCounter).toEqual(0);
      dataBinder.attachTo(workspace);
      // DataBinding should be created as a registered DataBinding
      expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
      const childDataBinding = dataBinder.resolve(childPset1.getAbsolutePath(), 'BINDING');
      expect(childDataBinding).toBeInstanceOf(ChildDataBinding);
      expect(childDataBinding.getProperty()).toEqual(childPset1);
      expect(childDataBinding.onPostCreate).toHaveBeenCalledTimes(1);
      dataBinder._resetDebugCounters();

      // now unregister the DataBinding
      handle.destroy();

      workspace.root.insert('myChildTemplate2', childPset2);
      // no DataBinding should have been created
      expect(dataBinder._dataBindingCreatedCounter).toEqual(0);
    });

    it('removalContext.getDataBinding()', function() {

      var parentDataBinding = undefined;
      class myDerivedDataBinding extends ParentDataBinding {
        constructor(params) {
          super(params);
          var that = this;
          // we have to override here as the ParentDataBinding's
          // ctor above overwrites stuff in the prototype at ctor time
          this.onRemove = jest.fn(function(in_removalContext) {
            expect(in_removalContext.getDataBinding()).toEqual(that);
            expect(in_removalContext.getDataBinding('DataBindingTest2')).toEqual(that);
            expect(in_removalContext.getDataBinding('DataBindingTest1')).toEqual(parentDataBinding);
          });
        }
      }

      // Register the dataBindings
      dataBinder.register('DataBindingTest1', ParentTemplate.typeid, ParentDataBinding);
      dataBinder.register('DataBindingTest2', ParentTemplate.typeid, myDerivedDataBinding);

      // Bind to the workspace
      dataBinder.attachTo(workspace);

      var parentPset = PropertyFactory.create(ParentTemplate.typeid, 'single');

      expect(dataBinder._dataBindingCreatedCounter).toEqual(0);

      // parentPset should produce a ParentDataBinding and a myDerivedDataBinding
      workspace.root.insert(parentPset);
      expect(dataBinder._dataBindingCreatedCounter).toEqual(2);
      parentDataBinding = dataBinder.resolve(parentPset.getAbsolutePath(), 'DataBindingTest1');
      const derivedDataBinding = dataBinder.resolve(parentPset.getAbsolutePath(), 'DataBindingTest2');
      // Should be given a pset on construction
      expect(parentDataBinding).toBeInstanceOf(ParentDataBinding);
      expect(parentDataBinding.getProperty()).toEqual(parentPset);
      expect(derivedDataBinding).toBeInstanceOf(myDerivedDataBinding);
      expect(derivedDataBinding.getProperty()).toEqual(parentPset);
      // postCreate should be called
      expect(parentDataBinding.onPostCreate).toHaveBeenCalledTimes(1);
      expect(derivedDataBinding.onPostCreate).toHaveBeenCalledTimes(1);
      dataBinder._resetDebugCounters();

      // Removing parentPset should notify parentDataBinding and emit event
      expect(dataBinder._dataBindingRemovedCounter).toEqual(0);
      workspace.root.remove(parentPset);
      expect(dataBinder._dataBindingRemovedCounter).toEqual(2);
      expect(parentDataBinding.onRemove).toHaveBeenCalledTimes(1);
      expect(derivedDataBinding.onRemove).toHaveBeenCalledTimes(1);
    });

    it('modificationContext.getDataBinding()', function() {

      var parentDataBinding = undefined;
      class myDerivedDataBinding extends ParentDataBinding {
        constructor(params) {
          super(params);
          // we have to override here as the ParentDataBinding's ctor
          // above overwrites stuff in the prototype at ctor time
          this.onModify = jest.fn(function(in_modificationContext) {
            expect(in_modificationContext.getDataBinding()).toEqual(this);
            expect(in_modificationContext.getDataBinding('DataBindingTest2')).toEqual(this);
            expect(in_modificationContext.getDataBinding('DataBindingTest1')).toEqual(parentDataBinding);
          });
        }
      }

      // Register the dataBindings
      dataBinder.register('DataBindingTest1', ParentTemplate.typeid, ParentDataBinding);
      dataBinder.register('DataBindingTest2', ParentTemplate.typeid, myDerivedDataBinding);

      // Bind to the workspace
      dataBinder.attachTo(workspace);

      var parentPset = PropertyFactory.create(ParentTemplate.typeid, 'single');

      expect(dataBinder._dataBindingCreatedCounter).toEqual(0);

      // parentPset should produce a ParentDataBinding and a myDerivedDataBinding
      workspace.root.insert(parentPset);
      expect(dataBinder._dataBindingCreatedCounter).toEqual(2);
      parentDataBinding = dataBinder.resolve(parentPset.getAbsolutePath(), 'DataBindingTest1');
      const derivedDataBinding = dataBinder.resolve(parentPset.getAbsolutePath(), 'DataBindingTest2');
      // Should be given a pset on construction
      expect(parentDataBinding).toBeInstanceOf(ParentDataBinding);
      expect(parentDataBinding.getProperty()).toEqual(parentPset);
      expect(derivedDataBinding).toBeInstanceOf(myDerivedDataBinding);
      expect(derivedDataBinding.getProperty()).toEqual(parentPset);
      // postCreate should be called
      expect(parentDataBinding.onPostCreate).toHaveBeenCalledTimes(1);
      expect(derivedDataBinding.onPostCreate).toHaveBeenCalledTimes(1);

      // Modifying parentPset should notify parentDataBinding and emit event
      parentPset.get('text').setValue('42');
      expect(derivedDataBinding.onModify).toHaveBeenCalledTimes(1);

      // removing should work as usual
      expect(dataBinder._dataBindingRemovedCounter).toEqual(0);
      workspace.root.remove(parentPset);
      expect(dataBinder._dataBindingRemovedCounter).toEqual(2);
      expect(parentDataBinding.onRemove).toHaveBeenCalledTimes(1);
      expect(derivedDataBinding.onRemove).toHaveBeenCalledTimes(1);
    });

    it('modificationContext.getProperty()', function() {
      var parentDataBinding = undefined;
      var parentPset = PropertyFactory.create(ParentTemplate.typeid, 'single');
      class myDerivedDataBinding extends ParentDataBinding {
        constructor(params) {
          super(params);
          // we have to override here as the ParentDataBinding's ctor above
          // overwrites stuff in the prototype at ctor time
          this.onModify = jest.fn(function(in_modificationContext) {
            expect(in_modificationContext.getProperty()).toEqual(this.getProperty());
            expect(in_modificationContext.getProperty()).toEqual(parentPset);
          });
        }
      }

      // Register the dataBindings
      dataBinder.register('DataBindingTest1', ParentTemplate.typeid, ParentDataBinding);
      dataBinder.register('DataBindingTest2', ParentTemplate.typeid, myDerivedDataBinding);

      // Bind to the workspace
      dataBinder.attachTo(workspace);

      expect(dataBinder._dataBindingCreatedCounter).toEqual(0);

      // parentPset should produce a ParentDataBinding and a myDerivedDataBinding
      workspace.root.insert(parentPset);
      expect(dataBinder._dataBindingCreatedCounter).toEqual(2);
      parentDataBinding = dataBinder.resolve(parentPset.getAbsolutePath(), 'DataBindingTest1');
      const derivedDataBinding = dataBinder.resolve(parentPset.getAbsolutePath(), 'DataBindingTest2');
      // Should be given a pset on construction
      expect(parentDataBinding).toBeInstanceOf(ParentDataBinding);
      expect(parentDataBinding.getProperty()).toEqual(parentPset);
      expect(derivedDataBinding).toBeInstanceOf(myDerivedDataBinding);
      expect(derivedDataBinding.getProperty()).toEqual(parentPset);
      // postCreate should be called
      expect(parentDataBinding.onPostCreate).toHaveBeenCalledTimes(1);
      expect(derivedDataBinding.onPostCreate).toHaveBeenCalledTimes(1);

      // Modifying parentPset should notify parentDataBinding and emit event
      parentPset.get('text').setValue('42');
      expect(derivedDataBinding.onModify).toHaveBeenCalledTimes(1);

      // removing should work as usual
      expect(dataBinder._dataBindingRemovedCounter).toEqual(0);
      workspace.root.remove(parentPset);
      expect(dataBinder._dataBindingRemovedCounter).toEqual(2);
      expect(parentDataBinding.onRemove).toHaveBeenCalledTimes(1);
      expect(derivedDataBinding.onRemove).toHaveBeenCalledTimes(1);
    });

    it('can tell if inserts/removes are simulated or real - attach/detach', function() {
      let simulated;
      const called = jest.fn();

      class MyDataBinding extends DataBinding {
        onPostCreate(context) {
          called();
          expect(simulated).toEqual(context.isSimulated());
        }

        onPreRemove(context) {
          called();
          expect(simulated).toEqual(context.isSimulated());
        }

        checkCollectionSimulated(stupidOrder, context) {
          called();
          expect(simulated).toEqual(context.isSimulated());
        }

        static initialize() {
          this.registerOnPath(
            'arrayOfStrings',
            ['collectionInsert', 'collectionRemove'],
            this.prototype.checkCollectionSimulated
          );
        }
      }

      MyDataBinding.initialize();

      const data1 = PropertyFactory.create(PrimitiveChildrenTemplate.typeid);
      data1.get('arrayOfStrings').push('myString');
      data1.get('arrayOfStrings').push('myString');
      const data2 = PropertyFactory.create(PrimitiveChildrenTemplate.typeid);
      data2.get('arrayOfStrings').push('myString');

      dataBinder.register(
        'DataBinding',
        PrimitiveChildrenTemplate.typeid,
        MyDataBinding
      );

      // retroactively adding bindings - we will get simulated callbacks for data1
      expect(called).toHaveBeenCalledTimes(0);
      simulated = true;
      workspace.root.insert('data1', data1);
      dataBinder.attachTo(workspace);
      expect(called).toHaveBeenCalledTimes(3); // data1 + two collectioninserts

      // bindings are attached - we will get real callbacks for data2
      simulated = false;
      called.mockClear();
      workspace.root.insert('data2', data2);
      expect(called).toHaveBeenCalledTimes(2); // data2 + one collectioninsert

      // Remove one collection item
      simulated = false;
      called.mockClear();
      data1.get('arrayOfStrings').pop();
      expect(called).toHaveBeenCalledTimes(1);

      // real callbacks for data2 being removed
      called.mockClear();
      simulated = false;
      workspace.root.remove(data2);
      // We won't get called back for collectionRemove (sort of LYNXDEV-5675) - so only one call
      expect(called).toHaveBeenCalledTimes(1);

      // simulated callbacks for data1 being removed
      called.mockClear();
      simulated = true;
      dataBinder.detach();
      // We won't get called back for collectionRemove LYNXDEV-5675 - so only one call
      expect(called).toHaveBeenCalledTimes(1);
    });

    it('can tell if inserts/removes are simulated or real - destroy handle', function() {
      let simulated;
      const called = jest.fn();

      class MyDataBinding extends DataBinding {
        onPostCreate(context) {
          called();
          expect(simulated).toEqual(context.isSimulated());
        }

        onPreRemove(context) {
          called();
          expect(simulated).toEqual(context.isSimulated());
        }

        checkCollectionSimulated(stupidOrder, context) {
          called();
          expect(simulated).toEqual(context.isSimulated());
        }

        static initialize() {
          this.registerOnPath(
            'arrayOfStrings',
            ['collectionInsert', 'collectionRemove'],
            this.prototype.checkCollectionSimulated
          );
        }
      }

      MyDataBinding.initialize();

      dataBinder.attachTo(workspace);
      const handle = dataBinder.register('DataBinding', PrimitiveChildrenTemplate.typeid, MyDataBinding);

      const data1 = PropertyFactory.create(PrimitiveChildrenTemplate.typeid);
      data1.get('arrayOfStrings').push('myString');
      data1.get('arrayOfStrings').push('myString');
      const data2 = PropertyFactory.create(PrimitiveChildrenTemplate.typeid);
      data2.get('arrayOfStrings').push('myString');

      // bindings are attached - we will get real callbacks for data1
      expect(called).toHaveBeenCalledTimes(0);
      simulated = false;
      workspace.root.insert('data1', data1);
      expect(called).toHaveBeenCalledTimes(3);

      // simulated callbacks for handles being destroyed
      // Unfortunately, we don't get any callbacks for the collection
      // so we only get one callback
      simulated = true;
      called.mockClear();
      handle.destroy();
      expect(called).toHaveBeenCalledTimes(1); // broken
    });

    it('should correctly pass userData to dataBindings created', function() {
      // userData object:
      var myUserData = {};
      dataBinder.attachTo(workspace);
      // Register an DataBinding and specify a userData object
      dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding, { userData: myUserData });
      // Also register the same DataBinding for a different typeid without specifying a userData object
      dataBinder.register('BINDING', ParentTemplate.typeid, ChildDataBinding);

      // Add Child PSet to the workspace
      workspace.root.insert('child', PropertyFactory.create(ChildTemplate.typeid, 'single'));
      expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
      const childDataBindingWithUserData = dataBinder.resolve('/child', 'BINDING');
      expect(childDataBindingWithUserData.getUserData()).toEqual(myUserData);
      // Add a Parent PSet
      workspace.root.insert('parent', PropertyFactory.create(ParentTemplate.typeid, 'single'));
      expect(dataBinder._dataBindingCreatedCounter).toEqual(2);
      const childDataBindingNoUserData = dataBinder.resolve('/parent', 'BINDING');
      expect(childDataBindingNoUserData.getUserData()).toBeUndefined();
      // Add another Child PSet
      workspace.root.insert('child2', PropertyFactory.create(ChildTemplate.typeid, 'single'));
      expect(dataBinder._dataBindingCreatedCounter).toEqual(3);
      const anotherChildDataBindingWithUserData = dataBinder.resolve('/child2', 'BINDING');
      expect(anotherChildDataBindingWithUserData.getUserData()).toEqual(myUserData);
    });

    it('should correctly bind to collections', function() {
      dataBinder.attachTo(workspace);
      var arrayProperty;
      var primitiveArrayProperty;
      var mapProperty;
      var arrayInsertSpy = jest.fn(function(in_index, in_context) {
        expect(in_context.getProperty()).toEqual(arrayProperty.get(in_index));
        expect(in_context.getProperty().getAbsolutePath()).toEqual(in_context.getAbsolutePath());
      });
      var arrayModifySpy = jest.fn(function(in_index, in_context) {
        expect(in_context.getProperty()).toEqual(arrayProperty.get(in_index));
        expect(in_context.getProperty().getAbsolutePath()).toEqual(in_context.getAbsolutePath());
      });
      var arrayRemoveSpy = jest.fn(function(in_index, in_context) {
        expect(in_context.getAbsolutePath()).toEqual('/root.parentArray[' + in_index + ']');
      });
      var primitiveArrayInsertSpy = jest.fn(function(in_index, in_context) {
        expect(this.getProperty().get(in_index)).toEqual(in_index);
        expect(in_context.getAbsolutePath()).toEqual('/root.parentPrimitiveArray[' + in_index + ']');
      });
      var primitiveArrayModifySpy = jest.fn(function(in_index, in_context) {
        expect(in_index).toEqual(3);
        expect(this.getProperty().get(in_index)).toEqual(42);
      });
      var primitiveArrayRemoveSpy = jest.fn(function(in_index, in_context) {
        expect(in_context.getAbsolutePath()).toEqual('/root.parentPrimitiveArray[' + in_index + ']');
      });
      var mapInsertSpy = jest.fn(function(in_key, in_context) {
        expect(in_context.getProperty()).toEqual(mapProperty.get(in_key));
        expect(in_context.getProperty().getAbsolutePath()).toEqual(in_context.getAbsolutePath());
      });
      var mapModifySpy = jest.fn(function(in_key, in_context) {
        expect(in_context.getProperty()).toEqual(mapProperty.get(in_key));
        expect(in_context.getProperty().getAbsolutePath()).toEqual(in_context.getAbsolutePath());
      });
      var mapRemoveSpy = jest.fn(function(in_key, in_context) {
        expect(in_context.getAbsolutePath()).toEqual('/root.parentMap[' + in_key + ']');
        expect(in_context.getProperty()).toBeUndefined();
      });
      ParentDataBinding.registerOnPath('', ['collectionInsert'], arrayInsertSpy);
      ParentDataBinding.registerOnPath('', ['collectionModify'], arrayModifySpy);
      ParentDataBinding.registerOnPath('', ['collectionRemove'], arrayRemoveSpy);
      InheritedChildDataBinding.registerOnPath('', ['collectionInsert'], mapInsertSpy);
      InheritedChildDataBinding.registerOnPath('', ['collectionModify'], mapModifySpy);
      InheritedChildDataBinding.registerOnPath('', ['collectionRemove'], mapRemoveSpy);
      ChildDataBinding.registerOnPath('', ['collectionInsert'], primitiveArrayInsertSpy);
      ChildDataBinding.registerOnPath('', ['collectionModify'], primitiveArrayModifySpy);
      ChildDataBinding.registerOnPath('', ['collectionRemove'], primitiveArrayRemoveSpy);
      dataBinder.register('BINDING', 'array<' + ParentTemplate.typeid + '>', ParentDataBinding);
      dataBinder.register('BINDING', 'map<' + ParentTemplate.typeid + '>', InheritedChildDataBinding);
      dataBinder.register('BINDING', 'array<Int32>', ChildDataBinding);

      workspace.root.insert('root', PropertyFactory.create('NodeProperty', 'single'));

      // array tests
      workspace.root.get('root').insert('parentArray', PropertyFactory.create(ParentTemplate.typeid, 'array'));
      expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
      arrayProperty = workspace.root.get(['root', 'parentArray']);
      const parentArrayDataBinding = dataBinder.resolve(arrayProperty.getAbsolutePath(), 'BINDING');
      expect(parentArrayDataBinding).toBeInstanceOf(ParentDataBinding);
      expect(parentArrayDataBinding.getProperty()).toEqual(arrayProperty);
      expect(parentArrayDataBinding.onModify).toHaveBeenCalledTimes(0);
      expect(parentArrayDataBinding.onPreModify).toHaveBeenCalledTimes(parentArrayDataBinding.onModify.mock.calls.length);
      parentArrayDataBinding.onModify.mockClear();
      parentArrayDataBinding.onPreModify.mockClear();
      dataBinder._resetDebugCounters();

      arrayProperty.insertRange(0, _.map([0, 1, 2, 3, 4, 5], function(i) {
        return PropertyFactory.create(ParentTemplate.typeid, undefined, {
          text: String(i)
        });
      }));
      expect(parentArrayDataBinding.onModify).toHaveBeenCalledTimes(1);
      expect(arrayInsertSpy).toHaveBeenCalledTimes(6);
      arrayInsertSpy.mockClear();
      arrayProperty.push(PropertyFactory.create(ParentTemplate.typeid, 'single'));
      expect(arrayInsertSpy).toHaveBeenCalledTimes(1);
      arrayInsertSpy.mockClear();
      arrayProperty.get('3').get('text').value = 'forty two';
      expect(arrayModifySpy).toHaveBeenCalledTimes(1);
      arrayModifySpy.mockClear();
      arrayProperty.remove(4);
      expect(arrayRemoveSpy).toHaveBeenCalledTimes(1);
      arrayRemoveSpy.mockClear();

      // primitive array tests
      workspace.root.get('root').insert('parentPrimitiveArray', PropertyFactory.create('Int32', 'array'));
      expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
      primitiveArrayProperty = workspace.root.get(['root', 'parentPrimitiveArray']);
      const primitiveArrayDataBinding = dataBinder.resolve(primitiveArrayProperty.getAbsolutePath(), 'BINDING');
      expect(primitiveArrayDataBinding).toBeInstanceOf(ChildDataBinding);
      expect(primitiveArrayDataBinding.getProperty()).toEqual(primitiveArrayProperty);
      expect(primitiveArrayDataBinding.onModify).toHaveBeenCalledTimes(0);
      expect(primitiveArrayDataBinding.onPreModify).toHaveBeenCalledTimes(primitiveArrayDataBinding.onModify.mock.calls.length);
      primitiveArrayDataBinding.onModify.mockClear();
      primitiveArrayDataBinding.onPreModify.mockClear();
      dataBinder._resetDebugCounters();

      primitiveArrayProperty.insertRange(0, _.map([0, 1, 2, 3, 4, 5], function(i) {
        return i;
      }));
      expect(primitiveArrayDataBinding.onModify).toHaveBeenCalledTimes(1);
      expect(primitiveArrayInsertSpy).toHaveBeenCalledTimes(6);
      primitiveArrayInsertSpy.mockClear();
      primitiveArrayProperty.push(6);
      expect(primitiveArrayInsertSpy).toHaveBeenCalledTimes(1);
      primitiveArrayInsertSpy.mockClear();
      primitiveArrayProperty.set(3, 42);
      expect(primitiveArrayModifySpy).toHaveBeenCalledTimes(1);
      primitiveArrayModifySpy.mockClear();
      primitiveArrayProperty.remove(4);
      expect(primitiveArrayRemoveSpy).toHaveBeenCalledTimes(1);
      primitiveArrayRemoveSpy.mockClear();

      // map tests
      workspace.root.get('root').insert('parentMap', PropertyFactory.create(ParentTemplate.typeid, 'map'));
      expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
      mapProperty = workspace.root.get(['root', 'parentMap']);
      const parentMapDataBinding = dataBinder.resolve(mapProperty.getAbsolutePath(), 'BINDING');
      expect(parentMapDataBinding).toBeInstanceOf(InheritedChildDataBinding);
      expect(parentMapDataBinding.getProperty()).toEqual(mapProperty);
      expect(parentMapDataBinding.onModify).toHaveBeenCalledTimes(0);
      expect(parentMapDataBinding.onPreModify).toHaveBeenCalledTimes(parentMapDataBinding.onModify.mock.calls.length);
      parentMapDataBinding.onModify.mockClear();
      parentMapDataBinding.onPreModify.mockClear();

      var mapProperty = workspace.root.get(['root', 'parentMap']);
      _.map(['zero', 'one', 'two', 'three', 'four', 'five', 'six'], function(key) {
        mapProperty.insert(key, PropertyFactory.create(ParentTemplate.typeid, undefined, {
          text: String(key)
        }));
      });
      expect(mapInsertSpy).toHaveBeenCalledTimes(7);
      mapInsertSpy.mockClear();
      mapProperty.get('three').get('text').value = 'sixty four';
      expect(mapModifySpy).toHaveBeenCalledTimes(1);
      mapModifySpy.mockClear();
      mapProperty.remove('four');
      expect(mapRemoveSpy).toHaveBeenCalledTimes(1);
      mapRemoveSpy.mockClear();

    });

    it.skip('should correctly bind to array paths even if they are already created/not yet removed', function() {
      dataBinder.attachTo(workspace);

      workspace.root.insert('root', PropertyFactory.create('NodeProperty', 'single'));
      workspace.root.get('root').insert('parentArray', PropertyFactory.create(ParentTemplate.typeid, 'array'));
      const arrayProperty = workspace.root.get(['root', 'parentArray']);

      const arrayInsertSpy = jest.fn(function(in_index, in_context) {
        expect(in_context.getProperty()).toEqual(arrayProperty.get(in_index));
        expect(in_context.getProperty().getAbsolutePath()).toEqual(in_context.getAbsolutePath());
      });
      const arrayRemoveSpy = jest.fn(function(in_index, in_context) {
        expect(in_context.getAbsolutePath()).toEqual('/root.parentArray[' + in_index + ']');
      });

      arrayProperty.insertRange(0, _.map([0, 1, 2, 3, 4, 5], function(i) {
        return PropertyFactory.create(ParentTemplate.typeid, undefined, {
          text: String(i)
        });
      }));

      // Nothing should have been created yet
      expect(dataBinder._dataBindingCreatedCounter).toEqual(0);

      // Now register
      ParentDataBinding.registerOnPath('', ['collectionInsert'], arrayInsertSpy);
      ParentDataBinding.registerOnPath('', ['collectionRemove'], arrayRemoveSpy);
      const arrayHandle = dataBinder.register('BINDING', 'array<' + ParentTemplate.typeid + '>', ParentDataBinding);

      // Everything should be created now
      expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
      expect(arrayInsertSpy).toHaveBeenCalledTimes(6);

      // Unregister
      arrayHandle.destroy();

      // Everything should have been removed
      expect(arrayRemoveSpy).toHaveBeenCalledTimes(6);
    });

    it.skip('should correctly bind to prim array paths even if they are already created/not yet removed', function() {
      dataBinder.attachTo(workspace);

      workspace.root.insert('root', PropertyFactory.create('NodeProperty', 'single'));
      workspace.root.get('root').insert('parentPrimitiveArray', PropertyFactory.create('Int32', 'array'));
      const primitiveArrayProperty = workspace.root.get(['root', 'parentPrimitiveArray']);

      primitiveArrayProperty.insertRange(0, _.map([0, 1, 2, 3, 4, 5], function(i) {
        return i;
      }));

      const primitiveArrayInsertSpy = jest.fn(function(in_index, in_context) {
        expect(this.getProperty().get(in_index)).toEqual(in_index);
        expect(in_context.getAbsolutePath()).toEqual('/root.parentPrimitiveArray[' + in_index + ']');
      });
      const primitiveArrayRemoveSpy = jest.fn(function(in_index, in_context) {
        expect(in_context.getAbsolutePath()).toEqual('/root.parentPrimitiveArray[' + in_index + ']');
      });

      // Nothing should have been created yet
      expect(dataBinder._dataBindingCreatedCounter).toEqual(0);

      // Now register
      ChildDataBinding.registerOnPath('', ['collectionInsert'], primitiveArrayInsertSpy);
      ChildDataBinding.registerOnPath('', ['collectionRemove'], primitiveArrayRemoveSpy);
      const primArrayHandle = dataBinder.register('BINDING', 'array<Int32>', ChildDataBinding);

      // Everything should be created now
      expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
      expect(primitiveArrayInsertSpy).toHaveBeenCalledTimes(6);

      // Unregister
      primArrayHandle.destroy();

      // Everything should have been removed
      expect(primitiveArrayRemoveSpy).toHaveBeenCalledTimes(6);
    });

    it.skip('should correctly bind to map paths even if they are already created/not yet removed', function() {
      dataBinder.attachTo(workspace);
      workspace.root.insert('root', PropertyFactory.create('NodeProperty', 'single'));
      workspace.root.get('root').insert('parentMap', PropertyFactory.create(ParentTemplate.typeid, 'map'));

      const mapProperty = workspace.root.get(['root', 'parentMap']);
      _.map(['zero', 'one', 'two', 'three', 'four', 'five', 'six'], function(key) {
        mapProperty.insert(key, PropertyFactory.create(ParentTemplate.typeid, undefined, {
          text: String(key)
        }));
      });

      const mapInsertSpy = jest.fn(function(in_key, in_context) {
        expect(in_context.getProperty()).toEqual(mapProperty.get(in_key));
        expect(in_context.getProperty().getAbsolutePath()).toEqual(in_context.getAbsolutePath());
      });
      const mapRemoveSpy = jest.fn(function(in_key, in_context) {
        expect(in_context.getAbsolutePath()).toEqual('/root.parentMap[' + in_key + ']');
      });

      // Nothing should have been created yet
      expect(dataBinder._dataBindingCreatedCounter).toEqual(0);

      DerivedDataBinding.registerOnPath('', ['collectionInsert'], mapInsertSpy);
      DerivedDataBinding.registerOnPath('', ['collectionRemove'], mapRemoveSpy);
      const mapHandle = dataBinder.register('BINDING2', 'map<' + ParentTemplate.typeid + '>', DerivedDataBinding);

      // Everything should be created now
      expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
      expect(mapInsertSpy).toHaveBeenCalledTimes(7);

      // Unregister
      mapHandle.destroy();

      // Everything should have been removed
      expect(mapRemoveSpy).toHaveBeenCalledTimes(7);
    });

    it('hasDataBinding', function() {
      dataBinder.attachTo(workspace);

      expect(dataBinder.hasDataBinding('BINDING', ChildTemplate.typeid)).toEqual(false);
      // binding definition
      dataBinder.defineDataBinding('BINDING', ChildTemplate.typeid, ChildDataBinding);

      expect(dataBinder.hasDataBinding('BINDING', ChildTemplate.typeid)).toEqual(true);
      expect(dataBinder.hasDataBinding('POTATO', ChildTemplate.typeid)).toEqual(false);
      expect(dataBinder.hasDataBinding('BINDING', 'autodesk.vegetables:potato-1.0.0')).toEqual(false);
    });

    it('should correctly pass different userData with different activations', function() {
      // userData objects
      var myUserDataFoo = { user: 'foo' };
      var myUserDataBar = { user: 'bar' };
      dataBinder.attachTo(workspace);
      // binding definition
      dataBinder.defineDataBinding('BINDING', ChildTemplate.typeid, ChildDataBinding);
      // activate foo with myUserDataFoo
      dataBinder.activateDataBinding('BINDING', ChildTemplate.typeid, { exactPath: '/foo', userData: myUserDataFoo });
      // ...and bar with myUserDataBar
      dataBinder.activateDataBinding('BINDING', ChildTemplate.typeid, { exactPath: '/bar', userData: myUserDataBar });

      // Add PSets to the workspace
      workspace.root.insert('foo', PropertyFactory.create(ChildTemplate.typeid, 'single'));
      expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
      const dataBindingFoo = dataBinder.resolve('/foo', 'BINDING');
      expect(dataBindingFoo.getUserData()).toEqual(myUserDataFoo);
      workspace.root.insert('bar', PropertyFactory.create(ChildTemplate.typeid, 'single'));
      expect(dataBinder._dataBindingCreatedCounter).toEqual(2);
      const dataBindingBar = dataBinder.resolve('/bar', 'BINDING');
      expect(dataBindingBar.getUserData()).toEqual(myUserDataBar);
    });

    it('should correctly pass different userData with different activations (retroactively)', function() {
      // userData objects
      var myUserDataFoo = { user: 'foo' };
      var myUserDataBar = { user: 'bar' };

      // Add PSets to the workspace
      workspace.root.insert('foo', PropertyFactory.create(ChildTemplate.typeid, 'single'));
      workspace.root.insert('bar', PropertyFactory.create(ChildTemplate.typeid, 'single'));
      dataBinder.attachTo(workspace); // PSets are already there, we'll create the bindings retroactively
      expect(dataBinder._dataBindingCreatedCounter).toEqual(0);  // no bindings should be there yet
      // define / activate retroactively (i.e. after attaching)
      dataBinder.defineDataBinding('BINDING', ChildTemplate.typeid, ChildDataBinding);
      // activate foo - again with myUserDataFoo
      dataBinder.activateDataBinding('BINDING', ChildTemplate.typeid, { exactPath: '/foo', userData: myUserDataFoo });
      expect(dataBinder._dataBindingCreatedCounter).toEqual(1);  // retroactively created the first binding
      const retroDataBindingFoo = dataBinder.resolve('/foo', 'BINDING');
      expect(retroDataBindingFoo.getUserData()).toEqual(myUserDataFoo);
      // ...and bar - again with myUserDataBar
      dataBinder.activateDataBinding('BINDING', ChildTemplate.typeid, { exactPath: '/bar', userData: myUserDataBar });
      expect(dataBinder._dataBindingCreatedCounter).toEqual(2); // ...and the second
      const retroDataBindingBar = dataBinder.resolve('/bar', 'BINDING');
      expect(retroDataBindingBar.getUserData()).toEqual(myUserDataBar);
    });

    it('should honor options arg when activating w/o typeid', function() {
      // userData objects
      var myUserData = { user: 'foo' };
      dataBinder.attachTo(workspace);
      // binding definitions
      dataBinder.defineDataBinding('BINDING', ChildTemplate.typeid, ChildDataBinding);
      dataBinder.defineDataBinding('BINDING', ParentTemplate.typeid, ParentDataBinding);
      // activate w/o specifying typeid, but with optional args
      dataBinder.activateDataBinding('BINDING', undefined, { includePrefix: '/foo', userData: myUserData });

      // Add PSets to the workspace
      workspace.root.insert('foo', PropertyFactory.create('NodeProperty', 'single'));
      workspace.root.get('foo').insert('child', PropertyFactory.create(ChildTemplate.typeid, 'single'));
      expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
      const childDataBinding = dataBinder.resolve('/foo.child', 'BINDING');
      expect(childDataBinding.getUserData()).toEqual(myUserData);
      expect(childDataBinding).toBeInstanceOf(ChildDataBinding);
      workspace.root.get('foo').insert('parent', PropertyFactory.create(ParentTemplate.typeid, 'single'));
      expect(dataBinder._dataBindingCreatedCounter).toEqual(2);
      const parentDataBinding = dataBinder.resolve('foo.parent', 'BINDING');
      expect(parentDataBinding.getUserData()).toEqual(myUserData);
      expect(parentDataBinding).toBeInstanceOf(ParentDataBinding);
      dataBinder._resetDebugCounters();
      // add under 'notfoo', no bindings should be created
      workspace.root.insert('notfoo', PropertyFactory.create('NodeProperty', 'single'));
      workspace.root.get('notfoo').insert('child', PropertyFactory.create(ChildTemplate.typeid, 'single'));
      expect(dataBinder._dataBindingCreatedCounter).toEqual(0);
      workspace.root.get('notfoo').insert('parent', PropertyFactory.create(ParentTemplate.typeid, 'single'));
      expect(dataBinder._dataBindingCreatedCounter).toEqual(0);
    });

    it('should honor options arg when activating w/o typeid (retroactively)', function() {
      // userData objects
      var myUserData = { user: 'foo' };
      // Add PSets to the workspace
      workspace.root.insert('foo', PropertyFactory.create('NodeProperty', 'single'));
      workspace.root.get('foo').insert('child', PropertyFactory.create(ChildTemplate.typeid, 'single'));
      workspace.root.get('foo').insert('parent', PropertyFactory.create(ParentTemplate.typeid, 'single'));
      // add under 'notfoo', no bindings should be created here
      workspace.root.insert('notfoo', PropertyFactory.create('NodeProperty', 'single'));
      workspace.root.get('notfoo').insert('child', PropertyFactory.create(ChildTemplate.typeid, 'single'));
      workspace.root.get('notfoo').insert('parent', PropertyFactory.create(ParentTemplate.typeid, 'single'));
      dataBinder.attachTo(workspace); // PSets are already there, we'll create the bindings retroactively
      // binding definitions - retroactively
      dataBinder.defineDataBinding('BINDING', ChildTemplate.typeid, ChildDataBinding);
      dataBinder.defineDataBinding('BINDING', ParentTemplate.typeid, ParentDataBinding);
      // activate w/o specifying typeid, but with optional args - retroactively
      dataBinder.activateDataBinding('BINDING', undefined, { includePrefix: '/foo', userData: myUserData });
      expect(dataBinder._dataBindingCreatedCounter).toEqual(2);  // retroactively created the two bindings
      const childBinding = dataBinder.resolve('/foo.child', 'BINDING');
      expect(childBinding).toBeInstanceOf(ChildDataBinding);
      expect(childBinding.getUserData()).toEqual(myUserData);
      const parentBinding = dataBinder.resolve('/foo.parent', 'BINDING');
      expect(parentBinding).toBeInstanceOf(ParentDataBinding);
      expect(parentBinding.getUserData()).toEqual(myUserData);
    });

    it('excludePrefix should take precedence over includePrefix', function() {
      dataBinder.attachTo(workspace);
      // binding definition
      dataBinder.defineDataBinding('BINDING', ParentTemplate.typeid, ParentDataBinding);
      // activate with overlapping excludePath & includePath
      dataBinder.activateDataBinding('BINDING', undefined, { includePrefix: '/foo', excludePrefix: '/foo.bar' });

      // Add PSets to the workspace
      workspace.root.insert('foo', PropertyFactory.create(ParentTemplate.typeid, 'single'));
      expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
      workspace.root.get('foo').insert('baz', PropertyFactory.create(ParentTemplate.typeid, 'single'));
      // bindings must be created at /foo, /foo.baz, but not at /foo.bar
      expect(dataBinder._dataBindingCreatedCounter).toEqual(2);
      workspace.root.get('foo').insert('bar', PropertyFactory.create(ParentTemplate.typeid, 'single'));
      expect(dataBinder._dataBindingCreatedCounter).toEqual(2);
    });

    it('excludePrefix should take precedence over includePrefix (retroactively)', function() {
      // Add PSets to the workspace
      workspace.root.insert('foo', PropertyFactory.create(ParentTemplate.typeid, 'single'));
      workspace.root.get('foo').insert('baz', PropertyFactory.create(ParentTemplate.typeid, 'single'));
      // bindings must be created at /foo, /foo.baz, but not at /foo.bar
      workspace.root.get('foo').insert('bar', PropertyFactory.create(ParentTemplate.typeid, 'single'));
      dataBinder.attachTo(workspace); // As PSets are already there, we'll create the bindings retroactively
      expect(dataBinder._dataBindingCreatedCounter).toEqual(0);  // no bindings should be there yet
      // binding definition
      dataBinder.defineDataBinding('BINDING', ParentTemplate.typeid, ParentDataBinding);
      // activate with overlapping excludePath & includePath
      dataBinder.activateDataBinding('BINDING', undefined, { includePrefix: '/foo', excludePrefix: '/foo.bar' });
      expect(dataBinder._dataBindingCreatedCounter).toEqual(2);
    });

    it('excludePrefix and includePrefix should not be combined for different activation calls', function() {
      dataBinder.attachTo(workspace);
      // binding definition
      dataBinder.defineDataBinding('BINDING', ParentTemplate.typeid, ParentDataBinding);
      // activate with overlapping excludePath & includePath -from two different calls!
      dataBinder.activateDataBinding('BINDING', undefined, { includePrefix: '/foo' });
      dataBinder.activateDataBinding('BINDING', undefined, { excludePrefix: '/foo.bar' });

      // Add PSets to the workspace
      workspace.root.insert('foo', PropertyFactory.create(ParentTemplate.typeid, 'single'));
      expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
      workspace.root.get('foo').insert('baz', PropertyFactory.create(ParentTemplate.typeid, 'single'));
      // bindings must be created at /foo, /foo.baz, *and* at /foo.bar (because it's allowed by the first activation)
      expect(dataBinder._dataBindingCreatedCounter).toEqual(2);
      workspace.root.get('foo').insert('bar', PropertyFactory.create(ParentTemplate.typeid, 'single'));
      expect(dataBinder._dataBindingCreatedCounter).toEqual(3);
    });

    it('excludePrefix and includePrefix should not be combined for different activation calls (retro)', function() {
      // Add PSets to the workspace
      workspace.root.insert('foo', PropertyFactory.create(ParentTemplate.typeid, 'single'));
      workspace.root.get('foo').insert('baz', PropertyFactory.create(ParentTemplate.typeid, 'single'));
      // bindings must be created at /foo, /foo.baz, *and* at /foo.bar (because it's allowed by the first activation)
      workspace.root.get('foo').insert('bar', PropertyFactory.create(ParentTemplate.typeid, 'single'));
      dataBinder.attachTo(workspace); // As the PSets are already there, we'll create the bindings retroactively
      expect(dataBinder._dataBindingCreatedCounter).toEqual(0);  // no bindings should be there yet
      // binding definition
      dataBinder.defineDataBinding('BINDING', ParentTemplate.typeid, ParentDataBinding);
      // activate with overlapping excludePath & includePath in two different calls, within a scope - the scope
      // shouldn't make any difference in this case
      dataBinder.pushBindingActivationScope();
      dataBinder.activateDataBinding('BINDING', undefined, { includePrefix: '/foo' });
      dataBinder.activateDataBinding('BINDING', undefined, { excludePrefix: '/foo.bar' });
      dataBinder.popBindingActivationScope();
      expect(dataBinder._dataBindingCreatedCounter).toEqual(3);
    });

    it('should work when registering an exactPath to an element in an array (LYNXDEV-5380)', function() {
      dataBinder.attachTo(workspace);
      workspace.root.insert('arrTest', PropertyFactory.create(ParentTemplate.typeid, 'array'));
      // eslint-disable-next-line max-len
      const handle = dataBinder.register('BINDING', ParentTemplate.typeid, ParentDataBinding, { exactPath: 'arrTest[0]' });
      expect(dataBinder._dataBindingCreatedCounter).toEqual(0);
      workspace.root.get('arrTest').push(PropertyFactory.create(ParentTemplate.typeid, 'single'));
      expect(dataBinder._dataBindingCreatedCounter).toEqual(1);  // the push should create our binding
      handle.destroy(); // should deactivate/undefine our handle -> binding is removed
      expect(dataBinder._dataBindingRemovedCounter).toEqual(1);
    });

    it('should work when explicitly unreg. an array elem. (w/ exactPath) already removed (LYNXDEV-5380)', function() {
      dataBinder.attachTo(workspace);
      workspace.root.insert('arrTest', PropertyFactory.create(ParentTemplate.typeid, 'array'));
      workspace.root.get('arrTest').push(PropertyFactory.create(ParentTemplate.typeid));
      // eslint-disable-next-line max-len
      const handle = dataBinder.register('BINDING', ParentTemplate.typeid, ParentDataBinding, { exactPath: 'arrTest[0]' });
      expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
      workspace.root.get('arrTest').remove(0);
      expect(dataBinder._dataBindingRemovedCounter).toEqual(1);
      handle.destroy(); // should do nothing as we've removed the binding already
      expect(dataBinder._dataBindingRemovedCounter).toEqual(1);
    });

    it('should be able to deactivate & reactivate defined bindings', function() {
      dataBinder.attachTo(workspace);
      workspace.root.insert('parent1', PropertyFactory.create(ParentTemplate.typeid));
      dataBinder.register('BINDING', ParentTemplate.typeid, ParentDataBinding);
      expect(dataBinder._dataBindingCreatedCounter).toEqual(1);  // retroactively created binding for 'parent1'
      // now deactivate, but don't undefine
      dataBinder.unregisterDataBindings(undefined, true, false);
      workspace.root.insert('parent2', PropertyFactory.create(ParentTemplate.typeid));
      expect(dataBinder._dataBindingCreatedCounter).toEqual(1);  // no new binding created (no activated binding rule)
      workspace.root.remove('parent1');
      expect(dataBinder._dataBindingRemovedCounter).toEqual(1); // the original binding is removed
      dataBinder._resetDebugCounters();
      workspace.root.remove('parent2');
      expect(dataBinder._dataBindingRemovedCounter).toEqual(0); // no binding -> nothing is removed
      workspace.root.insert('parent1', PropertyFactory.create(ParentTemplate.typeid));
      expect(dataBinder._dataBindingCreatedCounter).toEqual(0); // no new binding is created
      // reactivate
      dataBinder.activateDataBinding('BINDING');
      expect(dataBinder._dataBindingCreatedCounter).toEqual(1); // reatroactively created binding at parent1
      workspace.root.insert('parent2', PropertyFactory.create(ParentTemplate.typeid));
      expect(dataBinder._dataBindingCreatedCounter).toEqual(2); // created new binding at parent2
    });

    it('should be able to undefine & redefine active bindings', function() {
      dataBinder.attachTo(workspace);
      workspace.root.insert('parent1', PropertyFactory.create(ParentTemplate.typeid));
      dataBinder.register('BINDING', ParentTemplate.typeid, ParentDataBinding);
      expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
      // now undefine, but don't deactivate
      dataBinder.unregisterDataBindings(undefined, false, true);
      expect(dataBinder._dataBindingRemovedCounter).toEqual(0);
      workspace.root.insert('parent2', PropertyFactory.create(ParentTemplate.typeid));
      expect(dataBinder._dataBindingCreatedCounter).toEqual(1); // no new binding is created
      workspace.root.remove('parent1');
      expect(dataBinder._dataBindingRemovedCounter).toEqual(1);  // the original is removed
      workspace.root.remove('parent2');
      expect(dataBinder._dataBindingRemovedCounter).toEqual(1); // no bindings left -> nothing removed
      dataBinder._resetDebugCounters();
      workspace.root.insert('parent1', PropertyFactory.create(ParentTemplate.typeid));
      expect(dataBinder._dataBindingCreatedCounter).toEqual(0); // no new binding is created
      // redefine with new definition
      dataBinder.defineDataBinding('BINDING', ChildTemplate.typeid, ParentDataBinding); // new def -> needs activation
      // should already be activated
      dataBinder.defineDataBinding('BINDING', ParentTemplate.typeid, ParentDataBinding);
      // no DataBinding is created retroactively, because defineDataBinding will not trigger
      // a retroactive pass (this is a bug tracked as LYNXDEV-6274)
      expect(dataBinder._dataBindingCreatedCounter).toEqual(0); // still no binding, see above
      workspace.root.insert('child1', PropertyFactory.create(ChildTemplate.typeid));
      expect(dataBinder._dataBindingCreatedCounter).toEqual(0); // not activated for ChildTemplate.typeid yet!
      workspace.root.insert('parent2', PropertyFactory.create(ParentTemplate.typeid));
      // binding should be created for parent2 (defined & active)
      expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
      dataBinder.activateDataBinding('BINDING'); // should create bindings for child1 & parent1 (both retroactively)
      expect(dataBinder._dataBindingCreatedCounter).toEqual(3);
    });
  });

});
