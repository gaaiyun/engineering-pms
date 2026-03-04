import React from 'react'

interface EmptyStateProps {
    icon?: React.ReactNode
    title: string
    description?: string
    actionText?: string
    onAction?: () => void
}

export const EmptyState: React.FC<EmptyStateProps> = ({
    icon,
    title,
    description,
    actionText,
    onAction
}) => {
    return (
        <div className="fade-in-up" style={{
            textAlign: 'center',
            padding: '60px 40px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 16
        }}>
            {/* Icon or Illustration */}
            {icon && (
                <div style={{
                    fontSize: 64,
                    marginBottom: 8,
                    opacity: 0.6
                }}>
                    {icon}
                </div>
            )}

            {/* Title */}
            <div style={{
                fontSize: 18,
                fontWeight: 700,
                color: 'var(--neutral-800)',
                marginBottom: 4
            }}>
                {title}
            </div>

            {/* Description */}
            {description && (
                <div style={{
                    fontSize: 14,
                    color: 'var(--neutral-500)',
                    lineHeight: 1.5,
                    maxWidth: 280
                }}>
                    {description}
                </div>
            )}

            {/* Action Button */}
            {actionText && onAction && (
                <button
                    onClick={onAction}
                    style={{
                        marginTop: 16,
                        background: 'var(--accent-gradient)',
                        color: 'white',
                        border: 'none',
                        borderRadius: 'var(--radius-md)',
                        padding: '12px 24px',
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: 'pointer',
                        boxShadow: 'var(--shadow-accent)',
                        transition: 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)'
                    }}
                >
                    {actionText}
                </button>
            )}
        </div>
    )
}

// Preset Empty States
export const EmptyTasks: React.FC<{ onAction?: () => void }> = ({ onAction }) => (
    <EmptyState
        icon="--"
        title="还没有任务"
        description="创建第一个任务，开始高效的项目管理之旅"
        actionText="创建任务"
        onAction={onAction}
    />
)

export const EmptyProjects: React.FC<{ onAction?: () => void }> = ({ onAction }) => (
    <EmptyState
        icon="📁"
        title="暂无项目"
        description="开始您的第一个项目，让团队协作更加顺畅"
        actionText="新建项目"
        onAction={onAction}
    />
)

export const EmptyNotifications: React.FC = () => (
    <EmptyState
        icon="--"
        title="暂无通知"
        description="您的所有通知将显示在这里"
    />
)
