/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ArrayProperty, NodeProperty, PropertyFactory } from "@fluid-experimental/property-properties";
import { PropertyProxy } from "@fluid-experimental/property-proxy";
import { Tooltip } from '@material-ui/core';
import { ReactWrapper } from "enzyme";
import React from 'react';
import { useFakeTimers } from 'sinon';
import { InspectorMessages } from '../src/constants';
import { Empty } from '../src/Empty';
import { IDataGetterParameter } from '../src/InspectorTableTypes';
import { NameCell } from '../src/NameCell';
import { fetchRegisteredTemplates } from '../src/PropertyDataCreationHandlers';
import { BooleanView, EnumView, NumberView, StringView } from '../src/PropertyViews';
import {
  coordinateSystem3DSchema,
  enumUnoDosTresSchema,
  inheritNodeProp,
  inheritsNamedNodeProp,
  point3DSchema,
  primitiveCollectionsNodeSchema,
  primitiveCollectionsSchema,
  sampleConstCollectionSchema,
  sampleConstSchema
} from './schemas';
import {
  addProperty,
  changeBoolValue,
  changeValue,
  deleteProperty,
  expandRow,
  findAndClick,
  findEditableCell,
  findRowMenuButton,
  findTableRow,
  generateRandomValidNumber,
  initializeWorkspace,
  mountInspectorTable,
  testDynamicDropdown,
  toggleEditableValueCellBoolSwitch,
  typeNewName,
  updateEditableValueCellSelectValue,
  updateEditableValueCellValue
} from './testUtils';

const changeSearchInput = (wrapper, value, clock?) => {
  wrapper.find('SearchBox').simulate('click');
  const input = wrapper.find('SearchBox').find('input');
  input.simulate('change', { target: { value } });
  if (clock) {
    clock.tick(250);
    wrapper.update();
  }
};

describe('InspectorTable', () => {

  let workspace;
  let rootProxy;
  let domNode: HTMLDivElement;
  beforeEach(async () => {
    return { workspace, rootProxy } = await initializeWorkspace(false);
  });

  beforeAll(() => {
    jest.mock('react-virtualized-auto-sizer');

    PropertyFactory.register(coordinateSystem3DSchema);
    PropertyFactory.register(enumUnoDosTresSchema);
    PropertyFactory.register(inheritsNamedNodeProp);
    PropertyFactory.register(inheritNodeProp);
    PropertyFactory.register(point3DSchema);
    PropertyFactory.register(primitiveCollectionsNodeSchema);
    PropertyFactory.register(primitiveCollectionsSchema);
    PropertyFactory.register(sampleConstCollectionSchema);
    PropertyFactory.register(sampleConstSchema);
  });

  describe('noDataPanel', () => {
    const noCreationProps = { dataCreationHandler: undefined, dataCreationOptionGenerationHandler: undefined };
    it('should show empty data panel if no data is passed',
      () => {
        // Mount table with empty data but data creation enabled
        const wrapper = mountInspectorTable(undefined);
        expect(wrapper.find(Empty).exists()).toEqual(true);
        expect(wrapper.find(Empty).props().description).toEqual(InspectorMessages.NO_DATA);
      });

    it('should show empty data panel if empty workspace is passed',
      () => {
        // Mount table with empty workspace and data creation disabled
        const wrapper = mountInspectorTable(rootProxy, noCreationProps);
        expect(wrapper.find(Empty).exists()).toEqual(true);
        expect(wrapper.find(Empty).props().description).toEqual(InspectorMessages.EMPTY_WORKSPACE);
      });

    // skipping the test since currently orphaned properties its not relevant with the new PropertyTree.
    it.skip('should show empty data panel if orphan property is passed',
      () => {
        // Mount table with empty workspace and data creation disabled
        const newProperty = PropertyFactory.create('NodeProperty') as NodeProperty;
        newProperty.insert('test', PropertyFactory.create('String')!);
        const wrapper = mountInspectorTable(PropertyProxy.proxify(newProperty), noCreationProps);
        expect(wrapper.find(Empty).exists()).toEqual(true);
        expect(wrapper.find(Empty).props().description).toEqual(InspectorMessages.NO_WORKSPACE);
      });
  });

  describe('search', () => {
    let clock;
    beforeEach(() => {
        clock = useFakeTimers();
    });

    afterEach(() => {
        clock.restore();
    });

    it('should never find an occurrence of the dummy row', () => {
     workspace.root.insert('coordinateSystem3D', PropertyFactory.create(coordinateSystem3DSchema.typeid));
      const wrapper = mountInspectorTable(rootProxy);
      changeSearchInput(wrapper, 'd', clock);
      expect(wrapper.find('InspectorTable').state().searchInProgress).toEqual(true);
      clock.runAll();
      expect(wrapper.find('InspectorTable').state().searchInProgress).toEqual(false);
      const tableRows = wrapper.find(NameCell);
      expect(tableRows.reduce((acc, curr) => {
        const rowData = curr.props().rowData;
        return acc ||
          (rowData.name === 'd' && rowData.typeid === 'd' && rowData.parentId === 'd' && rowData.context === 'd');
      }, false)).toEqual(false);
    });

    it('should recompute search when the data props changes, when there was a match already', () => {
      const testString = 'stringFilterTest';
     workspace.root.insert(testString, PropertyFactory.create('String', 'single', 'result'));
      const wrapper = mountInspectorTable(rootProxy);
      changeSearchInput(wrapper, testString, clock);
      clock.runAll();
      expect(wrapper.find('InspectorTable').state().foundMatches.length).toEqual(1);
      workspace.get(testString).value = testString;
      wrapper.setProps({ data: PropertyProxy.proxify(workspace.getRoot()) });
      clock.runAll();
      // It should still be one, since we perform search on demand
      expect(wrapper.find('InspectorTable').state().foundMatches.length).toEqual(1);
     workspace.root.insert(`${testString}2`, PropertyFactory.create('String', 'single', 'result'));
      wrapper.setProps({ data: PropertyProxy.proxify(workspace.getRoot()) });
      clock.runAll();
      expect(wrapper.find('InspectorTable').state().foundMatches.length).toEqual(1);
    });

    it('should recompute search when the data props changes, when there was no match', () => {
      const testString = 'stringFilterTest';
     workspace.root.insert(testString, PropertyFactory.create('String', 'single', 'result'));
      const wrapper = mountInspectorTable(rootProxy);
      changeSearchInput(wrapper, '2');
      clock.runAll();
      expect(wrapper.find('InspectorTable').state().foundMatches.length).toEqual(0);
     workspace.root.insert(`${testString}2`, PropertyFactory.create('String', 'single', 'result'));
      wrapper.setProps({ data: PropertyProxy.proxify(workspace.getRoot()) });
      clock.runAll();
      expect(wrapper.find('InspectorTable').state().foundMatches.length).toEqual(1);
    });

    it('should recompute search when state changes', () => {
      const testString = 'stringFilterTest';
     workspace.root.insert(testString, PropertyFactory.create('String', 'single', 'result'));
      const wrapper = mountInspectorTable(rootProxy);
      changeSearchInput(wrapper, testString);
      clock.runAll();
      expect(wrapper.find('InspectorTable').state().foundMatches.length).toEqual(1);
      workspace.get(testString).value = testString;
      wrapper.setProps({ data: PropertyProxy.proxify(workspace.getRoot()) });
      clock.runAll();
      // It is still should be one, since we perform search on demand
      expect(wrapper.find('InspectorTable').state().foundMatches.length).toEqual(1);
     workspace.root.insert(`${testString}2`, PropertyFactory.create('String', 'single', 'result'));
      wrapper.setProps({ data: PropertyProxy.proxify(workspace.getRoot()) });
      clock.runAll();
      expect(wrapper.find('InspectorTable').state().foundMatches.length).toEqual(1);
    });

    it('should search and highlight matches on demand', () => {
     workspace.root.insert('pointX', PropertyFactory.create(point3DSchema.typeid, 'single'));
     workspace.root.insert('pointY', PropertyFactory.create(point3DSchema.typeid, 'single'));
      const wrapper = mountInspectorTable(rootProxy);
      changeSearchInput(wrapper, 'point');
      clock.runAll();
      wrapper.update();
      // We found the first match and do not highlight anything else
      expect(wrapper.find('NameCell[className^="InspectorTable-match"]').length).toEqual(0);
      let firstMatch = wrapper.find('NameCell[className^="InspectorTable-currentMatch"]');
      expect(firstMatch.length).toEqual(1);

      // Initiate search of next result. The first result is now a match, but not the current one anymore.
      wrapper.find('SearchBox').find('input').simulate('focus');
      wrapper.find('SearchBox').findWhere((w) => (w.key() === 'next')).simulate('click');
      clock.runAll();
      wrapper.update();
      expect(wrapper.find('NameCell[className^="InspectorTable-match"]').length).toEqual(1);
      let secondMatch = wrapper.find('NameCell[className^="InspectorTable-currentMatch"]');
      expect(secondMatch.length).toEqual(1);
      expect(secondMatch).not.toEqual(firstMatch);
    });

    it('should search and highlight nested matches on demand', () => {
     workspace.root.insert('pointX', PropertyFactory.create(point3DSchema.typeid, 'single'));
      const wrapper = mountInspectorTable(rootProxy);
      changeSearchInput(wrapper, 'x');
      clock.runAll();
      wrapper.update();
      expect(wrapper.find('NameCell[className^="InspectorTable-match"]').length).toEqual(0);
      let currentMatch = wrapper.find('NameCell[className^="InspectorTable-currentMatch"]');
      expect(currentMatch.length).toEqual(1);
      wrapper.find('SearchBox').find('input').simulate('focus');
      wrapper.find('SearchBox').findWhere((w) => (w.key() === 'next')).simulate('click'); // search the next result
      clock.runAll();
      wrapper.update();
      expect(wrapper.find('NameCell[className^="InspectorTable-match"]').length).toEqual(1);
      currentMatch = wrapper.find('NameCell[className^="InspectorTable-currentMatch"]');
      expect(currentMatch.length).toEqual(1);
    });


    it('should not search again when navigating to already found row', () => {
     workspace.root.insert('pointX', PropertyFactory.create(point3DSchema.typeid, 'single'));
     workspace.root.insert('pointY', PropertyFactory.create(point3DSchema.typeid, 'single'));
      const wrapper = mountInspectorTable(rootProxy);
      changeSearchInput(wrapper, 'point');
      clock.runAll();
      wrapper.update();
      // We found the first match and do not highlight anything else
      expect(wrapper.find('NameCell[className^="InspectorTable-match"]').length).toEqual(0);
      expect(wrapper.find('NameCell[className^="InspectorTable-currentMatch"]').length).toEqual(1);

      // Initiate search of next result. The first result is now a match, but not the current one anymore.
      wrapper.find('SearchBox').find('input').simulate('focus');
      wrapper.find('SearchBox').findWhere((w) => (w.key() === 'next')).simulate('click');
      // First attempt to find. Search should be in progress
      expect(wrapper.find('InspectorTable').state().searchInProgress).toEqual(true);
      clock.runAll();
      wrapper.update();
      // Result found. Search should not be in progress anymore.
      expect(wrapper.find('InspectorTable').state().searchInProgress).toEqual(false);
      expect(wrapper.find('NameCell[className^="InspectorTable-match"]').length).toEqual(1);
      expect(wrapper.find('NameCell[className^="InspectorTable-currentMatch"]').length).toEqual(1);

      // Go back to the previous result, should not start search
      wrapper.find('SearchBox').find('input').simulate('focus');
      wrapper.find('SearchBox').findWhere((w) => (w.key() === 'previous')).simulate('click');
      expect(wrapper.find('InspectorTable').state().searchInProgress).toEqual(false);
      clock.runAll();
      wrapper.update();

      // Go to the last found one
      wrapper.find('SearchBox').find('input').simulate('focus');
      wrapper.find('SearchBox').findWhere((w) => (w.key() === 'next')).simulate('click');
      expect(wrapper.find('InspectorTable').state().searchInProgress).toEqual(false);
      clock.runAll();
      wrapper.update();
    });

    it('should not highlight matches when search is closed', () => {
     workspace.root.insert('pointX', PropertyFactory.create(point3DSchema.typeid, 'single'));
      const wrapper = mountInspectorTable(rootProxy);
      changeSearchInput(wrapper, 'x');
      clock.runAll();
      wrapper.update();
      wrapper.find('SearchBox').find('input').simulate('focus');
      wrapper.find('SearchBox').findWhere((w) => (w.key() === 'close')).simulate('click'); // should close the searchbox
      const currentMatch = wrapper.find('NameCell[className^="InspectorTable-currentMatch"]');
      expect(currentMatch.length).toEqual(0);
    });

    it('should work when no results are found', () => {
     workspace.root.insert('pointX', PropertyFactory.create(point3DSchema.typeid, 'single'));
      const wrapper = mountInspectorTable(rootProxy);
      changeSearchInput(wrapper, `${Math.random()}`); // unlikely string to find
      clock.runAll();
      wrapper.update();
      expect(wrapper.find('InspectorTable').state().currentResult).toEqual(-1);
      // should not do anything when clicking
      wrapper.find('SearchBox').find('input').simulate('focus');
      wrapper.find('SearchBox').findWhere((w) => (w.key() === 'next')).simulate('click');
      expect(wrapper.find('InspectorTable').state().currentResult).toEqual(-1);
      wrapper.find('SearchBox').findWhere((w) => (w.key() === 'previous')).simulate('click');
      expect(wrapper.find('InspectorTable').state().currentResult).toEqual(-1);
    });

    it('should debounce filtering 250ms after last keystroke', () => {
     workspace.root.insert('pointX', PropertyFactory.create(point3DSchema.typeid, 'single'));
      const wrapper = mountInspectorTable(rootProxy);

      // Simulate changing typing pointX in time.
      changeSearchInput(wrapper, 'p');
      clock.tick(100);
      wrapper.update();
      expect(wrapper.find('InspectorTable').state().searchInProgress).toEqual(false);
      expect(wrapper.find('InspectorTable').state().foundMatches.length).toEqual(0);

      const input = wrapper.find('SearchBox').find('input');
      input.simulate('change', { target: { value: 'poin' } });
      clock.tick(100);
      wrapper.update();
      expect(wrapper.find('InspectorTable').state().searchInProgress).toEqual(false);
      expect(wrapper.find('InspectorTable').state().foundMatches.length).toEqual(0);

      // Last stroke
      input.simulate('change', { target: { value: 'pointX' } });
      clock.tick(100);
      wrapper.update();
      expect(wrapper.find('InspectorTable').state().searchInProgress).toEqual(false);
      expect(wrapper.find('InspectorTable').state().foundMatches.length).toEqual(0);

      // debounce time total 250 after last stroke
      clock.tick(150);
      expect(wrapper.find('InspectorTable').state().searchInProgress).toEqual(true);
      // Finish search process
      clock.runAll();
      wrapper.update();
      expect(wrapper.find('InspectorTable').state().searchInProgress).toEqual(false);
      expect(wrapper.find('InspectorTable').state().foundMatches.length).toEqual(1);
    });
  });

  describe('dataGetter', () => {
    beforeEach(async () => {
     workspace.root.insert('test1', PropertyFactory.create('String', 'single', '1')!);
     workspace.root.insert('test2', PropertyFactory.create('String', 'single', '2')!);
      rootProxy = PropertyProxy.proxify(workspace.getRoot());
    });

    it('should overwrite dataGetter', () => {
      const wrapper = mountInspectorTable(
        rootProxy,
        {
          dataGetter: (parameters: IDataGetterParameter) => {
            const text = 'Row' + parameters.rowIndex + 'Col' + parameters.columnIndex;
            return <div id={text}>{text}</div>;
          },
        },
      );
      expect(wrapper.find('#Row0Col0').props().children).toEqual('Row0Col0');
      expect(wrapper.find('#Row0Col1').props().children).toEqual('Row0Col1');
      expect(wrapper.find('#Row1Col0').props().children).toEqual('Row1Col0');
      expect(wrapper.find('#Row1Col1').props().children).toEqual('Row1Col1');
      // should not overwrite the data creation UI
      expect(wrapper.find('NewDataRow').length).toEqual(1);
    });

    it('should not overwrite null dataGetter', () => {
      const wrapper = mountInspectorTable(
        rootProxy,
        {
          dataGetter: (parameters: IDataGetterParameter) => {
            const text = 'Row' + parameters.rowIndex + 'Col' + parameters.columnIndex;
            return parameters.rowIndex === 0 ? null : <div id={text}>{text}</div>;
          },
        },
      );
      expect(wrapper.find(NameCell).props().rowData.name).toEqual('test1');
      expect(wrapper.find(NameCell).length).toEqual(1);

      expect(wrapper.find('#Row1Col0').props().children).toEqual('Row1Col0');
      expect(wrapper.find('#Row1Col1').props().children).toEqual('Row1Col1');
    });
  });

  describe('PropertyCreation', () => {
    let wrapper: ReactWrapper;
    afterEach(() => {
      if (wrapper) {
        wrapper.unmount();
      }
    });

    beforeAll(() => {
      domNode = document.createElement('div');
      domNode.id = 'inspectorRoot';
      document.body.appendChild(domNode);
    });

    afterAll(() => {
      document.body.removeChild(domNode);
    });

    /**
     * This function is test the dropdown options in the inspectortable property creation.
     * @param newDataForm             React wrapper for the form.
     * @param parentTypeId            Property typeid of the parent.
     * @param expectedNumberOfTypes   Number of property types expected in dropdown.
     * @param expectedContexts        Array of strings containing context values expected in the dropdown.
     */
    const checkDropDown = (newDataForm, parentTypeId, expectedNumberOfTypes?, expectedContexts?) => {
      const decoratedSelect = newDataForm.find('DecoratedSelect');
      const propertySelection = decoratedSelect.filterWhere((node) => node.props().id === 'propertyTypeSelector');
      const contextSelection = decoratedSelect.filterWhere((node) => node.props().id === 'contextSelector');
      const allOptions = propertySelection.props().options.reduce((acc, val) => acc.concat(val.options), []);

      if (expectedNumberOfTypes) {
        // Only parent type or inherited types in dropdown for collections
        expect(allOptions.length).toEqual(expectedNumberOfTypes);
        expect(allOptions[0].value).toEqual(parentTypeId);
        expect(propertySelection.props().defaultValue.value).toEqual(parentTypeId);
      }

      if (expectedContexts) {
        // list of contexts in dropdown should be same as what is expected
        const listOfContexts = contextSelection.props().options.map((context) => context.value);
        expect(JSON.stringify(listOfContexts.sort())).toEqual(JSON.stringify(expectedContexts.sort()));
      }
    };

    describe('primitives', () => {
      const typIds = {
        array: {
          String: { initialValue: ['something'], newValue: { key: '1', value: '' } },
        },
        map: {
          String: { initialValue: { test: 'something' }, newValue: { key: 'newTest', value: '' } },
        },
      };
      const testWithContext = () => {
        Object.keys(typIds).forEach((context) => {
          it(`should work for creation under ${context}`, () => {
            const typContext = typIds[context];
            Object.keys(typContext).forEach((type) => {
             workspace.root.insert(type, PropertyFactory.create(type, context, typContext[type].initialValue));
              wrapper = mountInspectorTable(rootProxy, {}, { attachTo: domNode });
              expandRow(wrapper, type);
              findAndClick(wrapper, type);
              if (!(context === 'array')) {
                checkDropDown(wrapper.find('NewDataForm'), type, 1, ['single']);
                addProperty(wrapper, type, 'single', typContext[type].newValue.key);
              }
              expect(workspace.get(type).get(typContext[type].newValue.key)).toEqual(typContext[type].newValue.value);
            });
          });
        });
      };
      it('primitives should at least include properties from the list', () => {
        const knownProps = ['Float32', 'Float64', 'Int16', 'Int32', 'Int64', 'Int8', 'Uint16', 'Uint32',
          'Uint64', 'Uint8', 'String', 'Bool', 'Reference', 'NodeProperty'];
        const propsTemplatesObj = fetchRegisteredTemplates()[0][1] as Array<{ value: string; label: string }>;
        const propsTemplates = propsTemplatesObj.map((x) => x.value);
        expect(propsTemplates).toEqual(expect.arrayContaining(knownProps));
      });
      describe('property creation at root', () => {
        const propsTemplates = fetchRegisteredTemplates();
        (propsTemplates[0][1] as Array<{ value: string; label: string }>).forEach((prop) => {
          it(`should work for ${prop.label} creation`, () => {
            wrapper = mountInspectorTable(rootProxy, {}, { attachTo: domNode });
            findAndClick(wrapper);
            addProperty(wrapper, prop.label, 'single', 'test');
            expect(workspace.getEntriesReadOnly().test.getTypeid()).toEqual(prop.value);
          });
        });
        it(`should not allow to create property with the same name`, () => {
          const mProp = propsTemplates[0][1][0] as { value: string; label: string };
          wrapper = mountInspectorTable(rootProxy, {}, { attachTo: domNode });
          findAndClick(wrapper);
          addProperty(wrapper, mProp.label, 'single', 'test');
          findAndClick(wrapper);
          typeNewName(wrapper, 'test');
          const isCreateDisabled = wrapper.find('NewDataForm').find('button').at(1).props().disabled;
          expect(isCreateDisabled).toEqual(true);
        });
        it(`should not allow to create property with an empty name`, () => {
          wrapper = mountInspectorTable(rootProxy, {}, { attachTo: domNode });
          findAndClick(wrapper);
          typeNewName(wrapper, '');
          const isCreateDisabled1 = wrapper.find('NewDataForm').find('button').at(1).props().disabled;
          expect(isCreateDisabled1).toEqual(true);
          typeNewName(wrapper, ' ');
          const isCreateDisabled2 = wrapper.find('NewDataForm').find('button').at(1).props().disabled;
          expect(isCreateDisabled2).toEqual(true);
        });
        it('should allow set creation only under NamedNodeProperty', () => {
          wrapper = mountInspectorTable(rootProxy, {}, { attachTo: domNode });
          findAndClick(wrapper);
          const check = testDynamicDropdown(wrapper);
          expect(check);
        });
      });
      describe('property creation under collections', () => {
        testWithContext();
        it('should work for creation under set', () => {
         workspace.root.insert('namedNodeSet', PropertyFactory.create('NamedNodeProperty', 'set'));

          // Inserting dummy prop for custom type to be visible in workspace
         workspace.root.insert('dummy', PropertyFactory.create(inheritsNamedNodeProp.typeid));
          workspace.commit();
          wrapper = mountInspectorTable(rootProxy, {}, { attachTo: domNode });

          expandRow(wrapper, 'namedNodeSet');
          findAndClick(wrapper, 'namedNodeSet');
          checkDropDown(wrapper.find('NewDataForm'), 'NamedNodeProperty', 2, ['single']);

          // Also test creation of complex property
          addProperty(wrapper, 'test:inheritsNamedNodeProp-1.0.0', 'single');
          expect(workspace.get('namedNodeSet').getIds().length).toEqual(1);
        });
      });
    });
    describe('property creation for dynamic properties only', () => {
      it('should allow creation under node property', () => {
       workspace.root.insert('inheritNodeProp', PropertyFactory.create(inheritNodeProp.typeid));
        wrapper = mountInspectorTable(rootProxy, {}, { attachTo: domNode });
        expandRow(wrapper, 'inheritNodeProp');
        const dataRow = wrapper.find('NewDataRow');
        expect(dataRow.length).toEqual(2);
        findAndClick(wrapper, 'inheritNodeProp');
        const dataForm = wrapper.find('NewDataForm');
        expect(dataForm.length).toEqual(1);
      });
      it('should not allow creation under non-node property', () => {
       workspace.root.insert('inheritNonNodeProp', PropertyFactory.create(point3DSchema.typeid));
        wrapper = mountInspectorTable(rootProxy, {}, { attachTo: domNode });
        const dataRow = wrapper.find('NewDataRow');
        expect(dataRow.length).toEqual(1);
      });
    });

    describe('property deletion', () => {
      it('should provide context menu for deletion', () => {
       workspace.root.insert('testProp', PropertyFactory.create('String'));
        wrapper = mountInspectorTable(rootProxy, {}, { attachTo: domNode });

        const menuButtonWrapper = findRowMenuButton(wrapper, 'testProp');
        expect(menuButtonWrapper.length).toEqual(1);
      });

      it('should delete custom property', () => {
       workspace.root.insert('propertyToDelete', PropertyFactory.create(primitiveCollectionsSchema.typeid));
        wrapper = mountInspectorTable(rootProxy, {}, { attachTo: domNode }, true);
        // Find context menu button inside row
        const menuButtonWrapper = findRowMenuButton(wrapper, 'propertyToDelete');
        deleteProperty(wrapper, menuButtonWrapper);
        // check that item was deleted
        expect(workspace.getIds().length).toEqual(0);
      });

      it('should delete element of static array', () => {
       workspace.root.insert('propertyCollectionSchema', PropertyFactory.create(primitiveCollectionsSchema.typeid));
        wrapper = mountInspectorTable(rootProxy, {}, { attachTo: domNode }, true);

        expandRow(wrapper, 'propertyCollectionSchema');
        expandRow(wrapper, 'array');
        // Find context menu button inside row
        const menuButtonWrapper = findRowMenuButton(wrapper, 1);
        deleteProperty(wrapper, menuButtonWrapper);
        // check that item was deleted
        expect(workspace.get('propertyCollectionSchema').get('array').getIds().length).toEqual(2);
      });

      it('should delete element of static map', () => {
       workspace.root.insert('propertyCollectionSchema', PropertyFactory.create(primitiveCollectionsSchema.typeid));
        wrapper = mountInspectorTable(rootProxy, {}, { attachTo: domNode }, true);

        expandRow(wrapper, 'propertyCollectionSchema');
        expandRow(wrapper, 'map');
        // Find context menu button inside row
        const menuButtonWrapper = findRowMenuButton(wrapper, 'a');
        deleteProperty(wrapper, menuButtonWrapper);
        expect(workspace.get('propertyCollectionSchema').get('map').getIds().length).toEqual(1);
      });

      it('should delete primitive property from mix of static and dynamic', () => {
        const temp = PropertyFactory.create(primitiveCollectionsNodeSchema.typeid);
        (temp as NodeProperty).insert('Int_Value', PropertyFactory.create('Int32')!);
       workspace.root.insert('mixedProperty', temp);
        wrapper = mountInspectorTable(rootProxy, {}, { attachTo: domNode }, true);

        expandRow(wrapper, 'mixedProperty');

        const menuArrayButtonWrapper = findRowMenuButton(wrapper, 'array');
        // it should contain a copy menu item
        expect(menuArrayButtonWrapper.length).toEqual(1);
        expect(menuArrayButtonWrapper.find('.MuiPaper-root').find('SvgIcon').props().svgId).toEqual('copy-16');

        // Find context menu button inside row
        const menuButtonWrapper = findRowMenuButton(wrapper, 'Int_Value');
        deleteProperty(wrapper, menuButtonWrapper);
        expect(workspace.get('mixedProperty').getIds().length).toEqual(2);
      });

      it('should delete custom property from mix of static and dynamic', () => {
        const temp = PropertyFactory.create(primitiveCollectionsNodeSchema.typeid);
        (temp as NodeProperty).insert('NodeProperty_value', PropertyFactory.create(inheritNodeProp.typeid)!);
       workspace.root.insert('mixedProperty', temp);
        wrapper = mountInspectorTable(rootProxy, {}, { attachTo: domNode }, true);

        expandRow(wrapper, 'mixedProperty');

        // Find context menu button inside row
        const menuButtonWrapper = findRowMenuButton(wrapper, 'NodeProperty_value');
        deleteProperty(wrapper, menuButtonWrapper);
        expect(workspace.get('mixedProperty').getIds().length).toEqual(2);
      });

      it('should delete array from mix of static and dynamic', () => {
        const temp = PropertyFactory.create(primitiveCollectionsNodeSchema.typeid);
        (temp as NodeProperty).insert('Int_Array', PropertyFactory.create('Int32', 'array')!);
       workspace.root.insert('mixedProperty', temp);
        wrapper = mountInspectorTable(rootProxy, {}, { attachTo: domNode }, true);

        expandRow(wrapper, 'mixedProperty');

        // Find context menu button inside row
        const menuButtonWrapper = findRowMenuButton(wrapper, 'Int_Array');
        deleteProperty(wrapper, menuButtonWrapper);
        expect(workspace.get('mixedProperty').getIds().length).toEqual(2);
      });

      it('should delete array element from mix of static and dynamic', () => {
        const temp = PropertyFactory.create(primitiveCollectionsNodeSchema.typeid);
        const intArray = PropertyFactory.create('Int32', 'array');
        (intArray as ArrayProperty).push(2);
        (intArray as ArrayProperty).push(3);
        (temp as NodeProperty).insert('Int_Array', intArray!);
       workspace.root.insert('mixedProperty', temp);
        wrapper = mountInspectorTable(rootProxy, {}, { attachTo: domNode }, true);

        expandRow(wrapper, 'mixedProperty');
        expandRow(wrapper, 'Int_Array');

        // Find context menu button inside row
        const menuButtonWrapper = findRowMenuButton(wrapper, 1);
        deleteProperty(wrapper, menuButtonWrapper);
        expect(workspace.get('mixedProperty').get('Int_Array').getIds().length).toEqual(1);
      });

      it('should provide context menu for deletion - array element', () => {
       workspace.root.insert('collections', PropertyFactory.create(primitiveCollectionsSchema.typeid));
        wrapper = mountInspectorTable(rootProxy, {}, { attachTo: domNode });
        expandRow(wrapper, 'collections');
        expandRow(wrapper, 'array');
        const menuButtonWrapper = findRowMenuButton(wrapper, 1);
        expect(menuButtonWrapper.length).toEqual(1);
      });

      it('should provide context menu for deletion - map element', () => {
       workspace.root.insert('collections', PropertyFactory.create(primitiveCollectionsSchema.typeid));
        wrapper = mountInspectorTable(rootProxy, {}, { attachTo: domNode });
        expandRow(wrapper, 'collections');
        expandRow(wrapper, 'map');
        const menuButtonWrapper = findRowMenuButton(wrapper, 'a');
        expect(menuButtonWrapper.length).toEqual(1);
      });

      it('should not provide context menu entry for deletion of constant child', () => {
       workspace.root.insert('prop', PropertyFactory.create(sampleConstSchema.typeid));
        wrapper = mountInspectorTable(rootProxy, {}, { attachTo: domNode });
        expandRow(wrapper, 'prop');

        const menuButtonWrapper = findRowMenuButton(wrapper, 'const');
        expect(menuButtonWrapper.length).toEqual(1);
      });

      it('should not provide context menu for deletion of constant child - array', () => {
       workspace.root.insert('constCollectionProp', PropertyFactory.create(sampleConstCollectionSchema.typeid));
        wrapper = mountInspectorTable(rootProxy, {}, { attachTo: domNode });
        expandRow(wrapper, 'constCollectionProp');

        const menuButtonWrapper = findRowMenuButton(wrapper, 'numbersConst');
        expect(menuButtonWrapper.length).toEqual(1);
        expect(menuButtonWrapper.find('.MuiPaper-root').find('SvgIcon').length).toEqual(1);
        expect(menuButtonWrapper.find('.MuiPaper-root').find('SvgIcon').props().svgId).toEqual('copy-16');
      });

      it('should not provide context menu for deletion of constant child - array element', () => {
       workspace.root.insert('constCollectionProp', PropertyFactory.create(sampleConstCollectionSchema.typeid));
        wrapper = mountInspectorTable(rootProxy, {}, { attachTo: domNode });
        expandRow(wrapper, 'constCollectionProp');
        expandRow(wrapper, 'numbersConst');
        const menuButtonWrapper = findRowMenuButton(wrapper, 1);
        expect(menuButtonWrapper.length).toEqual(1);
        expect(menuButtonWrapper.find('.MuiPaper-root').find('SvgIcon').length).toEqual(1);
        expect(menuButtonWrapper.find('.MuiPaper-root').find('SvgIcon').props().svgId).toEqual('copy-16');
      });

      const getValueField = (row) => {
        const valueColumn = row.find('EditableValueCell').childAt(0);
        const field = valueColumn.find('Field');
        return field.props().rowData.value;
      };

      it('references should become invalid when referenced property is deleted', () => {
       workspace.root.insert('IntProperty', PropertyFactory.create('Int8'));
       workspace.root.insert('ReferenceProperty', PropertyFactory.create('Reference', 'single', 'IntProperty'));
        wrapper = mountInspectorTable(rootProxy, {}, { attachTo: domNode }, true);
        const intMenuButtonWrapper = findRowMenuButton(wrapper, 'IntProperty');
        deleteProperty(wrapper, intMenuButtonWrapper);
        wrapper.unmount();
        wrapper = mountInspectorTable(rootProxy, {}, { attachTo: domNode });
        const row = findTableRow(wrapper, 'ReferenceProperty');
        const text = getValueField(row);
        expect(text.includes('Invalid Reference: IntProperty')).toEqual(true);
      });

      it('references should become invalid when referenced reference is deleted', () => {
       workspace.root.insert('IntProperty', PropertyFactory.create('Int8'));
       workspace.root.insert('ReferenceProperty', PropertyFactory.create('Reference', 'single', 'IntProperty'));
       workspace.root.insert('ReferenceReferenceProperty',
          PropertyFactory.create('Reference', 'single', 'ReferenceProperty'));
        wrapper = mountInspectorTable(rootProxy, {}, { attachTo: domNode }, true);
        let row = findTableRow(wrapper, 'ReferenceProperty');
        let text = getValueField(row);
        expect(text.toString()).toEqual('0');

        const intMenuButtonWrapper = findRowMenuButton(wrapper, 'ReferenceProperty');
        deleteProperty(wrapper, intMenuButtonWrapper, true);
        wrapper.unmount();
        wrapper = mountInspectorTable(rootProxy, {}, { attachTo: domNode });
        row = findTableRow(wrapper, 'ReferenceReferenceProperty');
        text = getValueField(row);
        expect(text.includes('Invalid Reference: ReferenceProperty')).toEqual(true);
      });

      it('reference should point to the 2nd element of the array after the 1st is deleted', () => {
       workspace.root.insert('IntArray', PropertyFactory.create('Int8', 'array', [1, 2, 3]));
       workspace.root.insert('ReferenceProperty', PropertyFactory.create('Reference', 'single', 'IntArray[1]'));
        wrapper = mountInspectorTable(rootProxy, {}, { attachTo: domNode }, true);
        let row = findTableRow(wrapper, 'ReferenceProperty');
        let text = getValueField(row);
        expect(text.toString()).toEqual('2');

        expandRow(wrapper, 'IntArray');
        const menuButtonWrapper = findRowMenuButton(wrapper, 1);
        deleteProperty(wrapper, menuButtonWrapper);

        wrapper.unmount();
        wrapper = mountInspectorTable(rootProxy, {}, { attachTo: domNode });
        row = findTableRow(wrapper, 'ReferenceProperty');
        text = getValueField(row);
        expect(text.toString()).toEqual('3');
      });
    });

    describe('test callback parameters', () => {
      it('should correctly call callbacks', () => {
        const innerContent = { value: 'Int8', label: 'Int8' };
        const spyVar = jest.fn();
        wrapper = mountInspectorTable(rootProxy, {
          dataCreationHandler: spyVar,
          dataCreationOptionGenerationHandler: () => ({
            name: 'property',
            options: [['Primitives', [innerContent]]],
          }),
        }, { attachTo: domNode });
        findAndClick(wrapper);
        addProperty(wrapper, 'Int8', 'single', 'Int8');
        expect(spyVar).toHaveBeenCalledTimes(1);
        expect(spyVar).toHaveBeenCalledWith((wrapper.find('TableRow').props() as any).rowData, 'Int8', 'Int8', 'single');
      });
    });
  });

  describe('PropertyUpdate', () => {
    describe('primitives', () => {
      const numberTypeids = ['Float32', 'Float64', 'Int8', 'Uint8', 'Int16', 'Uint16', 'Int32', 'Uint32'];
      const typIds = {
        array: {
          Bool: { initialValue: [false], newValue: true, is64: false },
          Int64: { initialValue: [0], newValue: Number.MAX_SAFE_INTEGER + '0', is64: true },
          String: { initialValue: ['something'], newValue: Number.MAX_SAFE_INTEGER + '0', is64: false },
          Uint64: { initialValue: [0], newValue: Number.MAX_SAFE_INTEGER + '0', is64: true },
        },
        map: {
          Bool: { initialValue: { ['test']: false }, newValue: true, is64: false },
          Int64: { initialValue: { ['test']: 0 }, newValue: Number.MAX_SAFE_INTEGER + '0', is64: true },
          String: { initialValue: { ['test']: 'something' }, newValue: Number.MAX_SAFE_INTEGER + '0', is64: false },
          Uint64: { initialValue: { ['test']: 0 }, newValue: Number.MAX_SAFE_INTEGER + '0', is64: true },
        },
        single: {
          Bool: { newValue: true, is64: false },
          Int64: { newValue: Number.MAX_SAFE_INTEGER + '0', is64: true },
          String: { newValue: Number.MAX_SAFE_INTEGER + '0', is64: false },
          Uint64: { newValue: Number.MAX_SAFE_INTEGER + '0', is64: true },
        },
      };
      const testWithContext = (context, collectionPath?, collectionKey?) => {
        for (const typContext in typIds[context]) {
          if (!typIds[context].hasOwnProperty(typContext)) { continue; }
          it(`should work for ${context} of ${typContext}`, () => {
            if (context === 'single') {
             workspace.root.insert(typContext, PropertyFactory.create(typContext));
              const newValue = typIds[context][typContext].newValue;
              typContext === 'Bool'
                ? changeBoolValue(newValue, rootProxy)
                : changeValue(newValue, rootProxy);
              if (typIds[context][typContext].is64) {
                expect(workspace.get(typContext).toString()).toEqual(newValue);
              } else {
                expect(workspace.get(typContext).value).toEqual(newValue);
              }
            } else {
              const initialValue = typIds[context][typContext].initialValue;
             workspace.root.insert(collectionPath,
                PropertyFactory.create(typContext, context, initialValue));
              const newValue = typIds[context][typContext].newValue;
              mountExpandUpdateCollection(newValue, collectionPath, collectionKey, typContext);
              if (typIds[context][typContext].is64) {
                // workaround to get the toString method for base 64 values
                const prop64 = PropertyFactory.create(typContext, 'single', workspace.get(
                  [collectionPath, collectionKey]))!;
                expect(prop64.toString()).toEqual(newValue);
              } else {
                expect(workspace.get([collectionPath, collectionKey])).toEqual(newValue);
              }
            }
          });
        }
      };

      for (const typeid of numberTypeids) {
        const numberTests = {
          array: { args: ['array', [0]], path: ['0'], collectionKey: 0 },
          map: { args: ['map', { test: 0 }], path: ['test'], collectionKey: 'test' },
          single: { args: [], path: [] },
        };
        Object.keys(numberTests).forEach((key) => {
          it(`should work for ${key} of ${typeid}`, () => {
           workspace.root.insert('test', PropertyFactory.create(typeid, ...numberTests[key].args));
            const newValue = generateRandomValidNumber(typeid);
            mountExpandUpdateCollection(newValue, 'test', numberTests[key].collectionKey);
            const valProperty = workspace.get(['test'].concat(numberTests[key].path));
            expect(key === 'single' ? valProperty.value : valProperty).toBeCloseTo(newValue, 0.001);
          });
        });
      }
      const inlineEnumSchema = (context: string = 'single') => ({
        properties: [
          {
            context,
            id: 'inlineEnum',
            properties: [
              { id: 'uno', value: 1 },
              { id: 'dos', value: 2 },
              { id: 'tres', value: 3 },
            ],
            typeid: 'Enum',
          },
        ],
        typeid: `autodesk.enum:${context}inline-1.0.0`,
      });

      const mountExpandUpdateCollection = (newValue, collectionPath?, collectionKey?, typeContext = '') => {
        const wrapper = mountInspectorTable(rootProxy);
        if (collectionPath) { expandRow(wrapper, collectionPath); }
        typeContext === 'Bool'
          ? toggleEditableValueCellBoolSwitch(wrapper, newValue, collectionKey)
          : updateEditableValueCellValue(wrapper, newValue, collectionKey);
      };

      // TODO: skipping map test for inline enum
      const inheritingEnumTests = {
        array: { args: ['array', [1]], path: ['0'], collectionKey: 0 },
        map: { args: ['map', { test: 1 }], path: ['test'], collectionKey: 'test' },
        single: { args: [], path: [] },
      };
      Object.keys(inheritingEnumTests).forEach((key) => {
        it(`should work for ${key} of Enum inheriting`, () => {
         workspace.root.insert('test',
            PropertyFactory.create(enumUnoDosTresSchema.typeid, ...inheritingEnumTests[key].args));
          const wrapper = mountInspectorTable(rootProxy);
          expandRow(wrapper, 'test');
          updateEditableValueCellSelectValue(wrapper, 'dos');
          const enumPath = ['test'].concat(inheritingEnumTests[key].path);
          expect(key === 'array' ? workspace.get(enumPath) : workspace.get(enumPath).value).toEqual(2);
          updateEditableValueCellSelectValue(wrapper, 1);
          expect(key === 'array' ? workspace.get(enumPath) : workspace.get(enumPath).value).toEqual(1);
        });
      });

      // TODO: skipping maps since the PropertyTree doesn't support it
      const inlineEnumTests = {
        array: { args: ['array', [1]], path: ['0'], collectionKey: 0 },
        // map: {args: ['map', {test: 1}], path: ['test'], collectionKey: 'test'},
        single: { args: [], path: [] },
      };

      Object.keys(inlineEnumTests).forEach((key) => {
        it(`should work for ${key} of inline Enum`, () => {
          const schema = inlineEnumSchema(key);
          PropertyFactory.register(schema);
         workspace.root.insert('parent', PropertyFactory.create(schema.typeid));
          if (key === 'single') {
            workspace.get(['parent', 'inlineEnum']).setEnumByString('tres');
          } else if (key === 'array') {
            workspace.get(['parent', 'inlineEnum']).push('uno');
          }
          const wrapper = mountInspectorTable(rootProxy);
          expandRow(wrapper, 'parent');
          if (key !== 'single') { expandRow(wrapper, 'inlineEnum'); }
          updateEditableValueCellSelectValue(wrapper, 'dos');
          const enumPath = ['parent', 'inlineEnum'].concat(inheritingEnumTests[key].path);
          expect(key !== 'single' ? workspace.get(enumPath) : workspace.get(enumPath).value).toEqual(2);
          updateEditableValueCellSelectValue(wrapper, 1);
          expect(key !== 'single' ? workspace.get(enumPath) : workspace.get(enumPath).value).toEqual(1);
        });
      });

      testWithContext('single');

      testWithContext('map', 'collection', 'test');

      testWithContext('array', 'arrays', 0);

      const referenceTests = {
        array: { args: ['array', ['/String']], path: ['0'], collectionKey: 0 },
        map: { args: ['map', { test: '/String' }], path: ['test'], collectionKey: 'test' },
        single: { args: ['single', '/String'], path: [], collectionKey: 'ref' },
      };
      Object.keys(referenceTests).forEach((key) => {
        it(`should work for ${key} of Reference`, () => {
         workspace.root.insert('String', PropertyFactory.create('String', 'single', 'someValue'));
         workspace.root.insert('ref', PropertyFactory.create('Reference', ...referenceTests[key].args));
          const newValue = Math.random() + '';
          mountExpandUpdateCollection(newValue, 'ref', referenceTests[key].collectionKey);
          expect(workspace.get('String').value).toEqual(newValue);
        });
      });
    });
  });

  describe('EditableValueCell', () => {
    type sampleTestMapType = ({
      [key: string]: { view: React.FunctionComponent<any>, searchRef: string, typeidOverride?: string, args: any[] },
    });

    const sampleTestMap: sampleTestMapType = {
      Bool: { view: BooleanView, searchRef: 'Switch', args: ['single'] },
      Enum: { view: EnumView, searchRef: 'Select', typeidOverride: enumUnoDosTresSchema.typeid, args: [] },
      String: { view: StringView, searchRef: 'TextField', args: ['single'] },
      Uint8: { view: NumberView, searchRef: 'TextField', args: ['single'] },
    };

    Object.entries(sampleTestMap).forEach(([key, testData]) => {
      it(`should mount correct view component for ${key}`, () => {
       workspace.root.insert(
          'testRow',
          PropertyFactory.create(testData.typeidOverride || key, ...testData.args),
        );
        const wrapper = mountInspectorTable(rootProxy);
        if (key === 'Enum') {
          expandRow(wrapper, 'testRow');
        }
        expect(wrapper.find(testData.view).length).toEqual(1);
      });

      it(`should render correct MaterialUI component for ${key}`, () => {
       workspace.root.insert(
          'testRow',
          PropertyFactory.create(testData.typeidOverride || key, ...testData.args),
        );
        const wrapper = mountInspectorTable(rootProxy);
        const innerComponent = wrapper
          .find(`ForwardRef(${testData.searchRef})`)
          .filterWhere((x) => x.props().placeholder !== 'Search'); // there are 2 TextField
        expect(innerComponent.length).toEqual(1);
      });
    });
  });

  describe('Footer', () => {
    it('should be rendered', () => {
      const wrapper = mountInspectorTable(rootProxy, {});
      expect(wrapper.find('InspectorTableFooter').length).toEqual(1);
    });
    describe('ExpandAll Button', () => {
      it('should be rendered', () => {
        const wrapper = mountInspectorTable(rootProxy, {});
        expect(wrapper.find({ id: 'expandAllButton' }).length).toEqual(1);
        expect(wrapper.find({ svgId: 'expand-all' }).length).toEqual(1);
      });
      it('should populate the expanded array in InspectorTable state', () => {
        const wrapper = mountInspectorTable(rootProxy, {});
        const expandAllButton = wrapper.find('#expandAllButton');
        expandAllButton.simulate('click');
        const expanded = wrapper.find('InspectorTable').state().expanded;
        expect(Object.keys(expanded).length).toBeGreaterThan(0);
      });
    });
    describe('CollapseAll Button', () => {
      it('should be rendered', () => {
        const wrapper = mountInspectorTable(rootProxy, {});
        expect(wrapper.find({ id: 'collapseAllButton' }).length).toEqual(1);
        expect(wrapper.find({ svgId: 'collapse-all' }).length).toEqual(1);
      });
      it('should empty the expanded array in InspectorTable state', () => {
        const wrapper = mountInspectorTable(rootProxy, {});
        const collapseAllButton = wrapper.find({ id: 'collapseAllButton' });
        const expandAllButton = wrapper.find('#expandAllButton');

        // simulate expand to make sure that the InspectorTable.state.expanded is populated
        expandAllButton.simulate('click');

        // simulate collapse to empty the InspectorTable.state.expanded array
        collapseAllButton.simulate('click');
        const expanded = wrapper.find('InspectorTable').state().expanded;
        expect(Object.keys(expanded).length).toEqual(0);
      });
    });
  });

  describe('Reference editing', () => {
    let wrapper: ReactWrapper;
    afterEach(() => {
      if (wrapper) {
        wrapper.unmount();
      }
    });

    beforeAll(() => {
      domNode = document.createElement('div');
      domNode.id = 'inspectorRoot';
      document.body.appendChild(domNode);
    });

    afterAll(() => {
      document.body.removeChild(domNode);
    });

    const editReference = (referenceName, newValue) => {
      // click edit button and open edit reference path dialog
      const menuButtonWrapper = findRowMenuButton(wrapper, referenceName);
      menuButtonWrapper.find('button').simulate('click');
      const position = 1;
      menuButtonWrapper.find('.MuiPaper-root').find('.MuiButtonBase-root').at(position).simulate('click');

      // find edit reference path dialog, alter the path and simulate click
      const editRefPathWrapper = wrapper.find('EditReferencePath');
      editRefPathWrapper.find('input').simulate('change', { target: { value: newValue } });
      editRefPathWrapper.update();
      editRefPathWrapper.find('.MuiButtonBase-root').at(1).simulate('click');
      wrapper.setProps({ data: PropertyProxy.proxify(workspace.getRoot()) });
      // close the container
      wrapper.find('EditReferencePath').find('.MuiButtonBase-root').at(0).simulate('click');
      wrapper.update();
    };

    const twoReferencesCheck = (oldTypeId, oldContext, oldVal, newTypeId, newContext, newVal) => {
     workspace.root.insert('OneProperty', PropertyFactory.create(oldTypeId, oldContext, oldVal));
     workspace.root.insert('AnotherProperty', PropertyFactory.create(newTypeId, newContext, newVal));
     workspace.root.insert('ReferenceProperty', PropertyFactory.create('Reference', 'single', 'OneProperty'));
      wrapper = mountInspectorTable(rootProxy, {}, { attachTo: domNode });

      // Verify that the EditableValueCell shows the correct value
      expect(findEditableCell(wrapper, ['ForwardRef(InputBase)', 'input'], 'ReferenceProperty').instance().value)
        .toEqual(oldVal.toString());
      editReference('ReferenceProperty', 'AnotherProperty');
      // Verification
      wrapper.update();
      expect(workspace.get('ReferenceProperty').getValue()).toEqual(newVal);
      expect(findEditableCell(wrapper, ['ForwardRef(InputBase)', 'input'], 'ReferenceProperty').instance().value)
        .toEqual(newVal.toString());
    };

    it('reference modification should work: Int8 to Int8', () => {
      twoReferencesCheck('Int8', 'single', 3, 'Int8', 'single', 8);
    });

    it('reference modification should work: Float64 to Float64', () => {
      twoReferencesCheck('Float64', 'single', 3.43, 'Float64', 'single', 8.7);
    });

    it('reference modification should work: String to String', () => {
      twoReferencesCheck('String', 'single', 'abc', 'String', 'single', 'def');
    });

    it('reference modification should work: String to Int', () => {
      twoReferencesCheck('String', 'single', 'abc', 'Int8', 'single', 8);
    });

    it('reference modification should work: cyclic reference', () => {
     workspace.root.insert('ReferenceProperty', PropertyFactory.create('Reference', 'single'));
     workspace.root.insert('OneReferenceProperty', PropertyFactory.create('Reference', 'single', 'ReferenceProperty'));
      wrapper = mountInspectorTable(rootProxy, {}, { attachTo: domNode });

      // Verify that the EditableValueCell shows the correct value
      expect(findEditableCell(wrapper, ['ForwardRef(InputBase)', 'input'], 'OneReferenceProperty').instance().value)
        .toEqual('Invalid Reference: ReferenceProperty');

      editReference('ReferenceProperty', 'OneReferenceProperty');

      // Verification
      wrapper.update();
      expect(findEditableCell(wrapper, ['ForwardRef(InputBase)', 'input'], 'ReferenceProperty').instance().value)
        .toEqual('Invalid Reference: Could not resolve the reference');
    });

    it('reference modification should work: cyclic reference with multiple nodes', () => {
     workspace.root.insert('ReferenceProperty', PropertyFactory.create('Reference', 'single'));
     workspace.root.insert('SecondReferenceProperty', PropertyFactory.create('Reference', 'single', 'ReferenceProperty'));
     workspace.root.insert('ThirdReferenceProperty',
        PropertyFactory.create('Reference', 'single', 'SecondReferenceProperty'));
      wrapper = mountInspectorTable(rootProxy, {}, { attachTo: domNode });
      editReference('ReferenceProperty', 'ThirdReferenceProperty');
      // Verification
      wrapper.update();
      expect(findEditableCell(wrapper, ['ForwardRef(InputBase)', 'input'], 'ReferenceProperty').instance().value)
        .toEqual('Invalid Reference: Could not resolve the reference');
    });

    it('reference modification should work: reference -> reference from array -> int', () => {
     workspace.root.insert('IntProperty1', PropertyFactory.create('Int8', 'single', 8));
     workspace.root.insert('IntProperty2', PropertyFactory.create('Int8', 'single', 9));
     workspace.root.insert('ReferencePropertyArray', PropertyFactory.create('Reference', 'array'));
     workspace.root.insert('ReferenceProperty', PropertyFactory.create('Reference', 'single', 'ReferencePropertyArray[0]'));
      wrapper = mountInspectorTable(rootProxy, {}, { attachTo: domNode });
      expandRow(wrapper, 'ReferencePropertyArray');
      findAndClick(wrapper, 'ReferencePropertyArray');
      findAndClick(wrapper, 'ReferencePropertyArray');
      wrapper.setProps({ data: PropertyProxy.proxify(workspace.getRoot()) });
      wrapper.update();

      editReference('0', 'IntProperty1');
      editReference('1', 'IntProperty2');
      expect(findEditableCell(wrapper, ['ForwardRef(InputBase)', 'input'], 'ReferenceProperty').instance().value)
        .toEqual('8');
      // We have to unmount and mount the component again to enable the ModalManager. We cannot use it with the
      // ModalManager directly, because it doesn't allow us to update the data prop of the table then, which we need in
      // order to re-render it properly.
      wrapper.unmount();
      wrapper = mountInspectorTable(rootProxy, {}, { attachTo: domNode }, true);
      expandRow(wrapper, 'ReferencePropertyArray');
      const intMenuButtonWrapper = findRowMenuButton(wrapper, '0');
      deleteProperty(wrapper, intMenuButtonWrapper, true);
      wrapper.unmount();
      wrapper = mountInspectorTable(rootProxy, {}, { attachTo: domNode });
      expect(findEditableCell(wrapper, ['ForwardRef(InputBase)', 'input'], 'ReferenceProperty').instance().value)
        .toEqual('9');
    });
  });

  describe('overflowTooltip', () => {
    let wrapper: ReactWrapper;

    beforeAll(() => {
      domNode = document.createElement('div');
      domNode.id = 'inspectorRoot';
      document.body.appendChild(domNode);
    });

    afterAll(() => {
      document.body.removeChild(domNode);
    });

    afterEach(() => {
      if (wrapper) {
        wrapper.unmount();
      }
    });

    it('should show tooltip for very long texts in named cells', () => {
     workspace.root.insert('Repeat this string to get a long name'.repeat(10),
        PropertyFactory.create('NodeProperty', 'single'));
     workspace.root.insert('test-short-name', PropertyFactory.create('NodeProperty', 'single'));

      wrapper = mountInspectorTable(rootProxy, {}, { attachTo: domNode });
      const overflowableCells = wrapper.find('OverflowableCell');
      overflowableCells.forEach((cell) => {
        const cellDomNode = cell.find('[className^="OverflowableCell-wrappedCell"]').getDOMNode();
        const tooltip = cell.find(Tooltip);
        if (cellDomNode.scrollWidth > cellDomNode.clientWidth) {
          // tooltip should render when text is long.
          expect(tooltip.length).toEqual(1);
        } else {
          // tooltip should not render when text is short.
          expect(tooltip.length).toEqual(0);
        }
      });
    });
  });
});
