/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview In this file, we will test the functions exported by deep_copy.js
 */
(function() {

  const DataArrays = require('../..').Datastructures.DataArrays;
  let error;

  describe('BaseDataArray', function() {
    it('should set, insert and remove some values in a (TypedArray) DataArray', function() {
      var myDataArray = new DataArrays.Int32DataArray(5);
      try {
        myDataArray.set(0, [1, 2, 3, 4, 5]);
        myDataArray.insertRange(2, [31, 32, 33]);
        myDataArray.removeRange(3, 4);
      } catch (e) {
        error = e;
      } finally {
        expect(error).to.equal(undefined);
        expect(myDataArray.length).to.equal(4);
        expect(Array.prototype.slice.call(myDataArray.getBuffer())).to.deep.equal([1, 2, 31, 5]);
      }
    });

    it('should set, insert and remove some values in a UniversalArray', function() {
      var myDataArray = new DataArrays.UniversalDataArray(5);
      try {
        console.log('UniversalArray: ', myDataArray);
        myDataArray.set(0, ['1', '2', '3', '4', '5']);
        myDataArray.insertRange(2, ['31', '32', '33']);
        myDataArray.removeRange(3, 4);
      } catch (e) {
        error = e;
      } finally {
        expect(error).to.equal(undefined);
        expect(myDataArray.length).to.equal(4);
        expect(Array.prototype.slice.call(myDataArray.getBuffer())).to.deep.equal(['1', '2', '31', '5']);
      }
    });

    it('should get all elements from array', function() {
      var myDataArray = new DataArrays.Int8DataArray(5);
      myDataArray.set(0, [1, 2, 3, 4, 5]);
      var subArray = myDataArray.getValueRange(0, 5);
      expect(subArray.length).to.equal(5);
    });

  });

  describe('BoolDataArray', function() {
    it('should set, insert and remove some values', function() {
      var myDataArray = new DataArrays.BoolDataArray(5);

      try {
        myDataArray.set(0, [1, 0, false, 1, true]);
        myDataArray.insertRange(2, [1, 0, false]);
        myDataArray.removeRange(3, 4);
      } catch (e) {
        error = e;
      } finally {
        expect(error).to.equal(undefined);
        expect(myDataArray.length).to.equal(4);
        expect(Array.prototype.slice.call(myDataArray.getBuffer())).to.deep.equal([true, false, true, true]);
      }
    });

    it('should get all elements from array', function() {
      var myDataArray = new DataArrays.BoolDataArray(5);
      myDataArray.set(0, [true, false, true, false, false]);
      var subArray = myDataArray.getValueRange(1, 4);
      expect(subArray.length).to.equal(3);
      expect(subArray).to.deep.equal([false, true, false]);
    });
  });
})();
