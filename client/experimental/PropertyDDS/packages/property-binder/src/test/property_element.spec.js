/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* globals expect, should  */
import { DataBinder } from '../data_binder/dataBinder';

import {
  catchConsoleErrors
} from './catchConsoleError';

import {
  registerTestTemplates, ChildTemplate, PrimitiveChildrenTemplate, ReferenceParentTemplate, ArrayContainerTemplate,
  MapContainerTemplate, SetContainerTemplate
} from './testTemplates';

import * as _ from 'underscore';

import { PropertyElement } from '../internal/propertyElement';
import { PropertyFactory } from '@fluid-experimental/property-properties';
import { RESOLVE_NEVER, RESOLVE_NO_LEAFS, RESOLVE_ALWAYS } from '../internal/constants';
import { MockSharedPropertyTree } from './mockSharedPropertyTree';

describe('Property element', function() {

  let dataBinder;
  let workspace;

  // Silence the actual console.error, so the test logs are clean
  console.error = function() {
  };

  catchConsoleErrors();

  beforeAll(function() {
    registerTestTemplates();
  });

  beforeEach(async function() {
    workspace = await MockSharedPropertyTree();
  });

  describe('hierarchy walking', function() {
    beforeEach(function() {
      dataBinder = new DataBinder();
      // Bind to the workspace
      dataBinder.attachTo(workspace);
    });

    afterEach(function() {
      // Unbind checkout view
      dataBinder.detach();
      dataBinder = null;
    });

    it('dereferencing', function() {
      workspace.root.insert('refParent', PropertyFactory.create(ReferenceParentTemplate.typeid, 'single'));
      workspace.root.insert('child', PropertyFactory.create(PrimitiveChildrenTemplate.typeid, 'single'));
      workspace.root.get(['refParent', 'single_ref'], RESOLVE_NEVER).setValue('/child');

      const rootElem = new PropertyElement(workspace.root);
      expect(rootElem.isValid()).toEqual(true);

      const refParentElem = rootElem.getChild('refParent');
      expect(refParentElem.getProperty().getId()).toEqual('refParent');

      const directToRef = ['single_ref'];
      expect(refParentElem.getChild(directToRef, RESOLVE_NEVER).getProperty().getId()).toEqual('single_ref');
      expect(refParentElem.getChild(directToRef, RESOLVE_NO_LEAFS).getProperty().getId()).toEqual('single_ref');
      expect(refParentElem.getChild(directToRef, RESOLVE_ALWAYS).getProperty().getId()).toEqual('child');

      const pathToRef = ['refParent', 'single_ref'];
      expect(rootElem.getChild(pathToRef, RESOLVE_NEVER).getProperty().getId()).toEqual('single_ref');
      expect(rootElem.getChild(pathToRef, RESOLVE_NO_LEAFS).getProperty().getId()).toEqual('single_ref');
      expect(rootElem.getChild(pathToRef, RESOLVE_ALWAYS).getProperty().getId()).toEqual('child');

      const pathThroughRef = ['refParent', 'single_ref', 'aString'];
      expect(rootElem.getChild(pathThroughRef, RESOLVE_NEVER).isValid()).toEqual(false);
      expect(rootElem.getChild(pathThroughRef, RESOLVE_NO_LEAFS).getProperty().getId()).toEqual('aString');
      expect(rootElem.getChild(pathThroughRef, RESOLVE_ALWAYS).getProperty().getId()).toEqual('aString');
    });

  });

  it('reference containers', function() {
    workspace.root.insert('refParent', PropertyFactory.create(ReferenceParentTemplate.typeid, 'single'));
    workspace.root.insert('child', PropertyFactory.create(PrimitiveChildrenTemplate.typeid, 'single'));
    workspace.root.get(['refParent', 'array_ref']).push('/child');
    workspace.root.get(['refParent', 'map_ref']).insert('aKey', '/child');

    const rootElem = new PropertyElement(workspace.root);
    expect(rootElem.isValid()).toEqual(true);

    const refParentElem = rootElem.getChild('refParent');
    expect(refParentElem.getProperty().getId()).toEqual('refParent');

    const pathToArrayRef = ['array_ref', 0];
    expect(refParentElem.getChild(pathToArrayRef, RESOLVE_NEVER).getProperty().getId()).toEqual('array_ref');
    expect(refParentElem.getChild(pathToArrayRef, RESOLVE_NEVER).getChildToken()).toEqual(0);
    expect(refParentElem.getChild(pathToArrayRef, RESOLVE_NO_LEAFS).getProperty().getId()).toEqual('array_ref');
    expect(refParentElem.getChild(pathToArrayRef, RESOLVE_NO_LEAFS).getChildToken()).toEqual(0);
    expect(refParentElem.getChild(pathToArrayRef, RESOLVE_ALWAYS).getProperty().getId()).toEqual('child');

    const pathToMapRef = ['map_ref', 'aKey'];
    expect(refParentElem.getChild(pathToMapRef, RESOLVE_NEVER).getProperty().getId()).toEqual('map_ref');
    expect(refParentElem.getChild(pathToMapRef, RESOLVE_NEVER).getChildToken()).toEqual('aKey');
    expect(refParentElem.getChild(pathToMapRef, RESOLVE_NO_LEAFS).getProperty().getId()).toEqual('map_ref');
    expect(refParentElem.getChild(pathToMapRef, RESOLVE_NO_LEAFS).getChildToken()).toEqual('aKey');
    expect(refParentElem.getChild(pathToMapRef, RESOLVE_ALWAYS).getProperty().getId()).toEqual('child');

    const pathThroughArrayRef = ['refParent', 'array_ref', 0, 'aString'];
    expect(rootElem.getChild(pathThroughArrayRef, RESOLVE_NEVER).isValid()).toEqual(false);
    expect(rootElem.getChild(pathThroughArrayRef, RESOLVE_NO_LEAFS).getProperty().getId()).toEqual('aString');
    expect(rootElem.getChild(pathThroughArrayRef, RESOLVE_ALWAYS).getProperty().getId()).toEqual('aString');

    const pathThroughMapRef = ['refParent', 'map_ref', 'aKey', 'aString'];
    expect(rootElem.getChild(pathThroughMapRef, RESOLVE_NEVER).isValid()).toEqual(false);
    expect(rootElem.getChild(pathThroughMapRef, RESOLVE_NO_LEAFS).getProperty().getId()).toEqual('aString');
    expect(rootElem.getChild(pathThroughMapRef, RESOLVE_ALWAYS).getProperty().getId()).toEqual('aString');
  });

  it('parenting', function() {
    const child = PropertyFactory.create(PrimitiveChildrenTemplate.typeid, 'single');
    const refParent = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single');

    workspace.root.insert('refParent', refParent);
    workspace.root.insert('child', child);
    workspace.root.get(['refParent', 'array_ref']).push('/child');
    workspace.root.get(['refParent', 'map_ref']).insert('aKey', '/child');
    workspace.root.get(['child', 'arrayOfNumbers']).push(42);

    const rootElem = new PropertyElement(workspace.root);
    expect(rootElem.isValid()).toEqual(true);

    // Root has no parent
    expect(rootElem.getParent().isValid()).toEqual(false);

    const refParentElem = rootElem.getChild('refParent');
    expect(refParentElem.getParent().getProperty()).toEqual(workspace.root);

    const arrayEntryElem = refParentElem.getChild(['array_ref', 0], RESOLVE_NEVER);
    expect(arrayEntryElem.getChildToken()).toEqual(0);
    expect(arrayEntryElem.getParent().getProperty()).toEqual(workspace.root.get(['refParent', 'array_ref']));
    expect(arrayEntryElem.getParent().getChildToken()).toBeUndefined();

    const mapEntryElem = refParentElem.getChild(['map_ref', 'aKey'], RESOLVE_NEVER);
    expect(mapEntryElem.getChildToken()).toEqual('aKey');
    expect(mapEntryElem.getParent().getProperty()).toEqual(workspace.root.get(['refParent', 'map_ref']));
    expect(mapEntryElem.getParent().getChildToken()).toBeUndefined();

    const childElem = rootElem.getChild('child');
    const numberElem = childElem.getChild(['arrayOfNumbers', 0]);
    expect(numberElem.getChildToken()).toEqual(0);
    expect(numberElem.getValue()).toEqual(42);

    const parentElem = numberElem.getParent();
    expect(parentElem.getProperty().getId()).toEqual('arrayOfNumbers');
  });

  it('getValue', function() {
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

    workspace.root.insert('thedata', myData);

    const propElem = new PropertyElement(workspace.root);

    const test = (data, child) => {
      propElem.becomeChild(child);
      // console.log('checking', propElem.toString(),':');
      const computed = propElem.getValue();
      const expected = data[child];
      // console.log(computed, ' expecting ', expected);
      expect(computed).toEqual(expected);
      if (propElem.getTypeId() !== 'String') {
        _.each(data[child], (value, key) => {
          test(data[child], key);
        });
      }
      propElem.becomeParent();
    };

    test(allData, 'thedata');
  });

  it('setValue', function() {
    const myData = PropertyFactory.create(PrimitiveChildrenTemplate.typeid, 'single');
    const propElem = new PropertyElement(myData);
    propElem.getChild('arrayOfNumbers').setValue([1, 2, 3]);
    propElem.getChild(['arrayOfNumbers', 1]).setValue(42);
    expect(propElem.getChild('arrayOfNumbers').getValue()).toEqual([1, 42, 3]);

    propElem.getChild('arrayOfStrings').setValue(['a', 'b', 'c']);
    propElem.getChild(['arrayOfStrings', 1]).setValue('INTERRUPTING COW');
    expect(propElem.getChild('arrayOfStrings').getValue()).toEqual(['a', 'INTERRUPTING COW', 'c']);

    propElem.getChild('mapOfNumbers').setValue({ a: 1, b: 2, c: 3 });
    propElem.getChild(['mapOfNumbers', 'b']).setValue(42);
    expect(propElem.getChild('mapOfNumbers').getValue()).toEqual({ a: 1, b: 42, c: 3 });

    propElem.getChild('mapOfStrings').setValue({ a: 'A', b: 'B', c: 'C' });
    propElem.getChild(['mapOfStrings', 'b']).setValue('INTERRUPTING... not funny second time');
    expect(propElem.getChild('mapOfStrings').getValue()).toEqual(
      { a: 'A', b: 'INTERRUPTING... not funny second time', c: 'C' }
    );

    propElem.getChild('nested').setValue({ aNumber: 12 });
    expect(propElem.getChild('nested').getValue()).toEqual({ aNumber: 12 });

    expect(myData.getValues()).toEqual(propElem.getValue());
  });

  it('isPrimitiveCollection basic', function() {
    const myData = PropertyFactory.create(PrimitiveChildrenTemplate.typeid, 'single');
    const propElem = new PropertyElement(myData);

    expect(propElem.isPrimitiveCollection()).toEqual(false);
    expect(propElem.getChild('nested').isPrimitiveCollection()).toEqual(false);
    expect(propElem.getChild('arrayOfStrings').isPrimitiveCollection()).toEqual(true);
    expect(propElem.getChild('mapOfNumbers').isPrimitiveCollection()).toEqual(true);
    expect(propElem.getChild('mapOfStrings').isPrimitiveCollection()).toEqual(true);
    expect(propElem.getChild('aString').isPrimitiveCollection()).toEqual(false);
    expect(propElem.getChild('aNumber').isPrimitiveCollection()).toEqual(false);
  });

  it('isPrimitiveCollection array of prop', function() {
    const myArrayData = PropertyFactory.create(ArrayContainerTemplate.typeid, 'single');
    const propElem = new PropertyElement(myArrayData);
    expect(propElem.isPrimitiveCollection()).toEqual(false);
    expect(propElem.getChild('subArray').isPrimitiveCollection()).toEqual(false);
    expect(propElem.getChild('unrepresentedSubArray').isPrimitiveCollection()).toEqual(false);
  });

  it('isPrimitiveCollection set of prop', function() {
    const mySetData = PropertyFactory.create(SetContainerTemplate.typeid, 'single');
    const propElem = new PropertyElement(mySetData);
    expect(propElem.isPrimitiveCollection()).toEqual(false);
    expect(propElem.getChild('subSet').isPrimitiveCollection()).toEqual(false);
    expect(propElem.getChild('unrepresentedSubSet').isPrimitiveCollection()).toEqual(false);
  });

  it('isPrimitiveCollection map of prop', function() {
    const myMapData = PropertyFactory.create(MapContainerTemplate.typeid, 'single');
    const propElem = new PropertyElement(myMapData);
    expect(propElem.isPrimitiveCollection()).toEqual(false);
    expect(propElem.getChild('subMap').isPrimitiveCollection()).toEqual(false);
    expect(propElem.getChild('unrepresentedSubMap').isPrimitiveCollection()).toEqual(false);
  });

  it('crazy paths for child token', function() {
    const mymap = PropertyFactory.create('Float64', 'map');
    workspace.root.insert('themap', mymap);

    mymap.insert('"my.child.path"', 42);
    const propElem = new PropertyElement(mymap);
    // Now becomeChild expect a quoted/escaped paths instead of ids.
    propElem.becomeChild('""my.child.path""');
    expect(propElem.isValid()).toEqual(true);

    expect(propElem.getValue()).toEqual(42);

    expect(propElem.getAbsolutePath()).toEqual('/themap["my.child.path"]');
  });

  it('array of properties parenting', function() {
    const array = PropertyFactory.create(ArrayContainerTemplate.typeid, 'single');
    const child0 = PropertyFactory.create(ChildTemplate.typeid, 'single');
    const child1 = PropertyFactory.create(ChildTemplate.typeid, 'single');
    child0.get('text').setValue('child0 text');
    child1.get('text').setValue('child1 text');
    array.get('subArray').push(child0);
    array.get('subArray').push(child1);
    workspace.root.insert('theArray', array);

    const rootElem = new PropertyElement(workspace.root);
    const childElem = rootElem.getChild(['theArray', 'subArray', 1, 'text']);
    expect(childElem.getValue()).toEqual('child1 text');

    expect(childElem.getParent().getParent().getProperty().getId()).toEqual('subArray');
    expect(childElem.getParent().getParent().getChildToken()).toBeUndefined();
  });

  it('map of properties parenting', function() {
    const map = PropertyFactory.create(MapContainerTemplate.typeid, 'single');
    const child0 = PropertyFactory.create(ChildTemplate.typeid, 'single');
    const child1 = PropertyFactory.create(ChildTemplate.typeid, 'single');
    child0.get('text').setValue('child0 text');
    child1.get('text').setValue('child1 text');
    map.get('subMap').insert('child0', child0);
    map.get('subMap').insert('child1', child1);
    workspace.root.insert('theMap', map);

    const rootElem = new PropertyElement(workspace.root);
    const childElem = rootElem.getChild(['theMap', 'subMap', 'child1', 'text']);
    expect(childElem.getValue()).toEqual('child1 text');

    expect(childElem.getParent().getProperty().getId()).toEqual('child1');
    expect(childElem.getParent().getChildToken()).toBeUndefined();

    expect(childElem.getParent().getParent().getProperty().getId()).toEqual('subMap');
    expect(childElem.getParent().getParent().getChildToken()).toBeUndefined();
  });

  it('double references', function() {
    const text = PropertyFactory.create('String', 'single');
    const ref1 = PropertyFactory.create('Reference', 'single');
    const ref2 = PropertyFactory.create('Reference', 'single');
    const ref3 = PropertyFactory.create('Reference', 'single');
    workspace.root.insert('text', text);
    workspace.root.insert('ref1', ref1);
    workspace.root.insert('ref2', ref2);
    workspace.root.insert('ref3', ref3);
    ref3.setValue('/ref2');
    ref2.setValue('/ref1');
    ref1.setValue('/text');
    text.setValue('theText');

    const rootElem = new PropertyElement(workspace.root);
    expect(rootElem.getChild('ref3', RESOLVE_ALWAYS).getValue()).toEqual('theText');
    expect(rootElem.getChild('ref3', RESOLVE_NEVER).getValue()).toEqual('/ref2');
  });

  it('double references array', function() {
    const text = PropertyFactory.create('String', 'single');
    const refs = PropertyFactory.create('Reference', 'array');
    workspace.root.insert('text', text);
    workspace.root.insert('refs', refs);
    refs.push('/text');
    refs.push('/refs[0]');
    refs.push('/refs[1]');
    text.setValue('theText');

    const rootElem = new PropertyElement(workspace.root);
    expect(rootElem.getChild(['refs', 2], RESOLVE_ALWAYS).getValue()).toEqual('theText');
    expect(rootElem.getChild(['refs', 2], RESOLVE_NO_LEAFS).getValue()).toEqual('/refs[1]');
    expect(rootElem.getChild(['refs', 2], RESOLVE_NEVER).getValue()).toEqual('/refs[1]');
  });

  it('tokenized path, toString, getContext', function() {
    const arrayData = PropertyFactory.create('String', 'array');
    workspace.root.insert('theArray', arrayData);
    arrayData.push('hi');

    const rootElem = new PropertyElement(workspace.root);
    expect(rootElem.getTokenizedPath().length).toEqual(0);
    expect(rootElem.getContext()).toEqual('single');
    rootElem.becomeChild('theArray');
    expect(rootElem.getContext()).toEqual('array');
    expect(rootElem.getTokenizedPath().length).toEqual(1);
    expect(rootElem.getTokenizedPath()[0]).toEqual('theArray');
    expect(rootElem.toString()).toEqual('</theArray>');

    rootElem.becomeChild(0);
    expect(rootElem.getContext()).toEqual('single');
    expect(rootElem.getTokenizedPath().length).toEqual(2);
    expect(rootElem.getTokenizedPath()[0]).toEqual('theArray');
    expect(rootElem.getTokenizedPath()[1]).toEqual('0');
    expect(rootElem.toString()).toEqual('</theArray[0]>');

    expect((new PropertyElement()).toString()).toEqual('<invalid>');
  });

  it('becoming the parent', function() {
    const arrayData = PropertyFactory.create('String', 'array');
    workspace.root.insert('theArray', arrayData);
    arrayData.push('hi');

    const rootElem = new PropertyElement(workspace.root);
    rootElem.becomeChild('theArray');
    expect(rootElem.getProperty()).toEqual(workspace.root.get('theArray'));
    rootElem.becomeChild(0);
    expect(rootElem.getProperty()).toEqual(workspace.root.get('theArray'));
    expect(rootElem.getChildToken()).toEqual(0);
    rootElem.becomeParent();
    expect(rootElem.getProperty()).toEqual(workspace.root.get('theArray'));
    expect(rootElem.getChildToken()).toBeUndefined();
    rootElem.becomeParent();
    expect(rootElem.getProperty()).toEqual(workspace.root);
    expect(rootElem.getChildToken()).toBeUndefined();
    rootElem.becomeParent();
    expect(rootElem.isValid()).toEqual(false);
  });

  it('isPrimitiveCollection', function() {
    const types = ['String', 'Float32', 'Reference'];
    const contexts = ['single', 'array', 'map'];
    types.forEach((theType) => {
      contexts.forEach((context) => {
        const prop = PropertyFactory.create(theType, context);
        expect((new PropertyElement(prop)).isPrimitiveCollection()).toEqual(context !== 'single');
      });
    });

    const nodeArray = PropertyFactory.create('NodeProperty', 'array');
    const propElem = new PropertyElement(nodeArray);
    expect(propElem.isPrimitiveCollection()).toEqual(false);

    const array = PropertyFactory.create('Float32', 'array');
    array.push(42);
    const element = new PropertyElement(array);
    expect(element.isPrimitiveCollection()).toEqual(true);
    element.becomeChild(0);
    expect(element.isPrimitiveCollection()).toEqual(false);
  });

  it('cloning', function() {
    const arrayData = PropertyFactory.create('String', 'array');
    workspace.root.insert('theArray', arrayData);
    arrayData.push('hi');

    const rootElem = new PropertyElement(workspace.root);
    rootElem.becomeChild('theArray');
    rootElem.becomeChild(0);
    const clone = rootElem.clone();
    expect(clone.getProperty()).toEqual(rootElem.getProperty());
    expect(clone.getChildToken()).toEqual(rootElem.getChildToken());
  });

  it('a reference with *', function() {
    const myData = PropertyFactory.create('Float64');
    const myReference1 = PropertyFactory.create('Reference');
    const myReference2 = PropertyFactory.create('Reference');

    workspace.root.insert('myData', myData);
    workspace.root.insert('myReference1', myReference1);
    workspace.root.insert('myReference2', myReference2);

    myData.setValue(42);
    myReference1.setValue('/myData');
    myReference2.setValue('/myReference1*'); // Note the star!

    const propElem = new PropertyElement(workspace.root);
    propElem.becomeChild('myReference2');

    // The value of the reference has a *: we are referring to the reference property and not the
    // _referenced_ property.
    expect(propElem.getValue()).toEqual('/myData');
  });

  it('a reference with * in the middle', function() {
    const myData = PropertyFactory.create('Float64', 'array');
    const myReference1 = PropertyFactory.create('Reference');
    const myReference2 = PropertyFactory.create('Reference');

    myData.push(0);
    myData.push(1);
    myData.push(2);

    workspace.root.insert('myData', myData);
    workspace.root.insert('myReference1', myReference1);
    workspace.root.insert('myReference2', myReference2);

    myReference1.setValue('/myData');
    myReference2.setValue('/myReference1*.[1]');

    const propElem = new PropertyElement(workspace.root);
    propElem.becomeChild('myReference2');

    // Because we didn't dereference myReference1, [1] fails
    expect(propElem.isValid()).toEqual(false);
  });

  it('a reference without *', function() {
    const myData = PropertyFactory.create('Float64');
    const myReference1 = PropertyFactory.create('Reference');
    const myReference2 = PropertyFactory.create('Reference');

    workspace.root.insert('myData', myData);
    workspace.root.insert('myReference1', myReference1);
    workspace.root.insert('myReference2', myReference2);

    myData.setValue(42);
    myReference1.setValue('/myData');
    myReference2.setValue('/myReference1');

    const propElem = new PropertyElement(workspace.root);
    propElem.becomeChild('myReference2');

    expect(propElem.getValue()).toEqual(42);
  });

  it('dereferencing chain', function() {
    const myData = PropertyFactory.create(ChildTemplate.typeid);
    workspace.root.insert('myData', myData);

    // Set up a chain; ref3 points to ref2 points to ref1 points to myData
    const myReferences = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single', {
      ref1: '/myData',
      ref2: 'ref1',
      ref3: 'ref2'
    });
    workspace.root.insert('myReferences', myReferences);
    const propElem = new PropertyElement(myReferences.get('ref3', RESOLVE_NEVER));
    expect(propElem.isValid()).toEqual(true);
    propElem.becomeDereference();
    expect(propElem.getProperty()).toEqual(myData);
  });

  it('dereferencing chain, primitive array', function() {
    const myData = PropertyFactory.create(ChildTemplate.typeid);
    workspace.root.insert('myData', myData);

    // Set up a chain; array_ref[2] points to array_ref[1] points to array_ref[0] points to myData
    const myReferences = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single', {
      array_ref: ['/myData', 'array_ref[0]', 'array_ref[1]']
    });
    workspace.root.insert('myReferences', myReferences);
    const propElem = new PropertyElement(myReferences.get('array_ref'), 2);
    expect(propElem.isValid()).toEqual(true);
    propElem.becomeDereference();
    expect(propElem.getProperty()).toEqual(myData);
  });

  it('dereferencing chain, primitive array, with a *', function() {
    const myData = PropertyFactory.create(ChildTemplate.typeid);
    workspace.root.insert('myData', myData);

    // Set up a chain; array_ref[2] points to array_ref[1] points to array_ref[0] but with a * so the
    // reference, not the target
    const myReferences = PropertyFactory.create(ReferenceParentTemplate.typeid, 'single', {
      array_ref: ['/myData', 'array_ref[0].*', 'array_ref[1]'] // Note the star!
    });
    workspace.root.insert('myReferences', myReferences);
    const propElem = new PropertyElement(myReferences.get('array_ref'), 2);
    expect(propElem.isValid()).toEqual(true);
    propElem.becomeDereference();
    expect(propElem.getProperty()).toEqual(myReferences.get('array_ref'));
    expect(propElem.getChildToken()).toEqual(0);
  });

  it('a reference array element with *', function() {
    const myData = PropertyFactory.create('Float64');
    const myReference1 = PropertyFactory.create('Reference', 'array');
    const myReference2 = PropertyFactory.create('Reference');

    workspace.root.insert('myData', myData);
    workspace.root.insert('myReference1', myReference1);
    workspace.root.insert('myReference2', myReference2);

    myData.setValue(42);
    myReference1.push('/myData');
    myReference2.setValue('/myReference1[0].*'); // Note the star!

    const propElem = new PropertyElement(workspace.root);
    propElem.becomeChild('myReference2');

    // The value of the reference has a *: we are referring to the reference property and not the
    // _referenced_ property.
    expect(propElem.getValue()).toEqual('/myData');
  });

  it('a reference array element without *', function() {
    const myData = PropertyFactory.create('Float64');
    const myReference1 = PropertyFactory.create('Reference', 'array');
    const myReference2 = PropertyFactory.create('Reference');

    workspace.root.insert('myData', myData);
    workspace.root.insert('myReference1', myReference1);
    workspace.root.insert('myReference2', myReference2);

    myData.setValue(42);
    myReference1.push('/myData');
    myReference2.setValue('/myReference1[0]');

    const propElem = new PropertyElement(workspace.root);
    propElem.becomeChild('myReference2');

    expect(propElem.getValue()).toEqual(42);
  });

  it('a reference map element with *', function() {
    const myData = PropertyFactory.create('Float64');
    const myReference1 = PropertyFactory.create('Reference', 'map');
    const myReference2 = PropertyFactory.create('Reference');

    workspace.root.insert('myData', myData);
    workspace.root.insert('myReference1', myReference1);
    workspace.root.insert('myReference2', myReference2);

    myData.setValue(42);
    myReference1.set('toto', '/myData');
    myReference2.setValue('/myReference1[toto].*'); // Note the star!

    const propElem = new PropertyElement(workspace.root);
    propElem.becomeChild('myReference2');

    // The value of the reference has a *: we are referring to the reference property and not the
    // _referenced_ property.
    expect(propElem.getValue()).toEqual('/myData');
  });

  it('a reference map element without *', function() {
    const myData = PropertyFactory.create('Float64');
    const myReference1 = PropertyFactory.create('Reference', 'map');
    const myReference2 = PropertyFactory.create('Reference');

    workspace.root.insert('myData', myData);
    workspace.root.insert('myReference1', myReference1);
    workspace.root.insert('myReference2', myReference2);

    myData.setValue(42);
    myReference1.set('toto', '/myData');
    myReference2.setValue('/myReference1[toto]');

    const propElem = new PropertyElement(workspace.root);
    propElem.becomeChild('myReference2');

    expect(propElem.getValue()).toEqual(42);
  });

  it('reference RESOLVE_NEVER/NO_LEAFS', function() {
    const myData = PropertyFactory.create(PrimitiveChildrenTemplate.typeid);
    const myReference1 = PropertyFactory.create('Reference', 'map');
    const myReference2 = PropertyFactory.create('Reference');

    myData.get('aNumber').setValue(42);
    workspace.root.insert('myData', myData);
    workspace.root.insert('myReference1', myReference1);
    workspace.root.insert('myReference2', myReference2);

    myReference1.set('toto', '/myData');
    myReference2.setValue('/myReference1[toto]');

    const propElem = new PropertyElement(workspace.root);
    expect(propElem.getChild('myReference2', RESOLVE_NEVER).getProperty()).toEqual(myReference2);
    expect(propElem.getChild(['myReference2', 'aNumber'], RESOLVE_NEVER).isValid()).toEqual(false);

    expect(propElem.getChild('myReference2', RESOLVE_ALWAYS).getProperty()).toEqual(myData);
    expect(propElem.getChild(['myReference2', 'aNumber'], RESOLVE_ALWAYS).getValue()).toEqual(42);

    expect(propElem.getChild('myReference2', RESOLVE_NO_LEAFS).getProperty()).toEqual(myReference2);
    expect(propElem.getChild(['myReference2', 'aNumber'], RESOLVE_NO_LEAFS).getValue()).toEqual(42);
  });

  it('getChild with special characters in tokenized path', function() {
    const myData = PropertyFactory.create(PrimitiveChildrenTemplate.typeid);
    workspace.root.insert('"/"', myData);

    const propElem = new PropertyElement(workspace.root);
    expect(propElem.getChild(['"/"', 'aString']).isValid()).toEqual(true);
    expect(propElem.getChild(['"/"', 'aString', '/']).isValid()).toEqual(false);
  });

});
