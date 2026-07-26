# Required Environment Variables

| Variable | Required | Description |
|---|---|---|
| ARIA_SESSION_SECRET | Yes (min 32 chars) | HMAC signing key for session tokens |
| ARIA_PERSISTENCE_DIR | Yes | Writable path on EBS volume for local persistence |
| ARIA_KV_REST_URL | Yes (production) | Upstash KV REST endpoint for durable sessions/quota |
| ARIA_KV_REST_TOKEN | Yes (production) | Upstash KV REST auth token |
| ARIA_CREDENTIAL_ENCRYPTION_KEY | Yes (production) | Preferred AES-256-GCM key for encrypted credential storage. `ARIA_CREDENTIAL_KEY` remains a legacy alias. |
| GEMINI_API_KEY_V2 | Yes | Google Gemini API key for current platform intelligence and orchestration |
| ELEVENLABS_API_KEY | Yes | ElevenLabs API key for ARIA live voice, narration, and TTS |
| ARIAVOICE | No (default: public stock voice `21m00Tcm4TlvDq8ikWAM`) | ElevenLabs voice id for ARIA live voice. Aria's own voice is a private cloned voice and is not shipped; set your own id here. |
| ELEVENLABS_TTS_MODEL | No (default: `eleven_flash_v2_5`) | Low-latency ElevenLabs Flash v2.5 model for main-platform narration |
| ELEVENLABS_CONVERSATION_MODEL | No (default: `eleven_flash_v2_5`) | Ultra-low-latency model used for interactive two-way speech |
| ELEVENLABS_EXPRESSIVE_MODEL | No (default: `eleven_v3`) | Opt-in expressive model for non-interactive content |
| ELEVENLABS_OUTPUT_FORMAT | No (default: `mp3_44100_64`) | Streamed speech output format |
| ARIA_VOICE_WARMUP | No (default: `true`) | Preload local Whisper after server startup |
| ARIA_PORT | No (default: 5000) | Port the Node server listens on |
| ARIA_AUTHZ_ENFORCE | Yes (production) | Set to 1 in production — never bypass authorization |
| ARIA_USE_SECRETS_MANAGER | No | Set to true to use AWS Secrets Manager for credentials |

## Development Setup

```
cp .env.development .env.local
npm install
npm run dev
```

Never commit real secrets. All production values are injected via EB environment variables.
