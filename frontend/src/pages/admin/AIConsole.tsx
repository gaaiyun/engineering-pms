
import { useState, useEffect } from 'react'
import { Card, Button, Input, Toast, Tag } from 'antd-mobile'
import { IoSparkles, IoSend, IoChatbubbleEllipsesOutline } from 'react-icons/io5'
import { aggregateProjectData, generateAIReport, chatWithAI } from '../../lib/ai-service'
import { pb } from '../../lib/pocketbase'
import { getLlmConfig, updateLlmConfig, type LlmConfig } from '../../lib/llm-config'

type ProjectStats = Awaited<ReturnType<typeof aggregateProjectData>>

interface AiReport {
    content: string
    risk_level: string
    date: string
    model_used?: string
}

interface ChatMessage {
    role: 'user' | 'assistant'
    content: string
}

const errorMessage = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback

// Reuse the simple parser from AISummaryCard logic for consistency and no extra deps
const MarkdownRenderer = ({ content }: { content: string }) => {
    const renderContent = (text: string) => {
        // Basic cleanup
        const cleanText = text.replace(/^```json\n?/, '').replace(/^```markdown\n?/, '').replace(/^```\n?/, '').replace(/```$/i, '');

        return cleanText.split('\n').map((line, index) => {
            // Headers
            if (line.startsWith('### ')) return <h4 key={index} style={{ margin: '16px 0 8px', color: '#1e293b' }}>{line.replace('### ', '')}</h4>
            if (line.startsWith('## ')) return <h3 key={index} style={{ margin: '20px 0 10px', color: '#0f172a' }}>{line.replace('## ', '')}</h3>

            // Bold
            const parseBold = (l: string) => l.split(/(\*\*.*?\*\*)/).map((p, i) =>
                p.startsWith('**') ? <strong key={i} style={{ color: '#0f172a' }}>{p.slice(2, -2)}</strong> : p
            );

            // Lists
            if (line.trim().startsWith('- ')) return <div key={index} style={{ paddingLeft: 10, marginBottom: 4 }}>• {parseBold(line.replace('- ', ''))}</div>

            // Normal
            if (line.trim() === '') return <div key={index} style={{ height: 8 }}></div>
            return <div key={index} style={{ marginBottom: 4, color: '#475569' }}>{parseBold(line)}</div>
        });
    }
    return <div>{renderContent(content)}</div>
}

const AIConsole = () => {
    const [stats, setStats] = useState<ProjectStats | null>(null)
    const [report, setReport] = useState<AiReport | null>(null)
    const [loading, setLoading] = useState(false)
    const [chatHistory, setChatHistory] = useState<ChatMessage[]>([])
    const [input, setInput] = useState('')
    const [chatLoading, setChatLoading] = useState(false)
    const [selectedModel, setSelectedModel] = useState(localStorage.getItem('ai_model') || 'deepseek-ai/DeepSeek-V3')
    const [llmConfig, setLlmConfig] = useState<LlmConfig | null>(null)
    const [configDraft, setConfigDraft] = useState({ provider: '', base_url: '', default_model: '' })
    const [newApiKey, setNewApiKey] = useState('')
    const [configSaving, setConfigSaving] = useState(false)
    const [debugInfo, setDebugInfo] = useState<string>('')

    useEffect(() => {
        getLlmConfig()
            .then(config => {
                setLlmConfig(config)
                setConfigDraft({
                    provider: config.provider,
                    base_url: config.base_url,
                    default_model: config.default_model,
                })
                setSelectedModel(config.default_model)
                localStorage.setItem('ai_model', config.default_model)
            })
            .catch(error => {
                setDebugInfo(`AI 配置读取失败: ${error.message}`)
            })

        // Load stats
        aggregateProjectData().then(setStats).catch(console.error)

        // 优先从localStorage加载缓存的报告
        const cachedReport = localStorage.getItem('ai_report_cache')
        if (cachedReport) {
            try {
                const parsed = JSON.parse(cachedReport)
                setReport(parsed as AiReport)
            } catch (e) {
                console.warn('解析缓存报告失败', e)
            }
        }

        // 然后尝试从数据库加载最新报告
        const userId = pb.authStore.model?.id
        if (userId) {
            pb.collection('ai_summaries').getList(1, 1, { filter: `target_user="${userId}"`, sort: '-created' })
                .then(res => {
                    if (res.items.length > 0) {
                        setReport(res.items[0] as unknown as AiReport)
                        // 同时更新缓存
                        localStorage.setItem('ai_report_cache', JSON.stringify(res.items[0]))
                    }
                })
                .catch(err => {
                    console.warn('从数据库加载报告失败（可能collection不存在）', err)
                    // 如果数据库失败，使用缓存的报告就可以了
                })
        }

        // Load Chat History
        const savedHistory = localStorage.getItem('ai_chat_history');
        if (savedHistory) {
            try {
                setChatHistory(JSON.parse(savedHistory) as ChatMessage[]);
            } catch {
                // Ignore parse errors - start with empty history
            }
        }
    }, [])

    // Save Chat History
    useEffect(() => {
        localStorage.setItem('ai_chat_history', JSON.stringify(chatHistory));
    }, [chatHistory]);

    const handleSaveConfig = async () => {
        if (!configDraft.provider.trim() || !configDraft.base_url.trim() || !configDraft.default_model.trim()) {
            Toast.show({ icon: 'fail', content: '请完整填写供应商、Base URL 和默认模型' })
            return
        }
        setConfigSaving(true)
        try {
            const saved = await updateLlmConfig({ ...configDraft, api_key: newApiKey })
            setLlmConfig(saved)
            setConfigDraft({
                provider: saved.provider,
                base_url: saved.base_url,
                default_model: saved.default_model,
            })
            setNewApiKey('')
            setSelectedModel(saved.default_model)
            localStorage.setItem('ai_model', saved.default_model)
            setDebugInfo('AI 服务配置已保存')
            Toast.show({ icon: 'success', content: 'AI 服务配置已保存' })
        } catch (error: unknown) {
            const message = errorMessage(error, '配置保存失败')
            setDebugInfo(`AI 配置保存失败: ${message}`)
            Toast.show({ icon: 'fail', content: message })
        } finally {
            setConfigSaving(false)
        }
    }
    
    const handleUpdate = async () => {
        if (!selectedModel.trim()) {
            Toast.show({ icon: 'fail', content: '请先填写调用模型' })
            return
        }
        setLoading(true)
        setDebugInfo('正在聚合数据...')
        
        try {
            const data = await aggregateProjectData()
            setStats(data)
            setDebugInfo(`数据聚合完成。项目: ${data.total_projects}, 任务: ${data.global_stats?.total_tasks || 0}`)

            // Generate Report
            setDebugInfo('正在调用 AI API...')
            const aiRes = await generateAIReport(data, undefined, selectedModel)
            setDebugInfo('AI 响应成功，正在保存...')
            // 构建报告对象
            const reportData = {
                content: aiRes.content,
                risk_level: aiRes.risk_level,
                date: new Date().toISOString(),
                model_used: selectedModel
            }
            
            // 先缓存到localStorage（确保即使数据库失败也能保留）
            localStorage.setItem('ai_report_cache', JSON.stringify(reportData))
            
            // Save to DB - 尝试保存，如果collection不存在则跳过
            const userId = pb.authStore.model?.id
            if (userId && aiRes) {
                try {
                    const saveRes = await pb.collection('ai_summaries').create({
                        target_user: userId,
                        date: new Date().toISOString(),
                        content: aiRes.content,
                        risk_level: aiRes.risk_level,
                        model_used: selectedModel
                    })
                    setReport(saveRes as unknown as AiReport)
                    // 更新缓存
                    localStorage.setItem('ai_report_cache', JSON.stringify(saveRes))
                    setDebugInfo('保存成功！')
                } catch (dbError: unknown) {
                    console.warn('数据库保存失败（可能是collection不存在）:', dbError)
                    // 数据库保存失败，使用本地缓存的报告
                    setReport(reportData)
                    setDebugInfo('报告已缓存到本地')
                }
            } else if (aiRes) {
                // 没有userId，直接显示报告
                setReport(reportData)
            }
            Toast.show({ icon: 'success', content: '分析已更新' })
        } catch (error: unknown) {
            console.error('AI Update Error:', error)
            const message = errorMessage(error, '未知错误')
            setDebugInfo(`错误: ${message}`)
            
            // 更详细的错误提示
            let errorMsg = '更新失败'
            if (message.includes('401')) {
                errorMsg = 'API Key 无效或已过期'
            } else if (message.includes('429')) {
                errorMsg = 'API 请求过于频繁，请稍后再试'
            } else if (message.includes('fetch')) {
                errorMsg = '网络连接失败，请检查网络'
            } else {
                errorMsg = message
            }
            
            Toast.show({ icon: 'fail', content: errorMsg, duration: 3000 })
        } finally {
            setLoading(false)
        }
    }

    const handleSend = async () => {
        if (!input.trim()) return
        if (!selectedModel.trim()) {
            Toast.show({ icon: 'fail', content: '请先填写调用模型' })
            return
        }
        const msg = input
        setInput('')

        const newHistory: ChatMessage[] = [...chatHistory, { role: 'user', content: msg }]
        setChatHistory(newHistory)
        setChatLoading(true)

        try {
            const context = stats || await aggregateProjectData()
            const reply = await chatWithAI(msg, context, newHistory.slice(-10), undefined, selectedModel)
            setChatHistory(prev => [...prev, { role: 'assistant', content: reply }])
        } catch (error: unknown) {
            Toast.show('发送失败')
            setChatHistory(prev => [...prev, { role: 'assistant', content: 'Error: ' + errorMessage(error, '未知错误') }])
        } finally {
            setChatLoading(false)
        }
    }

    const clearHistory = () => {
        setChatHistory([]);
        localStorage.removeItem('ai_chat_history');
        Toast.show('记录已清空');
    }

    return (
        <div style={{ padding: '20px', height: '100%', overflowY: 'auto', background: '#f8fafc' }}>
            <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <div>
                    <h2 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 8px 0', color: '#0f172a' }}>AI 智能决策台</h2>
                    <div style={{ fontSize: 13, color: '#64748b' }}>基于实时数据的全局项目诊断与问答系统</div>
                </div>
                <div style={{ minWidth: 220, flex: '0 1 320px' }}>
                    <div style={{ fontSize: 11, color: '#64748b', marginBottom: 5 }}>本次调用模型</div>
                    <Input
                    value={selectedModel}
                    onChange={value => {
                        setSelectedModel(value)
                        localStorage.setItem('ai_model', value)
                    }}
                    placeholder="例如 glm-5.2"
                    style={{ '--font-size': '13px', background: 'white', border: '1px solid #cbd5e1', borderRadius: 8, padding: '7px 10px' }}
                    />
                </div>
            </div>

            <Card style={{ marginBottom: 16, borderRadius: 16, boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
                    <div>
                        <div style={{ fontWeight: 700, color: '#0f172a' }}>AI 服务设置</div>
                        <div style={{ marginTop: 4, fontSize: 12, color: '#64748b' }}>兼容 OpenAI Chat Completions；密钥只保存在 PocketBase 服务器。</div>
                    </div>
                    <Tag color={llmConfig?.has_api_key ? 'success' : 'warning'}>
                        {llmConfig?.has_api_key ? '密钥已配置' : '尚未配置密钥'}
                    </Tag>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
                    <label style={{ fontSize: 12, color: '#475569' }}>
                        供应商名称
                        <Input value={configDraft.provider} onChange={value => setConfigDraft(prev => ({ ...prev, provider: value }))} placeholder="例如 火山方舟" style={{ marginTop: 5, background: '#f8fafc', borderRadius: 8, padding: '8px 10px' }} />
                    </label>
                    <label style={{ fontSize: 12, color: '#475569' }}>
                        Base URL
                        <Input value={configDraft.base_url} onChange={value => setConfigDraft(prev => ({ ...prev, base_url: value }))} placeholder="https://.../v1" style={{ marginTop: 5, background: '#f8fafc', borderRadius: 8, padding: '8px 10px' }} />
                    </label>
                    <label style={{ fontSize: 12, color: '#475569' }}>
                        默认模型
                        <Input value={configDraft.default_model} onChange={value => setConfigDraft(prev => ({ ...prev, default_model: value }))} placeholder="例如 glm-5.2" style={{ marginTop: 5, background: '#f8fafc', borderRadius: 8, padding: '8px 10px' }} />
                    </label>
                    <label style={{ fontSize: 12, color: '#475569' }}>
                        API Key
                        <Input type="password" value={newApiKey} onChange={setNewApiKey} placeholder={llmConfig?.has_api_key ? '留空则保留现有密钥' : '请输入 API Key'} style={{ marginTop: 5, background: '#f8fafc', borderRadius: 8, padding: '8px 10px' }} />
                    </label>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
                    <Button color="primary" size="small" loading={configSaving} disabled={configSaving} onClick={handleSaveConfig} style={{ borderRadius: 20, padding: '0 18px' }}>
                        保存服务配置
                    </Button>
                </div>
            </Card>

            {/* API状态指示器 */}
            <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 6,
                    padding: '6px 12px',
                    background: '#ECFDF5',
                    borderRadius: 20,
                    fontSize: 12
                }}>
                    <div style={{ 
                        width: 8, 
                        height: 8, 
                        borderRadius: '50%', 
                        background: '#10B981'
                    }}></div>
                    <span style={{ color: '#059669', fontWeight: 500 }}>
                        服务端安全代理
                    </span>
                </div>
                {debugInfo && (
                    <div style={{ fontSize: 11, color: '#64748B', background: '#F1F5F9', padding: '4px 10px', borderRadius: 10 }}>
                        {debugInfo}
                    </div>
                )}
            </div>

            <div style={{ display: 'flex', gap: 16, flexDirection: 'column' }}>
                {/* 1. Report Section */}
                <Card style={{ borderRadius: 16, boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <IoSparkles color="#0ea5e9" size={20} />
                            <span style={{ fontWeight: 700, fontSize: 16 }}>实时诊断报告</span>
                        </div>
                        <Button
                            size='small'
                            fill='outline'
                            disabled={loading}
                            onClick={handleUpdate}
                            style={{ fontSize: 12, borderRadius: 20 }}
                        >
                            {loading ? '分析中...' : '立即更新分析'}
                        </Button>
                    </div>

                    {report ? (
                        <div>
                            <Tag
                                color={report.risk_level === 'high' ? 'danger' : report.risk_level === 'medium' ? 'warning' : 'success'}
                                style={{ marginBottom: 12 }}
                            >
                                风险等级: {report.risk_level === 'high' ? '高危' : report.risk_level === 'medium' ? '风险可控' : '运行平稳'}
                            </Tag>
                            <div style={{ background: '#f1f5f9', padding: 16, borderRadius: 12, fontSize: 14, lineHeight: 1.6 }}>
                                <MarkdownRenderer content={report.content} />
                            </div>
                            <div style={{ textAlign: 'right', fontSize: 10, color: '#94a3b8', marginTop: 8 }}>
                                生成时间: {new Date(report.date).toLocaleString()} | 模型: {report.model_used || 'Unknown'}
                            </div>
                        </div>
                    ) : (
                        <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8' }}>
                            暂无报告，请点击右上角更新
                        </div>
                    )}
                </Card>

                {/* 2. Chat Section */}
                <Card style={{ borderRadius: 16, boxShadow: '0 4px 12px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', height: 500 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, borderBottom: '1px solid #f1f5f9', paddingBottom: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <IoChatbubbleEllipsesOutline color="#3b82f6" size={20} />
                            <span style={{ fontWeight: 700, fontSize: 16 }}>AI 助手问答</span>
                        </div>
                        {chatHistory.length > 0 && (
                            <div style={{ fontSize: 12, color: '#ef4444', cursor: 'pointer' }} onClick={clearHistory}>清空记录</div>
                        )}
                    </div>

                    <div style={{ flex: 1, overflowY: 'auto', marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 12, padding: 4 }}>
                        {chatHistory.length === 0 && (
                            <div style={{ textAlign: 'center', marginTop: 60, color: '#cbd5e1' }}>
                                <div style={{ fontSize: 40 }}>...</div>
                                <div>您可以询问：<br />"哪个团队效率最低？"<br />"赵工长那边有什么卡点？"</div>
                            </div>
                        )}
                        {chatHistory.map((msg, i) => (
                            <div key={i} style={{
                                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                                maxWidth: '85%',
                                background: msg.role === 'user' ? '#1f2937' : '#f1f5f9',
                                color: msg.role === 'user' ? 'white' : '#1e293b',
                                padding: '8px 12px',
                                borderRadius: 12,
                                fontSize: 13,
                                boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                            }}>
                                {msg.role === 'assistant' ? <MarkdownRenderer content={msg.content} /> : msg.content}
                            </div>
                        ))}
                        {chatLoading && <div style={{ alignSelf: 'flex-start', color: '#94a3b8', fontSize: 12 }}>AI 正在思考...</div>}
                    </div>

                    <div style={{ display: 'flex', gap: 8 }}>
                        <Input
                            value={input}
                            onChange={setInput}
                            placeholder="输入您的问题..."
                            onEnterPress={handleSend}
                            style={{ flex: 1, background: '#f8fafc', padding: '8px 12px', borderRadius: 20 }}
                        />
                        <Button color='primary' onClick={handleSend} disabled={chatLoading} style={{ borderRadius: 20, padding: '0 16px' }}>
                            <IoSend />
                        </Button>
                    </div>
                </Card>
            </div>
        </div>
    )
}

export default AIConsole
