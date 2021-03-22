/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/* globals should, expect, sinon */
/* eslint-disable require-jsdoc */

import {
  registerTestTemplates
} from './testTemplates';
import { DataBinder } from '../../src/data_binder/data_binder';
import { DataBinding } from '../../src/data_binder/data_binding';

import { PropertyFactory } from '@fluid-experimental/property-properties';

class AnimalRepresentation {
}

class CatRepresentation extends AnimalRepresentation {
}

class DogRepresentation extends AnimalRepresentation {
}
const dogGenerator = function (in_property, bindingType, userData) {
  return new DogRepresentation();
};

describe('DataBinder runtime representations', function () {
  let hfdm, myDataBinder, workspace;

  beforeAll(function () {
    registerTestTemplates();
  });

  beforeEach(function () {
    hfdm = new HFDM();
    workspace = hfdm.createWorkspace();
    return workspace.initialize({ local: true }).then(function () {
      myDataBinder = new DataBinder();
    });
  });

  afterEach(function () {
    myDataBinder.detach();
  });

  describe('creation of runtime representations', function () {

    it('should work for the example in the documentation of defineRepresentation', function () {
      // NOTE: This is the example in the documentation, please keep it in tune!
      myDataBinder.defineRepresentation('PETSTORE', 'Test:Dog-1.0.0', () => new DogRepresentation());

      // Get an HFDM workspace and insert a new property
      workspace.insert('Fido', PropertyFactory.create('Test:Dog-1.0.0', 'single'));

      myDataBinder.attachTo(workspace);

      // Request the runtime representation associated with the property
      const fido = myDataBinder.getRepresentation(workspace.get('Fido'), 'PETSTORE');
      should.exist(fido);
      fido.should.be.instanceOf(DogRepresentation);
    });

    it('should handle register, attach, insert', function () {
      myDataBinder.defineRepresentation('PETSTORE', 'Test:Dog-1.0.0', () => new DogRepresentation());
      myDataBinder.attachTo(workspace);
      workspace.insert('Fido', PropertyFactory.create('Test:Dog-1.0.0', 'single'));

      // Request the runtime representation associated with the property
      const fido = myDataBinder.getRepresentation(workspace.get('Fido'), 'PETSTORE');
      should.exist(fido);
      fido.should.be.instanceOf(DogRepresentation);
    });

    it('should handle register, insert, attach', function () {
      myDataBinder.defineRepresentation('PETSTORE', 'Test:Dog-1.0.0', () => new DogRepresentation());
      workspace.insert('Fido', PropertyFactory.create('Test:Dog-1.0.0', 'single'));
      myDataBinder.attachTo(workspace);

      // Request the runtime representation associated with the property
      const fido = myDataBinder.getRepresentation(workspace.get('Fido'), 'PETSTORE');
      should.exist(fido);
      fido.should.be.instanceOf(DogRepresentation);
    });

    it('should handle attach, register, insert', function () {
      myDataBinder.attachTo(workspace);
      myDataBinder.defineRepresentation('PETSTORE', 'Test:Dog-1.0.0', () => new DogRepresentation());
      workspace.insert('Fido', PropertyFactory.create('Test:Dog-1.0.0', 'single'));

      // Request the runtime representation associated with the property
      const fido = myDataBinder.getRepresentation(workspace.get('Fido'), 'PETSTORE');
      should.exist(fido);
      fido.should.be.instanceOf(DogRepresentation);
    });

    it('should handle attach, insert, register', function () {
      myDataBinder.attachTo(workspace);
      workspace.insert('Fido', PropertyFactory.create('Test:Dog-1.0.0', 'single'));
      myDataBinder.defineRepresentation('PETSTORE', 'Test:Dog-1.0.0', () => new DogRepresentation());

      // Request the runtime representation associated with the property
      const fido = myDataBinder.getRepresentation(workspace.get('Fido'), 'PETSTORE');
      should.exist(fido);
      fido.should.be.instanceOf(DogRepresentation);
    });

    it('should handle insert, register, attach', function () {
      workspace.insert('Fido', PropertyFactory.create('Test:Dog-1.0.0', 'single'));
      myDataBinder.defineRepresentation('PETSTORE', 'Test:Dog-1.0.0', () => new DogRepresentation());
      myDataBinder.attachTo(workspace);

      // Request the runtime representation associated with the property
      const fido = myDataBinder.getRepresentation(workspace.get('Fido'), 'PETSTORE');
      should.exist(fido);
      fido.should.be.instanceOf(DogRepresentation);
    });

    it('should handle insert, attach, register', function () {
      workspace.insert('Fido', PropertyFactory.create('Test:Dog-1.0.0', 'single'));
      myDataBinder.attachTo(workspace);
      myDataBinder.defineRepresentation('PETSTORE', 'Test:Dog-1.0.0', () => new DogRepresentation());

      // Request the runtime representation associated with the property
      const fido = myDataBinder.getRepresentation(workspace.get('Fido'), 'PETSTORE');
      should.exist(fido);
      fido.should.be.instanceOf(DogRepresentation);
    });

    it('should destroy the runtime representations when detaching', function () {
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
      workspace.insert('Fido', PropertyFactory.create('Test:Dog-1.0.0', 'single'));

      // Request the representations associated with the property
      const fido = myDataBinder.getRepresentation(workspace.get('Fido'), 'PETSTORE');
      makerCalled.should.equal(true);
      should.exist(fido);
      fido.should.be.instanceOf(DogRepresentation);

      // Detach -- this should destroy the representations
      myDataBinder.detach(false);

      destroyerCalled.should.equal(true);

      makerCalled = false;
      myDataBinder.attachTo(workspace);

      // Shouldn't build since noone asked for it
      makerCalled.should.equal(false);

      // After reattaching, getting the representation should specifically _recreate_ it (i.e. the maker
      // should get called again)
      const fido2 = myDataBinder.getRepresentation(workspace.get('Fido'), 'PETSTORE');

      // existential question. If you clone your dog, is it the same dog? What makes your dog _Fido_? Is it the
      // dna of Fido, or the dna and all of the experiences he lived through? For the purposes of this test, the
      // new fido is a different fido.
      makerCalled.should.equal(true);
      should.exist(fido2);
      fido.should.not.equal(fido2);
    });

    it('should be possible to get a runtime representation from the databinding', function () {

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
      workspace.insert('Fido', fido);

      // The constructor of the databinding tried getting the runtime representation
      should.exist(representationFound);
      representationFound.should.be.instanceOf(DogRepresentation);
      representationFound.should.equal(myDataBinder.getRepresentation(fido, 'PETSTORE'));
    });

    it('should be possible to define in two binding types', function () {
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
      workspace.insert('Fido', fido);

      const model1 = myDataBinder.getRepresentation(fido, 'PETSTORE');
      should.exist(model1);
      model1.should.be.instanceOf(Representation1);

      const model2 = myDataBinder.getRepresentation(fido, 'KENNEL');
      should.exist(model2);
      model2.should.be.instanceOf(Representation2);
    });

    it('should be possible to define hierarchical runtime representations', function () {

      // Register a runtime representation
      myDataBinder.defineRepresentation('PETSTORE', 'Test:Animal-1.0.0', () => new AnimalRepresentation());
      myDataBinder.defineRepresentation('PETSTORE', 'Test:Dog-1.0.0', () => new DogRepresentation());
      myDataBinder.defineRepresentation('PETSTORE', 'Test:Cat-1.0.0', () => new CatRepresentation());

      myDataBinder.attachTo(workspace);

      const fido = PropertyFactory.create('Test:Dog-1.0.0', 'single');
      workspace.insert('Fido', fido);
      const whiskers = PropertyFactory.create('Test:Cat-1.0.0', 'single');
      workspace.insert('Whiskers', whiskers);
      const hector = PropertyFactory.create('Test:Chinchilla-1.0.0', 'single');
      workspace.insert('Hector', hector);

      const fidoRuntime = myDataBinder.getRepresentation(fido, 'PETSTORE');
      should.exist(fidoRuntime);
      fidoRuntime.should.be.instanceOf(DogRepresentation);

      const whiskersRuntime = myDataBinder.getRepresentation(whiskers, 'PETSTORE');
      should.exist(whiskersRuntime);
      whiskersRuntime.should.be.instanceOf(CatRepresentation);

      // Chinchillas don't have a specialization, so we should get the animal runtime representation
      const hectorRuntime = myDataBinder.getRepresentation(hector, 'PETSTORE');
      should.exist(hectorRuntime);
      hectorRuntime.should.be.instanceOf(AnimalRepresentation);
    });

    it('should not be possible to call getRepresentation without a workspace', function () {
      (function () { myDataBinder.getRepresentation(workspace.getRoot(), 'PETSTORE'); }).should.throw(Error);
    });

    it('should be possible to call getRepresentation in any order', function () {
      myDataBinder.attachTo(workspace);

      const fido = PropertyFactory.create('Test:Dog-1.0.0', 'single');
      workspace.insert('Fido', fido);
      const whiskers = PropertyFactory.create('Test:Cat-1.0.0', 'single');
      workspace.insert('Whiskers', whiskers);

      // A generator that is dependent on another runtime representation
      const dependentDogGenerator = function (property, bindingType) {
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
      should.exist(dogRepresentation1);
      should.exist(catRepresentation1);
      dogRepresentation1.should.be.instanceOf(DogRepresentation);
      catRepresentation1.should.be.instanceOf(CatRepresentation);

      // Now get the cat first
      const catRepresentation2 = myDataBinder.getRepresentation(whiskers, 'KENNEL');
      const dogRepresentation2 = myDataBinder.getRepresentation(fido, 'KENNEL');
      should.exist(dogRepresentation2);
      should.exist(catRepresentation2);
      dogRepresentation2.should.be.instanceOf(DogRepresentation);
      catRepresentation2.should.be.instanceOf(CatRepresentation);
    });

    it('should throw for a cycle in getRepresentation generators', function () {
      myDataBinder.attachTo(workspace);

      const fido = PropertyFactory.create('Test:Dog-1.0.0', 'single');
      workspace.insert('Fido', fido);
      const whiskers = PropertyFactory.create('Test:Cat-1.0.0', 'single');
      workspace.insert('Whiskers', whiskers);

      // The dog generator is dependent on the cat runtime representation
      const dependentDogGenerator = function (property, bindingType) {
        // Get the cat dependency
        const catModel = myDataBinder.getRepresentation(whiskers, bindingType);
        return new DogRepresentation(catModel);
      };

      // The cat generator is dependent on the dog runtime representation
      const dependentCatGenerator = function (property, bindingType) {
        // Get the cat dependency
        const dogModel = myDataBinder.getRepresentation(fido, bindingType);
        // We're pretending here that the cat runtime representation requires the dog representation.
        return new CatRepresentation(dogModel);
      };

      myDataBinder.defineRepresentation('PETSTORE', 'Test:Dog-1.0.0', dependentDogGenerator);
      myDataBinder.defineRepresentation('PETSTORE', 'Test:Cat-1.0.0', dependentCatGenerator);

      // neither of these can really work
      (function () { myDataBinder.getRepresentation(fido, 'PETSTORE'); }).should.throw(Error);
      (function () { myDataBinder.getRepresentation(whiskers, 'PETSTORE'); }).should.throw(Error);
    });

    it('should be able to break cycles with an initializer', function () {
      myDataBinder.attachTo(workspace);

      const fido = PropertyFactory.create('Test:Dog-1.0.0', 'single');
      workspace.insert('Fido', fido);
      const whiskers = PropertyFactory.create('Test:Cat-1.0.0', 'single');
      workspace.insert('Whiskers', whiskers);

      // The dog generator is dependent on the cat runtime representation, but we only get it in the initializer
      const dependentDogGenerator = function (property, bindingType) {
        // One of the constructors needs to connect the dependency in an initializer
        return new DogRepresentation();
      };

      const dogInitializer = function (dogRuntimeObject, property, bindingType) {
        // Get the cat dependency
        const catModel = myDataBinder.getRepresentation(whiskers, bindingType);
        dogRuntimeObject._catModel = catModel;
      };

      // The cat generator is dependent on the dog runtime representation
      const dependentCatGenerator = function (property, bindingType) {
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
      should.exist(fidoRepresentation._catModel);
      fidoRepresentation._catModel.should.equal(whiskersRepresentation);
    });

    it('should not be able to get unknown things', function () {
      // Get an HFDM workspace and insert a new property
      workspace.insert('Fido', PropertyFactory.create('Test:Dog-1.0.0', 'single'));

      myDataBinder.attachTo(workspace);

      // Request the runtime representation associated with the property - but there is none
      const fido = myDataBinder.getRepresentation(workspace.get('Fido'), 'PETSTORE');
      should.not.exist(fido);
    });

    it('should be possible to unregister runtime representations', function () {
      // Register a property and a destroyer
      let destroyerCalled = false;
      const destroyer = function () {
        destroyerCalled = true;
      };

      const handle = myDataBinder.defineRepresentation('PETSTORE', 'Test:Dog-1.0.0', () => new DogRepresentation(), {
        destroyer: destroyer
      });

      // Get an HFDM workspace and insert a new property
      workspace.insert('Fido', PropertyFactory.create('Test:Dog-1.0.0', 'single'));

      myDataBinder.attachTo(workspace);

      // Request the runtime representation associated with the property
      const fido = myDataBinder.getRepresentation(workspace.get('Fido'), 'PETSTORE');
      should.exist(fido);
      fido.should.be.instanceOf(DogRepresentation);

      // unregister
      handle.destroy();
      destroyerCalled.should.equal(true);

      // Should not get a runtime representation for it anymore
      const notFido = myDataBinder.getRepresentation(workspace.get('Fido'), 'PETSTORE');
      should.not.exist(notFido);
    });

    it('should be destroyed when the property is removed', function () {
      // Register a property and a destroyer
      let destroyerCalled = false;
      const destroyer = function () {
        destroyerCalled = true;
      };

      myDataBinder.defineRepresentation('PETSTORE', 'Test:Dog-1.0.0', () => new DogRepresentation(), {
        destroyer: destroyer
      });

      // Get an HFDM workspace and insert a new property
      workspace.insert('Fido', PropertyFactory.create('Test:Dog-1.0.0', 'single'));

      myDataBinder.attachTo(workspace);

      // Request the runtime representation associated with the property
      const fido = myDataBinder.getRepresentation(workspace.get('Fido'), 'PETSTORE');
      should.exist(fido);
      fido.should.be.instanceOf(DogRepresentation);

      workspace.remove('Fido', PropertyFactory.create('Test:Dog-1.0.0', 'single'));

      destroyerCalled.should.equal(true);

      // The property exists but is not in the workspace, no runtime representation
      (function () { myDataBinder.getRepresentation(fido, 'PETSTORE'); }).should.throw(Error);
    });

    it('should receive userdata in the generator and the destroyer', function () {
      // Register a property and a destroyer

      const theUserData = 'The User Data';
      let generatorGotUserData = false;
      let destroyerGotAllData = false;

      const generator = function (in_property, in_bindingType, in_userData) {
        generatorGotUserData = (in_userData === theUserData);
        return new DogRepresentation();
      };

      const destroyer = function (in_representation, in_bindingType, in_userData) {
        destroyerGotAllData = (in_userData === theUserData) && in_bindingType === 'PETSTORE';
      };

      myDataBinder.defineRepresentation('PETSTORE', 'Test:Dog-1.0.0', generator, {
        destroyer: destroyer,
        userData: theUserData
      });

      // Get an HFDM workspace and insert a new property
      workspace.insert('Fido', PropertyFactory.create('Test:Dog-1.0.0', 'single'));

      myDataBinder.attachTo(workspace);

      // Request the runtime representations associated with the property
      const fido = myDataBinder.getRepresentation(workspace.get('Fido'), 'PETSTORE');
      should.exist(fido);
      fido.should.be.instanceOf(DogRepresentation);

      generatorGotUserData.should.equal(true);
      destroyerGotAllData.should.equal(false);

      // Remove the object
      workspace.remove('Fido', PropertyFactory.create('Test:Dog-1.0.0', 'single'));

      generatorGotUserData.should.equal(true);
      destroyerGotAllData.should.equal(true);
    });

    it('should be able to unregister them all', function () {
      // Register some runtime representations
      myDataBinder.defineRepresentation('PETSTORE', 'Test:Dog-1.0.0', () => new DogRepresentation());
      myDataBinder.defineRepresentation('PETSTORE', 'Test:Cat-1.0.0', () => new CatRepresentation());

      myDataBinder.attachTo(workspace);

      // Insert a dog and a cat
      const fido = PropertyFactory.create('Test:Dog-1.0.0', 'single');
      workspace.insert('Fido', fido);

      const whiskers = PropertyFactory.create('Test:Cat-1.0.0', 'single');
      workspace.insert('Whiskers', whiskers);

      const model1 = myDataBinder.getRepresentation(fido, 'PETSTORE');
      should.exist(model1);
      model1.should.be.instanceOf(DogRepresentation);

      const model2 = myDataBinder.getRepresentation(whiskers, 'PETSTORE');
      should.exist(model2);
      model2.should.be.instanceOf(CatRepresentation);

      myDataBinder.undefineAllRepresentations('PETSTORE');

      should.not.exist(myDataBinder.getRepresentation(fido, 'PETSTORE'));
      should.not.exist(myDataBinder.getRepresentation(whiskers, 'PETSTORE'));
    });

    it('should work in arrays', function () {
      let destroyedCalled = false;
      const destroyer = function () {
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
      workspace.insert('dogArray', dogArray);

      dogArray.push(PropertyFactory.create('Test:Dog-1.0.0', 'single'));
      dogArray.push(PropertyFactory.create('Test:Dog-1.0.0', 'single'));
      dogArray.push(PropertyFactory.create('Test:Dog-1.0.0', 'single'));
      dogArray.push(PropertyFactory.create('Test:Dog-1.0.0', 'single'));

      const model1 = myDataBinder.getRepresentation(dogArray.get(0), 'PETSTORE');
      should.exist(model1);
      model1.should.be.instanceOf(DogRepresentation);

      const model2 = myDataBinder.getRepresentation(dogArray.get(3), 'PETSTORE');
      should.exist(model2);
      model2.should.be.instanceOf(DogRepresentation);

      destroyedCalled.should.equal(false);
      handle.destroy();
      destroyedCalled.should.equal(true);

      should.not.exist(myDataBinder.getRepresentation(dogArray.get(0), 'PETSTORE'));
    });

    it('should work for arrays', function () {
      let destroyedCalled = false;
      const destroyer = function () {
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
      workspace.insert('dogArray', dogArray);

      dogArray.push(PropertyFactory.create('Test:Dog-1.0.0', 'single'));
      dogArray.push(PropertyFactory.create('Test:Dog-1.0.0', 'single'));
      dogArray.push(PropertyFactory.create('Test:Dog-1.0.0', 'single'));
      dogArray.push(PropertyFactory.create('Test:Dog-1.0.0', 'single'));

      const model1 = myDataBinder.getRepresentation(dogArray, 'PETSTORE');
      should.exist(model1);
      model1.should.be.instanceOf(DogRepresentation);

      const model2 = myDataBinder.getRepresentation(dogArray.get(0), 'PETSTORE');
      should.not.exist(model2);

      destroyedCalled.should.equal(false);
      handle.destroy();
      destroyedCalled.should.equal(true);

      should.not.exist(myDataBinder.getRepresentation(dogArray, 'PETSTORE'));
    });

    it('should work in maps', function () {
      let destroyedCalled = false;
      const destroyer = function () {
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
      workspace.insert('dogMap', dogMap);

      dogMap.insert('fido', PropertyFactory.create('Test:Dog-1.0.0', 'single'));
      dogMap.insert('brutus', PropertyFactory.create('Test:Dog-1.0.0', 'single'));

      const model1 = myDataBinder.getRepresentation(dogMap.get('fido'), 'PETSTORE');
      should.exist(model1);
      model1.should.be.instanceOf(DogRepresentation);

      const model2 = myDataBinder.getRepresentation(dogMap.get('brutus'), 'PETSTORE');
      should.exist(model2);
      model2.should.be.instanceOf(DogRepresentation);

      destroyedCalled.should.equal(false);
      handle.destroy();
      destroyedCalled.should.equal(true);

      should.not.exist(myDataBinder.getRepresentation(dogMap.get('fido'), 'PETSTORE'));
    });
  });

  describe('misc', function () {
    it('should work for maps', function () {
      let destroyedCalled = false;
      const destroyer = function () {
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
      workspace.insert('dogMap', dogMap);

      dogMap.insert('fido', PropertyFactory.create('Test:Dog-1.0.0', 'single'));
      dogMap.insert('brutus', PropertyFactory.create('Test:Dog-1.0.0', 'single'));

      const model1 = myDataBinder.getRepresentation(dogMap, 'PETSTORE');
      should.exist(model1);
      model1.should.be.instanceOf(DogRepresentation);

      const model2 = myDataBinder.getRepresentation(dogMap.get('fido'), 'PETSTORE');
      should.not.exist(model2);

      destroyedCalled.should.equal(false);
      handle.destroy();
      destroyedCalled.should.equal(true);

      should.not.exist(myDataBinder.getRepresentation(dogMap, 'PETSTORE'));
    });

    it('should be possible to associate a runtime representation and get it', function () {
      myDataBinder.attachTo(workspace);

      myDataBinder.defineRepresentation('PETSTORE', 'Test:Animal-1.0.0', () => new AnimalRepresentation());
      const fido = PropertyFactory.create('Test:Dog-1.0.0', 'single');
      workspace.insert('Fido', fido);
      const mrSnuggums = PropertyFactory.create('Test:Dog-1.0.0', 'single');
      workspace.insert('Snuggums', mrSnuggums);

      const fidoRepresentation = new DogRepresentation();
      myDataBinder.associateRepresentation(fido, 'PETSTORE', fidoRepresentation);

      // Should get it back when we ask for it
      const fetchFido = myDataBinder.getRepresentation(fido, 'PETSTORE');
      should.exist(fetchFido);
      fetchFido.should.equal(fidoRepresentation);

      // Should still be able to get other representations
      const snuggumsRepresentation = myDataBinder.getRepresentation(mrSnuggums, 'PETSTORE');
      snuggumsRepresentation.should.be.instanceOf(AnimalRepresentation);
    });

    it('should still call the destructor on a rep supplied through associateRepresentation', function () {
      myDataBinder.attachTo(workspace);

      let destructorCalled = 0;
      let snuggumsRepresentation = undefined;

      myDataBinder.defineRepresentation('PETSTORE', 'Test:Animal-1.0.0', () => new AnimalRepresentation(), {
        destroyer: in_representation => {
          destructorCalled++;
        }
      });

      // Make some properties
      const fido = PropertyFactory.create('Test:Dog-1.0.0', 'single');
      workspace.insert('Fido', fido);
      const mrSnuggums = PropertyFactory.create('Test:Dog-1.0.0', 'single');
      workspace.insert('Snuggums', mrSnuggums);

      // Associate a runtime representation
      const fidoRepresentation = new DogRepresentation();
      myDataBinder.associateRepresentation(fido, 'PETSTORE', fidoRepresentation);

      // Get the other representation (i.e., construct from the defineRepresentation definition)
      snuggumsRepresentation = myDataBinder.getRepresentation(mrSnuggums, 'PETSTORE');
      snuggumsRepresentation.should.be.instanceOf(AnimalRepresentation);

      // Remove the fido property -- should call the destroyer callback to destroy the associated representation
      // Note, the destroyer associated with the base class, Test:Animal-1.0.0, will be called here.
      workspace.remove('Fido');
      destructorCalled.should.equal(1);

      // Remove the snuggums property -- should call the destroyer callback to destroy the constructed representation
      // Note, the destroyer associated with the base class, Test:Animal-1.0.0, will be called here.
      workspace.remove('Snuggums');
      destructorCalled.should.equal(2);
    });

    it('should not be possible to associate a runtime representation when not attached', function () {
      // Register a runtime representation for dogs
      myDataBinder.defineRepresentation('PETSTORE', 'Test:Dog-1.0.0', () => new DogRepresentation());

      const fido = PropertyFactory.create('Test:Dog-1.0.0', 'single');
      const fidoRepresentation = new DogRepresentation();

      // Not attached to a workspace; should fail
      (function () { myDataBinder.associateRepresentation(fido, 'PETSTORE', fidoRepresentation); })
        .should.throw(Error);

      myDataBinder.attachTo(workspace);

      // Attached to a workspace, but fido isn't in the workspace
      (function () { myDataBinder.associateRepresentation(fido, 'PETSTORE', fidoRepresentation); })
        .should.throw(Error);

      workspace.insert('Fido', fido);

      // Should work now
      myDataBinder.associateRepresentation(fido, 'PETSTORE', fidoRepresentation);
    });

    it('should not be able to override an existing representation', function () {
      const fido = PropertyFactory.create('Test:Dog-1.0.0', 'single');
      workspace.insert('Fido', fido);

      // Register a runtime representation
      myDataBinder.defineRepresentation('PETSTORE', 'Test:Dog-1.0.0', () => new DogRepresentation());

      myDataBinder.attachTo(workspace);
      // Get the representation, which makes it exist
      myDataBinder.getRepresentation(fido, 'PETSTORE');

      const fidoRepresentation = new DogRepresentation();

      // already exists
      (function () { myDataBinder.associateRepresentation(fido, 'PETSTORE', fidoRepresentation); })
        .should.throw(Error);
    });

    it('should throw when trying to get representation associated with a non-existing property', function () {

      // Register a data binding
      let representationFound;
      class DogDataBinding extends DataBinding {
        constructor(params) {
          super(params);

          representationFound = this.getRepresentation();
        }

        onRemove(in_removalContext) {
          // we don't have the associated Property anymore -> should throw
          (function () { this.getRepresentation(); }).should.throw(Error);
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
      workspace.insert('Fido', fido);

      // The constructor of the databinding tried getting the runtime representation
      should.exist(representationFound);
      representationFound.should.be.instanceOf(DogRepresentation);
      representationFound.should.equal(myDataBinder.getRepresentation(fido, 'PETSTORE'));

      // Remove the dog
      workspace.remove('Fido');
      should.not.exist(representationFound); // removed explicitly in onRemove()
      (function () { myDataBinder.getRepresentation(workspace.get('fido')); }).should.throw(Error);
    });

    it('should supply the empty context for classic function callbacks', function () {
      const myDogGenerator = sinon.spy(function () {
        should.not.exist(this);
        return new DogRepresentation();
      });

      const dogInitializer = sinon.spy(function () {
        should.not.exist(this);
      });

      const dogDestroyer = sinon.spy(function () {
        should.not.exist(this);
      });

      // Define a runtime representation for dogs with all possible callbacks
      const handle = myDataBinder.defineRepresentation('PETSTORE', 'Test:Dog-1.0.0', myDogGenerator, {
        initializer: dogInitializer,
        destroyer: dogDestroyer
      });

      const fido = PropertyFactory.create('Test:Dog-1.0.0', 'single');
      myDataBinder.attachTo(workspace);
      workspace.insert('Fido', fido);
      // Get the representation, which makes it exist
      const fidoRepresentation = myDataBinder.getRepresentation(fido, 'PETSTORE');
      fidoRepresentation.should.be.instanceOf(DogRepresentation);
      // Destroy it
      handle.destroy();
      // Check if all callbacks have been called
      myDogGenerator.callCount.should.equal(1);
      dogInitializer.callCount.should.equal(1);
      dogDestroyer.callCount.should.equal(1);
    });

    it('should not change the context for arrow function callbacks', function () {
      const myContext = this;
      let generatorCalled = false;
      let initializerCalled = false;
      let destroyedCalled = false;
      const myDogGenerator = () => {
        this.should.equal(myContext);
        generatorCalled = true;
        return new DogRepresentation();
      };

      const dogInitializer = () => {
        this.should.equal(myContext);
        initializerCalled = true;
      };

      const dogDestroyer = () => {
        this.should.equal(myContext);
        destroyedCalled = true;
      };

      // Define a runtime representation for dogs with all possible callbacks
      const handle = myDataBinder.defineRepresentation('PETSTORE', 'Test:Dog-1.0.0', myDogGenerator, {
        initializer: dogInitializer,
        destroyer: dogDestroyer
      });

      const fido = PropertyFactory.create('Test:Dog-1.0.0', 'single');
      myDataBinder.attachTo(workspace);
      workspace.insert('Fido', fido);
      // Get the representation, which makes it exist
      const fidoRepresentation = myDataBinder.getRepresentation(fido, 'PETSTORE');
      fidoRepresentation.should.be.instanceOf(DogRepresentation);
      // Destroy it
      handle.destroy();
      // Check if all callbacks have been called
      generatorCalled.should.equal(true);
      initializerCalled.should.equal(true);
      destroyedCalled.should.equal(true);
    });
  });

  describe('stateless runtime representations', function () {
    const testCycle = function (in_dogIsStateless, in_catIsStateless) {
      myDataBinder.attachTo(workspace);

      const fido = PropertyFactory.create('Test:Dog-1.0.0', 'single');
      workspace.insert('Fido', fido);
      const whiskers = PropertyFactory.create('Test:Cat-1.0.0', 'single');
      workspace.insert('Whiskers', whiskers);

      // The dog generator is dependent on the cat runtime representation
      const dependentDogGenerator = function (property, bindingType) {
        // Get the cat dependency
        const catModel = myDataBinder.getRepresentation(whiskers, bindingType);
        return new DogRepresentation(catModel);
      };

      // The cat generator is dependent on the dog runtime representation
      const dependentCatGenerator = function (property, bindingType) {
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
      (function () { myDataBinder.getRepresentation(fido, 'PETSTORE'); }).should.throw(Error);
      (function () { myDataBinder.getRepresentation(whiskers, 'PETSTORE'); }).should.throw(Error);
    };

    const testCycleBreak = function (in_dogIsStateless, in_catIsStateless) {
      myDataBinder.attachTo(workspace);

      const fido = PropertyFactory.create('Test:Dog-1.0.0', 'single');
      workspace.insert('Fido', fido);
      const hector = PropertyFactory.create('Test:Dog-1.0.0', 'single');
      workspace.insert('Hector', hector);
      const whiskers = PropertyFactory.create('Test:Cat-1.0.0', 'single');
      workspace.insert('Whiskers', whiskers);
      const tiger = PropertyFactory.create('Test:Cat-1.0.0', 'single');
      workspace.insert('Tiger', tiger);

      // The dog generator is dependent on the cat runtime representation, but we only get it in the initializer
      const dependentDogGenerator = function (property, bindingType) {
        // One of the constructors needs to connect the dependency in an initializer
        return new DogRepresentation();
      };

      const dogInitializer = function (dogRuntimeObject, property, bindingType) {
        // Get the cat dependency
        const catModel = myDataBinder.getRepresentation(whiskers, bindingType);
        // we're cheating here for the sake of the test, if dogs are really stateless they can't keep a "state"
        dogRuntimeObject._catModel = catModel;
      };

      // The cat generator is dependent on the dog runtime representation
      let dogModel;
      const dependentCatGenerator = function (property, bindingType) {
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
      should.exist(fidoRepresentation._catModel);
      fidoRepresentation._catModel.should.be.instanceOf(CatRepresentation);
      // If cats are stateless -> the representation will be created on demand hence not whiskers
      if (in_catIsStateless) {
        fidoRepresentation._catModel.should.not.equal(whiskersRepresentation);
      } else {
        fidoRepresentation._catModel.should.equal(whiskersRepresentation);
      }
      // If dogs are stateless, the cat generator should get the same representation as fido because it's
      // called from the dog initializer. If dogs are not stateless, it'll be the same representation anyway
      // because it's associated with the same Property.
      dogModel.should.equal(fidoRepresentation);
      // these should work and give different representations as well
      const hectorRepresentation = myDataBinder.getRepresentation(hector, 'PETSTORE');
      hectorRepresentation.should.not.equal(fidoRepresentation);
      const tigerRepresentation = myDataBinder.getRepresentation(tiger, 'PETSTORE');
      tigerRepresentation.should.not.equal(whiskersRepresentation);

    };
    const testStatelessHierarcy = function (in_animalIsStateless, in_dogIsStateless, in_catIsStateless) {
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
      workspace.insert('Fido', fido);
      const whiskers = PropertyFactory.create('Test:Cat-1.0.0', 'single');
      workspace.insert('Whiskers', whiskers);
      const hector = PropertyFactory.create('Test:Chinchilla-1.0.0', 'single');
      workspace.insert('Hector', hector);

      const fidoRuntime = myDataBinder.getRepresentation(fido, 'PETSTORE');
      should.exist(fidoRuntime);
      fidoRuntime.should.be.instanceOf(DogRepresentation);

      const whiskersRuntime = myDataBinder.getRepresentation(whiskers, 'PETSTORE');
      should.exist(whiskersRuntime);
      whiskersRuntime.should.be.instanceOf(CatRepresentation);

      // Chinchillas don't have a specialization, so we should get the animal runtime representation
      const hectorRuntime = myDataBinder.getRepresentation(hector, 'PETSTORE');
      should.exist(hectorRuntime);
      hectorRuntime.should.be.instanceOf(AnimalRepresentation);
    };

    it('should not be possible to associate a stateless runtime representation', function () {
      // Define a stateless runtime representation for dogs
      myDataBinder.defineRepresentation('PETSTORE', 'Test:Dog-1.0.0', () => new DogRepresentation(),
        { stateless: true });
      const fido = PropertyFactory.create('Test:Dog-1.0.0', 'single');
      const fidoRepresentation = new DogRepresentation();
      myDataBinder.attachTo(workspace);
      workspace.insert('Fido', fido);
      // Dogrepresentation is stateless, can't associate
      (function () { myDataBinder.associateRepresentation(fido, 'PETSTORE', fidoRepresentation); })
        .should.throw(Error);
    });

    it('should be possible to define a stateless runtime representation and get it back everywhere', function () {
      // Define a stateless runtime representation for dogs
      myDataBinder.defineRepresentation('PETSTORE', 'Test:Dog-1.0.0', () => new DogRepresentation(),
        { stateless: true });

      const fido = PropertyFactory.create('Test:Dog-1.0.0', 'single');
      myDataBinder.attachTo(workspace);
      workspace.insert('Fido', fido);
      // Get the representation, which makes it exist
      const fidoRepresentation = myDataBinder.getRepresentation(fido, 'PETSTORE');
      // insert another dog
      const hector = PropertyFactory.create('Test:Dog-1.0.0', 'single');
      workspace.insert('Hector', hector);
      // Also get the representation for the second dog
      const hectorRepresentation = myDataBinder.getRepresentation(hector, 'PETSTORE');
      // Dog representations are stateless and created on the fly -> should be different
      fidoRepresentation.should.not.equal(hectorRepresentation);
      // insert yet another dog
      const molly = PropertyFactory.create('Test:Dog-1.0.0', 'single');
      workspace.insert('Molly', molly);
      // Also get the representation for this dog
      const mollyRepresentation = myDataBinder.getRepresentation(molly, 'PETSTORE');
      // Dog representations are stateless and created on the fly -> should again be different
      fidoRepresentation.should.not.equal(mollyRepresentation);
      hectorRepresentation.should.not.equal(mollyRepresentation);
    });

    it('should not be possible to redefine a stateless runtime representation', function () {
      // Define a stateless runtime representation for dogs
      myDataBinder.defineRepresentation('PETSTORE', 'Test:Dog-1.0.0', () => new DogRepresentation(),
        { stateless: true });
      // Try to redefine, should throw
      (function () {
        myDataBinder.defineRepresentation('PETSTORE', 'Test:Dog-1.0.0', () => new DogRepresentation(),
          { stateless: true });
      }).should.throw(Error);
    });

    it('should not be possible to redefine a non-stateless representation with a stateless rep', function () {
      // Define a stateless runtime representation for dogs
      myDataBinder.defineRepresentation('PETSTORE', 'Test:Dog-1.0.0', () => new DogRepresentation());
      // Try to redefine, should throw
      (function () {
        myDataBinder.defineRepresentation('PETSTORE', 'Test:Dog-1.0.0', () => new DogRepresentation(),
          { stateless: true });
      }).should.throw(Error);
    });

    it('should be able to break cycles with an initializer between stateless & stateful reps (part 1)', function () {
      testCycleBreak(true, false);
    });

    it('should be able to break cycles with an initializer between stateless & stateful reps (part 2)', function () {
      testCycleBreak(false, true);
    });

    it('should throw for a cycle in getRepresentation generators for stateless representations (part 1)', function () {
      testCycle(false, true);
    });

    it('should throw for a cycle in getRepresentation generators for stateless representations (part 2)', function () {
      testCycle(true, false);
    });

    it('should throw for a cycle in getRepresentation generators for stateless representations (part 3)', function () {
      testCycle(true, true);
    });

    it('should be possible to unregister runtime stateless representations', function () {
      const handle = myDataBinder.defineRepresentation('PETSTORE', 'Test:Dog-1.0.0', () => new DogRepresentation(), {
        stateless: true
      });

      // Get an HFDM workspace and insert a new property
      workspace.insert('Fido', PropertyFactory.create('Test:Dog-1.0.0', 'single'));

      myDataBinder.attachTo(workspace);

      // Request the runtime representation associated with the property
      const fido = myDataBinder.getRepresentation(workspace.get('Fido'), 'PETSTORE');
      should.exist(fido);
      fido.should.be.instanceOf(DogRepresentation);

      // unregister
      handle.destroy();

      // Should not get a runtime representation for it anymore
      const notFido = myDataBinder.getRepresentation(workspace.get('Fido'), 'PETSTORE');
      should.not.exist(notFido);
    });

    it('should not destroy a stateless representation when the property is removed', function () {

      myDataBinder.defineRepresentation('PETSTORE', 'Test:Dog-1.0.0', () => new DogRepresentation(), {
        stateless: true
      });

      // Get an HFDM workspace and insert a new property
      workspace.insert('Fido', PropertyFactory.create('Test:Dog-1.0.0', 'single'));

      myDataBinder.attachTo(workspace);

      // Request the runtime representation associated with the property
      const fido = myDataBinder.getRepresentation(workspace.get('Fido'), 'PETSTORE');
      should.exist(fido);
      fido.should.be.instanceOf(DogRepresentation);

      workspace.remove('Fido', PropertyFactory.create('Test:Dog-1.0.0', 'single'));

      // The property exists but is not in the workspace, no runtime representation
      (function () { myDataBinder.getRepresentation(fido, 'PETSTORE'); }).should.throw(Error);
      // Another property should still give us the runtime representation
      workspace.insert('Hector', PropertyFactory.create('Test:Dog-1.0.0', 'single'));
      const hector = myDataBinder.getRepresentation(workspace.get('Hector'), 'PETSTORE');
      should.exist(hector);
      hector.should.be.instanceOf(DogRepresentation);
    });

    it('generator/initializer for a stateless representation should only be called for each prop', function () {
      // Register a property and an initializer
      const dogInitializer = sinon.spy();
      const dogSpyGenerator = sinon.spy(function () {
        return new DogRepresentation();
      });
      myDataBinder.defineRepresentation('PETSTORE', 'Test:Dog-1.0.0', dogSpyGenerator, {
        initializer: dogInitializer,
        stateless: true
      });

      // Get an HFDM workspace and insert a new property
      workspace.insert('Fido', PropertyFactory.create('Test:Dog-1.0.0', 'single'));

      myDataBinder.attachTo(workspace);

      // Request the runtime representation associated with the property
      const fido = myDataBinder.getRepresentation(workspace.get('Fido'), 'PETSTORE');
      should.exist(fido);
      fido.should.be.instanceOf(DogRepresentation);
      // Both generator & initializer should have been called
      dogInitializer.callCount.should.equal(1);
      dogSpyGenerator.callCount.should.equal(1);

      // Insert another dog
      workspace.insert('Hector', PropertyFactory.create('Test:Dog-1.0.0', 'single'));
      const hector = myDataBinder.getRepresentation(workspace.get('Hector'), 'PETSTORE');
      should.exist(hector);
      hector.should.be.instanceOf(DogRepresentation);
      hector.should.not.equal(fido);
      // generator & initializer should have been called again
      dogInitializer.callCount.should.equal(2);
      dogSpyGenerator.callCount.should.equal(2);
    });

    it('should be possible to define stateless hierarchical runtime representations (part 1)', function () {
      testStatelessHierarcy(true, false, false);
    });

    it('should be possible to define stateless hierarchical runtime representations (part 2)', function () {
      testStatelessHierarcy(true, true, false);
    });

    it('should be possible to define stateless hierarchical runtime representations (part 3)', function () {
      testStatelessHierarcy(true, false, true);
    });

    it('should be possible to define stateless hierarchical runtime representations (part 4)', function () {
      testStatelessHierarcy(false, true, true);
    });

    it('should be possible to define stateless hierarchical runtime representations (part 5)', function () {
      testStatelessHierarcy(true, true, true);
    });

    it('should destroy the stateless runtime representations when detaching', function () {
      myDataBinder.attachTo(workspace);

      const maker = sinon.spy(function () {
        return new DogRepresentation();
      });
      myDataBinder.defineRepresentation('PETSTORE', 'Test:Dog-1.0.0', maker, {
        stateless: true
      });
      workspace.insert('Fido', PropertyFactory.create('Test:Dog-1.0.0', 'single'));

      // Request the representations associated with the property
      const fido = myDataBinder.getRepresentation(workspace.get('Fido'), 'PETSTORE');
      maker.callCount.should.equal(1);
      should.exist(fido);
      fido.should.be.instanceOf(DogRepresentation);

      // Detach -- this should destroy the representations
      myDataBinder.detach(false);

      maker.resetHistory();
      myDataBinder.attachTo(workspace);

      // Shouldn't build since noone asked for it
      maker.callCount.should.equal(0);

      // After reattaching, getting the representation should specifically _recreate_ it (i.e. the maker
      // should get called again)
      const fido2 = myDataBinder.getRepresentation(workspace.get('Fido'), 'PETSTORE');

      // existential question. If you clone your dog, is it the same dog? What makes your dog _Fido_? Is it the
      // dna of Fido, or the dna and all of the experiences he lived through? For the purposes of this test, the
      // new fido is a different fido.
      maker.callCount.should.equal(1);
      should.exist(fido2);
      fido.should.not.equal(fido2);
    });

    it('should be able to redefine stateless runtime representations after detach(true)/reattach', function () {
      myDataBinder.attachTo(workspace);

      const maker = sinon.spy(function () {
        return new DogRepresentation();
      });
      myDataBinder.defineRepresentation('PETSTORE', 'Test:Dog-1.0.0', maker, {
        stateless: true
      });
      workspace.insert('Fido', PropertyFactory.create('Test:Dog-1.0.0', 'single'));

      // Request the representations associated with the property
      const fido = myDataBinder.getRepresentation(workspace.get('Fido'), 'PETSTORE');
      maker.callCount.should.equal(1);
      should.exist(fido);
      fido.should.be.instanceOf(DogRepresentation);

      // Detach -- this should destroy both the representations & the definitions
      myDataBinder.detach();

      maker.resetHistory();
      myDataBinder.attachTo(workspace);
      // Shouldn't build since noone asked for it
      maker.callCount.should.equal(0);
      // After reattaching, getting the representation without redefining it should throw since we've destroyed
      // the definition too
      (function () { myDataBinder.getRepresentation(fido, 'PETSTORE'); }).should.throw(Error);
      // now let's redefine it
      myDataBinder.defineRepresentation('PETSTORE', 'Test:Dog-1.0.0', maker, {
        stateless: true
      });
      // now it should work
      const fido2 = myDataBinder.getRepresentation(workspace.get('Fido'), 'PETSTORE');
      maker.callCount.should.equal(1);
      should.exist(fido2);
      // ... and obviously it's a new representation (with a new definition)
      fido.should.not.equal(fido2);
    });

    it('should be possible unregister & redefine stateless representations', function () {
      // Define a representation
      const handle = myDataBinder.defineRepresentation('PETSTORE', 'Test:Dog-1.0.0', () => new DogRepresentation(), {
        stateless: true
      });

      // Get an HFDM workspace and insert a new property
      workspace.insert('Fido', PropertyFactory.create('Test:Dog-1.0.0', 'single'));

      myDataBinder.attachTo(workspace);

      // Request the runtime representation associated with the property
      const fido = myDataBinder.getRepresentation(workspace.get('Fido'), 'PETSTORE');
      should.exist(fido);
      fido.should.be.instanceOf(DogRepresentation);

      // unregister
      handle.destroy();

      // Should not get a runtime representation for it anymore
      const notFido = myDataBinder.getRepresentation(workspace.get('Fido'), 'PETSTORE');
      should.not.exist(notFido);

      // Register a new stateless representation for the same binding type & typeID
      myDataBinder.defineRepresentation('PETSTORE', 'Test:Dog-1.0.0', () => new DogRepresentation(), {
        stateless: true
      });
      const newFido = myDataBinder.getRepresentation(workspace.get('Fido'), 'PETSTORE');
      should.exist(newFido);
      // note that after we undefine & redefine it will be a *different* stateless representation
      newFido.should.be.instanceOf(DogRepresentation);
      newFido.should.not.equal(fido);
    });
  });
});

