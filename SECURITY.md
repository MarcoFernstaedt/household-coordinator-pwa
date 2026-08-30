# Security policy

## Supported version

The latest commit on `main` is the only supported pre-1.0 version.

## Reporting a vulnerability

Use GitHub's **Report a vulnerability** private reporting form on this repository's Security tab. Do not open a public issue for a suspected vulnerability and do not include credentials, personal data, or a real household database in a report.

Include the affected commit, route/component, minimal synthetic reproduction, expected boundary, observed behavior, and impact. Reports concerning cross-realm access, guest expiry/revocation, session/CSRF handling, replay/idempotency, private data, or dependency compromise receive priority.

You should receive acknowledgement within five business days. Remediation timing depends on severity and reproducibility. If a material exposure is confirmed after publication, maintainers will make the repository private while investigating; history will not be force-rewritten as an improvised response.

## Scope

This repository has no hosted production household realm, bug bounty, live Home Assistant connector, external provider integration, or authorization to test third-party systems. Use only synthetic disposable state.
