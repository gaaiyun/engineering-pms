/**
 * postinstall 脚本：为 react-dom 注入 React 19 兼容 polyfill
 * antd-mobile v5 的 Toast/Dialog 命令式 API 依赖 unmountComponentAtNode 和 render，
 * 这两个 API 在 React 19 中已被移除。此脚本在 CJS 层面注入 polyfill，
 * 确保 Vite 预打包后 antd-mobile 也能正常工作。
 */
const fs = require('fs');
const path = require('path');

const MARKER = '/* __REACT19_COMPAT_PATCHED__ */';

const PATCH = `
${MARKER}
;(function() {
  var m = module.exports;
  if (m && typeof m.unmountComponentAtNode !== 'function') {
    var _cache = new WeakMap();
    m.unmountComponentAtNode = function(container) {
      var root = _cache.get(container);
      if (root) { root.unmount(); _cache.delete(container); }
      return true;
    };
    m.render = function(element, container) {
      var rdc = require('react-dom/client');
      var root = _cache.get(container);
      if (!root) { root = rdc.createRoot(container); _cache.set(container, root); }
      root.render(element);
    };
  }
})();
`;

const targetFile = path.resolve(__dirname, '../node_modules/react-dom/index.js');

if (!fs.existsSync(targetFile)) {
  console.log('[react19-compat] react-dom not found, skipping');
  process.exit(0);
}

const content = fs.readFileSync(targetFile, 'utf8');

if (content.includes(MARKER)) {
  console.log('[react19-compat] already patched');
  process.exit(0);
}

fs.writeFileSync(targetFile, content + '\n' + PATCH);
console.log('[react19-compat] patched react-dom/index.js successfully');
