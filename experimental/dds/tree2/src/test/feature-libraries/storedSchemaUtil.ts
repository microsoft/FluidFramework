import { InMemoryStoredSchemaRepository, TreeStoredSchema } from "../../core";

export function buildTestSchemaRepository(
	schema?: TreeStoredSchema,
): InMemoryStoredSchemaRepository {
	return new InMemoryStoredSchemaRepository(() => {}, schema);
}
