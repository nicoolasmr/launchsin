# Local Setup Guide

## Requirements
- Node.js 18+
- Docker (for local PG/Supabase testing)
- Supabase CLI

## Steps
1. **Clone & Install**:
   ```bash
   npm install
   ```
2. **Setup Client**:
   ```bash
   cd client && npm install
   npm run dev
   ```
3. **Setup Server**:
   ```bash
   cd server && npm install
   npm run dev
   ```
4. **Environment**:
   Copy `.env.example` to `.env` in each module.

## Gates Verification
Run these before any commit:
- `npm run check`
- `npm run audit:pii`
- `npm run lint`
