/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * The `deprecated-agent-scheduler-container-runtime` package is a library which contains deprecated utilities for
 * back-compat with container-runtime with built-in agent-scheduler.  These will not be supported long-term but are
 * meant to ease transitions due to breaking changes.
 *
 * @packageDocumentation
 */

export * from "./agentSchedulerBaseContainerRuntimeFactory";
export * from "./agentSchedulerContainerRuntimeFactoryWithDefaultDataStore";
export * from "./makeContainerRuntimeWithAgentScheduler";
