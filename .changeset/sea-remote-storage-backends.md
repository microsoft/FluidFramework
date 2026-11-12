---
"__section": other
"__includeInReleaseNotes": false
---
Add optional PostgreSQL and Azure storage for experimental SEA hosts

Rust hosts can select separate PostgreSQL and Azure Blob Storage backend crates without adding provider clients to the core or existing file backends.
The Azure implementation also targets Azurite for local development.
Both backends support document ownership, retained event history, blob trees, snapshots, and checkpoints.
Provider guides describe deployment assumptions, local service tests, and current recovery and size limits.
