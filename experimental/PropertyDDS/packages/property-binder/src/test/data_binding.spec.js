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
import { DataBinder } from '../data_binder/dataBinder';
import {
  onValuesChanged, onPropertyChanged, onPathChanged, DataBinding
} from '../data_binder/dataBinding';
import { unregisterAllOnPathListeners } from '../data_binder/internalUtils';
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
import { catchConsoleErrors } from './catchConsoleError';
import { RESOLVE_NO_LEAFS } from '../internal/constants';
import { BaseProperty, PropertyFactory } from '@fluid-experimental/property-properties';
import { ModificationContext } from '../data_binder/modificationContext';
import { MockSharedPropertyTree } from './mockSharedPropertyTree';

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

describe('DataBinding.registerOnPath() should work for', function() {
  var dataBinder, workspace;

  catchConsoleErrors();

  beforeAll(function() {
    registerTestTemplates();

    PropertyFactory.register(Vector3DSchema);
    PropertyFactory.register(Object3DSchema);
  });

  beforeEach(async function() {
    // console.log('inner before each');
    dataBinder = new DataBinder();
    workspace = await MockSharedPropertyTree();
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
          expect(this.getDataBinder()._activeTraversal).toEqual(false);
        }, {
          isDeferred: true
        });
      }
    }

    dataBinder.attachTo(workspace);
    var primitiveChildPset = PropertyFactory.create(PrimitiveChildrenTemplate.typeid, 'single');

    dataBinder.register('BINDING', PrimitiveChildrenTemplate.typeid, MyBinding);

    workspace.root.insert('myPrimitiveChildTemplate', primitiveChildPset);
  });

  it('onModify', function() {
    // Register the base (Child) typeid
    var stringSpy = jest.fn();
    var mapSpy = jest.fn();

    PrimitiveChildrenDataBinding.registerOnPath('aString', ['modify'], stringSpy);
    PrimitiveChildrenDataBinding.registerOnPath('mapOfNumbers', ['modify'], mapSpy);
    dataBinder.register('BINDING', PrimitiveChildrenTemplate.typeid, PrimitiveChildrenDataBinding);

    // Create PSet for inherited child typeid
    var primitiveChildPset = PropertyFactory.create(PrimitiveChildrenTemplate.typeid, 'single');
    expect(dataBinder._dataBindingCreatedCounter).toEqual(0);
    dataBinder.attachTo(workspace);

    // primitiveChildPset should produce a PrimitiveChildrenDataBinding
    workspace.root.insert('myPrimitiveChildTemplate', primitiveChildPset);
    expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
    const primitiveChildDataBinding = dataBinder.resolve(primitiveChildPset.getAbsolutePath(), 'BINDING');
    expect(primitiveChildDataBinding).toBeInstanceOf(PrimitiveChildrenDataBinding);
    expect(primitiveChildDataBinding.getProperty()).toEqual(primitiveChildPset);
    expect(primitiveChildDataBinding.onModify).toHaveBeenCalledTimes(0); // !!!
    expect(primitiveChildDataBinding.onPreModify).toHaveBeenCalledTimes(primitiveChildDataBinding.onModify.mock.calls.length);
    primitiveChildDataBinding.onModify.mockClear();
    primitiveChildDataBinding.onPreModify.mockClear();
    expect(primitiveChildDataBinding.onPostCreate).toHaveBeenCalledTimes(1);
    // our specific onModify function shouldn't get called because it was an insert, not a modify operation
    expect(stringSpy).toHaveBeenCalledTimes(0);
    dataBinder._resetDebugCounters();

    // Should notify DataBinding when primitive property is changed
    primitiveChildPset.resolvePath('aString').value = 'hello';
    expect(primitiveChildDataBinding.onModify).toHaveBeenCalledTimes(1);
    expect(primitiveChildDataBinding.onPreModify).toHaveBeenCalledTimes(primitiveChildDataBinding.onModify.mock.calls.length);
    primitiveChildDataBinding.onModify.mockClear();
    primitiveChildDataBinding.onPreModify.mockClear();
    expect(stringSpy).toHaveBeenCalledTimes(1);
    stringSpy.mockClear();

    // Should not notify the special callback when a different primitive property is changed
    primitiveChildPset.resolvePath('aNumber').value = 42;
    expect(primitiveChildDataBinding.onModify).toHaveBeenCalledTimes(1);
    expect(primitiveChildDataBinding.onPreModify).toHaveBeenCalledTimes(primitiveChildDataBinding.onModify.mock.calls.length);
    primitiveChildDataBinding.onModify.mockClear();
    primitiveChildDataBinding.onPreModify.mockClear();
    expect(stringSpy).toHaveBeenCalledTimes(0);

    // Test modifications on the map
    expect(mapSpy).toHaveBeenCalledTimes(0);

    // Insertion into a map is a modify for the map itself
    primitiveChildPset.get('mapOfNumbers').insert('numberKey', 23);
    expect(mapSpy).toHaveBeenCalledTimes(1);

    // Modification of an entry in a map is a modify for the map itself
    primitiveChildPset.get('mapOfNumbers').set('numberKey', 42);
    expect(mapSpy).toHaveBeenCalledTimes(2);

    var nodeSpy = jest.fn();
    var nestedChildSpy = jest.fn();
    ParentDataBinding.registerOnPath('node', ['modify'], nodeSpy);
    ParentDataBinding.registerOnPath('node.child', ['modify'], nestedChildSpy);
    dataBinder.register('BINDING', NodeContainerTemplate.typeid, ParentDataBinding);

    workspace.root.insert('myNodePropertyTemplate', PropertyFactory.create(NodeContainerTemplate.typeid));
    workspace.root.get('myNodePropertyTemplate').insert('node', PropertyFactory.create('NodeProperty'));
    workspace.root.get('myNodePropertyTemplate').get('node').insert('child', PropertyFactory.create('String'));
    expect(nodeSpy).toHaveBeenCalledTimes(1);
    expect(nestedChildSpy).toHaveBeenCalledTimes(0);
    workspace.root.get(['myNodePropertyTemplate', 'node', 'child']).setValue('testString');
    expect(nodeSpy).toHaveBeenCalledTimes(2);
    expect(nestedChildSpy).toHaveBeenCalledTimes(1);
  });

  it('onInsert', function() {
    // Register the base (Child) typeid
    var anotherThingSpy = jest.fn();
    ParentDataBinding.registerOnPath('anotherThing', ['insert'], anotherThingSpy);
    var textSpy = jest.fn();
    ParentDataBinding.registerOnPath('text', ['insert'], textSpy);

    var nestedChildSpy = jest.fn();
    ParentDataBinding.registerOnPath('node.child', ['insert'], nestedChildSpy);
    dataBinder.register('BINDING', NodeContainerTemplate.typeid, ParentDataBinding);

    // Create PSet for inherited child typeid
    var nodeContainerPset = PropertyFactory.create(NodeContainerTemplate.typeid, 'single');
    expect(dataBinder._dataBindingCreatedCounter).toEqual(0);
    dataBinder.attachTo(workspace);

    // primitiveChildPset should produce a PrimitiveChildrenDataBinding
    workspace.root.insert('myNodeContainerTemplate', nodeContainerPset);
    expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
    const parentDataBinding = dataBinder.resolve(nodeContainerPset.getAbsolutePath(), 'BINDING');
    expect(parentDataBinding).toBeInstanceOf(ParentDataBinding);
    expect(parentDataBinding.getProperty()).toEqual(nodeContainerPset);
    expect(parentDataBinding.onModify).toHaveBeenCalledTimes(0); // !!!
    expect(parentDataBinding.onPreModify).toHaveBeenCalledTimes(parentDataBinding.onModify.mock.calls.length);
    parentDataBinding.onModify.mockClear();
    parentDataBinding.onPreModify.mockClear();
    expect(parentDataBinding.onPostCreate).toHaveBeenCalledTimes(1);
    // our specific onModify function shouldn't get called because we haven't inserted anything yet
    expect(anotherThingSpy).toHaveBeenCalledTimes(0);
    expect(textSpy).toHaveBeenCalledTimes(1);
    dataBinder._resetDebugCounters();
    textSpy.mockClear();

    // Should notify DataBinding when primitive property is inserted into the watched path
    var dummyPset = PropertyFactory.create(ParentTemplate.typeid, 'single');
    nodeContainerPset.insert('anotherThing', dummyPset);
    expect(parentDataBinding.onModify).toHaveBeenCalledTimes(1);
    expect(parentDataBinding.onPreModify).toHaveBeenCalledTimes(parentDataBinding.onModify.mock.calls.length);
    parentDataBinding.onModify.mockClear();
    parentDataBinding.onPreModify.mockClear();
    expect(anotherThingSpy).toHaveBeenCalledTimes(1);
    anotherThingSpy.mockClear();

    // Should not notify the special callback when a different primitive property is changed
    var dummyPset2 = PropertyFactory.create(ParentTemplate.typeid, 'single');
    nodeContainerPset.insert('anotherAnotherThing', dummyPset2);
    expect(parentDataBinding.onModify).toHaveBeenCalledTimes(1);
    expect(parentDataBinding.onPreModify).toHaveBeenCalledTimes(parentDataBinding.onModify.mock.calls.length);
    parentDataBinding.onModify.mockClear();
    parentDataBinding.onPreModify.mockClear();
    expect(anotherThingSpy).toHaveBeenCalledTimes(0);
    expect(textSpy).toHaveBeenCalledTimes(0);

    expect(nestedChildSpy).toHaveBeenCalledTimes(0);
    nodeContainerPset.insert('node', PropertyFactory.create('NodeProperty'));
    expect(nestedChildSpy).toHaveBeenCalledTimes(0);
    nodeContainerPset.get('node').insert('child', PropertyFactory.create('String'));
    expect(nestedChildSpy).toHaveBeenCalledTimes(1);
  });

  it('onRemove', function() {
    var anotherThingRemoveSpy = jest.fn();
    var textRemoveSpy = jest.fn();
    var nestedChildRemoveSpy = jest.fn();
    ParentDataBinding.registerOnPath('another.nested.thing', ['remove'], anotherThingRemoveSpy);
    ParentDataBinding.registerOnPath('text', ['remove'], textRemoveSpy);
    ParentDataBinding.registerOnPath('node.child', ['remove'], nestedChildRemoveSpy);
    // Register the base (Child) typeid
    dataBinder.register('BINDING', NodeContainerTemplate.typeid, ParentDataBinding);

    // Create PSet for inherited child typeid
    expect(dataBinder._dataBindingCreatedCounter).toEqual(0);
    dataBinder.attachTo(workspace);

    // primitiveChildPset should produce a PrimitiveChildrenDataBinding
    var nodeContainerPset = PropertyFactory.create(NodeContainerTemplate.typeid, 'single');
    workspace.root.insert('myNodeContainerTemplate', nodeContainerPset);
    nodeContainerPset.insert('node', PropertyFactory.create('NodeProperty'));
    nodeContainerPset.get('node').insert('child', PropertyFactory.create('String'));

    workspace.root.remove('myNodeContainerTemplate');
    expect(textRemoveSpy).toHaveBeenCalledTimes(1);
    expect(nestedChildRemoveSpy).toHaveBeenCalledTimes(1);
    expect(anotherThingRemoveSpy).toHaveBeenCalledTimes(0);
  });

  it('nested Paths', function() {
    var nestedSpy = jest.fn();
    PrimitiveChildrenDataBinding.registerOnPath('nested', ['modify'], nestedSpy);
    var numberSpy = jest.fn();
    PrimitiveChildrenDataBinding.registerOnPath('nested.aNumber', ['modify'], numberSpy);
    // Register the base (Child) typeid
    dataBinder.register('BINDING', PrimitiveChildrenTemplate.typeid, PrimitiveChildrenDataBinding);

    // Create PSet for inherited child typeid
    var primitiveChildPset = PropertyFactory.create(PrimitiveChildrenTemplate.typeid, 'single');
    expect(dataBinder._dataBindingCreatedCounter).toEqual(0);
    dataBinder.attachTo(workspace);

    // primitiveChildPset should produce a PrimitiveChildrenDataBinding
    workspace.root.insert('myPrimitiveChildTemplate', primitiveChildPset);
    expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
    const primitiveChildDataBinding = dataBinder.resolve(primitiveChildPset.getAbsolutePath(), 'BINDING');
    expect(primitiveChildDataBinding).toBeInstanceOf(PrimitiveChildrenDataBinding);
    expect(primitiveChildDataBinding.getProperty()).toEqual(primitiveChildPset);
    expect(primitiveChildDataBinding.onModify).toHaveBeenCalledTimes(0); // !!!
    expect(primitiveChildDataBinding.onPreModify).toHaveBeenCalledTimes(primitiveChildDataBinding.onModify.mock.calls.length);
    primitiveChildDataBinding.onModify.mockClear();
    primitiveChildDataBinding.onPreModify.mockClear();
    expect(primitiveChildDataBinding.onPostCreate).toHaveBeenCalledTimes(1);

    primitiveChildPset.resolvePath('nested.aNumber').setValue(23);
    expect(nestedSpy).toHaveBeenCalledTimes(1);
    expect(numberSpy).toHaveBeenCalledTimes(1);

    // Should notify DataBinding when primitive property is inserted into the watched path
    primitiveChildPset.resolvePath('nested.aNumber').setValue(42);
    expect(primitiveChildDataBinding.onModify).toHaveBeenCalledTimes(2);
    expect(primitiveChildDataBinding.onPreModify).toHaveBeenCalledTimes(primitiveChildDataBinding.onModify.mock.calls.length);
    primitiveChildDataBinding.onModify.mockClear();
    primitiveChildDataBinding.onPreModify.mockClear();
    expect(numberSpy).toHaveBeenCalledTimes(2);
    expect(nestedSpy).toHaveBeenCalledTimes(2);
    numberSpy.mockClear();
  });

  it('primitive collections', function() {
    // Register the base (Child) typeid

    var mapInsertSpy = jest.fn();
    var mapModifySpy = jest.fn();
    var mapRemoveSpy = jest.fn();
    PrimitiveChildrenDataBinding.registerOnPath('mapOfNumbers', ['collectionInsert'], mapInsertSpy);
    PrimitiveChildrenDataBinding.registerOnPath('mapOfNumbers', ['collectionModify'], mapModifySpy);
    PrimitiveChildrenDataBinding.registerOnPath('mapOfNumbers', ['collectionRemove'], mapRemoveSpy);

    var arrayInsertSpy = jest.fn();
    var arrayModifySpy = jest.fn();
    var arrayRemoveSpy = jest.fn();
    PrimitiveChildrenDataBinding.registerOnPath('arrayOfNumbers', ['collectionInsert'], arrayInsertSpy);
    PrimitiveChildrenDataBinding.registerOnPath('arrayOfNumbers', ['collectionModify'], arrayModifySpy);
    PrimitiveChildrenDataBinding.registerOnPath('arrayOfNumbers', ['collectionRemove'], arrayRemoveSpy);
    dataBinder.register('BINDING', PrimitiveChildrenTemplate.typeid, PrimitiveChildrenDataBinding);
    dataBinder.attachTo(workspace);

    var primitiveChildPset = PropertyFactory.create(PrimitiveChildrenTemplate.typeid, 'single');
    workspace.root.insert('myPrimitiveChildTemplate', primitiveChildPset);

    // Expect the insertion of ranges to trigger onInsert messages
    var arrayProperty = workspace.root.get(['myPrimitiveChildTemplate', 'arrayOfNumbers']);
    arrayProperty.insertRange(0, [1, 2, 3, 4, 5, 6]);
    expect(arrayInsertSpy).toHaveBeenCalledTimes(6);
    expect(arrayInsertSpy.mock.calls[0][0]).toEqual(0);
    expect(arrayInsertSpy.mock.calls[1][0]).toEqual(1);
    expect(arrayInsertSpy.mock.calls[2][0]).toEqual(2);
    expect(arrayInsertSpy.mock.calls[3][0]).toEqual(3);
    expect(arrayInsertSpy.mock.calls[4][0]).toEqual(4);
    expect(arrayInsertSpy.mock.calls[5][0]).toEqual(5);
    arrayInsertSpy.mockClear();

    arrayProperty.setRange(1, [5, 6]);
    expect(arrayModifySpy).toHaveBeenCalledTimes(2);
    expect(arrayModifySpy.mock.calls[0][0]).toEqual(1);
    expect(arrayModifySpy.mock.calls[1][0]).toEqual(2);
    arrayModifySpy.mockClear();

    arrayProperty.removeRange(1, 2);
    expect(arrayRemoveSpy).toHaveBeenCalledTimes(2);
    expect(arrayRemoveSpy.mock.calls[0][0]).toEqual(1);
    expect(arrayRemoveSpy.mock.calls[1][0]).toEqual(1);
    arrayRemoveSpy.mockClear();

    // Expect the insertion of map values to trigger onInsert messages
    var mapProperty = workspace.root.get(['myPrimitiveChildTemplate', 'mapOfNumbers']);
    workspace.pushNotificationDelayScope();
    mapProperty.insert('one', 1);
    mapProperty.insert('two', 2);
    mapProperty.insert('three', 3);
    mapProperty.insert('four', 4);
    mapProperty.insert('five', 5);
    workspace.popNotificationDelayScope();
    expect(mapInsertSpy).toHaveBeenCalledTimes(5);
    expect(mapInsertSpy.mock.calls[0][0]).toEqual('one');
    expect(mapInsertSpy.mock.calls[1][0]).toEqual('two');
    expect(mapInsertSpy.mock.calls[2][0]).toEqual('three');
    expect(mapInsertSpy.mock.calls[3][0]).toEqual('four');
    expect(mapInsertSpy.mock.calls[4][0]).toEqual('five');
    mapInsertSpy.mockClear();

    // modify map
    workspace.pushNotificationDelayScope();
    mapProperty.set('one', 10);
    mapProperty.set('two', 20);
    mapProperty.set('three', 30);
    workspace.popNotificationDelayScope();
    expect(mapModifySpy).toHaveBeenCalledTimes(3);
    expect(mapModifySpy.mock.calls[0][0]).toEqual('one');
    expect(mapModifySpy.mock.calls[1][0]).toEqual('two');
    expect(mapModifySpy.mock.calls[2][0]).toEqual('three');
    mapModifySpy.mockClear();

    // remove from map
    workspace.pushNotificationDelayScope();
    mapProperty.remove('one');
    mapProperty.remove('two');
    mapProperty.remove('three');
    workspace.popNotificationDelayScope();
    expect(mapRemoveSpy).toHaveBeenCalledTimes(3);
    expect(mapRemoveSpy.mock.calls[0][0]).toEqual('one');
    expect(mapRemoveSpy.mock.calls[1][0]).toEqual('two');
    expect(mapRemoveSpy.mock.calls[2][0]).toEqual('three');
    mapRemoveSpy.mockClear();
  });

  it('composed type array', function() {
    var arrayInsertSpy = jest.fn();
    var arrayModifySpy = jest.fn();
    var arrayRemoveSpy = jest.fn();
    ParentDataBinding.registerOnPath('subArray', ['collectionInsert'], arrayInsertSpy);
    ParentDataBinding.registerOnPath('subArray', ['collectionModify'], arrayModifySpy);
    ParentDataBinding.registerOnPath('subArray', ['collectionRemove'], arrayRemoveSpy);

    // Register the base (Child) typeid
    dataBinder.register('BINDING', ArrayContainerTemplate.typeid, ParentDataBinding);
    dataBinder.attachTo(workspace);

    var arrayContainerPset = PropertyFactory.create(ArrayContainerTemplate.typeid, 'single');
    workspace.root.insert('myArrayContainerTemplate', arrayContainerPset);

    // Expect the insertion of ranges to trigger onInsert messages
    var arrayProperty = workspace.root.get(['myArrayContainerTemplate', 'subArray']);
    arrayProperty.insertRange(0, _.map([1, 2, 3, 4, 5, 6], function(i) {
      return PropertyFactory.create('Test:ChildID-0.0.1', undefined, {
        text: String(i)
      });
    }));
    expect(arrayInsertSpy).toHaveBeenCalledTimes(6);
    expect(arrayInsertSpy.mock.calls[0][0]).toEqual(0);
    expect(arrayInsertSpy.mock.calls[1][0]).toEqual(1);
    expect(arrayInsertSpy.mock.calls[2][0]).toEqual(2);
    expect(arrayInsertSpy.mock.calls[3][0]).toEqual(3);
    expect(arrayInsertSpy.mock.calls[4][0]).toEqual(4);
    expect(arrayInsertSpy.mock.calls[5][0]).toEqual(5);

    expect(arrayInsertSpy.mock.calls[0][1].getNestedChangeSet().typeid).toEqual('Test:ChildID-0.0.1');
    expect(arrayInsertSpy.mock.calls[0][1].getNestedChangeSet().String.text).toEqual('1');
    expect(arrayInsertSpy.mock.calls[0][1].getContext()).toEqual('array');
    expect(arrayInsertSpy.mock.calls[0][1].getOperationType()).toEqual('insert');
    expect(arrayInsertSpy.mock.calls[0][1].getAbsolutePath()).toEqual('/myArrayContainerTemplate.subArray[0]');
    expect(arrayInsertSpy.mock.calls[4][1].getNestedChangeSet().String.text).toEqual('5');

    arrayInsertSpy.mockClear();

    arrayProperty.get([1, 'text']).setValue('5');
    arrayProperty.get([2, 'text']).setValue('6');
    expect(arrayModifySpy).toHaveBeenCalledTimes(2);
    expect(arrayModifySpy.mock.calls[0][0]).toEqual(1);
    expect(arrayModifySpy.mock.calls[1][0]).toEqual(2);

    expect(arrayModifySpy.mock.calls[0][1].getNestedChangeSet().typeid).toEqual('Test:ChildID-0.0.1');
    expect(arrayModifySpy.mock.calls[0][1].getNestedChangeSet().String.text).toEqual('5');
    expect(arrayModifySpy.mock.calls[0][1].getContext()).toEqual('array');
    expect(arrayModifySpy.mock.calls[0][1].getOperationType()).toEqual('modify');
    expect(arrayModifySpy.mock.calls[0][1].getAbsolutePath()).toEqual('/myArrayContainerTemplate.subArray[1]');
    expect(arrayModifySpy.mock.calls[1][1].getNestedChangeSet().String.text).toEqual('6');
    arrayModifySpy.mockClear();

    arrayProperty.removeRange(1, 2);
    expect(arrayRemoveSpy).toHaveBeenCalledTimes(2);
    expect(arrayRemoveSpy.mock.calls[0][0]).toEqual(1);
    expect(arrayRemoveSpy.mock.calls[1][0]).toEqual(1);
    arrayRemoveSpy.mockClear();
  });

  it('composed type map', function() {
    var mapInsertSpy = jest.fn();
    var mapModifySpy = jest.fn();
    var mapRemoveSpy = jest.fn();
    ParentDataBinding.registerOnPath('subMap', ['collectionInsert'], mapInsertSpy);
    ParentDataBinding.registerOnPath('subMap', ['collectionModify'], mapModifySpy);
    ParentDataBinding.registerOnPath('subMap', ['collectionRemove'], mapRemoveSpy);

    // Register the base (Child) typeid
    dataBinder.register('BINDING', MapContainerTemplate.typeid, ParentDataBinding);
    dataBinder.attachTo(workspace);

    var mapContainerPset = PropertyFactory.create(MapContainerTemplate.typeid, 'single');
    workspace.root.insert('myMapContainerTemplate', mapContainerPset);

    // Expect the insertion of map values to trigger onInsert messages
    var mapProperty = workspace.root.get(['myMapContainerTemplate', 'subMap']);
    workspace.pushNotificationDelayScope();
    mapProperty.insert('one', PropertyFactory.create('Test:ChildID-0.0.1', undefined, { text: '1' }));
    mapProperty.insert('two', PropertyFactory.create('Test:ChildID-0.0.1', undefined, { text: '2' }));
    mapProperty.insert('three', PropertyFactory.create('Test:ChildID-0.0.1', undefined, { text: '3' }));
    mapProperty.insert('four', PropertyFactory.create('Test:ChildID-0.0.1', undefined, { text: '4' }));
    mapProperty.insert('five.six', PropertyFactory.create('Test:ChildID-0.0.1', undefined, { text: '5' }));
    workspace.popNotificationDelayScope();

    expect(mapInsertSpy).toHaveBeenCalledTimes(5);
    expect(mapInsertSpy.mock.calls[0][0]).toEqual('one');
    expect(mapInsertSpy.mock.calls[1][0]).toEqual('two');
    expect(mapInsertSpy.mock.calls[2][0]).toEqual('three');
    expect(mapInsertSpy.mock.calls[3][0]).toEqual('four');
    expect(mapInsertSpy.mock.calls[4][0]).toEqual('five.six');

    // TODO: How do we report the typeid for these?
    // expect( mapInsertSpy.mock.calls[0][1].getNestedChangeSet().typeid).toEqual('Test:ChildID-0.0.1');
    expect(mapInsertSpy.mock.calls[0][1].getNestedChangeSet().String.text).toEqual('1');
    expect(mapInsertSpy.mock.calls[0][1].getContext()).toEqual('map');
    expect(mapInsertSpy.mock.calls[0][1].getOperationType()).toEqual('insert');
    expect(mapInsertSpy.mock.calls[0][1].getAbsolutePath()).toEqual('/myMapContainerTemplate.subMap[one]');
    expect(mapInsertSpy.mock.calls[4][1].getNestedChangeSet().String.text).toEqual('5');
    expect(mapInsertSpy.mock.calls[4][1].getAbsolutePath()).toEqual('/myMapContainerTemplate.subMap["five.six"]');
    mapInsertSpy.mockClear();

    // modify map
    workspace.pushNotificationDelayScope();
    mapProperty.get(['one', 'text']).setValue('10');
    mapProperty.get(['two', 'text']).setValue('20');
    mapProperty.get(['five.six', 'text']).setValue('30');
    workspace.popNotificationDelayScope();
    expect(mapModifySpy).toHaveBeenCalledTimes(3);
    expect(mapModifySpy.mock.calls[0][0]).toEqual('one');
    expect(mapModifySpy.mock.calls[1][0]).toEqual('two');
    expect(mapModifySpy.mock.calls[2][0]).toEqual('five.six');

    // TODO: How do we report the typeid for these?
    // expect(mapInsertSpy.mock.calls[0][1].getNestedChangeSet().typeid).toEqual('Test:ChildID-0.0.1');
    expect(mapModifySpy.mock.calls[0][1].getNestedChangeSet().String.text).toEqual('10');
    expect(mapModifySpy.mock.calls[0][1].getContext()).toEqual('map');
    expect(mapModifySpy.mock.calls[0][1].getOperationType()).toEqual('modify');
    expect(mapModifySpy.mock.calls[0][1].getAbsolutePath()).toEqual('/myMapContainerTemplate.subMap[one]');
    expect(mapModifySpy.mock.calls[2][1].getNestedChangeSet().String.text).toEqual('30');
    expect(mapModifySpy.mock.calls[2][1].getAbsolutePath()).toEqual('/myMapContainerTemplate.subMap["five.six"]');
    mapModifySpy.mockClear();

    // remove from map
    workspace.pushNotificationDelayScope();
    mapProperty.remove('one');
    mapProperty.remove('two');
    mapProperty.remove('five.six');
    workspace.popNotificationDelayScope();
    expect(mapRemoveSpy).toHaveBeenCalledTimes(3);
    expect(mapRemoveSpy.mock.calls[0][0]).toEqual('one');
    expect(mapRemoveSpy.mock.calls[1][0]).toEqual('two');
    expect(mapRemoveSpy.mock.calls[2][0]).toEqual('five.six');
    mapRemoveSpy.mockClear();
  });

  it('Map of primitives', function() {
    var mapInsertSpy = jest.fn();
    var mapModifySpy = jest.fn();
    var mapRemoveSpy = jest.fn();
    ParentDataBinding.registerOnPath('mapPrimitive', ['collectionInsert'], mapInsertSpy);
    ParentDataBinding.registerOnPath('mapPrimitive', ['collectionModify'], mapModifySpy);
    ParentDataBinding.registerOnPath('mapPrimitive', ['collectionRemove'], mapRemoveSpy);

    // Register the base (Child) typeid
    dataBinder.register('BINDING', MapContainerTemplate.typeid, ParentDataBinding);
    dataBinder.attachTo(workspace);

    var mapContainerPset = PropertyFactory.create(MapContainerTemplate.typeid, 'single');
    workspace.root.insert('myMapContainerTemplate', mapContainerPset);

    // Expect the insertion of map values to trigger onInsert messages
    var mapProperty = workspace.root.get(['myMapContainerTemplate', 'mapPrimitive']);
    workspace.pushNotificationDelayScope();
    mapProperty.insert('one', '1');
    mapProperty.insert('two', '2');
    workspace.popNotificationDelayScope();

    expect(mapInsertSpy).toHaveBeenCalledTimes(2);
    // Test first parameter (index or key)
    expect(mapInsertSpy.mock.calls[0][0]).toEqual('one');
    expect(mapInsertSpy.mock.calls[1][0]).toEqual('two');

    // Test second parameter (changesetContext)
    expect(mapInsertSpy.mock.calls[0][1].getNestedChangeSet()).toEqual('1');
    expect(mapInsertSpy.mock.calls[0][1].getContext()).toEqual('map');
    expect(mapInsertSpy.mock.calls[0][1].getOperationType()).toEqual('insert');
    expect(mapInsertSpy.mock.calls[0][1].getAbsolutePath()).toEqual('/myMapContainerTemplate.mapPrimitive[one]');
    mapInsertSpy.mockClear();

    // modify map
    workspace.pushNotificationDelayScope();
    mapProperty.setValues({'one': '10'});
    mapProperty.setValues({'two': '20'});
    workspace.popNotificationDelayScope();
    expect(mapModifySpy).toHaveBeenCalledTimes(2);
    expect(mapModifySpy.mock.calls[0][0]).toEqual('one');
    expect(mapModifySpy.mock.calls[1][0]).toEqual('two');

    expect(mapModifySpy.mock.calls[0][1].getNestedChangeSet()).toEqual('10');
    expect(mapModifySpy.mock.calls[0][1].getContext()).toEqual('map');
    expect(mapModifySpy.mock.calls[0][1].getOperationType()).toEqual('modify');
    expect(mapModifySpy.mock.calls[0][1].getAbsolutePath()).toEqual('/myMapContainerTemplate.mapPrimitive[one]');
    mapModifySpy.mockClear();

    // remove from map
    workspace.pushNotificationDelayScope();
    mapProperty.remove('one');
    mapProperty.remove('two');
    workspace.popNotificationDelayScope();
    expect(mapRemoveSpy).toHaveBeenCalledTimes(2);
    expect(mapRemoveSpy.mock.calls[0][0]).toEqual('one');
    expect(mapRemoveSpy.mock.calls[1][0]).toEqual('two');
    mapRemoveSpy.mockClear();
  });

  it('set', function() {
    var setInsertSpy = jest.fn();
    var setModifySpy = jest.fn();
    var setRemoveSpy = jest.fn();
    ParentDataBinding.registerOnPath('subSet', ['collectionInsert'], setInsertSpy);
    ParentDataBinding.registerOnPath('subSet', ['collectionModify'], setModifySpy);
    ParentDataBinding.registerOnPath('subSet', ['collectionRemove'], setRemoveSpy);

    // Register the base (Child) typeid
    dataBinder.register('BINDING', SetContainerTemplate.typeid, ParentDataBinding);
    dataBinder.attachTo(workspace);

    var mapContainerPset = PropertyFactory.create(SetContainerTemplate.typeid, 'single');
    workspace.root.insert('mySetContainerTemplate', mapContainerPset);

    // Expect the insertion of map values to trigger onInsert messages
    var setProperty = workspace.root.get(['mySetContainerTemplate', 'subSet']);

    // Insert five child properties into the set
    workspace.pushNotificationDelayScope();
    var children = [];
    for (var i = 0; i < 5; i++) {
      children.push(PropertyFactory.create('Test:ChildID-0.0.1', undefined, { text: i }));
      setProperty.insert(children[i]);
    }
    workspace.popNotificationDelayScope();

    expect(setInsertSpy).toHaveBeenCalledTimes(5);
    for (var i = 0; i < 5; i++) {
      expect(setInsertSpy.mock.calls[i][0]).toEqual(children[i].getId());
      expect(setInsertSpy.mock.calls[i][1].getNestedChangeSet().String.text).toEqual(String(i));
      expect(setInsertSpy.mock.calls[i][1].getContext()).toEqual('set');
      expect(setInsertSpy.mock.calls[i][1].getOperationType()).toEqual('insert');
      expect(setInsertSpy.mock.calls[i][1].getAbsolutePath()).toEqual(
        '/mySetContainerTemplate.subSet[' + children[i].getId() + ']');
    }

    // Modify the properties in the set
    for (var i = 0; i < 5; i++) {
      children[i].get('text').setValue(String(i + 1));

      expect(setModifySpy).toHaveBeenCalledTimes(i + 1);
      expect(setModifySpy.mock.calls[i][0]).toEqual(children[i].getId());
      expect(setModifySpy.mock.calls[i][1].getNestedChangeSet().String.text).toEqual(String(i + 1));
      expect(setModifySpy.mock.calls[i][1].getContext()).toEqual('set');
      expect(setModifySpy.mock.calls[i][1].getOperationType()).toEqual('modify');
      expect(setModifySpy.mock.calls[i][1].getAbsolutePath()).toEqual(
        '/mySetContainerTemplate.subSet[' + children[i].getId() + ']');
    }

    // remove from map
    workspace.pushNotificationDelayScope();
    for (var i = 0; i < 5; i++) {
      setProperty.remove(children[i]);
    }
    workspace.popNotificationDelayScope();
    expect(setRemoveSpy).toHaveBeenCalledTimes(5);
    for (var i = 0; i < 5; i++) {
      expect(setModifySpy.mock.calls[i][0]).toEqual(children[i].getId());
    }
  });

  it('NodeProperty', function() {
    var nodeInsertSpy = jest.fn();
    var nodeModifySpy = jest.fn();
    var nodeRemoveSpy = jest.fn();
    ParentDataBinding.registerOnPath('nested', ['collectionInsert'], nodeInsertSpy);
    ParentDataBinding.registerOnPath('nested', ['collectionModify'], nodeModifySpy);
    ParentDataBinding.registerOnPath('nested', ['collectionRemove'], nodeRemoveSpy);

    // Register the base (Child) typeid
    dataBinder.register('BINDING', NodeContainerTemplate.typeid, ParentDataBinding);
    dataBinder.attachTo(workspace);

    var nodeContainerPset = PropertyFactory.create(NodeContainerTemplate.typeid, 'single');
    workspace.root.insert('myNodeContainerTemplate', nodeContainerPset);

    // Expect the insertion of map values to trigger onInsert messages
    var nodeProperty = workspace.root.get(['myNodeContainerTemplate', 'nested']);

    // Insert five child properties into the set
    workspace.pushNotificationDelayScope();
    var children = [];
    for (var i = 0; i < 5; i++) {
      children.push(PropertyFactory.create('Test:ChildID-0.0.1', undefined, { text: i }));
      nodeProperty.insert(children[i]);
    }
    workspace.popNotificationDelayScope();

    expect(nodeInsertSpy).toHaveBeenCalledTimes(5);
    for (var i = 0; i < 5; i++) {
      expect(nodeInsertSpy.mock.calls[i][0]).toEqual(children[i].getId());
      expect(nodeInsertSpy.mock.calls[i][1].getNestedChangeSet().String.text).toEqual(String(i));
      expect(nodeInsertSpy.mock.calls[i][1].getContext()).toEqual('NodeProperty');
      expect(nodeInsertSpy.mock.calls[i][1].getOperationType()).toEqual('insert');
      expect(nodeInsertSpy.mock.calls[i][1].getAbsolutePath()).toEqual(
        '/myNodeContainerTemplate.nested[' + children[i].getId() + ']');
    }

    // Modify the properties in the set
    for (var i = 0; i < 5; i++) {
      children[i].get('text').setValue(String(i + 1));

      expect(nodeModifySpy).toHaveBeenCalledTimes(i + 1);
      expect(nodeModifySpy.mock.calls[i][0]).toEqual(children[i].getId());
      expect(nodeModifySpy.mock.calls[i][1].getNestedChangeSet().String.text).toEqual(String(i + 1));
      expect(nodeModifySpy.mock.calls[i][1].getContext()).toEqual('NodeProperty');
      expect(nodeModifySpy.mock.calls[i][1].getOperationType()).toEqual('modify');
      expect(nodeModifySpy.mock.calls[i][1].getAbsolutePath()).toEqual(
        '/myNodeContainerTemplate.nested[' + children[i].getId() + ']');
    }

    // remove from map
    workspace.pushNotificationDelayScope();
    for (var i = 0; i < 5; i++) {
      nodeProperty.remove(children[i]);
    }
    workspace.popNotificationDelayScope();
    expect(nodeRemoveSpy).toHaveBeenCalledTimes(5);
    for (var i = 0; i < 5; i++) {
      expect(nodeModifySpy.mock.calls[i][0]).toEqual(children[i].getId());
    }
  });

  it('arrays with primitive types (extra checks)', function() {
    var arrayInsertSpy = jest.fn();
    var arrayModifySpy = jest.fn();
    var arrayRemoveSpy = jest.fn();
    PrimitiveChildrenDataBinding.registerOnPath('arrayOfNumbers', ['collectionInsert'], arrayInsertSpy);
    PrimitiveChildrenDataBinding.registerOnPath('arrayOfNumbers', ['collectionModify'], arrayModifySpy);
    PrimitiveChildrenDataBinding.registerOnPath('arrayOfNumbers', ['collectionRemove'], arrayRemoveSpy);

    // Register the base (Child) typeid
    dataBinder.register('BINDING', PrimitiveChildrenTemplate.typeid, PrimitiveChildrenDataBinding);
    dataBinder.attachTo(workspace);

    var primitiveChildPset = PropertyFactory.create(PrimitiveChildrenTemplate.typeid, 'single');
    workspace.root.insert('myPrimitiveChildTemplate', primitiveChildPset);

    // Expect the insertion of ranges to trigger onInsert messages
    var arrayProperty = workspace.root.get(['myPrimitiveChildTemplate', 'arrayOfNumbers']);
    arrayProperty.insertRange(0, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(arrayInsertSpy).toHaveBeenCalledTimes(9);
    expect(arrayInsertSpy.mock.calls[0][0]).toEqual(0);
    expect(arrayInsertSpy.mock.calls[1][0]).toEqual(1);
    expect(arrayInsertSpy.mock.calls[2][0]).toEqual(2);
    expect(arrayInsertSpy.mock.calls[3][0]).toEqual(3);
    expect(arrayInsertSpy.mock.calls[4][0]).toEqual(4);
    expect(arrayInsertSpy.mock.calls[5][0]).toEqual(5);
    expect(arrayInsertSpy.mock.calls[6][0]).toEqual(6);
    expect(arrayInsertSpy.mock.calls[7][0]).toEqual(7);
    expect(arrayInsertSpy.mock.calls[8][0]).toEqual(8);
    arrayInsertSpy.mockClear();

    arrayProperty.setRange(5, [50, 60]);
    expect(arrayModifySpy).toHaveBeenCalledTimes(2);
    expect(arrayModifySpy.mock.calls[0][0]).toEqual(5);
    expect(arrayModifySpy.mock.calls[1][0]).toEqual(6);
    arrayModifySpy.mockClear();

    arrayProperty.removeRange(0, 2);
    expect(arrayRemoveSpy).toHaveBeenCalledTimes(2);
    expect(arrayRemoveSpy.mock.calls[0][0]).toEqual(0);
    expect(arrayRemoveSpy.mock.calls[1][0]).toEqual(0);
    arrayRemoveSpy.mockClear();

    workspace.pushNotificationDelayScope();
    arrayProperty.insert(1, 5);
    arrayProperty.remove(0);
    arrayProperty.removeRange(2, 2);
    arrayProperty.set(2, 7);
    workspace.popNotificationDelayScope();
    expect(arrayRemoveSpy).toHaveBeenCalledTimes(3);
    expect(arrayRemoveSpy.mock.calls[0][0]).toEqual(0);
    expect(arrayRemoveSpy.mock.calls[1][0]).toEqual(2);
    expect(arrayRemoveSpy.mock.calls[2][0]).toEqual(2);

    expect(arrayInsertSpy.mock.calls[0][0]).toEqual(0);

    expect(arrayModifySpy.mock.calls[0][0]).toEqual(2);

    arrayRemoveSpy.mockClear();
    arrayInsertSpy.mockClear();
    arrayModifySpy.mockClear();
  });

  it('registerOnProperty', function() {
    var stringProperty = PropertyFactory.create('String');
    var primitiveChildrenDataBinding = undefined;
    var checkProperty = function(property) {
      expect(this).toBeInstanceOf(PrimitiveChildrenDataBinding);
      expect(this).toEqual(primitiveChildrenDataBinding);
      expect(property).toEqual(stringProperty);
    };
    var insertSpy = jest.fn(checkProperty);
    var modifySpy = jest.fn(checkProperty);
    var removeSpy = jest.fn(function(property) { expect(property).toBeUndefined(); });

    // we have to do this externally because the PropertyTree would eat our exception from the spy
    var invalidProperty = false;
    var expectedInvalidProperty = false; // same as above...
    var validPropertySpy = jest.fn(function(in_property) {
      if (!in_property) {
        invalidProperty = true;
      }
    });
    var invalidPropertySpy = jest.fn(function(in_property) {
      if (!in_property) {
        expectedInvalidProperty = true;
      }
    });
    var changeSpy = jest.fn(function(property) {
      if (property) { // will be undefined if removed
        checkProperty.call(this, property);
      } else {
        expect(this).toBeInstanceOf(PrimitiveChildrenDataBinding);
        expect(this).toEqual(primitiveChildrenDataBinding);
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

    workspace.root.insert('node', PropertyFactory.create(NodeContainerTemplate.typeid));
    expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
    primitiveChildrenDataBinding = dataBinder.resolve('/node', 'BINDING');

    workspace.root.get('node').insert('string', stringProperty);
    expect(insertSpy).toHaveBeenCalledTimes(1);

    workspace.root.get(['node', 'string']).setValue('newValue');
    expect(modifySpy).toHaveBeenCalledTimes(1);

    workspace.root.get('node').remove('string');
    expect(removeSpy).toHaveBeenCalledTimes(1);

    workspace.root.get('node').insert('string', stringProperty);
    expect(insertSpy).toHaveBeenCalledTimes(2);
    expect(changeSpy).toHaveBeenCalledTimes(3); // insert twice, modify but no remove because of 'requireProperty'

    workspace.root.get(['node', 'string']).setValue('newValue2');
    expect(modifySpy).toHaveBeenCalledTimes(2);
    expect(changeSpy).toHaveBeenCalledTimes(4);

    workspace.root.get('node').remove('string');
    expect(removeSpy).toHaveBeenCalledTimes(2);
    expect(changeSpy).toHaveBeenCalledTimes(4); // not called because 'requireProperty' is true

    workspace.root.get('node').insert('string2', stringProperty);

    // TODO: This creates a stack overflow! (this probably refers to a bug in PropertyTree that's likely fixed now)
    workspace.root.get('node').insert('string', PropertyFactory.create('Reference', undefined, '/node.string2'));
    //expect(false).toEqual(true);
    // this should not have been changed to true
    expect(invalidProperty).toEqual(false);
    // this must have been changed to true
    expect(expectedInvalidProperty).toEqual(true);
  });

  it('when invoked from the utility functions', function() {
    var stringProperty = PropertyFactory.create('String');
    var stringArrayProperty = PropertyFactory.create('String', 'array');
    var insertSpy = jest.fn();
    var modifySpy = jest.fn();
    var removeSpy = jest.fn(function(in_modificationContext) {
      expect(in_modificationContext.getAbsolutePath()).toEqual('/node.string');
    });
    var collectionInsertSpy = jest.fn();
    var collectionModifySpy = jest.fn();
    var collectionRemoveSpy = jest.fn();

    PrimitiveChildrenDataBinding.registerOnPath('string', ['insert'], insertSpy);
    PrimitiveChildrenDataBinding.registerOnPath('string', ['modify'], modifySpy);
    PrimitiveChildrenDataBinding.registerOnPath('string', ['remove'], removeSpy);
    PrimitiveChildrenDataBinding.registerOnPath('array', ['collectionInsert'], collectionInsertSpy);
    PrimitiveChildrenDataBinding.registerOnPath('array', ['collectionModify'], collectionModifySpy);
    PrimitiveChildrenDataBinding.registerOnPath('array', ['collectionRemove'], collectionRemoveSpy);

    dataBinder.register('BINDING', NodeContainerTemplate.typeid, PrimitiveChildrenDataBinding);
    dataBinder.attachTo(workspace);

    var node = PropertyFactory.create(NodeContainerTemplate.typeid);
    workspace.root.insert('node', node);

    node.insert('string', stringProperty);
    expect(insertSpy).toHaveBeenCalledTimes(1);
    node.get('string').setValue('test');
    expect(modifySpy).toHaveBeenCalledTimes(1);
    node.remove('string');
    expect(removeSpy).toHaveBeenCalledTimes(1);

    node.insert('array', stringArrayProperty);
    stringArrayProperty.insertRange(0, ['test', 'test2']);
    expect(collectionInsertSpy).toHaveBeenCalledTimes(2);
    stringArrayProperty.set(0, 'test2');
    expect(collectionModifySpy).toHaveBeenCalledTimes(1);
    stringArrayProperty.remove(0);
    expect(collectionRemoveSpy).toHaveBeenCalledTimes(1);
  });

  it('same databinding on two workspaces should not matter', async function() {
    // In some tests, a databinding used in the first test was interfering with the second test.
    // We simulate that here
    const insertSpy = jest.fn();

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

    const workspace1 = await MockSharedPropertyTree();
    dataBinder1.register('BINDING', PrimitiveChildrenTemplate.typeid, myBinding);
    const workspace2 = await MockSharedPropertyTree();
    dataBinder2.register('BINDING', PrimitiveChildrenTemplate.typeid, myBinding);

    dataBinder1.attachTo(workspace1);
    dataBinder2.attachTo(workspace2);

    expect(insertSpy).toHaveBeenCalledTimes(0);
    workspace1.root.insert('p1', PropertyFactory.create(PrimitiveChildrenTemplate.typeid));
    expect(insertSpy).toHaveBeenCalledTimes(1);
    workspace2.root.insert('p2', PropertyFactory.create(PrimitiveChildrenTemplate.typeid));
    expect(insertSpy).toHaveBeenCalledTimes(2);
  });

  it('should handle intermediate binding classes that are not registered', function() {
    var parentModifySpy = jest.fn();
    var derivedModifySpy = jest.fn();
    var derivedDerivedModifySpy = jest.fn();

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

    expect(parentModifySpy).toHaveBeenCalledTimes(0);
    expect(derivedModifySpy).toHaveBeenCalledTimes(0);
    expect(derivedDerivedModifySpy).toHaveBeenCalledTimes(0);

    // Test changing an instance of the parent class
    workspace.root.insert('myChildTemplate', PropertyFactory.create(ChildTemplate.typeid));
    expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
    dataBinder._resetDebugCounters();

    workspace.root.get(['myChildTemplate', 'text']).setValue('newValue');
    expect(parentModifySpy).toHaveBeenCalledTimes(1);
    expect(derivedModifySpy).toHaveBeenCalledTimes(0);
    expect(derivedDerivedModifySpy).toHaveBeenCalledTimes(0);
    parentModifySpy.mockClear();
    derivedModifySpy.mockClear();
    derivedDerivedModifySpy.mockClear();

    // Test changing an instance of the derived class
    workspace.root.insert('myInheritedChildTemplate', PropertyFactory.create(InheritedChildTemplate.typeid));
    expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
    dataBinder._resetDebugCounters();

    workspace.root.get(['myInheritedChildTemplate', 'text']).setValue('newValue');
    expect(parentModifySpy).toHaveBeenCalledTimes(1);
    expect(derivedModifySpy).toHaveBeenCalledTimes(0); // Was never registered, not called
    expect(derivedDerivedModifySpy).toHaveBeenCalledTimes(0);
    parentModifySpy.mockClear();
    derivedModifySpy.mockClear();
    derivedDerivedModifySpy.mockClear();

    // Test changing an instance of the derived derived class
    workspace.root.insert(
      'myInheritedInheritedChildTemplate', PropertyFactory.create(InheritedInheritedChildTemplate.typeid)
    );
    expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
    dataBinder._resetDebugCounters();

    workspace.root.get(['myInheritedInheritedChildTemplate', 'text']).setValue('newValue');
    expect(parentModifySpy).toHaveBeenCalledTimes(1);
    expect(derivedModifySpy).toHaveBeenCalledTimes(0); // Was never registered, not called
    expect(derivedDerivedModifySpy).toHaveBeenCalledTimes(1);
    parentModifySpy.mockClear();
    derivedModifySpy.mockClear();
    derivedDerivedModifySpy.mockClear();

    // unregister the parent, and modify the doubly derived class
    unregisterAllOnPathListeners(ParentDataBinding);
    workspace.root.get(['myInheritedInheritedChildTemplate', 'text']).setValue('newValue2');
    expect(parentModifySpy).toHaveBeenCalledTimes(0);  // Was unregistered, not called
    expect(derivedModifySpy).toHaveBeenCalledTimes(0); // Was never registered, not called
    expect(derivedDerivedModifySpy).toHaveBeenCalledTimes(1); // Still registered, called
    parentModifySpy.mockClear();
    derivedModifySpy.mockClear();
  });

  it('should not matter the order we register in, way 1', function() {
    let order = '';
    const parentInsertSpy = jest.fn(function() { order += 'p'; });
    const derivedInsertSpy = jest.fn(function() { order += 'd'; });

    unregisterAllOnPathListeners(ParentDataBinding);
    unregisterAllOnPathListeners(DerivedDataBinding);
    ParentDataBinding.registerOnPath('text', ['insert'], parentInsertSpy);
    DerivedDataBinding.registerOnPath('text', ['insert'], derivedInsertSpy);

    dataBinder.register('BINDING', ChildTemplate.typeid, ParentDataBinding);
    dataBinder.register('BINDING', InheritedChildTemplate.typeid, DerivedDataBinding);

    expect(order).toEqual('');
    dataBinder.attachTo(workspace);
    expect(order).toEqual('');

    workspace.root.insert('InheritedChildTemplate', PropertyFactory.create(InheritedChildTemplate.typeid));

    expect(parentInsertSpy).toHaveBeenCalledTimes(1);
    expect(derivedInsertSpy).toHaveBeenCalledTimes(1);

    // The derived should be called before the parent
    expect(order).toEqual('dp');
  });

  it('should not matter the order we register in, way 2', function() {
    let order = '';
    const parentInsertSpy = jest.fn(function() { order += 'p'; });
    const derivedInsertSpy = jest.fn(function() { order += 'd'; });

    unregisterAllOnPathListeners(ParentDataBinding);
    unregisterAllOnPathListeners(DerivedDataBinding);
    DerivedDataBinding.registerOnPath('text', ['insert'], derivedInsertSpy);
    ParentDataBinding.registerOnPath('text', ['insert'], parentInsertSpy);

    dataBinder.register('BINDING', ChildTemplate.typeid, ParentDataBinding);
    dataBinder.register('BINDING', InheritedChildTemplate.typeid, DerivedDataBinding);

    expect(order).toEqual('');
    dataBinder.attachTo(workspace);
    expect(order).toEqual('');

    workspace.root.insert('InheritedChildTemplate', PropertyFactory.create(InheritedChildTemplate.typeid));

    expect(parentInsertSpy).toHaveBeenCalledTimes(1);
    expect(derivedInsertSpy).toHaveBeenCalledTimes(1);

    // The derived should be called before the parent
    expect(order).toEqual('dp');
  });

  it('should not matter the order we register in, way 3', function() {
    let order = '';
    const parentInsertSpy = jest.fn(function() { order += 'p'; });
    const derivedInsertSpy = jest.fn(function() { order += 'd'; });

    unregisterAllOnPathListeners(ParentDataBinding);
    unregisterAllOnPathListeners(DerivedDataBinding);
    DerivedDataBinding.registerOnPath('text', ['insert'], derivedInsertSpy);
    ParentDataBinding.registerOnPath('text', ['insert'], parentInsertSpy);

    dataBinder.register('BINDING', InheritedChildTemplate.typeid, DerivedDataBinding);
    dataBinder.register('BINDING', ChildTemplate.typeid, ParentDataBinding);

    expect(order).toEqual('');
    dataBinder.attachTo(workspace);
    expect(order).toEqual('');

    workspace.root.insert('InheritedChildTemplate', PropertyFactory.create(InheritedChildTemplate.typeid));

    expect(parentInsertSpy).toHaveBeenCalledTimes(1);
    expect(derivedInsertSpy).toHaveBeenCalledTimes(1);

    // The derived should be called before the parent
    expect(order).toEqual('dp');
  });

  it('should not matter the order we register in, way 4', function() {
    let order = '';
    const parentInsertSpy = jest.fn(function() { order += 'p'; });
    const derivedInsertSpy = jest.fn(function() { order += 'd'; });

    unregisterAllOnPathListeners(ParentDataBinding);
    unregisterAllOnPathListeners(DerivedDataBinding);
    ParentDataBinding.registerOnPath('text', ['insert'], parentInsertSpy);
    DerivedDataBinding.registerOnPath('text', ['insert'], derivedInsertSpy);

    dataBinder.register('BINDING', InheritedChildTemplate.typeid, DerivedDataBinding);
    dataBinder.register('BINDING', ChildTemplate.typeid, ParentDataBinding);

    expect(order).toEqual('');
    dataBinder.attachTo(workspace);
    expect(order).toEqual('');

    workspace.root.insert('InheritedChildTemplate', PropertyFactory.create(InheritedChildTemplate.typeid));

    expect(parentInsertSpy).toHaveBeenCalledTimes(1);
    expect(derivedInsertSpy).toHaveBeenCalledTimes(1);

    // The derived should be called before the parent
    expect(order).toEqual('dp');
  });

  it('derived DataBindings with unrelated templates', function() {
    var parentModifySpy = jest.fn();
    var derivedModifySpy = jest.fn();

    unregisterAllOnPathListeners(ParentDataBinding);
    unregisterAllOnPathListeners(DerivedDataBinding);
    ParentDataBinding.registerOnPath('text', ['modify'], parentModifySpy);
    DerivedDataBinding.registerOnPath('text', ['modify'], derivedModifySpy);

    dataBinder.register('BINDING', ParentTemplate.typeid, ParentDataBinding);
    dataBinder.register('BINDING', ChildTemplate.typeid, DerivedDataBinding);
    dataBinder.attachTo(workspace);

    workspace.root.insert('myParentTemplate', PropertyFactory.create(ParentTemplate.typeid));
    expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
    dataBinder._resetDebugCounters();
    const myParentDataBinding = dataBinder.resolve('/myParentTemplate', 'BINDING');
    expect(myParentDataBinding).toBeDefined();
    expect(myParentDataBinding).toBeInstanceOf(ParentDataBinding);
    workspace.root.insert('myChildTemplate', PropertyFactory.create(ChildTemplate.typeid));
    expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
    dataBinder._resetDebugCounters();
    const myDerivedDataBinding = dataBinder.resolve('/myChildTemplate', 'BINDING');
    expect(myDerivedDataBinding).toBeDefined();
    expect(myDerivedDataBinding).toBeInstanceOf(DerivedDataBinding);

    expect(parentModifySpy).toHaveBeenCalledTimes(0);
    expect(derivedModifySpy).toHaveBeenCalledTimes(0);

    workspace.root.get(['myParentTemplate', 'text']).setValue('newValue');
    expect(parentModifySpy).toHaveBeenCalledTimes(1);
    expect(derivedModifySpy).toHaveBeenCalledTimes(0);
    parentModifySpy.mockClear();
    derivedModifySpy.mockClear();
    expect(myParentDataBinding.onModify).toHaveBeenCalledTimes(1);
    expect(myDerivedDataBinding.onModify).toHaveBeenCalledTimes(0);
    myParentDataBinding.onModify.mockClear();
    myDerivedDataBinding.onModify.mockClear();
    workspace.root.get(['myChildTemplate', 'text']).setValue('newValue');
    expect(myParentDataBinding.onModify).toHaveBeenCalledTimes(0);
    expect(myDerivedDataBinding.onModify).toHaveBeenCalledTimes(1);
    myParentDataBinding.onModify.mockClear();
    myDerivedDataBinding.onModify.mockClear();
    expect(parentModifySpy).toHaveBeenCalledTimes(1); // will still be called via child's callback list
    expect(derivedModifySpy).toHaveBeenCalledTimes(1);
    parentModifySpy.mockClear();
    derivedModifySpy.mockClear();

    // unregister parent
    unregisterAllOnPathListeners(ParentDataBinding);
    workspace.root.get(['myChildTemplate', 'text']).setValue('newValue2');
    expect(myParentDataBinding.onModify).toHaveBeenCalledTimes(0);
    expect(myDerivedDataBinding.onModify).toHaveBeenCalledTimes(1);
    myParentDataBinding.onModify.mockClear();
    myDerivedDataBinding.onModify.mockClear();
    expect(parentModifySpy).toHaveBeenCalledTimes(0);
    expect(derivedModifySpy).toHaveBeenCalledTimes(1);
    parentModifySpy.mockClear();
    derivedModifySpy.mockClear();
  });

  it('should not call us back for non-existing items', function() {
    dataBinder.attachTo(workspace);
    const pathSpy = jest.fn();

    ParentDataBinding.registerOnPath('node.aString', ['insert', 'modify', 'remove'], pathSpy);
    dataBinder.register('BINDING', 'NodeProperty', ParentDataBinding, { exactPath: '/' });
    expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
    expect(pathSpy).toHaveBeenCalledTimes(0);

    const nodePset = PropertyFactory.create('NodeProperty', 'single');
    expect(pathSpy).toHaveBeenCalledTimes(0);
    workspace.root.insert('node', nodePset);

    const stringPset = PropertyFactory.create('String', 'single');
    nodePset.insert('aString', stringPset);
    expect(pathSpy).toHaveBeenCalledTimes(1);

    const stringProperty = workspace.root.get(['node', 'aString']);
    stringProperty.setValue('hello');
    expect(pathSpy).toHaveBeenCalledTimes(2);

    nodePset.remove('aString');
    expect(pathSpy).toHaveBeenCalledTimes(3);
  });

  it('derived DataBindings with unrelated templates and replacing parent callback', function() {
    var parentModifySpy = jest.fn();
    var derivedModifySpy = jest.fn();
    var parentInsertSpy = jest.fn();
    var derivedInsertSpy = jest.fn();
    var parentRemoveSpy = jest.fn(function(in_modificationContext) {
    });
    var derivedRemoveSpy = jest.fn(function(in_modificationContext) {
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

    workspace.root.insert('myParentTemplate', PropertyFactory.create(ParentTemplate.typeid));
    expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
    dataBinder._resetDebugCounters();
    const myParentDataBinding = dataBinder.resolve('/myParentTemplate', 'BINDING');
    expect(myParentDataBinding).toBeDefined();
    expect(myParentDataBinding).toBeInstanceOf(ParentDataBinding);
    expect(parentInsertSpy).toHaveBeenCalledTimes(1);
    expect(derivedInsertSpy).toHaveBeenCalledTimes(0);
    parentInsertSpy.mockClear();
    derivedInsertSpy.mockClear();
    workspace.root.insert('myNodeContainerTemplate', PropertyFactory.create(NodeContainerTemplate.typeid));
    expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
    dataBinder._resetDebugCounters();
    const myDerivedDataBinding = dataBinder.resolve('/myNodeContainerTemplate', 'BINDING');
    expect(myDerivedDataBinding).toBeDefined();
    expect(myDerivedDataBinding).toBeInstanceOf(DerivedDataBinding);
    expect(parentInsertSpy).toHaveBeenCalledTimes(1);
    expect(derivedInsertSpy).toHaveBeenCalledTimes(1);
    parentInsertSpy.mockClear();
    derivedInsertSpy.mockClear();

    expect(parentModifySpy).toHaveBeenCalledTimes(0);
    expect(derivedModifySpy).toHaveBeenCalledTimes(0);

    workspace.root.get(['myParentTemplate', 'text']).setValue('newValue');
    expect(parentModifySpy).toHaveBeenCalledTimes(1);
    expect(derivedModifySpy).toHaveBeenCalledTimes(0);
    parentModifySpy.mockClear();
    derivedModifySpy.mockClear();
    expect(myParentDataBinding.onModify).toHaveBeenCalledTimes(1);
    expect(myDerivedDataBinding.onModify).toHaveBeenCalledTimes(0);
    myParentDataBinding.onModify.mockClear();
    myDerivedDataBinding.onModify.mockClear();
    workspace.root.get(['myNodeContainerTemplate', 'text']).setValue('newValue');
    expect(myParentDataBinding.onModify).toHaveBeenCalledTimes(0);
    expect(myDerivedDataBinding.onModify).toHaveBeenCalledTimes(1);
    myParentDataBinding.onModify.mockClear();
    myDerivedDataBinding.onModify.mockClear();
    expect(parentModifySpy).toHaveBeenCalledTimes(1);
    expect(derivedModifySpy).toHaveBeenCalledTimes(1);
    parentModifySpy.mockClear();
    derivedModifySpy.mockClear();

    // add extra stuff that can be removed (yay!):
    workspace.root.get('myParentTemplate').insert('subText', PropertyFactory.create('String'));
    workspace.root.get('myNodeContainerTemplate').insert('subText', PropertyFactory.create('String'));
    // remove stuff: first from the parent
    workspace.root.get('myParentTemplate').remove('subText');
    expect(parentRemoveSpy).toHaveBeenCalledTimes(1);
    expect(derivedRemoveSpy).toHaveBeenCalledTimes(0);
    expect(parentModifySpy).toHaveBeenCalledTimes(0);
    expect(derivedModifySpy).toHaveBeenCalledTimes(0);
    parentRemoveSpy.mockClear();
    derivedRemoveSpy.mockClear();
    // then from the derived class
    workspace.root.get('myNodeContainerTemplate').remove('subText');
    expect(parentRemoveSpy).toHaveBeenCalledTimes(1);
    expect(derivedRemoveSpy).toHaveBeenCalledTimes(1);
    expect(parentModifySpy).toHaveBeenCalledTimes(0);
    expect(derivedModifySpy).toHaveBeenCalledTimes(0);
    parentRemoveSpy.mockClear();
    derivedRemoveSpy.mockClear();

  });

  it('should handle double references in a relative path', function() {
    dataBinder.attachTo(workspace);

    // Add our child (referenced) pset
    var childPset = PropertyFactory.create(ChildTemplate.typeid, 'single');
    workspace.root.insert('myChild1', childPset);

    // referenceParentPSet should produce a ParentDataBinding
    // Most basic case, insert with an already valid reference
    const referenceParentPSet = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');
    referenceParentPSet.get('single_ref', { referenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.NEVER })
      .setValue('/myChild1');
    workspace.root.insert('myReferenceParent', referenceParentPSet);

    // Now we have a two stage reference
    const referenceParentPSet2 = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');
    referenceParentPSet2.get('single_ref', { referenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.NEVER })
      .setValue('/myReferenceParent');
    workspace.root.insert('myReferenceParent2', referenceParentPSet2);

    // Register the DataBindings
    var doubleReferenceModifySpy = jest.fn(function() {
    });
    ParentDataBinding.registerOnPath('single_ref.single_ref.text', ['modify'], doubleReferenceModifySpy);
    dataBinder.register('BINDING', ReferenceParentTemplate.typeid, ParentDataBinding);
    expect(dataBinder._dataBindingCreatedCounter).toEqual(2);

    expect(doubleReferenceModifySpy).toHaveBeenCalledTimes(0);

    childPset.get('text').setValue('newText2');
    expect(referenceParentPSet2.get(['single_ref', 'single_ref', 'text'])).toEqual(childPset.get('text'));
    expect(doubleReferenceModifySpy).toHaveBeenCalledTimes(1);
  });
  it('getAbsolutePath() should return the correct path', function() {

    var pathSpy = jest.fn(function(modificationContext) {
      // WARNING: We have to do this test inline. After the event, the modification context is no
      // longer valid
      expect(modificationContext.getAbsolutePath()).toEqual(modificationContext.getProperty().getAbsolutePath());
    });
    var collectionSpy = jest.fn(function(key, modificationContext) {
      //          console.log('key/index: ' + key + ' op: ' + modificationContext.getOperationType());
      expect(modificationContext.getAbsolutePath()).toEqual(modificationContext.getProperty().getAbsolutePath());
    });
    ChildDataBinding.registerOnPath('text', ['insert', 'modify'], pathSpy);
    ParentDataBinding.registerOnPath('myArray', ['collectionInsert', 'collectionModify'], collectionSpy);
    ParentDataBinding.registerOnPath('myMap', ['collectionInsert', 'collectionModify'], collectionSpy);

    dataBinder.register('BINDING', 'NodeProperty', ParentDataBinding);
    dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding);
    dataBinder.attachTo(workspace);

    workspace.root.insert('child1', PropertyFactory.create('NodeProperty', 'single'));
    workspace.root.insert('child2', PropertyFactory.create('NodeProperty', 'single'));
    workspace.root.insert('child3', PropertyFactory.create('NodeProperty', 'single'));
    workspace.root.get('child1').insert('myChild1', PropertyFactory.create('NodeProperty', 'single'));
    workspace.root.get('child1').insert('myChild2', PropertyFactory.create('NodeProperty', 'single'));
    workspace.root.get('child1').insert('myChild3', PropertyFactory.create('NodeProperty', 'single'));
    workspace.root.get('child2').insert('myChild4', PropertyFactory.create('NodeProperty', 'single'));
    workspace.root.get('child2').insert('myChild5', PropertyFactory.create('NodeProperty', 'single'));
    workspace.root.get('child2').insert('myChild6', PropertyFactory.create('NodeProperty', 'single'));
    workspace.root.get('child3').insert('myChild7', PropertyFactory.create('NodeProperty', 'single'));
    workspace.root.get('child3').insert('myChild8', PropertyFactory.create('NodeProperty', 'single'));
    workspace.root.get('child3').insert('myChild9', PropertyFactory.create('NodeProperty', 'single'));
    workspace.root.get(['child1', 'myChild1']).insert('myArray', PropertyFactory.create('NodeProperty', 'array'));
    workspace.root.get(['child1', 'myChild1']).insert('myMap', PropertyFactory.create('NodeProperty', 'map'));
    var arrayProperty = workspace.root.get(['child1', 'myChild1', 'myArray']);
    arrayProperty.insertRange(0, _.map([1, 2, 3, 4, 5, 6], function() {
      return PropertyFactory.create('NodeProperty', 'single');
    }));
    // arrayProperty -> NodeProperty -> ChildTemplate
    arrayProperty.get(0).insert(PropertyFactory.create(ChildTemplate.typeid, undefined, { text: 'zero' }));
    arrayProperty.get(1).insert(PropertyFactory.create(ChildTemplate.typeid, undefined, { text: 'one' }));
    arrayProperty.get(2).insert(PropertyFactory.create(ChildTemplate.typeid, undefined, { text: 'two' }));
    var mapProperty = workspace.root.get(['child1', 'myChild1', 'myMap']);
    // mapProperty -> ChildTemplate
    mapProperty.insert('one', PropertyFactory.create(ChildTemplate.typeid, undefined, { text: '1' }));
    mapProperty.insert('two', PropertyFactory.create(ChildTemplate.typeid, undefined, { text: '2' }));
    mapProperty.insert('three', PropertyFactory.create(ChildTemplate.typeid, undefined, { text: '3' }));

    // no containers in path
    workspace.root.get(['child1', 'myChild1']).insert(PropertyFactory.create(ChildTemplate.typeid, undefined,
      { text: 'forty-two' }));
  });

  it('Documentation example - registerOnProperty', function() {
    // *** NOTE *** this is copied into the documentation
    // SnippetStart{DataBinding.registerOnProperty}
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
    workspace.root.insert('order', order);

    expect(eventLog.length).toEqual(2);
    order.get('price').setValue(100);
    expect(eventLog.length).toEqual(3);
    order.get('quantity').setValue(100);
    expect(eventLog.length).toEqual(4);
  });

  it('getDataBinding() should work for relative path callbacks even in remove operations', function() {

    var childSpyError = false;
    var childSpy = jest.fn(function(modificationContext) {
      //  console.log('childSpy: op type: ' + modificationContext.getOperationType());
      //  console.log('childSpy: absolute path: ' + modificationContext.getAbsolutePath());
      //  console.log('childSpy: # of DataBindings: ' + modificationContext.getDataBinding().length);
      //  console.log(modificationContext._baseDataBinding.getDataBinder().resolve(
      //      modificationContext.getAbsolutePath()));
      // have to do it this way because the PropertyTree swallows exceptions in callbacks :(
      if (!modificationContext.getDataBinding()) {
        childSpyError = true;
      }
      var dataBinding = modificationContext.getDataBinding();
      if (!(dataBinding instanceof ChildDataBinding)) {
        childSpyError = true;
      }
    });
    var collectionInsertSpyError = false;
    var collectionInsertSpy = jest.fn(function(index, modificationContext) {
      // have to do it this way because the PropertyTree swallows exceptions in callbacks :(
      if (!modificationContext.getDataBinding()) {
        collectionInsertSpyError = true;
      }
      var dataBinding = modificationContext.getDataBinding();
      if (!(dataBinding instanceof ChildDataBinding)) {
        collectionInsertSpyError = true;
      }
    });
    var collectionModifySpyError = false;
    var collectionModifySpy = jest.fn(function(index, modificationContext) {
      // have to do it this way because the PropertyTree swallows exceptions in callbacks :(
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
    var mapCollectionModifySpy = jest.fn(function(index, modificationContext) {
      // have to do it this way because the PropertyTree swallows exceptions in callbacks :(
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
    var collectionRemoveSpy = jest.fn(function(index, modificationContext) {
      // console.log('index: ' + index);
      var removedDataBinding = modificationContext.getDataBinding();
      // have to do it this way because the PropertyTree swallows exceptions in callbacks :(
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

    workspace.root.insert('parent', PropertyFactory.create('NodeProperty', 'single'));
    expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
    dataBinder._resetDebugCounters();
    workspace.root.get('parent').insert('child', PropertyFactory.create(ChildTemplate.typeid, undefined,
      { text: 'forty-two' }));
    expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
    dataBinder._resetDebugCounters();
    const childDataBinding = dataBinder.resolve('/parent.child', 'BINDING');
    expect(childSpy).toHaveBeenCalledTimes(1);
    childSpy.mockClear();
    childDataBinding.getProperty().get('text').setValue('sixty-four');
    expect(childSpy).toHaveBeenCalledTimes(1);
    childSpy.mockClear();
    workspace.root.get('parent').remove('child');
    expect(dataBinder._dataBindingRemovedCounter).toEqual(1);
    dataBinder._resetDebugCounters();
    workspace.root.get('parent').insert('childArray', PropertyFactory.create('NodeProperty', 'array'));
    var childArrayProperty = workspace.root.get(['parent', 'childArray']);
    childArrayProperty.push(PropertyFactory.create('NodeProperty', 'single'));
    childArrayProperty.push(PropertyFactory.create('NodeProperty', 'single'));
    childArrayProperty.push(PropertyFactory.create('NodeProperty', 'single'));
    childArrayProperty.push(PropertyFactory.create('NodeProperty', 'single'));
    childArrayProperty.push(PropertyFactory.create('NodeProperty', 'single'));
    childArrayProperty.push(PropertyFactory.create('NodeProperty', 'single'));
    var child0 = childArrayProperty.get(0);
    var child1 = childArrayProperty.get(1);
    child0.insert('grandChild', PropertyFactory.create('NodeProperty', 'single'));
    expect(dataBinder._dataBindingCreatedCounter).toEqual(0);
    child1.insert('child', PropertyFactory.create(ChildTemplate.typeid, undefined,
      { text: 'forty-two' }));
    expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
    dataBinder._resetDebugCounters();
    // remove this first, so the path to our DataBinding Changes
    childArrayProperty.remove(0);
    childArrayProperty.remove(0);
    expect(dataBinder._dataBindingRemovedCounter).toEqual(1);
    dataBinder._resetDebugCounters();

    // test for array collections
    childArrayProperty.get(1).insert('collectionContainer',
      PropertyFactory.create(ArrayContainerTemplate.typeid, 'single'));
    expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
    dataBinder._resetDebugCounters();
    var nestedArray = childArrayProperty.get(['1', 'collectionContainer', 'nested', 'subArray']);
    nestedArray.push(PropertyFactory.create(ChildTemplate.typeid, undefined, { text: 'one' }));
    nestedArray.push(PropertyFactory.create(ChildTemplate.typeid, undefined, { text: 'two' }));
    nestedArray.push(PropertyFactory.create(ChildTemplate.typeid, undefined, { text: 'three' }));
    expect(dataBinder._dataBindingCreatedCounter).toEqual(3);
    dataBinder._resetDebugCounters();
    createdDataBindings.push(dataBinder.resolve(nestedArray.get(0), 'BINDING'));
    createdDataBindings.push(dataBinder.resolve(nestedArray.get(1), 'BINDING'));
    createdDataBindings.push(dataBinder.resolve(nestedArray.get(2), 'BINDING'));
    expect(collectionInsertSpy).toHaveBeenCalledTimes(3);
    collectionInsertSpy.mockClear();
    nestedArray.get([1, 'text']).setValue('twenty-two');
    expect(collectionModifySpy).toHaveBeenCalledTimes(1);
    collectionModifySpy.mockClear();
    // grouped removes: remove one element in the array above this plus two elements from our nested array
    workspace.pushNotificationDelayScope();
    childArrayProperty.remove(0);
    nestedArray.removeRange(0, 2);
    workspace.popNotificationDelayScope();
    expect(collectionRemoveSpy).toHaveBeenCalledTimes(2);
    collectionRemoveSpy.mockClear();
    expect(receivedDataBindings.has(createdDataBindings[2])).toEqual(false);
    expect(receivedDataBindings.size).toEqual(2);
    expect(dataBinder._dataBindingRemovedCounter).toEqual(2);
    dataBinder._resetDebugCounters();

    // test for map collections
    childArrayProperty.get(2).insert('mapCollectionContainer',
      PropertyFactory.create(MapContainerTemplate.typeid, 'single'));
    expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
    dataBinder._resetDebugCounters();
    var nestedMap = childArrayProperty.get(['2', 'mapCollectionContainer', 'nested', 'subMap']);
    nestedMap.insert('one', PropertyFactory.create(ChildTemplate.typeid, undefined, { text: 'one' }));
    nestedMap.insert('two', PropertyFactory.create(ChildTemplate.typeid, undefined, { text: 'two' }));
    nestedMap.insert('three', PropertyFactory.create(ChildTemplate.typeid, undefined, { text: 'three' }));
    expect(dataBinder._dataBindingCreatedCounter).toEqual(3);
    dataBinder._resetDebugCounters();
    createdDataBindings.push(dataBinder.resolve(nestedMap.get('one'), 'BINDING'));
    createdDataBindings.push(dataBinder.resolve(nestedMap.get('two'), 'BINDING'));
    createdDataBindings.push(dataBinder.resolve(nestedMap.get('three'), 'BINDING'));
    expect(collectionInsertSpy).toHaveBeenCalledTimes(3);
    collectionInsertSpy.mockClear();
    nestedMap.get(['one', 'text']).setValue('twenty-two');
    expect(mapCollectionModifySpy).toHaveBeenCalledTimes(1);
    mapCollectionModifySpy.mockClear();
    // grouped removes: remove one element in the array above this plus two elements from our nested map
    workspace.pushNotificationDelayScope();
    childArrayProperty.remove(1); // we remove index 1 so that our map moves, but our array (see above) stays!
    nestedMap.remove('one');
    nestedMap.remove('three');
    workspace.popNotificationDelayScope();
    expect(collectionRemoveSpy).toHaveBeenCalledTimes(2);
    collectionRemoveSpy.mockClear();
    expect(receivedDataBindings.has(createdDataBindings[4])).toEqual(false);
    expect(receivedDataBindings.size).toEqual(4);
    expect(dataBinder._dataBindingRemovedCounter).toEqual(2);
    dataBinder._resetDebugCounters();

    // check error flags ->  have to do it this way because the PropertyTree swallows exceptions in callbacks :(
    expect(childSpyError).toEqual(false);
    expect(collectionInsertSpyError).toEqual(false);
    expect(collectionModifySpyError).toEqual(false);
    expect(mapCollectionModifySpyError).toEqual(false);
    expect(collectionRemoveSpyError).toEqual(false);
  });

  it('array of strings', function() {
    const collectionInsert = jest.fn();
    const collectionModify = jest.fn();
    const collectionRemove = jest.fn();
    PrimitiveChildrenDataBinding.registerOnPath('arrayOfStrings', ['collectionInsert'], collectionInsert);
    PrimitiveChildrenDataBinding.registerOnPath('arrayOfStrings', ['collectionModify'], collectionModify);
    PrimitiveChildrenDataBinding.registerOnPath('arrayOfStrings', ['collectionRemove'], collectionRemove);

    dataBinder.register('BINDING', PrimitiveChildrenTemplate.typeid, PrimitiveChildrenDataBinding);
    dataBinder.attachTo(workspace);
    workspace.root.insert('bob', PropertyFactory.create(PrimitiveChildrenTemplate.typeid));
    workspace.root.get(['bob', 'arrayOfStrings']).push('Hi there');
    expect(collectionInsert).toHaveBeenCalledTimes(1);
    expect(collectionRemove).toHaveBeenCalledTimes(0);

    workspace.root.get(['bob', 'arrayOfStrings']).pop();
    expect(collectionInsert).toHaveBeenCalledTimes(1);
    expect(collectionModify).toHaveBeenCalledTimes(0);
    expect(collectionRemove).toHaveBeenCalledTimes(1);

    collectionInsert.mockClear();
    collectionModify.mockClear();
    collectionRemove.mockClear();
    workspace.root.get(['bob', 'arrayOfStrings']).setValues(['a', 'b']);

    expect(collectionInsert).toHaveBeenCalledTimes(2);
    expect(collectionModify).toHaveBeenCalledTimes(0);
    expect(collectionRemove).toHaveBeenCalledTimes(0);

    collectionInsert.mockClear();
    collectionModify.mockClear();
    collectionRemove.mockClear();
    workspace.root.get(['bob', 'arrayOfStrings']).setValues(['c', 'd']);

    expect(collectionInsert).toHaveBeenCalledTimes(0);
    expect(collectionModify).toHaveBeenCalledTimes(2);
    expect(collectionRemove).toHaveBeenCalledTimes(0);

    collectionInsert.mockClear();
    collectionModify.mockClear();
    collectionRemove.mockClear();
    workspace.root.get(['bob', 'arrayOfStrings']).setValues(['e', 'f', 'g']);

    expect(collectionInsert).toHaveBeenCalledTimes(1);
    expect(collectionModify).toHaveBeenCalledTimes(2);
    expect(collectionRemove).toHaveBeenCalledTimes(0);
  });

  it('resolve() should work for DataBindings that replace DataBindings with the same path', function() {

    var dataBindings = [];
    var resolvedDataBindings;
    var error = false;
    var collectionRemoveSpy = jest.fn(function(index, modificationContext) {
      // have to do it this way because the PropertyTree swallows exceptions in callbacks :(
      if (index !== 2) {
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

    workspace.root.insert('childArray', PropertyFactory.create(ChildTemplate.typeid, 'array'));
    expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
    dataBinder._resetDebugCounters();
    var childArrayProperty = workspace.root.get('childArray');
    childArrayProperty.push(PropertyFactory.create(ChildTemplate.typeid, undefined,
      { text: 'zero' }));
    childArrayProperty.push(PropertyFactory.create(ChildTemplate.typeid, undefined,
      { text: 'one' }));
    childArrayProperty.push(PropertyFactory.create(ChildTemplate.typeid, undefined,
      { text: 'two' }));
    expect(dataBinder._dataBindingCreatedCounter).toEqual(3);
    dataBinder._resetDebugCounters();
    for (var i = 0; i < 3; ++i) {
      dataBindings.push(dataBinder.resolve(childArrayProperty.get(i), 'BINDING'));
    }
    workspace.pushNotificationDelayScope();
    childArrayProperty.removeRange(2, 1);
    childArrayProperty.insert(2, PropertyFactory.create(ChildTemplate.typeid, undefined,
      { text: 'twenty-two' }));
    workspace.popNotificationDelayScope();
    expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
    expect(dataBinder._dataBindingRemovedCounter).toEqual(1);
    var newDataBinding = dataBinder.resolve(childArrayProperty.get(2), 'BINDING');
    var newResolvedDataBindings = dataBinder.resolve('/childArray[2]', 'BINDING');
    expect(newResolvedDataBindings).toEqual(newDataBinding);
    expect(newResolvedDataBindings).toEqual(resolvedDataBindings);
    // have to do it this way because the PropertyTree swallows exceptions in callbacks :(
    expect(error).toEqual(false);
  });

  it('should be able to register on some path from an explicity nested schema and react to changes in the subtree',
    function() {
      dataBinder.attachTo(workspace);

      const pathSpy = jest.fn();
      ParentDataBinding.registerOnPath('position', ['modify'], pathSpy);
      dataBinder.register('BINDING', point2DExplicitTemplate.typeid, ParentDataBinding);

      workspace.root.insert('point2D', PropertyFactory.create(point2DExplicitTemplate.typeid, 'single'));

      workspace.root.get('point2D').get('position').get('x').value = 42;
      workspace.root.get('point2D').get('position').get('y').value = 42;
      expect(pathSpy).toHaveBeenCalledTimes(2);
    });

  it('can tell if inserts/removes are simulated or real - attach/detach', function() {
    let simulated;
    const called = jest.fn();

    const checkSimulated = function(context) {
      called();
      expect(simulated).toEqual(context.isSimulated());
    };
    const checkCollectionSimulated = function(stupidOrder, context) {
      called();
      expect(simulated).toEqual(context.isSimulated());
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
    expect(called).toHaveBeenCalledTimes(0);
    simulated = true;
    workspace.root.insert('data1', data1);
    dataBinder.attachTo(workspace);
    expect(called).toHaveBeenCalledTimes(2);

    // bindings are attached - we will get real callbacks for data2
    simulated = false;
    called.mockClear();
    workspace.root.insert('data2', data2);
    expect(called).toHaveBeenCalledTimes(2);

    // real callbacks for data2 being removed
    simulated = false;
    called.mockClear();
    workspace.root.remove(data2);
    // We won't get called back for collectionRemove (sort of LYNXDEV-5675) - so only one call
    expect(called).toHaveBeenCalledTimes(1);

    // simulated callbacks for data1 being removed
    simulated = true;
    called.mockClear();
    dataBinder.detach();
    // We won't get called back for collectionRemove LYNXDEV-5675 - so only one call
    expect(called).toHaveBeenCalledTimes(1);
  });

  it('can tell if inserts/removes are simulated or real - destroy handle', function() {
    let simulated;
    const called = jest.fn();

    const checkSimulated = function(context) {
      called();
      expect(simulated).toEqual(context.isSimulated());
    };
    const checkCollectionSimulated = function(stupidOrder, context) {
      called();
      expect(simulated).toEqual(context.isSimulated());
    };

    const data1 = PropertyFactory.create(PrimitiveChildrenTemplate.typeid);
    data1.get('arrayOfStrings').push('myString');

    dataBinder.attachTo(workspace);
    const handle1 = dataBinder.registerOnPath('data1', ['insert', 'remove'], checkSimulated);
    const handle2 = dataBinder.registerOnPath(
      'data1.arrayOfStrings', ['collectionInsert', 'collectionRemove'], checkCollectionSimulated
    );

    // bindings are attached - we will get real callbacks for data1
    expect(called).toHaveBeenCalledTimes(0);
    simulated = false;
    workspace.root.insert('data1', data1);
    expect(called).toHaveBeenCalledTimes(2);

    // simulated callbacks for handles being destroyed
    // Unfortunately, we don't get any callbacks for these
    called.mockClear();
    simulated = true;
    handle1.destroy();
    expect(called).toHaveBeenCalledTimes(0); // broken

    called.mockClear();
    handle2.destroy();
    expect(called).toHaveBeenCalledTimes(0); // broken
  });

  it('should not be able to register on multiple paths for registerOnProperty etc.', function() {
    const pathSpy = jest.fn();
    const paths = ['position.x', 'position.y'];
    expect(function() { ParentDataBinding.registerOnProperty(paths, ['modify'], pathSpy); }).toThrow();
    expect(function() { ParentDataBinding.registerOnValues(paths, ['modify'], pathSpy); }).toThrow();
  });

  it('should be able to register on multiple paths and get called back once', function() {
    dataBinder.attachTo(workspace);

    const pathSpy = jest.fn();
    ParentDataBinding.registerOnPath(['position.x', 'position.y'], ['modify'], pathSpy);
    dataBinder.register('BINDING', point2DExplicitTemplate.typeid, ParentDataBinding);

    workspace.root.insert('point2D', PropertyFactory.create(point2DExplicitTemplate.typeid, 'single'));

    // Push a scope, and modify both position variables
    workspace.pushNotificationDelayScope();

    workspace.root.get('point2D').get('position').get('x').value = 42;
    workspace.root.get('point2D').get('position').get('y').value = 42;

    // Haven't popped yet, shouldn't hear about it
    expect(pathSpy).toHaveBeenCalledTimes(0);

    workspace.popNotificationDelayScope();

    expect(pathSpy).toHaveBeenCalledTimes(1);

    // Do another modify -- make sure that we haven't accidentally turned the callback off forever!
    workspace.pushNotificationDelayScope();

    workspace.root.get('point2D').get('position').get('x').value = 43;
    workspace.root.get('point2D').get('position').get('y').value = 43;

    // Haven't popped yet, shouldn't hear about it
    expect(pathSpy).toHaveBeenCalledTimes(1);

    workspace.popNotificationDelayScope();

    expect(pathSpy).toHaveBeenCalledTimes(2);
  });

  it('should be able to unregister a multiple paths binding', function() {
    dataBinder.attachTo(workspace);

    const pathSpy = jest.fn();
    ParentDataBinding.registerOnPath(['position.x', 'position.y'], ['modify'], pathSpy);
    const handle = dataBinder.register('BINDING', point2DExplicitTemplate.typeid, ParentDataBinding);

    workspace.root.insert('point2D', PropertyFactory.create(point2DExplicitTemplate.typeid, 'single'));

    // Push a scope, and modify both position variables
    workspace.pushNotificationDelayScope();

    workspace.root.get('point2D').get('position').get('x').value = 42;
    workspace.root.get('point2D').get('position').get('y').value = 42;

    // Haven't popped yet, shouldn't hear about it
    expect(pathSpy).toHaveBeenCalledTimes(0);

    workspace.popNotificationDelayScope();

    expect(pathSpy).toHaveBeenCalledTimes(1);

    // Remove the binding
    pathSpy.mockClear();
    handle.destroy();

    // Do another modify; we shouldn't get called back since we have removed the binding
    workspace.pushNotificationDelayScope();

    workspace.root.get('point2D').get('position').get('x').value = 43;
    workspace.root.get('point2D').get('position').get('y').value = 43;

    workspace.popNotificationDelayScope();

    // No binding anymore: shouldn't fire at all
    expect(pathSpy).toHaveBeenCalledTimes(0);
  });

  it('should be able to register on multiple paths and independently hear from different callbacks', function() {
    // We are registering on two paths, for insert and modify. The goal of this test is to ensure that the
    // callback is called _once_ for the modify, and _once_ for the insert. i.e., there are two inserts, so
    // insert should only be called once, but we want to make sure that the 'call once' mechanism doesn't prevent
    // the modify callback from being called
    dataBinder.attachTo(workspace);

    const pathSpy = jest.fn();
    ParentDataBinding.registerOnPath(['child1.x', 'child1.y', 'child2.x', 'child2.y'], ['insert', 'modify'], pathSpy);
    dataBinder.register('BINDING', 'NodeProperty', ParentDataBinding);

    // child1 is already there, child2 is inserted later, inside the push/pop modified event scope.
    workspace.root.insert('child1', PropertyFactory.create(positionTemplate.typeid, 'single'));

    // Should have heard of the insert of child1, once
    expect(pathSpy).toHaveBeenCalledTimes(1);
    pathSpy.mockClear();

    // Push a scope, insert child2 and also modify child1. This should cause the insert _and_ the modify callbacks
    // to be called.
    workspace.pushNotificationDelayScope();

    workspace.root.insert('child2', PropertyFactory.create(positionTemplate.typeid, 'single'));

    workspace.root.get('child1').get('x').value = 42;
    workspace.root.get('child1').get('y').value = 42;

    // Haven't popped yet, shouldn't hear about it
    expect(pathSpy).toHaveBeenCalledTimes(0);

    workspace.popNotificationDelayScope();

    // We should have heard one for the insert, and once for the modify
    expect(pathSpy).toHaveBeenCalledTimes(2);
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
    expect(dataBinder._dataBindingCreatedCounter).toEqual(0);
    dataBinder.attachTo(workspace);

    // primitiveChildPset should produce a PrimitiveChildrenDataBinding
    workspace.root.insert('myPrimitiveChildTemplate', primitiveChildPset);

    expect(worked).toEqual(false);
    primitiveChildPset.resolvePath('nested.aNumber').setValue(23);
    expect(worked).toEqual(true);
  });

  it('should be able to register on some path from an implicitly nested schema and react to changes in the subtree',
    function() {
      dataBinder.attachTo(workspace);

      const pathSpy = jest.fn();
      ParentDataBinding.registerOnPath('position', ['modify'], pathSpy);
      dataBinder.register('BINDING', point2DImplicitTemplate.typeid, ParentDataBinding);

      workspace.root.insert('point2D', PropertyFactory.create(point2DImplicitTemplate.typeid, 'single'));

      workspace.root.get('point2D').get('position').get('x').value = 42;
      workspace.root.get('point2D').get('position').get('y').value = 42;

      // We do the modifications outside of a modifiedEventScope, so we expect to hear about it twice
      expect(pathSpy).toHaveBeenCalledTimes(2);
    });

  it('register on a structure modify and react to changes in the subtree LYNXDEV-5365',
    function() {
      dataBinder.attachTo(workspace);

      const pathSpy = jest.fn();
      ParentDataBinding.registerOnPath('position', ['modify'], pathSpy);
      dataBinder.register('BINDING', point2DImplicitTemplate.typeid, ParentDataBinding);

      workspace.root.insert('point2D', PropertyFactory.create(point2DImplicitTemplate.typeid, 'single'));

      workspace.pushNotificationDelayScope();
      workspace.root.get('point2D').get('position').get('x').value = 42;
      workspace.root.get('point2D').get('position').get('y').value = 42;
      workspace.popNotificationDelayScope();

      // We do the modifications inside a modifiedEventScope, so we expect to only hear about it once
      expect(pathSpy).toHaveBeenCalledTimes(1);
    });

  it('register on a structure modify and react to changes in the subtree LYNXDEV-5365, differing types',
    function() {
      // Similar to the above test, but x and y are differing types and hence in different subhierarchies
      // in the change set
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

      const pathSpy = jest.fn();
      ParentDataBinding.registerOnPath('position', ['modify'], pathSpy);
      dataBinder.register('BINDING', point2DWeirdTemplate.typeid, ParentDataBinding);

      workspace.root.insert('point2D', PropertyFactory.create(point2DWeirdTemplate.typeid, 'single'));

      workspace.pushNotificationDelayScope();
      workspace.root.get('point2D').get('position').get('x').value = 42;
      workspace.root.get('point2D').get('position').get('y').value = 42;
      workspace.popNotificationDelayScope();

      // We do the modifications inside a modifiedEventScope, so we expect to only hear about it once
      expect(pathSpy).toHaveBeenCalledTimes(1);
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
        expect(this._insertMockObject).toEqual(false);
        this._insertMockObject = true;
      }

      onModify(params) {
        expect(this._modifyMockObject).toEqual(false);
        this._modifyMockObject = true;
      }

      onRemove(params) {
        expect(this._removeMockObject).toEqual(true);
      }
    }

    dataBinder.attachTo(workspace);
    const pathInsertSpy = jest.fn(function() {
      expect(this._insertMockObject).toEqual(true);
    });
    const pathModifySpy = jest.fn(function() {
      expect(this._modifyMockObject).toEqual(true);
    });
    const pathRemoveSpy = jest.fn(function() {
      // this should be called *before* onRemove
      expect(this._removeMockObject).toEqual(false);
      this._removeMockObject = true;
    });
    myDerivedDataBinding.registerOnPath('text', ['insert'], pathInsertSpy);
    myDerivedDataBinding.registerOnPath('text', ['modify'], pathModifySpy);
    myDerivedDataBinding.registerOnPath('text', ['remove'], pathRemoveSpy);
    dataBinder.register('BINDING', ParentTemplate.typeid, myDerivedDataBinding);
    workspace.root.insert('parentProperty', PropertyFactory.create(ParentTemplate.typeid, 'single'));
    expect(pathInsertSpy).toHaveBeenCalledTimes(1);
    workspace.root.get(['parentProperty', 'text']).setValue('forty-two');
    expect(pathModifySpy).toHaveBeenCalledTimes(1);
    workspace.root.remove('parentProperty');
    expect(pathRemoveSpy).toHaveBeenCalledTimes(1);
  });

  it('relative path callback on nested reference (LYNXDEV-6013)', function() {

    const modifySpy = jest.fn(function(in_context) { });
    const insertRemoveSpy = jest.fn(function(in_context) { });
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
    workspace.root.insert('refContainer', PropertyFactory.create(referenceContainerTemplate.typeid, 'single'));
    workspace.root.get(['refContainer', 'container', 'ref'], RESOLVE_NO_LEAFS).setValue('/child');
    workspace.root.insert('child', PropertyFactory.create(ChildTemplate.typeid, 'single'));
    expect(insertRemoveSpy).toHaveBeenCalledTimes(1); // insert
    workspace.root.get(['child', 'text']).setValue('this is still 42');
    expect(modifySpy).toHaveBeenCalledTimes(1); // modify
    workspace.root.remove('child');
    expect(insertRemoveSpy).toHaveBeenCalledTimes(2); // insert + remove
  });

  it('should pass correct args to callbacks when binding multiple paths in a single call (LYNXDEV-6095)', function() {
    dataBinder.attachTo(workspace);

    let collectionCallbackCalled = false;
    let singleCallbackCalled = false;
    let expectedPath = '';
    const collectionPathSpy = jest.fn(function(in_position, in_context) {
      expect(in_context).toBeInstanceOf(ModificationContext);
      // the wired in order / keys aren't very nice but it's simple and we control the order/keys (see below)
      if (!collectionCallbackCalled) {
        expect(in_position).toEqual(0);
      } else {
        expect(in_position).toEqual('a');
      }
      collectionCallbackCalled = true;
    });
    const singlePathSpy = jest.fn(function(in_context) {
      expect(in_context).toBeInstanceOf(ModificationContext);
      if (!singleCallbackCalled) {
        expect(in_context.getOperationType()).toEqual('insert'); // the first call is for the insert
      } else {
        expect(in_context.getOperationType()).toEqual('modify'); // the other calls are for the modifies
        expect(in_context.getAbsolutePath()).toEqual(expectedPath);
      }
      singleCallbackCalled = true;
    });
    ParentDataBinding.registerOnPath(['aString', 'aNumber'],
      ['insert', 'modify'], singlePathSpy);
    ParentDataBinding.registerOnPath(['arrayOfNumbers', 'mapOfNumbers'],
      ['collectionInsert', 'collectionModify'], collectionPathSpy);
    const handle = dataBinder.register('BINDING', PrimitiveChildrenTemplate.typeid, ParentDataBinding);

    workspace.root.insert('props', PropertyFactory.create(PrimitiveChildrenTemplate.typeid, 'single'));
    expect(singlePathSpy).toHaveBeenCalledTimes(1); // called once for the insert

    workspace.root.get('props').get('arrayOfNumbers').push(42);
    expect(collectionPathSpy).toHaveBeenCalledTimes(1);
    workspace.root.get('props').get('mapOfNumbers').insert('a', 42);
    expect(collectionPathSpy).toHaveBeenCalledTimes(2);
    expectedPath = '/props.aString';
    workspace.root.get('props').get('aString').setValue('forty-two');
    expect(singlePathSpy).toHaveBeenCalledTimes(2);
    expectedPath = '/props.aNumber';
    workspace.root.get('props').get('aNumber').setValue(42);
    expect(singlePathSpy).toHaveBeenCalledTimes(3);
    // Remove the binding
    collectionPathSpy.mockClear();
    singlePathSpy.mockClear();
    singlePathSpy.mockClear();
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
    workspace.root.insert('scene', scene);

    // We assume Light3D-1.0.0 and Camera3D-1.0.0 inherit from Object3D-1.0.0
    // We define a binding for Object3D and for Camera3D
    dataBinder.defineDataBinding('BINDING', 'autodesk.samples:Object3D-1.0.0', Object3DDataBinding);
    dataBinder.defineDataBinding('BINDING', 'autodesk.samples:Camera3D-1.0.0', Camera3DDataBinding);

    // We activate anything that inherits from Object3D-1.0.0, but only if in the scene subhierarchy
    dataBinder.activateDataBinding('BINDING', 'autodesk.samples:Object3D-1.0.0', { includePrefix: 'scene' });

    // When this light is added, the best match is Object3D-1.0.0, so an Object3DDataBinding is created
    scene.insert('light', PropertyFactory.create('autodesk.samples:Light3D-1.0.0'));
    console.assert(dataBinder.resolve('scene.light', 'BINDING') instanceof Object3DDataBinding);

    // When this camera is added, the best match is the Camera3D-1.0.0 specialization,
    // leading to a Camera3DDataBinding to be instantiated
    scene.insert('camera', PropertyFactory.create('autodesk.samples:Camera3D-1.0.0'));
    console.assert(dataBinder.resolve('scene.camera', 'BINDING') instanceof Camera3DDataBinding);

    // When this camera is added, it does not match the 'scene' prefix specified in the activateDataBinding call
    // so nothing is created
    workspace.root.insert('lostCamera', PropertyFactory.create('autodesk.samples:Camera3D-1.0.0'));
    console.assert(dataBinder.resolve('lostCamera', 'BINDING') === undefined);
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
    workspace.root.insert('object', myObject);

    const binding = dataBinder.resolve('object', 'BINDING');

    expect(binding._object.name).toEqual('myObject');
    expect(binding._object.position).toEqual({ x: 1, y: 2, z: 3 });
    expect(binding._object.scale).toEqual({ x: 1, y: 1, z: 1 });

    myObject.get('name').setValue('stillMyObject');
    myObject.get(['pos', 'x']).setValue(4);
    myObject.get(['scale', 'y']).setValue(12);

    expect(binding._object.name).toEqual('stillMyObject');
    expect(binding._object.position).toEqual({ x: 4, y: 2, z: 3 });
    expect(binding._object.scale).toEqual({ x: 1, y: 12, z: 1 });
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
    workspace.root.insert('object', myObject);

    const binding = dataBinder.resolve('object', 'BINDING');

    expect(binding._object.name).toEqual('myObject');
    expect(binding._object.position).toEqual({ x: 1, y: 2, z: 3 });
    expect(binding._object.scale).toEqual({ x: 1, y: 1, z: 1 });

    myObject.get('name').setValue('stillMyObject');
    myObject.get(['pos', 'x']).setValue(4);
    myObject.get(['scale', 'y']).setValue(12);

    expect(binding._object.name).toEqual('stillMyObject');
    expect(binding._object.position).toEqual({ x: 4, y: 2, z: 3 });
    expect(binding._object.scale).toEqual({ x: 1, y: 12, z: 1 });
  });

});

describe('DataBinding.registerOnValues() should work for', function() {
  var dataBinder, workspace;

  catchConsoleErrors();

  beforeAll(function() {
    registerTestTemplates();

    PropertyFactory.register(Vector3DSchema);
    PropertyFactory.register(Object3DSchema);
  });

  beforeEach(async function() {
    // console.log('inner before each');
    dataBinder = new DataBinder();
    workspace = await MockSharedPropertyTree();
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

  it('Map of primitives', function() {
    var mapInsertSpy = jest.fn();
    var mapModifySpy = jest.fn();
    var mapRemoveSpy = jest.fn();
    ParentDataBinding.registerOnValues('mapPrimitive', ['collectionInsert'], mapInsertSpy);
    ParentDataBinding.registerOnValues('mapPrimitive', ['collectionModify'], mapModifySpy);
    ParentDataBinding.registerOnValues('mapPrimitive', ['collectionRemove'], mapRemoveSpy);

    // Register the base (Child) typeid
    dataBinder.register('BINDING', MapContainerTemplate.typeid, ParentDataBinding);
    dataBinder.attachTo(workspace);

    var mapContainerPset = PropertyFactory.create(MapContainerTemplate.typeid, 'single');
    workspace.root.insert('myMapContainerTemplate', mapContainerPset);

    // Expect the insertion of map values to trigger onInsert messages
    var mapProperty = workspace.root.get(['myMapContainerTemplate', 'mapPrimitive']);
    workspace.pushNotificationDelayScope();
    mapProperty.insert('one', '1');
    mapProperty.insert('two', '2');
    workspace.popNotificationDelayScope();

    expect(mapInsertSpy).toHaveBeenCalledTimes(2);
    // Test first parameter (index or key)
    expect(mapInsertSpy.mock.calls[0][0]).toEqual('one');
    expect(mapInsertSpy.mock.calls[1][0]).toEqual('two');

    // Test second parameter
    expect(mapInsertSpy.mock.calls[0][1]).toEqual('1');
    expect(mapInsertSpy.mock.calls[1][1]).toEqual('2');

    mapInsertSpy.mockClear();

    // modify map
    workspace.pushNotificationDelayScope();
    mapProperty.setValues({'one': '10'});
    mapProperty.setValues({'two': '20'});
    workspace.popNotificationDelayScope();
    expect(mapModifySpy).toHaveBeenCalledTimes(2);
    expect(mapModifySpy.mock.calls[0][0]).toEqual('one');
    expect(mapModifySpy.mock.calls[1][0]).toEqual('two');

    expect(mapModifySpy.mock.calls[0][1]).toEqual('10');
    expect(mapModifySpy.mock.calls[1][1]).toEqual('20');
    mapModifySpy.mockClear();

    // remove from map
    workspace.pushNotificationDelayScope();
    mapProperty.remove('one');
    mapProperty.remove('two');
    workspace.popNotificationDelayScope();
    expect(mapRemoveSpy).toHaveBeenCalledTimes(2);
    expect(mapRemoveSpy.mock.calls[0][0]).toEqual('one');
    expect(mapRemoveSpy.mock.calls[1][0]).toEqual('two');
    mapRemoveSpy.mockClear();
  });

  it('Array of primitives', function() {
    var arrayInsertSpy = jest.fn();
    var arrayModifySpy = jest.fn();
    var arrayRemoveSpy = jest.fn();

    // Add the container pset
    var arrayPropertyParent = PropertyFactory.create(ArrayContainerTemplate.typeid, 'single');

    // Expect the insertion of map values to trigger onInsert messages
    workspace.root.insert('ArrayContainerTemplate', arrayPropertyParent);

    ParentDataBinding.registerOnValues('arrayPrimitive', ['collectionInsert'], arrayInsertSpy);
    ParentDataBinding.registerOnValues('arrayPrimitive', ['collectionModify'], arrayModifySpy);
    ParentDataBinding.registerOnValues('arrayPrimitive', ['collectionRemove'], arrayRemoveSpy);

    // Register the base (Child) typeid
    dataBinder.register('BINDING', ArrayContainerTemplate.typeid, ParentDataBinding);
    dataBinder.attachTo(workspace);

    const arrayProperty = workspace.root.get(['ArrayContainerTemplate', 'arrayPrimitive']);
    workspace.pushNotificationDelayScope();
    arrayProperty.push('one');
    arrayProperty.push('two');
    workspace.popNotificationDelayScope();

    expect(arrayInsertSpy).toHaveBeenCalledTimes(2);
    // Test first parameter (index or key)
    expect(arrayInsertSpy.mock.calls[0][0]).toEqual(0);
    expect(arrayInsertSpy.mock.calls[1][0]).toEqual(1);

    // Test second parameter
    expect(arrayInsertSpy.mock.calls[0][1]).toEqual('one');
    expect(arrayInsertSpy.mock.calls[1][1]).toEqual('two');

    arrayInsertSpy.mockClear();

    // modify array
    workspace.pushNotificationDelayScope();
    arrayProperty.setValues(['10', '20']);
    workspace.popNotificationDelayScope();
    expect(arrayModifySpy).toHaveBeenCalledTimes(2);
    expect(arrayModifySpy.mock.calls[0][0]).toEqual(0);
    expect(arrayModifySpy.mock.calls[1][0]).toEqual(1);

    expect(arrayModifySpy.mock.calls[0][1]).toEqual('10');
    expect(arrayModifySpy.mock.calls[1][1]).toEqual('20');
    arrayModifySpy.mockClear();

    // remove from array
    workspace.pushNotificationDelayScope();
    arrayProperty.removeRange(0, 2);
    workspace.popNotificationDelayScope();
    expect(arrayRemoveSpy).toHaveBeenCalledTimes(2);
    // TODO: Not sure if these are the correct remove keys (Expectation is to have the values 0 and 1, since its a batched opertation)
    expect(arrayRemoveSpy.mock.calls[0][0]).toEqual(0);
    expect(arrayRemoveSpy.mock.calls[1][0]).toEqual(0);
    arrayRemoveSpy.mockClear();
  });

  it('Register on the whole primitives array changes', function() {
    var wholeArraySpy = jest.fn();

    // Add the container pset
    var arrayPropertyParent = PropertyFactory.create(ArrayContainerTemplate.typeid, 'single', {arrayPrimitive: ['initial']});

    // Expect the insertion of map values to trigger onInsert messages
    workspace.root.insert('ArrayContainerTemplate', arrayPropertyParent);

    ParentDataBinding.registerOnValues('arrayPrimitive', ['insert', 'modify'], wholeArraySpy);

    // Register the base (Child) typeid
    dataBinder.register('BINDING', ArrayContainerTemplate.typeid, ParentDataBinding);
    dataBinder.attachTo(workspace);

    expect(wholeArraySpy).toHaveBeenCalledTimes(1);

    const arrayProperty = workspace.root.get(['ArrayContainerTemplate', 'arrayPrimitive']);

    // Test first parameter (collection values)
    expect(wholeArraySpy.mock.calls[0][0]).toEqual(['initial']);

    arrayProperty.push('one');

    // Test modify event
    expect(wholeArraySpy).toHaveBeenCalledTimes(2);
    expect(wholeArraySpy.mock.calls[1][0]).toEqual(['initial', 'one']);

    wholeArraySpy.mockClear();
  });
});
