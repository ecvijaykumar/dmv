# T-Drive App (Web + Mobile)

A secure starter app for tracking supervised driving practice hours for DMV records.

## What is included

- `apps/api`: Node.js API secured with Firebase ID token verification.
- `apps/web`: Browser app with Gmail login and phone OTP login.
- `apps/mobile`: Expo React Native app with Gmail login and phone OTP login.
- `packages/shared`: Shared domain types.

## Security model

- Authentication: Firebase Auth (Google and phone).
- API authorization: `Authorization: Bearer <Firebase ID Token>` required for all data routes.
- Data isolation: every session is stored with `ownerUserId`; API returns only signed-in user's records.
- Multi-profile support: each user can keep multiple driver profiles (for example `teen-1`, `teen-2`).
- Web config loading: browser fetches Firebase public config from `/api/public-config`, sourced from server env variables.

## Firebase setup

1. Create a Firebase project.
2. Enable providers in Firebase Authentication:
   - Google
   - Phone
3. Add `localhost` as an authorized domain in Firebase Authentication.
4. API setup:
   - Create Firebase service account key.
   - Copy `.env.example` to `.env` and fill values.
   - Include both private admin keys and `FIREBASE_WEB_*` public config values.
5. Mobile app setup:
   - Copy Firebase config and Google OAuth client IDs into `/Users/vijayekkaladevi/dev/dmv-practice-logger/apps/mobile/firebaseConfig.ts`.

## Install and run

```bash
cd /Users/vijayekkaladevi/dev/dmv-practice-logger
cp .env.example .env
# edit .env with your Firebase values
npm install
set -a && source .env && set +a
npm run start:api
```

Open [http://localhost:4000](http://localhost:4000).

For mobile:

```bash
cd /Users/vijayekkaladevi/dev/dmv-practice-logger
npm run dev:mobile
```

## Mobile troubleshooting (macOS)

If you see `xcrun simctl ... code: 72`, `TypeScript dependencies` prompt, or `EMFILE: too many open files`:

1. Install Xcode Command Line Tools (one-time):
```bash
xcode-select --install
```

2. Install workspace dependencies (one-time):
```bash
cd /Users/vijayekkaladevi/dev/dmv-practice-logger
npm install
```

3. Start mobile app with watcher headroom:
```bash
cd /Users/vijayekkaladevi/dev/dmv-practice-logger
npm run dev:mobile
```

Notes:
- `apps/mobile/package.json` includes `typescript` and `@types/react`.
- Mobile start scripts set `ulimit -n 4096` and clear Metro cache.
- If iOS simulator tooling is unavailable, start Android/Web first.

## API routes (secured)

- `GET /api/health`
- `GET /api/public-config`
- `GET /api/me`
- `GET /api/sessions?profileId=teen-1`
- `POST /api/sessions`
- `DELETE /api/sessions/:id`
- `GET /api/stats?profileId=teen-1`

All routes except `/api/health` and `/api/public-config` require Bearer token.
