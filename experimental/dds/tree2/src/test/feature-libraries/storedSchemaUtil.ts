import { TreeStoredSchemaRepository, TreeStoredSchema } from "../../core";

export function buildTestSchemaRepository(schema?: TreeStoredSchema): TreeStoredSchemaRepository {
	const repository: TreeStoredSchemaRepository = new TreeStoredSchemaRepository(
		(_, newSchema) => repository.apply(newSchema),
		schema,
	);
	return repository;
}
