import React from 'react'

export const SkeletonCard: React.FC = () => {
    return (
        <div className="elevated-card breathe" style={{
            background: 'var(--neutral-100)',
            minHeight: 100,
            borderRadius: 'var(--radius-lg)'
        }}>
            <div style={{
                width: '60%',
                height: 20,
                background: 'var(--neutral-200)',
                borderRadius: 4,
                marginBottom: 12
            }}></div>
            <div style={{
                width: '40%',
                height: 14,
                background: 'var(--neutral-200)',
                borderRadius: 4,
                marginBottom: 8
            }}></div>
            <div style={{
                width: '80%',
                height: 14,
                background: 'var(--neutral-200)',
                borderRadius: 4
            }}></div>
        </div>
    )
}

export const SkeletonList: React.FC<{ count?: number }> = ({ count = 3 }) => {
    return (
        <>
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="breathe" style={{
                    display: 'flex',
                    gap: 12,
                    padding: '16px 0',
                    borderBottom: '1px solid var(--neutral-100)'
                }}>
                    <div style={{
                        width: 48,
                        height: 48,
                        borderRadius: '50%',
                        background: 'var(--neutral-200)',
                        flexShrink: 0
                    }}></div>
                    <div style={{ flex: 1 }}>
                        <div style={{
                            width: '60%',
                            height: 16,
                            background: 'var(--neutral-200)',
                            borderRadius: 4,
                            marginBottom: 8
                        }}></div>
                        <div style={{
                            width: '40%',
                            height: 12,
                            background: 'var(--neutral-200)',
                            borderRadius: 4
                        }}></div>
                    </div>
                </div>
            ))}
        </>
    )
}

export const SkeletonProfile: React.FC = () => {
    return (
        <div className="holographic-card breathe" style={{
            padding: 32,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center'
        }}>
            <div style={{
                width: 88,
                height: 88,
                borderRadius: '50%',
                background: 'var(--neutral-200)',
                marginBottom: 16
            }}></div>
            <div style={{
                width: 120,
                height: 20,
                background: 'var(--neutral-200)',
                borderRadius: 4,
                marginBottom: 8
            }}></div>
            <div style={{
                width: 80,
                height: 14,
                background: 'var(--neutral-200)',
                borderRadius: 4
            }}></div>
        </div>
    )
}

export const SkeletonTimeline: React.FC = () => {
    return (
        <div className="breathe" style={{ padding: '20px 0' }}>
            {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} style={{
                    display: 'flex',
                    gap: 16,
                    marginBottom: 24,
                    position: 'relative'
                }}>
                    <div style={{
                        width: 16,
                        height: 16,
                        borderRadius: '50%',
                        background: 'var(--neutral-200)',
                        flexShrink: 0
                    }}></div>
                    <div style={{ flex: 1 }}>
                        <div style={{
                            width: '70%',
                            height: 16,
                            background: 'var(--neutral-200)',
                            borderRadius: 4,
                            marginBottom: 8
                        }}></div>
                        <div style={{
                            width: '40%',
                            height: 12,
                            background: 'var(--neutral-200)',
                            borderRadius: 4
                        }}></div>
                    </div>
                </div>
            ))}
        </div>
    )
}
