import { Card, Tag } from 'antd-mobile'
import { motion } from 'framer-motion'
import { IoSparkles, IoAnalytics } from 'react-icons/io5'
import type { AISummary } from '../../lib/api'
import dayjs from 'dayjs'

interface Props {
    summary: AISummary
}

export function AISummaryCard({ summary }: Props) {
    const isHighRisk = summary.risk_level === 'high'
    const isMediumRisk = summary.risk_level === 'medium'

    // Simple markdown parser for headers and bold
    const renderContent = (content: string) => {
        const parseBold = (text: string) => {
            return text.split(/(\*\*.*?\*\*)/g).map((part, i) => {
                if (part.startsWith('**') && part.endsWith('**')) {
                    return <strong key={i} style={{ color: '#0f172a' }}>{part.slice(2, -2)}</strong>
                }
                return part
            })
        }

        return content.split('\n').map((line, index) => {
            if (line.trim() === '') return <div key={index} style={{ height: 8 }} />

            if (line.startsWith('## ') || line.startsWith('### ')) {
                const text = line.replace(/^#+\s/, '')
                return <h4 key={index} style={{ margin: '16px 0 8px', color: '#1e293b', fontSize: 15 }}>{text}</h4>
            }
            if (line.trim().startsWith('- ')) {
                return <li key={index} style={{ listStyle: 'none', marginLeft: 0, paddingLeft: 14, position: 'relative', marginBottom: 4 }}>
                    <span style={{ position: 'absolute', left: 0, top: 8, width: 4, height: 4, borderRadius: '50%', background: '#94a3b8' }} />
                    {parseBold(line.replace('- ', ''))}
                </li>
            }
            // Handle numeric lists "1. "
            if (/^\d+\.\s/.test(line)) {
                return <div key={index} style={{ marginBottom: 4, paddingLeft: 4 }}>
                    {parseBold(line)}
                </div>
            }

            return <p key={index} style={{ margin: '4px 0', lineHeight: 1.6, color: '#475569' }}>{parseBold(line)}</p>
        })
    }

    // Clean content (remove markdown code blocks if present)
    const cleanContent = summary.content.replace(/^```markdown\n?/i, '').replace(/^```\n?/i, '').replace(/```$/i, '')

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
        >
            <Card style={{
                borderRadius: 16,
                background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
                border: '1px solid rgba(255, 255, 255, 0.6)',
                boxShadow: '0 8px 32px rgba(14, 165, 233, 0.1)',
                overflow: 'hidden',
                position: 'relative'
            }}>
                {/* Background Decor */}
                <div style={{ position: 'absolute', top: -20, right: -20, opacity: 0.1 }}>
                    <IoSparkles size={120} color="#0ea5e9" />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                            width: 36, height: 36, borderRadius: 10,
                            background: '#0ea5e9', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#fff', boxShadow: '0 4px 12px rgba(14, 165, 233, 0.3)'
                        }}>
                            <IoSparkles size={20} />
                        </div>
                        <div>
                            <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>AI 智能决策简报</div>
                            <div style={{ fontSize: 11, color: '#64748b' }}>
                                全局监控 · {dayjs(summary.date).format('MM/DD HH:mm')}
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8 }}>
                        <Tag
                            color={isHighRisk ? '#fee2e2' : isMediumRisk ? '#ffedd5' : '#dcfce7'}
                            style={{
                                color: isHighRisk ? '#b91c1c' : isMediumRisk ? '#c2410c' : '#15803d',
                                fontWeight: 600, border: 'none', padding: '4px 8px'
                            }}
                        >
                            {isHighRisk ? '高风险' : isMediumRisk ? '风险可控' : '运行平稳'}
                        </Tag>
                    </div>
                </div>

                <div style={{
                    background: 'rgba(255,255,255,0.7)',
                    borderRadius: 16,
                    padding: '16px',
                    fontSize: 14,
                    backdropFilter: 'blur(12px)',
                    border: '1px solid rgba(255,255,255,0.5)',
                    boxShadow: 'inset 0 0 20px rgba(255,255,255,0.5)'
                }}>
                    {renderContent(cleanContent)}
                </div>

                <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button
                            onClick={() => alert('请在服务器运行: node scripts/generate-ai-summary.mjs 以获取最新数据')}
                            style={{
                                background: 'white', border: '1px solid #e2e8f0', borderRadius: 20,
                                padding: '4px 12px', fontSize: 11, color: '#64748b',
                                display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer'
                            }}
                        >
                            🔄 更新数据
                        </button>
                        <button
                            onClick={() => alert('AI 问答功能开发中... (Connect to DeepSeek API)')}
                            style={{
                                background: 'white', border: '1px solid #e2e8f0', borderRadius: 20,
                                padding: '4px 12px', fontSize: 11, color: '#0ea5e9', fontWeight: 600,
                                display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer'
                            }}
                        >
                            💬 向 AI 提问
                        </button>
                    </div>
                    <span style={{ fontSize: 10, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 4 }}>
                        Powered by DeepSeek-V3.2 <IoAnalytics />
                    </span>
                </div>
            </Card>
        </motion.div>
    )
}
