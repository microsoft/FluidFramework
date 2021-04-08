/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable no-unused-expressions */
/**
 * @fileoverview In this file,we will test property-common.Strings.joinPaths
 */
(function() {

  const joinPaths = require('../..').Strings.joinPaths;

  describe('property-common.Strings.joinPaths', function() {
    it('should exist', function() {
      expect(joinPaths).to.exist;
    });
  });
})();
