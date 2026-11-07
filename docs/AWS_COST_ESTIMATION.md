# AWS_COST_ESTIMATION.md

Status: **design-time estimate only. No AWS resource exists.** Every unit price is `[V]` (secondary source, to be replaced by the AWS Pricing Calculator before any budget approval). ₹ = US$ × 95; 730 h/month; ex-GST. Authoritative baseline: ARCHITECTURE.md §9. This file adds scenarios and must stay reconciled with it.

## 1. Scenarios (production, monthly)

| Scenario | Meaning | US$ | ₹ |
|---|---|---:|---:|
| **Low** | Floor in ARCHITECTURE §9.2: 3.5 vCPU / 7 GB always on, Aurora 1 ACU constant, one NAT, CloudFront inside always-free allowance | ≈ 380 | ≈ 36,100 |
| **Normal** | Planning envelope §9.2: +15% Fargate for scale-outs, Aurora avg 1.5 ACU, ~100 GB NAT | ≈ 490 | ≈ 46,600 |
| **High (spike month)** | Illustrative, see below. Sustained campaign traffic | ≈ 950 | ≈ 90,000 |

### High-scenario arithmetic (assumptions, all `[L]` until load-tested)
| Line | Assumption | US$ |
|---|---|---:|
| Fargate | average 6 vCPU / 12 GB over the month (6×0.04256×730 + 12×0.004655×730) | 227 |
| ALB | ~5 average LCU (16.4 + 0.008×5×730 + ~0) | 46 |
| Public IPv4 | unchanged | 11 |
| NAT | 500 GB processed (40.9 + 500×0.056) | 69 |
| Aurora | average 3 ACU (3×0.18×730 + storage/I-O ≈ 12) | 406 |
| CloudFront | 2 TB out, first 1 TB free, 1 TB × 1024 × 0.109 | 112 |
| WAF | ~30 M requests | 18 |
| CloudWatch | more logs/metrics | 40 |
| Secrets, KMS, S3, SQS, SES, other | | 18 |
| **Total** | | **≈ 947** |

The ceilings in ARCHITECTURE §9.2 (ECS ≈ ₹37,800 and Aurora 4 ACU ≈ ₹49,900 if pinned at maximum all month) bound the compute lines; traffic-driven lines (CloudFront, WAF, NAT data) are not capped by task limits.

## 2. Staging (separate account, synthetic data): ≈ ₹14,900 (mirror) or ≈ ₹8,000 (minimal). Recommended: mirror.
Combined recurring spend: floor ≈ ₹51,000, planning ≈ ₹61,500 (§9.4).

## 3. Biggest levers (ordered by value)
1. Aurora minimum ACU and the 4 ACU ceiling (largest line).
2. NAT Gateway count and data volume (one NAT at launch; VPC endpoints for S3/ECR/SQS can cut NAT data later `[V]`).
3. CloudFront caching of public pages and images (keeps origin load, NAT data and Aurora ACU down).
4. ARM Fargate (~20% saving `[V]`, needs ARM-built images; validate in CI).
5. Lean launch variant (≈ US$243) trades redundancy for cost; not recommended unless the budget is below the planning envelope.

## 4. Not included
GST, AWS Support plan, domain, CloudTrail/GuardDuty/Config/AWS Backup, payment gateway fees, WhatsApp/SMS fees, high CloudFront transfer beyond the High scenario, third-party tools.

## 5. Open items
- Approved monthly budget `[U]` (alerts at 50/80/100% plus Cost Anomaly Detection; alerts do not cap spend).
- Replace every `[V]` price with Pricing Calculator output for ap-south-1 before approval.
- Load test (`[L]`) to turn the High scenario assumptions into measured numbers.
