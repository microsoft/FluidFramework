/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/* globals should, sinon, expect, gc  */
/* eslint no-unused-expressions: 0 */
/* eslint no-unused-vars: 0 */
/* eslint require-jsdoc: 0 */
/* eslint max-len: 0 */
import _ from 'underscore';
import { DataBinder } from '../../src/data_binder/data_binder';
import { unregisterAllOnPathListeners } from '../../src/data_binder/internal_utils';
import { DataBinding } from '../../src/data_binder/data_binding';
import { registerTestTemplates, ParentTemplate, ChildTemplate,
  PrimitiveChildrenTemplate, NodeContainerTemplate, ArrayContainerTemplate,
  MapContainerTemplate, SetContainerTemplate,
  InheritedChildTemplate, InheritedInheritedChildTemplate
} from '../data_binder/testTemplates';
import {
  ParentDataBinding, ChildDataBinding, PrimitiveChildrenDataBinding, InheritedChildDataBinding,
  DerivedDataBinding
} from '../data_binder/testDataBindings';
import { catchConsoleErrors } from '../data_binder/catch_console_errors';
import { PropertyFactory, HFDM } from '@adsk/forge-hfdm';

(function() {

  describe('Performance tests', function() {
    let dataBinder, databindingCreatedCounter, databindingModifiedCounter, hfdm, workspace;
    let modifySceneStart, modifySceneEnd, modifySceneCallCount;
    let numberOfTreeNodes, numberOfIterations;
    let debugPrint, forceGC;
    class MinimalBinding extends DataBinding {
      constructor(params) {
        super(params);
        databindingCreatedCounter++; // increment counter
      }

      onModify(in_modificationContext) {
        databindingModifiedCounter++; // increment counter
      }
    }
    MinimalBinding.prototype.__debuggingName = 'MinimalBinding';

    const cleanupDataBinder = function() {
      // Unbind checkout view
      dataBinder.detach();
      // Forcibly remove all data bindings
      dataBinder.unregisterDataBindings();

      // Unregister DataBinding paths
      _.forEach([ParentDataBinding, ChildDataBinding, PrimitiveChildrenDataBinding, InheritedChildDataBinding, DerivedDataBinding],
        unregisterAllOnPathListeners);
    };

    catchConsoleErrors();
    this.timeout(50000);

    before(function() {
      registerTestTemplates();
      numberOfTreeNodes = 200;
      numberOfIterations = 50;
      debugPrint = false;
      // Note that even though if explicit GC is enabled, if it is explicitly called before/during the tests
      // DataBinder seems to slow down for unknown reasons (to be investigated later) and performance tests fail
      // randomly. To avoid this, we disable explicit GC calls for now (hence the `false` default).
      forceGC = false;
      if (typeof gc === 'undefined') {
        console.warn('Garbage collector is not exposed, measurements will be less precise...');
        forceGC = false;
      }
    });

    after(function() {
    });

    beforeEach(function() {
      // force garbage collection if feasible
      if (forceGC) {
        gc();
      }

      dataBinder = new DataBinder();
      // reset the counter we use instead of spy
      databindingCreatedCounter = 0;
      const originalModifyScene = dataBinder._modifyScene;
      const instrumentedModifyScene = function(in_changeSet) {
        modifySceneStart = performance.now();
        originalModifyScene.call(dataBinder, in_changeSet);
        modifySceneEnd = performance.now();
        modifySceneCallCount++;
      };
      dataBinder._modifyScene = instrumentedModifyScene; // we have to instrument before attaching!

      hfdm = new HFDM();
      workspace = hfdm.createWorkspace();
      return workspace.initialize({local: true});
    });

    afterEach(function() {
      cleanupDataBinder();
      dataBinder = null;
    });

    const createDeepTree = function(in_workspace, in_typeid, in_numberOfTreeNodes, io_collectedProperties) {
      let lastProperty = in_workspace;
      for (let i = 0; i < in_numberOfTreeNodes; ++i) {
        const pset = PropertyFactory.create(in_typeid, 'single');
        lastProperty.insert('node' + i, pset);
        lastProperty = pset;
        if (io_collectedProperties) {
          io_collectedProperties.push(pset);
        }
      }
    };

    const createWideTree = function(in_workspace, in_typeid, in_numberOfTreeNodes, io_collectedProperties) {
      for (let i = 0; i < in_numberOfTreeNodes; ++i) {
        const pset = PropertyFactory.create(in_typeid, 'single');
        in_workspace.insert('node' + i, pset);
        if (io_collectedProperties) {
          io_collectedProperties.push(pset);
        }
      }
    };

    const createTreeWithNChildren = function(in_workspace, in_typeid, in_numberOfTreeNodes, in_numChildren, io_collectedProperties) {
      const addChildren = function(in_parent, in_startNodeNumber, in_maxNodeNumber, io_childArray) {
        let actNumber = in_startNodeNumber;
        let actChildren = 0;
        while (actNumber < in_maxNodeNumber && actChildren < in_numChildren) {
          const pset = PropertyFactory.create(in_typeid, 'single');
          io_childArray.push(pset);
          in_parent.insert('node' + actNumber, pset);
          actNumber++;
          actChildren++;
          if (io_collectedProperties) {
            io_collectedProperties.push(pset);
          }
        }
        return actChildren;
      };

      let createdNodes = 0;
      const children = [];
      // "first" level (n children from the root)
      let numberOfChildrenCreated = addChildren(in_workspace, createdNodes, in_numberOfTreeNodes, children);
      createdNodes += numberOfChildrenCreated;
      // the rest of the levels
      let i = 0;
      while (createdNodes < in_numberOfTreeNodes) {
        numberOfChildrenCreated = addChildren(children[i], createdNodes, in_numberOfTreeNodes, children);
        createdNodes += numberOfChildrenCreated;
        i++;
      }
      children.length.should.equal(in_numberOfTreeNodes);
    };

    const createTreeWith3Children = function(in_workspace, in_typeid, in_numberOfTreeNodes, io_collectedProperties) {
      createTreeWithNChildren(in_workspace, in_typeid, in_numberOfTreeNodes, 3, io_collectedProperties);
    };

    const createTreeWith5Children = function(in_workspace, in_typeid, in_numberOfTreeNodes, io_collectedProperties) {
      createTreeWithNChildren(in_workspace, in_typeid, in_numberOfTreeNodes, 5, io_collectedProperties);
    };

    const clearWorkspace = function(in_workspace) {
      const children = in_workspace.getIds();
      for (let i = 0; i < children.length; ++i) {
        in_workspace.remove(children[i]);
      }
    };

    const median = function(in_values) {
      in_values.sort(function(a, b) {
        return a - b;
      });

      if (in_values.length === 0) {
        return 0;
      }

      const half = Math.floor(in_values.length / 2);
      const result = in_values.length % 2 ? in_values[half] : (in_values[half - 1] + in_values[half]) / 2.0;
      return result;
    };

    const average = function(in_values) {
      const sum = (accumulated, current) => accumulated + current;
      return in_values.reduce(sum) / in_values.length;
    };

    const geometricMean = function(in_values) {
      const res = in_values.reduce(
        (accumulated, current) => accumulated + Math.log(current),
        0);
      return Math.exp(res / in_values.length);
    };

    const standardDeviation = function(in_values) {
      const avg = average(in_values);
      const squareDiffs = in_values.map(function(in_value) {
        const diff = in_value - avg;
        return diff * diff;
      });
      const avgSquareDiff = average(squareDiffs);
      const stdDev = Math.sqrt(avgSquareDiff);
      return stdDev;
    };

    describe('Performance tests - insert', function() {

      const testInsert = function(in_workspace,
        in_dataBinder,
        in_typeid,
        in_numOfCreatedBindings,
        in_createFunc,
        in_multipleBindings = false) {
        const HFDMTimings = [];
        const dataBinderTimings = [];
        for (let i = 0; i < numberOfIterations; ++i) {
          // zero our counters before each iteration
          databindingCreatedCounter = 0;
          modifySceneCallCount = 0;
          // first measure the time HFDM takes to create the workspace
          in_workspace.pushModifiedEventScope();
          in_createFunc(in_workspace, in_typeid, numberOfTreeNodes);
          const hfdmstart = performance.now();
          in_workspace.popModifiedEventScope();
          const hfdmend = performance.now();
          modifySceneCallCount.should.equal(0); // dataBinder should not be called yet
          const elapsedhfdm = hfdmend - hfdmstart;
          // console.log('elapsed hfdm: ', elapsedhfdm);
          HFDMTimings.push(elapsedhfdm);
          clearWorkspace(in_workspace);
          if (!in_multipleBindings) {
            in_dataBinder.register('BINDING', in_typeid, MinimalBinding);
          } else {
            in_dataBinder.register('BINDING1', in_typeid, MinimalBinding);
            in_dataBinder.register('BINDING2', in_typeid, MinimalBinding);
            in_dataBinder.register('BINDING3', in_typeid, MinimalBinding);
            in_dataBinder.register('BINDING4', in_typeid, MinimalBinding);
            in_dataBinder.register('BINDING5', in_typeid, MinimalBinding);
          }

          in_dataBinder.attachTo(in_workspace);
          modifySceneCallCount = 0;   // we have to reset the counter after attaching

          // recreate the workspace, this time with bindings enabled
          in_workspace.pushModifiedEventScope();
          in_createFunc(in_workspace, in_typeid, numberOfTreeNodes);
          in_workspace.popModifiedEventScope();

          modifySceneCallCount.should.equal(1);
          const elapseddatabinder = modifySceneEnd - modifySceneStart;
          // console.log('elapsed databinder: ', elapseddatabinder);
          dataBinderTimings.push(elapseddatabinder);

          databindingCreatedCounter.should.equal(in_numOfCreatedBindings);
          cleanupDataBinder();
          clearWorkspace(in_workspace);
        }
        console.assert(HFDMTimings.length && dataBinderTimings.length);
        const avgHFDM = average(HFDMTimings);
        const avgDataBinder = average(dataBinderTimings);
        const ratio = median(dataBinderTimings) / median(HFDMTimings);
        if (debugPrint) {
          console.log('average HFDM: ', avgHFDM);
          console.log('median HFDM:  ', median(HFDMTimings));
          console.log('stddev HFDM:  ', standardDeviation(HFDMTimings));
          console.log('average dataBinder: ', avgDataBinder);
          console.log('median dataBinder:  ', median(dataBinderTimings));
          console.log('stddev dataBinder:  ', standardDeviation(dataBinderTimings));
          console.log('ratio: ', ratio);
        }
        return ratio;
      };

      const testInsertRetroactive = function(in_workspace,
        in_dataBinder,
        in_typeid,
        in_numOfCreatedBindings,
        in_createFunc,
        in_multipleBindings = false) {
        const HFDMTimings = [];
        const dataBinderTimings = [];
        for (let i = 0; i < numberOfIterations; ++i) {
          // zero our counters before each iteration
          databindingCreatedCounter = 0;
          modifySceneCallCount = 0;
          if (!in_multipleBindings) {
            in_dataBinder.register('BINDING', in_typeid, MinimalBinding);
          } else {
            in_dataBinder.register('BINDING1', in_typeid, MinimalBinding);
            in_dataBinder.register('BINDING2', in_typeid, MinimalBinding);
            in_dataBinder.register('BINDING3', in_typeid, MinimalBinding);
            in_dataBinder.register('BINDING4', in_typeid, MinimalBinding);
            in_dataBinder.register('BINDING5', in_typeid, MinimalBinding);
          }
          in_workspace.pushModifiedEventScope();
          in_createFunc(in_workspace, in_typeid, numberOfTreeNodes);
          const hfdmstart = performance.now();
          in_workspace.popModifiedEventScope();
          const hfdmend = performance.now();
          const elapsedhfdm = hfdmend - hfdmstart;
          HFDMTimings.push(elapsedhfdm);

          modifySceneCallCount = 0;
          in_dataBinder.attachTo(workspace);
          modifySceneCallCount.should.equal(1);
          const elapseddatabinder = modifySceneEnd - modifySceneStart;
          dataBinderTimings.push(elapseddatabinder);
          databindingCreatedCounter.should.equal(in_numOfCreatedBindings);
          cleanupDataBinder();
          clearWorkspace(in_workspace);
        }
        const avgHFDM = average(HFDMTimings);
        const avgDataBinder = average(dataBinderTimings);
        const ratio = median(dataBinderTimings) / median(HFDMTimings);
        if (debugPrint) {
          console.log('average HFDM: ', avgHFDM);
          console.log('median HFDM:  ', median(HFDMTimings));
          console.log('stddev HFDM:  ', standardDeviation(HFDMTimings));
          console.log('average dataBinder: ', avgDataBinder);
          console.log('median dataBinder:  ', median(dataBinderTimings));
          console.log('stddev dataBinder:  ', standardDeviation(dataBinderTimings));
          console.log('ratio: ', ratio);
        }
        return ratio;
      };

      describe('deep tree', function() {

        it('deep tree, complex template, no relative path callbacks, one data binding', function() {
          const ratio = testInsert(workspace, dataBinder, ParentTemplate.typeid, numberOfTreeNodes, createDeepTree);
          ratio.should.be.lte(3.5);
        });

        it('deep tree, complex template, no relative path callbacks, one data binding, retroactive', function() {
          const ratio = testInsertRetroactive(workspace, dataBinder, ParentTemplate.typeid, numberOfTreeNodes, createDeepTree);
          ratio.should.be.lte(40); // fairly high, to be optimised!
        });

        it('deep tree, complex template, no relative path callbacks, multiple data bindings', function() {
          const ratio = testInsert(workspace, dataBinder, ParentTemplate.typeid, 5 * numberOfTreeNodes, createDeepTree, true);
          ratio.should.be.lte(10);
        });

        it('deep tree, complex template, no relative path callbacks, multiple data bindings, retroactive', function() {
          const ratio = testInsertRetroactive(workspace, dataBinder, ParentTemplate.typeid, 5 * numberOfTreeNodes, createDeepTree, true);
          ratio.should.be.lte(100); // fairly high, to be optimised!
        });

        it('deep tree, just NodeProperty, no relative path callbacks, one data binding', function() {
          // root is also a NodeProperty so an extra binding will be created
          const ratio = testInsert(workspace, dataBinder, 'NodeProperty', numberOfTreeNodes + 1, createDeepTree);
          ratio.should.be.lte(5);
        });

        it('deep tree, just NodeProperty, no relative path callbacks, one data binding, retroactive', function() {
          // root is also a NodeProperty so an extra binding will be created
          const ratio = testInsertRetroactive(workspace, dataBinder, 'NodeProperty', numberOfTreeNodes + 1, createDeepTree);
          ratio.should.be.lte(100); // fairly high, to be optimised!
        });

        it('deep tree, just NodeProperty, no relative path callbacks, multiple data bindings', function() {
          const ratio = testInsert(workspace, dataBinder, 'NodeProperty', 5 * numberOfTreeNodes + 5, createDeepTree, true);
          ratio.should.be.lte(10);
        });

        it('deep tree, just NodeProperty, no relative path callbacks, multiple data bindings, retroactive', function() {
          const ratio = testInsertRetroactive(workspace, dataBinder, 'NodeProperty', 5 * numberOfTreeNodes + 5, createDeepTree, true);
          ratio.should.be.lte(350); // fairly high, to be optimised!
        });
      });

      describe('wide tree', function() {

        it('wide tree, complex template, no relative path callbacks, one data binding', function() {
          const ratio = testInsert(workspace, dataBinder, ParentTemplate.typeid, numberOfTreeNodes, createWideTree);
          ratio.should.be.lte(1.5);
        });

        it('wide tree, complex template, no relative path callbacks, one data binding, retroactive', function() {
          const ratio = testInsertRetroactive(workspace, dataBinder, ParentTemplate.typeid, numberOfTreeNodes, createWideTree);
          ratio.should.be.lte(5);
        });

        it('wide tree, complex template, no relative path callbacks, multiple data bindings', function() {
          const ratio = testInsert(workspace, dataBinder, ParentTemplate.typeid, 5 * numberOfTreeNodes, createWideTree, true);
          ratio.should.be.lte(3);
        });

        it('wide tree, complex template, no relative path callbacks, multiple data bindings, retroactive', function() {
          const ratio = testInsertRetroactive(workspace, dataBinder, ParentTemplate.typeid, 5 * numberOfTreeNodes, createWideTree, true);
          ratio.should.be.lte(15);
        });

        it('wide tree, just NodeProperty, no relative path callbacks, one data binding', function() {
          const ratio = testInsert(workspace, dataBinder, 'NodeProperty', numberOfTreeNodes + 1, createWideTree);
          ratio.should.be.lte(5);
        });

        it('wide tree, just NodeProperty, no relative path callbacks, one data binding, retroactive', function() {
          const ratio = testInsertRetroactive(workspace, dataBinder, 'NodeProperty', numberOfTreeNodes + 1, createWideTree);
          ratio.should.be.lte(10);
        });

        it('wide tree, just NodeProperty, no relative path callbacks, multiple data bindings', function() {
          const ratio = testInsert(workspace, dataBinder, 'NodeProperty', 5 * numberOfTreeNodes + 5, createWideTree, true);
          ratio.should.be.lte(6);
        });

        it('wide tree, just NodeProperty, no relative path callbacks, multiple data bindings, retroactive', function() {
          const ratio = testInsertRetroactive(workspace, dataBinder, 'NodeProperty', 5 * numberOfTreeNodes + 5, createWideTree, true);
          ratio.should.be.lte(25);
        });
      });

      describe('3 children tree', function() {

        it('3 children tree, complex template, no relative path callbacks, one data binding', function() {
          const ratio = testInsert(workspace, dataBinder, ParentTemplate.typeid, numberOfTreeNodes, createTreeWith3Children);
          ratio.should.be.lte(3);
        });

        it('3 children tree, complex template, no relative path callbacks, one data binding, retroactive', function() {
          const ratio = testInsertRetroactive(workspace, dataBinder, ParentTemplate.typeid, numberOfTreeNodes, createTreeWith3Children);
          ratio.should.be.lte(6);
        });

        it('3 children tree, complex template, no relative path callbacks, multiple data bindingx', function() {
          const ratio = testInsert(workspace, dataBinder, ParentTemplate.typeid, 5 * numberOfTreeNodes, createTreeWith3Children, true);
          ratio.should.be.lte(3);
        });

        it('3 children tree, complex template, no rel. path callbacks, multiple data bindings, retroactive', function() {
          const ratio = testInsertRetroactive(workspace, dataBinder, ParentTemplate.typeid, 5 * numberOfTreeNodes, createTreeWith3Children, true);
          ratio.should.be.lte(20);
        });

        it('3 children tree, just NodeProperty, no relative path callbacks, one data binding', function() {
          const ratio = testInsert(workspace, dataBinder, 'NodeProperty', numberOfTreeNodes + 1, createTreeWith3Children);
          ratio.should.be.lte(3);
        });

        it('3 children tree, just NodeProperty, no relative path callbacks, one data binding, retroactive', function() {
          const ratio = testInsertRetroactive(workspace, dataBinder, 'NodeProperty', numberOfTreeNodes + 1, createTreeWith3Children);
          ratio.should.be.lte(20);
        });

        it('3 children tree, just NodeProperty, no relative path callbacks, multiple data bindingx', function() {
          const ratio = testInsert(workspace, dataBinder, 'NodeProperty', 5 * numberOfTreeNodes + 5, createTreeWith3Children, true);
          ratio.should.be.lte(7);
        });

        it('3 children tree, just NodeProperty, no rel. path callbacks, multiple data bindings, retroactive', function() {
          const ratio = testInsertRetroactive(workspace, dataBinder, 'NodeProperty', 5 * numberOfTreeNodes + 5, createTreeWith3Children, true);
          ratio.should.be.lte(40);
        });
      });

      describe('5 children tree', function() {

        it('5 children tree, complex template, no relative path callbacks, one data binding', function() {
          const ratio = testInsert(workspace, dataBinder, ParentTemplate.typeid, numberOfTreeNodes, createTreeWith5Children);
          ratio.should.be.lte(3);
        });

        it('5 children tree, complex template, no relative path callbacks, one data binding, retroactive', function() {
          const ratio = testInsertRetroactive(workspace, dataBinder, ParentTemplate.typeid, numberOfTreeNodes, createTreeWith5Children);
          ratio.should.be.lte(6);
        });

        it('5 children tree, complex template, no relative path callbacks, multiple data bindingx', function() {
          const ratio = testInsert(workspace, dataBinder, ParentTemplate.typeid, 5 * numberOfTreeNodes, createTreeWith5Children, true);
          ratio.should.be.lte(3);
        });

        it('5 children tree, complex template, no rel. path callbacks, multiple data bindings, retroactive', function() {
          const ratio = testInsertRetroactive(workspace, dataBinder, ParentTemplate.typeid, 5 * numberOfTreeNodes, createTreeWith5Children, true);
          ratio.should.be.lte(15);
        });

        it('5 children tree, just NodeProperty, no relative path callbacks, one data binding', function() {
          const ratio = testInsert(workspace, dataBinder, 'NodeProperty', numberOfTreeNodes + 1, createTreeWith5Children);
          ratio.should.be.lte(3);
        });

        it('5 children tree, just NodeProperty, no relative path callbacks, one data binding, retroactive', function() {
          const ratio = testInsertRetroactive(workspace, dataBinder, 'NodeProperty', numberOfTreeNodes + 1, createTreeWith5Children);
          ratio.should.be.lte(15);
        });

        it('5 children tree, just NodeProperty, no relative path callbacks, multiple data bindingx', function() {
          const ratio = testInsert(workspace, dataBinder, 'NodeProperty', 5 * numberOfTreeNodes + 5, createTreeWith5Children, true);
          ratio.should.be.lte(7);
        });

        it('5 children tree, just NodeProperty, no rel. path callbacks, multiple data bindings, retroactive', function() {
          const ratio = testInsertRetroactive(workspace, dataBinder, 'NodeProperty', 5 * numberOfTreeNodes + 5, createTreeWith5Children, true);
          ratio.should.be.lte(40);
        });
      });
    });
    describe('Performance tests - modify', function() {
      const testModify = function(in_workspace,
        in_dataBinder,
        in_typeid,
        in_numOfCreatedBindings,
        in_createFunc,
        in_subProperty,
        in_newValue,
        in_multipleBindings = false) {
        const HFDMTimings = [];
        const dataBinderTimings = [];
        for (let i = 0; i < numberOfIterations; ++i) {
          // zero our counters before each iteration
          databindingCreatedCounter = 0;
          databindingModifiedCounter = 0;
          modifySceneCallCount = 0;
          // first create the workspace and save each created property in an array so that we can modify them later
          let createdProperties = [];
          in_workspace.pushModifiedEventScope();
          in_createFunc(in_workspace, in_typeid, numberOfTreeNodes, createdProperties);
          in_workspace.popModifiedEventScope();
          modifySceneCallCount.should.equal(0); // dataBinder should not be called yet
          // now modify the properties and measure how long HFDM takes
          in_workspace.pushModifiedEventScope();
          createdProperties.forEach(prop => {
            prop.get(in_subProperty).setValue(in_newValue);
          });
          // measure HFDM
          const hfdmstart = performance.now();
          in_workspace.popModifiedEventScope();
          const hfdmend = performance.now();
          modifySceneCallCount.should.equal(0); // dataBinder should not be called yet
          const elapsedhfdm = hfdmend - hfdmstart;
          // console.log('elapsed hfdm: ', elapsedhfdm);
          HFDMTimings.push(elapsedhfdm);
          clearWorkspace(in_workspace);
          if (!in_multipleBindings) {
            in_dataBinder.register('BINDING', in_typeid, MinimalBinding);
          } else {
            in_dataBinder.register('BINDING1', in_typeid, MinimalBinding);
            in_dataBinder.register('BINDING2', in_typeid, MinimalBinding);
            in_dataBinder.register('BINDING3', in_typeid, MinimalBinding);
            in_dataBinder.register('BINDING4', in_typeid, MinimalBinding);
            in_dataBinder.register('BINDING5', in_typeid, MinimalBinding);
          }

          in_dataBinder.attachTo(in_workspace);
          modifySceneCallCount = 0;   // we have to reset the counter after attaching

          // recreate the workspace, this time with bindings enabled
          createdProperties = [];
          in_workspace.pushModifiedEventScope();
          in_createFunc(in_workspace, in_typeid, numberOfTreeNodes, createdProperties);
          in_workspace.popModifiedEventScope();

          modifySceneCallCount.should.equal(1);
          // now do the same modifications again, but this time measure the time dataBinder takes
          in_workspace.pushModifiedEventScope();
          createdProperties.forEach(prop => {
            prop.get(in_subProperty).setValue(in_newValue);
          });
          in_workspace.popModifiedEventScope();
          modifySceneCallCount.should.equal(2);
          const elapseddatabinder = modifySceneEnd - modifySceneStart;
          // console.log('elapsed databinder: ', elapseddatabinder);
          dataBinderTimings.push(elapseddatabinder);

          databindingCreatedCounter.should.equal(in_numOfCreatedBindings);
          databindingModifiedCounter.should.equal(in_numOfCreatedBindings);
          cleanupDataBinder();
          clearWorkspace(in_workspace);
        }
        console.assert(HFDMTimings.length && dataBinderTimings.length);
        const avgHFDM = average(HFDMTimings);
        const avgDataBinder = average(dataBinderTimings);
        const ratio = median(dataBinderTimings) / median(HFDMTimings);
        if (debugPrint) {
          console.log('average HFDM: ', avgHFDM);
          console.log('median HFDM:  ', median(HFDMTimings));
          console.log('stddev HFDM:  ', standardDeviation(HFDMTimings));
          console.log('average dataBinder: ', avgDataBinder);
          console.log('median dataBinder:  ', median(dataBinderTimings));
          console.log('stddev dataBinder:  ', standardDeviation(dataBinderTimings));
          console.log('ratio: ', ratio);
        }
        return ratio;
      };

      it('deep tree, complex template, no relative path callbacks, one data binding', function() {
        const ratio = testModify(workspace, dataBinder, ParentTemplate.typeid, numberOfTreeNodes, createDeepTree, 'text', '42');
        ratio.should.be.lte(2);
      });

      it('deep tree, complex template, no relative path callbacks, multiple data bindings', function() {
        const ratio = testModify(workspace, dataBinder, ParentTemplate.typeid, 5 * numberOfTreeNodes, createDeepTree, 'text', '42', true);
        ratio.should.be.lte(4);
      });
      it('wide tree, complex template, no relative path callbacks, one data binding', function() {
        const ratio = testModify(workspace, dataBinder, ParentTemplate.typeid, numberOfTreeNodes, createWideTree, 'text', '42');
        ratio.should.be.lte(2);
      });

      it('wide tree, complex template, no relative path callbacks, multiple data bindings', function() {
        const ratio = testModify(workspace, dataBinder, ParentTemplate.typeid, 5 * numberOfTreeNodes, createWideTree, 'text', '42', true);
        ratio.should.be.lte(4);
      });

      it('3 children tree, complex template, no relative path callbacks, one data binding', function() {
        const ratio = testModify(workspace, dataBinder, ParentTemplate.typeid, numberOfTreeNodes, createTreeWith3Children, 'text', '42');
        ratio.should.be.lte(2);
      });

      it('3 children tree, complex template, no relative path callbacks, multiple data bindingx', function() {
        const ratio = testModify(workspace, dataBinder, ParentTemplate.typeid, 5 * numberOfTreeNodes, createTreeWith3Children, 'text', '42', true);
        ratio.should.be.lte(4);
      });
      it('5 children tree, complex template, no relative path callbacks, one data binding', function() {
        const ratio = testModify(workspace, dataBinder, ParentTemplate.typeid, numberOfTreeNodes, createTreeWith5Children, 'text', '42');
        ratio.should.be.lte(2);
      });

      it('5 children tree, complex template, no relative path callbacks, multiple data bindingx', function() {
        const ratio = testModify(workspace, dataBinder, ParentTemplate.typeid, 5 * numberOfTreeNodes, createTreeWith5Children, 'text', '42', true);
        ratio.should.be.lte(4);
      });
    });
  });
})();
