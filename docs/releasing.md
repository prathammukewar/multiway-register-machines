# Releasing

The package is published to PyPI as `multiway-register-machines` (the import
name stays `mrm`). Publishing is automatic: a GitHub release triggers
`.github/workflows/publish.yml`, which builds the wheel and sdist and uploads
them with PyPI trusted publishing, so no token is stored in the repository.

## One-time setup

1. On PyPI, open Account settings, then Publishing, and add a pending
   publisher with these values:
   - PyPI project name: `multiway-register-machines`
   - Owner: `prathammukewar`
   - Repository: `multiway-register-machines`
   - Workflow name: `publish.yml`
   - Environment name: `pypi`
2. On GitHub, under Settings, Environments, create an environment called
   `pypi`. Adding yourself as a required reviewer means every upload waits
   for a click, which is a sensible guard.
3. On Zenodo, under GitHub settings, switch the repository on. Every
   release after that gets a DOI; paste it into `CITATION.cff` in the
   commented `doi` line and into the README's citation block.

## Each release

1. Bump the version in `src/mrm/_version.py`, `pyproject.toml`, and
   `CITATION.cff` (also update `date-released`).
2. Add a section to `CHANGELOG.md`.
3. Run the gate: `ruff check src tests`, `ruff format --check src tests`,
   `mypy --strict src/mrm`, `pytest`, and `npm run build` inside `web/`.
4. Commit, then tag and push:

   ```bash
   git tag v0.1.0
   git push origin main v0.1.0
   ```

5. Create the release from the tag. The publish workflow checks that the
   tag matches the package version before it uploads anything.

   ```bash
   gh release create v0.1.0 --title "v0.1.0" --notes-file <(sed -n '/^## 0.1.0/,/^## /p' CHANGELOG.md | sed '$d')
   ```

6. Confirm the upload at https://pypi.org/project/multiway-register-machines/
   and that `pip install multiway-register-machines` pulls the new version.
