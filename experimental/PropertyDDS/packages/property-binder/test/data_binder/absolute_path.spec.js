/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/* globals sinon, expect  */
/* eslint spaced-comment: 0 */
/* eslint-disable max-nested-callbacks */
/*
 * TODO: failing assertions are commented out to enable a clean pass for PRs.
 *
 * Some modificationSet related tests are disabled as they fail due to the changed changeset structure. Since
 * we plan to get rid of modificationSet mid-term, it makes no sense to try and fix those.
 *
 */
import _ from 'underscore';
import { DataBinder } from '../../src/data_binder/data_binder';
import {
  registerTestTemplates, ParentTemplate, ReferenceParentTemplate,
  PrimitiveChildrenTemplate, NodeContainerTemplate,
  point2DImplicitTemplate, point2DExplicitTemplate
} from './testTemplates';
import {
  ParentDataBinding,
  ChildDataBinding,
  PrimitiveChildrenDataBinding,
  InheritedChildDataBinding
} from './testDataBindings';
import { catchConsoleErrors } from './catch_console_errors';
import { RESOLVE_NO_LEAFS } from '../../src/internal/constants';
import { unregisterAllOnPathListeners } from '../../src/data_binder/internal_utils';

import { HFDM, PropertyFactory } from '@adsk/forge-hfdm';

(function() {
  describe('DataBinder.registerOnPath()', function() {
    catchConsoleErrors();

    var dataBinder, hfdm, workspace;
    before(function() {
      registerTestTemplates();
    });

    beforeEach(function() {
      dataBinder = new DataBinder();

      hfdm = new HFDM();
      workspace = hfdm.createWorkspace();
      return workspace.initialize({local: true}).then(function() {
        dataBinder.attachTo(workspace);
      });
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

    describe('should work for single', function() {

      it('non-existing path with primitives', function() {
        var pathSpy = sinon.spy();
        dataBinder.registerOnPath('node.aString', ['insert', 'modify', 'remove'], pathSpy);
        pathSpy.callCount.should.equal(0);

        var nodePset = PropertyFactory.create('NodeProperty', 'single');
        pathSpy.callCount.should.equal(0);
        workspace.insert('node', nodePset);
        var stringPset = PropertyFactory.create('String', 'single');
        nodePset.insert('aString', stringPset);
        pathSpy.callCount.should.equal(1);
        var stringProperty = workspace.get(['node', 'aString']);
        stringProperty.setValue('hello');
        pathSpy.callCount.should.equal(2);
        nodePset.remove('aString');
        pathSpy.callCount.should.equal(3);
      });

      it('non-existing path with non-primitive template', function() {
        var pathSpy = sinon.spy();
        dataBinder.registerOnPath('myPrimitiveChildTemplate.aString', ['insert', 'modify', 'remove'], pathSpy);

        var primitiveChildPset = PropertyFactory.create(PrimitiveChildrenTemplate.typeid, 'single');
        pathSpy.callCount.should.equal(0);
        workspace.insert('myPrimitiveChildTemplate', primitiveChildPset);
        pathSpy.callCount.should.equal(1);
        var stringProperty = workspace.get(['myPrimitiveChildTemplate', 'aString']);
        stringProperty.setValue('hello');
        pathSpy.callCount.should.equal(2);
        workspace.remove('myPrimitiveChildTemplate');
        pathSpy.callCount.should.equal(3);
      });

      it('non-existing path with non-primitive template and DataBinding', function() {
        var pathSpy = sinon.spy();
        dataBinder.registerOnPath('myPrimitiveChildTemplate.aString', ['insert', 'modify', 'remove'], pathSpy);
        dataBinder.register('BINDING', PrimitiveChildrenTemplate.typeid, PrimitiveChildrenDataBinding);

        var primitiveChildPset = PropertyFactory.create(PrimitiveChildrenTemplate.typeid, 'single');
        pathSpy.callCount.should.equal(0);
        dataBinder._dataBindingCreatedCounter.should.equal(0);

        workspace.insert('myPrimitiveChildTemplate', primitiveChildPset);
        // Insert callback for the existing item
        pathSpy.callCount.should.equal(1);
        dataBinder._dataBindingCreatedCounter.should.equal(1);
        const primitiveChildrenDataBinding = dataBinder.resolve('/myPrimitiveChildTemplate', 'BINDING');
        dataBinder._resetDebugCounters();
        var stringProperty = workspace.get(['myPrimitiveChildTemplate', 'aString']);
        stringProperty.setValue('hello');
        pathSpy.callCount.should.equal(2);
        primitiveChildrenDataBinding.onModify.callCount.should.equal(1);
        primitiveChildrenDataBinding.onModify.resetHistory();
        workspace.remove('myPrimitiveChildTemplate');
        pathSpy.callCount.should.equal(3);
        dataBinder._dataBindingRemovedCounter.should.equal(1);
      });

      it('already existing path with primitives', function() {
        var nodePset = PropertyFactory.create('NodeProperty', 'single');
        workspace.insert('node', nodePset);
        var stringPset = PropertyFactory.create('String', 'single');
        nodePset.insert('aString', stringPset);

        var pathSpy = sinon.spy();
        dataBinder.registerOnPath('node.aString', ['insert', 'modify', 'remove'], pathSpy);
        // Called back, since it already exists
        pathSpy.callCount.should.equal(1);

        var stringProperty = workspace.get(['node', 'aString']);
        stringProperty.setValue('hello');
        pathSpy.callCount.should.equal(2);
        nodePset.remove('aString');
        pathSpy.callCount.should.equal(3);
      });

      it('already existing path with primitives, twice', function() {
        var nodePset = PropertyFactory.create('NodeProperty', 'single');
        workspace.insert('node', nodePset);
        var stringPset = PropertyFactory.create('String', 'single');
        nodePset.insert('aString', stringPset);

        var pathSpy = sinon.spy();
        dataBinder.registerOnPath('node.aString', ['insert', 'modify', 'remove'], pathSpy);
        // Called back, since it already exists
        pathSpy.callCount.should.equal(1);

        dataBinder.registerOnPath('node.aString', ['insert', 'modify', 'remove'], pathSpy);
        // Called back once, since it already exists -- shouldn't accidentally fire the
        // previous callback installed again
        pathSpy.callCount.should.equal(2);

        pathSpy.resetHistory();

        var stringProperty = workspace.get(['node', 'aString']);
        stringProperty.setValue('hello');
        pathSpy.callCount.should.equal(2);
        nodePset.remove('aString');
        pathSpy.callCount.should.equal(4);
      });

      it('already existing path with non-primitive template', function() {
        var primitiveChildPset = PropertyFactory.create(PrimitiveChildrenTemplate.typeid, 'single');
        workspace.insert('myPrimitiveChildTemplate', primitiveChildPset);
        var pathSpy = sinon.spy();
        dataBinder.registerOnPath('myPrimitiveChildTemplate.aString', ['insert', 'modify', 'remove'], pathSpy);
        // Called back, since it already exists
        pathSpy.callCount.should.equal(1);
        var stringProperty = workspace.get(['myPrimitiveChildTemplate', 'aString']);
        stringProperty.setValue('hello');
        pathSpy.callCount.should.equal(2);
        workspace.remove('myPrimitiveChildTemplate');
        pathSpy.callCount.should.equal(3);
      });

      it('modify already existing path that gets removed and then readded', function() {
        var primitiveChildPset = PropertyFactory.create(PrimitiveChildrenTemplate.typeid, 'single');
        workspace.insert('myPrimitiveChildTemplate', primitiveChildPset);
        var pathSpy = sinon.spy();
        dataBinder.registerOnPath('myPrimitiveChildTemplate.aString', ['modify'], pathSpy);

        pathSpy.callCount.should.equal(0);
        var stringProperty = workspace.get(['myPrimitiveChildTemplate', 'aString']);
        stringProperty.setValue('hello');
        pathSpy.callCount.should.equal(1);

        workspace.remove('myPrimitiveChildTemplate');
        pathSpy.callCount.should.equal(1);
        workspace.insert('myPrimitiveChildTemplate', primitiveChildPset);

        pathSpy.callCount.should.equal(1);
        var stringProperty = workspace.get(['myPrimitiveChildTemplate', 'aString']);
        stringProperty.setValue('hello again');
        pathSpy.callCount.should.equal(2);
      });

      it('insert on creation - string', function() {
        var pathSpy = sinon.spy();

        workspace.insert('node', PropertyFactory.create('NodeProperty', 'single'));
        const text = PropertyFactory.create('String', 'single');
        workspace.get('node').insert('text', text);

        pathSpy.resetHistory();
        dataBinder.registerOnPath('node.text', ['insert', 'remove'], pathSpy);

        pathSpy.callCount.should.equal(1);
        workspace.get('node').remove(text);
        pathSpy.callCount.should.equal(2);
        workspace.get('node').insert('text', text);
        pathSpy.callCount.should.equal(3);
      });

      it('Documentation example - registerOnPath', function() {
        // SnippetStart{DataBinder.registerOnPath}
        var orderEntrySchema = {
          typeid: 'autodesk.samples:orderEntry-1.0.0',
          properties: [
            {id: 'productId', typeid: 'String'},
            {id: 'quantity', typeid: 'Int64'},
            {id: 'price', typeid: 'Float64'}
          ]
        };
        PropertyFactory.register(orderEntrySchema);

        const eventLog = [];
        const quantityCallback = function(modificationContext) {
          eventLog.push('Quantity callback ' + modificationContext.getProperty().getValue());
        };
        const priceCallback = function(modificationContext) {
          eventLog.push('Price callback ' + modificationContext.getProperty().getValue());
        };

        // Register on the explicit _path_ changing
        dataBinder.registerOnPath('order1.quantity', ['insert', 'modify'], quantityCallback);
        dataBinder.registerOnPath('order1.price', ['insert', 'modify'], priceCallback);

        const order1 = PropertyFactory.create(orderEntrySchema.typeid);
        workspace.insert('order1', order1);
        const order2 = PropertyFactory.create(orderEntrySchema.typeid);
        workspace.insert('order2', order2);

        // We hear about order1 (two events, 'quantity' and 'price' being inserted), but not order2
        console.assert(eventLog.length === 2);
        // SnippetEnd{DataBinder.registerOnPath}
      });

      it('insert on creation - valid reference', function() {
        var pathSpy = sinon.spy();

        workspace.insert('node', PropertyFactory.create('NodeProperty', 'single'));
        workspace.get('node').insert('text', PropertyFactory.create('String', 'single'));
        const refObject = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');
        workspace.insert('myChild1', refObject);

        pathSpy.resetHistory();
        workspace.get(['myChild1', 'single_ref'], RESOLVE_NO_LEAFS).setValue('/node');
        dataBinder.registerOnPath('myChild1.single_ref.text', ['insert'], pathSpy);
        pathSpy.callCount.should.equal(1);
      });

      it('getRelativeTokenizedPath - absolute path', function() {
        let worked = false;
        dataBinder.registerOnPath('a.myString', ['modify'], function(in_context) {
          const path = in_context.getRelativeTokenizedPath();
          worked = path.length === 2 && path[0] === 'a' && path[1] === 'myString';
        });

        workspace.insert('a', PropertyFactory.create('NodeProperty', 'single'));
        workspace.get('a').insert('myString', PropertyFactory.create('String', 'single'));

        dataBinder.attachTo(workspace);

        worked.should.equal(false);
        workspace.get(['a', 'myString']).setValue('Bobo');
        worked.should.equal(true);
      });

      it('modify already existing path with references', function() {
        workspace.insert('text', PropertyFactory.create('String', 'single'));
        const refObject = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');
        workspace.insert('myChild1', refObject);
        workspace.get(['myChild1', 'single_ref'], RESOLVE_NO_LEAFS).setValue('/text');

        var pathSpy = sinon.spy();
        var refSpy = sinon.spy();

        // Although registering the same path, 'modify' will tell us about changes to the dereferenced
        // single_ref, while referenceModify will give us info about the reference itself.
        dataBinder.registerOnPath('myChild1.single_ref', ['modify'], pathSpy);
        dataBinder.registerOnPath('myChild1.single_ref', ['referenceModify'], refSpy);

        refSpy.callCount.should.equal(0);
        pathSpy.callCount.should.equal(0);
        workspace.get(['text']).setValue('hello');
        refSpy.callCount.should.equal(0);
        pathSpy.callCount.should.equal(1);
      });

      it('should handle references to references - insert', function() {
        const pathSpy = sinon.spy();
        const removePathSpy = sinon.spy();

        dataBinder.registerOnPath('myChild1.single_ref', ['insert'], pathSpy);
        dataBinder.registerOnPath('myChild1.single_ref', ['remove'], removePathSpy);
        pathSpy.callCount.should.equal(0);

        // Set up a bunch of hops where the reference directly references another reference.
        // i.e. myChild1.single_ref resolves to /text, but only after resolving through single_ref,
        // ref2, and ref1.
        workspace.insert('text', PropertyFactory.create('String', 'single'));
        workspace.insert('ref1', PropertyFactory.create('Reference', 'single'));
        workspace.insert('ref2', PropertyFactory.create('Reference', 'single'));
        workspace.get('ref1', RESOLVE_NO_LEAFS).setValue('/text');
        workspace.get('ref2', RESOLVE_NO_LEAFS).setValue('/ref1');

        const refObject = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');
        workspace.insert('myChild1', refObject);

        pathSpy.callCount.should.equal(0);
        removePathSpy.callCount.should.equal(0);

        workspace.get(['myChild1', 'single_ref'], RESOLVE_NO_LEAFS).setValue('/ref2');
        pathSpy.callCount.should.equal(1);
        removePathSpy.callCount.should.equal(0);

        // Break the link by breaking ref2
        workspace.get('ref2', RESOLVE_NO_LEAFS).setValue('/garbage');
        pathSpy.callCount.should.equal(1);
        removePathSpy.callCount.should.equal(1);

        // put it back
        workspace.get('ref2', RESOLVE_NO_LEAFS).setValue('/ref1');
        pathSpy.callCount.should.equal(2);
        removePathSpy.callCount.should.equal(1);

        // Break again
        workspace.get('ref2', RESOLVE_NO_LEAFS).setValue('/garbage');
        pathSpy.callCount.should.equal(2);
        removePathSpy.callCount.should.equal(2);

        // put it back again
        workspace.get('ref2', RESOLVE_NO_LEAFS).setValue('/ref1');
        pathSpy.callCount.should.equal(3);
        removePathSpy.callCount.should.equal(2);

        // Break deeper
        workspace.get('ref1', RESOLVE_NO_LEAFS).setValue('/garbage');
        pathSpy.callCount.should.equal(3);
        removePathSpy.callCount.should.equal(3);

        // put it back again
        workspace.get('ref1', RESOLVE_NO_LEAFS).setValue('/text');
        pathSpy.callCount.should.equal(4);
        removePathSpy.callCount.should.equal(3);
      });

      it('should handle references to references - insert, changing from valid to valid', function() {
        const insertSpy = sinon.spy();
        const removeSpy = sinon.spy();

        dataBinder.registerOnPath('myChild1.single_ref', ['insert'], insertSpy);
        dataBinder.registerOnPath('myChild1.single_ref', ['remove'], removeSpy);
        insertSpy.callCount.should.equal(0);

        // Set up a bunch of hops where the reference directly references another reference.
        // i.e. myChild1.single_ref resolves to /text, but only after resolving through single_ref,
        // ref2, and ref1.
        workspace.insert('text', PropertyFactory.create('String', 'single'));
        workspace.insert('text2', PropertyFactory.create('String', 'single'));
        workspace.insert('ref1', PropertyFactory.create('Reference', 'single'));
        workspace.insert('ref2', PropertyFactory.create('Reference', 'single'));
        workspace.get('ref1', RESOLVE_NO_LEAFS).setValue('/text');
        workspace.get('ref2', RESOLVE_NO_LEAFS).setValue('/ref1');

        const refObject = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');
        workspace.insert('myChild1', refObject);
        insertSpy.callCount.should.equal(0);
        removeSpy.callCount.should.equal(0);

        workspace.get(['myChild1', 'single_ref'], RESOLVE_NO_LEAFS).setValue('/ref2');
        insertSpy.callCount.should.equal(1);
        removeSpy.callCount.should.equal(0);

        // Change ref1 from one valid string to another
        workspace.get('ref1', RESOLVE_NO_LEAFS).setValue('/text2');
        insertSpy.callCount.should.equal(2);
        removeSpy.callCount.should.equal(1);

        // put it back again
        workspace.get('ref1', RESOLVE_NO_LEAFS).setValue('/text');
        insertSpy.callCount.should.equal(3);
        removeSpy.callCount.should.equal(2);

        // garbage
        workspace.get('ref1', RESOLVE_NO_LEAFS).setValue('/garbage');
        insertSpy.callCount.should.equal(3);
        removeSpy.callCount.should.equal(3);
      });

      it('insert callback on subpath through a reference, retroactive', function() {
        const textProperty = PropertyFactory.create('String');

        const pathSpy = sinon.spy(function(context) {
          context.getProperty().should.equal(textProperty);
        });

        workspace.insert('node', PropertyFactory.create('NodeProperty'));
        workspace.get('node').insert('text', textProperty);
        workspace.insert('ref1', PropertyFactory.create('Reference'));
        workspace.get('ref1', RESOLVE_NO_LEAFS).setValue('/node');

        dataBinder.registerOnPath('ref1.text', ['insert'], pathSpy);
        pathSpy.callCount.should.equal(1);
      });

      it('remove callback on subpath through a reference', function() {
        const removeSpy = sinon.spy();
        const insertSpy = sinon.spy();
        dataBinder.registerOnPath('ref.text', ['insert'], insertSpy);
        dataBinder.registerOnPath('ref.text', ['remove'], removeSpy);

        workspace.insert('node1', PropertyFactory.create('NodeProperty'));
        workspace.get('node1').insert('text', PropertyFactory.create('String'));

        workspace.insert('node2', PropertyFactory.create('NodeProperty'));
        workspace.get('node2').insert('text', PropertyFactory.create('String'));

        workspace.insert('ref', PropertyFactory.create('Reference'));

        insertSpy.callCount.should.equal(0);
        removeSpy.callCount.should.equal(0);

        // Valid ref - insert
        workspace.get('ref', RESOLVE_NO_LEAFS).setValue('/node1');
        insertSpy.callCount.should.equal(1);
        removeSpy.callCount.should.equal(0);

        // Switch - remove the old one and insert the new one
        workspace.get('ref', RESOLVE_NO_LEAFS).setValue('/node2');
        insertSpy.callCount.should.equal(2);
        removeSpy.callCount.should.equal(1);

        // invalid - should remove
        workspace.get('ref', RESOLVE_NO_LEAFS).setValue('/garbage');
        insertSpy.callCount.should.equal(2);
        removeSpy.callCount.should.equal(2);

        // Valid one - should insert
        workspace.get('ref', RESOLVE_NO_LEAFS).setValue('/node2');
        insertSpy.callCount.should.equal(3);
        removeSpy.callCount.should.equal(2);

        // no change - no notifs
        workspace.get('ref', RESOLVE_NO_LEAFS).setValue('/node2');
        insertSpy.callCount.should.equal(3);
        removeSpy.callCount.should.equal(2);

        // invalid (empty case) - should remove
        workspace.get('ref', RESOLVE_NO_LEAFS).setValue('');
        insertSpy.callCount.should.equal(3);
        removeSpy.callCount.should.equal(3);
      });

      it('collectionInsert callback on subpath through a reference', function() {
        const dataProp = PropertyFactory.create(PrimitiveChildrenTemplate.typeid);

        const pathSpy = sinon.spy();

        dataBinder.registerOnPath('ref1.data.arrayOfNumbers', ['collectionInsert'], pathSpy);

        workspace.insert('node', PropertyFactory.create('NodeProperty'));
        workspace.get('node').insert('data', dataProp);
        workspace.insert('ref1', PropertyFactory.create('Reference'));
        workspace.get('ref1', RESOLVE_NO_LEAFS).setValue('/node');

        pathSpy.callCount.should.equal(0);

        dataProp.get('arrayOfNumbers').push(5);

        pathSpy.callCount.should.equal(1);

        workspace.get('ref1', RESOLVE_NO_LEAFS).setValue('/garbage');
        pathSpy.callCount.should.equal(1);

        workspace.get('ref1', RESOLVE_NO_LEAFS).setValue('/node');
        pathSpy.callCount.should.equal(2);
      });

      it('collectionInsert callback on subpath through a reference, retroactive', function() {
        const dataProp = PropertyFactory.create(PrimitiveChildrenTemplate.typeid);

        const pathSpy = sinon.spy();

        workspace.insert('node', PropertyFactory.create('NodeProperty'));
        workspace.get('node').insert('data', dataProp);
        workspace.insert('ref1', PropertyFactory.create('Reference'));
        workspace.get('ref1', RESOLVE_NO_LEAFS).setValue('/node');
        dataProp.get('arrayOfNumbers').push(5);

        dataBinder.registerOnPath('ref1.data.arrayOfNumbers', ['collectionInsert'], pathSpy);
        pathSpy.callCount.should.equal(1);

        workspace.get('ref1', RESOLVE_NO_LEAFS).setValue('/garbage');
        pathSpy.callCount.should.equal(1);

        workspace.get('ref1', RESOLVE_NO_LEAFS).setValue('/node');
        pathSpy.callCount.should.equal(2);
      });

      it('referenceInsert callback on subpath through a reference, invalid target', function() {
        const theRefProp = PropertyFactory.create('Reference');

        const pathSpy = sinon.spy();

        dataBinder.registerOnPath('ref1.theRef', ['referenceInsert'], pathSpy);

        workspace.insert('node', PropertyFactory.create('NodeProperty'));
        workspace.get('node').insert('theRef', theRefProp);
        workspace.insert('ref1', PropertyFactory.create('Reference'));
        workspace.get('ref1', RESOLVE_NO_LEAFS).setValue('/node');

        pathSpy.callCount.should.equal(1);

        workspace.get('ref1', RESOLVE_NO_LEAFS).setValue('/garbage');
        pathSpy.callCount.should.equal(1);

        workspace.get('ref1', RESOLVE_NO_LEAFS).setValue('/node');
        pathSpy.callCount.should.equal(2);
      });

      it('referenceInsert callback on subpath through a reference, invalid target, retroactive', function() {
        const theRefProp = PropertyFactory.create('Reference');

        const pathSpy = sinon.spy();

        workspace.insert('node', PropertyFactory.create('NodeProperty'));
        workspace.get('node').insert('theRef', theRefProp);
        workspace.insert('ref1', PropertyFactory.create('Reference'));
        workspace.get('ref1', RESOLVE_NO_LEAFS).setValue('/node');

        dataBinder.registerOnPath('ref1.theRef', ['referenceInsert'], pathSpy);
        pathSpy.callCount.should.equal(1);

        workspace.get('ref1', RESOLVE_NO_LEAFS).setValue('/garbage');
        pathSpy.callCount.should.equal(1);

        workspace.get('ref1', RESOLVE_NO_LEAFS).setValue('/node');
        pathSpy.callCount.should.equal(2);
      });
      it('referenceInsert callback on subpath through a reference, valid target', function() {
        const theRefProp = PropertyFactory.create('Reference', 'single', '/');

        const pathSpy = sinon.spy();

        dataBinder.registerOnPath('ref1.theRef', ['referenceInsert'], pathSpy);

        workspace.insert('node', PropertyFactory.create('NodeProperty'));
        workspace.get('node').insert('theRef', theRefProp);
        workspace.insert('ref1', PropertyFactory.create('Reference'));
        workspace.get('ref1', RESOLVE_NO_LEAFS).setValue('/node');

        pathSpy.callCount.should.equal(1);

        workspace.get('ref1', RESOLVE_NO_LEAFS).setValue('/garbage');
        pathSpy.callCount.should.equal(1);

        workspace.get('ref1', RESOLVE_NO_LEAFS).setValue('/node');
        pathSpy.callCount.should.equal(2);
      });

      it('referenceInsert callback on subpath through a reference, valid target, retroactive', function() {
        const theRefProp = PropertyFactory.create('Reference', 'single', '/');

        const pathSpy = sinon.spy();

        workspace.insert('node', PropertyFactory.create('NodeProperty'));
        workspace.get('node').insert('theRef', theRefProp);
        workspace.insert('ref1', PropertyFactory.create('Reference'));
        workspace.get('ref1', RESOLVE_NO_LEAFS).setValue('/node');

        dataBinder.registerOnPath('ref1.theRef', ['referenceInsert'], pathSpy);
        pathSpy.callCount.should.equal(1);

        workspace.get('ref1', RESOLVE_NO_LEAFS).setValue('/garbage');
        pathSpy.callCount.should.equal(1);

        workspace.get('ref1', RESOLVE_NO_LEAFS).setValue('/node');
        pathSpy.callCount.should.equal(2);
      });

      it('insert callback on subpath through a reference', function() {
        const textProperty = PropertyFactory.create('String');
        const textProperty2 = PropertyFactory.create('String');
        let expectedProperty = textProperty;

        const pathSpy = sinon.spy(function(context) {
          context.getProperty().should.equal(expectedProperty);
        });

        dataBinder.registerOnPath('ref1.text', ['insert'], pathSpy);

        workspace.insert('node', PropertyFactory.create('NodeProperty'));
        workspace.get('node').insert('text', textProperty);

        workspace.insert('node2', PropertyFactory.create('NodeProperty'));
        workspace.get('node2').insert('text', textProperty2);

        workspace.insert('ref1', PropertyFactory.create('Reference'));

        expectedProperty = textProperty;
        workspace.get('ref1', RESOLVE_NO_LEAFS).setValue('/node');

        pathSpy.callCount.should.equal(1);

        // Change from one valid reference to another
        expectedProperty = textProperty2;
        workspace.get('ref1', RESOLVE_NO_LEAFS).setValue('/node2');

        pathSpy.callCount.should.equal(2);
      });

      it('should handle references to references - 1', function() {
        const pathSpy = sinon.spy();

        dataBinder.registerOnPath('myChild1.single_ref', ['modify'], pathSpy);
        pathSpy.callCount.should.equal(0);

        // Set up a bunch of hops where the reference directly references another reference.
        // i.e. myChild1.single_ref resolves to /text, but only after resolving through single_ref,
        // ref2, and ref1.
        workspace.insert('text', PropertyFactory.create('String', 'single'));
        workspace.insert('ref1', PropertyFactory.create('Reference', 'single'));
        workspace.insert('ref2', PropertyFactory.create('Reference', 'single'));
        workspace.get('ref1', RESOLVE_NO_LEAFS).setValue('/text');
        workspace.get('ref2', RESOLVE_NO_LEAFS).setValue('/ref1');

        const refObject = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');
        workspace.insert('myChild1', refObject);

        pathSpy.callCount.should.equal(0);
        workspace.get(['myChild1', 'single_ref'], RESOLVE_NO_LEAFS).setValue('/ref2');
        pathSpy.callCount.should.equal(0);

        // Break the link by breaking ref2
        workspace.get('ref2', RESOLVE_NO_LEAFS).setValue('/garbage');
        workspace.get('ref2', RESOLVE_NO_LEAFS).setValue('/ref1');

        pathSpy.callCount.should.equal(0);
        workspace.get('text').setValue('hello again');

        pathSpy.callCount.should.equal(1);
      });

      it('should handle references to references - 2', function() {
        const pathSpy = sinon.spy();
        const refPathSpy = sinon.spy();

        dataBinder.registerOnPath('myChild1.single_ref', ['modify'], pathSpy);
        dataBinder.registerOnPath('myChild1.single_ref', ['referenceModify'], refPathSpy);

        // Set up a bunch of hops where the reference directly references another reference.
        // i.e. myChild1.single_ref resolves to /text, but only after resolving through ref3,
        // ref2 and ref1.
        workspace.insert('text', PropertyFactory.create('String', 'single'));
        workspace.insert('ref1', PropertyFactory.create('Reference', 'single'));
        workspace.insert('ref2', PropertyFactory.create('Reference', 'single'));
        workspace.insert('ref3', PropertyFactory.create('Reference', 'single'));
        workspace.get('ref3', RESOLVE_NO_LEAFS).setValue('/ref2');
        workspace.get('ref2', RESOLVE_NO_LEAFS).setValue('/ref1');
        workspace.get('ref1', RESOLVE_NO_LEAFS).setValue('/text');

        const refObject = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');
        workspace.insert('myChild1', refObject);

        refPathSpy.callCount.should.equal(0);
        pathSpy.callCount.should.equal(0);

        // This should cause the referenceModify to fire, but not the normal modify
        workspace.get(['myChild1', 'single_ref'], RESOLVE_NO_LEAFS).setValue('/ref3');

        refPathSpy.callCount.should.equal(1);
        pathSpy.callCount.should.equal(0);

        // This should cause the modify to fire, but not the referenceModify
        workspace.get('text').setValue('hello');

        refPathSpy.callCount.should.equal(1);
        refPathSpy.resetHistory();

        pathSpy.callCount.should.equal(1);
        pathSpy.resetHistory();

        // Break the link by breaking ref2
        workspace.get('ref2', RESOLVE_NO_LEAFS).setValue('/garbage');

        // We are only bound to single_ref for referenceModify, so this shouldn't fire
        refPathSpy.callCount.should.equal(0);

        // Modifying text shouldn't make it through now
        workspace.get('text').setValue('hello');
        pathSpy.callCount.should.equal(0);

        // Fix the link
        workspace.get('ref2', RESOLVE_NO_LEAFS).setValue('/ref1');

        // Now it should work
        workspace.get('text').setValue('hello again');
        pathSpy.callCount.should.equal(1);
      });

      it('modify non-existing path with references', function() {
        var pathSpy = sinon.spy();
        var refSpy = sinon.spy();
        dataBinder.registerOnPath('myChild1.single_ref', ['modify'], pathSpy);
        dataBinder.registerOnPath('myChild1.single_ref', ['referenceModify'], refSpy);

        workspace.insert('text', PropertyFactory.create('String', 'single'));
        const refObject = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');
        workspace.insert('myChild1', refObject);
        workspace.get(['myChild1', 'single_ref'], RESOLVE_NO_LEAFS).setValue('/text');

        refSpy.callCount.should.equal(1);
        pathSpy.callCount.should.equal(0);
        workspace.get(['text']).setValue('hello');
        refSpy.callCount.should.equal(1);
        pathSpy.callCount.should.equal(1);
      });

      it('modify path with references that goes invalid and comes back', function() {
        var pathSpy = sinon.spy();

        workspace.insert('node', PropertyFactory.create('NodeProperty', 'single'));
        workspace.get('node').insert('text', PropertyFactory.create('String', 'single'));
        const refObject = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');
        workspace.insert('myChild1', refObject);

        pathSpy.resetHistory();

        // We set the reference and then register -- the next test does the opposite
        workspace.get(['myChild1', 'single_ref'], RESOLVE_NO_LEAFS).setValue('/node');
        dataBinder.registerOnPath('myChild1.single_ref.text', ['modify'], pathSpy);
        pathSpy.callCount.should.equal(0);

        workspace.get(['node', 'text']).setValue('hello');
        pathSpy.callCount.should.equal(1);

        pathSpy.resetHistory();
        workspace.get(['myChild1', 'single_ref'], RESOLVE_NO_LEAFS).setValue('/garbage');
        pathSpy.callCount.should.equal(0);
        workspace.get(['node', 'text']).setValue('hello2');
        pathSpy.callCount.should.equal(0);

        pathSpy.resetHistory();
        workspace.get(['myChild1', 'single_ref'], RESOLVE_NO_LEAFS).setValue('/node');
        pathSpy.callCount.should.equal(0);
        workspace.get(['node', 'text']).setValue('hello3');
        pathSpy.callCount.should.equal(1);
      });

      it('modify path through a reference', function() {
        var pathSpy = sinon.spy();

        workspace.insert('node', PropertyFactory.create('NodeProperty', 'single'));
        workspace.get('node').insert('text', PropertyFactory.create('String', 'single'));
        const refObject = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');
        workspace.insert('myChild1', refObject);

        pathSpy.resetHistory();

        // We set the reference and then register -- the next test does the opposite
        workspace.get(['myChild1', 'single_ref'], RESOLVE_NO_LEAFS).setValue('/node');
        dataBinder.registerOnPath('myChild1.single_ref.text', ['modify'], pathSpy);
        pathSpy.callCount.should.equal(0);

        workspace.get(['node', 'text']).setValue('hello');
        pathSpy.callCount.should.equal(1);
      });

      it('modify path through a reference - reverse order', function() {
        var pathSpy = sinon.spy();

        workspace.insert('node', PropertyFactory.create('NodeProperty', 'single'));
        workspace.get('node').insert('text', PropertyFactory.create('String', 'single'));
        const refObject = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');
        workspace.insert('myChild1', refObject);

        pathSpy.resetHistory();

        // We register and then set the reference -- the last test did the opposite
        dataBinder.registerOnPath('myChild1.single_ref.text', ['modify'], pathSpy);
        workspace.get(['myChild1', 'single_ref'], RESOLVE_NO_LEAFS).setValue('/node');

        pathSpy.callCount.should.equal(0);

        workspace.get(['node', 'text']).setValue('hello');
        pathSpy.callCount.should.equal(1);
      });

      it('insert callback that gets removed and then readded', function() {
        var primitiveChildPset = PropertyFactory.create(PrimitiveChildrenTemplate.typeid, 'single');
        var pathSpy = sinon.spy();
        dataBinder.registerOnPath('myPrimitiveChildTemplate.aString', ['insert'], pathSpy);

        workspace.insert('myPrimitiveChildTemplate', primitiveChildPset);
        pathSpy.callCount.should.equal(1);

        workspace.remove('myPrimitiveChildTemplate');
        pathSpy.callCount.should.equal(1);

        workspace.insert('myPrimitiveChildTemplate', primitiveChildPset);
        pathSpy.callCount.should.equal(2);
      });

      it('modify already existing path that gets removed and then readded', function() {
        var primitiveChildPset = PropertyFactory.create(PrimitiveChildrenTemplate.typeid, 'single');
        workspace.insert('myPrimitiveChildTemplate', primitiveChildPset);
        var pathSpy = sinon.spy();
        dataBinder.registerOnPath('myPrimitiveChildTemplate.aString', ['modify'], pathSpy);

        pathSpy.callCount.should.equal(0);
        var stringProperty = workspace.get(['myPrimitiveChildTemplate', 'aString']);
        stringProperty.setValue('hello');
        pathSpy.callCount.should.equal(1);

        workspace.remove('myPrimitiveChildTemplate');
        pathSpy.callCount.should.equal(1);
        workspace.insert('myPrimitiveChildTemplate', primitiveChildPset);

        pathSpy.callCount.should.equal(1);
        var stringProperty = workspace.get(['myPrimitiveChildTemplate', 'aString']);
        stringProperty.setValue('hello again');
        pathSpy.callCount.should.equal(2);
      });

      it('insert callback that gets removed and then readded', function() {
        var primitiveChildPset = PropertyFactory.create(PrimitiveChildrenTemplate.typeid, 'single');
        var pathSpy = sinon.spy();
        dataBinder.registerOnPath('myPrimitiveChildTemplate.aString', ['insert'], pathSpy);

        workspace.insert('myPrimitiveChildTemplate', primitiveChildPset);
        pathSpy.callCount.should.equal(1);

        workspace.remove('myPrimitiveChildTemplate');
        pathSpy.callCount.should.equal(1);

        workspace.insert('myPrimitiveChildTemplate', primitiveChildPset);
        pathSpy.callCount.should.equal(2);
      });

      it('already existing path with non-primitive template and DataBinding', function() {
        dataBinder.register('BINDING', PrimitiveChildrenTemplate.typeid, PrimitiveChildrenDataBinding);
        var primitiveChildPset = PropertyFactory.create(PrimitiveChildrenTemplate.typeid, 'single');
        workspace.insert('myPrimitiveChildTemplate', primitiveChildPset);
        var pathSpy = sinon.spy();
        dataBinder.registerOnPath('myPrimitiveChildTemplate.aString', ['insert', 'modify', 'remove'], pathSpy);
        dataBinder._dataBindingCreatedCounter.should.equal(1);
        const primitiveChildrenDataBinding = dataBinder.resolve('/myPrimitiveChildTemplate', 'BINDING');
        dataBinder._resetDebugCounters();
        // insert notification for the existing path
        pathSpy.callCount.should.equal(1);
        var stringProperty = workspace.get(['myPrimitiveChildTemplate', 'aString']);
        stringProperty.setValue('hello');
        pathSpy.callCount.should.equal(2);
        primitiveChildrenDataBinding.onModify.callCount.should.equal(1);
        primitiveChildrenDataBinding.onModify.resetHistory();
        workspace.remove('myPrimitiveChildTemplate');
        pathSpy.callCount.should.equal(3);
        dataBinder._dataBindingRemovedCounter.should.equal(1);
        dataBinder._resetDebugCounters();
      });

      it('non-existing path with (nested) arrays', function() {
        var pathSpy = sinon.spy();
        var pathSpy2 = sinon.spy();
        dataBinder.registerOnPath('child1.childArray[2]', ['insert', 'modify', 'remove'], pathSpy);
        dataBinder.registerOnPath('child1.childArray[1].nestedArray[2]', ['insert', 'modify', 'remove'], pathSpy2);

        workspace.insert('child1', PropertyFactory.create('NodeProperty', 'single'));
        workspace.get('child1').insert('childArray', PropertyFactory.create(ParentTemplate.typeid, 'array'));
        workspace.get(['child1', 'childArray']).push(PropertyFactory.create(ParentTemplate.typeid, 'single'));
        // remove the just inserted child, in order to test array removal from the end of the array
        workspace.get(['child1', 'childArray']).remove(0);
        // re-add it
        workspace.get(['child1', 'childArray']).push(PropertyFactory.create(ParentTemplate.typeid, 'single'));
        // add one more
        workspace.get(['child1', 'childArray']).push(PropertyFactory.create(ParentTemplate.typeid, 'single'));
        pathSpy.callCount.should.equal(0);
        // this will cause the watched property path to become valid so pathSpy will be called after this
        workspace.get(['child1', 'childArray']).push(PropertyFactory.create(ParentTemplate.typeid, 'single'));
        pathSpy.callCount.should.equal(1);
        pathSpy.resetHistory();
        pathSpy2.callCount.should.equal(0);
        // add nested array
        var parentProp = workspace.get(['child1', 'childArray', '1']);
        parentProp.insert('nestedArray', PropertyFactory.create(ParentTemplate.typeid, 'array'));
        var nestedArray = parentProp.get('nestedArray');
        nestedArray.insertRange(0, _.map([1, 2, 3, 4, 5, 6], function(i) {
          return PropertyFactory.create(ParentTemplate.typeid, undefined, {
            text: String(i)
          });
        }));
        pathSpy2.callCount.should.equal(1);
        pathSpy2.resetHistory();
        // test: remove from array beyond the highest index
        nestedArray.remove(4);
        pathSpy2.callCount.should.equal(0);
        // test: insert into array beyond the highest index
        nestedArray.insert(4, PropertyFactory.create(ParentTemplate.typeid, undefined, {
          text: String('four a')
        }));
        nestedArray.insert(4, PropertyFactory.create(ParentTemplate.typeid, undefined, {
          text: String('four b')
        }));
        pathSpy2.callCount.should.equal(0);
        nestedArray.get(2).get('text').setValue('fortytwo');
        pathSpy2.callCount.should.equal(1);
      });

      it('Referencing an existing array element', function() {
        var pathSpy = sinon.spy();

        workspace.insert('referenceToElement2', PropertyFactory.create('Reference', 'single'));
        workspace.get('referenceToElement2', RESOLVE_NO_LEAFS).setValue('/childArray[2]');

        workspace.insert('childArray', PropertyFactory.create(ParentTemplate.typeid, 'array'));

        workspace.get(['childArray']).push(PropertyFactory.create(ParentTemplate.typeid, 'single'));
        workspace.get(['childArray']).push(PropertyFactory.create(ParentTemplate.typeid, 'single'));
        workspace.get(['childArray']).push(PropertyFactory.create(ParentTemplate.typeid, 'single'));
        pathSpy.callCount.should.equal(0);

        dataBinder.registerOnPath('referenceToElement2.text', ['insert', 'modify', 'remove'], pathSpy);
        pathSpy.callCount.should.equal(1);

        workspace.get(['childArray', 2, 'text']).setValue('Hello');

        pathSpy.callCount.should.equal(2); // the insert and the modify
      });

      it('Referencing a non-existing array element, then adding it', function() {
        var pathSpy = sinon.spy();

        workspace.insert('referenceToElement2', PropertyFactory.create('Reference', 'single'));
        workspace.get('referenceToElement2', RESOLVE_NO_LEAFS).setValue('/childArray[2]');

        // This is initially an invalid reference
        dataBinder.registerOnPath('referenceToElement2.text', ['insert', 'modify', 'remove'], pathSpy);

        workspace.insert('childArray', PropertyFactory.create(ParentTemplate.typeid, 'array'));
        workspace.get(['childArray']).push(PropertyFactory.create(ParentTemplate.typeid, 'single'));
        workspace.get(['childArray']).push(PropertyFactory.create(ParentTemplate.typeid, 'single'));
        pathSpy.callCount.should.equal(0);

        // It becomes valid now; insert should be fired
        workspace.get(['childArray']).push(PropertyFactory.create(ParentTemplate.typeid, 'single'));
        pathSpy.callCount.should.equal(1); // the insert

        // Modify should be fired
        workspace.get(['childArray', 2, 'text']).setValue('Hello');
        pathSpy.callCount.should.equal(2); // the insert and the modify
      });

      it('Registering on a reference to /', function() {
        var pathSpy = sinon.spy();

        workspace.insert('referenceToElement2', PropertyFactory.create('Reference', 'single'));
        workspace.get('referenceToElement2', RESOLVE_NO_LEAFS).setValue('/');

        dataBinder.registerOnPath('referenceToElement2', ['insert'], pathSpy);

        pathSpy.callCount.should.equal(1); // the 'insert' of the root of the workspace!
      });

      it('Register on /', function() {
        var pathSpy = sinon.spy();

        dataBinder.registerOnPath('/', ['insert'], pathSpy);

        pathSpy.callCount.should.equal(1); // the 'insert' of the root of the workspace!
      });

      it('Register on / collectionInsert', function() {
        var callback = (key, in_context) => {
          in_context.getAbsolutePath().should.equal('/thing');
        };

        dataBinder.registerOnPath('/', ['collectionInsert'], callback);

        workspace.insert('thing', PropertyFactory.create('Int32', 'single'));

      });

      it('Registering on a non-existing array element, then removing, then making it exist', function() {
        var pathSpy = sinon.spy();

        workspace.insert('referenceToElement2', PropertyFactory.create('Reference', 'single'));
        workspace.get('referenceToElement2', RESOLVE_NO_LEAFS).setValue('/childArray[2]');

        dataBinder.registerOnPath('referenceToElement2', ['insert', 'modify', 'remove'], pathSpy);

        workspace.insert('childArray', PropertyFactory.create(ParentTemplate.typeid, 'array'));

        // Put one shy of the registered path
        workspace.get(['childArray']).push(PropertyFactory.create(ParentTemplate.typeid, 'single'));
        workspace.get(['childArray']).push(PropertyFactory.create(ParentTemplate.typeid, 'single'));

        // The element referred to by the register doesn't exist yet, but we remove first
        workspace.get(['childArray']).remove(1);
        workspace.get(['childArray']).remove(0);

        pathSpy.callCount.should.equal(0);

        // Now add enough that the referred path will be 'connected'
        workspace.get(['childArray']).push(PropertyFactory.create(ParentTemplate.typeid, 'single'));
        workspace.get(['childArray']).push(PropertyFactory.create(ParentTemplate.typeid, 'single'));

        workspace.get(['childArray']).push(PropertyFactory.create(ParentTemplate.typeid, 'single'));

        pathSpy.callCount.should.equal(1);
      });

      it('Registering on a non-existing array element, making it exist, removing, readding', function() {
        var pathSpy = sinon.spy();

        workspace.insert('referenceToElement2', PropertyFactory.create('Reference', 'single'));
        workspace.get('referenceToElement2', RESOLVE_NO_LEAFS).setValue('/childArray[2]');

        dataBinder.registerOnPath('referenceToElement2', ['insert', 'modify', 'remove'], pathSpy);

        workspace.insert('childArray', PropertyFactory.create(ParentTemplate.typeid, 'array'));

        // Put enough such that the registered path exists
        workspace.get(['childArray']).push(PropertyFactory.create(ParentTemplate.typeid, 'single'));
        workspace.get(['childArray']).push(PropertyFactory.create(ParentTemplate.typeid, 'single'));
        workspace.get(['childArray']).push(PropertyFactory.create(ParentTemplate.typeid, 'single'));

        pathSpy.callCount.should.equal(1);

        // Now remove from the end -- killing that last item. The registration shouldn't disappear
        workspace.get(['childArray']).remove(2);
        pathSpy.callCount.should.equal(2);

        // Add it back - does our callback still exist?
        workspace.get(['childArray']).push(PropertyFactory.create(ParentTemplate.typeid, 'single'));
        pathSpy.callCount.should.equal(3);
      });

      it('already existing path with (nested) arrays', function() {
        workspace.insert('child1', PropertyFactory.create('NodeProperty', 'single'));
        workspace.get('child1').insert('childArray', PropertyFactory.create(ParentTemplate.typeid, 'array'));
        workspace.get(['child1', 'childArray']).push(PropertyFactory.create(ParentTemplate.typeid, 'single'));
        workspace.get(['child1', 'childArray']).push(PropertyFactory.create(ParentTemplate.typeid, 'single'));
        workspace.get(['child1', 'childArray']).push(PropertyFactory.create(ParentTemplate.typeid, 'single'));
        // add nested array
        var parentProp = workspace.get(['child1', 'childArray', '1']);
        parentProp.insert('nestedArray', PropertyFactory.create(ParentTemplate.typeid, 'array'));
        var nestedArray = parentProp.get('nestedArray');
        nestedArray.insertRange(0, _.map([1, 2, 3, 4, 5, 6], function(i) {
          return PropertyFactory.create(ParentTemplate.typeid, undefined, {
            text: String(i)
          });
        }));
        var pathSpy = sinon.spy();
        var pathSpy2 = sinon.spy();
        dataBinder.registerOnPath('child1.childArray[2]', ['insert', 'modify', 'remove'], pathSpy);
        dataBinder.registerOnPath('child1.childArray[1].nestedArray[2]', ['insert', 'modify', 'remove'], pathSpy2);
        // insert notifications since the path already exists
        pathSpy.callCount.should.equal(1);
        pathSpy.resetHistory();
        pathSpy2.callCount.should.equal(1);
        pathSpy2.resetHistory();
        // modify properties
        var stringProp = workspace.get(['child1', 'childArray', '2', 'text']);
        stringProp.setValue('forty two');
        pathSpy.callCount.should.equal(1);
        pathSpy.resetHistory();
        var stringProp2 = workspace.get(['child1', 'childArray', '1', 'nestedArray', '2', 'text']);
        stringProp2.setValue('forty two');
        pathSpy2.callCount.should.equal(1);
        pathSpy2.resetHistory();
        // remove the property corresponding to PathSpy
        workspace.get(['child1', 'childArray']).remove(2);
        pathSpy.callCount.should.equal(1);
        pathSpy.resetHistory();
        // insert above the highest reference
        nestedArray.insert(4, PropertyFactory.create(ParentTemplate.typeid, undefined, {
          text: String('four a')
        }));
        // remove below the highest reference
        nestedArray.remove(4);
        // remove from the array before the path callback -> should throw
        // TODO: temporaily disabled because HFDM (at least 3.0.0-alpha-36) catches all exceptions
        // TODO so we don't have a chance of testing that here... :(
        //        (function() { nestedArray.remove(0); }).should.throw(Error);
      });

      it('non-existing path with (already existing) array that needs to be extended', function() {
        workspace.insert('child1', PropertyFactory.create('NodeProperty', 'single'));
        workspace.get('child1').insert('childArray', PropertyFactory.create(ParentTemplate.typeid, 'array'));
        workspace.get(['child1', 'childArray']).push(PropertyFactory.create(ParentTemplate.typeid, 'single'));
        workspace.get(['child1', 'childArray']).push(PropertyFactory.create(ParentTemplate.typeid, 'single'));
        workspace.get(['child1', 'childArray']).push(PropertyFactory.create(ParentTemplate.typeid, 'single'));
        // add nested array
        var parentProp = workspace.get(['child1', 'childArray', '1']);
        parentProp.insert('nestedArray', PropertyFactory.create(ParentTemplate.typeid, 'array'));
        var nestedArray = parentProp.get('nestedArray');
        nestedArray.insertRange(0, _.map([1, 2, 3, 4, 5, 6], function(i) {
          return PropertyFactory.create(ParentTemplate.typeid, undefined, {
            text: String(i)
          });
        }));
        var pathSpy = sinon.spy();
        var pathSpy2 = sinon.spy();
        dataBinder.registerOnPath('child1.childArray[5]', ['insert', 'modify', 'remove'], pathSpy);
        dataBinder.registerOnPath('child1.childArray[1].nestedArray[2]', ['insert', 'modify', 'remove'], pathSpy2);

        // add more children so that our first path callback will have a corresponding Property
        workspace.get(['child1', 'childArray']).push(PropertyFactory.create(ParentTemplate.typeid, 'single'));
        workspace.get(['child1', 'childArray']).push(PropertyFactory.create(ParentTemplate.typeid, 'single'));
        workspace.get(['child1', 'childArray']).push(PropertyFactory.create(ParentTemplate.typeid, 'single'));

        // insert notification for pathSpy
        pathSpy.callCount.should.equal(1);
        pathSpy.resetHistory();
        // insert for pathSpy2
        pathSpy2.callCount.should.equal(1);
        pathSpy2.resetHistory();

        // modify properties
        var stringProp = workspace.get(['child1', 'childArray', '5', 'text']);
        stringProp.setValue('forty two');
        pathSpy.callCount.should.equal(1);
        pathSpy.resetHistory();
        var stringProp2 = workspace.get(['child1', 'childArray', '1', 'nestedArray', '2', 'text']);
        stringProp2.setValue('forty two');
        pathSpy2.callCount.should.equal(1);
        pathSpy2.resetHistory();
        // remove an element below the property that corresponds to pathSpy -> should throw
        // TODO: temporaily disabled because HFDM (at least 3.0.0-alpha-36) catches all exceptions
        // TODO so we don't have a chance of testing that here... :(
        // TODO: this does not throw anymore, to be investigated
        // (function() { workspace.get(['child1', 'childArray']).remove(2); }).should.throw(Error);
      });

      it('should be able to register on some path from an explicity nested schema and react to changes in the subtree',
        function() {
          dataBinder.attachTo(workspace);

          workspace.insert('point2D', PropertyFactory.create(point2DExplicitTemplate.typeid, 'single'));

          const pathSpy = sinon.spy();
          dataBinder.registerOnPath('/point2D.position', ['modify'], pathSpy);

          workspace.get('point2D').get('position').get('x').value = 42;
          workspace.get('point2D').get('position').get('y').value = 42;

          // We do the modifications outside of a modifiedEventScope, so we expect to hear about it twice
          pathSpy.callCount.should.equal(2);
        });

      it('register on a structure and react to changes in the subtree LYNXDEV-5365',
        function() {
          dataBinder.attachTo(workspace);

          workspace.insert('point2D', PropertyFactory.create(point2DExplicitTemplate.typeid, 'single'));

          const pathSpy = sinon.spy();
          dataBinder.registerOnPath('/point2D.position', ['modify'], pathSpy);

          workspace.pushModifiedEventScope();
          workspace.get('point2D').get('position').get('x').value = 42;
          workspace.get('point2D').get('position').get('y').value = 42;
          workspace.popModifiedEventScope();

          // We do the modifications inside a modifiedEventScope, so we expect to only hear about it once
          pathSpy.callCount.should.equal(1);
        });

      it('should be able to register on some path from an implicitly nested schema ' +
      'and react to changes in the subtree (LYNXDEV-4949)', function() {
        dataBinder.attachTo(workspace);

        workspace.insert('point2D', PropertyFactory.create(point2DImplicitTemplate.typeid, 'single'));

        const pathSpy = sinon.spy();
        dataBinder.registerOnPath('point2D.position', ['modify'], pathSpy);

        workspace.get('point2D').get('position').get('x').value = 42;
        workspace.get('point2D').get('position').get('y').value = 42;
        pathSpy.callCount.should.equal(2);
      });

      it.skip('never existing path with remove callback (LYNXDEV-3563)', function() {
        var pathSpy = sinon.spy();
        dataBinder.registerOnPath('a.b.c.d', ['insert', 'modify', 'remove'], pathSpy);
        workspace.insert('a', PropertyFactory.create('NodeProperty'));
        workspace.get('a').insert('b', PropertyFactory.create('NodeProperty'));
        workspace.get(['a', 'b']).insert('c', PropertyFactory.create('NodeProperty'));
        pathSpy.callCount.should.equal(0);

        // When we remove 'c', the databinder gets a changeset saying 'c' has been removed.
        // The DataBinder isn't tracking anything internally that says whether 'd' was ever
        // instantiated, and the changeset doesn't include that information either. So the
        // Databinder naively assumes that 'd' was there, and fires an event for it.
        workspace.get(['a', 'b']).remove('c');
        pathSpy.callCount.should.equal(0);

      });

      it('modify already existing path gives valid path in ModificationContext', function() {
        var primitiveChildPset = PropertyFactory.create(PrimitiveChildrenTemplate.typeid, 'single');
        workspace.insert('myPrimitiveChildTemplate', primitiveChildPset);
        var pathSpy = sinon.spy(function(in_modificationContext) {
          in_modificationContext.getAbsolutePath().should.equal(primitiveChildPset.get('aString').getAbsolutePath());
        });
        dataBinder.registerOnPath('myPrimitiveChildTemplate.aString', ['modify'], pathSpy);

        pathSpy.callCount.should.equal(0);
        var stringProperty = workspace.get(['myPrimitiveChildTemplate', 'aString']);
        stringProperty.setValue('hello');
        pathSpy.callCount.should.equal(1);
      });

      it('also works after unregister()', function() {
        const primitiveChildPset = PropertyFactory.create(PrimitiveChildrenTemplate.typeid, 'single');
        workspace.insert('myPrimitiveChildTemplate', primitiveChildPset);
        const pathSpy = sinon.spy(function(in_modificationContext) {
          in_modificationContext.getAbsolutePath().should.equal(primitiveChildPset.get('aString').getAbsolutePath());
        });
        dataBinder.registerOnPath('myPrimitiveChildTemplate.aString', ['modify'], pathSpy);
        pathSpy.callCount.should.equal(0);
        const stringProperty = workspace.get(['myPrimitiveChildTemplate', 'aString']);
        stringProperty.setValue('hello');
        pathSpy.callCount.should.equal(1);
        pathSpy.resetHistory();
        // define/activate bindings
        dataBinder.register('BINDING', PrimitiveChildrenTemplate.typeid, ParentDataBinding);
        dataBinder._dataBindingCreatedCounter.should.equal(1);

        // unregister bindings -> shouldn't unregister the internal binding
        dataBinder.unregisterDataBindings();

        // absolute path callback should still work
        stringProperty.setValue('hello again');
        pathSpy.callCount.should.equal(1);
        pathSpy.resetHistory();
      });

      it('also works after detach() / attachTo()', function() {
        const primitiveChildPset = PropertyFactory.create(PrimitiveChildrenTemplate.typeid, 'single');
        workspace.insert('myPrimitiveChildTemplate', primitiveChildPset);
        const pathModifySpy = sinon.spy(function(in_modificationContext) {
          in_modificationContext.getAbsolutePath().should.equal(primitiveChildPset.get('aString').getAbsolutePath());
        });
        // we don't insert/remove the property ourselves after registering so all insert/remove events are simulated
        const pathRemoveSpy = sinon.spy(function(in_context) {
          in_context.isSimulated().should.equal(true);
        });
        const pathInsertSpy = sinon.spy(function(in_context) {
          in_context.isSimulated().should.equal(true);
        });
        dataBinder.registerOnPath('/myPrimitiveChildTemplate.aString', ['modify'], pathModifySpy);
        dataBinder.registerOnPath('/myPrimitiveChildTemplate.aString', ['remove'], pathRemoveSpy);
        dataBinder.registerOnPath('/myPrimitiveChildTemplate.aString', ['insert'], pathInsertSpy);
        pathModifySpy.callCount.should.equal(0);
        pathInsertSpy.callCount.should.equal(1); // DataBinder calls insert immediately when registering
        pathRemoveSpy.callCount.should.equal(0);
        pathInsertSpy.resetHistory();
        const stringProperty = workspace.get(['myPrimitiveChildTemplate', 'aString']);
        stringProperty.setValue('hello');
        pathModifySpy.callCount.should.equal(1);
        pathModifySpy.resetHistory();
        // detach workspace
        dataBinder.detach();
        pathModifySpy.callCount.should.equal(0);
        pathInsertSpy.callCount.should.equal(0);
        pathRemoveSpy.callCount.should.equal(1);
        pathRemoveSpy.resetHistory();

        // absolute path callback should not fire now
        stringProperty.setValue('hello again');
        pathModifySpy.callCount.should.equal(0);
        // reattach workspace
        dataBinder.attachTo(workspace);
        pathModifySpy.callCount.should.equal(0);
        pathInsertSpy.callCount.should.equal(1);
        pathRemoveSpy.callCount.should.equal(0);
        pathInsertSpy.resetHistory();

        // absolute path callback should fire again after reattaching
        stringProperty.setValue('hello yet again');
        pathModifySpy.callCount.should.equal(1);
        pathInsertSpy.callCount.should.equal(0);
        pathRemoveSpy.callCount.should.equal(0);
        pathModifySpy.resetHistory();
      });

    });

    describe('should work for special cases with entities and absolute path registered', function() {
      const callbackSpy = sinon.spy();
      const absoluteCallbackSpy = sinon.spy();
      let nodePset;
      beforeEach(function() {
        nodePset = PropertyFactory.create(NodeContainerTemplate.typeid, 'single');
        callbackSpy.resetHistory();
        absoluteCallbackSpy.resetHistory();
      });

      it('for insertion', function() {
        ParentDataBinding.registerOnPath('child', ['insert'], callbackSpy);
        dataBinder.register('BINDING', 'NodeProperty', ParentDataBinding);
        callbackSpy.callCount.should.equal(0);

        dataBinder.registerOnPath('nodeProperty.child', ['insert'], absoluteCallbackSpy);
        workspace.insert('nodeProperty', nodePset);
        callbackSpy.callCount.should.equal(0);
        nodePset.insert('child', PropertyFactory.create(ParentTemplate.typeid));

        callbackSpy.callCount.should.equal(1);
        absoluteCallbackSpy.callCount.should.equal(1);
      });
      it('for modifications', function() {
        workspace.insert('nodeProperty', nodePset);
        ParentDataBinding.registerOnPath('text', ['modify'], callbackSpy);
        dataBinder.register('BINDING', 'NodeProperty', ParentDataBinding);
        dataBinder._dataBindingCreatedCounter.should.equal(3);

        dataBinder.registerOnPath('nodeProperty.text', ['modify'], absoluteCallbackSpy);
        nodePset.get('text').value = 'newText';
        callbackSpy.callCount.should.equal(1);
        absoluteCallbackSpy.callCount.should.equal(1);
      });
      it('for removals', function() {
        workspace.insert('nodeProperty', nodePset);
        nodePset.insert('child', PropertyFactory.create(ParentTemplate.typeid));
        ParentDataBinding.registerOnPath('child', ['remove'], callbackSpy);
        dataBinder.register('BINDING', 'NodeProperty', ParentDataBinding);

        dataBinder.registerOnPath('nodeProperty.child', ['remove'], absoluteCallbackSpy);
        nodePset.remove('child');
        callbackSpy.callCount.should.equal(1);
        absoluteCallbackSpy.callCount.should.equal(1);
      });

    });

    describe('should hear about arrays', function() {
      beforeEach(() => {
        workspace.insert('child1', PropertyFactory.create('NodeProperty', 'single'));
        workspace.get('child1').insert('childArray', PropertyFactory.create(ParentTemplate.typeid, 'array'));
      });

      it('insertions', function() {
        const pathSpy = sinon.spy();
        dataBinder.registerOnPath('child1.childArray', ['insert'], pathSpy);
        pathSpy.callCount.should.equal(1);
      });

      it('removals', function() {
        const pathSpy = sinon.spy();
        dataBinder.registerOnPath('child1.childArray', ['remove'], pathSpy);
        workspace.get('child1').remove('childArray');
        pathSpy.callCount.should.equal(1);
      });
    });

    describe('should work for arrays', function() {
      beforeEach(function() {
        workspace.insert('child1', PropertyFactory.create('NodeProperty', 'single'));
        workspace.get('child1').insert('childArray', PropertyFactory.create(ParentTemplate.typeid, 'array'));
      });

      it('insertions', function() {
        const pathSpy = sinon.spy();
        dataBinder.registerOnPath('child1.childArray', ['collectionInsert'], pathSpy);
        workspace.get(['child1', 'childArray']).push(PropertyFactory.create(ParentTemplate.typeid, 'single'));
        pathSpy.callCount.should.equal(1);
      });

      it('modifications', function() {
        const pathSpy = sinon.spy();
        dataBinder.registerOnPath('child1.childArray', ['collectionModify'], pathSpy);
        workspace.get(['child1', 'childArray']).push(PropertyFactory.create(ParentTemplate.typeid, 'single'));
        workspace.get(['child1', 'childArray', 0]).get('text').value = 'new value';
        pathSpy.callCount.should.equal(1);
      });

      it('removals', function() {
        const pathSpy = sinon.spy();
        dataBinder.registerOnPath('child1.childArray', ['collectionRemove'], pathSpy);
        workspace.get(['child1', 'childArray']).push(PropertyFactory.create(ParentTemplate.typeid, 'single'));
        workspace.get(['child1', 'childArray']).remove(0);
        pathSpy.callCount.should.equal(1);
      });
    });

    describe('should work for maps', function() {
      beforeEach(function() {
        workspace.insert('child1', PropertyFactory.create('NodeProperty', 'single'));
        workspace.get('child1').insert('childArray', PropertyFactory.create(ParentTemplate.typeid, 'map'));
      });

      it('insertions', function() {
        const pathSpy = sinon.spy();
        dataBinder.registerOnPath('child1.childArray', ['collectionInsert'], pathSpy);
        workspace.get(['child1', 'childArray']).set('test', PropertyFactory.create(ParentTemplate.typeid));
        pathSpy.callCount.should.equal(1);
      });

      it('modifications', function() {
        const pathSpy = sinon.spy();
        dataBinder.registerOnPath('child1.childArray', ['collectionModify'], pathSpy);
        workspace.get(['child1', 'childArray']).set('test', PropertyFactory.create(ParentTemplate.typeid));
        workspace.get(['child1', 'childArray', 'test']).get('text').value = 'new value';
        pathSpy.callCount.should.equal(1);
      });

      it('removals', function() {
        const pathSpy = sinon.spy();
        dataBinder.registerOnPath('child1.childArray', ['collectionRemove'], pathSpy);
        workspace.get(['child1', 'childArray']).set('test', PropertyFactory.create(ParentTemplate.typeid));
        workspace.get(['child1', 'childArray']).remove('test');
        pathSpy.callCount.should.equal(1);
      });
    });

    describe('should work for sets', function() {
      beforeEach(function() {
        workspace.insert('child1', PropertyFactory.create('NodeProperty', 'single'));
        workspace.get('child1').insert('childArray', PropertyFactory.create(ParentTemplate.typeid, 'set'));
      });

      it('insertions', function() {
        const pathSpy = sinon.spy();
        dataBinder.registerOnPath('child1.childArray', ['collectionInsert'], pathSpy);
        workspace.get(['child1', 'childArray']).insert(PropertyFactory.create(ParentTemplate.typeid));
        pathSpy.callCount.should.equal(1);
      });

      it('modifications', function() {
        const pathSpy = sinon.spy();
        dataBinder.registerOnPath('child1.childArray', ['collectionModify'], pathSpy);
        const namedProp = PropertyFactory.create(ParentTemplate.typeid);
        workspace.get(['child1', 'childArray']).insert(namedProp);
        namedProp.get('text').value = 'new value';
        pathSpy.callCount.should.equal(1);
      });

      it('removals', function() {
        const pathSpy = sinon.spy();
        dataBinder.registerOnPath('child1.childArray', ['collectionRemove'], pathSpy);
        const namedProp = PropertyFactory.create(ParentTemplate.typeid);
        workspace.get(['child1', 'childArray']).insert(namedProp);
        workspace.get(['child1', 'childArray']).remove(namedProp.getId());
        pathSpy.callCount.should.equal(1);
      });
    });
  });
})();
