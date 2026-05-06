import Koa from 'koa'
import { bodyParser } from '@koa/bodyparser'
import { initAllTables } from './db/index'
import { router } from './routes/index'
import { initConfig, serverConfig } from './utils/config'

const app = new Koa()

initConfig()
initAllTables()

app.use(bodyParser())
app.use(router.routes())
app.use(router.allowedMethods())

app.listen(serverConfig.port, serverConfig.host, () => {
  console.log(`server listening on http://${serverConfig.host}:${serverConfig.port}`)
})
