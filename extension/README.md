# LinguaFlow Chrome Clipper

This extension lets you save a selected `word` or `sentence` from any webpage into LinguaFlow.

## Install locally

1. Open `chrome://extensions`
2. Turn on `Developer mode`
3. Click `Load unpacked`
4. Select the `/extension` folder inside this repo

## How it works

- Select text on any webpage
- Right click:
  - `Save to LinguaFlow as Word`
  - `Save to LinguaFlow as Sentence`
- Or open the extension popup and choose manually
- If direct save is configured, the extension writes to LinguaFlow through `/api/clipper/import`
- If direct save is not configured or fails, the extension falls back to opening LinguaFlow with import params
- If LinguaFlow is already open, the fallback flow will reuse that tab instead of opening a new one every time
- In the popup:
  - clip type is auto-inferred
  - you can override the source title
  - you can store your personal plugin token
  - `Cmd/Ctrl + Enter` sends the current clip quickly

## Direct save setup

Add these server env vars to LinguaFlow:

- `SUPABASE_SERVICE_ROLE_KEY`
- `CLIPPER_SHARED_SECRET`

Then inside LinguaFlow:

- sign in with your own account
- open the account modal
- click `Generate token`
- copy the token

Then open the popup once and fill:

- `LinguaFlow URL`
- `Your personal plugin token`

After that, the extension can save directly into:

- `Words`
- or `Sentences`

## Custom domain

If you deploy LinguaFlow to another domain, update the target URL in the popup.
