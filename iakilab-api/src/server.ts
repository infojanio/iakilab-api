import {loadConfig} from './config.js'
import {buildApp} from './app.js'
import {makeServices} from './use-cases/_factories/make-services.js'
import {prisma} from './lib/prisma.js'
const config=loadConfig()
const app=await buildApp(config,await makeServices(config),true)
app.addHook('onClose',async()=>{await prisma.$disconnect()})
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{void app.close()})
await app.listen({host:process.env.HOST??'0.0.0.0',port:Number(process.env.PORT??3333)})
