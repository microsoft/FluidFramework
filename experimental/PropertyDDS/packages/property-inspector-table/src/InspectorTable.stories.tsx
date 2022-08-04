/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { PropertyProxy } from '@fluid-experimental/property-proxy';
import { storiesOf } from '@storybook/react';
import * as React from 'react';
import { getPopulateFunctionWithSerializedBranchData, MockWorkspace, populateWorkspace } from '../test/common';
import { InspectorDecorator } from './InspectorDecorator';
import { InspectorTable } from './InspectorTable';
import { InspectorTableDecorator } from './InspectorTableDecorator';
import { IInspectorTableProps } from './InspectorTableTypes';
import { ModalManager } from './ModalManager';
import { ModalRoot } from './ModalRoot';
import { handlePropertyDataCreation, handlePropertyDataCreationOptionGeneration } from './PropertyDataCreationHandlers';

class Loading extends React.Component<
  Partial<IInspectorTableProps> & { empty?: boolean, populateFunction: (workspace: MockWorkspace) => void },
  { initialized: boolean, tableView: string }
> {
  public state = { initialized: false, tableView: 'table' };
  private workspace?: any;

  public componentDidMount() {
    if (this.props.empty === undefined) {
      this.workspace = new MockWorkspace();
      this.props.populateFunction(this.workspace);
      this.setState({ initialized: true });
    } else {
      this.setState({ initialized: true });
    }
  }

  public render() {
    return (!this.state.initialized ? <div>Loading</div> : (
      <ModalManager>
        <ModalRoot />
        <InspectorTable
          width={800}
          height={600}
          data={(this.props.empty !== undefined && this.props.empty) ?
            undefined : PropertyProxy.proxify(this.workspace!.getRoot()!)}
          columns={['name', 'value', 'type']}
          expandColumnKey={'name'}
          dataCreationHandler={handlePropertyDataCreation}
          dataCreationOptionGenerationHandler={handlePropertyDataCreationOptionGeneration}
          {...this.props}
        />
      </ModalManager>
    ));
  }
}

class SerializedRepoFetcher extends React.Component<{ repoUrl: string, children: (props) => React.ReactElement }> {
  public state = {
    data: null,
  };

  public async componentDidMount() {
    const branchResponse = await fetch(this.props.repoUrl);
    const serializedBranch = await branchResponse.json();

    this.setState({ data: serializedBranch });
  }

  public render() {
    return this.props.children(this.state.data);
  }
}

storiesOf('InspectorTable', module)
  .addDecorator(InspectorDecorator)
  .addDecorator(InspectorTableDecorator)
  .add('Default', () => (
    <Loading populateFunction={populateWorkspace} />
  ))
  .add('Not following references', () => (
    <Loading populateFunction={populateWorkspace} followReferences={false} />
  ))
  .add('Empty', () => (
    <Loading populateFunction={populateWorkspace} empty={true} />
  ))
  .add('Read Only', () => (
    <Loading populateFunction={populateWorkspace} readOnly={true} />
  ))
  .add('Loading', () => (
    <Loading populateFunction={populateWorkspace} checkoutInProgress={true} />
  ))
  .add('Deserialized Repo', () => {
    return (
      <SerializedRepoFetcher
        repoUrl='http://appfw-c-uw1-appfw-datainspector-testdata.s3-website-us-west-2.amazonaws.com/revit_small.json'
      // repoUrl='http://appfw-c-uw1-appfw-datainspector-testdata.s3-website-us-west-2.amazonaws.com/revit_medium.json'
      >
        {(data) => data && <Loading populateFunction={getPopulateFunctionWithSerializedBranchData(data)} />}
      </SerializedRepoFetcher>
    );
  });
