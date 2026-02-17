FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    libblas3 \
    libfontconfig1 \
    liblapack3 \
    libgfortran5 \
    libgl1 \
    libglib2.0-0 \
    libnss3 \
    libquadmath0 \
    texlive-latex-base \
    texlive-latex-extra \
    texlive-latex-recommended \
    texlive-fonts-recommended \
    texlive-science \
  && rm -rf /var/lib/apt/lists/*

COPY . .

RUN uv sync --frozen --no-dev

EXPOSE 8000

CMD ["sh", "-c", "uv run uvicorn api.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
