FROM debian:bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl git python3 \
  && rm -rf /var/lib/apt/lists/*

# Ollama targets glibc (Debian), not musl — Alpine is unreliable for it, so we
# stay on bookworm-slim. The install script prints a systemd warning inside a
# container; that is harmless, the binary still lands in /usr/local/bin/ollama.
RUN curl -fsSL https://ollama.com/install.sh | sh

# Runtime launcher: start the Ollama API, wait until it answers, then pull the
# coding model. Models are multi-GB, so they are pulled AT RUNTIME and never
# baked into the image — this keeps the image small and the model swappable.
RUN cat > /usr/local/bin/mm-ollama-start <<'EOF' \
&& chmod +x /usr/local/bin/mm-ollama-start
#!/usr/bin/env bash
set -euo pipefail

MODEL="${OLLAMA_MODEL:-qwen2.5-coder:1.5b}"

# Serve the Ollama API in the background.
ollama serve &

# Wait for the API to accept connections before pulling.
until curl -fsS http://127.0.0.1:11434/ >/dev/null 2>&1; do
  sleep 1
done

# Pull the small coding LLM at runtime (never baked — models are GB).
ollama pull "$MODEL"

# Drop into a shell; ollama serve keeps running in the background.
exec bash
EOF

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
