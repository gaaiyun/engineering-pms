/**
 * 预设头像选项 - 5 组风格，每组 8 个，共 40 个
 * 使用 DiceBear v9.x API（免费、无需认证）
 *
 * 风格说明：
 *  1. notionists-neutral  — Notion 风格简笔画，干净专业
 *  2. lorelei-neutral     — 优雅线条人像，偏文艺
 *  3. adventurer-neutral  — 扁平插画人像，活泼但不失正式
 *  4. open-peeps          — 手绘线稿风，流行且百搭
 *  5. avataaars-neutral   — 经典卡通人像，辨识度高
 */

const BASE = 'https://api.dicebear.com/9.x'

// 柔和背景色
const BG = ['b6e3f4', 'c0aede', 'd1d4f9', 'ffd5dc', 'ffdfbf', 'e8f5e9', 'fff3e0', 'f3e5f5']

function url(style: string, seed: string, idx: number) {
  return `${BASE}/${style}/svg?seed=${seed}&backgroundColor=${BG[idx % BG.length]}&radius=50`
}

// ---- 风格 1: Notionists Neutral（Notion 简笔画）----
const NOTIONISTS_SEEDS = ['engineer1', 'manager2', 'designer3', 'analyst4', 'leader5', 'planner6', 'builder7', 'inspector8']
export const STYLE_NOTIONISTS = NOTIONISTS_SEEDS.map((s, i) => url('notionists-neutral', s, i))

// ---- 风格 2: Lorelei Neutral（优雅线条）----
const LORELEI_SEEDS = ['zhangwei', 'liming', 'wangfang', 'liuyang', 'chenxi', 'zhaolei', 'sunqian', 'zhoujie']
export const STYLE_LORELEI = LORELEI_SEEDS.map((s, i) => url('lorelei-neutral', s, i))

// ---- 风格 3: Adventurer Neutral（扁平插画）----
const ADV_SEEDS = ['project_a', 'project_b', 'project_c', 'project_d', 'project_e', 'project_f', 'project_g', 'project_h']
export const STYLE_ADVENTURER = ADV_SEEDS.map((s, i) => url('adventurer-neutral', s, i))

// ---- 风格 4: Open Peeps（手绘线稿）----
const PEEPS_SEEDS = ['zhugong1', 'jianli2', 'caiwu3', 'jishu4', 'anquan5', 'sheji6', 'zongjian7', 'xiangmu8']
export const STYLE_OPEN_PEEPS = PEEPS_SEEDS.map((s, i) => url('open-peeps', s, i))

// ---- 风格 5: Avataaars Neutral（经典卡通）----
const AVATAAARS_SEEDS = ['zhangsan', 'lisi', 'wangwu', 'zhaoliu', 'qianqi', 'sunba', 'zhoujiu', 'wushi']
export const STYLE_AVATAAARS = AVATAAARS_SEEDS.map((s, i) => url('avataaars-neutral', s, i))

/** 所有风格分组 */
export const AVATAR_STYLE_GROUPS = [
  { key: 'notionists', label: '简约线条', avatars: STYLE_NOTIONISTS },
  { key: 'lorelei', label: '优雅人像', avatars: STYLE_LORELEI },
  { key: 'adventurer', label: '扁平插画', avatars: STYLE_ADVENTURER },
  { key: 'openpeeps', label: '手绘线稿', avatars: STYLE_OPEN_PEEPS },
  { key: 'avataaars', label: '经典卡通', avatars: STYLE_AVATAAARS },
] as const

/** 向后兼容：默认导出全部 40 个头像（扁平数组） */
export const AVATAR_OPTIONS = AVATAR_STYLE_GROUPS.flatMap(g => g.avatars)
