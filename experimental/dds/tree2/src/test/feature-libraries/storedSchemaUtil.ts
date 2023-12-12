import { fail } from "node:assert";
import { TreeStoredSchemaRepository, TreeStoredSchema } from "../../core";

export function buildTestSchemaRepository(schema?: TreeStoredSchema): TreeStoredSchemaRepository {
	return new TreeStoredSchemaRepository(
		() => fail("Editor-based schema changes not supported in test schema."),
		schema,
	);
}
