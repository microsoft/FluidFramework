/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/* globals should, sinon, expect */
import { DataBinder } from '../../src/data_binder/data_binder';
import { DataBinding,
  onValuesChanged,
  onPathChanged,
  onPropertyChanged } from '../../src/data_binder/data_binding';
import { catchConsoleErrors } from './catch_console_errors';
import { ModificationContext } from '../../src/data_binder/modification_context';

import { BaseProperty, HFDM, PropertyFactory } from '@adsk/forge-hfdm';

(function() {
  describe('Decorated DataBinding', function() {
    catchConsoleErrors();
    let hfdm, workspace, dataBinder;
    let testProp, dataBindingInstance;
    const infoTemplate = {
      properties: [
        {id: 'name', typeid: 'String'},
        {id: 'lastName', typeid: 'String'},
        {id: 'nickname', typeid: 'String'}
      ],
      typeid: 'test:personInfo-1.0.0'
    };

    const personTemplate = {
      inherits: ['test:personInfo-1.0.0'],
      properties: [
        {id: 'parent', typeid: 'test:personInfo-1.0.0'}
      ],
      typeid: 'test:person-1.0.0'
    };

    const createPerson = function() {
      return PropertyFactory.create(personTemplate.typeid);
    };

    const logData = [];
    const log = function(target, property, descriptor) {
      const original = descriptor.value;
      descriptor.value = sinon.spy(function(...args) {
        let path = args[0].getAbsolutePath();
        if (path[0] === '/') {
          path = path.slice(1);
        }
        logData.push(property + ' ' + path);
        return original.apply(this, args);
      });
      return descriptor;
    };

    // A decorator which adds a spy to a class method. This spy is per class and not per instance.
    const spyDecorator = function(target, property, descriptor) {
      const original = descriptor.value;
      descriptor.value = sinon.spy(function(...args) {
        return original.apply(this, args);
      });
      return descriptor;
    };

    /**
     * ES6 dataBindingInstance test class
     */
    class TestDataBindingClass extends DataBinding {

      /**
       * A callback to test the onPropertyChanged decorator registration.
       */
      @onPropertyChanged('name', ['modify'])
      @spyDecorator
      onPropertyRegisteredCallback() {
      }

      /**
       * Another callback to test the onPathChanged decorator registration.
       */
      @onPathChanged('lastName', ['modify'])
      @spyDecorator
      onPathRegisteredCallback() {
      }

      /**
       * Yet another callback to test the onValuesChanged decorator registration.
       */
      @onValuesChanged('nickname', ['modify'])
      @spyDecorator
      onValuesRegisteredCallback() {
      }

      /**
       * A callback to test if stacked registrations are feasible with decorators.
       */
      @onValuesChanged('parent.lastName', ['modify'])
      @onValuesChanged('parent.name', ['modify'])
      @spyDecorator
      commonCallback() {
      }

      /**
       * A callback to test if it is possible to register a decorated callback.
       * @param {ModificationContext} in_context The modification context
       */
      @onPathChanged('parent.lastName', ['modify'])
      @onPathChanged('parent.name', ['modify'])
      @log
      emptyCallback(in_context) {
      }

      /**
       * Another callback to showcase that decorator order matters.
       * @param {ModificationContext} in_context The modification context
       */
      @onPathChanged('parent.lastName', ['modify'])
      @log
      @onPathChanged('parent.name', ['modify'])
      anotherEmptyCallback(in_context) {
      }
    }

    before(function() {
      PropertyFactory.register(personTemplate);
      PropertyFactory.register(infoTemplate);

      hfdm = new HFDM();
      workspace = hfdm.createWorkspace();
      dataBinder = new DataBinder();
      return workspace.initialize({local: true}).then(function() {
        dataBinder.attachTo(workspace);
        dataBinder.register('View', personTemplate.typeid, TestDataBindingClass);
        testProp = createPerson();
        workspace.insert('person', testProp);
        dataBindingInstance = dataBinder.resolve('person', 'View');
      });
    });

    it('should have instantiated a TestDataBindingClass data binding', function() {
      should.exist(dataBindingInstance);
      expect(dataBindingInstance).instanceof(TestDataBindingClass);
    });

    it('should call onPropertyChange callback', function() {
      dataBindingInstance = dataBinder.resolve('person', 'View');
      testProp.get(['name']).setValue('John Foo');
      dataBindingInstance.onPropertyRegisteredCallback.callCount.should.equal(1);
      expect(dataBindingInstance.onPropertyRegisteredCallback.args[0][0]).to.be.an.instanceOf(BaseProperty);
    });

    it('should call onPathRegisteredCallback callback', function() {
      testProp.get(['lastName']).setValue('Bar');
      dataBindingInstance.onPathRegisteredCallback.callCount.should.equal(1);
      expect(dataBindingInstance.onPathRegisteredCallback.args[0][0]).to.be.an.instanceOf(ModificationContext);
    });

    it('should call onValuesRegisteredCallback callback', function() {
      testProp.get(['nickname']).setValue('Johnnie');
      dataBindingInstance.onValuesRegisteredCallback.callCount.should.equal(1);
      expect(dataBindingInstance.onValuesRegisteredCallback.args[0][0]).to.equal(testProp.get(['nickname']).value);
    });

    it('should register commonCallback for each of the stacked calls of the registration decorators', function() {
      let new_value = 'John Foobar';
      testProp.get(['parent', 'name']).setValue(new_value);
      expect(dataBindingInstance.commonCallback.args[0][0]).to.equal(new_value);
      new_value = 'Bar';
      testProp.get(['parent', 'lastName']).setValue(new_value);
      expect(dataBindingInstance.commonCallback.args[1][0]).to.equal(new_value);
      dataBindingInstance.commonCallback.callCount.should.equal(2);
    });

    it('should call decorated callbacks if some decorator changes the callback', function() {
      // Assuming a callback changes the callback function, e.g. a simple logging decorator,
      // the decorated callback should be registered. This is based on decorator order as callbacks are
      // chained.
      // @f
      // @g
      // @method
      // is evaluated as f(g(method))
      // if g doesn't change the methods descriptor value f(g(method)) will be f(method). This is why we can
      // stack our registration callbacks as they do not modify the descriptor.

      // logDecoratorSpy.resetHistory();
      dataBindingInstance.emptyCallback.resetHistory();
      dataBindingInstance.anotherEmptyCallback.resetHistory();
      logData.length = 0;
      let new_value = 'John Foobartoo';
      testProp.get(['parent', 'name']).setValue(new_value);
      // only emptyCallback is log decorated for parent.name and contains a spy
      // as @log is underneath the corresponding registration callback.
      dataBindingInstance.emptyCallback.callCount.should.equal(1);
      logData.length.should.equal(1);
      logData[0].should.equal('emptyCallback person.parent.name');
      new_value = 'Foobarthree';
      testProp.get(['parent', 'lastName']).setValue(new_value);
      // emptyCallback and anotherEmptyCallback are bot log decorated for parent.lastName
      // as @log is underneath the registration decorator.
      dataBindingInstance.emptyCallback.callCount.should.equal(2);
      dataBindingInstance.anotherEmptyCallback.callCount.should.equal(1);
      logData.length.should.equal(3);
      // should be in this order as we registered the emptyCallback callback first
      logData[1].should.equal('emptyCallback person.parent.lastName');
      logData[2].should.equal('anotherEmptyCallback person.parent.lastName');
    });

    it('should trigger the callback once', function() {
      const anotherPerson = createPerson();
      workspace.insert('anotherPerson', anotherPerson);
      const anotherDataBindingInstance = dataBinder.resolve('anotherPerson', 'View');
      // We need to reset the spy, as it is per class and was already called for our dataBindingInstance.
      anotherDataBindingInstance.onPropertyRegisteredCallback.resetHistory();
      anotherDataBindingInstance.onPropertyRegisteredCallback.callCount.should.equal(0);
      dataBindingInstance.onPropertyRegisteredCallback.callCount.should.equal(
        anotherDataBindingInstance.onPropertyRegisteredCallback.callCount);
      anotherPerson.get(['name']).setValue('Jack Foobar');
      anotherDataBindingInstance.onPropertyRegisteredCallback.callCount.should.equal(1);
    });

    it('Documentation example - onValuesChanged decorator', function() {
      /* eslint-disable require-jsdoc */
      // SnippetStart{onValueDecorator}
      var orderEntrySchema = {
        typeid: 'autodesk.samples:orderEntry-1.0.0',
        properties: [
          {id: 'productId', typeid: 'String'},
          {id: 'quantity', typeid: 'Int64'},
          {id: 'price', typeid: 'Float64'}
        ]
      };

      const eventLog = [];
      class OrderEntryDataBinding extends DataBinding {
        // Callback called when the 'quantity' sub-property is created/changed
        @onValuesChanged('quantity', ['insert', 'modify'])
        changeQuantity(value) {
          eventLog.push('Quantity changed: ' + value);
        }

        // Callback called when the 'price' sub-property is created/changed
        @onValuesChanged('price', ['insert', 'modify'])
        changePrice(value) {
          eventLog.push('Price changed: ' + value);
        }
      }
      // SnippetEnd{onValueDecorator}
      /* eslint-enable require-jsdoc */

      PropertyFactory.register(orderEntrySchema);
      dataBinder.register('MODEL', orderEntrySchema.typeid, OrderEntryDataBinding);
      const order = PropertyFactory.create(orderEntrySchema.typeid);
      workspace.insert('order', order);

      eventLog.length.should.equal(2);
      order.get('price').setValue(100);
      eventLog.length.should.equal(3);
      order.get('quantity').setValue(100);
      eventLog.length.should.equal(4);
    });
  });
})();
