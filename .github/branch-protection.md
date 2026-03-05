# Branch Protection: main

## Settings

| Setting | Value |
|---------|-------|
| Required status checks | CI / check, E2E / e2e |
| Require branches up to date | Yes |
| Required reviewers | 0 |
| Force push | Disabled |
| Deletion | Disabled |

## Applied via

```bash
gh api -X PUT repos/{owner}/{repo}/branches/main/protection \
  --input .github/branch-protection-payload.json
```

See the API payload used in the commit history.
