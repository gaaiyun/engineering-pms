/**
 * 预设头像选项 - 5 组专业风格，每组 20 个，共 100 个
 * 使用 DiceBear v9.x API（免费、无需认证）
 *
 * 风格说明：
 *  1. initials      — 字母头像，企业级风格（类似 Slack/Teams）
 *  2. micah          — 现代简约人像，干净专业
 *  3. bottts-neutral — 科技机器人风格，现代感强
 *  4. glass          — 玻璃质感抽象图案，高端大气
 *  5. shapes         — 几何图案，简洁专业
 */

const BASE = 'https://api.dicebear.com/9.x'

// 专业配色方案
const PRO_BG = [
  '0ea5e9', '6366f1', '8b5cf6', 'ec4899', 'f97316',
  '14b8a6', '3b82f6', 'a855f7', 'ef4444', '22c55e',
  '0891b2', '7c3aed', 'e11d48', 'f59e0b', '06b6d4',
  '2563eb', '9333ea', 'dc2626', '16a34a', 'ea580c'
]

function url(style: string, seed: string, idx: number, extra = '') {
  return `${BASE}/${style}/svg?seed=${seed}&backgroundColor=${PRO_BG[idx % PRO_BG.length]}&radius=50${extra}`
}

// ---- 风格 1: Initials（字母头像 - 最专业）----
const INITIALS_SEEDS = [
  'ZhangWei', 'LiMing', 'WangFang', 'LiuYang', 'ChenXi',
  'ZhaoLei', 'SunQian', 'ZhouJie', 'HuangPeng', 'WuDan',
  'XuJun', 'LinHai', 'YangMing', 'HeJia', 'GuoFei',
  'MaLin', 'DengChao', 'XieNa', 'HanMei', 'TangYun'
]
export const STYLE_INITIALS = INITIALS_SEEDS.map((s, i) =>
  url('initials', s, i, '&fontSize=40&fontWeight=600')
)

// ---- 风格 2: Micah（现代简约人像）----
const MICAH_SEEDS = [
  'pm_alice', 'pm_bob', 'pm_carol', 'pm_david', 'pm_emma',
  'pm_frank', 'pm_grace', 'pm_henry', 'pm_iris', 'pm_jack',
  'pm_kate', 'pm_leo', 'pm_mia', 'pm_noah', 'pm_olivia',
  'pm_peter', 'pm_quinn', 'pm_rose', 'pm_sam', 'pm_tina'
]
export const STYLE_MICAH = MICAH_SEEDS.map((s, i) => url('micah', s, i))

// ---- 风格 3: Bottts Neutral（科技风格）----
const BOTTTS_SEEDS = [
  'tech_alpha', 'tech_beta', 'tech_gamma', 'tech_delta', 'tech_epsilon',
  'tech_zeta', 'tech_eta', 'tech_theta', 'tech_iota', 'tech_kappa',
  'tech_lambda', 'tech_mu', 'tech_nu', 'tech_xi', 'tech_omicron',
  'tech_pi', 'tech_rho', 'tech_sigma', 'tech_tau', 'tech_upsilon'
]
export const STYLE_BOTTTS = BOTTTS_SEEDS.map((s, i) => url('bottts-neutral', s, i))

// ---- 风格 4: Glass（玻璃质感）----
const GLASS_SEEDS = [
  'glass_ruby', 'glass_sapphire', 'glass_emerald', 'glass_amber', 'glass_topaz',
  'glass_pearl', 'glass_opal', 'glass_jade', 'glass_onyx', 'glass_coral',
  'glass_ivory', 'glass_azure', 'glass_crimson', 'glass_violet', 'glass_indigo',
  'glass_teal', 'glass_bronze', 'glass_silver', 'glass_gold', 'glass_platinum'
]
export const STYLE_GLASS = GLASS_SEEDS.map((s, i) => url('glass', s, i))

// ---- 风格 5: Shapes（几何图案）----
const SHAPES_SEEDS = [
  'geo_circle', 'geo_square', 'geo_triangle', 'geo_diamond', 'geo_hexagon',
  'geo_star', 'geo_cross', 'geo_arrow', 'geo_wave', 'geo_spiral',
  'geo_grid', 'geo_dot', 'geo_line', 'geo_arc', 'geo_ring',
  'geo_prism', 'geo_cube', 'geo_sphere', 'geo_cone', 'geo_pyramid'
]
export const STYLE_SHAPES = SHAPES_SEEDS.map((s, i) => url('shapes', s, i))

/** 所有风格分组 */
export const AVATAR_STYLE_GROUPS = [
  { key: 'initials', label: '字母头像', avatars: STYLE_INITIALS },
  { key: 'micah', label: '现代人像', avatars: STYLE_MICAH },
  { key: 'bottts', label: '科技风格', avatars: STYLE_BOTTTS },
  { key: 'glass', label: '玻璃质感', avatars: STYLE_GLASS },
  { key: 'shapes', label: '几何图案', avatars: STYLE_SHAPES },
] as const

/** 向后兼容：默认导出全部 100 个头像（扁平数组） */
export const AVATAR_OPTIONS = AVATAR_STYLE_GROUPS.flatMap(g => g.avatars)
