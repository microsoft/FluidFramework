/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/* globals should, sinon, expect */
import { DataBinder } from '../../src/data_binder/data_binder';
import { DataBinding } from '../../src/data_binder/data_binding';
import { catchConsoleErrors } from './catch_console_errors';

import { BaseProperty, PropertyFactory } from '@fluid-experimental/property-properties';
const NEVER = { referenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.NEVER };


describe('ES6 DataBinding', function () {
  catchConsoleErrors();

  var TestDataBinding;
  var hfdm, workspace, dataBinder;
  var testProp, dataBinding;

  var propertyInsertCallback = sinon.spy();
  var propertyModifyCallback = sinon.spy();
  var propertyRemoveCallback = sinon.spy();
  var collectionInsertCallback = sinon.spy();
  var collectionModifyCallback = sinon.spy();
  var collectionRemoveCallback = sinon.spy();
  const referenceInsertCallback = sinon.spy();
  const referenceModifyCallback = sinon.spy();
  const referenceRemoveCallback = sinon.spy();
  const referencedModifyCallback = sinon.spy();
  var insertCallback = sinon.spy();
  var modifyCallback = sinon.spy();
  var removeCallback = sinon.spy();
  var onPathCallback = sinon.spy();
  var onJsonCallback = sinon.spy();

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

  var createPerson = function () {
    return PropertyFactory.create(personTemplate.typeid);
  };

  var createTest = function () {
    return PropertyFactory.create(testTemplate.typeid);
  };

  beforeAll(function () {
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

    hfdm = new HFDM();
    workspace = hfdm.createWorkspace();
    dataBinder = new DataBinder();
    return workspace.initialize({ local: true }).then(function () {
      TestDataBinding.initialize();
      dataBinder.attachTo(workspace);
      dataBinder.register('View', testTemplate.typeid, TestDataBinding);
      testProp = createTest();
      workspace.insert('testProp', testProp);
      workspace.insert('myChild', createPerson());
      testProp.insert('customTest', createPerson());
      testProp.insert('onProperty', createPerson());
      testProp.get('customArrayTest').insert(0, createPerson());
      testProp.get('primitiveArrayTest').insert(0, 42);
      dataBinding = dataBinder.resolve('testProp', 'View');
    });
  });

  it('should instantiate a TestDataBinding dataBinding', function () {
    should.exist(dataBinding);
    expect(dataBinding).instanceof(TestDataBinding);
  });

  it('should throw on invalid properties access', function () {
    const fn = function () { return dataBinding.props.customTest.invalidId; };
    expect(fn).to.throw();
  });

  it('should call registerOnValues API', function () {
    testProp.get(['onJsonTest', 'name']).setValue('John Foo');
    onJsonCallback.callCount.should.equal(1);
  });

  // #region single properties tests

  it('should call onPathCallback API on insert', function () {
    onPathCallback.callCount.should.equal(1);
  });

  it('should call registerOnInsert API', function () {
    insertCallback.callCount.should.equal(1);
  });

  it('should call registerOnProperty API on insert', function () {
    propertyInsertCallback.callCount.should.equal(1);
  });

  it('should call registerOnModify API on insert', function () {
    testProp.get(['customTest', 'name']).setValue('John Bar');
    modifyCallback.callCount.should.equal(1);
  });

  it('should call registerOnProperty API on modifications', function () {
    testProp.get(['onProperty', 'name']).setValue('Jack Foo');
    propertyModifyCallback.callCount.should.equal(1);
  });

  it('should call registerOnRemove API', function () {
    testProp.remove('customTest');
    removeCallback.callCount.should.equal(1);
  });

  it('should call registerOnProperty API on removals', function () {
    testProp.remove('onProperty');
    propertyRemoveCallback.callCount.should.equal(1);
  });
  // #endregion single properties tests

  // #region Collection tests

  it('should call OnCollectionInsert when inserting on a collection', function () {
    testProp.get('customArrayTest').push(createPerson());
    collectionInsertCallback.callCount.should.equal(2);
  });

  it('should call OnCollectionModify when modifying on a collection', function () {
    testProp.get(['customArrayTest', 0, 'name']).setValue('Jack Bar');
    collectionModifyCallback.callCount.should.equal(1);
  });

  it('should call OnCollectionRemove when removing from a collection', function () {
    testProp.get('customArrayTest').pop();
    collectionRemoveCallback.callCount.should.equal(1);
  });

  // #endregion Collection tests

  // #region References tests
  it('should call referenceInsert when inserting a reference', function () {
    testProp.insert('singleRef', PropertyFactory.create('Reference'));
    referenceInsertCallback.callCount.should.equal(1);
  });
  it('should call referenceModify when modifying a reference', function () {
    testProp.get('singleRef', NEVER).setValue('/myChild');
    referenceModifyCallback.callCount.should.equal(1);
  });
  it('should not call reference events when the referenced property is modified', function () {
    testProp.get('singleRef').get('name').value = 'newName';
    // From the relative path .text plus the referenced property itself
    referencedModifyCallback.callCount.should.equal(2);
    referenceInsertCallback.callCount.should.equal(0);
    referenceModifyCallback.callCount.should.equal(0);
    referenceRemoveCallback.callCount.should.equal(0);
  });
  it('should call referenceRemove when removing a reference', function () {
    testProp.remove('singleRef');
    referenceRemoveCallback.callCount.should.equal(1);
  });

  // #endregion References tests

  afterEach(function () {
    referenceInsertCallback.resetHistory();
    referenceModifyCallback.resetHistory();
    referenceRemoveCallback.resetHistory();
    referencedModifyCallback.resetHistory();
  });
});
