# Contributing

## Setup

1. Fork the repository and create a branch from `main`.
2. Install dependencies with `npm ci`.
3. Make your changes.
4. Run:
   - `npm run compile`
   - `npm run lint`
   - `npm test -- --runInBand`

## Pull requests

- Keep pull requests focused and small enough to review.
- Update `README.md` for behavior or configuration changes.
- Update `CHANGELOG.md` for user-facing changes.
- Bump `package.json` only when preparing a release, not for normal feature PRs.
- Fill out the pull request template completely.

## Release flow

Releases are cut from GitHub Actions by pushing a version tag that matches `package.json`.

Example:

1. Update `package.json` to `0.3.0`
2. Update `CHANGELOG.md`
3. Merge to `main`
4. Push tag `v0.3.0`

The release workflow will validate, package, publish, and attach the `.vsix` to the GitHub release.
