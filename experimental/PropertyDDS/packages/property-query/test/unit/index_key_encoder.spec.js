/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const IndexKeyEncoder = require('../../src/utils/index_key_encoder');

describe('Index key encoder', () => {
  let encoder;

  describe('for strings', () => {
    before(() => {
      encoder = new IndexKeyEncoder([{ name: 'name', typeId: 'String' }]);
    });

    const values = [
      ['', '\x01\x00'],
      ['\x00', '\x01\x00\uffff\x00'],
      ['\x01', '\x01\x01\x00'],
      ['"hello', '\x01"hello\x00'],
      ['.world', '\x01.world\x00'],
      ['hey\x00there', '\x01hey\x00\uffffthere\x00'],
      ['hey\x01there', '\x01hey\x01there\x00'],
      ['heythere', '\x01heythere\x00'],
      ['hey\u{1F9C9}there', '\x01hey\u{1F9C9}there\x00'],
      ['nothing', '\x01nothing\x00'],
      ['special', '\x01special\x00']
    ];

    it('should properly encode and sort values', () => {
      let encodedValues = [];
      let encoded;
      for (const value of values) {
        encoded = encoder.encode([value[0]]);
        encodedValues.push(encoded);
      }
      encodedValues.sort();
      expect(encodedValues).to.eql(values.map((item) => item[1]));
    });

    it('should properly decode values', () => {
      for (const value of values) {
        expect(encoder.decode(value[1])[0]).to.eql(value[0]);
      }
    });
  });

  describe('for paths', () => {
    before(() => {
      encoder = new IndexKeyEncoder([{ name: 'parentPath', typeId: 'Path' }]);
    });

    const values = [
      ['a', '\x05\x01a\x00\x00'],
      ['a.b', '\x05\x01a\x00\x01b\x00\x00'],
      ['a.b[c]', '\x05\x01a\x00\x01b\x00\x01c\x00\x00'],
      ['a.b[c].d', '\x05\x01a\x00\x01b\x00\x01c\x00\x01d\x00\x00'],
      ['"a.b"', '\x05\x01a.b\x00\x00'],
      ['"a.b"[c]', '\x05\x01a.b\x00\x01c\x00\x00'],
      ['"a.b"[c].d', '\x05\x01a.b\x00\x01c\x00\x01d\x00\x00'],
      ['"a.b[c]"', '\x05\x01a.b[c]\x00\x00'],
      ['"a.b[c]".d', '\x05\x01a.b[c]\x00\x01d\x00\x00'],
      ['"a.b[c].d"', '\x05\x01a.b[c].d\x00\x00'],
      ['ab', '\x05\x01ab\x00\x00']
    ];

    it('should properly encode and sort values', () => {
      let encodedValues = [];
      let encoded;
      for (const value of values) {
        encoded = encoder.encode([value[0]]);
        encodedValues.push(encoded);
      }
      encodedValues.sort();
      expect(encodedValues).to.eql(values.map((item) => item[1]));
    });

    it('should properly decode values', () => {
      // Decoded values are different because separators are always dots
      const decodedValues = ['a', 'a.b', 'a.b.c', 'a.b.c.d', '"a.b"', '"a.b".c', '"a.b".c.d',
        '"a.b[c]"', '"a.b[c]".d', '"a.b[c].d"', 'ab'];
      for (let i = 0; i < values.length; i++) {
        expect(encoder.decode(values[i][1])[0]).to.eql(decodedValues[i]);
      }
    });
  });

  describe('for integers', () => {
    before(() => {
      encoder = new IndexKeyEncoder([{ name: 'number', typeId: 'Integer' }]);
    });

    const values = [
      [[0x3C69535B, 0xFEA29BCA, true], '\x0Cfea29bca3c69535a'],
      [[0x716265B8, 0xFFFFFFB9, true], '\x0Fb9716265b7'],
      [-20404, '\x12b04b'],
      [-42, '\x13d5'],
      [0, '\x14'],
      [42, '\x152a'],
      [20404, '\x164fb4'],
      [[0x8E9D9A48, 0x46, true], '\x19468e9d9a48'],
      [[0xC396ACA5, 0x015D6435, true], '\x1C015d6435c396aca5'],
      [[0x57806AF6, 0x8E923BC7, false], '\x1C8e923bc757806af6'],
      [[0xFFFFFFFF, 0xFFFFFFFF, false], '\x1Cffffffffffffffff']
    ];

    it('should properly sort values of different length', () => {
      let encodedValues = [];
      let encoded;
      for (const value of values) {
        encoded = encoder.encode([value[0]]);
        encodedValues.push(encoded);
      }
      encodedValues.sort();
      expect(encodedValues).to.eql(values.map((item) => item[1]));
    });

    it('should properly decode values', () => {
      for (const value of values) {
        expect(encoder.decode(value[1])[0]).to.eql(value[0]);
      }
    });
  });

  describe('for booleans', () => {
    before(() => {
      encoder = new IndexKeyEncoder([{ name: 'havingFun', typeId: 'Boolean' }]);
    });

    const values = [
      [false, '\x26'],
      [true, '\x27']
    ];

    it('should properly sort values of different length', () => {
      let encodedValues = [];
      let encoded;
      for (const value of values) {
        encoded = encoder.encode([value[0]]);
        encodedValues.push(encoded);
      }
      encodedValues.sort();
      expect(encodedValues).to.eql(values.map((item) => item[1]));
    });

    it('should properly decode values', () => {
      for (const value of values) {
        expect(encoder.decode(value[1])[0]).to.eql(value[0]);
      }
    });
  });

  describe('for single (Float32)', () => {
    before(() => {
      encoder = new IndexKeyEncoder([{ name: 'scienceStuff', typeId: 'Single' }]);
    });

    const values = [
      [-3.4028234663852886e+38, '\x2000800000'],
      [-3.1415927410125732, '\x203fb6f024'],
      [-1, '\x20407fffff'],
      [-1.1754943508222875e-38, '\x207f7fffff'],
      [-1.401298464324817e-45, '\x207ffffffe'],
      [0, '\x2080000000'],
      [1.401298464324817e-45, '\x2080000001'],
      [1.1754943508222875e-38, '\x2080800000'],
      [1, '\x20bf800000'],
      [3.1415927410125732, '\x20c0490fdb'],
      [3.4028234663852886e+38, '\x20ff7fffff']
    ];

    it('should properly encode and sort values', () => {
      let encodedValues = [];
      let encoded;
      for (const value of values) {
        encoded = encoder.encode([value[0]]);
        encodedValues.push(encoded);
      }
      encodedValues.sort();
      expect(encodedValues).to.eql(values.map((item) => item[1]));
    });

    it('should properly decode values', () => {
      for (const value of values) {
        expect(encoder.decode(value[1])[0]).to.eql(value[0]);
      }
    });
  });

  describe('for double (Float64)', () => {
    before(() => {
      encoder = new IndexKeyEncoder([{ name: 'scienceStuff', typeId: 'Double' }]);
    });

    const values = [
      [-1.7976931348623157e+308, '\x210010000000000000'],
      [-3.141592653589793, '\x213ff6de04abbbd2e7'],
      [-1, '\x21400fffffffffffff'],
      [-2.2250738585072014e-308, '\x217fefffffffffffff'],
      [-5e-324, '\x217ffffffffffffffe'],
      [0, '\x218000000000000000'],
      [5e-324, '\x218000000000000001'],
      [2.2250738585072014e-308, '\x218010000000000000'],
      [1, '\x21bff0000000000000'],
      [3.141592653589793, '\x21c00921fb54442d18'],
      [1.7976931348623157e+308, '\x21ffefffffffffffff']
    ];

    it('should properly encode and sort values', () => {
      let encodedValues = [];
      let encoded;
      for (const value of values) {
        encoded = encoder.encode([value[0]]);
        encodedValues.push(encoded);
      }
      encodedValues.sort();
      expect(encodedValues).to.eql(values.map((item) => item[1]));
    });

    it('should properly decode values', () => {
      for (const value of values) {
        expect(encoder.decode(value[1])[0]).to.eql(value[0]);
      }
    });
  });

  describe('for tuples', () => {
    before(() => {
      encoder = new IndexKeyEncoder([
        { name: 'parentPath', typeId: 'Path' },
        { name: 'name', typeId: 'String' },
        { name: 'age', typeId: 'Integer' },
        { name: 'havingFun', typeId: 'Boolean' },
        { name: 'scienceStuff', typeId: 'Double' }
      ]);
    });

    const values = [
      [[undefined, undefined, undefined, undefined, undefined], '\x00\uffff\x00\uffff\x00\uffff\x00\uffff\x00\uffff'],
      [[undefined, undefined, 0, undefined, undefined], '\x00\uffff\x00\uffff\x14\x00\uffff\x00\uffff'],
      [[undefined, 'Pier-Luc', undefined, false, undefined], '\x00\uffff\x01Pier-Luc\x00\x00\uffff\x26\x00\uffff'],
      [['a.b', undefined, 1234, true, undefined], '\x05\x01a\x00\x01b\x00\x00\x00\uffff\x1604d2\x27\x00\uffff'],
      [['a.b', 'Martin', undefined, true, undefined],
        '\x05\x01a\x00\x01b\x00\x00\x01Martin\x00\x00\uffff\x27\x00\uffff'],
      [['a.b', 'Martin', -1234567890, true, undefined],
        '\x05\x01a\x00\x01b\x00\x00\x01Martin\x00\x10b669fd2d\x27\x00\uffff'],
      [['a.b', 'Martin', 35, undefined, undefined],
        '\x05\x01a\x00\x01b\x00\x00\x01Martin\x00\x1523\x00\uffff\x00\uffff'],
      [['a.b', 'Martin', 35, false, undefined], '\x05\x01a\x00\x01b\x00\x00\x01Martin\x00\x1523\x26\x00\uffff'],
      [['a.b', 'Martin', 35, true, undefined], '\x05\x01a\x00\x01b\x00\x00\x01Martin\x00\x1523\x27\x00\uffff'],
      [['a.b', 'Martin', 35, true, 2.718281828459045],
        '\x05\x01a\x00\x01b\x00\x00\x01Martin\x00\x1523\x27\x21c005bf0a8b145769'],
      [['a.b', 'Martin', 35, true, 5.486124068793689e+303],
        '\x05\x01a\x00\x01b\x00\x00\x01Martin\x00\x1523\x27\x21ff00000000000000'],
      [['a.b', 'Martin', 1234567890, undefined, undefined],
        '\x05\x01a\x00\x01b\x00\x00\x01Martin\x00\x18499602d2\x00\uffff\x00\uffff'],
      [['a.b', '\u{1F9C9}', undefined, undefined, undefined],
        '\x05\x01a\x00\x01b\x00\x00\x01\u{1F9C9}\x00\x00\uffff\x00\uffff\x00\uffff'],
      [['youssef', undefined, undefined, undefined, undefined],
        '\x05\x01youssef\x00\x00\x00\uffff\x00\uffff\x00\uffff\x00\uffff']
    ];

    it('should properly sort tuples', () => {
      let encodedValues = [];
      let encoded;
      for (const value of values) {
        encoded = encoder.encode(value[0]);
        encodedValues.push(encoded);
      }
      encodedValues.sort();
      expect(encodedValues).to.eql(values.map((item) => item[1]));
    });

    it('should properly decode values', () => {
      let decoded;
      for (const value of values) {
        decoded = encoder.decode(value[1]);
        for (let i = 0; i < decoded.length; i++) {
          expect(decoded[i]).to.eql(value[0][i]);
        }
      }
    });
  });
});
