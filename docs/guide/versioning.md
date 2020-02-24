# Versioning with Fluid
Container-level versioning with Fluid Framework.

- Patch: the code should be both backwards and forwards compatible
- Minor: the code should be only backwards compatible (new code works with old data)
- Major: the code is neither backwards nor forwards compatible (requires data migration)

## Patch Upgrades
With patch upgrades, old clients and new clients can collaborate on the same document simultaneously, so there is no need for consensus for code upgrades.  It is okay to always load the latest code in this case, perhaps using semantic versioning to specify which code to load.

In some cases, there may be important security patches which require a code proposal anyway.  So the initial proposal might be something like "~1.2.0" but then if a desirable patch is released, it could propose "~1.2.3".  If the code loader understands semantic versioning, there may be two clients initially connected on 1.2.1 and 1.2.2, but then after the proposal, there may be clients on 1.2.3 and 1.2.4.

## Minor Upgrades
With minor upgrades, old clients and new clients cannot collaborate on the same document at the same time, because old clients may not be able to understand ops from the new client.  It is important for one of the clients to propose the new code to the quorum so that all clients can upgrade together.

1. One client will propose new code to the quorum
1. All active clients on the document will have an opportunity to reject the code proposal
1. If the code proposal is accepted, every container will reload their runtime

### Code Proposal
Deciding when and how to propose new code will be up to the host and runtime code.  There are some guidelines and utilities the Fluid Framework will provide to help make this process easier.

#### When to Propose
The active users will effectively experience a refresh, but not necessarily an actual page refresh.  For this reason, it may be desirable to prefer this operation occur when there is only one active client on the document.  It may be common for the loaded code or host to check for available updates on initial code load, and then propose first.

#### How to Propose
Proposing code for upgrade is as simple as calling `quorum.propose("code", ...)`.  It is then the responsibility of the other clients to be listening for the quorum's "addProposal" event if they want a chance to reject it.  Accepting quorum code proposals is implicit.

#### Proposing Exactly Once
One thing to consider when attempting to upgrade, is that for _every accepted_ code proposal, all clients will go through a refresh.  For this reason, it is preferred to ensure that only one code proposal is accepted per upgrade.  The cleanest way to accomplish this is by ensuring only one client actually proposes the new code, which the Fluid Framework will offer helper functionality to achieve this.  The fallback logic is to have all clients reject subsequent or simultaneous code proposals, but those decisions may be a little more situational; i.e. what to do when two different code proposals come at the same time, etc.

### Rejecting Code Upgrades
Aside from rejecting to prevent multiple proposals of the same code, there may be other reasons for a client to reject a code proposal depending on the scenario.  Since an accepted proposal will require a runtime refresh, if critical work is happening, or it is a time when user experience should not be interrupted, etc., the clients have a chance to reject during the "addProposal" event handler.  This may look something like:
```typescript
quorum.on("addProposal", (pendingProposal) => {
  if (pendingProposal.key === "code") {
    if (shouldRejectCode(pendingProposal.sequenceNumber, pendingProposal.value)) {
      pendingProposal.reject();
    }
    // Quorum accept is implicit
  }
});
```
It may also be desirable in some cases to have user interaction, giving them a chance to reject, but this must be blocking as quorum proposals are accepted automatically as clients acknowledge they have seen them; when the minimum sequence number reaches the proposal sequence number.

### Reload Flow
Accepted code proposals in the quorum are handled by the container.  The container will stop and dispose all top-level runtime objects and proxy objects which will largely disconnect most of the old code, allowing it to be garbage collected.  It is up to the loaded code to clean itself up if it has any timers or global event handlers, etc.

The summarizer will aggressively try to summarizer after a reload, to reduce new clients going through a reload.

In order to support hosts that want to do a full page refresh, it is up to the loaded code to block until a summary ack is seen after the code proposal is accepted.

The framework may also support a streamlined "fast" summarize which all clients attempt on reload, to reduce blocking during a full page refresh.

#### Full Page Refresh
If a full page refresh is required for interactive clients, then all clients must be blocked until the summarizer client has a chance to reload and summarize.  Upon receiving the new summary op, the clients are then safe to refresh the page as they will load from the latest summary.  The sequence of events may look something like this:

Event|Interactive Clients|Summarizer Client
-|-|-
Code Proposal||
Code Accepted|Start Blocking|Reload, then Summarize immediately
Summary Op||
Summary Ack|Refresh Page|
