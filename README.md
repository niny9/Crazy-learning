# LinguaFlow on Vercel

This app is now set up to deploy on Vercel with Zhipu AI on the server side.

## Local development

1. Install dependencies:
   `npm install`
2. Create `.env.local` from `.env.example`
3. Start the app:
   `npm run dev`

## Environment variables

- `ZHIPU_API_KEY`: your Zhipu AI API key
- `ZHIPU_MODEL`: optional, defaults to `glm-4-flash`

## Deploy to Vercel

1. Import this repo into Vercel
2. Set `ZHIPU_API_KEY` in the Vercel project environment variables
3. Run a production deploy

## Notes

- The browser no longer receives the model API key directly.
- AI requests now go through the Vercel serverless route at `/api/ai`.
- Reading, writing, vocabulary, and AI dialogue use Zhipu.
- Text narration uses the browser's built-in speech synthesis for a simpler cross-browser fallback.
