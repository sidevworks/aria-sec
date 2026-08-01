# ARIA Pilot Connector Permissions

This document defines the smallest practical permission sets for the two pilot connectors used by the end-to-end acceptance workflow. Use dedicated test accounts and restrict them to pilot repositories and accounts.

## GitHub read-only discovery

Prefer a fine-grained token restricted to the repositories in the pilot.

- Metadata: read
- Contents: read

ARIA reads repository metadata, the Git tree and selected blobs. It does not need Administration, Secrets, Actions write access or organization-owner access for discovery.

## GitHub remediation pull requests

Enable this only for the separate remediation identity and only on repositories where ARIA may open review branches.

- Metadata: read
- Contents: read and write
- Pull requests: read and write
- Workflows: write only if the approved target file is under `.github/workflows/`

The connector creates a branch, writes one generated artifact and opens a pull request. It never merges the pull request. Protect the default branch and require a human review.

## AWS read-only discovery

Use a dedicated role with a trust policy limited to the ARIA pilot identity. If cross-account discovery is required, allow `sts:AssumeRole` only on explicit pilot role ARNs.

The current connector calls:

- `sts:GetCallerIdentity`
- `bedrock:ListFoundationModels`
- `bedrock:GetAgent`
- `bedrock:ListAgents`
- `bedrock:ListKnowledgeBases`
- `iam:ListRoles`
- `iam:ListRolePolicies`
- `iam:GetRolePolicy`
- `iam:ListAttachedRolePolicies`

Example baseline policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AriaReadOnlyDiscovery",
      "Effect": "Allow",
      "Action": [
        "sts:GetCallerIdentity",
        "bedrock:ListFoundationModels",
        "bedrock:GetAgent",
        "bedrock:ListAgents",
        "bedrock:ListKnowledgeBases",
        "iam:ListRoles",
        "iam:ListRolePolicies",
        "iam:GetRolePolicy",
        "iam:ListAttachedRolePolicies"
      ],
      "Resource": "*"
    }
  ]
}
```

Some AWS list operations do not support resource-level restrictions. Constrain the role through account boundaries, short sessions, external IDs where relevant, CloudTrail monitoring and an explicit permissions boundary.

## Pilot validation

For each connector:

1. Start with the permissions above and an empty ARIA persistence directory.
2. Connect the dedicated pilot identity.
3. Run status, health and inventory discovery.
4. Confirm the connector does not request or receive broader permissions.
5. For GitHub remediation, open a pull request against a disposable pilot repository and confirm branch protection prevents direct merge.
6. Export the ARIA audit evidence pack and retain the connector-side audit logs for comparison.

## Rotation and removal

- Set an expiry on personal tokens where supported.
- Rotate immediately after the pilot or any suspected exposure.
- Disconnect the connector in ARIA, then revoke the provider credential.
- Confirm the encrypted credential record is removed and the connector reports disconnected.
