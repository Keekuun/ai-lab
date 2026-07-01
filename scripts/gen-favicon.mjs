import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import sharp from 'sharp'
import toIco from 'to-ico'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = join(root, 'docs/public')
const svg = readFileSync(join(publicDir, 'logo.svg'))

const sizes = [16, 32, 180]
const [png16, png32, png180] = await Promise.all(
  sizes.map((size) => sharp(svg).resize(size, size).png().toBuffer()),
)

writeFileSync(join(publicDir, 'favicon.ico'), await toIco([png16, png32]))
writeFileSync(join(publicDir, 'apple-touch-icon.png'), png180)
console.log('Generated favicon.ico and apple-touch-icon.png')
