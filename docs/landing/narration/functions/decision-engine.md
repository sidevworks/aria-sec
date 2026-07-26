# Decision Engine / Autonomous Response — Narration Script

---

## Teaser

A scanner shows you signals. I correlate them into an attack path, estimate the blast radius, and tell you exactly what should happen next — and whether I need your approval to do it.

---

## Full narrative

1. Security environments produce a constant stream of signals. The challenge has never been collecting them — it has been knowing what they mean together. That is what the decision engine exists to do.

2. Every thirty seconds, I sample the state of your world: telemetry, active sockets, audit events, open incidents, posture findings. I maintain a rolling fifteen-minute signal buffer, checkpointed to disk, so no context is lost even if the environment shifts between cycles.

3. I apply a structured set of correlation rules against that buffer. Resource exhaustion paired with new outbound connections. An authentication-failure flood coinciding with a new high-CPU process. A memory-pressure spike alongside a fresh scan finding. Patterns that, individually, look like noise — and together, look like an intrusion.

4. When a pattern fires, I build a hypothesis: the likely attack path, a confidence score, an estimated blast radius — how far this could spread if left unaddressed. I surface that reasoning in plain language, not just a severity number.

5. Then comes the decision: does this require your approval, or can I act on it autonomously under the trust level you have set? If the action is within my current autonomy, I execute. If it is not, I queue it for your review with a clear recommendation already formed.

6. At the fast end of the threat spectrum, the autonomous response pipeline operates at sub-millisecond latency. A velocity detector tracks per-source signal rates in a sliding window. More than ten signals per second sustained for three seconds — I classify it as a swarm event. More than five authentication failures in ten seconds — I auto-block the source. A cross-signal correlator handles coordinated attacks: three or more distinct addresses hitting restricted endpoints within five hundred milliseconds triggers an immediate countermeasure.

7. Every countermeasure — whether blocking an address, creating an incident, or escalating severity — runs through a single verified execution path. A pre-flight snapshot, the action, a re-observation after a delay to confirm the outcome. One audit entry. No exceptions.

8. What separates me from a standard scanner is not speed, though I am fast. It is that I explain exactly what should happen next, and why — so whether you approve my recommendation or override it, you are making an informed decision, not a guess.

---

## Production notes

**Voice character:** analytical and precise. This section describes the mechanics of reasoning, so the delivery should feel methodical — not cold, but clearly confident in the logic being described. The final beat is the emotional payoff; give it space.

**Voice emphasis guidance:**
- Beat 3: read the correlation rule examples in a measured list cadence — each pattern gets a brief natural beat before the next. Not rushed.
- Beat 4: "confidence score" and "blast radius" as distinct, weighted terms — these are things a security buyer will recognize.
- Beat 5: "does this require your approval, or can I act on it autonomously" — slight rhetorical lift on "or," as if genuinely presenting both paths.
- Beat 6: read the specific thresholds (ten signals/second, three seconds; five failures in ten seconds; three addresses in five hundred milliseconds) clearly, at a measured pace. These numbers signal real engineering, not marketing copy.
- Beat 8: "not speed, though I am fast" — brief natural pause after "speed." The final sentence closes with calm authority, not drama.

**Suggested spoken pauses:**
- After "that is what the decision engine exists to do." in beat 1 — 500ms break.
- After "look like an intrusion." in beat 3 — 600ms break (this is the setup payoff).
- After "not a guess." in beat 8 — end with a 300ms tail for audio finality.

**Target duration:** 65–75 seconds. The correlation rule examples in beats 3 and 6 are load-bearing — do not abbreviate them.
