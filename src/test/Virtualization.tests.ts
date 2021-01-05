// Copyright (C) Microsoft Corporation. All rights reserved.

import { IsoBuffer } from '@fluidframework/common-utils';
import { Loader } from '@fluidframework/container-loader';
import { IFluidHandle } from '@fluidframework/core-interfaces';
import { LocalDocumentServiceFactory, LocalResolver } from '@fluidframework/local-driver';
import { requestFluidObject } from '@fluidframework/runtime-utils';
import { LocalDeltaConnectionServer } from '@fluidframework/server-local-server';
import {
	ChannelFactoryRegistry,
	ITestFluidObject,
	LocalCodeLoader,
	SupportedExportInterfaces,
	TestFluidObjectFactory,
} from '@fluidframework/test-utils';
import { expect } from 'chai';
import { compareEdits } from '../EditUtilities';
import { EditId } from '../Identifiers';
import { Delete, Edit, StableRange } from '../PersistedTypes';
import { SharedTree } from '../SharedTree';
import { makeTestNode } from './utilities/TestUtilities';

describe.only('SharedTree virtualization', () => {
	it('can serialize and deserialize an IFluidHandle', async () => {
		const deltaConnectionServer = LocalDeltaConnectionServer.create();
		const stringId = 'tree';
		const registry: ChannelFactoryRegistry = [[stringId, SharedTree.getFactory()]];
		const fluidExport: SupportedExportInterfaces = {
			IFluidDataStoreFactory: new TestFluidObjectFactory(registry),
		};
		const documentId = 'test';

		// Create the client
		const urlResolver = new LocalResolver();
		const documentServiceFactory = new LocalDocumentServiceFactory(deltaConnectionServer);
		const codeDetails = { package: 'no-dynamic-pkg' };
		const codeLoader = new LocalCodeLoader([[codeDetails, fluidExport]]);

		const loader = new Loader({
			urlResolver,
			documentServiceFactory,
			codeLoader,
		});

		const container = await loader.createDetachedContainer(codeDetails);
		const dataObject = await requestFluidObject<ITestFluidObject>(container, 'default');
		const sharedTree = await dataObject.root.get<IFluidHandle<SharedTree>>(stringId).get();

		await container.attach(urlResolver.createCreateNewRequest(documentId));

		const node = makeTestNode();
		const editId = '75dd0d7d-ea87-40cf-8860-dc2b9d827597' as EditId;
		const expectedEdit: Edit = {
			changes: [Delete.create(StableRange.only(node))],
			id: editId,
		};

		const serializedHandle = await sharedTree.serializeHandleWithEdit([expectedEdit]);
		const deserializedHandle = sharedTree.deserializeHandle(serializedHandle);

		const editsReceived = JSON.parse(IsoBuffer.from(await deserializedHandle.get()).toString()).edits[0];
		expect(compareEdits(editsReceived, expectedEdit)).to.be.true;
	});

	it('can blob most recent sequenced edits and save the blob handle to the summary', () => {});

	it('can load an edit from a blob', () => {});
});
