/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { PropertyProxy } from '@fluid-experimental/property-proxy';
import { BaseProperty, PropertyFactory } from '@fluid-experimental/property-properties';
import { TypeIdHelper } from "@fluid-experimental/property-changeset";
import { defaultInspectorTableChildGetter, defaultInspectorTableNameGetter } from '../src/InspectorTable';
import { IColumns, IInspectorRow, IInspectorSearchMatch } from '../src/InspectorTableTypes';
import { search, showNextResult } from '../src/utils';

import { findRow, getExpandedMap, getHash, initializeWorkspace, getAllMatchesFromRows } from './testUtils';
import { toTableRows, dummyChild, fillExpanded, expandAll, sanitizePath } from '../src/propertyInspectorUtils';
import { uniqueIdentifier } from './common';

describe('InspectorTable', () => {
  let workspace;
  let rows;
  let rootProxy;
  const props = {
    childGetter: defaultInspectorTableChildGetter,
    nameGetter: defaultInspectorTableNameGetter,
  };
  const toTableRowOptions = {
    depth: 0,
    addDummy: true,
    followReferences: false,
    ascending: true
  };
  const columns: IColumns[] = [
    { title: 'Name', dataKey: 'name', key: 'name', width: 100, sortable: true },
    { title: 'Value', dataKey: 'value', key: 'value', width: 100, sortable: false },
  ];
  const initId = '';
  describe('toTableRows', () => {
    beforeAll(async () => {
      ({ workspace, rootProxy } = await initializeWorkspace());
      rows = toTableRows({
        data: rootProxy,
        id: initId,
      } as IInspectorRow, props, { depth: 10, addDummy: false });

    });

    it('should adhere to 0 depth', () => {
      const testRows = toTableRows({ data: rootProxy, id: initId } as IInspectorRow, props,
        { addDummy: false });
      const coordDepth0 = findRow('CoordinateSystem3D', testRows);
      // No recursion
      expect(coordDepth0.children).toEqual(undefined);
    });

    it('should adhere to n depth', () => {
      const testRows = toTableRows({ data: rootProxy, id: initId } as IInspectorRow, props,
        { depth: 1, addDummy: false });
      const coordDepth1 = findRow('CoordinateSystem3D', testRows);
      expect(coordDepth1.children!.length).toEqual(workspace.get('CoordinateSystem3D').getIds().length);
    });

    it('should add dummy child for expandable properties', () => {
      const testRows = toTableRows({ data: rootProxy, id: initId } as IInspectorRow, props,
        {});
      const coordDepth1 = findRow('CoordinateSystem3D', testRows);
      expect(coordDepth1.children!.length).toEqual(1);
      expect(coordDepth1.children![0]!.name).toEqual(dummyChild.name);
    });

    it('should work for the first level', () => {
      const ids = workspace.getIds();
      expect(ids.length).toEqual(rows.length);
      for (const id of ids) {
        const prop = workspace.get(id, { referenceResolutionMode: 1 });
        const row = findRow(id, rows);
        if (!TypeIdHelper.isPrimitiveType(prop.getTypeid())) {
          expect(row.children!.length).toBeGreaterThan(0);
        }
        expect(row).not.toBeUndefined();
      }
    });

    it('should stop at single references', () => {
      const testRows = toTableRows({ data: rootProxy, id: initId } as IInspectorRow, props,
        { depth: -1, addDummy: false, followReferences: false });
      const validReference = findRow('ValidReference', testRows);
      expect(validReference.children).toEqual(undefined);
      expect(validReference.value).toEqual(workspace.get(
        'ValidReference', { referenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.NEVER }).value);
      const invalidReference = findRow('InvalidReference', testRows)!;
      expect(invalidReference.children).toEqual(undefined);
      expect(invalidReference.value).toEqual(workspace.get(
        'InvalidReference', { referenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.NEVER }).value);
    });
    it('should stop at collections of references', () => {
      const testRows = toTableRows({ data: rootProxy, id: initId } as IInspectorRow, props,
        { depth: -1, addDummy: false, followReferences: false });
      const referenceCollections = findRow('ReferenceCollections', testRows)!;
      const referenceMap = findRow('map', referenceCollections.children!)!;
      const referenceArray = findRow('arrayOfReferences', referenceCollections.children!)!;
      expect(referenceArray.children![1].children).toEqual(undefined);
      expect(findRow('array', referenceMap.children!).children).toEqual(undefined);
      expect(findRow('array', referenceMap.children!).value).toEqual(
        workspace.get(['ReferenceCollections', 'map']).getValue('array'));
      expect(referenceArray.children![1].value).toEqual(
        workspace.get(['ReferenceCollections', 'arrayOfReferences']).getValue(1));
    });

    it('depth should take precedence to addDummy flag', () => {
      const testRows = toTableRows({ data: rootProxy, id: initId } as IInspectorRow, props,
        { depth: -1, addDummy: true, followReferences: false });
      const complexProp = findRow('CoordinateSystem3D', testRows);
      expect(complexProp.children!.length).toEqual(workspace.get('CoordinateSystem3D').getIds().length);
    });

    it('should respect constants', () => {
      const testRows = toTableRows({ data: rootProxy, id: initId } as IInspectorRow, props,
        { depth: -1, addDummy: true, followReferences: false });
      const sampleRowWithConsts = findRow('SampleConst', testRows);
      const constRow = findRow('const', sampleRowWithConsts.children!);

      expect(constRow.isConstant).toEqual(true);
    });

    it('should respect constants with deeply nested children', () => {
      const testRows = toTableRows({ data: rootProxy, id: initId } as IInspectorRow, props,
        { depth: -1, addDummy: true, followReferences: false });
      const sampleRowWithConsts = findRow('sampleComplexConst', testRows);
      const child = findRow('constChild', sampleRowWithConsts.children!);

      expect(child.isConstant).toEqual(true);

      child.children!.forEach((grandchild) => {
        expect(grandchild.isConstant).toEqual(true);
        expect(grandchild.parentIsConstant).toEqual(true);

        grandchild.children!.forEach((greatGrandchild) => {
          expect(greatGrandchild.parentIsConstant).toEqual(true);
        });
      });

    });

    describe('collections', () => {
      it('should infer proper typeids for children', () => {
        const nonPrimitiveCollectionMap = workspace.get(['NonPrimitiveCollections', 'map']);
        const nonPrimitiveCollectionRow = findRow('NonPrimitiveCollections', rows);
        const nonPrimitiveCollectionMapRow = findRow('map', nonPrimitiveCollectionRow.children!);
        expect(nonPrimitiveCollectionMapRow.children!.length).toEqual(nonPrimitiveCollectionMap.getIds().length);
        nonPrimitiveCollectionMapRow.children!.forEach((row, index) => {
          expect(nonPrimitiveCollectionMap.get(row.name).getTypeid()).toEqual(row.typeid);
        });
      });
      describe('arrays', () => {
        it('should include children for string array', () => {
          const row = findRow('stringArray', rows);
          expect(row.children!.length).toEqual(workspace.get('stringArray').length);
        });
        it('should include children for int64 array', () => {
          const row = findRow('uint64Array', rows);
          expect(row.children!.length).toEqual(workspace.get('uint64Array').length);
        });
      });

      it('should respect collection constants', () => {
        const testRows = toTableRows({ data: rootProxy, id: initId } as IInspectorRow, props,
          { depth: -1, addDummy: true, followReferences: false });
        const sampleCollectionConstRow = findRow('SampleCollectionConst', testRows);
        const constRow = findRow('numbersConst', sampleCollectionConstRow.children!);

        expect(constRow.isConstant).toEqual(true);
        constRow.children!.forEach((childRow) => {
          expect(childRow.parentIsConstant).toEqual(true);
        });
      });
    });

    it('should sort correctly', () => {
      let sortingRootProxy;
      const sortingWorkspace = PropertyFactory.create('NodeProperty') as any;
      sortingWorkspace.insert('NameA',
        PropertyFactory.create('String', 'single', 'HelloA ') as BaseProperty);
      sortingWorkspace.insert('NameB',
        PropertyFactory.create('String', 'single', 'HelloB ') as BaseProperty);
      sortingRootProxy = PropertyProxy.proxify(sortingWorkspace.getRoot());

      const testRows = toTableRows({ data: sortingRootProxy, id: initId } as IInspectorRow, props,
        { ascending: true });
      expect(testRows[0].name).toEqual('NameA');
      expect(testRows[1].name).toEqual('NameB');

      const testRowsDesc = toTableRows({ data: sortingRootProxy, id: initId } as IInspectorRow, props,
        { ascending: false });
      expect(testRowsDesc[0].name).toEqual('NameB');
      expect(testRowsDesc[1].name).toEqual('NameA');

    });

  });

  describe('fillExpanded', () => {
    beforeAll(async () => {
      ({ workspace, rootProxy } = await initializeWorkspace());
      rows = toTableRows({
        data: rootProxy,
        id: initId,
      } as IInspectorRow, props, {});
    });

    it('should work expansion of complex types', () => {
      const testId = 'Point3D';
      // We add a second one to check there is no interference
      const expanded = getExpandedMap([initId + '/' + testId, initId + '/CoordinateSystem3D']);
      fillExpanded(expanded, rows, props);
      const pointRow = findRow(testId, rows);
      expect(pointRow.children!.length).toEqual(workspace.get(testId).getIds().length);
    });

    it('should work with maps', () => {
      const testId = 'NonPrimitiveCollections';
      const expanded = getExpandedMap(['/' + testId, '/' + testId + '/map']);
      fillExpanded(expanded, rows, props);
      const map = findRow('map', findRow(testId, rows).children!);
      expect(map.children!.length).toEqual(workspace.get([testId, 'map']).getIds().length);
      // Should have added a dummy children
      expect(map.children![0].children!.length).toEqual(1);
    });

    it('should work with arrays', () => {
      const testId = 'NonPrimitiveCollections';
      const expanded = ['/' + testId, '/' + testId + '/array'];
      fillExpanded(getExpandedMap(expanded), rows, props);
      const array = findRow('array', findRow(testId, rows).children!);
      expect(array.children!.length).toEqual(workspace.get([testId, 'array']).length);
      // Should have added a dummy children
      expect(array.children![0].children!.length).toEqual(1);
    });

    it('should work with set', () => {
      const testId = 'NonPrimitiveCollections';
      const expanded = ['/' + testId, '/' + testId + '/set'];
      fillExpanded(getExpandedMap(expanded), rows, props);
      const set = findRow('set', findRow(testId, rows).children!)!;
      expect(set.children!.length).toEqual(workspace.get([testId, 'set']).getIds().length);
    });

    it('should work with set and other collections expanded', () => {
      const testId = 'ReferenceCollections';
      const expanded = [
        '/' + testId, '/' + testId + '/arrayOfReferences',
        '/' + testId + '/arrayOfReferences/1', '/' + testId + '/arrayOfReferences/17'];
      fillExpanded(getExpandedMap(expanded), rows, props);
      const set = findRow('arrayOfReferences', findRow(testId, rows).children!);
      expect(set.children!.length).toEqual(workspace.get([testId, 'arrayOfReferences']).getIds().length);
      expect(set.children![1].children!.length)
        .toEqual(workspace.get([testId, 'arrayOfReferences', '1']).length);
      expect(set.children![17].children!.length)
        .toEqual(workspace.get([testId, 'arrayOfReferences', '17']).length);
    });

  });

  describe('search', () => {
    beforeAll(async () => {
      ({ workspace, rootProxy } = await initializeWorkspace());
      rows = toTableRows({
        data: rootProxy,
        id: initId,
      } as IInspectorRow, props, { depth: -1, addDummy: false, followReferences: false });
    });

    it('should work for properties at the root on the name column', () => {
      return getAllMatchesFromRows('ReferenceCollections', rows, undefined, columns!, props, toTableRowOptions)
        .then((result) => {
          expect(result.matches.length).toEqual(3);
          // Match found in the first column
          const foundRow = findRow('ReferenceCollections', rows);
          expect(result.matchesMap[foundRow.id][0]).toEqual(true);
        });
    });

    it('should work for properties at the root on the value columns', (done) => {
      search(workspace.get('String').value, rows, undefined, columns!,
        (matches: IInspectorSearchMatch[], matchesMap) => {
          expect(matches.length).toEqual(1);
          // Match found in the first column
          const foundRow = findRow('String', rows);
          expect(matchesMap[foundRow.id][0]).toBeUndefined();
          expect(matchesMap[foundRow.id][1]).toEqual(true);
          done();
      }, props, toTableRowOptions);
    });

    it('should work based on dataGetter', () => {
      const customDummyChild = {...dummyChild};
      customDummyChild.context = 'cd';

      const data = [
        customDummyChild,
        Object.assign({}, customDummyChild, { id: 'dd', children: [{...customDummyChild, id: 'ddd'}] }),
      ];

      return getAllMatchesFromRows('test', data, () => ('test'), columns!, props, toTableRowOptions)
        .then((result) => {
          expect(result.matches.length).toEqual(6);
          expect(result.matchesMap['d'][0]).toEqual(true);
          expect(result.matchesMap['d'][1]).toEqual(true);
        });
    });

    it('should work when results appears both in the name and value column', () => {
      return getAllMatchesFromRows(uniqueIdentifier, rows, undefined, columns!, props, toTableRowOptions)
        .then((result) => {
          expect(result.matches.length).toEqual(2);
          expect(result.matchesMap[result.matches[0].rowId][0]).toEqual(true);
          expect(result.matchesMap[result.matches[0].rowId][1]).toEqual(true);
        });
    });

    it('should return the correct number of results', () => {
      return getAllMatchesFromRows('X', rows, undefined, columns!, props, toTableRowOptions)
        .then((result) => {
          expect(result.matches.length).toEqual(
            7 + // coordinate system
            6 + // reference paths
            3 + // collection of points3d
            12 + // collection of coordinate system
            1 + // point3d.x
            1 + // sampleComplexConst
            1, // sampleConst.x
          );
        });
    });

    it('should build rows on the fly', async () => {
      ({ workspace, rootProxy } = await initializeWorkspace());
      const flatRows = toTableRows({
        data: rootProxy,
        id: initId,
      } as IInspectorRow, props, toTableRowOptions);
      return getAllMatchesFromRows('X', flatRows, undefined, columns!, props, toTableRowOptions)
        .then((result) => {
          expect(result.matches.length).toEqual(
            7 + // coordinate system
            6 + // reference paths
            3 + // collection of points3d
            12 + // collection of coordinate system
            1 + // point3d.x
            1 + // sampleComplexConst
            1, // sampleConst.x
          );
        })
    });
  });

  describe('showNextMatchingResult', () => {
    beforeAll(async () => {
      ({ workspace, rootProxy } = await initializeWorkspace());
      rows = toTableRows({
        data: rootProxy,
        id: initId,
      } as IInspectorRow, props, { depth: -1, addDummy: false, followReferences: false });
    });

    it('should work for top-level properties', (done) => {
      search('BooleanFalse', rows, undefined, columns!,
      (matches: IInspectorSearchMatch[], matchesMap, searchDone, childToParentMap) => {
        const nextMatchInfo = showNextResult(rows, {}, matches, 0, childToParentMap);
        expect(Object.keys(nextMatchInfo.expandedRows).length).toEqual(0);
        expect(nextMatchInfo.rowIdx).toEqual(0);
        expect(nextMatchInfo.columnIdx).toEqual(0);
        done();
      }, props, toTableRowOptions);
    });

    it('should work for properties which are children of another properties', (done) => {
      search('axisX', rows, undefined, columns!,
      (matches: IInspectorSearchMatch[], matchesMap, searchDone, childToParentMap) => {
        const nextMatchInfo = showNextResult(rows, {}, matches, 0, childToParentMap);
        expect(Object.keys(nextMatchInfo.expandedRows).length).toEqual(1);
        expect(nextMatchInfo.rowIdx).toEqual(3);
        expect(nextMatchInfo.columnIdx).toEqual(0);
        done();
      }, props, toTableRowOptions);
    });

    it('should work when other items were expanded by user', () => {
      const testId = 'CoordinateSystem3D';
      const expanded = getExpandedMap(['/' + testId]);
      return getAllMatchesFromRows('enum', rows, undefined, columns!, props, toTableRowOptions)
        .then((result) => {
          const nextMatchInfo = showNextResult(rows, expanded, result.matches, 1, result.childToParentMap);
          expect(Object.keys(nextMatchInfo.expandedRows).length).toEqual(2);
          expect(nextMatchInfo.rowIdx).toEqual(7);
          expect(nextMatchInfo.columnIdx).toEqual(0);
        });
    });

    it('should work when only found in top most element and nothing should be expanded', (done) => {
      search('SampleCollectionConst', rows, undefined, columns!,
        (matches: IInspectorSearchMatch[], matchesMap, searchDone, childToParentMap) => {
          const nextMatchInfo = showNextResult(rows, {}, matches, 0, childToParentMap);
          expect(Object.keys(nextMatchInfo.expandedRows).length).toEqual(0);
          expect(nextMatchInfo.rowIdx).toEqual(22);
          expect(nextMatchInfo.columnIdx).toEqual(0);
          done();
      }, props, toTableRowOptions);
    });

    it('should not expand current result', () => {
      return getAllMatchesFromRows('y', rows, undefined, columns!, props, toTableRowOptions)
        .then((result) => {
          const nextMatchInfo = showNextResult(rows, {}, result.matches, 2, result.childToParentMap);
          expect(result.matches[2].rowId in nextMatchInfo.expandedRows).toEqual(false);
        });
    });
  });

  describe('expandAll', () => {
    let expanded;
    beforeAll(async () => {
      ({rootProxy } = await initializeWorkspace());
      expanded = Object.keys(expandAll(rootProxy));
    });

    it('should expand nonprimitives', () => {
      expect(expanded.includes(getHash('/CoordinateSystem3D'))).toEqual(true);
      expect(expanded.includes(getHash('/CoordinateSystem3D/axisX'))).toEqual(true);
    });

    it('should expand nonprimitive collections', () => {
      expect(expanded.includes(getHash('/NonPrimitiveCollections/array'))).toEqual(true);
      expect(expanded.includes(getHash('/NonPrimitiveCollections/array/0'))).toEqual(true);
      expect(expanded.includes(getHash('/NonPrimitiveCollections/map'))).toEqual(true);
      expect(expanded.includes(getHash('/NonPrimitiveCollections/map/axisX'))).toEqual(true);
      expect(expanded.includes(getHash('/NonPrimitiveCollections/set'))).toEqual(true);
    });

    it('should expand collections of primitives', () => {
      expect(expanded.includes(getHash('/stringArray'))).toEqual(true);
      expect(expanded.includes(getHash('/stringMap'))).toEqual(true);
      expect(expanded.includes(getHash('/int32Array'))).toEqual(true);
      expect(expanded.includes(getHash('/int32Map'))).toEqual(true);
      expect(expanded.includes(getHash('/int64Array'))).toEqual(true);
      expect(expanded.includes(getHash('/int64Map'))).toEqual(true);
      expect(expanded.includes(getHash('/float64Array'))).toEqual(true);
      expect(expanded.includes(getHash('/float64Map'))).toEqual(true);
      expect(expanded.includes(getHash('/uint64Array'))).toEqual(true);
      expect(expanded.includes(getHash('/uint64Map'))).toEqual(true);
    });

    it('should expand collections of references', () => {
      expect(expanded.includes(getHash('/ReferenceCollections'))).toEqual(true);
      expect(expanded.includes(getHash('/ReferenceCollections/arrayOfReferences'))).toEqual(true);
      expect(expanded.includes(getHash('/ReferenceCollections/map'))).toEqual(true);
    });

    it('should not expand reference', () => {
      expect(expanded.includes(getHash('/ReferenceCollections/arrayOfReferences/1'))).toEqual(false);
    });

    it('should expand enum collections', () => {
      expect(expanded.includes(getHash('/EnumCases/enumMap'))).toEqual(true);
      expect(expanded.includes(getHash('/EnumCases/enumMap/a'))).toEqual(false);
      expect(expanded.includes(getHash('/EnumCases/enumArray'))).toEqual(true);
      expect(expanded.includes(getHash('/EnumCases/enumArray/1'))).toEqual(false);
    });
  });

  describe('sanitizePath', () => {
    it(`should replace "." and "[" to "/", and "]" to "" `, () => {
      const untransformedString = `NonPrimitiveCollections.map[outlier].axisX`;
      const expectedString = `NonPrimitiveCollections/map/outlier/axisX`;
      const idSeparator = '/';
      const sanitizer = [
        { searchFor: /[.]/g, replaceWith: idSeparator },
        { searchFor: /[\[]/g, replaceWith: idSeparator },
        { searchFor: /[\]]/g, replaceWith: '' },
      ];
      expect(sanitizePath(untransformedString, sanitizer)).toEqual(expectedString);
    });
  });
});
