/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ArrayProperty, BaseProperty, MapProperty,
	NodeProperty, PropertyFactory
} from "@fluid-experimental/property-properties";
import {
	constantsCustomType,
	coordinateSystem3DSchema,
	enumCasesSchema,
	enumUnoDosTresSchema,
	nonPrimitiveCollectionsSchema,
	point3DSchema,
	primitiveCollectionsSchema,
	referenceCollectionsSchema,
	sampleComplexConstsSchema,
	sampleConstCollectionSchema,
	sampleConstSchema,
	typedReferencesSchema,
	uint64CasesSchema
} from "./schemas";

export const uniqueIdentifier = "uniqueIdentifier";

export const getPopulateFunctionWithSerializedBranchData = (serializedBranchData: any) =>
	(workspace: MockWorkspace) => {
		if (!serializedBranchData) { return; }

		const data = JSON.parse(serializedBranchData.data);
		const changeSet = data.commits[0].changeSet;

		Object.values(changeSet.insertTemplates).forEach((item: any) => {
			try {
				PropertyFactory.register(item);
			} catch (error) {
				// Often times, the error is due to a property already being registered
				console.log(error);
			}
		});

		const root = workspace.getRoot();
		root.applyChangeSet(data.commits[0].changeSet);

		workspace.commit();
	};

export const populateWorkspace = (workspace: MockWorkspace) => {
	const schemas = [
		point3DSchema,
		coordinateSystem3DSchema,
		primitiveCollectionsSchema,
		nonPrimitiveCollectionsSchema,
		referenceCollectionsSchema,
		enumUnoDosTresSchema,
		enumCasesSchema,
		uint64CasesSchema,
		sampleConstCollectionSchema,
		sampleConstSchema,
		constantsCustomType,
		sampleComplexConstsSchema,
		typedReferencesSchema,
	];

	schemas.forEach((schema) => {
		if (!PropertyFactory.getTemplate(schema.typeid)) {
			PropertyFactory.register(schema);
		}
	});
	workspace.root.insert("BooleanFalse", PropertyFactory.create("Bool", "single", false) as BaseProperty);
	workspace.root.insert("BooleanTrue", PropertyFactory.create("Bool", "single", true) as BaseProperty);
	workspace.root.insert("String",
		PropertyFactory.create("String", "single", "Hello ") as BaseProperty);
	workspace.root.insert("ValidReference",
		PropertyFactory.create("Reference", "single", "String") as BaseProperty);
	workspace.root.insert("InvalidReference",
		PropertyFactory.create("Reference", "single", "someNonExisting") as BaseProperty);
	workspace.root.insert("Point3D",
		PropertyFactory.create(point3DSchema.typeid, "single", { x: 1, y: 2, z: 3 }) as BaseProperty);
	workspace.root.insert("CoordinateSystem3D",
		PropertyFactory.create(coordinateSystem3DSchema.typeid) as BaseProperty);
	workspace.root.insert("PrimitiveCollections",
		PropertyFactory.create(primitiveCollectionsSchema.typeid) as BaseProperty);
	workspace.root.insert("NonPrimitiveCollections",
		PropertyFactory.create(nonPrimitiveCollectionsSchema.typeid) as BaseProperty);
	workspace.get<MapProperty>(["NonPrimitiveCollections", "map"])!.set(
		"outlier", PropertyFactory.create(coordinateSystem3DSchema.typeid) as BaseProperty);
	workspace.root.insert("ReferenceCollections",
		PropertyFactory.create(referenceCollectionsSchema.typeid) as BaseProperty);
	workspace.root.insert("EnumCases",
		PropertyFactory.create(enumCasesSchema.typeid) as BaseProperty);
	workspace.root.insert("Uint64Cases",
		PropertyFactory.create(uint64CasesSchema.typeid) as BaseProperty);
	workspace.root.insert("SampleConst",
		PropertyFactory.create(sampleConstSchema.typeid) as BaseProperty);
	workspace.root.insert("SampleCollectionConst",
		PropertyFactory.create(sampleConstCollectionSchema.typeid) as BaseProperty);
	workspace.root.insert("sampleComplexConst",
		PropertyFactory.create(sampleComplexConstsSchema.typeid) as BaseProperty);
	workspace.root.insert("typedReferences",
		PropertyFactory.create(typedReferencesSchema.typeid) as BaseProperty);

	const nodeProp = PropertyFactory.create<NodeProperty>("NodeProperty")!;
	nodeProp.insert("nestedStr", PropertyFactory.create("String", "single", "nested test")!);
	nodeProp.insert("int32", PropertyFactory.create("Int32", "single", 2)!);
	nodeProp.insert("cyclicReference", PropertyFactory.create("Reference", "single", "../")!);
	workspace.root.insert("nodeProp", nodeProp!);
	workspace.root.insert(uniqueIdentifier, PropertyFactory.create("String", "single", uniqueIdentifier)!);

	const primitives = ["String", "Int32", "Int64", "Float64", "Uint64", "Reference"];
	const collections = ["Array", "Map"];
	for (const type of primitives) {
		for (const context of collections) {
			workspace.root.insert(
				type.toLowerCase() + context, PropertyFactory.create(type, context.toLowerCase()) as BaseProperty);
		}
	}
	workspace.get<ArrayProperty>("stringArray")!.push([0, 1, 2]);
	workspace.get<ArrayProperty>("uint64Array")!.push([0, 1, 2]);
	workspace.root.insert("ReferenceToUint64ArrayElement",
		PropertyFactory.create("Reference", "single", "uint64Array[0]") as BaseProperty);
	workspace.root.insert("ReferenceToReference",
		PropertyFactory.create("Reference", "single", "ReferenceToArrayElement") as BaseProperty);
	workspace.root.insert("ReferenceToElementOfArrayOfReferences",
		PropertyFactory.create("Reference", "single", "/ReferenceCollections.arrayOfReferences[0]") as BaseProperty);
	workspace.root.insert("ReferenceToInvalidElementOfArrayOfReferences",
		PropertyFactory.create("Reference", "single", "/ReferenceCollections.arrayOfReferences[5]") as BaseProperty);
};


export class MockWorkspace {
	public root: NodeProperty;
	constructor() {
		this.root = PropertyFactory.create("NodeProperty");
		this.root.getWorkspace = () => this;
	}
	getRoot() { return this.root; }
	async commit() { return Promise.resolve(); }
	get<T>(...args) { return this.root.get<T>(...args); }
	getIds() { return this.root.getIds(); }
	getEntriesReadOnly() { return this.root.getEntriesReadOnly(); }
	insert(in_id, in_property) { return this.root.insert(in_id, in_property); }
}




