/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { createLocalStorageConfigurationProxy } from "../../config";

interface TestConfig{
    number?: number;
    boolean?: boolean;
    string?: string;
    subobject?: TestConfig;
    [key: string]: unknown;
}

class LocalStorageMock {
    private store: Record<string, string> = {};
    constructor() {
      this.store = {};
    }

    get length() {
      return Object.keys(this.store).length;
    }
    key(i) {
      return Object.keys(this.store)[i];
    }

    clear() {
      this.store = {};
    }

    getItem(key) {
      return this.store[key] || null;
    }

    setItem(key, value) {
      this.store[key] = String(value);
    }

    removeItem(key) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete this.store[key];
    }
  }

  // eslint-disable-next-line dot-notation
  global["localStorage"] = new LocalStorageMock();

describe("LocalStorage Configuration", () => {
    beforeEach(()=>{
      localStorage.clear();
    });

    it("All values undefined", () => {
        const proxy = createLocalStorageConfigurationProxy<TestConfig>("fluid.test",{});
        assert.strictEqual(proxy.number,undefined);
        assert.strictEqual(proxy.boolean,undefined);
        assert.strictEqual(proxy.string,undefined);
        assert.strictEqual(proxy.subobject,undefined);
        assert.strictEqual(proxy.internal,undefined);
    });

    it("number in local storage", () => {
        localStorage.setItem("fluid.test.number","0");
        const proxy = createLocalStorageConfigurationProxy<TestConfig>("fluid.test",{});
        assert.strictEqual(proxy.number,0);
    });

    it("boolean in local storage", () => {
        localStorage.setItem("fluid.test.boolean","true");
        const proxy = createLocalStorageConfigurationProxy<TestConfig>("fluid.test",{});
        assert.strictEqual(proxy.boolean,true);
    });

    it("string in local storage", () => {
        localStorage.setItem("fluid.test.string","string");
        const proxy = createLocalStorageConfigurationProxy<TestConfig>("fluid.test",{});
        assert.strictEqual(proxy.string,"string");
    });

    it("Json subobject in local storage", () => {
        localStorage.setItem("fluid.test.subobject",JSON.stringify({ number: 5 }));
        const proxy = createLocalStorageConfigurationProxy<TestConfig>("fluid.test",{});
        assert.strictEqual(proxy.subobject?.number,5);
    });

    it("Expanded subobject in local storage", () => {
        localStorage.setItem("fluid.test.subobject.number","7");
        localStorage.setItem("fluid.test.subobject.subobject.boolean","false");
        const proxy = createLocalStorageConfigurationProxy<TestConfig>("fluid.test",{});
        assert.notStrictEqual(proxy.subobject?.subobject, undefined);
        assert.strictEqual(proxy.subobject?.number, 7);
        assert.strictEqual(proxy.subobject?.subobject?.boolean,false);
    });

    it("Json overrides expanded subobject in local storage", () => {
      localStorage.setItem("fluid.test.subobject",JSON.stringify({ number: 5 }));
      localStorage.setItem("fluid.test.subobject.number","7");
      localStorage.setItem("fluid.test.subobject.subobject.boolean","false");
      const proxy = createLocalStorageConfigurationProxy<TestConfig>("fluid.test",{});
      assert.strictEqual(proxy.subobject?.number, 5);
      assert.strictEqual(proxy.subobject?.subobject?.boolean, undefined);
  });
});
