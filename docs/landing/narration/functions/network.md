# Network Intelligence

> Narration for the "Find out more" deep-dive on ARIA's Network Intelligence capability:
> live socket visibility, external remotes, listening services, blocklist,
> passive-safe observability, and authorization-gated active discovery.

---

## Teaser

I see every active socket, every external remote, every listening service in your environment — right now, without touching a thing. When you want to go deeper, I can. But I ask first.

*(~30 words / ~10 seconds)*

---

## Full narrative

**Beat 1 — What I see passively**
The network panel shows you the live state of your environment's connections: every active socket, every external remote address your systems are talking to, every private internal connection, and every service listening for inbound traffic. This visibility is always on and always safe — I read it from the operating environment without generating any network traffic of my own.

**Beat 2 — The blocklist**
Running alongside the live connection view is your blocklist state. Any IP or address range that has been blocked — whether by my autonomous response engine acting on a threshold event, or by a manual operator decision — is visible here. You can manage those rules directly: add, remove, review the reason each block was created, and see when it was applied. The history is audited and attributable.

**Beat 3 — Active discovery is authorization-gated**
When passive visibility is not enough, I can go further. Network discovery maps your subnet — identifying devices, inferring their roles, and classifying their exposure. But I do not initiate active discovery without authorization. This is a deliberate design principle: observability must never become uncontrolled scanning. You grant the action explicitly, and I execute it within the scope you define.

**Beat 4 — Device role inference**
When discovery runs, I infer the function of each device from the signals available: hostname patterns, open port signatures, vendor fingerprints, and behavioral context. A device resolves to a role — server, workstation, printer, network appliance, or mobile endpoint — along with a department assignment where the naming conventions allow it, and a risk classification based on what I observe about its exposure.

**Beat 5 — Exposure observation**
For devices that warrant closer attention, I run a light port observation — checking which services are reachable and what their risk weight is. This covers common exposure surfaces: remote access protocols, administrative interfaces, database ports, file-sharing services. I record what is observable and weight it by risk. What I do not do is probe, exploit, or send any payload. This is read-only reconnaissance in the strictest sense.

**Beat 6 — The live galaxy**
Everything I discover feeds directly into the galaxy visualization. New topology becomes a new node. A device that registers high exposure shifts to amber or red in the galaxy map. The network picture you see is not a snapshot from last Tuesday's scan — it is the current state of your environment, rendered as a living map.

*(~180 words / ~60 seconds)*

---

## Production notes

**Voice guidance:**
- Beat 1: calm and factual. "Without touching a thing" — slight emphasis on "without."
- Beat 3: "You grant the action explicitly, and I execute it within the scope you define." — this sentence is a trust statement. Read it slowly and clearly.
- Beat 5: the list of exposure surfaces (remote access protocols, administrative interfaces…) should be read evenly and with the same weight as the connector list in AI-SPM — each item is real and specific.
- Beat 5: "What I do not do is probe, exploit, or send any payload." — deliberate, unhurried. This is a safety assurance. Pause slightly before it.
- Beat 6: the closing sentences should feel confident and grounding — this is the payoff image of the whole capability.
- Overall: this narration is more technical than the others. Keep the pace slightly measured throughout so the specifics land.

**Target duration:** 55–65 seconds for the full narrative.

**Caption sync points:** socket table populating live (beat 1), blocklist entries highlighting (beat 2), subnet map drawing outward (beat 3), device role labels appearing (beat 4), port exposure radar filling (beat 5), galaxy nodes lighting up with discovered topology (beat 6).
