import type { ComponentType } from 'react'
import {
  IoBriefcaseOutline,
  IoCheckmarkDoneOutline,
  IoHomeOutline,
  IoListOutline,
  IoNotificationsOutline,
  IoPersonOutline,
  IoSettingsOutline,
} from 'react-icons/io5'
import type { NavigationIconKey } from '../../lib/navigation'

const ICONS: Record<NavigationIconKey, ComponentType<{ size?: number }>> = {
  home: IoHomeOutline,
  tasks: IoListOutline,
  projects: IoBriefcaseOutline,
  reviews: IoCheckmarkDoneOutline,
  notifications: IoNotificationsOutline,
  me: IoPersonOutline,
  system: IoSettingsOutline,
}

export function NavigationIcon({ iconKey, size = 20 }: { iconKey: NavigationIconKey; size?: number }) {
  const Icon = ICONS[iconKey]
  return <Icon size={size} />
}
