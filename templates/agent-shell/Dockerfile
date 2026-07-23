FROM debian:bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends git curl ca-certificates bash \
  && rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --shell /bin/bash agent \
  && mkdir -p /workspace \
  && chown -R agent:agent /workspace

USER agent
WORKDIR /workspace

# LLM hint: Minimal generic agent sandbox — install runtimes at task time.
CMD ["bash"]
