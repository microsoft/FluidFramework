---
title: Architecture
menuPosition: 3
aliases:
  - "/docs/deep/architecture"
---

This document describes Fluid service architecture and ops lifetime.
- [Service](#Service)
   - [Storage service](#Storage-service)
   - [Ordering service](#Ordering-service)
- [Total order broadcast](#Total-order-broadcast)
- [Ops lifetime](#Ops-lifetime)

# Service
Service consists of two parts - storage service & ordering service.

## Storage service

Storage is responsible for long-term storage of container content. Here are key pieces of data storage stores:
- **Snapshots**. As summaries are posted by clients, storage is responsible for converting them to snapshots (or preserving enough information to generatate snapshots on demand at a later time). Storage is required only to keep latest snapshot around, but may chose to keep a number of snapshots. For more information about summaries, snapshots and related topics please see [Summaries, Summarizer & Snapshots](../../docs/content/docs/concepts/summarizer.md).
- **Ops**. Storage is required to keep the following ops:
   - Trailing ops - any ops after latest snapshots - ops that were sequences by ordering service and flushed to storage layer. Such ops are kept forever (or rather - until they are no longer considered trailing ops due to new snapshots coming in, and further rules govern their lifetime).
   - 30 days of ops prior to latest snapshot. This is required to support offline clients, who use ops to catch up to current state. We do support up to 30 days of offline only. This requirement might change in the future.
- **Blobs**. While technically blobs are part of snapshots, there are certain exclusions to this rule that require special handling. As new attachment blobs are uploaded to storage, there might have been no chance for client to produce new summary that would reference such blob. And as such, storage is required to keep such blobs alive for a while (blobs that would not get a reference from an op or summary until deadline could be collected by storage).
It's also worth pointing out that not all blobs are included in snapshhot payload. Attachment blobs are not, and are downloaded one by one via dedicates http requests. It's upt to storage to define relationship between blobs and snapshots and how to store them.

## Ordering service

Ordering service is responsible for the following:
- Maintaining some kind of "connection" between client and service, usually leveraging webSocket connection. It does not have to be webSocket (that's defined by a driver / protocol for a particular service), however Fluid heavily relies on notions of "connected" clients, and maintains a list of such clients.
- Maintain an Audience of clients connected to service for a given container, and notifying of Audience changes to all connected clients.
- Accpeting new ops from connecting clients (only clients who have permissions to change container), stamping ops (assigning sequence number) and broadcasting sequenced ops to all connected clients.
- Periodically flushing accumulated sequenced ops to storage.
- Maintatining healthy service, including throttling and naching / disconecting misbehaving clients (or clients who send too many ops / signals).
- Accepting and broadcasting signals.

# Total order broadcast
[Total order broadcast & eventual consistency](../../docs/content/docs/concepts/tob.md) document discusses topics like
- What are ops
- Total order braodcast & eventual consistency
- Data persistence
- Intro into summaries

# Ops lifetime
**Ops sequencing**: When ops are sent by client to ordering service (usually as result of user making some changes in Container), ops gets sequenced by ordering service and are broadcast to all connected clients. Clients who join later will miss such broadcast, and will need to fetch such ops either from storage layer, or some service might provide a capability to fetch them from ordering service directly (if ordering service still has such ops). While ordering service makes a strong effort not to lose sequenced ops, in result of some catastropic event it might crash / reboot and lose such ops. As result, ordering service attempts to flush ops with some frequency to storage layer.

Once ops are flushed to storage, storage keeps them around according to describe above policies (trailing ops & 30 days of old ops). when container is being modified and contains ops that are outside of these policies, storage could delete such ops.

Please note that various external conditions could result in storage rolling back file (and thus losing some number of ops). This could be as result of whole datacenter recovery processes (some catastropic event), or it could be as result of user actions (in ODSP user could restore file to prior state, i.e. many days back).

