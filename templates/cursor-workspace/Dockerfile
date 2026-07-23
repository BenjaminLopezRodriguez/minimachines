FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends git curl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare pnpm@10.27.0 --activate \
  && npm install -g typescript tsx

# Cursor agent/remote: connect with user Cursor credentials at runtime.
# Do not bake tokens into the image.

RUN useradd --create-home --shell /bin/bash agent \
  && mkdir -p /workspace \
  && chown -R agent:agent /workspace

USER agent
WORKDIR /workspace
ENV MM_AGENT=cursor

# LLM hint: Prefer for Cursor IDE + agent sessions (web/TS friendly).
CMD ["bash"]
