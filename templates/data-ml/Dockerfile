FROM python:3.12-slim-bookworm

RUN apt-get update \
  && apt-get install -y --no-install-recommends git curl ca-certificates build-essential \
  && rm -rf /var/lib/apt/lists/* \
  && pip install --no-cache-dir uv pytest jupyter pandas numpy scikit-learn

RUN useradd --create-home --shell /bin/bash agent \
  && mkdir -p /workspace \
  && chown -R agent:agent /workspace

USER agent
WORKDIR /workspace
ENV PATH="/home/agent/.local/bin:${PATH}"

# LLM hint: Data/ML Python stack for notebooks and analysis (CPU-oriented).
CMD ["bash"]
