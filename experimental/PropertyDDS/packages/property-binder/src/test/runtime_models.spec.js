/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* globals should, expect, sinon */
/* eslint-disable require-jsdoc */

import { registerTestTemplates } from './testTemplates';
import { DataBinding } from '../data_binder/dataBinding';
import { MockSharedPropertyTree } from './mockSharedPropertyTree';
import { PropertyFactory } from '@fluid-experimental/property-properties';
import { DataBinder } from '..';

class AnimalRepresentation {
}

class CatRepresentation extends AnimalRepresentation {
}

class DogRepresentation extends AnimalRepresentation {
}
const dogGenerator = function(in_property, bindingType, userData) {
  return new DogRepresentation();
};

describe('DataBinder runtime representations', function() {
  let myDataBinder, workspace;

  beforeAll(function() {
    registerTestTemplates();
  });

  beforeEach(async function() {
    myDataBinder = new DataBinder();
    workspace = await MockSharedPropertyTree();
  });

  afterEach(function() {
    myDataBinder.detach();
  });

  describe('creation of runtime representations', function() {

    it('should work for the example in the documentation of defineRepresentation', function() {
      // NOTE: This is the example in the documentation, please keep it in tune!
      myDataBinder.defineRepresentation('PETSTORE', 'Test:Dog-1.0.0', () => new DogRepresentation());

      // Get a workspace and insert a new property
      workspace.root.insert('Fido', PropertyFactory.create('Test:Dog-1.0.0', 'single'));

      myDataBinder.attachTo(workspace);

      // Request the runtime representation associated with the property
      const fido = myDataBinder.getRepresentation(workspace.root.get('Fido'), 'PETSTORE');
      expect(fido).toBeDefined();
      expect(fido).toBeInstanceOf(DogRepresentation);
    });

    it('should handle register, attach, insert', function() {
      myDataBinder.defineRepresentation('PETSTORE', 'Test:Dog-1.0.0', () => new DogRepresentation());
      myDataBinder.attachTo(workspace);
      workspace.root.insert('Fido', PropertyFactory.create('Test:Dog-1.0.0', 'single'));

      // Request the runtime representation associated with the property
      const fido = myDataBinder.getRepresentation(workspace.root.get('Fido'), 'PETSTORE');
      expect(fido).toBeDefined();
      expect(fido).toBeInstanceOf(DogRepresentation);
    });

    it('should handle register, insert, attach', function() {
      myDataBinder.defineRepresentation('PETSTORE', 'Test:Dog-1.0.0', () => new DogRepresentation());
      workspace.root.insert('Fido', PropertyFactory.create('Test:Dog-1.0.0', 'single'));
      myDataBinder.attachTo(workspace);

      // Request the runtime representation associated with the property
      const fido = myDataBinder.getRepresentation(workspace.root.get('Fido'), 'PETSTORE');
      expect(fido).toBeDefined();
      expect(fido).toBeInstanceOf(DogRepresentation);
    });

    it('should handle attach, register, insert', function() {
      myDataBinder.attachTo(workspace);
      myDataBinder.defineRepresentation('PETSTORE', 'Test:Dog-1.0.0', () => new DogRepresentation());
      workspace.root.insert('Fido', PropertyFactory.create('Test:Dog-1.0.0', 'single'));

      // Request the runtime representation associated with the property
      const fido = myDataBinder.getRepresentation(workspace.root.get('Fido'), 'PETSTORE');
      expect(fido).toBeDefined();
      expect(fido).toBeInstanceOf(DogRepresentation);
    });

    it('should handle attach, insert, register', function() {
      myDataBinder.attachTo(workspace);
      workspace.root.insert('Fido', PropertyFactory.create('Test:Dog-1.0.0', 'single'));
      myDataBinder.defineRepresentation('PETSTORE', 'Test:Dog-1.0.0', () => new DogRepresentation());

      // Request the runtime representation associated with the property
      const fido = myDataBinder.getRepresentation(workspace.root.get('Fido'), 'PETSTORE');
      expect(fido).toBeDefined();
      expect(fido).toBeInstanceOf(DogRepresentation);
    });

    it('should handle insert, register, attach', function() {
      workspace.root.insert('Fido', PropertyFactory.create('Test:Dog-1.0.0', 'single'));
      myDataBinder.defineRepresentation('PETSTORE', 'Test:Dog-1.0.0', () => new DogRepresentation());
      myDataBinder.attachTo(workspace);

      // Request the runtime representation associated with the property
      const fido = myDataBinder.getRepresentation(workspace.root.get('Fido'), 'PETSTORE');
      expect(fido).toBeDefined();
      expect(fido).toBeInstanceOf(DogRepresentation);
    });

    it('should handle insert, attach, register', function() {
      workspace.root.insert('Fido', PropertyFactory.create('Test:Dog-1.0.0', 'single'));
      myDataBinder.attachTo(workspace);
      myDataBinder.defineRepresentation('PETSTORE', 'Test:Dog-1.0.0', () => new DogRepresentation());

      // Request the runtime representation associated with the property
      const fido = myDataBinder.getRepresentation(workspace.root.get('Fido'), 'PETSTORE');
      expect(fido).toBeDefined();
      expect(fido).toBeInstanceOf(DogRepresentation);
    });

    it('should destroy the runtime representations when detaching', function() {
      myDataBinder.attachTo(workspace);

      let makerCalled = false;
      let destroyerCalled = false;

      const maker = () => {
        makerCalled = true;
        return new DogRepresentation();
      };
      const destroyer = () => {
        destroyerCalled = true;
      };
      myDataBinder.defineRepresentation('PETSTORE', 'Test:Dog-1.0.0', maker, {
        destroyer: destroyer
      });
      workspace.root.insert('Fido', PropertyFactory.create('Test:Dog-1.0.0', 'single'));

      // Request the representations associated with the property
      const fido = myDataBinder.getRepresentation(workspace.root.get('Fido'), 'PETSTORE');
      expect(makerCalled).toEqual(true);
      expect(fido).toBeDefined();
      expect(fido).toBeInstanceOf(DogRepresentation);

      // Detach -- this should destroy the representations
      myDataBinder.detach(false);

      expect(destroyerCalled).toEqual(true);

      makerCalled = false;
      myDataBinder.attachTo(workspace);

      // Shouldn't build since noone asked for it
      expect(makerCalled).toEqual(false);

      // After reattaching, getting the representation should specifically _recreate_ it (i.e. the maker
      // should get called again)
      const fido2 = myDataBinder.getRepresentation(workspace.root.get('Fido'), 'PETSTORE');

      // existential question. If you clone your dog, is it the same dog? What makes your dog _Fido_? Is it the
      // dna of Fido, or the dna and all of the experiences he lived through? For the purposes of this test, the
      // new fido is a different fido.
      expect(makerCalled).toEqual(true);
      expect(fido2).toBeDefined();
      expect(fido).not.toBe(fido2);
    });

    it('should be possible to get a runtime representation from the databinding', function() {

      // Register a data binding
      let representationFound;
      class DogDataBinding extends DataBinding {
        constructor(params) {
          super(params);

          representationFound = this.getRepresentation();
        }
      }

      // Register a runtime representation
      myDataBinder.defineRepresentation('PETSTORE', 'Test:Dog-1.0.0', dogGenerator);
      // And a databinding
      myDataBinder.register('PETSTORE', 'Test:Dog-1.0.0', DogDataBinding);

      myDataBinder.attachTo(workspace);

      // Insert a dog
      const fido = PropertyFactory.create('Test:Dog-1.0.0', 'single');
      workspace.root.insert('Fido', fido);

      // The constructor of the databinding tried getting the runtime representation
      expect(representationFound).toBeDefined();
      expect(representationFound).toBeInstanceOf(DogRepresentation);
      expect(representationFound).toEqual(myDataBinder.getRepresentation(fido, 'PETSTORE'));
    });

    it('should be possible to define in two binding types', function() {
      class Representation1 {
      }
      class Representation2 {
      }

      // Register a runtime representation
      myDataBinder.defineRepresentation('PETSTORE', 'Test:Dog-1.0.0', () => new Representation1());
      myDataBinder.defineRepresentation('KENNEL', 'Test:Dog-1.0.0', () => new Representation2());

      myDataBinder.attachTo(workspace);

      // Insert a dog
      const fido = PropertyFactory.create('Test:Dog-1.0.0', 'single');
      workspace.root.insert('Fido', fido);

      const model1 = myDataBinder.getRepresentation(fido, 'PETSTORE');
      expect(model1).toBeDefined();
      expect(model1).toBeInstanceOf(Representation1);

      const model2 = myDataBinder.getRepresentation(fido, 'KENNEL');
      expect(model2).toBeDefined();
      expect(model2).toBeInstanceOf(Representation2);
    });

    it('should be possible to define hierarchical runtime representations', function() {

      // Register a runtime representation
      myDataBinder.defineRepresentation('PETSTORE', 'Test:Animal-1.0.0', () => new AnimalRepresentation());
      myDataBinder.defineRepresentation('PETSTORE', 'Test:Dog-1.0.0', () => new DogRepresentation());
      myDataBinder.defineRepresentation('PETSTORE', 'Test:Cat-1.0.0', () => new CatRepresentation());

      myDataBinder.attachTo(workspace);

      const fido = PropertyFactory.create('Test:Dog-1.0.0', 'single');
      workspace.root.insert('Fido', fido);
      const whiskers = PropertyFactory.create('Test:Cat-1.0.0', 'single');
      workspace.root.insert('Whiskers', whiskers);
      const hector = PropertyFactory.create('Test:Chinchilla-1.0.0', 'single');
      workspace.root.insert('Hector', hector);

      const fidoRuntime = myDataBinder.getRepresentation(fido, 'PETSTORE');
      expect(fidoRuntime).toBeDefined();
      expect(fidoRuntime).toBeInstanceOf(DogRepresentation);

      const whiskersRuntime = myDataBinder.getRepresentation(whiskers, 'PETSTORE');
      expect(whiskersRuntime).toBeDefined();
      expect(whiskersRuntime).toBeInstanceOf(CatRepresentation);

      // Chinchillas don't have a specialization, so we should get the animal runtime representation
      const hectorRuntime = myDataBinder.getRepresentation(hector, 'PETSTORE');
      expect(hectorRuntime).toBeDefined();
      expect(hectorRuntime).toBeInstanceOf(AnimalRepresentation);
    });

    it('should not be possible to call getRepresentation without a workspace', function() {
      expect((function() { myDataBinder.getRepresentation(workspace.root, 'PETSTORE'); })).toThrow();
    });

    it('should be possible to call getRepresentation in any order', function() {
      myDataBinder.attachTo(workspace);

      const fido = PropertyFactory.create('Test:Dog-1.0.0', 'single');
      workspace.root.insert('Fido', fido);
      const whiskers = PropertyFactory.create('Test:Cat-1.0.0', 'single');
      workspace.root.insert('Whiskers', whiskers);

      // A generator that is dependent on another runtime representation
      const dependentDogGenerator = function(property, bindingType) {
        // Get the cat dependency
        myDataBinder.getRepresentation(whiskers, bindingType);
        return new DogRepresentation();
      };

      myDataBinder.defineRepresentation('PETSTORE', 'Test:Dog-1.0.0', dependentDogGenerator);
      myDataBinder.defineRepresentation('PETSTORE', 'Test:Cat-1.0.0', () => new CatRepresentation());

      myDataBinder.defineRepresentation('KENNEL', 'Test:Dog-1.0.0', dependentDogGenerator);
      myDataBinder.defineRepresentation('KENNEL', 'Test:Cat-1.0.0', () => new CatRepresentation());

      // The dog depends on the cat. First, try getting the dog representation then the cat representation.
      const dogRepresentation1 = myDataBinder.getRepresentation(fido, 'PETSTORE');
      const catRepresentation1 = myDataBinder.getRepresentation(whiskers, 'PETSTORE');
      expect(dogRepresentation1).toBeDefined();
      expect(catRepresentation1).toBeDefined();
      expect(dogRepresentation1).toBeInstanceOf(DogRepresentation);
      expect(catRepresentation1).toBeInstanceOf(CatRepresentation);

      // Now get the cat first
      const catRepresentation2 = myDataBinder.getRepresentation(whiskers, 'KENNEL');
      const dogRepresentation2 = myDataBinder.getRepresentation(fido, 'KENNEL');
      expect(dogRepresentation2).toBeDefined();
      expect(catRepresentation2).toBeDefined();
      expect(dogRepresentation2).toBeInstanceOf(DogRepresentation);
      expect(catRepresentation2).toBeInstanceOf(CatRepresentation);
    });

    it('should throw for a cycle in getRepresentation generators', function() {
      myDataBinder.attachTo(workspace);

      const fido = PropertyFactory.create('Test:Dog-1.0.0', 'single');
      workspace.root.insert('Fido', fido);
      const whiskers = PropertyFactory.create('Test:Cat-1.0.0', 'single');
      workspace.root.insert('Whiskers', whiskers);

      // The dog generator is dependent on the cat runtime representation
      const dependentDogGenerator = function(property, bindingType) {
        // Get the cat dependency
        const catModel = myDataBinder.getRepresentation(whiskers, bindingType);
        return new DogRepresentation(catModel);
      };

      // The cat generator is dependent on the dog runtime representation
      const dependentCatGenerator = function(property, bindingType) {
        // Get the cat dependency
        const dogModel = myDataBinder.getRepresentation(fido, bindingType);
        // We're pretending here that the cat runtime representation requires the dog representation.
        return new CatRepresentation(dogModel);
      };

      myDataBinder.defineRepresentation('PETSTORE', 'Test:Dog-1.0.0', dependentDogGenerator);
      myDataBinder.defineRepresentation('PETSTORE', 'Test:Cat-1.0.0', dependentCatGenerator);

      // neither of these can really work
      expect((function() { myDataBinder.getRepresentation(fido, 'PETSTORE'); })).toThrow();
      expect((function() { myDataBinder.getRepresentation(whiskers, 'PETSTORE'); })).toThrow();
    });

    it('should be able to break cycles with an initializer', function() {
      myDataBinder.attachTo(workspace);

      const fido = PropertyFactory.create('Test:Dog-1.0.0', 'single');
      workspace.root.insert('Fido', fido);
      const whiskers = PropertyFactory.create('Test:Cat-1.0.0', 'single');
      workspace.root.insert('Whiskers', whiskers);

      // The dog generator is dependent on the cat runtime representation, but we only get it in the initializer
      const dependentDogGenerator = function(property, bindingType) {
        // One of the constructors needs to connect the dependency in an initializer
        return new DogRepresentation();
      };

      const dogInitializer = function(dogRuntimeObject, property, bindingType) {
        // Get the cat dependency
        const catModel = myDataBinder.getRepresentation(whiskers, bindingType);
        dogRuntimeObject._catModel = catModel;
      };

      // The cat generator is dependent on the dog runtime representation
      const dependentCatGenerator = function(property, bindingType) {
        // Get the cat dependency
        const dogModel = myDataBinder.getRepresentation(fido, bindingType);
        // We're pretending here that the cat runtime representation requires the dog representation.
        return new CatRepresentation(dogModel);
      };

      myDataBinder.defineRepresentation('PETSTORE', 'Test:Dog-1.0.0', dependentDogGenerator, {
        initializer: dogInitializer
      });
      myDataBinder.defineRepresentation('PETSTORE', 'Test:Cat-1.0.0', dependentCatGenerator);

      // These should work
      const fidoRepresentation = myDataBinder.getRepresentation(fido, 'PETSTORE');
      const whiskersRepresentation = myDataBinder.getRepresentation(whiskers, 'PETSTORE');

      // Fido should have found whiskers
      expect(fidoRepresentation._catModel).toBeDefined();
      expect(fidoRepresentation._catModel).toEqual(whiskersRepresentation);
    });

    it('should not be able to get unknown things', function() {
      // Get a workspace and insert a new property
      workspace.root.insert('Fido', PropertyFactory.create('Test:Dog-1.0.0', 'single'));

      myDataBinder.attachTo(workspace);

      // Request the runtime representation associated with the property - but there is none
      const fido = myDataBinder.getRepresentation(workspace.root.get('Fido'), 'PETSTORE');
      expect(fido).toBeUndefined();
    });

    it('should be possible to unregister runtime representations', function() {
      // Register a property and a destroyer
      let destroyerCalled = false;
      const destroyer = function() {
        destroyerCalled = true;
      };

      const handle = myDataBinder.defineRepresentation('PETSTORE', 'Test:Dog-1.0.0', () => new DogRepresentation(), {
        destroyer: destroyer
      });

      // Get a workspace and insert a new property
      workspace.root.insert('Fido', PropertyFactory.create('Test:Dog-1.0.0', 'single'));

      myDataBinder.attachTo(workspace);

      // Request the runtime representation associated with the property
      const fido = myDataBinder.getRepresentation(workspace.root.get('Fido'), 'PETSTORE');
      expect(fido).toBeDefined();
      expect(fido).toBeInstanceOf(DogRepresentation);

      // unregister
      handle.destroy();
      expect(destroyerCalled).toEqual(true);

      // Should not get a runtime representation for it anymore
      const notFido = myDataBinder.getRepresentation(workspace.root.get('Fido'), 'PETSTORE');
      expect(notFido).toBeUndefined();
    });

    it('should be destroyed when the property is removed', function() {
      // Register a property and a destroyer
      let destroyerCalled = false;
      const destroyer = function() {
        destroyerCalled = true;
      };

      myDataBinder.defineRepresentation('PETSTORE', 'Test:Dog-1.0.0', () => new DogRepresentation(), {
        destroyer: destroyer
      });

      // Get a workspaceand insert a new property
      workspace.root.insert('Fido', PropertyFactory.create('Test:Dog-1.0.0', 'single'));

      myDataBinder.attachTo(workspace);

      // Request the runtime representation associated with the property
      const fido = myDataBinder.getRepresentation(workspace.root.get('Fido'), 'PETSTORE');
      expect(fido).toBeDefined();
      expect(fido).toBeInstanceOf(DogRepresentation);

      workspace.root.remove('Fido', PropertyFactory.create('Test:Dog-1.0.0', 'single'));

      expect(destroyerCalled).toEqual(true);

      // The property exists but is not in the workspace, no runtime representation
      expect((function() { myDataBinder.getRepresentation(fido, 'PETSTORE'); })).toThrow();
    });

    it('should receive userdata in the generator and the destroyer', function() {
      // Register a property and a destroyer

      const theUserData = 'The User Data';
      let generatorGotUserData = false;
      let destroyerGotAllData = false;

      const generator = function(in_property, in_bindingType, in_userData) {
        generatorGotUserData = (in_userData === theUserData);
        return new DogRepresentation();
      };

      const destroyer = function(in_representation, in_bindingType, in_userData) {
        destroyerGotAllData = (in_userData === theUserData) && in_bindingType === 'PETSTORE';
      };

      myDataBinder.defineRepresentation('PETSTORE', 'Test:Dog-1.0.0', generator, {
        destroyer: destroyer,
        userData: theUserData
      });

      // Get a workspace and insert a new property
      workspace.root.insert('Fido', PropertyFactory.create('Test:Dog-1.0.0', 'single'));

      myDataBinder.attachTo(workspace);

      // Request the runtime representations associated with the property
      const fido = myDataBinder.getRepresentation(workspace.root.get('Fido'), 'PETSTORE');
      expect(fido).toBeDefined();
      expect(fido).toBeInstanceOf(DogRepresentation);

      expect(generatorGotUserData).toEqual(true);
      expect(destroyerGotAllData).toEqual(false);

      // Remove the object
      workspace.root.remove('Fido', PropertyFactory.create('Test:Dog-1.0.0', 'single'));

      expect(generatorGotUserData).toEqual(true);
      expect(destroyerGotAllData).toEqual(true);
    });

    it('should be able to unregister them all', function() {
      // Register some runtime representations
      myDataBinder.defineRepresentation('PETSTORE', 'Test:Dog-1.0.0', () => new DogRepresentation());
      myDataBinder.defineRepresentation('PETSTORE', 'Test:Cat-1.0.0', () => new CatRepresentation());

      myDataBinder.attachTo(workspace);

      // Insert a dog and a cat
      const fido = PropertyFactory.create('Test:Dog-1.0.0', 'single');
      workspace.root.insert('Fido', fido);

      const whiskers = PropertyFactory.create('Test:Cat-1.0.0', 'single');
      workspace.root.insert('Whiskers', whiskers);

      const model1 = myDataBinder.getRepresentation(fido, 'PETSTORE');
      expect(model1).toBeDefined();
      expect(model1).toBeInstanceOf(DogRepresentation);

      const model2 = myDataBinder.getRepresentation(whiskers, 'PETSTORE');
      expect(model2).toBeDefined();
      expect(model2).toBeInstanceOf(CatRepresentation);

      myDataBinder.undefineAllRepresentations('PETSTORE');

      expect(myDataBinder.getRepresentation(fido, 'PETSTORE')).toBeUndefined();
      expect(myDataBinder.getRepresentation(whiskers, 'PETSTORE')).toBeUndefined();
    });

    it('should work in arrays', function() {
      let destroyedCalled = false;
      const destroyer = function() {
        destroyedCalled = true;
      };

      const handle = myDataBinder.defineRepresentation(
        'PETSTORE', 'Test:Dog-1.0.0', () => new DogRepresentation(), {
          destroyer: destroyer
        }
      );

      myDataBinder.attachTo(workspace);

      // Insert a dog array
      const dogArray = PropertyFactory.create('Test:Dog-1.0.0', 'array');
      workspace.root.insert('dogArray', dogArray);

      dogArray.push(PropertyFactory.create('Test:Dog-1.0.0', 'single'));
      dogArray.push(PropertyFactory.create('Test:Dog-1.0.0', 'single'));
      dogArray.push(PropertyFactory.create('Test:Dog-1.0.0', 'single'));
      dogArray.push(PropertyFactory.create('Test:Dog-1.0.0', 'single'));

      const model1 = myDataBinder.getRepresentation(dogArray.get(0), 'PETSTORE');
      expect(model1).toBeDefined();
      expect(model1).toBeInstanceOf(DogRepresentation);

      const model2 = myDataBinder.getRepresentation(dogArray.get(3), 'PETSTORE');
      expect(model2).toBeDefined();
      expect(model2).toBeInstanceOf(DogRepresentation);

      expect(destroyedCalled).toEqual(false);
      handle.destroy();
      expect(destroyedCalled).toEqual(true);

      expect(myDataBinder.getRepresentation(dogArray.get(0), 'PETSTORE')).toBeUndefined();
    });

    it('should work for arrays', function() {
      let destroyedCalled = false;
      const destroyer = function() {
        destroyedCalled = true;
      };

      const handle = myDataBinder.defineRepresentation(
        'PETSTORE', 'array<Test:Dog-1.0.0>', () => new DogRepresentation(), {
          destroyer: destroyer
        }
      );

      myDataBinder.attachTo(workspace);

      // Insert a dog array
      const dogArray = PropertyFactory.create('Test:Dog-1.0.0', 'array');
      workspace.root.insert('dogArray', dogArray);

      dogArray.push(PropertyFactory.create('Test:Dog-1.0.0', 'single'));
      dogArray.push(PropertyFactory.create('Test:Dog-1.0.0', 'single'));
      dogArray.push(PropertyFactory.create('Test:Dog-1.0.0', 'single'));
      dogArray.push(PropertyFactory.create('Test:Dog-1.0.0', 'single'));

      const model1 = myDataBinder.getRepresentation(dogArray, 'PETSTORE');
      expect(model1).toBeDefined();
      expect(model1).toBeInstanceOf(DogRepresentation);

      const model2 = myDataBinder.getRepresentation(dogArray.get(0), 'PETSTORE');
      expect(model2).toBeUndefined();

      expect(destroyedCalled).toEqual(false);
      handle.destroy();
      expect(destroyedCalled).toEqual(true);

      expect(myDataBinder.getRepresentation(dogArray, 'PETSTORE')).toBeUndefined();
    });

    it('should work in maps', function() {
      let destroyedCalled = false;
      const destroyer = function() {
        destroyedCalled = true;
      };

      const handle = myDataBinder.defineRepresentation(
        'PETSTORE', 'Test:Dog-1.0.0', () => new DogRepresentation(), {
          destroyer: destroyer
        }
      );

      myDataBinder.attachTo(workspace);

      // Insert a dog and a cat
      const dogMap = PropertyFactory.create('Test:Dog-1.0.0', 'map');
      workspace.root.insert('dogMap', dogMap);

      dogMap.insert('fido', PropertyFactory.create('Test:Dog-1.0.0', 'single'));
      dogMap.insert('brutus', PropertyFactory.create('Test:Dog-1.0.0', 'single'));

      const model1 = myDataBinder.getRepresentation(dogMap.get('fido'), 'PETSTORE');
      expect(model1).toBeDefined();
      expect(model1).toBeInstanceOf(DogRepresentation);

      const model2 = myDataBinder.getRepresentation(dogMap.get('brutus'), 'PETSTORE');
      expect(model2).toBeDefined();
      expect(model2).toBeInstanceOf(DogRepresentation);

      expect(destroyedCalled).toEqual(false);
      handle.destroy();
      expect(destroyedCalled).toEqual(true);

      expect(myDataBinder.getRepresentation(dogMap.get('fido'), 'PETSTORE')).toBeUndefined();
    });
  });

  describe('misc', function() {
    it('should work for maps', function() {
      let destroyedCalled = false;
      const destroyer = function() {
        destroyedCalled = true;
      };

      const handle = myDataBinder.defineRepresentation(
        'PETSTORE', 'map<Test:Dog-1.0.0>', () => new DogRepresentation(), {
          destroyer: destroyer
        }
      );

      myDataBinder.attachTo(workspace);

      // Insert a dog and a cat
      const dogMap = PropertyFactory.create('Test:Dog-1.0.0', 'map');
      workspace.root.insert('dogMap', dogMap);

      dogMap.insert('fido', PropertyFactory.create('Test:Dog-1.0.0', 'single'));
      dogMap.insert('brutus', PropertyFactory.create('Test:Dog-1.0.0', 'single'));

      const model1 = myDataBinder.getRepresentation(dogMap, 'PETSTORE');
      expect(model1).toBeDefined();
      expect(model1).toBeInstanceOf(DogRepresentation);

      const model2 = myDataBinder.getRepresentation(dogMap.get('fido'), 'PETSTORE');
      expect(model2).toBeUndefined();

      expect(destroyedCalled).toEqual(false);
      handle.destroy();
      expect(destroyedCalled).toEqual(true);

      expect(myDataBinder.getRepresentation(dogMap, 'PETSTORE')).toBeUndefined();
    });

    it ('should be possible to associate a runtime representation and get it', function() {
      myDataBinder.attachTo(workspace);

      myDataBinder.defineRepresentation('PETSTORE', 'Test:Animal-1.0.0', () => new AnimalRepresentation());
      const fido = PropertyFactory.create('Test:Dog-1.0.0', 'single');
      workspace.root.insert('Fido', fido);
      const mrSnuggums = PropertyFactory.create('Test:Dog-1.0.0', 'single');
      workspace.root.insert('Snuggums', mrSnuggums);

      const fidoRepresentation = new DogRepresentation();
      myDataBinder.associateRepresentation(fido, 'PETSTORE', fidoRepresentation);

      // Should get it back when we ask for it
      const fetchFido = myDataBinder.getRepresentation(fido, 'PETSTORE');
      expect(fetchFido).toBeDefined();
      expect(fetchFido).toEqual(fidoRepresentation);

      // Should still be able to get other representations
      const snuggumsRepresentation = myDataBinder.getRepresentation(mrSnuggums, 'PETSTORE');
      expect(snuggumsRepresentation).toBeInstanceOf(AnimalRepresentation);
    });

    it('should still call the destructor on a rep supplied through associateRepresentation', function() {
      myDataBinder.attachTo(workspace);

      let destructorCalled = 0;
      let snuggumsRepresentation = undefined;

      myDataBinder.defineRepresentation('PETSTORE', 'Test:Animal-1.0.0', () => new AnimalRepresentation(), {
        destroyer: (in_representation) => {
          destructorCalled++;
        }
      });

      // Make some properties
      const fido = PropertyFactory.create('Test:Dog-1.0.0', 'single');
      workspace.root.insert('Fido', fido);
      const mrSnuggums = PropertyFactory.create('Test:Dog-1.0.0', 'single');
      workspace.root.insert('Snuggums', mrSnuggums);

      // Associate a runtime representation
      const fidoRepresentation = new DogRepresentation();
      myDataBinder.associateRepresentation(fido, 'PETSTORE', fidoRepresentation);

      // Get the other representation (i.e., construct from the defineRepresentation definition)
      snuggumsRepresentation = myDataBinder.getRepresentation(mrSnuggums, 'PETSTORE');
      expect(snuggumsRepresentation).toBeInstanceOf(AnimalRepresentation);

      // Remove the fido property -- should call the destroyer callback to destroy the associated representation
      // Note, the destroyer associated with the base class, Test:Animal-1.0.0, will be called here.
      workspace.root.remove('Fido');
      expect(destructorCalled).toEqual(1);

      // Remove the snuggums property -- should call the destroyer callback to destroy the constructed representation
      // Note, the destroyer associated with the base class, Test:Animal-1.0.0, will be called here.
      workspace.root.remove('Snuggums');
      expect(destructorCalled).toEqual(2);
    });

    it('should not be possible to associate a runtime representation when not attached', function() {
      // Register a runtime representation for dogs
      myDataBinder.defineRepresentation('PETSTORE', 'Test:Dog-1.0.0', () => new DogRepresentation());

      const fido = PropertyFactory.create('Test:Dog-1.0.0', 'single');
      const fidoRepresentation = new DogRepresentation();

      // Not attached to a workspace; should fail
      expect(function() { myDataBinder.associateRepresentation(fido, 'PETSTORE', fidoRepresentation); }).toThrow();

      myDataBinder.attachTo(workspace);

      // Attached to a workspace, but fido isn't in the workspace
      expect(function() { myDataBinder.associateRepresentation(fido, 'PETSTORE', fidoRepresentation); }).toThrow();

      workspace.root.insert('Fido', fido);

      // Should work now
      myDataBinder.associateRepresentation(fido, 'PETSTORE', fidoRepresentation);
    });

    it('should not be able to override an existing representation', function() {
      const fido = PropertyFactory.create('Test:Dog-1.0.0', 'single');
      workspace.root.insert('Fido', fido);

      // Register a runtime representation
      myDataBinder.defineRepresentation('PETSTORE', 'Test:Dog-1.0.0', () => new DogRepresentation());

      myDataBinder.attachTo(workspace);
      // Get the representation, which makes it exist
      myDataBinder.getRepresentation(fido, 'PETSTORE');

      const fidoRepresentation = new DogRepresentation();

      // already exists
      expect(function() { myDataBinder.associateRepresentation(fido, 'PETSTORE', fidoRepresentation); }).toThrow();
    });

    it('should throw when trying to get representation associated with a non-existing property', function() {

      // Register a data binding
      let representationFound;
      class DogDataBinding extends DataBinding {
        constructor(params) {
          super(params);

          representationFound = this.getRepresentation();
        }

        onRemove(in_removalContext) {
          // we don't have the associated Property anymore -> should throw
          expect((function() { this.getRepresentation(); })).toThrow();
          representationFound = undefined;
        }
      }

      // Register a runtime representation
      myDataBinder.defineRepresentation('PETSTORE', 'Test:Dog-1.0.0', dogGenerator);
      // And a databinding
      myDataBinder.register('PETSTORE', 'Test:Dog-1.0.0', DogDataBinding);

      myDataBinder.attachTo(workspace);

      // Insert a dog
      const fido = PropertyFactory.create('Test:Dog-1.0.0', 'single');
      workspace.root.insert('Fido', fido);

      // The constructor of the databinding tried getting the runtime representation
      expect(representationFound).toBeDefined();
      expect(representationFound).toBeInstanceOf(DogRepresentation);
      expect(representationFound).toEqual(myDataBinder.getRepresentation(fido, 'PETSTORE'));

      // Remove the dog
      workspace.root.remove('Fido');
      expect(representationFound).toBeUndefined(); // removed explicitly in onRemove()
      expect((function() { myDataBinder.getRepresentation(workspace.root.get('fido')); })).toThrow();
    });

    it('should supply the empty context for classic function callbacks', function() {
      const myDogGenerator = jest.fn(function() {
        expect(this).toBeNull();
        return new DogRepresentation();
      });

      const dogInitializer = jest.fn(function() {
        expect(this).toBeNull();
      });

      const dogDestroyer = jest.fn(function() {
        expect(this).toBeNull();
      });

      // Define a runtime representation for dogs with all possible callbacks
      const handle = myDataBinder.defineRepresentation('PETSTORE', 'Test:Dog-1.0.0', myDogGenerator, {
        initializer: dogInitializer,
        destroyer: dogDestroyer
      });

      const fido = PropertyFactory.create('Test:Dog-1.0.0', 'single');
      myDataBinder.attachTo(workspace);
      workspace.root.insert('Fido', fido);
      // Get the representation, which makes it exist
      const fidoRepresentation = myDataBinder.getRepresentation(fido, 'PETSTORE');
      expect(fidoRepresentation).toBeInstanceOf(DogRepresentation);
      // Destroy it
      handle.destroy();
      // Check if all callbacks have been called
      expect(myDogGenerator).toHaveBeenCalledTimes(1);
      expect(dogInitializer).toHaveBeenCalledTimes(1);
      expect(dogDestroyer).toHaveBeenCalledTimes(1);
    });

    it('should not change the context for arrow function callbacks', function() {
      const myContext = this;
      let generatorCalled = false;
      let initializerCalled = false;
      let destroyedCalled = false;
      const myDogGenerator = () => {
        expect(this).toEqual(myContext);
        generatorCalled = true;
        return new DogRepresentation();
      };

      const dogInitializer = () => {
        expect(this).toEqual(myContext);
        initializerCalled = true;
      };

      const dogDestroyer = () => {
        expect(this).toEqual(myContext);
        destroyedCalled = true;
      };

      // Define a runtime representation for dogs with all possible callbacks
      const handle = myDataBinder.defineRepresentation('PETSTORE', 'Test:Dog-1.0.0', myDogGenerator, {
        initializer: dogInitializer,
        destroyer: dogDestroyer
      });

      const fido = PropertyFactory.create('Test:Dog-1.0.0', 'single');
      myDataBinder.attachTo(workspace);
      workspace.root.insert('Fido', fido);
      // Get the representation, which makes it exist
      const fidoRepresentation = myDataBinder.getRepresentation(fido, 'PETSTORE');
      expect(fidoRepresentation).toBeInstanceOf(DogRepresentation);
      // Destroy it
      handle.destroy();
      // Check if all callbacks have been called
      expect(generatorCalled).toEqual(true);
      expect(initializerCalled).toEqual(true);
      expect(destroyedCalled).toEqual(true);
    });
  });

  describe('stateless runtime representations', function() {
    const testCycle = function(in_dogIsStateless, in_catIsStateless) {
      myDataBinder.attachTo(workspace);

      const fido = PropertyFactory.create('Test:Dog-1.0.0', 'single');
      workspace.root.insert('Fido', fido);
      const whiskers = PropertyFactory.create('Test:Cat-1.0.0', 'single');
      workspace.root.insert('Whiskers', whiskers);

      // The dog generator is dependent on the cat runtime representation
      const dependentDogGenerator = function(property, bindingType) {
        // Get the cat dependency
        const catModel = myDataBinder.getRepresentation(whiskers, bindingType);
        return new DogRepresentation(catModel);
      };

      // The cat generator is dependent on the dog runtime representation
      const dependentCatGenerator = function(property, bindingType) {
        // Get the cat dependency
        const dogModel = myDataBinder.getRepresentation(fido, bindingType);
        // We're pretending here that the cat runtime representation requires the dog representation.
        return new CatRepresentation(dogModel);
      };

      myDataBinder.defineRepresentation('PETSTORE', 'Test:Dog-1.0.0', dependentDogGenerator,
        { stateless: in_dogIsStateless });
      myDataBinder.defineRepresentation('PETSTORE', 'Test:Cat-1.0.0', dependentCatGenerator,
        { stateless: in_catIsStateless });

      // neither of these can really work
      expect((function() { myDataBinder.getRepresentation(fido, 'PETSTORE'); })).toThrow();
      expect((function() { myDataBinder.getRepresentation(whiskers, 'PETSTORE'); })).toThrow();
    };

    const testCycleBreak = function(in_dogIsStateless, in_catIsStateless) {
      myDataBinder.attachTo(workspace);

      const fido = PropertyFactory.create('Test:Dog-1.0.0', 'single');
      workspace.root.insert('Fido', fido);
      const hector = PropertyFactory.create('Test:Dog-1.0.0', 'single');
      workspace.root.insert('Hector', hector);
      const whiskers = PropertyFactory.create('Test:Cat-1.0.0', 'single');
      workspace.root.insert('Whiskers', whiskers);
      const tiger = PropertyFactory.create('Test:Cat-1.0.0', 'single');
      workspace.root.insert('Tiger', tiger);

      // The dog generator is dependent on the cat runtime representation, but we only get it in the initializer
      const dependentDogGenerator = function(property, bindingType) {
        // One of the constructors needs to connect the dependency in an initializer
        return new DogRepresentation();
      };

      const dogInitializer = function(dogRuntimeObject, property, bindingType) {
        // Get the cat dependency
        const catModel = myDataBinder.getRepresentation(whiskers, bindingType);
        // we're cheating here for the sake of the test, if dogs are really stateless they can't keep a "state"
        dogRuntimeObject._catModel = catModel;
      };

      // The cat generator is dependent on the dog runtime representation
      let dogModel;
      const dependentCatGenerator = function(property, bindingType) {
        // Get the dog dependency
        dogModel = myDataBinder.getRepresentation(fido, bindingType);
        // We're pretending here that the cat runtime representation requires the dog representation.
        return new CatRepresentation(dogModel);
      };

      myDataBinder.defineRepresentation('PETSTORE', 'Test:Dog-1.0.0', dependentDogGenerator, {
        initializer: dogInitializer,
        stateless: in_dogIsStateless
      });
      myDataBinder.defineRepresentation('PETSTORE', 'Test:Cat-1.0.0', dependentCatGenerator, {
        stateless: in_catIsStateless
      });

      // These should work
      const fidoRepresentation = myDataBinder.getRepresentation(fido, 'PETSTORE');
      const whiskersRepresentation = myDataBinder.getRepresentation(whiskers, 'PETSTORE');

      // Fido should have found whiskers
      expect(fidoRepresentation._catModel).toBeDefined();
      expect(fidoRepresentation._catModel).toBeInstanceOf(CatRepresentation);
      // If cats are stateless -> the representation will be created on demand hence not whiskers
      if (in_catIsStateless) {
        expect(fidoRepresentation._catModel).not.toBe(whiskersRepresentation);
      } else {
        expect(fidoRepresentation._catModel).toBe(whiskersRepresentation);
      }
      // If dogs are stateless, the cat generator should get the same representation as fido because it's
      // called from the dog initializer. If dogs are not stateless, it'll be the same representation anyway
      // because it's associated with the same Property.
      expect(dogModel).toBe(fidoRepresentation);
      // these should work and give different representations as well
      const hectorRepresentation = myDataBinder.getRepresentation(hector, 'PETSTORE');
      expect(hectorRepresentation).not.toBe(fidoRepresentation);
      const tigerRepresentation = myDataBinder.getRepresentation(tiger, 'PETSTORE');
      expect(tigerRepresentation).not.toBe(whiskersRepresentation);

    };
    const testStatelessHierarcy = function(in_animalIsStateless, in_dogIsStateless, in_catIsStateless) {
      // Define runtime representations for the various animals
      myDataBinder.defineRepresentation('PETSTORE', 'Test:Animal-1.0.0', () => new AnimalRepresentation(),
        { stateless: in_animalIsStateless }
      );
      myDataBinder.defineRepresentation('PETSTORE', 'Test:Dog-1.0.0', () => new DogRepresentation(),
        { stateless: in_dogIsStateless }
      );
      myDataBinder.defineRepresentation('PETSTORE', 'Test:Cat-1.0.0', () => new CatRepresentation(),
        { stateless: in_catIsStateless }
      );

      myDataBinder.attachTo(workspace);

      const fido = PropertyFactory.create('Test:Dog-1.0.0', 'single');
      workspace.root.insert('Fido', fido);
      const whiskers = PropertyFactory.create('Test:Cat-1.0.0', 'single');
      workspace.root.insert('Whiskers', whiskers);
      const hector = PropertyFactory.create('Test:Chinchilla-1.0.0', 'single');
      workspace.root.insert('Hector', hector);

      const fidoRuntime = myDataBinder.getRepresentation(fido, 'PETSTORE');
      expect(fidoRuntime).toBeDefined();
      expect(fidoRuntime).toBeInstanceOf(DogRepresentation);

      const whiskersRuntime = myDataBinder.getRepresentation(whiskers, 'PETSTORE');
      expect(whiskersRuntime).toBeDefined();
      expect(whiskersRuntime).toBeInstanceOf(CatRepresentation);

      // Chinchillas don't have a specialization, so we should get the animal runtime representation
      const hectorRuntime = myDataBinder.getRepresentation(hector, 'PETSTORE');
      expect(hectorRuntime).toBeDefined();
      expect(hectorRuntime).toBeInstanceOf(AnimalRepresentation);
    };

    it('should not be possible to associate a stateless runtime representation', function() {
      // Define a stateless runtime representation for dogs
      myDataBinder.defineRepresentation('PETSTORE', 'Test:Dog-1.0.0', () => new DogRepresentation(),
        { stateless: true });
      const fido = PropertyFactory.create('Test:Dog-1.0.0', 'single');
      const fidoRepresentation = new DogRepresentation();
      myDataBinder.attachTo(workspace);
      workspace.root.insert('Fido', fido);
      // Dogrepresentation is stateless, can't associate
      expect(function() { myDataBinder.associateRepresentation(fido, 'PETSTORE', fidoRepresentation); }).toThrow();
    });

    it('should be possible to define a stateless runtime representation and get it back everywhere', function() {
      // Define a stateless runtime representation for dogs
      myDataBinder.defineRepresentation('PETSTORE', 'Test:Dog-1.0.0', () => new DogRepresentation(),
        { stateless: true });

      const fido = PropertyFactory.create('Test:Dog-1.0.0', 'single');
      myDataBinder.attachTo(workspace);
      workspace.root.insert('Fido', fido);
      // Get the representation, which makes it exist
      const fidoRepresentation = myDataBinder.getRepresentation(fido, 'PETSTORE');
      // insert another dog
      const hector = PropertyFactory.create('Test:Dog-1.0.0', 'single');
      workspace.root.insert('Hector', hector);
      // Also get the representation for the second dog
      const hectorRepresentation = myDataBinder.getRepresentation(hector, 'PETSTORE');
      // Dog representations are stateless and created on the fly -> should be different
      expect(fidoRepresentation).not.toBe(hectorRepresentation);
      // insert yet another dog
      const molly = PropertyFactory.create('Test:Dog-1.0.0', 'single');
      workspace.root.insert('Molly', molly);
      // Also get the representation for this dog
      const mollyRepresentation = myDataBinder.getRepresentation(molly, 'PETSTORE');
      // Dog representations are stateless and created on the fly -> should again be different
      expect(fidoRepresentation).not.toBe(mollyRepresentation);
      expect(hectorRepresentation).not.toBe(mollyRepresentation);
    });

    it('should not be possible to redefine a stateless runtime representation', function() {
      // Define a stateless runtime representation for dogs
      myDataBinder.defineRepresentation('PETSTORE', 'Test:Dog-1.0.0', () => new DogRepresentation(),
        { stateless: true });
      // Try to redefine, should throw
      expect(function() {
        myDataBinder.defineRepresentation('PETSTORE', 'Test:Dog-1.0.0', () => new DogRepresentation(),
          { stateless: true });
      }).toThrow()
    });

    it('should not be possible to redefine a non-stateless representation with a stateless rep', function() {
      // Define a stateless runtime representation for dogs
      myDataBinder.defineRepresentation('PETSTORE', 'Test:Dog-1.0.0', () => new DogRepresentation());
      // Try to redefine, should throw
      expect(function() {
        myDataBinder.defineRepresentation('PETSTORE', 'Test:Dog-1.0.0', () => new DogRepresentation(),
          { stateless: true });
      }).toThrow();
    });

    it('should be able to break cycles with an initializer between stateless & stateful reps (part 1)', function() {
      testCycleBreak(true, false);
    });

    it('should be able to break cycles with an initializer between stateless & stateful reps (part 2)', function() {
      testCycleBreak(false, true);
    });

    it('should throw for a cycle in getRepresentation generators for stateless representations (part 1)', function() {
      testCycle(false, true);
    });

    it('should throw for a cycle in getRepresentation generators for stateless representations (part 2)', function() {
      testCycle(true, false);
    });

    it('should throw for a cycle in getRepresentation generators for stateless representations (part 3)', function() {
      testCycle(true, true);
    });

    it('should be possible to unregister runtime stateless representations', function() {
      const handle = myDataBinder.defineRepresentation('PETSTORE', 'Test:Dog-1.0.0', () => new DogRepresentation(), {
        stateless: true
      });

      // Get a workspace and insert a new property
      workspace.root.insert('Fido', PropertyFactory.create('Test:Dog-1.0.0', 'single'));

      myDataBinder.attachTo(workspace);

      // Request the runtime representation associated with the property
      const fido = myDataBinder.getRepresentation(workspace.root.get('Fido'), 'PETSTORE');
      expect(fido).toBeDefined();
      expect(fido).toBeInstanceOf(DogRepresentation);

      // unregister
      handle.destroy();

      // Should not get a runtime representation for it anymore
      const notFido = myDataBinder.getRepresentation(workspace.root.get('Fido'), 'PETSTORE');
      expect(notFido).toBeUndefined();
    });

    it('should not destroy a stateless representation when the property is removed', function() {

      myDataBinder.defineRepresentation('PETSTORE', 'Test:Dog-1.0.0', () => new DogRepresentation(), {
        stateless: true
      });

      // Get a workspace and insert a new property
      workspace.root.insert('Fido', PropertyFactory.create('Test:Dog-1.0.0', 'single'));

      myDataBinder.attachTo(workspace);

      // Request the runtime representation associated with the property
      const fido = myDataBinder.getRepresentation(workspace.root.get('Fido'), 'PETSTORE');
      expect(fido).toBeDefined();
      expect(fido).toBeInstanceOf(DogRepresentation);

      workspace.root.remove('Fido', PropertyFactory.create('Test:Dog-1.0.0', 'single'));

      // The property exists but is not in the workspace, no runtime representation
      expect((function() { myDataBinder.getRepresentation(fido, 'PETSTORE'); })).toThrow();
      // Another property should still give us the runtime representation
      workspace.root.insert('Hector', PropertyFactory.create('Test:Dog-1.0.0', 'single'));
      const hector = myDataBinder.getRepresentation(workspace.root.get('Hector'), 'PETSTORE');
      expect(hector).toBeDefined();
      expect(hector).toBeInstanceOf(DogRepresentation);
    });

    it('generator/initializer for a stateless representation should only be called for each prop', function() {
      // Register a property and an initializer
      const dogInitializer = jest.fn();
      const dogSpyGenerator = jest.fn(function() {
        return new DogRepresentation();
      });
      myDataBinder.defineRepresentation('PETSTORE', 'Test:Dog-1.0.0', dogSpyGenerator, {
        initializer: dogInitializer,
        stateless: true
      });

      // Get a workspace and insert a new property
      workspace.root.insert('Fido', PropertyFactory.create('Test:Dog-1.0.0', 'single'));

      myDataBinder.attachTo(workspace);

      // Request the runtime representation associated with the property
      const fido = myDataBinder.getRepresentation(workspace.root.get('Fido'), 'PETSTORE');
      expect(fido).toBeDefined();
      expect(fido).toBeInstanceOf(DogRepresentation);
      // Both generator & initializer should have been called
      expect(dogInitializer).toHaveBeenCalledTimes(1);
      expect(dogSpyGenerator).toHaveBeenCalledTimes(1);

      // Insert another dog
      workspace.root.insert('Hector', PropertyFactory.create('Test:Dog-1.0.0', 'single'));
      const hector = myDataBinder.getRepresentation(workspace.root.get('Hector'), 'PETSTORE');
      expect(hector).toBeDefined();
      expect(hector).toBeInstanceOf(DogRepresentation);
      expect(hector).not.toBe(fido);
      // generator & initializer should have been called again
      expect(dogInitializer).toHaveBeenCalledTimes(2);
      expect(dogSpyGenerator).toHaveBeenCalledTimes(2);
    });

    it('should be possible to define stateless hierarchical runtime representations (part 1)', function() {
      testStatelessHierarcy(true, false, false);
    });

    it('should be possible to define stateless hierarchical runtime representations (part 2)', function() {
      testStatelessHierarcy(true, true, false);
    });

    it('should be possible to define stateless hierarchical runtime representations (part 3)', function() {
      testStatelessHierarcy(true, false, true);
    });

    it('should be possible to define stateless hierarchical runtime representations (part 4)', function() {
      testStatelessHierarcy(false, true, true);
    });

    it('should be possible to define stateless hierarchical runtime representations (part 5)', function() {
      testStatelessHierarcy(true, true, true);
    });

    it('should destroy the stateless runtime representations when detaching', function() {
      myDataBinder.attachTo(workspace);

      const maker = jest.fn(function() {
        return new DogRepresentation();
      });
      myDataBinder.defineRepresentation('PETSTORE', 'Test:Dog-1.0.0', maker, {
        stateless: true
      });
      workspace.root.insert('Fido', PropertyFactory.create('Test:Dog-1.0.0', 'single'));

      // Request the representations associated with the property
      const fido = myDataBinder.getRepresentation(workspace.root.get('Fido'), 'PETSTORE');
      expect(maker).toHaveBeenCalledTimes(1);
      expect(fido).toBeDefined();
      expect(fido).toBeInstanceOf(DogRepresentation);

      // Detach -- this should destroy the representations
      myDataBinder.detach(false);

      maker.mockClear();
      myDataBinder.attachTo(workspace);

      // Shouldn't build since noone asked for it
      expect(maker).toHaveBeenCalledTimes(0);

      // After reattaching, getting the representation should specifically _recreate_ it (i.e. the maker
      // should get called again)
      const fido2 = myDataBinder.getRepresentation(workspace.root.get('Fido'), 'PETSTORE');

      // existential question. If you clone your dog, is it the same dog? What makes your dog _Fido_? Is it the
      // dna of Fido, or the dna and all of the experiences he lived through? For the purposes of this test, the
      // new fido is a different fido.
      expect(maker).toHaveBeenCalledTimes(1);
      expect(fido2).toBeDefined();
      expect(fido).not.toBe(fido2);
    });

    it('should be able to redefine stateless runtime representations after detach(true)/reattach', function() {
      myDataBinder.attachTo(workspace);

      const maker = jest.fn(function() {
        return new DogRepresentation();
      });
      myDataBinder.defineRepresentation('PETSTORE', 'Test:Dog-1.0.0', maker, {
        stateless: true
      });
      workspace.root.insert('Fido', PropertyFactory.create('Test:Dog-1.0.0', 'single'));

      // Request the representations associated with the property
      const fido = myDataBinder.getRepresentation(workspace.root.get('Fido'), 'PETSTORE');
      expect(maker).toHaveBeenCalledTimes(1);
      expect(fido).toBeDefined();
      expect(fido).toBeInstanceOf(DogRepresentation);

      // Detach -- this should destroy both the representations & the definitions
      myDataBinder.detach();

      maker.mockClear();
      myDataBinder.attachTo(workspace);
      // Shouldn't build since noone asked for it
      expect(maker).toHaveBeenCalledTimes(0);
      // After reattaching, getting the representation without redefining it should throw since we've destroyed
      // the definition too
      expect((function() { myDataBinder.getRepresentation(fido, 'PETSTORE'); })).toThrow();
      // now let's redefine it
      myDataBinder.defineRepresentation('PETSTORE', 'Test:Dog-1.0.0', maker, {
        stateless: true
      });
      // now it should work
      const fido2 = myDataBinder.getRepresentation(workspace.root.get('Fido'), 'PETSTORE');
      expect(maker).toHaveBeenCalledTimes(1);
      expect(fido2).toBeDefined();
      // ... and obviously it's a new representation (with a new definition)
      expect(fido).not.toBe(fido2);
    });

    it('should be possible unregister & redefine stateless representations', function() {
      // Define a representation
      const handle = myDataBinder.defineRepresentation('PETSTORE', 'Test:Dog-1.0.0', () => new DogRepresentation(), {
        stateless: true
      });

      // Get a workspace and insert a new property
      workspace.root.insert('Fido', PropertyFactory.create('Test:Dog-1.0.0', 'single'));

      myDataBinder.attachTo(workspace);

      // Request the runtime representation associated with the property
      const fido = myDataBinder.getRepresentation(workspace.root.get('Fido'), 'PETSTORE');
      expect(fido).toBeDefined();
      expect(fido).toBeInstanceOf(DogRepresentation);

      // unregister
      handle.destroy();

      // Should not get a runtime representation for it anymore
      const notFido = myDataBinder.getRepresentation(workspace.root.get('Fido'), 'PETSTORE');
      expect(notFido).toBeUndefined();

      // Register a new stateless representation for the same binding type & typeID
      myDataBinder.defineRepresentation('PETSTORE', 'Test:Dog-1.0.0', () => new DogRepresentation(), {
        stateless: true
      });
      const newFido = myDataBinder.getRepresentation(workspace.root.get('Fido'), 'PETSTORE');
      expect(newFido).toBeDefined();
      // note that after we undefine & redefine it will be a *different* stateless representation
      expect(newFido).toBeInstanceOf(DogRepresentation);
      expect(newFido).not.toBe(fido);
    });
  });
});

