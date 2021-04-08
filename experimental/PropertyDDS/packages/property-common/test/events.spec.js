/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint max-nested-callbacks: 0 */
/**
 * @fileoverview In this file, we will test the functions exported by events.js
 */
(function() {

  const EventEmitter = require('..').Events.EventEmitter;

  describe('events', function() {
    var event;
    var triggered;

    beforeEach(function() {
      event = new EventEmitter();
      triggered = false;
    });

    it('should register and trigger an event', function(done) {

      var dataToSend = { test: 'tests' };
      var key = event.register('testEvent', function(data) {
        expect(data).to.equal(dataToSend);
        triggered = true;
      });

      expect(key).to.be.a('string');

      event.trigger('testEvent', event, dataToSend);

      expect(triggered).to.equal(true);

      done();
    });

    it('should unregister from an event', function(done) {

      var key = event.register('testEvent', function() {
        triggered = true;
      });

      expect(key).to.be.a('string');

      event.unregister('testEvent', key);

      event.trigger('testEvent', event);
      expect(triggered).to.equal(false);

      done();
    });

    describe('unregister', function() {
      describe('a registered event', function() {
        it('should return true', function(done) {
          var key = event.register('testEvent', function() {
            triggered = true;
          });
          expect(key).to.be.a('string');

          var retVal = event.unregister('testEvent', key);
          expect(retVal).to.be.equal(true);

          done();
        });
      });
      describe('an already unregistered event', function() {
        it('should return false', function(done) {
          var key = event.register('testEvent', function() {
            triggered = true;
          });
          expect(key).to.be.a('string');

          expect(event.unregister('testEvent', key)).to.be.equal(true);
          expect(event.unregister('testEvent', key)).to.be.equal(false);

          done();
        });
      });
      describe('an event that does not exist', function() {
        it('should return false', function(done) {
          expect(event.unregister('dummyEvent')).to.be.equal(false);
          done();
        });
      });
      describe('without using the key', function() {
        it('should not remove the event', function(done) {
          var key = event.register('testEvent', function() {
            triggered = true;
          });
          expect(key).to.be.a('string');
          expect(event.unregister('testEvent')).to.be.equal(false);

          event.trigger('testEvent', event);
          expect(triggered).to.equal(true);
          done();
        });
      });
    });

    describe('register', function() {
      describe('the same function multiple times', function() {
        it('should make it called multiple times on trigger', function(done) {
          var counter = 0;
          var keys = [];
          var n = 4;
          var listener = function() { counter++; };
          while (n--) {
            keys.push(event.register('testEvent', listener));
          }
          event.trigger('testEvent');
          expect(counter).to.equal(4);
          done();
        });
      });
    });


    describe('trigger', function() {
      describe('with no listeners', function() {
        it('should do nothing', function(done) {
          var fn = event.trigger.bind(event, 'testEvent');
          expect(fn).to.not.throw(Error);

          event.trigger('testEvent', {}, 'someParam');
          expect(triggered).to.equal(false);
          done();
        });
      });

      it('should call all registered listeners', function(done) {
        var triggerCount = [0, 0];

        var key1 = event.register('testEvent', function() {
          triggerCount[0]++;
        });
        var key2 = event.register('testEvent', function() {
          triggerCount[1]++;
        });

        expect(key1).to.be.a('string');
        expect(key2).to.be.a('string');
        expect(key1).to.not.equal(key2);

        event.trigger('testEvent');
        expect(triggerCount[0]).to.equal(1);
        expect(triggerCount[1]).to.equal(1);
        done();
      });

      it('should call only listeners registered for that event', function(done) {
        var triggerCount = [0, 0];

        var key1 = event.register('testEvent', function() {
          triggerCount[0]++;
        });
        var key2 = event.register('testOtherEvent', function() {
          triggerCount[1]++;
        });

        expect(key1).to.be.a('string');
        expect(key2).to.be.a('string');

        event.trigger('testEvent');
        expect(triggerCount[0]).to.equal(1);
        expect(triggerCount[1]).to.equal(0);

        triggerCount = [0, 0];
        event.trigger('testOtherEvent');
        expect(triggerCount[0]).to.equal(0);
        expect(triggerCount[1]).to.equal(1);
        done();
      });

      it('should pass the proper \'this\' to the listeners', function(done) {
        var dummyThis = {};

        var key = event.register('testEvent', function() {
          triggered = true;
          expect(this).to.equal(dummyThis);
        });
        expect(key).to.be.a('string');

        event.trigger('testEvent', dummyThis);
        expect(triggered).to.equal(true);

        done();
      });

      it('should pass the correct number of parameters to the listeners', function(done) {
        var nbArgs;

        var key = event.register('testEvent', function() {
          nbArgs = arguments.length;
        });
        expect(key).to.be.a('string');

        nbArgs = -1;
        event.trigger('testEvent', undefined);
        expect(nbArgs).to.equal(0);

        nbArgs = -1;
        event.trigger('testEvent', undefined, []);
        expect(nbArgs).to.equal(0);

        nbArgs = -1;
        event.trigger('testEvent', undefined, {});
        expect(nbArgs).to.equal(1);

        nbArgs = -1;
        event.trigger('testEvent', undefined, 'AString');
        expect(nbArgs).to.equal(1);

        nbArgs = -1;
        event.trigger('testEvent', undefined, [{}, 1, 'string']);
        expect(nbArgs).to.equal(3);

        event.unregister('testEvent', key);
        done();
      });

      it.skip('should test the new methods', function(done) {
        // setMaxListeners
        // emit
        // on
        // addListener
        // once
        // off
        // removeListener
        // removeAllListeners
        // listeners
        // listenerCount
      });
    });
  });
})();
