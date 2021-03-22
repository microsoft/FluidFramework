/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/* globals expect, should  */
import { DataBinder } from '../../src/data_binder/data_binder';

import {
  catchConsoleErrors
} from './catch_console_errors';

import {
  registerTestTemplates, ChildTemplate, PrimitiveChildrenTemplate, ReferenceParentTemplate, ArrayContainerTemplate,
  MapContainerTemplate, SetContainerTemplate
} from './testTemplates';

import * as _ from 'underscore';

import { PropertyElement } from '../../src/internal/property_element';
import { PropertyFactory } from '@fluid-experimental/property-properties';
import { RESOLVE_NEVER, RESOLVE_NO_LEAFS, RESOLVE_ALWAYS } from '../../src/internal/constants';

describe('Property element', function () {

  let dataBinder;
  let workspace;

  // Silence the actual console.error, so the test logs are clean
  console.error = function () {
  };

  catchConsoleErrors();

  beforeAll(function () {
    registerTestTemplates();
  });

  beforeEach(function () {
    const hfdm = new HFDM();
    workspace = hfdm.createWorkspace();
    return workspace.initialize({ local: true }).then(function () {
    });
  });

  describe('hierarchy walking', function () {
    beforeEach(function () {
      dataBinder = new DataBinder();
      // Bind to the workspace
      dataBinder.attachTo(workspace);
    });

    afterEach(function () {
      // Unbind checkout view
      dataBinder.detach();
      dataBinder = null;
    });

    it('dereferencing', function () {
      workspace.insert('refParent', PropertyFactory.create(ReferenceParentTemplate.typeid, 'single'));
      workspace.insert('child', PropertyFactory.create(PrimitiveChildrenTemplate.typeid, 'single'));
      workspace.get(['refParent', 'single_ref'], RESOLVE_NEVER).setValue('/child');

      const rootElem = new PropertyElement(workspace.getRoot());
      rootElem.isValid().should.equal(true);

      const refParentElem = rootElem.getChild('refParent');
      refParentElem.getProperty().getId().should.equal('refParent');

      const directToRef = ['single_ref'];
      refParentElem.getChild(directToRef, RESOLVE_NEVER).getProperty().getId().should.equal('single_ref');
      refParentElem.getChild(directToRef, RESOLVE_NO_LEAFS).getProperty().getId().should.equal('single_ref');
      refParentElem.getChild(directToRef, RESOLVE_ALWAYS).getProperty().getId().should.equal('child');

      const pathToRef = ['refParent', 'single_ref'];
      rootElem.getChild(pathToRef, RESOLVE_NEVER).getProperty().getId().should.equal('single_ref');
      rootElem.getChild(pathToRef, RESOLVE_NO_LEAFS).getProperty().getId().should.equal('single_ref');
      rootElem.getChild(pathToRef, RESOLVE_ALWAYS).getProperty().getId().should.equal('child');

      const pathThroughRef = ['refParent', 'single_ref', 'aString'];
      rootElem.getChild(pathThroughRef, RESOLVE_NEVER).isValid().should.equal(false);
      rootElem.getChild(pathThroughRef, RESOLVE_NO_LEAFS).getProperty().getId().should.equal('aString');
      rootElem.getChild(pathThroughRef, RESOLVE_ALWAYS).getProperty().getId().should.equal('aString');
    });

  });

  it('reference containers', function () {
    workspace.insert('refParent', PropertyFactory.create(ReferenceParentTemplate.typeid, 'single'));
    workspace.insert('child', PropertyFactory.create(PrimitiveChildrenTemplate.typeid, 'single'));
    workspace.get(['refParent', 'array_ref']).push('/child');
    workspace.get(['refParent', 'map_ref']).insert('aKey', '/child');

    const rootElem = new PropertyElement(workspace.getRoot());
    rootElem.isValid().should.equal(true);

    const refParentElem = rootElem.getChild('refParent');
    refParentElem.getProperty().getId().should.equal('refParent');

    const pathToArrayRef = ['array_ref', 0];
    refParentElem.getChild(pathToArrayRef, RESOLVE_NEVER).getProperty().getId().should.equal('array_ref');
    refParentElem.getChild(pathToArrayRef, RESOLVE_NEVER).getChildToken().should.equal(0);
    refParentElem.getChild(pathToArrayRef, RESOLVE_NO_LEAFS).getProperty().getId().should.equal('array_ref');
    refParentElem.getChild(pathToArrayRef, RESOLVE_NO_LEAFS).getChildToken().should.equal(0);
    refParentElem.getChild(pathToArrayRef, RESOLVE_ALWAYS).getProperty().getId().should.equal('child');

    const pathToMapRef = ['map_ref', 'aKey'];
    refParentElem.getChild(pathToMapRef, RESOLVE_NEVER).getProperty().getId().should.equal('map_ref');
    refParentElem.getChild(pathToMapRef, RESOLVE_NEVER).getChildToken().should.equal('aKey');
    refParentElem.getChild(pathToMapRef, RESOLVE_NO_LEAFS).getProperty().getId().should.equal('map_ref');
    refParentElem.getChild(pathToMapRef, RESOLVE_NO_LEAFS).getChildToken().should.equal('aKey');
    refParentElem.getChild(pathToMapRef, RESOLVE_ALWAYS).getProperty().getId().should.equal('child');

    const pathThroughArrayRef = ['refParent', 'array_ref', 0, 'aString'];
    rootElem.getChild(pathThroughArrayRef, RESOLVE_NEVER).isValid().should.equal(false);
    rootElem.getChild(pathThroughArrayRef, RESOLVE_NO_LEAFS).getProperty().getId().should.equal('aString');
    rootElem.getChild(pathThroughArrayRef, RESOLVE_ALWAYS).getProperty().getId().should.equal('aString');

    const pathThroughMapRef = ['refParent', 'map_ref', 'aKey', 'aString'];
    rootElem.getChild(pathThroughMapRef, RESOLVE_NEVER).isValid().should.equal(false);
    rootElem.getChild(pathThroughMapRef, RESOLVE_NO_LEAFS).getProperty().getId().should.equal('aString');
    rootElem.getChild(pathThroughMapRef, RESOLVE_ALWAYS).getProperty().getId().should.equal('aString');
  });

  it('parenting', function () {
    const child = PropertyFactory.create(PrimitiveChildrenTemplate.typeid, 'single');
    const refParent = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');

    workspace.insert('refParent', refParent);
    workspace.insert('child', child);
    workspace.get(['refParent', 'array_ref']).push('/child');
    workspace.get(['refParent', 'map_ref']).insert('aKey', '/child');
    workspace.get(['child', 'arrayOfNumbers']).push(42);

    const rootElem = new PropertyElement(workspace.getRoot());
    rootElem.isValid().should.equal(true);

    // Root has no parent
    rootElem.getParent().isValid().should.equal(false);

    const refParentElem = rootElem.getChild('refParent');
    refParentElem.getParent().getProperty().should.equal(workspace.getRoot());

    const arrayEntryElem = refParentElem.getChild(['array_ref', 0], RESOLVE_NEVER);
    arrayEntryElem.getChildToken().should.equal(0);
    arrayEntryElem.getParent().getProperty().should.equal(workspace.get(['refParent', 'array_ref']));
    should.not.exist(arrayEntryElem.getParent().getChildToken());

    const mapEntryElem = refParentElem.getChild(['map_ref', 'aKey'], RESOLVE_NEVER);
    mapEntryElem.getChildToken().should.equal('aKey');
    mapEntryElem.getParent().getProperty().should.equal(workspace.get(['refParent', 'map_ref']));
    should.not.exist(mapEntryElem.getParent().getChildToken());

    const childElem = rootElem.getChild('child');
    const numberElem = childElem.getChild(['arrayOfNumbers', 0]);
    numberElem.getChildToken().should.equal(0);
    numberElem.getValue().should.equal(42);

    const parentElem = numberElem.getParent();
    parentElem.getProperty().getId().should.equal('arrayOfNumbers');
  });

  it('getValue', function () {
    const myData = PropertyFactory.create(PrimitiveChildrenTemplate.typeid, 'single');
    myData.get('arrayOfNumbers').setValues([1, 2, 3]);
    myData.get('arrayOfStrings').push('a');
    myData.get('arrayOfStrings').push('b');
    myData.get('arrayOfStrings').push('c');
    myData.get('mapOfNumbers').set('a', 1);
    myData.get('mapOfNumbers').set('b', 2);
    myData.get('mapOfNumbers').set('c', 3);
    myData.get('mapOfStrings').set('a', 'A');
    myData.get('mapOfStrings').set('b', 'B');
    myData.get('mapOfStrings').set('c', 'C');
    myData.get('aString').setValue('my string');
    myData.get('aNumber').setValue(42);
    myData.resolvePath('nested.aNumber').setValue(12);

    const allData = {
      thedata: myData.getValues()
    };
    // console.log('All the data:', allData);

    workspace.insert('thedata', myData);

    const propElem = new PropertyElement(workspace.getRoot());

    const test = (data, child) => {
      propElem.becomeChild(child);
      // console.log('checking', propElem.toString(),':');
      const computed = propElem.getValue();
      const expected = data[child];
      // console.log(computed, ' expecting ', expected);
      computed.should.deep.equal(expected);
      if (propElem.getTypeId() !== 'String') {
        _.each(data[child], (value, key) => {
          test(data[child], key);
        });
      }
      propElem.becomeParent();
    };

    test(allData, 'thedata');
  });

  it('setValue', function () {
    const myData = PropertyFactory.create(PrimitiveChildrenTemplate.typeid, 'single');
    const propElem = new PropertyElement(myData);
    propElem.getChild('arrayOfNumbers').setValue([1, 2, 3]);
    propElem.getChild(['arrayOfNumbers', 1]).setValue(42);
    propElem.getChild('arrayOfNumbers').getValue().should.deep.equal([1, 42, 3]);

    propElem.getChild('arrayOfStrings').setValue(['a', 'b', 'c']);
    propElem.getChild(['arrayOfStrings', 1]).setValue('INTERRUPTING COW');
    propElem.getChild('arrayOfStrings').getValue().should.deep.equal(['a', 'INTERRUPTING COW', 'c']);

    propElem.getChild('mapOfNumbers').setValue({ a: 1, b: 2, c: 3 });
    propElem.getChild(['mapOfNumbers', 'b']).setValue(42);
    propElem.getChild('mapOfNumbers').getValue().should.deep.equal({ a: 1, b: 42, c: 3 });

    propElem.getChild('mapOfStrings').setValue({ a: 'A', b: 'B', c: 'C' });
    propElem.getChild(['mapOfStrings', 'b']).setValue('INTERRUPTING... not funny second time');
    propElem.getChild('mapOfStrings').getValue().should.deep.equal(
      { a: 'A', b: 'INTERRUPTING... not funny second time', c: 'C' }
    );

    propElem.getChild('nested').setValue({
      aNumber: 12
    });
    propElem.getChild('nested').getValue().should.deep.equal({ aNumber: 12 });

    myData.getValues().should.deep.equal(propElem.getValue());
  });

  it('isPrimitiveCollection basic', function () {
    const myData = PropertyFactory.create(PrimitiveChildrenTemplate.typeid, 'single');
    const propElem = new PropertyElement(myData);

    propElem.isPrimitiveCollection().should.equal(false);
    propElem.getChild('nested').isPrimitiveCollection().should.equal(false);
    propElem.getChild('arrayOfStrings').isPrimitiveCollection().should.equal(true);
    propElem.getChild('mapOfNumbers').isPrimitiveCollection().should.equal(true);
    propElem.getChild('mapOfStrings').isPrimitiveCollection().should.equal(true);
    propElem.getChild('aString').isPrimitiveCollection().should.equal(false);
    propElem.getChild('aNumber').isPrimitiveCollection().should.equal(false);
  });

  it('isPrimitiveCollection array of prop', function () {
    const myArrayData = PropertyFactory.create(ArrayContainerTemplate.typeid, 'single');
    const propElem = new PropertyElement(myArrayData);
    propElem.isPrimitiveCollection().should.equal(false);
    propElem.getChild('subArray').isPrimitiveCollection().should.equal(false);
    propElem.getChild('unrepresentedSubArray').isPrimitiveCollection().should.equal(false);
  });

  it('isPrimitiveCollection set of prop', function () {
    const mySetData = PropertyFactory.create(SetContainerTemplate.typeid, 'single');
    const propElem = new PropertyElement(mySetData);
    propElem.isPrimitiveCollection().should.equal(false);
    propElem.getChild('subSet').isPrimitiveCollection().should.equal(false);
    propElem.getChild('unrepresentedSubSet').isPrimitiveCollection().should.equal(false);
  });

  it('isPrimitiveCollection map of prop', function () {
    const myMapData = PropertyFactory.create(MapContainerTemplate.typeid, 'single');
    const propElem = new PropertyElement(myMapData);
    propElem.isPrimitiveCollection().should.equal(false);
    propElem.getChild('subMap').isPrimitiveCollection().should.equal(false);
    propElem.getChild('unrepresentedSubMap').isPrimitiveCollection().should.equal(false);
  });

  it('crazy paths for child token', function () {
    const mymap = PropertyFactory.create('Float64', 'map');
    workspace.insert('themap', mymap);

    mymap.insert('"my.child.path"', 42);
    const propElem = new PropertyElement(mymap);
    propElem.becomeChild('"my.child.path"');
    propElem.isValid().should.equal(true);

    propElem.getValue().should.equal(42);

    propElem.getAbsolutePath().should.equal('/themap["my.child.path"]');
  });

  it('array of properties parenting', function () {
    const array = PropertyFactory.create(ArrayContainerTemplate.typeid, 'single');
    const child0 = PropertyFactory.create(ChildTemplate.typeid, 'single');
    const child1 = PropertyFactory.create(ChildTemplate.typeid, 'single');
    child0.get('text').setValue('child0 text');
    child1.get('text').setValue('child1 text');
    array.get('subArray').push(child0);
    array.get('subArray').push(child1);
    workspace.insert('theArray', array);

    const rootElem = new PropertyElement(workspace.getRoot());
    const childElem = rootElem.getChild(['theArray', 'subArray', 1, 'text']);
    childElem.getValue().should.equal('child1 text');

    childElem.getParent().getParent().getProperty().getId().should.equal('subArray');
    should.not.exist(childElem.getParent().getParent().getChildToken());
  });

  it('map of properties parenting', function () {
    const map = PropertyFactory.create(MapContainerTemplate.typeid, 'single');
    const child0 = PropertyFactory.create(ChildTemplate.typeid, 'single');
    const child1 = PropertyFactory.create(ChildTemplate.typeid, 'single');
    child0.get('text').setValue('child0 text');
    child1.get('text').setValue('child1 text');
    map.get('subMap').insert('child0', child0);
    map.get('subMap').insert('child1', child1);
    workspace.insert('theMap', map);

    const rootElem = new PropertyElement(workspace.getRoot());
    const childElem = rootElem.getChild(['theMap', 'subMap', 'child1', 'text']);
    childElem.getValue().should.equal('child1 text');

    childElem.getParent().getProperty().getId().should.equal('child1');
    should.not.exist(childElem.getParent().getChildToken());

    childElem.getParent().getParent().getProperty().getId().should.equal('subMap');
    should.not.exist(childElem.getParent().getParent().getChildToken());
  });

  it('double references', function () {
    const text = PropertyFactory.create('String', 'single');
    const ref1 = PropertyFactory.create('Reference', 'single');
    const ref2 = PropertyFactory.create('Reference', 'single');
    const ref3 = PropertyFactory.create('Reference', 'single');
    workspace.insert('text', text);
    workspace.insert('ref1', ref1);
    workspace.insert('ref2', ref2);
    workspace.insert('ref3', ref3);
    ref3.setValue('/ref2');
    ref2.setValue('/ref1');
    ref1.setValue('/text');
    text.setValue('theText');

    const rootElem = new PropertyElement(workspace.getRoot());
    rootElem.getChild('ref3', RESOLVE_ALWAYS).getValue().should.equal('theText');
    rootElem.getChild('ref3', RESOLVE_NEVER).getValue().should.equal('/ref2');
  });

  it('double references array', function () {
    const text = PropertyFactory.create('String', 'single');
    const refs = PropertyFactory.create('Reference', 'array');
    workspace.insert('text', text);
    workspace.insert('refs', refs);
    refs.push('/text');
    refs.push('/refs[0]');
    refs.push('/refs[1]');
    text.setValue('theText');

    const rootElem = new PropertyElement(workspace.getRoot());
    rootElem.getChild(['refs', 2], RESOLVE_ALWAYS).getValue().should.equal('theText');
    rootElem.getChild(['refs', 2], RESOLVE_NO_LEAFS).getValue().should.equal('/refs[1]');
    rootElem.getChild(['refs', 2], RESOLVE_NEVER).getValue().should.equal('/refs[1]');
  });

  it('tokenized path, toString, getContext', function () {
    const arrayData = PropertyFactory.create('String', 'array');
    workspace.insert('theArray', arrayData);
    arrayData.push('hi');

    const rootElem = new PropertyElement(workspace.getRoot());
    rootElem.getTokenizedPath().length.should.equal(0);
    rootElem.getContext().should.equal('single');
    rootElem.becomeChild('theArray');
    rootElem.getContext().should.equal('array');
    rootElem.getTokenizedPath().length.should.equal(1);
    rootElem.getTokenizedPath()[0].should.equal('theArray');
    rootElem.toString().should.equal('</theArray>');

    rootElem.becomeChild(0);
    rootElem.getContext().should.equal('single');
    rootElem.getTokenizedPath().length.should.equal(2);
    rootElem.getTokenizedPath()[0].should.equal('theArray');
    rootElem.getTokenizedPath()[1].should.equal('0');
    rootElem.toString().should.equal('</theArray[0]>');

    (new PropertyElement()).toString().should.equal('<invalid>');
  });

  it('becoming the parent', function () {
    const arrayData = PropertyFactory.create('String', 'array');
    workspace.insert('theArray', arrayData);
    arrayData.push('hi');

    const rootElem = new PropertyElement(workspace.getRoot());
    rootElem.becomeChild('theArray');
    rootElem.getProperty().should.equal(workspace.getRoot().get('theArray'));
    rootElem.becomeChild(0);
    rootElem.getProperty().should.equal(workspace.getRoot().get('theArray'));
    rootElem.getChildToken().should.equal(0);
    rootElem.becomeParent();
    rootElem.getProperty().should.equal(workspace.getRoot().get('theArray'));
    should.not.exist(rootElem.getChildToken());
    rootElem.becomeParent();
    rootElem.getProperty().should.equal(workspace.getRoot());
    should.not.exist(rootElem.getChildToken());
    rootElem.becomeParent();
    rootElem.isValid().should.equal(false);
  });

  it('isPrimitiveCollection', function () {
    const types = ['String', 'Float32', 'Reference'];
    const contexts = ['single', 'array', 'map'];
    types.forEach(theType => {
      contexts.forEach(context => {
        const prop = PropertyFactory.create(theType, context);
        (new PropertyElement(prop)).isPrimitiveCollection().should.equal(context !== 'single');
      });
    });

    const nodeArray = PropertyFactory.create('NodeProperty', 'array');
    const propElem = new PropertyElement(nodeArray);
    propElem.isPrimitiveCollection().should.equal(false);

    const array = PropertyFactory.create('Float32', 'array');
    array.push(42);
    const element = new PropertyElement(array);
    element.isPrimitiveCollection().should.equal(true);
    element.becomeChild(0);
    element.isPrimitiveCollection().should.equal(false);
  });

  it('cloning', function () {
    const arrayData = PropertyFactory.create('String', 'array');
    workspace.insert('theArray', arrayData);
    arrayData.push('hi');

    const rootElem = new PropertyElement(workspace.getRoot());
    rootElem.becomeChild('theArray');
    rootElem.becomeChild(0);
    const clone = rootElem.clone();
    clone.getProperty().should.equal(rootElem.getProperty());
    clone.getChildToken().should.equal(rootElem.getChildToken());
  });

  it('a reference with *', function () {
    const myData = PropertyFactory.create('Float64');
    const myReference1 = PropertyFactory.create('Reference');
    const myReference2 = PropertyFactory.create('Reference');

    workspace.insert('myData', myData);
    workspace.insert('myReference1', myReference1);
    workspace.insert('myReference2', myReference2);

    myData.setValue(42);
    myReference1.setValue('/myData');
    myReference2.setValue('/myReference1*'); // Note the star!

    const propElem = new PropertyElement(workspace.getRoot());
    propElem.becomeChild('myReference2');

    // The value of the reference has a *: we are referring to the reference property and not the
    // _referenced_ property.
    propElem.getValue().should.equal('/myData');
  });

  it('a reference with * in the middle', function () {
    const myData = PropertyFactory.create('Float64', 'array');
    const myReference1 = PropertyFactory.create('Reference');
    const myReference2 = PropertyFactory.create('Reference');

    myData.push(0);
    myData.push(1);
    myData.push(2);

    workspace.insert('myData', myData);
    workspace.insert('myReference1', myReference1);
    workspace.insert('myReference2', myReference2);

    myReference1.setValue('/myData');
    myReference2.setValue('/myReference1*.[1]');

    const propElem = new PropertyElement(workspace.getRoot());
    propElem.becomeChild('myReference2');

    // Because we didn't dereference myReference1, [1] fails
    propElem.isValid().should.equal(false);
  });

  it('a reference without *', function () {
    const myData = PropertyFactory.create('Float64');
    const myReference1 = PropertyFactory.create('Reference');
    const myReference2 = PropertyFactory.create('Reference');

    workspace.insert('myData', myData);
    workspace.insert('myReference1', myReference1);
    workspace.insert('myReference2', myReference2);

    myData.setValue(42);
    myReference1.setValue('/myData');
    myReference2.setValue('/myReference1');

    const propElem = new PropertyElement(workspace.getRoot());
    propElem.becomeChild('myReference2');

    propElem.getValue().should.equal(42);
  });

  it('dereferencing chain', function () {
    const myData = PropertyFactory.create(ChildTemplate.typeid);
    workspace.insert('myData', myData);

    // Set up a chain; ref3 points to ref2 points to ref1 points to myData
    const myReferences = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single', {
      ref1: '/myData',
      ref2: 'ref1',
      ref3: 'ref2'
    });
    workspace.insert('myReferences', myReferences);
    const propElem = new PropertyElement(myReferences.get('ref3', RESOLVE_NEVER));
    propElem.isValid().should.equal(true);
    propElem.becomeDereference();
    propElem.getProperty().should.equal(myData);
  });

  it('dereferencing chain, primitive array', function () {
    const myData = PropertyFactory.create(ChildTemplate.typeid);
    workspace.insert('myData', myData);

    // Set up a chain; array_ref[2] points to array_ref[1] points to array_ref[0] points to myData
    const myReferences = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single', {
      array_ref: ['/myData', 'array_ref[0]', 'array_ref[1]']
    });
    workspace.insert('myReferences', myReferences);
    const propElem = new PropertyElement(myReferences.get('array_ref'), 2);
    propElem.isValid().should.equal(true);
    propElem.becomeDereference();
    propElem.getProperty().should.equal(myData);
  });

  it('dereferencing chain, primitive array, with a *', function () {
    const myData = PropertyFactory.create(ChildTemplate.typeid);
    workspace.insert('myData', myData);

    // Set up a chain; array_ref[2] points to array_ref[1] points to array_ref[0] but with a * so the
    // reference, not the target
    const myReferences = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single', {
      array_ref: ['/myData', 'array_ref[0].*', 'array_ref[1]'] // Note the star!
    });
    workspace.insert('myReferences', myReferences);
    const propElem = new PropertyElement(myReferences.get('array_ref'), 2);
    propElem.isValid().should.equal(true);
    propElem.becomeDereference();
    propElem.getProperty().should.equal(myReferences.get('array_ref'));
    propElem.getChildToken().should.equal(0);
  });

  it('a reference array element with *', function () {
    const myData = PropertyFactory.create('Float64');
    const myReference1 = PropertyFactory.create('Reference', 'array');
    const myReference2 = PropertyFactory.create('Reference');

    workspace.insert('myData', myData);
    workspace.insert('myReference1', myReference1);
    workspace.insert('myReference2', myReference2);

    myData.setValue(42);
    myReference1.push('/myData');
    myReference2.setValue('/myReference1[0].*'); // Note the star!

    const propElem = new PropertyElement(workspace.getRoot());
    propElem.becomeChild('myReference2');

    // The value of the reference has a *: we are referring to the reference property and not the
    // _referenced_ property.
    propElem.getValue().should.equal('/myData');
  });

  it('a reference array element without *', function () {
    const myData = PropertyFactory.create('Float64');
    const myReference1 = PropertyFactory.create('Reference', 'array');
    const myReference2 = PropertyFactory.create('Reference');

    workspace.insert('myData', myData);
    workspace.insert('myReference1', myReference1);
    workspace.insert('myReference2', myReference2);

    myData.setValue(42);
    myReference1.push('/myData');
    myReference2.setValue('/myReference1[0]');

    const propElem = new PropertyElement(workspace.getRoot());
    propElem.becomeChild('myReference2');

    propElem.getValue().should.equal(42);
  });

  it('a reference map element with *', function () {
    const myData = PropertyFactory.create('Float64');
    const myReference1 = PropertyFactory.create('Reference', 'map');
    const myReference2 = PropertyFactory.create('Reference');

    workspace.insert('myData', myData);
    workspace.insert('myReference1', myReference1);
    workspace.insert('myReference2', myReference2);

    myData.setValue(42);
    myReference1.set('toto', '/myData');
    myReference2.setValue('/myReference1[toto].*'); // Note the star!

    const propElem = new PropertyElement(workspace.getRoot());
    propElem.becomeChild('myReference2');

    // The value of the reference has a *: we are referring to the reference property and not the
    // _referenced_ property.
    propElem.getValue().should.equal('/myData');
  });

  it('a reference map element without *', function () {
    const myData = PropertyFactory.create('Float64');
    const myReference1 = PropertyFactory.create('Reference', 'map');
    const myReference2 = PropertyFactory.create('Reference');

    workspace.insert('myData', myData);
    workspace.insert('myReference1', myReference1);
    workspace.insert('myReference2', myReference2);

    myData.setValue(42);
    myReference1.set('toto', '/myData');
    myReference2.setValue('/myReference1[toto]');

    const propElem = new PropertyElement(workspace.getRoot());
    propElem.becomeChild('myReference2');

    propElem.getValue().should.equal(42);
  });

  it('reference RESOLVE_NEVER/NO_LEAFS', function () {
    const myData = PropertyFactory.create(PrimitiveChildrenTemplate.typeid);
    const myReference1 = PropertyFactory.create('Reference', 'map');
    const myReference2 = PropertyFactory.create('Reference');

    myData.get('aNumber').setValue(42);
    workspace.insert('myData', myData);
    workspace.insert('myReference1', myReference1);
    workspace.insert('myReference2', myReference2);

    myReference1.set('toto', '/myData');
    myReference2.setValue('/myReference1[toto]');

    const propElem = new PropertyElement(workspace.getRoot());
    propElem.getChild('myReference2', RESOLVE_NEVER).getProperty().should.equal(myReference2);
    propElem.getChild(['myReference2', 'aNumber'], RESOLVE_NEVER).isValid().should.equal(false);

    propElem.getChild('myReference2', RESOLVE_ALWAYS).getProperty().should.equal(myData);
    propElem.getChild(['myReference2', 'aNumber'], RESOLVE_ALWAYS).getValue().should.equal(42);

    propElem.getChild('myReference2', RESOLVE_NO_LEAFS).getProperty().should.equal(myReference2);
    propElem.getChild(['myReference2', 'aNumber'], RESOLVE_NO_LEAFS).getValue().should.equal(42);
  });

});
