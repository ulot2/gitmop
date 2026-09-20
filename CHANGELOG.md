# Changelog

All notable changes to this project are listed in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.1.0] - 2026-09-20

### Added

- `gitmop list`: show local branches that are merged into the base branch or whose remote branch is gone.
- `gitmop clean`: delete the branches that `list` shows, and print the last commit hash of each.
- `gitmop old --days <n>`: show branches with no commit in the last N days.
- `--base <name>` to override the base branch.

[Unreleased]: https://github.com/ulot2/gitmop/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/ulot2/gitmop/releases/tag/v0.1.0
