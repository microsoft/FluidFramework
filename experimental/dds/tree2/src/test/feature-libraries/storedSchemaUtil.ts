import { TreeStoredSchemaRepository, TreeStoredSchema } from "../../core";

export function buildTestSchemaRepository(schema?: TreeStoredSchema): TreeStoredSchemaRepository {
	return new TreeStoredSchemaRepository(() => {}, schema);
}
