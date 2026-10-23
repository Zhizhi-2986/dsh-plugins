import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register('./test/css-loader.mjs', pathToFileURL('./'))
