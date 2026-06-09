# Security Policy

QA Intel is a development and CI tool. It can drive browsers, call HTTP endpoints, capture screenshots, store diagnostics, and optionally persist run history to SQLite. Treat its output as test evidence that may contain sensitive application data.

## Supported Versions

Security fixes target the latest published version of `@qutecoder/qa-intel`.

| Version | Supported |
|---------|-----------|
| `0.x` latest | Yes |
| older `0.x` releases | Best effort |

## Reporting A Vulnerability

Please do not open a public issue for a suspected vulnerability.

Use GitHub's private vulnerability reporting for the repository if it is enabled. If it is not enabled, contact a maintainer privately first and open a public issue only with minimal metadata, without exploit details, credentials, logs, screenshots, or private URLs.

Helpful report details:

- affected package version
- environment and command used
- impact and affected data
- safe reproduction steps
- whether credentials, tokens, screenshots, or test databases may be exposed

## Sensitive Test Data

Avoid committing `.qa-results/`, screenshots, SQLite databases, API responses, or browser traces from private systems. These artifacts can include tokens, cookies, personal data, headers, and internal URLs.

Prefer test accounts, seeded fixtures, and redacted logs when sharing examples.
