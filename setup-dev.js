#!/usr/bin/env node

/**
 * Setup script for local development
 * Injects environment variables from .dev.vars into public/app.js
 *
 * Usage: node setup-dev.js
 */

const fs = require('fs');
const path = require('path');

const devVarsPath = path.join(__dirname, '.dev.vars');
const appJsPath = path.join(__dirname, 'public', 'app.js');

// Load .dev.vars
if (!fs.existsSync(devVarsPath)) {
  console.error('❌ .dev.vars file not found!');
  console.log('📝 Create one from .dev.vars.example first');
  process.exit(1);
}

const devVarsContent = fs.readFileSync(devVarsPath, 'utf8');
const vars = {};

devVarsContent.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return;
  const [key, value] = trimmed.split('=');
  if (key && value) {
    vars[key.trim()] = value.trim();
  }
});

// Check required vars
const required = ['NVIDIA_API_KEY', 'SUPABASE_URL', 'SUPABASE_KEY'];
for (const key of required) {
  if (!vars[key] || vars[key].includes('your-')) {
    console.warn(`⚠️  ${key} not set in .dev.vars (still has placeholder value)`);
  }
}

// Read app.js
let appJs = fs.readFileSync(appJsPath, 'utf8');

// Update CONFIG object with values from .dev.vars
const configRegex = /const CONFIG = \{[\s\S]*?\};/;
const newConfig = `const CONFIG = {
  supabaseUrl: '${vars.SUPABASE_URL || 'https://your-project.supabase.co'}',
  supabaseAnonKey: '${vars.SUPABASE_ANON_KEY || 'your-anon-key'}'
};`;

appJs = appJs.replace(configRegex, newConfig);

// Write updated app.js
fs.writeFileSync(appJsPath, appJs);
console.log('✅ Updated public/app.js with Supabase configuration from .dev.vars');
console.log('🚀 Run: wrangler dev');
