import * as fs from 'fs';
import { assert, expect } from 'chai';
import { LocalTestObjectProvider } from '@fluidframework/test-utils';
import { Change, StablePlace } from '../PersistedTypes';
import { DetachedSequenceId, EditId, NodeId } from '../Identifiers';
import { newEdit } from '../EditUtilities';
import { SharedTree, SharedTreeEvent } from '../SharedTree';
import { deserialize } from '../SummaryBackCompatibility';
import { fullHistorySummarizer, fullHistorySummarizer_0_1_0, SharedTreeSummaryBase } from '../Summary';
import {
	ITestContainerConfig,
	left,
	makeEmptyNode,
	setUpLocalServerTestSharedTree,
	setUpTestSharedTree,
	simpleTestTree,
} from './utilities/TestUtilities';

describe('Summary format', () => {
	const setupEditId = '9406d301-7449-48a5-b2ea-9be637b0c6e4' as EditId;
	// Arbitrarily large number of edits
	const numberOfEdits = 251;

	let expectedTree: SharedTree;
	let localTestObjectProvider: LocalTestObjectProvider<ITestContainerConfig>;

	beforeEach(async () => {
		const testingComponents = await setUpLocalServerTestSharedTree({
			initialTree: simpleTestTree,
			setupEditId,
		});
		expectedTree = testingComponents.tree;
		localTestObjectProvider = testingComponents.localTestObjectProvider;

		// First edit is an insert
		const nodeId = 'ae6b24eb-6fa8-42cc-abd2-48f250b7798f' as NodeId;
		const node = makeEmptyNode(nodeId);
		const firstEdit = newEdit([
			Change.build([node], 0 as DetachedSequenceId),
			Change.insert(0 as DetachedSequenceId, StablePlace.before(left)),
		]);
		expectedTree.processLocalEdit({ ...firstEdit, id: '48e38bb4-6953-4dbc-9811-9c69512f29c2' as EditId });

		// Every subsequent edit is a set payload
		for (let i = 1; i < numberOfEdits; i++) {
			const edit = newEdit([Change.setPayload(nodeId, { base64: 'test' })]);
			expectedTree.processLocalEdit({ ...edit, id: editIds[i] });
		}

		await localTestObjectProvider.opProcessingController.process();
	});

	// Completes any pending chunk uploads on expectedTree and processes the handle ops
	const catchupExpectedTree = async () => {
		expectedTree.saveSummary();
		await new Promise((resolve) => expectedTree.once(SharedTreeEvent.ChunksUploaded, resolve));
		await localTestObjectProvider.opProcessingController.process();
	};

	// Keys are the version and values are the summarizers associated with the version
	const testedVersions = {
		'0.0.2': fullHistorySummarizer,
		'0.1.0': fullHistorySummarizer_0_1_0,
	};

	for (const [version, summarizer] of Object.entries(testedVersions)) {
		it(`version ${version} can be read`, async () => {
			// This path can't be found by the mocha test explorer but is found by `npm test`
			const serializeSummary = fs.readFileSync(`src/test/summary-files/${version}.json`, 'utf8');
			await catchupExpectedTree();

			const { tree } = setUpTestSharedTree();
			const summary = deserialize(serializeSummary);
			assert.typeOf(summary, 'object');
			tree.loadSummary(summary as SharedTreeSummaryBase);

			expect(tree.equals(expectedTree)).to.be.true;
		});

		// Test writing the summary format if it is supported
		if (summarizer !== null) {
			it(`version ${version} can be written`, async () => {
				// This path can't be found by the mocha test explorer but is found by `npm test`
				const serializeSummary = fs.readFileSync(`src/test/summary-files/${version}.json`, 'utf8');
				await catchupExpectedTree();

				// Load a SharedTree using the saved, validated summary
				const { tree } = setUpTestSharedTree();
				const existingSummary = deserialize(serializeSummary);
				assert.typeOf(existingSummary, 'object');
				tree.loadSummary(existingSummary as SharedTreeSummaryBase);

				// Save a new summary with the expected tree and use it to load a new SharedTree
				expectedTree.summarizer = summarizer;
				const newSummary = expectedTree.saveSummary();
				const { tree: tree2 } = setUpTestSharedTree();
				tree2.loadSummary(newSummary);

				// The expected tree, tree loaded with the existing summary, and the tree loaded
				// with the new summary should all be equal.
				expect(tree.equals(expectedTree)).to.be.true;
				expect(tree.equals(tree2)).to.be.true;
			});
		}
	}
});

// The edit IDs used in the tree for consistency
const editIds: EditId[] = [
	'48e38bb4-6953-4dbc-9811-9c69512f29c2' as EditId,
	'f20ecdbd-fbb0-4cf3-ae02-2965f1ee2ece' as EditId,
	'058698e4-9efd-48a3-874a-a018bca15bb2' as EditId,
	'7fa34308-b5a8-4bad-a0ad-44fdd7c1b15b' as EditId,
	'2617a54e-988c-4456-95d0-057321d296b0' as EditId,
	'1cdcea49-7d87-40d1-b3fd-7201095daa3f' as EditId,
	'17a170f7-45a4-48a5-98d8-c1ec51155336' as EditId,
	'778dbc84-ea2a-4658-88dc-c8535f5139bd' as EditId,
	'fe14a4ea-9f9b-4f81-8cd4-ebf55cabf03a' as EditId,
	'342c5142-fa89-4b5a-81e0-a8690a274bf2' as EditId,
	'950a6dde-d31a-4615-8283-169312fb9efa' as EditId,
	'4a40883c-600f-42aa-b1d9-f7ae1ba3b1bf' as EditId,
	'e1dd2b1e-fc91-4f64-8dcb-845f121ab06d' as EditId,
	'33cd8639-d6ed-4932-8220-95094e6999db' as EditId,
	'8443c0a6-872f-4140-8fd1-df4f878f77c4' as EditId,
	'6eb44260-d024-405f-b0d5-134b3b7a92ff' as EditId,
	'd4f542fc-ce8f-40d0-8c99-d354f95737fa' as EditId,
	'1c396b7f-5563-4f2c-b59b-f1efff1378b5' as EditId,
	'93588d07-405d-4abe-a14b-aabc3aced752' as EditId,
	'f4991302-6fd7-4714-ba98-736f0576237a' as EditId,
	'3053ec5f-fc62-40fa-90de-ec9e619c003c' as EditId,
	'22beb49b-fa24-4e25-bafb-50c3cf53f1c2' as EditId,
	'226a4edd-965b-49bd-bd8d-ec38eebe68e6' as EditId,
	'00add42a-5382-41fb-9c17-31cc4c86864b' as EditId,
	'0bba7753-d9cb-4fa9-9c1a-c80fe9820280' as EditId,
	'8741f3c5-bdf4-4787-b21b-da75a15c2bb5' as EditId,
	'ef80bda8-1f42-4b43-ab49-eae18e8bf2ff' as EditId,
	'0a25925b-0d26-4413-b932-723e68a05436' as EditId,
	'38b9ee0d-dd82-4bb7-b8ec-8b9b12020ead' as EditId,
	'7fe6c0a8-e433-43e1-8be1-d56f41bd318b' as EditId,
	'3495b5bb-2d76-4026-aea2-e4e23c441ac8' as EditId,
	'9eedca45-b07a-4fac-b435-972618e8888c' as EditId,
	'2b2ca819-d3c7-43a6-9ca7-f7e59453379e' as EditId,
	'e2d588a4-4b37-482c-9e7b-7d9e372262b7' as EditId,
	'53adc95d-02aa-43f7-a525-914e4a9b0849' as EditId,
	'57219eb4-5324-4672-b18e-36b669563355' as EditId,
	'7a0b43b1-4006-471a-9bc6-d0a554feb2b8' as EditId,
	'26f84ae1-f5ba-4caf-99d0-fcd2fec38867' as EditId,
	'db42f3d4-b5a7-4687-9588-6734071f56d0' as EditId,
	'b95262c4-01cc-449e-be08-a8ed5f507c67' as EditId,
	'5e9457d5-bc42-439b-9f88-29852ce8c132' as EditId,
	'3f4f55fc-4f62-4628-8133-ed03593bd99f' as EditId,
	'fda75480-5ccc-4d45-9140-e52587d463c2' as EditId,
	'e00b02de-6c66-4480-b3f6-19db25812e71' as EditId,
	'14d1a86c-a867-4fda-8cc2-1806df641d46' as EditId,
	'54004e24-1a25-4f41-92d3-c095ec81efa8' as EditId,
	'c6f10d10-0aed-489b-9e70-f82593edf72c' as EditId,
	'c3c3c712-2001-4e8a-8545-4a3bec5a4d2f' as EditId,
	'02845ad9-5f65-42a9-ab72-e331a127caa4' as EditId,
	'e2c1af2b-8379-4af7-88ea-af8583ab74d5' as EditId,
	'e1af55dd-0431-4871-9ed4-d03b3de585aa' as EditId,
	'4679b2b9-73c5-4ee4-b5b4-589d8a1ee7f9' as EditId,
	'b7299f34-d783-4b82-9b51-bb084f0fa598' as EditId,
	'05af6bf4-8f71-4a9f-9d03-027ec1389f46' as EditId,
	'5966e4dc-b834-4c93-affe-d4caf31c1725' as EditId,
	'ccbaaf87-caca-4afd-9411-e1f13df7df75' as EditId,
	'd4956f44-2cf1-401e-a222-353f85a0ad2c' as EditId,
	'1d4bee62-4912-49c3-8071-931658f2319d' as EditId,
	'dfb3da51-95bf-4175-a685-1e8e4afd4846' as EditId,
	'fd3bf415-26d6-488b-a810-13bd866cd69d' as EditId,
	'8d4444d9-1115-46ff-a3ac-feed86929bfa' as EditId,
	'6d33c388-19e3-4db3-ac01-6ea657615d2a' as EditId,
	'b2a92bb9-999f-4a37-a393-aff6a8f0c4c6' as EditId,
	'a6658699-2d96-4141-bc2e-8851ca0f5a93' as EditId,
	'c4fb4b33-0fb9-4cfb-9ea3-7b7092331f26' as EditId,
	'd6c7774d-f9aa-4c88-a0ec-31c57629e3a0' as EditId,
	'356c58c3-7e02-4ef6-b008-64bf0838bce9' as EditId,
	'dfc744fb-28c4-4687-b5ee-e03d7cc80bab' as EditId,
	'b5c95707-9be7-4149-8b56-2c55f6e77a07' as EditId,
	'bb56768b-8f49-4b13-adbe-10aa0ef3857e' as EditId,
	'2613c01a-2c00-4711-aeaa-366fff665903' as EditId,
	'c1d1f821-2853-4028-be42-2ea751d3010c' as EditId,
	'fee4c6d0-5b55-4f2e-b05e-e0345235a44a' as EditId,
	'f2fabbec-c70c-4e17-be44-89ac379b6564' as EditId,
	'b33c1333-050a-46d7-a969-ec0ebb63d10f' as EditId,
	'e670ea4a-0572-4bc5-b7a2-8efe24f31a1a' as EditId,
	'885b3344-0bae-43a5-8d54-dd7d146f255b' as EditId,
	'3b9d1de6-27c1-4642-9f83-136857d7c73b' as EditId,
	'25838caa-8a8c-4bcc-a86c-56777b91ea79' as EditId,
	'2452b006-bb2f-4c86-9449-96cbecbbe4a6' as EditId,
	'78700a61-03ac-4185-9bd7-46e173f49e29' as EditId,
	'72187f26-d7e6-4516-81b4-4fd21ef706f0' as EditId,
	'1270de65-5812-4c12-a8f2-55d1000a8545' as EditId,
	'39cada1b-4bb0-421f-afa8-17327f08ae1f' as EditId,
	'fbc6b45d-e9f1-4ac3-8d85-ef648d332985' as EditId,
	'328fc94a-7c76-40ba-8ff1-adad4c8a6f0a' as EditId,
	'2eb67746-b6a3-479f-aad2-ed82f781cca7' as EditId,
	'f1cbfb48-3250-437d-a346-55e62d2783f4' as EditId,
	'52fd8b57-b1aa-4ce0-9ea3-9b3e30eb7ae7' as EditId,
	'db1079c6-ee16-4978-b46c-1a9220c769ba' as EditId,
	'df8fea62-7b3b-4b78-8510-c41412746f25' as EditId,
	'7ac7c765-e3f2-4186-92c6-b3f52b15b79d' as EditId,
	'97d93ef6-9156-47d0-a6d5-8f5956a71c05' as EditId,
	'9d23c803-da09-444c-a8ea-31f0303477b7' as EditId,
	'30be74a1-07cf-44c9-91b5-6efc21b6aa42' as EditId,
	'94a6a3e1-f309-4fbf-81a1-d22d8bd775fc' as EditId,
	'5c9df754-5a89-4898-af9a-1a498c9ce510' as EditId,
	'c8a0fcdb-05c3-44e0-ad69-7f9f67ce19bf' as EditId,
	'01b9663b-72e5-40ba-8ff0-cb1a6e8376af' as EditId,
	'eeb7bf2c-a6a9-4711-98a1-bda25fa350aa' as EditId,
	'9b9f38d5-60e7-4600-af6a-1e7d5cb05b9e' as EditId,
	'12f2e316-5ecf-44ca-979a-ac8326892706' as EditId,
	'd59788bc-23d7-4db8-9bcc-fc5e8d1c7f19' as EditId,
	'6a1d6920-fe92-44b5-925f-33c256f6503a' as EditId,
	'bd57b8e9-bb68-4021-9993-3764db6dc1e8' as EditId,
	'bf2b2b49-2dc0-4baf-b550-2c93d62f25cd' as EditId,
	'a4edac34-4775-4ad4-be53-cdde2caf3898' as EditId,
	'2fde487d-8f59-4948-b0b9-72aa7f8f27cb' as EditId,
	'035cf73f-8edd-4cb1-927f-e6e75cb33382' as EditId,
	'64c64005-56d6-4422-a666-79c28a3be072' as EditId,
	'dd61bfc2-dce5-4752-b4dd-c8467eafdc13' as EditId,
	'f02ed633-bf1f-4544-963a-e99a5c73eeab' as EditId,
	'2fabdab6-dd15-4182-bd48-7a4fad284843' as EditId,
	'27953eac-cd05-47af-b80b-40ad4d9dbc34' as EditId,
	'20282fa4-7290-4287-add0-a0ae4f660b22' as EditId,
	'a1ee0241-a380-46d9-a2d9-decc554b9c3e' as EditId,
	'32db4a66-57b8-493a-965d-ab6888671d5f' as EditId,
	'c0100734-c742-4f38-b916-283e2373ef4a' as EditId,
	'22acfbb4-6e28-4513-9ecf-3dbdcbf37f82' as EditId,
	'6f5d0976-02f1-4a82-85eb-8f3cbf8b3692' as EditId,
	'6ae73294-f024-4998-b8a5-2e6db6bfa335' as EditId,
	'4430187a-ab3a-4b98-a0a1-f834341756cc' as EditId,
	'd1480541-a444-4b75-8992-cbdc03bf2c02' as EditId,
	'a06ef8de-789e-406d-8121-fcab2d763c3c' as EditId,
	'9ffa2f29-ba8e-4e0f-b747-0b75be3f7a50' as EditId,
	'a23dcd33-5fc3-4910-8baf-b0c6c25236ff' as EditId,
	'35a77b3c-046e-4272-9d8c-fc128e979bb9' as EditId,
	'f46e027e-99c5-4098-b1d9-57021c720909' as EditId,
	'f17d81a3-483b-40e9-80ea-a62105ef671a' as EditId,
	'eda2939b-e49c-4ddc-ac54-5e592830a584' as EditId,
	'5ec36534-a54d-474f-88d7-a08eccd1dd12' as EditId,
	'bb8c3e7d-af05-48e6-8bf2-4b3131fbceb8' as EditId,
	'dabd6bd2-3491-46c6-b43f-58a499289bc8' as EditId,
	'8bc3d1cc-b267-4ea2-b052-f7d86a640ddf' as EditId,
	'7cddb659-8044-492f-9724-0512b0ecd7d5' as EditId,
	'c4b66371-4080-4372-89a8-439cd2e8a161' as EditId,
	'0d352eec-91d5-40bf-8b3f-325dbda6c8e9' as EditId,
	'8969da9d-6a70-4016-a559-11c6978d743a' as EditId,
	'141f9dd5-84dc-4272-a931-3d7170dc9828' as EditId,
	'4fc58234-0563-41e7-afd4-70fac2e28242' as EditId,
	'b001f214-694b-4b7e-9d09-a39d0613c362' as EditId,
	'616e4a0f-69cb-45d2-a563-f801627bd5b6' as EditId,
	'9d6dce9e-a89e-4af0-93cc-e737b56fb150' as EditId,
	'07b6edf8-0f68-4fde-b465-b7eb786d75c0' as EditId,
	'f503dcb2-b6ca-4b94-a413-68931128a9dc' as EditId,
	'4dae12ab-1691-46ed-8835-62de6bb31fd8' as EditId,
	'93d0fa70-9cc3-4ff9-8d50-e3dee747e5d6' as EditId,
	'04a41ae4-f946-4d1f-a3b2-eb7738126a09' as EditId,
	'7a52fb2d-9e39-4f22-84ab-5582c9467392' as EditId,
	'e05e0103-e2a5-4b9d-a516-c87759b8f4ee' as EditId,
	'f0fabcee-4e01-4c64-b767-fc121352aa44' as EditId,
	'ddaa6c51-6549-4b92-b043-fd02efd3cac5' as EditId,
	'ce568ac9-88e4-4f19-a2ce-1d86c97ca9bc' as EditId,
	'b6fcb0a4-0c43-4434-94e5-d151274d5081' as EditId,
	'1cf38891-dc5e-4502-84af-396f6f61edbe' as EditId,
	'271f80f8-424d-4494-8c9f-e1bc73761721' as EditId,
	'bd71de22-2119-4011-babb-741a2829ac94' as EditId,
	'1904ac74-758d-4de8-ba6b-37245798abae' as EditId,
	'75ef70a0-1985-425e-8e40-e84a757fc958' as EditId,
	'c373431c-4d9b-455c-9355-8e9273d4611d' as EditId,
	'70690440-0ae6-4a2a-894e-ef8cb6a438cc' as EditId,
	'1e776a9e-a657-4e78-bcc9-4b3a92a50edd' as EditId,
	'1f739a21-5933-478f-a4dd-bacbf2f7247a' as EditId,
	'ecc4c1fa-0d7a-406f-9df0-da2806444b7e' as EditId,
	'c6399005-49dc-4489-b8b6-92c87919ca6a' as EditId,
	'922fb108-af12-4ae2-81df-0072445437e6' as EditId,
	'e3539da2-c19c-47d2-9583-8b5887048c98' as EditId,
	'd5bb16a3-846b-46cb-8a41-71f562403dd9' as EditId,
	'183b47b8-05af-4c06-9636-2ce279b4bf88' as EditId,
	'20fd2ac1-c8d6-47f6-865f-4f01cbdbbdde' as EditId,
	'1fcbcf11-4603-4fbc-a5ff-7ed5bb9a5d21' as EditId,
	'3abdbc73-8fb2-430a-ba65-299ca085be23' as EditId,
	'0146e24a-0eb2-413d-8788-7305d3d3e92e' as EditId,
	'c76c9b4e-e1d0-428d-83d0-c7e4e223f5fe' as EditId,
	'ce38d918-ba99-4314-b996-071514e60e59' as EditId,
	'31ad559f-bc1a-4c3c-941b-f3319d0d7b29' as EditId,
	'8243b75b-c5f1-4e1c-98d4-0401eeb65119' as EditId,
	'59f82feb-e628-491e-a5b7-1ad953a406bc' as EditId,
	'29c0f412-c8fd-40ca-9564-19ba3f962cc0' as EditId,
	'63203ff9-69c4-4fc0-a0a6-f04575c16b47' as EditId,
	'368cd6fe-2836-47da-bda6-17f690dd8353' as EditId,
	'2f6da4b2-b25d-4095-ac1f-d96690a01121' as EditId,
	'65b18b4e-ca91-4eb8-8a0e-11dd8d905ad0' as EditId,
	'950ce2bf-763d-4b87-ab12-8b8d15ab6cf2' as EditId,
	'1a9b3588-fb99-4337-a042-d83468c52175' as EditId,
	'98f46aa4-e0fd-4395-a2e5-26774b5d4e7d' as EditId,
	'f5bdeb6d-e0db-4842-a691-d2ea367f5c28' as EditId,
	'3da09f1f-2fcb-4512-9d81-f64eea867fac' as EditId,
	'cd1da10f-2d48-4749-ad7a-a9ff7eb7b523' as EditId,
	'e5fd27f1-9201-4b6c-b2e2-9b8543bcd65a' as EditId,
	'd19b49af-4930-400e-ada1-36c70e33cbdf' as EditId,
	'c32a7544-b4ac-4371-a5e5-31b54ba92b88' as EditId,
	'c693b8c0-6a38-4588-b443-64b557cf3d4f' as EditId,
	'8b27ec68-4151-4293-9a31-fbf97576b32c' as EditId,
	'50d9548e-a58e-4a07-a830-7660891c8674' as EditId,
	'b7739ca4-1458-45c5-bba7-c1e2e8f867c7' as EditId,
	'60458d89-a627-4d4c-bbfc-e1be32dca5c1' as EditId,
	'5493b8c3-d99c-498b-ab49-28adf8bb60ee' as EditId,
	'c2c96367-d8d4-47ef-bacf-530bdd24ba2a' as EditId,
	'be3d63a2-2632-424c-bd29-ceff3ab28883' as EditId,
	'8dbbfe8c-3adf-43de-8d29-c70974ab3cf0' as EditId,
	'dcab08e9-65c8-49e6-b547-9ff7be5369c8' as EditId,
	'741831f3-3644-4371-aece-bec0c0f504ac' as EditId,
	'f441dbdc-0989-4865-ac37-2c52006724ad' as EditId,
	'5c9a96fb-715b-4057-a2f8-599eab28255b' as EditId,
	'db0edb9b-0c69-45d4-97c1-11773343533c' as EditId,
	'1bb676e0-6e67-4e98-9ca4-7cde5ab9a519' as EditId,
	'178fcbf4-2d62-48cd-a03a-9d21dcd844f1' as EditId,
	'e2d64b87-6511-47ad-8715-1ea5b014c63a' as EditId,
	'67ef5c01-2a27-4fb9-b0b2-2f7ff941161b' as EditId,
	'03351767-86aa-47b9-be04-449b6cba8bb2' as EditId,
	'c7b38c17-4a4a-455c-a86c-f3a26b1ff82c' as EditId,
	'cc27924c-2c42-457e-b795-69ef3eb3caa0' as EditId,
	'902e5efe-8f89-4132-9adb-fcef26d098b7' as EditId,
	'ff9efd15-81e6-49fb-99d2-b33f94aac1c6' as EditId,
	'd4d06f53-bac4-46df-b800-5ffb3794f147' as EditId,
	'1db080ff-325a-4800-ac7c-094ddf0fed95' as EditId,
	'0084f618-6011-4ccd-b2e6-28dd3cfa0c4a' as EditId,
	'23d96c83-a8b6-4479-8a19-be8f3fcc2b2b' as EditId,
	'08380dbd-1d6b-427d-865f-22ce85de1ac0' as EditId,
	'7cc93be6-1ccc-4693-894d-feed2b3f7098' as EditId,
	'1baa98c3-f320-4df3-a944-6987dc2eea80' as EditId,
	'fa008030-4575-47be-8c7e-cf5c198e952d' as EditId,
	'44354220-b6b6-470c-b3ba-1465549a596f' as EditId,
	'a649cc56-7973-4c47-81cf-7ce346e14813' as EditId,
	'84a8854f-3c3f-4563-9f4a-fa5df08b17c1' as EditId,
	'ff35a601-23cb-4569-b98d-f7aae39b93da' as EditId,
	'67078480-9ee2-46bd-9a46-e736a295516d' as EditId,
	'02882e1e-bc62-4150-a4df-76616031e335' as EditId,
	'f2b63efc-d96e-4ad4-920c-cfc9640fdc13' as EditId,
	'1cd2ebf4-356e-47ae-9ffd-652f2af2c5e8' as EditId,
	'd9168116-a545-4da9-985e-f6eccbc0049e' as EditId,
	'1453e083-7221-4e6d-8078-99d611dd54e6' as EditId,
	'57ac5530-6c62-48b8-bccc-d27172689165' as EditId,
	'b023e85b-fe4f-4ab3-a651-0344f33f5d14' as EditId,
	'dfe20c0c-2f3e-40a1-a8e5-ff94727f785c' as EditId,
	'8017fd4d-0e17-4af5-bd35-2f3779e1b8b3' as EditId,
	'391eaa8c-ce77-42bb-b780-7de596a1d719' as EditId,
	'd7e15575-f9a2-4f35-b6ad-c4caeb0cb091' as EditId,
	'1145ba07-299d-4a2d-83ed-28cc027b1482' as EditId,
	'd7ec764a-fbcc-4661-a5ff-e1fbdf1c4c77' as EditId,
	'28925708-82cd-4425-a8f2-a82703671551' as EditId,
	'b8528fe2-07cb-46a7-934d-1dec74c2170d' as EditId,
	'd923a23c-5c2e-4f7f-a5f6-9fbcf6f023af' as EditId,
	'b6dea4f7-c311-406c-88fa-64d4ffed2010' as EditId,
	'26fba5ba-ef45-4f16-9965-1c1b185c6cfd' as EditId,
	'5c79b219-9a2e-49e2-a5da-4a591404091b' as EditId,
	'2fc4258e-4051-4d18-8cfe-ce6a29512946' as EditId,
	'0175e180-a8e4-4ba7-b85b-449110bd4348' as EditId,
	'cacc7a30-3cbf-4355-b98e-d4baffafa4e7' as EditId,
	'772b8bf3-8985-4b91-9b25-bf4683f8f0c7' as EditId,
];
