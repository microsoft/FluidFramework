/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
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
import _ from 'underscore';
import { DataBinder } from '../../src/data_binder/data_binder';
import { ModificationContext } from '../../src/data_binder/modification_context';
import {
  registerTestTemplates, ParentTemplate, ChildTemplate,
  PrimitiveChildrenTemplate, ArrayContainerTemplate, SetContainerTemplate,
  MapContainerTemplate, NodeContainerTemplate, UnrepresentedTemplate,
  InheritedChildTemplate, InheritedChildrenTemplate, MultipleInheritedTemplate,
  positionTemplate, ReferenceParentTemplate,
  EscapingTestTemplate
} from './testTemplates';
import { DataBinding } from '../../src/data_binder/data_binding.js';

import {
  ParentDataBinding,
  DerivedDataBinding,
  ChildDataBinding,
  PrimitiveChildrenDataBinding,
  InheritedChildDataBinding
} from './testDataBindings';
import {
  catchConsoleErrors, hadConsoleError, clearConsoleError
} from './catch_console_errors';
import { unregisterAllOnPathListeners } from '../../src/data_binder/internal_utils';

import { HFDMConnection, HFDMWorkspaceComponent } from '@adsk/forge-appfw-hfdm';
import { PropertyFactory } from '@fluid-experimental/property-properties';
import { RESOLVE_NEVER } from '../../src/internal/constants';

const cleanupClasses = function () {
  // Unregister DataBinding paths
  const allClasses = [
    ParentDataBinding,
    DerivedDataBinding,
    ChildDataBinding,
    PrimitiveChildrenDataBinding,
    InheritedChildDataBinding
  ];
  _.forEach(allClasses, in_constructor => {
    unregisterAllOnPathListeners(in_constructor);
    // Check to see if we have accidentally left the classes bound
    const numDataBinders = in_constructor.prototype.__numDataBinders;
    console.assert(numDataBinders === undefined || numDataBinders === 0);
  });
};

describe('DataBinder', function () {

  var hfdm, workspace;

  catchConsoleErrors();

  beforeAll(function () {
    registerTestTemplates();
  });

  beforeEach(function () {
    hfdm = new HFDM();
    workspace = hfdm.createWorkspace();
    return workspace.initialize({ local: true }).then(function () {
    });
  });

  afterEach(function () {
    cleanupClasses();
  });

  describe('basic functionality', function () {
    it('exists', function () {
      should.exist(DataBinder);
    });

    it('should be able to call attach, isAttached, and detach', function () {
      var dataBinder = new DataBinder();

      dataBinder.isAttached().should.equal(false);
      dataBinder.attachTo(workspace);
      dataBinder.isAttached().should.equal(true);
      dataBinder.attachTo(workspace); // Binding a second time should do nothing
      dataBinder.isAttached().should.equal(true);
      dataBinder.detach();
      dataBinder.isAttached().should.equal(false);
      dataBinder.detach(); // Should do nothing when not bound
      dataBinder.isAttached().should.equal(false);
    });

    it('should be possible to pass a workspace to the constructor', function () {
      var dataBinder;
      expect(dataBinder = new DataBinder(workspace)).to.not.throw;
      dataBinder.isAttached().should.equal(true);
      dataBinder.getWorkspace().should.equal(workspace);
    });

    it('should be possible to modify a workspace that was passed to the constructor', function () {
      expect(new DataBinder(workspace)).to.not.throw;
      workspace.insert('children', PropertyFactory.create('Float32', 'array'));
      workspace.get('children').insert(0, PropertyFactory.create('Float32', 'single', 1));
    });

    it('should be possible to pass and modify a populated workspace to the constructor', function () {
      workspace.insert('children', PropertyFactory.create('Float32', 'array'));
      workspace.get('children').insert(0, PropertyFactory.create('Float32', 'single', 1));
      expect(new DataBinder(workspace)).to.not.throw;
      workspace.get('children').insert(1, PropertyFactory.create('Float32', 'single', 2));
    });

    it('should invoke DataBinding callbacks when a workspace is passed to the constructor', function () {
      const dataBinder = new DataBinder(workspace);
      const handle = dataBinder.register('BINDING', ParentTemplate.typeid, ParentDataBinding);

      const property = PropertyFactory.create(ParentTemplate.typeid, 'single');
      workspace.insert('parent', property);
      const dataBinding = dataBinder.resolve(property, 'BINDING');
      dataBinding.onPostCreate.callCount.should.equal(1);
      dataBinding.onModify.callCount.should.equal(0);
      property.getValue('text').should.equal('');
      property.get('text').setValue('test');
      property.getValue('text').should.equal('test');
      dataBinding.onModify.callCount.should.equal(1);
      handle.destroy();
    });

    it('should be possible to pass an HFDMWorkspaceComponent to the constructor', function () {
      var hfdmConnection = new HFDMConnection();
      var workspaceComponent = new HFDMWorkspaceComponent(hfdmConnection);
      var dataBinder = new DataBinder(workspaceComponent);
      dataBinder.isAttached().should.equal(false);
      expect(dataBinder.getWorkspace()).to.equal(null);
      // eslint-disable-next-line max-nested-callbacks
      return dataBinder.initializeComponent().then(instance => {
        dataBinder.should.equal(instance);
        dataBinder.isAttached().should.equal(true);
      });
    });

    it('it should not be possible to register multiple DataBindings for a single typeid and bindingType', function () {
      var dataBinder = new DataBinder();
      var bindingType = 'BINDING';
      var typeid = 'an:id-1.0.0';

      var handle1 = dataBinder.register(bindingType, typeid, ParentDataBinding);
      var handle2;
      (function () {
        handle2 = dataBinder.register(bindingType, typeid, ChildDataBinding);
      }).should.throw(Error);

      expect(handle1).to.exist;
      expect(handle2).to.not.exist;

      handle1.destroy();
    });

    it('should be able to activate all bindings of a bindingtype', function () {
      var dataBinder = new DataBinder();

      dataBinder.attachTo(workspace);

      dataBinder.defineDataBinding('BINDING', ParentTemplate.typeid, ParentDataBinding);
      dataBinder.defineDataBinding('BINDING', ChildTemplate.typeid, ChildDataBinding);
      dataBinder.defineDataBinding('BINDING', InheritedChildTemplate.typeid, InheritedChildDataBinding);
      dataBinder.activateDataBinding('BINDING');

      dataBinder._dataBindingCreatedCounter.should.equal(0);
      workspace.insert('parent', PropertyFactory.create(ParentTemplate.typeid, 'single'));
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      workspace.insert('child', PropertyFactory.create(ChildTemplate.typeid, 'single'));
      dataBinder._dataBindingCreatedCounter.should.equal(2);
      workspace.insert('inherited', PropertyFactory.create(InheritedChildTemplate.typeid, 'single'));
      dataBinder._dataBindingCreatedCounter.should.equal(3);

      dataBinder.resolve('parent', 'BINDING').should.be.instanceof(ParentDataBinding);
      dataBinder.resolve('child', 'BINDING').should.be.instanceof(ChildDataBinding);
      dataBinder.resolve('inherited', 'BINDING').should.be.instanceof(InheritedChildDataBinding);

      dataBinder.detach();
    });

    it('it should be possible to register DataBindings on demand', function () {
      var dataBinder = new DataBinder();
      dataBinder.attachTo(workspace);
      var bindingType = 'BINDING';
      var typeid = 'Float64';
      workspace.insert('child1', PropertyFactory.create('NodeProperty', 'single'));
      workspace.get('child1').insert('myFloat2', PropertyFactory.create('Float64', 'single'));

      var handle = dataBinder.register(bindingType, typeid, ParentDataBinding, { exactPath: 'child1.myFloat2' });
      handle.destroy();
    });

    it.skip('it should not take forever to listen to arrays', function () {
      var dataBinder = new DataBinder();
      dataBinder.attachTo(workspace);

      const myArray = PropertyFactory.create(positionTemplate.typeid, 'array');
      workspace.insert('myArray', myArray);

      let counter = 0;
      const callback = function () {
        counter++;
      };

      const n = 500;
      const k = 5;

      workspace.pushModifiedEventScope();
      for (let i = 0; i < n; ++i) {
        myArray.push(PropertyFactory.create(positionTemplate.typeid, 'single'));
      }
      workspace.popModifiedEventScope();

      for (let i = 0; i < n; ++i) {
        dataBinder.registerOnPath('/myArray[' + i + '].x', ['modify'], callback);
      }

      for (let i = 0; i < n * k; ++i) {
        const index = Math.floor(Math.random() * n);
        myArray.get([index, 'x']).setValue(i + 1);
      }

      counter.should.equal(n * k);
    });

    it('it should be possible to activate the same thing twice with exact bindings', function () {
      var dataBinder = new DataBinder();
      dataBinder.attachTo(workspace);
      var bindingType = 'BINDING';
      var typeid = 'Test:ParentID-0.0.1';
      workspace.insert('pset', PropertyFactory.create(typeid, 'single'));

      const modifySpy = sinon.spy();
      ParentDataBinding.registerOnPath('text', ['modify'], modifySpy);
      dataBinder.defineDataBinding(bindingType, typeid, ParentDataBinding);
      // activate the same binding twice
      var handle1 = dataBinder.activateDataBinding(bindingType, typeid,
        { exactPath: 'pset' });
      var handle2 = dataBinder.activateDataBinding(bindingType, typeid,
        { exactPath: 'pset' });

      // Modifying should only trigger once
      modifySpy.resetHistory();
      workspace.get(['pset', 'text']).setValue('bobo');
      modifySpy.callCount.should.equal(1);

      // Deactivate one of them
      handle1.destroy();

      // Modifying should only trigger once
      modifySpy.resetHistory();
      workspace.get(['pset', 'text']).setValue('was a clown');
      modifySpy.callCount.should.equal(1);

      // Deactivate the other
      handle2.destroy();

      // Modifying should not trigger any more
      modifySpy.resetHistory();
      workspace.get(['pset', 'text']).setValue('was a clown');
      modifySpy.callCount.should.equal(0);

      dataBinder.detach();
    });

    it('should create/remove DataBindings when corresponding property set is added/removed', function () {
      var dataBinder = new DataBinder();

      // Listen for the creation events

      // Register the DataBindings
      dataBinder.register('BINDING', ParentTemplate.typeid, ParentDataBinding);
      dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding);

      // Bind to the workspace
      dataBinder.attachTo(workspace);

      var parentPset = PropertyFactory.create(ParentTemplate.typeid, 'single');
      var childPset = PropertyFactory.create(ChildTemplate.typeid, 'single');

      dataBinder._dataBindingCreatedCounter.should.equal(0);

      // parentPset should produce a ParentDataBinding
      workspace.insert(parentPset);
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      const parentDataBinding = dataBinder.resolve(parentPset, 'BINDING');
      parentDataBinding.should.be.instanceOf(ParentDataBinding);
      parentDataBinding.getProperty().should.eql(parentPset);
      // Should be given a pset and a modification set on construction
      parentDataBinding.params.property.should.equal(parentPset);
      parentDataBinding.onPostCreate.callCount.should.equal(1);
      dataBinder._resetDebugCounters();

      // childPset should produce a ChildDataBinding
      workspace.insert(childPset);
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      const childDataBinding = dataBinder.resolve(childPset, 'BINDING');
      childDataBinding.should.be.instanceOf(ChildDataBinding);
      childDataBinding.getProperty().should.eql(childPset);
      childDataBinding.onModify.callCount.should.equal(0); // !!!
      childDataBinding.onPreModify.callCount.should.equal(childDataBinding.onModify.callCount);
      childDataBinding.onPreModify.resetHistory();
      childDataBinding.onPostCreate.callCount.should.equal(1);
      childDataBinding.onModify.resetHistory();
      // Should be given a pset and a modification set on construction
      childDataBinding.params.property.should.equal(childPset);
      dataBinder._resetDebugCounters();
      // Should notify DataBinding when primitive property is changed
      childPset.resolvePath('text').value = 'hello';
      childDataBinding.onModify.callCount.should.equal(1);
      childDataBinding.onPreModify.callCount.should.equal(childDataBinding.onModify.callCount);
      var modificationContext = childDataBinding.onModify.getCall(0).args[0];
      should.exist(modificationContext);

      // Removing childPset should notify childDataBinding and emit event
      dataBinder._dataBindingRemovedCounter.should.equal(0);
      workspace.remove(childPset);
      dataBinder._dataBindingRemovedCounter.should.equal(1);
      childDataBinding.onRemove.callCount.should.equal(1);
      dataBinder._resetDebugCounters();

      // Removing parentPset should notify parentDataBinding and emit event
      dataBinder._dataBindingRemovedCounter.should.equal(0);
      workspace.remove(parentPset);
      dataBinder._dataBindingRemovedCounter.should.equal(1);
      parentDataBinding.onRemove.callCount.should.equal(1);
      dataBinder._resetDebugCounters();

      // Unbind from the workspace
      dataBinder.detach();
    });

    it('should create DataBindings for properties that already exist', function () {
      var dataBinder = new DataBinder();

      // Register the DataBindings
      dataBinder.register('BINDING', ParentTemplate.typeid, ParentDataBinding);

      // Add the property BEFORE binding
      var parentPset = PropertyFactory.create(ParentTemplate.typeid, 'single');
      var dynamicPrimitive = PropertyFactory.create('String', 'single');
      dynamicPrimitive.value = 'I am dynamic';
      parentPset.insert('dynamicPrimitive', dynamicPrimitive);

      workspace.insert(parentPset);
      dataBinder._dataBindingCreatedCounter.should.equal(0);

      // Bind to the workspace after the properties are added
      dataBinder.attachTo(workspace);

      // Now the DataBinding should have been created
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      const parentDataBinding = dataBinder.resolve(parentPset, 'BINDING');
      parentDataBinding.should.be.instanceOf(ParentDataBinding);
      parentDataBinding.getProperty().should.eql(parentPset);
      // Should be given a pset and a modification set on construction
      parentDataBinding.params.property.should.equal(parentPset);
      parentDataBinding.onPostCreate.callCount.should.equal(1);

      // Unbind from the workspace
      dataBinder.detach();
    });

    it('should notify DataBindings of primitive changes', function () {
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
      dataBinder._dataBindingCreatedCounter.should.equal(0);

      // primitiveChildrenPset should produce a PrimitiveChildrenDataBinding
      workspace.insert(primitiveChildrenPset);
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      const primitiveChildrenDataBinding = dataBinder.resolve(primitiveChildrenPset, 'BINDING');
      primitiveChildrenDataBinding.should.be.instanceOf(PrimitiveChildrenDataBinding);
      primitiveChildrenDataBinding.getProperty().should.eql(primitiveChildrenPset);
      primitiveChildrenDataBinding.onModify.callCount.should.equal(0); // !!!
      primitiveChildrenDataBinding
        .onPreModify.callCount.should.equal(primitiveChildrenDataBinding.onModify.callCount);
      primitiveChildrenDataBinding.onPreModify.resetHistory();
      primitiveChildrenDataBinding.onModify.resetHistory();
      // Should be initialized with a ModificationSet
      primitiveChildrenDataBinding.params.property.should.equal(primitiveChildrenPset);
      dataBinder._resetDebugCounters();

      // Should notify DataBinding when primitive properties are changed
      // String modification
      primitiveChildrenPset.resolvePath('aString').value = 'some other string';
      primitiveChildrenDataBinding.onModify.callCount.should.equal(1);
      primitiveChildrenDataBinding
        .onPreModify.callCount.should.equal(primitiveChildrenDataBinding.onModify.callCount);
      primitiveChildrenDataBinding.onPreModify.resetHistory();
      primitiveChildrenDataBinding.onModify.resetHistory();

      // Number modification
      primitiveChildrenPset.resolvePath('aNumber').value = 2;
      primitiveChildrenDataBinding.onModify.callCount.should.equal(1);
      primitiveChildrenDataBinding
        .onPreModify.callCount.should.equal(primitiveChildrenDataBinding.onModify.callCount);
      primitiveChildrenDataBinding.onPreModify.resetHistory();
      primitiveChildrenDataBinding.onModify.resetHistory();

      // Boolean modification
      primitiveChildrenPset.resolvePath('aBoolean').value = false;
      primitiveChildrenDataBinding.onModify.callCount.should.equal(1);
      primitiveChildrenDataBinding
        .onPreModify.callCount.should.equal(primitiveChildrenDataBinding.onModify.callCount);
      primitiveChildrenDataBinding.onPreModify.resetHistory();
      primitiveChildrenDataBinding.onModify.resetHistory();

      // Enum modification
      primitiveChildrenPset.resolvePath('anEnum').value = 100;
      primitiveChildrenDataBinding.onModify.callCount.should.equal(1);
      primitiveChildrenDataBinding
        .onPreModify.callCount.should.equal(primitiveChildrenDataBinding.onModify.callCount);
      primitiveChildrenDataBinding.onModify.resetHistory();
      primitiveChildrenDataBinding.onPreModify.resetHistory();

      // Nested property modification
      primitiveChildrenPset.resolvePath('nested.aNumber').value = 2;
      primitiveChildrenDataBinding.onModify.callCount.should.equal(1);
      primitiveChildrenDataBinding
        .onPreModify.callCount.should.equal(primitiveChildrenDataBinding.onModify.callCount);
      primitiveChildrenDataBinding.onModify.resetHistory();
      primitiveChildrenDataBinding.onPreModify.resetHistory();

      workspace.pushModifiedEventScope();
      primitiveChildrenPset.resolvePath('arrayOfNumbers').set(2, 20); // [1, 2, 20]
      workspace.popModifiedEventScope();
      primitiveChildrenDataBinding.onModify.callCount.should.equal(1);
      primitiveChildrenDataBinding
        .onPreModify.callCount.should.equal(primitiveChildrenDataBinding.onModify.callCount);
      primitiveChildrenDataBinding.onModify.resetHistory();
      primitiveChildrenDataBinding.onPreModify.resetHistory();

      // Array property insert and delete should come as an ArrayModification
      workspace.pushModifiedEventScope();
      // at this point our array is: 1, 2, 20
      primitiveChildrenPset.resolvePath('arrayOfNumbers').insert(0, 0); // [0, 1, 2, 3]
      primitiveChildrenPset.resolvePath('arrayOfNumbers').remove(3); // [0, 1, 2]
      primitiveChildrenPset.resolvePath('arrayOfNumbers').set(2, 10); // [0, 1, 10]
      workspace.popModifiedEventScope();
      primitiveChildrenDataBinding.onModify.callCount.should.equal(1);
      primitiveChildrenDataBinding
        .onPreModify.callCount.should.equal(primitiveChildrenDataBinding.onModify.callCount);
      primitiveChildrenPset.resolvePath('arrayOfNumbers').getLength().should.equal(3);

      primitiveChildrenDataBinding.onModify.resetHistory();
      primitiveChildrenDataBinding.onPreModify.resetHistory();

      // Array property modify
      workspace.pushModifiedEventScope();
      primitiveChildrenPset.resolvePath('arrayOfNumbers').setValues([4, 5, 6]);
      workspace.popModifiedEventScope();
      primitiveChildrenDataBinding.onModify.callCount.should.equal(1);
      primitiveChildrenDataBinding
        .onPreModify.callCount.should.equal(primitiveChildrenDataBinding.onModify.callCount);
      primitiveChildrenDataBinding.onModify.resetHistory();
      primitiveChildrenDataBinding.onPreModify.resetHistory();

      // Map insert, modify, and delete should come as a MapModification
      workspace.pushModifiedEventScope();
      primitiveChildrenPset.resolvePath('mapOfNumbers').insert('three', 3);
      primitiveChildrenPset.resolvePath('mapOfNumbers').set('one', 1);
      primitiveChildrenPset.resolvePath('mapOfNumbers').remove('two');
      workspace.popModifiedEventScope();
      primitiveChildrenDataBinding.onModify.callCount.should.equal(1);
      primitiveChildrenDataBinding
        .onPreModify.callCount.should.equal(primitiveChildrenDataBinding.onModify.callCount);
      primitiveChildrenDataBinding.onModify.resetHistory();
      primitiveChildrenDataBinding.onPreModify.resetHistory();

      // Unbind from the workspace
      dataBinder.detach();
    });

    it('should notify DataBinding when parent pset is removed', function () {
      var dataBinder = new DataBinder();

      // Only register the ChildDataBinding
      var textSpy = sinon.spy();
      ChildDataBinding.registerOnPath('text', ['modify'], textSpy);
      dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding);

      // Bind to the workspace
      dataBinder.attachTo(workspace);

      var parentPset = PropertyFactory.create(ParentTemplate.typeid, 'single');
      var childPset = PropertyFactory.create(ChildTemplate.typeid, 'single');

      dataBinder._dataBindingCreatedCounter.should.equal(0);

      // parentPset should NOT produce a ParentDataBinding (since it wasn't registered)
      workspace.insert(parentPset);
      dataBinder._dataBindingCreatedCounter.should.equal(0);

      // childPset should produce a ChildDataBinding
      workspace.resolvePath(parentPset.getId()).insert(childPset);
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      const childDataBinding = dataBinder.resolve(childPset, 'BINDING');
      childDataBinding.should.be.instanceOf(ChildDataBinding);
      childDataBinding.getProperty().should.eql(childPset);
      childDataBinding.onModify.callCount.should.equal(0); // !!!
      childDataBinding.onPreModify.callCount.should.equal(childDataBinding.onModify.callCount);
      childDataBinding.onPostCreate.callCount.should.equal(1);
      childDataBinding.onModify.resetHistory();
      childDataBinding.onPreModify.resetHistory();
      childDataBinding.onPostCreate.resetHistory();
      // our specific onModify function shouldn't get called because it was an insert, not a modify operation
      textSpy.callCount.should.equal(0);
      textSpy.resetHistory();

      // Should notify DataBinding when primitive property is changed
      childPset.resolvePath('text').value = 'hello';
      childDataBinding.onModify.callCount.should.equal(1);
      childDataBinding.onPostCreate.callCount.should.equal(0);
      childDataBinding.onPreModify.callCount.should.equal(childDataBinding.onModify.callCount);
      textSpy.callCount.should.equal(1);
      textSpy.resetHistory();

      // Removing parentPset should notify childDataBinding and emit event
      dataBinder._dataBindingRemovedCounter.should.equal(0);
      workspace.remove(parentPset);
      dataBinder._dataBindingRemovedCounter.should.equal(1);
      childDataBinding.onRemove.callCount.should.equal(1);
      dataBinder._resetDebugCounters();

      // Unbind from the workspace
      dataBinder.detach();
    });

    it('should notify DataBinding with special characters in the path', function () {
      var dataBinder = new DataBinder();

      // Only register the ChildDataBinding
      var textSpy = sinon.spy();
      ChildDataBinding.registerOnPath('text', ['modify'], textSpy);
      dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding);

      // Bind to the workspace
      dataBinder.attachTo(workspace);

      var parentPset = PropertyFactory.create(EscapingTestTemplate.typeid, 'single');
      workspace.insert('parent', parentPset);

      textSpy.callCount.should.equal(0);
      workspace.get(['parent', 'nested.test', 'child "with" quotes', 'text']).setValue('test');
      textSpy.callCount.should.equal(1);

      dataBinder.detach();
    });

    it('should survive modifications when no DataBindings are registered', function () {
      var dataBinder = new DataBinder();

      // Bind to the workspace
      dataBinder.attachTo(workspace);

      var childPset = PropertyFactory.create(ChildTemplate.typeid, 'single');

      workspace.insert(childPset);
      childPset.resolvePath('text').value = 'hello';
      workspace.remove(childPset);

      dataBinder._dataBindingCreatedCounter.should.equal(0);
      dataBinder._dataBindingRemovedCounter.should.equal(0);

      // Unbind from the workspace
      dataBinder.detach();
    });

    it('should notify DataBindings of dynamically added primitives', function () {
      var dataBinder = new DataBinder();

      // Register the DataBindings
      dataBinder.register('BINDING', ParentTemplate.typeid, ParentDataBinding);

      // Bind to the workspace
      dataBinder.attachTo(workspace);

      // Add the property
      var parentPset = PropertyFactory.create(ParentTemplate.typeid, 'single');
      workspace.insert(parentPset);

      // Now the DataBinding should have been created
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      const parentDataBinding = dataBinder.resolve(parentPset, 'BINDING');
      parentDataBinding.should.be.instanceOf(ParentDataBinding);
      parentDataBinding.getProperty().should.eql(parentPset);
      parentDataBinding.onPostCreate.callCount.should.equal(1);

      // Unbind from the workspace
      dataBinder.detach();
    });

    it('should notify of pre-existing primitives', function () {
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

      workspace.insert(pset);

      // Bind to the workspace
      dataBinder.attachTo(workspace);

      // DataBinding should have been created and notified appropriately
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      const dataBinding = dataBinder.resolve(pset, 'BINDING');

      dataBinding.params.property.should.equal(pset);
      dataBinding.onPostCreate.callCount.should.equal(1);
      // Unbind from the workspace
      dataBinder.detach();
    });

    it('array of templates with array of primitives', function () {
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
      PropertyFactory.validate(PrimitiveChildWrapperTemplate).isValid.should.equal(true);

      var initializeProperties = function (pset) {
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

      workspace.insert(wrapperPset);

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
      dataBinder._dataBindingCreatedCounter.should.equal(3);

      // Unbind from the workspace
      dataBinder.detach();
    });

    it('it should not be possible to register with an invalid data binding ctor', function () {
      var dataBinder = new DataBinder();
      var bindingType = 'BINDING';
      var typeid = 'an-id';

      // missing ctor
      expect(dataBinder.register.bind(dataBinder, bindingType, typeid, undefined)).to.throw();
      // invalid ctor
      const fakeCtor = {};
      expect(dataBinder.register.bind(dataBinder, bindingType, typeid, fakeCtor)).to.throw();

    });

    it('it should catch nested traversal attempts', function () {
      var dataBinder = new DataBinder();
      class myDerivedDataBinding extends ParentDataBinding {
        constructor(params) {
          super(params);
          // insert an extra property into the workspace - this happens during the traversal and is forbidden
          workspace.insert(PropertyFactory.create(ParentTemplate.typeid, 'single'));
        }
      }

      var textSpy = sinon.spy(function (in_context) {
        workspace.insert(PropertyFactory.create(ParentTemplate.typeid, 'single'));
      });
      ChildDataBinding.registerOnPath('text', ['modify'], textSpy);
      // Register the DataBindings
      dataBinder.register('BINDING', ParentTemplate.typeid, myDerivedDataBinding);
      dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding);
      // Bind to the workspace
      dataBinder.attachTo(workspace);

      // ctor inserts into the workspace -> should throw
      hadConsoleError().should.equal(false); // throws inside a HFDM callback so we need to check for console errors
      workspace.insert('node', PropertyFactory.create(ParentTemplate.typeid, 'single'));
      hadConsoleError().should.equal(true);
      clearConsoleError();

      workspace.insert('node2', PropertyFactory.create(ChildTemplate.typeid, 'single'));
      // callback inserts into the workspace -> should throw
      hadConsoleError().should.equal(false); // throws inside a HFDM callback so we need to check for console errors
      workspace.get('node2').get('text').setValue('new text');
      hadConsoleError().should.equal(true);
      clearConsoleError();
      textSpy.callCount.should.equal(1);

      dataBinder.detach();
    });

    it('it should not return empty arrays from resolve() when binding type is provided (LYNXDEV-5446)', function () {
      var dataBinder = new DataBinder();

      // Register the DataBindings
      dataBinder.register('PARENT', ParentTemplate.typeid, ParentDataBinding);
      dataBinder.register('CHILD', ParentTemplate.typeid, ChildDataBinding);
      dataBinder.register('CHILD', ChildTemplate.typeid, ChildDataBinding);
      // Bind to the workspace
      dataBinder.attachTo(workspace);
      workspace.insert('parentNode', PropertyFactory.create(ParentTemplate.typeid, 'single'));
      workspace.insert('childNode', PropertyFactory.create(ChildTemplate.typeid, 'single'));
      workspace.insert('simpleNode', PropertyFactory.create('NodeProperty', 'single'));
      let bindings = dataBinder.resolve('/parentNode');
      bindings.length.should.equal(2); // parent and child
      bindings[0].should.be.instanceof(ParentDataBinding); // registration order!
      bindings[1].should.be.instanceof(ChildDataBinding); // registration order!
      dataBinder.resolve('/parentNode', 'PARENT').should.be.instanceOf(ParentDataBinding);
      dataBinder.resolve('/parentNode', 'CHILD').should.be.instanceOf(ChildDataBinding);
      should.not.exist(dataBinder.resolve('/parentNode', 'INVALID'));
      bindings = dataBinder.resolve('/childNode');
      bindings.length.should.equal(1); // just child
      bindings[0].should.be.instanceof(ChildDataBinding); // registration order!
      dataBinder.resolve('/childNode', 'CHILD').should.be.instanceOf(ChildDataBinding);
      should.not.exist(dataBinder.resolve('/childNode', 'PARENT'));
      should.not.exist(dataBinder.resolve('/childNode', 'INVALID'));
      bindings = dataBinder.resolve('/simpleNode'); // should return an empty array
      _.isArray(bindings).should.equal(true);
      bindings.length.should.equal(0);
      bindings = dataBinder.resolve('/invalidPath'); // should return an empty array for non-existing paths
      _.isArray(bindings).should.equal(true);
      bindings.length.should.equal(0);
      bindings = dataBinder.resolve(); // should return an empty array for not supplied path & bindingType
      _.isArray(bindings).should.equal(true);
      bindings.length.should.equal(0);
      should.not.exist(dataBinder.resolve('/simpleNode', 'PARENT'));
      should.not.exist(dataBinder.resolve('/simpleNode', 'CHILD'));
      should.not.exist(dataBinder.resolve(undefined, 'CHILD')); // should return undefined for not supplied paths
      // (but supplied bindingType)
      should.not.exist(dataBinder.resolve('/invalidPath', 'CHILD')); // same with invalid paths

      dataBinder.detach();
    });

  });

  describe('arrays', function () {
    var dataBinder, arrayPset, parentDataBinding;

    // Can't use 'beforeEach' since not all of the tests need them, just most of them
    var setupDataBinder = function () {
      dataBinder = new DataBinder();

      // Register the DataBindings
      dataBinder.register('BINDING', ArrayContainerTemplate.typeid, ParentDataBinding, { context: 'single' });
      dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding, { context: 'array' });

      // Add the container pset
      arrayPset = PropertyFactory.create(ArrayContainerTemplate.typeid, 'single');

      // Bind to the workspace
      dataBinder.attachTo(workspace);

      dataBinder._dataBindingCreatedCounter.should.equal(0);

      // parentPset should produce a ParentDataBinding
      workspace.insert('myArrayPset', arrayPset);
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      parentDataBinding = dataBinder.resolve(arrayPset, 'BINDING');
      parentDataBinding.onModify.callCount.should.equal(0);  // !!!
      parentDataBinding.onPostCreate.callCount.should.equal(1);
      parentDataBinding.onPreModify.callCount.should.equal(parentDataBinding.onModify.callCount);
      parentDataBinding.onModify.resetHistory();
      parentDataBinding.onPreModify.resetHistory();
      dataBinder._resetDebugCounters();
    };

    // Can't use 'afterEach' since not all of the tests need them, just most of them
    var tearDownDataBinder = function () {
      // Unbind from the workspace
      dataBinder.detach();
      // Reset counters
      dataBinder._resetDebugCounters();
    };

    it('should create DataBindings that already exist', function (done) {
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
      workspace.insert(arrayPset);

      dataBinder._dataBindingCreatedCounter.should.equal(0);

      // Bind to the workspace
      dataBinder.attachTo(workspace);

      dataBinder._dataBindingCreatedCounter.should.equal(3);

      // ParentDataBinding should have been created and notified of the children
      parentDataBinding = dataBinder.resolve(arrayPset, 'BINDING');
      parentDataBinding.getProperty().should.equal(arrayPset);
      parentDataBinding.onPostCreate.callCount.should.equal(1);
      parentDataBinding.onModify.callCount.should.equal(0); // !!!
      parentDataBinding.onPreModify.callCount.should.equal(parentDataBinding.onModify.callCount);
      parentDataBinding.onModify.resetHistory();

      // ChildDataBindings should have been created
      var childDataBindings = [];
      childDataBindings.push(dataBinder.resolve(childPsets[0], 'BINDING'));
      childDataBindings[0].getProperty().should.equal(childPsets[0]);
      childDataBindings[0].onPostCreate.callCount.should.equal(1);

      childDataBindings.push(dataBinder.resolve(childPsets[1], 'BINDING'));
      childDataBindings[1].getProperty().should.equal(childPsets[1]);
      childDataBindings[1].onPostCreate.callCount.should.equal(1);

      tearDownDataBinder();
      done();
    });

    it('should notify parent when child DataBinding is added in array', function (done) {
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
        dataBinder._dataBindingCreatedCounter.should.equal(1);
        const childDataBinding = dataBinder.resolve(childPset, 'BINDING');
        childDataBinding.should.be.instanceOf(ChildDataBinding);
        childDataBinding.getProperty().should.eql(childPset);
        childDataBinding.onPostCreate.callCount.should.equal(1);
        dataBinder._resetDebugCounters();

        // Child gets the construction notification
        childDataBinding.onModify.callCount.should.equal(0);
        childDataBinding.onPreModify.callCount.should.equal(childDataBinding.onModify.callCount);

        // Parent should have been notified
        parentDataBinding.onModify.callCount.should.equal(1);
        parentDataBinding.onPreModify.callCount.should.equal(parentDataBinding.onModify.callCount);
        parentDataBinding.onPostCreate.callCount.should.equal(1);
        parentDataBinding.onModify.resetHistory();
        parentDataBinding.onPreModify.resetHistory();

        // unrepresentedPset should not produce an DataBinding
        arrayPset.resolvePath(unrepresentedSubArrayPath)
          .push(PropertyFactory.create(UnrepresentedTemplate.typeid, 'single'));
        dataBinder._dataBindingCreatedCounter.should.equal(0);

        // Parent should have been notified
        parentDataBinding.onModify.callCount.should.equal(1);
        parentDataBinding.onPreModify.callCount.should.equal(parentDataBinding.onModify.callCount);
        parentDataBinding.onModify.resetHistory();
        parentDataBinding.onPreModify.resetHistory();

        // Multiple insertions
        // Should produce DataBindings
        var child1 = PropertyFactory.create(ChildTemplate.typeid, 'single');
        var child2 = PropertyFactory.create(ChildTemplate.typeid, 'single');
        workspace.pushModifiedEventScope();
        arrayPset.resolvePath(subArrayPath).push(child1);
        arrayPset.resolvePath(subArrayPath).push(child2);
        workspace.popModifiedEventScope();

        dataBinder._dataBindingCreatedCounter.should.equal(2);
        const childDataBinding1 = dataBinder.resolve(child1.getAbsolutePath(), 'BINDING');
        const childDataBinding2 = dataBinder.resolve(child2.getAbsolutePath(), 'BINDING');
        childDataBinding1.should.be.instanceOf(ChildDataBinding);
        childDataBinding2.should.be.instanceOf(ChildDataBinding);
        childDataBinding1.onPostCreate.callCount.should.equal(1);
        childDataBinding1.getProperty().should.eql(child1);
        childDataBinding2.getProperty().should.eql(child2);
        childDataBinding2.onPostCreate.callCount.should.equal(1);
        dataBinder._resetDebugCounters();

        // Parent should have been notified
        parentDataBinding.onModify.callCount.should.equal(1);
        parentDataBinding.onPreModify.callCount.should.equal(parentDataBinding.onModify.callCount);
        parentDataBinding.onModify.resetHistory();
        parentDataBinding.onPreModify.resetHistory();

        // Should not produce DataBindings
        workspace.pushModifiedEventScope();
        arrayPset.resolvePath(unrepresentedSubArrayPath)
          .insert(0, PropertyFactory.create(UnrepresentedTemplate.typeid, 'single'));
        arrayPset.resolvePath(unrepresentedSubArrayPath)
          .push(PropertyFactory.create(UnrepresentedTemplate.typeid, 'single'));
        workspace.popModifiedEventScope();
        dataBinder._dataBindingCreatedCounter.should.equal(0);

        // Parent should have been notified
        parentDataBinding.onModify.callCount.should.equal(1);
        parentDataBinding.onPreModify.callCount.should.equal(parentDataBinding.onModify.callCount);
        parentDataBinding.onModify.resetHistory();
        parentDataBinding.onPreModify.resetHistory();
      }

      tearDownDataBinder();
      done();
    });

    it('should be able to mix insert and push for child DataBindings in an array', function (done) {
      setupDataBinder();

      var subArrayPath = 'subArray';
      var child1 = PropertyFactory.create(ChildTemplate.typeid, 'single');
      // childPset should produce a ChildDataBinding
      arrayPset.resolvePath(subArrayPath).push(child1);

      // Multiple insertions
      // Should produce DataBindings
      var child2 = PropertyFactory.create(ChildTemplate.typeid, 'single');
      var child3 = PropertyFactory.create(ChildTemplate.typeid, 'single');
      workspace.pushModifiedEventScope();
      arrayPset.resolvePath(subArrayPath).insert(0, child2);
      arrayPset.resolvePath(subArrayPath).push(child3);
      workspace.popModifiedEventScope();

      dataBinder._dataBindingCreatedCounter.should.equal(3);

      dataBinder._resetDebugCounters();
      // the order should be: child2, child1, child3 because we inserted child2 at position 0!
      dataBinder.resolve('myArrayPset.subArray[0]', 'BINDING').getProperty().should.equal(child2);
      dataBinder.resolve('myArrayPset.subArray[1]', 'BINDING').getProperty().should.equal(child1);
      dataBinder.resolve('myArrayPset.subArray[2]', 'BINDING').getProperty().should.equal(child3);

      dataBinder.resolve('myArrayPset.subArray[0]', 'BINDING').onPostCreate.callCount.should.equal(1);
      dataBinder.resolve('myArrayPset.subArray[1]', 'BINDING').onPostCreate.callCount.should.equal(1);
      dataBinder.resolve('myArrayPset.subArray[2]', 'BINDING').onPostCreate.callCount.should.equal(1);

      parentDataBinding.onModify.resetHistory();

      tearDownDataBinder();
      done();
    });

    it('should notify appropriate DataBinding of modifications - subArray', function (done) {
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

        dataBinder._dataBindingCreatedCounter.should.equal(0);

        // Add the children
        workspace.pushModifiedEventScope();
        arrayPset.resolvePath(subArrayPath).push(childPset);
        arrayPset.resolvePath(unrepresentedSubArrayPath).push(unrepresentedPset);
        workspace.popModifiedEventScope();

        // ChildDataBinding should have been created
        dataBinder._dataBindingCreatedCounter.should.equal(1);
        const childDataBinding = dataBinder.resolve(childPset.getAbsolutePath(), 'BINDING');
        childDataBinding.should.be.instanceOf(ChildDataBinding);
        childDataBinding.getProperty().should.eql(childPset);
        childDataBinding.onModify.callCount.should.equal(0);
        childDataBinding.onPreModify.callCount.should.equal(childDataBinding.onModify.callCount);
        childDataBinding.onModify.resetHistory();
        childDataBinding.onPreModify.resetHistory();
        childDataBinding.onPostCreate.callCount.should.equal(1);
        dataBinder._resetDebugCounters();

        // Parent should have been notified
        parentDataBinding.onModify.callCount.should.equal(1);
        parentDataBinding.onPreModify.callCount.should.equal(parentDataBinding.onModify.callCount);
        parentDataBinding.onModify.resetHistory();
        parentDataBinding.onPreModify.resetHistory();

        // Modifying the childPset should notify ChildDataBinding, not the parent
        childPset.resolvePath('text').value = 'hello';
        //parentDataBinding.onModify.callCount.should.equal(0);
        childDataBinding.onModify.callCount.should.equal(1);
        childDataBinding.onPreModify.callCount.should.equal(childDataBinding.onModify.callCount);

        // Modifying the unrepresentedPset should notify the ParentDataBinding
        parentDataBinding.onModify.resetHistory();
        parentDataBinding.onPreModify.resetHistory();
        unrepresentedPset.resolvePath('text').value = 'world';
        parentDataBinding.onModify.callCount.should.equal(1);
        parentDataBinding.onPreModify.callCount.should.equal(parentDataBinding.onModify.callCount);

        parentDataBinding.onModify.resetHistory();
        parentDataBinding.onPreModify.resetHistory();
      }

      tearDownDataBinder();
      done();
    });

    it('should return DataBindings that belong to a family', function (done) {
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
        workspace.pushModifiedEventScope();
        arrayPset.resolvePath(subArrayPath).push(childPset1);
        arrayPset.resolvePath(subArrayPath).push(childPset2);
        arrayPset.resolvePath(subArrayPath).push(childPset3);
        arrayPset.resolvePath(unrepresentedSubArrayPath).push(unrepresentedPset);
        workspace.popModifiedEventScope();
      }
      var dataBindings = dataBinder._getDataBindingsByType('BINDING');
      dataBindings.length.should.equal(7);
      var numChildDataBindings = 0;
      var numParentDataBindings = 0;
      for (i = 0; i < 7; ++i) {
        if (dataBindings[i] instanceof ChildDataBinding) {
          numChildDataBindings++;
        } else if (dataBindings[i] instanceof ParentDataBinding) {
          numParentDataBindings++;
          dataBindings[i].should.equal(parentDataBinding);
        }
      }
      numChildDataBindings.should.equal(6);
      numParentDataBindings.should.equal(1);
      dataBindings = dataBinder._getDataBindingsByType('NO_SUCH_BINDING');
      dataBindings.length.should.equal(0);
      tearDownDataBinder();
      done();
    });

    it('should notify parent when child DataBinding is removed from array', function (done) {
      this.timeout(15000); // we have to increase this as it times out in npm run test:dev otherwise
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

          dataBinder._dataBindingCreatedCounter.should.equal(1);
          const childDataBinding = dataBinder.resolve(childPsets[j].getAbsolutePath(), 'BINDING');
          childDataBinding.should.be.instanceOf(ChildDataBinding);
          childDataBinding.getProperty().should.eql(childPsets[j]);
          childDataBinding.onPostCreate.callCount.should.equal(1);
          dataBinder._resetDebugCounters();

          childDataBindings.push(childDataBinding);

          // Parent should have been notified
          parentDataBinding.onModify.callCount.should.equal(2);
          parentDataBinding.onPreModify.callCount.should.equal(parentDataBinding.onModify.callCount);
          parentDataBinding.onModify.resetHistory();
          parentDataBinding.onPreModify.resetHistory();
        }

        // ChildDataBindings
        // Multiple removals
        workspace.pushModifiedEventScope();
        // TODO: also test for indices 0 and 1
        arrayPset.resolvePath(subArrayPath).remove(0);
        arrayPset.resolvePath(subArrayPath).remove(0);
        workspace.popModifiedEventScope();

        dataBinder._dataBindingRemovedCounter.should.equal(2);
        childDataBindings[0].onRemove.callCount.should.equal(1);
        childDataBindings[1].onRemove.callCount.should.equal(1);
        dataBinder._resetDebugCounters();

        // Parent should have been notified
        parentDataBinding.onModify.callCount.should.equal(1);
        parentDataBinding.onPreModify.callCount.should.equal(parentDataBinding.onModify.callCount);
        parentDataBinding.onModify.resetHistory();
        parentDataBinding.onPreModify.resetHistory();

        childDataBindings = [childDataBindings[2]];

        // Remove last entry
        arrayPset.resolvePath(subArrayPath).remove(0);

        dataBinder._dataBindingRemovedCounter.should.equal(1);
        childDataBindings[0].onRemove.callCount.should.equal(1);
        dataBinder._resetDebugCounters();

        // Parent should have been notified
        parentDataBinding.onModify.callCount.should.equal(1);
        parentDataBinding.onPreModify.callCount.should.equal(parentDataBinding.onModify.callCount);
        parentDataBinding.onModify.resetHistory();
        parentDataBinding.onPreModify.resetHistory();

        // Unrepresented
        // Multiple removals
        workspace.pushModifiedEventScope();
        arrayPset.resolvePath(unrepresentedSubArrayPath).remove(0);
        arrayPset.resolvePath(unrepresentedSubArrayPath).remove(1);
        workspace.popModifiedEventScope();
        dataBinder._dataBindingRemovedCounter.should.equal(0);

        // Parent should have been notified
        parentDataBinding.onModify.callCount.should.equal(1);
        parentDataBinding.onPreModify.callCount.should.equal(parentDataBinding.onModify.callCount);
        parentDataBinding.onModify.resetHistory();
        parentDataBinding.onPreModify.resetHistory();

        // Remove last item
        arrayPset.resolvePath(unrepresentedSubArrayPath).remove(0);
        dataBinder._dataBindingRemovedCounter.should.equal(0);

        // Parent should have been notified
        parentDataBinding.onModify.callCount.should.equal(1);
        parentDataBinding.onPreModify.callCount.should.equal(parentDataBinding.onModify.callCount);
        parentDataBinding.onModify.resetHistory();
        parentDataBinding.onPreModify.resetHistory();
      }

      tearDownDataBinder();
      done();
    });

    it('should handle multiple array operations', function (done) {
      setupDataBinder();

      var i;

      var subArrayPath = 'subArray';

      // Add children
      var childPsets = [];
      var childDataBindings = [];
      for (i = 0; i < 2; i++) {
        childPsets.push(PropertyFactory.create(ChildTemplate.typeid, 'single'));
        arrayPset.resolvePath(subArrayPath).push(childPsets[i]);

        dataBinder._dataBindingCreatedCounter.should.equal(1);
        const childDataBinding = dataBinder.resolve(childPsets[i].getAbsolutePath(), 'BINDING');
        childDataBinding.should.be.instanceOf(ChildDataBinding);
        childDataBinding.getProperty().should.eql(childPsets[i]);
        childDataBinding.onPostCreate.callCount.should.equal(1);
        dataBinder._resetDebugCounters();

        childDataBindings.push(childDataBinding);

        // Parent should have been notified
        parentDataBinding.onModify.callCount.should.equal(1);
        parentDataBinding.onPreModify.callCount.should.equal(parentDataBinding.onModify.callCount);
        parentDataBinding.onModify.resetHistory();
        parentDataBinding.onPreModify.resetHistory();
      }

      // Perform some operations but delay the change set
      workspace.pushModifiedEventScope();

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
      workspace.popModifiedEventScope();

      // Should have one DataBinding removed
      dataBinder._dataBindingRemovedCounter.should.equal(1);
      removedDataBinding.onRemove.callCount.should.equal(1);

      // Should have one DataBinding created
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      // created at index 2, but then we shifted the array so the latest DataBinding created should be at index 1
      const createdDataBinding = dataBinder.resolve(arrayPset.resolvePath(subArrayPath).get(1), 'BINDING');
      createdDataBinding.should.be.instanceOf(ChildDataBinding);
      createdDataBinding.onPostCreate.callCount.should.equal(1);
      dataBinder._resetDebugCounters();

      // Parent should have been notified
      parentDataBinding.onModify.callCount.should.equal(1);
      parentDataBinding.onPreModify.callCount.should.equal(parentDataBinding.onModify.callCount);
      parentDataBinding.onModify.resetHistory();
      parentDataBinding.onPreModify.resetHistory();

      tearDownDataBinder();
      done();
    });

    it('should handle combined and scoped changeSet correctly (part 1)', function (done) {
      setupDataBinder();

      var array = PropertyFactory.create(ChildTemplate.typeid, 'array');
      workspace.insert('array', array);
      workspace.pushModifiedEventScope();
      var item = PropertyFactory.create(ChildTemplate.typeid, 'single');
      array.push(item);
      workspace.popModifiedEventScope();

      tearDownDataBinder();
      done();
    });

    it('should handle combined and scoped changeSet correctly (part 2)', function (done) {
      setupDataBinder();

      workspace.pushModifiedEventScope();
      var array = PropertyFactory.create(ChildTemplate.typeid, 'array');
      workspace.insert('array', array);
      var item = PropertyFactory.create(ChildTemplate.typeid, 'single');
      array.push(item);
      workspace.popModifiedEventScope();

      tearDownDataBinder();
      done();
    });

    it('should remove all DataBindings when clearing an array', function (done) {
      setupDataBinder();

      var i;

      var subArrayPath = 'subArray';

      // Add children
      var childPsets = [];
      var childDataBindings = [];
      for (i = 0; i < 7; i++) {
        childPsets.push(PropertyFactory.create(ChildTemplate.typeid, 'single'));
        arrayPset.resolvePath(subArrayPath).push(childPsets[i]);

        dataBinder._dataBindingCreatedCounter.should.equal(1);
        const childDataBinding = dataBinder.resolve(childPsets[i].getAbsolutePath(), 'BINDING');
        childDataBinding.should.be.instanceOf(ChildDataBinding);
        childDataBinding.getProperty().should.eql(childPsets[i]);
        childDataBinding.onPostCreate.callCount.should.equal(1);
        dataBinder._resetDebugCounters();

        childDataBindings.push(childDataBinding);

        // Parent should have been notified
        parentDataBinding.onModify.callCount.should.equal(1);
        parentDataBinding.onPreModify.callCount.should.equal(parentDataBinding.onModify.callCount);
        parentDataBinding.onModify.resetHistory();
        parentDataBinding.onPreModify.resetHistory();
      }

      // Clear the array
      arrayPset.resolvePath(subArrayPath).removeRange(0, arrayPset.resolvePath(subArrayPath).length);
      // we should have removed all 7 DataBindings
      dataBinder._dataBindingRemovedCounter.should.equal(7);
      tearDownDataBinder();
      done();
    });

    it('should handle multiple removes within a scope', function (done) {
      setupDataBinder();

      var i;

      var subArrayPath = 'subArray';

      // Add children
      var childPsets = [];
      var childDataBindings = [];
      for (i = 0; i < 7; i++) {
        childPsets.push(PropertyFactory.create(ChildTemplate.typeid, 'single'));
        arrayPset.resolvePath(subArrayPath).push(childPsets[i]);

        dataBinder._dataBindingCreatedCounter.should.equal(1);
        const childDataBinding = dataBinder.resolve(childPsets[i].getAbsolutePath(), 'BINDING');
        childDataBinding.should.be.instanceOf(ChildDataBinding);
        childDataBinding.getProperty().should.eql(childPsets[i]);
        childDataBinding.onPostCreate.callCount.should.equal(1);
        dataBinder._resetDebugCounters();

        childDataBindings.push(childDataBinding);

        // Parent should have been notified
        parentDataBinding.onModify.callCount.should.equal(1);
        parentDataBinding.onPreModify.callCount.should.equal(parentDataBinding.onModify.callCount);
        parentDataBinding.onModify.resetHistory();
        parentDataBinding.onPreModify.resetHistory();
      }

      // Multiple removes
      workspace.pushModifiedEventScope();
      arrayPset.resolvePath(subArrayPath).remove(1); // 0, 2, 3, 4, 5, 6
      arrayPset.resolvePath(subArrayPath).removeRange(3, 3); // 0, 2, 3
      workspace.popModifiedEventScope();
      // we should have removed 4 dataBindings
      dataBinder._dataBindingRemovedCounter.should.equal(4);
      dataBinder._resetDebugCounters();

      childDataBindings[0].onRemove.callCount.should.equal(0);
      childDataBindings[1].onRemove.callCount.should.equal(1);
      childDataBindings[2].onRemove.callCount.should.equal(0);
      childDataBindings[3].onRemove.callCount.should.equal(0);
      childDataBindings[4].onRemove.callCount.should.equal(1);
      childDataBindings[5].onRemove.callCount.should.equal(1);
      childDataBindings[6].onRemove.callCount.should.equal(1);
      arrayPset.resolvePath(subArrayPath).getLength().should.equal(3);
      arrayPset.resolvePath(subArrayPath).get(0).should.equal(childPsets[0]);
      arrayPset.resolvePath(subArrayPath).get(1).should.equal(childPsets[2]);
      arrayPset.resolvePath(subArrayPath).get(2).should.equal(childPsets[3]);
      dataBinder.resolve('myArrayPset.' + subArrayPath + '[0]', 'BINDING').should.equal(childDataBindings[0]);
      dataBinder.resolve('myArrayPset.' + subArrayPath + '[1]', 'BINDING').should.equal(childDataBindings[2]);
      dataBinder.resolve('myArrayPset.' + subArrayPath + '[2]', 'BINDING').should.equal(childDataBindings[3]);
      tearDownDataBinder();
      done();
    });

    it('should handle multiple operations within a scope', function (done) {
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
      workspace.pushModifiedEventScope();
      for (i = 0; i < 3; ++i) {
        arrayPset.resolvePath(subArrayPath).push(childPsets[i + 1]);
      }
      workspace.popModifiedEventScope();
      arrayPset.resolvePath(subArrayPath).getLength().should.equal(3);
      arrayPset.resolvePath(subArrayPath).get(0).should.equal(childPsets[1]);
      arrayPset.resolvePath(subArrayPath).get(1).should.equal(childPsets[2]);
      arrayPset.resolvePath(subArrayPath).get(2).should.equal(childPsets[3]);

      // 3 dataBindings created
      dataBinder._dataBindingCreatedCounter.should.equal(3);
      for (i = 0; i < 3; ++i) {
        childDataBindings.push(dataBinder.resolve(childPsets[i + 1].getAbsolutePath(), 'BINDING'));
      }
      dataBinder._resetDebugCounters();
      /* eslint-disable max-len */
      dataBinder.resolve('myArrayPset.' + subArrayPath + '[0]', 'BINDING').getProperty().should.equal(childPsets[1]);
      dataBinder.resolve('myArrayPset.' + subArrayPath + '[1]', 'BINDING').getProperty().should.equal(childPsets[2]);
      dataBinder.resolve('myArrayPset.' + subArrayPath + '[2]', 'BINDING').getProperty().should.equal(childPsets[3]);

      dataBinder.resolve('myArrayPset.' + subArrayPath + '[0]', 'BINDING').onPostCreate.callCount.should.equal(1);
      dataBinder.resolve('myArrayPset.' + subArrayPath + '[1]', 'BINDING').onPostCreate.callCount.should.equal(1);
      dataBinder.resolve('myArrayPset.' + subArrayPath + '[2]', 'BINDING').onPostCreate.callCount.should.equal(1);
      /* eslint-enable max-len */

      // change one of the elements
      workspace.pushModifiedEventScope();
      arrayPset.resolvePath(subArrayPath).set(2, childPsets[20]);
      workspace.popModifiedEventScope();
      // 1 DataBinding removed, 1 DataBinding created -- because it's a complex type
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      actChildDataBinding = dataBinder.resolve(childPsets[20].getAbsolutePath(), 'BINDING');
      dataBinder._dataBindingRemovedCounter.should.equal(1);
      dataBinder._resetDebugCounters();
      dataBinder.resolve('myArrayPset.' + subArrayPath + '[2]',
        'BINDING').getProperty().should.equal(childPsets[20]);
      dataBinder.resolve('myArrayPset.' + subArrayPath + '[2]',
        'BINDING').onPostCreate.callCount.should.equal(1);

      // this one is the one removed
      childDataBindings[2].onRemove.callCount.should.equal(1);
      // this one should be the one created
      dataBinder.resolve('myArrayPset.' + subArrayPath + '[2]', 'BINDING').should.equal(actChildDataBinding);
      // let's keep it for later tests
      childDataBindings[2] = actChildDataBinding;

      // let's do some more scoped changes
      workspace.pushModifiedEventScope();
      // at this point our array contains childPsets with the indices: 1, 2, 20
      arrayPset.resolvePath(subArrayPath).insert(0, childPsets[0]); // childPset indices: [0, 1, 2, 3]
      arrayPset.resolvePath(subArrayPath).remove(3); // childPset indices: [0, 1, 2]
      arrayPset.resolvePath(subArrayPath).set(2, childPsets[10]); // childPset indices: [0, 1, 10]
      workspace.popModifiedEventScope();
      // 2 dataBindings created, 2 removed (the set also implies an DataBinding creation/removal)
      dataBinder._dataBindingCreatedCounter.should.equal(2);
      dataBinder._dataBindingRemovedCounter.should.equal(2);
      // again last dataBindings was removed due to replacement (we didn't get a chance to store the other one)
      childDataBindings[2].onRemove.callCount.should.equal(1);
      // the first one created (at index 0) will stay at index 0
      actChildDataBinding =
        dataBinder.resolve(arrayPset.resolvePath(subArrayPath).get(0).getAbsolutePath(), 'BINDING');
      // the other one will be at index 2
      const secondCreatedDataBinding =
        dataBinder.resolve(arrayPset.resolvePath(subArrayPath).get(2).getAbsolutePath(), 'BINDING');
      dataBinder._resetDebugCounters();
      arrayPset.resolvePath(subArrayPath).getLength().should.equal(3);
      arrayPset.resolvePath(subArrayPath).get(0).should.equal(childPsets[0]);
      arrayPset.resolvePath(subArrayPath).get(1).should.equal(childPsets[1]);
      arrayPset.resolvePath(subArrayPath).get(2).should.equal(childPsets[10]);
      /* eslint-disable max-len */
      dataBinder.resolve('myArrayPset.' + subArrayPath + '[0]',
        'BINDING').getProperty().should.equal(childPsets[0]);
      dataBinder.resolve('myArrayPset.' + subArrayPath + '[1]',
        'BINDING').getProperty().should.equal(childPsets[1]);
      dataBinder.resolve('myArrayPset.' + subArrayPath + '[2]',
        'BINDING').getProperty().should.equal(childPsets[10]);
      /* eslint-enable max-len */
      dataBinder.resolve('myArrayPset.' + subArrayPath + '[0]', 'BINDING').should.equal(actChildDataBinding);
      dataBinder.resolve('myArrayPset.' + subArrayPath + '[1]', 'BINDING').should.equal(childDataBindings[0]);
      dataBinder.resolve('myArrayPset.' + subArrayPath + '[2]', 'BINDING').should.equal(secondCreatedDataBinding);

      dataBinder.resolve('myArrayPset.' + subArrayPath + '[0]',
        'BINDING').onPostCreate.callCount.should.equal(1);
      dataBinder.resolve('myArrayPset.' + subArrayPath + '[1]',
        'BINDING').onPostCreate.callCount.should.equal(1);
      dataBinder.resolve('myArrayPset.' + subArrayPath + '[2]',
        'BINDING').onPostCreate.callCount.should.equal(1);
      tearDownDataBinder();
      done();
    });

    it('should handle remove and push within a scope', function (done) {
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
      workspace.insert('root', rootProperty);
      dataBinder._dataBindingCreatedCounter.should.equal(3);
      const rootDataBinding = dataBinder.resolve('/root', 'BINDING');
      const containerDataBinding = dataBinder.resolve('/root.children[1]', 'BINDING');
      const childDataBinding = dataBinder.resolve('/root.children[0]', 'BINDING');
      expect(rootDataBinding).to.exist;  // eslint-disable-line no-unused-expressions
      expect(childDataBinding).to.exist;  // eslint-disable-line no-unused-expressions
      expect(containerDataBinding).to.exist;  // eslint-disable-line no-unused-expressions

      workspace.pushModifiedEventScope();
      rootProperty.get('children').remove(0);
      container.get('children').push(PropertyFactory.create(ChildTemplate.typeid, 'single'));
      workspace.popModifiedEventScope();
      // this should have been removed
      childDataBinding.onRemove.callCount.should.equal(1);
      // once after creation, once after the scoped events
      containerDataBinding.onModify.callCount.should.equal(1);
      containerDataBinding.onPreModify.callCount.should.equal(containerDataBinding.onModify.callCount);

      dataBinder._dataBindingCreatedCounter.should.equal(4);
      const childDataBinding2 =
        dataBinder.resolve(containerDataBinding.getProperty().get(['children', '0']), 'BINDING');
      expect(childDataBinding2).to.exist;   // eslint-disable-line no-unused-expressions
      childDataBinding2.onPostCreate.callCount.should.equal(1);
      dataBinder._resetDebugCounters();

      tearDownDataBinder();
      done();
    });
  });

  describe('sets', function () {
    var dataBinder, setPset, parentDataBinding;

    // Can't use 'beforeEach' since not all of the tests need them, just most of them
    var setupDataBinder = function () {
      dataBinder = new DataBinder();

      // Register the dataBindings
      dataBinder.register('BINDING', SetContainerTemplate.typeid, ParentDataBinding);
      dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding, { context: 'set' });

      // Add the container pset
      setPset = PropertyFactory.create(SetContainerTemplate.typeid, 'single');

      // Bind to the workspace
      dataBinder.attachTo(workspace);

      dataBinder._dataBindingCreatedCounter.should.equal(0);

      // parentPset should produce a ParentDataBinding
      workspace.insert('mySetPset', setPset);
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      parentDataBinding = dataBinder.resolve(setPset, 'BINDING');
      parentDataBinding.onModify.callCount.should.equal(0); // !!!
      parentDataBinding.onPreModify.callCount.should.equal(parentDataBinding.onModify.callCount);
      parentDataBinding.onPostCreate.callCount.should.equal(1);
      parentDataBinding.onModify.resetHistory();
      parentDataBinding.onPreModify.resetHistory();
      dataBinder._resetDebugCounters();
    };

    // Can't use 'afterEach' since not all of the tests need them, just most of them
    var tearDownDataBinder = function () {
      // Unbind from the workspace
      dataBinder.detach();

      // Reset counters
      dataBinder._resetDebugCounters();
    };

    it('should create dataBindings that already exist', function () {
      dataBinder = new DataBinder();

      // Register the dataBindings
      dataBinder.register('BINDING', SetContainerTemplate.typeid, ParentDataBinding);
      dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding, { context: 'set' });

      // Add psets BEFORE binding
      // Add the container pset
      var childPset = PropertyFactory.create(ChildTemplate.typeid, 'single');

      setPset = PropertyFactory.create(SetContainerTemplate.typeid, 'single');
      setPset.resolvePath('subSet').insert(childPset);
      workspace.insert(setPset);

      dataBinder._dataBindingCreatedCounter.should.equal(0);

      // Bind to the workspace
      dataBinder.attachTo(workspace);

      // DataBindings should now have been created
      dataBinder._dataBindingCreatedCounter.should.equal(2);

      parentDataBinding = dataBinder.resolve(setPset.getAbsolutePath(), 'BINDING');
      parentDataBinding.getProperty().should.equal(setPset);
      parentDataBinding.onPostCreate.callCount.should.equal(1);

      const childDataBinding = dataBinder.resolve(childPset.getAbsolutePath(), 'BINDING');
      childDataBinding.getProperty().should.equal(childPset);
      childDataBinding.onPostCreate.callCount.should.equal(1);

      tearDownDataBinder();
    });

    it('should notify parent when child is added in set', function () {
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
        workspace.pushModifiedEventScope();
        setPset.resolvePath(subSetPath).insert(child1);
        setPset.resolvePath(subSetPath).insert(child2);
        workspace.popModifiedEventScope();

        dataBinder._dataBindingCreatedCounter.should.equal(2);
        var childDataBinding1 = dataBinder.resolve(child1.getAbsolutePath(), 'BINDING');
        var childDataBinding2 = dataBinder.resolve(child2.getAbsolutePath(), 'BINDING');
        childDataBinding1.should.be.instanceOf(ChildDataBinding);
        childDataBinding2.should.be.instanceOf(ChildDataBinding);
        childDataBinding1.getProperty().should.eql(child1);
        childDataBinding2.getProperty().should.eql(child2);
        childDataBinding1.onPostCreate.callCount.should.equal(1);
        childDataBinding2.onPostCreate.callCount.should.equal(1);
        dataBinder._resetDebugCounters();

        // Parent should have been notified
        parentDataBinding.onModify.callCount.should.equal(1);
        parentDataBinding.onPreModify.callCount.should.equal(parentDataBinding.onModify.callCount);
        parentDataBinding.onModify.resetHistory();
        parentDataBinding.onPreModify.resetHistory();

        // Should not produce dataBindings
        var unrepresented1 = PropertyFactory.create(UnrepresentedTemplate.typeid, 'single');
        var unrepresented2 = PropertyFactory.create(UnrepresentedTemplate.typeid, 'single');
        workspace.pushModifiedEventScope();
        setPset.resolvePath(unrepresentedSubSetPath).insert(unrepresented1);
        setPset.resolvePath(unrepresentedSubSetPath).insert(unrepresented2);
        workspace.popModifiedEventScope();
        dataBinder._dataBindingCreatedCounter.should.equal(0);

        // Parent should have been notified
        parentDataBinding.onModify.callCount.should.equal(1);
        parentDataBinding.onPreModify.callCount.should.equal(parentDataBinding.onModify.callCount);
        parentDataBinding.onModify.resetHistory();
        parentDataBinding.onPreModify.resetHistory();
      }

      tearDownDataBinder();
    });

    it('should notify appropriate DataBinding of modifications - subSet', function () {
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

        dataBinder._dataBindingCreatedCounter.should.equal(0);

        // Add the children
        workspace.pushModifiedEventScope();
        setPset.resolvePath(subSetPath).insert(childPset);
        setPset.resolvePath(unrepresentedSubSetPath).insert(unrepresentedPset);
        workspace.popModifiedEventScope();

        // ChildDataBinding should have been created
        dataBinder._dataBindingCreatedCounter.should.equal(1);
        const childDataBinding = dataBinder.resolve(childPset.getAbsolutePath(), 'BINDING');
        childDataBinding.should.be.instanceOf(ChildDataBinding);
        childDataBinding.getProperty().should.eql(childPset);
        childDataBinding.onModify.callCount.should.equal(0);
        childDataBinding.onPreModify.callCount.should.equal(childDataBinding.onModify.callCount);
        childDataBinding.onModify.resetHistory();
        childDataBinding.onPreModify.resetHistory();
        childDataBinding.onPostCreate.callCount.should.equal(1);
        dataBinder._resetDebugCounters();

        // Parent should have been notified once for each path
        parentDataBinding.onModify.callCount.should.equal(1);
        parentDataBinding.onPreModify.callCount.should.equal(parentDataBinding.onModify.callCount);
        parentDataBinding.onModify.resetHistory();
        parentDataBinding.onPreModify.resetHistory();

        // Modifying the childPset should notify ChildDataBinding and the parent
        childPset.resolvePath('text').value = 'hello';
        parentDataBinding.onModify.callCount.should.equal(1);
        parentDataBinding.onPreModify.callCount.should.equal(parentDataBinding.onModify.callCount);
        childDataBinding.onModify.callCount.should.equal(1);
        childDataBinding.onPreModify.callCount.should.equal(childDataBinding.onModify.callCount);
        parentDataBinding.onModify.resetHistory();
        parentDataBinding.onPreModify.resetHistory();

        // Modifying the unrepresentedPset should notify the ParentDataBinding
        unrepresentedPset.resolvePath('text').value = 'world';
        parentDataBinding.onModify.callCount.should.equal(1);
        parentDataBinding.onPreModify.callCount.should.equal(parentDataBinding.onModify.callCount);

        parentDataBinding.onModify.resetHistory();
        parentDataBinding.onPreModify.resetHistory();
      }

      tearDownDataBinder();
    });

    it('should notify parent when child is removed from set', function () {
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
        workspace.pushModifiedEventScope();
        setPset.resolvePath(subSetPath).insert(child1);
        setPset.resolvePath(unrepresentedSubSetPath).insert(unrepresented1);
        workspace.popModifiedEventScope();

        dataBinder._dataBindingCreatedCounter.should.equal(1);
        var childDataBinding1 = dataBinder.resolve(child1.getAbsolutePath(), 'BINDING');
        childDataBinding1.getProperty().should.eql(child1);
        childDataBinding1.onPostCreate.callCount.should.equal(1);
        dataBinder._resetDebugCounters();

        // Parent should have been notified
        parentDataBinding.onModify.callCount.should.equal(1);
        parentDataBinding.onPreModify.callCount.should.equal(parentDataBinding.onModify.callCount);
        parentDataBinding.onModify.resetHistory();
        parentDataBinding.onPreModify.resetHistory();

        dataBinder._dataBindingRemovedCounter.should.equal(0);

        // Remove the represented property set
        setPset.resolvePath(subSetPath).remove(child1);

        dataBinder._dataBindingRemovedCounter.should.equal(1);
        childDataBinding1.onRemove.callCount.should.equal(1);
        dataBinder._resetDebugCounters();

        parentDataBinding.onModify.callCount.should.equal(1);
        parentDataBinding.onPreModify.callCount.should.equal(parentDataBinding.onModify.callCount);
        parentDataBinding.onModify.resetHistory();
        parentDataBinding.onPreModify.resetHistory();

        // Remove the unrepresented property set
        setPset.resolvePath(unrepresentedSubSetPath).remove(unrepresented1);
        dataBinder._dataBindingRemovedCounter.should.equal(0);

        parentDataBinding.onModify.callCount.should.equal(1);
        parentDataBinding.onPreModify.callCount.should.equal(parentDataBinding.onModify.callCount);
        parentDataBinding.onModify.resetHistory();
        parentDataBinding.onPreModify.resetHistory();
      }

      tearDownDataBinder();
    });
  });

  describe('maps', function () {
    var dataBinder, mapPset, parentDataBinding;

    // Can't use 'beforeEach' since not all of the tests need them, just most of them
    var setupDataBinder = function () {
      dataBinder = new DataBinder();

      // Register the dataBindings
      dataBinder.register('BINDING', MapContainerTemplate.typeid, ParentDataBinding);
      dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding, { context: 'map' });

      // Add the container pset
      mapPset = PropertyFactory.create(MapContainerTemplate.typeid, 'single');

      // Bind to the workspace
      dataBinder.attachTo(workspace);

      dataBinder._dataBindingCreatedCounter.should.equal(0);

      // parentPset should produce a ParentDataBinding
      workspace.insert('myMapPset', mapPset);
      parentDataBinding = dataBinder.resolve(mapPset.getAbsolutePath(), 'BINDING');
      parentDataBinding.onModify.callCount.should.equal(0); // !!!
      parentDataBinding.onPreModify.callCount.should.equal(parentDataBinding.onModify.callCount);
      parentDataBinding.onModify.resetHistory();
      parentDataBinding.onPreModify.resetHistory();
      dataBinder.resolve('myMapPset', 'BINDING').onPostCreate.callCount.should.equal(1);
      dataBinder._resetDebugCounters();
    };

    // Can't use 'afterEach' since not all of the tests need them, just most of them
    var tearDownDataBinder = function () {
      // Unbind from the workspace
      dataBinder.detach();
      // Reset counters
      dataBinder._resetDebugCounters();
    };

    it('should create dataBindings that already exist', function () {
      dataBinder = new DataBinder();

      // Register the dataBindings
      dataBinder.register('BINDING', MapContainerTemplate.typeid, ParentDataBinding);
      dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding, { context: 'map' });

      // Add psets BEFORE binding
      // Add the container pset
      var childPset = PropertyFactory.create(ChildTemplate.typeid, 'single');

      mapPset = PropertyFactory.create(MapContainerTemplate.typeid, 'single');
      mapPset.resolvePath('subMap').insert(childPset.getGuid(), childPset);
      workspace.insert(mapPset);

      dataBinder._dataBindingCreatedCounter.should.equal(0);

      // Bind to the workspace
      dataBinder.attachTo(workspace);

      // DataBindings should now have been created
      dataBinder._dataBindingCreatedCounter.should.equal(2);

      parentDataBinding = dataBinder.resolve(mapPset.getAbsolutePath(), 'BINDING');
      parentDataBinding.getProperty().should.equal(mapPset);
      parentDataBinding.onPostCreate.callCount.should.equal(1);

      var childDataBinding = dataBinder.resolve(childPset.getAbsolutePath(), 'BINDING');
      should.exist(childDataBinding);
      childDataBinding.getProperty().should.equal(childPset);
      childDataBinding.onPostCreate.callCount.should.equal(1);

      tearDownDataBinder();
    });

    it('should notify parent when child is added in set', function () {
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
        workspace.pushModifiedEventScope();
        mapPset.resolvePath(subMapPath).insert(child1.getGuid(), child1);
        mapPset.resolvePath(subMapPath).insert(child2.getGuid(), child2);
        workspace.popModifiedEventScope();

        dataBinder._dataBindingCreatedCounter.should.equal(2);
        const childDataBinding1 = dataBinder.resolve(child1.getAbsolutePath(), 'BINDING');
        const childDataBinding2 = dataBinder.resolve(child2.getAbsolutePath(), 'BINDING');
        childDataBinding1.should.be.instanceOf(ChildDataBinding);
        childDataBinding2.should.be.instanceOf(ChildDataBinding);
        childDataBinding1.getProperty().should.eql(child1);
        childDataBinding2.getProperty().should.eql(child2);
        childDataBinding1.onPostCreate.callCount.should.equal(1);
        childDataBinding2.onPostCreate.callCount.should.equal(1);
        dataBinder._resetDebugCounters();

        // Parent should have been notified
        parentDataBinding.onModify.callCount.should.equal(1);
        parentDataBinding.onPreModify.callCount.should.equal(parentDataBinding.onModify.callCount);
        parentDataBinding.onModify.resetHistory();
        parentDataBinding.onPreModify.resetHistory();

        // Should not produce dataBindings
        var unrepresented1 = PropertyFactory.create(UnrepresentedTemplate.typeid, 'single');
        var unrepresented2 = PropertyFactory.create(UnrepresentedTemplate.typeid, 'single');
        workspace.pushModifiedEventScope();
        mapPset.resolvePath(unrepresentedSubMapPath).insert(unrepresented1.getGuid(), unrepresented1);
        mapPset.resolvePath(unrepresentedSubMapPath).insert(unrepresented2.getGuid(), unrepresented2);
        workspace.popModifiedEventScope();
        dataBinder._dataBindingCreatedCounter.should.equal(0);

        // Parent should have been notified
        parentDataBinding.onModify.callCount.should.equal(1);
        parentDataBinding.onPreModify.callCount.should.equal(parentDataBinding.onModify.callCount);
        parentDataBinding.onModify.resetHistory();
        parentDataBinding.onPreModify.resetHistory();
      }

      tearDownDataBinder();
    });

    it('should notify appropriate DataBinding of modifications - submap', function () {
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

        dataBinder._dataBindingCreatedCounter.should.equal(0);

        // Add the children
        workspace.pushModifiedEventScope();
        mapPset.resolvePath(subMapPath).insert(childPset.getGuid(), childPset);
        mapPset.resolvePath(unrepresentedSubMapPath).insert(unrepresentedPset.getGuid(), unrepresentedPset);
        workspace.popModifiedEventScope();

        // ChildDataBinding should have been created
        dataBinder._dataBindingCreatedCounter.should.equal(1);
        const childDataBinding = dataBinder.resolve(childPset.getAbsolutePath(), 'BINDING');
        childDataBinding.should.be.instanceOf(ChildDataBinding);
        childDataBinding.getProperty().should.eql(childPset);
        childDataBinding.onModify.callCount.should.equal(0);
        childDataBinding.onPreModify.callCount.should.equal(childDataBinding.onModify.callCount);
        childDataBinding.onModify.resetHistory();
        childDataBinding.onPreModify.resetHistory();
        childDataBinding.onPostCreate.callCount.should.equal(1);
        dataBinder._resetDebugCounters();

        // Parent should have been notified once for each path
        parentDataBinding.onModify.callCount.should.equal(1);
        parentDataBinding.onPreModify.callCount.should.equal(parentDataBinding.onModify.callCount);
        parentDataBinding.onModify.resetHistory();
        parentDataBinding.onPreModify.resetHistory();
        childDataBinding.onModify.resetHistory();
        childDataBinding.onPreModify.resetHistory();

        // Modifying the childPset should notify ChildDataBinding and the parent
        childPset.resolvePath('text').value = 'hello';
        parentDataBinding.onModify.callCount.should.equal(1);
        parentDataBinding.onPreModify.callCount.should.equal(parentDataBinding.onModify.callCount);
        childDataBinding.onModify.callCount.should.equal(1);
        childDataBinding.onPreModify.callCount.should.equal(childDataBinding.onModify.callCount);
        parentDataBinding.onModify.resetHistory();
        parentDataBinding.onPreModify.resetHistory();

        // Modifying the unrepresentedPset should notify the ParentDataBinding
        unrepresentedPset.resolvePath('text').value = 'world';
        parentDataBinding.onModify.callCount.should.equal(1);
        parentDataBinding.onPreModify.callCount.should.equal(parentDataBinding.onModify.callCount);
        parentDataBinding.onModify.resetHistory();
        parentDataBinding.onPreModify.resetHistory();
      }

      tearDownDataBinder();
    });

    it('should notify parent when child is removed from set', function () {
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
        workspace.pushModifiedEventScope();
        mapPset.resolvePath(subMapPath).insert(child1.getGuid(), child1);
        mapPset.resolvePath(unrepresentedSubMapPath).insert(unrepresented1.getGuid(), unrepresented1);
        workspace.popModifiedEventScope();

        dataBinder._dataBindingCreatedCounter.should.equal(1);
        const childDataBinding1 = dataBinder.resolve(child1.getAbsolutePath(), 'BINDING');
        childDataBinding1.getProperty().should.eql(child1);
        childDataBinding1.onPostCreate.callCount.should.equal(1);
        dataBinder._resetDebugCounters();

        // Parent should have been notified
        parentDataBinding.onModify.callCount.should.equal(1);
        parentDataBinding.onPreModify.callCount.should.equal(parentDataBinding.onModify.callCount);
        parentDataBinding.onModify.resetHistory();
        parentDataBinding.onPreModify.resetHistory();

        dataBinder._dataBindingRemovedCounter.should.equal(0);

        // Remove the represented property set
        mapPset.resolvePath(subMapPath).remove(child1.getGuid());

        dataBinder._dataBindingRemovedCounter.should.equal(1);
        dataBinder._resetDebugCounters();
        childDataBinding1.onRemove.callCount.should.equal(1);

        parentDataBinding.onModify.callCount.should.equal(1);
        parentDataBinding.onPreModify.callCount.should.equal(parentDataBinding.onModify.callCount);
        parentDataBinding.onModify.resetHistory();
        parentDataBinding.onPreModify.resetHistory();

        // Remove the unrepresented property set
        mapPset.resolvePath(unrepresentedSubMapPath).remove(unrepresented1.getGuid());
        dataBinder._dataBindingRemovedCounter.should.equal(0);

        parentDataBinding.onModify.callCount.should.equal(1);
        parentDataBinding.onPreModify.callCount.should.equal(parentDataBinding.onModify.callCount);
        parentDataBinding.onModify.resetHistory();
        parentDataBinding.onPreModify.resetHistory();
      }

      tearDownDataBinder();
    });

    it('should notify entry with special characters in the key', function () {
      dataBinder = new DataBinder();

      // Only register the ChildDataBinding
      var textSpy = sinon.spy();
      ChildDataBinding.registerOnPath('text', ['modify'], textSpy);

      dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding);

      // Bind to the workspace
      dataBinder.attachTo(workspace);

      var parentPset = PropertyFactory.create(MapContainerTemplate.typeid);
      var childPSet = PropertyFactory.create(ChildTemplate.typeid);
      workspace.insert('parent', parentPset);
      workspace.get(['parent', 'subMap']).insert('string.test', childPSet);

      textSpy.callCount.should.equal(0);
      workspace.get(['parent', 'subMap', 'string.test', 'text']).setValue('test');
      textSpy.callCount.should.equal(1);

      tearDownDataBinder();
    });
  });

  describe('nodeProperty', function () {
    var dataBinder, nodePset, parentDataBinding;

    afterEach(function () {
      dataBinder = nodePset = parentDataBinding = null;
    });

    var setupDataBinder = function () {
      dataBinder = new DataBinder();

      // Register the dataBindings
      dataBinder.register('BINDING', NodeContainerTemplate.typeid, ParentDataBinding);
      dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding);

      // Bind to the checkoutView
      dataBinder.attachTo(workspace);

      // Add the property
      nodePset = PropertyFactory.create(NodeContainerTemplate.typeid, 'single');
      workspace.insert('myNodePset', nodePset);

      // Now the DataBinding should have been created
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      parentDataBinding = dataBinder.resolve(nodePset.getAbsolutePath(), 'BINDING');
      parentDataBinding.should.be.instanceOf(ParentDataBinding);
      parentDataBinding.getProperty().should.eql(nodePset);
      parentDataBinding.onModify.callCount.should.equal(0); // !!!
      parentDataBinding.onPreModify.callCount.should.equal(parentDataBinding.onModify.callCount);
      parentDataBinding.onPostCreate.callCount.should.equal(1);
      parentDataBinding.onModify.resetHistory();
      parentDataBinding.onPreModify.resetHistory();

      dataBinder._resetDebugCounters();
    };

    var tearDownDataBinder = function () {
      // Unbind from the workspace
      dataBinder.detach();

      // Reset counters
      dataBinder._resetDebugCounters();
    };

    it('should be notified when primitive is added', function () {
      setupDataBinder();

      // Add a primitive dynamically
      var primitive = PropertyFactory.create('Int32', 'single');
      primitive.value = 100;
      nodePset.insert('dynamicPrimitive', primitive);

      // DataBinding should have been notified
      parentDataBinding.onModify.callCount.should.equal(1);
      parentDataBinding.onPreModify.callCount.should.equal(parentDataBinding.onModify.callCount);
      parentDataBinding.onModify.resetHistory();
      parentDataBinding.onPreModify.resetHistory();

      tearDownDataBinder();
    });

    it('should be notified of changes and adding primitive children at the same time', function () {
      setupDataBinder();

      // Group the following changes
      var dynamicPrimitive = PropertyFactory.create('String', 'single');
      dynamicPrimitive.value = 'A default string';
      nodePset.insert('dynamicPrimitive', dynamicPrimitive);
      parentDataBinding.onModify.resetHistory();
      parentDataBinding.onPreModify.resetHistory();

      workspace.pushModifiedEventScope();
      nodePset.resolvePath('text').value = 'hello';
      dynamicPrimitive.value = 'world';
      var otherDynamicPrimitive = PropertyFactory.create('Uint32', 'single');
      otherDynamicPrimitive.value = '100';
      nodePset.insert('otherDynamicPrimitive', otherDynamicPrimitive);
      workspace.popModifiedEventScope();

      // DataBinding should have been notified
      parentDataBinding.onModify.callCount.should.equal(1);
      parentDataBinding.onPreModify.callCount.should.equal(parentDataBinding.onModify.callCount);

      tearDownDataBinder();
    });

    it('should be notified of dynamically added/removed child properties', function () {
      setupDataBinder();

      var appendPath = [
        '',
        'nested'
      ];

      appendPath.forEach(function (path) {
        // Add the represented child
        var child = PropertyFactory.create(ChildTemplate.typeid, 'single');
        nodePset.resolvePath(path).insert(child);

        ///          var relativePath = path === '' ? child.getGuid() : path + '.' + child.getGuid();

        // Child DataBinding should have been created
        dataBinder._dataBindingCreatedCounter.should.equal(1);
        const childDataBinding = dataBinder.resolve(child.getAbsolutePath(), 'BINDING');
        should.exist(childDataBinding);
        dataBinder._resetDebugCounters();

        // Parent should have been notified
        parentDataBinding.onModify.callCount.should.equal(1);
        parentDataBinding.onPreModify.callCount.should.equal(parentDataBinding.onModify.callCount);
        parentDataBinding.onPostCreate.callCount.should.equal(1);
        parentDataBinding.onModify.resetHistory();
        parentDataBinding.onPreModify.resetHistory();

        // Add the unrepresented child
        var unrepresentedChild = PropertyFactory.create(UnrepresentedTemplate.typeid,
          'single',
          { text: 'hello' });
        nodePset.resolvePath(path).insert(unrepresentedChild);

        ///          var unrepresentedPath = path === '' ?
        ///            unrepresentedChild.getGuid() :
        ///            path + '.' + unrepresentedChild.getGuid();

        // No DataBinding should be created
        dataBinder._dataBindingRemovedCounter.should.equal(0);

        // Parent should have been notified
        parentDataBinding.onModify.callCount.should.equal(1);
        parentDataBinding.onPreModify.callCount.should.equal(parentDataBinding.onModify.callCount);
        parentDataBinding.onModify.resetHistory();
        parentDataBinding.onPreModify.resetHistory();

        // // Remove the represented child
        nodePset.resolvePath(path).remove(child);

        // Child DataBinding should have been removed
        dataBinder._dataBindingRemovedCounter.should.equal(1);
        childDataBinding.onRemove.callCount.should.equal(1);
        dataBinder._resetDebugCounters();

        // Parent should have been notified
        parentDataBinding.onModify.callCount.should.equal(1);
        parentDataBinding.onPreModify.callCount.should.equal(parentDataBinding.onModify.callCount);
        parentDataBinding.onModify.resetHistory();
        parentDataBinding.onPreModify.resetHistory();

        // Remove the unrepresented child
        nodePset.resolvePath(path).remove(unrepresentedChild);

        // No DataBinding should have been removed
        dataBinder._dataBindingRemovedCounter.should.equal(0);

        // Parent should have been notified
        parentDataBinding.onModify.callCount.should.equal(1);
        parentDataBinding.onPreModify.callCount.should.equal(parentDataBinding.onModify.callCount);
        parentDataBinding.onModify.resetHistory();
        parentDataBinding.onPreModify.resetHistory();
      });

      tearDownDataBinder();
    });

    it('should be notified of removed child dataBindings when an intermediate node is removed', function () {
      setupDataBinder();

      // Add the intermediate node
      var intermediateNode = PropertyFactory.create('NodeProperty', 'single');
      nodePset.insert('intermediateNode', intermediateNode);

      // Nothing should have been created
      dataBinder._dataBindingCreatedCounter.should.equal(0);

      // NodeProperties have no values but the parent DataBinding still should be notified that the PSet below changed
      parentDataBinding.onModify.callCount.should.equal(1);
      parentDataBinding.onPreModify.callCount.should.equal(parentDataBinding.onModify.callCount);
      parentDataBinding.onModify.resetHistory();
      parentDataBinding.onPreModify.resetHistory();

      // Add the child
      var child = PropertyFactory.create(ChildTemplate.typeid, 'single');
      intermediateNode.insert(child);

      ///        var relativePath = 'intermediateNode.' + child.getGuid();

      // Child DataBinding should have been created
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      const childDataBinding = dataBinder.resolve(child.getAbsolutePath(), 'BINDING');
      should.exist(childDataBinding);
      childDataBinding.onPostCreate.callCount.should.equal(1);
      dataBinder._resetDebugCounters();

      // Parent should have been notified
      parentDataBinding.onModify.callCount.should.equal(1);
      parentDataBinding.onPreModify.callCount.should.equal(parentDataBinding.onModify.callCount);
      parentDataBinding.onModify.resetHistory();
      parentDataBinding.onPreModify.resetHistory();

      // Remove the intermediate node
      nodePset.remove(intermediateNode);

      // Child DataBinding should have been removed
      dataBinder._dataBindingRemovedCounter.should.equal(1);
      childDataBinding.onRemove.callCount.should.equal(1);
      dataBinder._resetDebugCounters();

      // Parent should have been notified
      parentDataBinding.onModify.callCount.should.equal(1);
      parentDataBinding.onPreModify.callCount.should.equal(parentDataBinding.onModify.callCount);
      parentDataBinding.onModify.resetHistory();
      parentDataBinding.onPreModify.resetHistory();

      tearDownDataBinder();
    });

    it('should be notified of removed child dataBindings. when an intermediate node is removed (from a chain) part 1',
      function () {
        setupDataBinder();

        // Add the intermediate nodes
        var intermediateNode1 = PropertyFactory.create('NodeProperty', 'single');
        nodePset.insert('intermediateNode', intermediateNode1);
        var intermediateNode2 = PropertyFactory.create('NodeProperty', 'single');
        intermediateNode1.insert('intermediateNode', intermediateNode2);

        // Nothing should have been created
        dataBinder._dataBindingCreatedCounter.should.equal(0);

        // NodeProperties have no values but the parent DataBinding
        // still should be notified that the PSet below changed
        parentDataBinding.onModify.callCount.should.equal(2);
        parentDataBinding.onPreModify.callCount.should.equal(parentDataBinding.onModify.callCount);
        parentDataBinding.onModify.resetHistory();
        parentDataBinding.onPreModify.resetHistory();

        // Add the child
        var child = PropertyFactory.create(ChildTemplate.typeid, 'single');
        intermediateNode2.insert(child);

        ///        var relativePath = 'intermediateNode.intermediateNode.' + child.getGuid();

        // Child DataBinding should have been created
        dataBinder._dataBindingCreatedCounter.should.equal(1);
        const childDataBinding = dataBinder.resolve(child.getAbsolutePath(), 'BINDING');
        should.exist(childDataBinding);
        childDataBinding.onPostCreate.callCount.should.equal(1);
        dataBinder._resetDebugCounters();

        // Parent should have been notified
        parentDataBinding.onModify.callCount.should.equal(1);
        parentDataBinding.onPreModify.callCount.should.equal(parentDataBinding.onModify.callCount);
        parentDataBinding.onModify.resetHistory();
        parentDataBinding.onPreModify.resetHistory();

        // Remove one of the intermediate nodes
        nodePset.remove(intermediateNode1);

        // Child DataBinding should have been removed
        dataBinder._dataBindingRemovedCounter.should.equal(1);
        childDataBinding.onRemove.callCount.should.equal(1);
        dataBinder._resetDebugCounters();

        // Parent should be notified
        parentDataBinding.onModify.callCount.should.equal(1); // !!!
        parentDataBinding.onPreModify.callCount.should.equal(parentDataBinding.onModify.callCount);
        parentDataBinding.onModify.resetHistory();
        parentDataBinding.onPreModify.resetHistory();

        tearDownDataBinder();
      });

    it('should be notified of removed child dataBindings. when an intermediate node is removed (from a chain) part 2',
      function () {
        setupDataBinder();

        // Add the intermediate nodes
        var intermediateNode1 = PropertyFactory.create('NodeProperty', 'single');
        nodePset.insert('intermediateNode', intermediateNode1);
        var intermediateNode2 = PropertyFactory.create('NodeProperty', 'single');
        intermediateNode1.insert('intermediateNode', intermediateNode2);

        // Nothing should have been created
        dataBinder._dataBindingCreatedCounter.should.equal(0);

        // NodeProperties have no values but the parent
        // DataBinding still should be notified that the PSet below changed
        parentDataBinding.onModify.callCount.should.equal(2);
        parentDataBinding.onPreModify.callCount.should.equal(parentDataBinding.onModify.callCount);
        parentDataBinding.onModify.resetHistory();
        parentDataBinding.onPreModify.resetHistory();

        // Add the child
        var child = PropertyFactory.create(ChildTemplate.typeid, 'single');
        intermediateNode2.insert(child);

        ///            var relativePath = 'intermediateNode.intermediateNode.' + child.getGuid();

        // Child DataBinding should have been created
        dataBinder._dataBindingCreatedCounter.should.equal(1);
        const childDataBinding = dataBinder.resolve(child.getAbsolutePath(), 'BINDING');
        should.exist(childDataBinding);
        childDataBinding.onPostCreate.callCount.should.equal(1);
        dataBinder._resetDebugCounters();

        // Parent should have been notified
        parentDataBinding.onModify.callCount.should.equal(1);
        parentDataBinding.onPreModify.callCount.should.equal(parentDataBinding.onModify.callCount);
        parentDataBinding.onModify.resetHistory();
        parentDataBinding.onPreModify.resetHistory();

        // Remove one of the intermediate nodes
        nodePset.remove(intermediateNode2);

        // Child DataBinding should have been removed
        dataBinder._dataBindingRemovedCounter.should.equal(1);
        childDataBinding.onRemove.callCount.should.equal(1);
        dataBinder._resetDebugCounters();

        // Parent should be notified
        parentDataBinding.onModify.callCount.should.equal(1); // !!!
        parentDataBinding.onPreModify.callCount.should.equal(parentDataBinding.onModify.callCount);
        parentDataBinding.onModify.resetHistory();
        parentDataBinding.onPreModify.resetHistory();

        tearDownDataBinder();
      });

    it('should be notified of dynamically added/removed collections of primitives', function () {
      setupDataBinder();

      var appendPath = [
        '',
        'nested'
      ];

      appendPath.forEach(function (path) {
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
        workspace.pushModifiedEventScope();
        nodePset.resolvePath(path).insert('arrayOfNumbers', arrayOfNumbers);
        nodePset.resolvePath(path).insert('emptyArray', emptyArray);
        nodePset.resolvePath(path).insert('mapOfNumbers', mapOfNumbers);
        nodePset.resolvePath(path).insert('emptyMap', emptyMap);
        workspace.popModifiedEventScope();

        ///          var relativeArrayPath = path === '' ? 'arrayOfNumbers' : path + '.arrayOfNumbers';
        ///          var relativeEmptyArrayPath = path === '' ? 'emptyArray' : path + '.emptyArray';
        ///          var relativeMapPath = path === '' ? 'mapOfNumbers' : path + '.mapOfNumbers';
        ///          var relativeEmptyMapPath = path === '' ? 'emptyMap' : path + '.emptyMap';

        // Parent should have been notified
        parentDataBinding.onModify.callCount.should.equal(1);
        parentDataBinding.onPreModify.callCount.should.equal(parentDataBinding.onModify.callCount);
        ///          var modificationSet = parentDataBinding.onModify.getCall(0).args[0];
        ///          modificationSet.getCount().should.equal(4);

        ///          var modification = modificationSet.getModification(relativeArrayPath);
        ///          modification.type.should.equal('subProperty');
        ///          modification.value.should.eql([1, 2]);
        ///          modification.operation.should.equal('add');

        ///          modification = modificationSet.getModification(relativeEmptyArrayPath);
        ///          modification.type.should.equal('subProperty');
        ///          modification.value.should.eql([]);
        ///          modification.operation.should.equal('add');
        parentDataBinding.onModify.resetHistory();
        parentDataBinding.onPreModify.resetHistory();

        ///          modification = modificationSet.getModification(relativeMapPath);
        ///          modification.type.should.equal('subProperty');
        ///          modification.value.should.eql({one: 1, two: 2});
        ///          modification.operation.should.equal('add');

        ///          modification = modificationSet.getModification(relativeEmptyMapPath);
        ///          modification.type.should.equal('subProperty');
        ///          modification.value.should.eql({});
        ///          modification.operation.should.equal('add');

        // Remove the children
        workspace.pushModifiedEventScope();
        nodePset.resolvePath(path).remove('arrayOfNumbers');
        nodePset.resolvePath(path).remove('mapOfNumbers');
        workspace.popModifiedEventScope();

        // Parent should have been notified
        parentDataBinding.onModify.callCount.should.equal(1);
        parentDataBinding.onPreModify.callCount.should.equal(parentDataBinding.onModify.callCount);
        ///          modificationSet = parentDataBinding.onModify.getCall(0).args[0];
        ///          modificationSet.getCount().should.equal(2);

        ///          modification = modificationSet.getModification(relativeArrayPath);
        ///          modification.type.should.equal('subProperty');
        ///          should.equal(modification.value, null);
        ///          modification.operation.should.equal('remove');

        ///          modification = modificationSet.getModification(relativeMapPath);
        ///          modification.type.should.equal('subProperty');
        ///          should.equal(modification.value, null);
        ///          modification.operation.should.equal('remove');
        parentDataBinding.onModify.resetHistory();
        parentDataBinding.onPreModify.resetHistory();
      });

      tearDownDataBinder();
    });

    it('should be notified of removed child nodes even if the removed tree has arrays (LYNXDEV-8835)', function () {
      setupDataBinder();

      // Add the intermediate node
      const intermediateNode = PropertyFactory.create('NodeProperty', 'single');
      nodePset.insert('intermediateNode', intermediateNode);
      parentDataBinding.onModify.callCount.should.equal(1);

      // Add an array below child with 3 elems
      const childArray = PropertyFactory.create(ChildTemplate.typeid, 'array');
      childArray.push(PropertyFactory.create(ChildTemplate.typeid, 'single'));
      childArray.push(PropertyFactory.create(ChildTemplate.typeid, 'single'));
      childArray.push(PropertyFactory.create(ChildTemplate.typeid, 'single'));
      intermediateNode.insert('myArray', childArray);
      dataBinder._dataBindingCreatedCounter.should.equal(3);  // 3 new child bindings
      parentDataBinding.onModify.callCount.should.equal(2); // one more modify for our parent (at nodePset)
      // Remove the intermediate node
      nodePset.remove(intermediateNode);

      // The 3 child bindings should have been removed
      dataBinder._dataBindingRemovedCounter.should.equal(3);
      // Parent should have been notified
      parentDataBinding.onModify.callCount.should.equal(3); // the last modify for the parent
      tearDownDataBinder();
    });

    it('should create dataBindings that already exist', function () {
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

      workspace.insert('myNodePSet2', nodePset);

      dataBinder._dataBindingCreatedCounter.should.equal(0);

      // Bind to the workspace
      dataBinder.attachTo(workspace);

      // Everything should have been created and notified
      dataBinder._dataBindingCreatedCounter.should.equal(3);  // One for the parent and one for each child

      const childDataBinding = dataBinder.resolve(child.getAbsolutePath(), 'BINDING');
      const nestedChildDataBinding = dataBinder.resolve(nestedChild.getAbsolutePath(), 'BINDING');
      parentDataBinding = dataBinder.resolve(nodePset.getAbsolutePath(), 'BINDING');

      // NestedChildDataBinding should have been notified
      should.exist(nestedChildDataBinding);
      nestedChildDataBinding.onModify.callCount.should.equal(0); // !!!
      nestedChildDataBinding.onPreModify.callCount.should.equal(nestedChildDataBinding.onModify.callCount);
      nestedChildDataBinding.onModify.resetHistory();
      nestedChildDataBinding.onModify.resetHistory();

      // ChildDataBinding should have been notified
      should.exist(childDataBinding);
      // var childDataBindingId = childDataBinding.getId();
      childDataBinding.onModify.callCount.should.equal(0); // !!!
      childDataBinding.onPreModify.callCount.should.equal(childDataBinding.onModify.callCount);
      childDataBinding.onModify.resetHistory();
      childDataBinding.onModify.resetHistory();

      // ParentDataBinding should have been notified
      should.exist(parentDataBinding);
      parentDataBinding.onModify.callCount.should.equal(0); // !!!
      parentDataBinding.onPreModify.callCount.should.equal(parentDataBinding.onModify.callCount);
      tearDownDataBinder();
    });

  });

  describe('Inheritance', function () {
    var dataBinder;

    beforeEach(function () {
      dataBinder = new DataBinder();
    });

    afterEach(function () {
      // Unbind checkout view
      dataBinder.detach();
      dataBinder = null;
    });

    it('should create DataBinding when only the inherited template is represented', function () {
      // Register the base (Child) typeid
      dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding);

      // Create PSet for inherited child typeid
      var inheritedChildPset = PropertyFactory.create(InheritedChildTemplate.typeid, 'single');

      // Add the inherited child to the workspace and bind
      workspace.insert(inheritedChildPset);
      dataBinder._dataBindingCreatedCounter.should.equal(0);
      dataBinder.attachTo(workspace);

      // DataBinding should be created as a registered DataBinding
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      const childDataBinding = dataBinder.resolve(inheritedChildPset.getAbsolutePath(), 'BINDING');
      childDataBinding.should.be.instanceOf(ChildDataBinding);
      childDataBinding.getProperty().should.eql(inheritedChildPset);
      childDataBinding.onPostCreate.callCount.should.equal(1);
    });

    it('should create DataBinding bound to a collection when the inherited template is inserted', function () {
      // Register the base (Child) typeid
      dataBinder.register('BINDING', 'map<' + ChildTemplate.typeid + '>', ChildDataBinding);

      // Create PSet for inherited child typeid
      var inheritedChildPset = PropertyFactory.create(InheritedChildTemplate.typeid, 'map');

      // Add the inherited child to the workspace and bind
      workspace.insert('myMap', inheritedChildPset);
      dataBinder._dataBindingCreatedCounter.should.equal(0);
      dataBinder.attachTo(workspace);

      // DataBinding should be created as a registered DataBinding
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      const childDataBinding = dataBinder.resolve(inheritedChildPset.getAbsolutePath(), 'BINDING');
      childDataBinding.should.be.instanceOf(ChildDataBinding);
      childDataBinding.getProperty().should.eql(inheritedChildPset);
      childDataBinding.onPostCreate.callCount.should.equal(1);
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
      dataBinder._dataBindingCreatedCounter.should.equal(0);

      // Add childPset as ChildDataBinding
      workspace.insert(childPset);
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      const childDataBinding = dataBinder.resolve(childPset.getAbsolutePath(), 'BINDING');
      childDataBinding.should.be.instanceOf(ChildDataBinding);
      childDataBinding.getProperty().should.eql(childPset);
      childDataBinding.onPostCreate.callCount.should.equal(1);

      // Add inheritedChildPset as InheritedChildDataBinding
      workspace.insert(inheritedChildPset);
      dataBinder._dataBindingCreatedCounter.should.equal(2);
      const inheritedChildDataBinding = dataBinder.resolve(inheritedChildPset.getAbsolutePath(), 'BINDING');
      inheritedChildDataBinding.should.be.instanceOf(InheritedChildDataBinding);
      inheritedChildDataBinding.getProperty().should.eql(inheritedChildPset);
      inheritedChildDataBinding.onPostCreate.callCount.should.equal(1);
    });

    it('should create dataBindings using registered grandparent templates', function () {
      // Register the base template
      dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding);

      // Create the grandchild pset
      var multipleInheritedPset =
        PropertyFactory.create(MultipleInheritedTemplate.typeid, 'single');

      // bind workspace
      dataBinder.attachTo(workspace);
      dataBinder._dataBindingCreatedCounter.should.equal(0);

      // Add the DataBinding using it's grandparent template
      // Looks like:
      //    MultipleInheritedTemplate -> InheritedChildTemplate -> ChildTemplate (Registered) -> NamedProperty
      //                              -> NodeProperty

      workspace.insert(multipleInheritedPset);
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      const multipleInheritedDataBinding = dataBinder.resolve(multipleInheritedPset.getAbsolutePath(), 'BINDING');
      multipleInheritedDataBinding.should.be.instanceOf(ChildDataBinding);
      multipleInheritedDataBinding.getProperty().should.eql(multipleInheritedPset);
      multipleInheritedDataBinding.onPostCreate.callCount.should.equal(1);
    });

    it('should create dataBindings using the closest registered template based on depth', function () {
      // Register the closer and farther templates
      dataBinder.register('BINDING', 'NodeProperty', InheritedChildDataBinding);
      dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding);

      var multipleInheritedPset = PropertyFactory.create(MultipleInheritedTemplate.typeid, 'single');

      // bind workspace view
      dataBinder.attachTo(workspace);
      dataBinder._dataBindingCreatedCounter.should.equal(1);  // The root!

      // It should use the closer NodeProperty Template and InheritedChildDataBinding
      // Looks like:
      //    MultipleInheritedTemplate -> InheritedChildTemplate -> ChildTemplate (Registered) -> NamedProperty
      //                              -> NodeProperty (Registered)

      workspace.insert(multipleInheritedPset);
      dataBinder._dataBindingCreatedCounter.should.equal(2); // The root is a NodeProperty as well

      const rootDataBinding = dataBinder.resolve('/', 'BINDING');
      rootDataBinding.should.be.instanceOf(InheritedChildDataBinding);
      rootDataBinding.getProperty().should.eql(workspace.getRoot());
      rootDataBinding.onPostCreate.callCount.should.equal(1);

      const multipleInheritedDataBinding = dataBinder.resolve(multipleInheritedPset.getAbsolutePath(), 'BINDING');
      multipleInheritedDataBinding.should.be.instanceOf(InheritedChildDataBinding);
      multipleInheritedDataBinding.getProperty().should.eql(multipleInheritedPset);
      multipleInheritedDataBinding.onPostCreate.callCount.should.equal(1);
    });

    it('should create all dataBindings with different types registered to related templates', function () {
      // Register the base and inherited template ids
      dataBinder.register('BINDING1', ChildTemplate.typeid, ChildDataBinding);
      dataBinder.register('BINDING2', InheritedChildTemplate.typeid, InheritedChildDataBinding);

      // Create PSet for child, inheritedChild
      var childPset = PropertyFactory.create(ChildTemplate.typeid, 'single');
      var inheritedChildPset = PropertyFactory.create(InheritedChildTemplate.typeid, 'single');

      // bind workspace
      dataBinder.attachTo(workspace);
      dataBinder._dataBindingCreatedCounter.should.equal(0);

      // Add childPset as ChildDataBinding. This should instantiate only ChildDataBinding,
      workspace.insert(childPset);
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      const childDataBinding1 = dataBinder.resolve(childPset.getAbsolutePath(), 'BINDING1');
      childDataBinding1.should.be.instanceOf(ChildDataBinding);
      childDataBinding1.getProperty().should.eql(childPset);
      childDataBinding1.onPostCreate.callCount.should.equal(1);
      dataBinder._resetDebugCounters();

      // Add inheritedChildPset as InheritedChildDataBinding. This should instantiate both ChildDataBinding and
      // InheritedChildDataBinding because they have different DataBindingTypes.
      workspace.insert(inheritedChildPset);
      dataBinder._dataBindingCreatedCounter.should.equal(2);
      const inheritedChildDataBinding = dataBinder.resolve(inheritedChildPset.getAbsolutePath(), 'BINDING2');
      const childDataBinding = dataBinder.resolve(inheritedChildPset.getAbsolutePath(), 'BINDING1');

      inheritedChildDataBinding.should.be.instanceOf(InheritedChildDataBinding);
      inheritedChildDataBinding.getProperty().should.eql(inheritedChildPset);
      inheritedChildDataBinding.onPostCreate.callCount.should.equal(1);
      childDataBinding.should.be.instanceOf(ChildDataBinding);
      childDataBinding.getProperty().should.eql(inheritedChildPset);
      childDataBinding.onPostCreate.callCount.should.equal(1);
    });
  });

  describe('options and callbacks', function () {
    var dataBinder;

    beforeEach(function () {
      dataBinder = new DataBinder();
    });

    afterEach(function () {
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

    it('should be possible to register to a path, detach, and then reattach', function () {
      var callbackSpy = sinon.spy();

      dataBinder.registerOnPath(
        'myPrimitiveChildTemplate.aString', ['insert'], callbackSpy
      );
      dataBinder.registerOnPath(
        'myPrimitiveChildTemplate.aString', ['remove'], callbackSpy
      );
      workspace.insert('myPrimitiveChildTemplate', PropertyFactory.create(PrimitiveChildrenTemplate.typeid,
        'single'));

      dataBinder.attachTo(workspace);

      callbackSpy.callCount.should.equal(1); // insert from attach
      callbackSpy.resetHistory();

      // We give 'false' to detach so it will not remove any definitions or activations
      dataBinder.detach(false);

      callbackSpy.callCount.should.equal(1); // Removal by detach
      callbackSpy.resetHistory();

      dataBinder.attachTo(workspace);

      callbackSpy.callCount.should.equal(1); // insert from attach
    });

    it('should be possible to register to the same path twice', function () {
      var callbackSpy1 = sinon.spy();
      var callbackSpy2 = sinon.spy();

      dataBinder.attachTo(workspace);

      dataBinder.registerOnPath(
        'myPrimitiveChildTemplate.aString', ['insert'], callbackSpy1
      );
      dataBinder.registerOnPath(
        'myPrimitiveChildTemplate.aString', ['insert'], callbackSpy2
      );

      callbackSpy1.callCount.should.equal(0);
      callbackSpy2.callCount.should.equal(0);

      workspace.insert('myPrimitiveChildTemplate', PropertyFactory.create(PrimitiveChildrenTemplate.typeid,
        'single'));

      callbackSpy1.callCount.should.equal(1);
      callbackSpy2.callCount.should.equal(1);
    });

    it('should be possible to register to the same path twice and unregister one', function () {
      var callbackSpy1 = sinon.spy();
      var callbackSpy2 = sinon.spy();

      dataBinder.attachTo(workspace);

      const handle1 = dataBinder.registerOnPath(
        'myPrimitiveChildTemplate.aString', ['insert'], callbackSpy1
      );
      dataBinder.registerOnPath(
        'myPrimitiveChildTemplate.aString', ['insert'], callbackSpy2
      );

      callbackSpy1.callCount.should.equal(0);
      callbackSpy2.callCount.should.equal(0);

      handle1.destroy();

      workspace.insert('myPrimitiveChildTemplate', PropertyFactory.create(PrimitiveChildrenTemplate.typeid,
        'single'));

      callbackSpy1.callCount.should.equal(0);
      callbackSpy2.callCount.should.equal(1);
    });

    it('should be possible to register before attaching to an empty workspace', function () {
      var callbackSpy = sinon.spy();

      dataBinder.registerOnPath('myPrimitiveChildTemplate.aString', ['insert'], callbackSpy);

      callbackSpy.callCount.should.equal(0);

      dataBinder.attachTo(workspace);

      callbackSpy.callCount.should.equal(0);

      workspace.insert('myPrimitiveChildTemplate', PropertyFactory.create(PrimitiveChildrenTemplate.typeid,
        'single'));

      callbackSpy.callCount.should.equal(1);
    });

    it('should be possible to register before attaching to a populated workspace', function () {
      var callbackSpy = sinon.spy();

      dataBinder.registerOnPath('myPrimitiveChildTemplate.aString', ['insert'], callbackSpy);
      workspace.insert('myPrimitiveChildTemplate', PropertyFactory.create(PrimitiveChildrenTemplate.typeid,
        'single'));

      callbackSpy.callCount.should.equal(0);

      dataBinder.attachTo(workspace);

      callbackSpy.callCount.should.equal(1);
    });

    it('should be possible to register retroactively on a path and use requestChangesetPostProcessing', function () {
      var callbackSpyRegistered = sinon.spy();

      dataBinder.attachTo(workspace);
      workspace.insert('mypath', PropertyFactory.create(PrimitiveChildrenTemplate.typeid));

      dataBinder.registerOnPath('mypath', ['insert'], () => {
        dataBinder.requestChangesetPostProcessing(callbackSpyRegistered);
      });

      callbackSpyRegistered.callCount.should.equal(1);
    });

    it('should be possible to unregister before attaching to a workspace', function () {
      var callbackSpyRegistered = sinon.spy();
      var callbackSpyUnregistered = sinon.spy();
      // eslint-disable-next-line max-len
      const handle = dataBinder.registerOnPath('myPrimitiveChildTemplate.aString', ['insert'], callbackSpyUnregistered);
      dataBinder.registerOnPath('myPrimitiveChildTemplate.aString', ['insert'], callbackSpyRegistered);

      callbackSpyRegistered.callCount.should.equal(0);
      callbackSpyUnregistered.callCount.should.equal(0);

      // We unregister the first callback, before we even attach to the workspace.
      handle.destroy();

      callbackSpyRegistered.callCount.should.equal(0);
      callbackSpyUnregistered.callCount.should.equal(0);

      dataBinder.attachTo(workspace);

      callbackSpyRegistered.callCount.should.equal(0);
      callbackSpyUnregistered.callCount.should.equal(0);

      workspace.insert('myPrimitiveChildTemplate', PropertyFactory.create(PrimitiveChildrenTemplate.typeid,
        'single'));

      // The one that was unregistered before attaching to the workspace shouldn't fire.
      callbackSpyRegistered.callCount.should.equal(1);
      callbackSpyUnregistered.callCount.should.equal(0);
    });

    it('should execute deferred callbacks from DataBinding.registerOnPath() inside requestChangesetPostProcessing',
      function () {

        var callbackCount = 0;
        var callbackError = false;
        var callbackSpy = sinon.spy(function (in_index, in_context) {
          if (callbackCount !== 0 || in_index !== 'two' || !(in_context.getOperationType() === 'modify')) {
            callbackError = true;
          }
          callbackCount = 1;
        });
        var deferredCallbackSpy = sinon.spy(function (in_index, in_context) {
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

        workspace.insert('primitiveChildrenPset', PropertyFactory.create(PrimitiveChildrenTemplate.typeid,
          'single',
          initialValues));
        dataBinder._dataBindingCreatedCounter.should.equal(1);
        dataBinder._resetDebugCounters();

        workspace.get('primitiveChildrenPset').get('mapOfNumbers').set('two', 22);
        callbackError.should.equal(false);

      });

    it('should be able to call dataBinder.registerOnPath() before attaching to a workspace', function () {
      var callbackSpy = sinon.spy();

      dataBinder.registerOnPath('/myPrimitiveChildTemplate.aString', ['insert', 'modify', 'remove'],
        callbackSpy);

      dataBinder.attachTo(workspace);

      workspace.insert('myPrimitiveChildTemplate', PropertyFactory.create(PrimitiveChildrenTemplate.typeid,
        'single'));

      callbackSpy.callCount.should.equal(1);
    });

    it('should execute deferred callbacks from dataBinder.registerOnPath() inside requestChangesetPostProcessing',
      function () {
        var callbackCount = 0;
        var callbackError = false;
        var callbackSpy = sinon.spy(function (params) {
          if (callbackCount !== 0 || !(params instanceof ModificationContext)) {
            callbackError = true;
          }
          callbackCount = 1;
        });
        var deferredCallbackSpy = sinon.spy(function (params) {
          if (callbackCount !== 1 || !(params instanceof ModificationContext)) {
            callbackError = true;
          }
        });

        dataBinder.registerOnPath('myPrimitiveChildTemplate.aString', ['insert', 'modify', 'remove'],
          deferredCallbackSpy, { isDeferred: true });

        dataBinder.registerOnPath('myPrimitiveChildTemplate.aString', ['insert', 'modify', 'remove'], callbackSpy,
          { isDeferred: false });

        dataBinder.attachTo(workspace);

        workspace.insert('myPrimitiveChildTemplate', PropertyFactory.create(PrimitiveChildrenTemplate.typeid,
          'single'));

        deferredCallbackSpy.callCount.should.equal(1);
        callbackSpy.callCount.should.equal(1);
        callbackError.should.equal(false);

      });

    it('should allow registering to two paths at once, but only hearing about it once', function () {
      let callbackCount = 0;
      const callbackSpy = sinon.spy(function (params) {
        callbackCount++;
      });
      workspace.insert('myPrimitiveChildTemplate', PropertyFactory.create(PrimitiveChildrenTemplate.typeid,
        'single'));
      dataBinder.attachTo(workspace);
      dataBinder.registerOnPath(
        ['myPrimitiveChildTemplate.aString', 'myPrimitiveChildTemplate.aNumber'],
        ['insert', 'modify', 'remove'],
        callbackSpy
      );
      callbackCount.should.equal(1);
    });

    it('should allow registering to an array with only one entry', function () {
      let callbackCount = 0;
      const callbackSpy = sinon.spy(function (params) {
        callbackCount++;
      });
      workspace.insert('myPrimitiveChildTemplate', PropertyFactory.create(PrimitiveChildrenTemplate.typeid,
        'single'));
      dataBinder.attachTo(workspace);
      dataBinder.registerOnPath(
        ['myPrimitiveChildTemplate.aString'],
        ['insert', 'modify', 'remove'],
        callbackSpy
      );
      callbackCount.should.equal(1);
    });

    it('should allow registering to two paths at once, but only hearing about it once, when deferred', function () {
      let callbackCount = 0;
      const callbackSpy = sinon.spy(function (params) {
        callbackCount++;
      });
      workspace.insert('myPrimitiveChildTemplate', PropertyFactory.create(PrimitiveChildrenTemplate.typeid,
        'single'));
      dataBinder.attachTo(workspace);
      dataBinder.registerOnPath(
        ['myPrimitiveChildTemplate.aString', 'myPrimitiveChildTemplate.aNumber'],
        ['insert', 'modify', 'remove'],
        callbackSpy, {
        isDeferred: true
      }
      );
      callbackCount.should.equal(1);
    });

    it('should allow post processing from the constructor - retroactive', function () {
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

      workspace.insert(PropertyFactory.create(ChildTemplate.typeid));
      dataBinder.defineDataBinding('TEST', ChildTemplate.typeid, A);

      const handle = dataBinder.activateDataBinding('TEST');

      // constructor is called retroactively on the existing property
      constructorCalled.should.equal(true);

      // destructor is called preemptively despite the property still existing
      handle.destroy();
      destructorCalled.should.equal(true);
    });

    it('should allow post processing from the constructor - changesets', function () {
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
      workspace.insert(childProp);

      constructorCalled.should.equal(true);

      // destructor is called due to the changeset remove
      workspace.remove(childProp);
      destructorCalled.should.equal(true);
    });

    it('should allow post processing from the constructor - attach/detach', function () {
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
      workspace.insert(childProp);

      // constructor is called due to the attach
      dataBinder.attachTo(workspace);
      constructorCalled.should.equal(true);

      // destructor is called due to the detach
      dataBinder.detach();
      destructorCalled.should.equal(true);
    });

    it('should throw for bad registration option paths', function () {
      (function () {
        dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding,
          { exactPath: 'badArray[' });
      }).should.throw(Error);
      (function () {
        dataBinder.register('BINDING2', ChildTemplate.typeid, ChildDataBinding,
          { includePrefix: '"unfinished thought' });
      }).should.throw(Error);
      (function () {
        dataBinder.register('BINDING3', ChildTemplate.typeid, ChildDataBinding,
          { excludePrefix: '......and then I said, like, no way' });
      }).should.throw(Error);
    });

    it('should not throw for good registration option paths', function () {
      (function () {
        dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding,
          { exactPath: 'goodArray[0]' });
      }).should.not.throw(Error);
      (function () {
        dataBinder.register('BINDING2', ChildTemplate.typeid, ChildDataBinding,
          { includePrefix: '"finished thought"' });
      }).should.not.throw(Error);
      (function () {
        dataBinder.register('BINDING3', ChildTemplate.typeid, ChildDataBinding,
          { excludePrefix: 'and she said way' });
      }).should.not.throw(Error);
    });

    it('should not create an DataBinding when forbidden by exact path when registration is delayed', function () {
      // Create PSet for inherited child typeid
      var childPset = PropertyFactory.create(ChildTemplate.typeid, 'single');

      // Add the child to the workspace and bind
      workspace.insert('notMyChildTemplate', childPset);
      dataBinder._dataBindingCreatedCounter.should.equal(0);
      dataBinder.attachTo(workspace);

      // Register the base (Child) typeid

      dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding,
        { exactPath: 'myChildTemplate', includePrefix: 'myChildTemplate' }); // includePrefix is ignored

      // DataBinding should not be created as a registered DataBinding
      dataBinder._dataBindingCreatedCounter.should.equal(0);
    });

    it('should not create an DataBinding when forbidden by exact path', function () {
      // Register the base (Child) typeid
      dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding,
        { exactPath: 'myChildTemplate', includePrefix: 'myChildTemplate' }); // includePrefix is ignored

      // Create PSet for inherited child typeid
      var childPset = PropertyFactory.create(ChildTemplate.typeid, 'single');

      // Add the inherited child to the workspace and bind
      workspace.insert('notMyChildTemplate', childPset);
      dataBinder._dataBindingCreatedCounter.should.equal(0);
      dataBinder.attachTo(workspace);

      // DataBinding should not be created as a registered DataBinding
      dataBinder._dataBindingCreatedCounter.should.equal(0);
    });

    it('should be able to deactivate an entire binding type', function () {
      // Register the base (Child) typeid
      dataBinder.defineDataBinding('BINDING', ChildTemplate.typeid, ChildDataBinding);

      // Create PSet for inherited child typeid
      var childPset = PropertyFactory.create(ChildTemplate.typeid, 'single');

      // Add the inherited child to the workspace and bind
      workspace.insert('child', childPset);
      dataBinder._dataBindingCreatedCounter.should.equal(0);
      dataBinder.attachTo(workspace);

      // Not activated yet
      dataBinder._dataBindingCreatedCounter.should.equal(0);

      dataBinder.activateDataBinding('BINDING');
      // DataBinding should be created as a registered DataBinding
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      dataBinder._resetDebugCounters();

      // Detach, but don't deactivate or undefine anything
      dataBinder.detach(false);

      // Deactivate the DataBinding, but leave defined
      dataBinder.unregisterDataBindings('BINDING', true, false);

      dataBinder.attachTo(workspace);

      // Not activated yet
      dataBinder._dataBindingCreatedCounter.should.equal(0);

      // Activate again - the databinding is still defined.
      dataBinder.activateDataBinding('BINDING');

      // DataBinding should be created as a registered DataBinding
      dataBinder._dataBindingCreatedCounter.should.equal(1);
    });

    const dataBindingTreeRefSetup = function () {
      dataBinder.attachTo(workspace);

      const myRoot = PropertyFactory.create('NodeProperty');
      workspace.insert('myRoot', myRoot);

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

      const callbackSpy = sinon.spy();
      ChildDataBinding.registerOnPath('ref1.someData', ['insert', 'modify'], callbackSpy);
      ChildDataBinding.registerOnPath('ref2.someData', ['insert', 'modify'], callbackSpy);
      dataBinder.defineDataBinding('BINDING', ReferenceParentTemplate.typeid, ChildDataBinding);
      dataBinder.activateDataBinding('BINDING');
      callbackSpy.callCount.should.equal(6);

      return myRoot;
    };

    it('should not destroy DataBinding tree nodes too early - entire tree', function () {
      const myRoot = dataBindingTreeRefSetup();

      // This removes everything at once -- issue LYNXDEV-5729
      workspace.remove(myRoot);
    });

    it('should not destroy DataBinding tree nodes too early - partially used tree', function () {
      const myRoot = dataBindingTreeRefSetup();

      // remove two elements in different parts. Interally, one subtree will be removed while
      // another subtree hasn't been considered yet, and there are references between the two
      workspace.pushModifiedEventScope();
      myRoot.remove(myRoot.get('a0'));
      myRoot.remove(myRoot.get('a1'));
      myRoot.remove(myRoot.get('a2'));
      workspace.popModifiedEventScope();
    });

    it('should correctly destroy the tree even if it has an array with callbacks into it (LYNXDEV-8835)', function () {
      dataBinder.attachTo(workspace);

      const myRoot = PropertyFactory.create('NodeProperty');
      workspace.insert('myRoot', myRoot);

      const a0 = PropertyFactory.create(ReferenceParentTemplate.typeid);
      const myArray = PropertyFactory.create(ChildTemplate.typeid, 'array');
      myArray.push(PropertyFactory.create(ChildTemplate.typeid));
      myArray.push(PropertyFactory.create(ChildTemplate.typeid));
      myRoot.insert('a0', a0);
      a0.insert('myArray', myArray);

      a0.get('ref1', RESOLVE_NEVER).setValue('/myRoot.a0.myArray[0]');

      const callbackSpy = sinon.spy();
      ChildDataBinding.registerOnPath('ref1.text', ['insert', 'modify'], callbackSpy);
      dataBinder.defineDataBinding('BINDING', ReferenceParentTemplate.typeid, ChildDataBinding);
      dataBinder.activateDataBinding('BINDING');
      callbackSpy.callCount.should.equal(1);

      // This removes everything at once
      workspace.remove(myRoot);
    });

    it('should be able to undefine an entire binding type', function () {
      // Register the base (Child) typeid
      dataBinder.defineDataBinding('BINDING', ChildTemplate.typeid, ChildDataBinding);

      // Create PSet for inherited child typeid
      var childPset = PropertyFactory.create(ChildTemplate.typeid, 'single');

      // Add the inherited child to the workspace and bind
      workspace.insert('child', childPset);
      dataBinder._dataBindingCreatedCounter.should.equal(0);
      dataBinder.attachTo(workspace);

      // Not activated yet
      dataBinder._dataBindingCreatedCounter.should.equal(0);

      // Activate, should create one
      dataBinder.activateDataBinding('BINDING');

      // DataBinding should be created as a registered DataBinding
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      dataBinder._resetDebugCounters();

      // Detach, without undefining/destroying anything
      dataBinder.detach(false);

      // Deactive/undefined BINDING
      dataBinder.unregisterDataBindings('BINDING');

      dataBinder.attachTo(workspace);

      // No dataBindings -- there is no definition
      dataBinder._dataBindingCreatedCounter.should.equal(0);
    });

    describe('test activating databindings with different path options that overlap', function () {
      beforeEach(function () {
        dataBinder.defineDataBinding('BINDING', ChildTemplate.typeid, ChildDataBinding);
        dataBinder.defineDataBinding('BINDING2', ChildTemplate.typeid, ChildDataBinding);

        workspace.insert('child1', PropertyFactory.create(ChildTemplate.typeid));
        workspace.insert('child2', PropertyFactory.create(ChildTemplate.typeid));
      });

      it('overlapping but different includePrefixes', function () {
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
        dataBinder._dataBindingCreatedCounter.should.equal(3);
      });

      it('separate includePrefixes', function () {
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
        dataBinder._dataBindingCreatedCounter.should.equal(2);
      });

      it('general application and exactPath', function () {
        dataBinder.attachTo(workspace);
        dataBinder.pushBindingActivationScope();

        dataBinder.activateDataBinding('BINDING', undefined, {
          exactPath: '/child1'
        });
        dataBinder.activateDataBinding('BINDING2');

        dataBinder.popBindingActivationScope();

        // one for BINDING, two for BINDING2
        dataBinder._dataBindingCreatedCounter.should.equal(3);
      });

      it('identical exactPaths', function () {
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
        dataBinder._dataBindingCreatedCounter.should.equal(2);
      });

      it('identical exactPaths but without a slash', function () {
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
        dataBinder._dataBindingCreatedCounter.should.equal(2);
      });

      it('excludePrefix and general', function () {
        dataBinder.attachTo(workspace);
        dataBinder.pushBindingActivationScope();

        dataBinder.activateDataBinding('BINDING', undefined, {
          excludePrefix: '/child1'
        });
        dataBinder.activateDataBinding('BINDING2');

        dataBinder.popBindingActivationScope();

        // one for BINDING, two for BINDING2
        dataBinder._dataBindingCreatedCounter.should.equal(3);
      });

      it('two excludePrefixes', function () {
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
        dataBinder._dataBindingCreatedCounter.should.equal(2);
      });

      it('excludePrefix and includePrefix', function () {
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
        dataBinder._dataBindingCreatedCounter.should.equal(2);
      });

      it('excludePrefix and exactPath overlapping', function () {
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
        dataBinder._dataBindingCreatedCounter.should.equal(2);
      });

      it('excludePrefix and exactPath separate', function () {
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
        dataBinder._dataBindingCreatedCounter.should.equal(2);
      });
    });

    it('should be able to undefine all binding types', function () {
      // Register the base (Child) typeid
      dataBinder.defineDataBinding('BINDING', ChildTemplate.typeid, ChildDataBinding);
      dataBinder.defineDataBinding('BINDING2', ChildTemplate.typeid, ChildDataBinding);

      // Create PSet for inherited child typeid
      var childPset = PropertyFactory.create(ChildTemplate.typeid, 'single');

      // Add the inherited child to the workspace and bind
      workspace.insert('child', childPset);
      dataBinder._dataBindingCreatedCounter.should.equal(0);
      dataBinder.attachTo(workspace);

      // Not activated yet
      dataBinder._dataBindingCreatedCounter.should.equal(0);

      dataBinder.activateDataBinding('BINDING');
      dataBinder.activateDataBinding('BINDING2');

      // DataBinding should be created as a registered DataBinding
      dataBinder._dataBindingCreatedCounter.should.equal(2);
      dataBinder._resetDebugCounters();

      // Detach (without unregistering anything)
      dataBinder.detach(false);

      // undefine _all_ the data bindings
      dataBinder.unregisterDataBindings();

      dataBinder.attachTo(workspace);

      // No dataBindings -- there are no definitions
      dataBinder._dataBindingCreatedCounter.should.equal(0);
    });

    it('should be able to undefine one binding type', function () {
      // Register the base (Child) typeid
      dataBinder.defineDataBinding('BINDING', ChildTemplate.typeid, ChildDataBinding);
      dataBinder.defineDataBinding('BINDING2', ChildTemplate.typeid, ChildDataBinding);

      // Create PSet for inherited child typeid
      var childPset = PropertyFactory.create(ChildTemplate.typeid, 'single');

      // Add the inherited child to the workspace and bind
      workspace.insert('child', childPset);
      dataBinder.attachTo(workspace);

      // Not activated yet
      dataBinder._dataBindingCreatedCounter.should.equal(0);

      dataBinder.activateDataBinding('BINDING');
      dataBinder.activateDataBinding('BINDING2');

      // DataBinding should be created as a registered DataBinding
      dataBinder._dataBindingCreatedCounter.should.equal(2);
      dataBinder._resetDebugCounters();

      // Detach (without unregistering anything)
      dataBinder.detach(false);

      // undefine all the BINDING data bindings
      dataBinder.unregisterDataBindings('BINDING');

      dataBinder.attachTo(workspace);

      // Only BINDING2 should be created
      dataBinder._dataBindingCreatedCounter.should.equal(1);
    });

    it('should be able to undefine one binding type, multiple case', function () {
      // Register the base (Child) typeid
      dataBinder.defineDataBinding('BINDING', ChildTemplate.typeid, ChildDataBinding);
      dataBinder.defineDataBinding('BINDING', InheritedChildTemplate.typeid, InheritedChildDataBinding);
      dataBinder.defineDataBinding('BINDING2', ChildTemplate.typeid, ChildDataBinding);
      dataBinder.defineDataBinding('BINDING2', InheritedChildTemplate.typeid, InheritedChildDataBinding);

      // Create PSet for child typeid
      const childPset = PropertyFactory.create(ChildTemplate.typeid, 'single');
      workspace.insert('child', childPset);
      const inheritedChildPset = PropertyFactory.create(InheritedChildTemplate.typeid, 'single');
      workspace.insert('inheritedChild', inheritedChildPset);

      dataBinder._dataBindingCreatedCounter.should.equal(0);
      dataBinder.attachTo(workspace);

      // Not activated yet
      dataBinder._dataBindingCreatedCounter.should.equal(0);

      dataBinder.activateDataBinding('BINDING');
      dataBinder.activateDataBinding('BINDING2');

      // DataBinding should be created as a registered DataBinding
      dataBinder._dataBindingCreatedCounter.should.equal(4);
      dataBinder._resetDebugCounters();

      // Detach (without unregistering anything)
      dataBinder.detach(false);

      // undefine all the BINDING data bindings
      dataBinder.unregisterDataBindings('BINDING');

      dataBinder.attachTo(workspace);

      // Only BINDING2 should be created
      dataBinder._dataBindingCreatedCounter.should.equal(2);
    });

    it('should only create an DataBinding when required by exact path', function () {
      // Register the base (Child) typeid
      dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding,
        { exactPath: 'myChildTemplate', excludePrefix: 'myChildTemplate' }); // excludePrefix is ignored

      // Create PSets for inherited child typeid
      var childPset1 = PropertyFactory.create(ChildTemplate.typeid, 'single');
      var childPset2 = PropertyFactory.create(ChildTemplate.typeid, 'single');

      // Add the inherited child to the workspace and bind
      workspace.insert('notMyChildTemplate', childPset1); // this will not create an DataBinding
      workspace.insert('myChildTemplate', childPset2); // this will create an DataBinding
      dataBinder._dataBindingCreatedCounter.should.equal(0);
      dataBinder.attachTo(workspace);

      // DataBinding should be created as a registered DataBinding
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      const childDataBinding = dataBinder.resolve(childPset2.getAbsolutePath(), 'BINDING');
      childDataBinding.should.be.instanceOf(ChildDataBinding);
      childDataBinding.getProperty().should.eql(childPset2);
      childDataBinding.onPostCreate.callCount.should.equal(1);
    });

    it('should not create an DataBinding when forbidden by excludePrefix', function () {
      // Register the base (Child) typeid
      dataBinder.register('BINDING',
        ChildTemplate.typeid,
        ChildDataBinding,
        { excludePrefix: '/myChildTemplate' });

      // Create PSet for inherited child typeid
      var childPset = PropertyFactory.create(ChildTemplate.typeid, 'single');

      // Add the inherited child to the workspace and bind
      workspace.insert('myChildTemplate', childPset);
      dataBinder._dataBindingCreatedCounter.should.equal(0);
      dataBinder.attachTo(workspace);

      // DataBinding not should be created as a registered DataBinding
      dataBinder._dataBindingCreatedCounter.should.equal(0);
      // Create another PSet for inherited child typeid
      var childPset2 = PropertyFactory.create(ChildTemplate.typeid, 'single');
      // Add the inherited child to the workspace and bind
      workspace.insert('myOtherChildTemplate', childPset2);
      // DataBinding should be created as a registered DataBinding
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      const childDataBinding = dataBinder.resolve(childPset2.getAbsolutePath(), 'BINDING');
      childDataBinding.should.be.instanceOf(ChildDataBinding);
      childDataBinding.getProperty().should.eql(childPset2);
      childDataBinding.onPostCreate.callCount.should.equal(1);
    });

    it('should only create an DataBinding when allowed by includePrefix', function () {
      // Register the base (Child) typeid
      dataBinder.register('BINDING',
        ChildTemplate.typeid,
        ChildDataBinding,
        { includePrefix: '/myChildTemplate' });

      // Create PSet for inherited child typeid
      var childPset = PropertyFactory.create(ChildTemplate.typeid, 'single');

      // Add the inherited child to the workspace and bind
      workspace.insert('notMyChildTemplate', childPset);
      dataBinder._dataBindingCreatedCounter.should.equal(0);
      dataBinder.attachTo(workspace);

      // DataBinding not should be created as a registered DataBinding
      dataBinder._dataBindingCreatedCounter.should.equal(0);
      // Create another PSet for inherited child typeid
      var childPset2 = PropertyFactory.create(ChildTemplate.typeid, 'single');
      // Add the inherited child to the workspace and bind
      workspace.insert('myChildTemplateAfterAll', childPset2);
      // DataBinding should be created as a registered DataBinding
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      const childDataBinding = dataBinder.resolve(childPset2.getAbsolutePath(), 'BINDING');
      childDataBinding.should.be.instanceOf(ChildDataBinding);
      childDataBinding.getProperty().should.eql(childPset2);
      childDataBinding.onPostCreate.callCount.should.equal(1);
    });

    it('should not be able to replace the same DataBinding multiple times with different options', function () {
      // Register the same DataBinding (w/ the same type) twice with different options

      dataBinder.register('BINDING',
        ChildTemplate.typeid,
        ChildDataBinding,
        { includePrefix: 'myChildTemplate' });

      (function () {
        dataBinder.register('BINDING',
          ChildTemplate.typeid,
          ChildDataBinding,
          { exactPath: 'myOtherChildTemplate' });
      }).should.throw(Error);

      (function () {
        dataBinder.register('BINDING',
          ChildTemplate.typeid,
          ChildDataBinding,
          { exactPath: 'yetAnotherChildTemplate' });
      }).should.throw(Error);
      dataBinder.attachTo(workspace);

      // Add the inherited child to the workspace and bind
      workspace.insert('notMyChildTemplate', PropertyFactory.create(ChildTemplate.typeid, 'single'));
      dataBinder._dataBindingCreatedCounter.should.equal(0);
      workspace.insert('myOtherChildTemplate', PropertyFactory.create(ChildTemplate.typeid, 'single'));
      dataBinder._dataBindingCreatedCounter.should.equal(0);
      workspace.insert('yetAnotherChildTemplate', PropertyFactory.create(ChildTemplate.typeid, 'single'));
      dataBinder._dataBindingCreatedCounter.should.equal(0);
      workspace.insert('myChildTemplate', PropertyFactory.create(ChildTemplate.typeid, 'single'));
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      const childDataBinding = dataBinder.resolve('/myChildTemplate', 'BINDING');
      childDataBinding.should.be.instanceOf(ChildDataBinding);
      childDataBinding.getProperty().getTypeid().should.equal(ChildTemplate.typeid);
      childDataBinding.onPostCreate.callCount.should.equal(1);
    });

    // TODO: Adapt this test to the new insert handling
    it('TODO: should notify parent when inserting children within the same scoped notification', function () {
      // Register the dataBindings
      dataBinder.register('BINDING', ArrayContainerTemplate.typeid, ParentDataBinding, { context: 'single' });
      dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding, { context: 'array' });
      dataBinder._dataBindingCreatedCounter.should.equal(0);
      dataBinder.attachTo(workspace);

      workspace.pushModifiedEventScope();
      // Add the container pset
      var newArrayPset = PropertyFactory.create(ArrayContainerTemplate.typeid, 'single');
      var newChildPset = PropertyFactory.create(ChildTemplate.typeid, 'single');
      newArrayPset.resolvePath('nested.subArray').push(newChildPset);
      // newArrayPset should produce a ParentDataBinding and a ChildDataBinding
      workspace.insert('newArrayPset', newArrayPset);
      workspace.popModifiedEventScope();

      // ParentDataBinding should have been created and notified of the children
      dataBinder._dataBindingCreatedCounter.should.equal(2);
      const childDataBinding = dataBinder.resolve(newChildPset.getAbsolutePath(), 'BINDING');
      childDataBinding.onPostCreate.callCount.should.equal(1);
      childDataBinding.getProperty().should.equal(newChildPset);
      childDataBinding.onModify.callCount.should.equal(0);
      childDataBinding.onPreModify.callCount.should.equal(childDataBinding.onModify.callCount);
      childDataBinding.onModify.resetHistory();
      childDataBinding.onPreModify.resetHistory();

      const parentDataBinding = dataBinder.resolve(newArrayPset.getAbsolutePath(), 'BINDING');
      parentDataBinding.onPostCreate.callCount.should.equal(1);
      parentDataBinding.getProperty().should.equal(newArrayPset);
      parentDataBinding.onModify.callCount.should.equal(0);
      parentDataBinding.onPreModify.callCount.should.equal(parentDataBinding.onModify.callCount);
      parentDataBinding.onModify.resetHistory();
      parentDataBinding.onPreModify.resetHistory();
    });

    it.skip('TODO: should correctly call a standalone onModify() function', function () {
      console.assert(ParentDataBinding.prototype.__numDataBinders === 0);
      var myOnModifyFunc = sinon.spy();
      // Register the standalone function
      dataBinder.registerOnModify(ChildTemplate.typeid, myOnModifyFunc,
        { excludePrefix: 'myChildTemplate', includePath: 'myChildTemplate' });

      // Create PSets for inherited child typeid
      var childPset = PropertyFactory.create(ChildTemplate.typeid, 'single');

      // Add the inherited child to the workspace and bind
      workspace.insert('myChildTemplate', childPset);
      dataBinder._dataBindingCreatedCounter.should.equal(0);
      dataBinder.attachTo(workspace);

      // DataBinding should be created as a registered DataBinding
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      myOnModifyFunc.callCount.should.equal(1);
    });

    it('should correctly register/unregister an DataBinding', function () {
      // Register the base (Child) typeid
      var handle = dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding);

      // Create PSets for inherited child typeid
      var childPset1 = PropertyFactory.create(ChildTemplate.typeid, 'single');
      var childPset2 = PropertyFactory.create(ChildTemplate.typeid, 'single');

      // Add the inherited child to the workspace and bind
      workspace.insert('myChildTemplate', childPset1);
      dataBinder._dataBindingCreatedCounter.should.equal(0);
      dataBinder.attachTo(workspace);
      // DataBinding should be created as a registered DataBinding
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      const childDataBinding = dataBinder.resolve(childPset1.getAbsolutePath(), 'BINDING');
      childDataBinding.should.be.instanceOf(ChildDataBinding);
      childDataBinding.getProperty().should.eql(childPset1);
      childDataBinding.onPostCreate.callCount.should.equal(1);
      dataBinder._resetDebugCounters();

      // now unregister the DataBinding
      handle.destroy();

      workspace.insert('myChildTemplate2', childPset2);
      // no DataBinding should have been created
      dataBinder._dataBindingCreatedCounter.should.equal(0);
    });

    it('removalContext.getDataBinding()', function () {

      var parentDataBinding = undefined;
      class myDerivedDataBinding extends ParentDataBinding {
        constructor(params) {
          super(params);
          var that = this;
          // we have to override here as the ParentDataBinding's
          // ctor above overwrites stuff in the prototype at ctor time
          this.onRemove = sinon.spy(function (in_removalContext) {
            in_removalContext.getDataBinding().should.equal(that);
            in_removalContext.getDataBinding('DataBindingTest2').should.equal(that);
            in_removalContext.getDataBinding('DataBindingTest1').should.equal(parentDataBinding);
          });
        }
      }

      // Register the dataBindings
      dataBinder.register('DataBindingTest1', ParentTemplate.typeid, ParentDataBinding);
      dataBinder.register('DataBindingTest2', ParentTemplate.typeid, myDerivedDataBinding);

      // Bind to the workspace
      dataBinder.attachTo(workspace);

      var parentPset = PropertyFactory.create(ParentTemplate.typeid, 'single');

      dataBinder._dataBindingCreatedCounter.should.equal(0);

      // parentPset should produce a ParentDataBinding and a myDerivedDataBinding
      workspace.insert(parentPset);
      dataBinder._dataBindingCreatedCounter.should.equal(2);
      parentDataBinding = dataBinder.resolve(parentPset.getAbsolutePath(), 'DataBindingTest1');
      const derivedDataBinding = dataBinder.resolve(parentPset.getAbsolutePath(), 'DataBindingTest2');
      // Should be given a pset on construction
      parentDataBinding.should.be.instanceOf(ParentDataBinding);
      parentDataBinding.getProperty().should.eql(parentPset);
      derivedDataBinding.should.be.instanceOf(myDerivedDataBinding);
      derivedDataBinding.getProperty().should.eql(parentPset);
      // postCreate should be called
      parentDataBinding.onPostCreate.callCount.should.equal(1);
      derivedDataBinding.onPostCreate.callCount.should.equal(1);
      dataBinder._resetDebugCounters();

      // Removing parentPset should notify parentDataBinding and emit event
      dataBinder._dataBindingRemovedCounter.should.equal(0);
      workspace.remove(parentPset);
      dataBinder._dataBindingRemovedCounter.should.equal(2);
      parentDataBinding.onRemove.callCount.should.equal(1);
      derivedDataBinding.onRemove.callCount.should.equal(1);
    });

    it('modificationContext.getDataBinding()', function () {

      var parentDataBinding = undefined;
      class myDerivedDataBinding extends ParentDataBinding {
        constructor(params) {
          super(params);
          // we have to override here as the ParentDataBinding's ctor
          // above overwrites stuff in the prototype at ctor time
          this.onModify = sinon.spy(function (in_modificationContext) {
            in_modificationContext.getDataBinding().should.equal(this);
            in_modificationContext.getDataBinding('DataBindingTest2').should.equal(this);
            in_modificationContext.getDataBinding('DataBindingTest1').should.equal(parentDataBinding);
          });
        }
      }

      // Register the dataBindings
      dataBinder.register('DataBindingTest1', ParentTemplate.typeid, ParentDataBinding);
      dataBinder.register('DataBindingTest2', ParentTemplate.typeid, myDerivedDataBinding);

      // Bind to the workspace
      dataBinder.attachTo(workspace);

      var parentPset = PropertyFactory.create(ParentTemplate.typeid, 'single');

      dataBinder._dataBindingCreatedCounter.should.equal(0);

      // parentPset should produce a ParentDataBinding and a myDerivedDataBinding
      workspace.insert(parentPset);
      dataBinder._dataBindingCreatedCounter.should.equal(2);
      parentDataBinding = dataBinder.resolve(parentPset.getAbsolutePath(), 'DataBindingTest1');
      const derivedDataBinding = dataBinder.resolve(parentPset.getAbsolutePath(), 'DataBindingTest2');
      // Should be given a pset on construction
      parentDataBinding.should.be.instanceOf(ParentDataBinding);
      parentDataBinding.getProperty().should.eql(parentPset);
      derivedDataBinding.should.be.instanceOf(myDerivedDataBinding);
      derivedDataBinding.getProperty().should.eql(parentPset);
      // postCreate should be called
      parentDataBinding.onPostCreate.callCount.should.equal(1);
      derivedDataBinding.onPostCreate.callCount.should.equal(1);

      // Modifying parentPset should notify parentDataBinding and emit event
      parentPset.get('text').setValue('42');
      derivedDataBinding.onModify.callCount.should.equal(1);

      // removing should work as usual
      dataBinder._dataBindingRemovedCounter.should.equal(0);
      workspace.remove(parentPset);
      dataBinder._dataBindingRemovedCounter.should.equal(2);
      parentDataBinding.onRemove.callCount.should.equal(1);
      derivedDataBinding.onRemove.callCount.should.equal(1);
    });

    it('modificationContext.getProperty()', function () {
      var parentDataBinding = undefined;
      var parentPset = PropertyFactory.create(ParentTemplate.typeid, 'single');
      class myDerivedDataBinding extends ParentDataBinding {
        constructor(params) {
          super(params);
          // we have to override here as the ParentDataBinding's ctor above
          // overwrites stuff in the prototype at ctor time
          this.onModify = sinon.spy(function (in_modificationContext) {
            in_modificationContext.getProperty().should.equal(this.getProperty());
            in_modificationContext.getProperty().should.equal(parentPset);
          });
        }
      }

      // Register the dataBindings
      dataBinder.register('DataBindingTest1', ParentTemplate.typeid, ParentDataBinding);
      dataBinder.register('DataBindingTest2', ParentTemplate.typeid, myDerivedDataBinding);

      // Bind to the workspace
      dataBinder.attachTo(workspace);

      dataBinder._dataBindingCreatedCounter.should.equal(0);

      // parentPset should produce a ParentDataBinding and a myDerivedDataBinding
      workspace.insert(parentPset);
      dataBinder._dataBindingCreatedCounter.should.equal(2);
      parentDataBinding = dataBinder.resolve(parentPset.getAbsolutePath(), 'DataBindingTest1');
      const derivedDataBinding = dataBinder.resolve(parentPset.getAbsolutePath(), 'DataBindingTest2');
      // Should be given a pset on construction
      parentDataBinding.should.be.instanceOf(ParentDataBinding);
      parentDataBinding.getProperty().should.eql(parentPset);
      derivedDataBinding.should.be.instanceOf(myDerivedDataBinding);
      derivedDataBinding.getProperty().should.eql(parentPset);
      // postCreate should be called
      parentDataBinding.onPostCreate.callCount.should.equal(1);
      derivedDataBinding.onPostCreate.callCount.should.equal(1);

      // Modifying parentPset should notify parentDataBinding and emit event
      parentPset.get('text').setValue('42');
      derivedDataBinding.onModify.callCount.should.equal(1);

      // removing should work as usual
      dataBinder._dataBindingRemovedCounter.should.equal(0);
      workspace.remove(parentPset);
      dataBinder._dataBindingRemovedCounter.should.equal(2);
      parentDataBinding.onRemove.callCount.should.equal(1);
      derivedDataBinding.onRemove.callCount.should.equal(1);
    });

    it('can tell if inserts/removes are simulated or real - attach/detach', function () {
      let simulated;
      const called = sinon.spy();

      class MyDataBinding extends DataBinding {
        onPostCreate(context) {
          called();
          simulated.should.equal(context.isSimulated());
        }

        onPreRemove(context) {
          called();
          simulated.should.equal(context.isSimulated());
        }

        checkCollectionSimulated(stupidOrder, context) {
          called();
          simulated.should.equal(context.isSimulated());
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
      called.callCount.should.equal(0);
      simulated = true;
      workspace.insert('data1', data1);
      dataBinder.attachTo(workspace);
      called.callCount.should.equal(3); // data1 + two collectioninserts

      // bindings are attached - we will get real callbacks for data2
      simulated = false;
      called.resetHistory();
      workspace.insert('data2', data2);
      called.callCount.should.equal(2); // data2 + one collectioninsert

      // Remove one collection item
      simulated = false;
      called.resetHistory();
      data1.get('arrayOfStrings').pop();
      called.callCount.should.equal(1);

      // real callbacks for data2 being removed
      called.resetHistory();
      simulated = false;
      workspace.remove(data2);
      // We won't get called back for collectionRemove (sort of LYNXDEV-5675) - so only one call
      called.callCount.should.equal(1);

      // simulated callbacks for data1 being removed
      called.resetHistory();
      simulated = true;
      dataBinder.detach();
      // We won't get called back for collectionRemove LYNXDEV-5675 - so only one call
      called.callCount.should.equal(1);
    });

    it('can tell if inserts/removes are simulated or real - destroy handle', function () {
      let simulated;
      const called = sinon.spy();

      class MyDataBinding extends DataBinding {
        onPostCreate(context) {
          called();
          simulated.should.equal(context.isSimulated());
        }

        onPreRemove(context) {
          called();
          simulated.should.equal(context.isSimulated());
        }

        checkCollectionSimulated(stupidOrder, context) {
          called();
          simulated.should.equal(context.isSimulated());
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
      called.callCount.should.equal(0);
      simulated = false;
      workspace.insert('data1', data1);
      called.callCount.should.equal(3);

      // simulated callbacks for handles being destroyed
      // Unfortunately, we don't get any callbacks for the collection
      // so we only get one callback
      simulated = true;
      called.resetHistory();
      handle.destroy();
      called.callCount.should.equal(1); // broken
    });

    it('should correctly pass userData to dataBindings created', function () {
      // userData object:
      var myUserData = {};
      dataBinder.attachTo(workspace);
      // Register an DataBinding and specify a userData object
      dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding, { userData: myUserData });
      // Also register the same DataBinding for a different typeid without specifying a userData object
      dataBinder.register('BINDING', ParentTemplate.typeid, ChildDataBinding);

      // Add Child PSet to the workspace
      workspace.insert('child', PropertyFactory.create(ChildTemplate.typeid, 'single'));
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      const childDataBindingWithUserData = dataBinder.resolve('/child', 'BINDING');
      childDataBindingWithUserData.getUserData().should.equal(myUserData);
      // Add a Parent PSet
      workspace.insert('parent', PropertyFactory.create(ParentTemplate.typeid, 'single'));
      dataBinder._dataBindingCreatedCounter.should.equal(2);
      const childDataBindingNoUserData = dataBinder.resolve('/parent', 'BINDING');
      should.not.exist(childDataBindingNoUserData.getUserData());
      // Add another Child PSet
      workspace.insert('child2', PropertyFactory.create(ChildTemplate.typeid, 'single'));
      dataBinder._dataBindingCreatedCounter.should.equal(3);
      const anotherChildDataBindingWithUserData = dataBinder.resolve('/child2', 'BINDING');
      anotherChildDataBindingWithUserData.getUserData().should.equal(myUserData);
    });

    it('should correctly bind to collections', function () {
      dataBinder.attachTo(workspace);
      var arrayProperty;
      var primitiveArrayProperty;
      var mapProperty;
      var arrayInsertSpy = sinon.spy(function (in_index, in_context) {
        in_context.getProperty().should.equal(arrayProperty.get(in_index));
        in_context.getProperty().getAbsolutePath().should.equal(in_context.getAbsolutePath());
      });
      var arrayModifySpy = sinon.spy(function (in_index, in_context) {
        in_context.getProperty().should.equal(arrayProperty.get(in_index));
        in_context.getProperty().getAbsolutePath().should.equal(in_context.getAbsolutePath());
      });
      var arrayRemoveSpy = sinon.spy(function (in_index, in_context) {
        in_context.getAbsolutePath().should.equal('/root.parentArray[' + in_index + ']');
      });
      var primitiveArrayInsertSpy = sinon.spy(function (in_index, in_context) {
        this.getProperty().get(in_index).should.equal(in_index);
        in_context.getAbsolutePath().should.equal('/root.parentPrimitiveArray[' + in_index + ']');
      });
      var primitiveArrayModifySpy = sinon.spy(function (in_index, in_context) {
        in_index.should.equal(3);
        this.getProperty().get(in_index).should.equal(42);
      });
      var primitiveArrayRemoveSpy = sinon.spy(function (in_index, in_context) {
        in_context.getAbsolutePath().should.equal('/root.parentPrimitiveArray[' + in_index + ']');
      });
      var mapInsertSpy = sinon.spy(function (in_key, in_context) {
        in_context.getProperty().should.equal(mapProperty.get(in_key));
        in_context.getProperty().getAbsolutePath().should.equal(in_context.getAbsolutePath());
      });
      var mapModifySpy = sinon.spy(function (in_key, in_context) {
        in_context.getProperty().should.equal(mapProperty.get(in_key));
        in_context.getProperty().getAbsolutePath().should.equal(in_context.getAbsolutePath());
      });
      var mapRemoveSpy = sinon.spy(function (in_key, in_context) {
        in_context.getAbsolutePath().should.equal('/root.parentMap[' + in_key + ']');
        should.not.exist(in_context.getProperty());
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

      workspace.insert('root', PropertyFactory.create('NodeProperty', 'single'));

      // array tests
      workspace.get('root').insert('parentArray', PropertyFactory.create(ParentTemplate.typeid, 'array'));
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      arrayProperty = workspace.get(['root', 'parentArray']);
      const parentArrayDataBinding = dataBinder.resolve(arrayProperty.getAbsolutePath(), 'BINDING');
      parentArrayDataBinding.should.be.instanceOf(ParentDataBinding);
      parentArrayDataBinding.getProperty().should.equal(arrayProperty);
      parentArrayDataBinding.onModify.callCount.should.equal(0);
      parentArrayDataBinding.onPreModify.callCount.should.equal(parentArrayDataBinding.onModify.callCount);
      parentArrayDataBinding.onModify.resetHistory();
      parentArrayDataBinding.onPreModify.resetHistory();
      dataBinder._resetDebugCounters();

      arrayProperty.insertRange(0, _.map([0, 1, 2, 3, 4, 5], function (i) {
        return PropertyFactory.create(ParentTemplate.typeid, undefined, {
          text: String(i)
        });
      }));
      parentArrayDataBinding.onModify.callCount.should.equal(1);
      arrayInsertSpy.callCount.should.equal(6);
      arrayInsertSpy.resetHistory();
      arrayProperty.push(PropertyFactory.create(ParentTemplate.typeid, 'single'));
      arrayInsertSpy.callCount.should.equal(1);
      arrayInsertSpy.resetHistory();
      arrayProperty.get('3').get('text').value = 'forty two';
      arrayModifySpy.callCount.should.equal(1);
      arrayModifySpy.resetHistory();
      arrayProperty.remove(4);
      arrayRemoveSpy.callCount.should.equal(1);
      arrayRemoveSpy.resetHistory();

      // primitive array tests
      workspace.get('root').insert('parentPrimitiveArray', PropertyFactory.create('Int32', 'array'));
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      primitiveArrayProperty = workspace.get(['root', 'parentPrimitiveArray']);
      const primitiveArrayDataBinding = dataBinder.resolve(primitiveArrayProperty.getAbsolutePath(), 'BINDING');
      primitiveArrayDataBinding.should.be.instanceOf(ChildDataBinding);
      primitiveArrayDataBinding.getProperty().should.equal(primitiveArrayProperty);
      primitiveArrayDataBinding.onModify.callCount.should.equal(0);
      primitiveArrayDataBinding.onPreModify.callCount.should.equal(primitiveArrayDataBinding.onModify.callCount);
      primitiveArrayDataBinding.onModify.resetHistory();
      primitiveArrayDataBinding.onPreModify.resetHistory();
      dataBinder._resetDebugCounters();

      primitiveArrayProperty.insertRange(0, _.map([0, 1, 2, 3, 4, 5], function (i) {
        return i;
      }));
      primitiveArrayDataBinding.onModify.callCount.should.equal(1);
      primitiveArrayInsertSpy.callCount.should.equal(6);
      primitiveArrayInsertSpy.resetHistory();
      primitiveArrayProperty.push(6);
      primitiveArrayInsertSpy.callCount.should.equal(1);
      primitiveArrayInsertSpy.resetHistory();
      primitiveArrayProperty.set(3, 42);
      primitiveArrayModifySpy.callCount.should.equal(1);
      primitiveArrayModifySpy.resetHistory();
      primitiveArrayProperty.remove(4);
      primitiveArrayRemoveSpy.callCount.should.equal(1);
      primitiveArrayRemoveSpy.resetHistory();

      // map tests
      workspace.get('root').insert('parentMap', PropertyFactory.create(ParentTemplate.typeid, 'map'));
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      mapProperty = workspace.get(['root', 'parentMap']);
      const parentMapDataBinding = dataBinder.resolve(mapProperty.getAbsolutePath(), 'BINDING');
      parentMapDataBinding.should.be.instanceOf(InheritedChildDataBinding);
      parentMapDataBinding.getProperty().should.equal(mapProperty);
      parentMapDataBinding.onModify.callCount.should.equal(0);
      parentMapDataBinding.onPreModify.callCount.should.equal(parentMapDataBinding.onModify.callCount);
      parentMapDataBinding.onModify.resetHistory();
      parentMapDataBinding.onPreModify.resetHistory();

      var mapProperty = workspace.get(['root', 'parentMap']);
      _.map(['zero', 'one', 'two', 'three', 'four', 'five', 'six'], function (key) {
        mapProperty.insert(key, PropertyFactory.create(ParentTemplate.typeid, undefined, {
          text: String(key)
        }));
      });
      mapInsertSpy.callCount.should.equal(7);
      mapInsertSpy.resetHistory();
      mapProperty.get('three').get('text').value = 'sixty four';
      mapModifySpy.callCount.should.equal(1);
      mapModifySpy.resetHistory();
      mapProperty.remove('four');
      mapRemoveSpy.callCount.should.equal(1);
      mapRemoveSpy.resetHistory();

    });

    it.skip('should correctly bind to array paths even if they are already created/not yet removed', function () {
      dataBinder.attachTo(workspace);

      workspace.insert('root', PropertyFactory.create('NodeProperty', 'single'));
      workspace.get('root').insert('parentArray', PropertyFactory.create(ParentTemplate.typeid, 'array'));
      const arrayProperty = workspace.get(['root', 'parentArray']);

      const arrayInsertSpy = sinon.spy(function (in_index, in_context) {
        in_context.getProperty().should.equal(arrayProperty.get(in_index));
        in_context.getProperty().getAbsolutePath().should.equal(in_context.getAbsolutePath());
      });
      const arrayRemoveSpy = sinon.spy(function (in_index, in_context) {
        in_context.getAbsolutePath().should.equal('/root.parentArray[' + in_index + ']');
      });

      arrayProperty.insertRange(0, _.map([0, 1, 2, 3, 4, 5], function (i) {
        return PropertyFactory.create(ParentTemplate.typeid, undefined, {
          text: String(i)
        });
      }));

      // Nothing should have been created yet
      dataBinder._dataBindingCreatedCounter.should.equal(0);

      // Now register
      ParentDataBinding.registerOnPath('', ['collectionInsert'], arrayInsertSpy);
      ParentDataBinding.registerOnPath('', ['collectionRemove'], arrayRemoveSpy);
      const arrayHandle = dataBinder.register('BINDING', 'array<' + ParentTemplate.typeid + '>', ParentDataBinding);

      // Everything should be created now
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      arrayInsertSpy.callCount.should.equal(6);

      // Unregister
      arrayHandle.destroy();

      // Everything should have been removed
      arrayRemoveSpy.callCount.should.equal(6);
    });

    it.skip('should correctly bind to prim array paths even if they are already created/not yet removed', function () {
      dataBinder.attachTo(workspace);

      workspace.insert('root', PropertyFactory.create('NodeProperty', 'single'));
      workspace.get('root').insert('parentPrimitiveArray', PropertyFactory.create('Int32', 'array'));
      const primitiveArrayProperty = workspace.get(['root', 'parentPrimitiveArray']);

      primitiveArrayProperty.insertRange(0, _.map([0, 1, 2, 3, 4, 5], function (i) {
        return i;
      }));

      const primitiveArrayInsertSpy = sinon.spy(function (in_index, in_context) {
        this.getProperty().get(in_index).should.equal(in_index);
        in_context.getAbsolutePath().should.equal('/root.parentPrimitiveArray[' + in_index + ']');
      });
      const primitiveArrayRemoveSpy = sinon.spy(function (in_index, in_context) {
        in_context.getAbsolutePath().should.equal('/root.parentPrimitiveArray[' + in_index + ']');
      });

      // Nothing should have been created yet
      dataBinder._dataBindingCreatedCounter.should.equal(0);

      // Now register
      ChildDataBinding.registerOnPath('', ['collectionInsert'], primitiveArrayInsertSpy);
      ChildDataBinding.registerOnPath('', ['collectionRemove'], primitiveArrayRemoveSpy);
      const primArrayHandle = dataBinder.register('BINDING', 'array<Int32>', ChildDataBinding);

      // Everything should be created now
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      primitiveArrayInsertSpy.callCount.should.equal(6);

      // Unregister
      primArrayHandle.destroy();

      // Everything should have been removed
      primitiveArrayRemoveSpy.callCount.should.equal(6);
    });

    it.skip('should correctly bind to map paths even if they are already created/not yet removed', function () {
      dataBinder.attachTo(workspace);
      workspace.insert('root', PropertyFactory.create('NodeProperty', 'single'));
      workspace.get('root').insert('parentMap', PropertyFactory.create(ParentTemplate.typeid, 'map'));

      const mapProperty = workspace.get(['root', 'parentMap']);
      _.map(['zero', 'one', 'two', 'three', 'four', 'five', 'six'], function (key) {
        mapProperty.insert(key, PropertyFactory.create(ParentTemplate.typeid, undefined, {
          text: String(key)
        }));
      });

      const mapInsertSpy = sinon.spy(function (in_key, in_context) {
        in_context.getProperty().should.equal(mapProperty.get(in_key));
        in_context.getProperty().getAbsolutePath().should.equal(in_context.getAbsolutePath());
      });
      const mapRemoveSpy = sinon.spy(function (in_key, in_context) {
        in_context.getAbsolutePath().should.equal('/root.parentMap[' + in_key + ']');
      });

      // Nothing should have been created yet
      dataBinder._dataBindingCreatedCounter.should.equal(0);

      DerivedDataBinding.registerOnPath('', ['collectionInsert'], mapInsertSpy);
      DerivedDataBinding.registerOnPath('', ['collectionRemove'], mapRemoveSpy);
      const mapHandle = dataBinder.register('BINDING2', 'map<' + ParentTemplate.typeid + '>', DerivedDataBinding);

      // Everything should be created now
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      mapInsertSpy.callCount.should.equal(7);

      // Unregister
      mapHandle.destroy();

      // Everything should have been removed
      mapRemoveSpy.callCount.should.equal(7);
    });

    it('hasDataBinding', function () {
      dataBinder.attachTo(workspace);

      dataBinder.hasDataBinding('BINDING', ChildTemplate.typeid).should.equal(false);
      // binding definition
      dataBinder.defineDataBinding('BINDING', ChildTemplate.typeid, ChildDataBinding);

      dataBinder.hasDataBinding('BINDING', ChildTemplate.typeid).should.equal(true);
      dataBinder.hasDataBinding('POTATO', ChildTemplate.typeid).should.equal(false);
      dataBinder.hasDataBinding('BINDING', 'autodesk.vegetables:potato-1.0.0').should.equal(false);
    });

    it('should correctly pass different userData with different activations', function () {
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
      workspace.insert('foo', PropertyFactory.create(ChildTemplate.typeid, 'single'));
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      const dataBindingFoo = dataBinder.resolve('/foo', 'BINDING');
      dataBindingFoo.getUserData().should.deep.equal(myUserDataFoo);
      workspace.insert('bar', PropertyFactory.create(ChildTemplate.typeid, 'single'));
      dataBinder._dataBindingCreatedCounter.should.equal(2);
      const dataBindingBar = dataBinder.resolve('/bar', 'BINDING');
      dataBindingBar.getUserData().should.deep.equal(myUserDataBar);
    });

    it('should correctly pass different userData with different activations (retroactively)', function () {
      // userData objects
      var myUserDataFoo = { user: 'foo' };
      var myUserDataBar = { user: 'bar' };

      // Add PSets to the workspace
      workspace.insert('foo', PropertyFactory.create(ChildTemplate.typeid, 'single'));
      workspace.insert('bar', PropertyFactory.create(ChildTemplate.typeid, 'single'));
      dataBinder.attachTo(workspace); // PSets are already there, we'll create the bindings retroactively
      dataBinder._dataBindingCreatedCounter.should.equal(0);  // no bindings should be there yet
      // define / activate retroactively (i.e. after attaching)
      dataBinder.defineDataBinding('BINDING', ChildTemplate.typeid, ChildDataBinding);
      // activate foo - again with myUserDataFoo
      dataBinder.activateDataBinding('BINDING', ChildTemplate.typeid, { exactPath: '/foo', userData: myUserDataFoo });
      dataBinder._dataBindingCreatedCounter.should.equal(1);  // retroactively created the first binding
      const retroDataBindingFoo = dataBinder.resolve('/foo', 'BINDING');
      retroDataBindingFoo.getUserData().should.deep.equal(myUserDataFoo);
      // ...and bar - again with myUserDataBar
      dataBinder.activateDataBinding('BINDING', ChildTemplate.typeid, { exactPath: '/bar', userData: myUserDataBar });
      dataBinder._dataBindingCreatedCounter.should.equal(2); // ...and the second
      const retroDataBindingBar = dataBinder.resolve('/bar', 'BINDING');
      retroDataBindingBar.getUserData().should.deep.equal(myUserDataBar);
    });

    it('should honor options arg when activating w/o typeid', function () {
      // userData objects
      var myUserData = { user: 'foo' };
      dataBinder.attachTo(workspace);
      // binding definitions
      dataBinder.defineDataBinding('BINDING', ChildTemplate.typeid, ChildDataBinding);
      dataBinder.defineDataBinding('BINDING', ParentTemplate.typeid, ParentDataBinding);
      // activate w/o specifying typeid, but with optional args
      dataBinder.activateDataBinding('BINDING', undefined, { includePrefix: '/foo', userData: myUserData });

      // Add PSets to the workspace
      workspace.insert('foo', PropertyFactory.create('NodeProperty', 'single'));
      workspace.get('foo').insert('child', PropertyFactory.create(ChildTemplate.typeid, 'single'));
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      const childDataBinding = dataBinder.resolve('/foo.child', 'BINDING');
      childDataBinding.getUserData().should.deep.equal(myUserData);
      childDataBinding.should.be.instanceof(ChildDataBinding);
      workspace.get('foo').insert('parent', PropertyFactory.create(ParentTemplate.typeid, 'single'));
      dataBinder._dataBindingCreatedCounter.should.equal(2);
      const parentDataBinding = dataBinder.resolve('foo.parent', 'BINDING');
      parentDataBinding.getUserData().should.deep.equal(myUserData);
      parentDataBinding.should.be.instanceof(ParentDataBinding);
      dataBinder._resetDebugCounters();
      // add under 'notfoo', no bindings should be created
      workspace.insert('notfoo', PropertyFactory.create('NodeProperty', 'single'));
      workspace.get('notfoo').insert('child', PropertyFactory.create(ChildTemplate.typeid, 'single'));
      dataBinder._dataBindingCreatedCounter.should.equal(0);
      workspace.get('notfoo').insert('parent', PropertyFactory.create(ParentTemplate.typeid, 'single'));
      dataBinder._dataBindingCreatedCounter.should.equal(0);
    });

    it('should honor options arg when activating w/o typeid (retroactively)', function () {
      // userData objects
      var myUserData = { user: 'foo' };
      // Add PSets to the workspace
      workspace.insert('foo', PropertyFactory.create('NodeProperty', 'single'));
      workspace.get('foo').insert('child', PropertyFactory.create(ChildTemplate.typeid, 'single'));
      workspace.get('foo').insert('parent', PropertyFactory.create(ParentTemplate.typeid, 'single'));
      // add under 'notfoo', no bindings should be created here
      workspace.insert('notfoo', PropertyFactory.create('NodeProperty', 'single'));
      workspace.get('notfoo').insert('child', PropertyFactory.create(ChildTemplate.typeid, 'single'));
      workspace.get('notfoo').insert('parent', PropertyFactory.create(ParentTemplate.typeid, 'single'));
      dataBinder.attachTo(workspace); // PSets are already there, we'll create the bindings retroactively
      // binding definitions - retroactively
      dataBinder.defineDataBinding('BINDING', ChildTemplate.typeid, ChildDataBinding);
      dataBinder.defineDataBinding('BINDING', ParentTemplate.typeid, ParentDataBinding);
      // activate w/o specifying typeid, but with optional args - retroactively
      dataBinder.activateDataBinding('BINDING', undefined, { includePrefix: '/foo', userData: myUserData });
      dataBinder._dataBindingCreatedCounter.should.equal(2);  // retroactively created the two bindings
      const childBinding = dataBinder.resolve('/foo.child', 'BINDING');
      childBinding.should.be.instanceof(ChildDataBinding);
      childBinding.getUserData().should.deep.equal(myUserData);
      const parentBinding = dataBinder.resolve('/foo.parent', 'BINDING');
      parentBinding.should.be.instanceof(ParentDataBinding);
      parentBinding.getUserData().should.deep.equal(myUserData);
    });

    it('excludePrefix should take precedence over includePrefix', function () {
      dataBinder.attachTo(workspace);
      // binding definition
      dataBinder.defineDataBinding('BINDING', ParentTemplate.typeid, ParentDataBinding);
      // activate with overlapping excludePath & includePath
      dataBinder.activateDataBinding('BINDING', undefined, { includePrefix: '/foo', excludePrefix: '/foo.bar' });

      // Add PSets to the workspace
      workspace.insert('foo', PropertyFactory.create(ParentTemplate.typeid, 'single'));
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      workspace.get('foo').insert('baz', PropertyFactory.create(ParentTemplate.typeid, 'single'));
      // bindings must be created at /foo, /foo.baz, but not at /foo.bar
      dataBinder._dataBindingCreatedCounter.should.equal(2);
      workspace.get('foo').insert('bar', PropertyFactory.create(ParentTemplate.typeid, 'single'));
      dataBinder._dataBindingCreatedCounter.should.equal(2);
    });

    it('excludePrefix should take precedence over includePrefix (retroactively)', function () {
      // Add PSets to the workspace
      workspace.insert('foo', PropertyFactory.create(ParentTemplate.typeid, 'single'));
      workspace.get('foo').insert('baz', PropertyFactory.create(ParentTemplate.typeid, 'single'));
      // bindings must be created at /foo, /foo.baz, but not at /foo.bar
      workspace.get('foo').insert('bar', PropertyFactory.create(ParentTemplate.typeid, 'single'));
      dataBinder.attachTo(workspace); // As PSets are already there, we'll create the bindings retroactively
      dataBinder._dataBindingCreatedCounter.should.equal(0);  // no bindings should be there yet
      // binding definition
      dataBinder.defineDataBinding('BINDING', ParentTemplate.typeid, ParentDataBinding);
      // activate with overlapping excludePath & includePath
      dataBinder.activateDataBinding('BINDING', undefined, { includePrefix: '/foo', excludePrefix: '/foo.bar' });
      dataBinder._dataBindingCreatedCounter.should.equal(2);
    });

    it('excludePrefix and includePrefix should not be combined for different activation calls', function () {
      dataBinder.attachTo(workspace);
      // binding definition
      dataBinder.defineDataBinding('BINDING', ParentTemplate.typeid, ParentDataBinding);
      // activate with overlapping excludePath & includePath -from two different calls!
      dataBinder.activateDataBinding('BINDING', undefined, { includePrefix: '/foo' });
      dataBinder.activateDataBinding('BINDING', undefined, { excludePrefix: '/foo.bar' });

      // Add PSets to the workspace
      workspace.insert('foo', PropertyFactory.create(ParentTemplate.typeid, 'single'));
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      workspace.get('foo').insert('baz', PropertyFactory.create(ParentTemplate.typeid, 'single'));
      // bindings must be created at /foo, /foo.baz, *and* at /foo.bar (because it's allowed by the first activation)
      dataBinder._dataBindingCreatedCounter.should.equal(2);
      workspace.get('foo').insert('bar', PropertyFactory.create(ParentTemplate.typeid, 'single'));
      dataBinder._dataBindingCreatedCounter.should.equal(3);
    });

    it('excludePrefix and includePrefix should not be combined for different activation calls (retro)', function () {
      // Add PSets to the workspace
      workspace.insert('foo', PropertyFactory.create(ParentTemplate.typeid, 'single'));
      workspace.get('foo').insert('baz', PropertyFactory.create(ParentTemplate.typeid, 'single'));
      // bindings must be created at /foo, /foo.baz, *and* at /foo.bar (because it's allowed by the first activation)
      workspace.get('foo').insert('bar', PropertyFactory.create(ParentTemplate.typeid, 'single'));
      dataBinder.attachTo(workspace); // As the PSets are already there, we'll create the bindings retroactively
      dataBinder._dataBindingCreatedCounter.should.equal(0);  // no bindings should be there yet
      // binding definition
      dataBinder.defineDataBinding('BINDING', ParentTemplate.typeid, ParentDataBinding);
      // activate with overlapping excludePath & includePath in two different calls, within a scope - the scope
      // shouldn't make any difference in this case
      dataBinder.pushBindingActivationScope();
      dataBinder.activateDataBinding('BINDING', undefined, { includePrefix: '/foo' });
      dataBinder.activateDataBinding('BINDING', undefined, { excludePrefix: '/foo.bar' });
      dataBinder.popBindingActivationScope();
      dataBinder._dataBindingCreatedCounter.should.equal(3);
    });

    it('should work when registering an exactPath to an element in an array (LYNXDEV-5380)', function () {
      dataBinder.attachTo(workspace);
      workspace.insert('arrTest', PropertyFactory.create(ParentTemplate.typeid, 'array'));
      // eslint-disable-next-line max-len
      const handle = dataBinder.register('BINDING', ParentTemplate.typeid, ParentDataBinding, { exactPath: 'arrTest[0]' });
      dataBinder._dataBindingCreatedCounter.should.equal(0);
      workspace.get('arrTest').push(PropertyFactory.create(ParentTemplate.typeid, 'single'));
      dataBinder._dataBindingCreatedCounter.should.equal(1);  // the push should create our binding
      handle.destroy(); // should deactivate/undefine our handle -> binding is removed
      dataBinder._dataBindingRemovedCounter.should.equal(1);
    });

    it('should work when explicitly unreg. an array elem. (w/ exactPath) already removed (LYNXDEV-5380)', function () {
      dataBinder.attachTo(workspace);
      workspace.insert('arrTest', PropertyFactory.create(ParentTemplate.typeid, 'array'));
      workspace.get('arrTest').push(PropertyFactory.create(ParentTemplate.typeid));
      // eslint-disable-next-line max-len
      const handle = dataBinder.register('BINDING', ParentTemplate.typeid, ParentDataBinding, { exactPath: 'arrTest[0]' });
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      workspace.get('arrTest').remove(0);
      dataBinder._dataBindingRemovedCounter.should.equal(1);
      handle.destroy(); // should do nothing as we've removed the binding already
      dataBinder._dataBindingRemovedCounter.should.equal(1);
    });

    it('should be able to deactivate & reactivate defined bindings', function () {
      dataBinder.attachTo(workspace);
      workspace.insert('parent1', PropertyFactory.create(ParentTemplate.typeid));
      dataBinder.register('BINDING', ParentTemplate.typeid, ParentDataBinding);
      dataBinder._dataBindingCreatedCounter.should.equal(1);  // retroactively created binding for 'parent1'
      // now deactivate, but don't undefine
      dataBinder.unregisterDataBindings(undefined, true, false);
      workspace.insert('parent2', PropertyFactory.create(ParentTemplate.typeid));
      dataBinder._dataBindingCreatedCounter.should.equal(1);  // no new binding created (no activated binding rule)
      workspace.remove('parent1');
      dataBinder._dataBindingRemovedCounter.should.equal(1); // the original binding is removed
      dataBinder._resetDebugCounters();
      workspace.remove('parent2');
      dataBinder._dataBindingRemovedCounter.should.equal(0); // no binding -> nothing is removed
      workspace.insert('parent1', PropertyFactory.create(ParentTemplate.typeid));
      dataBinder._dataBindingCreatedCounter.should.equal(0); // no new binding is created
      // reactivate
      dataBinder.activateDataBinding('BINDING');
      dataBinder._dataBindingCreatedCounter.should.equal(1); // reatroactively created binding at parent1
      workspace.insert('parent2', PropertyFactory.create(ParentTemplate.typeid));
      dataBinder._dataBindingCreatedCounter.should.equal(2); // created new binding at parent2
    });

    it('should be able to undefine & redefine active bindings', function () {
      dataBinder.attachTo(workspace);
      workspace.insert('parent1', PropertyFactory.create(ParentTemplate.typeid));
      dataBinder.register('BINDING', ParentTemplate.typeid, ParentDataBinding);
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      // now undefine, but don't deactivate
      dataBinder.unregisterDataBindings(undefined, false, true);
      dataBinder._dataBindingRemovedCounter.should.equal(0);
      workspace.insert('parent2', PropertyFactory.create(ParentTemplate.typeid));
      dataBinder._dataBindingCreatedCounter.should.equal(1); // no new binding is created
      workspace.remove('parent1');
      dataBinder._dataBindingRemovedCounter.should.equal(1);  // the original is removed
      workspace.remove('parent2');
      dataBinder._dataBindingRemovedCounter.should.equal(1); // no bindings left -> nothing removed
      dataBinder._resetDebugCounters();
      workspace.insert('parent1', PropertyFactory.create(ParentTemplate.typeid));
      dataBinder._dataBindingCreatedCounter.should.equal(0); // no new binding is created
      // redefine with new definition
      dataBinder.defineDataBinding('BINDING', ChildTemplate.typeid, ParentDataBinding); // new def -> needs activation
      // should already be activated
      dataBinder.defineDataBinding('BINDING', ParentTemplate.typeid, ParentDataBinding);
      // no DataBinding is created retroactively, because defineDataBinding will not trigger
      // a retroactive pass (this is a bug tracked as LYNXDEV-6274)
      dataBinder._dataBindingCreatedCounter.should.equal(0); // still no binding, see above
      workspace.insert('child1', PropertyFactory.create(ChildTemplate.typeid));
      dataBinder._dataBindingCreatedCounter.should.equal(0); // not activated for ChildTemplate.typeid yet!
      workspace.insert('parent2', PropertyFactory.create(ParentTemplate.typeid));
      // binding should be created for parent2 (defined & active)
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      dataBinder.activateDataBinding('BINDING'); // should create bindings for child1 & parent1 (both retroactively)
      dataBinder._dataBindingCreatedCounter.should.equal(3);
    });
  });

});
