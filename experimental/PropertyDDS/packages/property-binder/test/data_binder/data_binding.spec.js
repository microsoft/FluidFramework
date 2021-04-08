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
import {
  onValuesChanged, onPropertyChanged, onPathChanged, DataBinding
} from '../../src/data_binder/data_binding';
import { unregisterAllOnPathListeners } from '../../src/data_binder/internal_utils';
import {
  registerTestTemplates, ParentTemplate, ChildTemplate, ReferenceParentTemplate,
  PrimitiveChildrenTemplate, NodeContainerTemplate, ArrayContainerTemplate,
  MapContainerTemplate, SetContainerTemplate,
  InheritedChildTemplate, InheritedInheritedChildTemplate,
  positionTemplate, point2DImplicitTemplate, point2DExplicitTemplate, referenceContainerTemplate
} from './testTemplates';
import {
  ParentDataBinding, ChildDataBinding, PrimitiveChildrenDataBinding, InheritedChildDataBinding,
  DerivedDataBinding, DerivedDerivedDataBinding
} from './testDataBindings';
import { catchConsoleErrors } from './catch_console_errors';
import { RESOLVE_NO_LEAFS } from '../../src/internal/constants';
import { BaseProperty, HFDM, PropertyFactory } from '@adsk/forge-hfdm';
import { ModificationContext } from '../../src/data_binder/modification_context';

// Create a mock THREE.Object3D
class Vector3 {
  constructor() {
    this.x = this.y = this.z = 0;
  }

  set(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
  }
}

class Object3D {
  constructor() {
    this.name = '';
    this.position = new Vector3();
    this.scale = new Vector3();
  }
}

const THREE = {
  Object3D: Object3D
};

const Vector3DSchema = {
  typeid: 'autodesk.samples:vector3D-1.0.0',
  properties: [
    { id: 'x', typeid: 'Float64' },
    { id: 'y', typeid: 'Float64' },
    { id: 'z', typeid: 'Float64' }
  ]
};

// SnippetStart{DataBinder.Object3DBinding.Schema}
const Object3DSchema = {
  typeid: 'autodesk.samples:object3D-1.0.0',
  properties: [
    { id: 'pos', typeid: 'autodesk.samples:vector3D-1.0.0' },
    { id: 'scale', typeid: 'autodesk.samples:vector3D-1.0.0' },
    { id: 'name', typeid: 'String' }
  ]
};
// SnippetEnd{DataBinder.Object3DBinding.Schema}

(function() {

  describe('DataBinding.registerOnPath() should work for', function() {
    var dataBinder, hfdm, workspace;

    catchConsoleErrors();

    before(function() {
      registerTestTemplates();

      PropertyFactory.register(Vector3DSchema);
      PropertyFactory.register(Object3DSchema);
    });

    beforeEach(function() {
      // console.log('inner before each');
      dataBinder = new DataBinder();

      hfdm = new HFDM();
      workspace = hfdm.createWorkspace();
      return workspace.initialize({local: true});
    });

    afterEach(function() {
      // Unbind checkout view
      dataBinder.detach();

      // Unregister DataBinding paths
      _.forEach([
        ParentDataBinding,
        ChildDataBinding,
        PrimitiveChildrenDataBinding,
        InheritedChildDataBinding,
        DerivedDataBinding
      ],
      unregisterAllOnPathListeners
      );

      dataBinder = null;
    });

    it('registering deferred in a constructor', function() {
      class MyBinding extends DataBinding {
        constructor(params) { // eslint-disable-line no-useless-constructor
          super(params);

          this.getDataBinder().registerOnPath('/myPrimitiveChildTemplate', ['insert', 'modify'], function() {
            // Deferred, so this should be false
            this.getDataBinder()._activeTraversal.should.equal(false);
          }, {
            isDeferred: true
          });
        }
      }

      dataBinder.attachTo(workspace);
      var primitiveChildPset = PropertyFactory.create(PrimitiveChildrenTemplate.typeid, 'single');

      dataBinder.register('BINDING', PrimitiveChildrenTemplate.typeid, MyBinding);

      workspace.insert('myPrimitiveChildTemplate', primitiveChildPset);
    });

    it('onModify', function() {
      // Register the base (Child) typeid
      var stringSpy = sinon.spy();
      var mapSpy = sinon.spy();

      PrimitiveChildrenDataBinding.registerOnPath('aString', ['modify'], stringSpy);
      PrimitiveChildrenDataBinding.registerOnPath('mapOfNumbers', ['modify'], mapSpy);
      dataBinder.register('BINDING', PrimitiveChildrenTemplate.typeid, PrimitiveChildrenDataBinding);

      // Create PSet for inherited child typeid
      var primitiveChildPset = PropertyFactory.create(PrimitiveChildrenTemplate.typeid, 'single');
      dataBinder._dataBindingCreatedCounter.should.equal(0);
      dataBinder.attachTo(workspace);

      // primitiveChildPset should produce a PrimitiveChildrenDataBinding
      workspace.insert('myPrimitiveChildTemplate', primitiveChildPset);
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      const primitiveChildDataBinding = dataBinder.resolve(primitiveChildPset.getAbsolutePath(), 'BINDING');
      primitiveChildDataBinding.should.be.instanceOf(PrimitiveChildrenDataBinding);
      primitiveChildDataBinding.getProperty().should.eql(primitiveChildPset);
      primitiveChildDataBinding.onModify.callCount.should.equal(0); // !!!
      primitiveChildDataBinding.onPreModify.callCount.should.equal(primitiveChildDataBinding.onModify.callCount);
      primitiveChildDataBinding.onModify.resetHistory();
      primitiveChildDataBinding.onPreModify.resetHistory();
      primitiveChildDataBinding.onPostCreate.callCount.should.equal(1);
      // our specific onModify function shouldn't get called because it was an insert, not a modify operation
      stringSpy.callCount.should.equal(0);
      dataBinder._resetDebugCounters();

      // Should notify DataBinding when primitive property is changed
      primitiveChildPset.resolvePath('aString').value = 'hello';
      primitiveChildDataBinding.onModify.callCount.should.equal(1);
      primitiveChildDataBinding.onPreModify.callCount.should.equal(primitiveChildDataBinding.onModify.callCount);
      primitiveChildDataBinding.onModify.resetHistory();
      primitiveChildDataBinding.onPreModify.resetHistory();
      stringSpy.callCount.should.equal(1);
      stringSpy.resetHistory();

      // Should not notify the special callback when a different primitive property is changed
      primitiveChildPset.resolvePath('aNumber').value = 42;
      primitiveChildDataBinding.onModify.callCount.should.equal(1);
      primitiveChildDataBinding.onPreModify.callCount.should.equal(primitiveChildDataBinding.onModify.callCount);
      primitiveChildDataBinding.onModify.resetHistory();
      primitiveChildDataBinding.onPreModify.resetHistory();
      stringSpy.callCount.should.equal(0);

      // Test modifications on the map
      mapSpy.callCount.should.equal(0);

      // Insertion into a map is a modify for the map itself
      primitiveChildPset.get('mapOfNumbers').insert('numberKey', 23);
      mapSpy.callCount.should.equal(1);

      // Modification of an entry in a map is a modify for the map itself
      primitiveChildPset.get('mapOfNumbers').set('numberKey', 42);
      mapSpy.callCount.should.equal(2);

      var nodeSpy = sinon.spy();
      var nestedChildSpy = sinon.spy();
      ParentDataBinding.registerOnPath('node', ['modify'], nodeSpy);
      ParentDataBinding.registerOnPath('node.child', ['modify'], nestedChildSpy);
      dataBinder.register('BINDING', NodeContainerTemplate.typeid, ParentDataBinding);

      workspace.insert('myNodePropertyTemplate', PropertyFactory.create(NodeContainerTemplate.typeid));
      workspace.get('myNodePropertyTemplate').insert('node', PropertyFactory.create('NodeProperty'));
      workspace.get('myNodePropertyTemplate').get('node').insert('child', PropertyFactory.create('String'));
      nodeSpy.callCount.should.equal(1);
      nestedChildSpy.callCount.should.equal(0);
      workspace.get(['myNodePropertyTemplate', 'node', 'child']).setValue('testString');
      nodeSpy.callCount.should.equal(2);
      nestedChildSpy.callCount.should.equal(1);
    });

    it('onInsert', function() {
      // Register the base (Child) typeid
      var anotherThingSpy = sinon.spy();
      ParentDataBinding.registerOnPath('anotherThing', ['insert'], anotherThingSpy);
      var textSpy = sinon.spy();
      ParentDataBinding.registerOnPath('text', ['insert'], textSpy);

      var nestedChildSpy = sinon.spy();
      ParentDataBinding.registerOnPath('node.child', ['insert'], nestedChildSpy);
      dataBinder.register('BINDING', NodeContainerTemplate.typeid, ParentDataBinding);

      // Create PSet for inherited child typeid
      var nodeContainerPset = PropertyFactory.create(NodeContainerTemplate.typeid, 'single');
      dataBinder._dataBindingCreatedCounter.should.equal(0);
      dataBinder.attachTo(workspace);

      // primitiveChildPset should produce a PrimitiveChildrenDataBinding
      workspace.insert('myNodeContainerTemplate', nodeContainerPset);
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      const parentDataBinding = dataBinder.resolve(nodeContainerPset.getAbsolutePath(), 'BINDING');
      parentDataBinding.should.be.instanceOf(ParentDataBinding);
      parentDataBinding.getProperty().should.eql(nodeContainerPset);
      parentDataBinding.onModify.callCount.should.equal(0); // !!!
      parentDataBinding.onPreModify.callCount.should.equal(parentDataBinding.onModify.callCount);
      parentDataBinding.onModify.resetHistory();
      parentDataBinding.onPreModify.resetHistory();
      parentDataBinding.onPostCreate.callCount.should.equal(1);
      // our specific onModify function shouldn't get called because we haven't inserted anything yet
      anotherThingSpy.callCount.should.equal(0);
      textSpy.callCount.should.equal(1);
      dataBinder._resetDebugCounters();
      textSpy.resetHistory();

      // Should notify DataBinding when primitive property is inserted into the watched path
      var dummyPset = PropertyFactory.create(ParentTemplate.typeid, 'single');
      nodeContainerPset.insert('anotherThing', dummyPset);
      parentDataBinding.onModify.callCount.should.equal(1);
      parentDataBinding.onPreModify.callCount.should.equal(parentDataBinding.onModify.callCount);
      parentDataBinding.onModify.resetHistory();
      parentDataBinding.onPreModify.resetHistory();
      anotherThingSpy.callCount.should.equal(1);
      anotherThingSpy.resetHistory();

      // Should not notify the special callback when a different primitive property is changed
      var dummyPset2 = PropertyFactory.create(ParentTemplate.typeid, 'single');
      nodeContainerPset.insert('anotherAnotherThing', dummyPset2);
      parentDataBinding.onModify.callCount.should.equal(1);
      parentDataBinding.onPreModify.callCount.should.equal(parentDataBinding.onModify.callCount);
      parentDataBinding.onModify.resetHistory();
      parentDataBinding.onPreModify.resetHistory();
      anotherThingSpy.callCount.should.equal(0);
      textSpy.callCount.should.equal(0);

      nestedChildSpy.callCount.should.equal(0);
      nodeContainerPset.insert('node', PropertyFactory.create('NodeProperty'));
      nestedChildSpy.callCount.should.equal(0);
      nodeContainerPset.get('node').insert('child', PropertyFactory.create('String'));
      nestedChildSpy.callCount.should.equal(1);
    });

    it('onRemove', function() {
      var anotherThingRemoveSpy = sinon.spy();
      var textRemoveSpy = sinon.spy();
      var nestedChildRemoveSpy = sinon.spy();
      ParentDataBinding.registerOnPath('another.nested.thing', ['remove'], anotherThingRemoveSpy);
      ParentDataBinding.registerOnPath('text', ['remove'], textRemoveSpy);
      ParentDataBinding.registerOnPath('node.child', ['remove'], nestedChildRemoveSpy);
      // Register the base (Child) typeid
      dataBinder.register('BINDING', NodeContainerTemplate.typeid, ParentDataBinding);

      // Create PSet for inherited child typeid
      dataBinder._dataBindingCreatedCounter.should.equal(0);
      dataBinder.attachTo(workspace);

      // primitiveChildPset should produce a PrimitiveChildrenDataBinding
      var nodeContainerPset = PropertyFactory.create(NodeContainerTemplate.typeid, 'single');
      workspace.insert('myNodeContainerTemplate', nodeContainerPset);
      nodeContainerPset.insert('node', PropertyFactory.create('NodeProperty'));
      nodeContainerPset.get('node').insert('child', PropertyFactory.create('String'));

      workspace.remove('myNodeContainerTemplate');
      textRemoveSpy.callCount.should.equal(1);
      nestedChildRemoveSpy.callCount.should.equal(1);
      anotherThingRemoveSpy.callCount.should.equal(0);
    });

    it('nested Paths', function() {
      var nestedSpy = sinon.spy();
      PrimitiveChildrenDataBinding.registerOnPath('nested', ['modify'], nestedSpy);
      var numberSpy = sinon.spy();
      PrimitiveChildrenDataBinding.registerOnPath('nested.aNumber', ['modify'], numberSpy);
      // Register the base (Child) typeid
      dataBinder.register('BINDING', PrimitiveChildrenTemplate.typeid, PrimitiveChildrenDataBinding);

      // Create PSet for inherited child typeid
      var primitiveChildPset = PropertyFactory.create(PrimitiveChildrenTemplate.typeid, 'single');
      dataBinder._dataBindingCreatedCounter.should.equal(0);
      dataBinder.attachTo(workspace);

      // primitiveChildPset should produce a PrimitiveChildrenDataBinding
      workspace.insert('myPrimitiveChildTemplate', primitiveChildPset);
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      const primitiveChildDataBinding = dataBinder.resolve(primitiveChildPset.getAbsolutePath(), 'BINDING');
      primitiveChildDataBinding.should.be.instanceOf(PrimitiveChildrenDataBinding);
      primitiveChildDataBinding.getProperty().should.eql(primitiveChildPset);
      primitiveChildDataBinding.onModify.callCount.should.equal(0); // !!!
      primitiveChildDataBinding.onPreModify.callCount.should.equal(primitiveChildDataBinding.onModify.callCount);
      primitiveChildDataBinding.onModify.resetHistory();
      primitiveChildDataBinding.onPreModify.resetHistory();
      primitiveChildDataBinding.onPostCreate.callCount.should.equal(1);

      primitiveChildPset.resolvePath('nested.aNumber').setValue(23);
      nestedSpy.callCount.should.equal(1);
      numberSpy.callCount.should.equal(1);

      // Should notify DataBinding when primitive property is inserted into the watched path
      primitiveChildPset.resolvePath('nested.aNumber').setValue(42);
      primitiveChildDataBinding.onModify.callCount.should.equal(2);
      primitiveChildDataBinding.onPreModify.callCount.should.equal(primitiveChildDataBinding.onModify.callCount);
      primitiveChildDataBinding.onModify.resetHistory();
      primitiveChildDataBinding.onPreModify.resetHistory();
      numberSpy.callCount.should.equal(2);
      nestedSpy.callCount.should.equal(2);
      numberSpy.resetHistory();
    });

    it('primitive collections', function() {
      // Register the base (Child) typeid

      var mapInsertSpy = sinon.spy();
      var mapModifySpy = sinon.spy();
      var mapRemoveSpy = sinon.spy();
      PrimitiveChildrenDataBinding.registerOnPath('mapOfNumbers', ['collectionInsert'], mapInsertSpy);
      PrimitiveChildrenDataBinding.registerOnPath('mapOfNumbers', ['collectionModify'], mapModifySpy);
      PrimitiveChildrenDataBinding.registerOnPath('mapOfNumbers', ['collectionRemove'], mapRemoveSpy);

      var arrayInsertSpy = sinon.spy();
      var arrayModifySpy = sinon.spy();
      var arrayRemoveSpy = sinon.spy();
      PrimitiveChildrenDataBinding.registerOnPath('arrayOfNumbers', ['collectionInsert'], arrayInsertSpy);
      PrimitiveChildrenDataBinding.registerOnPath('arrayOfNumbers', ['collectionModify'], arrayModifySpy);
      PrimitiveChildrenDataBinding.registerOnPath('arrayOfNumbers', ['collectionRemove'], arrayRemoveSpy);
      dataBinder.register('BINDING', PrimitiveChildrenTemplate.typeid, PrimitiveChildrenDataBinding);
      dataBinder.attachTo(workspace);

      var primitiveChildPset = PropertyFactory.create(PrimitiveChildrenTemplate.typeid, 'single');
      workspace.insert('myPrimitiveChildTemplate', primitiveChildPset);

      // Expect the insertion of ranges to trigger onInsert messages
      var arrayProperty = workspace.get(['myPrimitiveChildTemplate', 'arrayOfNumbers']);
      arrayProperty.insertRange(0, [1, 2, 3, 4, 5, 6]);
      arrayInsertSpy.callCount.should.equal(6);
      arrayInsertSpy.getCall(0).args[0].should.equal(0);
      arrayInsertSpy.getCall(1).args[0].should.equal(1);
      arrayInsertSpy.getCall(2).args[0].should.equal(2);
      arrayInsertSpy.getCall(3).args[0].should.equal(3);
      arrayInsertSpy.getCall(4).args[0].should.equal(4);
      arrayInsertSpy.getCall(5).args[0].should.equal(5);
      arrayInsertSpy.resetHistory();

      arrayProperty.setRange(1, [5, 6]);
      arrayModifySpy.callCount.should.equal(2);
      arrayModifySpy.getCall(0).args[0].should.equal(1);
      arrayModifySpy.getCall(1).args[0].should.equal(2);
      arrayModifySpy.resetHistory();

      arrayProperty.removeRange(1, 2);
      arrayRemoveSpy.callCount.should.equal(2);
      arrayRemoveSpy.getCall(0).args[0].should.equal(1);
      arrayRemoveSpy.getCall(1).args[0].should.equal(1);
      arrayRemoveSpy.resetHistory();

      // Expect the insertion of map values to trigger onInsert messages
      var mapProperty = workspace.get(['myPrimitiveChildTemplate', 'mapOfNumbers']);
      workspace.pushModifiedEventScope();
      mapProperty.insert('one', 1);
      mapProperty.insert('two', 2);
      mapProperty.insert('three', 3);
      mapProperty.insert('four', 4);
      mapProperty.insert('five', 5);
      workspace.popModifiedEventScope();
      mapInsertSpy.callCount.should.equal(5);
      mapInsertSpy.getCall(0).args[0].should.equal('one');
      mapInsertSpy.getCall(1).args[0].should.equal('two');
      mapInsertSpy.getCall(2).args[0].should.equal('three');
      mapInsertSpy.getCall(3).args[0].should.equal('four');
      mapInsertSpy.getCall(4).args[0].should.equal('five');
      mapInsertSpy.resetHistory();

      // modify map
      workspace.pushModifiedEventScope();
      mapProperty.set('one', 10);
      mapProperty.set('two', 20);
      mapProperty.set('three', 30);
      workspace.popModifiedEventScope();
      mapModifySpy.callCount.should.equal(3);
      mapModifySpy.getCall(0).args[0].should.equal('one');
      mapModifySpy.getCall(1).args[0].should.equal('two');
      mapModifySpy.getCall(2).args[0].should.equal('three');
      mapModifySpy.resetHistory();

      // remove from map
      workspace.pushModifiedEventScope();
      mapProperty.remove('one');
      mapProperty.remove('two');
      mapProperty.remove('three');
      workspace.popModifiedEventScope();
      mapRemoveSpy.callCount.should.equal(3);
      mapRemoveSpy.getCall(0).args[0].should.equal('one');
      mapRemoveSpy.getCall(1).args[0].should.equal('two');
      mapRemoveSpy.getCall(2).args[0].should.equal('three');
      mapRemoveSpy.resetHistory();
    });

    it('composed type array', function() {
      var arrayInsertSpy = sinon.spy();
      var arrayModifySpy = sinon.spy();
      var arrayRemoveSpy = sinon.spy();
      ParentDataBinding.registerOnPath('subArray', ['collectionInsert'], arrayInsertSpy);
      ParentDataBinding.registerOnPath('subArray', ['collectionModify'], arrayModifySpy);
      ParentDataBinding.registerOnPath('subArray', ['collectionRemove'], arrayRemoveSpy);

      // Register the base (Child) typeid
      dataBinder.register('BINDING', ArrayContainerTemplate.typeid, ParentDataBinding);
      dataBinder.attachTo(workspace);

      var arrayContainerPset = PropertyFactory.create(ArrayContainerTemplate.typeid, 'single');
      workspace.insert('myArrayContainerTemplate', arrayContainerPset);

      // Expect the insertion of ranges to trigger onInsert messages
      var arrayProperty = workspace.get(['myArrayContainerTemplate', 'subArray']);
      arrayProperty.insertRange(0, _.map([1, 2, 3, 4, 5, 6], function(i) {
        return PropertyFactory.create('Test:ChildID-0.0.1', undefined, {
          text: String(i)
        });
      }));
      arrayInsertSpy.callCount.should.equal(6);
      arrayInsertSpy.getCall(0).args[0].should.equal(0);
      arrayInsertSpy.getCall(1).args[0].should.equal(1);
      arrayInsertSpy.getCall(2).args[0].should.equal(2);
      arrayInsertSpy.getCall(3).args[0].should.equal(3);
      arrayInsertSpy.getCall(4).args[0].should.equal(4);
      arrayInsertSpy.getCall(5).args[0].should.equal(5);

      arrayInsertSpy.getCall(0).args[1].getNestedChangeSet().typeid.should.equal('Test:ChildID-0.0.1');
      arrayInsertSpy.getCall(0).args[1].getNestedChangeSet().String.text.should.equal('1');
      arrayInsertSpy.getCall(0).args[1].getContext().should.equal('array');
      arrayInsertSpy.getCall(0).args[1].getOperationType().should.equal('insert');
      arrayInsertSpy.getCall(0).args[1].getAbsolutePath().should.equal('/myArrayContainerTemplate.subArray[0]');
      arrayInsertSpy.getCall(4).args[1].getNestedChangeSet().String.text.should.equal('5');

      arrayInsertSpy.resetHistory();

      arrayProperty.get([1, 'text']).setValue('5');
      arrayProperty.get([2, 'text']).setValue('6');
      arrayModifySpy.callCount.should.equal(2);
      arrayModifySpy.getCall(0).args[0].should.equal(1);
      arrayModifySpy.getCall(1).args[0].should.equal(2);

      arrayModifySpy.getCall(0).args[1].getNestedChangeSet().typeid.should.equal('Test:ChildID-0.0.1');
      arrayModifySpy.getCall(0).args[1].getNestedChangeSet().String.text.should.equal('5');
      arrayModifySpy.getCall(0).args[1].getContext().should.equal('array');
      arrayModifySpy.getCall(0).args[1].getOperationType().should.equal('modify');
      arrayModifySpy.getCall(0).args[1].getAbsolutePath().should.equal('/myArrayContainerTemplate.subArray[1]');
      arrayModifySpy.getCall(1).args[1].getNestedChangeSet().String.text.should.equal('6');
      arrayModifySpy.resetHistory();

      arrayProperty.removeRange(1, 2);
      arrayRemoveSpy.callCount.should.equal(2);
      arrayRemoveSpy.getCall(0).args[0].should.equal(1);
      arrayRemoveSpy.getCall(1).args[0].should.equal(1);
      arrayRemoveSpy.resetHistory();
    });

    it('composed type map', function() {
      var mapInsertSpy = sinon.spy();
      var mapModifySpy = sinon.spy();
      var mapRemoveSpy = sinon.spy();
      ParentDataBinding.registerOnPath('subMap', ['collectionInsert'], mapInsertSpy);
      ParentDataBinding.registerOnPath('subMap', ['collectionModify'], mapModifySpy);
      ParentDataBinding.registerOnPath('subMap', ['collectionRemove'], mapRemoveSpy);

      // Register the base (Child) typeid
      dataBinder.register('BINDING', MapContainerTemplate.typeid, ParentDataBinding);
      dataBinder.attachTo(workspace);

      var mapContainerPset = PropertyFactory.create(MapContainerTemplate.typeid, 'single');
      workspace.insert('myMapContainerTemplate', mapContainerPset);

      // Expect the insertion of map values to trigger onInsert messages
      var mapProperty = workspace.get(['myMapContainerTemplate', 'subMap']);
      workspace.pushModifiedEventScope();
      mapProperty.insert('one', PropertyFactory.create('Test:ChildID-0.0.1', undefined, {text: '1'}));
      mapProperty.insert('two', PropertyFactory.create('Test:ChildID-0.0.1', undefined, {text: '2'}));
      mapProperty.insert('three', PropertyFactory.create('Test:ChildID-0.0.1', undefined, {text: '3'}));
      mapProperty.insert('four', PropertyFactory.create('Test:ChildID-0.0.1', undefined, {text: '4'}));
      mapProperty.insert('five.six', PropertyFactory.create('Test:ChildID-0.0.1', undefined, {text: '5'}));
      workspace.popModifiedEventScope();

      mapInsertSpy.callCount.should.equal(5);
      mapInsertSpy.getCall(0).args[0].should.equal('one');
      mapInsertSpy.getCall(1).args[0].should.equal('two');
      mapInsertSpy.getCall(2).args[0].should.equal('three');
      mapInsertSpy.getCall(3).args[0].should.equal('four');
      mapInsertSpy.getCall(4).args[0].should.equal('five.six');

      // TODO: How do we report the typeid for these?
      // mapInsertSpy.getCall(0).args[1].getNestedChangeSet().typeid.should.equal('Test:ChildID-0.0.1');
      mapInsertSpy.getCall(0).args[1].getNestedChangeSet().String.text.should.equal('1');
      mapInsertSpy.getCall(0).args[1].getContext().should.equal('map');
      mapInsertSpy.getCall(0).args[1].getOperationType().should.equal('insert');
      mapInsertSpy.getCall(0).args[1].getAbsolutePath().should.equal('/myMapContainerTemplate.subMap[one]');
      mapInsertSpy.getCall(4).args[1].getNestedChangeSet().String.text.should.equal('5');
      mapInsertSpy.getCall(4).args[1].getAbsolutePath().should.equal('/myMapContainerTemplate.subMap["five.six"]');
      mapInsertSpy.resetHistory();

      // modify map
      workspace.pushModifiedEventScope();
      mapProperty.get(['one', 'text']).setValue('10');
      mapProperty.get(['two', 'text']).setValue('20');
      mapProperty.get(['five.six', 'text']).setValue('30');
      workspace.popModifiedEventScope();
      mapModifySpy.callCount.should.equal(3);
      mapModifySpy.getCall(0).args[0].should.equal('one');
      mapModifySpy.getCall(1).args[0].should.equal('two');
      mapModifySpy.getCall(2).args[0].should.equal('five.six');

      // TODO: How do we report the typeid for these?
      // mapInsertSpy.getCall(0).args[1].getNestedChangeSet().typeid.should.equal('Test:ChildID-0.0.1');
      mapModifySpy.getCall(0).args[1].getNestedChangeSet().String.text.should.equal('10');
      mapModifySpy.getCall(0).args[1].getContext().should.equal('map');
      mapModifySpy.getCall(0).args[1].getOperationType().should.equal('modify');
      mapModifySpy.getCall(0).args[1].getAbsolutePath().should.equal('/myMapContainerTemplate.subMap[one]');
      mapModifySpy.getCall(2).args[1].getNestedChangeSet().String.text.should.equal('30');
      mapModifySpy.getCall(2).args[1].getAbsolutePath().should.equal('/myMapContainerTemplate.subMap["five.six"]');
      mapModifySpy.resetHistory();

      // remove from map
      workspace.pushModifiedEventScope();
      mapProperty.remove('one');
      mapProperty.remove('two');
      mapProperty.remove('five.six');
      workspace.popModifiedEventScope();
      mapRemoveSpy.callCount.should.equal(3);
      mapRemoveSpy.getCall(0).args[0].should.equal('one');
      mapRemoveSpy.getCall(1).args[0].should.equal('two');
      mapRemoveSpy.getCall(2).args[0].should.equal('five.six');
      mapRemoveSpy.resetHistory();
    });

    it('set', function() {
      var setInsertSpy = sinon.spy();
      var setModifySpy = sinon.spy();
      var setRemoveSpy = sinon.spy();
      ParentDataBinding.registerOnPath('subSet', ['collectionInsert'], setInsertSpy);
      ParentDataBinding.registerOnPath('subSet', ['collectionModify'], setModifySpy);
      ParentDataBinding.registerOnPath('subSet', ['collectionRemove'], setRemoveSpy);

      // Register the base (Child) typeid
      dataBinder.register('BINDING', SetContainerTemplate.typeid, ParentDataBinding);
      dataBinder.attachTo(workspace);

      var mapContainerPset = PropertyFactory.create(SetContainerTemplate.typeid, 'single');
      workspace.insert('mySetContainerTemplate', mapContainerPset);

      // Expect the insertion of map values to trigger onInsert messages
      var setProperty = workspace.get(['mySetContainerTemplate', 'subSet']);

      // Insert five child properties into the set
      workspace.pushModifiedEventScope();
      var children = [];
      for (var i = 0; i < 5; i++) {
        children.push(PropertyFactory.create('Test:ChildID-0.0.1', undefined, {text: i}));
        setProperty.insert(children[i]);
      }
      workspace.popModifiedEventScope();

      setInsertSpy.callCount.should.equal(5);
      for (var i = 0; i < 5; i++) {
        setInsertSpy.getCall(i).args[0].should.equal(children[i].getId());
        setInsertSpy.getCall(i).args[1].getNestedChangeSet().String.text.should.equal(String(i));
        setInsertSpy.getCall(i).args[1].getContext().should.equal('set');
        setInsertSpy.getCall(i).args[1].getOperationType().should.equal('insert');
        setInsertSpy.getCall(i).args[1].getAbsolutePath().should.equal(
          '/mySetContainerTemplate.subSet[' + children[i].getId() + ']');
      }

      // Modify the properties in the set
      for (var i = 0; i < 5; i++) {
        children[i].get('text').setValue(String(i + 1));

        setModifySpy.callCount.should.equal(i + 1);
        setModifySpy.getCall(i).args[0].should.equal(children[i].getId());
        setModifySpy.getCall(i).args[1].getNestedChangeSet().String.text.should.equal(String(i + 1));
        setModifySpy.getCall(i).args[1].getContext().should.equal('set');
        setModifySpy.getCall(i).args[1].getOperationType().should.equal('modify');
        setModifySpy.getCall(i).args[1].getAbsolutePath().should.equal(
          '/mySetContainerTemplate.subSet[' + children[i].getId() + ']');
      }

      // remove from map
      workspace.pushModifiedEventScope();
      for (var i = 0; i < 5; i++) {
        setProperty.remove(children[i]);
      }
      workspace.popModifiedEventScope();
      setRemoveSpy.callCount.should.equal(5);
      for (var i = 0; i < 5; i++) {
        setModifySpy.getCall(i).args[0].should.equal(children[i].getId());
      }
    });

    it('NodeProperty', function() {
      var nodeInsertSpy = sinon.spy();
      var nodeModifySpy = sinon.spy();
      var nodeRemoveSpy = sinon.spy();
      ParentDataBinding.registerOnPath('nested', ['collectionInsert'], nodeInsertSpy);
      ParentDataBinding.registerOnPath('nested', ['collectionModify'], nodeModifySpy);
      ParentDataBinding.registerOnPath('nested', ['collectionRemove'], nodeRemoveSpy);

      // Register the base (Child) typeid
      dataBinder.register('BINDING', NodeContainerTemplate.typeid, ParentDataBinding);
      dataBinder.attachTo(workspace);

      var nodeContainerPset = PropertyFactory.create(NodeContainerTemplate.typeid, 'single');
      workspace.insert('myNodeContainerTemplate', nodeContainerPset);

      // Expect the insertion of map values to trigger onInsert messages
      var nodeProperty = workspace.get(['myNodeContainerTemplate', 'nested']);

      // Insert five child properties into the set
      workspace.pushModifiedEventScope();
      var children = [];
      for (var i = 0; i < 5; i++) {
        children.push(PropertyFactory.create('Test:ChildID-0.0.1', undefined, {text: i}));
        nodeProperty.insert(children[i]);
      }
      workspace.popModifiedEventScope();

      nodeInsertSpy.callCount.should.equal(5);
      for (var i = 0; i < 5; i++) {
        nodeInsertSpy.getCall(i).args[0].should.equal(children[i].getId());
        nodeInsertSpy.getCall(i).args[1].getNestedChangeSet().String.text.should.equal(String(i));
        nodeInsertSpy.getCall(i).args[1].getContext().should.equal('NodeProperty');
        nodeInsertSpy.getCall(i).args[1].getOperationType().should.equal('insert');
        nodeInsertSpy.getCall(i).args[1].getAbsolutePath().should.equal(
          '/myNodeContainerTemplate.nested[' + children[i].getId() + ']');
      }

      // Modify the properties in the set
      for (var i = 0; i < 5; i++) {
        children[i].get('text').setValue(String(i + 1));

        nodeModifySpy.callCount.should.equal(i + 1);
        nodeModifySpy.getCall(i).args[0].should.equal(children[i].getId());
        nodeModifySpy.getCall(i).args[1].getNestedChangeSet().String.text.should.equal(String(i + 1));
        nodeModifySpy.getCall(i).args[1].getContext().should.equal('NodeProperty');
        nodeModifySpy.getCall(i).args[1].getOperationType().should.equal('modify');
        nodeModifySpy.getCall(i).args[1].getAbsolutePath().should.equal(
          '/myNodeContainerTemplate.nested[' + children[i].getId() + ']');
      }

      // remove from map
      workspace.pushModifiedEventScope();
      for (var i = 0; i < 5; i++) {
        nodeProperty.remove(children[i]);
      }
      workspace.popModifiedEventScope();
      nodeRemoveSpy.callCount.should.equal(5);
      for (var i = 0; i < 5; i++) {
        nodeModifySpy.getCall(i).args[0].should.equal(children[i].getId());
      }
    });

    it('arrays with primitive types (extra checks)', function() {
      var arrayInsertSpy = sinon.spy();
      var arrayModifySpy = sinon.spy();
      var arrayRemoveSpy = sinon.spy();
      PrimitiveChildrenDataBinding.registerOnPath('arrayOfNumbers', ['collectionInsert'], arrayInsertSpy);
      PrimitiveChildrenDataBinding.registerOnPath('arrayOfNumbers', ['collectionModify'], arrayModifySpy);
      PrimitiveChildrenDataBinding.registerOnPath('arrayOfNumbers', ['collectionRemove'], arrayRemoveSpy);

      // Register the base (Child) typeid
      dataBinder.register('BINDING', PrimitiveChildrenTemplate.typeid, PrimitiveChildrenDataBinding);
      dataBinder.attachTo(workspace);

      var primitiveChildPset = PropertyFactory.create(PrimitiveChildrenTemplate.typeid, 'single');
      workspace.insert('myPrimitiveChildTemplate', primitiveChildPset);

      // Expect the insertion of ranges to trigger onInsert messages
      var arrayProperty = workspace.get(['myPrimitiveChildTemplate', 'arrayOfNumbers']);
      arrayProperty.insertRange(0, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
      arrayInsertSpy.callCount.should.equal(9);
      arrayInsertSpy.getCall(0).args[0].should.equal(0);
      arrayInsertSpy.getCall(1).args[0].should.equal(1);
      arrayInsertSpy.getCall(2).args[0].should.equal(2);
      arrayInsertSpy.getCall(3).args[0].should.equal(3);
      arrayInsertSpy.getCall(4).args[0].should.equal(4);
      arrayInsertSpy.getCall(5).args[0].should.equal(5);
      arrayInsertSpy.getCall(6).args[0].should.equal(6);
      arrayInsertSpy.getCall(7).args[0].should.equal(7);
      arrayInsertSpy.getCall(8).args[0].should.equal(8);
      arrayInsertSpy.resetHistory();

      arrayProperty.setRange(5, [50, 60]);
      arrayModifySpy.callCount.should.equal(2);
      arrayModifySpy.getCall(0).args[0].should.equal(5);
      arrayModifySpy.getCall(1).args[0].should.equal(6);
      arrayModifySpy.resetHistory();

      arrayProperty.removeRange(0, 2);
      arrayRemoveSpy.callCount.should.equal(2);
      arrayRemoveSpy.getCall(0).args[0].should.equal(0);
      arrayRemoveSpy.getCall(1).args[0].should.equal(0);
      arrayRemoveSpy.resetHistory();

      workspace.pushModifiedEventScope();
      arrayProperty.insert(1, 5);
      arrayProperty.remove(0);
      arrayProperty.removeRange(2, 2);
      arrayProperty.set(2, 7);
      workspace.popModifiedEventScope();
      arrayRemoveSpy.callCount.should.equal(3);
      arrayRemoveSpy.getCall(0).args[0].should.equal(0);
      arrayRemoveSpy.getCall(1).args[0].should.equal(2);
      arrayRemoveSpy.getCall(2).args[0].should.equal(2);

      arrayInsertSpy.getCall(0).args[0].should.equal(0);

      arrayModifySpy.getCall(0).args[0].should.equal(2);

      arrayRemoveSpy.resetHistory();
      arrayInsertSpy.resetHistory();
      arrayModifySpy.resetHistory();
    });

    it('registerOnProperty', function() {
      var stringProperty = PropertyFactory.create('String');
      var primitiveChildrenDataBinding = undefined;
      var checkProperty = function(property) {
        expect(this).to.be.instanceOf(PrimitiveChildrenDataBinding);
        expect(this).to.be.equal(primitiveChildrenDataBinding);
        expect(property).to.equal(stringProperty);
      };
      var insertSpy = sinon.spy(checkProperty);
      var modifySpy = sinon.spy(checkProperty);
      var removeSpy = sinon.spy(function(property) {expect(property).to.be.undefined;});

      var invalidProperty = false; // we have to do this externally because HFDM would eat our exception from the spy
      var expectedInvalidProperty = false; // same as above...
      var validPropertySpy = sinon.spy(function(in_property) {
        if (!in_property) {
          invalidProperty = true;
        }
      });
      var invalidPropertySpy = sinon.spy(function(in_property) {
        if (!in_property) {
          expectedInvalidProperty = true;
        }
      });
      var changeSpy = sinon.spy(function(property) {
        if (property) { // will be undefined if removed
          checkProperty.call(this, property);
        } else {
          expect(this).to.be.instanceOf(PrimitiveChildrenDataBinding);
          expect(this).to.be.equal(primitiveChildrenDataBinding);
        }
      });

      PrimitiveChildrenDataBinding.registerOnProperty('string', ['insert'], insertSpy);
      PrimitiveChildrenDataBinding.registerOnProperty('string', ['modify'], modifySpy);
      PrimitiveChildrenDataBinding.registerOnProperty('string', ['remove'], removeSpy);
      PrimitiveChildrenDataBinding.registerOnProperty('string', ['insert', 'modify', 'remove'],
        validPropertySpy, { requireProperty: true }
      );
      PrimitiveChildrenDataBinding.registerOnProperty('string', ['insert', 'modify', 'remove'],
        invalidPropertySpy, { requireProperty: false }
      );
      PrimitiveChildrenDataBinding.registerOnProperty(
        'string', ['insert', 'modify', 'remove'], changeSpy, { requireProperty: true }
      );

      dataBinder.register('BINDING', NodeContainerTemplate.typeid, PrimitiveChildrenDataBinding);
      dataBinder.attachTo(workspace);

      workspace.insert('node', PropertyFactory.create(NodeContainerTemplate.typeid));
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      primitiveChildrenDataBinding = dataBinder.resolve('/node', 'BINDING');

      workspace.get('node').insert('string', stringProperty);
      insertSpy.callCount.should.equal(1);

      workspace.get(['node', 'string']).setValue('newValue');
      modifySpy.callCount.should.equal(1);

      workspace.get('node').remove('string');
      removeSpy.callCount.should.equal(1);

      workspace.get('node').insert('string', stringProperty);
      insertSpy.callCount.should.equal(2);
      changeSpy.callCount.should.equal(3); // insert twice, modify but no remove because of 'requireProperty'

      workspace.get(['node', 'string']).setValue('newValue2');
      modifySpy.callCount.should.equal(2);
      changeSpy.callCount.should.equal(4);

      workspace.get('node').remove('string');
      removeSpy.callCount.should.equal(2);
      changeSpy.callCount.should.equal(4); // not called because 'requireProperty' is true

      workspace.get('node').insert('string2', stringProperty);

      // TODO: This creates a stack overflow! (this probably refers to a bug in HFDM that's likely fixed now)
      workspace.get('node').insert('string', PropertyFactory.create('Reference', undefined, '/node.string2'));
      //expect(false).to.be.true;
      // this should not have been changed to true
      invalidProperty.should.equal(false);
      // this must have been changed to true
      expectedInvalidProperty.should.equal(true);
    });

    it('when invoked from the utility functions', function() {
      var stringProperty = PropertyFactory.create('String');
      var stringArrayProperty = PropertyFactory.create('String', 'array');
      var insertSpy = sinon.spy();
      var modifySpy = sinon.spy();
      var removeSpy = sinon.spy(function(in_modificationContext) {
        in_modificationContext.getAbsolutePath().should.equal('/node.string');
      });
      var collectionInsertSpy = sinon.spy();
      var collectionModifySpy = sinon.spy();
      var collectionRemoveSpy = sinon.spy();

      PrimitiveChildrenDataBinding.registerOnPath('string', ['insert'], insertSpy);
      PrimitiveChildrenDataBinding.registerOnPath('string', ['modify'], modifySpy);
      PrimitiveChildrenDataBinding.registerOnPath('string', ['remove'], removeSpy);
      PrimitiveChildrenDataBinding.registerOnPath('array', ['collectionInsert'], collectionInsertSpy);
      PrimitiveChildrenDataBinding.registerOnPath('array', ['collectionModify'], collectionModifySpy);
      PrimitiveChildrenDataBinding.registerOnPath('array', ['collectionRemove'], collectionRemoveSpy);

      dataBinder.register('BINDING', NodeContainerTemplate.typeid, PrimitiveChildrenDataBinding);
      dataBinder.attachTo(workspace);

      var node = PropertyFactory.create(NodeContainerTemplate.typeid);
      workspace.insert('node', node);

      node.insert('string', stringProperty); insertSpy.callCount.should.equal(1);
      node.get('string').setValue('test'); modifySpy.callCount.should.equal(1);
      node.remove('string'); removeSpy.callCount.should.equal(1);

      node.insert('array', stringArrayProperty);
      stringArrayProperty.insertRange(0, ['test', 'test2']); collectionInsertSpy.callCount.should.equal(2);
      stringArrayProperty.set(0, 'test2'); collectionModifySpy.callCount.should.equal(1);
      stringArrayProperty.remove(0); collectionRemoveSpy.callCount.should.equal(1);
    });

    it('same databinding on two workspaces should not matter', function() {
      // In some tests, a databinding used in the first test was interfering with the second test.
      // We simulate that here
      const insertSpy = sinon.spy();

      class myBinding extends DataBinding {
        constructor(params) { // eslint-disable-line no-useless-constructor
          super(params);
        }

        static initialize() {
          // Two paths will lead to makeCallbackOncePerChangeSet to avoid two callbacks in
          // one changeset
          this.registerOnPath(
            ['aString', 'aNumber'], ['insert'], insertSpy
          );
        }
      }
      myBinding.initialize();

      const dataBinder1 = new DataBinder();
      const dataBinder2 = new DataBinder();

      const workspace1 = hfdm.createWorkspace();
      dataBinder1.register('BINDING', PrimitiveChildrenTemplate.typeid, myBinding);
      const workspace2 = hfdm.createWorkspace();
      dataBinder2.register('BINDING', PrimitiveChildrenTemplate.typeid, myBinding);
      return workspace1.initialize({local: true}).then(() => {
        dataBinder1.attachTo(workspace1);

        return workspace2.initialize({local: true}).then(() => {
          dataBinder2.attachTo(workspace2);

          insertSpy.callCount.should.equal(0);
          workspace1.insert('p1', PropertyFactory.create(PrimitiveChildrenTemplate.typeid));
          insertSpy.callCount.should.equal(1);
          workspace2.insert('p2', PropertyFactory.create(PrimitiveChildrenTemplate.typeid));
          insertSpy.callCount.should.equal(2);
        });
      });

    });

    it('should handle intermediate binding classes that are not registered', function() {
      var parentModifySpy = sinon.spy();
      var derivedModifySpy = sinon.spy();
      var derivedDerivedModifySpy = sinon.spy();

      unregisterAllOnPathListeners(ParentDataBinding);
      unregisterAllOnPathListeners(DerivedDataBinding);
      unregisterAllOnPathListeners(DerivedDerivedDataBinding);

      // Register on the parent, and the doubly derived, but _not_ on the derived class
      ParentDataBinding.registerOnPath('text', ['modify'], parentModifySpy);
      DerivedDerivedDataBinding.registerOnPath('text', ['modify'], derivedDerivedModifySpy);

      dataBinder.register('BINDING', ChildTemplate.typeid, ParentDataBinding);
      dataBinder.register('BINDING', InheritedChildTemplate.typeid, DerivedDataBinding);
      dataBinder.register('BINDING', InheritedInheritedChildTemplate.typeid, DerivedDerivedDataBinding);
      dataBinder.attachTo(workspace);

      parentModifySpy.callCount.should.equal(0);
      derivedModifySpy.callCount.should.equal(0);
      derivedDerivedModifySpy.callCount.should.equal(0);

      // Test changing an instance of the parent class
      workspace.insert('myChildTemplate', PropertyFactory.create(ChildTemplate.typeid));
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      dataBinder._resetDebugCounters();

      workspace.get(['myChildTemplate', 'text']).setValue('newValue');
      parentModifySpy.callCount.should.equal(1);
      derivedModifySpy.callCount.should.equal(0);
      derivedDerivedModifySpy.callCount.should.equal(0);
      parentModifySpy.resetHistory();
      derivedModifySpy.resetHistory();
      derivedDerivedModifySpy.resetHistory();

      // Test changing an instance of the derived class
      workspace.insert('myInheritedChildTemplate', PropertyFactory.create(InheritedChildTemplate.typeid));
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      dataBinder._resetDebugCounters();

      workspace.get(['myInheritedChildTemplate', 'text']).setValue('newValue');
      parentModifySpy.callCount.should.equal(1);
      derivedModifySpy.callCount.should.equal(0); // Was never registered, not called
      derivedDerivedModifySpy.callCount.should.equal(0);
      parentModifySpy.resetHistory();
      derivedModifySpy.resetHistory();
      derivedDerivedModifySpy.resetHistory();

      // Test changing an instance of the derived derived class
      workspace.insert(
        'myInheritedInheritedChildTemplate', PropertyFactory.create(InheritedInheritedChildTemplate.typeid)
      );
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      dataBinder._resetDebugCounters();

      workspace.get(['myInheritedInheritedChildTemplate', 'text']).setValue('newValue');
      parentModifySpy.callCount.should.equal(1);
      derivedModifySpy.callCount.should.equal(0); // Was never registered, not called
      derivedDerivedModifySpy.callCount.should.equal(1);
      parentModifySpy.resetHistory();
      derivedModifySpy.resetHistory();
      derivedDerivedModifySpy.resetHistory();

      // unregister the parent, and modify the doubly derived class
      unregisterAllOnPathListeners(ParentDataBinding);
      workspace.get(['myInheritedInheritedChildTemplate', 'text']).setValue('newValue2');
      parentModifySpy.callCount.should.equal(0);  // Was unregistered, not called
      derivedModifySpy.callCount.should.equal(0); // Was never registered, not called
      derivedDerivedModifySpy.callCount.should.equal(1); // Still registered, called
      parentModifySpy.resetHistory();
      derivedModifySpy.resetHistory();
    });

    it('should not matter the order we register in, way 1', function() {
      let order = '';
      const parentInsertSpy = sinon.spy(function() { order += 'p'; });
      const derivedInsertSpy = sinon.spy(function() { order += 'd'; });

      unregisterAllOnPathListeners(ParentDataBinding);
      unregisterAllOnPathListeners(DerivedDataBinding);
      ParentDataBinding.registerOnPath('text', ['insert'], parentInsertSpy);
      DerivedDataBinding.registerOnPath('text', ['insert'], derivedInsertSpy);

      dataBinder.register('BINDING', ChildTemplate.typeid, ParentDataBinding);
      dataBinder.register('BINDING', InheritedChildTemplate.typeid, DerivedDataBinding);

      order.should.equal('');
      dataBinder.attachTo(workspace);
      order.should.equal('');

      workspace.insert('InheritedChildTemplate', PropertyFactory.create(InheritedChildTemplate.typeid));

      parentInsertSpy.callCount.should.equal(1);
      derivedInsertSpy.callCount.should.equal(1);

      // The derived should be called before the parent
      order.should.equal('dp');
    });

    it('should not matter the order we register in, way 2', function() {
      let order = '';
      const parentInsertSpy = sinon.spy(function() { order += 'p'; });
      const derivedInsertSpy = sinon.spy(function() { order += 'd'; });

      unregisterAllOnPathListeners(ParentDataBinding);
      unregisterAllOnPathListeners(DerivedDataBinding);
      DerivedDataBinding.registerOnPath('text', ['insert'], derivedInsertSpy);
      ParentDataBinding.registerOnPath('text', ['insert'], parentInsertSpy);

      dataBinder.register('BINDING', ChildTemplate.typeid, ParentDataBinding);
      dataBinder.register('BINDING', InheritedChildTemplate.typeid, DerivedDataBinding);

      order.should.equal('');
      dataBinder.attachTo(workspace);
      order.should.equal('');

      workspace.insert('InheritedChildTemplate', PropertyFactory.create(InheritedChildTemplate.typeid));

      parentInsertSpy.callCount.should.equal(1);
      derivedInsertSpy.callCount.should.equal(1);

      // The derived should be called before the parent
      order.should.equal('dp');
    });

    it('should not matter the order we register in, way 3', function() {
      let order = '';
      const parentInsertSpy = sinon.spy(function() { order += 'p'; });
      const derivedInsertSpy = sinon.spy(function() { order += 'd'; });

      unregisterAllOnPathListeners(ParentDataBinding);
      unregisterAllOnPathListeners(DerivedDataBinding);
      DerivedDataBinding.registerOnPath('text', ['insert'], derivedInsertSpy);
      ParentDataBinding.registerOnPath('text', ['insert'], parentInsertSpy);

      dataBinder.register('BINDING', InheritedChildTemplate.typeid, DerivedDataBinding);
      dataBinder.register('BINDING', ChildTemplate.typeid, ParentDataBinding);

      order.should.equal('');
      dataBinder.attachTo(workspace);
      order.should.equal('');

      workspace.insert('InheritedChildTemplate', PropertyFactory.create(InheritedChildTemplate.typeid));

      parentInsertSpy.callCount.should.equal(1);
      derivedInsertSpy.callCount.should.equal(1);

      // The derived should be called before the parent
      order.should.equal('dp');
    });

    it('should not matter the order we register in, way 4', function() {
      let order = '';
      const parentInsertSpy = sinon.spy(function() { order += 'p'; });
      const derivedInsertSpy = sinon.spy(function() { order += 'd'; });

      unregisterAllOnPathListeners(ParentDataBinding);
      unregisterAllOnPathListeners(DerivedDataBinding);
      ParentDataBinding.registerOnPath('text', ['insert'], parentInsertSpy);
      DerivedDataBinding.registerOnPath('text', ['insert'], derivedInsertSpy);

      dataBinder.register('BINDING', InheritedChildTemplate.typeid, DerivedDataBinding);
      dataBinder.register('BINDING', ChildTemplate.typeid, ParentDataBinding);

      order.should.equal('');
      dataBinder.attachTo(workspace);
      order.should.equal('');

      workspace.insert('InheritedChildTemplate', PropertyFactory.create(InheritedChildTemplate.typeid));

      parentInsertSpy.callCount.should.equal(1);
      derivedInsertSpy.callCount.should.equal(1);

      // The derived should be called before the parent
      order.should.equal('dp');
    });

    it('derived DataBindings with unrelated templates', function() {
      var parentModifySpy = sinon.spy();
      var derivedModifySpy = sinon.spy();

      unregisterAllOnPathListeners(ParentDataBinding);
      unregisterAllOnPathListeners(DerivedDataBinding);
      ParentDataBinding.registerOnPath('text', ['modify'], parentModifySpy);
      DerivedDataBinding.registerOnPath('text', ['modify'], derivedModifySpy);

      dataBinder.register('BINDING', ParentTemplate.typeid, ParentDataBinding);
      dataBinder.register('BINDING', ChildTemplate.typeid, DerivedDataBinding);
      dataBinder.attachTo(workspace);

      workspace.insert('myParentTemplate', PropertyFactory.create(ParentTemplate.typeid));
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      dataBinder._resetDebugCounters();
      const myParentDataBinding = dataBinder.resolve('/myParentTemplate', 'BINDING');
      should.exist(myParentDataBinding);
      myParentDataBinding.should.be.instanceOf(ParentDataBinding);
      workspace.insert('myChildTemplate', PropertyFactory.create(ChildTemplate.typeid));
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      dataBinder._resetDebugCounters();
      const myDerivedDataBinding = dataBinder.resolve('/myChildTemplate', 'BINDING');
      should.exist(myDerivedDataBinding);
      myDerivedDataBinding.should.be.instanceOf(DerivedDataBinding);

      parentModifySpy.callCount.should.equal(0);
      derivedModifySpy.callCount.should.equal(0);

      workspace.get(['myParentTemplate', 'text']).setValue('newValue');
      parentModifySpy.callCount.should.equal(1);
      derivedModifySpy.callCount.should.equal(0);
      parentModifySpy.resetHistory();
      derivedModifySpy.resetHistory();
      myParentDataBinding.onModify.callCount.should.equal(1);
      myDerivedDataBinding.onModify.callCount.should.equal(0);
      myParentDataBinding.onModify.resetHistory();
      myDerivedDataBinding.onModify.resetHistory();
      workspace.get(['myChildTemplate', 'text']).setValue('newValue');
      myParentDataBinding.onModify.callCount.should.equal(0);
      myDerivedDataBinding.onModify.callCount.should.equal(1);
      myParentDataBinding.onModify.resetHistory();
      myDerivedDataBinding.onModify.resetHistory();
      parentModifySpy.callCount.should.equal(1); // will still be called via child's callback list
      derivedModifySpy.callCount.should.equal(1);
      parentModifySpy.resetHistory();
      derivedModifySpy.resetHistory();

      // unregister parent
      unregisterAllOnPathListeners(ParentDataBinding);
      workspace.get(['myChildTemplate', 'text']).setValue('newValue2');
      myParentDataBinding.onModify.callCount.should.equal(0);
      myDerivedDataBinding.onModify.callCount.should.equal(1);
      myParentDataBinding.onModify.resetHistory();
      myDerivedDataBinding.onModify.resetHistory();
      parentModifySpy.callCount.should.equal(0);
      derivedModifySpy.callCount.should.equal(1);
      parentModifySpy.resetHistory();
      derivedModifySpy.resetHistory();
    });

    it('should not call us back for non-existing items', function() {
      dataBinder.attachTo(workspace);
      const pathSpy = sinon.spy();

      ParentDataBinding.registerOnPath('node.aString', ['insert', 'modify', 'remove'], pathSpy);
      dataBinder.register('BINDING', 'NodeProperty', ParentDataBinding, { exactPath: '/'} );
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      pathSpy.callCount.should.equal(0);

      const nodePset = PropertyFactory.create('NodeProperty', 'single');
      pathSpy.callCount.should.equal(0);
      workspace.insert('node', nodePset);

      const stringPset = PropertyFactory.create('String', 'single');
      nodePset.insert('aString', stringPset);
      pathSpy.callCount.should.equal(1);

      const stringProperty = workspace.get(['node', 'aString']);
      stringProperty.setValue('hello');
      pathSpy.callCount.should.equal(2);

      nodePset.remove('aString');
      pathSpy.callCount.should.equal(3);
    });

    it('derived DataBindings with unrelated templates and replacing parent callback', function() {
      var parentModifySpy = sinon.spy();
      var derivedModifySpy = sinon.spy();
      var parentInsertSpy = sinon.spy();
      var derivedInsertSpy = sinon.spy();
      var parentRemoveSpy = sinon.spy(function(in_modificationContext) {
      });
      var derivedRemoveSpy = sinon.spy(function(in_modificationContext) {
      });

      unregisterAllOnPathListeners(ParentDataBinding);
      unregisterAllOnPathListeners(DerivedDataBinding);
      ParentDataBinding.registerOnPath('text', ['modify'], parentModifySpy);
      DerivedDataBinding.registerOnPath('text', ['modify'], derivedModifySpy);
      ParentDataBinding.registerOnPath('text', ['insert'], parentInsertSpy);
      DerivedDataBinding.registerOnPath('text', ['insert'], derivedInsertSpy);
      ParentDataBinding.registerOnPath('subText', ['remove'], parentRemoveSpy);
      DerivedDataBinding.registerOnPath('subText', ['remove'], derivedRemoveSpy);

      dataBinder.register('BINDING', ParentTemplate.typeid, ParentDataBinding);
      dataBinder.register('BINDING', NodeContainerTemplate.typeid, DerivedDataBinding);
      dataBinder.attachTo(workspace);

      workspace.insert('myParentTemplate', PropertyFactory.create(ParentTemplate.typeid));
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      dataBinder._resetDebugCounters();
      const myParentDataBinding = dataBinder.resolve('/myParentTemplate', 'BINDING');
      should.exist(myParentDataBinding);
      myParentDataBinding.should.be.instanceOf(ParentDataBinding);
      parentInsertSpy.callCount.should.equal(1);
      derivedInsertSpy.callCount.should.equal(0);
      parentInsertSpy.resetHistory();
      derivedInsertSpy.resetHistory();
      workspace.insert('myNodeContainerTemplate', PropertyFactory.create(NodeContainerTemplate.typeid));
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      dataBinder._resetDebugCounters();
      const myDerivedDataBinding = dataBinder.resolve('/myNodeContainerTemplate', 'BINDING');
      should.exist(myDerivedDataBinding);
      myDerivedDataBinding.should.be.instanceOf(DerivedDataBinding);
      parentInsertSpy.callCount.should.equal(1);
      derivedInsertSpy.callCount.should.equal(1);
      parentInsertSpy.resetHistory();
      derivedInsertSpy.resetHistory();

      parentModifySpy.callCount.should.equal(0);
      derivedModifySpy.callCount.should.equal(0);

      workspace.get(['myParentTemplate', 'text']).setValue('newValue');
      parentModifySpy.callCount.should.equal(1);
      derivedModifySpy.callCount.should.equal(0);
      parentModifySpy.resetHistory();
      derivedModifySpy.resetHistory();
      myParentDataBinding.onModify.callCount.should.equal(1);
      myDerivedDataBinding.onModify.callCount.should.equal(0);
      myParentDataBinding.onModify.resetHistory();
      myDerivedDataBinding.onModify.resetHistory();
      workspace.get(['myNodeContainerTemplate', 'text']).setValue('newValue');
      myParentDataBinding.onModify.callCount.should.equal(0);
      myDerivedDataBinding.onModify.callCount.should.equal(1);
      myParentDataBinding.onModify.resetHistory();
      myDerivedDataBinding.onModify.resetHistory();
      parentModifySpy.callCount.should.equal(1);
      derivedModifySpy.callCount.should.equal(1);
      parentModifySpy.resetHistory();
      derivedModifySpy.resetHistory();

      // add extra stuff that can be removed (yay!):
      workspace.get('myParentTemplate').insert('subText', PropertyFactory.create('String'));
      workspace.get('myNodeContainerTemplate').insert('subText', PropertyFactory.create('String'));
      // remove stuff: first from the parent
      workspace.get('myParentTemplate').remove('subText');
      parentRemoveSpy.callCount.should.equal(1);
      derivedRemoveSpy.callCount.should.equal(0);
      parentModifySpy.callCount.should.equal(0);
      derivedModifySpy.callCount.should.equal(0);
      parentRemoveSpy.resetHistory();
      derivedRemoveSpy.resetHistory();
      // then from the derived class
      workspace.get('myNodeContainerTemplate').remove('subText');
      parentRemoveSpy.callCount.should.equal(1);
      derivedRemoveSpy.callCount.should.equal(1);
      parentModifySpy.callCount.should.equal(0);
      derivedModifySpy.callCount.should.equal(0);
      parentRemoveSpy.resetHistory();
      derivedRemoveSpy.resetHistory();

    });

    it('should handle double references in a relative path', function() {
      dataBinder.attachTo(workspace);

      // Add our child (referenced) pset
      var childPset = PropertyFactory.create(ChildTemplate.typeid, 'single');
      workspace.insert('myChild1', childPset);

      // referenceParentPSet should produce a ParentDataBinding
      // Most basic case, insert with an already valid reference
      const referenceParentPSet = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');
      referenceParentPSet.get('single_ref', { referenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.NEVER })
        .setValue('/myChild1');
      workspace.insert('myReferenceParent', referenceParentPSet);

      // Now we have a two stage reference
      const referenceParentPSet2 = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');
      referenceParentPSet2.get('single_ref', { referenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.NEVER })
        .setValue('/myReferenceParent');
      workspace.insert('myReferenceParent2', referenceParentPSet2);

      // Register the DataBindings
      var doubleReferenceModifySpy = sinon.spy(function() {
      });
      ParentDataBinding.registerOnPath('single_ref.single_ref.text', ['modify'], doubleReferenceModifySpy);
      dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding);
      dataBinder._dataBindingCreatedCounter.should.equal(2);

      doubleReferenceModifySpy.callCount.should.equal(0);

      childPset.get('text').setValue('newText2');
      referenceParentPSet2.get(['single_ref', 'single_ref', 'text']).should.equal(childPset.get('text'));
      doubleReferenceModifySpy.callCount.should.equal(1);
    });
    it('getAbsolutePath() should return the correct path', function() {

      var pathSpy = sinon.spy(function(modificationContext) {
        // WARNING: We have to do this test inline. After the event, the modification context is no
        // longer valid
        modificationContext.getAbsolutePath().should.equal(modificationContext.getProperty().getAbsolutePath());
      });
      var collectionSpy = sinon.spy(function(key, modificationContext) {
        //          console.log('key/index: ' + key + ' op: ' + modificationContext.getOperationType());
        modificationContext.getAbsolutePath().should.equal(modificationContext.getProperty().getAbsolutePath());
      });
      ChildDataBinding.registerOnPath('text', ['insert', 'modify'], pathSpy);
      ParentDataBinding.registerOnPath('myArray', ['collectionInsert', 'collectionModify'], collectionSpy);
      ParentDataBinding.registerOnPath('myMap', ['collectionInsert', 'collectionModify'], collectionSpy);

      dataBinder.register('BINDING', 'NodeProperty', ParentDataBinding);
      dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding);
      dataBinder.attachTo(workspace);

      workspace.insert('child1', PropertyFactory.create('NodeProperty', 'single'));
      workspace.insert('child2', PropertyFactory.create('NodeProperty', 'single'));
      workspace.insert('child3', PropertyFactory.create('NodeProperty', 'single'));
      workspace.get('child1').insert('myChild1', PropertyFactory.create('NodeProperty', 'single'));
      workspace.get('child1').insert('myChild2', PropertyFactory.create('NodeProperty', 'single'));
      workspace.get('child1').insert('myChild3', PropertyFactory.create('NodeProperty', 'single'));
      workspace.get('child2').insert('myChild4', PropertyFactory.create('NodeProperty', 'single'));
      workspace.get('child2').insert('myChild5', PropertyFactory.create('NodeProperty', 'single'));
      workspace.get('child2').insert('myChild6', PropertyFactory.create('NodeProperty', 'single'));
      workspace.get('child3').insert('myChild7', PropertyFactory.create('NodeProperty', 'single'));
      workspace.get('child3').insert('myChild8', PropertyFactory.create('NodeProperty', 'single'));
      workspace.get('child3').insert('myChild9', PropertyFactory.create('NodeProperty', 'single'));
      workspace.get(['child1', 'myChild1']).insert('myArray', PropertyFactory.create('NodeProperty', 'array'));
      workspace.get(['child1', 'myChild1']).insert('myMap', PropertyFactory.create('NodeProperty', 'map'));
      var arrayProperty = workspace.get(['child1', 'myChild1', 'myArray']);
      arrayProperty.insertRange(0, _.map([1, 2, 3, 4, 5, 6], function() {
        return PropertyFactory.create('NodeProperty', 'single');
      }));
      // arrayProperty -> NodeProperty -> ChildTemplate
      arrayProperty.get(0).insert(PropertyFactory.create(ChildTemplate.typeid, undefined, {text: 'zero'}));
      arrayProperty.get(1).insert(PropertyFactory.create(ChildTemplate.typeid, undefined, {text: 'one'}));
      arrayProperty.get(2).insert(PropertyFactory.create(ChildTemplate.typeid, undefined, {text: 'two'}));
      var mapProperty = workspace.get(['child1', 'myChild1', 'myMap']);
      // mapProperty -> ChildTemplate
      mapProperty.insert('one', PropertyFactory.create(ChildTemplate.typeid, undefined, {text: '1'}));
      mapProperty.insert('two', PropertyFactory.create(ChildTemplate.typeid, undefined, {text: '2'}));
      mapProperty.insert('three', PropertyFactory.create(ChildTemplate.typeid, undefined, {text: '3'}));

      // no containers in path
      workspace.get(['child1', 'myChild1']).insert(PropertyFactory.create(ChildTemplate.typeid, undefined,
        {text: 'forty-two'}));
    });

    it('Documentation example - registerOnProperty', function() {
      // *** NOTE *** this is copied into the documentation
      // SnippetStart{DataBinding.registerOnProperty}
      var orderEntrySchema = {
        typeid: 'autodesk.samples:orderEntry-1.0.0',
        properties: [
          {id: 'productId', typeid: 'String'},
          {id: 'quantity', typeid: 'Int64'},
          {id: 'price', typeid: 'Float64'}
        ]
      };

      const eventLog = [];
      class OrderEntryDataBinding extends DataBinding {
        // Callback called when the 'quantity' sub-property is created/changed
        changeQuantity(property) {
          eventLog.push('Quantity changed: ' + property.getValue());
        }

        // Callback called when the 'price' sub-property is created/changed
        changePrice(property) {
          eventLog.push('Price changed: ' + property.getValue());
        }

        static initialize() {
          this.registerOnProperty('quantity', ['insert', 'modify'], this.prototype.changeQuantity);
          this.registerOnProperty('price', ['insert', 'modify'], this.prototype.changePrice);
        }
      }

      OrderEntryDataBinding.initialize();
      // SnippetEnd{DataBinding.registerOnProperty}

      dataBinder.attachTo(workspace);
      PropertyFactory.register(orderEntrySchema);
      dataBinder.register('MODEL', orderEntrySchema.typeid, OrderEntryDataBinding);
      const order = PropertyFactory.create(orderEntrySchema.typeid);
      workspace.insert('order', order);

      eventLog.length.should.equal(2);
      order.get('price').setValue(100);
      eventLog.length.should.equal(3);
      order.get('quantity').setValue(100);
      eventLog.length.should.equal(4);
    });

    it('getDataBinding() should work for relative path callbacks even in remove operations', function() {

      var childSpyError = false;
      var childSpy = sinon.spy(function(modificationContext) {
      //  console.log('childSpy: op type: ' + modificationContext.getOperationType());
      //  console.log('childSpy: absolute path: ' + modificationContext.getAbsolutePath());
      //  console.log('childSpy: # of DataBindings: ' + modificationContext.getDataBinding().length);
      //  console.log(modificationContext._baseDataBinding.getDataBinder().resolve(
      //      modificationContext.getAbsolutePath()));
        // have to do it this way because HFDM swallows exceptions in callbacks :(
        if (!modificationContext.getDataBinding()) {
          childSpyError = true;
        }
        var dataBinding = modificationContext.getDataBinding();
        if (!(dataBinding instanceof ChildDataBinding)) {
          childSpyError = true;
        }
      });
      var collectionInsertSpyError = false;
      var collectionInsertSpy = sinon.spy(function(index, modificationContext) {
        // have to do it this way because HFDM swallows exceptions in callbacks :(
        if (!modificationContext.getDataBinding()) {
          collectionInsertSpyError = true;
        }
        var dataBinding = modificationContext.getDataBinding();
        if (!(dataBinding instanceof ChildDataBinding)) {
          collectionInsertSpyError = true;
        }
      });
      var collectionModifySpyError = false;
      var collectionModifySpy = sinon.spy(function(index, modificationContext) {
        // have to do it this way because HFDM swallows exceptions in callbacks :(
        if (!modificationContext.getDataBinding()) {
          collectionModifySpyError = true;
        }
        var dataBinding = modificationContext.getDataBinding();
        if (!(dataBinding instanceof ChildDataBinding)) {
          collectionModifySpyError = true;
        }
        // the wired-in path is not very nice here but should be ok for this test
        if (modificationContext.getAbsolutePath() !==
            '/parent.childArray[1].collectionContainer.nested.subArray[1]') {
          collectionModifySpyError = true;
        }
      });
      var mapCollectionModifySpyError = false;
      var mapCollectionModifySpy = sinon.spy(function(index, modificationContext) {
        // have to do it this way because HFDM swallows exceptions in callbacks :(
        if (!modificationContext.getDataBinding()) {
          mapCollectionModifySpyError = true;
        }
        var dataBinding = modificationContext.getDataBinding();
        if (!(dataBinding instanceof ChildDataBinding)) {
          mapCollectionModifySpyError = true;
        }
        // the wired-in path is not very nice here but should be ok for this test
        if (modificationContext.getAbsolutePath() !==
            '/parent.childArray[2].mapCollectionContainer.nested.subMap[one]') {
          mapCollectionModifySpyError = true;
        }
      });
      var receivedDataBindings = new Set();
      var createdDataBindings = [];
      var collectionRemoveSpyError = false;
      var collectionRemoveSpy = sinon.spy(function(index, modificationContext) {
        // console.log('index: ' + index);
        var removedDataBinding = modificationContext.getDataBinding();
        // have to do it this way because HFDM swallows exceptions in callbacks :(
        if (!removedDataBinding) {
          collectionRemoveSpyError = true;
        }
        var dataBinding = removedDataBinding;
        if (!(dataBinding instanceof ChildDataBinding)) {
          collectionRemoveSpyError = true;
        }
        if (receivedDataBindings.has(removedDataBinding)) {
          collectionRemoveSpyError = true;
        }
        // console.log('DataBinding path:  ' + modificationContext.getRemovedDataBindingPath());
        receivedDataBindings.add(removedDataBinding);
      });
      ParentDataBinding.registerOnPath('child', ['insert', 'modify', 'remove'], childSpy);
      InheritedChildDataBinding.registerOnPath('nested.subArray', ['collectionInsert'], collectionInsertSpy);
      InheritedChildDataBinding.registerOnPath('nested.subArray', ['collectionModify'], collectionModifySpy);
      InheritedChildDataBinding.registerOnPath('nested.subArray', ['collectionRemove'], collectionRemoveSpy);

      InheritedChildDataBinding.registerOnPath('nested.subMap', ['collectionInsert'], collectionInsertSpy);
      InheritedChildDataBinding.registerOnPath('nested.subMap', ['collectionModify'], mapCollectionModifySpy);
      InheritedChildDataBinding.registerOnPath('nested.subMap', ['collectionRemove'], collectionRemoveSpy);

      dataBinder.register('BINDING', 'NodeProperty', ParentDataBinding, { exactPath: '/parent' });
      dataBinder.register('BINDING', ArrayContainerTemplate.typeid, InheritedChildDataBinding);
      dataBinder.register('BINDING', MapContainerTemplate.typeid, InheritedChildDataBinding);
      dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding);
      dataBinder.attachTo(workspace);

      workspace.insert('parent', PropertyFactory.create('NodeProperty', 'single'));
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      dataBinder._resetDebugCounters();
      workspace.get('parent').insert('child', PropertyFactory.create(ChildTemplate.typeid, undefined,
        {text: 'forty-two'}));
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      dataBinder._resetDebugCounters();
      const childDataBinding = dataBinder.resolve('/parent.child', 'BINDING');
      childSpy.callCount.should.equal(1);
      childSpy.resetHistory();
      childDataBinding.getProperty().get('text').setValue('sixty-four');
      childSpy.callCount.should.equal(1);
      childSpy.resetHistory();
      workspace.get('parent').remove('child');
      dataBinder._dataBindingRemovedCounter.should.equal(1);
      dataBinder._resetDebugCounters();
      workspace.get('parent').insert('childArray', PropertyFactory.create('NodeProperty', 'array'));
      var childArrayProperty = workspace.get(['parent', 'childArray']);
      childArrayProperty.push(PropertyFactory.create('NodeProperty', 'single'));
      childArrayProperty.push(PropertyFactory.create('NodeProperty', 'single'));
      childArrayProperty.push(PropertyFactory.create('NodeProperty', 'single'));
      childArrayProperty.push(PropertyFactory.create('NodeProperty', 'single'));
      childArrayProperty.push(PropertyFactory.create('NodeProperty', 'single'));
      childArrayProperty.push(PropertyFactory.create('NodeProperty', 'single'));
      var child0 = childArrayProperty.get(0);
      var child1 = childArrayProperty.get(1);
      child0.insert('grandChild', PropertyFactory.create('NodeProperty', 'single'));
      dataBinder._dataBindingCreatedCounter.should.equal(0);
      child1.insert('child', PropertyFactory.create(ChildTemplate.typeid, undefined,
        {text: 'forty-two'}));
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      dataBinder._resetDebugCounters();
      // remove this first, so the path to our DataBinding Changes
      childArrayProperty.remove(0);
      childArrayProperty.remove(0);
      dataBinder._dataBindingRemovedCounter.should.equal(1);
      dataBinder._resetDebugCounters();

      // test for array collections
      childArrayProperty.get(1).insert('collectionContainer',
        PropertyFactory.create(ArrayContainerTemplate.typeid, 'single'));
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      dataBinder._resetDebugCounters();
      var nestedArray = childArrayProperty.get(['1', 'collectionContainer', 'nested', 'subArray']);
      nestedArray.push(PropertyFactory.create(ChildTemplate.typeid, undefined, {text: 'one'}));
      nestedArray.push(PropertyFactory.create(ChildTemplate.typeid, undefined, {text: 'two'}));
      nestedArray.push(PropertyFactory.create(ChildTemplate.typeid, undefined, {text: 'three'}));
      dataBinder._dataBindingCreatedCounter.should.equal(3);
      dataBinder._resetDebugCounters();
      createdDataBindings.push(dataBinder.resolve(nestedArray.get(0), 'BINDING'));
      createdDataBindings.push(dataBinder.resolve(nestedArray.get(1), 'BINDING'));
      createdDataBindings.push(dataBinder.resolve(nestedArray.get(2), 'BINDING'));
      collectionInsertSpy.callCount.should.equal(3);
      collectionInsertSpy.resetHistory();
      nestedArray.get([1, 'text']).setValue('twenty-two');
      collectionModifySpy.callCount.should.equal(1);
      collectionModifySpy.resetHistory();
      // grouped removes: remove one element in the array above this plus two elements from our nested array
      workspace.pushModifiedEventScope();
      childArrayProperty.remove(0);
      nestedArray.removeRange(0, 2);
      workspace.popModifiedEventScope();
      collectionRemoveSpy.callCount.should.equal(2);
      collectionRemoveSpy.resetHistory();
      receivedDataBindings.has(createdDataBindings[2]).should.equal(false);
      receivedDataBindings.size.should.equal(2);
      dataBinder._dataBindingRemovedCounter.should.equal(2);
      dataBinder._resetDebugCounters();

      // test for map collections
      childArrayProperty.get(2).insert('mapCollectionContainer',
        PropertyFactory.create(MapContainerTemplate.typeid, 'single'));
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      dataBinder._resetDebugCounters();
      var nestedMap = childArrayProperty.get(['2', 'mapCollectionContainer', 'nested', 'subMap']);
      nestedMap.insert('one', PropertyFactory.create(ChildTemplate.typeid, undefined, {text: 'one'}));
      nestedMap.insert('two', PropertyFactory.create(ChildTemplate.typeid, undefined, {text: 'two'}));
      nestedMap.insert('three', PropertyFactory.create(ChildTemplate.typeid, undefined, {text: 'three'}));
      dataBinder._dataBindingCreatedCounter.should.equal(3);
      dataBinder._resetDebugCounters();
      createdDataBindings.push(dataBinder.resolve(nestedMap.get('one'), 'BINDING'));
      createdDataBindings.push(dataBinder.resolve(nestedMap.get('two'), 'BINDING'));
      createdDataBindings.push(dataBinder.resolve(nestedMap.get('three'), 'BINDING'));
      collectionInsertSpy.callCount.should.equal(3);
      collectionInsertSpy.resetHistory();
      nestedMap.get(['one', 'text']).setValue('twenty-two');
      mapCollectionModifySpy.callCount.should.equal(1);
      mapCollectionModifySpy.resetHistory();
      // grouped removes: remove one element in the array above this plus two elements from our nested map
      workspace.pushModifiedEventScope();
      childArrayProperty.remove(1); // we remove index 1 so that our map moves, but our array (see above) stays!
      nestedMap.remove('one');
      nestedMap.remove('three');
      workspace.popModifiedEventScope();
      collectionRemoveSpy.callCount.should.equal(2);
      collectionRemoveSpy.resetHistory();
      receivedDataBindings.has(createdDataBindings[4]).should.equal(false);
      receivedDataBindings.size.should.equal(4);
      dataBinder._dataBindingRemovedCounter.should.equal(2);
      dataBinder._resetDebugCounters();

      // check error flags ->  have to do it this way because HFDM swallows exceptions in callbacks :(
      childSpyError.should.equal(false);
      collectionInsertSpyError.should.equal(false);
      collectionModifySpyError.should.equal(false);
      mapCollectionModifySpyError.should.equal(false);
      collectionRemoveSpyError.should.equal(false);
    });

    it('array of strings', function() {
      const collectionInsert = sinon.spy();
      const collectionModify = sinon.spy();
      const collectionRemove = sinon.spy();
      PrimitiveChildrenDataBinding.registerOnPath('arrayOfStrings', ['collectionInsert'], collectionInsert);
      PrimitiveChildrenDataBinding.registerOnPath('arrayOfStrings', ['collectionModify'], collectionModify);
      PrimitiveChildrenDataBinding.registerOnPath('arrayOfStrings', ['collectionRemove'], collectionRemove);

      dataBinder.register('BINDING', PrimitiveChildrenTemplate.typeid, PrimitiveChildrenDataBinding);
      dataBinder.attachTo(workspace);
      workspace.insert('bob', PropertyFactory.create(PrimitiveChildrenTemplate.typeid));
      workspace.get(['bob', 'arrayOfStrings']).push('Hi there');
      collectionInsert.callCount.should.equal(1);
      collectionRemove.callCount.should.equal(0);

      workspace.get(['bob', 'arrayOfStrings']).pop();
      collectionInsert.callCount.should.equal(1);
      collectionModify.callCount.should.equal(0);
      collectionRemove.callCount.should.equal(1);

      collectionInsert.resetHistory();
      collectionModify.resetHistory();
      collectionRemove.resetHistory();
      workspace.get(['bob', 'arrayOfStrings']).setValues(['a', 'b']);

      collectionInsert.callCount.should.equal(2);
      collectionModify.callCount.should.equal(0);
      collectionRemove.callCount.should.equal(0);

      collectionInsert.resetHistory();
      collectionModify.resetHistory();
      collectionRemove.resetHistory();
      workspace.get(['bob', 'arrayOfStrings']).setValues(['c', 'd']);

      collectionInsert.callCount.should.equal(0);
      collectionModify.callCount.should.equal(2);
      collectionRemove.callCount.should.equal(0);

      collectionInsert.resetHistory();
      collectionModify.resetHistory();
      collectionRemove.resetHistory();
      workspace.get(['bob', 'arrayOfStrings']).setValues(['e', 'f', 'g']);

      collectionInsert.callCount.should.equal(1);
      collectionModify.callCount.should.equal(2);
      collectionRemove.callCount.should.equal(0);
    });

    it('resolve() should work for DataBindings that replace DataBindings with the same path', function() {

      var dataBindings = [];
      var resolvedDataBindings;
      var error = false;
      var collectionRemoveSpy = sinon.spy(function(index, modificationContext) {
        // have to do it this way because HFDM swallows exceptions in callbacks :(
        if (index !== 2 ) {
          error = true;
        }
        var removedDataBindings = modificationContext.getDataBinding();
        if (!removedDataBindings) {
          error = true;
        }
        if (removedDataBindings !== dataBindings[2]) {
          error = true;
        }
        resolvedDataBindings = dataBinder.resolve('/childArray[2]', 'BINDING');
        if (!resolvedDataBindings) {
          error = true;
        }
        if (resolvedDataBindings === removedDataBindings) {
          error = true;
        }
      });

      ParentDataBinding.registerOnPath('', ['collectionRemove'], collectionRemoveSpy);
      dataBinder.register('BINDING', 'array<' + ChildTemplate.typeid + '>', ParentDataBinding);
      dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding);
      dataBinder.attachTo(workspace);

      workspace.insert('childArray', PropertyFactory.create(ChildTemplate.typeid, 'array'));
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      dataBinder._resetDebugCounters();
      var childArrayProperty = workspace.get('childArray');
      childArrayProperty.push(PropertyFactory.create(ChildTemplate.typeid, undefined,
        {text: 'zero'}));
      childArrayProperty.push(PropertyFactory.create(ChildTemplate.typeid, undefined,
        {text: 'one'}));
      childArrayProperty.push(PropertyFactory.create(ChildTemplate.typeid, undefined,
        {text: 'two'}));
      dataBinder._dataBindingCreatedCounter.should.equal(3);
      dataBinder._resetDebugCounters();
      for (var i = 0; i < 3; ++i) {
        dataBindings.push(dataBinder.resolve(childArrayProperty.get(i), 'BINDING'));
      }
      workspace.pushModifiedEventScope();
      childArrayProperty.removeRange(2, 1);
      childArrayProperty.insert(2, PropertyFactory.create(ChildTemplate.typeid, undefined,
        {text: 'twenty-two'}));
      workspace.popModifiedEventScope();
      dataBinder._dataBindingCreatedCounter.should.equal(1);
      dataBinder._dataBindingRemovedCounter.should.equal(1);
      var newDataBinding = dataBinder.resolve(childArrayProperty.get(2), 'BINDING');
      var newResolvedDataBindings = dataBinder.resolve('/childArray[2]', 'BINDING');
      newResolvedDataBindings.should.equal(newDataBinding);
      newResolvedDataBindings.should.equal(resolvedDataBindings);
      // have to do it this way because HFDM swallows exceptions in callbacks :(
      error.should.equal(false);
    });

    it('should be able to register on some path from an explicity nested schema and react to changes in the subtree',
      function() {
        dataBinder.attachTo(workspace);

        const pathSpy = sinon.spy();
        ParentDataBinding.registerOnPath('position', ['modify'], pathSpy);
        dataBinder.register('BINDING', point2DExplicitTemplate.typeid, ParentDataBinding);

        workspace.insert('point2D', PropertyFactory.create(point2DExplicitTemplate.typeid, 'single'));

        workspace.get('point2D').get('position').get('x').value = 42;
        workspace.get('point2D').get('position').get('y').value = 42;
        pathSpy.callCount.should.equal(2);
      });

    it('can tell if inserts/removes are simulated or real - attach/detach', function() {
      let simulated;
      const called = sinon.spy();

      const checkSimulated = function(context) {
        called();
        simulated.should.equal(context.isSimulated());
      };
      const checkCollectionSimulated = function(stupidOrder, context) {
        called();
        simulated.should.equal(context.isSimulated());
      };

      const data1 = PropertyFactory.create(PrimitiveChildrenTemplate.typeid);
      data1.get('arrayOfStrings').push('myString');
      const data2 = PropertyFactory.create(PrimitiveChildrenTemplate.typeid);
      data2.get('arrayOfStrings').push('myString');

      dataBinder.registerOnPath('data1', ['insert', 'remove'], checkSimulated);
      dataBinder.registerOnPath('data2', ['insert', 'remove'], checkSimulated);
      dataBinder.registerOnPath(
        'data1.arrayOfStrings', ['collectionInsert', 'collectionRemove'], checkCollectionSimulated
      );
      dataBinder.registerOnPath(
        'data2.arrayOfStrings', ['collectionInsert', 'collectionRemove'], checkCollectionSimulated
      );

      // retroactively adding bindings - we will get simulated callbacks for data1
      called.callCount.should.equal(0);
      simulated = true;
      workspace.insert('data1', data1);
      dataBinder.attachTo(workspace);
      called.callCount.should.equal(2);

      // bindings are attached - we will get real callbacks for data2
      simulated = false;
      called.resetHistory();
      workspace.insert('data2', data2);
      called.callCount.should.equal(2);

      // real callbacks for data2 being removed
      simulated = false;
      called.resetHistory();
      workspace.remove(data2);
      // We won't get called back for collectionRemove (sort of LYNXDEV-5675) - so only one call
      called.callCount.should.equal(1);

      // simulated callbacks for data1 being removed
      simulated = true;
      called.resetHistory();
      dataBinder.detach();
      // We won't get called back for collectionRemove LYNXDEV-5675 - so only one call
      called.callCount.should.equal(1);
    });

    it('can tell if inserts/removes are simulated or real - destroy handle', function() {
      let simulated;
      const called = sinon.spy();

      const checkSimulated = function(context) {
        called();
        simulated.should.equal(context.isSimulated());
      };
      const checkCollectionSimulated = function(stupidOrder, context) {
        called();
        simulated.should.equal(context.isSimulated());
      };

      const data1 = PropertyFactory.create(PrimitiveChildrenTemplate.typeid);
      data1.get('arrayOfStrings').push('myString');

      dataBinder.attachTo(workspace);
      const handle1 = dataBinder.registerOnPath('data1', ['insert', 'remove'], checkSimulated);
      const handle2 = dataBinder.registerOnPath(
        'data1.arrayOfStrings', ['collectionInsert', 'collectionRemove'], checkCollectionSimulated
      );

      // bindings are attached - we will get real callbacks for data1
      called.callCount.should.equal(0);
      simulated = false;
      workspace.insert('data1', data1);
      called.callCount.should.equal(2);

      // simulated callbacks for handles being destroyed
      // Unfortunately, we don't get any callbacks for these
      called.resetHistory();
      simulated = true;
      handle1.destroy();
      called.callCount.should.equal(0); // broken

      called.resetHistory();
      handle2.destroy();
      called.callCount.should.equal(0); // broken
    });

    it('should not be able to register on multiple paths for registerOnProperty etc.', function() {
      const pathSpy = sinon.spy();
      const paths = ['position.x', 'position.y'];
      (function() { ParentDataBinding.registerOnProperty(paths, ['modify'], pathSpy); }).should.throw(Error);
      (function() { ParentDataBinding.registerOnValues(paths, ['modify'], pathSpy); }).should.throw(Error);
    });

    it('should be able to register on multiple paths and get called back once', function() {
      dataBinder.attachTo(workspace);

      const pathSpy = sinon.spy();
      ParentDataBinding.registerOnPath(['position.x', 'position.y'], ['modify'], pathSpy);
      dataBinder.register('BINDING', point2DExplicitTemplate.typeid, ParentDataBinding);

      workspace.insert('point2D', PropertyFactory.create(point2DExplicitTemplate.typeid, 'single'));

      // Push a scope, and modify both position variables
      workspace.pushModifiedEventScope();

      workspace.get('point2D').get('position').get('x').value = 42;
      workspace.get('point2D').get('position').get('y').value = 42;

      // Haven't popped yet, shouldn't hear about it
      pathSpy.callCount.should.equal(0);

      workspace.popModifiedEventScope();

      pathSpy.callCount.should.equal(1);

      // Do another modify -- make sure that we haven't accidentally turned the callback off forever!
      workspace.pushModifiedEventScope();

      workspace.get('point2D').get('position').get('x').value = 43;
      workspace.get('point2D').get('position').get('y').value = 43;

      // Haven't popped yet, shouldn't hear about it
      pathSpy.callCount.should.equal(1);

      workspace.popModifiedEventScope();

      pathSpy.callCount.should.equal(2);
    });

    it('should be able to unregister a multiple paths binding', function() {
      dataBinder.attachTo(workspace);

      const pathSpy = sinon.spy();
      ParentDataBinding.registerOnPath(['position.x', 'position.y'], ['modify'], pathSpy);
      const handle = dataBinder.register('BINDING', point2DExplicitTemplate.typeid, ParentDataBinding);

      workspace.insert('point2D', PropertyFactory.create(point2DExplicitTemplate.typeid, 'single'));

      // Push a scope, and modify both position variables
      workspace.pushModifiedEventScope();

      workspace.get('point2D').get('position').get('x').value = 42;
      workspace.get('point2D').get('position').get('y').value = 42;

      // Haven't popped yet, shouldn't hear about it
      pathSpy.callCount.should.equal(0);

      workspace.popModifiedEventScope();

      pathSpy.callCount.should.equal(1);

      // Remove the binding
      pathSpy.resetHistory();
      handle.destroy();

      // Do another modify; we shouldn't get called back since we have removed the binding
      workspace.pushModifiedEventScope();

      workspace.get('point2D').get('position').get('x').value = 43;
      workspace.get('point2D').get('position').get('y').value = 43;

      workspace.popModifiedEventScope();

      // No binding anymore: shouldn't fire at all
      pathSpy.callCount.should.equal(0);
    });

    it('should be able to register on multiple paths and independently hear from different callbacks', function() {
      // We are registering on two paths, for insert and modify. The goal of this test is to ensure that the
      // callback is called _once_ for the modify, and _once_ for the insert. i.e., there are two inserts, so
      // insert should only be called once, but we want to make sure that the 'call once' mechanism doesn't prevent
      // the modify callback from being called
      dataBinder.attachTo(workspace);

      const pathSpy = sinon.spy();
      ParentDataBinding.registerOnPath(['child1.x', 'child1.y', 'child2.x', 'child2.y'], ['insert', 'modify'], pathSpy);
      dataBinder.register('BINDING', 'NodeProperty', ParentDataBinding);

      // child1 is already there, child2 is inserted later, inside the push/pop modified event scope.
      workspace.insert('child1', PropertyFactory.create(positionTemplate.typeid, 'single'));

      // Should have heard of the insert of child1, once
      pathSpy.callCount.should.equal(1);
      pathSpy.resetHistory();

      // Push a scope, insert child2 and also modify child1. This should cause the insert _and_ the modify callbacks
      // to be called.
      workspace.pushModifiedEventScope();

      workspace.insert('child2', PropertyFactory.create(positionTemplate.typeid, 'single'));

      workspace.get('child1').get('x').value = 42;
      workspace.get('child1').get('y').value = 42;

      // Haven't popped yet, shouldn't hear about it
      pathSpy.callCount.should.equal(0);

      workspace.popModifiedEventScope();

      // We should have heard one for the insert, and once for the modify
      pathSpy.callCount.should.equal(2);
    });

    it('getRelativeTokenizedPath - relative path', function() {
      let worked = false;
      PrimitiveChildrenDataBinding.registerOnPath('nested.aNumber', ['modify'], function(in_context) {
        const path = in_context.getRelativeTokenizedPath();
        worked = path.length === 2 && path[0] === 'nested' && path[1] === 'aNumber';
      });

      // Register the base (Child) typeid
      dataBinder.register('BINDING', PrimitiveChildrenTemplate.typeid, PrimitiveChildrenDataBinding);

      // Create PSet for inherited child typeid
      var primitiveChildPset = PropertyFactory.create(PrimitiveChildrenTemplate.typeid, 'single');
      dataBinder._dataBindingCreatedCounter.should.equal(0);
      dataBinder.attachTo(workspace);

      // primitiveChildPset should produce a PrimitiveChildrenDataBinding
      workspace.insert('myPrimitiveChildTemplate', primitiveChildPset);

      worked.should.equal(false);
      primitiveChildPset.resolvePath('nested.aNumber').setValue(23);
      worked.should.equal(true);
    });

    it('should be able to register on some path from an implicitly nested schema and react to changes in the subtree',
      function() {
        dataBinder.attachTo(workspace);

        const pathSpy = sinon.spy();
        ParentDataBinding.registerOnPath('position', ['modify'], pathSpy);
        dataBinder.register('BINDING', point2DImplicitTemplate.typeid, ParentDataBinding);

        workspace.insert('point2D', PropertyFactory.create(point2DImplicitTemplate.typeid, 'single'));

        workspace.get('point2D').get('position').get('x').value = 42;
        workspace.get('point2D').get('position').get('y').value = 42;

        // We do the modifications outside of a modifiedEventScope, so we expect to hear about it twice
        pathSpy.callCount.should.equal(2);
      });

    it('register on a structure modify and react to changes in the subtree LYNXDEV-5365',
      function() {
        dataBinder.attachTo(workspace);

        const pathSpy = sinon.spy();
        ParentDataBinding.registerOnPath('position', ['modify'], pathSpy);
        dataBinder.register('BINDING', point2DImplicitTemplate.typeid, ParentDataBinding);

        workspace.insert('point2D', PropertyFactory.create(point2DImplicitTemplate.typeid, 'single'));

        workspace.pushModifiedEventScope();
        workspace.get('point2D').get('position').get('x').value = 42;
        workspace.get('point2D').get('position').get('y').value = 42;
        workspace.popModifiedEventScope();

        // We do the modifications inside a modifiedEventScope, so we expect to only hear about it once
        pathSpy.callCount.should.equal(1);
      });

    it('register on a structure modify and react to changes in the subtree LYNXDEV-5365, differing types',
      function() {
      // Similar to the above test, but x and y are differing types and hence in different subhierarchies
      // in the HFDM change set
        const point2DWeirdTemplate = {
          properties: [
            { id: 'color', typeid: 'String' },
            {
              id: 'position', properties: [
                { id: 'x', typeid: 'Float64' },
                { id: 'y', typeid: 'Int32' }
              ]
            }
          ],
          typeid: 'Test:pointWeird.implicit-1.0.0'
        };

        PropertyFactory.register(point2DWeirdTemplate);

        dataBinder.attachTo(workspace);

        const pathSpy = sinon.spy();
        ParentDataBinding.registerOnPath('position', ['modify'], pathSpy);
        dataBinder.register('BINDING', point2DWeirdTemplate.typeid, ParentDataBinding);

        workspace.insert('point2D', PropertyFactory.create(point2DWeirdTemplate.typeid, 'single'));

        workspace.pushModifiedEventScope();
        workspace.get('point2D').get('position').get('x').value = 42;
        workspace.get('point2D').get('position').get('y').value = 42;
        workspace.popModifiedEventScope();

        // We do the modifications inside a modifiedEventScope, so we expect to only hear about it once
        pathSpy.callCount.should.equal(1);
      });

    it('call onPostCreate/onModify before calling relative path callbacks, onRemove after (LYNXDEV-5746)', function() {
      class myDerivedDataBinding extends DataBinding {
        constructor(params) {
          super(params);
          this._insertMockObject = false;
          this._modifyMockObject = false;
          this._removeMockObject = false;
        }

        onPostCreate(params) {
          this._insertMockObject.should.equal(false);
          this._insertMockObject = true;
        }

        onModify(params) {
          this._modifyMockObject.should.equal(false);
          this._modifyMockObject = true;
        }

        onRemove(params) {
          this._removeMockObject.should.equal(true);
        }
      }

      dataBinder.attachTo(workspace);
      const pathInsertSpy = sinon.spy(function() {
        this._insertMockObject.should.equal(true);
      });
      const pathModifySpy = sinon.spy(function() {
        this._modifyMockObject.should.equal(true);
      });
      const pathRemoveSpy = sinon.spy(function() {
        // this should be called *before* onRemove
        this._removeMockObject.should.equal(false);
        this._removeMockObject = true;
      });
      myDerivedDataBinding.registerOnPath('text', ['insert'], pathInsertSpy);
      myDerivedDataBinding.registerOnPath('text', ['modify'], pathModifySpy);
      myDerivedDataBinding.registerOnPath('text', ['remove'], pathRemoveSpy);
      dataBinder.register('BINDING', ParentTemplate.typeid, myDerivedDataBinding);
      workspace.insert('parentProperty', PropertyFactory.create(ParentTemplate.typeid, 'single'));
      pathInsertSpy.callCount.should.equal(1);
      workspace.get(['parentProperty', 'text']).setValue('forty-two');
      pathModifySpy.callCount.should.equal(1);
      workspace.remove('parentProperty');
      pathRemoveSpy.callCount.should.equal(1);
    });

    it('relative path callback on nested reference (LYNXDEV-6013)', function() {

      const modifySpy = sinon.spy(function(in_context) {
      });
      const insertRemoveSpy = sinon.spy(function(in_context) {
      });
      class myDerivedDataBinding extends DataBinding {
        constructor(params) { // eslint-disable-line no-useless-constructor
          super(params);
        }

        static initialize() {
          this.registerOnPath(
            'container.ref.text', ['insert', 'remove'], insertRemoveSpy
          );
          this.registerOnPath(
            'container.ref.text', ['modify'], modifySpy
          );
        }
      }
      myDerivedDataBinding.initialize();
      dataBinder.attachTo(workspace);
      dataBinder.register('BINDING', referenceContainerTemplate.typeid, myDerivedDataBinding);
      workspace.insert('refContainer', PropertyFactory.create(referenceContainerTemplate.typeid, 'single'));
      workspace.get(['refContainer', 'container', 'ref'], RESOLVE_NO_LEAFS).setValue('/child');
      workspace.insert('child', PropertyFactory.create(ChildTemplate.typeid, 'single'));
      insertRemoveSpy.callCount.should.equal(1); // insert
      workspace.get(['child', 'text']).setValue('this is still 42');
      modifySpy.callCount.should.equal(1); // modify
      workspace.remove('child');
      insertRemoveSpy.callCount.should.equal(2); // insert + remove
    });

    it('should pass correct args to callbacks when binding multiple paths in a single call (LYNXDEV-6095)', function() {
      dataBinder.attachTo(workspace);

      let collectionCallbackCalled = false;
      let singleCallbackCalled = false;
      let expectedPath = '';
      const collectionPathSpy = sinon.spy(function(in_position, in_context) {
        in_context.should.be.instanceof(ModificationContext);
        // the wired in order / keys aren't very nice but it's simple and we control the order/keys (see below)
        if (!collectionCallbackCalled) {
          in_position.should.equal(0);
        } else {
          in_position.should.equal('a');
        }
        collectionCallbackCalled = true;
      });
      const singlePathSpy = sinon.spy(function(in_context) {
        in_context.should.be.instanceof(ModificationContext);
        if (!singleCallbackCalled) {
          in_context.getOperationType().should.equal('insert'); // the first call is for the insert
        } else {
          in_context.getOperationType().should.equal('modify'); // the other calls are for the modifies
          in_context.getAbsolutePath().should.equal(expectedPath);
        }
        singleCallbackCalled = true;
      });
      ParentDataBinding.registerOnPath(['aString', 'aNumber'],
        ['insert', 'modify'], singlePathSpy);
      ParentDataBinding.registerOnPath(['arrayOfNumbers', 'mapOfNumbers'],
        ['collectionInsert', 'collectionModify'], collectionPathSpy);
      const handle = dataBinder.register('BINDING', PrimitiveChildrenTemplate.typeid, ParentDataBinding);

      workspace.insert('props', PropertyFactory.create(PrimitiveChildrenTemplate.typeid, 'single'));
      singlePathSpy.callCount.should.equal(1); // called once for the insert

      workspace.get('props').get('arrayOfNumbers').push(42);
      collectionPathSpy.callCount.should.equal(1);
      workspace.get('props').get('mapOfNumbers').insert('a', 42);
      collectionPathSpy.callCount.should.equal(2);
      expectedPath = '/props.aString';
      workspace.get('props').get('aString').setValue('forty-two');
      singlePathSpy.callCount.should.equal(2);
      expectedPath = '/props.aNumber';
      workspace.get('props').get('aNumber').setValue(42);
      singlePathSpy.callCount.should.equal(3);
      // Remove the binding
      collectionPathSpy.resetHistory();
      singlePathSpy.resetHistory();
      singlePathSpy.resetHistory();
      handle.destroy();
    });

    it('documentation example - inheritance', function() {

      class Object3DDataBinding extends DataBinding {
      }

      class Camera3DDataBinding extends DataBinding {
      }

      // SnippetStart{DataBinder.DataBindingInheritance}
      dataBinder.attachTo(workspace);

      const scene = PropertyFactory.create('NodeProperty');
      workspace.insert('scene', scene);

      // We assume Light3D-1.0.0 and Camera3D-1.0.0 inherit from Object3D-1.0.0
      // We define a binding for Object3D and for Camera3D
      dataBinder.defineDataBinding('BINDING', 'autodesk.samples:Object3D-1.0.0', Object3DDataBinding);
      dataBinder.defineDataBinding('BINDING', 'autodesk.samples:Camera3D-1.0.0', Camera3DDataBinding);

      // We activate anything that inherits from Object3D-1.0.0, but only if in the scene subhierarchy
      dataBinder.activateDataBinding('BINDING', 'autodesk.samples:Object3D-1.0.0', {includePrefix: 'scene'});

      // When this light is added, the best match is Object3D-1.0.0, so an Object3DDataBinding is created
      scene.insert('light', PropertyFactory.create('autodesk.samples:Light3D-1.0.0'));
      console.assert( dataBinder.resolve('scene.light', 'BINDING') instanceof Object3DDataBinding );

      // When this camera is added, the best match is the Camera3D-1.0.0 specialization,
      // leading to a Camera3DDataBinding to be instantiated
      scene.insert('camera', PropertyFactory.create('autodesk.samples:Camera3D-1.0.0'));
      console.assert( dataBinder.resolve('scene.camera', 'BINDING') instanceof Camera3DDataBinding );

      // When this camera is added, it does not match the 'scene' prefix specified in the activateDataBinding call
      // so nothing is created
      workspace.insert('lostCamera', PropertyFactory.create('autodesk.samples:Camera3D-1.0.0'));
      console.assert( dataBinder.resolve('lostCamera', 'BINDING') === undefined );
      // SnippetEnd{DataBinder.DataBindingInheritance}
    });

    it('documentation example - simple register callbacks', function() {
      // SnippetStart{DataBinder.Object3DBinding}
      class Object3DDataBinding extends DataBinding {
        constructor(in_params) {
          super(in_params);

          this._object = new THREE.Object3D();
        }

        // Callback called when the 'pos' sub-property is changed. The DataBinder produces a
        // deep copy of the current values of the property and provides them to the callback
        changePosition(values) {
          this._object.position.set(values.x, values.y, values.z);
        }

        // Callback called when the 'pos' sub-property is changed. The DataBinder provides the
        // property that was modified. We manually extract the values.
        changeScale(property) {
          this._object.scale.set(
            property.get('x').value,
            property.get('y').value,
            property.get('z').value
          );
        }

        // The most general callback variant which gives us a modification context.
        changeName(modificationContext) {
          this._object.name = modificationContext.getProperty().value;
        }

        // We initialize our class with the static function that will register on each
        // of the following
        static initialize() {
          this.registerOnValues('pos', ['insert', 'modify'], this.prototype.changePosition);
          this.registerOnProperty('scale', ['insert', 'modify'], this.prototype.changeScale);
          this.registerOnPath('name', ['insert', 'modify'], this.prototype.changeName);
        }
      }
      Object3DDataBinding.initialize();
      // SnippetEnd{DataBinder.Object3DBinding}

      // Test that the sample works
      dataBinder.attachTo(workspace);
      dataBinder.register('BINDING', 'autodesk.samples:object3D-1.0.0', Object3DDataBinding);
      const myObject = PropertyFactory.create('autodesk.samples:object3D-1.0.0', 'single', {
        pos: {
          x: 1, y: 2, z: 3
        }, scale: {
          x: 1, y: 1, z: 1
        },
        name: 'myObject'
      });
      workspace.insert('object', myObject);

      const binding = dataBinder.resolve('object', 'BINDING');

      binding._object.name.should.equal('myObject');
      binding._object.position.should.deep.equal({x: 1, y: 2, z: 3});
      binding._object.scale.should.deep.equal({x: 1, y: 1, z: 1});

      myObject.get('name').setValue('stillMyObject');
      myObject.get(['pos', 'x']).setValue(4);
      myObject.get(['scale', 'y']).setValue(12);

      binding._object.name.should.equal('stillMyObject');
      binding._object.position.should.deep.equal({x: 4, y: 2, z: 3});
      binding._object.scale.should.deep.equal({x: 1, y: 12, z: 1});
    });

    it('documentation example - simple register callbacks - decorators', function() {
      // SnippetStart{DataBinder.Object3DBinding.Decorator}
      class Object3DDataBinding extends DataBinding {
        constructor(in_params) {
          super(in_params);

          this._object = new THREE.Object3D();
        }

        // Callback called when the 'pos' sub-property is changed. The DataBinder produces a
        // deep copy of the current values of the property and provides them to the callback
        @onValuesChanged('pos', ['insert', 'modify'])
        changePosition(values) {
          this._object.position.set(values.x, values.y, values.z);
        }

        // Callback called when the 'pos' sub-property is changed. The DataBinder provides the
        // property that was modified. We manually extract the values.
        @onPropertyChanged('scale', ['insert', 'modify'])
        changeScale(property) {
          this._object.scale.set(
            property.get('x').value,
            property.get('y').value,
            property.get('z').value
          );
        }

        // The most general callback variant which gives us a modification context.
        @onPathChanged('name', ['insert', 'modify'])
        changeName(modificationContext) {
          this._object.name = modificationContext.getProperty().value;
        }
      }
      // SnippetEnd{DataBinder.Object3DBinding.Decorator}

      // Test that the sample works
      dataBinder.attachTo(workspace);
      dataBinder.register('BINDING', 'autodesk.samples:object3D-1.0.0', Object3DDataBinding);
      const myObject = PropertyFactory.create('autodesk.samples:object3D-1.0.0', 'single', {
        pos: {
          x: 1, y: 2, z: 3
        }, scale: {
          x: 1, y: 1, z: 1
        },
        name: 'myObject'
      });
      workspace.insert('object', myObject);

      const binding = dataBinder.resolve('object', 'BINDING');

      binding._object.name.should.equal('myObject');
      binding._object.position.should.deep.equal({x: 1, y: 2, z: 3});
      binding._object.scale.should.deep.equal({x: 1, y: 1, z: 1});

      myObject.get('name').setValue('stillMyObject');
      myObject.get(['pos', 'x']).setValue(4);
      myObject.get(['scale', 'y']).setValue(12);

      binding._object.name.should.equal('stillMyObject');
      binding._object.position.should.deep.equal({x: 4, y: 2, z: 3});
      binding._object.scale.should.deep.equal({x: 1, y: 12, z: 1});
    });

  });
})();
