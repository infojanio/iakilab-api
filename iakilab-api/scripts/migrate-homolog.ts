import {spawnSync} from 'node:child_process'
import {loadConfig} from '../src/config.js'
loadConfig({ tolerateInvalidA1: true })
// Only explicit invocation can apply migrations; install/start/build never do so.
const result=spawnSync(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy'],{stdio:'inherit',env:process.env})
process.exitCode=result.status??1
