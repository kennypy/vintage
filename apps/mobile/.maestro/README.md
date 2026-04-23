# Mobile E2E — Maestro flows

[Maestro](https://maestro.mobile.dev/) drives the built app on a running
emulator/device. These flows are the minimum smoke suite we want passing
before every release — they catch "screen mounts but primary CTA does
nothing" bugs that `tsc + eslint + jest` cannot.

## What's here

| Flow | Auth | Purpose |
|---|---|---|
| `smoke_launch.yaml` | no | Cold-launches the app and asserts the root layout renders something (home or login). |
| `smoke_login_form.yaml` | no | Asserts the login screen has its input fields + primary CTA. |
| `flow_promotion_boost.yaml` | yes | Regression test for the "Impulsionar anúncio" plan picker — tapping each tier must actually change the selection and CTA copy. |

## Setup

### Install Maestro CLI

```bash
curl -Ls "https://get.maestro.mobile.dev" | bash
export PATH="$PATH:$HOME/.maestro/bin"
maestro --version
```

### Bring up a device

- **Android**: start an emulator (`emulator -avd Pixel_8_API_34`) or plug in a device with USB debugging. Then `adb devices` should list it.
- **iOS**: boot a simulator (`xcrun simctl boot "iPhone 15"`) or plug in a device.

### Build + install a dev client

Maestro runs against a real install of the app, not a Metro bundle. Build + install the Expo dev client once per device:

```bash
# From repo root
npm run android    # or: npm run ios
```

## Running flows

```bash
# From repo root
cd apps/mobile

# Single flow
maestro test .maestro/smoke_launch.yaml

# All smoke flows (no auth required)
maestro test --include-tags smoke .maestro/

# Auth'd flow — supply a staging test account
maestro test .maestro/flow_promotion_boost.yaml \
  -e VINTAGE_TEST_EMAIL=qa@vintage.br \
  -e VINTAGE_TEST_PASSWORD='<redacted>'
```

## Running in CI

These flows are **not** wired into `ci-parity.sh` — they need an emulator
that isn't available in every developer's sandbox. Run them on a
dedicated mobile-CI job (e.g. Maestro Cloud, BrowserStack, or a
self-hosted runner with `emulator` on the PATH).

```yaml
# example job
- uses: mobile-dev-inc/action-maestro-cloud@v1
  with:
    api-key: ${{ secrets.MAESTRO_CLOUD_API_KEY }}
    app-file: artifacts/app.apk
    workspace: apps/mobile/.maestro
```

## Adding a new flow

1. Write a `<verb>_<feature>.yaml` file with `tags:` listing either
   `smoke` (no auth, runs on every build) or `auth-required`.
2. Prefer text-based `assertVisible:` / `tapOn:` on pt-BR copy — this
   keeps the flows readable and forces us to notice when user-visible
   copy changes.
3. Keep flows short. One flow = one user journey.
4. Document any new env vars at the top of the file.
