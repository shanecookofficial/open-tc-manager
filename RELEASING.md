# Releasing OpenTCM

v0.1.0 is **not tagged in the release-prep PR**. Tagging `v0.1.0` triggers
`.github/workflows/docker.yml`, which builds and pushes the production image to
GHCR. The maintainer tags **after** the release PR is merged to `main`.

## What the Docker workflow publishes

On a push of a git tag matching `v*` (`v0.1.0`), the workflow logs in to GHCR
and pushes `ghcr.io/shanecookofficial/opentcm` with these tags (see
`docker/metadata-action` in `.github/workflows/docker.yml`):

| Image tag | Source                                          |
| --------- | ----------------------------------------------- |
| `latest`  | `flavor: latest=auto` on the highest semver tag |
| `v0.1.0`  | `type=semver,pattern=v{{version}}`              |
| `0.1.0`   | `type=semver,pattern={{version}}`               |
| `0.1`     | `type=semver,pattern={{major}}.{{minor}}`       |

`docker-compose.prod.yml` defaults to
`OPENTCM_IMAGE=ghcr.io/shanecookofficial/opentcm:latest`, which matches the
`latest` tag the workflow publishes. Pin a release with
`OPENTCM_IMAGE=ghcr.io/shanecookofficial/opentcm:v0.1.0` if you do not want
`latest` to float.

PRs and branch pushes **build** the image but **do not push** (the `push:`
condition requires `refs/tags/v…`).

GHCR packages are often private until you change visibility. If `docker pull`
returns unauthorized after the workflow succeeds, set the `opentcm` package to
**Public** (GitHub → Packages).

## Maintainer steps for v0.1.0

1. Merge the release PR to `main`. Note the **merge commit SHA**.
2. Tag that commit and push the tag (this is the step that publishes the image):

```bash
git tag v0.1.0 <merge-commit> && git push origin v0.1.0
```

3. In `CHANGELOG.md`, replace `## [0.1.0] - Unreleased` with
   `## [0.1.0] - YYYY-MM-DD` (UTC date of the tag) and push that docs-only
   commit to `main` if you want the dated heading in the repo. Optional; GitHub
   Releases can carry the same notes.
4. Wait for the **Docker** workflow on the tag to finish (push to GHCR).
5. Make the GHCR package public if pulls should work without a token.
6. Create a GitHub Release from tag `v0.1.0` and paste the changelog section.

## Post-tag verification checklist

On a Docker host (not this agent VM if Docker is unavailable):

```bash
git clone https://github.com/shanecookofficial/open-tc-manager.git
cd open-tc-manager
cp .env.example .env
# optional: SEED_DEMO_DATA=true for the first boot only, then set it back to false
docker pull ghcr.io/shanecookofficial/opentcm:latest
docker pull ghcr.io/shanecookofficial/opentcm:v0.1.0
docker compose -f docker-compose.prod.yml up -d
curl -s http://localhost:3000/api/v1/health
# expect: {"status":"ok","database":"connected"}
```

Then in the browser: open http://localhost:3000, create a project (or use the
seeded WEB project), create a test case, and confirm it appears in the list and
at `/cases/<PREFIX>-1`.

Tear down: `docker compose -f docker-compose.prod.yml down` (add `-v` only if
you intend to destroy the Postgres volume).

Until the tag exists, `docker compose -f docker-compose.prod.yml up -d --build`
still works from source ([`docs/SETUP.md`](docs/SETUP.md) Part A).
