/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* globals should, sinon, expect */
import { DataBinder } from '../data_binder/dataBinder';
import { DataBinding } from '../data_binder/dataBinding';
import { catchConsoleErrors } from './catchConsoleError';
import { MockSharedPropertyTree } from './mockSharedPropertyTree';
import { BaseProperty, PropertyFactory } from '@fluid-experimental/property-properties';
const NEVER = { referenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.NEVER };

describe('ES6 DataBinding', function() {
  catchConsoleErrors();

  var TestDataBinding;
  var workspace, dataBinder;
  var testProp, dataBinding;

  var propertyInsertCallback = jest.fn();
  var propertyModifyCallback = jest.fn();
  var propertyRemoveCallback = jest.fn();
  var collectionInsertCallback = jest.fn();
  var collectionModifyCallback = jest.fn();
  var collectionRemoveCallback = jest.fn();
  const referenceInsertCallback = jest.fn();
  const referenceModifyCallback = jest.fn();
  const referenceRemoveCallback = jest.fn();
  const referencedModifyCallback = jest.fn();
  var insertCallback = jest.fn();
  var modifyCallback = jest.fn();
  var removeCallback = jest.fn();
  var onPathCallback = jest.fn();
  var onJsonCallback = jest.fn();

  var personTemplate = {
    properties: [
      { id: 'name', typeid: 'String' },
      { id: 'lastName', typeid: 'String' }
    ],
    typeid: 'forge.appframework.tests:person-1.0.0'
  };

  var testTemplate = {
    inherits: ['NodeProperty'],
    properties: [
      { id: 'onPathTest', typeid: 'forge.appframework.tests:person-1.0.0' },
      { id: 'onJsonTest', typeid: 'forge.appframework.tests:person-1.0.0' },
      { id: 'customArrayTest', typeid: 'forge.appframework.tests:person-1.0.0', context: 'array' },
      { id: 'primitiveArrayTest', typeid: 'Float64', context: 'array' }
    ],
    typeid: 'forge.titanium:reactorTest-1.0.0'
  };

  var createPerson = function() {
    return PropertyFactory.create(personTemplate.typeid);
  };

  var createTest = function() {
    return PropertyFactory.create(testTemplate.typeid);
  };

  beforeAll(async function() {
    PropertyFactory.register(personTemplate);
    PropertyFactory.register(testTemplate);

    /**
     * ES6 dataBinding test class
     */
    TestDataBinding = class TestDataBindingClass extends DataBinding {

      /**
       * init
       */
      static initialize() {
        this.registerOnValues('onJsonTest.name', ['modify'], onJsonCallback);
        this.registerOnProperty('onProperty', ['insert'], propertyInsertCallback);
        this.registerOnProperty('onProperty', ['modify'], propertyModifyCallback);
        this.registerOnProperty('onProperty', ['remove'], propertyRemoveCallback);
        this.registerOnPath('customArrayTest', ['collectionInsert'], collectionInsertCallback);
        this.registerOnPath('customArrayTest', ['collectionModify'], collectionModifyCallback);
        this.registerOnPath('customArrayTest', ['collectionRemove'], collectionRemoveCallback);
        this.registerOnProperty('singleRef', ['referenceInsert'], referenceInsertCallback);
        this.registerOnProperty('singleRef', ['referenceModify'], referenceModifyCallback);
        this.registerOnProperty('singleRef.name', ['modify'], referencedModifyCallback);
        // Should not rewrite referenceModify event
        this.registerOnProperty('singleRef', ['modify'], referencedModifyCallback);
        this.registerOnProperty('singleRef', ['referenceRemove'], referenceRemoveCallback);
        this.registerOnPath('customTest', ['insert'], insertCallback);
        this.registerOnPath('customTest', ['modify'], modifyCallback);
        this.registerOnPath('customTest', ['remove'], removeCallback);
        this.registerOnPath('onPathTest', ['insert'], onPathCallback);
      }
    };

    workspace = await MockSharedPropertyTree();
    dataBinder = new DataBinder();
    TestDataBinding.initialize();
    dataBinder.attachTo(workspace);
    dataBinder.register('View', testTemplate.typeid, TestDataBinding);
    testProp = createTest();
    workspace.root.insert('testProp', testProp);
    workspace.root.insert('myChild', createPerson());
    testProp.insert('customTest', createPerson());
    testProp.insert('onProperty', createPerson());
    testProp.get('customArrayTest').insert(0, createPerson());
    testProp.get('primitiveArrayTest').insert(0, 42);
    dataBinding = dataBinder.resolve('testProp', 'View');
  });

  it('should instantiate a TestDataBinding dataBinding', function() {
    expect(dataBinding).toBeDefined();
    expect(dataBinding).toBeInstanceOf(TestDataBinding);
  });

  it('should throw on invalid properties access', function() {
    const fn = function() { return dataBinding.props.customTest.invalidId; };
    expect(fn).toThrow();
  });

  it('should call registerOnValues API', function() {
    testProp.get(['onJsonTest', 'name']).setValue('John Foo');
    expect(onJsonCallback).toHaveBeenCalledTimes(1);
  });

  // #region single properties tests

  it('should call onPathCallback API on insert', function() {
    expect(onPathCallback).toHaveBeenCalledTimes(1);
  });

  it('should call registerOnInsert API', function() {
    expect(insertCallback).toHaveBeenCalledTimes(1);
  });

  it('should call registerOnProperty API on insert', function() {
    expect(propertyInsertCallback).toHaveBeenCalledTimes(1);
  });

  it('should call registerOnModify API on insert', function() {
    testProp.get(['customTest', 'name']).setValue('John Bar');
    expect(modifyCallback).toHaveBeenCalledTimes(1);
  });

  it('should call registerOnProperty API on modifications', function() {
    testProp.get(['onProperty', 'name']).setValue('Jack Foo');
    expect(propertyModifyCallback).toHaveBeenCalledTimes(1);
  });

  it('should call registerOnRemove API', function() {
    testProp.remove('customTest');
    expect(removeCallback).toHaveBeenCalledTimes(1);
  });

  it('should call registerOnProperty API on removals', function() {
    testProp.remove('onProperty');
    expect(propertyRemoveCallback).toHaveBeenCalledTimes(1);
  });
  // #endregion single properties tests

  // #region Collection tests

  it('should call OnCollectionInsert when inserting on a collection', function() {
    testProp.get('customArrayTest').push(createPerson());
    expect(collectionInsertCallback).toHaveBeenCalledTimes(2);
  });

  it('should call OnCollectionModify when modifying on a collection', function() {
    testProp.get(['customArrayTest', 0, 'name']).setValue('Jack Bar');
    expect(collectionModifyCallback).toHaveBeenCalledTimes(1);
  });

  it('should call OnCollectionRemove when removing from a collection', function() {
    testProp.get('customArrayTest').pop();
    expect(collectionRemoveCallback).toHaveBeenCalledTimes(1);
  });

  // #endregion Collection tests

  // #region References tests
  it('should call referenceInsert when inserting a reference', function() {
    testProp.insert('singleRef', PropertyFactory.create('Reference'));
    expect(referenceInsertCallback).toHaveBeenCalledTimes(1);
  });
  it('should call referenceModify when modifying a reference', function() {
    testProp.get('singleRef', NEVER).setValue('/myChild');
    expect(referenceModifyCallback).toHaveBeenCalledTimes(1);
  });
  it('should not call reference events when the referenced property is modified', function() {
    testProp.get('singleRef').get('name').value = 'newName';
    // From the relative path .text plus the referenced property itself
    expect(referencedModifyCallback).toHaveBeenCalledTimes(2);
    expect(referenceInsertCallback).toHaveBeenCalledTimes(0);
    expect(referenceModifyCallback).toHaveBeenCalledTimes(0);
    expect(referenceRemoveCallback).toHaveBeenCalledTimes(0);
  });
  it('should call referenceRemove when removing a reference', function() {
    testProp.remove('singleRef');
    expect(referenceRemoveCallback).toHaveBeenCalledTimes(1);
  });

  // #endregion References tests

  afterEach(function() {
    referenceInsertCallback.mockClear();
    referenceModifyCallback.mockClear();
    referenceRemoveCallback.mockClear();
    referencedModifyCallback.mockClear();
  });
});
