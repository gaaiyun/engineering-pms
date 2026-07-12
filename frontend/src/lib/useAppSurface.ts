import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { resolveAppSurface, type AppSurface } from './navigation'

const COARSE_POINTER_QUERY = '(pointer: coarse)'

function detectSurface(): AppSurface {
  if (typeof window === 'undefined') return 'compact'

  return resolveAppSurface({
    width: window.innerWidth,
    isNative: Capacitor.isNativePlatform(),
    pointerCoarse: typeof window.matchMedia === 'function'
      ? window.matchMedia(COARSE_POINTER_QUERY).matches
      : false,
  })
}

export function useAppSurface(): AppSurface {
  const [surface, setSurface] = useState<AppSurface>(detectSurface)

  useEffect(() => {
    const pointer = typeof window.matchMedia === 'function'
      ? window.matchMedia(COARSE_POINTER_QUERY)
      : null
    const update = () => setSurface(detectSurface())

    window.addEventListener('resize', update)
    pointer?.addEventListener('change', update)
    return () => {
      window.removeEventListener('resize', update)
      pointer?.removeEventListener('change', update)
    }
  }, [])

  return surface
}
