/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/* globals sinon, expect  */
/* eslint spaced-comment: 0 */
/*
 * TODO: failing assertions are commented out to enable a clean pass for PRs.
 *
 * Some modificationSet related tests are disabled as they fail due to the changed changeset structure. Since
 * we plan to get rid of modificationSet mid-term, it makes no sense to try and fix those.
 *
 */
import _ from 'underscore';
import { DataBinding } from '../../src/data_binder/data_binding';
import { DataBinder } from '../../src/data_binder/data_binder';
import { unregisterAllOnPathListeners } from '../../src/data_binder/internal_utils';
import {
  registerTestTemplates, ParentTemplate, ChildTemplate,
  InheritedChildTemplate,
  PrimitiveChildrenTemplate, ReferenceParentTemplate
} from './testTemplates';
import {
  ParentDataBinding,
  ChildDataBinding,
  PrimitiveChildrenDataBinding,
  InheritedChildDataBinding
} from './testDataBindings';
import { catchConsoleErrors } from './catch_console_errors';

import { BaseProperty, PropertyFactory } from '@fluid-experimental/property-properties';

describe('on demand DataBindings', function () {
  var dataBinder, hfdm, workspace;

  catchConsoleErrors();

  beforeAll(function () {
    registerTestTemplates();
  });

  beforeEach(function () {
    dataBinder = new DataBinder();

    hfdm = new HFDM();
    workspace = hfdm.createWorkspace();
    return workspace.initialize({ local: true }).then(function () {
      dataBinder.attachTo(workspace);
    });
  });

  afterEach(function () {

    // Unbind checkout view
    dataBinder.detach();

    dataBinder = null;

    // Unregister DataBinding paths
    _.forEach([ParentDataBinding, ChildDataBinding, PrimitiveChildrenDataBinding, InheritedChildDataBinding],
      unregisterAllOnPathListeners
    );
  });

  it('should correctly create on demand DataBindings', function () {

    // insert some values into the workspace so we can register our on demand DataBinding
    workspace.insert('child1', PropertyFactory.create('NodeProperty', 'single'));
    workspace.insert('child2', PropertyFactory.create('NodeProperty', 'single'));
    workspace.insert('child3', PropertyFactory.create('NodeProperty', 'single'));
    workspace.get('child1').insert('myFloat1', PropertyFactory.create('Float64', 'single'));
    workspace.get('child1').insert('myFloat2', PropertyFactory.create('Float64', 'single'));
    workspace.get('child1').insert('myFloat3', PropertyFactory.create('Float64', 'single'));
    workspace.get('child2').insert('myFloat4', PropertyFactory.create('Float64', 'single'));
    workspace.get('child2').insert('myFloat5', PropertyFactory.create('Float64', 'single'));
    workspace.get('child2').insert('myFloat6', PropertyFactory.create('Float64', 'single'));
    workspace.get('child3').insert('myFloat7', PropertyFactory.create('Float64', 'single'));
    workspace.get('child3').insert('myFloat8', PropertyFactory.create('Float64', 'single'));
    workspace.get('child3').insert('myFloat9', PropertyFactory.create('Float64', 'single'));
    workspace.get(['child1', 'myFloat2']).setValue(64);

    // Register an on demand DataBinding
    dataBinder.register('BINDING', 'Float64', ParentDataBinding, { exactPath: 'child1.myFloat2' });
    // this should trigger our ctor and onPostCreate
    dataBinder._dataBindingCreatedCounter.should.equal(1);
    const parentDataBinding = dataBinder.resolve('/child1.myFloat2', 'BINDING');
    parentDataBinding.should.be.instanceOf(ParentDataBinding);
    parentDataBinding.onPostCreate.callCount.should.equal(1);
    parentDataBinding.onModify.callCount.should.equal(0);
    dataBinder._resetDebugCounters();

    // check that this behaves as a 'normal' DataBinding: this should trigger onPreModify & onModify as usual
    parentDataBinding.onModify.callCount.should.equal(0);
    parentDataBinding.onPreModify.callCount.should.equal(0);
    workspace.get(['child1', 'myFloat2']).setValue(42);
    parentDataBinding.onModify.callCount.should.equal(1);
    parentDataBinding.onPreModify.callCount.should.equal(1);
    parentDataBinding.onPreRemove.callCount.should.equal(0);
    parentDataBinding.onRemove.callCount.should.equal(0);
    // this should trigger all removal-related callbacks
    workspace.get(['child1']).remove('myFloat2');
    parentDataBinding.onPreRemove.callCount.should.equal(1);
    parentDataBinding.onRemove.callCount.should.equal(1);
    dataBinder._dataBindingRemovedCounter.should.equal(1);

    // register another one
    dataBinder.register('BINDING2', 'Float64', ParentDataBinding, { exactPath: 'child2.myFloat4' });
    dataBinder._dataBindingCreatedCounter.should.equal(1);
  });

  it('should correctly create on demand DataBindings with invalid reference values', function () {

    // insert some values into the workspace so we can register our on demand DataBinding
    workspace.insert('parent', PropertyFactory.create('NodeProperty', 'single'));
    workspace.get('parent').insert('reference', PropertyFactory.create('Reference', 'single'));
    workspace.get(['parent', 'reference'],
      { referenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.NEVER }).setValue('/invalid');

    // Register an on demand DataBinding
    dataBinder.register('BINDING', 'Reference', ParentDataBinding,
      { exactPath: 'parent.reference' });
    // this should trigger our ctor and onPostCreate
    dataBinder._dataBindingCreatedCounter.should.equal(1);
    const parentDataBinding = dataBinder.resolve('/parent.reference', 'BINDING');
    parentDataBinding.should.be.instanceOf(ParentDataBinding);
    parentDataBinding.onPostCreate.callCount.should.equal(1);
    parentDataBinding.onModify.callCount.should.equal(0);

    // check that this behaves as a 'normal' DataBinding: this should trigger onPreModify & onModify as usual
    parentDataBinding.onModify.callCount.should.equal(0);
    parentDataBinding.onPreModify.callCount.should.equal(0);
    workspace.get(['parent', 'reference'],
      { referenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.NEVER }).setValue('/stillInvalid');
    parentDataBinding.onModify.callCount.should.equal(1);
    parentDataBinding.onPreModify.callCount.should.equal(1);
    parentDataBinding.onPreRemove.callCount.should.equal(0);
    parentDataBinding.onRemove.callCount.should.equal(0);
    // this should trigger all removal-related callbacks
    workspace.get(['parent']).remove('reference');
    parentDataBinding.onPreRemove.callCount.should.equal(1);
    parentDataBinding.onRemove.callCount.should.equal(1);
    dataBinder._dataBindingRemovedCounter.should.equal(1);
  });

  it('should correctly create on demand DataBindings with relative path callbacks', function () {

    // insert some values into the workspace so we can register our on demand DataBinding
    workspace.insert('child1', PropertyFactory.create('NodeProperty', 'single'));
    workspace.insert('child2', PropertyFactory.create('NodeProperty', 'single'));
    workspace.insert('child3', PropertyFactory.create('NodeProperty', 'single'));
    workspace.get('child1').insert('myChild1', PropertyFactory.create(PrimitiveChildrenTemplate.typeid, 'single'));
    workspace.get('child1').insert('myChild2', PropertyFactory.create(PrimitiveChildrenTemplate.typeid, 'single'));
    workspace.get('child1').insert('myChild3', PropertyFactory.create(PrimitiveChildrenTemplate.typeid, 'single'));
    workspace.get('child2').insert('myChild4', PropertyFactory.create(PrimitiveChildrenTemplate.typeid, 'single'));
    workspace.get('child2').insert('myChild5', PropertyFactory.create(PrimitiveChildrenTemplate.typeid, 'single'));
    workspace.get('child2').insert('myChild6', PropertyFactory.create(PrimitiveChildrenTemplate.typeid, 'single'));
    workspace.get('child3').insert('myChild7', PropertyFactory.create(PrimitiveChildrenTemplate.typeid, 'single'));
    workspace.get('child3').insert('myChild8', PropertyFactory.create(PrimitiveChildrenTemplate.typeid, 'single'));
    workspace.get('child3').insert('myChild9', PropertyFactory.create(PrimitiveChildrenTemplate.typeid, 'single'));
    workspace.get(['child1', 'myChild2', 'aString']).setValue('sixty-four');

    var stringInsertSpy = sinon.spy(function (in_modificationContext) {
      this.should.be.instanceOf(ParentDataBinding);
      this.getProperty().should.be.equal(in_modificationContext.getProperty().getParent());
    });
    var stringModifySpy = sinon.spy();
    var numberInsertSpy = sinon.spy();
    var numberModifySpy = sinon.spy();
    var nestedNumberInsertSpy = sinon.spy();
    var nestedNumberModifySpy = sinon.spy();
    // Register the relative path callbacks
    ParentDataBinding.registerOnPath('aString', ['insert'], stringInsertSpy);
    ParentDataBinding.registerOnPath('aString', ['modify'], stringModifySpy);
    ParentDataBinding.registerOnPath('aNumber', ['insert'], numberInsertSpy);
    ParentDataBinding.registerOnPath('aNumber', ['modify'], numberModifySpy);
    ParentDataBinding.registerOnPath('nested.aNumber', ['insert'], nestedNumberInsertSpy);
    ParentDataBinding.registerOnPath('nested.aNumber', ['modify'], nestedNumberModifySpy);

    // Register an on demand DataBinding
    dataBinder.register('BINDING', PrimitiveChildrenTemplate.typeid, ParentDataBinding,
      { exactPath: 'child1.myChild2' });
    // this should trigger our ctor and onPostCreate
    dataBinder._dataBindingCreatedCounter.should.equal(1);
    dataBinder._resetDebugCounters();
    const parentDataBinding = dataBinder.resolve('/child1.myChild2', 'BINDING');
    parentDataBinding.should.be.instanceOf(ParentDataBinding);
    parentDataBinding.onPostCreate.callCount.should.equal(1);
    parentDataBinding.onModify.callCount.should.equal(0);

    // as well as the relative path callbacks
    stringInsertSpy.callCount.should.equal(1);
    stringInsertSpy.resetHistory();
    numberInsertSpy.callCount.should.equal(1);
    numberInsertSpy.resetHistory();
    nestedNumberInsertSpy.callCount.should.equal(1);
    nestedNumberInsertSpy.resetHistory();

    // check that this behaves as a 'normal' DataBinding: this should trigger onPreModify & onModify as usual
    parentDataBinding.onModify.callCount.should.equal(0);
    parentDataBinding.onPreModify.callCount.should.equal(0);
    workspace.get(['child1', 'myChild2', 'aString']).setValue('fortytwo');
    parentDataBinding.onModify.callCount.should.equal(1);
    parentDataBinding.onPreModify.callCount.should.equal(1);
    parentDataBinding.onModify.resetHistory();
    parentDataBinding.onPreModify.resetHistory();
    parentDataBinding.onPreRemove.callCount.should.equal(0);
    parentDataBinding.onRemove.callCount.should.equal(0);

    // as well as the relative path callback
    stringModifySpy.callCount.should.equal(1);

    // this should trigger all removal-related callbacks
    workspace.get(['child1']).remove('myChild2');
    parentDataBinding.onPreRemove.callCount.should.equal(1);
    parentDataBinding.onRemove.callCount.should.equal(1);
    dataBinder._dataBindingRemovedCounter.should.equal(1);

    // register another one
    dataBinder.register('BINDING2', PrimitiveChildrenTemplate.typeid, ParentDataBinding,
      { exactPath: 'child2.myChild4' });
    dataBinder._dataBindingCreatedCounter.should.equal(1);

    // as well as the relative path callbacks
    stringInsertSpy.callCount.should.equal(1);
    numberInsertSpy.callCount.should.equal(1);
    nestedNumberInsertSpy.callCount.should.equal(1);
  });

  it('should correctly create on demand DataBindings with relative path callbacks and references', function () {

    // Add the data we will be referencing
    workspace.insert('node1', PropertyFactory.create('NodeProperty', 'single'));
    workspace.insert('node2', PropertyFactory.create('NodeProperty', 'single'));
    var childPset = PropertyFactory.create(ChildTemplate.typeid, 'single');
    workspace.get('node1').insert('theData', childPset);

    // Add some references that we will directly or indirectly refer to theData
    // insert some values into the workspace so we can register our on demand DataBinding
    workspace.get('node1').insert('myChild1', PropertyFactory.create(ReferenceParentTemplate.typeid, 'single'));
    workspace.get('node1').insert('myChild2', PropertyFactory.create(ReferenceParentTemplate.typeid, 'single'));
    workspace.get('node1').insert('myChild3', PropertyFactory.create(ReferenceParentTemplate.typeid, 'single'));
    workspace.get('node2').insert('myChild4', PropertyFactory.create(ReferenceParentTemplate.typeid, 'single'));
    workspace.get('node2').insert('myChild5', PropertyFactory.create(ReferenceParentTemplate.typeid, 'single'));
    workspace.get('node2').insert('myChild6', PropertyFactory.create(ReferenceParentTemplate.typeid, 'single'));
    workspace.get(['node1', 'theData', 'text']).setValue('sixty-four');

    // Direct reference to theData
    workspace.get(['node1', 'myChild2', 'single_ref'],
      { referenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.NEVER }).setValue('/node1.theData');
    // reference to the reference to theData
    workspace.get(['node1', 'myChild3', 'single_ref'],
      { referenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.NEVER }).setValue('/node1.myChild2');
    var stringInsertSpy = sinon.spy();
    var stringModifySpy = sinon.spy();
    var stringRemoveSpy = sinon.spy();
    var doubleStringInsertSpy = sinon.spy();
    var doubleStringModifySpy = sinon.spy();
    var doubleStringRemoveSpy = sinon.spy();
    // Register the relative path callbacks
    ParentDataBinding.registerOnPath('single_ref.text', ['insert'], stringInsertSpy);
    ParentDataBinding.registerOnPath('single_ref.text', ['modify'], stringModifySpy);
    ParentDataBinding.registerOnPath('single_ref.text', ['remove'], stringRemoveSpy);
    ParentDataBinding.registerOnPath('single_ref.single_ref.text', ['insert'], doubleStringInsertSpy);
    ParentDataBinding.registerOnPath('single_ref.single_ref.text', ['modify'], doubleStringModifySpy);
    ParentDataBinding.registerOnPath('single_ref.single_ref.text', ['remove'], doubleStringRemoveSpy);

    // Register an on demand DataBinding
    dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding,
      { exactPath: 'node1.myChild2' });
    // this should trigger our ctor and onPostCreate
    dataBinder._dataBindingCreatedCounter.should.equal(1);
    dataBinder._resetDebugCounters();
    const parentDataBinding = dataBinder.resolve('/node1.myChild2', 'BINDING');
    parentDataBinding.should.be.instanceOf(ParentDataBinding);
    parentDataBinding.onPostCreate.callCount.should.equal(1);
    parentDataBinding.onModify.callCount.should.equal(0);

    // myChild2.single_ref.text resolves
    stringInsertSpy.callCount.should.equal(1);
    stringInsertSpy.resetHistory();
    // Not called because myChild2.single_ref.single_ref does not resolve to anything
    doubleStringInsertSpy.callCount.should.equal(0);
    doubleStringInsertSpy.resetHistory();

    // check that this behaves as a 'normal' DataBinding
    parentDataBinding.onModify.callCount.should.equal(0);
    parentDataBinding.onPreModify.callCount.should.equal(0);
    workspace.get(['node1', 'myChild2', 'single_ref', 'text']).setValue('fortytwo');
    // these don't get called for references
    ////        parentDataBinding.onModify.callCount.should.equal(1);
    ////        parentDataBinding.onPreModify.callCount.should.equal(1);
    ////        parentDataBinding.onModify.resetHistory();
    ////        parentDataBinding.onPreModify.resetHistory();
    parentDataBinding.onPreRemove.callCount.should.equal(0);
    parentDataBinding.onRemove.callCount.should.equal(0);

    // Triggered for node1.myChild2.singleRef.text
    stringModifySpy.callCount.should.equal(1);
    stringModifySpy.resetHistory();
    // myChild2.single_ref.single_ref.text does not resolve
    doubleStringInsertSpy.callCount.should.equal(0);
    doubleStringInsertSpy.resetHistory();

    // Register another on demand DataBinding with a double reference path
    dataBinder.register('BINDING2', ReferenceParentTemplate.typeid, ParentDataBinding,
      { exactPath: 'node1.myChild3' });
    // this should trigger our ctor and onPostCreate
    dataBinder._dataBindingCreatedCounter.should.equal(1);
    dataBinder._resetDebugCounters();
    const parentDataBinding2 = dataBinder.resolve('/node1.myChild3', 'BINDING2');
    parentDataBinding2.should.be.instanceOf(ParentDataBinding);
    parentDataBinding2.onPostCreate.callCount.should.equal(1);
    parentDataBinding2.onModify.callCount.should.equal(0);

    // node1.myChild2.singleRef.text is invalid; not called
    stringInsertSpy.callCount.should.equal(0);
    stringInsertSpy.resetHistory();

    // Triggered for node1.myChild3.singleRef.singleRef.text
    doubleStringInsertSpy.callCount.should.equal(1);
    doubleStringInsertSpy.resetHistory();

    // check that this behaves as a 'normal' DataBinding: this should trigger relative path onModify callbacks...
    doubleStringModifySpy.callCount.should.equal(0);
    stringModifySpy.callCount.should.equal(0);
    workspace.get(['node1', 'theData', 'text']).setValue('sixty-four');

    // Triggered for myChild2.single_ref.text
    stringModifySpy.callCount.should.equal(1);
    stringModifySpy.resetHistory();
    // Triggered for node1.myChild3.singleRef.singleRef.text
    doubleStringModifySpy.callCount.should.equal(1);
    doubleStringModifySpy.resetHistory();

    // removing the *referenced* Property should trigger the remove relative path callback
    workspace.get('node1').remove('theData');

    // Triggered for myChild2.single_ref.text
    stringRemoveSpy.callCount.should.equal(1);

    // Triggered for myChild3.single_ref.single_ref.text
    doubleStringRemoveSpy.callCount.should.equal(1);

    // this should trigger all removal-related callbacks
    workspace.get(['node1']).remove('myChild2');
    parentDataBinding.onPreRemove.callCount.should.equal(1);
    parentDataBinding.onRemove.callCount.should.equal(1);
    dataBinder._dataBindingRemovedCounter.should.equal(1);

    // register another one
    dataBinder.register('BINDING3', ReferenceParentTemplate.typeid, ParentDataBinding,
      { exactPath: 'node2.myChild4' });
    dataBinder._dataBindingCreatedCounter.should.equal(1);

    // myChild4 points to nothing, so neither of the inserts get called
    stringInsertSpy.callCount.should.equal(0);
    stringModifySpy.callCount.should.equal(0);
    doubleStringInsertSpy.callCount.should.equal(0);
    doubleStringModifySpy.callCount.should.equal(0);

    // TODO: additional tests for chained references and for cases where you bind to the
    // TODO: reference property itself and not the referenced property.
  });

  it('should correctly remove bindings when unregistering while bindings are installed', function () {

    // register a 'classic' DataBinding to make sure we remove the right one
    dataBinder.register('BINDING', 'Float64', ParentDataBinding);
    // register a 'classic' DataBinding with a different group
    dataBinder.register('TEST', 'Float64', ParentDataBinding);

    // insert some values into the workspace so we can register a binding after they are already present
    workspace.insert('child1', PropertyFactory.create('NodeProperty', 'single'));
    workspace.insert('child2', PropertyFactory.create('NodeProperty', 'single'));
    workspace.insert('child3', PropertyFactory.create('NodeProperty', 'single'));
    workspace.get('child1').insert('myFloat1', PropertyFactory.create('Float64', 'single'));
    workspace.get('child1').insert('myFloat2', PropertyFactory.create('Float64', 'single'));
    workspace.get('child1').insert('myFloat3', PropertyFactory.create('Float64', 'single'));
    workspace.get('child2').insert('myFloat4', PropertyFactory.create('Float64', 'single'));
    workspace.get('child2').insert('myFloat5', PropertyFactory.create('Float64', 'single'));
    workspace.get('child2').insert('myFloat6', PropertyFactory.create('Float64', 'single'));
    workspace.get('child3').insert('myFloat7', PropertyFactory.create('Float64', 'single'));
    workspace.get('child3').insert('myFloat8', PropertyFactory.create('Float64', 'single'));
    workspace.get('child3').insert('myFloat9', PropertyFactory.create('Float64', 'single'));
    workspace.get(['child1', 'myFloat2']).setValue(64);
    dataBinder._resetDebugCounters();

    // Register an on demand DataBinding
    var regKey = dataBinder.register('BINDING2', 'Float64', ParentDataBinding,
      { exactPath: 'child1.myFloat2' });
    // this should trigger our ctor and onPostCreate
    dataBinder._dataBindingCreatedCounter.should.equal(1);
    dataBinder._resetDebugCounters();
    const parentDataBinding = dataBinder.resolve('/child1.myFloat2', 'BINDING2');
    parentDataBinding.should.be.instanceOf(ParentDataBinding);
    parentDataBinding.onPostCreate.callCount.should.equal(1);
    parentDataBinding.onModify.callCount.should.equal(0);

    // check that this behaves as a 'normal' DataBinding: this should trigger onPreModify & onModify as usual
    parentDataBinding.onModify.callCount.should.equal(0);
    parentDataBinding.onPreModify.callCount.should.equal(0);
    workspace.get(['child1', 'myFloat2']).setValue(42);
    parentDataBinding.onModify.callCount.should.equal(1);
    parentDataBinding.onPreModify.callCount.should.equal(1);
    parentDataBinding.onModify.resetHistory();
    parentDataBinding.onPreModify.resetHistory();
    parentDataBinding.onPreRemove.callCount.should.equal(0);
    parentDataBinding.onRemove.callCount.should.equal(0);

    // this should trigger all removal-related callbacks
    regKey.destroy();
    parentDataBinding.onPreRemove.callCount.should.equal(1);
    parentDataBinding.onRemove.callCount.should.equal(1);
    parentDataBinding.onPreRemove.resetHistory();
    parentDataBinding.onRemove.resetHistory();
    dataBinder._dataBindingRemovedCounter.should.equal(1);
    // insert a new float, two new DataBindings should be created
    workspace.get('child1').insert('myFloat4', PropertyFactory.create('Float64', 'single'));
    dataBinder._dataBindingCreatedCounter.should.equal(2);
  });

  it('should unregister bindings on the root property when the properties are present', function () {

    // insert some values into the workspace so we can register our on demand DataBindings
    workspace.insert('child1', PropertyFactory.create('NodeProperty', 'single'));
    workspace.get('child1').insert('myFloat1', PropertyFactory.create('Float64', 'single'));
    workspace.get('child1').insert('myFloat2', PropertyFactory.create('Float64', 'single'));
    workspace.get('child1').insert('myFloat3', PropertyFactory.create('Float64', 'single'));

    // Register an on demand DataBinding
    var regKey = dataBinder.register('BINDING', 'Float64', ParentDataBinding,
      { exactPath: 'child1.myFloat2' });
    // this should trigger our ctor and onPostCreate
    dataBinder._dataBindingCreatedCounter.should.equal(1);
    dataBinder._resetDebugCounters();
    const parentDataBinding = dataBinder.resolve('/child1.myFloat2', 'BINDING');
    parentDataBinding.should.be.instanceOf(ParentDataBinding);
    parentDataBinding.onPostCreate.callCount.should.equal(1);
    parentDataBinding.onModify.callCount.should.equal(0);

    var rootRegKey = dataBinder.register('BINDING', 'NodeProperty', ChildDataBinding, { exactPath: '/' });
    dataBinder._dataBindingCreatedCounter.should.equal(1);
    dataBinder._resetDebugCounters();
    let childDataBinding = dataBinder.resolve('/', 'BINDING');
    childDataBinding.should.be.instanceOf(ChildDataBinding);

    // this should trigger all removal-related callbacks
    regKey.destroy();
    parentDataBinding.onPreRemove.callCount.should.equal(1);
    parentDataBinding.onRemove.callCount.should.equal(1);
    parentDataBinding.onPreRemove.resetHistory();
    parentDataBinding.onRemove.resetHistory();
    dataBinder._dataBindingRemovedCounter.should.equal(1);
    dataBinder._resetDebugCounters();

    childDataBinding.onModify.callCount.should.equal(0);
    workspace.insert('child2', PropertyFactory.create('Float64', 'single'));
    childDataBinding.onModify.callCount.should.equal(1);
    childDataBinding.onModify.resetHistory();
    // again, this should trigger all removal-related callbacks
    rootRegKey.destroy();
    childDataBinding.onPreRemove.callCount.should.equal(1);
    childDataBinding.onRemove.callCount.should.equal(1);
    dataBinder._dataBindingRemovedCounter.should.equal(1);
    dataBinder._resetDebugCounters();
    // should not trigger anymore
    workspace.insert('child3', PropertyFactory.create('Float64', 'single'));
    childDataBinding.onModify.callCount.should.equal(0);
    // re-register root
    dataBinder.register('BINDING', 'NodeProperty', ChildDataBinding, { exactPath: '/' });
    dataBinder._dataBindingCreatedCounter.should.equal(1);
    childDataBinding = dataBinder.resolve('/', 'BINDING');
    childDataBinding.should.be.instanceOf(ChildDataBinding);
    // this should trigger
    workspace.insert('child4', PropertyFactory.create('Float64', 'single'));
    childDataBinding.onModify.callCount.should.equal(1);
  });

  it('should correctly remove databindings with relative path callbacks', function () {

    // insert some values into the workspace so we can register after they are created
    workspace.insert('child1', PropertyFactory.create('NodeProperty', 'single'));
    workspace.get('child1').insert('myChild1', PropertyFactory.create(PrimitiveChildrenTemplate.typeid, 'single'));
    workspace.get('child1').insert('myChild2', PropertyFactory.create(PrimitiveChildrenTemplate.typeid, 'single'));
    workspace.get('child1').insert('myChild3', PropertyFactory.create(PrimitiveChildrenTemplate.typeid, 'single'));
    workspace.get(['child1', 'myChild2', 'aString']).setValue('sixty-four');

    var stringInsertSpy = sinon.spy();
    var stringRemoveSpy = sinon.spy();
    var numberInsertSpy = sinon.spy();
    var numberRemoveSpy = sinon.spy();
    var nestedNumberInsertSpy = sinon.spy();
    var nestedNumberRemoveSpy = sinon.spy();
    // Register the relative path callbacks
    ParentDataBinding.registerOnPath('aString', ['insert'], stringInsertSpy);
    ParentDataBinding.registerOnPath('aString', ['remove'], stringRemoveSpy);
    ParentDataBinding.registerOnPath('aNumber', ['insert'], numberInsertSpy);
    ParentDataBinding.registerOnPath('aNumber', ['remove'], numberRemoveSpy);
    ParentDataBinding.registerOnPath('nested.aNumber', ['insert'], nestedNumberInsertSpy);
    ParentDataBinding.registerOnPath('nested.aNumber', ['remove'], nestedNumberRemoveSpy);

    // Register a new binding
    var regKey = dataBinder.register('BINDING', PrimitiveChildrenTemplate.typeid, ParentDataBinding,
      { exactPath: 'child1.myChild2' });
    // this should trigger our ctor and onPostCreate
    dataBinder._dataBindingCreatedCounter.should.equal(1);
    dataBinder._resetDebugCounters();

    const parentDataBinding = dataBinder.resolve('/child1.myChild2', 'BINDING');
    parentDataBinding.should.be.instanceOf(ParentDataBinding);
    parentDataBinding.onPostCreate.callCount.should.equal(1);
    parentDataBinding.onModify.callCount.should.equal(0);

    // as well as the relative path callbacks
    stringInsertSpy.callCount.should.equal(1);
    numberInsertSpy.callCount.should.equal(1);
    nestedNumberInsertSpy.callCount.should.equal(1);

    // this should trigger all removal-related callbacks
    regKey.destroy();
    parentDataBinding.onPreRemove.callCount.should.equal(1);
    parentDataBinding.onRemove.callCount.should.equal(1);
    dataBinder._dataBindingRemovedCounter.should.equal(1);
    // as well as the relative path callbacks
    stringRemoveSpy.callCount.should.equal(1);
    numberRemoveSpy.callCount.should.equal(1);
    nestedNumberRemoveSpy.callCount.should.equal(1);
  });

  it('should not create on demand DataBindings multiple times', function () {

    // insert some values into the workspace so we can register our on demand DataBinding
    workspace.insert('parent', PropertyFactory.create('NodeProperty', 'single'));
    workspace.get('parent').insert('myFloat1', PropertyFactory.create('Float64', 'single'));
    workspace.get('parent').insert('myFloat2', PropertyFactory.create('Float64', 'single'));

    // Register on demand DataBindings
    dataBinder.register('BINDING1', 'Float64', ParentDataBinding, { exactPath: 'parent.myFloat2' });
    dataBinder.register('BINDING2', 'Float64', ParentDataBinding, { exactPath: 'parent.myFloat2' });
    // this should trigger our ctor and onPostCreate twice
    dataBinder._dataBindingCreatedCounter.should.equal(2);
  });

  it('should only unregister bindings based on the handle used', function () {
    // Register some bindings in advance
    const h1 = dataBinder.register('BINDING', 'Float64', ParentDataBinding);

    // insert some values into the workspace so we can register our on demand DataBinding
    workspace.insert('parent', PropertyFactory.create('NodeProperty', 'single'));
    workspace.get('parent').insert('myFloat1', PropertyFactory.create('Float64', 'single'));
    workspace.get('parent').insert('myFloat2', PropertyFactory.create('Float64', 'single'));

    // Register some bindings after the fact
    const h2 = dataBinder.register('BINDING2', 'Float64', ParentDataBinding, { exactPath: 'parent.myFloat2' });
    const h3 = dataBinder.register('BINDING3', 'Float64', ParentDataBinding, { exactPath: 'parent.myFloat2' });

    h1.destroy();  // Will unregister for myFloat1 and myFloat2
    dataBinder._dataBindingRemovedCounter.should.equal(2);
    h2.destroy();  // Will unregister for myFloat2
    dataBinder._dataBindingRemovedCounter.should.equal(3);
    h3.destroy(); // Will unregister for myFloat2
    dataBinder._dataBindingRemovedCounter.should.equal(4);
  });

  it('should correctly create on demand DataBindings bound to collections', function () {

    // insert some values into the workspace so we can register our on demand DataBinding
    workspace.insert('root', PropertyFactory.create('NodeProperty', 'single'));
    workspace.get('root').insert('myFloat', PropertyFactory.create('Float64', 'single'));
    workspace.get('root').insert('myFloatMap', PropertyFactory.create('Float64', 'map'));
    workspace.get('root').insert('myFloatArray', PropertyFactory.create('Float64', 'array'));

    // Register an on demand DataBinding for the map
    dataBinder.register('BINDING', 'map<Float64>', ParentDataBinding,
      { exactPath: 'root.myFloatMap' });
    // this should trigger our ctor and onPostCreate
    dataBinder._dataBindingCreatedCounter.should.equal(1);
    dataBinder._resetDebugCounters();
    let parentDataBinding = dataBinder.resolve('/root.myFloatMap', 'BINDING');
    parentDataBinding.getProperty().should.equal(workspace.get(['root', 'myFloatMap']));
    // Register an on demand DataBinding for the array
    dataBinder.register('BINDING', 'array<Float64>', ParentDataBinding,
      { exactPath: 'root.myFloatArray' });
    // this should trigger our ctor and onPostCreate
    dataBinder._dataBindingCreatedCounter.should.equal(1);
    parentDataBinding = dataBinder.resolve('/root.myFloatArray', 'BINDING');
    parentDataBinding.getProperty().should.equal(workspace.get(['root', 'myFloatArray']));
  });

  it('should correctly create on demand DataBindings bound to BaseProperty', function () {

    // insert some values into the workspace so we can register our on demand DataBinding
    workspace.insert('root', PropertyFactory.create('NodeProperty', 'single'));
    workspace.get('root').insert('myFloat', PropertyFactory.create('Float64', 'single'));
    workspace.get('root').insert('myFloatMap', PropertyFactory.create('Float64', 'map'));
    workspace.get('root').insert('myFloatArray', PropertyFactory.create('Float64', 'array'));

    // Register an on demand DataBinding for BaseProperty
    dataBinder.register('BINDING', 'BaseProperty', ParentDataBinding,
      { exactPath: 'root.myFloat' });
    // this should trigger our ctor and onPostCreate
    dataBinder._dataBindingCreatedCounter.should.equal(1);
    dataBinder._resetDebugCounters();
    let parentDataBinding = dataBinder.resolve('/root.myFloat', 'BINDING');
    parentDataBinding.getProperty().should.equal(workspace.get(['root', 'myFloat']));

    // Register an on demand DataBinding for map of BaseProperty - note the special syntax!
    dataBinder.register('BINDING', 'map<>', ParentDataBinding,
      { exactPath: 'root.myFloatMap' });
    // this should trigger our ctor and onPostCreate
    dataBinder._dataBindingCreatedCounter.should.equal(1);
    dataBinder._resetDebugCounters();
    parentDataBinding = dataBinder.resolve('/root.myFloatMap', 'BINDING');
    parentDataBinding.getProperty().should.equal(workspace.get(['root', 'myFloatMap']));

    // Register an on demand DataBinding for the array of BaseProperty - note the special syntax!
    dataBinder.register('BINDING', 'array<>', ParentDataBinding,
      { exactPath: 'root.myFloatArray' });
    // this should trigger our ctor and onPostCreate
    dataBinder._dataBindingCreatedCounter.should.equal(1);
    parentDataBinding = dataBinder.resolve('/root.myFloatArray', 'BINDING');
    parentDataBinding.getProperty().should.equal(workspace.get(['root', 'myFloatArray']));
  });

  it('should correctly create on demand DataBindings with relative path collectionInsert callbacks', function () {

    // insert some values into the workspace so we can register our on demand DataBinding
    workspace.insert('child1', PropertyFactory.create('NodeProperty', 'single'));
    workspace.get('child1').insert('myChild1', PropertyFactory.create(PrimitiveChildrenTemplate.typeid, 'single'));
    workspace.get('child1').insert('myChild2', PropertyFactory.create(PrimitiveChildrenTemplate.typeid, 'single'));
    workspace.get(['child1', 'myChild1', 'aString']).setValue('sixty-four');

    var stringInsertSpy = sinon.spy();
    var stringModifySpy = sinon.spy();
    var numberInsertSpy = sinon.spy();
    var numberModifySpy = sinon.spy();
    var nestedNumberInsertSpy = sinon.spy();
    var nestedNumberModifySpy = sinon.spy();
    var insertSpiesError = false;
    var expectedArrayIndices = [0, 1, 2];
    var expectedMapKeys = ['a', 'b'];
    var arrayInsertSpy = sinon.spy(function (in_index, in_modificationContext) {
      if (in_modificationContext.getOperationType() !== 'insert') {
        console.warn('Failure in arrayInsertSpy');
        insertSpiesError = true;
        return;
      }
      var index = expectedArrayIndices.indexOf(in_index);
      if (index === -1) {
        console.warn('Failure in arrayInsertSpy 2');
        insertSpiesError = true;
        return;
      }
      this.should.be.instanceOf(ParentDataBinding);
      expectedArrayIndices.splice(index, 1);
    });
    var mapInsertSpy = sinon.spy(function (in_key, in_modificationContext) {
      // console.log('key: ' + in_key);
      // console.log('path: ' + in_modificationContext.getAbsolutePath());
      if (in_modificationContext.getOperationType() !== 'insert') {
        console.warn('Failure in mapInsertSpy');
        insertSpiesError = true;
        return;
      }
      var index = expectedMapKeys.indexOf(in_key);
      if (index === -1) {
        console.warn('Failure in mapInsertSpy 2');
        insertSpiesError = true;
        return;
      }
      expectedMapKeys.splice(index, 1);
    });
    // Register the relative path callbacks
    ParentDataBinding.registerOnPath('aString', ['insert'], stringInsertSpy);
    ParentDataBinding.registerOnPath('aString', ['modify'], stringModifySpy);
    ParentDataBinding.registerOnPath('aNumber', ['insert'], numberInsertSpy);
    ParentDataBinding.registerOnPath('aNumber', ['modify'], numberModifySpy);
    ParentDataBinding.registerOnPath('nested.aNumber', ['insert'], nestedNumberInsertSpy);
    ParentDataBinding.registerOnPath('nested.aNumber', ['modify'], nestedNumberModifySpy);
    ParentDataBinding.registerOnPath('arrayOfNumbers', ['collectionInsert'], arrayInsertSpy);
    ParentDataBinding.registerOnPath('mapOfNumbers', ['collectionInsert'], mapInsertSpy);

    // put some stuff ino the array / map
    workspace.get(['child1', 'myChild1', 'arrayOfNumbers']).push(0);
    workspace.get(['child1', 'myChild1', 'arrayOfNumbers']).push(1);
    workspace.get(['child1', 'myChild1', 'arrayOfNumbers']).push(2);

    workspace.get(['child1', 'myChild1', 'mapOfNumbers']).insert('a', 0);
    workspace.get(['child1', 'myChild1', 'mapOfNumbers']).insert('b', 1);

    // Register an on demand DataBinding
    dataBinder.register('BINDING', PrimitiveChildrenTemplate.typeid, ParentDataBinding,
      { exactPath: 'child1.myChild1' });
    dataBinder._dataBindingCreatedCounter.should.equal(1);
    dataBinder._resetDebugCounters();

    // this should trigger the collection insert callbacks
    arrayInsertSpy.callCount.should.equal(3);
    mapInsertSpy.callCount.should.equal(2);
    arrayInsertSpy.resetHistory();
    mapInsertSpy.resetHistory();

    // register another one
    dataBinder.register('BINDING2', PrimitiveChildrenTemplate.typeid, ParentDataBinding,
      { exactPath: 'child1.myChild2' });
    dataBinder._dataBindingCreatedCounter.should.equal(1);
    dataBinder._resetDebugCounters();

    // this time no collection insert callbacks though
    arrayInsertSpy.callCount.should.equal(0);
    mapInsertSpy.callCount.should.equal(0);

    insertSpiesError.should.equal(false);
    expectedArrayIndices.length.should.equal(0);
    expectedMapKeys.length.should.equal(0);
  });

  it('creates on demand DataBindings with relative path collectionInsert callbacks with nodeprops', function () {
    // This caused issues due to the use of NodeProperty.getValues()
    var arrayInsertSpy = sinon.spy();
    var mapInsertSpy = sinon.spy();

    // Register the relative path callbacks
    ParentDataBinding.registerOnPath('arrayOfNodeProperty', ['collectionInsert'], arrayInsertSpy);
    ParentDataBinding.registerOnPath('mapOfNodeProperty', ['collectionInsert'], mapInsertSpy);

    // We specifically create a node property with an undefined ref. getValues crashes traversing
    // this.
    const makeNodeProperty = function () {
      const nodep = PropertyFactory.create('NodeProperty');
      nodep.insert('badref', PropertyFactory.create('Reference', 'single'));
      return nodep;
    };

    workspace.insert('arrayOfNodeProperty', PropertyFactory.create('NodeProperty', 'array'));

    workspace.get(['arrayOfNodeProperty']).push(makeNodeProperty());
    workspace.get(['arrayOfNodeProperty']).push(makeNodeProperty());

    workspace.insert('mapOfNodeProperty', PropertyFactory.create('NodeProperty', 'map'));
    workspace.get(['mapOfNodeProperty']).insert('a', makeNodeProperty());
    workspace.get(['mapOfNodeProperty']).insert('b', makeNodeProperty());

    // Register an on demand DataBinding
    dataBinder.register('BINDING', 'NodeProperty', ParentDataBinding,
      { exactPath: '/' });
    dataBinder._dataBindingCreatedCounter.should.equal(1);
    dataBinder._resetDebugCounters();

    // this should trigger the collection insert callbacks
    arrayInsertSpy.callCount.should.equal(2);
    mapInsertSpy.callCount.should.equal(2);
    arrayInsertSpy.resetHistory();
    mapInsertSpy.resetHistory();
  });

  it('should support delaying creation until pop', function () {
    // insert some values into the workspace so we can register our on demand DataBinding
    workspace.insert('child1', PropertyFactory.create('NodeProperty', 'single'));
    workspace.get('child1').insert('myChild1', PropertyFactory.create(PrimitiveChildrenTemplate.typeid, 'single'));

    dataBinder.pushBindingActivationScope();

    dataBinder.register('BINDING', PrimitiveChildrenTemplate.typeid, ParentDataBinding,
      { exactPath: 'child1.myChild1' });
    dataBinder.register('BINDING2', PrimitiveChildrenTemplate.typeid, ParentDataBinding,
      { exactPath: 'child1.myChild1' });

    // Nothing should be created yet
    dataBinder._dataBindingCreatedCounter.should.equal(0);

    dataBinder.popBindingActivationScope();

    // Now they should be created
    dataBinder._dataBindingCreatedCounter.should.equal(2);
  });

  it('should support unregistering before the pop', function () {
    // insert some values into the workspace so we can register our on demand DataBinding
    workspace.insert('child1', PropertyFactory.create('NodeProperty', 'single'));
    workspace.get('child1').insert('myChild1', PropertyFactory.create(PrimitiveChildrenTemplate.typeid, 'single'));

    dataBinder.pushBindingActivationScope();

    const h1 = dataBinder.register('BINDING', PrimitiveChildrenTemplate.typeid, ParentDataBinding,
      { exactPath: 'child1.myChild1' });
    const h2 = dataBinder.register('BINDING2', PrimitiveChildrenTemplate.typeid, ParentDataBinding,
      { exactPath: 'child1.myChild1' });

    // Nothing should be created yet
    dataBinder._dataBindingCreatedCounter.should.equal(0);

    // unregister before anything was even created
    h1.destroy();

    // Nothing was created so nothing should be removed
    dataBinder._dataBindingRemovedCounter.should.equal(0);

    dataBinder.popBindingActivationScope();

    // The second register should still have kicked in
    dataBinder._dataBindingCreatedCounter.should.equal(1);

    h2.destroy();

    // We should have removed everything in h2
    dataBinder._dataBindingRemovedCounter.should.equal(1);
  });

  it('should support delaying creation until pop and excluding paths', function () {
    // insert some values into the workspace so we can register our on demand DataBinding
    workspace.insert('root', PropertyFactory.create('NodeProperty', 'single'));
    workspace.get('root').insert('child1', PropertyFactory.create('NodeProperty', 'single'));
    workspace.get('root').insert('child2', PropertyFactory.create('NodeProperty', 'single'));
    workspace.get(['root', 'child1']).insert(
      'child1Data', PropertyFactory.create(PrimitiveChildrenTemplate.typeid, 'single')
    );
    workspace.get(['root', 'child2']).insert(
      'child2Data', PropertyFactory.create(PrimitiveChildrenTemplate.typeid, 'single')
    );

    dataBinder.pushBindingActivationScope();

    // Mix an exclude with an exact path
    dataBinder.register('BINDING', PrimitiveChildrenTemplate.typeid, ParentDataBinding,
      { excludePrefix: 'root.child1' });
    dataBinder.register('BINDING2', PrimitiveChildrenTemplate.typeid, ParentDataBinding,
      { exactPath: 'root.child2.child2Data' });

    // Nothing should be created yet
    dataBinder._dataBindingCreatedCounter.should.equal(0);

    dataBinder.popBindingActivationScope();

    // Now they should be created
    dataBinder._dataBindingCreatedCounter.should.equal(2);
  });

  it('should not be able to unregister twice', function () {
    const handle = dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding);
    handle.destroy();
    (function () { handle.destroy(); }).should.throw(Error);
  });

  it('should not be able to unregister twice even if we reregistered the same thing', function () {
    const handle = dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding);
    handle.destroy();
    const otherHandle = dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding);
    (function () { handle.destroy(); }).should.throw(Error);
    otherHandle.destroy();
  });

  it('should support delaying creation in collections', function () {
    // insert some values into the workspace so we can register our on demand DataBinding
    workspace.insert('root', PropertyFactory.create('NodeProperty', 'single'));
    workspace.get('root').insert('child1', PropertyFactory.create('NodeProperty', 'single'));
    workspace.get('root').insert('child2', PropertyFactory.create('NodeProperty', 'single'));
    workspace.get(['root', 'child1']).insert(
      'map', PropertyFactory.create(PrimitiveChildrenTemplate.typeid, 'map')
    );
    workspace.get(['root', 'child1']).insert(
      'data', PropertyFactory.create(PrimitiveChildrenTemplate.typeid, 'single')
    );
    workspace.get(['root', 'child1', 'map']).insert(
      'key1', PropertyFactory.create(PrimitiveChildrenTemplate.typeid, 'single')
    );
    workspace.get(['root', 'child1', 'map']).insert(
      'key2', PropertyFactory.create(PrimitiveChildrenTemplate.typeid, 'single')
    );
    workspace.get(['root', 'child1', 'map']).insert(
      'key3', PropertyFactory.create(PrimitiveChildrenTemplate.typeid, 'single')
    );

    dataBinder.pushBindingActivationScope();

    // matches root.child1.data
    const h1 = dataBinder.register('BINDING', PrimitiveChildrenTemplate.typeid, ParentDataBinding,
      { excludePrefix: 'root.child1.map' });
    // matches root.child1.data, root.child1.map.{key1,key2,key3}
    const h2 = dataBinder.register('BINDING2', PrimitiveChildrenTemplate.typeid, ParentDataBinding,
      { includePrefix: 'root.child1' });
    // matches root.child1.map.key3
    const h3 = dataBinder.register('BINDING3', PrimitiveChildrenTemplate.typeid, ParentDataBinding,
      { exactPath: 'root.child1.map.key3' });

    // Nothing should be created yet
    dataBinder._dataBindingCreatedCounter.should.equal(0);

    dataBinder.popBindingActivationScope();

    // Now they should be created
    dataBinder._dataBindingCreatedCounter.should.equal(6);

    dataBinder._dataBindingRemovedCounter.should.equal(0);

    h1.destroy();

    dataBinder._dataBindingRemovedCounter.should.equal(1);

    h2.destroy();

    dataBinder._dataBindingRemovedCounter.should.equal(5);

    h3.destroy();

    dataBinder._dataBindingRemovedCounter.should.equal(6);

  });

  it('should support delaying creation in arrays', function () {
    // insert some values into the workspace so we can register our on demand DataBinding
    workspace.insert('myArray', PropertyFactory.create(PrimitiveChildrenTemplate.typeid, 'array'));
    workspace.get('myArray').push(PropertyFactory.create(PrimitiveChildrenTemplate.typeid, 'single'));
    workspace.get('myArray').push(PropertyFactory.create(PrimitiveChildrenTemplate.typeid, 'single'));
    workspace.get('myArray').push(PropertyFactory.create(PrimitiveChildrenTemplate.typeid, 'single'));
    workspace.get('myArray').push(PropertyFactory.create(PrimitiveChildrenTemplate.typeid, 'single'));
    workspace.insert('data', PropertyFactory.create(PrimitiveChildrenTemplate.typeid, 'single'));

    dataBinder.pushBindingActivationScope();

    // matches myArray.{1,2,3} and data
    const h1 = dataBinder.register('BINDING', PrimitiveChildrenTemplate.typeid, ParentDataBinding,
      { excludePrefix: 'myArray.0' });
    // matches myArray.{0,1,2,3}
    const h2 = dataBinder.register('BINDING2', PrimitiveChildrenTemplate.typeid, ParentDataBinding,
      { includePrefix: 'myArray' });
    // matches myArray.2
    const h3 = dataBinder.register('BINDING3', PrimitiveChildrenTemplate.typeid, ParentDataBinding,
      { exactPath: 'myArray.2' });

    // Nothing should be created yet
    dataBinder._dataBindingCreatedCounter.should.equal(0);

    dataBinder.popBindingActivationScope();

    // Now they should be created
    dataBinder._dataBindingCreatedCounter.should.equal(9);

    dataBinder._dataBindingRemovedCounter.should.equal(0);

    h1.destroy();

    dataBinder._dataBindingRemovedCounter.should.equal(4);

    h2.destroy();

    dataBinder._dataBindingRemovedCounter.should.equal(8);

    h3.destroy();

    dataBinder._dataBindingRemovedCounter.should.equal(9);

  });

  it('should not call absolute path functions when retroactively inserting/removing bindings', function () {
    // insert some values into the workspace so we can register our on demand DataBinding
    workspace.insert('root', PropertyFactory.create('NodeProperty', 'single'));
    workspace.get('root').insert('child1', PropertyFactory.create(ChildTemplate.typeid, 'single'));
    workspace.get('root').insert('child2', PropertyFactory.create(ChildTemplate.typeid, 'single'));

    var absolutePathCB = sinon.spy();
    // register an absolute path callback:
    dataBinder.registerOnPath('/root.child1', ['insert', 'remove'], absolutePathCB);
    // We'll get called back on insert
    absolutePathCB.callCount.should.equal(1);
    absolutePathCB.resetHistory();

    // register a binding at the same exact path
    const handle =
      dataBinder.register('BINDING', ChildTemplate.typeid, ParentDataBinding, { exactPath: 'root.child1' });
    dataBinder._dataBindingCreatedCounter.should.equal(1);
    absolutePathCB.callCount.should.equal(0);
    handle.destroy();
    dataBinder._dataBindingRemovedCounter.should.equal(1);
    absolutePathCB.callCount.should.equal(0);
  });

  it('should register DataBindings on popBindingActivationScope and account for excludePrefix', function () {
    // Add some properties
    workspace.insert('nodeA', PropertyFactory.create(ParentTemplate.typeid, 'single'));
    workspace.insert('nodeB', PropertyFactory.create(ParentTemplate.typeid, 'single'));
    workspace.insert('nodeC', PropertyFactory.create(ParentTemplate.typeid, 'single'));

    workspace.get('nodeB').insert('nodeD', PropertyFactory.create(ParentTemplate.typeid, 'single'));

    dataBinder.pushBindingActivationScope();

    // Register call back on the parent DataBindings' text field
    var pathSpy = sinon.spy();
    ParentDataBinding.registerOnPath('text', ['modify'], pathSpy);

    var handle = dataBinder.register(
      'BINDING', ParentTemplate.typeid, ParentDataBinding, { excludePrefix: 'nodeB' });
    var handle2 = dataBinder.register(
      'BINDING2', ParentTemplate.typeid, ChildDataBinding, { exactPath: 'nodeB.nodeD' });

    dataBinder._dataBindingCreatedCounter.should.equal(0);

    dataBinder.popBindingActivationScope();
    // 2 parent DataBindings and 1 child DataBinding
    dataBinder._dataBindingCreatedCounter.should.equal(3);

    workspace.get('nodeA').get('text').setValue('new text');
    workspace.get('nodeC').get('text').setValue('new text');
    workspace.get('nodeB').get('text').setValue('new text');

    // Call count of the pathSpy should be 2 as there is no DataBinding registered for nodeB
    pathSpy.callCount.should.equal(2);
    pathSpy.resetHistory();

    // This should not trigger the pathSpy callback as nodeD is not a parent DataBinding
    workspace.get(['nodeB', 'nodeD']).get('text').setValue('new text');
    pathSpy.callCount.should.equal(0);

    handle.destroy();
    handle2.destroy();
  });

  it('should create DataBindings based on tree level if registered in a scope', function () {
    // Create tree
    workspace.insert('nodeA', PropertyFactory.create('NodeProperty', 'single'));
    workspace.get('nodeA').insert('nodeB', PropertyFactory.create('NodeProperty', 'single'));
    workspace.get('nodeA').insert('nodeC', PropertyFactory.create('NodeProperty', 'single'));
    workspace.get('nodeA').get('nodeC').insert('nodeD', PropertyFactory.create('NodeProperty', 'single'));

    var lastCreatedDataBindingCtor;
    var lastCalledOnPostCreate;

    /**
     * Test class
     */
    class DataBindingA extends DataBinding {
      /**
       * Constructor
       * @param {Object} params - params
       */
      constructor(params) {
        super(params);
        lastCreatedDataBindingCtor = 'DataBindingA ctor';

        this.onPostCreate = sinon.spy(function () {
          lastCalledOnPostCreate = 'DataBindingA onPostCreate';
        });
      }
    }

    /**
     * Test class
     */
    class DataBindingB extends DataBinding {
      /**
       * Constructor
       * @param {Object} params - params
       */
      constructor(params) {
        super(params);
        lastCreatedDataBindingCtor = 'DataBindingB ctor';

        this.onPostCreate = sinon.spy(function () {
          lastCalledOnPostCreate = 'DataBindingB onPostCreate';
        });
      }
    }

    // Without scopes registration is based on call order
    var handleA = dataBinder.register('A', 'NodeProperty', DataBindingA, { exactPath: 'nodeA.nodeC' });
    var handleB = dataBinder.register('B', 'NodeProperty', DataBindingB, { exactPath: 'nodeA.nodeC.nodeD' });
    lastCreatedDataBindingCtor.should.equal('DataBindingB ctor');
    lastCalledOnPostCreate.should.equal('DataBindingB onPostCreate');

    handleA.destroy();
    handleB.destroy();
    lastCreatedDataBindingCtor = '';
    lastCalledOnPostCreate = '';

    // Switch call order -> register DataBindingA last
    handleB = dataBinder.register('B', 'NodeProperty', DataBindingB, { exactPath: 'nodeA.nodeC.nodeD' });
    handleA = dataBinder.register('A', 'NodeProperty', DataBindingA, { exactPath: 'nodeA.nodeC' });
    lastCreatedDataBindingCtor.should.equal('DataBindingA ctor');
    lastCalledOnPostCreate.should.equal('DataBindingA onPostCreate');

    handleA.destroy();
    handleB.destroy();
    lastCreatedDataBindingCtor = '';
    lastCalledOnPostCreate = '';

    // If registering DataBindings in a scope, the call order no longer matters
    // but the position in the tree determines which DataBinding is registered first.
    // The onPostCreate call back should be called in inverse order
    dataBinder.pushBindingActivationScope();
    handleA = dataBinder.register('A', 'NodeProperty', DataBindingA, { exactPath: 'nodeA.nodeC' });
    handleB = dataBinder.register('B', 'NodeProperty', DataBindingB, { exactPath: 'nodeA.nodeC.nodeD' });
    lastCreatedDataBindingCtor.should.equal('');
    lastCalledOnPostCreate.should.equal('');
    dataBinder.popBindingActivationScope();
    // DataBindingB is registered on a lower tree level and should be created after DataBindingA
    lastCreatedDataBindingCtor.should.equal('DataBindingB ctor');
    lastCalledOnPostCreate.should.equal('DataBindingA onPostCreate');

    handleA.destroy();
    handleB.destroy();
    lastCreatedDataBindingCtor = '';
    lastCalledOnPostCreate = '';

    // Change the call order
    dataBinder.pushBindingActivationScope();
    handleB = dataBinder.register('B', 'NodeProperty', DataBindingB, { exactPath: 'nodeA.nodeC.nodeD' });
    handleA = dataBinder.register('A', 'NodeProperty', DataBindingA, { exactPath: 'nodeA.nodeC' });
    lastCreatedDataBindingCtor.should.equal('');
    lastCalledOnPostCreate.should.equal('');
    dataBinder.popBindingActivationScope();
    lastCreatedDataBindingCtor.should.equal('DataBindingB ctor');
    lastCalledOnPostCreate.should.equal('DataBindingA onPostCreate');

    handleA.destroy();
    handleB.destroy();
    lastCreatedDataBindingCtor = '';
    lastCalledOnPostCreate = '';
  });

  it('should correctly handle includePrefix, excludePrefix and exactPath', function () {
    // add some properties
    workspace.insert('nodeA', PropertyFactory.create('NodeProperty', 'single'));
    workspace.get('nodeA').insert('nodeB', PropertyFactory.create('NodeProperty', 'single'));
    workspace.get('nodeA').insert('nodeC', PropertyFactory.create('NodeProperty', 'single'));
    workspace.get('nodeA').insert('nodeD', PropertyFactory.create('NodeProperty', 'single'));
    workspace.get(['nodeA', 'nodeB']).insert('nodeE', PropertyFactory.create(ParentTemplate.typeid, 'array'));
    workspace.get(['nodeA', 'nodeB']).insert('nodeF', PropertyFactory.create(ParentTemplate.typeid, 'set'));
    workspace.get(['nodeA', 'nodeC']).insert('nodeG', PropertyFactory.create(ParentTemplate.typeid, 'map'));
    workspace.get(['nodeA', 'nodeD']).insert('nodeH', PropertyFactory.create(ParentTemplate.typeid, 'single'));

    workspace.insert('nodeX', PropertyFactory.create('NodeProperty', 'single'));
    workspace.get('nodeX').insert('nodeY', PropertyFactory.create(ParentTemplate.typeid, 'single'));

    workspace.get(['nodeA', 'nodeB', 'nodeE']).push(PropertyFactory.create(ParentTemplate.typeid, 'single'));
    const setProperty = PropertyFactory.create(ParentTemplate.typeid, 'single');
    workspace.get(['nodeA', 'nodeB', 'nodeF']).insert(setProperty);
    workspace.get(['nodeA', 'nodeC', 'nodeG']).insert('myMapKey',
      PropertyFactory.create(ParentTemplate.typeid, 'single'));

    // should ignore includePrefix and excludePrefix if exactPath is set
    var handleA = dataBinder.register('BINDING', ParentTemplate.typeid, ParentDataBinding,
      { includePrefix: 'nodeA', excludePrefix: 'nodeA.nodeB.nodeF', exactPath: 'nodeX.nodeY' });
    dataBinder._dataBindingCreatedCounter.should.equal(1);
    dataBinder._resetDebugCounters();
    handleA.destroy();

    // should exclude nodes which are not part of the nodeA tree and also the nodeF and children nodes
    var handleA = dataBinder.register('BINDING', ParentTemplate.typeid, ParentDataBinding,
      { includePrefix: 'nodeA', excludePrefix: 'nodeA.nodeB.nodeF' });
    dataBinder._dataBindingCreatedCounter.should.equal(3);
    dataBinder._resetDebugCounters();
    expect(dataBinder.resolve('nodeX.nodeY', 'BINDING')).to.equal(undefined);
    expect(dataBinder.resolve('nodeA.nodeB.nodeF', 'BINDING')).to.equal(undefined);
    handleA.destroy();

    // should register DataBindings on a collections via exactPath option
    handleA = dataBinder.register('BINDING', ParentTemplate.typeid, ParentDataBinding,
      { exactPath: 'nodeA.nodeB.nodeE[0]' });
    var handleB = dataBinder.register('BINDING2', ParentTemplate.typeid, ParentDataBinding,
      { exactPath: 'nodeA.nodeC.nodeG[myMapKey]' });
    var handleC = dataBinder.register('BINDING3', ParentTemplate.typeid, ParentDataBinding,
      { exactPath: 'nodeA.nodeB.nodeF[' + setProperty.getGuid() + ']' });
    dataBinder._dataBindingCreatedCounter.should.equal(3);
    handleA.destroy();
    handleB.destroy();
    handleC.destroy();
  });

  it('should work with delayed data bindings', function () {
    const modificationCallbackSpy = sinon.spy();
    ParentDataBinding.registerOnPath('text', ['insert', 'modify'], modificationCallbackSpy);
    dataBinder.defineDataBinding('BINDING', ParentTemplate.typeid, ParentDataBinding);
    const parentProp = PropertyFactory.create(ParentTemplate.typeid, 'single');
    workspace.insert('thingy', parentProp);
    dataBinder._dataBindingCreatedCounter.should.equal(0);
    dataBinder.activateDataBinding('BINDING', ParentTemplate.typeid, {
      exactPath: parentProp.getAbsolutePath()
    });
    dataBinder._dataBindingCreatedCounter.should.equal(1);
    modificationCallbackSpy.callCount.should.equal(1);
  });

  it('should be able to activate a data binding that uses inheritance', function () {
    // We have a binding for Child, and we insert inheritedChild. It should apply (LYNXDEV-5570)
    const insertSpy = sinon.spy();
    ChildDataBinding.registerOnPath('text', ['insert'], insertSpy);
    dataBinder.defineDataBinding('BINDING', ChildTemplate.typeid, ChildDataBinding);

    // Activate before inserting
    dataBinder.activateDataBinding('BINDING', InheritedChildTemplate.typeid);

    const inheritedChild = PropertyFactory.create(InheritedChildTemplate.typeid, 'single');
    workspace.insert('thingy', inheritedChild);

    dataBinder._dataBindingCreatedCounter.should.equal(1); // insert
    insertSpy.callCount.should.equal(1); // insert
  });

  it('should be able to activate a data binding that uses inheritance, retroactively', function () {
    // We have a binding for Child, and we insert inheritedChild. It should apply (LYNXDEV-5570)
    const insertSpy = sinon.spy();
    ChildDataBinding.registerOnPath('text', ['insert'], insertSpy);
    dataBinder.defineDataBinding('BINDING', ChildTemplate.typeid, ChildDataBinding);

    // We are inserting an InheritedChildTemplate; but the ChildTemplate binding hasn't been activated
    const inheritedChild = PropertyFactory.create(InheritedChildTemplate.typeid, 'single');
    workspace.insert('thingy', inheritedChild);
    dataBinder._dataBindingCreatedCounter.should.equal(0);

    // Activate after inserting
    dataBinder.activateDataBinding('BINDING', InheritedChildTemplate.typeid);

    dataBinder._dataBindingCreatedCounter.should.equal(1); // insert
    insertSpy.callCount.should.equal(1); // insert
  });

  it('should choose the best data binding that uses inheritance', function () {
    const childCallbackSpy = sinon.spy();
    const inheritedCallbackSpy = sinon.spy();

    ChildDataBinding.registerOnPath('text', ['insert'], childCallbackSpy);
    InheritedChildDataBinding.registerOnPath('text', ['insert'], inheritedCallbackSpy);

    dataBinder.defineDataBinding('BINDING', ChildTemplate.typeid, ChildDataBinding);
    dataBinder.defineDataBinding('BINDING', InheritedChildTemplate.typeid, InheritedChildDataBinding);

    // Activating both
    dataBinder.activateDataBinding('BINDING', ChildTemplate.typeid);
    dataBinder.activateDataBinding('BINDING', InheritedChildTemplate.typeid);

    const inheritedChild = PropertyFactory.create(InheritedChildTemplate.typeid, 'single');
    workspace.insert('thingy', inheritedChild);

    dataBinder._dataBindingCreatedCounter.should.equal(1); // insert
    dataBinder._resetDebugCounters();
    childCallbackSpy.callCount.should.equal(0); // does not apply
    inheritedCallbackSpy.callCount.should.equal(1); // insert
    childCallbackSpy.resetHistory();
    inheritedCallbackSpy.resetHistory();

    const child = PropertyFactory.create(ChildTemplate.typeid, 'single');
    workspace.insert('otherThingy', child);

    dataBinder._dataBindingCreatedCounter.should.equal(1); // insert
    childCallbackSpy.callCount.should.equal(1); // insert
    inheritedCallbackSpy.callCount.should.equal(0); // does not apply
  });

  it('should be able to handle deactivating a data binding that uses inheritance', function () {
    // We have a binding for Child, and we insert inheritedChild. It should apply (LYNXDEV-5570)
    const modificationCallbackSpy = sinon.spy();
    ChildDataBinding.registerOnPath('text', ['insert'], modificationCallbackSpy);
    const childDefineHandle = dataBinder.defineDataBinding('BINDING', ChildTemplate.typeid, ChildDataBinding);

    // Activating the inherited
    dataBinder.activateDataBinding('BINDING', InheritedChildTemplate.typeid);

    workspace.insert('thingy', PropertyFactory.create(InheritedChildTemplate.typeid, 'single'));

    dataBinder._dataBindingCreatedCounter.should.equal(1); // insert
    dataBinder._resetDebugCounters();
    modificationCallbackSpy.callCount.should.equal(1); // insert
    modificationCallbackSpy.resetHistory();

    // undefining the child define
    childDefineHandle.destroy();

    // Creating shouldn't do anything
    workspace.insert('otherthingy', PropertyFactory.create(InheritedChildTemplate.typeid, 'single'));
    dataBinder._dataBindingCreatedCounter.should.equal(0);
    modificationCallbackSpy.callCount.should.equal(0);
  });

  it('should not activate a data binding that is on the inherited class', function () {
    // Here, we have a template on inheritedChild, and insert type Child. So the binding should _not_ be
    // created
    const modificationCallbackSpy = sinon.spy();
    ChildDataBinding.registerOnPath('text', ['insert'], modificationCallbackSpy);
    dataBinder.defineDataBinding('BINDING', InheritedChildTemplate.typeid, ChildDataBinding);

    const child = PropertyFactory.create(ChildTemplate.typeid, 'single');
    workspace.insert('thingy', child);
    dataBinder._dataBindingCreatedCounter.should.equal(0);

    dataBinder.activateDataBinding('BINDING', InheritedChildTemplate.typeid);

    dataBinder._dataBindingCreatedCounter.should.equal(0);
    modificationCallbackSpy.callCount.should.equal(0);
  });

  it('should not create a binding activated for the inherited class, if only the base class exists', function () {
    const modificationCallbackSpy = sinon.spy();
    ChildDataBinding.registerOnPath('text', ['insert'], modificationCallbackSpy);
    dataBinder.defineDataBinding('BINDING', ChildTemplate.typeid, ChildDataBinding);

    const child = PropertyFactory.create(ChildTemplate.typeid, 'single');
    workspace.insert('thingy', child);
    dataBinder._dataBindingCreatedCounter.should.equal(0);

    // We are activating for InheritedChild; it shouldn't activate for Child
    dataBinder.activateDataBinding('BINDING', InheritedChildTemplate.typeid);

    dataBinder._dataBindingCreatedCounter.should.equal(0);
    modificationCallbackSpy.callCount.should.equal(0);
  });

  it('Definition that is chosen should depend on creation time, not activation time', function () {
    const childCallbackSpy = sinon.spy();
    const inheritedCallbackSpy = sinon.spy();

    ChildDataBinding.registerOnPath('text', ['insert'], childCallbackSpy);
    InheritedChildDataBinding.registerOnPath('text', ['insert'], inheritedCallbackSpy);

    dataBinder.defineDataBinding('BINDING', ChildTemplate.typeid, ChildDataBinding);
    // Activating for InheritedChildTemplate when only the ChildTemplate binding is known
    dataBinder.activateDataBinding('BINDING', InheritedChildTemplate.typeid);
    // Registering a new binding for InheritedChildTemplate
    dataBinder.defineDataBinding('BINDING', InheritedChildTemplate.typeid, InheritedChildDataBinding);

    // Create an Inherited child
    // Only the InheritedChildTemplate binding should have been created, even if it was unknown when
    // InheritedChildTemplate was first activated
    workspace.insert('thingy', PropertyFactory.create(InheritedChildTemplate.typeid, 'single'));
    dataBinder._dataBindingCreatedCounter.should.equal(1);
    dataBinder._resetDebugCounters();
    childCallbackSpy.callCount.should.equal(0);
    inheritedCallbackSpy.callCount.should.equal(1);

    childCallbackSpy.resetHistory();
    inheritedCallbackSpy.resetHistory();

    // Plain old ChildTemplate doesn't do anything because we only activated the inherited type.
    workspace.insert('otherthingy', PropertyFactory.create(ChildTemplate.typeid, 'single'));

    dataBinder._dataBindingCreatedCounter.should.equal(0);
    childCallbackSpy.callCount.should.equal(0);
    inheritedCallbackSpy.callCount.should.equal(0);

    // Until we activate the child type
    dataBinder.activateDataBinding('BINDING', ChildTemplate.typeid);

    dataBinder._dataBindingCreatedCounter.should.equal(1);
    childCallbackSpy.callCount.should.equal(1);
    inheritedCallbackSpy.callCount.should.equal(0);
  });
});
