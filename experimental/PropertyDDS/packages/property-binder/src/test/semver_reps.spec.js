/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable max-nested-callbacks */
/* globals should, expect */
/* eslint-disable require-jsdoc */

import { registerTestTemplates } from './testTemplates';
import { DataBinder, UpgradeType } from '../index';
import { MockSharedPropertyTree } from './mockSharedPropertyTree';
import { PropertyFactory } from '@fluid-experimental/property-properties';
class VersionedRepresentation100 {
}
class VersionedRepresentation101 {
}
class VersionedRepresentation120 {
}

describe('DataBinder runtime representations', () => {
  let myDataBinder;
  let workspace;

  beforeAll(() => {
    registerTestTemplates();
  });

  beforeEach(async () => {
    workspace = await MockSharedPropertyTree();
    myDataBinder = new DataBinder();
  });

  afterEach(() => {
    myDataBinder.detach();
  });

  describe('multiple versions of a runtime representation', () => {

    it('Basic forward compatibility - minor upgrade', () => {
      myDataBinder.defineRepresentation(
        'MYBINDINGTYPE', 'Test:Versioned-1.0.0', () => new VersionedRepresentation100(),
        {
          upgradeType: UpgradeType.MINOR
        },
      );

      // Get a workspace and insert a new property
      workspace.root.insert('Older', PropertyFactory.create('Test:Versioned-1.0.0', 'single'));
      workspace.root.insert('Patched', PropertyFactory.create('Test:Versioned-1.0.1', 'single'));
      workspace.root.insert('Newer', PropertyFactory.create('Test:Versioned-1.1.0', 'single'));
      workspace.root.insert('Newest', PropertyFactory.create('Test:Versioned-2.0.0', 'single'));

      myDataBinder.attachTo(workspace);

      // We should get the old representation for Older
      const older = myDataBinder.getRepresentation(workspace.root.get('Older'), 'MYBINDINGTYPE');
      expect(older).toBeDefined();
      expect(older).toBeInstanceOf(VersionedRepresentation100);

      // We should get the patched, since we take anything up to and including a minor revision
      const patched = myDataBinder.getRepresentation(workspace.root.get('Patched'), 'MYBINDINGTYPE');
      expect(patched).toBeDefined();
      expect(patched).toBeInstanceOf(VersionedRepresentation100);

      // Newer should give the old representation - minor revision
      const newer = myDataBinder.getRepresentation(workspace.root.get('Newer'), 'MYBINDINGTYPE');
      expect(newer).toBeDefined();
      expect(newer).toBeInstanceOf(VersionedRepresentation100);

      // Newest should not have a representation because we only specified MINOR upgrade
      const newest = myDataBinder.getRepresentation(workspace.root.get('Newest'), 'MYBINDINGTYPE');
      expect(newest).toBeUndefined();
    });

    it('Basic forward compatibility - major upgrade', () => {
      myDataBinder.defineRepresentation(
        'MYBINDINGTYPE', 'Test:Versioned-1.0.0', () => new VersionedRepresentation100(),
        {
          upgradeType: UpgradeType.MAJOR
        },
      );

      // Get a workspace and insert a new property
      workspace.root.insert('Older', PropertyFactory.create('Test:Versioned-1.0.0', 'single'));
      workspace.root.insert('Patched', PropertyFactory.create('Test:Versioned-1.0.1', 'single'));
      workspace.root.insert('Newer', PropertyFactory.create('Test:Versioned-1.1.0', 'single'));
      workspace.root.insert('Newest', PropertyFactory.create('Test:Versioned-2.0.0', 'single'));

      myDataBinder.attachTo(workspace);

      // We should get the old representation for Older
      const older = myDataBinder.getRepresentation(workspace.root.get('Older'), 'MYBINDINGTYPE');
      expect(older).toBeDefined();
      expect(older).toBeInstanceOf(VersionedRepresentation100);

      // We should get the patched, since we take anything up to and including a major revision
      const patched = myDataBinder.getRepresentation(workspace.root.get('Patched'), 'MYBINDINGTYPE');
      expect(patched).toBeDefined();
      expect(patched).toBeInstanceOf(VersionedRepresentation100);

      // Newer should give the old representation (forward compatibility)
      const newer = myDataBinder.getRepresentation(workspace.root.get('Newer'), 'MYBINDINGTYPE');
      expect(newer).toBeDefined();
      expect(newer).toBeInstanceOf(VersionedRepresentation100);

      // Newest should also work because we gave MAJOR upgrade
      const newest = myDataBinder.getRepresentation(workspace.root.get('Newest'), 'MYBINDINGTYPE');
      expect(newest).toBeDefined();
      expect(newest).toBeInstanceOf(VersionedRepresentation100);
    });

    it('Two representations overlapping minor versions', () => {
      // Specify a rep for version 1.0.0 and 1.2.0
      myDataBinder.defineRepresentation(
        'MYBINDINGTYPE', 'Test:Versioned-1.0.0', () => new VersionedRepresentation100(),
        {
          upgradeType: UpgradeType.MINOR
        },
      );
      myDataBinder.defineRepresentation(
        'MYBINDINGTYPE', 'Test:Versioned-1.2.0', () => new VersionedRepresentation120(),
        {
          upgradeType: UpgradeType.MINOR
        },
      );

      // Get a workspace and insert a new property
      workspace.root.insert('100', PropertyFactory.create('Test:Versioned-1.0.0', 'single'));
      workspace.root.insert('101', PropertyFactory.create('Test:Versioned-1.0.1', 'single'));
      workspace.root.insert('110', PropertyFactory.create('Test:Versioned-1.1.0', 'single'));
      workspace.root.insert('120', PropertyFactory.create('Test:Versioned-1.2.0', 'single'));
      workspace.root.insert('130', PropertyFactory.create('Test:Versioned-1.3.0', 'single'));
      workspace.root.insert('200', PropertyFactory.create('Test:Versioned-2.0.0', 'single'));

      myDataBinder.attachTo(workspace);

      const v100 = myDataBinder.getRepresentation(workspace.root.get('100'), 'MYBINDINGTYPE');
      expect(v100).toBeDefined();
      expect(v100).toBeInstanceOf(VersionedRepresentation100);

      const v101 = myDataBinder.getRepresentation(workspace.root.get('101'), 'MYBINDINGTYPE');
      expect(v101).toBeDefined();
      expect(v101).toBeInstanceOf(VersionedRepresentation100);

      const v110 = myDataBinder.getRepresentation(workspace.root.get('110'), 'MYBINDINGTYPE');
      expect(v110).toBeDefined();
      expect(v110).toBeInstanceOf(VersionedRepresentation100);

      const v120 = myDataBinder.getRepresentation(workspace.root.get('120'), 'MYBINDINGTYPE');
      expect(v120).toBeDefined();
      expect(v120).toBeInstanceOf(VersionedRepresentation120);

      const v130 = myDataBinder.getRepresentation(workspace.root.get('130'), 'MYBINDINGTYPE');
      expect(v130).toBeDefined();
      expect(v130).toBeInstanceOf(VersionedRepresentation120);

      const v200 = myDataBinder.getRepresentation(workspace.root.get('200'), 'MYBINDINGTYPE');
      expect(v200).toBeUndefined();
    });

    it('Two representations overlapping patch versions', () => {
      // Specify a rep for version 1.0.0 and 1.2.0
      myDataBinder.defineRepresentation(
        'MYBINDINGTYPE', 'Test:Versioned-1.0.0', () => new VersionedRepresentation100(),
        {
          upgradeType: UpgradeType.MINOR
        },
      );
      myDataBinder.defineRepresentation(
        'MYBINDINGTYPE', 'Test:Versioned-1.0.1', () => new VersionedRepresentation101(),
        {
          upgradeType: UpgradeType.PATCH
        },
      );

      // Get a workspace and insert a new property
      workspace.root.insert('100', PropertyFactory.create('Test:Versioned-1.0.0', 'single'));
      workspace.root.insert('101', PropertyFactory.create('Test:Versioned-1.0.1', 'single'));
      workspace.root.insert('110', PropertyFactory.create('Test:Versioned-1.1.0', 'single'));
      workspace.root.insert('120', PropertyFactory.create('Test:Versioned-1.2.0', 'single'));
      workspace.root.insert('130', PropertyFactory.create('Test:Versioned-1.3.0', 'single'));
      workspace.root.insert('200', PropertyFactory.create('Test:Versioned-2.0.0', 'single'));

      myDataBinder.attachTo(workspace);

      const v100 = myDataBinder.getRepresentation(workspace.root.get('100'), 'MYBINDINGTYPE');
      expect(v100).toBeDefined();
      expect(v100).toBeInstanceOf(VersionedRepresentation100);

      const v101 = myDataBinder.getRepresentation(workspace.root.get('101'), 'MYBINDINGTYPE');
      expect(v101).toBeDefined();
      expect(v101).toBeInstanceOf(VersionedRepresentation101);

      const v110 = myDataBinder.getRepresentation(workspace.root.get('110'), 'MYBINDINGTYPE');
      expect(v110).toBeDefined();
      expect(v110).toBeInstanceOf(VersionedRepresentation100);

      // Patch doesn't apply, but minor upgrade does
      const v120 = myDataBinder.getRepresentation(workspace.root.get('120'), 'MYBINDINGTYPE');
      expect(v120).toBeDefined();
      expect(v120).toBeInstanceOf(VersionedRepresentation100);

      // Patch doesn't apply, but minor upgrade does
      const v130 = myDataBinder.getRepresentation(workspace.root.get('130'), 'MYBINDINGTYPE');
      expect(v130).toBeDefined();
      expect(v130).toBeInstanceOf(VersionedRepresentation100);

      const v200 = myDataBinder.getRepresentation(workspace.root.get('200'), 'MYBINDINGTYPE');
      expect(v200).toBeUndefined();
    });

    it('Basic forward compatibility - minor upgrade, maps', () => {
      myDataBinder.defineRepresentation(
        'MYBINDINGTYPE', 'Test:Versioned-1.0.0', () => new VersionedRepresentation100(),
        {
          upgradeType: UpgradeType.MINOR
        },
      );

      // Get a workspace and insert a new property
      const map100 = PropertyFactory.create('Test:Versioned-1.0.0', 'map');
      const map101 = PropertyFactory.create('Test:Versioned-1.0.1', 'map');
      const map110 = PropertyFactory.create('Test:Versioned-1.1.0', 'map');
      const map200 = PropertyFactory.create('Test:Versioned-2.0.0', 'map');

      map100.insert('bob', PropertyFactory.create('Test:Versioned-1.0.0', 'single'));
      map101.insert('bob', PropertyFactory.create('Test:Versioned-1.0.1', 'single'));
      map110.insert('bob', PropertyFactory.create('Test:Versioned-1.1.0', 'single'));
      map200.insert('bob', PropertyFactory.create('Test:Versioned-2.0.0', 'single'));

      workspace.root.insert('Older', map100);
      workspace.root.insert('Patched', map101);
      workspace.root.insert('Newer', map110);
      workspace.root.insert('Newest', map200);

      myDataBinder.attachTo(workspace);

      // We should get the old representation for Older
      const older = myDataBinder.getRepresentation(workspace.root.resolvePath('Older[bob]'), 'MYBINDINGTYPE');
      expect(older).toBeDefined();
      expect(older).toBeInstanceOf(VersionedRepresentation100);

      // We should get the patched, since we take anything up to and including a minor revision
      const patched = myDataBinder.getRepresentation(workspace.root.resolvePath('Patched[bob]'), 'MYBINDINGTYPE');
      expect(patched).toBeDefined();
      expect(patched).toBeInstanceOf(VersionedRepresentation100);

      // Newer should give the old representation - minor revision
      const newer = myDataBinder.getRepresentation(workspace.root.resolvePath('Newer[bob]'), 'MYBINDINGTYPE');
      expect(newer).toBeDefined();
      expect(newer).toBeInstanceOf(VersionedRepresentation100);

      // Newest should not have a representation because we only specified MINOR upgrade
      const newest = myDataBinder.getRepresentation(workspace.root.resolvePath('Newest[bob]'), 'MYBINDINGTYPE');
      expect(newest).toBeUndefined();
    });

    it('Definition for base type', () => {
      myDataBinder.defineRepresentation(
        'MYBINDINGTYPE', 'RelationshipProperty', () => new VersionedRepresentation100(),
        {
          upgradeType: UpgradeType.MINOR
        },
      );

      myDataBinder.attachTo(workspace);

      workspace.root.insert('myRelationship', PropertyFactory.create('RelationshipProperty', 'single'));

      const lookup = myDataBinder.getRepresentationAtPath('myRelationship', 'MYBINDINGTYPE');
      expect(lookup).toBeDefined();
    });

    it('Definition inheriting from a base type', () => {
      myDataBinder.defineRepresentation(
        'MYBINDINGTYPE', 'RelationshipProperty', () => new VersionedRepresentation100(),
        {
          upgradeType: UpgradeType.MINOR
        },
      );

      myDataBinder.attachTo(workspace);

      workspace.root.insert('inherited', PropertyFactory.create('Test:InheritedTestBaseType-1.0.0', 'single'));

      const lookup = myDataBinder.getRepresentationAtPath('inherited', 'MYBINDINGTYPE');
      expect(lookup).toBeDefined();
    });

  });
});
