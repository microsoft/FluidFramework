/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable no-prototype-builtins */
/* eslint-env jest */
import { PropertyFactory } from "@fluid-experimental/property-properties"

import { PropertyProxy, proxySymbol } from '../index';
import { bookDataTemplate } from './testSchemas';

describe('proxify ', () => {
  describe('proxySymbol ', () => {
    beforeAll(() => {
      PropertyFactory.register(bookDataTemplate);
    });

    it('should not be appended on primitives', () => {
      const property = PropertyFactory.create('String', 'single', 'TEST');
      const proxy = PropertyProxy.proxify(property);
      expect(proxy.hasOwnProperty(proxySymbol)).toEqual(false);
    });

    it('should be appended on custom properties', () => {
      const property = PropertyFactory.create(bookDataTemplate.typeid, 'single');
      const proxy = PropertyProxy.proxify(property);
      expect(proxySymbol in proxy).toEqual(true);
      expect(proxy.hasOwnProperty(proxySymbol)).toEqual(true);
    });

    it('should be appended on custom properties arrays', () => {
      const property = PropertyFactory.create(bookDataTemplate.typeid, 'array');
      const proxy = PropertyProxy.proxify(property);
      expect(proxySymbol in proxy).toEqual(true);
      expect(proxy.hasOwnProperty(proxySymbol)).toEqual(true);
    });

    it('should be appended on primitive properties arrays', () => {
      const property = PropertyFactory.create('String', 'array');
      const proxy = PropertyProxy.proxify(property);
      expect(proxySymbol in proxy).toEqual(true);
      expect(proxy.hasOwnProperty(proxySymbol)).toEqual(true);
    });

    it('should be appended on custom properties sets', () => {
      const property = PropertyFactory.create(bookDataTemplate.typeid, 'set');
      const proxy = PropertyProxy.proxify(property);
      expect(proxySymbol in proxy).toEqual(true);
      expect(proxy.hasOwnProperty(proxySymbol)).toEqual(true);
    });

    it('should be appended on custom properties maps', () => {
      const property = PropertyFactory.create(bookDataTemplate.typeid, 'map');
      const proxy = PropertyProxy.proxify(property);
      expect(proxySymbol in proxy).toEqual(true);
      expect(proxy.hasOwnProperty(proxySymbol)).toEqual(true);
    });
  });
});
