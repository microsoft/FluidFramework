/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
const chai = require('chai');
const expect = chai.expect;
const requirejs = require('requirejs');

describe('UMD', function() {
  this.timeout(15000);

  describe('CommonJs', function() {
    it('should import DataBinder', function() {
      const dataBinder = require('../../dist/lib/@adsk/forge-appfw-databinder');
      expect(new dataBinder.DataBinder()).to.be.an.instanceof(dataBinder.DataBinder);
    });
  });

  describe('AMD', function() {
    it('should import DataBinder', function() {
      // TODO: This should actually be run in the browser.
      // May not work as expected right now, because requirejs uses the node loader when used like this.
      requirejs(['../../dist/lib/@adsk/forge-appfw-databinder'], function(dataBinder) {
        expect(new dataBinder.DataBinder()).to.be.an.instanceof(dataBinder.DataBinder);
      });
    });
  });
});
