# ARIA trial form — serverless backend

Public form submissions on the landing site are stored durably in **DynamoDB**
and emailed to **sary@aria-sec.com** via this stack:
**API Gateway (HTTP API) → Lambda → DynamoDB + SES**. No always-on server.

```
Landing form ──HTTPS──▶ API Gateway ──▶ Lambda ──▶ DynamoDB (store, durable)
                                          (validate    └────▶ SES email (notify)
                                           + honeypot)
```

The lead is written to DynamoDB **before** the email is attempted, so a lead is
never lost even if SES is unverified or temporarily failing.

---

## One-time setup

### 1. Verify the email in SES (us-east-1)

Submissions are both *sent from* and *delivered to* `sary@aria-sec.com`, so that
address must be a verified SES identity. Because sender = recipient, **you do NOT
need to leave the SES sandbox.**

- AWS Console → **SES** (region **us-east-1**) → *Verified identities* →
  **Create identity** → Email address → `sary@aria-sec.com` → confirm the link
  emailed to that inbox.
- *(Optional, more robust for production: verify the whole `aria-sec.com` domain
  instead — SES gives you DKIM CNAME records to add at GoDaddy. Then any
  `@aria-sec.com` sender works and mail is DKIM-signed.)*

### 2. Install the tooling (once)

```bash
brew install aws-sam-cli      # or: pipx install aws-sam-cli
```

### 3. Credentials that can deploy

Your site-deploy IAM user should be scoped to S3 + CloudFront only. For this
deploy you need CloudFormation/Lambda/API Gateway/IAM/SES permissions. Easiest:
run the deploy once with an **admin** profile. If you'd rather scope a policy,
attach this to a dedicated deploy user:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": [
      "cloudformation:*", "lambda:*", "apigateway:*",
      "iam:CreateRole", "iam:DeleteRole", "iam:GetRole", "iam:PassRole",
      "iam:AttachRolePolicy", "iam:DetachRolePolicy",
      "iam:PutRolePolicy", "iam:DeleteRolePolicy", "iam:TagRole",
      "s3:CreateBucket", "s3:PutObject", "s3:GetObject", "s3:ListBucket",
      "dynamodb:*",
      "ses:SendEmail", "ses:GetIdentityVerificationAttributes"
    ],
    "Resource": "*"
  }]
}
```

### 4. Deploy

```bash
cd infra/trial-form
sam deploy --guided \
  --stack-name aria-trial-form \
  --region us-east-1 \
  --capabilities CAPABILITY_IAM
# Accept defaults; NotifyEmail/FromEmail default to sary@aria-sec.com.
```

On success it prints **`ApiEndpoint`** — e.g.
`https://abc123.execute-api.us-east-1.amazonaws.com/trial-request`.

### 5. Point the landing at it + redeploy

Set the endpoint as a build-time env var and rebuild/redeploy the landing:

```bash
# from the repo root
export ARIA_SITE_BUCKET="s3://your-site-bucket"
export ARIA_SITE_DIST_ID="your-cloudfront-distribution-id"
export AWS_PROFILE="your-profile"

VITE_PUBLIC_SURFACE=landing VITE_TRIAL_ENDPOINT="<ApiEndpoint from step 4>" npm run build
./scripts/deploy-site.sh   # syncs to S3 and invalidates CloudFront
```

Done — the form is live and submissions arrive at the address you set as
`NotifyEmail` in step 4.

---

## Notes

- **Spam defence:** gateway throttling (5 req/s, burst 10), a hidden honeypot
  field, and strict server-side validation. Add AWS WAF or a Turnstile/hCaptcha
  challenge later if abuse appears.
- **Reading the leads:** every submission is in the DynamoDB table
  `aria-trial-form-leads`. Newest-first without a scan:
  ```bash
  aws dynamodb query --table-name aria-trial-form-leads --index-name by_received \
    --key-condition-expression "entity = :e" \
    --expression-attribute-values '{":e":{"S":"lead"}}' \
    --scan-index-forward false --region us-east-1
  ```
  Point-in-time recovery is on, so the table can be restored to any second in the
  last 35 days.
- **Custom domain** (e.g. `forms.aria-sec.com`): map an API Gateway custom domain
  with an ACM cert + a GoDaddy CNAME. Cosmetic; the form works fine on the raw
  `execute-api` URL.
