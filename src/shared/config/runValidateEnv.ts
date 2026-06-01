import { validateEnv } from './validateEnv.js'

// Side-effect module: imported first in the entrypoint so configuration is
// validated before any DB/Redis/queue modules are evaluated.
validateEnv()
