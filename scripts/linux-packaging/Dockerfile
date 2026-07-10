FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive \
    CARGO_HOME=/usr/local/cargo \
    RUSTUP_HOME=/usr/local/rustup

RUN apt-get update && apt-get install -y \
  build-essential \
  pkg-config \
  curl \
  git \
  xdg-utils \
  libfuse2 \
  fuse3 \
  squashfs-tools \
  ca-certificates \
  python3 \
  file \
  cpio \
  rpm \
  appstream \
  patchelf \
  libgtk-3-dev \
  libwebkit2gtk-4.1-dev \
  libjavascriptcoregtk-4.1-dev \
  libsoup-3.0-dev \
  libglib2.0-dev \
  libpango1.0-dev \
  libatk1.0-dev \
  libappindicator3-dev \
  librsvg2-dev \
  libglib2.0-0 \
  libgdk-pixbuf2.0-0 \
  libcairo-gobject2 \
  libpango-1.0-0 \
  libatk1.0-0 \
  libcairo2 \
  libgtk-3-0 \
  && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
  && apt-get update \
  && apt-get install -y nodejs \
  && rm -rf /var/lib/apt/lists/*

RUN curl https://sh.rustup.rs -sSf | sh -s -- -y --profile minimal \
  && chmod -R a+rwX "${CARGO_HOME}" "${RUSTUP_HOME}"

ENV PATH="${CARGO_HOME}/bin:${PATH}"
WORKDIR /workspace
