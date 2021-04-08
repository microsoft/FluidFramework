/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable max-nested-callbacks */
/* globals should, expect */
/* eslint-disable require-jsdoc */

import {
  registerTestTemplates
} from './testTemplates';

import { DataBinder, UpgradeType } from '../../src/index';

import { HFDM, PropertyFactory } from '@adsk/forge-hfdm';

import { afterEach, before, describe, it } from 'mocha';

(() => {

  class VersionedRepresentation100 {
  }
  class VersionedRepresentation101 {
  }
  class VersionedRepresentation120 {
  }

  describe('DataBinder runtime representations', () => {
    let hfdm;
    let myDataBinder;
    let workspace;

    before(() => {
      registerTestTemplates();
    });

    beforeEach(() => {
      hfdm = new HFDM();
      workspace = hfdm.createWorkspace();
      return workspace.initialize({ local: true }).then(() => {
        myDataBinder = new DataBinder();
      });
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

        // Get an HFDM workspace and insert a new property
        workspace.insert('Older', PropertyFactory.create('Test:Versioned-1.0.0', 'single'));
        workspace.insert('Patched', PropertyFactory.create('Test:Versioned-1.0.1', 'single'));
        workspace.insert('Newer', PropertyFactory.create('Test:Versioned-1.1.0', 'single'));
        workspace.insert('Newest', PropertyFactory.create('Test:Versioned-2.0.0', 'single'));

        myDataBinder.attachTo(workspace);

        // We should get the old representation for Older
        const older = myDataBinder.getRepresentation(workspace.get('Older'), 'MYBINDINGTYPE');
        should.exist(older);
        older.should.be.instanceOf(VersionedRepresentation100);

        // We should get the patched, since we take anything up to and including a minor revision
        const patched = myDataBinder.getRepresentation(workspace.get('Patched'), 'MYBINDINGTYPE');
        should.exist(patched);
        patched.should.be.instanceOf(VersionedRepresentation100);

        // Newer should give the old representation - minor revision
        const newer = myDataBinder.getRepresentation(workspace.get('Newer'), 'MYBINDINGTYPE');
        should.exist(newer);
        newer.should.be.instanceOf(VersionedRepresentation100);

        // Newest should not have a representation because we only specified MINOR upgrade
        const newest = myDataBinder.getRepresentation(workspace.get('Newest'), 'MYBINDINGTYPE');
        should.not.exist(newest);
      });

      it('Basic forward compatibility - major upgrade', () => {
        myDataBinder.defineRepresentation(
          'MYBINDINGTYPE', 'Test:Versioned-1.0.0', () => new VersionedRepresentation100(),
          {
            upgradeType: UpgradeType.MAJOR
          },
        );

        // Get an HFDM workspace and insert a new property
        workspace.insert('Older', PropertyFactory.create('Test:Versioned-1.0.0', 'single'));
        workspace.insert('Patched', PropertyFactory.create('Test:Versioned-1.0.1', 'single'));
        workspace.insert('Newer', PropertyFactory.create('Test:Versioned-1.1.0', 'single'));
        workspace.insert('Newest', PropertyFactory.create('Test:Versioned-2.0.0', 'single'));

        myDataBinder.attachTo(workspace);

        // We should get the old representation for Older
        const older = myDataBinder.getRepresentation(workspace.get('Older'), 'MYBINDINGTYPE');
        should.exist(older);
        older.should.be.instanceOf(VersionedRepresentation100);

        // We should get the patched, since we take anything up to and including a major revision
        const patched = myDataBinder.getRepresentation(workspace.get('Patched'), 'MYBINDINGTYPE');
        should.exist(patched);
        patched.should.be.instanceOf(VersionedRepresentation100);

        // Newer should give the old representation (forward compatibility)
        const newer = myDataBinder.getRepresentation(workspace.get('Newer'), 'MYBINDINGTYPE');
        should.exist(newer);
        newer.should.be.instanceOf(VersionedRepresentation100);

        // Newest should also work because we gave MAJOR upgrade
        const newest = myDataBinder.getRepresentation(workspace.get('Newest'), 'MYBINDINGTYPE');
        should.exist(newest);
        newest.should.be.instanceOf(VersionedRepresentation100);
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

        // Get an HFDM workspace and insert a new property
        workspace.insert('100', PropertyFactory.create('Test:Versioned-1.0.0', 'single'));
        workspace.insert('101', PropertyFactory.create('Test:Versioned-1.0.1', 'single'));
        workspace.insert('110', PropertyFactory.create('Test:Versioned-1.1.0', 'single'));
        workspace.insert('120', PropertyFactory.create('Test:Versioned-1.2.0', 'single'));
        workspace.insert('130', PropertyFactory.create('Test:Versioned-1.3.0', 'single'));
        workspace.insert('200', PropertyFactory.create('Test:Versioned-2.0.0', 'single'));

        myDataBinder.attachTo(workspace);

        const v100 = myDataBinder.getRepresentation(workspace.get('100'), 'MYBINDINGTYPE');
        should.exist(v100);
        v100.should.be.instanceOf(VersionedRepresentation100);

        const v101 = myDataBinder.getRepresentation(workspace.get('101'), 'MYBINDINGTYPE');
        should.exist(v101);
        v101.should.be.instanceOf(VersionedRepresentation100);

        const v110 = myDataBinder.getRepresentation(workspace.get('110'), 'MYBINDINGTYPE');
        should.exist(v110);
        v110.should.be.instanceOf(VersionedRepresentation100);

        const v120 = myDataBinder.getRepresentation(workspace.get('120'), 'MYBINDINGTYPE');
        should.exist(v120);
        v120.should.be.instanceOf(VersionedRepresentation120);

        const v130 = myDataBinder.getRepresentation(workspace.get('130'), 'MYBINDINGTYPE');
        should.exist(v130);
        v130.should.be.instanceOf(VersionedRepresentation120);

        const v200 = myDataBinder.getRepresentation(workspace.get('200'), 'MYBINDINGTYPE');
        should.not.exist(v200);
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

        // Get an HFDM workspace and insert a new property
        workspace.insert('100', PropertyFactory.create('Test:Versioned-1.0.0', 'single'));
        workspace.insert('101', PropertyFactory.create('Test:Versioned-1.0.1', 'single'));
        workspace.insert('110', PropertyFactory.create('Test:Versioned-1.1.0', 'single'));
        workspace.insert('120', PropertyFactory.create('Test:Versioned-1.2.0', 'single'));
        workspace.insert('130', PropertyFactory.create('Test:Versioned-1.3.0', 'single'));
        workspace.insert('200', PropertyFactory.create('Test:Versioned-2.0.0', 'single'));

        myDataBinder.attachTo(workspace);

        const v100 = myDataBinder.getRepresentation(workspace.get('100'), 'MYBINDINGTYPE');
        should.exist(v100);
        v100.should.be.instanceOf(VersionedRepresentation100);

        const v101 = myDataBinder.getRepresentation(workspace.get('101'), 'MYBINDINGTYPE');
        should.exist(v101);
        v101.should.be.instanceOf(VersionedRepresentation101);

        const v110 = myDataBinder.getRepresentation(workspace.get('110'), 'MYBINDINGTYPE');
        should.exist(v110);
        v110.should.be.instanceOf(VersionedRepresentation100);

        // Patch doesn't apply, but minor upgrade does
        const v120 = myDataBinder.getRepresentation(workspace.get('120'), 'MYBINDINGTYPE');
        should.exist(v120);
        v120.should.be.instanceOf(VersionedRepresentation100);

        // Patch doesn't apply, but minor upgrade does
        const v130 = myDataBinder.getRepresentation(workspace.get('130'), 'MYBINDINGTYPE');
        should.exist(v130);
        v130.should.be.instanceOf(VersionedRepresentation100);

        const v200 = myDataBinder.getRepresentation(workspace.get('200'), 'MYBINDINGTYPE');
        should.not.exist(v200);
      });

      it('Basic forward compatibility - minor upgrade, maps', () => {
        myDataBinder.defineRepresentation(
          'MYBINDINGTYPE', 'Test:Versioned-1.0.0', () => new VersionedRepresentation100(),
          {
            upgradeType: UpgradeType.MINOR
          },
        );

        // Get an HFDM workspace and insert a new property
        const map100 = PropertyFactory.create('Test:Versioned-1.0.0', 'map');
        const map101 = PropertyFactory.create('Test:Versioned-1.0.1', 'map');
        const map110 = PropertyFactory.create('Test:Versioned-1.1.0', 'map');
        const map200 = PropertyFactory.create('Test:Versioned-2.0.0', 'map');

        map100.insert('bob', PropertyFactory.create('Test:Versioned-1.0.0', 'single'));
        map101.insert('bob', PropertyFactory.create('Test:Versioned-1.0.1', 'single'));
        map110.insert('bob', PropertyFactory.create('Test:Versioned-1.1.0', 'single'));
        map200.insert('bob', PropertyFactory.create('Test:Versioned-2.0.0', 'single'));

        workspace.insert('Older', map100);
        workspace.insert('Patched', map101);
        workspace.insert('Newer', map110);
        workspace.insert('Newest', map200);

        myDataBinder.attachTo(workspace);

        // We should get the old representation for Older
        const older = myDataBinder.getRepresentation(workspace.resolvePath('Older[bob]'), 'MYBINDINGTYPE');
        should.exist(older);
        older.should.be.instanceOf(VersionedRepresentation100);

        // We should get the patched, since we take anything up to and including a minor revision
        const patched = myDataBinder.getRepresentation(workspace.resolvePath('Patched[bob]'), 'MYBINDINGTYPE');
        should.exist(patched);
        patched.should.be.instanceOf(VersionedRepresentation100);

        // Newer should give the old representation - minor revision
        const newer = myDataBinder.getRepresentation(workspace.resolvePath('Newer[bob]'), 'MYBINDINGTYPE');
        should.exist(newer);
        newer.should.be.instanceOf(VersionedRepresentation100);

        // Newest should not have a representation because we only specified MINOR upgrade
        const newest = myDataBinder.getRepresentation(workspace.resolvePath('Newest[bob]'), 'MYBINDINGTYPE');
        should.not.exist(newest);
      });

      it('Definition for base type', () => {
        myDataBinder.defineRepresentation(
          'MYBINDINGTYPE', 'RelationshipProperty', () => new VersionedRepresentation100(),
          {
            upgradeType: UpgradeType.MINOR
          },
        );

        myDataBinder.attachTo(workspace);

        workspace.insert('myRelationship', PropertyFactory.create('RelationshipProperty', 'single'));

        const lookup = myDataBinder.getRepresentationAtPath('myRelationship', 'MYBINDINGTYPE');
        should.exist(lookup);
      });

      it('Definition inheriting from a base type', () => {
        myDataBinder.defineRepresentation(
          'MYBINDINGTYPE', 'RelationshipProperty', () => new VersionedRepresentation100(),
          {
            upgradeType: UpgradeType.MINOR
          },
        );

        myDataBinder.attachTo(workspace);

        workspace.insert('inherited', PropertyFactory.create('Test:InheritedTestBaseType-1.0.0', 'single'));

        const lookup = myDataBinder.getRepresentationAtPath('inherited', 'MYBINDINGTYPE');
        should.exist(lookup);
      });

    });
  });

})();
