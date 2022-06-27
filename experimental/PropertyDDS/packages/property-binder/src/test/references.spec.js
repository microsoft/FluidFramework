/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* globals should, sinon, expect  */
/* eslint spaced-comment: 0 */
/* eslint no-unused-expressions: 0 */
/* eslint no-unused-vars: 0 */
/* eslint-disable require-jsdoc */
/* eslint max-nested-callbacks: ["warn", 5] */

import _ from 'lodash';
import { DataBinder } from '../data_binder/dataBinder';
import {
  DataBinding
} from '../data_binder/dataBinding';
import { ModificationContext } from '../data_binder/modificationContext';
import {
  registerTestTemplates, ParentTemplate, ChildTemplate,
  PrimitiveChildrenTemplate, ArrayContainerTemplate,
  MapContainerTemplate, NodeContainerTemplate,
  DoubleReferenceParentTemplate, ReferenceParentTemplate
} from './testTemplates';
import {
  ParentDataBinding,
  DerivedDataBinding,
  ChildDataBinding,
  PrimitiveChildrenDataBinding,
  InheritedChildDataBinding
} from './testDataBindings';
import { catchConsoleErrors } from './catchConsoleError';
import { unregisterAllOnPathListeners } from '../data_binder/internalUtils';
import { RESOLVE_NO_LEAFS, RESOLVE_NEVER } from '../internal/constants';
import { MockSharedPropertyTree } from './mockSharedPropertyTree';
import { PropertyFactory } from '@fluid-experimental/property-properties';

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

  describe('references', function() {
    var dataBinder, otherWorkspace;

    beforeEach(async function() {
      dataBinder = new DataBinder();

      // Bind to the workspace
      dataBinder.attachTo(workspace);
      otherWorkspace = await MockSharedPropertyTree();
    });

    afterEach(function() {
      // Unbind checkout view
      dataBinder.detach();

      // Unregister DataBinding paths
      _.forEach([ParentDataBinding, ChildDataBinding, PrimitiveChildrenDataBinding, InheritedChildDataBinding],
        unregisterAllOnPathListeners
      );

      dataBinder = null;
    });

    // TODO: fix previously working test
    it.skip('should not call callbacks for properties that never existed', function() {
      // LYNXDEV-8966 : During removal, the databinder may come across callbacks for removal.
      // The DataBinder needs to know if the property existed, to know whether it needs to fire
      // the removal.
      // The current code does this by seeing if there is a node in the databinder tree. The
      // idea is that all properties in the tree lead to a node in the tree, so if there is
      // a node in the tree the property must have existed. Unfortunately, it is possible to
      // have a node in the tree due to a callback being registered for an invalid property.

      // This code reproduces this case.

      const removeCallback = jest.fn();
      const insertCallback = jest.fn();

      workspace.root.insert('target', PropertyFactory.create('NodeProperty'));
      workspace.root.insert('referrer', PropertyFactory.create(ReferenceParentTemplate.typeid));
      workspace.root.insert('forcer', PropertyFactory.create(ReferenceParentTemplate.typeid));

      // We set the reference to be valid, to target.
      workspace.root.get(['referrer', 'single_ref'], RESOLVE_NEVER).setValue('/target');
      // We set the forcer reference to point to the non-existent property /target.text
      // This makes the target.text node exist with path callbacks, even if the property does not.
      workspace.root.get(['forcer', 'single_ref'], RESOLVE_NEVER).setValue('/target.text');

      // We create a binding that watches .text
      class MyBinding extends DataBinding {
        static initialize() {
          this.registerOnPath('single_ref.text', ['remove'], removeCallback);
          this.registerOnPath('single_ref.text', ['insert'], insertCallback);
        }
      }
      MyBinding.initialize();

      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, MyBinding);
      expect(insertCallback).toHaveBeenCalledTimes(0);

      // Removing the referrer should not trigger the event
      workspace.root.remove('target');
      expect(removeCallback).toHaveBeenCalledTimes(0);
    });

    it('should not call callbacks for bad branches', function() {
      const ref1insertSpy = jest.fn();
      const ref1removeSpy = jest.fn();
      const ref2insertSpy = jest.fn();
      const ref2removeSpy = jest.fn();
      const startRefReferenceInsertSpy = jest.fn();
      const startRefReferenceRemoveSpy = jest.fn();
      const ref1ReferenceInsertSpy = jest.fn();
      const ref1ReferenceRemoveSpy = jest.fn();
      const ref2ReferenceInsertSpy = jest.fn();
      const ref2ReferenceRemoveSpy = jest.fn();

      const resetHistory = () => {
        ref1insertSpy.mockClear();
        ref1removeSpy.mockClear();
        ref2insertSpy.mockClear();
        ref2removeSpy.mockClear();
        ref1ReferenceInsertSpy.mockClear();
        ref1ReferenceRemoveSpy.mockClear();
        ref2ReferenceInsertSpy.mockClear();
        ref2ReferenceRemoveSpy.mockClear();
        startRefReferenceInsertSpy.mockClear();
        startRefReferenceRemoveSpy.mockClear();
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

      workspace.root.insert('target1', target1);
      workspace.root.insert('target2', target2);

      const refParent = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single', {
        ref1: '/target1',
        ref2: '/target2'
      });
      workspace.root.insert('refParent', refParent);

      const parentProp = PropertyFactory.create(ParentTemplate.typeid);
      workspace.root.insert('parentProp', parentProp);

      const startRef = PropertyFactory.create('Reference', 'single', '/refParent');
      parentProp.insert('startRef', startRef);

      // Simple insert fires going through the references
      expect(ref1insertSpy).toHaveBeenCalledTimes(1);
      expect(ref1removeSpy).toHaveBeenCalledTimes(0);
      expect(ref2insertSpy).toHaveBeenCalledTimes(1);
      expect(ref2removeSpy).toHaveBeenCalledTimes(0);
      expect(ref1ReferenceInsertSpy).toHaveBeenCalledTimes(1);
      expect(ref1ReferenceRemoveSpy).toHaveBeenCalledTimes(0);
      expect(ref2ReferenceInsertSpy).toHaveBeenCalledTimes(1);
      expect(ref2ReferenceRemoveSpy).toHaveBeenCalledTimes(0);
      expect(startRefReferenceInsertSpy).toHaveBeenCalledTimes(1);
      expect(startRefReferenceRemoveSpy).toHaveBeenCalledTimes(0);
      resetHistory();

      // break at startRef
      parentProp.remove('startRef');
      expect(ref1insertSpy).toHaveBeenCalledTimes(0);
      expect(ref1removeSpy).toHaveBeenCalledTimes(1);
      expect(ref2insertSpy).toHaveBeenCalledTimes(0);
      expect(ref2removeSpy).toHaveBeenCalledTimes(1);
      expect(ref1ReferenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(ref1ReferenceRemoveSpy).toHaveBeenCalledTimes(1);
      expect(ref2ReferenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(ref2ReferenceRemoveSpy).toHaveBeenCalledTimes(1);
      expect(startRefReferenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(startRefReferenceRemoveSpy).toHaveBeenCalledTimes(1);
      resetHistory();

      // put back at startRef
      parentProp.insert('startRef', startRef);
      expect(ref1insertSpy).toHaveBeenCalledTimes(1);
      expect(ref1removeSpy).toHaveBeenCalledTimes(0);
      expect(ref2insertSpy).toHaveBeenCalledTimes(1);
      expect(ref2removeSpy).toHaveBeenCalledTimes(0);
      expect(ref1ReferenceInsertSpy).toHaveBeenCalledTimes(1);
      expect(ref1ReferenceRemoveSpy).toHaveBeenCalledTimes(0);
      expect(ref2ReferenceInsertSpy).toHaveBeenCalledTimes(1);
      expect(ref2ReferenceRemoveSpy).toHaveBeenCalledTimes(0);
      expect(startRefReferenceInsertSpy).toHaveBeenCalledTimes(1);
      expect(startRefReferenceRemoveSpy).toHaveBeenCalledTimes(0);
      resetHistory();

      // Break ref1
      refParent.get('ref1', RESOLVE_NEVER).setValue('/garbage');
      expect(ref1insertSpy).toHaveBeenCalledTimes(0);
      expect(ref1removeSpy).toHaveBeenCalledTimes(1);
      expect(ref2insertSpy).toHaveBeenCalledTimes(0);
      expect(ref2removeSpy).toHaveBeenCalledTimes(0);
      expect(ref1ReferenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(ref1ReferenceRemoveSpy).toHaveBeenCalledTimes(0);
      expect(ref2ReferenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(ref2ReferenceRemoveSpy).toHaveBeenCalledTimes(0);
      expect(startRefReferenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(startRefReferenceRemoveSpy).toHaveBeenCalledTimes(0);
      resetHistory();

      // Fix it back to target2 (instead of target1)
      refParent.get('ref1', RESOLVE_NEVER).setValue('/target2');
      expect(ref1insertSpy).toHaveBeenCalledTimes(1);
      expect(ref1removeSpy).toHaveBeenCalledTimes(0);
      expect(ref2insertSpy).toHaveBeenCalledTimes(0);
      expect(ref2removeSpy).toHaveBeenCalledTimes(0);
      expect(ref1ReferenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(ref1ReferenceRemoveSpy).toHaveBeenCalledTimes(0);
      expect(ref2ReferenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(ref2ReferenceRemoveSpy).toHaveBeenCalledTimes(0);
      expect(startRefReferenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(startRefReferenceRemoveSpy).toHaveBeenCalledTimes(0);
      resetHistory();

      // Change it to target1 - should 'remove' and 'insert'
      refParent.get('ref1', RESOLVE_NEVER).setValue('/target1');
      expect(ref1insertSpy).toHaveBeenCalledTimes(1);
      expect(ref1removeSpy).toHaveBeenCalledTimes(1);
      expect(ref2insertSpy).toHaveBeenCalledTimes(0);
      expect(ref2removeSpy).toHaveBeenCalledTimes(0);
      expect(ref1ReferenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(ref1ReferenceRemoveSpy).toHaveBeenCalledTimes(0);
      expect(ref2ReferenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(ref2ReferenceRemoveSpy).toHaveBeenCalledTimes(0);
      expect(startRefReferenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(startRefReferenceRemoveSpy).toHaveBeenCalledTimes(0);
      resetHistory();

      // Leave it at target1, but using a different reference. Should not fire!
      refParent.get('ref1', RESOLVE_NEVER).setValue('../target1');
      expect(ref1insertSpy).toHaveBeenCalledTimes(0);
      expect(ref1removeSpy).toHaveBeenCalledTimes(0);
      expect(ref2insertSpy).toHaveBeenCalledTimes(0);
      expect(ref2removeSpy).toHaveBeenCalledTimes(0);
      expect(ref1ReferenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(ref1ReferenceRemoveSpy).toHaveBeenCalledTimes(0);
      expect(ref2ReferenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(ref2ReferenceRemoveSpy).toHaveBeenCalledTimes(0);
      expect(startRefReferenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(startRefReferenceRemoveSpy).toHaveBeenCalledTimes(0);
      resetHistory();

      // break at startRef
      parentProp.remove('startRef');
      expect(ref1insertSpy).toHaveBeenCalledTimes(0);
      expect(ref1removeSpy).toHaveBeenCalledTimes(1);
      expect(ref2insertSpy).toHaveBeenCalledTimes(0);
      expect(ref2removeSpy).toHaveBeenCalledTimes(1);
      expect(ref1ReferenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(ref1ReferenceRemoveSpy).toHaveBeenCalledTimes(1);
      expect(ref2ReferenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(ref2ReferenceRemoveSpy).toHaveBeenCalledTimes(1);
      expect(startRefReferenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(startRefReferenceRemoveSpy).toHaveBeenCalledTimes(1);
      resetHistory();

      // Change it to target2 while startRef is broken
      refParent.get('ref1', RESOLVE_NEVER).setValue('/target2');
      expect(ref1insertSpy).toHaveBeenCalledTimes(0);
      expect(ref1removeSpy).toHaveBeenCalledTimes(0);
      expect(ref2insertSpy).toHaveBeenCalledTimes(0);
      expect(ref2removeSpy).toHaveBeenCalledTimes(0);
      expect(ref1ReferenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(ref1ReferenceRemoveSpy).toHaveBeenCalledTimes(0);
      expect(ref2ReferenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(ref2ReferenceRemoveSpy).toHaveBeenCalledTimes(0);
      expect(startRefReferenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(startRefReferenceRemoveSpy).toHaveBeenCalledTimes(0);
      resetHistory();

      // put back at startRef
      parentProp.insert('startRef', startRef);
      expect(ref1insertSpy).toHaveBeenCalledTimes(1);
      expect(ref1removeSpy).toHaveBeenCalledTimes(0);
      expect(ref2insertSpy).toHaveBeenCalledTimes(1);
      expect(ref2removeSpy).toHaveBeenCalledTimes(0);
      expect(ref1ReferenceInsertSpy).toHaveBeenCalledTimes(1);
      expect(ref1ReferenceRemoveSpy).toHaveBeenCalledTimes(0);
      expect(ref2ReferenceInsertSpy).toHaveBeenCalledTimes(1);
      expect(ref2ReferenceRemoveSpy).toHaveBeenCalledTimes(0);
      expect(startRefReferenceInsertSpy).toHaveBeenCalledTimes(1);
      expect(startRefReferenceRemoveSpy).toHaveBeenCalledTimes(0);
      resetHistory();

      // Break ref1 again
      refParent.get('ref1', RESOLVE_NEVER).setValue('/garbage');
      expect(ref1insertSpy).toHaveBeenCalledTimes(0);
      expect(ref1removeSpy).toHaveBeenCalledTimes(1);
      expect(ref2insertSpy).toHaveBeenCalledTimes(0);
      expect(ref2removeSpy).toHaveBeenCalledTimes(0);
      expect(ref1ReferenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(ref1ReferenceRemoveSpy).toHaveBeenCalledTimes(0);
      expect(ref2ReferenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(ref2ReferenceRemoveSpy).toHaveBeenCalledTimes(0);
      expect(startRefReferenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(startRefReferenceRemoveSpy).toHaveBeenCalledTimes(0);
      resetHistory();

      // Remove parent
      workspace.root.remove('parentProp');
      expect(ref1insertSpy).toHaveBeenCalledTimes(0);
      expect(ref1removeSpy).toHaveBeenCalledTimes(0); // << not fired, bad reference
      expect(ref2insertSpy).toHaveBeenCalledTimes(0);
      expect(ref2removeSpy).toHaveBeenCalledTimes(1);
      expect(ref1ReferenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(ref1ReferenceRemoveSpy).toHaveBeenCalledTimes(1);
      expect(ref2ReferenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(ref2ReferenceRemoveSpy).toHaveBeenCalledTimes(1);
      expect(startRefReferenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(startRefReferenceRemoveSpy).toHaveBeenCalledTimes(1);
      resetHistory();
    });

    // This test is similar to the last one, but the references go directly to a second reference,
    // instead of going to a property and then following a path
    it('direct chain of references', function() {
      const ref1insertSpy = jest.fn();
      const ref1removeSpy = jest.fn();
      const startRefReferenceInsertSpy = jest.fn();
      const startRefReferenceRemoveSpy = jest.fn();
      const ref1ReferenceInsertSpy = jest.fn();
      const ref1ReferenceRemoveSpy = jest.fn();
      const ref2ReferenceInsertSpy = jest.fn();
      const ref2ReferenceRemoveSpy = jest.fn();

      const resetHistory = () => {
        ref1insertSpy.mockClear();
        ref1removeSpy.mockClear();
        ref1ReferenceInsertSpy.mockClear();
        ref1ReferenceRemoveSpy.mockClear();
        ref2ReferenceInsertSpy.mockClear();
        ref2ReferenceRemoveSpy.mockClear();
        startRefReferenceInsertSpy.mockClear();
        startRefReferenceRemoveSpy.mockClear();
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

      workspace.root.insert('target1', target1);
      workspace.root.insert('target2', target2);

      const refParent = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single', {
        ref1: '/target1',
        ref2: '/target2'
      });
      workspace.root.insert('refParent', refParent);

      const parentProp = PropertyFactory.create(ParentTemplate.typeid);
      workspace.root.insert('parentProp', parentProp);

      const startRef = PropertyFactory.create('Reference', 'single', '/refParent.ref1');
      parentProp.insert('startRef', startRef);

      // Simple insert fires going through the references
      expect(ref1insertSpy).toHaveBeenCalledTimes(1);
      expect(ref1removeSpy).toHaveBeenCalledTimes(0);
      expect(ref1ReferenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(ref1ReferenceRemoveSpy).toHaveBeenCalledTimes(0);
      expect(ref2ReferenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(ref2ReferenceRemoveSpy).toHaveBeenCalledTimes(0);
      expect(startRefReferenceInsertSpy).toHaveBeenCalledTimes(1);
      expect(startRefReferenceRemoveSpy).toHaveBeenCalledTimes(0);
      resetHistory();

      // break at startRef
      parentProp.remove('startRef');
      expect(ref1insertSpy).toHaveBeenCalledTimes(0);
      expect(ref1removeSpy).toHaveBeenCalledTimes(1);
      expect(ref1ReferenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(ref1ReferenceRemoveSpy).toHaveBeenCalledTimes(0);
      expect(ref2ReferenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(ref2ReferenceRemoveSpy).toHaveBeenCalledTimes(0);
      expect(startRefReferenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(startRefReferenceRemoveSpy).toHaveBeenCalledTimes(1);
      resetHistory();

      // put back at startRef
      parentProp.insert('startRef', startRef);
      expect(ref1insertSpy).toHaveBeenCalledTimes(1);
      expect(ref1removeSpy).toHaveBeenCalledTimes(0);
      expect(ref1ReferenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(ref1ReferenceRemoveSpy).toHaveBeenCalledTimes(0);
      expect(ref2ReferenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(ref2ReferenceRemoveSpy).toHaveBeenCalledTimes(0);
      expect(startRefReferenceInsertSpy).toHaveBeenCalledTimes(1);
      expect(startRefReferenceRemoveSpy).toHaveBeenCalledTimes(0);
      resetHistory();

      // Break ref1
      refParent.get('ref1', RESOLVE_NEVER).setValue('/garbage');
      expect(ref1insertSpy).toHaveBeenCalledTimes(0);
      expect(ref1removeSpy).toHaveBeenCalledTimes(1);
      expect(ref1ReferenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(ref1ReferenceRemoveSpy).toHaveBeenCalledTimes(0);
      expect(ref2ReferenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(ref2ReferenceRemoveSpy).toHaveBeenCalledTimes(0);
      expect(startRefReferenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(startRefReferenceRemoveSpy).toHaveBeenCalledTimes(0);
      resetHistory();

      // Fix it back to target2 (instead of target1)
      refParent.get('ref1', RESOLVE_NEVER).setValue('/target2');
      expect(ref1insertSpy).toHaveBeenCalledTimes(1);
      expect(ref1removeSpy).toHaveBeenCalledTimes(0);
      expect(ref1ReferenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(ref1ReferenceRemoveSpy).toHaveBeenCalledTimes(0);
      expect(ref2ReferenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(ref2ReferenceRemoveSpy).toHaveBeenCalledTimes(0);
      expect(startRefReferenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(startRefReferenceRemoveSpy).toHaveBeenCalledTimes(0);
      resetHistory();

      // Change it to target1 - should 'remove' and 'insert'
      refParent.get('ref1', RESOLVE_NEVER).setValue('/target1');
      expect(ref1insertSpy).toHaveBeenCalledTimes(1);
      expect(ref1removeSpy).toHaveBeenCalledTimes(1);
      expect(ref1ReferenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(ref1ReferenceRemoveSpy).toHaveBeenCalledTimes(0);
      expect(ref2ReferenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(ref2ReferenceRemoveSpy).toHaveBeenCalledTimes(0);
      expect(startRefReferenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(startRefReferenceRemoveSpy).toHaveBeenCalledTimes(0);
      resetHistory();

      // Leave it at target1, but using a different reference. Should not fire!
      refParent.get('ref1', RESOLVE_NEVER).setValue('../target1');
      expect(ref1insertSpy).toHaveBeenCalledTimes(0);
      expect(ref1removeSpy).toHaveBeenCalledTimes(0);
      expect(ref1ReferenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(ref1ReferenceRemoveSpy).toHaveBeenCalledTimes(0);
      expect(ref2ReferenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(ref2ReferenceRemoveSpy).toHaveBeenCalledTimes(0);
      expect(startRefReferenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(startRefReferenceRemoveSpy).toHaveBeenCalledTimes(0);
      resetHistory();

      // break at startRef
      parentProp.remove('startRef');
      expect(ref1insertSpy).toHaveBeenCalledTimes(0);
      expect(ref1removeSpy).toHaveBeenCalledTimes(1);
      expect(ref1ReferenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(ref1ReferenceRemoveSpy).toHaveBeenCalledTimes(0);
      expect(ref2ReferenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(ref2ReferenceRemoveSpy).toHaveBeenCalledTimes(0);
      expect(startRefReferenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(startRefReferenceRemoveSpy).toHaveBeenCalledTimes(1);
      resetHistory();

      // Change it to target2 while startRef is broken
      refParent.get('ref1', RESOLVE_NEVER).setValue('/target2');
      expect(ref1insertSpy).toHaveBeenCalledTimes(0);
      expect(ref1removeSpy).toHaveBeenCalledTimes(0);
      expect(ref1ReferenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(ref1ReferenceRemoveSpy).toHaveBeenCalledTimes(0);
      expect(ref2ReferenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(ref2ReferenceRemoveSpy).toHaveBeenCalledTimes(0);
      expect(startRefReferenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(startRefReferenceRemoveSpy).toHaveBeenCalledTimes(0);
      resetHistory();

      // put back at startRef
      parentProp.insert('startRef', startRef);
      expect(ref1insertSpy).toHaveBeenCalledTimes(1);
      expect(ref1removeSpy).toHaveBeenCalledTimes(0);
      expect(ref1ReferenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(ref1ReferenceRemoveSpy).toHaveBeenCalledTimes(0);
      expect(ref2ReferenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(ref2ReferenceRemoveSpy).toHaveBeenCalledTimes(0);
      expect(startRefReferenceInsertSpy).toHaveBeenCalledTimes(1);
      expect(startRefReferenceRemoveSpy).toHaveBeenCalledTimes(0);
      resetHistory();

      // Break ref1 again
      refParent.get('ref1', RESOLVE_NEVER).setValue('/garbage');
      expect(ref1insertSpy).toHaveBeenCalledTimes(0);
      expect(ref1removeSpy).toHaveBeenCalledTimes(1);
      expect(ref1ReferenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(ref1ReferenceRemoveSpy).toHaveBeenCalledTimes(0);
      expect(ref2ReferenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(ref2ReferenceRemoveSpy).toHaveBeenCalledTimes(0);
      expect(startRefReferenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(startRefReferenceRemoveSpy).toHaveBeenCalledTimes(0);
      resetHistory();

      // Remove parent
      workspace.root.remove('parentProp');
      expect(ref1insertSpy).toHaveBeenCalledTimes(0);
      expect(ref1removeSpy).toHaveBeenCalledTimes(0); // << not fired, bad reference
      expect(ref1ReferenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(ref1ReferenceRemoveSpy).toHaveBeenCalledTimes(0);
      expect(ref2ReferenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(ref2ReferenceRemoveSpy).toHaveBeenCalledTimes(0);
      expect(startRefReferenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(startRefReferenceRemoveSpy).toHaveBeenCalledTimes(1);
      resetHistory();
    });

    it('referenceRemoved on root property', function() {
      const referenceInsertSpy = jest.fn();
      const referenceRemoveSpy = jest.fn();

      ParentDataBinding.registerOnPath('ref', ['referenceInsert'], referenceInsertSpy);
      ParentDataBinding.registerOnPath('ref', ['referenceRemove'], referenceRemoveSpy);
      dataBinder.register('BINDING', 'NodeProperty', ParentDataBinding);

      const ref = PropertyFactory.create('Reference');
      workspace.root.insert('ref', ref);

      expect(referenceInsertSpy).toHaveBeenCalledTimes(1);
      expect(referenceRemoveSpy).toHaveBeenCalledTimes(0);
      referenceInsertSpy.mockClear();
      referenceRemoveSpy.mockClear();

      workspace.root.remove('ref');
      expect(referenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(referenceRemoveSpy).toHaveBeenCalledTimes(1);
      referenceInsertSpy.mockClear();
      referenceRemoveSpy.mockClear();
    });

    it('should be ok when going through references and traversing', function() {
      workspace.pushNotificationDelayScope();
      dataBinder.pushBindingActivationScope();
      dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding);

      // Set things up so references that are followed will visit myChild1 and myChild4,
      // myChild4 will not have been traversed yet.
      const myChildrenArray = PropertyFactory.create('NodeProperty', 'array');
      workspace.root.insert('myChildren', myChildrenArray);
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
      workspace.popNotificationDelayScope();
    });

    it('should be able to bind to referenced properties', function() {
      // Add the reference parent pset
      var referenceParentPSet = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');
      var referenceParentPSet2 = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');

      // Add our child (referenced) pset
      var childPset = PropertyFactory.create(ChildTemplate.typeid, 'single');

      var referenceInsertSpy = jest.fn();
      var referenceModifySpy = jest.fn();
      var referenceRemoveSpy = jest.fn();
      ParentDataBinding.registerOnPath('single_ref.text', ['insert'], referenceInsertSpy);
      ParentDataBinding.registerOnPath('single_ref.text', ['modify'], referenceModifySpy);
      ParentDataBinding.registerOnPath('single_ref.text', ['remove'], referenceRemoveSpy);

      var doubleReferenceInsertSpy = jest.fn();
      var doubleReferenceModifySpy = jest.fn();
      var doubleReferenceRemoveSpy = jest.fn();
      ParentDataBinding.registerOnPath('single_ref.single_ref.text', ['insert'], doubleReferenceInsertSpy);
      ParentDataBinding.registerOnPath('single_ref.single_ref.text', ['modify'], doubleReferenceModifySpy);
      ParentDataBinding.registerOnPath('single_ref.single_ref.text', ['remove'], doubleReferenceRemoveSpy);

      // Register the DataBinding
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding, { context: 'single' });
      dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding, { context: 'all' });

      workspace.root.insert('myChild1', childPset);

      // referenceParentPSet should produce a ParentDataBinding
      // Most basic case, insert with an already valid reference
      referenceParentPSet.get('single_ref', RESOLVE_NEVER)
        .setValue('/myChild1');
      workspace.root.insert('myReferenceParent', referenceParentPSet);
      expect(referenceInsertSpy).toHaveBeenCalledTimes(1);
      referenceInsertSpy.mockClear();

      // This should trigger the modify on the reference property
      expect(referenceModifySpy).toHaveBeenCalledTimes(0);
      childPset.get('text').setValue('newText');
      expect(referenceModifySpy).toHaveBeenCalledTimes(1);

      // This should trigger the remove handler
      expect(referenceRemoveSpy).toHaveBeenCalledTimes(0);
      workspace.root.remove('myChild1');
      expect(referenceRemoveSpy).toHaveBeenCalledTimes(1);

      // This should trigger the insert handler
      expect(referenceInsertSpy).toHaveBeenCalledTimes(0);
      workspace.root.insert('myChild1', childPset);
      expect(referenceInsertSpy).toHaveBeenCalledTimes(1);

      // Now we have a two stage reference
      expect(doubleReferenceInsertSpy).toHaveBeenCalledTimes(0);
      referenceParentPSet2.get('single_ref', RESOLVE_NEVER)
        .setValue('/myReferenceParent');
      workspace.root.insert('myReferenceParent2', referenceParentPSet2);
      expect(doubleReferenceInsertSpy).toHaveBeenCalledTimes(1);
      doubleReferenceInsertSpy.mockClear();

      expect(doubleReferenceModifySpy).toHaveBeenCalledTimes(0);
      childPset.get('text').setValue('newText2');
      expect(referenceParentPSet2.get(['single_ref', 'single_ref', 'text'])).toEqual(childPset.get('text'));
      expect(doubleReferenceModifySpy).toHaveBeenCalledTimes(1);

      // This should trigger the remove handler
      expect(doubleReferenceRemoveSpy).toHaveBeenCalledTimes(0);
      workspace.root.remove('myChild1');
      expect(doubleReferenceRemoveSpy).toHaveBeenCalledTimes(1);

      // This should trigger the insert handler
      expect(doubleReferenceInsertSpy).toHaveBeenCalledTimes(0);
      workspace.root.insert('myChild1', childPset);
      expect(doubleReferenceInsertSpy).toHaveBeenCalledTimes(1);
    });

    it('should be able to bind to referenced properties with relative paths', function() {
      // Add the reference parent pset
      var referenceParentPSet = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');
      var referenceParentPSet2 = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');

      // Add our child (referenced) pset
      var childPset = PropertyFactory.create(ChildTemplate.typeid, 'single');

      var referenceInsertSpy = jest.fn();
      var referenceModifySpy = jest.fn();
      var referenceRemoveSpy = jest.fn();
      ParentDataBinding.registerOnPath('single_ref.text', ['insert'], referenceInsertSpy);
      ParentDataBinding.registerOnPath('single_ref.text', ['modify'], referenceModifySpy);
      ParentDataBinding.registerOnPath('single_ref.text', ['remove'], referenceRemoveSpy);

      var doubleReferenceInsertSpy = jest.fn();
      var doubleReferenceModifySpy = jest.fn();
      var doubleReferenceRemoveSpy = jest.fn();
      ParentDataBinding.registerOnPath('single_ref.single_ref.text', ['insert'], doubleReferenceInsertSpy);
      ParentDataBinding.registerOnPath('single_ref.single_ref.text', ['modify'], doubleReferenceModifySpy);
      ParentDataBinding.registerOnPath('single_ref.single_ref.text', ['remove'], doubleReferenceRemoveSpy);

      // Register the DataBinding
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding, { context: 'single' });
      dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding, { context: 'all' });

      workspace.root.insert('myChild1', childPset);
      expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
      dataBinder._resetDebugCounters();
      const childDataBinding = dataBinder.resolve('/myChild1', 'BINDING');
      expect(childDataBinding).toBeInstanceOf(ChildDataBinding);
      expect(childDataBinding.onModify).toHaveBeenCalledTimes(0);
      childDataBinding.onModify.mockClear();

      // Most basic case, insert with an already valid reference
      referenceParentPSet.get('single_ref', RESOLVE_NEVER)
        .setValue('../../myChild1');
      workspace.root.insert('myParent', PropertyFactory.create('NodeProperty', 'single'));
      workspace.root.get('myParent').insert('myReferenceParent', referenceParentPSet);
      expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
      dataBinder._resetDebugCounters();
      const parentDataBinding = dataBinder.resolve('/myParent.myReferenceParent', 'BINDING');
      expect(parentDataBinding).toBeInstanceOf(ParentDataBinding);
      expect(parentDataBinding.onModify).toHaveBeenCalledTimes(0);
      parentDataBinding.onModify.mockClear();

      // We should have received an insert when our reference became valid
      expect(referenceInsertSpy).toHaveBeenCalledTimes(1);
      referenceInsertSpy.mockClear();

      // This should trigger the modify on the reference property
      expect(referenceModifySpy).toHaveBeenCalledTimes(0);
      childPset.get('text').setValue('newText');
      expect(referenceModifySpy).toHaveBeenCalledTimes(1);
      ////        expect(parentDataBinding.onModify).toHaveBeenCalledTimes(1);
      ////        parentDataBinding.onModify.mockClear();

      // This should trigger the remove handler
      expect(referenceRemoveSpy).toHaveBeenCalledTimes(0);
      workspace.root.remove('myChild1');
      expect(referenceRemoveSpy).toHaveBeenCalledTimes(1);

      // This should trigger the insert handler
      expect(referenceInsertSpy).toHaveBeenCalledTimes(0);
      workspace.root.insert('myChild1', childPset);
      expect(referenceInsertSpy).toHaveBeenCalledTimes(1);

      // Now we have a two stage reference
      referenceParentPSet2.get('single_ref', RESOLVE_NEVER)
        .setValue('../myReferenceParent');
      workspace.root.get('myParent').insert('myReferenceParent2', referenceParentPSet2);

      expect(doubleReferenceModifySpy).toHaveBeenCalledTimes(0);
      expect(referenceModifySpy).toHaveBeenCalledTimes(1);
      childPset.get('text').setValue('newText2');
      expect(doubleReferenceModifySpy).toHaveBeenCalledTimes(1);
      expect(referenceModifySpy).toHaveBeenCalledTimes(2);

      expect(doubleReferenceInsertSpy).toHaveBeenCalledTimes(1);
      doubleReferenceInsertSpy.mockClear();

      // This should trigger the remove handler
      expect(doubleReferenceRemoveSpy).toHaveBeenCalledTimes(0);
      expect(referenceRemoveSpy).toHaveBeenCalledTimes(1);
      workspace.root.remove('myChild1');
      expect(doubleReferenceRemoveSpy).toHaveBeenCalledTimes(1);
      expect(referenceRemoveSpy).toHaveBeenCalledTimes(2);

      // This should trigger the insert handler
      expect(doubleReferenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(referenceInsertSpy).toHaveBeenCalledTimes(1);
      workspace.root.insert('myChild1', childPset);
      expect(doubleReferenceInsertSpy).toHaveBeenCalledTimes(1);
      expect(referenceInsertSpy).toHaveBeenCalledTimes(2);

      referenceInsertSpy.mockClear();
      referenceModifySpy.mockClear();
      referenceRemoveSpy.mockClear();
      // Insert with an already valid reference *below* us so that the relative path has no leading '..'
      var childPset2 = PropertyFactory.create(ChildTemplate.typeid, 'single');
      workspace.root.get('myParent').get('myReferenceParent').insert('myChild2', childPset2);
      referenceParentPSet.get('single_ref', RESOLVE_NEVER)
        .setValue('myChild2');
      // Triggered when our reference became valid
      expect(referenceInsertSpy).toHaveBeenCalledTimes(1);
      referenceInsertSpy.mockClear();
      // We also got a remove for the old property
      expect(referenceRemoveSpy).toHaveBeenCalledTimes(1);
      referenceRemoveSpy.mockClear();

      // This should trigger the modify on the reference property
      expect(referenceModifySpy).toHaveBeenCalledTimes(0);
      childPset2.get('text').setValue('newText');
      expect(referenceModifySpy).toHaveBeenCalledTimes(1);
      referenceModifySpy.mockClear();

      // This should trigger the remove handler
      expect(referenceRemoveSpy).toHaveBeenCalledTimes(0);
      workspace.root.get('myParent').get('myReferenceParent').remove('myChild2');
      expect(referenceRemoveSpy).toHaveBeenCalledTimes(1);
      referenceRemoveSpy.mockClear();

      // This should trigger the insert handler
      expect(referenceInsertSpy).toHaveBeenCalledTimes(0);
      workspace.root.get('myParent').get('myReferenceParent').insert('myChild2', childPset2);
      expect(referenceInsertSpy).toHaveBeenCalledTimes(1);
      referenceInsertSpy.mockClear();
    });

    it('should be able to bind to multi hops with relative paths', function() {
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
      var referenceModifySpy = jest.fn();
      ParentDataBinding.registerOnPath('topoRef.geoRef', ['modify'], referenceModifySpy);
      dataBinder.register('BINDING', NodeContainerTemplate.typeid, ParentDataBinding);

      workspace.root.insert('root', root);

      var textProp = geoMap.get(['foo', 'text']);
      expect(PropertyFactory.instanceOf(textProp, 'String', 'single')).toEqual(true);
      textProp = root.get(['topoRef', 'geoRef', 'text']);
      expect(PropertyFactory.instanceOf(textProp, 'String', 'single')).toEqual(true);
      expect(referenceModifySpy).toHaveBeenCalledTimes(0);
      textProp.setValue('forty-two');
      expect(referenceModifySpy).toHaveBeenCalledTimes(1);
    });

    it('should be able to bind to referenced primitives', function() {
      // Add the reference parent pset
      var referenceParentPSet = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');

      var referenceInsertSpy = jest.fn();
      var referenceModifySpy = jest.fn();
      var referenceRemoveSpy = jest.fn();
      ParentDataBinding.registerOnPath('single_prim_ref', ['insert'], referenceInsertSpy);
      ParentDataBinding.registerOnPath('single_prim_ref', ['modify'], referenceModifySpy);
      ParentDataBinding.registerOnPath('single_prim_ref', ['remove'], referenceRemoveSpy);

      // Register the DataBinding
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding, { context: 'single' });

      // Insert a primitive value
      workspace.root.insert('string', PropertyFactory.create('String'));

      // Most basic case, insert with an already valid reference
      expect(referenceInsertSpy).toHaveBeenCalledTimes(0);
      referenceParentPSet.get('single_prim_ref', RESOLVE_NEVER)
        .setValue('/string');
      workspace.root.insert('myReferenceParent', referenceParentPSet);
      expect(referenceInsertSpy).toHaveBeenCalledTimes(1);

      // This should trigger the modify on the reference property
      expect(referenceModifySpy).toHaveBeenCalledTimes(0);
      workspace.root.get('string').setValue('newText');
      expect(referenceModifySpy).toHaveBeenCalledTimes(1);

      // This should trigger the remove handler
      expect(referenceRemoveSpy).toHaveBeenCalledTimes(0);
      workspace.root.remove('string');
      expect(referenceRemoveSpy).toHaveBeenCalledTimes(1);

      // This should trigger the insert handler
      expect(referenceInsertSpy).toHaveBeenCalledTimes(1);
      workspace.root.insert('string', PropertyFactory.create('String'));
      expect(referenceInsertSpy).toHaveBeenCalledTimes(2);
    });

    it('should be able to bind to the reference itself', function() {
      var referenceParentPSet = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');

      var refInsertSpy = jest.fn(function(in_context) {
        expect(in_context.getProperty()).toEqual(referenceParentPSet.get('single_prim_ref', RESOLVE_NEVER));
      });
      var refModifySpy = jest.fn();
      var refRemoveSpy = jest.fn();
      ParentDataBinding.registerOnPath('single_prim_ref', ['referenceInsert'], refInsertSpy);
      ParentDataBinding.registerOnPath('single_prim_ref', ['referenceModify'], refModifySpy);
      ParentDataBinding.registerOnPath('single_prim_ref', ['referenceRemove'], refRemoveSpy);

      var referencedRemoveSpy = jest.fn();
      ParentDataBinding.registerOnPath('dynamic_ref', ['referenceInsert'], refInsertSpy);
      ParentDataBinding.registerOnPath('dynamic_ref', ['referenceModify'], refModifySpy);
      ParentDataBinding.registerOnPath('dynamic_ref', ['referenceRemove'], refRemoveSpy);
      ParentDataBinding.registerOnPath('dynamic_ref', ['remove'], referencedRemoveSpy);

      // Register the DataBinding
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding, { context: 'single' });

      // Insert a primitive value
      workspace.root.insert('string', PropertyFactory.create('String'));

      // Most basic case, insert with an already valid reference
      referenceParentPSet.get('single_prim_ref', RESOLVE_NEVER)
        .setValue('/string');
      workspace.root.insert('myReferenceParent', referenceParentPSet);

      expect(refInsertSpy).toHaveBeenCalledTimes(1);

      referenceParentPSet.get('single_prim_ref', RESOLVE_NEVER)
        .setValue('/string2');

      expect(refModifySpy).toHaveBeenCalledTimes(1);

      workspace.root.remove(referenceParentPSet);

      expect(refRemoveSpy).toHaveBeenCalledTimes(1);
    });

    it('should be able to bind to the reference itself, existing references', function() {
      var referenceParentPSet = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');

      // Insert a primitive value
      workspace.root.insert('string', PropertyFactory.create('String'));

      // Most basic case, insert with an already valid reference
      referenceParentPSet.get('single_prim_ref', RESOLVE_NEVER).setValue('/string');
      workspace.root.insert('myReferenceParent', referenceParentPSet);

      var refInsertSpy = jest.fn(function(in_context) {
        expect(in_context.getProperty()).toEqual(referenceParentPSet.get('single_prim_ref', RESOLVE_NEVER));
      });
      var refModifySpy = jest.fn();
      var refRemoveSpy = jest.fn();
      ParentDataBinding.registerOnPath('single_prim_ref', ['referenceInsert'], refInsertSpy);
      ParentDataBinding.registerOnPath('single_prim_ref', ['referenceModify'], refModifySpy);
      ParentDataBinding.registerOnPath('single_prim_ref', ['referenceRemove'], refRemoveSpy);

      var referencedRemoveSpy = jest.fn();
      ParentDataBinding.registerOnPath('dynamic_ref', ['referenceInsert'], refInsertSpy);
      ParentDataBinding.registerOnPath('dynamic_ref', ['referenceModify'], refModifySpy);
      ParentDataBinding.registerOnPath('dynamic_ref', ['referenceRemove'], refRemoveSpy);
      ParentDataBinding.registerOnPath('dynamic_ref', ['remove'], referencedRemoveSpy);

      // Register the DataBinding
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding, { context: 'single' });

      expect(refInsertSpy).toHaveBeenCalledTimes(1);

      referenceParentPSet.get('single_prim_ref', RESOLVE_NEVER)
        .setValue('/string2');

      expect(refModifySpy).toHaveBeenCalledTimes(1);

      workspace.root.remove(referenceParentPSet);

      expect(refRemoveSpy).toHaveBeenCalledTimes(1);
    });

    it('should be able to bind to the reference itself', function() {
      var referenceParentPSet = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');

      var refInsertSpy = jest.fn();
      var refModifySpy = jest.fn();
      var refRemoveSpy = jest.fn(function(in_modificationContext) {
        if (in_modificationContext instanceof ModificationContext) {
          expect(in_modificationContext.getAbsolutePath()).toEqual('/myReferenceParent.dynamic_ref');
        }
      });
      ParentDataBinding.registerOnPath('single_prim_ref', ['referenceInsert'], refInsertSpy);
      ParentDataBinding.registerOnPath('single_prim_ref', ['referenceModify'], refModifySpy);
      ParentDataBinding.registerOnPath('single_prim_ref', ['referenceRemove'], refRemoveSpy);

      var referencedRemoveSpy = jest.fn();
      ParentDataBinding.registerOnPath('dynamic_ref', ['referenceInsert'], refInsertSpy);
      ParentDataBinding.registerOnPath('dynamic_ref', ['referenceModify'], refModifySpy);
      ParentDataBinding.registerOnPath('dynamic_ref', ['referenceRemove'], refRemoveSpy);
      ParentDataBinding.registerOnPath('dynamic_ref', ['remove'], referencedRemoveSpy);

      // Register the DataBinding
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding, { context: 'single' });

      // Insert a primitive value
      workspace.root.insert('string', PropertyFactory.create('String'));

      // Most basic case, insert with an already valid reference
      referenceParentPSet.get('single_prim_ref', RESOLVE_NEVER)
        .setValue('/string');
      workspace.root.insert('myReferenceParent', referenceParentPSet);

      // This should not trigger the modify on the reference property
      expect(refModifySpy).toHaveBeenCalledTimes(0);
      workspace.root.get('string').setValue('newText');
      expect(refModifySpy).toHaveBeenCalledTimes(0);

      // This should not trigger the remove handler
      expect(refRemoveSpy).toHaveBeenCalledTimes(0);
      workspace.root.remove('string');
      expect(refRemoveSpy).toHaveBeenCalledTimes(0);

      // This should not trigger the insert handler
      expect(refInsertSpy).toHaveBeenCalledTimes(1);
      workspace.root.insert('string', PropertyFactory.create('String'));
      expect(refInsertSpy).toHaveBeenCalledTimes(1);

      // This should trigger the remove handler
      expect(refRemoveSpy).toHaveBeenCalledTimes(0);
      workspace.root.remove('myReferenceParent');
      expect(refRemoveSpy).toHaveBeenCalledTimes(1);
      workspace.root.insert('myReferenceParent', referenceParentPSet);
      expect(refInsertSpy).toHaveBeenCalledTimes(2);

      refInsertSpy.mockClear();
      refModifySpy.mockClear();
      refRemoveSpy.mockClear();

      expect(refInsertSpy).toHaveBeenCalledTimes(0);
      referenceParentPSet.insert('dynamic_ref', PropertyFactory.create('Reference'));
      expect(refInsertSpy).toHaveBeenCalledTimes(1);

      expect(refModifySpy).toHaveBeenCalledTimes(0);
      referenceParentPSet.get('dynamic_ref', RESOLVE_NEVER)
        .setValue('/string');
      expect(refModifySpy).toHaveBeenCalledTimes(1);

      // This should not trigger the modify on the reference property
      workspace.root.get('string').setValue('newText');
      expect(refModifySpy).toHaveBeenCalledTimes(1);

      // This should not trigger the remove handler
      workspace.root.remove('string');
      expect(refRemoveSpy).toHaveBeenCalledTimes(0);
      expect(referencedRemoveSpy).toHaveBeenCalledTimes(1);

      // This should not trigger the insert handler
      workspace.root.insert('string', PropertyFactory.create('String'));
      expect(refInsertSpy).toHaveBeenCalledTimes(1);

      expect(refRemoveSpy).toHaveBeenCalledTimes(0);
      referenceParentPSet.remove('dynamic_ref');
      expect(refRemoveSpy).toHaveBeenCalledTimes(1);
      expect(referencedRemoveSpy).toHaveBeenCalledTimes(1);
    });

    it('should be able to bind to the path __registeredDataBindingHandlers and __registeredHandler', function() {
      // The keys __registeredDataBindingHandlers and __registeredHandler are used internally in our data-structures
      // we do escaping to avoid name conflicts, and thus this test serves to check that we actually escape
      // everywhere we have to
      var referenceParentPSet = PropertyFactory.create(NodeContainerTemplate.typeid, 'single');

      var refInsertSpy1 = jest.fn();
      var refModifySpy1 = jest.fn();
      var refRemoveSpy1 = jest.fn();
      ParentDataBinding.registerOnPath('__registeredDataBindingHandlers.__subProperty', ['insert'], refInsertSpy1);
      ParentDataBinding.registerOnPath('__registeredDataBindingHandlers.__subProperty', ['modify'], refModifySpy1);
      ParentDataBinding.registerOnPath('__registeredDataBindingHandlers.__subProperty', ['remove'], refRemoveSpy1);

      // Register the DataBinding
      dataBinder.register('BINDING', NodeContainerTemplate.typeid, ParentDataBinding, { context: 'single' });

      // Insert a primitive value
      var nodeProp = PropertyFactory.create('NodeProperty');
      workspace.root.insert('__registeredHandler', nodeProp);
      nodeProp.insert('__subProperty', PropertyFactory.create('String'));

      // Most basic case, insert with an already valid reference
      workspace.root.insert('myNodeProperty', referenceParentPSet);
      referenceParentPSet.insert('__registeredDataBindingHandlers', PropertyFactory.create('Reference', undefined,
        '/__registeredHandler'));

      // We should have gotten an insert when the ref became valid
      expect(refInsertSpy1).toHaveBeenCalledTimes(1);
      refInsertSpy1.mockClear();

      // This should not trigger the modify on the reference property
      expect(refModifySpy1).toHaveBeenCalledTimes(0);
      nodeProp.get('__subProperty').setValue('newText');
      expect(refModifySpy1).toHaveBeenCalledTimes(1);

      // This should not trigger the remove handler
      expect(refRemoveSpy1).toHaveBeenCalledTimes(0);
      nodeProp.remove('__subProperty');
      expect(refRemoveSpy1).toHaveBeenCalledTimes(1);

      // This should trigger the insert handler
      expect(refInsertSpy1).toHaveBeenCalledTimes(0);
      nodeProp.insert('__subProperty', PropertyFactory.create('String'));
      expect(refInsertSpy1).toHaveBeenCalledTimes(1);
    });

    it('should be able to modify references', function() {
      // Add the reference parent pset
      var referenceParentPSet = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');

      // Add our child (referenced) pset
      var childPset1 = PropertyFactory.create(ChildTemplate.typeid, 'single');
      var childPset2 = PropertyFactory.create(ChildTemplate.typeid, 'single');

      var referenceInsertSpy = jest.fn();
      var referenceModifySpy = jest.fn();
      var referenceRemoveSpy = jest.fn();
      ParentDataBinding.registerOnPath('single_ref.text', ['insert'], referenceInsertSpy);
      ParentDataBinding.registerOnPath('single_ref.text', ['modify'], referenceModifySpy);
      ParentDataBinding.registerOnPath('single_ref.text', ['remove'], referenceRemoveSpy);

      // Register the DataBinding
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding, { context: 'single' });
      dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding, { context: 'all' });

      // parentPset should produce a ParentDataBinding
      workspace.root.insert('myChild1', childPset1);
      workspace.root.insert('myChild2', childPset2);
      expect(dataBinder._dataBindingCreatedCounter).toEqual(2);
      dataBinder._resetDebugCounters();

      // We insert with an already valid reference
      referenceParentPSet.get('single_ref', RESOLVE_NEVER)
        .setValue('/myChild1');
      workspace.root.insert('myReferenceParent', referenceParentPSet);

      // references resolved, we get an insert
      expect(referenceInsertSpy).toHaveBeenCalledTimes(1);
      referenceInsertSpy.mockClear();

      expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
      dataBinder._resetDebugCounters();
      const parentDataBinding = dataBinder.resolve('/myReferenceParent', 'BINDING');
      expect(parentDataBinding).toBeInstanceOf(ParentDataBinding);
      expect(parentDataBinding.onModify).toHaveBeenCalledTimes(0);
      parentDataBinding.onModify.mockClear();

      // And then change to a new reference
      referenceParentPSet.get('single_ref', RESOLVE_NEVER)
        .setValue('/myChild2');
      expect(parentDataBinding.onModify).toHaveBeenCalledTimes(1);
      parentDataBinding.onModify.mockClear();

      // Reference changed, we get a remove and an insert
      expect(referenceRemoveSpy).toHaveBeenCalledTimes(1);
      expect(referenceInsertSpy).toHaveBeenCalledTimes(1);
      referenceRemoveSpy.mockClear();
      referenceInsertSpy.mockClear();

      // This should trigger the modify on the reference property
      expect(referenceModifySpy).toHaveBeenCalledTimes(0);
      childPset2.get('text').setValue('newText');
      expect(referenceModifySpy).toHaveBeenCalledTimes(1);
      ////        expect(parentDataBinding.onModify).toHaveBeenCalledTimes(1);

      // This should trigger the remove handler
      expect(referenceRemoveSpy).toHaveBeenCalledTimes(0);
      workspace.root.remove('myChild2');
      expect(referenceRemoveSpy).toHaveBeenCalledTimes(1);

      // This should trigger the insert handler
      expect(referenceInsertSpy).toHaveBeenCalledTimes(0);
      workspace.root.insert('myChild2', childPset2);
      expect(referenceInsertSpy).toHaveBeenCalledTimes(1);

      // Make sure the old handlers have been removed
      childPset1.get('text').setValue('newText');
      expect(referenceModifySpy).toHaveBeenCalledTimes(1);
      workspace.root.remove('myChild1');
      expect(referenceRemoveSpy).toHaveBeenCalledTimes(1);
      workspace.root.insert('myChild1', childPset1);
      expect(referenceInsertSpy).toHaveBeenCalledTimes(1);

      // Make sure, removing a reference also removes its
      // bound callbacks
      workspace.root.remove('myReferenceParent');

      // This should no longer trigger the modify on the reference property
      expect(referenceModifySpy).toHaveBeenCalledTimes(1);
      childPset2.get('text').setValue('newText2');
      expect(referenceModifySpy).toHaveBeenCalledTimes(1);
    });

    it('should provide access to the DataBinding and Property', function() {
      var referenceChangedSpy = jest.fn(function(in_referenceChangedContext) {
        var prop = in_referenceChangedContext.getProperty();
        if (prop) {
          expect(PropertyFactory.instanceOf(prop, 'String', 'single')).toEqual(true);
        }
      });
      var nodeParentRefChangedSpy = jest.fn(function(in_referenceChangedContext) {
        let dataBinding = in_referenceChangedContext.getDataBinding('ChildDataBinding1');
        // We can't assume access to other databindings when the system is being torn down
        if (dataBinding) {
          expect(dataBinding).toBeInstanceOf(ChildDataBinding);
        }
        dataBinding = in_referenceChangedContext.getDataBinding('ChildDataBinding2');
        if (dataBinding) {
          expect(dataBinding).toBeInstanceOf(ChildDataBinding);
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
      workspace.root.insert('myChild1', childPset1);
      workspace.root.insert('myChild2', childPset2);
      workspace.root.insert('nodeParent', nodeParentPSet);
      nodeParentPSet.insert('child1', PropertyFactory.create(ChildTemplate.typeid, 'single'));
      // We insert with an already valid reference
      referenceParentPSet.get('single_ref', RESOLVE_NEVER)
        .setValue('/myChild1');
      workspace.root.insert('myReferenceParent', referenceParentPSet);
      expect(referenceChangedSpy).toHaveBeenCalledTimes(1);
      referenceParentPSet.get('single_ref', RESOLVE_NEVER)
        .setValue('/invalid_ref_value');
      expect(referenceChangedSpy).toHaveBeenCalledTimes(2);

      // Other ref
      referenceParentPSet.get('single_ref', RESOLVE_NEVER)
        .setValue('/myChild2');
      expect(referenceChangedSpy).toHaveBeenCalledTimes(3);

      // Change it to the nodecontainer to test DataBinding at the relative path
      referenceChangedSpy.mockClear();
      referenceParentPSet.get('single_ref', RESOLVE_NEVER)
        .setValue('/nodeParent');
      // remove, and insert for nodeParent, which also has a 'text' field
      expect(referenceChangedSpy).toHaveBeenCalledTimes(2);
      expect(nodeParentRefChangedSpy).toHaveBeenCalledTimes(1); // insert for nodeParent
    });

    const crazyTest = (hopName) => function() {
      // Add the reference parent pset
      var referenceParentPSet = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');
      var referenceParentPSet2 = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');
      var nodeParentPSet = PropertyFactory.create(NodeContainerTemplate.typeid, 'single');
      var nodeParentPSet2 = PropertyFactory.create(NodeContainerTemplate.typeid, 'single');

      // Add our child (referenced) pset
      var childPset1 = PropertyFactory.create(ChildTemplate.typeid, 'single');
      var childPset2 = PropertyFactory.create(ChildTemplate.typeid, 'single');

      var referenceInsertSpy = jest.fn(function(in_modificationContext) {
        var prop = in_modificationContext.getProperty();
        expect(PropertyFactory.instanceOf(prop, 'String', 'single')).toEqual(true);
      });
      var referenceModifySpy = jest.fn(function(in_modificationContext) {
        var prop = in_modificationContext.getProperty();
        expect(PropertyFactory.instanceOf(prop, 'String', 'single')).toEqual(true);
      });
      var referenceRemoveSpy = jest.fn();
      ParentDataBinding.registerOnPath('single_ref.text', ['insert'], referenceInsertSpy);
      ParentDataBinding.registerOnPath('single_ref.text', ['modify'], referenceModifySpy);
      ParentDataBinding.registerOnPath('single_ref.text', ['remove'], referenceRemoveSpy);

      var doubleReferenceInsertSpy = jest.fn(function(in_modificationContext) {
        var prop = in_modificationContext.getProperty();
        expect(PropertyFactory.instanceOf(prop, 'String', 'single')).toEqual(true);
      });
      var doubleReferenceModifySpy = jest.fn(function(in_modificationContext) {
        var prop = in_modificationContext.getProperty();
        expect(PropertyFactory.instanceOf(prop, 'String', 'single')).toEqual(true);
      });
      var doubleReferenceRemoveSpy = jest.fn();
      var doubleReferenceRefChangedSpy = jest.fn();
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
      var runTests = function(in_increment, in_refChangedCount) {
        expect(doubleReferenceRefChangedSpy).toHaveBeenCalledTimes(in_refChangedCount);
        // We should have a property if 'to' is defined
        expect(!!doubleReferenceRefChangedSpy.mock.calls[0][0].getProperty()).toEqual(!!to);
        if (to) {
          expect(doubleReferenceRefChangedSpy.mock.calls[0][0].getProperty().getAbsolutePath()).toEqual(to);
        }
        doubleReferenceRefChangedSpy.mockClear();

        if (in_refChangedCount === 1) {
          var dummy = from;
          from = to;
          to = dummy;
        }

        expect(doubleReferenceModifySpy).toHaveBeenCalledTimes(0);
        childPset1.get('text').setValue('newText' + (incCounter++));
        expect(doubleReferenceModifySpy).toHaveBeenCalledTimes(in_increment);

        // This should trigger the remove handler
        expect(doubleReferenceRemoveSpy).toHaveBeenCalledTimes(in_refChangedCount - in_increment);
        doubleReferenceRemoveSpy.mockClear();
        workspace.root.remove('myChild1');
        expect(doubleReferenceRemoveSpy).toHaveBeenCalledTimes(in_increment);

        // This should trigger the insert handler
        // the insert was already called once when the reference was made valid
        expect(doubleReferenceInsertSpy).toHaveBeenCalledTimes(in_increment);
        doubleReferenceInsertSpy.mockClear();
        workspace.root.insert('myChild1', childPset1);
        expect(doubleReferenceInsertSpy).toHaveBeenCalledTimes(in_increment);

        expect(doubleReferenceRefChangedSpy).toHaveBeenCalledTimes(2 * in_increment);
        doubleReferenceInsertSpy.mockClear();
        doubleReferenceModifySpy.mockClear();
        doubleReferenceRemoveSpy.mockClear();
        doubleReferenceRefChangedSpy.mockClear();
      };

      // parentPset should produce a ParentDataBinding
      workspace.root.insert('myChild1', childPset1);
      workspace.root.insert('myChild2', childPset2);

      // Create a second parent
      referenceParentPSet2.get(hopName, RESOLVE_NEVER)
        .setValue('/myChild1');
      workspace.root.insert('myReferenceParent2', referenceParentPSet2);

      // We insert with an already valid reference
      referenceParentPSet.get('single_ref', RESOLVE_NEVER)
        .setValue('/myReferenceParent2');
      workspace.root.insert('myReferenceParent', referenceParentPSet);

      // This should trigger the modify on the reference property
      runTests(1, 1);

      // This should unbind the tests
      workspace.root.remove('myReferenceParent');
      runTests(0, 1);

      // Restore the references
      workspace.root.insert('myReferenceParent', referenceParentPSet);
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
      workspace.root.remove('myReferenceParent2');
      runTests(0, 1);

      // Restore the references
      workspace.root.insert('myReferenceParent2', referenceParentPSet2);
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
      workspace.root.remove('myReferenceParent2', referenceParentPSet2);
      workspace.root.remove('myReferenceParent', referenceParentPSet);
      workspace.root.insert('myReferenceParent2', nodeParentPSet2);
      workspace.root.insert('myReferenceParent', nodeParentPSet);
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
      workspace.root.insert('myData', myData);
      const myOtherData = PropertyFactory.create(ChildTemplate.typeid);
      workspace.root.insert('myOtherData', myOtherData);

      // Set up a chain; ref3 points to ref2 points to ref1 points to myData
      const myReferences = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single', {
        ref1: '/myData',
        ref2: 'ref1',
        ref3: 'ref2'
      });
      workspace.root.insert('myReferences', myReferences);

      dataBinder.register('BINDING', 'String', ChildDataBinding);

      let expected = undefined;
      let failed = false;
      const checkBinding = jest.fn((modificationContext) => {
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
      expect(checkBinding).toHaveBeenCalledTimes(3);
      expect(failed).toEqual(false);

      myData.get('text').setValue('hello');
      expect(checkBinding).toHaveBeenCalledTimes(6);
      expect(failed).toEqual(false);

      // Change ref1 to point to other data
      checkBinding.mockClear();
      expected = myOtherData;
      myReferences.get('ref1', RESOLVE_NEVER).setValue('/myOtherData');
      expect(checkBinding).toHaveBeenCalledTimes(3); // ref1, ref2 and ref3
      expect(failed).toEqual(false);

      // Go back
      checkBinding.mockClear();
      expected = myData;
      myReferences.get('ref1', RESOLVE_NEVER).setValue('/myData');
      expect(checkBinding).toHaveBeenCalledTimes(3); // ref1, ref2 and ref3
      expect(failed).toEqual(false);

      // Change ref2 to point to other data
      checkBinding.mockClear();
      expected = myOtherData;
      myReferences.get('ref2', RESOLVE_NEVER).setValue('/myOtherData');
      expect(checkBinding).toHaveBeenCalledTimes(2); // ref2 and ref3
      expect(failed).toEqual(false);

      // Go back
      checkBinding.mockClear();
      expected = myData;
      myReferences.get('ref2', RESOLVE_NEVER).setValue('/myData');
      expect(checkBinding).toHaveBeenCalledTimes(2); // ref2 and ref3
      expect(failed).toEqual(false);

      // Change ref3 to point to other data
      checkBinding.mockClear();
      expected = myOtherData;
      myReferences.get('ref3', RESOLVE_NEVER).setValue('/myOtherData');
      expect(checkBinding).toHaveBeenCalledTimes(1); // ref3
      expect(failed).toEqual(false);

      // Go back
      checkBinding.mockClear();
      expected = myData;
      myReferences.get('ref3', RESOLVE_NEVER).setValue('/myData');
      expect(checkBinding).toHaveBeenCalledTimes(1); // ref3
      expect(failed).toEqual(false);
    });

    it('should give the right property in a primitive array', () => {
      const myData = PropertyFactory.create(PrimitiveChildrenTemplate.typeid);
      workspace.root.insert('myData', myData);

      const stringArray = myData.get('arrayOfStrings');

      stringArray.push('hey');
      stringArray.push('bee');
      stringArray.push('sea');

      let failed = false;
      const checkBinding = jest.fn((index, modificationContext) => {
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
      expect(checkBinding).toHaveBeenCalledTimes(3);
      expect(failed).toEqual(false);

      stringArray.set(0, 'hey there');
      stringArray.set(1, 'bee cool');
      stringArray.set(2, 'sea here');
      expect(checkBinding).toHaveBeenCalledTimes(6);
      expect(failed).toEqual(false);
    });

    it('should be able to modify multi-hop references', crazyTest('single_ref'));

    it('should be able to modify multi-hop references with different hops', crazyTest('ref1'));

    it('should be able to handle binding to multi-hop references', function() {
      // Add the reference parent pset
      var referenceParentPSet = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');
      var referenceParentPSet2 = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');

      // Add our child (referenced) pset
      var childPset1 = PropertyFactory.create(ChildTemplate.typeid, 'single');
      var childPset2 = PropertyFactory.create(ChildTemplate.typeid, 'single');

      var doubleReferenceInsertSpy = jest.fn();
      var doubleReferenceModifySpy = jest.fn();
      var doubleReferenceRemoveSpy = jest.fn();
      ParentDataBinding.registerOnPath('single_ref.single_ref', ['referenceInsert'], doubleReferenceInsertSpy);
      ParentDataBinding.registerOnPath('single_ref.single_ref', ['referenceModify'], doubleReferenceModifySpy);
      ParentDataBinding.registerOnPath('single_ref.single_ref', ['referenceRemove'], doubleReferenceRemoveSpy);

      // Register the DataBinding
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding, { context: 'single' });
      dataBinder.register('BINDING', NodeContainerTemplate.typeid, ParentDataBinding, { context: 'single' });
      dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding, { context: 'all' });

      // parentPset should produce a ParentDataBinding
      workspace.root.insert('myChild1', childPset1);
      workspace.root.insert('myChild2', childPset2);

      // We insert with a not yet valid reference
      referenceParentPSet.get('single_ref', RESOLVE_NEVER)
        .setValue('/myReferenceParent2');
      workspace.root.insert('myReferenceParent', referenceParentPSet);

      // Create a second parent
      referenceParentPSet2.get('single_ref', RESOLVE_NEVER)
        .setValue('/myChild1');
      workspace.root.insert('myReferenceParent2', referenceParentPSet2);
      expect(doubleReferenceInsertSpy).toHaveBeenCalledTimes(1);

      referenceParentPSet2.get('single_ref', RESOLVE_NEVER)
        .setValue('/myChild2');
      expect(doubleReferenceModifySpy).toHaveBeenCalledTimes(1);

      workspace.root.remove('myReferenceParent2');
      expect(doubleReferenceRemoveSpy).toHaveBeenCalledTimes(1);
    });

    it('should be able to handle binding to multi-hop references', function() {
      // Add the reference parent pset
      var referenceParentPSet = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');
      var referenceParentPSet2 = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');

      // Add our child (referenced) pset
      var childPset1 = PropertyFactory.create(ChildTemplate.typeid, 'single');
      var childPset2 = PropertyFactory.create(ChildTemplate.typeid, 'single');

      var doublyReferencedInsertSpy = jest.fn();
      var doublyReferencedModifySpy = jest.fn();
      var doublyReferencedRemoveSpy = jest.fn();
      ParentDataBinding.registerOnPath('single_ref.single_ref', ['insert'], doublyReferencedInsertSpy);
      ParentDataBinding.registerOnPath('single_ref.single_ref', ['modify'], doublyReferencedModifySpy);
      ParentDataBinding.registerOnPath('single_ref.single_ref', ['remove'], doublyReferencedRemoveSpy);

      // Register the DataBinding
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding, { context: 'single' });
      dataBinder.register('BINDING', NodeContainerTemplate.typeid, ParentDataBinding, { context: 'single' });
      dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding, { context: 'all' });

      // parentPset should produce a ParentDataBinding
      workspace.root.insert('myChild1', childPset1);
      workspace.root.insert('myChild2', childPset2);

      // We insert with a not yet valid reference
      referenceParentPSet.get('single_ref', RESOLVE_NEVER)
        .setValue('/myReferenceParent2');
      workspace.root.insert('myReferenceParent', referenceParentPSet);

      // Create a second parent
      referenceParentPSet2.get('single_ref', RESOLVE_NEVER)
        .setValue('/myChild1');
      workspace.root.insert('myReferenceParent2', referenceParentPSet2);
      expect(doublyReferencedInsertSpy).toHaveBeenCalledTimes(1);
      expect(doublyReferencedRemoveSpy).toHaveBeenCalledTimes(0);

      // Change from the first parent to the second, we should get a remove then an insert
      referenceParentPSet2.get('single_ref', RESOLVE_NEVER)
        .setValue('/myChild2');
      expect(doublyReferencedInsertSpy).toHaveBeenCalledTimes(2);
      expect(doublyReferencedRemoveSpy).toHaveBeenCalledTimes(1);

      expect(doublyReferencedModifySpy).toHaveBeenCalledTimes(0);
      childPset2.get('text').setValue('hello');
      expect(doublyReferencedModifySpy).toHaveBeenCalledTimes(1);

      // Now remove the reference completely; we should get a remove
      workspace.root.remove('myReferenceParent2');
      expect(doublyReferencedInsertSpy).toHaveBeenCalledTimes(2);
      expect(doublyReferencedRemoveSpy).toHaveBeenCalledTimes(2);

      // Modify while the links are broken should not notify
      expect(doublyReferencedModifySpy).toHaveBeenCalledTimes(1);
      childPset2.get('text').setValue('hello again');
      expect(doublyReferencedModifySpy).toHaveBeenCalledTimes(1);
    });

    it('binding to multi-hop references, reinserting part of the chain (LYNXDEV-7596)', function() {
      // Add the reference parent pset
      var referenceParentPSet = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');
      var referenceParentPSet2 = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');

      // Add our child (referenced) pset
      var childPset1 = PropertyFactory.create(ChildTemplate.typeid, 'single');
      var childPset2 = PropertyFactory.create(ChildTemplate.typeid, 'single');

      var doublyReferencedInsertSpy = jest.fn();
      var doublyReferencedRemoveSpy = jest.fn();
      ParentDataBinding.registerOnPath('single_ref.single_ref', ['insert'], doublyReferencedInsertSpy);
      ParentDataBinding.registerOnPath('single_ref.single_ref', ['remove'], doublyReferencedRemoveSpy);

      // Register the DataBinding
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding, { context: 'single' });
      dataBinder.register('BINDING', NodeContainerTemplate.typeid, ParentDataBinding, { context: 'single' });
      dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding, { context: 'all' });

      // parentPset should produce a ParentDataBinding
      workspace.root.insert('myChild1', childPset1);
      workspace.root.insert('myChild2', childPset2);

      // We insert with a not yet valid reference
      referenceParentPSet.get('single_ref', RESOLVE_NEVER)
        .setValue('/myReferenceParent2');
      workspace.root.insert('myReferenceParent', referenceParentPSet);

      // Create a second parent
      referenceParentPSet2.get('single_ref', RESOLVE_NEVER)
        .setValue('/myChild1');
      workspace.root.insert('myReferenceParent2', referenceParentPSet2);
      expect(doublyReferencedInsertSpy).toHaveBeenCalledTimes(1);
      expect(doublyReferencedRemoveSpy).toHaveBeenCalledTimes(0);

      // Change from the first parent to the second, we should get a remove then an insert
      referenceParentPSet2.get('single_ref', RESOLVE_NEVER)
        .setValue('/myChild2');
      expect(doublyReferencedInsertSpy).toHaveBeenCalledTimes(2);
      expect(doublyReferencedRemoveSpy).toHaveBeenCalledTimes(1);

      // Now remove the reference completely; we should get a remove
      workspace.root.remove('myReferenceParent2');
      expect(doublyReferencedInsertSpy).toHaveBeenCalledTimes(2);
      expect(doublyReferencedRemoveSpy).toHaveBeenCalledTimes(2);

      // Put the intermediate node back
      workspace.root.insert('myReferenceParent2', referenceParentPSet2);

      // Currently, inserting it back again does not fire the insert
      // LYNXDEV-7596
      expect(doublyReferencedInsertSpy).toHaveBeenCalledTimes(3);
      expect(doublyReferencedRemoveSpy).toHaveBeenCalledTimes(2);

      // Now remove the reference completely; we should get a remove
      workspace.root.remove('myReferenceParent2');
      expect(doublyReferencedInsertSpy).toHaveBeenCalledTimes(3);
      expect(doublyReferencedRemoveSpy).toHaveBeenCalledTimes(3);
    });

    // Don't give me reference change if I'm not a reference
    it('should not tell me about references if im not a reference', function() {
      var myChild = PropertyFactory.create(ChildTemplate.typeid, 'single');

      var referenceInsertSpy = jest.fn();
      var referenceModifySpy = jest.fn();
      var referenceRemoveSpy = jest.fn();
      ChildDataBinding.registerOnPath('text', ['referenceInsert'], referenceInsertSpy);
      ChildDataBinding.registerOnPath('text', ['referenceModify'], referenceModifySpy);
      ChildDataBinding.registerOnPath('text', ['referenceRemove'], referenceRemoveSpy);

      dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding, { context: 'single' });
      workspace.root.insert('theChild', myChild);
      myChild.get('text').setValue('Hi!');

      expect(referenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(referenceModifySpy).toHaveBeenCalledTimes(0);
      expect(referenceRemoveSpy).toHaveBeenCalledTimes(0);
    });

    it('contracted path reference LYNXDEV-7915', function() {
      var spy = jest.fn();
      ParentDataBinding
        .registerOnProperty('substruct.anotherRef.ref_ref', ['referenceInsert', 'insert', 'modify'], spy);
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding);

      var bound = PropertyFactory.create(ReferenceParentTemplate.typeid);
      var baseTexture = PropertyFactory.create(DoubleReferenceParentTemplate.typeid);
      var image = PropertyFactory.create(PrimitiveChildrenTemplate.typeid);

      workspace.root.insert('bound', bound);
      workspace.root.insert('baseTexture', baseTexture);
      workspace.root.insert('image', image);

      baseTexture.get('ref_ref', RESOLVE_NEVER).setValue('/image');

      expect(spy).toHaveBeenCalledTimes(0);

      bound.get(['substruct', 'anotherRef'], RESOLVE_NEVER).setValue('/baseTexture');
      expect(spy).toHaveBeenCalledTimes(2); // referenceInsert + insert
    });

    it('referenceChanged, undefined to defined double reference - first reference', function() {
      var spy = jest.fn();
      ParentDataBinding.registerOnProperty('metal_f0.ref_ref.ref_ref', ['referenceChanged'], spy);
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding);

      var material = PropertyFactory.create(ReferenceParentTemplate.typeid);
      var metal_f0 = PropertyFactory.create(DoubleReferenceParentTemplate.typeid);
      var texturemap = PropertyFactory.create(DoubleReferenceParentTemplate.typeid);
      var image = PropertyFactory.create(PrimitiveChildrenTemplate.typeid);

      material.insert('metal_f0', metal_f0);

      workspace.root.insert('material', material);
      workspace.root.insert('texturemap', texturemap);
      workspace.root.insert('image', image);

      texturemap.get('ref_ref', RESOLVE_NEVER).setValue('/image');

      expect(spy).toHaveBeenCalledTimes(0);
      metal_f0.get(['ref_ref'], RESOLVE_NEVER).setValue('/texturemap');

      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('referenceChanged, undefined to defined double reference - second reference', function() {
      var spy = jest.fn();
      ParentDataBinding.registerOnProperty('metal_f0.ref_ref.ref_ref', ['referenceChanged'], spy);
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding);

      var material = PropertyFactory.create(ReferenceParentTemplate.typeid);
      var metal_f0 = PropertyFactory.create(DoubleReferenceParentTemplate.typeid);
      var texturemap = PropertyFactory.create(DoubleReferenceParentTemplate.typeid);
      var image = PropertyFactory.create(PrimitiveChildrenTemplate.typeid);

      material.insert('metal_f0', metal_f0);

      workspace.root.insert('material', material);
      workspace.root.insert('texturemap', texturemap);
      workspace.root.insert('image', image);

      metal_f0.get(['ref_ref'], RESOLVE_NEVER).setValue('/texturemap');

      expect(spy).toHaveBeenCalledTimes(0);
      texturemap.get('ref_ref', RESOLVE_NEVER).setValue('/image');

      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('referenceChanged, undefined to defined single reference', function() {
      var spy = jest.fn();
      ParentDataBinding.registerOnProperty('metal_f0.ref_ref', ['insert', 'modify', 'referenceChanged'], spy);
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding);

      var material = PropertyFactory.create(ReferenceParentTemplate.typeid);
      var metal_f0 = PropertyFactory.create(DoubleReferenceParentTemplate.typeid);
      var texturemap = PropertyFactory.create(DoubleReferenceParentTemplate.typeid);
      var image = PropertyFactory.create(PrimitiveChildrenTemplate.typeid);

      material.insert('metal_f0', metal_f0);

      workspace.root.insert('material', material);
      workspace.root.insert('texturemap', texturemap);
      workspace.root.insert('image', image);

      texturemap.get('ref_ref', RESOLVE_NEVER).setValue('/image');

      expect(spy).toHaveBeenCalledTimes(0);
      metal_f0.get(['ref_ref'], RESOLVE_NEVER).setValue('/texturemap');

      expect(spy).toHaveBeenCalledTimes(2);
    });

    // Don't give me collection change if I'm not a collection
    it('should not tell me about collections if im not a collection', function() {
      var myChild = PropertyFactory.create(ChildTemplate.typeid, 'single');

      var collectionInsertSpy = jest.fn();
      var collectionModifySpy = jest.fn();
      var collectionRemoveSpy = jest.fn();
      ChildDataBinding.registerOnPath('text', ['collectionInsert'], collectionInsertSpy);
      ChildDataBinding.registerOnPath('text', ['collectionModify'], collectionModifySpy);
      ChildDataBinding.registerOnPath('text', ['collectionRemove'], collectionRemoveSpy);

      dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding, { context: 'single' });
      workspace.root.insert('theChild', myChild);
      myChild.get('text').setValue('Hi!');

      expect(collectionInsertSpy).toHaveBeenCalledTimes(0);
      expect(collectionModifySpy).toHaveBeenCalledTimes(0);
      expect(collectionRemoveSpy).toHaveBeenCalledTimes(0);
    });

    // TODO: * support for reference changed notifications (OK)
    //       * support for reference changed notifications over multiple indirections (OK)
    //       * Do not trigger (ordering) for references which have been modified in the same scope [later?] (OK)
    //       * Chains of references to references (OK)
    //       * References with relative paths [later?]
    //       * ReferenceArrays, ReferenceMaps [later?]
    //       * References to array and maps (OK?)
    //       * bind to a reference via an indirect path (containing another reference) (OK??)

    it('should handle conversion from ArrayNode internally', function() {
      // Add the reference parent pset
      var referenceParentPSet = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');

      var referenceInsertSpy = jest.fn();
      var referenceModifySpy = jest.fn();
      var referenceRemoveSpy = jest.fn();
      ParentDataBinding.registerOnPath('single_prim_ref', ['insert'], referenceInsertSpy);
      ParentDataBinding.registerOnPath('single_prim_ref', ['modify'], referenceModifySpy);
      ParentDataBinding.registerOnPath('single_prim_ref', ['remove'], referenceRemoveSpy);

      // Register the DataBinding
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding, { context: 'single' });
      dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding, { context: 'all' });

      // insert with a dangling reference that contains [] and a number key
      referenceParentPSet.get('single_prim_ref', RESOLVE_NEVER)
        .setValue('/myMapContainer.subMap[10]');
      workspace.root.insert('myReferenceParent', referenceParentPSet);

      var mapContainerPset = PropertyFactory.create(MapContainerTemplate.typeid, 'single');
      workspace.root.insert('myMapContainer', mapContainerPset);

      // This should not trigger anything, since we're inserting into a non-referenced path in the map
      mapContainerPset.get('subMap').insert('5', PropertyFactory.create(ChildTemplate.typeid, 'single'));
      expect(referenceModifySpy).toHaveBeenCalledTimes(0);
      expect(referenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(referenceRemoveSpy).toHaveBeenCalledTimes(0);

      // This should trigger the insert handler (but not the modify/remove handlers)
      mapContainerPset.get('subMap').insert('10', PropertyFactory.create(ChildTemplate.typeid, 'single'));
      expect(referenceInsertSpy).toHaveBeenCalledTimes(1);
      referenceInsertSpy.mockClear();
      expect(referenceModifySpy).toHaveBeenCalledTimes(0);
      expect(referenceRemoveSpy).toHaveBeenCalledTimes(0);

      // This should trigger the modify handler (but not the insert/remove handlers)
      mapContainerPset.get('subMap').get('10').get('text').setValue('hello');
      expect(referenceModifySpy).toHaveBeenCalledTimes(1);
      referenceModifySpy.mockClear();
      expect(referenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(referenceRemoveSpy).toHaveBeenCalledTimes(0);

      // This should trigger both the insert and remove handler (but not the modify handler)
      mapContainerPset.get('subMap').set('10', PropertyFactory.create(ChildTemplate.typeid, 'single'));
      expect(referenceModifySpy).toHaveBeenCalledTimes(0);
      expect(referenceInsertSpy).toHaveBeenCalledTimes(1);
      expect(referenceRemoveSpy).toHaveBeenCalledTimes(1);
      referenceInsertSpy.mockClear();
      referenceRemoveSpy.mockClear();
    });

    it('should handle a chain of references to a primitive', function() {
      var i;
      var referenceInsertSpy = [];
      var referenceModifySpy = [];
      var referenceRemoveSpy = [];
      for (i = 0; i < 4; ++i) {
        referenceInsertSpy[i] = jest.fn();
        referenceModifySpy[i] = jest.fn();
        referenceRemoveSpy[i] = jest.fn();
        ParentDataBinding.registerOnPath('ref' + (i + 1), ['insert'], referenceInsertSpy[i]);
        ParentDataBinding.registerOnPath('ref' + (i + 1), ['modify'], referenceModifySpy[i]);
        ParentDataBinding.registerOnPath('ref' + (i + 1), ['remove'], referenceRemoveSpy[i]);
      }

      // Register the DataBinding
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding, { context: 'single' });
      dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding, { context: 'all' });

      // Create reference parent psets
      var referenceParentPSet = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');
      workspace.root.insert('myReferenceParent', referenceParentPSet);

      // create the chain
      referenceParentPSet.get('ref1', RESOLVE_NEVER)
        .setValue('/myReferenceParent.ref2');
      referenceParentPSet.get('ref2', RESOLVE_NEVER)
        .setValue('/myReferenceParent.ref3');
      referenceParentPSet.get('ref3', RESOLVE_NEVER)
        .setValue('/myString');

      // this should trigger the insert handler in all refs
      for (i = 0; i < 3; ++i) {
        expect(referenceInsertSpy[i]).toHaveBeenCalledTimes(0);
      }
      workspace.root.insert('myString', PropertyFactory.create('String', 'single'));
      for (i = 0; i < 3; ++i) {
        expect(referenceInsertSpy[i]).toHaveBeenCalledTimes(1);
        referenceInsertSpy[i].mockClear();
      }

      // this should trigger the modify handler in all refs
      for (i = 0; i < 4; ++i) {
        expect(referenceModifySpy[i]).toHaveBeenCalledTimes(0);
      }
      workspace.root.get('myString').setValue('hello');
      for (i = 0; i < 3; ++i) {
        expect(referenceModifySpy[i]).toHaveBeenCalledTimes(1);
        referenceModifySpy[i].mockClear();
      }

      // this should trigger the remove handler in all refs
      for (i = 0; i < 3; ++i) {
        expect(referenceRemoveSpy[i]).toHaveBeenCalledTimes(0);
      }
      workspace.root.remove('myString');
      for (i = 0; i < 3; ++i) {
        expect(referenceRemoveSpy[i]).toHaveBeenCalledTimes(1);
        referenceRemoveSpy[i].mockClear();
      }
      workspace.root.insert('myString', PropertyFactory.create('String', 'single'));

      // Check whether modifying the references works
      workspace.root.insert('myString2', PropertyFactory.create('String', 'single', 'string2'));
      referenceParentPSet.get('ref4', RESOLVE_NEVER)
        .setValue('/myString2');
      referenceParentPSet.get('ref2', RESOLVE_NEVER)
        .setValue('/myReferenceParent.ref4');

      // The old handler should no longer trigger
      workspace.root.get('myString').setValue('hello2');
      var handlers = [0, 1, 3];
      for (i = 0; i < handlers.length; i++) {
        expect(referenceModifySpy[handlers[i]]).toHaveBeenCalledTimes(0);
        referenceModifySpy[handlers[i]].mockClear();
      }
      // ref3 still points to /myString so it should trigger
      expect(referenceModifySpy[2]).toHaveBeenCalledTimes(1);
      referenceModifySpy[2].mockClear();

      // The new handler should now trigger instead
      workspace.root.get('myString2').setValue('hello2');
      for (i = 0; i < handlers.length; i++) {
        expect(referenceModifySpy[handlers[i]]).toHaveBeenCalledTimes(1);
        referenceModifySpy[handlers[i]].mockClear();
      }
      // ref3 still points to /myString so it should not trigger
      expect(referenceModifySpy[2]).toHaveBeenCalledTimes(0);
      referenceModifySpy[2].mockClear();
    });

    it('should handle an array of references to a property - broken in the PropertyTree', function() {
      // Add the reference parent pset
      var referenceParentPSet = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');

      var referenceInsertSpy = jest.fn();
      var referenceModifySpy = jest.fn();
      var referenceRemoveSpy = jest.fn();
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

      workspace.root.insert('myReferenceParent', referenceParentPSet);

      // This shouldn't trigger anything
      workspace.root.insert('alsoMyChildTemplate', PropertyFactory.create(ChildTemplate.typeid, 'single'));
      expect(referenceModifySpy).toHaveBeenCalledTimes(0);
      expect(referenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(referenceRemoveSpy).toHaveBeenCalledTimes(0);

      // This should trigger the insert handler (but not the modify/remove handlers)
      workspace.root.insert('myChildTemplate', PropertyFactory.create(ChildTemplate.typeid, 'single'));
      expect(referenceInsertSpy).toHaveBeenCalledTimes(1);
      referenceInsertSpy.mockClear();
      expect(referenceModifySpy).toHaveBeenCalledTimes(0);
      expect(referenceRemoveSpy).toHaveBeenCalledTimes(0);

      // This shouldn't trigger anything
      workspace.root.get('alsoMyChildTemplate').get('text').setValue('hello');
      expect(referenceModifySpy).toHaveBeenCalledTimes(0);
      expect(referenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(referenceRemoveSpy).toHaveBeenCalledTimes(0);

      // This also shouldn't trigger anything
      workspace.root.remove('alsoMyChildTemplate');
      expect(referenceModifySpy).toHaveBeenCalledTimes(0);
      expect(referenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(referenceRemoveSpy).toHaveBeenCalledTimes(0);

      // This should trigger the modify handler (but not the insert/remove handlers)
      workspace.root.get('myChildTemplate').get('text').setValue('hello');
      expect(referenceModifySpy).toHaveBeenCalledTimes(1);
      referenceModifySpy.mockClear();
      expect(referenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(referenceRemoveSpy).toHaveBeenCalledTimes(0);

      // This should trigger remove handler (but not the insert/modify handler)
      workspace.root.remove('myChildTemplate');
      expect(referenceRemoveSpy).toHaveBeenCalledTimes(1);
      referenceRemoveSpy.mockClear();
      expect(referenceModifySpy).toHaveBeenCalledTimes(0);
      expect(referenceInsertSpy).toHaveBeenCalledTimes(0);
    });

    it('should handle references directly to an array', function() {
      // Add the reference parent pset
      var referenceParentPSet = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');
      // Add our child (referenced) pset
      var arrayPset1 = PropertyFactory.create(ArrayContainerTemplate.typeid, 'single');
      var arrayPset2 = PropertyFactory.create(ArrayContainerTemplate.typeid, 'single');
      // register the reference handlers
      var referenceInsertSpy = jest.fn();
      var referenceModifySpy = jest.fn();
      var referenceRemoveSpy = jest.fn();
      ParentDataBinding.registerOnPath('single_ref', ['collectionInsert'], referenceInsertSpy);
      ParentDataBinding.registerOnPath('single_ref', ['collectionModify'], referenceModifySpy);
      ParentDataBinding.registerOnPath('single_ref', ['collectionRemove'], referenceRemoveSpy);

      // Register the DataBinding
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding, { context: 'single' });
      expect(dataBinder._dataBindingCreatedCounter).toEqual(0);
      // parentPset should produce a ParentDataBinding
      workspace.root.insert('myReferenceParent', referenceParentPSet);
      expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
      dataBinder._resetDebugCounters();
      const parentDataBinding = dataBinder.resolve('/myReferenceParent', 'BINDING');
      expect(parentDataBinding).toBeInstanceOf(ParentDataBinding);
      expect(parentDataBinding.onModify).toHaveBeenCalledTimes(0);
      parentDataBinding.onModify.mockClear();
      workspace.root.insert('myChild1', arrayPset1);
      workspace.root.insert('myChild2', arrayPset2);

      referenceParentPSet.get('single_ref', RESOLVE_NEVER)
        .setValue('/myChild1.subArray');

      var referencedArray = arrayPset1.get('subArray');
      expect(referenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(referenceModifySpy).toHaveBeenCalledTimes(0);
      expect(referenceRemoveSpy).toHaveBeenCalledTimes(0);
      // insert a new element into the array
      var childPset1 = PropertyFactory.create(ChildTemplate.typeid, 'single');
      referencedArray.push(childPset1);
      expect(referenceInsertSpy).toHaveBeenCalledTimes(1); /// TODO
      referenceInsertSpy.mockClear();
      expect(referenceModifySpy).toHaveBeenCalledTimes(0);
      expect(referenceRemoveSpy).toHaveBeenCalledTimes(0);

      // change a property of that element in the array, this should trigger a modify
      referencedArray.get(0).get('text').setValue('hello');
      expect(referenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(referenceModifySpy).toHaveBeenCalledTimes(1); /// TODO
      referenceModifySpy.mockClear();
      expect(referenceRemoveSpy).toHaveBeenCalledTimes(0);

      // change the first element into a new element, this should trigger a remove/insert
      var childPset2 = PropertyFactory.create(ChildTemplate.typeid, 'single');
      referencedArray.set(0, childPset2);
      expect(referenceInsertSpy).toHaveBeenCalledTimes(1); // TODO
      referenceInsertSpy.mockClear();
      expect(referenceModifySpy).toHaveBeenCalledTimes(0);
      expect(referenceRemoveSpy).toHaveBeenCalledTimes(1); // TODO
      referenceRemoveSpy.mockClear();

      // remove the element, this should trigger a remove
      referencedArray.remove(0);
      expect(referenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(referenceModifySpy).toHaveBeenCalledTimes(0);
      expect(referenceRemoveSpy).toHaveBeenCalledTimes(1); // this is correct for some reason :)
      referenceRemoveSpy.mockClear();
    });

    it('should handle references with a subpath that points to an array', function() {
      // Add the reference parent pset
      var referenceParentPSet = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');
      // Add our child (referenced) pset
      var arrayPset1 = PropertyFactory.create(ArrayContainerTemplate.typeid, 'single');
      var arrayPset2 = PropertyFactory.create(ArrayContainerTemplate.typeid, 'single');

      // register the reference handlers
      var referenceInsertSpy = jest.fn();
      var referenceModifySpy = jest.fn();
      var referenceRemoveSpy = jest.fn();
      ParentDataBinding.registerOnPath('single_ref.subArray', ['collectionInsert'], referenceInsertSpy);
      ParentDataBinding.registerOnPath('single_ref.subArray', ['collectionModify'], referenceModifySpy);
      ParentDataBinding.registerOnPath('single_ref.subArray', ['collectionRemove'], referenceRemoveSpy);

      // Register the DataBinding
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding, { context: 'single' });
      expect(dataBinder._dataBindingCreatedCounter).toEqual(0);
      // parentPset should produce a ParentDataBinding
      workspace.root.insert('myReferenceParent', referenceParentPSet);
      expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
      dataBinder._resetDebugCounters();
      const parentDataBinding = dataBinder.resolve('/myReferenceParent', 'BINDING');
      expect(parentDataBinding).toBeInstanceOf(ParentDataBinding);
      expect(parentDataBinding.onModify).toHaveBeenCalledTimes(0);
      parentDataBinding.onModify.mockClear();
      workspace.root.insert('myChild1', arrayPset1);
      workspace.root.insert('myChild2', arrayPset2);

      referenceParentPSet.get('single_ref', RESOLVE_NEVER)
        .setValue('/myChild1');

      var referencedArray = arrayPset1.get('subArray');
      expect(referenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(referenceModifySpy).toHaveBeenCalledTimes(0);
      expect(referenceRemoveSpy).toHaveBeenCalledTimes(0);
      // insert a new element into the array
      var childPset1 = PropertyFactory.create(ChildTemplate.typeid, 'single');
      referencedArray.push(childPset1);
      expect(referenceInsertSpy).toHaveBeenCalledTimes(1); /// TODO
      referenceInsertSpy.mockClear();
      expect(referenceModifySpy).toHaveBeenCalledTimes(0);
      expect(referenceRemoveSpy).toHaveBeenCalledTimes(0);

      // change a property of that element in the array, this should trigger a modify
      referencedArray.get(0).get('text').setValue('hello');
      expect(referenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(referenceModifySpy).toHaveBeenCalledTimes(1); /// TODO
      referenceModifySpy.mockClear();
      expect(referenceRemoveSpy).toHaveBeenCalledTimes(0);

      // change the first element into a new element, this should trigger a remove/insert
      var childPset2 = PropertyFactory.create(ChildTemplate.typeid, 'single');
      referencedArray.set(0, childPset2);
      expect(referenceInsertSpy).toHaveBeenCalledTimes(1); // TODO
      referenceInsertSpy.mockClear();
      expect(referenceModifySpy).toHaveBeenCalledTimes(0);
      expect(referenceRemoveSpy).toHaveBeenCalledTimes(1); // TODO
      referenceRemoveSpy.mockClear();

      // remove the element, this should trigger a remove
      referencedArray.remove(0);
      expect(referenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(referenceModifySpy).toHaveBeenCalledTimes(0);
      expect(referenceRemoveSpy).toHaveBeenCalledTimes(1); // this is correct for some reason :)
      referenceRemoveSpy.mockClear();
    });

    it('should handle references directly to a map', function() {
      // Add the reference parent pset
      var referenceParentPSet = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');
      // Add our child (referenced) pset
      var mapPset1 = PropertyFactory.create(MapContainerTemplate.typeid, 'single');
      var mapPset2 = PropertyFactory.create(MapContainerTemplate.typeid, 'single');

      // register the reference handlers
      var referenceInsertSpy = jest.fn();
      var referenceModifySpy = jest.fn();
      var referenceRemoveSpy = jest.fn();
      ParentDataBinding.registerOnPath('single_ref', ['collectionInsert'], referenceInsertSpy);
      ParentDataBinding.registerOnPath('single_ref', ['collectionModify'], referenceModifySpy);
      ParentDataBinding.registerOnPath('single_ref', ['collectionRemove'], referenceRemoveSpy);

      // Register the DataBinding
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding, { context: 'single' });
      expect(dataBinder._dataBindingCreatedCounter).toEqual(0);

      // parentPset should produce a ParentDataBinding
      workspace.root.insert('myReferenceParent', referenceParentPSet);
      expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
      const parentDataBinding = dataBinder.resolve(referenceParentPSet, 'BINDING');
      expect(parentDataBinding).toBeInstanceOf(ParentDataBinding);
      expect(parentDataBinding.onModify).toHaveBeenCalledTimes(0);
      parentDataBinding.onModify.mockClear();
      workspace.root.insert('myChild1', mapPset1);
      workspace.root.insert('myChild2', mapPset2);

      referenceParentPSet.get('single_ref', RESOLVE_NEVER)
        .setValue('/myChild1.subMap');

      var referencedMap = mapPset1.get('subMap');
      expect(referenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(referenceModifySpy).toHaveBeenCalledTimes(0);
      expect(referenceRemoveSpy).toHaveBeenCalledTimes(0);
      // insert a new element into the map
      var childPset1 = PropertyFactory.create(ChildTemplate.typeid, 'single');
      referencedMap.insert(childPset1.getGuid(), childPset1);
      expect(referenceInsertSpy).toHaveBeenCalledTimes(1);
      referenceInsertSpy.mockClear();
      expect(referenceModifySpy).toHaveBeenCalledTimes(0);
      expect(referenceRemoveSpy).toHaveBeenCalledTimes(0);

      // change a property of that element in the map, this should trigger a modify
      referencedMap.get(childPset1.getGuid()).get('text').setValue('hello');
      expect(referenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(referenceModifySpy).toHaveBeenCalledTimes(1);
      referenceModifySpy.mockClear();
      expect(referenceRemoveSpy).toHaveBeenCalledTimes(0);

      // remove the element, this should trigger a remove
      referencedMap.remove(childPset1.getGuid());
      expect(referenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(referenceModifySpy).toHaveBeenCalledTimes(0);
      expect(referenceRemoveSpy).toHaveBeenCalledTimes(1);
      referenceRemoveSpy.mockClear();
    });

    it('should handle references with a subpath that points to a map', function() {
      // Add the reference parent pset
      var referenceParentPSet = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');
      // Add our child (referenced) pset
      var mapPset1 = PropertyFactory.create(MapContainerTemplate.typeid, 'single');
      var mapPset2 = PropertyFactory.create(MapContainerTemplate.typeid, 'single');

      // register the reference handlers
      var referenceInsertSpy = jest.fn();
      var referenceModifySpy = jest.fn();
      var referenceRemoveSpy = jest.fn();
      ParentDataBinding.registerOnPath('single_ref.subMap', ['collectionInsert'], referenceInsertSpy);
      ParentDataBinding.registerOnPath('single_ref.subMap', ['collectionModify'], referenceModifySpy);
      ParentDataBinding.registerOnPath('single_ref.subMap', ['collectionRemove'], referenceRemoveSpy);

      // Register the DataBinding
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding, { context: 'single' });
      expect(dataBinder._dataBindingCreatedCounter).toEqual(0);

      // parentPset should produce a ParentDataBinding
      workspace.root.insert('myReferenceParent', referenceParentPSet);
      expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
      dataBinder._resetDebugCounters();
      const parentDataBinding = dataBinder.resolve(referenceParentPSet, 'BINDING');
      expect(parentDataBinding.onModify).toHaveBeenCalledTimes(0);
      parentDataBinding.onModify.mockClear();
      workspace.root.insert('myChild1', mapPset1);
      workspace.root.insert('myChild2', mapPset2);

      referenceParentPSet.get('single_ref', RESOLVE_NEVER)
        .setValue('/myChild1');

      var referencedMap = mapPset1.get('subMap');
      expect(referenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(referenceModifySpy).toHaveBeenCalledTimes(0);
      expect(referenceRemoveSpy).toHaveBeenCalledTimes(0);
      // insert a new element into the map
      var childPset1 = PropertyFactory.create(ChildTemplate.typeid, 'single');
      referencedMap.insert(childPset1.getGuid(), childPset1);
      expect(referenceInsertSpy).toHaveBeenCalledTimes(1);
      referenceInsertSpy.mockClear();
      expect(referenceModifySpy).toHaveBeenCalledTimes(0);
      expect(referenceRemoveSpy).toHaveBeenCalledTimes(0);

      // change a property of that element in the map, this should trigger a modify
      referencedMap.get(childPset1.getGuid()).get('text').setValue('hello');
      expect(referenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(referenceModifySpy).toHaveBeenCalledTimes(1);
      referenceModifySpy.mockClear();
      expect(referenceRemoveSpy).toHaveBeenCalledTimes(0);

      // remove the element, this should trigger a remove
      referencedMap.remove(childPset1.getGuid());
      expect(referenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(referenceModifySpy).toHaveBeenCalledTimes(0);
      expect(referenceRemoveSpy).toHaveBeenCalledTimes(1);
      referenceRemoveSpy.mockClear();
    });

    // TODO: fix previously working test
    it.skip('should handle double references', function() {

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

      expect(dataBinder._dataBindingCreatedCounter).toEqual(0);

      // parentPset should produce a ParentDataBinding
      workspace.root.insert('myReferenceParent1', doubleReferenceParentPSet1);
      workspace.root.insert('myReferenceParent2', doubleReferenceParentPSet2);
      expect(dataBinder._dataBindingCreatedCounter).toEqual(2);
      dataBinder._resetDebugCounters();
      const parentDataBinding1 = dataBinder.resolve('/myReferenceParent1', 'BINDING');
      expect(parentDataBinding1).toBeInstanceOf(ParentDataBinding);
      expect(parentDataBinding1.onModify).toHaveBeenCalledTimes(1);
      parentDataBinding1.onModify.mockClear();
      const parentDataBinding2 = dataBinder.resolve('/myReferenceParent2', 'BINDING');
      expect(parentDataBinding2).toBeInstanceOf(ParentDataBinding);
      expect(parentDataBinding2.onModify).toHaveBeenCalledTimes(1);
      parentDataBinding2.onModify.mockClear();
      workspace.root.insert('myChild1', childPset1);
      workspace.root.insert('myChild2', childPset2);
      expect(dataBinder._dataBindingCreatedCounter).toEqual(2);
      dataBinder._resetDebugCounters();

      // the first one points to the second one
      doubleReferenceParentPSet1.get('ref_ref').setValue('/myReferenceParent2.ref_ref');

      // we changed the reference for the first parent -> we get a notification
      expect(parentDataBinding1.onModify).toHaveBeenCalledTimes(1);
      var modificationContext = parentDataBinding1.onModify.mock.calls[0][0];
      expect(modificationContext.length).toEqual(1);
      expect(modificationContext[0].getAbsolutePath()).toEqual('myReferenceParent1.ref_ref');
      parentDataBinding1.onModify.mockClear();
      // nothing happened to the second parent yet
      expect(parentDataBinding2.onModify).toHaveBeenCalledTimes(0);

      // the second one points to the real property
      doubleReferenceParentPSet2.get('ref_ref').set(childPset2);
      // we changed the reference for the second parent -> we get a notification
      expect(parentDataBinding2.onModify).toHaveBeenCalledTimes(1);
      modificationContext = parentDataBinding2.onModify.mock.calls[0][0];
      expect(modificationContext.length).toEqual(1);
      expect(modificationContext[0].getAbsolutePath()).toEqual('myReferenceParent2.ref_ref');
      parentDataBinding2.onModify.mockClear();
      // the first parent should also be notified
      expect(parentDataBinding1.onModify).toHaveBeenCalledTimes(1);
      modificationContext = parentDataBinding1.onModify.mock.calls[0][0];
      expect(modificationContext.length).toEqual(1);
      expect(modificationContext[0].getAbsolutePath()).toEqual('myReferenceParent2.ref_ref'); // the new value!
      parentDataBinding1.onModify.mockClear();

      // change the *value* of the reference (i.e. the "pointed to" object)
      childPset2.get('text').value = 'hello';

      // we should get a notification for the second parent
      expect(parentDataBinding2.onModify).toHaveBeenCalledTimes(1);
      modificationContext = parentDataBinding2.onModify.mock.calls[0][0];
      expect(modificationContext.length).toEqual(1);
      expect(modificationContext[0].getAbsolutePath()).toEqual('myChild2.text');
      parentDataBinding2.onModify.mockClear();
      expect(parentDataBinding1.onModify).toHaveBeenCalledTimes(1);
      modificationContext = parentDataBinding1.onModify.mock.calls[0][0];
      expect(modificationContext.length).toEqual(1);
      expect(modificationContext[0].getAbsolutePath()).toEqual('myChild2.text');
      parentDataBinding1.onModify.mockClear();
      workspace.root.remove(doubleReferenceParentPSet2);
      // change the *value* of the reference (i.e. the "pointed to" object) again
      childPset2.get('text').value = 'hello2';
      // we should not get a notification on either parents as we've removed the 2nd reference prop pointing to this
      expect(parentDataBinding1.onModify).toHaveBeenCalledTimes(0);
      expect(parentDataBinding2.onModify).toHaveBeenCalledTimes(0);
    });

    // TODO: stop previously working test
    it.skip('should handle triple references', function() {

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

      expect(dataBinder._dataBindingCreatedCounter).toEqual(0);

      // parentPset should produce a ParentDataBinding
      workspace.root.insert('myReferenceParent1', doubleReferenceParentPSet1);
      workspace.root.insert('myReferenceParent2', doubleReferenceParentPSet2);
      workspace.root.insert('myReferenceParent3', doubleReferenceParentPSet3);
      expect(dataBinder._dataBindingCreatedCounter).toEqual(3);
      dataBinder._resetDebugCounters();
      const parentDataBinding1 = dataBinder.resolve('/myReferenceParent1', 'BINDING');
      expect(parentDataBinding1).toBeInstanceOf(ParentDataBinding);
      expect(parentDataBinding1.onModify).toHaveBeenCalledTimes(1);
      parentDataBinding1.onModify.mockClear();
      const parentDataBinding2 = dataBinder.resolve('/myReferenceParent2', 'BINDING');
      expect(parentDataBinding2).toBeInstanceOf(ParentDataBinding);
      expect(parentDataBinding2.onModify).toHaveBeenCalledTimes(1);
      parentDataBinding2.onModify.mockClear();
      const parentDataBinding3 = dataBinder.resolve('/myReferenceParent3', 'BINDING');
      expect(parentDataBinding3).toBeInstanceOf(ParentDataBinding);
      expect(parentDataBinding3.onModify).toHaveBeenCalledTimes(1);
      parentDataBinding3.onModify.mockClear();
      workspace.root.insert('myChild1', childPset1);
      expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
      dataBinder._resetDebugCounters();

      // the first one points to the second one
      doubleReferenceParentPSet1.get('ref_ref').setValue('/myReferenceParent2.ref_ref');

      // we changed the reference for the first parent -> we get a notification
      expect(parentDataBinding1.onModify).toHaveBeenCalledTimes(1);
      var modificationContext = parentDataBinding1.onModify.mock.calls[0][0];
      expect(modificationContext.length).toEqual(1);
      expect(modificationContext[0].getAbsolutePath()).toEqual('myReferenceParent1.ref_ref');
      parentDataBinding1.onModify.mockClear();
      // nothing happened to the second/third parent yet
      expect(parentDataBinding2.onModify).toHaveBeenCalledTimes(0);
      expect(parentDataBinding3.onModify).toHaveBeenCalledTimes(0);

      // the second one points to the third one
      doubleReferenceParentPSet2.get('ref_ref').setValue('/myReferenceParent3.ref_ref');

      // we changed the reference for the second parent -> we get a notification
      expect(parentDataBinding2.onModify).toHaveBeenCalledTimes(1);
      modificationContext = parentDataBinding2.onModify.mock.calls[0][0];
      expect(modificationContext.length).toEqual(1);
      expect(modificationContext[0].getAbsolutePath()).toEqual('myReferenceParent2.ref_ref');
      parentDataBinding2.onModify.mockClear();
      expect(parentDataBinding1.onModify).toHaveBeenCalledTimes(1);
      modificationContext = parentDataBinding1.onModify.mock.calls[0][0];
      expect(modificationContext.length).toEqual(1);
      expect(modificationContext[0].getAbsolutePath()).toEqual('myReferenceParent2.ref_ref');
      parentDataBinding1.onModify.mockClear();
      // nothing happened to the third parent yet
      expect(parentDataBinding3.onModify).toHaveBeenCalledTimes(0);

      // the third one points to the real property
      doubleReferenceParentPSet3.get('ref_ref').set(childPset1);
      // we changed the reference for the third parent -> we get a notification
      expect(parentDataBinding3.onModify).toHaveBeenCalledTimes(1);
      modificationContext = parentDataBinding3.onModify.mock.calls[0][0];
      expect(modificationContext.length).toEqual(1);
      expect(modificationContext[0].getAbsolutePath()).toEqual('myReferenceParent3.ref_ref');
      parentDataBinding3.onModify.mockClear();
      expect(parentDataBinding2.onModify).toHaveBeenCalledTimes(1);
      modificationContext = parentDataBinding2.onModify.mock.calls[0][0];
      expect(modificationContext.length).toEqual(1);
      expect(modificationContext[0].getAbsolutePath()).toEqual('myReferenceParent3.ref_ref');
      parentDataBinding2.onModify.mockClear();
      // the first parent should also be notified
      expect(parentDataBinding1.onModify).toHaveBeenCalledTimes(1);
      modificationContext = parentDataBinding1.onModify.mock.calls[0][0];
      expect(modificationContext.length).toEqual(1);
      expect(modificationContext[0].getAbsolutePath()).toEqual('myReferenceParent3.ref_ref');
      parentDataBinding1.onModify.mockClear();

      // change the *value* of the reference (i.e. the "pointed to" object)
      childPset1.get('text').value = 'hello';

      // we should get a notification for the second parent
      expect(parentDataBinding3.onModify).toHaveBeenCalledTimes(1);
      modificationContext = parentDataBinding3.onModify.mock.calls[0][0];
      expect(modificationContext.length).toEqual(1);
      expect(modificationContext[0].getAbsolutePath()).toEqual('myChild1.text');
      parentDataBinding3.onModify.mockClear();
      expect(parentDataBinding2.onModify).toHaveBeenCalledTimes(1);
      modificationContext = parentDataBinding2.onModify.mock.calls[0][0];
      expect(modificationContext.length).toEqual(1);
      expect(modificationContext[0].getAbsolutePath()).toEqual('myChild1.text');
      parentDataBinding2.onModify.mockClear();
      expect(parentDataBinding1.onModify).toHaveBeenCalledTimes(1);
      modificationContext = parentDataBinding1.onModify.mock.calls[0][0];
      expect(modificationContext.length).toEqual(1);
      expect(modificationContext[0].getAbsolutePath()).toEqual('myChild1.text');
      parentDataBinding1.onModify.mockClear();
      workspace.root.remove(doubleReferenceParentPSet3);
      // change the *value* of the reference (i.e. the "pointed to" object) again
      childPset1.get('text').value = 'hello2';
      // we should not get a notification on either parents as we've removed the 2nd reference prop pointing to this
      expect(parentDataBinding1.onModify).toHaveBeenCalledTimes(0);
      expect(parentDataBinding2.onModify).toHaveBeenCalledTimes(0);
      expect(parentDataBinding3.onModify).toHaveBeenCalledTimes(0);
    });

    it('should handle multiple references to the same object', function() {
      // Add the reference parent pset
      var referenceParentPSet1 = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');
      var referenceParentPSet2 = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');
      var referenceParentPSet3 = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');
      // Add our child (referenced) pset
      var childPset1 = PropertyFactory.create(ChildTemplate.typeid, 'single');

      // register the reference handlers
      var referenceInsertSpy = jest.fn();
      var referenceModifySpy = jest.fn();
      var referenceRemoveSpy = jest.fn();
      ParentDataBinding.registerOnPath('single_ref', ['insert'], referenceInsertSpy);
      ParentDataBinding.registerOnPath('single_ref', ['modify'], referenceModifySpy);
      ParentDataBinding.registerOnPath('single_ref', ['remove'], referenceRemoveSpy);

      // Register the DataBinding
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding);
      // parentPset should produce a ParentDataBinding
      workspace.root.insert('myReferenceParent1', referenceParentPSet1);
      workspace.root.insert('myReferenceParent2', referenceParentPSet2);
      workspace.root.insert('myReferenceParent3', referenceParentPSet3);
      expect(dataBinder._dataBindingCreatedCounter).toEqual(3);
      dataBinder._resetDebugCounters();
      const parentDataBinding1 = dataBinder.resolve(referenceParentPSet1, 'BINDING');
      expect(parentDataBinding1).toBeInstanceOf(ParentDataBinding);
      const parentDataBinding2 = dataBinder.resolve(referenceParentPSet2, 'BINDING');
      expect(parentDataBinding2).toBeInstanceOf(ParentDataBinding);
      const parentDataBinding3 = dataBinder.resolve(referenceParentPSet3, 'BINDING');
      expect(parentDataBinding3).toBeInstanceOf(ParentDataBinding);

      expect(referenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(referenceModifySpy).toHaveBeenCalledTimes(0);
      expect(referenceRemoveSpy).toHaveBeenCalledTimes(0);
      // insert should trigger the insert handler
      referenceParentPSet1.get('single_ref', RESOLVE_NEVER)
        .setValue('/myChild1');
      referenceParentPSet2.get('single_ref', RESOLVE_NEVER)
        .setValue('/myChild1');
      referenceParentPSet3.get('single_ref', RESOLVE_NEVER)
        .setValue('/myChild1');
      workspace.root.insert('myChild1', childPset1);
      expect(referenceInsertSpy).toHaveBeenCalledTimes(3);
      referenceInsertSpy.mockClear();
      expect(referenceModifySpy).toHaveBeenCalledTimes(0);
      expect(referenceRemoveSpy).toHaveBeenCalledTimes(0);

      // modify should trigger the modify handler
      childPset1.get('text').setValue('hello');
      expect(referenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(referenceModifySpy).toHaveBeenCalledTimes(3);
      referenceModifySpy.mockClear();
      expect(referenceRemoveSpy).toHaveBeenCalledTimes(0);

      // remove should trigger the remove handler
      workspace.root.remove('myChild1');
      expect(referenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(referenceModifySpy).toHaveBeenCalledTimes(0);
      expect(referenceRemoveSpy).toHaveBeenCalledTimes(3);
      referenceRemoveSpy.mockClear();
    });

    it('not follow references if there aren no exactPaths', function() {
      const a = PropertyFactory.create(ParentTemplate.typeid, 'single');
      workspace.root.insert('a', a);
      workspace.root.insert('ref', PropertyFactory.create('Reference', 'single'));
      workspace.root.get('ref', RESOLVE_NEVER).setValue('/a');

      dataBinder.register('BINDING', ParentTemplate.typeid, ParentDataBinding);

      const binding = dataBinder.resolve('a', 'BINDING');
      expect(binding._getReferenceCount()).toEqual(1);
    });

    it('should not die miserably in an infinite loop', function() {
      const a = PropertyFactory.create('NodeProperty', 'single');
      const b = PropertyFactory.create('NodeProperty', 'single');

      workspace.root.insert('a', a);
      a.insert('ref', PropertyFactory.create('Reference', 'single'));
      a.get('ref', RESOLVE_NEVER).setValue('/b');

      workspace.root.insert('b', b);
      b.insert('ref', PropertyFactory.create('Reference', 'single'));
      b.get('ref', RESOLVE_NEVER).setValue('/a');

      dataBinder.register('BINDING', 'NodeProperty', ParentDataBinding);

      expect(dataBinder._dataBindingCreatedCounter).toEqual(3);  // root, a and b
    });

    it('should not die miserably in an infinite loop with primitive reference arrays', function() {
      const a = PropertyFactory.create('NodeProperty', 'single');
      const b = PropertyFactory.create('NodeProperty', 'single');

      workspace.root.insert('a', a);
      a.insert('ref', PropertyFactory.create('Reference', 'array'));
      a.get('ref', RESOLVE_NEVER).push('/b');

      workspace.root.insert('b', b);
      b.insert('ref', PropertyFactory.create('Reference', 'array'));
      b.get('ref', RESOLVE_NEVER).push('/a');

      dataBinder.register('BINDING', 'NodeProperty', ParentDataBinding);

      expect(dataBinder._dataBindingCreatedCounter).toEqual(3);  // root, a and b
    });

    it('should not die miserably in an infinite loop with primitive reference maps', function() {
      const a = PropertyFactory.create('NodeProperty', 'single');
      const b = PropertyFactory.create('NodeProperty', 'single');

      workspace.root.insert('a', a);
      a.insert('ref', PropertyFactory.create('Reference', 'map'));
      a.get('ref', RESOLVE_NEVER).insert('b', '/b');

      workspace.root.insert('b', b);
      b.insert('ref', PropertyFactory.create('Reference', 'map'));
      b.get('ref', RESOLVE_NEVER).insert('a', '/a');

      dataBinder.register('BINDING', 'NodeProperty', ParentDataBinding);

      expect(dataBinder._dataBindingCreatedCounter).toEqual(3);  // root, a and b
    });

    it('follow references if there is an exactPath', function() {
      const a = PropertyFactory.create(ParentTemplate.typeid, 'single');
      workspace.root.insert('a', a);
      workspace.root.insert('ref', PropertyFactory.create('Reference', 'single'));
      workspace.root.get('ref', RESOLVE_NEVER).setValue('/a');

      dataBinder.register('BINDING', ParentTemplate.typeid, ParentDataBinding, {
        exactPath: 'ref'
      });

      const binding = dataBinder.resolve('a', 'BINDING');
      expect(binding._getReferenceCount()).toEqual(1);
    });

    it('follow references if there is an exactPath in arrays', function() {
      const a = PropertyFactory.create(ParentTemplate.typeid, 'single');
      workspace.root.insert('a', a);
      workspace.root.insert('refArray', PropertyFactory.create('Reference', 'array'));
      workspace.root.get('refArray').push('/a');

      dataBinder.register('BINDING', ParentTemplate.typeid, ParentDataBinding, {
        exactPath: 'refArray[0]'
      });

      const binding = dataBinder.resolve('a', 'BINDING');
      expect(binding._getReferenceCount()).toEqual(1);
    });

    it('should handle multiple nested references to the same object', function() {
      // Add the reference parent pset
      var referenceParentPSet1 = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');
      var referenceParentPSet2 = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');
      var referenceParentPSet3 = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');
      // Add our child (referenced) pset
      var childPset1 = PropertyFactory.create(ChildTemplate.typeid, 'single');

      // register the reference handlers
      var referenceInsertSpy = jest.fn();
      var referenceModifySpy = jest.fn();
      var referenceRemoveSpy = jest.fn();
      ParentDataBinding.registerOnPath('single_ref', ['insert'], referenceInsertSpy);
      ParentDataBinding.registerOnPath('single_ref', ['modify'], referenceModifySpy);
      ParentDataBinding.registerOnPath('single_ref', ['remove'], referenceRemoveSpy);
      var referenceReferenceInsertSpy = jest.fn();
      var referenceReferenceModifySpy = jest.fn();
      var referenceReferenceRemoveSpy = jest.fn();
      ParentDataBinding.registerOnPath('single_ref.single_ref', ['insert'], referenceReferenceInsertSpy);
      ParentDataBinding.registerOnPath('single_ref.single_ref', ['modify'], referenceReferenceModifySpy);
      ParentDataBinding.registerOnPath('single_ref.single_ref', ['remove'], referenceReferenceRemoveSpy);

      // Register the DataBinding
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding);
      // parentPset should produce a ParentDataBinding
      workspace.root.insert('myReferenceParent1', referenceParentPSet1);
      workspace.root.insert('myReferenceParent2', referenceParentPSet2);
      workspace.root.insert('myReferenceParent3', referenceParentPSet3);
      expect(dataBinder._dataBindingCreatedCounter).toEqual(3);
      dataBinder._resetDebugCounters();
      const parentDataBinding1 = dataBinder.resolve(referenceParentPSet1, 'BINDING');
      expect(parentDataBinding1).toBeInstanceOf(ParentDataBinding);
      const parentDataBinding2 = dataBinder.resolve(referenceParentPSet2, 'BINDING');
      expect(parentDataBinding2).toBeInstanceOf(ParentDataBinding);
      const parentDataBinding3 = dataBinder.resolve(referenceParentPSet3, 'BINDING');
      expect(parentDataBinding3).toBeInstanceOf(ParentDataBinding);

      expect(referenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(referenceModifySpy).toHaveBeenCalledTimes(0);
      expect(referenceRemoveSpy).toHaveBeenCalledTimes(0);
      expect(referenceReferenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(referenceReferenceModifySpy).toHaveBeenCalledTimes(0);
      expect(referenceReferenceRemoveSpy).toHaveBeenCalledTimes(0);
      // insert should trigger the insert handler
      referenceParentPSet1.get('single_ref', RESOLVE_NEVER)
        .setValue('/myReferenceParent2');
      referenceParentPSet2.get('single_ref', RESOLVE_NEVER)
        .setValue('/myChild1');

      // We get an insert when we make the reference valid.
      expect(referenceInsertSpy).toHaveBeenCalledTimes(1);
      referenceInsertSpy.mockClear();

      // This modification triggers an onModify event on the referenceParentPSet1
      // since it bound to all modification events in myReferenceParent2
      expect(referenceModifySpy).toHaveBeenCalledTimes(1);
      referenceModifySpy.mockClear();

      referenceParentPSet3.get('single_ref', RESOLVE_NEVER)
        .setValue('/myChild1');
      workspace.root.insert('myChild1', childPset1);
      expect(referenceInsertSpy).toHaveBeenCalledTimes(2);
      referenceInsertSpy.mockClear();
      expect(referenceModifySpy).toHaveBeenCalledTimes(0); // TODO: this gets called here
      referenceModifySpy.mockClear();
      expect(referenceRemoveSpy).toHaveBeenCalledTimes(0);
      expect(referenceReferenceInsertSpy).toHaveBeenCalledTimes(1);
      referenceReferenceInsertSpy.mockClear();
      expect(referenceReferenceModifySpy).toHaveBeenCalledTimes(0); // TODO: this gets called here
      referenceReferenceModifySpy.mockClear();
      expect(referenceReferenceRemoveSpy).toHaveBeenCalledTimes(0);

      // modify should trigger the modify handler
      childPset1.get('text').setValue('hello');
      expect(referenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(referenceModifySpy).toHaveBeenCalledTimes(2);
      referenceModifySpy.mockClear();
      expect(referenceRemoveSpy).toHaveBeenCalledTimes(0);
      expect(referenceReferenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(referenceReferenceModifySpy).toHaveBeenCalledTimes(1);
      referenceReferenceModifySpy.mockClear();
      expect(referenceReferenceRemoveSpy).toHaveBeenCalledTimes(0);

      // remove should trigger the remove handler
      workspace.root.remove('myChild1');
      expect(referenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(referenceModifySpy).toHaveBeenCalledTimes(0);
      expect(referenceRemoveSpy).toHaveBeenCalledTimes(2);
      referenceRemoveSpy.mockClear();
      expect(referenceReferenceInsertSpy).toHaveBeenCalledTimes(0);
      expect(referenceReferenceModifySpy).toHaveBeenCalledTimes(0);
      expect(referenceReferenceRemoveSpy).toHaveBeenCalledTimes(1);
      referenceReferenceRemoveSpy.mockClear();

    });

    it('should not send old modify messages, when the reference has changed', function() {
      // var referenceInsertSpy = jest.fn();
      var referenceModifySpy = jest.fn();
      // var referenceRemoveSpy = jest.fn();
      ParentDataBinding.registerOnPath('single_ref.text', ['modify'], referenceModifySpy);
      ParentDataBinding.registerOnPath('single_ref.ref.text', ['modify'], referenceModifySpy);

      // Register the DataBinding
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding, { context: 'single' });
      dataBinder.register('BINDING', NodeContainerTemplate.typeid, ParentDataBinding, { context: 'single' });
      dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding, { context: 'all' });

      // We insert the object with the reference within the array to make sure, the evaluation
      // order by DataBindingManger is as expected
      workspace.root.insert('array', PropertyFactory.create(undefined, 'array'));
      workspace.root.get('array').push(PropertyFactory.create(ChildTemplate.typeid));
      workspace.root.get('array').push(PropertyFactory.create(ReferenceParentTemplate.typeid));
      workspace.root.get('array').push(PropertyFactory.create('NodeProperty'));
      workspace.root.get('array').push(PropertyFactory.create(ChildTemplate.typeid));

      var reference = workspace.root.get(['array', 1, 'single_ref'],
        RESOLVE_NEVER);
      workspace.root.get(['array', 2]).insert('ref', PropertyFactory.create('Reference'));
      var reference2 = workspace.root.get(['array', 2, 'ref'],
        RESOLVE_NEVER);

      reference.setValue('/array[0]');
      workspace.root.get(['array', 0, 'text']).setValue('changed');
      expect(referenceModifySpy.mock.calls.length).toEqual(1);

      referenceModifySpy.mockClear();

      // When a reference is changed a modification should no longer result
      // in a modify event
      workspace.pushNotificationDelayScope();
      reference.setValue('/array[3]');
      workspace.root.get(['array', 0, 'text']).setValue('changed2');
      workspace.popNotificationDelayScope();
      expect(referenceModifySpy.mock.calls.length).toEqual(0);

      reference2.setValue('/array[0]');
      reference.setValue('/array[2].ref');
      expect(referenceModifySpy.mock.calls.length).toEqual(0);

      // This should also work for chained references
      workspace.pushNotificationDelayScope();
      reference.setValue('/array[3]');
      workspace.root.get(['array', 0, 'text']).setValue('changed3');
      workspace.popNotificationDelayScope();
      expect(referenceModifySpy.mock.calls.length).toEqual(0);

      // This should also work and for multi-hop references
      reference.setValue('/array[2]');
      reference2.setValue('/array[0]');
      workspace.pushNotificationDelayScope();
      reference2.setValue('/array[3]');
      workspace.root.get(['array', 0, 'text']).setValue('changed4');
      workspace.popNotificationDelayScope();
      expect(referenceModifySpy.mock.calls.length).toEqual(0);

      // And when removing the referencing property
      reference.setValue('/array[2]');
      reference2.setValue('/array[0]');
      workspace.pushNotificationDelayScope();
      workspace.root.get(['array', 2]).remove('ref');
      workspace.root.get(['array', 0, 'text']).setValue('changed5');
      workspace.popNotificationDelayScope();
      expect(referenceModifySpy.mock.calls.length).toEqual(0);

      // Or when inserting the referencing property
      reference.setValue('/array[2]');
      workspace.pushNotificationDelayScope();
      workspace.root.get(['array', 2]).insert('ref', PropertyFactory.create('Reference', undefined, '/array[3]'));
      workspace.root.get(['array', 3, 'text']).setValue('changed6');
      workspace.popNotificationDelayScope();
      expect(referenceModifySpy.mock.calls.length).toEqual(0);
    });

    it('should trigger referenceChanged events correctly', function() {
      // Add the reference parent pset
      var referenceParentPSet = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');

      // Add our child (referenced) pset
      var childPset1 = PropertyFactory.create(ChildTemplate.typeid, 'single');
      var childPset2 = PropertyFactory.create(ChildTemplate.typeid, 'single');

      // we have to do this externally because the PropertyTree would eat our exception from the spy
      var invalidProperty = false;
      var referenceChangedSpy = jest.fn(function(in_referenceChangedContext) {
      });
      var propertySpy = jest.fn(function(in_property) {
        if (!in_property) {
          invalidProperty = true;
        }
      });
      var referenceBoundSpy = jest.fn(function(in_modificationContext) {
        // console.log(in_modificationContext);
      });
      var invalidReferenceChangedSpy = jest.fn();
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

      workspace.root.insert('myChild1', childPset1);
      workspace.root.insert('myChild2', childPset2);

      // Most basic case, insert with an already valid reference
      expect(referenceChangedSpy).toHaveBeenCalledTimes(0);
      referenceParentPSet.get('single_ref', RESOLVE_NEVER)
        .setValue('/myChild1');
      workspace.root.insert('myReferenceParent', referenceParentPSet);
      expect(referenceChangedSpy).toHaveBeenCalledTimes(1);
      referenceChangedSpy.mockClear();
      expect(referenceBoundSpy).toHaveBeenCalledTimes(1);
      referenceBoundSpy.mockClear();

      // This should not trigger
      childPset1.get('text').setValue('newText');
      expect(referenceChangedSpy).toHaveBeenCalledTimes(0);
      expect(referenceBoundSpy).toHaveBeenCalledTimes(0);
      // Remove our referenced node: this should trigger the referenceChange spy
      workspace.root.remove('myChild1');
      expect(referenceChangedSpy).toHaveBeenCalledTimes(1);
      referenceChangedSpy.mockClear();
      expect(referenceBoundSpy).toHaveBeenCalledTimes(0);
      // Reinsert our referenced node: this  should also trigger the referenceChange spy
      workspace.root.insert('myChild1', childPset1);
      expect(referenceChangedSpy).toHaveBeenCalledTimes(1);
      referenceChangedSpy.mockClear();
      expect(referenceBoundSpy).toHaveBeenCalledTimes(0);
      // Change the reference value, this should trigger both valid spies
      referenceParentPSet.get('single_ref', RESOLVE_NEVER)
        .setValue('/myChild2');
      expect(referenceChangedSpy).toHaveBeenCalledTimes(2); // remove the old, insert the new
      referenceChangedSpy.mockClear();
      expect(referenceBoundSpy).toHaveBeenCalledTimes(1);
      referenceBoundSpy.mockClear();
      workspace.root.remove('myReferenceParent');
      expect(referenceChangedSpy).toHaveBeenCalledTimes(1);
      referenceChangedSpy.mockClear();
      expect(referenceBoundSpy).toHaveBeenCalledTimes(1);
      referenceBoundSpy.mockClear();
      // Change the reference value, this should not trigger anything because it's not in the workspace
      referenceParentPSet.get('single_ref', RESOLVE_NEVER)
        .setValue('/invalid');
      expect(referenceChangedSpy).toHaveBeenCalledTimes(0);
      expect(referenceBoundSpy).toHaveBeenCalledTimes(0);
      // reinsert with an invalid reference -> the ref. path is already undefined, it won't trigger referenceChanged
      workspace.root.insert('myReferenceParent', referenceParentPSet);
      expect(referenceChangedSpy).toHaveBeenCalledTimes(0);
      // but should trigger the reference bound spy
      expect(referenceBoundSpy).toHaveBeenCalledTimes(1);
      referenceBoundSpy.mockClear();

      // this should never be called as it relates to an invalid property path
      expect(invalidReferenceChangedSpy).toHaveBeenCalledTimes(0);
      // this should not have been changed to true
      expect(invalidProperty).toEqual(false);
    });

    it('should be able to bind the same callback to reference *or* referenced modify events', function() {
      // Add the reference parent pset
      var referenceParentPSet = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');

      // Add our child (referenced) pset
      var childPset1 = PropertyFactory.create(ChildTemplate.typeid, 'single');
      var childPset2 = PropertyFactory.create(ChildTemplate.typeid, 'single');

      var referenceSpy = jest.fn(function(in_modificationContext) {
        //          console.log(in_modificationContext);
      });
      ParentDataBinding.registerOnPath('single_ref', ['modify'], referenceSpy);
      ParentDataBinding.registerOnPath('single_ref', ['referenceModify'], referenceSpy);

      // Register the DataBinding
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding);
      dataBinder.register('BINDING', NodeContainerTemplate.typeid, ParentDataBinding);

      workspace.root.insert('myChild1', childPset1);
      workspace.root.insert('myChild2', childPset2);

      // Most basic case, insert with an already valid reference
      expect(referenceSpy).toHaveBeenCalledTimes(0);
      referenceParentPSet.get('single_ref', RESOLVE_NEVER)
        .setValue('/myChild1');
      workspace.root.insert('myReferenceParent', referenceParentPSet);
      // should not trigger as we only listen to modify events
      expect(referenceSpy).toHaveBeenCalledTimes(0);

      // Change the referenced Property: this should trigger
      childPset1.get('text').setValue('newText');
      expect(referenceSpy).toHaveBeenCalledTimes(1);
      referenceSpy.mockClear();

      // Remove the referenced Property: this should not trigger
      workspace.root.remove('myChild1');
      expect(referenceSpy).toHaveBeenCalledTimes(0);

      // Reinsert the referenced Property: this  should not trigger either
      workspace.root.insert('myChild1', childPset1);
      expect(referenceSpy).toHaveBeenCalledTimes(0);

      // Remove the reference: this should not trigger
      workspace.root.remove('myReferenceParent');
      expect(referenceSpy).toHaveBeenCalledTimes(0);

      // Reinsert the reference: this should not trigger
      workspace.root.insert('myReferenceParent', referenceParentPSet);
      expect(referenceSpy).toHaveBeenCalledTimes(0);

      // Change the reference to something else -> should trigger
      referenceParentPSet.get('single_ref', RESOLVE_NEVER)
        .setValue('/myChild2');
      expect(referenceSpy).toHaveBeenCalledTimes(1);
      referenceSpy.mockClear();

      // Remove the reference again, and set it to an invalid path, should not trigger
      workspace.root.remove('myReferenceParent');
      referenceParentPSet.get('single_ref', RESOLVE_NEVER)
        .setValue('/invalid');
      expect(referenceSpy).toHaveBeenCalledTimes(0);

      // reinsert again (with invalid path), should not trigger
      workspace.root.insert('myReferenceParent', referenceParentPSet);
      expect(referenceSpy).toHaveBeenCalledTimes(0);

      // set it to a valid path -> should trigger
      referenceParentPSet.get('single_ref', RESOLVE_NEVER)
        .setValue('/myChild2');
      expect(referenceSpy).toHaveBeenCalledTimes(1);
      referenceSpy.mockClear();

      // Change the value of the referenced -> should trigger
      childPset2.get('text').setValue('newText');
      expect(referenceSpy).toHaveBeenCalledTimes(1);
      referenceSpy.mockClear();
    });

    it('should be able to bind to the general Reference typeid', function() {
      // Add the reference parent pset
      var referenceParentPSet = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');

      // Register the DataBinding to the Reference
      var regKey = dataBinder.register('BINDING', 'Reference', ParentDataBinding);

      // Most basic case, insert with an already valid reference
      expect(dataBinder._dataBindingCreatedCounter).toEqual(0);
      workspace.root.insert('myReferenceParent', referenceParentPSet);
      expect(dataBinder._dataBindingCreatedCounter).toEqual(7);  // seven types of references in ReferenceParentTemplate
      dataBinder._resetDebugCounters();
      workspace.root.remove('myReferenceParent');
      // now unregister for 'Reference' and register for 'array<Reference>'
      regKey.destroy();
      dataBinder.register('BINDING', 'array<Reference>', ParentDataBinding);
      // reinsert pset
      workspace.root.insert('myReferenceParent', referenceParentPSet);
      expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
    });

    it('should have basic support for maps of references', function() {
      // Add the reference parent pset
      var referenceParentPSet = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');

      // Add our child (referenced) pset
      var childPset1 = PropertyFactory.create(ChildTemplate.typeid, 'single');
      var childPset2 = PropertyFactory.create(ChildTemplate.typeid, 'single');

      var referenceInsertSpy = jest.fn();
      var referenceModifySpy = jest.fn();
      var referenceRemoveSpy = jest.fn();
      ParentDataBinding.registerOnPath('map_ref[one].text', ['insert'], referenceInsertSpy);
      ParentDataBinding.registerOnPath('map_ref[one].text', ['modify'], referenceModifySpy);
      ParentDataBinding.registerOnPath('map_ref[one].text', ['remove'], referenceRemoveSpy);

      var refChangedError = false;
      var referenceChangedSpy = jest.fn(function(in_referenceChangedContext) {
        var prop = in_referenceChangedContext.getProperty();
        // have to do it this way because the PropertyTree swallows exceptions in callbacks :(
        if (prop) {
          if (!PropertyFactory.instanceOf(prop, 'String', 'single')) {
            refChangedError = true;
          }
        }
      });
      ParentDataBinding.registerOnPath('map_ref[one].text', ['referenceChanged'], referenceChangedSpy,
        { requireProperty: true });

      var mapInsertSpy = jest.fn();
      var mapModifySpy = jest.fn();
      var mapRemoveSpy = jest.fn();
      ParentDataBinding.registerOnPath('map_ref', ['collectionInsert'], mapInsertSpy);
      ParentDataBinding.registerOnPath('map_ref', ['collectionModify'], mapModifySpy);
      ParentDataBinding.registerOnPath('map_ref', ['collectionRemove'], mapRemoveSpy);

      var otherReferenceInsertSpy = jest.fn();
      var otherReferenceModifySpy = jest.fn();
      var otherReferenceRemoveSpy = jest.fn();
      ParentDataBinding.registerOnPath('map_ref[three].text', ['insert'], otherReferenceInsertSpy);
      ParentDataBinding.registerOnPath('map_ref[three].text', ['modify'], otherReferenceModifySpy);
      ParentDataBinding.registerOnPath('map_ref[three].text', ['remove'], otherReferenceRemoveSpy);

      // Register the DataBinding
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding);
      dataBinder.register('BINDING', NodeContainerTemplate.typeid, ParentDataBinding);

      workspace.root.insert('myChild1', childPset1);
      workspace.root.insert('myChild2', childPset2);
      workspace.root.insert('myReferenceParent', referenceParentPSet);
      expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
      dataBinder._resetDebugCounters();
      const parentDataBinding = dataBinder.resolve(referenceParentPSet, 'BINDING');

      var referenceMap = referenceParentPSet.get('map_ref');
      referenceMap.insert('one');
      referenceMap.insert('two');
      referenceMap.insert('three');
      referenceMap.insert('four', '');
      expect(mapInsertSpy).toHaveBeenCalledTimes(4);
      mapInsertSpy.mockClear();
      referenceMap.insert('ten');
      expect(mapInsertSpy).toHaveBeenCalledTimes(1);
      mapInsertSpy.mockClear();
      expect(parentDataBinding.onModify).toHaveBeenCalledTimes(5);
      parentDataBinding.onModify.mockClear();
      referenceMap.remove('ten');
      expect(mapRemoveSpy).toHaveBeenCalledTimes(1);
      mapRemoveSpy.mockClear();

      referenceMap.setValue('one', '/myChild1');
      // The reference insert will be fired
      expect(referenceInsertSpy).toHaveBeenCalledTimes(1);
      referenceInsertSpy.mockClear();

      // this should also trigger the referenceChanged spy
      expect(referenceChangedSpy).toHaveBeenCalledTimes(1);
      referenceChangedSpy.mockClear();
      referenceMap.setValue('three', '/myChild2');
      expect(mapModifySpy).toHaveBeenCalledTimes(2);
      mapModifySpy.mockClear();

      // should trigger the modify spy
      childPset1.get('text').setValue('fortytwo');
      expect(referenceModifySpy).toHaveBeenCalledTimes(1);
      referenceModifySpy.mockClear();
      // should trigger the remove spy
      workspace.root.remove('myChild1');
      expect(referenceRemoveSpy).toHaveBeenCalledTimes(1);
      referenceRemoveSpy.mockClear();
      // this should also trigger the referenceChanged spy
      expect(referenceChangedSpy).toHaveBeenCalledTimes(1);
      referenceChangedSpy.mockClear();
      // should trigger the insert spy
      workspace.root.insert('myChild1', childPset1);
      expect(referenceInsertSpy).toHaveBeenCalledTimes(1);
      referenceInsertSpy.mockClear();
      // this should also trigger the referenceChanged spy
      expect(referenceChangedSpy).toHaveBeenCalledTimes(1);
      referenceChangedSpy.mockClear();

      otherReferenceInsertSpy.mockClear();
      otherReferenceModifySpy.mockClear();
      otherReferenceRemoveSpy.mockClear();

      // should trigger the modify spy
      childPset2.get('text').setValue('fortytwo');
      expect(otherReferenceModifySpy).toHaveBeenCalledTimes(1);
      otherReferenceModifySpy.mockClear();
      // should trigger the remove spy
      workspace.root.remove('myChild2');
      expect(otherReferenceRemoveSpy).toHaveBeenCalledTimes(1);
      otherReferenceRemoveSpy.mockClear();
      // should trigger the insert spy
      workspace.root.insert('myChild2', childPset2);
      expect(otherReferenceInsertSpy).toHaveBeenCalledTimes(1);
      otherReferenceInsertSpy.mockClear();
      // should still trigger the original modify spy
      childPset1.get('text').setValue('42');
      expect(referenceModifySpy).toHaveBeenCalledTimes(1);
      referenceModifySpy.mockClear();
      // but not the other one
      expect(otherReferenceModifySpy).toHaveBeenCalledTimes(0);

      // Change the reference value, this should trigger the collectionModify,
      // referenceInsert and referenceRemoved spies
      referenceMap.setValue('one', '/myChild2');
      expect(mapModifySpy).toHaveBeenCalledTimes(1);
      mapModifySpy.mockClear();
      expect(referenceChangedSpy).toHaveBeenCalledTimes(2);
      referenceChangedSpy.mockClear();

      // now modifying under child2 should trigger both referenceModify spies
      childPset2.get('text').setValue('42');
      expect(referenceModifySpy).toHaveBeenCalledTimes(1);
      referenceModifySpy.mockClear();
      expect(otherReferenceModifySpy).toHaveBeenCalledTimes(1);
      otherReferenceModifySpy.mockClear();

      expect(refChangedError).toEqual(false);
    });

    it('should handle a chain of references to a primitive that begins with a map of references', function() {

      var referenceInsertSpy = [];
      var referenceModifySpy = [];
      var referenceRemoveSpy = [];
      var i;
      for (i = 0; i < 4; ++i) {
        referenceInsertSpy[i] = jest.fn();
        referenceModifySpy[i] = jest.fn();
        referenceRemoveSpy[i] = jest.fn();
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
      workspace.root.insert('myReferenceParent', referenceParentPSet);

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
        expect(referenceInsertSpy[i]).toHaveBeenCalledTimes(0);
      }
      workspace.root.insert('myString', PropertyFactory.create('String', 'single'));
      for (i = 0; i < 3; ++i) {
        expect(referenceInsertSpy[i]).toHaveBeenCalledTimes(1);
        referenceInsertSpy[i].mockClear();
      }

      // this should trigger the modify handler in all refs
      for (i = 0; i < 3; ++i) {
        expect(referenceModifySpy[i]).toHaveBeenCalledTimes(0);
      }
      workspace.root.get('myString').setValue('hello');
      for (i = 0; i < 3; ++i) {
        expect(referenceModifySpy[i]).toHaveBeenCalledTimes(1);
        referenceModifySpy[i].mockClear();
      }

      // this should trigger the remove handler in all refs
      for (i = 0; i < 3; ++i) {
        expect(referenceRemoveSpy[i]).toHaveBeenCalledTimes(0);
      }
      workspace.root.remove('myString');
      for (i = 0; i < 3; ++i) {
        expect(referenceRemoveSpy[i]).toHaveBeenCalledTimes(1);
        referenceRemoveSpy[i].mockClear();
      }
      workspace.root.insert('myString', PropertyFactory.create('String', 'single'));

      // Check whether modifying the references works
      workspace.root.insert('myString2', PropertyFactory.create('String', 'single', 'string2'));
      referenceParentPSet.get('ref3', RESOLVE_NEVER)
        .setValue('/myString2');
      referenceParentPSet.get('ref1', RESOLVE_NEVER)
        .setValue('/myReferenceParent.ref3');

      // The old handler should no longer trigger
      workspace.root.get('myString').setValue('hello2');
      var handlers = [0, 1, 3];
      for (i = 0; i < handlers.length; i++) {
        expect(referenceModifySpy[handlers[i]]).toHaveBeenCalledTimes(0);
        referenceModifySpy[handlers[i]].mockClear();
      }
      // ref2 still points to /myString so it should trigger
      expect(referenceModifySpy[2]).toHaveBeenCalledTimes(1);
      referenceModifySpy[2].mockClear();

      // The new handler should now trigger instead
      workspace.root.get('myString2').setValue('hello2');
      for (i = 0; i < handlers.length; i++) {
        expect(referenceModifySpy[handlers[i]]).toHaveBeenCalledTimes(1);
        referenceModifySpy[handlers[i]].mockClear();
      }
      // ref2 still points to /myString so it should not trigger
      expect(referenceModifySpy[2]).toHaveBeenCalledTimes(0);
      referenceModifySpy[2].mockClear();
    });

    // TODO: fix previously working test
    it.skip('should handle a chain of references that has a map of refs. in the middle (LYNXDEV-4228)', function() {

      var referenceInsertSpy = [];
      var referenceModifySpy = [];
      var referenceRemoveSpy = [];
      var i;
      for (i = 0; i < 4; ++i) {
        referenceInsertSpy[i] = jest.fn();
        referenceModifySpy[i] = jest.fn();
        referenceRemoveSpy[i] = jest.fn();
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
      workspace.root.insert('myReferenceParent', referenceParentPSet);

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
        expect(referenceInsertSpy[i]).toHaveBeenCalledTimes(0);
      }
      workspace.root.insert('myString', PropertyFactory.create('String', 'single'));
      for (i = 0; i < 3; ++i) {
        expect(referenceInsertSpy[i]).toHaveBeenCalledTimes(1);
        referenceInsertSpy[i].mockClear();
      }

      // this should trigger the modify handler in all refs
      for (i = 0; i < 3; ++i) {
        expect(referenceModifySpy[i]).toHaveBeenCalledTimes(0);
      }
      workspace.root.get('myString').setValue('hello');
      for (i = 0; i < 3; ++i) {
        expect(referenceModifySpy[i]).toHaveBeenCalledTimes(1);
        referenceModifySpy[i].mockClear();
      }

      // this should trigger the remove handler in all refs
      for (i = 0; i < 3; ++i) {
        expect(referenceRemoveSpy[i]).toHaveBeenCalledTimes(0);
      }
      workspace.root.remove('myString');
      for (i = 0; i < 3; ++i) {
        expect(referenceRemoveSpy[i]).toHaveBeenCalledTimes(1);
        referenceRemoveSpy[i].mockClear();
      }
      workspace.root.insert('myString', PropertyFactory.create('String', 'single'));

      // Check whether modifying the references works
      workspace.root.insert('myString2', PropertyFactory.create('String', 'single', 'string2'));
      referenceParentPSet.get('ref3', RESOLVE_NEVER)
        .setValue('/myString2');
      referenceParentPSet.get('ref1', RESOLVE_NEVER)
        .setValue('/myReferenceParent.ref3');

      // The old handler should no longer trigger
      workspace.root.get('myString').setValue('hello2');
      var handlers = [0, 1, 3];
      for (i = 0; i < handlers.length; i++) {
        expect(referenceModifySpy[handlers[i]]).toHaveBeenCalledTimes(0);
        referenceModifySpy[handlers[i]].mockClear();
      }
      // ref2 still points to /myString so it should trigger
      expect(referenceModifySpy[2]).toHaveBeenCalledTimes(1);
      referenceModifySpy[2].mockClear();

      // The new handler should now trigger instead
      workspace.root.get('myString2').setValue('hello2');
      for (i = 0; i < handlers.length; i++) {
        expect(referenceModifySpy[handlers[i]]).toHaveBeenCalledTimes(1);
        referenceModifySpy[handlers[i]].mockClear();
      }
      // ref2 still points to /myString so it should not trigger
      expect(referenceModifySpy[2]).toHaveBeenCalledTimes(0);
      referenceModifySpy[2].mockClear();
    });

    it('should be able to modify multi-hop references that begins with a map of references', function() {
      // Add the reference parent pset
      var referenceParentPSet = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');
      var referenceParentPSet2 = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');
      var nodeParentPSet = PropertyFactory.create(NodeContainerTemplate.typeid, 'single');
      var nodeParentPSet2 = PropertyFactory.create(NodeContainerTemplate.typeid, 'single');

      // Add our child (referenced) pset
      var childPset1 = PropertyFactory.create(ChildTemplate.typeid, 'single');
      var childPset2 = PropertyFactory.create(ChildTemplate.typeid, 'single');

      var referenceInsertSpy = jest.fn(function(in_modificationContext) {
        var prop = in_modificationContext.getProperty();
        expect(PropertyFactory.instanceOf(prop, 'String', 'single')).toEqual(true);
      });
      var referenceModifySpy = jest.fn(function(in_modificationContext) {
        var prop = in_modificationContext.getProperty();
        expect(PropertyFactory.instanceOf(prop, 'String', 'single')).toEqual(true);
      });
      var referenceRemoveSpy = jest.fn();
      ParentDataBinding.registerOnPath('single_ref.text', ['insert'], referenceInsertSpy);
      ParentDataBinding.registerOnPath('single_ref.text', ['modify'], referenceModifySpy);
      ParentDataBinding.registerOnPath('single_ref.text', ['remove'], referenceRemoveSpy);

      var doubleReferenceInsertSpy = jest.fn(function(in_modificationContext) {
        var prop = in_modificationContext.getProperty();
        expect(PropertyFactory.instanceOf(prop, 'String', 'single')).toEqual(true);
      });
      var doubleReferenceModifySpy = jest.fn(function(in_modificationContext) {
        var prop = in_modificationContext.getProperty();
        expect(PropertyFactory.instanceOf(prop, 'String', 'single')).toEqual(true);
      });
      var doubleReferenceRemoveSpy = jest.fn();
      var doubleReferenceRefChangedSpy = jest.fn();
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
      var runTests = function(in_increment, in_refChangedCount) {
        expect(doubleReferenceRefChangedSpy).toHaveBeenCalledTimes(in_refChangedCount);
        // We should have a property if 'to' is defined
        expect(!!doubleReferenceRefChangedSpy.mock.calls[0][0].getProperty()).toEqual(!!to);
        if (to) {
          expect(doubleReferenceRefChangedSpy.mock.calls[0][0].getProperty().getAbsolutePath()).toEqual(to);
        }
        if (in_refChangedCount === 1) {
          var dummy = from;
          from = to;
          to = dummy;
        }

        expect(doubleReferenceModifySpy).toHaveBeenCalledTimes(0);
        childPset1.get('text').setValue('newText' + (incCounter++));
        expect(doubleReferenceModifySpy).toHaveBeenCalledTimes(in_increment);
        // this should not trigger the referenceChanged handler
        expect(doubleReferenceRefChangedSpy).toHaveBeenCalledTimes(in_refChangedCount);

        // This should trigger the remove handler
        expect(doubleReferenceRemoveSpy).toHaveBeenCalledTimes(in_refChangedCount - in_increment);
        doubleReferenceRemoveSpy.mockClear();
        workspace.root.remove('myChild1');
        expect(doubleReferenceRemoveSpy).toHaveBeenCalledTimes(in_increment);

        // This should trigger the insert handler
        // It will already have been called once when the reference became valid
        expect(doubleReferenceInsertSpy).toHaveBeenCalledTimes(in_increment);
        workspace.root.insert('myChild1', childPset1);
        expect(doubleReferenceInsertSpy).toHaveBeenCalledTimes(2 * in_increment);

        expect(doubleReferenceRefChangedSpy).toHaveBeenCalledTimes(in_refChangedCount + 2 * in_increment);
        doubleReferenceInsertSpy.mockClear();
        doubleReferenceModifySpy.mockClear();
        doubleReferenceRemoveSpy.mockClear();
        doubleReferenceRefChangedSpy.mockClear();
      };

      workspace.root.insert('myChild1', childPset1);
      workspace.root.insert('myChild2', childPset2);

      // Create a second parent
      referenceParentPSet2.get('single_ref', RESOLVE_NEVER)
        .setValue('/myChild1');
      workspace.root.insert('myReferenceParent2', referenceParentPSet2);

      // We insert with an already valid reference
      var mapRef = referenceParentPSet.get('map_ref');
      mapRef.insert('a', '/myReferenceParent2');
      workspace.root.insert('myReferenceParent', referenceParentPSet);

      // This should trigger the modify on the reference property
      runTests(1, 1);

      // This should unbind the tests
      workspace.root.remove('myReferenceParent');
      runTests(0, 1);

      // Restore the references
      workspace.root.insert('myReferenceParent', referenceParentPSet);
      runTests(1, 1);

      // Changing the reference should unbind all tests again
      mapRef.setValue('a', '/invalid_ref_value');
      runTests(0, 1);

      // Restore the references
      mapRef.setValue('a', '/myReferenceParent2');
      runTests(1, 1);

      // Now delete the node in the middle of the reference chain
      workspace.root.remove('myReferenceParent2');
      runTests(0, 1);

      // Restore the references
      workspace.root.insert('myReferenceParent2', referenceParentPSet2);
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
      workspace.root.remove('myReferenceParent2', referenceParentPSet2);
      workspace.root.remove('myReferenceParent', referenceParentPSet);
      workspace.root.insert('myReferenceParent2', nodeParentPSet2);
      workspace.root.insert('myReferenceParent', nodeParentPSet);
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

    it('should not call callbacks for removed refs in a map of references', function() {
      // Add the reference parent pset
      var referenceParentPSet = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');

      // Add our child (referenced) pset
      var childPset1 = PropertyFactory.create(ChildTemplate.typeid, 'single');
      var childPset2 = PropertyFactory.create(ChildTemplate.typeid, 'single');

      var referenceInsertSpy = jest.fn();
      var referenceModifySpy = jest.fn();
      var referenceRemoveSpy = jest.fn();
      ParentDataBinding.registerOnPath('map_ref[a].text', ['insert'], referenceInsertSpy);
      ParentDataBinding.registerOnPath('map_ref[a].text', ['modify'], referenceModifySpy);
      ParentDataBinding.registerOnPath('map_ref[a].text', ['remove'], referenceRemoveSpy);

      var refChangedError = false;
      var referenceChangedSpy = jest.fn(function(in_referenceChangedContext) {
        var prop = in_referenceChangedContext.getProperty();
        // have to do it this way because the PropertyTree swallows exceptions in callbacks :(
        if (prop) {
          if (!PropertyFactory.instanceOf(prop, 'String', 'single')) {
            refChangedError = true;
          }
        }
      });
      ParentDataBinding.registerOnPath('map_ref[a].text', ['referenceChanged'], referenceChangedSpy);

      var mapInsertSpy = jest.fn();
      var mapModifySpy = jest.fn();
      var mapRemoveSpy = jest.fn();
      ParentDataBinding.registerOnPath('map_ref', ['collectionInsert'], mapInsertSpy);
      ParentDataBinding.registerOnPath('map_ref', ['collectionModify'], mapModifySpy);
      ParentDataBinding.registerOnPath('map_ref', ['collectionRemove'], mapRemoveSpy);

      // Register the DataBinding
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding);
      dataBinder.register('BINDING', NodeContainerTemplate.typeid, ParentDataBinding);

      workspace.root.insert('myChild1', childPset1);
      workspace.root.insert('myChild2', childPset2);
      workspace.root.insert('myReferenceParent', referenceParentPSet);
      expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
      dataBinder._resetDebugCounters();
      const parentDataBinding = dataBinder.resolve(referenceParentPSet, 'BINDING');

      var referenceMap = referenceParentPSet.get('map_ref');
      referenceMap.insert('a');
      expect(mapInsertSpy).toHaveBeenCalledTimes(1);
      mapInsertSpy.mockClear();
      expect(parentDataBinding.onModify).toHaveBeenCalledTimes(1);
      parentDataBinding.onModify.mockClear();

      referenceMap.setValue('a', '/myChild1');
      // this should trigger the referenceChanged spy
      expect(referenceChangedSpy).toHaveBeenCalledTimes(1);
      expect(referenceChangedSpy.mock.calls[0][0].getProperty().getAbsolutePath()).toEqual('/myChild1.text');
      referenceChangedSpy.mockClear();

      // should also trigger the modify spy
      childPset1.get('text').setValue('fortytwo');
      expect(referenceModifySpy).toHaveBeenCalledTimes(1);
      referenceModifySpy.mockClear();
      // set our reference to empty
      referenceMap.setValue('a', '');
      // the modify spy should not be triggered anymore
      childPset1.get('text').setValue('sixtyfour');
      expect(referenceModifySpy).toHaveBeenCalledTimes(0);
      // this should also trigger the referenceChanged spy
      expect(referenceChangedSpy).toHaveBeenCalledTimes(1);
      expect(referenceChangedSpy.mock.calls[0][0].getProperty()).toBeUndefined();
      referenceChangedSpy.mockClear();
      // set it to an invalid value
      referenceMap.setValue('a', '/invalid');
      // this should not trigger the referenceChanged spy since it's still undefined
      expect(referenceChangedSpy).toHaveBeenCalledTimes(0);
      referenceChangedSpy.mockClear();
      expect(referenceModifySpy).toHaveBeenCalledTimes(0);
      // set back to valid
      referenceMap.setValue('a', '/myChild1');
      // this should also trigger the referenceChanged spy
      expect(referenceChangedSpy).toHaveBeenCalledTimes(1);
      expect(referenceChangedSpy.mock.calls[0][0].getProperty().getAbsolutePath()).toEqual('/myChild1.text');
      referenceChangedSpy.mockClear();
      // but not the modified spy
      expect(referenceModifySpy).toHaveBeenCalledTimes(0);
      // now remove (triggers a different code path than just setting it empty)
      referenceMap.remove('a');
      // this should also trigger the referenceChanged spy
      expect(referenceChangedSpy).toHaveBeenCalledTimes(1);
      expect(referenceChangedSpy.mock.calls[0][0].getProperty()).toBeUndefined();
      referenceChangedSpy.mockClear();
      // but not the modified spy
      expect(referenceModifySpy).toHaveBeenCalledTimes(0);
      // the modify spy should not be triggered anymore
      childPset1.get('text').setValue('sixtyfour-sixtyfour');
      expect(referenceModifySpy).toHaveBeenCalledTimes(0);
      expect(referenceChangedSpy).toHaveBeenCalledTimes(0);

      expect(refChangedError).toEqual(false);
    });

    it('should have basic support for an array of references', function() {
      // Add the reference parent pset
      var referenceParentPSet = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');

      // Add our child (referenced) pset
      var childPset1 = PropertyFactory.create(ChildTemplate.typeid, 'single');
      var childPset2 = PropertyFactory.create(ChildTemplate.typeid, 'single');

      var referenceInsertSpy = jest.fn();
      var referenceModifySpy = jest.fn();
      var referenceRemoveSpy = jest.fn();
      ParentDataBinding.registerOnPath('array_ref[0].text', ['insert'], referenceInsertSpy);
      ParentDataBinding.registerOnPath('array_ref[0].text', ['modify'], referenceModifySpy);
      ParentDataBinding.registerOnPath('array_ref[0].text', ['remove'], referenceRemoveSpy);

      var refChangedError = false;
      var referenceChangedSpy = jest.fn(function(in_referenceChangedContext) {
        var prop = in_referenceChangedContext.getProperty();
        // have to do it this way because the PropertyTree swallows exceptions in callbacks :(
        if (prop) {
          if (!PropertyFactory.instanceOf(prop, 'String', 'single')) {
            refChangedError = true;
          }
        }
      });
      ParentDataBinding.registerOnPath('array_ref[0].text', ['referenceChanged'], referenceChangedSpy);

      var arrayInsertSpy = jest.fn();
      var arrayModifySpy = jest.fn();
      var arrayRemoveSpy = jest.fn();
      ParentDataBinding.registerOnPath('array_ref', ['collectionInsert'], arrayInsertSpy);
      ParentDataBinding.registerOnPath('array_ref', ['collectionModify'], arrayModifySpy);
      ParentDataBinding.registerOnPath('array_ref', ['collectionRemove'], arrayRemoveSpy);

      // register these later to make sure we're modifying the right reference property objects in the prototype
      var otherReferenceInsertSpy = jest.fn();
      var otherReferenceModifySpy = jest.fn();
      var otherReferenceRemoveSpy = jest.fn();
      ParentDataBinding.registerOnPath('array_ref[2].text', ['insert'], otherReferenceInsertSpy);
      ParentDataBinding.registerOnPath('array_ref[2].text', ['modify'], otherReferenceModifySpy);
      ParentDataBinding.registerOnPath('array_ref[2].text', ['remove'], otherReferenceRemoveSpy);

      // Register the DataBinding
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding);
      dataBinder.register('BINDING', NodeContainerTemplate.typeid, ParentDataBinding);

      workspace.root.insert('myChild1', childPset1);
      workspace.root.insert('myChild2', childPset2);
      workspace.root.insert('myReferenceParent', referenceParentPSet);
      expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
      dataBinder._resetDebugCounters();
      const parentDataBinding = dataBinder.resolve(referenceParentPSet, 'BINDING');

      var referenceArray = referenceParentPSet.get('array_ref');
      referenceArray.push();
      referenceArray.push();
      referenceArray.push();
      expect(arrayInsertSpy).toHaveBeenCalledTimes(3);
      arrayInsertSpy.mockClear();
      expect(parentDataBinding.onModify).toHaveBeenCalledTimes(3);
      parentDataBinding.onModify.mockClear();
      referenceArray.push();
      referenceArray.pop();
      expect(arrayInsertSpy).toHaveBeenCalledTimes(1);
      arrayInsertSpy.mockClear();
      expect(arrayRemoveSpy).toHaveBeenCalledTimes(1);
      arrayRemoveSpy.mockClear();

      referenceArray.set(0, '/myChild1');
      // The reference becoming valid makes the insert be called
      expect(referenceInsertSpy).toHaveBeenCalledTimes(1);
      referenceInsertSpy.mockClear();

      // this should also trigger the referenceChanged spy
      expect(referenceChangedSpy).toHaveBeenCalledTimes(1);
      referenceChangedSpy.mockClear();
      referenceArray.set(2, '/myChild2');
      // Reference became valid - insert was fired
      expect(otherReferenceInsertSpy).toHaveBeenCalledTimes(1);
      otherReferenceInsertSpy.mockClear();
      expect(arrayModifySpy).toHaveBeenCalledTimes(2);
      arrayModifySpy.mockClear();

      // should trigger the modify spy
      childPset1.get('text').setValue('fortytwo');
      expect(referenceModifySpy).toHaveBeenCalledTimes(1);
      referenceModifySpy.mockClear();
      // should trigger the remove spy
      workspace.root.remove('myChild1');
      expect(referenceRemoveSpy).toHaveBeenCalledTimes(1);
      referenceRemoveSpy.mockClear();
      // this should also trigger the referenceChanged spy
      expect(referenceChangedSpy).toHaveBeenCalledTimes(1);
      referenceChangedSpy.mockClear();
      // should trigger the insert spy
      workspace.root.insert('myChild1', childPset1);
      expect(referenceInsertSpy).toHaveBeenCalledTimes(1);
      referenceInsertSpy.mockClear();
      // this should also trigger the referenceChanged spy
      expect(referenceChangedSpy).toHaveBeenCalledTimes(1);
      referenceChangedSpy.mockClear();

      // should trigger the modify spy
      childPset2.get('text').setValue('fortytwo');
      expect(otherReferenceModifySpy).toHaveBeenCalledTimes(1);
      otherReferenceModifySpy.mockClear();
      // should trigger the remove spy
      workspace.root.remove('myChild2');
      expect(otherReferenceRemoveSpy).toHaveBeenCalledTimes(1);
      otherReferenceRemoveSpy.mockClear();
      // should trigger the insert spy
      workspace.root.insert('myChild2', childPset2);
      expect(otherReferenceInsertSpy).toHaveBeenCalledTimes(1);
      otherReferenceInsertSpy.mockClear();
      // should still trigger the original modify spy
      childPset1.get('text').setValue('42');
      expect(referenceModifySpy).toHaveBeenCalledTimes(1);
      referenceModifySpy.mockClear();
      // but not the other one
      expect(otherReferenceModifySpy).toHaveBeenCalledTimes(0);

      // Change the reference value, this should trigger both the collectionModify & referenceChanged spies
      referenceArray.set(0, '/myChild2');
      expect(arrayModifySpy).toHaveBeenCalledTimes(1);
      arrayModifySpy.mockClear();
      expect(referenceChangedSpy).toHaveBeenCalledTimes(2); // once for 'remove', once for 'insert'
      referenceChangedSpy.mockClear();

      // now modifying under child2 should trigger both referenceModify spies
      childPset2.get('text').setValue('42');
      expect(referenceModifySpy).toHaveBeenCalledTimes(1);
      referenceModifySpy.mockClear();
      expect(otherReferenceModifySpy).toHaveBeenCalledTimes(1);
      otherReferenceModifySpy.mockClear();

      expect(refChangedError).toEqual(false);
    });

    it('should handle a chain of references to a primitive that begins with an array of references', function() {

      var referenceInsertSpy = [];
      var referenceModifySpy = [];
      var referenceRemoveSpy = [];
      var i;
      for (i = 0; i < 4; ++i) {
        referenceInsertSpy[i] = jest.fn();
        referenceModifySpy[i] = jest.fn();
        referenceRemoveSpy[i] = jest.fn();
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
      workspace.root.insert('myReferenceParent', referenceParentPSet);

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
        expect(referenceInsertSpy[i]).toHaveBeenCalledTimes(0);
      }
      workspace.root.insert('myString', PropertyFactory.create('String', 'single'));
      for (i = 0; i < 3; ++i) {
        expect(referenceInsertSpy[i]).toHaveBeenCalledTimes(1);
        referenceInsertSpy[i].mockClear();
      }

      // this should trigger the modify handler in all refs
      for (i = 0; i < 3; ++i) {
        expect(referenceModifySpy[i]).toHaveBeenCalledTimes(0);
      }
      workspace.root.get('myString').setValue('hello');
      for (i = 0; i < 3; ++i) {
        expect(referenceModifySpy[i]).toHaveBeenCalledTimes(1);
        referenceModifySpy[i].mockClear();
      }

      // this should trigger the remove handler in all refs
      for (i = 0; i < 3; ++i) {
        expect(referenceRemoveSpy[i]).toHaveBeenCalledTimes(0);
      }
      workspace.root.remove('myString');
      for (i = 0; i < 3; ++i) {
        expect(referenceRemoveSpy[i]).toHaveBeenCalledTimes(1);
        referenceRemoveSpy[i].mockClear();
      }
      workspace.root.insert('myString', PropertyFactory.create('String', 'single'));

      // Check whether modifying the references works
      workspace.root.insert('myString2', PropertyFactory.create('String', 'single', 'string2'));
      referenceParentPSet.get('ref3', RESOLVE_NEVER)
        .setValue('/myString2');
      referenceParentPSet.get('ref1', RESOLVE_NEVER)
        .setValue('/myReferenceParent.ref3');

      // The old handler should no longer trigger
      workspace.root.get('myString').setValue('hello2');
      var handlers = [0, 1, 3];
      for (i = 0; i < handlers.length; i++) {
        expect(referenceModifySpy[handlers[i]]).toHaveBeenCalledTimes(0);
        referenceModifySpy[handlers[i]].mockClear();
      }
      // ref2 still points to /myString so it should trigger
      expect(referenceModifySpy[2]).toHaveBeenCalledTimes(1);
      referenceModifySpy[2].mockClear();

      // The new handler should now trigger instead
      workspace.root.get('myString2').setValue('hello2');
      for (i = 0; i < handlers.length; i++) {
        expect(referenceModifySpy[handlers[i]]).toHaveBeenCalledTimes(1);
        referenceModifySpy[handlers[i]].mockClear();
      }
      // ref2 still points to /myString so it should not trigger
      expect(referenceModifySpy[2]).toHaveBeenCalledTimes(0);
      referenceModifySpy[2].mockClear();
    });

    it('should be able to modify multi-hop references that begins with an array of references', function() {
      // Add the reference parent pset
      var referenceParentPSet = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');
      var referenceParentPSet2 = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');
      var nodeParentPSet = PropertyFactory.create(NodeContainerTemplate.typeid, 'single');
      var nodeParentPSet2 = PropertyFactory.create(NodeContainerTemplate.typeid, 'single');

      // Add our child (referenced) pset
      var childPset1 = PropertyFactory.create(ChildTemplate.typeid, 'single');
      var childPset2 = PropertyFactory.create(ChildTemplate.typeid, 'single');

      var referenceInsertSpy = jest.fn(function(in_modificationContext) {
        var prop = in_modificationContext.getProperty();
        expect(PropertyFactory.instanceOf(prop, 'String', 'single')).toEqual(true);
      });
      var referenceModifySpy = jest.fn(function(in_modificationContext) {
        var prop = in_modificationContext.getProperty();
        expect(PropertyFactory.instanceOf(prop, 'String', 'single')).toEqual(true);
      });
      var referenceRemoveSpy = jest.fn();
      ParentDataBinding.registerOnPath('single_ref.text', ['insert'], referenceInsertSpy);
      ParentDataBinding.registerOnPath('single_ref.text', ['modify'], referenceModifySpy);
      ParentDataBinding.registerOnPath('single_ref.text', ['remove'], referenceRemoveSpy);

      var doubleReferenceInsertSpy = jest.fn(function(in_modificationContext) {
        var prop = in_modificationContext.getProperty();
        expect(PropertyFactory.instanceOf(prop, 'String', 'single')).toEqual(true);
      });
      var doubleReferenceModifySpy = jest.fn(function(in_modificationContext) {
        var prop = in_modificationContext.getProperty();
        expect(PropertyFactory.instanceOf(prop, 'String', 'single')).toEqual(true);
      });
      var doubleReferenceRemoveSpy = jest.fn();
      var doubleReferenceRefChangedSpy = jest.fn();
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
      var runTests = function(in_increment, in_refChangedCount) {
        // We should have a property if 'to' is defined
        expect(!!doubleReferenceRefChangedSpy.mock.calls[0][0].getProperty()).toEqual(!!to);
        if (to) {
          expect(doubleReferenceRefChangedSpy.mock.calls[0][0].getProperty().getAbsolutePath()).toEqual(to);
        }
        if (in_refChangedCount === 1) {
          var dummy = from;
          from = to;
          to = dummy;
        }

        expect(doubleReferenceModifySpy).toHaveBeenCalledTimes(0);
        childPset1.get('text').setValue('newText' + (incCounter++));
        expect(doubleReferenceModifySpy).toHaveBeenCalledTimes(in_increment);
        // this should not trigger the referenceChanged handler
        expect(doubleReferenceRefChangedSpy).toHaveBeenCalledTimes(in_refChangedCount);

        // This should trigger the remove handler
        expect(doubleReferenceRemoveSpy).toHaveBeenCalledTimes(in_refChangedCount - in_increment);
        doubleReferenceRemoveSpy.mockClear();
        workspace.root.remove('myChild1');
        expect(doubleReferenceRemoveSpy).toHaveBeenCalledTimes(in_increment);

        // This should trigger the insert handler
        // It may have been called once when the insert reference became valid
        expect(doubleReferenceInsertSpy).toHaveBeenCalledTimes(in_increment);
        workspace.root.insert('myChild1', childPset1);
        expect(doubleReferenceInsertSpy).toHaveBeenCalledTimes(2 * in_increment);

        expect(doubleReferenceRefChangedSpy).toHaveBeenCalledTimes(in_refChangedCount + 2 * in_increment);
        doubleReferenceInsertSpy.mockClear();
        doubleReferenceModifySpy.mockClear();
        doubleReferenceRemoveSpy.mockClear();
        doubleReferenceRefChangedSpy.mockClear();
      };

      workspace.root.insert('myChild1', childPset1);
      workspace.root.insert('myChild2', childPset2);

      // Create a second parent
      referenceParentPSet2.get('single_ref', RESOLVE_NEVER)
        .setValue('/myChild1');
      workspace.root.insert('myReferenceParent2', referenceParentPSet2);

      // We insert with an already valid reference
      var arrayRef = referenceParentPSet.get('array_ref');
      arrayRef.push('/myReferenceParent2');
      workspace.root.insert('myReferenceParent', referenceParentPSet);

      // This should trigger the modify on the reference property
      runTests(1, 1);

      // This should unbind the tests
      workspace.root.remove('myReferenceParent');
      runTests(0, 1);

      // Restore the references
      workspace.root.insert('myReferenceParent', referenceParentPSet);
      runTests(1, 1);

      // Changing the reference should unbind all tests again
      arrayRef.set(0, '/invalid_ref_value');
      runTests(0, 1);

      // Restore the references
      arrayRef.set(0, '/myReferenceParent2');
      runTests(1, 1);

      // Now delete the node in the middle of the reference chain
      workspace.root.remove('myReferenceParent2');
      runTests(0, 1);

      // Restore the references
      workspace.root.insert('myReferenceParent2', referenceParentPSet2);
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
      workspace.root.remove('myReferenceParent2', referenceParentPSet2);
      workspace.root.remove('myReferenceParent', referenceParentPSet);
      workspace.root.insert('myReferenceParent2', nodeParentPSet2);
      workspace.root.insert('myReferenceParent', nodeParentPSet);
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

    it('should handle insert/remove below a rel. path cb in an array of references (LYNXDEV-4410)', function() {
      const LYNXDEV4410Fixed = false;

      // Add the reference parent pset
      var referenceParentPSet = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');

      // Add our child (referenced) pset
      var childPset1 = PropertyFactory.create(ChildTemplate.typeid, 'single');
      var childPset2 = PropertyFactory.create(ChildTemplate.typeid, 'single');

      var referenceInsertSpy = jest.fn();
      var referenceModifySpy = jest.fn();
      var referenceRemoveSpy = jest.fn();
      ParentDataBinding.registerOnPath('array_ref[2].text', ['insert'], referenceInsertSpy);
      ParentDataBinding.registerOnPath('array_ref[2].text', ['modify'], referenceModifySpy);
      ParentDataBinding.registerOnPath('array_ref[2].text', ['remove'], referenceRemoveSpy);

      var refChangedError = false;
      var referenceChangedSpy = jest.fn(function(in_referenceChangedContext) {
        var prop = in_referenceChangedContext.getProperty();
        // have to do it this way because the PropertyTree swallows exceptions in callbacks :(
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

      workspace.root.insert('myChild1', childPset1);
      workspace.root.insert('myChild2', childPset2);
      workspace.root.insert('myReferenceParent', referenceParentPSet);
      expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
      dataBinder._resetDebugCounters();
      const parentDataBinding = dataBinder.resolve(referenceParentPSet, 'BINDING');

      var referenceArray = referenceParentPSet.get('array_ref');
      referenceArray.push();
      referenceArray.push();
      referenceArray.push();
      referenceArray.push();
      expect(parentDataBinding.onModify).toHaveBeenCalledTimes(4);
      parentDataBinding.onModify.mockClear();

      referenceArray.set(2, '/myChild1');
      // this should also trigger the referenceChanged spy
      expect(referenceChangedSpy).toHaveBeenCalledTimes(1);
      referenceChangedSpy.mockClear();
      if (LYNXDEV4410Fixed) {
        expect(referenceModifySpy).toHaveBeenCalledTimes(1);
      }
      // remove below our reference
      referenceArray.remove(1);
      // this should trigger the referenceChanged spy!
      if (LYNXDEV4410Fixed) {
        expect(referenceChangedSpy).toHaveBeenCalledTimes(1);
      }
      referenceChangedSpy.mockClear();
      expect(refChangedError).toEqual(false);
    });

    it('should not call callbacks for removed refs in an array of references', function() {
      // Add the reference parent pset
      var referenceParentPSet = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');

      // Add our child (referenced) pset
      var childPset1 = PropertyFactory.create(ChildTemplate.typeid, 'single');
      var childPset2 = PropertyFactory.create(ChildTemplate.typeid, 'single');

      var referenceInsertSpy = jest.fn();
      var referenceModifySpy = jest.fn();
      var referenceRemoveSpy = jest.fn();
      ParentDataBinding.registerOnPath('array_ref[0].text', ['insert'], referenceInsertSpy);
      ParentDataBinding.registerOnPath('array_ref[0].text', ['modify'], referenceModifySpy);
      ParentDataBinding.registerOnPath('array_ref[0].text', ['remove'], referenceRemoveSpy);

      var refChangedError = false;
      var referenceChangedSpy = jest.fn(function(in_referenceChangedContext) {
        var prop = in_referenceChangedContext.getProperty();
        // have to do it this way because the PropertyTree swallows exceptions in callbacks :(
        if (prop) {
          if (!PropertyFactory.instanceOf(prop, 'String', 'single')) {
            refChangedError = true;
          }
        }
      });

      ParentDataBinding.registerOnPath('array_ref[0].text', ['referenceChanged'], referenceChangedSpy);

      var arrayInsertSpy = jest.fn();
      var arrayModifySpy = jest.fn();
      var arrayRemoveSpy = jest.fn();
      ParentDataBinding.registerOnPath('array_ref', ['collectionInsert'], arrayInsertSpy);
      ParentDataBinding.registerOnPath('array_ref', ['collectionModify'], arrayModifySpy);
      ParentDataBinding.registerOnPath('array_ref', ['collectionRemove'], arrayRemoveSpy);

      // Register the DataBinding
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding);
      dataBinder.register('BINDING', NodeContainerTemplate.typeid, ParentDataBinding);

      workspace.root.insert('myChild1', childPset1);
      workspace.root.insert('myChild2', childPset2);
      workspace.root.insert('myReferenceParent', referenceParentPSet);
      expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
      dataBinder._resetDebugCounters();
      const parentDataBinding = dataBinder.resolve(referenceParentPSet, 'BINDING');

      var referenceArray = referenceParentPSet.get('array_ref');
      referenceArray.push();
      expect(arrayInsertSpy).toHaveBeenCalledTimes(1);
      arrayInsertSpy.mockClear();
      expect(parentDataBinding.onModify).toHaveBeenCalledTimes(1);
      parentDataBinding.onModify.mockClear();

      referenceArray.set(0, '/myChild1');
      // this should trigger the referenceChanged spy
      expect(referenceChangedSpy).toHaveBeenCalledTimes(1);
      expect(referenceChangedSpy.mock.calls[0][0].getProperty().getAbsolutePath()).toEqual('/myChild1.text');
      referenceChangedSpy.mockClear();

      // should also trigger the modify spy
      childPset1.get('text').setValue('fortytwo');
      expect(referenceModifySpy).toHaveBeenCalledTimes(1);
      referenceModifySpy.mockClear();
      // set our reference to empty
      referenceArray.set(0, '');
      // this should also trigger the referenceChanged spy
      expect(referenceChangedSpy).toHaveBeenCalledTimes(1);
      expect(referenceChangedSpy.mock.calls[0][0].getProperty()).toBeUndefined();
      referenceChangedSpy.mockClear();
      // the modify spy should not be triggered anymore
      childPset1.get('text').setValue('sixtyfour');
      expect(referenceModifySpy).toHaveBeenCalledTimes(0);
      expect(referenceChangedSpy).toHaveBeenCalledTimes(0);
      // set it to an invalid value
      referenceArray.set(0, '/invalid');
      // this should not trigger the referenceChanged spy since it's still undefined
      expect(referenceChangedSpy).toHaveBeenCalledTimes(0);
      referenceChangedSpy.mockClear();
      expect(referenceModifySpy).toHaveBeenCalledTimes(0);
      // set back to valid
      referenceArray.set(0, '/myChild1');
      // this should also trigger the referenceChanged spy
      expect(referenceChangedSpy).toHaveBeenCalledTimes(1);
      expect(referenceChangedSpy.mock.calls[0][0].getProperty().getAbsolutePath()).toEqual('/myChild1.text');
      referenceChangedSpy.mockClear();
      // but not the modified spy
      expect(referenceModifySpy).toHaveBeenCalledTimes(0);
      // now remove (triggers a different code path than just setting it empty)
      referenceArray.remove(0);
      // this should also trigger the referenceChanged spy
      expect(referenceChangedSpy).toHaveBeenCalledTimes(1);
      expect(referenceChangedSpy.mock.calls[0][0].getProperty()).toBeUndefined();
      referenceChangedSpy.mockClear();
      // but not the modified spy
      expect(referenceModifySpy).toHaveBeenCalledTimes(0);
      // the modify spy should not be triggered anymore
      childPset1.get('text').setValue('sixtyfour-sixtyfour');
      expect(referenceModifySpy).toHaveBeenCalledTimes(0);
      expect(referenceChangedSpy).toHaveBeenCalledTimes(0);

      expect(refChangedError).toEqual(false);
    });

    it('should handle references to a not-yet-existing primitive array', function() {
      // Add the reference parent pset
      var referenceParentPSet = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');
      // Add our child (referenced) pset
      var arrayPset = PropertyFactory.create('Int32', 'array');
      // register the reference handler
      var referenceInsertSpy = jest.fn();
      ParentDataBinding.registerOnPath('single_ref', ['collectionInsert'], referenceInsertSpy);

      // Register the DataBinding
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding, { context: 'single' });
      expect(dataBinder._dataBindingCreatedCounter).toEqual(0);
      // parentPset should produce a ParentDataBinding
      workspace.root.insert('myReferenceParent', referenceParentPSet);
      expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
      dataBinder._resetDebugCounters();
      const parentDataBinding = dataBinder.resolve(referenceParentPSet, 'BINDING');
      expect(parentDataBinding).toBeInstanceOf(ParentDataBinding);
      expect(parentDataBinding.onModify).toHaveBeenCalledTimes(0);
      parentDataBinding.onModify.mockClear();

      referenceParentPSet.get('single_ref', RESOLVE_NEVER)
        .setValue('/myArray');
      // insert the array *after* we've inserted our references -> need to do conversion in DataBindingTree
      workspace.root.insert('myArray', arrayPset);
      expect(referenceInsertSpy).toHaveBeenCalledTimes(0);
      arrayPset.push(21);
      expect(referenceInsertSpy).toHaveBeenCalledTimes(1);
    });

    // TODO: stop previously working test
    it.skip('should be able to use referenceChanged with isDeferred', function() {
      const eyeSpy = jest.fn();
      workspace.root.insert('bob', PropertyFactory.create(ReferenceParentTemplate.typeid));
      workspace.root.insert('target', PropertyFactory.create('String'));

      ParentDataBinding.registerOnPath('single_ref', ['insert', 'remove', 'referenceChanged'], eyeSpy, {
        isDeferred: true
      });
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding);
      workspace.root.resolvePath('bob.single_ref', RESOLVE_NEVER).setValue('/target');
      workspace.root.remove(workspace.root.get('target'));

      dataBinder.detach();
    });

  });
});
