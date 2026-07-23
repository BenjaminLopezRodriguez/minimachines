FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends git curl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare pnpm@10.27.0 --activate \
  && npm install -g typescript tsx

RUN useradd --create-home --shell /bin/bash agent \
  && mkdir -p /workspace \
  && chown -R agent:agent /workspace

USER agent
WORKDIR /workspace

# LLM hint: Node 22 + pnpm + TypeScript/tsx for JS/TS agent coding.
CMD ["bash"]
