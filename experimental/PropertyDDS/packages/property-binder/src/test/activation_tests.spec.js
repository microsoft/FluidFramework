/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* globals expect */
import { DataBinder } from '../data_binder/dataBinder';

import { catchConsoleErrors } from './catchConsoleError';

import { DataBinding } from '../data_binder/dataBinding';
import { PropertyFactory } from '@fluid-experimental/property-properties';
import { ActivationQueryCacheHelper } from '../internal/activationQueryCacheHelper';
import { MockSharedPropertyTree } from './mockSharedPropertyTree'

/**
 * Dummy class to instantiate
 */
class DummyDataBinding extends DataBinding {
}

const setupScenario = (typeid, dataBinder) => {
  const definitionHandle = dataBinder.defineDataBinding('MODEL', typeid, DummyDataBinding);
  const activationHandle = dataBinder.activateDataBinding('MODEL', typeid);

  const activation = activationHandle.getUserData();
  return {
    helper: new ActivationQueryCacheHelper([activation], dataBinder),
    activationHandle: activationHandle,
    definitionHandle: definitionHandle
  };
};

const tearDownScenario = (scenario) => {
  scenario.activationHandle.destroy();
  scenario.definitionHandle.destroy();
};

describe('DataBinder ActivationQueryCacheHelper', function() {

  let dataBinder;
  let workspace;

  // Silence the actual console.error, so the test logs are clean
  console.error = function() {
  };

  catchConsoleErrors();

  beforeAll(function() {
  });

  beforeEach(async function() {
    dataBinder = new DataBinder();
    workspace = await MockSharedPropertyTree();
    dataBinder.attachTo(workspace);
  });

  afterEach(function() {
    // Unbind checkout view
    dataBinder.detach();
    dataBinder = null;
  });

  describe('inheritance cases, scenario 1', function() {
    beforeAll(function() {
      PropertyFactory.register({
        typeid: 'test1:cube-1.0.0',
        properties: [
        ]
      });
      PropertyFactory.register({
        typeid: 'test1:prism-1.0.0',
        properties: [
        ]
      });
      PropertyFactory.register({
        typeid: 'test1:sphere-1.0.0',
        properties: [
        ]
      });
      PropertyFactory.register({
        typeid: 'test1:cylinder-1.0.0',
        properties: [
        ]
      });
      PropertyFactory.register({
        typeid: 'test1:thing-1.0.0',
        properties: [
          { id: 'cubeOfThing', typeid: 'test1:cube-1.0.0' },
          {
            id: 'nested',
            properties: [
              { id: 'nestedPrism', typeid: 'test1:prism-1.0.0' }
            ]
          }
        ]
      });
      PropertyFactory.register({
        typeid: 'test1:inheritsThing-1.0.0',
        inherits: 'test1:thing-1.0.0',
        properties: [
          { id: 'childOfInheritsThing', typeid: 'test1:sphere-1.0.0' },
          {
            id: 'nested',
            properties: [
              { id: 'nestedCylinder', typeid: 'test1:cylinder-1.0.0' }
            ]
          }

        ]
      });
    });

    it('root matches', function() {
      const scenario = setupScenario('test1:thing-1.0.0', dataBinder);

      // test1:thing-1.0.0 can be found in test1:thing-1.0.0
      expect(scenario.helper.hierarchyMayHaveBindings('test1:thing-1.0.0')).toEqual(true);
      // test1:thing-1.0.0 can be found in test1:inheritsThing-1.0.0
      expect(scenario.helper.hierarchyMayHaveBindings('test1:inheritsThing-1.0.0')).toEqual(true);
      // test1:thing-1.0.0 cannot be found in a child subhierarchy of test1:thing-1.0.0
      expect(scenario.helper.childrenMayHaveBindings('test1:thing-1.0.0')).toEqual(false);
      // test1:thing-1.0.0 cannot be found in a child subhierarchy of test1:inheritsThing-1.0.0
      expect(scenario.helper.childrenMayHaveBindings('test1:inheritsThing-1.0.0')).toEqual(false);

      tearDownScenario(scenario);
    });

    it('leaf matches', function() {
      const scenario = setupScenario('test1:cube-1.0.0', dataBinder);

      // test1:cube-1.0.0 can be found in test1:thing-1.0.0
      expect(scenario.helper.hierarchyMayHaveBindings('test1:thing-1.0.0')).toEqual(true);
      // test1:cube-1.0.0 can be found in test1:inheritsThing-1.0.0
      expect(scenario.helper.hierarchyMayHaveBindings('test1:inheritsThing-1.0.0')).toEqual(true);
      // test1:cube-1.0.0 can be found in a child subhierarchy of test1:thing-1.0.0
      expect(scenario.helper.childrenMayHaveBindings('test1:thing-1.0.0')).toEqual(true);
      // test1:cube-1.0.0 can be found in a child subhierarchy of test1:inheritsThing-1.0.0
      expect(scenario.helper.childrenMayHaveBindings('test1:inheritsThing-1.0.0')).toEqual(true);

      tearDownScenario(scenario);
    });

    it('deeper leaf matches', function() {
      const scenario = setupScenario('test1:prism-1.0.0', dataBinder);

      // test1:prism-1.0.0 can be found in test1:thing-1.0.0
      expect(scenario.helper.hierarchyMayHaveBindings('test1:thing-1.0.0')).toEqual(true);
      // test1:prism-1.0.0 can be found in test1:inheritsThing-1.0.0
      expect(scenario.helper.hierarchyMayHaveBindings('test1:inheritsThing-1.0.0')).toEqual(true);
      // test1:prism-1.0.0 can be found in a child subhierarchy of test1:thing-1.0.0
      expect(scenario.helper.childrenMayHaveBindings('test1:thing-1.0.0')).toEqual(true);
      // test1:prism-1.0.0 can be found in a child subhierarchy of test1:inheritsThing-1.0.0
      expect(scenario.helper.childrenMayHaveBindings('test1:inheritsThing-1.0.0')).toEqual(true);

      tearDownScenario(scenario);
    });

    it('leaf doesnt always match, inheriting class', function() {
      const scenario = setupScenario('test1:cylinder-1.0.0', dataBinder);

      // test1:cylinder-1.0.0 cannot be found in test1:thing-1.0.0
      expect(scenario.helper.hierarchyMayHaveBindings('test1:thing-1.0.0')).toEqual(false);
      // test1:cylinder-1.0.0 can be found in test1:inheritsThing-1.0.0
      expect(scenario.helper.hierarchyMayHaveBindings('test1:inheritsThing-1.0.0')).toEqual(true);
      // test1:cylinder-1.0.0 cannot be found in a child subhierarchy of test1:thing-1.0.0
      expect(scenario.helper.childrenMayHaveBindings('test1:thing-1.0.0')).toEqual(false);
      // test1:cylinder-1.0.0 can be found in a child subhierarchy of test1:inheritsThing-1.0.0
      expect(scenario.helper.childrenMayHaveBindings('test1:inheritsThing-1.0.0')).toEqual(true);

      tearDownScenario(scenario);
    });

    it('leaf doesnt always match, base class', function() {
      const scenario = setupScenario('test1:sphere-1.0.0', dataBinder);

      // test1:sphere-1.0.0 cannot be found in test1:thing-1.0.0
      expect(scenario.helper.hierarchyMayHaveBindings('test1:thing-1.0.0')).toEqual(false);
      // test1:sphere-1.0.0 can be found in test1:inheritsThing-1.0.0
      expect(scenario.helper.hierarchyMayHaveBindings('test1:inheritsThing-1.0.0')).toEqual(true);
      // test1:sphere-1.0.0 cannot be found in a child subhierarchy of test1:thing-1.0.0
      expect(scenario.helper.childrenMayHaveBindings('test1:thing-1.0.0')).toEqual(false);
      // test1:sphere-1.0.0 can be found in a child subhierarchy of test1:inheritsThing-1.0.0
      expect(scenario.helper.childrenMayHaveBindings('test1:inheritsThing-1.0.0')).toEqual(true);

      tearDownScenario(scenario);
    });
  });

  describe('Nodeproperty cases', function() {
    beforeAll(function() {
      PropertyFactory.register({
        typeid: 'test2:thing-1.0.0',
        properties: [
          { id: 'nodeOfThing', typeid: 'NodeProperty' }
        ]
      });
      PropertyFactory.register({
        typeid: 'test2:inheritsThing-1.0.0',
        inherits: 'test2:thing-1.0.0',
        properties: [
          { id: 'childOfInheritsThing', typeid: 'NodeProperty' }
        ]
      });
      PropertyFactory.register({
        typeid: 'test2:inheritsNodeProp-1.0.0',
        inherits: 'NodeProperty',
        properties: [
          { id: 'something', typeid: 'Float32' }
        ]
      });
      PropertyFactory.register({
        typeid: 'test2:inheritsNamedNodeProp-1.0.0',
        inherits: 'NamedNodeProperty',
        properties: [
          { id: 'somethingelse', typeid: 'Float32' }
        ]
      });
      PropertyFactory.register({
        typeid: 'test2:boring-1.0.0',
        properties: [
          { id: 'nothingtoseehere', typeid: 'Bool' }
        ]
      });
      PropertyFactory.register({
        typeid: 'test2:inheritsMultiple-1.0.0',
        inherits: ['test:boring-1.0.0', 'NodeProperty'],
        properties: [
          { id: 'something', typeid: 'Float32' }
        ]
      });
    });

    it('nodeproperty always returns true', function() {
      const scenario = setupScenario('test2:thing-1.0.0', dataBinder);

      // test2:thing-1.0.0 is obviously in test2:thing-1.0.0
      expect(scenario.helper.hierarchyMayHaveBindings('test2:thing-1.0.0')).toEqual(true);
      // test2:thing-1.0.0 can be found in test2:inheritsThing-1.0.0
      expect(scenario.helper.hierarchyMayHaveBindings('test2:inheritsThing-1.0.0')).toEqual(true);
      // test2:thing-1.0.0 may be in a child subhierarchy of test2:thing-1.0.0 because nodeOfThing is a NodeProperty
      expect(scenario.helper.childrenMayHaveBindings('test2:thing-1.0.0')).toEqual(true);
      // test2:thing-1.0.0 may be in a child subhierarchy of test2:inheritsThing-1.0.0
      expect(scenario.helper.childrenMayHaveBindings('test2:inheritsThing-1.0.0')).toEqual(true);
      // test2:thing-1.0.0 may be in a child subhierarchy of test2:inheritsNodeProp-1.0.0
      expect(scenario.helper.childrenMayHaveBindings('test2:inheritsNodeProp-1.0.0')).toEqual(true);
      // test2:thing-1.0.0 may be in a child subhierarchy of test2:inheritsNamedNodeProp-1.0.0
      expect(scenario.helper.childrenMayHaveBindings('test2:inheritsNamedNodeProp-1.0.0')).toEqual(true);

      tearDownScenario(scenario);
    });
  });

  describe('Array cases', function() {
    beforeAll(function() {
      PropertyFactory.register({
        typeid: 'test3:cube-1.0.0',
        properties: [
          { id: 'something', typeid: 'Float32' }
        ]
      });
      PropertyFactory.register({
        typeid: 'test3:sphere-1.0.0',
        properties: [
          { id: 'something', typeid: 'Float32' }
        ]
      });
      PropertyFactory.register({
        typeid: 'test3:cylinder-1.0.0',
        properties: [
          { id: 'something', typeid: 'Float32' }
        ]
      });
      PropertyFactory.register({
        typeid: 'test3:inheritingCylinder-1.0.0',
        inherits: 'test3:cylinder-1.0.0'
      });
      PropertyFactory.register({
        typeid: 'test3:prism-1.0.0',
        properties: [
          { id: 'something', typeid: 'Float32' }
        ]
      });
      PropertyFactory.register({
        typeid: 'test3:thing-1.0.0',
        properties: [
          { id: 'cubearray', typeid: 'test3:cube-1.0.0', context: 'array' },
          {
            id: 'nested',
            properties: [
              { id: 'nestedCylinderArray', typeid: 'test3:cylinder-1.0.0', context: 'array' }
            ]
          }
        ]
      });
      PropertyFactory.register({
        typeid: 'test3:inheritedThing-1.0.0',
        inherits: 'test3:thing-1.0.0',
        properties: [
          { id: 'spherearray', typeid: 'test3:sphere-1.0.0', context: 'array' },
          {
            id: 'nested',
            properties: [
              { id: 'nestedPrismArray', typeid: 'test3:prism-1.0.0', context: 'array' }
            ]
          }
        ]
      });
    });

    it('can find in a base class array', function() {
      const scenario = setupScenario('test3:cube-1.0.0', dataBinder);

      // Can find a cube type in an array of cubes
      expect(scenario.helper.hierarchyMayHaveBindings('test3:thing-1.0.0')).toEqual(true);
      // Can find a cube type in an array of cubes in the base class
      expect(scenario.helper.hierarchyMayHaveBindings('test3:inheritedThing-1.0.0')).toEqual(true);

      tearDownScenario(scenario);
    });

    it('can find in an explicit array type', function() {
      const scenario = setupScenario('test3:cube-1.0.0', dataBinder);

      // Can find a cube type in an array of cubes
      expect(scenario.helper.hierarchyMayHaveBindings('array<test3:cube-1.0.0>')).toEqual(true);
      // A cube in an array is considered a child
      expect(scenario.helper.childrenMayHaveBindings('array<test3:cube-1.0.0>')).toEqual(true);

      tearDownScenario(scenario);
    });

    it('relevant type is an explicit array', function() {
      const scenario = setupScenario('array<test3:cube-1.0.0>', dataBinder);

      // Cubes aren't arrays of cubes
      expect(scenario.helper.hierarchyMayHaveBindings('test3:cube-1.0.0')).toEqual(false);
      // arrays should match
      expect(scenario.helper.hierarchyMayHaveBindings('array<test3:cube-1.0.0>')).toEqual(true);
      // but the children of arrays should not match
      expect(scenario.helper.childrenMayHaveBindings('array<test3:cube-1.0.0>')).toEqual(false);

      tearDownScenario(scenario);
    });

    it('can find a base type in an array of inherited types', function() {
      const scenario = setupScenario('test3:cylinder-1.0.0', dataBinder);

      // Can find a cylinder type in a array of inheriting cylinders
      expect(scenario.helper.hierarchyMayHaveBindings('array<test3:inheritingCylinder-1.0.0>')).toEqual(true);
      // Children of the array version
      expect(scenario.helper.childrenMayHaveBindings('array<test3:inheritingCylinder-1.0.0>')).toEqual(true);

      tearDownScenario(scenario);
    });

    it('can find in a nested base class array', function() {
      const scenario = setupScenario('test3:cylinder-1.0.0', dataBinder);

      // Can find a cylinder type in the nested array of cylinders
      expect(scenario.helper.hierarchyMayHaveBindings('test3:thing-1.0.0')).toEqual(true);
      // Can find a cylinder type in the nested array of cubes in the base class
      expect(scenario.helper.hierarchyMayHaveBindings('test3:inheritedThing-1.0.0')).toEqual(true);

      tearDownScenario(scenario);
    });

    it('cannot always find in an inherited class array', function() {
      const scenario = setupScenario('test3:sphere-1.0.0', dataBinder);

      // Cannot find a sphere type in the array of cubes in the thing class
      expect(scenario.helper.hierarchyMayHaveBindings('test3:thing-1.0.0')).toEqual(false);
      // Can find a sphere type in an array of sphere in the inherited class
      expect(scenario.helper.hierarchyMayHaveBindings('test3:inheritedThing-1.0.0')).toEqual(true);

      tearDownScenario(scenario);
    });

    it('cannot always find in a nested inherited class array', function() {
      const scenario = setupScenario('test3:prism-1.0.0', dataBinder);

      // Cannot find a prism type in the thing class
      expect(scenario.helper.hierarchyMayHaveBindings('test3:thing-1.0.0')).toEqual(false);
      // Can find a prism type in the nested array of prism in the inherting class
      expect(scenario.helper.hierarchyMayHaveBindings('test3:inheritedThing-1.0.0')).toEqual(true);

      tearDownScenario(scenario);
    });

  });

  describe('Map cases', function() {
    beforeAll(function() {
      PropertyFactory.register({
        typeid: 'test4:cube-1.0.0',
        properties: [
          { id: 'something', typeid: 'Float32' }
        ]
      });
      PropertyFactory.register({
        typeid: 'test4:sphere-1.0.0',
        properties: [
          { id: 'something', typeid: 'Float32' }
        ]
      });
      PropertyFactory.register({
        typeid: 'test4:cylinder-1.0.0',
        properties: [
          { id: 'something', typeid: 'Float32' }
        ]
      });
      PropertyFactory.register({
        typeid: 'test4:inheritingCylinder-1.0.0',
        inherits: 'test4:cylinder-1.0.0'
      });
      PropertyFactory.register({
        typeid: 'test4:prism-1.0.0',
        properties: [
          { id: 'something', typeid: 'Float32' }
        ]
      });
      PropertyFactory.register({
        typeid: 'test4:thing-1.0.0',
        properties: [
          { id: 'cubemap', typeid: 'test4:cube-1.0.0', context: 'map' },
          {
            id: 'nested',
            properties: [
              { id: 'nestedCylinderMap', typeid: 'test4:cylinder-1.0.0', context: 'map' }
            ]
          }
        ]
      });
      PropertyFactory.register({
        typeid: 'test4:inheritedThing-1.0.0',
        inherits: 'test4:thing-1.0.0',
        properties: [
          { id: 'spheremap', typeid: 'test4:sphere-1.0.0', context: 'map' },
          {
            id: 'nested',
            properties: [
              { id: 'nestedPrismMap', typeid: 'test4:prism-1.0.0', context: 'map' }
            ]
          }
        ]
      });
    });

    it('can find in a base class map', function() {
      const scenario = setupScenario('test4:cube-1.0.0', dataBinder);

      // Can find a cube type in the map of cubes in thing
      expect(scenario.helper.hierarchyMayHaveBindings('test4:thing-1.0.0')).toEqual(true);
      // Can find a cube type in an map of cubes in the base class
      expect(scenario.helper.hierarchyMayHaveBindings('test4:inheritedThing-1.0.0')).toEqual(true);

      tearDownScenario(scenario);
    });

    it('map<>', function() {
      const scenario = setupScenario('map<>', dataBinder);

      // map<> matches map<test4:cube-1.0.0>
      expect(scenario.helper.hierarchyMayHaveBindings('map<test4:cube-1.0.0>')).toEqual(true);
      // map<> matches a map of primitive types
      expect(scenario.helper.hierarchyMayHaveBindings('map<String>')).toEqual(true);
      // map<> can be found in a child of test4:inheritedThing-1.0.0
      expect(scenario.helper.hierarchyMayHaveBindings('test4:inheritedThing-1.0.0')).toEqual(true);

      tearDownScenario(scenario);
    });

    it('map with inheritance', function() {
      const scenario = setupScenario('map<test4:thing-1.0.0>', dataBinder);

      // map<test4:thing-1.0.0> does not match map<test4:cube-1.0.0>
      expect(scenario.helper.hierarchyMayHaveBindings('map<test4:cube-1.0.0>')).toEqual(false);
      // map<test4:thing-1.0.0> matches map<test4:inheritedThing-1.0.0>
      expect(scenario.helper.hierarchyMayHaveBindings('map<test4:inheritedThing-1.0.0>')).toEqual(true);

      tearDownScenario(scenario);
    });

    it('can find in an explicit map type', function() {
      const scenario = setupScenario('test4:cube-1.0.0', dataBinder);

      // Can find a cube type in a map of cubes
      expect(scenario.helper.hierarchyMayHaveBindings('map<test4:cube-1.0.0>')).toEqual(true);
      // A cube in a map of cubes is considered a child
      expect(scenario.helper.childrenMayHaveBindings('map<test4:cube-1.0.0>')).toEqual(true);

      tearDownScenario(scenario);
    });

    it('relevant type is an explicit map', function() {
      const scenario = setupScenario('map<test4:cube-1.0.0>', dataBinder);

      // Cubes aren't maps of cubes
      expect(scenario.helper.hierarchyMayHaveBindings('test4:cube-1.0.0')).toEqual(false);
      // maps should match
      expect(scenario.helper.hierarchyMayHaveBindings('map<test4:cube-1.0.0>')).toEqual(true);
      // but the children of maps should not match
      expect(scenario.helper.childrenMayHaveBindings('map<test4:cube-1.0.0>')).toEqual(false);

      tearDownScenario(scenario);
    });

    it('can find a base type in a map of inherited types', function() {
      const scenario = setupScenario('test4:cylinder-1.0.0', dataBinder);

      // Can find a cylinder type in a map of inheriting cylinders
      expect(scenario.helper.hierarchyMayHaveBindings('map<test4:inheritingCylinder-1.0.0>')).toEqual(true);
      // Children of the map version
      expect(scenario.helper.childrenMayHaveBindings('map<test4:inheritingCylinder-1.0.0>')).toEqual(true);

      tearDownScenario(scenario);
    });

    it('can find in a nested base class map', function() {
      const scenario = setupScenario('test4:cylinder-1.0.0', dataBinder);

      // Can find a cylinder type in the nested map of cylinders
      expect(scenario.helper.hierarchyMayHaveBindings('test4:thing-1.0.0')).toEqual(true);
      // Can find a cylinder type in the nested map of cubes in the base class
      expect(scenario.helper.hierarchyMayHaveBindings('test4:inheritedThing-1.0.0')).toEqual(true);

      tearDownScenario(scenario);
    });

    it('cannot always find in an inherited class map', function() {
      const scenario = setupScenario('test4:sphere-1.0.0', dataBinder);

      // Cannot find a sphere type in an map of cubes
      expect(scenario.helper.hierarchyMayHaveBindings('test4:thing-1.0.0')).toEqual(false);
      // Can find a sphere type in an map of sphere in the inherited class
      expect(scenario.helper.hierarchyMayHaveBindings('test4:inheritedThing-1.0.0')).toEqual(true);

      tearDownScenario(scenario);
    });

    it('cannot always find in a nested inherited class map', function() {
      const scenario = setupScenario('test4:prism-1.0.0', dataBinder);

      // Cannot find a prism type in the thing class
      expect(scenario.helper.hierarchyMayHaveBindings('test4:thing-1.0.0')).toEqual(false);
      // Can find a prism type in the nested map of prism in the inherited class
      expect(scenario.helper.hierarchyMayHaveBindings('test4:inheritedThing-1.0.0')).toEqual(true);

      tearDownScenario(scenario);
    });

  });

});
