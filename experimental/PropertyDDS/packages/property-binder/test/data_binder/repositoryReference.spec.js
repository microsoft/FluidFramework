/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/* globals should, sinon, expect  */
/* eslint spaced-comment: 0 */
/* eslint no-unused-expressions: 0 */
/* eslint no-unused-vars: 0 */
/* eslint-disable require-jsdoc */
/* eslint max-nested-callbacks: ["warn", 5] */

import _ from 'underscore';
import { DataBinder } from '../../src/data_binder/data_binder';
import { registerTestTemplates, ParentTemplate, ChildTemplate } from './testTemplates';
import {
  ParentDataBinding, DerivedDataBinding, ChildDataBinding
} from './testDataBindings';
import { catchConsoleErrors } from './catch_console_errors';
import { unregisterAllOnPathListeners } from '../../src/data_binder/internal_utils';

import { PropertyFactory } from '@fluid-experimental/property-properties';

// TODO: we need to skip these tests for now as they rely on an external server which sometimes timeouts
describe.skip('DataBinder', function () {
  var hfdm, otherHfdm, workspace, otherWorkspace, connectParams;

  catchConsoleErrors();

  beforeAll(function () {
    registerTestTemplates();
    connectParams = {
      serverUrl: 'http://ecs-master-opt.ecs.ads.autodesk.com:3000'
    };
  });

  beforeEach(async function () {
    hfdm = new HFDM();
    otherHfdm = new HFDM();

    workspace = hfdm.createWorkspace();
    otherWorkspace = otherHfdm.createWorkspace();

    await hfdm.connect(connectParams);
    await otherHfdm.connect(connectParams);

    await workspace.initialize({ local: true });
    await otherWorkspace.initialize();
  });

  afterEach(function () {
    // Unregister DataBinding paths
    _.forEach([ParentDataBinding, DerivedDataBinding, ChildDataBinding],
      unregisterAllOnPathListeners
    );
  });

  describe('repository references', function () {
    var dataBinder;

    beforeEach(function () {
      dataBinder = new DataBinder();

      // Bind to the workspace
      dataBinder.attachTo(workspace);
    });

    afterEach(async function () {
      // Unbind checkout view
      dataBinder.detach();

      // Unregister DataBinding paths
      _.forEach([ParentDataBinding, ChildDataBinding],
        unregisterAllOnPathListeners
      );

      dataBinder = null;
    });

    it('should behave properly when a property in the referenced repository is created or removed',
      async function () {
        dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding);
        var child = PropertyFactory.create(ChildTemplate.typeid, 'single');
        var repositoryReference = PropertyFactory.create(
          'RepositoryReferenceProperty',
          'single',
          {
            repositoryGUID: otherWorkspace.getActiveRepository().getGuid(),
            branchGUID: otherWorkspace.getActiveBranch().getGuid(),
            commitGUID: otherWorkspace.getActiveCommit().getGuid()
          }
        );

        // Insert the repo reference to the embedding repository then insert the child to the embedded repository
        workspace.insert('reference', repositoryReference);
        await new Promise(resolve =>
          workspace.on('onAllReferencesLoaded', () =>
            resolve()));
        await repositoryReference.enableWrite();
        let refWorkspace = repositoryReference.getReferencedWorkspace();
        refWorkspace.insert('child', child);
        await refWorkspace.commit();

        expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
        dataBinder._resetDebugCounters();

        // Remove the repo reference from the embedding repository
        workspace.remove('reference');

        expect(dataBinder._dataBindingRemovedCounter).toEqual(1);
        dataBinder._resetDebugCounters();

        // Insert the repo reference back to the embedding repository
        workspace.insert('reference', repositoryReference);
        await new Promise((resolve, reject) =>
          workspace.on('onAllReferencesLoaded', () => resolve()));
        expect(dataBinder._dataBindingCreatedCounter).toEqual(1);
        dataBinder._resetDebugCounters();

        // Remove the child from the embedded repository
        refWorkspace = repositoryReference.getReferencedWorkspace();
        refWorkspace.remove('child');
        await refWorkspace.commit();
        expect(dataBinder._dataBindingRemovedCounter).toEqual(1);
        dataBinder._resetDebugCounters();
      });

    it('should handle the relative path callbacks crossing the repository reference border',
      async function () {
        var pathInsertSpy = jest.fn(function (in_modificationContext) {
          console.log('path: ' + in_modificationContext.getAbsolutePath());
        });
        var pathModifySpy = jest.fn();
        var pathRemoveSpy = jest.fn();
        ParentDataBinding.registerOnPath('reference.child.text', ['referenceInsert'], pathInsertSpy);
        ParentDataBinding.registerOnPath('reference.child.text', ['referenceModify'], pathModifySpy);
        ParentDataBinding.registerOnPath('reference.child.text', ['referenceRemove'], pathRemoveSpy);
        dataBinder.register('BINDING', ParentTemplate.typeid, ParentDataBinding);
        var parent = PropertyFactory.create(ParentTemplate.typeid, 'single');
        var child = PropertyFactory.create(ChildTemplate.typeid, 'single');
        var repositoryReference = PropertyFactory.create(
          'RepositoryReferenceProperty',
          'single',
          {
            repositoryGUID: otherWorkspace.getActiveRepository().getGuid(),
            branchGUID: otherWorkspace.getActiveBranch().getGuid(),
            commitGUID: otherWorkspace.getActiveCommit().getGuid()
          }
        );

        // Insert the repository reference to the embedding repository
        // then insert the child to the embedded repository
        workspace.insert('parent', parent);
        workspace.get('parent').insert('reference', repositoryReference);
        await new Promise(resolve =>
          workspace.on('onAllReferencesLoaded', () =>
            resolve()));
        await repositoryReference.enableWrite();
        let refWorkspace = repositoryReference.getReferencedWorkspace();
        refWorkspace.insert('child', child);
        await refWorkspace.commit();

        expect(pathInsertSpy).toHaveBeenCalledTimes(1);
        pathInsertSpy.mockClear();

        // Modify a property of the child in the embedded repository
        refWorkspace.get(['child', 'text']).setValue('new text');
        await refWorkspace.commit();

        expect(pathModifySpy).toHaveBeenCalledTimes(1);
        pathModifySpy.mockClear();

        // Remove the repo reference with the child in the embedded workspace from the embedding workspace
        workspace.get('parent').remove('reference');

        expect(pathRemoveSpy).toHaveBeenCalledTimes(1);
        pathRemoveSpy.mockClear();

        // Insert the repo reference with the child in the embedded workspace back to the embedding workspace
        workspace.get('parent').insert('reference', repositoryReference);
        await new Promise(resolve =>
          workspace.on('onAllReferencesLoaded', () =>
            resolve()));

        expect(pathInsertSpy).toHaveBeenCalledTimes(1);
        pathInsertSpy.mockClear();

        // Remove the child from the embedded workspace when the repo reference is still in the embedding workspace
        refWorkspace = repositoryReference.getReferencedWorkspace();
        refWorkspace.remove('child');
        await refWorkspace.commit();

        expect(pathRemoveSpy).toHaveBeenCalledTimes(1);
        pathRemoveSpy.mockClear();
      });

    it('should handle the relative path callbacks when the whole relative path is in the embedded repository',
      async function () {
        var pathInsertSpy = jest.fn(function (in_modificationContext) {
          console.log('path: ' + in_modificationContext.getAbsolutePath());
        });
        var pathModifySpy = jest.fn();
        var pathRemoveSpy = jest.fn();
        ChildDataBinding.registerOnPath('text', ['insert'], pathInsertSpy);
        ChildDataBinding.registerOnPath('text', ['modify'], pathModifySpy);
        ChildDataBinding.registerOnPath('text', ['remove'], pathRemoveSpy);
        dataBinder.register('BINDING', ChildTemplate.typeid, ChildDataBinding);
        var child = PropertyFactory.create(ChildTemplate.typeid, 'single');
        var repositoryReference = PropertyFactory.create(
          'RepositoryReferenceProperty',
          'single',
          {
            repositoryGUID: otherWorkspace.getActiveRepository().getGuid(),
            branchGUID: otherWorkspace.getActiveBranch().getGuid(),
            commitGUID: otherWorkspace.getActiveCommit().getGuid()
          }
        );

        // Insert the repository reference to the embedding repository
        // then insert the child to the embedded repository
        workspace.insert('reference', repositoryReference);
        await new Promise(resolve =>
          workspace.on('onAllReferencesLoaded', () =>
            resolve()));
        await repositoryReference.enableWrite();
        let refWorkspace = repositoryReference.getReferencedWorkspace();
        refWorkspace.insert('child', child);
        await refWorkspace.commit();

        expect(pathInsertSpy).toHaveBeenCalledTimes(1);
        pathInsertSpy.mockClear();

        // Modify a property of the child in the embedded repository
        refWorkspace.get(['child', 'text']).setValue('new text');
        await refWorkspace.commit();

        expect(pathModifySpy).toHaveBeenCalledTimes(1);
        pathModifySpy.mockClear();

        // Remove the repository reference from the embedding repository
        workspace.remove('reference');

        expect(pathRemoveSpy).toHaveBeenCalledTimes(1);
        pathRemoveSpy.mockClear();

        // Insert the repository reference back to the embedding repository
        workspace.insert('reference', repositoryReference);
        await new Promise(resolve =>
          workspace.on('onAllReferencesLoaded', () =>
            resolve()));

        expect(pathInsertSpy).toHaveBeenCalledTimes(1);
        pathInsertSpy.mockClear();

        // Remove the child from the embedded workspace
        refWorkspace = repositoryReference.getReferencedWorkspace();
        refWorkspace.remove('child');
        await refWorkspace.commit();

        expect(pathRemoveSpy).toHaveBeenCalledTimes(1);
        pathRemoveSpy.mockClear();
      });
  });
});
