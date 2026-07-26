# Connectors — Narration Script

---

## Teaser

Risk does not live in one system. I connect GitHub, AWS, Okta, Azure AD, Snyk, VirusTotal, and Elastic simultaneously — so my picture of your exposure is complete, not fragmented.

---

## Full narrative

1. Security risk is distributed. Your AI systems live in GitHub repositories and AWS infrastructure. Your identities are managed in Okta and Azure Active Directory. Your dependencies are tracked in Snyk. Your threat indicators run through VirusTotal. Your SIEM is Elastic. Each of those is a partial view. I need all of them.

2. The connector framework lets me connect to all seven sources simultaneously, with a consistent status and health lifecycle for each. Connect, disconnect, inspect — each connector reports its own health, so you always know which sources are feeding me and which need attention.

3. From GitHub, I pull AI-asset and workflow-risk discovery across your repositories. From AWS, I scan across Bedrock, IAM, STS, CloudTrail, Lambda, S3, and Secrets Manager — with full account and region awareness. From Okta and Azure Active Directory, I pull identity provider signals to feed the identity threat detection layer.

4. From Snyk, I bring in software composition analysis and dependency vulnerability signals. From VirusTotal, I enrich indicators of compromise — file hashes, IP addresses, domains — against one of the largest threat-intelligence repositories available. From Elastic, I connect to your SIEM: cluster health, security indices, active alerts, and configured rules.

5. All of this flows into a unified inventory and risk engine. The findings are normalized and deduplicated across sources, so you see one picture of your AI security posture — not seven separate ones that you have to reconcile yourself.

6. Credentials for each connector are held in a vault, isolated from the application surface. Authentication options vary by connector — OAuth device flow, token-based, or CLI handoff where appropriate — because the right authentication method for GitHub is not the right one for AWS.

7. I am only as useful as the picture I have of your environment. Connectors are how that picture stays complete.

---

## Production notes

**Voice character:** matter-of-fact and confident. This section is the most enumeration-heavy in the set — the list of sources and what each provides is the substance. Delivery should feel like a knowledgeable briefing, not a feature catalog. Beat 7 is the closing statement; it should feel like a brief, grounded conclusion.

**Voice emphasis guidance:**
- Beat 1: read the list of sources (GitHub, AWS, Okta, Azure Active Directory, Snyk, VirusTotal, Elastic) with a clean, unhurried cadence. Each one is distinct. End on "Each of those is a partial view. I need all of them." — the second sentence is the thesis; slight weight on "all."
- Beats 3 and 4: when reading the per-connector details (especially the AWS services list: Bedrock, IAM, STS, CloudTrail, Lambda, S3, Secrets Manager), pace evenly and clearly — these names are meaningful to the security buyer. Do not rush.
- Beat 5: "not seven separate ones that you have to reconcile yourself" — let "reconcile yourself" land with a slight natural emphasis. This is the pain point being solved.
- Beat 6: "Credentials for each connector are held in a vault" — slight weight on "vault." The authentication options that follow are secondary detail; read them at a slightly lower register.
- Beat 7: short, deliberate. Two sentences. Full stop.

**Suggested spoken pauses:**
- After "Each of those is a partial view." in beat 1 — 400ms break before "I need all of them."
- After "which need attention." at the end of beat 2 — 500ms break.
- After "not seven separate ones that you have to reconcile yourself." in beat 5 — 500ms break.
- After the final sentence in beat 7 — 400ms tail.

**Target duration:** 50–60 seconds. Beats 3 and 4 (the per-connector detail) are the credibility layer — read them fully and clearly, but do not linger. The script is structured to move efficiently through enumeration while giving the unified-inventory payoff (beat 5) its proper weight.
