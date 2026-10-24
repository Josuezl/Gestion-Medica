/**
 * prebuild: escribe public/version.json con el commit del build (VERCEL_GIT_COMMIT_SHA).
 * Carga los .env* igual que Next (loadEnvConfig) para que el archivo y el bundle
 * (NEXT_PUBLIC_APP_VERSION en next.config.ts) salgan siempre de la misma variable.
 */
import { writeFileSync } from 'node:fs'
import nextEnv from '@next/env'
import { versionFileContent } from '../utils/appVersion.ts'

nextEnv.loadEnvConfig(process.cwd())
const contenido = versionFileContent(process.env.VERCEL_GIT_COMMIT_SHA)
writeFileSync(new URL('../public/version.json', import.meta.url), contenido)
console.log(`public/version.json → ${contenido}`)
