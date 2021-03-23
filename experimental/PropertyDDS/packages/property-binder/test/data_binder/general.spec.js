/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/* globals expect  */

import {
  catchConsoleErrors, hadConsoleError, clearConsoleError, countConsoleMessages, endCountConsoleMessages
} from './catch_console_errors';


describe('General stuff', function () {

  // Silence the actual console.error, so the test logs are clean
  console.error = function () {
  };

  catchConsoleErrors();

  describe('testing functionality', function () {
    it('should fail if there is a console error', function () {
      expect(hadConsoleError()).toEqual(false);
      console.error('Intentional error');
      expect(hadConsoleError()).toEqual(true);
      clearConsoleError();
      expect(hadConsoleError()).toEqual(false);
    });

    it('should fail if there is an assert', function () {
      expect(hadConsoleError()).toEqual(false);
      console.assert(false, 'Intentional error');
      expect(hadConsoleError()).toEqual(true);
      clearConsoleError();
      expect(hadConsoleError()).toEqual(false);
    });

    it('should warn twice', function () {
      countConsoleMessages('warn');
      console.warn('Should not see this');
      console.warn('it is muted');
      expect(endCountConsoleMessages('warn')).toEqual(2);
    });

    it('should fail on caught throws that use console (a la HFDM)', function () {
      expect(hadConsoleError()).toEqual(false);
      try {
        throw new Error('Intentional error');
      } catch (error) {
        console.error(error);
      }
      expect(hadConsoleError()).toEqual(true);
      clearConsoleError();
      expect(hadConsoleError()).toEqual(false);
    });
  });

});
