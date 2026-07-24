# Security and privacy

This application coordinates pastoral care. It is not a medical record,
counseling record, emergency service, or compliance certification.

## Required production safeguards

1. Serve the application only over HTTPS.
2. Use long, unique values for `BOOTSTRAP_ADMIN_PASSWORD` and
   `ENCRYPTION_SECRET`.
3. Keep `.env` outside source control and restrict who can read it.
4. Place the database on encrypted storage with tested backups.
5. Give every volunteer an individual account. Never share passwords.
6. Grant only the ministry permissions a volunteer needs.
7. Remove access immediately when someone leaves a team.
8. Keep diagnoses, medications, counseling disclosures, confessions, abuse
   reports, and other highly sensitive details out of routine notes and email.
9. Review the audit log and account permissions regularly.
10. Obtain an independent security and legal review before storing regulated
    health information or using the application as a system of record.

## Secret rotation

`ENCRYPTION_SECRET` protects stored Google and Planning Center OAuth tokens.
Changing it makes existing encrypted tokens unreadable. Disconnect those
integrations before rotating the secret, then reconnect them afterward.

The bootstrap password is used only when the database has no users. After the
first administrator account is created, change that account's password in the
dashboard and remove or rotate `BOOTSTRAP_ADMIN_PASSWORD`.

## Incident response

If an account or server may be compromised:

1. Take the application offline or restrict network access.
2. Rotate administrator passwords and deployment secrets.
3. Revoke Google and Planning Center OAuth access.
4. Review audit activity and hosting logs.
5. Notify the appropriate church and legal leadership.
6. Restore only from a known-good backup.
