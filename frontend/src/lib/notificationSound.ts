/**
 * 通知提示音工具
 * 使用 Web Audio API 生成提示音，无需外部音频文件
 */

let audioCtx: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
    }
    return audioCtx
  } catch {
    return null
  }
}

/**
 * 播放通知提示音（双音调，类似微信/钉钉提示音）
 */
export function playNotificationSound() {
  const ctx = getAudioContext()
  if (!ctx) return

  // 如果 AudioContext 被暂停（浏览器策略），尝试恢复
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {})
  }

  const now = ctx.currentTime

  // 第一个音：C5 (523Hz)
  const osc1 = ctx.createOscillator()
  const gain1 = ctx.createGain()
  osc1.type = 'sine'
  osc1.frequency.setValueAtTime(523, now)
  gain1.gain.setValueAtTime(0.3, now)
  gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.15)
  osc1.connect(gain1)
  gain1.connect(ctx.destination)
  osc1.start(now)
  osc1.stop(now + 0.15)

  // 第二个音：E5 (659Hz)，稍有延迟
  const osc2 = ctx.createOscillator()
  const gain2 = ctx.createGain()
  osc2.type = 'sine'
  osc2.frequency.setValueAtTime(659, now + 0.12)
  gain2.gain.setValueAtTime(0, now)
  gain2.gain.setValueAtTime(0.3, now + 0.12)
  gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.3)
  osc2.connect(gain2)
  gain2.connect(ctx.destination)
  osc2.start(now + 0.12)
  osc2.stop(now + 0.3)

  // 第三个音：G5 (784Hz)，再延迟
  const osc3 = ctx.createOscillator()
  const gain3 = ctx.createGain()
  osc3.type = 'sine'
  osc3.frequency.setValueAtTime(784, now + 0.25)
  gain3.gain.setValueAtTime(0, now)
  gain3.gain.setValueAtTime(0.25, now + 0.25)
  gain3.gain.exponentialRampToValueAtTime(0.01, now + 0.5)
  osc3.connect(gain3)
  gain3.connect(ctx.destination)
  osc3.start(now + 0.25)
  osc3.stop(now + 0.5)
}

/**
 * 预热 AudioContext（需要在用户交互后调用一次）
 */
export function warmUpAudio() {
  const ctx = getAudioContext()
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => {})
  }
}
