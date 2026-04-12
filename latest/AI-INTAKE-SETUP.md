# TourBook AI Intake setup

## 1) Create a Gemini API key
- Open Google AI Studio.
- Go to the API Keys page.
- Create or copy a Gemini API key for the project you want to use.

## 2) Add Vercel environment variables
Add these in Vercel → Project → Settings → Environment Variables:

Required:
- APP_PASSWORD
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- AI_INTAKE_PROVIDER=gemini
- AI_INTAKE_TEXT_MODEL=gemini-2.5-flash-lite
- AI_INTAKE_IMAGE_MODEL=gemini-2.5-flash
- GEMINI_API_KEY=your_key_here

Recommended for reliability:
- AI_INTAKE_FALLBACK_PROVIDER=openrouter
- OPENROUTER_API_KEY=your_openrouter_key_here
- OPENROUTER_MODEL=openrouter/free
- OPENROUTER_SITE_URL=https://your-vercel-url.vercel.app
- OPENROUTER_SITE_NAME=TourBook

Optional:
- ADMIN_PASSWORD
- NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN

## 3) Redeploy
After saving the env vars, redeploy the project in Vercel.

## 4) Test the flow
- Open Admin.
- Go to New Date.
- Click Import.
- Try a short pasted routing list first.
- Then try a poster or screenshot.
- Review the rows.
- Click Create draft dates.

## 5) How this patch behaves
- Text-only intake uses the lighter text model.
- Image intake uses the image model.
- Gemini retries temporary 429/503/high-demand failures automatically.
- If fallback is enabled and Gemini still fails, TourBook tries OpenRouter.
- AI output is review-only until you create drafts.

## 6) Best practice on free tiers
- Keep pasted imports reasonably short.
- Use one poster/screenshot at a time.
- If Gemini is busy, wait a minute and retry.
- Keep OpenRouter fallback enabled if you want the smoothest free setup.
