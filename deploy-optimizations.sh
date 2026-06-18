#!/bin/bash

# TradeHard Pro - Optimization Deployment Script
# This script replaces the original files with the optimized versions

echo "Deploying TradeHard Pro optimizations..."

# Backup original files
echo "Creating backups..."
cp src/components/MarketChart.tsx src/components/MarketChart.tsx.backup
cp src/utils/marketData.ts src/utils/marketData.ts.backup
cp src/indicators/rainbowMa.ts src/indicators/rainbowMa.ts.backup
cp src/indicators/cdcActionZone.ts src/indicators/cdcActionZone.ts.backup
cp src/indicators/maUtils.ts src/indicators/maUtils.ts.backup

# Replace with optimized versions
echo "Deploying optimized files..."
cp src/components/MarketChart.optimized.tsx src/components/MarketChart.tsx
cp src/utils/marketData.optimized.ts src/utils/marketData.ts
cp src/indicators/rainbowMa.optimized.ts src/indicators/rainbowMa.ts
cp src/indicators/cdcActionZone.optimized.ts src/indicators/cdcActionZone.ts
cp src/indicators/maUtils.optimized.ts src/indicators/maUtils.ts

# Run tests to verify
echo "Running tests..."
if pnpm test; then
  echo "Tests passed successfully!"
else
  echo "Tests failed! Restoring backups..."
  cp src/components/MarketChart.tsx.backup src/components/MarketChart.tsx
  cp src/utils/marketData.ts.backup src/utils/marketData.ts
  cp src/indicators/rainbowMa.ts.backup src/indicators/rainbowMa.ts
  cp src/indicators/cdcActionZone.ts.backup src/indicators/cdcActionZone.ts
  cp src/indicators/maUtils.ts.backup src/indicators/maUtils.ts
  echo "Restored original files due to test failures."
  exit 1
fi

# Build to verify
echo "Building application..."
if pnpm build; then
  echo "Build successful!"
  echo "Optimizations deployed successfully!"
else
  echo "Build failed! Restoring backups..."
  cp src/components/MarketChart.tsx.backup src/components/MarketChart.tsx
  cp src/utils/marketData.ts.backup src/utils/marketData.ts
  cp src/indicators/rainbowMa.ts.backup src/indicators/rainbowMa.ts
  cp src/indicators/cdcActionZone.ts.backup src/indicators/cdcActionZone.ts
  cp src/indicators/maUtils.ts.backup src/indicators/maUtils.ts
  echo "Restored original files due to build failures."
  exit 1
fi