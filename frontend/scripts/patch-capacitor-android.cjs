const fs = require('fs')
const path = require('path')

const targetFile = path.resolve(__dirname, '../node_modules/@capacitor/android/capacitor/src/main/java/com/getcapacitor/CapConfig.java')
const original = 'private String hostname = "localhost";'
const replacement = 'private String hostname = "app.local";'

if (!fs.existsSync(targetFile)) {
  console.log('[capacitor-hostname] @capacitor/android source not found, skipping')
  process.exit(0)
}

const content = fs.readFileSync(targetFile, 'utf8')
if (content.includes(original)) {
  const patched = content.split(original).join(replacement)
  fs.writeFileSync(targetFile, patched)
  console.log('[capacitor-hostname] replaced Android WebView default hostname')
} else if (content.includes(replacement)) {
  console.log('[capacitor-hostname] already patched')
} else {
  throw new Error('[capacitor-hostname] unexpected CapConfig.java layout')
}
