/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable no-unused-expressions */
/* eslint-disable require-jsdoc */
/* globals expect */
import { DataBinder } from '../data_binder/dataBinder';
import { MockSharedPropertyTree } from './mockSharedPropertyTree';
import {
  catchConsoleErrors
} from './catchConsoleError';

import { DataBinding } from '../data_binder/dataBinding';
import { PropertyFactory } from '@fluid-experimental/property-properties';
import { UpgradeType } from '..';

const versions = [
  'test1:mytype-0.0.9',
  'test1:mytype-1.0.0',
  'test1:mytype-1.0.1',
  'test1:mytype-1.0.2',
  'test1:mytype-1.0.3',
  'test1:mytype-1.1.0',
  'test1:mytype-1.2.0',
  'test1:mytype-1.3.0',
  'test1:mytype-2.0.0',
  'test1:mytype-2.0.1',
  'test1:mytype-3.0.0',
  'test1:mytype-4.0.0'
];

class D100 extends DataBinding {
}

class D102 extends DataBinding {
}

class D120 extends DataBinding {
}

class D200 extends DataBinding {
}

class D400 extends DataBinding {
}

describe('DataBinder databinding semversioning', function() {

  let dataBinder;
  let workspace;

  // Silence the actual console.error, so the test logs are clean
  console.error = function() {
  };

  catchConsoleErrors();

  beforeEach(async function() {

    workspace = await MockSharedPropertyTree();
    dataBinder = new DataBinder();
    // Bind to the workspace
    dataBinder.attachTo(workspace);
  });

  afterEach(function() {
    // Unbind checkout view
    dataBinder.detach();
    dataBinder = null;
  });

  describe('inheritance cases, scenario 1', function() {
    beforeAll(function() {
      versions.forEach((version) => {
        PropertyFactory.register({
          typeid: version,
          properties: [
          ]
        });
      });

      PropertyFactory.register({
        typeid: 'test1:inheritMyType-1.0.0',
        inherits: 'test1:mytype-1.0.1',
        properties: []
      });

      PropertyFactory.register({
        typeid: 'test1:inheritMyType-2.0.0',
        inherits: 'test1:mytype-1.2.0',
        properties: []
      });

      PropertyFactory.register({
        typeid: 'test1:myrelationship-1.0.0',
        inherits: ['RelationshipProperty'],
        properties: []
      });
    });

    it('versioning, define', function() {
      versions.forEach((version) => {
        const nodots = version.replace(/\./g, '_');
        workspace.root.insert(nodots, PropertyFactory.create(version));
      });

      dataBinder.defineDataBinding('bindingtype', 'test1:mytype-1.0.0', D100, {
        upgradeType: UpgradeType.MINOR
      });

      dataBinder.defineDataBinding('bindingtype', 'test1:mytype-1.0.2', D102, {
        upgradeType: UpgradeType.PATCH
      });

      dataBinder.defineDataBinding('bindingtype', 'test1:mytype-1.2.0', D120, {
        upgradeType: UpgradeType.MINOR
      });

      dataBinder.defineDataBinding('bindingtype', 'test1:mytype-2.0.0', D200, {
        upgradeType: UpgradeType.MAJOR
      });

      dataBinder.defineDataBinding('bindingtype', 'test1:mytype-4.0.0', D400, {
        upgradeType: UpgradeType.MAJOR
      });

      // Activate everything
      dataBinder.activateDataBinding('bindingtype', 'test1:mytype-1.0.0');
      dataBinder.activateDataBinding('bindingtype', 'test1:mytype-1.0.2');
      dataBinder.activateDataBinding('bindingtype', 'test1:mytype-1.2.0');
      dataBinder.activateDataBinding('bindingtype', 'test1:mytype-2.0.0');
      dataBinder.activateDataBinding('bindingtype', 'test1:mytype-4.0.0');

      // Nothing defined for 0_0_9
      expect(dataBinder.resolve('/test1:mytype-0_0_9', 'bindingtype')).toBeUndefined();

      // We defined 1_0_0
      expect(dataBinder.resolve('/test1:mytype-1_0_0', 'bindingtype')).toBeInstanceOf(D100);
      // 1_0_1 defaults to 1_0_0
      expect(dataBinder.resolve('/test1:mytype-1_0_1', 'bindingtype')).toBeInstanceOf(D100);
      // We provided something for 1_0_2
      expect(dataBinder.resolve('/test1:mytype-1_0_2', 'bindingtype')).toBeInstanceOf(D102);
      // Nothing for 1_0_3, patch upgradetype applies so we get 1_0_2
      expect(dataBinder.resolve('/test1:mytype-1_0_3', 'bindingtype')).toBeInstanceOf(D102);
      // The setting on 1_0_2 was 'patch', so 1_1_0 gets the previous minor update for d100
      expect(dataBinder.resolve('/test1:mytype-1_1_0', 'bindingtype')).toBeInstanceOf(D100);
      // New definition for 1_2_0
      expect(dataBinder.resolve('/test1:mytype-1_2_0', 'bindingtype')).toBeInstanceOf(D120);
      // 1_3_0 gets 1_2_0 because there's nothing changed
      expect(dataBinder.resolve('/test1:mytype-1_3_0', 'bindingtype')).toBeInstanceOf(D120);
      // New Major version for 2_0_0! Exciting.
      expect(dataBinder.resolve('/test1:mytype-2_0_0', 'bindingtype')).toBeInstanceOf(D200);
      // Majors affect patches, get d200
      expect(dataBinder.resolve('/test1:mytype-2_0_1', 'bindingtype')).toBeInstanceOf(D200);
      // Majors affect everything, actually
      expect(dataBinder.resolve('/test1:mytype-3_0_0', 'bindingtype')).toBeInstanceOf(D200);
      // Until the next major, that is.
      expect(dataBinder.resolve('/test1:mytype-4_0_0', 'bindingtype')).toBeInstanceOf(D400);
    });

    it('should not create a binding for a version that is not activated', function() {
      workspace.root.insert('myprop', PropertyFactory.create('test1:mytype-2.0.0'));

      dataBinder.defineDataBinding('bindingtype', 'test1:mytype-1.0.0', D100, {
        upgradeType: UpgradeType.MINOR
      });
      dataBinder.activateDataBinding('bindingtype', 'test1:mytype-1.0.0');

      expect(dataBinder.resolve('/myprop', 'bindingtype')).toBeUndefined();
    });

    it('should not create a binding for a version that is not defined but activated', function() {
      workspace.root.insert('myprop', PropertyFactory.create('test1:mytype-2.0.0'));

      dataBinder.defineDataBinding('bindingtype', 'test1:mytype-1.0.0', D100, {
        upgradeType: UpgradeType.MINOR
      });
      dataBinder.activateDataBinding('bindingtype', 'test1:mytype-2.0.0');

      expect(dataBinder.resolve('/myprop', 'bindingtype')).toBeUndefined();
    });

    it('versioning, inheritance, patch', function() {
      // Simulate a new piece of data using mytype-1.0.1 appearing in the workspace.
      // Will the 1.0.0 binding get called?
      workspace.root.insert('myprop', PropertyFactory.create('test1:inheritMyType-1.0.0'));

      dataBinder.defineDataBinding('bindingtype', 'test1:mytype-1.0.0', D100, {
        upgradeType: UpgradeType.MINOR
      });
      dataBinder.activateDataBinding('bindingtype', 'test1:mytype-1.0.0');

      expect(dataBinder.resolve('/myprop', 'bindingtype')).toBeInstanceOf(D100);
    });

    it('versioning, inheritance, minor', function() {
      // Simulate a new piece of data using mytype-1.2.0 appearing in the workspace.
      // Will the 1.0.0 binding get called?
      workspace.root.insert('myprop', PropertyFactory.create('test1:inheritMyType-2.0.0'));

      dataBinder.defineDataBinding('bindingtype', 'test1:mytype-1.0.0', D100, {
        upgradeType: UpgradeType.MINOR
      });
      dataBinder.activateDataBinding('bindingtype', 'test1:mytype-1.0.0');

      expect(dataBinder.resolve('/myprop', 'bindingtype')).toBeInstanceOf(D100);
    });

    it('versioning, base type', function() {
      // Simulate a new piece of data using mytype-1.2.0 appearing in the workspace.
      // Will the 1.0.0 binding get called?
      workspace.root.insert('myprop', PropertyFactory.create('test1:myrelationship-1.0.0'));

      dataBinder.defineDataBinding('bindingtype', 'RelationshipProperty', D100);
      dataBinder.activateDataBinding('bindingtype', 'RelationshipProperty');

      expect(dataBinder.resolve('/myprop', 'bindingtype')).toBeInstanceOf(D100);
    });

  });

});

