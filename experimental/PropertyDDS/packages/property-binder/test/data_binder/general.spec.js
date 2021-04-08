/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/* globals expect  */

import {
  catchConsoleErrors, hadConsoleError, clearConsoleError, countConsoleMessages, endCountConsoleMessages
} from './catch_console_errors';

(function() {

  describe('General stuff', function() {

    // Silence the actual console.error, so the test logs are clean
    console.error = function() {
    };

    catchConsoleErrors();

    describe('testing functionality', function() {
      it('should fail if there is a console error', function() {
        hadConsoleError().should.equal(false);
        console.error('Intentional error');
        hadConsoleError().should.equal(true);
        clearConsoleError();
        hadConsoleError().should.equal(false);
      });

      it('should fail if there is an assert', function() {
        hadConsoleError().should.equal(false);
        console.assert(false, 'Intentional error');
        hadConsoleError().should.equal(true);
        clearConsoleError();
        hadConsoleError().should.equal(false);
      });

      it('should warn twice', function() {
        countConsoleMessages('warn');
        console.warn('Should not see this');
        console.warn('it is muted');
        endCountConsoleMessages('warn').should.equal(2);
      });

      it('should fail on caught throws that use console (a la HFDM)', function() {
        hadConsoleError().should.equal(false);
        try {
          throw new Error('Intentional error');
        } catch (error) {
          console.error(error);
        }
        hadConsoleError().should.equal(true);
        clearConsoleError();
        hadConsoleError().should.equal(false);
      });
    });

  });
})();
