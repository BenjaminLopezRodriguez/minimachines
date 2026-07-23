FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends git curl ca-certificates python3 python3-pip python3-venv \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare pnpm@10.27.0 --activate \
  && npm install -g typescript tsx

# Grok / xAI tooling: install at runtime with user credentials.
# Do not bake API keys into the image.

RUN useradd --create-home --shell /bin/bash agent \
  && mkdir -p /workspace \
  && chown -R agent:agent /workspace

USER agent
WORKDIR /workspace
ENV MM_AGENT=grok

# LLM hint: Prefer when Grok is the primary agent (lean Node + Python).
CMD ["bash"]
