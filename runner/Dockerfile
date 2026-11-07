# Runner image for the AI review scale set: GitHub's actions-runner image + the reviewer, dependencies pinned
# at build time so jobs need no package downloads. Built in Azure Container Registry (az acr build).
ARG RUNNER_IMAGE=ghcr.io/actions/actions-runner:latest
FROM ${RUNNER_IMAGE}
USER root
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY reviewer/requirements.txt /opt/reviewer/requirements.txt
RUN python3 -m venv /opt/reviewer/.venv \
 && /opt/reviewer/.venv/bin/pip install --no-cache-dir -r /opt/reviewer/requirements.txt
COPY reviewer/ /opt/reviewer/
RUN chmod 0555 /opt/reviewer/review.py
USER runner
