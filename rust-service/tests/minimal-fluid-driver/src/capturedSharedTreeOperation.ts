export interface CapturedSharedTreeOperation {
	revision: number;
	originatorId: string;
	changeset: Array<{
		data: {
			maxId: number;
			changes: Array<{
				change: Array<
					[
						number,
						{ fieldChanges: Array<{ change: { r: { e: boolean; d: number; s: number } } }> },
					]
				>;
			}>;
			builds: {
				builds: number[][][][];
				trees: { data: number[][] };
			};
		};
	}>;
	version: number;
}

/**
 * The DDS contents from a captured optimized-forest SharedTree scalar replacement.
 * ContainerRuntime adds the component wrappers, ID allocation, and grouped-batch envelope.
 */
export const capturedSharedTreeOperation = JSON.parse(
	'{"revision":0,"originatorId":"00000000-0000-0000-0000-000000000000","changeset":[{"data":{"maxId":0,"changes":[{"fieldKey":"rootFieldKey","fieldKind":"ModularEditBuilder.Generic","change":[[0,{"fieldChanges":[{"fieldKey":"value","fieldKind":"Value","change":{"r":{"e":false,"d":0,"s":0}}}]}]]}],"builds":{"builds":[[[[0,0]]]],"trees":{"version":1,"identifiers":[],"shapes":[{"c":{"type":"com.fluidframework.leaf.number","value":true}}],"data":[[0,0]]}}}}],"version":3}',
) as CapturedSharedTreeOperation;

export function sharedTreeOperationForValue(value: number): CapturedSharedTreeOperation {
	const operation = structuredClone(capturedSharedTreeOperation);
	operation.revision = value;
	const data = operation.changeset[0]?.data;
	if (data === undefined) {
		throw new Error("captured SharedTree operation is missing change data");
	}
	data.maxId = value * 3 - 1;
	const replacement = data.changes[0]?.change[0]?.[1].fieldChanges[0];
	if (replacement === undefined) {
		throw new Error("captured SharedTree operation is missing its value replacement");
	}
	replacement.change.r = {
		e: false,
		d: value * 3 - 2,
		s: Math.max(0, value * 3 - 3),
	};
	const buildId = data.builds.builds[0]?.[0]?.[0];
	const encodedValue = data.builds.trees.data[0];
	if (buildId === undefined || encodedValue === undefined) {
		throw new Error("captured SharedTree operation is missing encoded build data");
	}
	buildId[0] = Math.max(0, value * 3 - 3);
	encodedValue[1] = value;
	return operation;
}
