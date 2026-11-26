# Dev container image for local use and GitHub Codespaces.
#
# Both base images are pinned by digest (the multi-arch index, so amd64 and
# arm64 hosts resolve the same pin) with the tag kept alongside. Dependabot's
# `docker` ecosystem reads this file and bumps tag and digest together; see
# .github/dependabot.yml.

# Bun comes from the official image as a single static binary instead of a
# community dev container feature or a `curl | bash` install: it is published
# by the Bun project, pinned by digest, and updated by Dependabot. Keep the
# version in step with `bun-version` in .github/workflows/node.js.yml.
FROM docker.io/oven/bun:1.4.5@sha256:3aa040e5445efa09d75bb428a64ba50db13e2b3ac9b6b0c7f145615f62b2ee18 AS bun

# Official dev container Node image: Node 24 on Debian 13 "trixie" (current
# stable). It already has the non-root `node` user, git and common utilities.
FROM mcr.microsoft.com/devcontainers/javascript-node:24-trixie@sha256:56a7d5570b644ed88c4ab3529f46bd662d656ebe9e73de06076af91a75fa8f3e

COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
RUN ln -s bun /usr/local/bin/bunx
