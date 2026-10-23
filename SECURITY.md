# Security policy and production cautions

Billing RT/RW Net can store customer information, payment history, and encrypted MikroTik credentials. Treat the server and database as sensitive systems.

## Before production use

- Use HTTPS for browser access and restrict access to trusted users/networks.
- Do not expose MySQL or RouterOS API directly to the public internet.
- Use a dedicated MySQL user and a dedicated MikroTik API user with minimum required permissions.
- Keep `backend/.env`, database backups, and `ROUTER_CREDENTIAL_KEY` out of Git and public file shares.
- Keep the same `ROUTER_CREDENTIAL_KEY` after router credentials have been stored. If lost, those credentials may no longer be decryptable.
- Use strong unique passwords, separate accounts per operator, and disable accounts that no longer need access.
- Back up the database and test restoring it.
- Restrict server firewall rules; allow only the ports and source networks that are necessary.
- Run only one scheduler-enabled backend instance per production database unless distributed locking has been implemented and verified.
- Test isolation/restore behavior on a lab router and a test customer before enabling automated isolation for paying customers.
- Review logs and monitor API/database failures. Do not paste unredacted logs, customer data, secrets, or database dumps into public issues.

## Current implementation limitations

This repository is a community/MVP application, not a security-audited billing platform. Login bearer sessions are stored in backend memory and are lost on restart. The current Express API enables permissive CORS by default; deploy behind a properly configured reverse proxy and restrict trusted network access. Review and harden CORS, rate limiting, session lifecycle, audit logging, TLS, and authorization before exposing it to the public internet.

## Reporting a vulnerability

Do not publish exploitable details or credentials in a public issue. Contact the repository maintainer privately using a contact method listed in the repository profile. Add a private contact method before publishing this repository for wider use.
