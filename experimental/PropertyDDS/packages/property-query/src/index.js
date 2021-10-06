/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const MaterializedHistoryService = require('./materialized_history_service/materialized_history_service');
const InMemoryBackend = require('./materialized_history_service/storage_backends/in_memory');
const BranchWriteQueue = require('./materialized_history_service/branch_write_queue');
const StorageManager = require('./materialized_history_service/storage_backends/storage_manager');
const SerializerFactory = require('./materialized_history_service/serialization/factory');
const ModuleLogger = require('./utils/module_logger');
const SerializationFactory = require('./materialized_history_service/serialization/factory');
const BackendFactory = require('./materialized_history_service/storage_backends/backend_factory');
const NodeDependencyManager = require('./materialized_history_service/node_dependency_manager');
const BranchManager = require('./materialized_history_service/branch_manager');
const MultipleQueriesExecution = require('./materialized_history_service/query_pipeline/multiple_queries_execution');
const ComparatorFactory = require('./materialized_history_service/query_pipeline/comparator');
const SimpleQueryExecution = require('./materialized_history_service/query_pipeline/simple_query_execution');
const ScanTraversalUtils = require('./materialized_history_service/query_pipeline/scan_traversal_utils');

module.exports = {
    MaterializedHistoryService,
    ScanTraversalUtils,
    ComparatorFactory,
    MultipleQueriesExecution,
    SimpleQueryExecution,
    BranchWriteQueue,
    StorageManager,
    SerializerFactory,
    ModuleLogger,
    BackendFactory,
    SerializationFactory,
    NodeDependencyManager,
    BranchManager,
    StorageBackends: {
        InMemoryBackend
    }
}
