## Introduction

This page describes the general design goals of the Fluid Framework.
Its purpose is to provide some background on certain design decisions and describe the general thinking for the codebase.
It is by no means definitive or exhaustive.
Each part of the Fluid Framework, client components, distributed data structures (DDSs), hosts & loaders, back-end servers, etc. each deserve their own design-goals document.
These are, however, good general guidelines to have in mind and consider while introducing any changes.

## Goals

1. Create modular, reusable pieces of client component code that update in a synced, real-time manner
2. Be platform agnostic. Fluid Framework should work with any data storage provider, rendering framework, and platform.
3. Have an extremely lightweight, easy-to-deploy backend server to relay messages amongst clients
4. Handle all ordering logic for real-time functionality on individual clients, not the server
5. Abstract complex real-time logic from client view code using generic, multi-purpose DDSs
6. Define clean interfaces for components to interact among one another, and respect component logic abstraction. A component should not refer to another component's inner DDSs.
7. Be easy to develop on. Onboarding to Fluid should require minimal initial setup, and tooling should be available to readily create new components.
