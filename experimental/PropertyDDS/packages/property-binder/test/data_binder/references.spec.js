/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/* globals should, sinon, expect  */
/* eslint spaced-comment: 0 */
/* eslint no-unused-expressions: 0 */
/* eslint no-unused-vars: 0 */
/* eslint-disable require-jsdoc */
/* eslint max-nested-callbacks: ["warn", 5] */

import _ from 'underscore';
import { DataBinder } from '../../src/data_binder/data_binder';
import {
  DataBinding
} from '../../src/data_binder/data_binding';
import { ModificationContext } from '../../src/data_binder/modification_context';
import {
  registerTestTemplates, ParentTemplate, ChildTemplate,
  PrimitiveChildrenTemplate, ArrayContainerTemplate, SetContainerTemplate,
  MapContainerTemplate, NodeContainerTemplate, UnrepresentedTemplate,
  InheritedChildTemplate, InheritedChildrenTemplate, MultipleInheritedTemplate,
  DoubleReferenceParentTemplate, ReferenceParentTemplate, EscapingTestTemplate
} from './testTemplates';
import {
  ParentDataBinding,
  DerivedDataBinding,
  ChildDataBinding,
  PrimitiveChildrenDataBinding,
  InheritedChildDataBinding
} from './testDataBindings';
import { catchConsoleErrors, hadConsoleError, clearConsoleError } from './catch_console_errors';
import { unregisterAllOnPathListeners } from '../../src/data_binder/internal_utils';
import { RESOLVE_NO_LEAFS, RESOLVE_ALWAYS, RESOLVE_NEVER } from '../../src/internal/constants';

import { BaseProperty, PropertyFactory } from '@fluid-experimental/property-properties';

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
    // Unregister DataBinding paths
    _.forEach(
      [
        ParentDataBinding,
        DerivedDataBinding,
        ChildDataBinding,
        PrimitiveChildrenDataBinding,
        InheritedChildDataBinding
      ],
      unregisterAllOnPathListeners
    );
  });

  describe('references', function () {
    var dataBinder, otherWorkspace;

    beforeEach(function () {
      dataBinder = new DataBinder();

      // Bind to the workspace
      dataBinder.attachTo(workspace);
      otherWorkspace = hfdm.createWorkspace();
      return otherWorkspace.initialize({ local: true }).then(function () {
      });

    });

    afterEach(function () {
      // Unbind checkout view
      dataBinder.detach();

      // Unregister DataBinding paths
      _.forEach([ParentDataBinding, ChildDataBinding, PrimitiveChildrenDataBinding, InheritedChildDataBinding],
        unregisterAllOnPathListeners
      );

      dataBinder = null;
    });

    it.skip('should not call callbacks for properties that never existed', function () {
      // LYNXDEV-8966 : During removal, the databinder may come across callbacks for removal.
      // The DataBinder needs to know if the property existed, to know whether it needs to fire
      // the removal.
      // The current code does this by seeing if there is a node in the databinder tree. The
      // idea is that all properties in the tree lead to a node in the tree, so if there is
      // a node in the tree the property must have existed. Unfortunately, it is possible to
      // have a node in the tree due to a callback being registered for an invalid property.

      // This code reproduces this case.

      const removeCallback = sinon.spy();
      const insertCallback = sinon.spy();

      workspace.insert('target', PropertyFactory.create('NodeProperty'));
      workspace.insert('referrer', PropertyFactory.create(ReferenceParentTemplate.typeid));
      workspace.insert('forcer', PropertyFactory.create(ReferenceParentTemplate.typeid));

      // We set the reference to be valid, to target.
      workspace.get(['referrer', 'single_ref'], RESOLVE_NEVER).setValue('/target');
      // We set the forcer reference to point to the non-existent property /target.text
      // This makes the target.text node exist with path callbacks, even if the property does not.
      workspace.get(['forcer', 'single_ref'], RESOLVE_NEVER).setValue('/target.text');

      // We create a binding that watches .text
      class MyBinding extends DataBinding {
        static initialize() {
          this.registerOnPath('single_ref.text', ['remove'], removeCallback);
          this.registerOnPath('single_ref.text', ['insert'], insertCallback);
        }
      }
      MyBinding.initialize();

      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, MyBinding);
      insertCallback.callCount.should.equal(0);

      // Removing the referrer should not trigger the event
      workspace.remove('target');
      removeCallback.callCount.should.equal(0);
    });

    it('should not call callbacks for bad branches', function () {
      const ref1insertSpy = sinon.spy();
      const ref1removeSpy = sinon.spy();
      const ref2insertSpy = sinon.spy();
      const ref2removeSpy = sinon.spy();
      const startRefReferenceInsertSpy = sinon.spy();
      const startRefReferenceRemoveSpy = sinon.spy();
      const ref1ReferenceInsertSpy = sinon.spy();
      const ref1ReferenceRemoveSpy = sinon.spy();
      const ref2ReferenceInsertSpy = sinon.spy();
      const ref2ReferenceRemoveSpy = sinon.spy();

      const resetHistory = () => {
        ref1insertSpy.resetHistory();
        ref1removeSpy.resetHistory();
        ref2insertSpy.resetHistory();
        ref2removeSpy.resetHistory();
        ref1ReferenceInsertSpy.resetHistory();
        ref1ReferenceRemoveSpy.resetHistory();
        ref2ReferenceInsertSpy.resetHistory();
        ref2ReferenceRemoveSpy.resetHistory();
        startRefReferenceInsertSpy.resetHistory();
        startRefReferenceRemoveSpy.resetHistory();
      };

      // startRef->refParent.ref1->target1.text
      ParentDataBinding.registerOnPath('startRef.ref1.text', ['insert'], ref1insertSpy);
      ParentDataBinding.registerOnPath('startRef.ref1.text', ['remove'], ref1removeSpy);
      // startRef->refParent.ref2->target1.text
      ParentDataBinding.registerOnPath('startRef.ref2.text', ['insert'], ref2insertSpy);
      ParentDataBinding.registerOnPath('startRef.ref2.text', ['remove'], ref2removeSpy);
      // startRef
      ParentDataBinding.registerOnPath('startRef', ['referenceRemove'], startRefReferenceRemoveSpy);
      ParentDataBinding.registerOnPath('startRef', ['referenceInsert'], startRefReferenceInsertSpy);
      // startRef->refParent.ref1
      ParentDataBinding.registerOnPath('startRef.ref1', ['referenceRemove'], ref1ReferenceRemoveSpy);
      ParentDataBinding.registerOnPath('startRef.ref1', ['referenceInsert'], ref1ReferenceInsertSpy);
      // startRef->refParent.ref2
      ParentDataBinding.registerOnPath('startRef.ref2', ['referenceRemove'], ref2ReferenceRemoveSpy);
      ParentDataBinding.registerOnPath('startRef.ref2', ['referenceInsert'], ref2ReferenceInsertSpy);
      dataBinder.register('BINDING', ParentTemplate.typeid, ParentDataBinding);

      const target1 = PropertyFactory.create(ChildTemplate.typeid);
      const target2 = PropertyFactory.create(ChildTemplate.typeid);

      workspace.insert('target1', target1);
      workspace.insert('target2', target2);

      const refParent = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single', {
        ref1: '/target1',
        ref2: '/target2'
      });
      workspace.insert('refParent', refParent);

      const parentProp = PropertyFactory.create(ParentTemplate.typeid);
      workspace.insert('parentProp', parentProp);

      const startRef = PropertyFactory.create('Reference', 'single', '/refParent');
      parentProp.insert('startRef', startRef);

      // Simple insert fires going through the references
      ref1insertSpy.callCount.should.equal(1);
      ref1removeSpy.callCount.should.equal(0);
      ref2insertSpy.callCount.should.equal(1);
      ref2removeSpy.callCount.should.equal(0);
      ref1ReferenceInsertSpy.callCount.should.equal(1);
      ref1ReferenceRemoveSpy.callCount.should.equal(0);
      ref2ReferenceInsertSpy.callCount.should.equal(1);
      ref2ReferenceRemoveSpy.callCount.should.equal(0);
      startRefReferenceInsertSpy.callCount.should.equal(1);
      startRefReferenceRemoveSpy.callCount.should.equal(0);
      resetHistory();

      // break at startRef
      parentProp.remove('startRef');
      ref1insertSpy.callCount.should.equal(0);
      ref1removeSpy.callCount.should.equal(1);
      ref2insertSpy.callCount.should.equal(0);
      ref2removeSpy.callCount.should.equal(1);
      ref1ReferenceInsertSpy.callCount.should.equal(0);
      ref1ReferenceRemoveSpy.callCount.should.equal(1);
      ref2ReferenceInsertSpy.callCount.should.equal(0);
      ref2ReferenceRemoveSpy.callCount.should.equal(1);
      startRefReferenceInsertSpy.callCount.should.equal(0);
      startRefReferenceRemoveSpy.callCount.should.equal(1);
      resetHistory();

      // put back at startRef
      parentProp.insert('startRef', startRef);
      ref1insertSpy.callCount.should.equal(1);
      ref1removeSpy.callCount.should.equal(0);
      ref2insertSpy.callCount.should.equal(1);
      ref2removeSpy.callCount.should.equal(0);
      ref1ReferenceInsertSpy.callCount.should.equal(1);
      ref1ReferenceRemoveSpy.callCount.should.equal(0);
      ref2ReferenceInsertSpy.callCount.should.equal(1);
      ref2ReferenceRemoveSpy.callCount.should.equal(0);
      startRefReferenceInsertSpy.callCount.should.equal(1);
      startRefReferenceRemoveSpy.callCount.should.equal(0);
      resetHistory();

      // Break ref1
      refParent.get('ref1', RESOLVE_NEVER).setValue('/garbage');
      ref1insertSpy.callCount.should.equal(0);
      ref1removeSpy.callCount.should.equal(1);
      ref2insertSpy.callCount.should.equal(0);
      ref2removeSpy.callCount.should.equal(0);
      ref1ReferenceInsertSpy.callCount.should.equal(0);
      ref1ReferenceRemoveSpy.callCount.should.equal(0);
      ref2ReferenceInsertSpy.callCount.should.equal(0);
      ref2ReferenceRemoveSpy.callCount.should.equal(0);
      startRefReferenceInsertSpy.callCount.should.equal(0);
      startRefReferenceRemoveSpy.callCount.should.equal(0);
      resetHistory();

      // Fix it back to target2 (instead of target1)
      refParent.get('ref1', RESOLVE_NEVER).setValue('/target2');
      ref1insertSpy.callCount.should.equal(1);
      ref1removeSpy.callCount.should.equal(0);
      ref2insertSpy.callCount.should.equal(0);
      ref2removeSpy.callCount.should.equal(0);
      ref1ReferenceInsertSpy.callCount.should.equal(0);
      ref1ReferenceRemoveSpy.callCount.should.equal(0);
      ref2ReferenceInsertSpy.callCount.should.equal(0);
      ref2ReferenceRemoveSpy.callCount.should.equal(0);
      startRefReferenceInsertSpy.callCount.should.equal(0);
      startRefReferenceRemoveSpy.callCount.should.equal(0);
      resetHistory();

      // Change it to target1 - should 'remove' and 'insert'
      refParent.get('ref1', RESOLVE_NEVER).setValue('/target1');
      ref1insertSpy.callCount.should.equal(1);
      ref1removeSpy.callCount.should.equal(1);
      ref2insertSpy.callCount.should.equal(0);
      ref2removeSpy.callCount.should.equal(0);
      ref1ReferenceInsertSpy.callCount.should.equal(0);
      ref1ReferenceRemoveSpy.callCount.should.equal(0);
      ref2ReferenceInsertSpy.callCount.should.equal(0);
      ref2ReferenceRemoveSpy.callCount.should.equal(0);
      startRefReferenceInsertSpy.callCount.should.equal(0);
      startRefReferenceRemoveSpy.callCount.should.equal(0);
      resetHistory();

      // Leave it at target1, but using a different reference. Should not fire!
      refParent.get('ref1', RESOLVE_NEVER).setValue('../target1');
      ref1insertSpy.callCount.should.equal(0);
      ref1removeSpy.callCount.should.equal(0);
      ref2insertSpy.callCount.should.equal(0);
      ref2removeSpy.callCount.should.equal(0);
      ref1ReferenceInsertSpy.callCount.should.equal(0);
      ref1ReferenceRemoveSpy.callCount.should.equal(0);
      ref2ReferenceInsertSpy.callCount.should.equal(0);
      ref2ReferenceRemoveSpy.callCount.should.equal(0);
      startRefReferenceInsertSpy.callCount.should.equal(0);
      startRefReferenceRemoveSpy.callCount.should.equal(0);
      resetHistory();

      // break at startRef
      parentProp.remove('startRef');
      ref1insertSpy.callCount.should.equal(0);
      ref1removeSpy.callCount.should.equal(1);
      ref2insertSpy.callCount.should.equal(0);
      ref2removeSpy.callCount.should.equal(1);
      ref1ReferenceInsertSpy.callCount.should.equal(0);
      ref1ReferenceRemoveSpy.callCount.should.equal(1);
      ref2ReferenceInsertSpy.callCount.should.equal(0);
      ref2ReferenceRemoveSpy.callCount.should.equal(1);
      startRefReferenceInsertSpy.callCount.should.equal(0);
      startRefReferenceRemoveSpy.callCount.should.equal(1);
      resetHistory();

      // Change it to target2 while startRef is broken
      refParent.get('ref1', RESOLVE_NEVER).setValue('/target2');
      ref1insertSpy.callCount.should.equal(0);
      ref1removeSpy.callCount.should.equal(0);
      ref2insertSpy.callCount.should.equal(0);
      ref2removeSpy.callCount.should.equal(0);
      ref1ReferenceInsertSpy.callCount.should.equal(0);
      ref1ReferenceRemoveSpy.callCount.should.equal(0);
      ref2ReferenceInsertSpy.callCount.should.equal(0);
      ref2ReferenceRemoveSpy.callCount.should.equal(0);
      startRefReferenceInsertSpy.callCount.should.equal(0);
      startRefReferenceRemoveSpy.callCount.should.equal(0);
      resetHistory();

      // put back at startRef
      parentProp.insert('startRef', startRef);
      ref1insertSpy.callCount.should.equal(1);
      ref1removeSpy.callCount.should.equal(0);
      ref2insertSpy.callCount.should.equal(1);
      ref2removeSpy.callCount.should.equal(0);
      ref1ReferenceInsertSpy.callCount.should.equal(1);
      ref1ReferenceRemoveSpy.callCount.should.equal(0);
      ref2ReferenceInsertSpy.callCount.should.equal(1);
      ref2ReferenceRemoveSpy.callCount.should.equal(0);
      startRefReferenceInsertSpy.callCount.should.equal(1);
      startRefReferenceRemoveSpy.callCount.should.equal(0);
      resetHistory();

      // Break ref1 again
      refParent.get('ref1', RESOLVE_NEVER).setValue('/garbage');
      ref1insertSpy.callCount.should.equal(0);
      ref1removeSpy.callCount.should.equal(1);
      ref2insertSpy.callCount.should.equal(0);
      ref2removeSpy.callCount.should.equal(0);
      ref1ReferenceInsertSpy.callCount.should.equal(0);
      ref1ReferenceRemoveSpy.callCount.should.equal(0);
      ref2ReferenceInsertSpy.callCount.should.equal(0);
      ref2ReferenceRemoveSpy.callCount.should.equal(0);
      startRefReferenceInsertSpy.callCount.should.equal(0);
      startRefReferenceRemoveSpy.callCount.should.equal(0);
      resetHistory();

      // Remove parent
      workspace.remove('parentProp');
      ref1insertSpy.callCount.should.equal(0);
      ref1removeSpy.callCount.should.equal(0); // << not fired, bad reference
      ref2insertSpy.callCount.should.equal(0);
      ref2removeSpy.callCount.should.equal(1);
      ref1ReferenceInsertSpy.callCount.should.equal(0);
      ref1ReferenceRemoveSpy.callCount.should.equal(1);
      ref2ReferenceInsertSpy.callCount.should.equal(0);
      ref2ReferenceRemoveSpy.callCount.should.equal(1);
      startRefReferenceInsertSpy.callCount.should.equal(0);
      startRefReferenceRemoveSpy.callCount.should.equal(1);
      resetHistory();
    });

    // This test is similar to the last one, but the references go directly to a second reference,
    // instead of going to a property and then following a path
    it('direct chain of references', function () {
      const ref1insertSpy = sinon.spy();
      const ref1removeSpy = sinon.spy();
      const startRefReferenceInsertSpy = sinon.spy();
      const startRefReferenceRemoveSpy = sinon.spy();
      const ref1ReferenceInsertSpy = sinon.spy();
      const ref1ReferenceRemoveSpy = sinon.spy();
      const ref2ReferenceInsertSpy = sinon.spy();
      const ref2ReferenceRemoveSpy = sinon.spy();

      const resetHistory = () => {
        ref1insertSpy.resetHistory();
        ref1removeSpy.resetHistory();
        ref1ReferenceInsertSpy.resetHistory();
        ref1ReferenceRemoveSpy.resetHistory();
        ref2ReferenceInsertSpy.resetHistory();
        ref2ReferenceRemoveSpy.resetHistory();
        startRefReferenceInsertSpy.resetHistory();
        startRefReferenceRemoveSpy.resetHistory();
      };

      ParentDataBinding.registerOnPath('startRef.text', ['insert'], ref1insertSpy); // startRef->ref1->target1.text
      ParentDataBinding.registerOnPath('startRef.text', ['remove'], ref1removeSpy); // startRef->ref1->target1.text
      ParentDataBinding.registerOnPath('startRef', ['referenceRemove'], startRefReferenceRemoveSpy); // startRef
      ParentDataBinding.registerOnPath('startRef', ['referenceInsert'], startRefReferenceInsertSpy); // startRef
      dataBinder.register('BINDING', ParentTemplate.typeid, ParentDataBinding);

      // These are to check that they don't accidentally get fired
      ChildDataBinding.registerOnPath('refParent.ref1', ['referenceRemove'], ref1ReferenceRemoveSpy);
      ChildDataBinding.registerOnPath('refParent.ref1', ['referenceInsert'], ref1ReferenceInsertSpy);
      ChildDataBinding.registerOnPath('refParent.ref2', ['referenceRemove'], ref2ReferenceRemoveSpy);
      ChildDataBinding.registerOnPath('refParent.ref2', ['referenceInsert'], ref2ReferenceInsertSpy);
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ChildDataBinding);

      const target1 = PropertyFactory.create(ChildTemplate.typeid);
      const target2 = PropertyFactory.create(ChildTemplate.typeid);

      workspace.insert('target1', target1);
      workspace.insert('target2', target2);

      const refParent = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single', {
        ref1: '/target1',
        ref2: '/target2'
      });
      workspace.insert('refParent', refParent);

      const parentProp = PropertyFactory.create(ParentTemplate.typeid);
      workspace.insert('parentProp', parentProp);

      const startRef = PropertyFactory.create('Reference', 'single', '/refParent.ref1');
      parentProp.insert('startRef', startRef);

      // Simple insert fires going through the references
      ref1insertSpy.callCount.should.equal(1);
      ref1removeSpy.callCount.should.equal(0);
      ref1ReferenceInsertSpy.callCount.should.equal(0);
      ref1ReferenceRemoveSpy.callCount.should.equal(0);
      ref2ReferenceInsertSpy.callCount.should.equal(0);
      ref2ReferenceRemoveSpy.callCount.should.equal(0);
      startRefReferenceInsertSpy.callCount.should.equal(1);
      startRefReferenceRemoveSpy.callCount.should.equal(0);
      resetHistory();

      // break at startRef
      parentProp.remove('startRef');
      ref1insertSpy.callCount.should.equal(0);
      ref1removeSpy.callCount.should.equal(1);
      ref1ReferenceInsertSpy.callCount.should.equal(0);
      ref1ReferenceRemoveSpy.callCount.should.equal(0);
      ref2ReferenceInsertSpy.callCount.should.equal(0);
      ref2ReferenceRemoveSpy.callCount.should.equal(0);
      startRefReferenceInsertSpy.callCount.should.equal(0);
      startRefReferenceRemoveSpy.callCount.should.equal(1);
      resetHistory();

      // put back at startRef
      parentProp.insert('startRef', startRef);
      ref1insertSpy.callCount.should.equal(1);
      ref1removeSpy.callCount.should.equal(0);
      ref1ReferenceInsertSpy.callCount.should.equal(0);
      ref1ReferenceRemoveSpy.callCount.should.equal(0);
      ref2ReferenceInsertSpy.callCount.should.equal(0);
      ref2ReferenceRemoveSpy.callCount.should.equal(0);
      startRefReferenceInsertSpy.callCount.should.equal(1);
      startRefReferenceRemoveSpy.callCount.should.equal(0);
      resetHistory();

      // Break ref1
      refParent.get('ref1', RESOLVE_NEVER).setValue('/garbage');
      ref1insertSpy.callCount.should.equal(0);
      ref1removeSpy.callCount.should.equal(1);
      ref1ReferenceInsertSpy.callCount.should.equal(0);
      ref1ReferenceRemoveSpy.callCount.should.equal(0);
      ref2ReferenceInsertSpy.callCount.should.equal(0);
      ref2ReferenceRemoveSpy.callCount.should.equal(0);
      startRefReferenceInsertSpy.callCount.should.equal(0);
      startRefReferenceRemoveSpy.callCount.should.equal(0);
      resetHistory();

      // Fix it back to target2 (instead of target1)
      refParent.get('ref1', RESOLVE_NEVER).setValue('/target2');
      ref1insertSpy.callCount.should.equal(1);
      ref1removeSpy.callCount.should.equal(0);
      ref1ReferenceInsertSpy.callCount.should.equal(0);
      ref1ReferenceRemoveSpy.callCount.should.equal(0);
      ref2ReferenceInsertSpy.callCount.should.equal(0);
      ref2ReferenceRemoveSpy.callCount.should.equal(0);
      startRefReferenceInsertSpy.callCount.should.equal(0);
      startRefReferenceRemoveSpy.callCount.should.equal(0);
      resetHistory();

      // Change it to target1 - should 'remove' and 'insert'
      refParent.get('ref1', RESOLVE_NEVER).setValue('/target1');
      ref1insertSpy.callCount.should.equal(1);
      ref1removeSpy.callCount.should.equal(1);
      ref1ReferenceInsertSpy.callCount.should.equal(0);
      ref1ReferenceRemoveSpy.callCount.should.equal(0);
      ref2ReferenceInsertSpy.callCount.should.equal(0);
      ref2ReferenceRemoveSpy.callCount.should.equal(0);
      startRefReferenceInsertSpy.callCount.should.equal(0);
      startRefReferenceRemoveSpy.callCount.should.equal(0);
      resetHistory();

      // Leave it at target1, but using a different reference. Should not fire!
      refParent.get('ref1', RESOLVE_NEVER).setValue('../target1');
      ref1insertSpy.callCount.should.equal(0);
      ref1removeSpy.callCount.should.equal(0);
      ref1ReferenceInsertSpy.callCount.should.equal(0);
      ref1ReferenceRemoveSpy.callCount.should.equal(0);
      ref2ReferenceInsertSpy.callCount.should.equal(0);
      ref2ReferenceRemoveSpy.callCount.should.equal(0);
      startRefReferenceInsertSpy.callCount.should.equal(0);
      startRefReferenceRemoveSpy.callCount.should.equal(0);
      resetHistory();

      // break at startRef
      parentProp.remove('startRef');
      ref1insertSpy.callCount.should.equal(0);
      ref1removeSpy.callCount.should.equal(1);
      ref1ReferenceInsertSpy.callCount.should.equal(0);
      ref1ReferenceRemoveSpy.callCount.should.equal(0);
      ref2ReferenceInsertSpy.callCount.should.equal(0);
      ref2ReferenceRemoveSpy.callCount.should.equal(0);
      startRefReferenceInsertSpy.callCount.should.equal(0);
      startRefReferenceRemoveSpy.callCount.should.equal(1);
      resetHistory();

      // Change it to target2 while startRef is broken
      refParent.get('ref1', RESOLVE_NEVER).setValue('/target2');
      ref1insertSpy.callCount.should.equal(0);
      ref1removeSpy.callCount.should.equal(0);
      ref1ReferenceInsertSpy.callCount.should.equal(0);
      ref1ReferenceRemoveSpy.callCount.should.equal(0);
      ref2ReferenceInsertSpy.callCount.should.equal(0);
      ref2ReferenceRemoveSpy.callCount.should.equal(0);
      startRefReferenceInsertSpy.callCount.should.equal(0);
      startRefReferenceRemoveSpy.callCount.should.equal(0);
      resetHistory();

      // put back at startRef
      parentProp.insert('startRef', startRef);
      ref1insertSpy.callCount.should.equal(1);
      ref1removeSpy.callCount.should.equal(0);
      ref1ReferenceInsertSpy.callCount.should.equal(0);
      ref1ReferenceRemoveSpy.callCount.should.equal(0);
      ref2ReferenceInsertSpy.callCount.should.equal(0);
      ref2ReferenceRemoveSpy.callCount.should.equal(0);
      startRefReferenceInsertSpy.callCount.should.equal(1);
      startRefReferenceRemoveSpy.callCount.should.equal(0);
      resetHistory();

      // Break ref1 again
      refParent.get('ref1', RESOLVE_NEVER).setValue('/garbage');
      ref1insertSpy.callCount.should.equal(0);
      ref1removeSpy.callCount.should.equal(1);
      ref1ReferenceInsertSpy.callCount.should.equal(0);
      ref1ReferenceRemoveSpy.callCount.should.equal(0);
      ref2ReferenceInsertSpy.callCount.should.equal(0);
      ref2ReferenceRemoveSpy.callCount.should.equal(0);
      startRefReferenceInsertSpy.callCount.should.equal(0);
      startRefReferenceRemoveSpy.callCount.should.equal(0);
      resetHistory();

      // Remove parent
      workspace.remove('parentProp');
      ref1insertSpy.callCount.should.equal(0);
      ref1removeSpy.callCount.should.equal(0); // << not fired, bad reference
      ref1ReferenceInsertSpy.callCount.should.equal(0);
      ref1ReferenceRemoveSpy.callCount.should.equal(0);
      ref2ReferenceInsertSpy.callCount.should.equal(0);
      ref2ReferenceRemoveSpy.callCount.should.equal(0);
      startRefReferenceInsertSpy.callCount.should.equal(0);
      startRefReferenceRemoveSpy.callCount.should.equal(1);
      resetHistory();
    });

    it('referenceRemoved on root property', function () {
      const referenceInsertSpy = sinon.spy();
      const referenceRemoveSpy = sinon.spy();

      ParentDataBinding.registerOnPath('ref', ['referenceInsert'], referenceInsertSpy);
      ParentDataBinding.registerOnPath('ref', ['referenceRemove'], referenceRemoveSpy);
      dataBinder.register('BINDING', 'NodeProperty', ParentDataBinding);

      const ref = PropertyFactory.create('Reference');
      workspace.insert('ref', ref);

      referenceInsertSpy.callCount.should.equal(1);
      referenceRemoveSpy.callCount.should.equal(0);
      referenceInsertSpy.resetHistory();
      referenceRemoveSpy.resetHistory();

      workspace.remove('ref');
      referenceInsertSpy.callCount.should.equal(0);
      referenceRemoveSpy.callCount.should.equal(1);
      referenceInsertSpy.resetHistory();
      referenceRemoveSpy.resetHistory();
    });

    it('should be ok when going through references and traversing', function () {
      workspace.pushModifiedEventScope();
      dataBinder.pushBindingActivationScope();
      dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding);

      // Set things up so references that are followed will visit myChild1 and myChild4,
      // myChild4 will not have been traversed yet.
      const myChildrenArray = PropertyFactory.create('NodeProperty', 'array');
      workspace.insert('myChildren', myChildrenArray);
      const childrenChildren = [];
      for (let i = 0; i < 4; ++i) {
        const subArray = PropertyFactory.create('NodeProperty', 'array');
        subArray.push(PropertyFactory.create('NodeProperty', 'single'));
        myChildrenArray.push(subArray);
        childrenChildren[i] = subArray;
      }
      childrenChildren[0].get(0).insert('zero', PropertyFactory.create(ChildTemplate.typeid, 'single'));
      childrenChildren[1].get(0).insert('one', PropertyFactory.create('Reference', 'single'));
      childrenChildren[2].get(0).insert('two', PropertyFactory.create('Reference', 'single'));
      childrenChildren[3].get(0).insert('three', PropertyFactory.create(ChildTemplate.typeid, 'single'));

      childrenChildren[1].get([0, 'one'], RESOLVE_NO_LEAFS).setValue('/myChildren[0][0].zero');
      childrenChildren[2].get([0, 'two'], RESOLVE_NO_LEAFS).setValue('/myChildren[3][0].three');

      dataBinder.popBindingActivationScope();
      workspace.popModifiedEventScope();
    });

    it('should be able to bind to referenced properties', function () {
      // Add the reference parent pset
      var referenceParentPSet = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');
      var referenceParentPSet2 = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');

      // Add our child (referenced) pset
      var childPset = PropertyFactory.create(ChildTemplate.typeid, 'single');

      var referenceInsertSpy = sinon.spy();
      var referenceModifySpy = sinon.spy();
      var referenceRemoveSpy = sinon.spy();
      ParentDataBinding.registerOnPath('single_ref.text', ['insert'], referenceInsertSpy);
      ParentDataBinding.registerOnPath('single_ref.text', ['modify'], referenceModifySpy);
      ParentDataBinding.registerOnPath('single_ref.text', ['remove'], referenceRemoveSpy);

      var doubleReferenceInsertSpy = sinon.spy();
      var doubleReferenceModifySpy = sinon.spy();
      var doubleReferenceRemoveSpy = sinon.spy();
      ParentDataBinding.registerOnPath('single_ref.single_ref.text', ['insert'], doubleReferenceInsertSpy);
      ParentDataBinding.registerOnPath('single_ref.single_ref.text', ['modify'], doubleReferenceModifySpy);
      ParentDataBinding.registerOnPath('single_ref.single_ref.text', ['remove'], doubleReferenceRemoveSpy);

      // Register the DataBinding
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding, { context: 'single' });
      dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding, { context: 'all' });

      workspace.insert('myChild1', childPset);

      // referenceParentPSet should produce a ParentDataBinding
      // Most basic case, insert with an already valid reference
      referenceParentPSet.get('single_ref', RESOLVE_NEVER)
        .setValue('/myChild1');
      workspace.insert('myReferenceParent', referenceParentPSet);
      referenceInsertSpy.callCount.should.equal(1);
      referenceInsertSpy.resetHistory();

      // This should trigger the modify on the reference property
      referenceModifySpy.callCount.should.equal(0);
      childPset.get('text').setValue('newText');
      referenceModifySpy.callCount.should.equal(1);

      // This should trigger the remove handler
      referenceRemoveSpy.callCount.should.equal(0);
      workspace.remove('myChild1');
      referenceRemoveSpy.callCount.should.equal(1);

      // This should trigger the insert handler
      referenceInsertSpy.callCount.should.equal(0);
      workspace.insert('myChild1', childPset);
      referenceInsertSpy.callCount.should.equal(1);

      // Now we have a two stage reference
      doubleReferenceInsertSpy.callCount.should.equal(0);
      referenceParentPSet2.get('single_ref', RESOLVE_NEVER)
        .setValue('/myReferenceParent');
      workspace.insert('myReferenceParent2', referenceParentPSet2);
      doubleReferenceInsertSpy.callCount.should.equal(1);
      doubleReferenceInsertSpy.resetHistory();

      doubleReferenceModifySpy.callCount.should.equal(0);
      childPset.get('text').setValue('newText2');
      referenceParentPSet2.get(['single_ref', 'single_ref', 'text']).should.equal(childPset.get('text'));
      doubleReferenceModifySpy.callCount.should.equal(1);

      // This should trigger the remove handler
      doubleReferenceRemoveSpy.callCount.should.equal(0);
      workspace.remove('myChild1');
      doubleReferenceRemoveSpy.callCount.should.equal(1);

      // This should trigger the insert handler
      doubleReferenceInsertSpy.callCount.should.equal(0);
      workspace.insert('myChild1', childPset);
      doubleReferenceInsertSpy.callCount.should.equal(1);
    });

    it('should be able to bind to referenced properties with relative paths', function () {
      // Add the reference parent pset
      var referenceParentPSet = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');
      var referenceParentPSet2 = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');

      // Add our child (referenced) pset
      var childPset = PropertyFactory.create(ChildTemplate.typeid, 'single');

      var referenceInsertSpy = sinon.spy();
      var referenceModifySpy = sinon.spy();
      var referenceRemoveSpy = sinon.spy();
      ParentDataBinding.registerOnPath('single_ref.text', ['insert'], referenceInsertSpy);
      ParentDataBinding.registerOnPath('single_ref.text', ['modify'], referenceModifySpy);
      ParentDataBinding.registerOnPath('single_ref.text', ['remove'], referenceRemoveSpy);

      var doubleReferenceInsertSpy = sinon.spy();
      var doubleReferenceModifySpy = sinon.spy();
      var doubleReferenceRemoveSpy = sinon.spy();
      ParentDataBinding.registerOnPath('single_ref.single_ref.text', ['insert'], doubleReferenceInsertSpy);
      ParentDataBinding.registerOnPath('single_ref.single_ref.text', ['modify'], doubleReferenceModifySpy);
      ParentDataBinding.registerOnPath('single_ref.single_ref.text', ['remove'], doubleReferenceRemoveSpy);

      // Register the DataBinding
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding, { context: 'single' });
      dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding, { context: 'all' });

      workspace.insert('myChild1', childPset);
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      dataBinder._resetDebugCounters();
      const childDataBinding = dataBinder.resolve('/myChild1', 'BINDING');
      childDataBinding.should.be.instanceOf(ChildDataBinding);
      childDataBinding.onModify.callCount.should.equal(0);
      childDataBinding.onModify.resetHistory();

      // Most basic case, insert with an already valid reference
      referenceParentPSet.get('single_ref', RESOLVE_NEVER)
        .setValue('../../myChild1');
      workspace.insert('myParent', PropertyFactory.create('NodeProperty', 'single'));
      workspace.get('myParent').insert('myReferenceParent', referenceParentPSet);
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      dataBinder._resetDebugCounters();
      const parentDataBinding = dataBinder.resolve('/myParent.myReferenceParent', 'BINDING');
      parentDataBinding.should.be.instanceOf(ParentDataBinding);
      parentDataBinding.onModify.callCount.should.equal(0);
      parentDataBinding.onModify.resetHistory();

      // We should have received an insert when our reference became valid
      referenceInsertSpy.callCount.should.equal(1);
      referenceInsertSpy.resetHistory();

      // This should trigger the modify on the reference property
      referenceModifySpy.callCount.should.equal(0);
      childPset.get('text').setValue('newText');
      referenceModifySpy.callCount.should.equal(1);
      ////        parentDataBinding.onModify.callCount.should.equal(1);
      ////        parentDataBinding.onModify.resetHistory();

      // This should trigger the remove handler
      referenceRemoveSpy.callCount.should.equal(0);
      workspace.remove('myChild1');
      referenceRemoveSpy.callCount.should.equal(1);

      // This should trigger the insert handler
      referenceInsertSpy.callCount.should.equal(0);
      workspace.insert('myChild1', childPset);
      referenceInsertSpy.callCount.should.equal(1);

      // Now we have a two stage reference
      referenceParentPSet2.get('single_ref', RESOLVE_NEVER)
        .setValue('../myReferenceParent');
      workspace.get('myParent').insert('myReferenceParent2', referenceParentPSet2);

      doubleReferenceModifySpy.callCount.should.equal(0);
      referenceModifySpy.callCount.should.equal(1);
      childPset.get('text').setValue('newText2');
      doubleReferenceModifySpy.callCount.should.equal(1);
      referenceModifySpy.callCount.should.equal(2);

      doubleReferenceInsertSpy.callCount.should.equal(1);
      doubleReferenceInsertSpy.resetHistory();

      // This should trigger the remove handler
      doubleReferenceRemoveSpy.callCount.should.equal(0);
      referenceRemoveSpy.callCount.should.equal(1);
      workspace.remove('myChild1');
      doubleReferenceRemoveSpy.callCount.should.equal(1);
      referenceRemoveSpy.callCount.should.equal(2);

      // This should trigger the insert handler
      doubleReferenceInsertSpy.callCount.should.equal(0);
      referenceInsertSpy.callCount.should.equal(1);
      workspace.insert('myChild1', childPset);
      doubleReferenceInsertSpy.callCount.should.equal(1);
      referenceInsertSpy.callCount.should.equal(2);

      referenceInsertSpy.resetHistory();
      referenceModifySpy.resetHistory();
      referenceRemoveSpy.resetHistory();
      // Insert with an already valid reference *below* us so that the relative path has no leading '..'
      var childPset2 = PropertyFactory.create(ChildTemplate.typeid, 'single');
      workspace.get('myParent').get('myReferenceParent').insert('myChild2', childPset2);
      referenceParentPSet.get('single_ref', RESOLVE_NEVER)
        .setValue('myChild2');
      // Triggered when our reference became valid
      referenceInsertSpy.callCount.should.equal(1);
      referenceInsertSpy.resetHistory();
      // We also got a remove for the old property
      referenceRemoveSpy.callCount.should.equal(1);
      referenceRemoveSpy.resetHistory();

      // This should trigger the modify on the reference property
      referenceModifySpy.callCount.should.equal(0);
      childPset2.get('text').setValue('newText');
      referenceModifySpy.callCount.should.equal(1);
      referenceModifySpy.resetHistory();

      // This should trigger the remove handler
      referenceRemoveSpy.callCount.should.equal(0);
      workspace.get('myParent').get('myReferenceParent').remove('myChild2');
      referenceRemoveSpy.callCount.should.equal(1);
      referenceRemoveSpy.resetHistory();

      // This should trigger the insert handler
      referenceInsertSpy.callCount.should.equal(0);
      workspace.get('myParent').get('myReferenceParent').insert('myChild2', childPset2);
      referenceInsertSpy.callCount.should.equal(1);
      referenceInsertSpy.resetHistory();
    });

    it('should be able to bind to multi hops with relative paths', function () {
      // common root node to which we'll bind our DataBinding
      var root = PropertyFactory.create(NodeContainerTemplate.typeid, 'single');
      // "topology" map
      var topoMap = PropertyFactory.create(ParentTemplate.typeid, 'map');
      topoMap.insert('a', PropertyFactory.create(ParentTemplate.typeid, 'single'));
      var myTopo = topoMap.get('a');
      myTopo.insert('geoRef', PropertyFactory.create('Reference', 'single'));
      myTopo.get('geoRef',
        RESOLVE_NEVER).setValue('../../geoMap[foo]');
      // "geometry" map
      var geoMap = PropertyFactory.create(ParentTemplate.typeid, 'map');
      geoMap.insert('foo', PropertyFactory.create(ParentTemplate.typeid, 'single'));
      // my topo reference
      var topoRef = PropertyFactory.create('Reference', 'single');
      topoRef.setValue('topoMap[a]'); // this is a relative path on the same level as the reference itself!
      // build  the tree
      root.insert('topoRef', topoRef);
      root.insert('topoMap', topoMap);
      root.insert('geoMap', geoMap);
      // Register the DataBinding
      var referenceModifySpy = sinon.spy();
      ParentDataBinding.registerOnPath('topoRef.geoRef', ['modify'], referenceModifySpy);
      dataBinder.register('BINDING', NodeContainerTemplate.typeid, ParentDataBinding);

      workspace.insert('root', root);

      var textProp = geoMap.get(['foo', 'text']);
      expect(PropertyFactory.instanceOf(textProp, 'String', 'single')).to.be.true;
      textProp = root.get(['topoRef', 'geoRef', 'text']);
      expect(PropertyFactory.instanceOf(textProp, 'String', 'single')).to.be.true;
      referenceModifySpy.callCount.should.equal(0);
      textProp.setValue('forty-two');
      referenceModifySpy.callCount.should.equal(1);
    });

    it('should be able to bind to referenced primitives', function () {
      // Add the reference parent pset
      var referenceParentPSet = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');

      var referenceInsertSpy = sinon.spy();
      var referenceModifySpy = sinon.spy();
      var referenceRemoveSpy = sinon.spy();
      ParentDataBinding.registerOnPath('single_prim_ref', ['insert'], referenceInsertSpy);
      ParentDataBinding.registerOnPath('single_prim_ref', ['modify'], referenceModifySpy);
      ParentDataBinding.registerOnPath('single_prim_ref', ['remove'], referenceRemoveSpy);

      // Register the DataBinding
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding, { context: 'single' });

      // Insert a primitive value
      workspace.insert('string', PropertyFactory.create('String'));

      // Most basic case, insert with an already valid reference
      referenceInsertSpy.callCount.should.equal(0);
      referenceParentPSet.get('single_prim_ref', RESOLVE_NEVER)
        .setValue('/string');
      workspace.insert('myReferenceParent', referenceParentPSet);
      referenceInsertSpy.callCount.should.equal(1);

      // This should trigger the modify on the reference property
      referenceModifySpy.callCount.should.equal(0);
      workspace.get('string').setValue('newText');
      referenceModifySpy.callCount.should.equal(1);

      // This should trigger the remove handler
      referenceRemoveSpy.callCount.should.equal(0);
      workspace.remove('string');
      referenceRemoveSpy.callCount.should.equal(1);

      // This should trigger the insert handler
      referenceInsertSpy.callCount.should.equal(1);
      workspace.insert('string', PropertyFactory.create('String'));
      referenceInsertSpy.callCount.should.equal(2);
    });

    it('should be able to bind to the reference itself', function () {
      var referenceParentPSet = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');

      var refInsertSpy = sinon.spy(function (in_context) {
        in_context.getProperty().should.equal(referenceParentPSet.get('single_prim_ref', RESOLVE_NEVER));
      });
      var refModifySpy = sinon.spy();
      var refRemoveSpy = sinon.spy();
      ParentDataBinding.registerOnPath('single_prim_ref', ['referenceInsert'], refInsertSpy);
      ParentDataBinding.registerOnPath('single_prim_ref', ['referenceModify'], refModifySpy);
      ParentDataBinding.registerOnPath('single_prim_ref', ['referenceRemove'], refRemoveSpy);

      var referencedRemoveSpy = sinon.spy();
      ParentDataBinding.registerOnPath('dynamic_ref', ['referenceInsert'], refInsertSpy);
      ParentDataBinding.registerOnPath('dynamic_ref', ['referenceModify'], refModifySpy);
      ParentDataBinding.registerOnPath('dynamic_ref', ['referenceRemove'], refRemoveSpy);
      ParentDataBinding.registerOnPath('dynamic_ref', ['remove'], referencedRemoveSpy);

      // Register the DataBinding
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding, { context: 'single' });

      // Insert a primitive value
      workspace.insert('string', PropertyFactory.create('String'));

      // Most basic case, insert with an already valid reference
      referenceParentPSet.get('single_prim_ref', RESOLVE_NEVER)
        .setValue('/string');
      workspace.insert('myReferenceParent', referenceParentPSet);

      refInsertSpy.callCount.should.equal(1);

      referenceParentPSet.get('single_prim_ref', RESOLVE_NEVER)
        .setValue('/string2');

      refModifySpy.callCount.should.equal(1);

      workspace.remove(referenceParentPSet);

      refRemoveSpy.callCount.should.equal(1);
    });

    it('should be able to bind to the reference itself, existing references', function () {
      var referenceParentPSet = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');

      // Insert a primitive value
      workspace.insert('string', PropertyFactory.create('String'));

      // Most basic case, insert with an already valid reference
      referenceParentPSet.get('single_prim_ref', RESOLVE_NEVER).setValue('/string');
      workspace.insert('myReferenceParent', referenceParentPSet);

      var refInsertSpy = sinon.spy(function (in_context) {
        in_context.getProperty().should.equal(referenceParentPSet.get('single_prim_ref', RESOLVE_NEVER));
      });
      var refModifySpy = sinon.spy();
      var refRemoveSpy = sinon.spy();
      ParentDataBinding.registerOnPath('single_prim_ref', ['referenceInsert'], refInsertSpy);
      ParentDataBinding.registerOnPath('single_prim_ref', ['referenceModify'], refModifySpy);
      ParentDataBinding.registerOnPath('single_prim_ref', ['referenceRemove'], refRemoveSpy);

      var referencedRemoveSpy = sinon.spy();
      ParentDataBinding.registerOnPath('dynamic_ref', ['referenceInsert'], refInsertSpy);
      ParentDataBinding.registerOnPath('dynamic_ref', ['referenceModify'], refModifySpy);
      ParentDataBinding.registerOnPath('dynamic_ref', ['referenceRemove'], refRemoveSpy);
      ParentDataBinding.registerOnPath('dynamic_ref', ['remove'], referencedRemoveSpy);

      // Register the DataBinding
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding, { context: 'single' });

      refInsertSpy.callCount.should.equal(1);

      referenceParentPSet.get('single_prim_ref', RESOLVE_NEVER)
        .setValue('/string2');

      refModifySpy.callCount.should.equal(1);

      workspace.remove(referenceParentPSet);

      refRemoveSpy.callCount.should.equal(1);
    });

    it('should be able to bind to the reference itself', function () {
      var referenceParentPSet = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');

      var refInsertSpy = sinon.spy();
      var refModifySpy = sinon.spy();
      var refRemoveSpy = sinon.spy(function (in_modificationContext) {
        if (in_modificationContext instanceof ModificationContext) {
          in_modificationContext.getAbsolutePath().should.equal('/myReferenceParent.dynamic_ref');
        }
      });
      ParentDataBinding.registerOnPath('single_prim_ref', ['referenceInsert'], refInsertSpy);
      ParentDataBinding.registerOnPath('single_prim_ref', ['referenceModify'], refModifySpy);
      ParentDataBinding.registerOnPath('single_prim_ref', ['referenceRemove'], refRemoveSpy);

      var referencedRemoveSpy = sinon.spy();
      ParentDataBinding.registerOnPath('dynamic_ref', ['referenceInsert'], refInsertSpy);
      ParentDataBinding.registerOnPath('dynamic_ref', ['referenceModify'], refModifySpy);
      ParentDataBinding.registerOnPath('dynamic_ref', ['referenceRemove'], refRemoveSpy);
      ParentDataBinding.registerOnPath('dynamic_ref', ['remove'], referencedRemoveSpy);

      // Register the DataBinding
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding, { context: 'single' });

      // Insert a primitive value
      workspace.insert('string', PropertyFactory.create('String'));

      // Most basic case, insert with an already valid reference
      referenceParentPSet.get('single_prim_ref', RESOLVE_NEVER)
        .setValue('/string');
      workspace.insert('myReferenceParent', referenceParentPSet);

      // This should not trigger the modify on the reference property
      refModifySpy.callCount.should.equal(0);
      workspace.get('string').setValue('newText');
      refModifySpy.callCount.should.equal(0);

      // This should not trigger the remove handler
      refRemoveSpy.callCount.should.equal(0);
      workspace.remove('string');
      refRemoveSpy.callCount.should.equal(0);

      // This should not trigger the insert handler
      refInsertSpy.callCount.should.equal(1);
      workspace.insert('string', PropertyFactory.create('String'));
      refInsertSpy.callCount.should.equal(1);

      // This should trigger the remove handler
      refRemoveSpy.callCount.should.equal(0);
      workspace.remove('myReferenceParent');
      refRemoveSpy.callCount.should.equal(1);
      workspace.insert('myReferenceParent', referenceParentPSet);
      refInsertSpy.callCount.should.equal(2);

      refInsertSpy.resetHistory();
      refModifySpy.resetHistory();
      refRemoveSpy.resetHistory();

      refInsertSpy.callCount.should.equal(0);
      referenceParentPSet.insert('dynamic_ref', PropertyFactory.create('Reference'));
      refInsertSpy.callCount.should.equal(1);

      refModifySpy.callCount.should.equal(0);
      referenceParentPSet.get('dynamic_ref', RESOLVE_NEVER)
        .setValue('/string');
      refModifySpy.callCount.should.equal(1);

      // This should not trigger the modify on the reference property
      workspace.get('string').setValue('newText');
      refModifySpy.callCount.should.equal(1);

      // This should not trigger the remove handler
      workspace.remove('string');
      refRemoveSpy.callCount.should.equal(0);
      referencedRemoveSpy.callCount.should.equal(1);

      // This should not trigger the insert handler
      workspace.insert('string', PropertyFactory.create('String'));
      refInsertSpy.callCount.should.equal(1);

      refRemoveSpy.callCount.should.equal(0);
      referenceParentPSet.remove('dynamic_ref');
      refRemoveSpy.callCount.should.equal(1);
      referencedRemoveSpy.callCount.should.equal(1);
    });

    it('should be able to bind to the path __registeredDataBindingHandlers and __registeredHandler', function () {
      // The keys __registeredDataBindingHandlers and __registeredHandler are used internally in our data-structures
      // we do escaping to avoid name conflicts, and thus this test serves to check that we actually escape
      // everywhere we have to
      var referenceParentPSet = PropertyFactory.create(NodeContainerTemplate.typeid, 'single');

      var refInsertSpy1 = sinon.spy();
      var refModifySpy1 = sinon.spy();
      var refRemoveSpy1 = sinon.spy();
      ParentDataBinding.registerOnPath('__registeredDataBindingHandlers.__subProperty', ['insert'], refInsertSpy1);
      ParentDataBinding.registerOnPath('__registeredDataBindingHandlers.__subProperty', ['modify'], refModifySpy1);
      ParentDataBinding.registerOnPath('__registeredDataBindingHandlers.__subProperty', ['remove'], refRemoveSpy1);

      // Register the DataBinding
      dataBinder.register('BINDING', NodeContainerTemplate.typeid, ParentDataBinding, { context: 'single' });

      // Insert a primitive value
      var nodeProp = PropertyFactory.create('NodeProperty');
      workspace.insert('__registeredHandler', nodeProp);
      nodeProp.insert('__subProperty', PropertyFactory.create('String'));

      // Most basic case, insert with an already valid reference
      workspace.insert('myNodeProperty', referenceParentPSet);
      referenceParentPSet.insert('__registeredDataBindingHandlers', PropertyFactory.create('Reference', undefined,
        '/__registeredHandler'));

      // We should have gotten an insert when the ref became valid
      refInsertSpy1.callCount.should.equal(1);
      refInsertSpy1.resetHistory();

      // This should not trigger the modify on the reference property
      refModifySpy1.callCount.should.equal(0);
      nodeProp.get('__subProperty').setValue('newText');
      refModifySpy1.callCount.should.equal(1);

      // This should not trigger the remove handler
      refRemoveSpy1.callCount.should.equal(0);
      nodeProp.remove('__subProperty');
      refRemoveSpy1.callCount.should.equal(1);

      // This should trigger the insert handler
      refInsertSpy1.callCount.should.equal(0);
      nodeProp.insert('__subProperty', PropertyFactory.create('String'));
      refInsertSpy1.callCount.should.equal(1);
    });

    it('should be able to modify references', function () {
      // Add the reference parent pset
      var referenceParentPSet = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');

      // Add our child (referenced) pset
      var childPset1 = PropertyFactory.create(ChildTemplate.typeid, 'single');
      var childPset2 = PropertyFactory.create(ChildTemplate.typeid, 'single');

      var referenceInsertSpy = sinon.spy();
      var referenceModifySpy = sinon.spy();
      var referenceRemoveSpy = sinon.spy();
      ParentDataBinding.registerOnPath('single_ref.text', ['insert'], referenceInsertSpy);
      ParentDataBinding.registerOnPath('single_ref.text', ['modify'], referenceModifySpy);
      ParentDataBinding.registerOnPath('single_ref.text', ['remove'], referenceRemoveSpy);

      // Register the DataBinding
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding, { context: 'single' });
      dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding, { context: 'all' });

      // parentPset should produce a ParentDataBinding
      workspace.insert('myChild1', childPset1);
      workspace.insert('myChild2', childPset2);
      dataBinder._dataBindingCreatedCounter.should.equal(2);
      dataBinder._resetDebugCounters();

      // We insert with an already valid reference
      referenceParentPSet.get('single_ref', RESOLVE_NEVER)
        .setValue('/myChild1');
      workspace.insert('myReferenceParent', referenceParentPSet);

      // references resolved, we get an insert
      referenceInsertSpy.callCount.should.equal(1);
      referenceInsertSpy.resetHistory();

      dataBinder._dataBindingCreatedCounter.should.equal(1);
      dataBinder._resetDebugCounters();
      const parentDataBinding = dataBinder.resolve('/myReferenceParent', 'BINDING');
      parentDataBinding.should.be.instanceOf(ParentDataBinding);
      parentDataBinding.onModify.callCount.should.equal(0);
      parentDataBinding.onModify.resetHistory();

      // And then change to a new reference
      referenceParentPSet.get('single_ref', RESOLVE_NEVER)
        .setValue('/myChild2');
      parentDataBinding.onModify.callCount.should.equal(1);
      parentDataBinding.onModify.resetHistory();

      // Reference changed, we get a remove and an insert
      referenceRemoveSpy.callCount.should.equal(1);
      referenceInsertSpy.callCount.should.equal(1);
      referenceRemoveSpy.resetHistory();
      referenceInsertSpy.resetHistory();

      // This should trigger the modify on the reference property
      referenceModifySpy.callCount.should.equal(0);
      childPset2.get('text').setValue('newText');
      referenceModifySpy.callCount.should.equal(1);
      ////        parentDataBinding.onModify.callCount.should.equal(1);

      // This should trigger the remove handler
      referenceRemoveSpy.callCount.should.equal(0);
      workspace.remove('myChild2');
      referenceRemoveSpy.callCount.should.equal(1);

      // This should trigger the insert handler
      referenceInsertSpy.callCount.should.equal(0);
      workspace.insert('myChild2', childPset2);
      referenceInsertSpy.callCount.should.equal(1);

      // Make sure the old handlers have been removed
      childPset1.get('text').setValue('newText');
      referenceModifySpy.callCount.should.equal(1);
      workspace.remove('myChild1');
      referenceRemoveSpy.callCount.should.equal(1);
      workspace.insert('myChild1', childPset1);
      referenceInsertSpy.callCount.should.equal(1);

      // Make sure, removing a reference also removes its
      // bound callbacks
      workspace.remove('myReferenceParent');

      // This should no longer trigger the modify on the reference property
      referenceModifySpy.callCount.should.equal(1);
      childPset2.get('text').setValue('newText2');
      referenceModifySpy.callCount.should.equal(1);
    });

    it('should provide access to the DataBinding and Property', function () {
      var referenceChangedSpy = sinon.spy(function (in_referenceChangedContext) {
        var prop = in_referenceChangedContext.getProperty();
        if (prop) {
          expect(PropertyFactory.instanceOf(prop, 'String', 'single')).to.be.true;
        }
      });
      var nodeParentRefChangedSpy = sinon.spy(function (in_referenceChangedContext) {
        let dataBinding = in_referenceChangedContext.getDataBinding('ChildDataBinding1');
        // We can't assume access to other databindings when the system is being torn down
        if (dataBinding) {
          dataBinding.should.be.instanceOf(ChildDataBinding);
        }
        dataBinding = in_referenceChangedContext.getDataBinding('ChildDataBinding2');
        if (dataBinding) {
          dataBinding.should.be.instanceOf(ChildDataBinding);
        }
      });

      ParentDataBinding.registerOnPath('single_ref.text', ['referenceChanged'], referenceChangedSpy);
      ParentDataBinding.registerOnPath('single_ref.child1', ['referenceChanged'], nodeParentRefChangedSpy);

      // Register the DataBinding
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding, { context: 'single' });
      dataBinder.register('BINDING', NodeContainerTemplate.typeid, ParentDataBinding, { context: 'single' });
      dataBinder.register('ChildDataBinding1', ChildTemplate.typeid, ChildDataBinding, { context: 'all' });
      dataBinder.register('ChildDataBinding2', ChildTemplate.typeid, ChildDataBinding, { context: 'all' });

      // Add the reference parent pset
      var referenceParentPSet = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');
      var nodeParentPSet = PropertyFactory.create(NodeContainerTemplate.typeid, 'single');

      // Add our child (referenced) pset
      var childPset1 = PropertyFactory.create(ChildTemplate.typeid, 'single');
      var childPset2 = PropertyFactory.create(ChildTemplate.typeid, 'single');

      // insert our target properties
      workspace.insert('myChild1', childPset1);
      workspace.insert('myChild2', childPset2);
      workspace.insert('nodeParent', nodeParentPSet);
      nodeParentPSet.insert('child1', PropertyFactory.create(ChildTemplate.typeid, 'single'));
      // We insert with an already valid reference
      referenceParentPSet.get('single_ref', RESOLVE_NEVER)
        .setValue('/myChild1');
      workspace.insert('myReferenceParent', referenceParentPSet);
      referenceChangedSpy.callCount.should.equal(1);
      referenceParentPSet.get('single_ref', RESOLVE_NEVER)
        .setValue('/invalid_ref_value');
      referenceChangedSpy.callCount.should.equal(2);

      // Other ref
      referenceParentPSet.get('single_ref', RESOLVE_NEVER)
        .setValue('/myChild2');
      referenceChangedSpy.callCount.should.equal(3);

      // Change it to the nodecontainer to test DataBinding at the relative path
      referenceChangedSpy.resetHistory();
      referenceParentPSet.get('single_ref', RESOLVE_NEVER)
        .setValue('/nodeParent');
      // remove, and insert for nodeParent, which also has a 'text' field
      referenceChangedSpy.callCount.should.equal(2);
      nodeParentRefChangedSpy.callCount.should.equal(1); // insert for nodeParent
    });

    const crazyTest = hopName => function () {
      // Add the reference parent pset
      var referenceParentPSet = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');
      var referenceParentPSet2 = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');
      var nodeParentPSet = PropertyFactory.create(NodeContainerTemplate.typeid, 'single');
      var nodeParentPSet2 = PropertyFactory.create(NodeContainerTemplate.typeid, 'single');

      // Add our child (referenced) pset
      var childPset1 = PropertyFactory.create(ChildTemplate.typeid, 'single');
      var childPset2 = PropertyFactory.create(ChildTemplate.typeid, 'single');

      var referenceInsertSpy = sinon.spy(function (in_modificationContext) {
        var prop = in_modificationContext.getProperty();
        expect(PropertyFactory.instanceOf(prop, 'String', 'single')).to.be.true;
      });
      var referenceModifySpy = sinon.spy(function (in_modificationContext) {
        var prop = in_modificationContext.getProperty();
        expect(PropertyFactory.instanceOf(prop, 'String', 'single')).to.be.true;
      });
      var referenceRemoveSpy = sinon.spy();
      ParentDataBinding.registerOnPath('single_ref.text', ['insert'], referenceInsertSpy);
      ParentDataBinding.registerOnPath('single_ref.text', ['modify'], referenceModifySpy);
      ParentDataBinding.registerOnPath('single_ref.text', ['remove'], referenceRemoveSpy);

      var doubleReferenceInsertSpy = sinon.spy(function (in_modificationContext) {
        var prop = in_modificationContext.getProperty();
        expect(PropertyFactory.instanceOf(prop, 'String', 'single')).to.be.true;
      });
      var doubleReferenceModifySpy = sinon.spy(function (in_modificationContext) {
        var prop = in_modificationContext.getProperty();
        expect(PropertyFactory.instanceOf(prop, 'String', 'single')).to.be.true;
      });
      var doubleReferenceRemoveSpy = sinon.spy();
      var doubleReferenceRefChangedSpy = sinon.spy();
      ParentDataBinding.registerOnPath('single_ref.' + hopName + '.text', ['insert'], doubleReferenceInsertSpy);
      ParentDataBinding.registerOnPath('single_ref.' + hopName + '.text', ['modify'], doubleReferenceModifySpy);
      ParentDataBinding.registerOnPath('single_ref.' + hopName + '.text', ['remove'], doubleReferenceRemoveSpy);
      ParentDataBinding.registerOnPath('single_ref.' + hopName + '.text', ['referenceChanged'],
        doubleReferenceRefChangedSpy);

      // TODO: Test bind to multi hops
      //ParentDataBinding.registerOnPath('single_ref.single_ref',
      // ['modify'], doubleReferenceRemoveSpy);

      // Register the DataBinding
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding, { context: 'single' });
      dataBinder.register('BINDING', NodeContainerTemplate.typeid, ParentDataBinding, { context: 'single' });

      var incCounter = 0;
      var from = undefined;
      var to = '/myChild1.text';
      var runTests = function (in_increment, in_refChangedCount) {
        doubleReferenceRefChangedSpy.callCount.should.equal(in_refChangedCount);
        // We should have a property if 'to' is defined
        expect(!!doubleReferenceRefChangedSpy.getCall(0).args[0].getProperty()).to.equal(!!to);
        if (to) {
          expect(doubleReferenceRefChangedSpy.getCall(0).args[0].getProperty().getAbsolutePath()).to.equal(to);
        }
        doubleReferenceRefChangedSpy.resetHistory();

        if (in_refChangedCount === 1) {
          var dummy = from;
          from = to;
          to = dummy;
        }

        doubleReferenceModifySpy.callCount.should.equal(0);
        childPset1.get('text').setValue('newText' + (incCounter++));
        doubleReferenceModifySpy.callCount.should.equal(in_increment);

        // This should trigger the remove handler
        doubleReferenceRemoveSpy.callCount.should.equal(in_refChangedCount - in_increment);
        doubleReferenceRemoveSpy.resetHistory();
        workspace.remove('myChild1');
        doubleReferenceRemoveSpy.callCount.should.equal(in_increment);

        // This should trigger the insert handler
        // the insert was already called once when the reference was made valid
        doubleReferenceInsertSpy.callCount.should.equal(in_increment);
        doubleReferenceInsertSpy.resetHistory();
        workspace.insert('myChild1', childPset1);
        doubleReferenceInsertSpy.callCount.should.equal(in_increment);

        doubleReferenceRefChangedSpy.callCount.should.equal(2 * in_increment);
        doubleReferenceInsertSpy.resetHistory();
        doubleReferenceModifySpy.resetHistory();
        doubleReferenceRemoveSpy.resetHistory();
        doubleReferenceRefChangedSpy.resetHistory();
      };

      // parentPset should produce a ParentDataBinding
      workspace.insert('myChild1', childPset1);
      workspace.insert('myChild2', childPset2);

      // Create a second parent
      referenceParentPSet2.get(hopName, RESOLVE_NEVER)
        .setValue('/myChild1');
      workspace.insert('myReferenceParent2', referenceParentPSet2);

      // We insert with an already valid reference
      referenceParentPSet.get('single_ref', RESOLVE_NEVER)
        .setValue('/myReferenceParent2');
      workspace.insert('myReferenceParent', referenceParentPSet);

      // This should trigger the modify on the reference property
      runTests(1, 1);

      // This should unbind the tests
      workspace.remove('myReferenceParent');
      runTests(0, 1);

      // Restore the references
      workspace.insert('myReferenceParent', referenceParentPSet);
      runTests(1, 1);

      // Changing the reference should unbind all tests again
      referenceParentPSet.get('single_ref', RESOLVE_NEVER)
        .setValue('/invalid_ref_value');
      runTests(0, 1);

      // Restore the references
      referenceParentPSet.get('single_ref', RESOLVE_NEVER)
        .setValue('/myReferenceParent2');
      runTests(1, 1);

      // Now delete the node in the middle of the reference chain
      workspace.remove('myReferenceParent2');
      runTests(0, 1);

      // Restore the references
      workspace.insert('myReferenceParent2', referenceParentPSet2);
      runTests(1, 1);

      // Changing the nested reference should also unbind all tests
      referenceParentPSet2.get(hopName, RESOLVE_NEVER)
        .setValue('/invalid_ref_value');
      runTests(0, 1);

      // Restore the references
      referenceParentPSet2.get(hopName, RESOLVE_NEVER)
        .setValue('/myChild1');
      runTests(1, 1);

      // Test the same for dynamically inserting and removing references
      workspace.remove('myReferenceParent2', referenceParentPSet2);
      workspace.remove('myReferenceParent', referenceParentPSet);
      workspace.insert('myReferenceParent2', nodeParentPSet2);
      workspace.insert('myReferenceParent', nodeParentPSet);
      nodeParentPSet2.insert(hopName, PropertyFactory.create('Reference', undefined, '/myChild1'));
      nodeParentPSet.insert('single_ref', PropertyFactory.create('Reference', undefined, '/myReferenceParent2'));
      runTests(1, 2);

      // Removing the first property should unregister the handlers
      nodeParentPSet.remove('single_ref');
      runTests(0, 1);

      // Inserting it should restore the handlers
      nodeParentPSet.insert('single_ref', PropertyFactory.create('Reference', undefined, '/myReferenceParent2'));
      runTests(1, 1);

      // Removing the first property should unregister the handlers
      nodeParentPSet2.remove(hopName);
      runTests(0, 1);

      // Inserting it should restore the handlers
      nodeParentPSet2.insert(hopName, PropertyFactory.create('Reference', undefined, '/myChild1'));
      runTests(1, 1);
    };

    it('should give the right databinding going through references', () => {
      const myData = PropertyFactory.create(ChildTemplate.typeid);
      workspace.insert('myData', myData);
      const myOtherData = PropertyFactory.create(ChildTemplate.typeid);
      workspace.insert('myOtherData', myOtherData);

      // Set up a chain; ref3 points to ref2 points to ref1 points to myData
      const myReferences = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single', {
        ref1: '/myData',
        ref2: 'ref1',
        ref3: 'ref2'
      });
      workspace.insert('myReferences', myReferences);

      dataBinder.register('BINDING', 'String', ChildDataBinding);

      let expected = undefined;
      let failed = false;
      const checkBinding = sinon.spy(modificationContext => {
        if (!(modificationContext.getDataBinding() instanceof ChildDataBinding)) {
          failed = true;
        }
        const target = modificationContext.getDataBinding().getProperty().getParent();
        failed = failed || (target !== expected);
      });

      class MyBinding extends DataBinding {
        static initialize() {
          this.registerOnPath('ref1.text', ['insert', 'modify'], checkBinding);
          this.registerOnPath('ref2.text', ['insert', 'modify'], checkBinding);
          this.registerOnPath('ref3.text', ['insert', 'modify'], checkBinding);
        }
      }
      MyBinding.initialize();

      expected = myData;
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, MyBinding);
      checkBinding.callCount.should.equal(3);
      failed.should.equal(false);

      myData.get('text').setValue('hello');
      checkBinding.callCount.should.equal(6);
      failed.should.equal(false);

      // Change ref1 to point to other data
      checkBinding.resetHistory();
      expected = myOtherData;
      myReferences.get('ref1', RESOLVE_NEVER).setValue('/myOtherData');
      checkBinding.callCount.should.equal(3); // ref1, ref2 and ref3
      failed.should.equal(false);

      // Go back
      checkBinding.resetHistory();
      expected = myData;
      myReferences.get('ref1', RESOLVE_NEVER).setValue('/myData');
      checkBinding.callCount.should.equal(3); // ref1, ref2 and ref3
      failed.should.equal(false);

      // Change ref2 to point to other data
      checkBinding.resetHistory();
      expected = myOtherData;
      myReferences.get('ref2', RESOLVE_NEVER).setValue('/myOtherData');
      checkBinding.callCount.should.equal(2); // ref2 and ref3
      failed.should.equal(false);

      // Go back
      checkBinding.resetHistory();
      expected = myData;
      myReferences.get('ref2', RESOLVE_NEVER).setValue('/myData');
      checkBinding.callCount.should.equal(2); // ref2 and ref3
      failed.should.equal(false);

      // Change ref3 to point to other data
      checkBinding.resetHistory();
      expected = myOtherData;
      myReferences.get('ref3', RESOLVE_NEVER).setValue('/myOtherData');
      checkBinding.callCount.should.equal(1); // ref3
      failed.should.equal(false);

      // Go back
      checkBinding.resetHistory();
      expected = myData;
      myReferences.get('ref3', RESOLVE_NEVER).setValue('/myData');
      checkBinding.callCount.should.equal(1); // ref3
      failed.should.equal(false);
    });

    it('should give the right property in a primitive array', () => {
      const myData = PropertyFactory.create(PrimitiveChildrenTemplate.typeid);
      workspace.insert('myData', myData);

      const stringArray = myData.get('arrayOfStrings');

      stringArray.push('hey');
      stringArray.push('bee');
      stringArray.push('sea');

      let failed = false;
      const checkBinding = sinon.spy((index, modificationContext) => {
        const element = modificationContext._getPropertyElement();
        failed = failed || element.getChildToken() !== index;
        failed = failed || element.getProperty() !== stringArray;
      });

      class MyBinding extends DataBinding {
        static initialize() {
          this.registerOnPath('arrayOfStrings', ['collectionInsert', 'collectionModify'], checkBinding);
        }
      }
      MyBinding.initialize();

      dataBinder.register('BINDING', PrimitiveChildrenTemplate.typeid, MyBinding);
      checkBinding.callCount.should.equal(3);
      failed.should.equal(false);

      stringArray.set(0, 'hey there');
      stringArray.set(1, 'bee cool');
      stringArray.set(2, 'sea here');
      checkBinding.callCount.should.equal(6);
      failed.should.equal(false);
    });

    it('should be able to modify multi-hop references', crazyTest('single_ref'));

    it('should be able to modify multi-hop references with different hops', crazyTest('ref1'));

    it('should be able to handle binding to multi-hop references', function () {
      // Add the reference parent pset
      var referenceParentPSet = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');
      var referenceParentPSet2 = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');

      // Add our child (referenced) pset
      var childPset1 = PropertyFactory.create(ChildTemplate.typeid, 'single');
      var childPset2 = PropertyFactory.create(ChildTemplate.typeid, 'single');

      var doubleReferenceInsertSpy = sinon.spy();
      var doubleReferenceModifySpy = sinon.spy();
      var doubleReferenceRemoveSpy = sinon.spy();
      ParentDataBinding.registerOnPath('single_ref.single_ref', ['referenceInsert'], doubleReferenceInsertSpy);
      ParentDataBinding.registerOnPath('single_ref.single_ref', ['referenceModify'], doubleReferenceModifySpy);
      ParentDataBinding.registerOnPath('single_ref.single_ref', ['referenceRemove'], doubleReferenceRemoveSpy);

      // Register the DataBinding
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding, { context: 'single' });
      dataBinder.register('BINDING', NodeContainerTemplate.typeid, ParentDataBinding, { context: 'single' });
      dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding, { context: 'all' });

      // parentPset should produce a ParentDataBinding
      workspace.insert('myChild1', childPset1);
      workspace.insert('myChild2', childPset2);

      // We insert with a not yet valid reference
      referenceParentPSet.get('single_ref', RESOLVE_NEVER)
        .setValue('/myReferenceParent2');
      workspace.insert('myReferenceParent', referenceParentPSet);

      // Create a second parent
      referenceParentPSet2.get('single_ref', RESOLVE_NEVER)
        .setValue('/myChild1');
      workspace.insert('myReferenceParent2', referenceParentPSet2);
      doubleReferenceInsertSpy.callCount.should.equal(1);

      referenceParentPSet2.get('single_ref', RESOLVE_NEVER)
        .setValue('/myChild2');
      doubleReferenceModifySpy.callCount.should.equal(1);

      workspace.remove('myReferenceParent2');
      doubleReferenceRemoveSpy.callCount.should.equal(1);
    });

    it('should be able to handle binding to multi-hop references', function () {
      // Add the reference parent pset
      var referenceParentPSet = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');
      var referenceParentPSet2 = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');

      // Add our child (referenced) pset
      var childPset1 = PropertyFactory.create(ChildTemplate.typeid, 'single');
      var childPset2 = PropertyFactory.create(ChildTemplate.typeid, 'single');

      var doublyReferencedInsertSpy = sinon.spy();
      var doublyReferencedModifySpy = sinon.spy();
      var doublyReferencedRemoveSpy = sinon.spy();
      ParentDataBinding.registerOnPath('single_ref.single_ref', ['insert'], doublyReferencedInsertSpy);
      ParentDataBinding.registerOnPath('single_ref.single_ref', ['modify'], doublyReferencedModifySpy);
      ParentDataBinding.registerOnPath('single_ref.single_ref', ['remove'], doublyReferencedRemoveSpy);

      // Register the DataBinding
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding, { context: 'single' });
      dataBinder.register('BINDING', NodeContainerTemplate.typeid, ParentDataBinding, { context: 'single' });
      dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding, { context: 'all' });

      // parentPset should produce a ParentDataBinding
      workspace.insert('myChild1', childPset1);
      workspace.insert('myChild2', childPset2);

      // We insert with a not yet valid reference
      referenceParentPSet.get('single_ref', RESOLVE_NEVER)
        .setValue('/myReferenceParent2');
      workspace.insert('myReferenceParent', referenceParentPSet);

      // Create a second parent
      referenceParentPSet2.get('single_ref', RESOLVE_NEVER)
        .setValue('/myChild1');
      workspace.insert('myReferenceParent2', referenceParentPSet2);
      doublyReferencedInsertSpy.callCount.should.equal(1);
      doublyReferencedRemoveSpy.callCount.should.equal(0);

      // Change from the first parent to the second, we should get a remove then an insert
      referenceParentPSet2.get('single_ref', RESOLVE_NEVER)
        .setValue('/myChild2');
      doublyReferencedInsertSpy.callCount.should.equal(2);
      doublyReferencedRemoveSpy.callCount.should.equal(1);

      doublyReferencedModifySpy.callCount.should.equal(0);
      childPset2.get('text').setValue('hello');
      doublyReferencedModifySpy.callCount.should.equal(1);

      // Now remove the reference completely; we should get a remove
      workspace.remove('myReferenceParent2');
      doublyReferencedInsertSpy.callCount.should.equal(2);
      doublyReferencedRemoveSpy.callCount.should.equal(2);

      // Modify while the links are broken should not notify
      doublyReferencedModifySpy.callCount.should.equal(1);
      childPset2.get('text').setValue('hello again');
      doublyReferencedModifySpy.callCount.should.equal(1);
    });

    it('binding to multi-hop references, reinserting part of the chain (LYNXDEV-7596)', function () {
      // Add the reference parent pset
      var referenceParentPSet = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');
      var referenceParentPSet2 = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');

      // Add our child (referenced) pset
      var childPset1 = PropertyFactory.create(ChildTemplate.typeid, 'single');
      var childPset2 = PropertyFactory.create(ChildTemplate.typeid, 'single');

      var doublyReferencedInsertSpy = sinon.spy();
      var doublyReferencedRemoveSpy = sinon.spy();
      ParentDataBinding.registerOnPath('single_ref.single_ref', ['insert'], doublyReferencedInsertSpy);
      ParentDataBinding.registerOnPath('single_ref.single_ref', ['remove'], doublyReferencedRemoveSpy);

      // Register the DataBinding
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding, { context: 'single' });
      dataBinder.register('BINDING', NodeContainerTemplate.typeid, ParentDataBinding, { context: 'single' });
      dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding, { context: 'all' });

      // parentPset should produce a ParentDataBinding
      workspace.insert('myChild1', childPset1);
      workspace.insert('myChild2', childPset2);

      // We insert with a not yet valid reference
      referenceParentPSet.get('single_ref', RESOLVE_NEVER)
        .setValue('/myReferenceParent2');
      workspace.insert('myReferenceParent', referenceParentPSet);

      // Create a second parent
      referenceParentPSet2.get('single_ref', RESOLVE_NEVER)
        .setValue('/myChild1');
      workspace.insert('myReferenceParent2', referenceParentPSet2);
      doublyReferencedInsertSpy.callCount.should.equal(1);
      doublyReferencedRemoveSpy.callCount.should.equal(0);

      // Change from the first parent to the second, we should get a remove then an insert
      referenceParentPSet2.get('single_ref', RESOLVE_NEVER)
        .setValue('/myChild2');
      doublyReferencedInsertSpy.callCount.should.equal(2);
      doublyReferencedRemoveSpy.callCount.should.equal(1);

      // Now remove the reference completely; we should get a remove
      workspace.remove('myReferenceParent2');
      doublyReferencedInsertSpy.callCount.should.equal(2);
      doublyReferencedRemoveSpy.callCount.should.equal(2);

      // Put the intermediate node back
      workspace.insert('myReferenceParent2', referenceParentPSet2);

      // Currently, inserting it back again does not fire the insert
      // LYNXDEV-7596
      doublyReferencedInsertSpy.callCount.should.equal(3);
      doublyReferencedRemoveSpy.callCount.should.equal(2);

      // Now remove the reference completely; we should get a remove
      workspace.remove('myReferenceParent2');
      doublyReferencedInsertSpy.callCount.should.equal(3);
      doublyReferencedRemoveSpy.callCount.should.equal(3);
    });

    // Don't give me reference change if I'm not a reference
    it('should not tell me about references if im not a reference', function () {
      var myChild = PropertyFactory.create(ChildTemplate.typeid, 'single');

      var referenceInsertSpy = sinon.spy();
      var referenceModifySpy = sinon.spy();
      var referenceRemoveSpy = sinon.spy();
      ChildDataBinding.registerOnPath('text', ['referenceInsert'], referenceInsertSpy);
      ChildDataBinding.registerOnPath('text', ['referenceModify'], referenceModifySpy);
      ChildDataBinding.registerOnPath('text', ['referenceRemove'], referenceRemoveSpy);

      dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding, { context: 'single' });
      workspace.insert('theChild', myChild);
      myChild.get('text').setValue('Hi!');

      referenceInsertSpy.callCount.should.equal(0);
      referenceModifySpy.callCount.should.equal(0);
      referenceRemoveSpy.callCount.should.equal(0);
    });

    it('contracted path reference LYNXDEV-7915', function () {
      var spy = sinon.spy();
      ParentDataBinding
        .registerOnProperty('substruct.anotherRef.ref_ref', ['referenceInsert', 'insert', 'modify'], spy);
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding);

      var bound = PropertyFactory.create(ReferenceParentTemplate.typeid);
      var baseTexture = PropertyFactory.create(DoubleReferenceParentTemplate.typeid);
      var image = PropertyFactory.create(PrimitiveChildrenTemplate.typeid);

      workspace.insert('bound', bound);
      workspace.insert('baseTexture', baseTexture);
      workspace.insert('image', image);

      baseTexture.get('ref_ref', RESOLVE_NEVER).setValue('/image');

      spy.callCount.should.equal(0);

      bound.get(['substruct', 'anotherRef'], RESOLVE_NEVER).setValue('/baseTexture');
      spy.callCount.should.equal(2); // referenceInsert + insert
    });

    it('referenceChanged, undefined to defined double reference - first reference', function () {
      var spy = sinon.spy();
      ParentDataBinding.registerOnProperty('metal_f0.ref_ref.ref_ref', ['referenceChanged'], spy);
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding);

      var material = PropertyFactory.create(ReferenceParentTemplate.typeid);
      var metal_f0 = PropertyFactory.create(DoubleReferenceParentTemplate.typeid);
      var texturemap = PropertyFactory.create(DoubleReferenceParentTemplate.typeid);
      var image = PropertyFactory.create(PrimitiveChildrenTemplate.typeid);

      material.insert('metal_f0', metal_f0);

      workspace.insert('material', material);
      workspace.insert('texturemap', texturemap);
      workspace.insert('image', image);

      texturemap.get('ref_ref', RESOLVE_NEVER).setValue('/image');

      spy.callCount.should.equal(0);
      metal_f0.get(['ref_ref'], RESOLVE_NEVER).setValue('/texturemap');

      spy.callCount.should.equal(1);
    });

    it('referenceChanged, undefined to defined double reference - second reference', function () {
      var spy = sinon.spy();
      ParentDataBinding.registerOnProperty('metal_f0.ref_ref.ref_ref', ['referenceChanged'], spy);
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding);

      var material = PropertyFactory.create(ReferenceParentTemplate.typeid);
      var metal_f0 = PropertyFactory.create(DoubleReferenceParentTemplate.typeid);
      var texturemap = PropertyFactory.create(DoubleReferenceParentTemplate.typeid);
      var image = PropertyFactory.create(PrimitiveChildrenTemplate.typeid);

      material.insert('metal_f0', metal_f0);

      workspace.insert('material', material);
      workspace.insert('texturemap', texturemap);
      workspace.insert('image', image);

      metal_f0.get(['ref_ref'], RESOLVE_NEVER).setValue('/texturemap');

      spy.callCount.should.equal(0);
      texturemap.get('ref_ref', RESOLVE_NEVER).setValue('/image');

      spy.callCount.should.equal(1);
    });

    it('referenceChanged, undefined to defined single reference', function () {
      var spy = sinon.spy();
      ParentDataBinding.registerOnProperty('metal_f0.ref_ref', ['insert', 'modify', 'referenceChanged'], spy);
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding);

      var material = PropertyFactory.create(ReferenceParentTemplate.typeid);
      var metal_f0 = PropertyFactory.create(DoubleReferenceParentTemplate.typeid);
      var texturemap = PropertyFactory.create(DoubleReferenceParentTemplate.typeid);
      var image = PropertyFactory.create(PrimitiveChildrenTemplate.typeid);

      material.insert('metal_f0', metal_f0);

      workspace.insert('material', material);
      workspace.insert('texturemap', texturemap);
      workspace.insert('image', image);

      texturemap.get('ref_ref', RESOLVE_NEVER).setValue('/image');

      spy.callCount.should.equal(0);
      metal_f0.get(['ref_ref'], RESOLVE_NEVER).setValue('/texturemap');

      spy.callCount.should.equal(2);
    });

    // Don't give me collection change if I'm not a collection
    it('should not tell me about collections if im not a collection', function () {
      var myChild = PropertyFactory.create(ChildTemplate.typeid, 'single');

      var collectionInsertSpy = sinon.spy();
      var collectionModifySpy = sinon.spy();
      var collectionRemoveSpy = sinon.spy();
      ChildDataBinding.registerOnPath('text', ['collectionInsert'], collectionInsertSpy);
      ChildDataBinding.registerOnPath('text', ['collectionModify'], collectionModifySpy);
      ChildDataBinding.registerOnPath('text', ['collectionRemove'], collectionRemoveSpy);

      dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding, { context: 'single' });
      workspace.insert('theChild', myChild);
      myChild.get('text').setValue('Hi!');

      collectionInsertSpy.callCount.should.equal(0);
      collectionModifySpy.callCount.should.equal(0);
      collectionRemoveSpy.callCount.should.equal(0);
    });

    // TODO: * support for reference changed notifications (OK)
    //       * support for reference changed notifications over multiple indirections (OK)
    //       * Do not trigger (ordering) for references which have been modified in the same scope [later?] (OK)
    //       * Chains of references to references (OK)
    //       * References with relative paths [later?]
    //       * ReferenceArrays, ReferenceMaps [later?]
    //       * References to array and maps (OK?)
    //       * bind to a reference via an indirect path (containing another reference) (OK??)

    it('should handle conversion from ArrayNode internally', function () {
      // Add the reference parent pset
      var referenceParentPSet = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');

      var referenceInsertSpy = sinon.spy();
      var referenceModifySpy = sinon.spy();
      var referenceRemoveSpy = sinon.spy();
      ParentDataBinding.registerOnPath('single_prim_ref', ['insert'], referenceInsertSpy);
      ParentDataBinding.registerOnPath('single_prim_ref', ['modify'], referenceModifySpy);
      ParentDataBinding.registerOnPath('single_prim_ref', ['remove'], referenceRemoveSpy);

      // Register the DataBinding
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding, { context: 'single' });
      dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding, { context: 'all' });

      // insert with a dangling reference that contains [] and a number key
      referenceParentPSet.get('single_prim_ref', RESOLVE_NEVER)
        .setValue('/myMapContainer.subMap[10]');
      workspace.insert('myReferenceParent', referenceParentPSet);

      var mapContainerPset = PropertyFactory.create(MapContainerTemplate.typeid, 'single');
      workspace.insert('myMapContainer', mapContainerPset);

      // This should not trigger anything, since we're inserting into a non-referenced path in the map
      mapContainerPset.get('subMap').insert('5', PropertyFactory.create(ChildTemplate.typeid, 'single'));
      referenceModifySpy.callCount.should.equal(0);
      referenceInsertSpy.callCount.should.equal(0);
      referenceRemoveSpy.callCount.should.equal(0);

      // This should trigger the insert handler (but not the modify/remove handlers)
      mapContainerPset.get('subMap').insert('10', PropertyFactory.create(ChildTemplate.typeid, 'single'));
      referenceInsertSpy.callCount.should.equal(1);
      referenceInsertSpy.resetHistory();
      referenceModifySpy.callCount.should.equal(0);
      referenceRemoveSpy.callCount.should.equal(0);

      // This should trigger the modify handler (but not the insert/remove handlers)
      mapContainerPset.get('subMap').get('10').get('text').setValue('hello');
      referenceModifySpy.callCount.should.equal(1);
      referenceModifySpy.resetHistory();
      referenceInsertSpy.callCount.should.equal(0);
      referenceRemoveSpy.callCount.should.equal(0);

      // This should trigger both the insert and remove handler (but not the modify handler)
      mapContainerPset.get('subMap').set('10', PropertyFactory.create(ChildTemplate.typeid, 'single'));
      referenceModifySpy.callCount.should.equal(0);
      referenceInsertSpy.callCount.should.equal(1);
      referenceRemoveSpy.callCount.should.equal(1);
      referenceInsertSpy.resetHistory();
      referenceRemoveSpy.resetHistory();
    });

    it('should handle a chain of references to a primitive', function () {
      var i;
      var referenceInsertSpy = [];
      var referenceModifySpy = [];
      var referenceRemoveSpy = [];
      for (i = 0; i < 4; ++i) {
        referenceInsertSpy[i] = sinon.spy();
        referenceModifySpy[i] = sinon.spy();
        referenceRemoveSpy[i] = sinon.spy();
        ParentDataBinding.registerOnPath('ref' + (i + 1), ['insert'], referenceInsertSpy[i]);
        ParentDataBinding.registerOnPath('ref' + (i + 1), ['modify'], referenceModifySpy[i]);
        ParentDataBinding.registerOnPath('ref' + (i + 1), ['remove'], referenceRemoveSpy[i]);
      }

      // Register the DataBinding
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding, { context: 'single' });
      dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding, { context: 'all' });

      // Create reference parent psets
      var referenceParentPSet = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');
      workspace.insert('myReferenceParent', referenceParentPSet);

      // create the chain
      referenceParentPSet.get('ref1', RESOLVE_NEVER)
        .setValue('/myReferenceParent.ref2');
      referenceParentPSet.get('ref2', RESOLVE_NEVER)
        .setValue('/myReferenceParent.ref3');
      referenceParentPSet.get('ref3', RESOLVE_NEVER)
        .setValue('/myString');

      // this should trigger the insert handler in all refs
      for (i = 0; i < 3; ++i) {
        referenceInsertSpy[i].callCount.should.equal(0);
      }
      workspace.insert('myString', PropertyFactory.create('String', 'single'));
      for (i = 0; i < 3; ++i) {
        referenceInsertSpy[i].callCount.should.equal(1);
        referenceInsertSpy[i].resetHistory();
      }

      // this should trigger the modify handler in all refs
      for (i = 0; i < 4; ++i) {
        referenceModifySpy[i].callCount.should.equal(0);
      }
      workspace.get('myString').setValue('hello');
      for (i = 0; i < 3; ++i) {
        referenceModifySpy[i].callCount.should.equal(1);
        referenceModifySpy[i].resetHistory();
      }

      // this should trigger the remove handler in all refs
      for (i = 0; i < 3; ++i) {
        referenceRemoveSpy[i].callCount.should.equal(0);
      }
      workspace.remove('myString');
      for (i = 0; i < 3; ++i) {
        referenceRemoveSpy[i].callCount.should.equal(1);
        referenceRemoveSpy[i].resetHistory();
      }
      workspace.insert('myString', PropertyFactory.create('String', 'single'));

      // Check whether modifying the references works
      workspace.insert('myString2', PropertyFactory.create('String', 'single', 'string2'));
      referenceParentPSet.get('ref4', RESOLVE_NEVER)
        .setValue('/myString2');
      referenceParentPSet.get('ref2', RESOLVE_NEVER)
        .setValue('/myReferenceParent.ref4');

      // The old handler should no longer trigger
      workspace.get('myString').setValue('hello2');
      var handlers = [0, 1, 3];
      for (i = 0; i < handlers.length; i++) {
        referenceModifySpy[handlers[i]].callCount.should.equal(0);
        referenceModifySpy[handlers[i]].resetHistory();
      }
      // ref3 still points to /myString so it should trigger
      referenceModifySpy[2].callCount.should.equal(1);
      referenceModifySpy[2].resetHistory();

      // The new handler should now trigger instead
      workspace.get('myString2').setValue('hello2');
      for (i = 0; i < handlers.length; i++) {
        referenceModifySpy[handlers[i]].callCount.should.equal(1);
        referenceModifySpy[handlers[i]].resetHistory();
      }
      // ref3 still points to /myString so it should not trigger
      referenceModifySpy[2].callCount.should.equal(0);
      referenceModifySpy[2].resetHistory();
    });

    it('should handle an array of references to a property - broken in HFDM', function () {
      // Add the reference parent pset
      var referenceParentPSet = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');

      var referenceInsertSpy = sinon.spy();
      var referenceModifySpy = sinon.spy();
      var referenceRemoveSpy = sinon.spy();
      ParentDataBinding.registerOnPath('array_ref[2].text', ['insert'], referenceInsertSpy);
      ParentDataBinding.registerOnPath('array_ref[2].text', ['modify'], referenceModifySpy);
      ParentDataBinding.registerOnPath('array_ref[2].text', ['remove'], referenceRemoveSpy);

      // Register the DataBinding
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding, { context: 'single' });
      dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding, { context: 'all' });

      referenceParentPSet.get('array_ref').push();
      referenceParentPSet.get('array_ref').push();
      referenceParentPSet.get('array_ref').push();

      referenceParentPSet.get('array_ref').set(0, ('/alsoMyChildTemplate'));
      referenceParentPSet.get('array_ref').set(2, ('/myChildTemplate'));

      workspace.insert('myReferenceParent', referenceParentPSet);

      // This shouldn't trigger anything
      workspace.insert('alsoMyChildTemplate', PropertyFactory.create(ChildTemplate.typeid, 'single'));
      referenceModifySpy.callCount.should.equal(0);
      referenceInsertSpy.callCount.should.equal(0);
      referenceRemoveSpy.callCount.should.equal(0);

      // This should trigger the insert handler (but not the modify/remove handlers)
      workspace.insert('myChildTemplate', PropertyFactory.create(ChildTemplate.typeid, 'single'));
      referenceInsertSpy.callCount.should.equal(1);
      referenceInsertSpy.resetHistory();
      referenceModifySpy.callCount.should.equal(0);
      referenceRemoveSpy.callCount.should.equal(0);

      // This shouldn't trigger anything
      workspace.get('alsoMyChildTemplate').get('text').setValue('hello');
      referenceModifySpy.callCount.should.equal(0);
      referenceInsertSpy.callCount.should.equal(0);
      referenceRemoveSpy.callCount.should.equal(0);

      // This also shouldn't trigger anything
      workspace.remove('alsoMyChildTemplate');
      referenceModifySpy.callCount.should.equal(0);
      referenceInsertSpy.callCount.should.equal(0);
      referenceRemoveSpy.callCount.should.equal(0);

      // This should trigger the modify handler (but not the insert/remove handlers)
      workspace.get('myChildTemplate').get('text').setValue('hello');
      referenceModifySpy.callCount.should.equal(1);
      referenceModifySpy.resetHistory();
      referenceInsertSpy.callCount.should.equal(0);
      referenceRemoveSpy.callCount.should.equal(0);

      // This should trigger remove handler (but not the insert/modify handler)
      workspace.remove('myChildTemplate');
      referenceRemoveSpy.callCount.should.equal(1);
      referenceRemoveSpy.resetHistory();
      referenceModifySpy.callCount.should.equal(0);
      referenceInsertSpy.callCount.should.equal(0);
    });

    it('should handle references directly to an array', function () {
      // Add the reference parent pset
      var referenceParentPSet = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');
      // Add our child (referenced) pset
      var arrayPset1 = PropertyFactory.create(ArrayContainerTemplate.typeid, 'single');
      var arrayPset2 = PropertyFactory.create(ArrayContainerTemplate.typeid, 'single');
      // register the reference handlers
      var referenceInsertSpy = sinon.spy();
      var referenceModifySpy = sinon.spy();
      var referenceRemoveSpy = sinon.spy();
      ParentDataBinding.registerOnPath('single_ref', ['collectionInsert'], referenceInsertSpy);
      ParentDataBinding.registerOnPath('single_ref', ['collectionModify'], referenceModifySpy);
      ParentDataBinding.registerOnPath('single_ref', ['collectionRemove'], referenceRemoveSpy);

      // Register the DataBinding
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding, { context: 'single' });
      dataBinder._dataBindingCreatedCounter.should.equal(0);
      // parentPset should produce a ParentDataBinding
      workspace.insert('myReferenceParent', referenceParentPSet);
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      dataBinder._resetDebugCounters();
      const parentDataBinding = dataBinder.resolve('/myReferenceParent', 'BINDING');
      parentDataBinding.should.be.instanceOf(ParentDataBinding);
      parentDataBinding.onModify.callCount.should.equal(0);
      parentDataBinding.onModify.resetHistory();
      workspace.insert('myChild1', arrayPset1);
      workspace.insert('myChild2', arrayPset2);

      referenceParentPSet.get('single_ref', RESOLVE_NEVER)
        .setValue('/myChild1.subArray');

      var referencedArray = arrayPset1.get('subArray');
      referenceInsertSpy.callCount.should.equal(0);
      referenceModifySpy.callCount.should.equal(0);
      referenceRemoveSpy.callCount.should.equal(0);
      // insert a new element into the array
      var childPset1 = PropertyFactory.create(ChildTemplate.typeid, 'single');
      referencedArray.push(childPset1);
      referenceInsertSpy.callCount.should.equal(1); /// TODO
      referenceInsertSpy.resetHistory();
      referenceModifySpy.callCount.should.equal(0);
      referenceRemoveSpy.callCount.should.equal(0);

      // change a property of that element in the array, this should trigger a modify
      referencedArray.get(0).get('text').setValue('hello');
      referenceInsertSpy.callCount.should.equal(0);
      referenceModifySpy.callCount.should.equal(1); /// TODO
      referenceModifySpy.resetHistory();
      referenceRemoveSpy.callCount.should.equal(0);

      // change the first element into a new element, this should trigger a remove/insert
      var childPset2 = PropertyFactory.create(ChildTemplate.typeid, 'single');
      referencedArray.set(0, childPset2);
      referenceInsertSpy.callCount.should.equal(1); // TODO
      referenceInsertSpy.resetHistory();
      referenceModifySpy.callCount.should.equal(0);
      referenceRemoveSpy.callCount.should.equal(1); // TODO
      referenceRemoveSpy.resetHistory();

      // remove the element, this should trigger a remove
      referencedArray.remove(0);
      referenceInsertSpy.callCount.should.equal(0);
      referenceModifySpy.callCount.should.equal(0);
      referenceRemoveSpy.callCount.should.equal(1); // this is correct for some reason :)
      referenceRemoveSpy.resetHistory();
    });

    it('should handle references with a subpath that points to an array', function () {
      // Add the reference parent pset
      var referenceParentPSet = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');
      // Add our child (referenced) pset
      var arrayPset1 = PropertyFactory.create(ArrayContainerTemplate.typeid, 'single');
      var arrayPset2 = PropertyFactory.create(ArrayContainerTemplate.typeid, 'single');

      // register the reference handlers
      var referenceInsertSpy = sinon.spy();
      var referenceModifySpy = sinon.spy();
      var referenceRemoveSpy = sinon.spy();
      ParentDataBinding.registerOnPath('single_ref.subArray', ['collectionInsert'], referenceInsertSpy);
      ParentDataBinding.registerOnPath('single_ref.subArray', ['collectionModify'], referenceModifySpy);
      ParentDataBinding.registerOnPath('single_ref.subArray', ['collectionRemove'], referenceRemoveSpy);

      // Register the DataBinding
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding, { context: 'single' });
      dataBinder._dataBindingCreatedCounter.should.equal(0);
      // parentPset should produce a ParentDataBinding
      workspace.insert('myReferenceParent', referenceParentPSet);
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      dataBinder._resetDebugCounters();
      const parentDataBinding = dataBinder.resolve('/myReferenceParent', 'BINDING');
      parentDataBinding.should.be.instanceOf(ParentDataBinding);
      parentDataBinding.onModify.callCount.should.equal(0);
      parentDataBinding.onModify.resetHistory();
      workspace.insert('myChild1', arrayPset1);
      workspace.insert('myChild2', arrayPset2);

      referenceParentPSet.get('single_ref', RESOLVE_NEVER)
        .setValue('/myChild1');

      var referencedArray = arrayPset1.get('subArray');
      referenceInsertSpy.callCount.should.equal(0);
      referenceModifySpy.callCount.should.equal(0);
      referenceRemoveSpy.callCount.should.equal(0);
      // insert a new element into the array
      var childPset1 = PropertyFactory.create(ChildTemplate.typeid, 'single');
      referencedArray.push(childPset1);
      referenceInsertSpy.callCount.should.equal(1); /// TODO
      referenceInsertSpy.resetHistory();
      referenceModifySpy.callCount.should.equal(0);
      referenceRemoveSpy.callCount.should.equal(0);

      // change a property of that element in the array, this should trigger a modify
      referencedArray.get(0).get('text').setValue('hello');
      referenceInsertSpy.callCount.should.equal(0);
      referenceModifySpy.callCount.should.equal(1); /// TODO
      referenceModifySpy.resetHistory();
      referenceRemoveSpy.callCount.should.equal(0);

      // change the first element into a new element, this should trigger a remove/insert
      var childPset2 = PropertyFactory.create(ChildTemplate.typeid, 'single');
      referencedArray.set(0, childPset2);
      referenceInsertSpy.callCount.should.equal(1); // TODO
      referenceInsertSpy.resetHistory();
      referenceModifySpy.callCount.should.equal(0);
      referenceRemoveSpy.callCount.should.equal(1); // TODO
      referenceRemoveSpy.resetHistory();

      // remove the element, this should trigger a remove
      referencedArray.remove(0);
      referenceInsertSpy.callCount.should.equal(0);
      referenceModifySpy.callCount.should.equal(0);
      referenceRemoveSpy.callCount.should.equal(1); // this is correct for some reason :)
      referenceRemoveSpy.resetHistory();
    });

    it('should handle references directly to a map', function () {
      // Add the reference parent pset
      var referenceParentPSet = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');
      // Add our child (referenced) pset
      var mapPset1 = PropertyFactory.create(MapContainerTemplate.typeid, 'single');
      var mapPset2 = PropertyFactory.create(MapContainerTemplate.typeid, 'single');

      // register the reference handlers
      var referenceInsertSpy = sinon.spy();
      var referenceModifySpy = sinon.spy();
      var referenceRemoveSpy = sinon.spy();
      ParentDataBinding.registerOnPath('single_ref', ['collectionInsert'], referenceInsertSpy);
      ParentDataBinding.registerOnPath('single_ref', ['collectionModify'], referenceModifySpy);
      ParentDataBinding.registerOnPath('single_ref', ['collectionRemove'], referenceRemoveSpy);

      // Register the DataBinding
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding, { context: 'single' });
      dataBinder._dataBindingCreatedCounter.should.equal(0);

      // parentPset should produce a ParentDataBinding
      workspace.insert('myReferenceParent', referenceParentPSet);
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      const parentDataBinding = dataBinder.resolve(referenceParentPSet, 'BINDING');
      parentDataBinding.should.be.instanceOf(ParentDataBinding);
      parentDataBinding.onModify.callCount.should.equal(0);
      parentDataBinding.onModify.resetHistory();
      workspace.insert('myChild1', mapPset1);
      workspace.insert('myChild2', mapPset2);

      referenceParentPSet.get('single_ref', RESOLVE_NEVER)
        .setValue('/myChild1.subMap');

      var referencedMap = mapPset1.get('subMap');
      referenceInsertSpy.callCount.should.equal(0);
      referenceModifySpy.callCount.should.equal(0);
      referenceRemoveSpy.callCount.should.equal(0);
      // insert a new element into the map
      var childPset1 = PropertyFactory.create(ChildTemplate.typeid, 'single');
      referencedMap.insert(childPset1.getGuid(), childPset1);
      referenceInsertSpy.callCount.should.equal(1);
      referenceInsertSpy.resetHistory();
      referenceModifySpy.callCount.should.equal(0);
      referenceRemoveSpy.callCount.should.equal(0);

      // change a property of that element in the map, this should trigger a modify
      referencedMap.get(childPset1.getGuid()).get('text').setValue('hello');
      referenceInsertSpy.callCount.should.equal(0);
      referenceModifySpy.callCount.should.equal(1);
      referenceModifySpy.resetHistory();
      referenceRemoveSpy.callCount.should.equal(0);

      // remove the element, this should trigger a remove
      referencedMap.remove(childPset1.getGuid());
      referenceInsertSpy.callCount.should.equal(0);
      referenceModifySpy.callCount.should.equal(0);
      referenceRemoveSpy.callCount.should.equal(1);
      referenceRemoveSpy.resetHistory();
    });

    it('should handle references with a subpath that points to a map', function () {
      // Add the reference parent pset
      var referenceParentPSet = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');
      // Add our child (referenced) pset
      var mapPset1 = PropertyFactory.create(MapContainerTemplate.typeid, 'single');
      var mapPset2 = PropertyFactory.create(MapContainerTemplate.typeid, 'single');

      // register the reference handlers
      var referenceInsertSpy = sinon.spy();
      var referenceModifySpy = sinon.spy();
      var referenceRemoveSpy = sinon.spy();
      ParentDataBinding.registerOnPath('single_ref.subMap', ['collectionInsert'], referenceInsertSpy);
      ParentDataBinding.registerOnPath('single_ref.subMap', ['collectionModify'], referenceModifySpy);
      ParentDataBinding.registerOnPath('single_ref.subMap', ['collectionRemove'], referenceRemoveSpy);

      // Register the DataBinding
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding, { context: 'single' });
      dataBinder._dataBindingCreatedCounter.should.equal(0);

      // parentPset should produce a ParentDataBinding
      workspace.insert('myReferenceParent', referenceParentPSet);
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      dataBinder._resetDebugCounters();
      const parentDataBinding = dataBinder.resolve(referenceParentPSet, 'BINDING');
      parentDataBinding.onModify.callCount.should.equal(0);
      parentDataBinding.onModify.resetHistory();
      workspace.insert('myChild1', mapPset1);
      workspace.insert('myChild2', mapPset2);

      referenceParentPSet.get('single_ref', RESOLVE_NEVER)
        .setValue('/myChild1');

      var referencedMap = mapPset1.get('subMap');
      referenceInsertSpy.callCount.should.equal(0);
      referenceModifySpy.callCount.should.equal(0);
      referenceRemoveSpy.callCount.should.equal(0);
      // insert a new element into the map
      var childPset1 = PropertyFactory.create(ChildTemplate.typeid, 'single');
      referencedMap.insert(childPset1.getGuid(), childPset1);
      referenceInsertSpy.callCount.should.equal(1);
      referenceInsertSpy.resetHistory();
      referenceModifySpy.callCount.should.equal(0);
      referenceRemoveSpy.callCount.should.equal(0);

      // change a property of that element in the map, this should trigger a modify
      referencedMap.get(childPset1.getGuid()).get('text').setValue('hello');
      referenceInsertSpy.callCount.should.equal(0);
      referenceModifySpy.callCount.should.equal(1);
      referenceModifySpy.resetHistory();
      referenceRemoveSpy.callCount.should.equal(0);

      // remove the element, this should trigger a remove
      referencedMap.remove(childPset1.getGuid());
      referenceInsertSpy.callCount.should.equal(0);
      referenceModifySpy.callCount.should.equal(0);
      referenceRemoveSpy.callCount.should.equal(1);
      referenceRemoveSpy.resetHistory();
    });

    it.skip('should handle double references', function () {

      // Add the reference parent pset
      var doubleReferenceParentPSet1 = PropertyFactory.create(DoubleReferenceParentTemplate.typeid, 'single');
      var doubleReferenceParentPSet2 = PropertyFactory.create(DoubleReferenceParentTemplate.typeid, 'single');
      // Add our child (referenced) pset
      var childPset1 = PropertyFactory.create(ChildTemplate.typeid, 'single');
      var childPset2 = PropertyFactory.create(ChildTemplate.typeid, 'single');
      // Register the DataBinding
      dataBinder.register('BINDING',
        DoubleReferenceParentTemplate.typeid,
        ParentDataBinding,
        { context: 'single' });
      dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding, { context: 'all' });

      dataBinder._dataBindingCreatedCounter.should.equal(0);

      // parentPset should produce a ParentDataBinding
      workspace.insert('myReferenceParent1', doubleReferenceParentPSet1);
      workspace.insert('myReferenceParent2', doubleReferenceParentPSet2);
      dataBinder._dataBindingCreatedCounter.should.equal(2);
      dataBinder._resetDebugCounters();
      const parentDataBinding1 = dataBinder.resolve('/myReferenceParent1', 'BINDING');
      parentDataBinding1.should.be.instanceOf(ParentDataBinding);
      parentDataBinding1.onModify.callCount.should.equal(1);
      parentDataBinding1.onModify.resetHistory();
      const parentDataBinding2 = dataBinder.resolve('/myReferenceParent2', 'BINDING');
      parentDataBinding2.should.be.instanceOf(ParentDataBinding);
      parentDataBinding2.onModify.callCount.should.equal(1);
      parentDataBinding2.onModify.resetHistory();
      workspace.insert('myChild1', childPset1);
      workspace.insert('myChild2', childPset2);
      dataBinder._dataBindingCreatedCounter.should.equal(2);
      dataBinder._resetDebugCounters();

      // the first one points to the second one
      doubleReferenceParentPSet1.get('ref_ref').setValue('/myReferenceParent2.ref_ref');

      // we changed the reference for the first parent -> we get a notification
      parentDataBinding1.onModify.callCount.should.equal(1);
      var modificationContext = parentDataBinding1.onModify.getCall(0).args[0];
      modificationContext.length.should.equal(1);
      modificationContext[0].getAbsolutePath().should.equal('myReferenceParent1.ref_ref');
      parentDataBinding1.onModify.resetHistory();
      // nothing happened to the second parent yet
      parentDataBinding2.onModify.callCount.should.equal(0);

      // the second one points to the real property
      doubleReferenceParentPSet2.get('ref_ref').set(childPset2);
      // we changed the reference for the second parent -> we get a notification
      parentDataBinding2.onModify.callCount.should.equal(1);
      modificationContext = parentDataBinding2.onModify.getCall(0).args[0];
      modificationContext.length.should.equal(1);
      modificationContext[0].getAbsolutePath().should.equal('myReferenceParent2.ref_ref');
      parentDataBinding2.onModify.resetHistory();
      // the first parent should also be notified
      parentDataBinding1.onModify.callCount.should.equal(1);
      modificationContext = parentDataBinding1.onModify.getCall(0).args[0];
      modificationContext.length.should.equal(1);
      modificationContext[0].getAbsolutePath().should.equal('myReferenceParent2.ref_ref'); // the new value!
      parentDataBinding1.onModify.resetHistory();

      // change the *value* of the reference (i.e. the "pointed to" object)
      childPset2.get('text').value = 'hello';

      // we should get a notification for the second parent
      parentDataBinding2.onModify.callCount.should.equal(1);
      modificationContext = parentDataBinding2.onModify.getCall(0).args[0];
      modificationContext.length.should.equal(1);
      modificationContext[0].getAbsolutePath().should.equal('myChild2.text');
      parentDataBinding2.onModify.resetHistory();
      parentDataBinding1.onModify.callCount.should.equal(1);
      modificationContext = parentDataBinding1.onModify.getCall(0).args[0];
      modificationContext.length.should.equal(1);
      modificationContext[0].getAbsolutePath().should.equal('myChild2.text');
      parentDataBinding1.onModify.resetHistory();
      workspace.remove(doubleReferenceParentPSet2);
      // change the *value* of the reference (i.e. the "pointed to" object) again
      childPset2.get('text').value = 'hello2';
      // we should not get a notification on either parents as we've removed the 2nd reference prop pointing to this
      parentDataBinding1.onModify.callCount.should.equal(0);
      parentDataBinding2.onModify.callCount.should.equal(0);
    });

    it.skip('should handle triple references', function () {

      // Add the reference parent pset
      var doubleReferenceParentPSet1 = PropertyFactory.create(DoubleReferenceParentTemplate.typeid, 'single');
      var doubleReferenceParentPSet2 = PropertyFactory.create(DoubleReferenceParentTemplate.typeid, 'single');
      var doubleReferenceParentPSet3 = PropertyFactory.create(DoubleReferenceParentTemplate.typeid, 'single');
      // Add our child (referenced) pset
      var childPset1 = PropertyFactory.create(ChildTemplate.typeid, 'single');
      // Register the DataBinding
      dataBinder.register('BINDING',
        DoubleReferenceParentTemplate.typeid,
        ParentDataBinding,
        { context: 'single' });
      dataBinder.register('BINDING',
        ChildTemplate.typeid,
        ChildDataBinding,
        { context: 'all' });

      dataBinder._dataBindingCreatedCounter.should.equal(0);

      // parentPset should produce a ParentDataBinding
      workspace.insert('myReferenceParent1', doubleReferenceParentPSet1);
      workspace.insert('myReferenceParent2', doubleReferenceParentPSet2);
      workspace.insert('myReferenceParent3', doubleReferenceParentPSet3);
      dataBinder._dataBindingCreatedCounter.should.equal(3);
      dataBinder._resetDebugCounters();
      const parentDataBinding1 = dataBinder.resolve('/myReferenceParent1', 'BINDING');
      parentDataBinding1.should.be.instanceOf(ParentDataBinding);
      parentDataBinding1.onModify.callCount.should.equal(1);
      parentDataBinding1.onModify.resetHistory();
      const parentDataBinding2 = dataBinder.resolve('/myReferenceParent2', 'BINDING');
      parentDataBinding2.should.be.instanceOf(ParentDataBinding);
      parentDataBinding2.onModify.callCount.should.equal(1);
      parentDataBinding2.onModify.resetHistory();
      const parentDataBinding3 = dataBinder.resolve('/myReferenceParent3', 'BINDING');
      parentDataBinding3.should.be.instanceOf(ParentDataBinding);
      parentDataBinding3.onModify.callCount.should.equal(1);
      parentDataBinding3.onModify.resetHistory();
      workspace.insert('myChild1', childPset1);
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      dataBinder._resetDebugCounters();

      // the first one points to the second one
      doubleReferenceParentPSet1.get('ref_ref').setValue('/myReferenceParent2.ref_ref');

      // we changed the reference for the first parent -> we get a notification
      parentDataBinding1.onModify.callCount.should.equal(1);
      var modificationContext = parentDataBinding1.onModify.getCall(0).args[0];
      modificationContext.length.should.equal(1);
      modificationContext[0].getAbsolutePath().should.equal('myReferenceParent1.ref_ref');
      parentDataBinding1.onModify.resetHistory();
      // nothing happened to the second/third parent yet
      parentDataBinding2.onModify.callCount.should.equal(0);
      parentDataBinding3.onModify.callCount.should.equal(0);

      // the second one points to the third one
      doubleReferenceParentPSet2.get('ref_ref').setValue('/myReferenceParent3.ref_ref');

      // we changed the reference for the second parent -> we get a notification
      parentDataBinding2.onModify.callCount.should.equal(1);
      modificationContext = parentDataBinding2.onModify.getCall(0).args[0];
      modificationContext.length.should.equal(1);
      modificationContext[0].getAbsolutePath().should.equal('myReferenceParent2.ref_ref');
      parentDataBinding2.onModify.resetHistory();
      parentDataBinding1.onModify.callCount.should.equal(1);
      modificationContext = parentDataBinding1.onModify.getCall(0).args[0];
      modificationContext.length.should.equal(1);
      modificationContext[0].getAbsolutePath().should.equal('myReferenceParent2.ref_ref');
      parentDataBinding1.onModify.resetHistory();
      // nothing happened to the third parent yet
      parentDataBinding3.onModify.callCount.should.equal(0);

      // the third one points to the real property
      doubleReferenceParentPSet3.get('ref_ref').set(childPset1);
      // we changed the reference for the third parent -> we get a notification
      parentDataBinding3.onModify.callCount.should.equal(1);
      modificationContext = parentDataBinding3.onModify.getCall(0).args[0];
      modificationContext.length.should.equal(1);
      modificationContext[0].getAbsolutePath().should.equal('myReferenceParent3.ref_ref');
      parentDataBinding3.onModify.resetHistory();
      parentDataBinding2.onModify.callCount.should.equal(1);
      modificationContext = parentDataBinding2.onModify.getCall(0).args[0];
      modificationContext.length.should.equal(1);
      modificationContext[0].getAbsolutePath().should.equal('myReferenceParent3.ref_ref');
      parentDataBinding2.onModify.resetHistory();
      // the first parent should also be notified
      parentDataBinding1.onModify.callCount.should.equal(1);
      modificationContext = parentDataBinding1.onModify.getCall(0).args[0];
      modificationContext.length.should.equal(1);
      modificationContext[0].getAbsolutePath().should.equal('myReferenceParent3.ref_ref');
      parentDataBinding1.onModify.resetHistory();

      // change the *value* of the reference (i.e. the "pointed to" object)
      childPset1.get('text').value = 'hello';

      // we should get a notification for the second parent
      parentDataBinding3.onModify.callCount.should.equal(1);
      modificationContext = parentDataBinding3.onModify.getCall(0).args[0];
      modificationContext.length.should.equal(1);
      modificationContext[0].getAbsolutePath().should.equal('myChild1.text');
      parentDataBinding3.onModify.resetHistory();
      parentDataBinding2.onModify.callCount.should.equal(1);
      modificationContext = parentDataBinding2.onModify.getCall(0).args[0];
      modificationContext.length.should.equal(1);
      modificationContext[0].getAbsolutePath().should.equal('myChild1.text');
      parentDataBinding2.onModify.resetHistory();
      parentDataBinding1.onModify.callCount.should.equal(1);
      modificationContext = parentDataBinding1.onModify.getCall(0).args[0];
      modificationContext.length.should.equal(1);
      modificationContext[0].getAbsolutePath().should.equal('myChild1.text');
      parentDataBinding1.onModify.resetHistory();
      workspace.remove(doubleReferenceParentPSet3);
      // change the *value* of the reference (i.e. the "pointed to" object) again
      childPset1.get('text').value = 'hello2';
      // we should not get a notification on either parents as we've removed the 2nd reference prop pointing to this
      parentDataBinding1.onModify.callCount.should.equal(0);
      parentDataBinding2.onModify.callCount.should.equal(0);
      parentDataBinding3.onModify.callCount.should.equal(0);
    });

    it('should handle multiple references to the same object', function () {
      // Add the reference parent pset
      var referenceParentPSet1 = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');
      var referenceParentPSet2 = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');
      var referenceParentPSet3 = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');
      // Add our child (referenced) pset
      var childPset1 = PropertyFactory.create(ChildTemplate.typeid, 'single');

      // register the reference handlers
      var referenceInsertSpy = sinon.spy();
      var referenceModifySpy = sinon.spy();
      var referenceRemoveSpy = sinon.spy();
      ParentDataBinding.registerOnPath('single_ref', ['insert'], referenceInsertSpy);
      ParentDataBinding.registerOnPath('single_ref', ['modify'], referenceModifySpy);
      ParentDataBinding.registerOnPath('single_ref', ['remove'], referenceRemoveSpy);

      // Register the DataBinding
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding);
      // parentPset should produce a ParentDataBinding
      workspace.insert('myReferenceParent1', referenceParentPSet1);
      workspace.insert('myReferenceParent2', referenceParentPSet2);
      workspace.insert('myReferenceParent3', referenceParentPSet3);
      dataBinder._dataBindingCreatedCounter.should.equal(3);
      dataBinder._resetDebugCounters();
      const parentDataBinding1 = dataBinder.resolve(referenceParentPSet1, 'BINDING');
      parentDataBinding1.should.be.instanceOf(ParentDataBinding);
      const parentDataBinding2 = dataBinder.resolve(referenceParentPSet2, 'BINDING');
      parentDataBinding2.should.be.instanceOf(ParentDataBinding);
      const parentDataBinding3 = dataBinder.resolve(referenceParentPSet3, 'BINDING');
      parentDataBinding3.should.be.instanceOf(ParentDataBinding);

      referenceInsertSpy.callCount.should.equal(0);
      referenceModifySpy.callCount.should.equal(0);
      referenceRemoveSpy.callCount.should.equal(0);
      // insert should trigger the insert handler
      referenceParentPSet1.get('single_ref', RESOLVE_NEVER)
        .setValue('/myChild1');
      referenceParentPSet2.get('single_ref', RESOLVE_NEVER)
        .setValue('/myChild1');
      referenceParentPSet3.get('single_ref', RESOLVE_NEVER)
        .setValue('/myChild1');
      workspace.insert('myChild1', childPset1);
      referenceInsertSpy.callCount.should.equal(3);
      referenceInsertSpy.resetHistory();
      referenceModifySpy.callCount.should.equal(0);
      referenceRemoveSpy.callCount.should.equal(0);

      // modify should trigger the modify handler
      childPset1.get('text').setValue('hello');
      referenceInsertSpy.callCount.should.equal(0);
      referenceModifySpy.callCount.should.equal(3);
      referenceModifySpy.resetHistory();
      referenceRemoveSpy.callCount.should.equal(0);

      // remove should trigger the remove handler
      workspace.remove('myChild1');
      referenceInsertSpy.callCount.should.equal(0);
      referenceModifySpy.callCount.should.equal(0);
      referenceRemoveSpy.callCount.should.equal(3);
      referenceRemoveSpy.resetHistory();
    });

    it('not follow references if there aren no exactPaths', function () {
      const a = PropertyFactory.create(ParentTemplate.typeid, 'single');
      workspace.insert('a', a);
      workspace.insert('ref', PropertyFactory.create('Reference', 'single'));
      workspace.getRoot().get('ref', RESOLVE_NEVER).setValue('/a');

      dataBinder.register('BINDING', ParentTemplate.typeid, ParentDataBinding);

      const binding = dataBinder.resolve('a', 'BINDING');
      binding._getReferenceCount().should.equal(1);
    });

    it('should not die miserably in an infinite loop', function () {
      const a = PropertyFactory.create('NodeProperty', 'single');
      const b = PropertyFactory.create('NodeProperty', 'single');

      workspace.insert('a', a);
      a.insert('ref', PropertyFactory.create('Reference', 'single'));
      a.get('ref', RESOLVE_NEVER).setValue('/b');

      workspace.insert('b', b);
      b.insert('ref', PropertyFactory.create('Reference', 'single'));
      b.get('ref', RESOLVE_NEVER).setValue('/a');

      dataBinder.register('BINDING', 'NodeProperty', ParentDataBinding);

      dataBinder._dataBindingCreatedCounter.should.equal(3);  // root, a and b
    });

    it('should not die miserably in an infinite loop with primitive reference arrays', function () {
      const a = PropertyFactory.create('NodeProperty', 'single');
      const b = PropertyFactory.create('NodeProperty', 'single');

      workspace.insert('a', a);
      a.insert('ref', PropertyFactory.create('Reference', 'array'));
      a.get('ref', RESOLVE_NEVER).push('/b');

      workspace.insert('b', b);
      b.insert('ref', PropertyFactory.create('Reference', 'array'));
      b.get('ref', RESOLVE_NEVER).push('/a');

      dataBinder.register('BINDING', 'NodeProperty', ParentDataBinding);

      dataBinder._dataBindingCreatedCounter.should.equal(3);  // root, a and b
    });

    it('should not die miserably in an infinite loop with primitive reference maps', function () {
      const a = PropertyFactory.create('NodeProperty', 'single');
      const b = PropertyFactory.create('NodeProperty', 'single');

      workspace.insert('a', a);
      a.insert('ref', PropertyFactory.create('Reference', 'map'));
      a.get('ref', RESOLVE_NEVER).insert('b', '/b');

      workspace.insert('b', b);
      b.insert('ref', PropertyFactory.create('Reference', 'map'));
      b.get('ref', RESOLVE_NEVER).insert('a', '/a');

      dataBinder.register('BINDING', 'NodeProperty', ParentDataBinding);

      dataBinder._dataBindingCreatedCounter.should.equal(3);  // root, a and b
    });

    it('follow references if there is an exactPath', function () {
      const a = PropertyFactory.create(ParentTemplate.typeid, 'single');
      workspace.insert('a', a);
      workspace.insert('ref', PropertyFactory.create('Reference', 'single'));
      workspace.getRoot().get('ref', RESOLVE_NEVER).setValue('/a');

      dataBinder.register('BINDING', ParentTemplate.typeid, ParentDataBinding, {
        exactPath: 'ref'
      });

      const binding = dataBinder.resolve('a', 'BINDING');
      binding._getReferenceCount().should.equal(1);
    });

    it('follow references if there is an exactPath in arrays', function () {
      const a = PropertyFactory.create(ParentTemplate.typeid, 'single');
      workspace.insert('a', a);
      workspace.insert('refArray', PropertyFactory.create('Reference', 'array'));
      workspace.getRoot().get('refArray').push('/a');

      dataBinder.register('BINDING', ParentTemplate.typeid, ParentDataBinding, {
        exactPath: 'refArray[0]'
      });

      const binding = dataBinder.resolve('a', 'BINDING');
      binding._getReferenceCount().should.equal(1);
    });

    it('should handle multiple nested references to the same object', function () {
      // Add the reference parent pset
      var referenceParentPSet1 = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');
      var referenceParentPSet2 = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');
      var referenceParentPSet3 = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');
      // Add our child (referenced) pset
      var childPset1 = PropertyFactory.create(ChildTemplate.typeid, 'single');

      // register the reference handlers
      var referenceInsertSpy = sinon.spy();
      var referenceModifySpy = sinon.spy();
      var referenceRemoveSpy = sinon.spy();
      ParentDataBinding.registerOnPath('single_ref', ['insert'], referenceInsertSpy);
      ParentDataBinding.registerOnPath('single_ref', ['modify'], referenceModifySpy);
      ParentDataBinding.registerOnPath('single_ref', ['remove'], referenceRemoveSpy);
      var referenceReferenceInsertSpy = sinon.spy();
      var referenceReferenceModifySpy = sinon.spy();
      var referenceReferenceRemoveSpy = sinon.spy();
      ParentDataBinding.registerOnPath('single_ref.single_ref', ['insert'], referenceReferenceInsertSpy);
      ParentDataBinding.registerOnPath('single_ref.single_ref', ['modify'], referenceReferenceModifySpy);
      ParentDataBinding.registerOnPath('single_ref.single_ref', ['remove'], referenceReferenceRemoveSpy);

      // Register the DataBinding
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding);
      // parentPset should produce a ParentDataBinding
      workspace.insert('myReferenceParent1', referenceParentPSet1);
      workspace.insert('myReferenceParent2', referenceParentPSet2);
      workspace.insert('myReferenceParent3', referenceParentPSet3);
      dataBinder._dataBindingCreatedCounter.should.equal(3);
      dataBinder._resetDebugCounters();
      const parentDataBinding1 = dataBinder.resolve(referenceParentPSet1, 'BINDING');
      parentDataBinding1.should.be.instanceOf(ParentDataBinding);
      const parentDataBinding2 = dataBinder.resolve(referenceParentPSet2, 'BINDING');
      parentDataBinding2.should.be.instanceOf(ParentDataBinding);
      const parentDataBinding3 = dataBinder.resolve(referenceParentPSet3, 'BINDING');
      parentDataBinding3.should.be.instanceOf(ParentDataBinding);

      referenceInsertSpy.callCount.should.equal(0);
      referenceModifySpy.callCount.should.equal(0);
      referenceRemoveSpy.callCount.should.equal(0);
      referenceReferenceInsertSpy.callCount.should.equal(0);
      referenceReferenceModifySpy.callCount.should.equal(0);
      referenceReferenceRemoveSpy.callCount.should.equal(0);
      // insert should trigger the insert handler
      referenceParentPSet1.get('single_ref', RESOLVE_NEVER)
        .setValue('/myReferenceParent2');
      referenceParentPSet2.get('single_ref', RESOLVE_NEVER)
        .setValue('/myChild1');

      // We get an insert when we make the reference valid.
      referenceInsertSpy.callCount.should.equal(1);
      referenceInsertSpy.resetHistory();

      // This modification triggers an onModify event on the referenceParentPSet1
      // since it bound to all modification events in myReferenceParent2
      referenceModifySpy.callCount.should.equal(1);
      referenceModifySpy.resetHistory();

      referenceParentPSet3.get('single_ref', RESOLVE_NEVER)
        .setValue('/myChild1');
      workspace.insert('myChild1', childPset1);
      referenceInsertSpy.callCount.should.equal(2);
      referenceInsertSpy.resetHistory();
      referenceModifySpy.callCount.should.equal(0); // TODO: this gets called here
      referenceModifySpy.resetHistory();
      referenceRemoveSpy.callCount.should.equal(0);
      referenceReferenceInsertSpy.callCount.should.equal(1);
      referenceReferenceInsertSpy.resetHistory();
      referenceReferenceModifySpy.callCount.should.equal(0); // TODO: this gets called here
      referenceReferenceModifySpy.resetHistory();
      referenceReferenceRemoveSpy.callCount.should.equal(0);

      // modify should trigger the modify handler
      childPset1.get('text').setValue('hello');
      referenceInsertSpy.callCount.should.equal(0);
      referenceModifySpy.callCount.should.equal(2);
      referenceModifySpy.resetHistory();
      referenceRemoveSpy.callCount.should.equal(0);
      referenceReferenceInsertSpy.callCount.should.equal(0);
      referenceReferenceModifySpy.callCount.should.equal(1);
      referenceReferenceModifySpy.resetHistory();
      referenceReferenceRemoveSpy.callCount.should.equal(0);

      // remove should trigger the remove handler
      workspace.remove('myChild1');
      referenceInsertSpy.callCount.should.equal(0);
      referenceModifySpy.callCount.should.equal(0);
      referenceRemoveSpy.callCount.should.equal(2);
      referenceRemoveSpy.resetHistory();
      referenceReferenceInsertSpy.callCount.should.equal(0);
      referenceReferenceModifySpy.callCount.should.equal(0);
      referenceReferenceRemoveSpy.callCount.should.equal(1);
      referenceReferenceRemoveSpy.resetHistory();

    });

    it('should not send old modify messages, when the reference has changed', function () {
      // var referenceInsertSpy = sinon.spy();
      var referenceModifySpy = sinon.spy();
      // var referenceRemoveSpy = sinon.spy();
      ParentDataBinding.registerOnPath('single_ref.text', ['modify'], referenceModifySpy);
      ParentDataBinding.registerOnPath('single_ref.ref.text', ['modify'], referenceModifySpy);

      // Register the DataBinding
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding, { context: 'single' });
      dataBinder.register('BINDING', NodeContainerTemplate.typeid, ParentDataBinding, { context: 'single' });
      dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding, { context: 'all' });

      // We insert the object with the reference within the array to make sure, the evaluation
      // order by DataBindingManger is as expected
      workspace.insert('array', PropertyFactory.create(undefined, 'array'));
      workspace.get('array').push(PropertyFactory.create(ChildTemplate.typeid));
      workspace.get('array').push(PropertyFactory.create(ReferenceParentTemplate.typeid));
      workspace.get('array').push(PropertyFactory.create('NodeProperty'));
      workspace.get('array').push(PropertyFactory.create(ChildTemplate.typeid));

      var reference = workspace.get(['array', 1, 'single_ref'],
        RESOLVE_NEVER);
      workspace.get(['array', 2]).insert('ref', PropertyFactory.create('Reference'));
      var reference2 = workspace.get(['array', 2, 'ref'],
        RESOLVE_NEVER);

      reference.setValue('/array[0]');
      workspace.get(['array', 0, 'text']).setValue('changed');
      expect(referenceModifySpy.callCount).to.equal(1);

      referenceModifySpy.resetHistory();

      // When a reference is changed a modification should no longer result
      // in a modify event
      workspace.pushModifiedEventScope();
      reference.setValue('/array[3]');
      workspace.get(['array', 0, 'text']).setValue('changed2');
      workspace.popModifiedEventScope();
      expect(referenceModifySpy.callCount).to.equal(0);

      reference2.setValue('/array[0]');
      reference.setValue('/array[2].ref');
      expect(referenceModifySpy.callCount).to.equal(0);

      // This should also work for chained references
      workspace.pushModifiedEventScope();
      reference.setValue('/array[3]');
      workspace.get(['array', 0, 'text']).setValue('changed3');
      workspace.popModifiedEventScope();
      expect(referenceModifySpy.callCount).to.equal(0);

      // This should also work and for multi-hop references
      reference.setValue('/array[2]');
      reference2.setValue('/array[0]');
      workspace.pushModifiedEventScope();
      reference2.setValue('/array[3]');
      workspace.get(['array', 0, 'text']).setValue('changed4');
      workspace.popModifiedEventScope();
      expect(referenceModifySpy.callCount).to.equal(0);

      // And when removing the referencing property
      reference.setValue('/array[2]');
      reference2.setValue('/array[0]');
      workspace.pushModifiedEventScope();
      workspace.get(['array', 2]).remove('ref');
      workspace.get(['array', 0, 'text']).setValue('changed5');
      workspace.popModifiedEventScope();
      expect(referenceModifySpy.callCount).to.equal(0);

      // Or when inserting the referencing property
      reference.setValue('/array[2]');
      workspace.pushModifiedEventScope();
      workspace.get(['array', 2]).insert('ref', PropertyFactory.create('Reference', undefined, '/array[3]'));
      workspace.get(['array', 3, 'text']).setValue('changed6');
      workspace.popModifiedEventScope();
      expect(referenceModifySpy.callCount).to.equal(0);
    });

    it('should trigger referenceChanged events correctly', function () {
      // Add the reference parent pset
      var referenceParentPSet = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');

      // Add our child (referenced) pset
      var childPset1 = PropertyFactory.create(ChildTemplate.typeid, 'single');
      var childPset2 = PropertyFactory.create(ChildTemplate.typeid, 'single');

      var invalidProperty = false; // we have to do this externally because HFDM would eat our exception from the spy
      var referenceChangedSpy = sinon.spy(function (in_referenceChangedContext) {
      });
      var propertySpy = sinon.spy(function (in_property) {
        if (!in_property) {
          invalidProperty = true;
        }
      });
      var referenceBoundSpy = sinon.spy(function (in_modificationContext) {
        // console.log(in_modificationContext);
      });
      var invalidReferenceChangedSpy = sinon.spy();
      ParentDataBinding.registerOnPath('single_ref', ['referenceChanged'], referenceChangedSpy);
      ParentDataBinding.registerOnPath('single_ref.invalid', ['referenceChanged'],
        invalidReferenceChangedSpy);
      ParentDataBinding.registerOnPath('single_ref',
        ['referenceInsert', 'referenceModify', 'referenceRemove'], referenceBoundSpy);
      ParentDataBinding.registerOnProperty('single_ref', ['insert', 'remove', 'modify'], propertySpy,
        { requireProperty: true });

      // Register the DataBinding
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding);
      dataBinder.register('BINDING', NodeContainerTemplate.typeid, ParentDataBinding);

      workspace.insert('myChild1', childPset1);
      workspace.insert('myChild2', childPset2);

      // Most basic case, insert with an already valid reference
      referenceChangedSpy.callCount.should.equal(0);
      referenceParentPSet.get('single_ref', RESOLVE_NEVER)
        .setValue('/myChild1');
      workspace.insert('myReferenceParent', referenceParentPSet);
      referenceChangedSpy.callCount.should.equal(1);
      referenceChangedSpy.resetHistory();
      referenceBoundSpy.callCount.should.equal(1);
      referenceBoundSpy.resetHistory();

      // This should not trigger
      childPset1.get('text').setValue('newText');
      referenceChangedSpy.callCount.should.equal(0);
      referenceBoundSpy.callCount.should.equal(0);
      // Remove our referenced node: this should trigger the referenceChange spy
      workspace.remove('myChild1');
      referenceChangedSpy.callCount.should.equal(1);
      referenceChangedSpy.resetHistory();
      referenceBoundSpy.callCount.should.equal(0);
      // Reinsert our referenced node: this  should also trigger the referenceChange spy
      workspace.insert('myChild1', childPset1);
      referenceChangedSpy.callCount.should.equal(1);
      referenceChangedSpy.resetHistory();
      referenceBoundSpy.callCount.should.equal(0);
      // Change the reference value, this should trigger both valid spies
      referenceParentPSet.get('single_ref', RESOLVE_NEVER)
        .setValue('/myChild2');
      referenceChangedSpy.callCount.should.equal(2); // remove the old, insert the new
      referenceChangedSpy.resetHistory();
      referenceBoundSpy.callCount.should.equal(1);
      referenceBoundSpy.resetHistory();
      workspace.remove('myReferenceParent');
      referenceChangedSpy.callCount.should.equal(1);
      referenceChangedSpy.resetHistory();
      referenceBoundSpy.callCount.should.equal(1);
      referenceBoundSpy.resetHistory();
      // Change the reference value, this should not trigger anything because it's not in the workspace
      referenceParentPSet.get('single_ref', RESOLVE_NEVER)
        .setValue('/invalid');
      referenceChangedSpy.callCount.should.equal(0);
      referenceBoundSpy.callCount.should.equal(0);
      // reinsert with an invalid reference -> the ref. path is already undefined, it won't trigger referenceChanged
      workspace.insert('myReferenceParent', referenceParentPSet);
      referenceChangedSpy.callCount.should.equal(0);
      // but should trigger the reference bound spy
      referenceBoundSpy.callCount.should.equal(1);
      referenceBoundSpy.resetHistory();

      // this should never be called as it relates to an invalid property path
      invalidReferenceChangedSpy.callCount.should.equal(0);
      // this should not have been changed to true
      invalidProperty.should.equal(false);
    });

    it('should be able to bind the same callback to reference *or* referenced modify events', function () {
      // Add the reference parent pset
      var referenceParentPSet = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');

      // Add our child (referenced) pset
      var childPset1 = PropertyFactory.create(ChildTemplate.typeid, 'single');
      var childPset2 = PropertyFactory.create(ChildTemplate.typeid, 'single');

      var referenceSpy = sinon.spy(function (in_modificationContext) {
        //          console.log(in_modificationContext);
      });
      ParentDataBinding.registerOnPath('single_ref', ['modify'], referenceSpy);
      ParentDataBinding.registerOnPath('single_ref', ['referenceModify'], referenceSpy);

      // Register the DataBinding
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding);
      dataBinder.register('BINDING', NodeContainerTemplate.typeid, ParentDataBinding);

      workspace.insert('myChild1', childPset1);
      workspace.insert('myChild2', childPset2);

      // Most basic case, insert with an already valid reference
      referenceSpy.callCount.should.equal(0);
      referenceParentPSet.get('single_ref', RESOLVE_NEVER)
        .setValue('/myChild1');
      workspace.insert('myReferenceParent', referenceParentPSet);
      // should not trigger as we only listen to modify events
      referenceSpy.callCount.should.equal(0);

      // Change the referenced Property: this should trigger
      childPset1.get('text').setValue('newText');
      referenceSpy.callCount.should.equal(1);
      referenceSpy.resetHistory();

      // Remove the referenced Property: this should not trigger
      workspace.remove('myChild1');
      referenceSpy.callCount.should.equal(0);

      // Reinsert the referenced Property: this  should not trigger either
      workspace.insert('myChild1', childPset1);
      referenceSpy.callCount.should.equal(0);

      // Remove the reference: this should not trigger
      workspace.remove('myReferenceParent');
      referenceSpy.callCount.should.equal(0);

      // Reinsert the reference: this should not trigger
      workspace.insert('myReferenceParent', referenceParentPSet);
      referenceSpy.callCount.should.equal(0);

      // Change the reference to something else -> should trigger
      referenceParentPSet.get('single_ref', RESOLVE_NEVER)
        .setValue('/myChild2');
      referenceSpy.callCount.should.equal(1);
      referenceSpy.resetHistory();

      // Remove the reference again, and set it to an invalid path, should not trigger
      workspace.remove('myReferenceParent');
      referenceParentPSet.get('single_ref', RESOLVE_NEVER)
        .setValue('/invalid');
      referenceSpy.callCount.should.equal(0);

      // reinsert again (with invalid path), should not trigger
      workspace.insert('myReferenceParent', referenceParentPSet);
      referenceSpy.callCount.should.equal(0);

      // set it to a valid path -> should trigger
      referenceParentPSet.get('single_ref', RESOLVE_NEVER)
        .setValue('/myChild2');
      referenceSpy.callCount.should.equal(1);
      referenceSpy.resetHistory();

      // Change the value of the referenced -> should trigger
      childPset2.get('text').setValue('newText');
      referenceSpy.callCount.should.equal(1);
      referenceSpy.resetHistory();
    });

    it('should be able to bind to the general Reference typeid', function () {
      // Add the reference parent pset
      var referenceParentPSet = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');

      // Register the DataBinding to the Reference
      var regKey = dataBinder.register('BINDING', 'Reference', ParentDataBinding);

      // Most basic case, insert with an already valid reference
      dataBinder._dataBindingCreatedCounter.should.equal(0);
      workspace.insert('myReferenceParent', referenceParentPSet);
      dataBinder._dataBindingCreatedCounter.should.equal(7);  // seven types of references in ReferenceParentTemplate
      dataBinder._resetDebugCounters();
      workspace.remove('myReferenceParent');
      // now unregister for 'Reference' and register for 'array<Reference>'
      regKey.destroy();
      dataBinder.register('BINDING', 'array<Reference>', ParentDataBinding);
      // reinsert pset
      workspace.insert('myReferenceParent', referenceParentPSet);
      dataBinder._dataBindingCreatedCounter.should.equal(1);
    });

    it('should have basic support for maps of references', function () {
      // Add the reference parent pset
      var referenceParentPSet = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');

      // Add our child (referenced) pset
      var childPset1 = PropertyFactory.create(ChildTemplate.typeid, 'single');
      var childPset2 = PropertyFactory.create(ChildTemplate.typeid, 'single');

      var referenceInsertSpy = sinon.spy();
      var referenceModifySpy = sinon.spy();
      var referenceRemoveSpy = sinon.spy();
      ParentDataBinding.registerOnPath('map_ref[one].text', ['insert'], referenceInsertSpy);
      ParentDataBinding.registerOnPath('map_ref[one].text', ['modify'], referenceModifySpy);
      ParentDataBinding.registerOnPath('map_ref[one].text', ['remove'], referenceRemoveSpy);

      var refChangedError = false;
      var referenceChangedSpy = sinon.spy(function (in_referenceChangedContext) {
        var prop = in_referenceChangedContext.getProperty();
        // have to do it this way because HFDM swallows exceptions in callbacks :(
        if (prop) {
          if (!PropertyFactory.instanceOf(prop, 'String', 'single')) {
            refChangedError = true;
          }
        }
      });
      ParentDataBinding.registerOnPath('map_ref[one].text', ['referenceChanged'], referenceChangedSpy,
        { requireProperty: true });

      var mapInsertSpy = sinon.spy();
      var mapModifySpy = sinon.spy();
      var mapRemoveSpy = sinon.spy();
      ParentDataBinding.registerOnPath('map_ref', ['collectionInsert'], mapInsertSpy);
      ParentDataBinding.registerOnPath('map_ref', ['collectionModify'], mapModifySpy);
      ParentDataBinding.registerOnPath('map_ref', ['collectionRemove'], mapRemoveSpy);

      var otherReferenceInsertSpy = sinon.spy();
      var otherReferenceModifySpy = sinon.spy();
      var otherReferenceRemoveSpy = sinon.spy();
      ParentDataBinding.registerOnPath('map_ref[three].text', ['insert'], otherReferenceInsertSpy);
      ParentDataBinding.registerOnPath('map_ref[three].text', ['modify'], otherReferenceModifySpy);
      ParentDataBinding.registerOnPath('map_ref[three].text', ['remove'], otherReferenceRemoveSpy);

      // Register the DataBinding
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding);
      dataBinder.register('BINDING', NodeContainerTemplate.typeid, ParentDataBinding);

      workspace.insert('myChild1', childPset1);
      workspace.insert('myChild2', childPset2);
      workspace.insert('myReferenceParent', referenceParentPSet);
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      dataBinder._resetDebugCounters();
      const parentDataBinding = dataBinder.resolve(referenceParentPSet, 'BINDING');

      var referenceMap = referenceParentPSet.get('map_ref');
      referenceMap.insert('one');
      referenceMap.insert('two');
      referenceMap.insert('three');
      referenceMap.insert('four', '');
      mapInsertSpy.callCount.should.equal(4);
      mapInsertSpy.resetHistory();
      referenceMap.insert('ten');
      mapInsertSpy.callCount.should.equal(1);
      mapInsertSpy.resetHistory();
      parentDataBinding.onModify.callCount.should.equal(5);
      parentDataBinding.onModify.resetHistory();
      referenceMap.remove('ten');
      mapRemoveSpy.callCount.should.equal(1);
      mapRemoveSpy.resetHistory();

      referenceMap.setValue('one', '/myChild1');
      // The reference insert will be fired
      referenceInsertSpy.callCount.should.equal(1);
      referenceInsertSpy.resetHistory();

      // this should also trigger the referenceChanged spy
      referenceChangedSpy.callCount.should.equal(1);
      referenceChangedSpy.resetHistory();
      referenceMap.setValue('three', '/myChild2');
      mapModifySpy.callCount.should.equal(2);
      mapModifySpy.resetHistory();

      // should trigger the modify spy
      childPset1.get('text').setValue('fortytwo');
      referenceModifySpy.callCount.should.equal(1);
      referenceModifySpy.resetHistory();
      // should trigger the remove spy
      workspace.remove('myChild1');
      referenceRemoveSpy.callCount.should.equal(1);
      referenceRemoveSpy.resetHistory();
      // this should also trigger the referenceChanged spy
      referenceChangedSpy.callCount.should.equal(1);
      referenceChangedSpy.resetHistory();
      // should trigger the insert spy
      workspace.insert('myChild1', childPset1);
      referenceInsertSpy.callCount.should.equal(1);
      referenceInsertSpy.resetHistory();
      // this should also trigger the referenceChanged spy
      referenceChangedSpy.callCount.should.equal(1);
      referenceChangedSpy.resetHistory();

      otherReferenceInsertSpy.resetHistory();
      otherReferenceModifySpy.resetHistory();
      otherReferenceRemoveSpy.resetHistory();

      // should trigger the modify spy
      childPset2.get('text').setValue('fortytwo');
      otherReferenceModifySpy.callCount.should.equal(1);
      otherReferenceModifySpy.resetHistory();
      // should trigger the remove spy
      workspace.remove('myChild2');
      otherReferenceRemoveSpy.callCount.should.equal(1);
      otherReferenceRemoveSpy.resetHistory();
      // should trigger the insert spy
      workspace.insert('myChild2', childPset2);
      otherReferenceInsertSpy.callCount.should.equal(1);
      otherReferenceInsertSpy.resetHistory();
      // should still trigger the original modify spy
      childPset1.get('text').setValue('42');
      referenceModifySpy.callCount.should.equal(1);
      referenceModifySpy.resetHistory();
      // but not the other one
      otherReferenceModifySpy.callCount.should.equal(0);

      // Change the reference value, this should trigger the collectionModify,
      // referenceInsert and referenceRemoved spies
      referenceMap.setValue('one', '/myChild2');
      mapModifySpy.callCount.should.equal(1);
      mapModifySpy.resetHistory();
      referenceChangedSpy.callCount.should.equal(2);
      referenceChangedSpy.resetHistory();

      // now modifying under child2 should trigger both referenceModify spies
      childPset2.get('text').setValue('42');
      referenceModifySpy.callCount.should.equal(1);
      referenceModifySpy.resetHistory();
      otherReferenceModifySpy.callCount.should.equal(1);
      otherReferenceModifySpy.resetHistory();

      refChangedError.should.equal(false);
    });

    it('should handle a chain of references to a primitive that begins with a map of references', function () {

      var referenceInsertSpy = [];
      var referenceModifySpy = [];
      var referenceRemoveSpy = [];
      var i;
      for (i = 0; i < 4; ++i) {
        referenceInsertSpy[i] = sinon.spy();
        referenceModifySpy[i] = sinon.spy();
        referenceRemoveSpy[i] = sinon.spy();
      }

      // we create a reference chain like the following:
      // an entry in the map references ref1, ref1 references ref2, ref2 references the primitive string
      // ref3 will be used later
      ParentDataBinding.registerOnPath('map_ref[a]', ['insert'], referenceInsertSpy[0]);
      ParentDataBinding.registerOnPath('map_ref[a]', ['modify'], referenceModifySpy[0]);
      ParentDataBinding.registerOnPath('map_ref[a]', ['remove'], referenceRemoveSpy[0]);
      for (i = 1; i < 4; ++i) {
        ParentDataBinding.registerOnPath('ref' + i, ['insert'], referenceInsertSpy[i]);
        ParentDataBinding.registerOnPath('ref' + i, ['modify'], referenceModifySpy[i]);
        ParentDataBinding.registerOnPath('ref' + i, ['remove'], referenceRemoveSpy[i]);
      }

      // Register the DataBinding
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding);

      // Create the reference parent pset
      var referenceParentPSet = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');
      workspace.insert('myReferenceParent', referenceParentPSet);

      // create the chain
      var referenceMap = referenceParentPSet.get('map_ref');
      referenceMap.insert('a');
      referenceMap.setValue('a', '/myReferenceParent.ref1');
      referenceParentPSet.get('ref1', RESOLVE_NEVER)
        .setValue('/myReferenceParent.ref2');
      referenceParentPSet.get('ref2', RESOLVE_NEVER)
        .setValue('/myString');

      // this should trigger the insert handler in all refs
      for (i = 0; i < 3; ++i) {
        referenceInsertSpy[i].callCount.should.equal(0);
      }
      workspace.insert('myString', PropertyFactory.create('String', 'single'));
      for (i = 0; i < 3; ++i) {
        referenceInsertSpy[i].callCount.should.equal(1);
        referenceInsertSpy[i].resetHistory();
      }

      // this should trigger the modify handler in all refs
      for (i = 0; i < 3; ++i) {
        referenceModifySpy[i].callCount.should.equal(0);
      }
      workspace.get('myString').setValue('hello');
      for (i = 0; i < 3; ++i) {
        referenceModifySpy[i].callCount.should.equal(1);
        referenceModifySpy[i].resetHistory();
      }

      // this should trigger the remove handler in all refs
      for (i = 0; i < 3; ++i) {
        referenceRemoveSpy[i].callCount.should.equal(0);
      }
      workspace.remove('myString');
      for (i = 0; i < 3; ++i) {
        referenceRemoveSpy[i].callCount.should.equal(1);
        referenceRemoveSpy[i].resetHistory();
      }
      workspace.insert('myString', PropertyFactory.create('String', 'single'));

      // Check whether modifying the references works
      workspace.insert('myString2', PropertyFactory.create('String', 'single', 'string2'));
      referenceParentPSet.get('ref3', RESOLVE_NEVER)
        .setValue('/myString2');
      referenceParentPSet.get('ref1', RESOLVE_NEVER)
        .setValue('/myReferenceParent.ref3');

      // The old handler should no longer trigger
      workspace.get('myString').setValue('hello2');
      var handlers = [0, 1, 3];
      for (i = 0; i < handlers.length; i++) {
        referenceModifySpy[handlers[i]].callCount.should.equal(0);
        referenceModifySpy[handlers[i]].resetHistory();
      }
      // ref2 still points to /myString so it should trigger
      referenceModifySpy[2].callCount.should.equal(1);
      referenceModifySpy[2].resetHistory();

      // The new handler should now trigger instead
      workspace.get('myString2').setValue('hello2');
      for (i = 0; i < handlers.length; i++) {
        referenceModifySpy[handlers[i]].callCount.should.equal(1);
        referenceModifySpy[handlers[i]].resetHistory();
      }
      // ref2 still points to /myString so it should not trigger
      referenceModifySpy[2].callCount.should.equal(0);
      referenceModifySpy[2].resetHistory();
    });

    it.skip('should handle a chain of references that has a map of refs. in the middle (LYNXDEV-4228)', function () {

      var referenceInsertSpy = [];
      var referenceModifySpy = [];
      var referenceRemoveSpy = [];
      var i;
      for (i = 0; i < 4; ++i) {
        referenceInsertSpy[i] = sinon.spy();
        referenceModifySpy[i] = sinon.spy();
        referenceRemoveSpy[i] = sinon.spy();
      }

      // we create a reference chain like the following:
      // ref1 references an entry in the map, that in turn  references ref2, ref2 references the primitive string
      // ref3 will be used later
      ParentDataBinding.registerOnPath('ref1', ['insert'], referenceInsertSpy[0]);
      ParentDataBinding.registerOnPath('ref1', ['modify'], referenceModifySpy[0]);
      ParentDataBinding.registerOnPath('ref1', ['remove'], referenceRemoveSpy[0]);
      ParentDataBinding.registerOnPath('map_ref[a]', ['insert'], referenceInsertSpy[1]);
      ParentDataBinding.registerOnPath('map_ref[a]', ['modify'], referenceModifySpy[1]);
      ParentDataBinding.registerOnPath('map_ref[a]', ['remove'], referenceRemoveSpy[1]);
      for (i = 2; i < 4; ++i) {
        ParentDataBinding.registerOnPath('ref' + i, ['insert'], referenceInsertSpy[i]);
        ParentDataBinding.registerOnPath('ref' + i, ['modify'], referenceModifySpy[i]);
        ParentDataBinding.registerOnPath('ref' + i, ['remove'], referenceRemoveSpy[i]);
      }

      // Register the DataBinding
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding);

      // Create the reference parent pset
      var referenceParentPSet = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');
      workspace.insert('myReferenceParent', referenceParentPSet);

      // create the chain
      referenceParentPSet.get('ref1', RESOLVE_NEVER)
        .setValue('/myReferenceParent.map_ref[a]');
      var referenceMap = referenceParentPSet.get('map_ref');
      referenceMap.insert('a');
      referenceMap.setValue('a', '/myReferenceParent.ref2');
      referenceParentPSet.get('ref2', RESOLVE_NEVER)
        .setValue('/myString');

      // this should trigger the insert handler in all refs
      for (i = 0; i < 3; ++i) {
        referenceInsertSpy[i].callCount.should.equal(0);
      }
      workspace.insert('myString', PropertyFactory.create('String', 'single'));
      for (i = 0; i < 3; ++i) {
        referenceInsertSpy[i].callCount.should.equal(1);
        referenceInsertSpy[i].resetHistory();
      }

      // this should trigger the modify handler in all refs
      for (i = 0; i < 3; ++i) {
        referenceModifySpy[i].callCount.should.equal(0);
      }
      workspace.get('myString').setValue('hello');
      for (i = 0; i < 3; ++i) {
        referenceModifySpy[i].callCount.should.equal(1);
        referenceModifySpy[i].resetHistory();
      }

      // this should trigger the remove handler in all refs
      for (i = 0; i < 3; ++i) {
        referenceRemoveSpy[i].callCount.should.equal(0);
      }
      workspace.remove('myString');
      for (i = 0; i < 3; ++i) {
        referenceRemoveSpy[i].callCount.should.equal(1);
        referenceRemoveSpy[i].resetHistory();
      }
      workspace.insert('myString', PropertyFactory.create('String', 'single'));

      // Check whether modifying the references works
      workspace.insert('myString2', PropertyFactory.create('String', 'single', 'string2'));
      referenceParentPSet.get('ref3', RESOLVE_NEVER)
        .setValue('/myString2');
      referenceParentPSet.get('ref1', RESOLVE_NEVER)
        .setValue('/myReferenceParent.ref3');

      // The old handler should no longer trigger
      workspace.get('myString').setValue('hello2');
      var handlers = [0, 1, 3];
      for (i = 0; i < handlers.length; i++) {
        referenceModifySpy[handlers[i]].callCount.should.equal(0);
        referenceModifySpy[handlers[i]].resetHistory();
      }
      // ref2 still points to /myString so it should trigger
      referenceModifySpy[2].callCount.should.equal(1);
      referenceModifySpy[2].resetHistory();

      // The new handler should now trigger instead
      workspace.get('myString2').setValue('hello2');
      for (i = 0; i < handlers.length; i++) {
        referenceModifySpy[handlers[i]].callCount.should.equal(1);
        referenceModifySpy[handlers[i]].resetHistory();
      }
      // ref2 still points to /myString so it should not trigger
      referenceModifySpy[2].callCount.should.equal(0);
      referenceModifySpy[2].resetHistory();
    });

    it('should be able to modify multi-hop references that begins with a map of references', function () {
      // Add the reference parent pset
      var referenceParentPSet = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');
      var referenceParentPSet2 = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');
      var nodeParentPSet = PropertyFactory.create(NodeContainerTemplate.typeid, 'single');
      var nodeParentPSet2 = PropertyFactory.create(NodeContainerTemplate.typeid, 'single');

      // Add our child (referenced) pset
      var childPset1 = PropertyFactory.create(ChildTemplate.typeid, 'single');
      var childPset2 = PropertyFactory.create(ChildTemplate.typeid, 'single');

      var referenceInsertSpy = sinon.spy(function (in_modificationContext) {
        var prop = in_modificationContext.getProperty();
        expect(PropertyFactory.instanceOf(prop, 'String', 'single')).to.be.true;
      });
      var referenceModifySpy = sinon.spy(function (in_modificationContext) {
        var prop = in_modificationContext.getProperty();
        expect(PropertyFactory.instanceOf(prop, 'String', 'single')).to.be.true;
      });
      var referenceRemoveSpy = sinon.spy();
      ParentDataBinding.registerOnPath('single_ref.text', ['insert'], referenceInsertSpy);
      ParentDataBinding.registerOnPath('single_ref.text', ['modify'], referenceModifySpy);
      ParentDataBinding.registerOnPath('single_ref.text', ['remove'], referenceRemoveSpy);

      var doubleReferenceInsertSpy = sinon.spy(function (in_modificationContext) {
        var prop = in_modificationContext.getProperty();
        expect(PropertyFactory.instanceOf(prop, 'String', 'single')).to.be.true;
      });
      var doubleReferenceModifySpy = sinon.spy(function (in_modificationContext) {
        var prop = in_modificationContext.getProperty();
        expect(PropertyFactory.instanceOf(prop, 'String', 'single')).to.be.true;
      });
      var doubleReferenceRemoveSpy = sinon.spy();
      var doubleReferenceRefChangedSpy = sinon.spy();
      ParentDataBinding.registerOnPath('map_ref[a].single_ref.text', ['insert'], doubleReferenceInsertSpy);
      ParentDataBinding.registerOnPath('map_ref[a].single_ref.text', ['modify'], doubleReferenceModifySpy);
      ParentDataBinding.registerOnPath('map_ref[a].single_ref.text', ['remove'], doubleReferenceRemoveSpy);
      ParentDataBinding.registerOnPath('map_ref[a].single_ref.text', ['referenceChanged'],
        doubleReferenceRefChangedSpy);

      // Register the DataBinding
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding);
      dataBinder.register('BINDING', NodeContainerTemplate.typeid, ParentDataBinding);

      // TODO: Test bind to multi hops
      //ParentDataBinding.registerOnPath('single_ref.single_ref',
      // ['modify'], doubleReferenceRemoveSpy);

      var incCounter = 0;
      var from = undefined;
      var to = '/myChild1.text';
      var runTests = function (in_increment, in_refChangedCount) {
        doubleReferenceRefChangedSpy.callCount.should.equal(in_refChangedCount);
        // We should have a property if 'to' is defined
        expect(!!doubleReferenceRefChangedSpy.getCall(0).args[0].getProperty()).to.equal(!!to);
        if (to) {
          expect(doubleReferenceRefChangedSpy.getCall(0).args[0].getProperty().getAbsolutePath()).to.equal(to);
        }
        if (in_refChangedCount === 1) {
          var dummy = from;
          from = to;
          to = dummy;
        }

        doubleReferenceModifySpy.callCount.should.equal(0);
        childPset1.get('text').setValue('newText' + (incCounter++));
        doubleReferenceModifySpy.callCount.should.equal(in_increment);
        // this should not trigger the referenceChanged handler
        doubleReferenceRefChangedSpy.callCount.should.equal(in_refChangedCount);

        // This should trigger the remove handler
        doubleReferenceRemoveSpy.callCount.should.equal(in_refChangedCount - in_increment);
        doubleReferenceRemoveSpy.resetHistory();
        workspace.remove('myChild1');
        doubleReferenceRemoveSpy.callCount.should.equal(in_increment);

        // This should trigger the insert handler
        // It will already have been called once when the reference became valid
        doubleReferenceInsertSpy.callCount.should.equal(in_increment);
        workspace.insert('myChild1', childPset1);
        doubleReferenceInsertSpy.callCount.should.equal(2 * in_increment);

        doubleReferenceRefChangedSpy.callCount.should.equal(in_refChangedCount + 2 * in_increment);
        doubleReferenceInsertSpy.resetHistory();
        doubleReferenceModifySpy.resetHistory();
        doubleReferenceRemoveSpy.resetHistory();
        doubleReferenceRefChangedSpy.resetHistory();
      };

      workspace.insert('myChild1', childPset1);
      workspace.insert('myChild2', childPset2);

      // Create a second parent
      referenceParentPSet2.get('single_ref', RESOLVE_NEVER)
        .setValue('/myChild1');
      workspace.insert('myReferenceParent2', referenceParentPSet2);

      // We insert with an already valid reference
      var mapRef = referenceParentPSet.get('map_ref');
      mapRef.insert('a', '/myReferenceParent2');
      workspace.insert('myReferenceParent', referenceParentPSet);

      // This should trigger the modify on the reference property
      runTests(1, 1);

      // This should unbind the tests
      workspace.remove('myReferenceParent');
      runTests(0, 1);

      // Restore the references
      workspace.insert('myReferenceParent', referenceParentPSet);
      runTests(1, 1);

      // Changing the reference should unbind all tests again
      mapRef.setValue('a', '/invalid_ref_value');
      runTests(0, 1);

      // Restore the references
      mapRef.setValue('a', '/myReferenceParent2');
      runTests(1, 1);

      // Now delete the node in the middle of the reference chain
      workspace.remove('myReferenceParent2');
      runTests(0, 1);

      // Restore the references
      workspace.insert('myReferenceParent2', referenceParentPSet2);
      runTests(1, 1);

      // Changing the nested reference should also unbind all tests
      referenceParentPSet2.get('single_ref', RESOLVE_NEVER)
        .setValue('/invalid_ref_value');
      runTests(0, 1);

      // Restore the references
      referenceParentPSet2.get('single_ref', RESOLVE_NEVER)
        .setValue('/myChild1');
      runTests(1, 1);

      // Test the same for dynamically inserting and removing references
      workspace.remove('myReferenceParent2', referenceParentPSet2);
      workspace.remove('myReferenceParent', referenceParentPSet);
      workspace.insert('myReferenceParent2', nodeParentPSet2);
      workspace.insert('myReferenceParent', nodeParentPSet);
      nodeParentPSet2.insert('single_ref', PropertyFactory.create('Reference', undefined, '/myChild1'));
      nodeParentPSet.insert('map_ref', PropertyFactory.create('Reference', 'map'));
      var nodeParentMapRef = nodeParentPSet.get('map_ref');
      nodeParentMapRef.insert('a', '/myReferenceParent2');
      runTests(1, 2);

      // Removing the first property should unregister the handlers
      // TODO deleting the map will not work, have to delete the reference from tha map - similarly to collections
      // nodeParentPSet.remove('map_ref');
      nodeParentMapRef.remove('a');
      runTests(0, 1);

      // Inserting it should restore the handlers
      nodeParentMapRef.insert('a', '/myReferenceParent2');
      runTests(1, 1);

      // Removing the first property should unregister the handlers
      nodeParentPSet2.remove('single_ref');
      runTests(0, 1);

      // Inserting it should restore the handlers
      nodeParentPSet2.insert('single_ref', PropertyFactory.create('Reference', undefined, '/myChild1'));
      runTests(1, 1);
    });

    it('should not call callbacks for removed refs in a map of references', function () {
      // Add the reference parent pset
      var referenceParentPSet = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');

      // Add our child (referenced) pset
      var childPset1 = PropertyFactory.create(ChildTemplate.typeid, 'single');
      var childPset2 = PropertyFactory.create(ChildTemplate.typeid, 'single');

      var referenceInsertSpy = sinon.spy();
      var referenceModifySpy = sinon.spy();
      var referenceRemoveSpy = sinon.spy();
      ParentDataBinding.registerOnPath('map_ref[a].text', ['insert'], referenceInsertSpy);
      ParentDataBinding.registerOnPath('map_ref[a].text', ['modify'], referenceModifySpy);
      ParentDataBinding.registerOnPath('map_ref[a].text', ['remove'], referenceRemoveSpy);

      var refChangedError = false;
      var referenceChangedSpy = sinon.spy(function (in_referenceChangedContext) {
        var prop = in_referenceChangedContext.getProperty();
        // have to do it this way because HFDM swallows exceptions in callbacks :(
        if (prop) {
          if (!PropertyFactory.instanceOf(prop, 'String', 'single')) {
            refChangedError = true;
          }
        }
      });
      ParentDataBinding.registerOnPath('map_ref[a].text', ['referenceChanged'], referenceChangedSpy);

      var mapInsertSpy = sinon.spy();
      var mapModifySpy = sinon.spy();
      var mapRemoveSpy = sinon.spy();
      ParentDataBinding.registerOnPath('map_ref', ['collectionInsert'], mapInsertSpy);
      ParentDataBinding.registerOnPath('map_ref', ['collectionModify'], mapModifySpy);
      ParentDataBinding.registerOnPath('map_ref', ['collectionRemove'], mapRemoveSpy);

      // Register the DataBinding
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding);
      dataBinder.register('BINDING', NodeContainerTemplate.typeid, ParentDataBinding);

      workspace.insert('myChild1', childPset1);
      workspace.insert('myChild2', childPset2);
      workspace.insert('myReferenceParent', referenceParentPSet);
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      dataBinder._resetDebugCounters();
      const parentDataBinding = dataBinder.resolve(referenceParentPSet, 'BINDING');

      var referenceMap = referenceParentPSet.get('map_ref');
      referenceMap.insert('a');
      mapInsertSpy.callCount.should.equal(1);
      mapInsertSpy.resetHistory();
      parentDataBinding.onModify.callCount.should.equal(1);
      parentDataBinding.onModify.resetHistory();

      referenceMap.setValue('a', '/myChild1');
      // this should trigger the referenceChanged spy
      referenceChangedSpy.callCount.should.equal(1);
      referenceChangedSpy.getCall(0).args[0].getProperty().getAbsolutePath().should.equal('/myChild1.text');
      referenceChangedSpy.resetHistory();

      // should also trigger the modify spy
      childPset1.get('text').setValue('fortytwo');
      referenceModifySpy.callCount.should.equal(1);
      referenceModifySpy.resetHistory();
      // set our reference to empty
      referenceMap.setValue('a', '');
      // the modify spy should not be triggered anymore
      childPset1.get('text').setValue('sixtyfour');
      referenceModifySpy.callCount.should.equal(0);
      // this should also trigger the referenceChanged spy
      referenceChangedSpy.callCount.should.equal(1);
      should.not.exist(referenceChangedSpy.getCall(0).args[0].getProperty());
      referenceChangedSpy.resetHistory();
      // set it to an invalid value
      referenceMap.setValue('a', '/invalid');
      // this should not trigger the referenceChanged spy since it's still undefined
      referenceChangedSpy.callCount.should.equal(0);
      referenceChangedSpy.resetHistory();
      referenceModifySpy.callCount.should.equal(0);
      // set back to valid
      referenceMap.setValue('a', '/myChild1');
      // this should also trigger the referenceChanged spy
      referenceChangedSpy.callCount.should.equal(1);
      referenceChangedSpy.getCall(0).args[0].getProperty().getAbsolutePath().should.equal('/myChild1.text');
      referenceChangedSpy.resetHistory();
      // but not the modified spy
      referenceModifySpy.callCount.should.equal(0);
      // now remove (triggers a different code path than just setting it empty)
      referenceMap.remove('a');
      // this should also trigger the referenceChanged spy
      referenceChangedSpy.callCount.should.equal(1);
      should.not.exist(referenceChangedSpy.getCall(0).args[0].getProperty());
      referenceChangedSpy.resetHistory();
      // but not the modified spy
      referenceModifySpy.callCount.should.equal(0);
      // the modify spy should not be triggered anymore
      childPset1.get('text').setValue('sixtyfour-sixtyfour');
      referenceModifySpy.callCount.should.equal(0);
      referenceChangedSpy.callCount.should.equal(0);

      refChangedError.should.equal(false);
    });

    it('should have basic support for an array of references', function () {
      // Add the reference parent pset
      var referenceParentPSet = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');

      // Add our child (referenced) pset
      var childPset1 = PropertyFactory.create(ChildTemplate.typeid, 'single');
      var childPset2 = PropertyFactory.create(ChildTemplate.typeid, 'single');

      var referenceInsertSpy = sinon.spy();
      var referenceModifySpy = sinon.spy();
      var referenceRemoveSpy = sinon.spy();
      ParentDataBinding.registerOnPath('array_ref[0].text', ['insert'], referenceInsertSpy);
      ParentDataBinding.registerOnPath('array_ref[0].text', ['modify'], referenceModifySpy);
      ParentDataBinding.registerOnPath('array_ref[0].text', ['remove'], referenceRemoveSpy);

      var refChangedError = false;
      var referenceChangedSpy = sinon.spy(function (in_referenceChangedContext) {
        var prop = in_referenceChangedContext.getProperty();
        // have to do it this way because HFDM swallows exceptions in callbacks :(
        if (prop) {
          if (!PropertyFactory.instanceOf(prop, 'String', 'single')) {
            refChangedError = true;
          }
        }
      });
      ParentDataBinding.registerOnPath('array_ref[0].text', ['referenceChanged'], referenceChangedSpy);

      var arrayInsertSpy = sinon.spy();
      var arrayModifySpy = sinon.spy();
      var arrayRemoveSpy = sinon.spy();
      ParentDataBinding.registerOnPath('array_ref', ['collectionInsert'], arrayInsertSpy);
      ParentDataBinding.registerOnPath('array_ref', ['collectionModify'], arrayModifySpy);
      ParentDataBinding.registerOnPath('array_ref', ['collectionRemove'], arrayRemoveSpy);

      // register these later to make sure we're modifying the right reference property objects in the prototype
      var otherReferenceInsertSpy = sinon.spy();
      var otherReferenceModifySpy = sinon.spy();
      var otherReferenceRemoveSpy = sinon.spy();
      ParentDataBinding.registerOnPath('array_ref[2].text', ['insert'], otherReferenceInsertSpy);
      ParentDataBinding.registerOnPath('array_ref[2].text', ['modify'], otherReferenceModifySpy);
      ParentDataBinding.registerOnPath('array_ref[2].text', ['remove'], otherReferenceRemoveSpy);

      // Register the DataBinding
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding);
      dataBinder.register('BINDING', NodeContainerTemplate.typeid, ParentDataBinding);

      workspace.insert('myChild1', childPset1);
      workspace.insert('myChild2', childPset2);
      workspace.insert('myReferenceParent', referenceParentPSet);
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      dataBinder._resetDebugCounters();
      const parentDataBinding = dataBinder.resolve(referenceParentPSet, 'BINDING');

      var referenceArray = referenceParentPSet.get('array_ref');
      referenceArray.push();
      referenceArray.push();
      referenceArray.push();
      arrayInsertSpy.callCount.should.equal(3);
      arrayInsertSpy.resetHistory();
      parentDataBinding.onModify.callCount.should.equal(3);
      parentDataBinding.onModify.resetHistory();
      referenceArray.push();
      referenceArray.pop();
      arrayInsertSpy.callCount.should.equal(1);
      arrayInsertSpy.resetHistory();
      arrayRemoveSpy.callCount.should.equal(1);
      arrayRemoveSpy.resetHistory();

      referenceArray.set(0, '/myChild1');
      // The reference becoming valid makes the insert be called
      referenceInsertSpy.callCount.should.equal(1);
      referenceInsertSpy.resetHistory();

      // this should also trigger the referenceChanged spy
      referenceChangedSpy.callCount.should.equal(1);
      referenceChangedSpy.resetHistory();
      referenceArray.set(2, '/myChild2');
      // Reference became valid - insert was fired
      otherReferenceInsertSpy.callCount.should.equal(1);
      otherReferenceInsertSpy.resetHistory();
      arrayModifySpy.callCount.should.equal(2);
      arrayModifySpy.resetHistory();

      // should trigger the modify spy
      childPset1.get('text').setValue('fortytwo');
      referenceModifySpy.callCount.should.equal(1);
      referenceModifySpy.resetHistory();
      // should trigger the remove spy
      workspace.remove('myChild1');
      referenceRemoveSpy.callCount.should.equal(1);
      referenceRemoveSpy.resetHistory();
      // this should also trigger the referenceChanged spy
      referenceChangedSpy.callCount.should.equal(1);
      referenceChangedSpy.resetHistory();
      // should trigger the insert spy
      workspace.insert('myChild1', childPset1);
      referenceInsertSpy.callCount.should.equal(1);
      referenceInsertSpy.resetHistory();
      // this should also trigger the referenceChanged spy
      referenceChangedSpy.callCount.should.equal(1);
      referenceChangedSpy.resetHistory();

      // should trigger the modify spy
      childPset2.get('text').setValue('fortytwo');
      otherReferenceModifySpy.callCount.should.equal(1);
      otherReferenceModifySpy.resetHistory();
      // should trigger the remove spy
      workspace.remove('myChild2');
      otherReferenceRemoveSpy.callCount.should.equal(1);
      otherReferenceRemoveSpy.resetHistory();
      // should trigger the insert spy
      workspace.insert('myChild2', childPset2);
      otherReferenceInsertSpy.callCount.should.equal(1);
      otherReferenceInsertSpy.resetHistory();
      // should still trigger the original modify spy
      childPset1.get('text').setValue('42');
      referenceModifySpy.callCount.should.equal(1);
      referenceModifySpy.resetHistory();
      // but not the other one
      otherReferenceModifySpy.callCount.should.equal(0);

      // Change the reference value, this should trigger both the collectionModify & referenceChanged spies
      referenceArray.set(0, '/myChild2');
      arrayModifySpy.callCount.should.equal(1);
      arrayModifySpy.resetHistory();
      referenceChangedSpy.callCount.should.equal(2); // once for 'remove', once for 'insert'
      referenceChangedSpy.resetHistory();

      // now modifying under child2 should trigger both referenceModify spies
      childPset2.get('text').setValue('42');
      referenceModifySpy.callCount.should.equal(1);
      referenceModifySpy.resetHistory();
      otherReferenceModifySpy.callCount.should.equal(1);
      otherReferenceModifySpy.resetHistory();

      refChangedError.should.equal(false);
    });

    it('should handle a chain of references to a primitive that begins with an array of references', function () {

      var referenceInsertSpy = [];
      var referenceModifySpy = [];
      var referenceRemoveSpy = [];
      var i;
      for (i = 0; i < 4; ++i) {
        referenceInsertSpy[i] = sinon.spy();
        referenceModifySpy[i] = sinon.spy();
        referenceRemoveSpy[i] = sinon.spy();
      }

      // we create a reference chain like the following:
      // an entry in the map references ref1, ref1 references ref2, ref2 references the primitive string
      // ref3 will be used later
      ParentDataBinding.registerOnPath('array_ref[0]', ['insert'], referenceInsertSpy[0]);
      ParentDataBinding.registerOnPath('array_ref[0]', ['modify'], referenceModifySpy[0]);
      ParentDataBinding.registerOnPath('array_ref[0]', ['remove'], referenceRemoveSpy[0]);
      for (i = 1; i < 4; ++i) {
        ParentDataBinding.registerOnPath('ref' + i, ['insert'], referenceInsertSpy[i]);
        ParentDataBinding.registerOnPath('ref' + i, ['modify'], referenceModifySpy[i]);
        ParentDataBinding.registerOnPath('ref' + i, ['remove'], referenceRemoveSpy[i]);
      }

      // Register the DataBinding
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding);

      // Create the reference parent pset
      var referenceParentPSet = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');
      workspace.insert('myReferenceParent', referenceParentPSet);

      // create the chain
      var referenceArray = referenceParentPSet.get('array_ref');
      referenceArray.push();
      referenceArray.set(0, '/myReferenceParent.ref1');
      referenceParentPSet.get('ref1', RESOLVE_NEVER)
        .setValue('/myReferenceParent.ref2');
      referenceParentPSet.get('ref2', RESOLVE_NEVER)
        .setValue('/myString');

      // this should trigger the insert handler in all refs
      for (i = 0; i < 3; ++i) {
        referenceInsertSpy[i].callCount.should.equal(0);
      }
      workspace.insert('myString', PropertyFactory.create('String', 'single'));
      for (i = 0; i < 3; ++i) {
        referenceInsertSpy[i].callCount.should.equal(1);
        referenceInsertSpy[i].resetHistory();
      }

      // this should trigger the modify handler in all refs
      for (i = 0; i < 3; ++i) {
        referenceModifySpy[i].callCount.should.equal(0);
      }
      workspace.get('myString').setValue('hello');
      for (i = 0; i < 3; ++i) {
        referenceModifySpy[i].callCount.should.equal(1);
        referenceModifySpy[i].resetHistory();
      }

      // this should trigger the remove handler in all refs
      for (i = 0; i < 3; ++i) {
        referenceRemoveSpy[i].callCount.should.equal(0);
      }
      workspace.remove('myString');
      for (i = 0; i < 3; ++i) {
        referenceRemoveSpy[i].callCount.should.equal(1);
        referenceRemoveSpy[i].resetHistory();
      }
      workspace.insert('myString', PropertyFactory.create('String', 'single'));

      // Check whether modifying the references works
      workspace.insert('myString2', PropertyFactory.create('String', 'single', 'string2'));
      referenceParentPSet.get('ref3', RESOLVE_NEVER)
        .setValue('/myString2');
      referenceParentPSet.get('ref1', RESOLVE_NEVER)
        .setValue('/myReferenceParent.ref3');

      // The old handler should no longer trigger
      workspace.get('myString').setValue('hello2');
      var handlers = [0, 1, 3];
      for (i = 0; i < handlers.length; i++) {
        referenceModifySpy[handlers[i]].callCount.should.equal(0);
        referenceModifySpy[handlers[i]].resetHistory();
      }
      // ref2 still points to /myString so it should trigger
      referenceModifySpy[2].callCount.should.equal(1);
      referenceModifySpy[2].resetHistory();

      // The new handler should now trigger instead
      workspace.get('myString2').setValue('hello2');
      for (i = 0; i < handlers.length; i++) {
        referenceModifySpy[handlers[i]].callCount.should.equal(1);
        referenceModifySpy[handlers[i]].resetHistory();
      }
      // ref2 still points to /myString so it should not trigger
      referenceModifySpy[2].callCount.should.equal(0);
      referenceModifySpy[2].resetHistory();
    });

    it('should be able to modify multi-hop references that begins with an array of references', function () {
      // Add the reference parent pset
      var referenceParentPSet = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');
      var referenceParentPSet2 = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');
      var nodeParentPSet = PropertyFactory.create(NodeContainerTemplate.typeid, 'single');
      var nodeParentPSet2 = PropertyFactory.create(NodeContainerTemplate.typeid, 'single');

      // Add our child (referenced) pset
      var childPset1 = PropertyFactory.create(ChildTemplate.typeid, 'single');
      var childPset2 = PropertyFactory.create(ChildTemplate.typeid, 'single');

      var referenceInsertSpy = sinon.spy(function (in_modificationContext) {
        var prop = in_modificationContext.getProperty();
        expect(PropertyFactory.instanceOf(prop, 'String', 'single')).to.be.true;
      });
      var referenceModifySpy = sinon.spy(function (in_modificationContext) {
        var prop = in_modificationContext.getProperty();
        expect(PropertyFactory.instanceOf(prop, 'String', 'single')).to.be.true;
      });
      var referenceRemoveSpy = sinon.spy();
      ParentDataBinding.registerOnPath('single_ref.text', ['insert'], referenceInsertSpy);
      ParentDataBinding.registerOnPath('single_ref.text', ['modify'], referenceModifySpy);
      ParentDataBinding.registerOnPath('single_ref.text', ['remove'], referenceRemoveSpy);

      var doubleReferenceInsertSpy = sinon.spy(function (in_modificationContext) {
        var prop = in_modificationContext.getProperty();
        expect(PropertyFactory.instanceOf(prop, 'String', 'single')).to.be.true;
      });
      var doubleReferenceModifySpy = sinon.spy(function (in_modificationContext) {
        var prop = in_modificationContext.getProperty();
        expect(PropertyFactory.instanceOf(prop, 'String', 'single')).to.be.true;
      });
      var doubleReferenceRemoveSpy = sinon.spy();
      var doubleReferenceRefChangedSpy = sinon.spy();
      ParentDataBinding.registerOnPath('array_ref[0].single_ref.text', ['insert'], doubleReferenceInsertSpy);
      ParentDataBinding.registerOnPath('array_ref[0].single_ref.text', ['modify'], doubleReferenceModifySpy);
      ParentDataBinding.registerOnPath('array_ref[0].single_ref.text', ['remove'], doubleReferenceRemoveSpy);
      ParentDataBinding.registerOnPath('array_ref[0].single_ref.text', ['referenceChanged'],
        doubleReferenceRefChangedSpy);

      // Register the DataBinding
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding);
      dataBinder.register('BINDING', NodeContainerTemplate.typeid, ParentDataBinding);

      // TODO: Test bind to multi hops
      //ParentDataBinding.registerOnPath('single_ref.single_ref',
      // ['modify'], doubleReferenceRemoveSpy);

      var incCounter = 0;
      var from = undefined;
      var to = '/myChild1.text';
      var runTests = function (in_increment, in_refChangedCount) {
        // We should have a property if 'to' is defined
        expect(!!doubleReferenceRefChangedSpy.getCall(0).args[0].getProperty()).to.equal(!!to);
        if (to) {
          expect(doubleReferenceRefChangedSpy.getCall(0).args[0].getProperty().getAbsolutePath()).to.equal(to);
        }
        if (in_refChangedCount === 1) {
          var dummy = from;
          from = to;
          to = dummy;
        }

        doubleReferenceModifySpy.callCount.should.equal(0);
        childPset1.get('text').setValue('newText' + (incCounter++));
        doubleReferenceModifySpy.callCount.should.equal(in_increment);
        // this should not trigger the referenceChanged handler
        doubleReferenceRefChangedSpy.callCount.should.equal(in_refChangedCount);

        // This should trigger the remove handler
        doubleReferenceRemoveSpy.callCount.should.equal(in_refChangedCount - in_increment);
        doubleReferenceRemoveSpy.resetHistory();
        workspace.remove('myChild1');
        doubleReferenceRemoveSpy.callCount.should.equal(in_increment);

        // This should trigger the insert handler
        // It may have been called once when the insert reference became valid
        doubleReferenceInsertSpy.callCount.should.equal(in_increment);
        workspace.insert('myChild1', childPset1);
        doubleReferenceInsertSpy.callCount.should.equal(2 * in_increment);

        doubleReferenceRefChangedSpy.callCount.should.equal(in_refChangedCount + 2 * in_increment);
        doubleReferenceInsertSpy.resetHistory();
        doubleReferenceModifySpy.resetHistory();
        doubleReferenceRemoveSpy.resetHistory();
        doubleReferenceRefChangedSpy.resetHistory();
      };

      workspace.insert('myChild1', childPset1);
      workspace.insert('myChild2', childPset2);

      // Create a second parent
      referenceParentPSet2.get('single_ref', RESOLVE_NEVER)
        .setValue('/myChild1');
      workspace.insert('myReferenceParent2', referenceParentPSet2);

      // We insert with an already valid reference
      var arrayRef = referenceParentPSet.get('array_ref');
      arrayRef.push('/myReferenceParent2');
      workspace.insert('myReferenceParent', referenceParentPSet);

      // This should trigger the modify on the reference property
      runTests(1, 1);

      // This should unbind the tests
      workspace.remove('myReferenceParent');
      runTests(0, 1);

      // Restore the references
      workspace.insert('myReferenceParent', referenceParentPSet);
      runTests(1, 1);

      // Changing the reference should unbind all tests again
      arrayRef.set(0, '/invalid_ref_value');
      runTests(0, 1);

      // Restore the references
      arrayRef.set(0, '/myReferenceParent2');
      runTests(1, 1);

      // Now delete the node in the middle of the reference chain
      workspace.remove('myReferenceParent2');
      runTests(0, 1);

      // Restore the references
      workspace.insert('myReferenceParent2', referenceParentPSet2);
      runTests(1, 1);

      // Changing the nested reference should also unbind all tests
      referenceParentPSet2.get('single_ref', RESOLVE_NEVER)
        .setValue('/invalid_ref_value');
      runTests(0, 1);

      // Restore the references
      referenceParentPSet2.get('single_ref', RESOLVE_NEVER)
        .setValue('/myChild1');
      runTests(1, 1);

      // Test the same for dynamically inserting and removing references
      workspace.remove('myReferenceParent2', referenceParentPSet2);
      workspace.remove('myReferenceParent', referenceParentPSet);
      workspace.insert('myReferenceParent2', nodeParentPSet2);
      workspace.insert('myReferenceParent', nodeParentPSet);
      nodeParentPSet2.insert('single_ref', PropertyFactory.create('Reference', undefined, '/myChild1'));
      nodeParentPSet.insert('array_ref', PropertyFactory.create('Reference', 'array'));
      var nodeParentArrayRef = nodeParentPSet.get('array_ref');
      nodeParentArrayRef.push('/myReferenceParent2');
      runTests(1, 2);

      // Removing the first property should unregister the handlers
      // TODO deleting the array will not work, have to delete the reference from the array - similarly to collections
      // nodeParentPSet.remove('map_ref');
      nodeParentArrayRef.remove(0);
      runTests(0, 1);

      // Inserting it should restore the handlers
      nodeParentArrayRef.insert(0, '/myReferenceParent2');
      runTests(1, 1);

      // Removing the first property should unregister the handlers
      nodeParentPSet2.remove('single_ref');
      runTests(0, 1);

      // Inserting it should restore the handlers
      nodeParentPSet2.insert('single_ref', PropertyFactory.create('Reference', undefined, '/myChild1'));
      runTests(1, 1);
    });

    it('should handle insert/remove below a rel. path cb in an array of references (LYNXDEV-4410)', function () {
      const LYNXDEV4410Fixed = false;

      // Add the reference parent pset
      var referenceParentPSet = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');

      // Add our child (referenced) pset
      var childPset1 = PropertyFactory.create(ChildTemplate.typeid, 'single');
      var childPset2 = PropertyFactory.create(ChildTemplate.typeid, 'single');

      var referenceInsertSpy = sinon.spy();
      var referenceModifySpy = sinon.spy();
      var referenceRemoveSpy = sinon.spy();
      ParentDataBinding.registerOnPath('array_ref[2].text', ['insert'], referenceInsertSpy);
      ParentDataBinding.registerOnPath('array_ref[2].text', ['modify'], referenceModifySpy);
      ParentDataBinding.registerOnPath('array_ref[2].text', ['remove'], referenceRemoveSpy);

      var refChangedError = false;
      var referenceChangedSpy = sinon.spy(function (in_referenceChangedContext) {
        var prop = in_referenceChangedContext.getProperty();
        // have to do it this way because HFDM swallows exceptions in callbacks :(
        if (prop) {
          if (!PropertyFactory.instanceOf(prop, 'String', 'single')) {
            refChangedError = true;
          }
        }
      });
      ParentDataBinding.registerOnPath('array_ref[2].text', ['referenceChanged'], referenceChangedSpy);

      // Register the DataBinding
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding);
      dataBinder.register('BINDING', NodeContainerTemplate.typeid, ParentDataBinding);

      workspace.insert('myChild1', childPset1);
      workspace.insert('myChild2', childPset2);
      workspace.insert('myReferenceParent', referenceParentPSet);
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      dataBinder._resetDebugCounters();
      const parentDataBinding = dataBinder.resolve(referenceParentPSet, 'BINDING');

      var referenceArray = referenceParentPSet.get('array_ref');
      referenceArray.push();
      referenceArray.push();
      referenceArray.push();
      referenceArray.push();
      parentDataBinding.onModify.callCount.should.equal(4);
      parentDataBinding.onModify.resetHistory();

      referenceArray.set(2, '/myChild1');
      // this should also trigger the referenceChanged spy
      referenceChangedSpy.callCount.should.equal(1);
      referenceChangedSpy.resetHistory();
      if (LYNXDEV4410Fixed) {
        referenceModifySpy.callCount.should.equal(1);
      }
      // remove below our reference
      referenceArray.remove(1);
      // this should trigger the referenceChanged spy!
      if (LYNXDEV4410Fixed) {
        referenceChangedSpy.callCount.should.equal(1);
      }
      referenceChangedSpy.resetHistory();
      refChangedError.should.equal(false);
    });

    it('should not call callbacks for removed refs in an array of references', function () {
      // Add the reference parent pset
      var referenceParentPSet = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');

      // Add our child (referenced) pset
      var childPset1 = PropertyFactory.create(ChildTemplate.typeid, 'single');
      var childPset2 = PropertyFactory.create(ChildTemplate.typeid, 'single');

      var referenceInsertSpy = sinon.spy();
      var referenceModifySpy = sinon.spy();
      var referenceRemoveSpy = sinon.spy();
      ParentDataBinding.registerOnPath('array_ref[0].text', ['insert'], referenceInsertSpy);
      ParentDataBinding.registerOnPath('array_ref[0].text', ['modify'], referenceModifySpy);
      ParentDataBinding.registerOnPath('array_ref[0].text', ['remove'], referenceRemoveSpy);

      var refChangedError = false;
      var referenceChangedSpy = sinon.spy(function (in_referenceChangedContext) {
        var prop = in_referenceChangedContext.getProperty();
        // have to do it this way because HFDM swallows exceptions in callbacks :(
        if (prop) {
          if (!PropertyFactory.instanceOf(prop, 'String', 'single')) {
            refChangedError = true;
          }
        }
      });

      ParentDataBinding.registerOnPath('array_ref[0].text', ['referenceChanged'], referenceChangedSpy);

      var arrayInsertSpy = sinon.spy();
      var arrayModifySpy = sinon.spy();
      var arrayRemoveSpy = sinon.spy();
      ParentDataBinding.registerOnPath('array_ref', ['collectionInsert'], arrayInsertSpy);
      ParentDataBinding.registerOnPath('array_ref', ['collectionModify'], arrayModifySpy);
      ParentDataBinding.registerOnPath('array_ref', ['collectionRemove'], arrayRemoveSpy);

      // Register the DataBinding
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding);
      dataBinder.register('BINDING', NodeContainerTemplate.typeid, ParentDataBinding);

      workspace.insert('myChild1', childPset1);
      workspace.insert('myChild2', childPset2);
      workspace.insert('myReferenceParent', referenceParentPSet);
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      dataBinder._resetDebugCounters();
      const parentDataBinding = dataBinder.resolve(referenceParentPSet, 'BINDING');

      var referenceArray = referenceParentPSet.get('array_ref');
      referenceArray.push();
      arrayInsertSpy.callCount.should.equal(1);
      arrayInsertSpy.resetHistory();
      parentDataBinding.onModify.callCount.should.equal(1);
      parentDataBinding.onModify.resetHistory();

      referenceArray.set(0, '/myChild1');
      // this should trigger the referenceChanged spy
      referenceChangedSpy.callCount.should.equal(1);
      referenceChangedSpy.getCall(0).args[0].getProperty().getAbsolutePath().should.equal('/myChild1.text');
      referenceChangedSpy.resetHistory();

      // should also trigger the modify spy
      childPset1.get('text').setValue('fortytwo');
      referenceModifySpy.callCount.should.equal(1);
      referenceModifySpy.resetHistory();
      // set our reference to empty
      referenceArray.set(0, '');
      // this should also trigger the referenceChanged spy
      referenceChangedSpy.callCount.should.equal(1);
      should.not.exist(referenceChangedSpy.getCall(0).args[0].getProperty());
      referenceChangedSpy.resetHistory();
      // the modify spy should not be triggered anymore
      childPset1.get('text').setValue('sixtyfour');
      referenceModifySpy.callCount.should.equal(0);
      referenceChangedSpy.callCount.should.equal(0);
      // set it to an invalid value
      referenceArray.set(0, '/invalid');
      // this should not trigger the referenceChanged spy since it's still undefined
      referenceChangedSpy.callCount.should.equal(0);
      referenceChangedSpy.resetHistory();
      referenceModifySpy.callCount.should.equal(0);
      // set back to valid
      referenceArray.set(0, '/myChild1');
      // this should also trigger the referenceChanged spy
      referenceChangedSpy.callCount.should.equal(1);
      referenceChangedSpy.getCall(0).args[0].getProperty().getAbsolutePath().should.equal('/myChild1.text');
      referenceChangedSpy.resetHistory();
      // but not the modified spy
      referenceModifySpy.callCount.should.equal(0);
      // now remove (triggers a different code path than just setting it empty)
      referenceArray.remove(0);
      // this should also trigger the referenceChanged spy
      referenceChangedSpy.callCount.should.equal(1);
      should.not.exist(referenceChangedSpy.getCall(0).args[0].getProperty());
      referenceChangedSpy.resetHistory();
      // but not the modified spy
      referenceModifySpy.callCount.should.equal(0);
      // the modify spy should not be triggered anymore
      childPset1.get('text').setValue('sixtyfour-sixtyfour');
      referenceModifySpy.callCount.should.equal(0);
      referenceChangedSpy.callCount.should.equal(0);

      refChangedError.should.equal(false);
    });

    it('should handle references to a not-yet-existing primitive array', function () {
      // Add the reference parent pset
      var referenceParentPSet = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');
      // Add our child (referenced) pset
      var arrayPset = PropertyFactory.create('Int32', 'array');
      // register the reference handler
      var referenceInsertSpy = sinon.spy();
      ParentDataBinding.registerOnPath('single_ref', ['collectionInsert'], referenceInsertSpy);

      // Register the DataBinding
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding, { context: 'single' });
      dataBinder._dataBindingCreatedCounter.should.equal(0);
      // parentPset should produce a ParentDataBinding
      workspace.insert('myReferenceParent', referenceParentPSet);
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      dataBinder._resetDebugCounters();
      const parentDataBinding = dataBinder.resolve(referenceParentPSet, 'BINDING');
      parentDataBinding.should.be.instanceOf(ParentDataBinding);
      parentDataBinding.onModify.callCount.should.equal(0);
      parentDataBinding.onModify.resetHistory();

      referenceParentPSet.get('single_ref', RESOLVE_NEVER)
        .setValue('/myArray');
      // insert the array *after* we've inserted our references -> need to do conversion in DataBindingTree
      workspace.insert('myArray', arrayPset);
      referenceInsertSpy.callCount.should.equal(0);
      arrayPset.push(21);
      referenceInsertSpy.callCount.should.equal(1);
    });

    it('should be able to bind to properties under already loaded repository references (LYNXDEV-4258)', function () {
      dataBinder.register('BINDING', ChildTemplate.typeid, ParentDataBinding);
      // Add our child (referenced) pset to the "other" workspace
      var childPset1 = PropertyFactory.create(ChildTemplate.typeid, 'single');
      var childPset2 = PropertyFactory.create(ChildTemplate.typeid, 'single');
      otherWorkspace.insert('myChild1', childPset1);
      otherWorkspace.insert('myChild2', childPset2);
      otherWorkspace.commit();

      // Create a repository reference property
      var repositoryReference = PropertyFactory.create('RepositoryReferenceProperty', 'single');
      // now update: point the repository reference to our "other" workspace's active branch
      repositoryReference.updateReference(otherWorkspace.getActiveBranch());
      // Add the repository reference
      workspace.insert('reference', repositoryReference);
      // should create two DataBindings
      dataBinder._dataBindingCreatedCounter.should.equal(2);
      dataBinder._resetDebugCounters();
      workspace.remove('reference');
      dataBinder._dataBindingRemovedCounter.should.equal(2);
      dataBinder._resetDebugCounters();

      // now detach the workspace, re-add the repository reference and bind to the workspace (with the repository
      // reference already present), we should recreate the DataBindings (since they're in the workspace we bind to!)
      // this is the actual repro of LYNXDEV-4258.
      dataBinder.detach(false);
      workspace.insert('reference', repositoryReference);
      dataBinder.attachTo(workspace);
    });

    it('should be able to use referenceChanged with isDeferred', function () {
      const eyeSpy = sinon.spy();
      workspace.insert('bob', PropertyFactory.create(ReferenceParentTemplate.typeid));
      workspace.insert('target', PropertyFactory.create('String'));

      ParentDataBinding.registerOnPath('single_ref', ['insert', 'remove', 'referenceChanged'], eyeSpy, {
        isDeferred: true
      });
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding);
      workspace.resolvePath('bob.single_ref', RESOLVE_NEVER).setValue('/target');
      workspace.remove(workspace.get('target'));

      dataBinder.detach();
    });

  });
});
