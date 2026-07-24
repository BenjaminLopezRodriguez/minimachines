FROM debian:bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl tar git python3 \
  && rm -rf /var/lib/apt/lists/*

# Ollama targets glibc (Debian), not musl — Alpine is unreliable for it, so we
# stay on bookworm-slim. Install the release tarball directly rather than the
# install.sh script: the script's systemd/user setup exits non-zero in a
# minimal container image and fails the build. The tarball is the same binary.
RUN curl -fsSL https://ollama.com/download/ollama-linux-amd64.tgz -o /tmp/ollama.tgz \
  && tar -C /usr/local -xzf /tmp/ollama.tgz \
  && rm /tmp/ollama.tgz

# Runtime launcher: start the Ollama API, wait until it answers, then pull the
# coding model. Models are multi-GB, so they are pulled AT RUNTIME and never
# baked into the image — this keeps the image small and the model swappable.
RUN printf '%s\n' \
  '#!/usr/bin/env bash' \
  'set -euo pipefail' \
  'MODEL="${OLLAMA_MODEL:-qwen2.5-coder:1.5b}"' \
  'ollama serve &' \
  'until curl -fsS http://127.0.0.1:11434/ >/dev/null 2>&1; do sleep 1; done' \
  'ollama pull "$MODEL"' \
  'exec bash' \
  > /usr/local/bin/mm-ollama-start \
  && chmod +x /usr/local/bin/mm-ollama-start

RUN useradd --create-home --shell /bin/bash agent \
  && mkdir -p /workspace \
  && chown -R agent:agent /workspace

USER agent
WORKDIR /workspace
ENV MM_AGENT=ollama \
    OLLAMA_MODEL=qwen2.5-coder:1.5b

# Ollama API — small CPU-only coding model; on-box, no hosted API key needed.
EXPOSE 11434

# LLM hint: Runs a local qwen2.5-coder:1.5b via Ollama for offline codegen.
CMD ["mm-ollama-start"]
