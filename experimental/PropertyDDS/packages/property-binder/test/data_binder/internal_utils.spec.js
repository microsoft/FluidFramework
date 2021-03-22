/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
import { BaseProperty, PropertyFactory } from '@fluid-experimental/property-properties';
/* globals expect, sinon  */
import { forEachProperty, minimalRootPaths, visitTypeHierarchy } from '../../src/data_binder/internal_utils';
import { catchConsoleErrors } from './catch_console_errors';
import { PrimitiveChildrenTemplate, AnimalSchema } from './testTemplates';

describe('minimalRootPaths', () => {
  it('should return the same array for exclusive paths', () => {
    const paths = ['/this.is', '/an.exclusive', '/test'];
    const returnedPaths = minimalRootPaths(paths);
    expect(paths.length).to.equal(returnedPaths.length);
    expect(paths.sort()).to.eql(returnedPaths.sort());
  });

  it('should only keep one from identical paths', () => {
    const paths = ['/this.is', '/this.is', '/repeated'];
    const returnedPaths = minimalRootPaths(paths);
    expect(returnedPaths.length).to.equal(2);
    expect(paths.sort()[0]).to.equal(returnedPaths.sort()[0]);
    expect(paths.sort()[2]).to.equal(returnedPaths.sort()[1]);
  });

  it('should remove sub path', () => {
    const paths = ['/this.is', '/this.is.a.subpath'];
    const returnedPaths = minimalRootPaths(paths);
    expect(returnedPaths.length).to.equal(1);
    expect(returnedPaths[0]).to.equal(paths[0]);
  });

  it('should take into account . character when considering a sub path', () => {
    const paths = ['/this.is', '/this.is.a.subpath', '/this.isnotasubpath'];
    const returnedPaths = minimalRootPaths(paths);
    expect(returnedPaths.length).to.equal(2);
    expect(returnedPaths.sort()).to.eql([paths[0], paths[2]].sort());
  });

  it('should consider special characters for arrays/maps', () => {
    const paths = ['/this.is', '/this.is[0]', '/this.isnotasubpath'];
    const returnedPaths = minimalRootPaths(paths);
    expect(returnedPaths.length).to.equal(2);
    expect(returnedPaths.sort()).to.eql([paths[0], paths[2]].sort());
  });

  it('should consider the root as the minimum path', () => {
    const paths = ['/', '/this.is', '/this.is[0]', '/this.isnotasubpath'];
    const returnedPaths = minimalRootPaths(paths);
    expect(returnedPaths.length).to.equal(1);
    expect(returnedPaths[0]).to.equal(paths[0]);
  });
});

describe('forEachProperty', () => {

  // Silence the actual console.error, so the test logs are clean
  console.error = function () {
  };

  catchConsoleErrors();

  it('should always pass a Property, case 1 (enums)', function () {
    const initialValues = {
      aString: 'some string',
      aNumber: 1,
      aBoolean: true,
      anEnum: 1,
      arrayOfNumbers: [1, 2, 3],
      mapOfNumbers: {
        one: 10,
        two: 2
      },
      nested: {
        aNumber: 1
      }
    };
    const primitiveChildrenPset = PropertyFactory.create(PrimitiveChildrenTemplate.typeid,
      'single',
      initialValues);
    forEachProperty(primitiveChildrenPset, in_property => {
      expect(in_property).to.be.instanceOf(BaseProperty);
      return true;
    });
  });

  it('should always pass a Property, case 2 (EnumArray)', function () {
    const enumUnoDosTresSchema = {
      inherits: 'Enum',
      properties: [
        { id: 'uno', value: 1 },
        { id: 'dos', value: 2 },
        { id: 'tres', value: 3 }
      ],
      typeid: 'autodesk.enum:unoDosTres-1.0.0'
    };
    PropertyFactory.register(enumUnoDosTresSchema);
    const root = PropertyFactory.create('NodeProperty', 'single');
    const enumSingle = PropertyFactory.create(enumUnoDosTresSchema.typeid, 'single');
    enumSingle.setValue(1);
    const enumArray = PropertyFactory.create(enumUnoDosTresSchema.typeid, 'array');
    enumArray.push(1);
    enumArray.push(2);
    root.insert('enumSingle', enumSingle);
    root.insert('enumArray', enumArray);
    forEachProperty(root, in_property => {
      expect(in_property).to.be.instanceOf(BaseProperty);
      return true;
    });
  });

  it('should always pass a Property, case 3 (inlined enums/EnumArrays)', function () {
    const enumCasesSchema = {
      properties: [
        {
          id: 'enum',
          typeid: 'autodesk.enum:unoDosTres-1.0.0',
          value: 2
        },
        {
          context: 'map',
          id: 'enumMap',
          typeid: 'autodesk.enum:unoDosTres-1.0.0',
          value: {
            a: 1,
            b: 2,
            c: 3
          }
        },
        {
          context: 'array',
          id: 'enumArray',
          typeid: 'autodesk.enum:unoDosTres-1.0.0',
          value: [
            1, 2, 3
          ]
        },
        {
          id: 'inlineEnum',
          properties: [
            { id: 'eins', value: 1 },
            { id: 'zwei', value: 2 },
            { id: 'drei', value: 3 }
          ],
          typeid: 'Enum'
        },
        {
          context: 'array',
          id: 'enumInlineArray',
          properties: [
            { id: 'un', value: 1 },
            { id: 'deux', value: 2 },
            { id: 'trois', value: 3 }
          ],
          typeid: 'Enum',
          value: [
            1, 2, 3
          ]
        }
      ],
      typeid: 'autodesk.enum:enums-1.0.0'
    };
    PropertyFactory.register(enumCasesSchema);
    const root = PropertyFactory.create('NodeProperty', 'single');
    const enums = PropertyFactory.create(enumCasesSchema.typeid, 'single');
    // enums should already be populated, so no need to insert values into its various maps/arrays
    root.insert('enums', enums);
    let propertyCounter = 0;
    forEachProperty(root, in_property => {
      expect(in_property).to.be.instanceOf(BaseProperty);
      propertyCounter++;
      return true;
    });
    propertyCounter.should.equal(10); // root + enums + 8 properties inside 'enums' (5 + 3 extra for the map entries)
  });

  it('should always pass a Property, case 4 (ReferenceArray/Map)', function () {
    const root = PropertyFactory.create('NodeProperty', 'single');
    const refArray = PropertyFactory.create('Reference', 'array');
    refArray.push('/foo');
    refArray.push('/bar');
    const refMap = PropertyFactory.create('Reference', 'map');
    refMap.set('fooref', '/foo');
    refMap.set('barref', '/bar');
    root.insert('refArray', refArray);
    root.insert('refMap', refMap);
    forEachProperty(root, in_property => {
      expect(in_property).to.be.instanceOf(BaseProperty);
      return true;
    });
  });

  it('should work with invalid/cyclic references', function () {
    const root = PropertyFactory.create('NodeProperty', 'single');
    const invalidRef = PropertyFactory.create('Reference', 'single');
    const cyclicRef = PropertyFactory.create('Reference', 'single');
    invalidRef.setValue('/foo');
    cyclicRef.setValue('/cyclicRef');
    root.insert('invalidRef', invalidRef);
    root.insert('cyclicRef', cyclicRef);
    forEachProperty(root, in_property => {
      expect(in_property).to.be.instanceOf(BaseProperty);
      return true;
    });
  });
});

describe('visitTypeHierarchy', () => {
  let workspace;
  const callbackSpy = sinon.spy();
  before(async () => {
    const hfdm = new HFDM();
    workspace = hfdm.createWorkspace();
    await workspace.initialize({ local: true });
  });

  beforeEach(() => {
    callbackSpy.resetHistory();
  });

  it('should get schemas', () => {
    PropertyFactory.register(PrimitiveChildrenTemplate);
    workspace.insert('dummy', PropertyFactory.create(PrimitiveChildrenTemplate.typeid));
    visitTypeHierarchy(
      PrimitiveChildrenTemplate.typeid,
      typeid => { callbackSpy(typeid); return true; },
      workspace
    );

    expect(callbackSpy.calledWith(PrimitiveChildrenTemplate.typeid)).to.equal(true);
    expect(callbackSpy.calledWith('NamedProperty')).to.equal(true);
    expect(callbackSpy.calledWith('BaseProperty')).to.equal(true);
    expect(callbackSpy.callCount).to.equal(3);

    // without workspace
    callbackSpy.resetHistory();
    visitTypeHierarchy(
      PrimitiveChildrenTemplate.typeid,
      typeid => { callbackSpy(typeid); return true; }
    );

    expect(callbackSpy.calledWith(PrimitiveChildrenTemplate.typeid)).to.equal(true);
    expect(callbackSpy.calledWith('NamedProperty')).to.equal(true);
    expect(callbackSpy.calledWith('BaseProperty')).to.equal(true);
    expect(callbackSpy.callCount).to.equal(3);
  });

  it('should traverse inheritance tree when providing strings as inheritance', () => {
    const SlothSchema = {
      inherits: 'Test:Animal-1.0.0',
      typeid: 'Test:Sloth-1.0.0',
      properties: [{ id: 'willToLive', typeid: 'Float32' }]
    };
    PropertyFactory.register(AnimalSchema);
    PropertyFactory.register(SlothSchema);
    workspace.insert('sloth', PropertyFactory.create(SlothSchema.typeid));
    visitTypeHierarchy(
      SlothSchema.typeid,
      typeid => { callbackSpy(typeid); return true; },
      workspace
    );
    expect(callbackSpy.calledWith(SlothSchema.typeid)).to.equal(true);
    expect(callbackSpy.calledWith(AnimalSchema.typeid)).to.equal(true);
    expect(callbackSpy.calledWith('BaseProperty')).to.equal(true);
    expect(callbackSpy.callCount).to.equal(3);
  });
  it('should traverse inheritance tree when providing an array as inheritance', () => {
    const RedPandaSchema = {
      typeid: 'Test:RedPanda-1.0.0',
      inherits: ['Test:Animal-1.0.0'],
      properties: [{ id: 'cuteness', typeid: 'Float32' }]
    };
    PropertyFactory.register(AnimalSchema);
    PropertyFactory.register(RedPandaSchema);
    visitTypeHierarchy(
      RedPandaSchema.typeid,
      typeid => { callbackSpy(typeid); return true; },
      workspace
    );

    expect(callbackSpy.calledWith(RedPandaSchema.typeid)).to.equal(true);
    expect(callbackSpy.calledWith(AnimalSchema.typeid)).to.equal(true);
    expect(callbackSpy.calledWith('BaseProperty')).to.equal(true);
    expect(callbackSpy.callCount).to.equal(3);
  });
});
