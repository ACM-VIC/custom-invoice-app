#!/bin/bash
set -e

echo "Installing Chromium system dependencies..."
apt-get update -qq && apt-get install -y -qq \
  libnss3 \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libcups2 \
  libdrm2 \
  libxkbcommon0 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxrandr2 \
  libgbm1 \
  libasound2 \
  libpangocairo-1.0-0 \
  libpango-1.0-0 \
  libcairo2 \
  libx11-6 \
  libx11-xcb1 \
  libxcb1 \
  libxext6

echo "Downloading Chrome for Puppeteer..."
cd /home/site/wwwroot
node /node_modules/puppeteer/lib/cjs/puppeteer/node/cli.js browsers install chrome

echo "Starting app..."
npm start