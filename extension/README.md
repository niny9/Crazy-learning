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
- If LinguaFlow is already open, the extension will reuse that tab instead of opening a new one every time
- In the popup:
  - clip type is auto-inferred
  - you can override the source title
  - `Cmd/Ctrl + Enter` sends the current clip quickly

The extension opens LinguaFlow with import query params.
LinguaFlow then auto-saves the clip into:

- `Words`
- or `Sentences`

## Custom domain

If you deploy LinguaFlow to another domain, update the target URL in the popup.
