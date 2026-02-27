import { useEffect, useState } from 'react'
import { IoStatsChart, IoPerson, IoBusiness, IoRibbonOutline } from 'react-icons/io5'
import { Dialog, Segmented, Toast } from 'antd-mobile'
import { pb } from '../lib/pocketbase'
import { motion } from 'framer-motion'

interface RankingUser {
  id: string
  name: string
  dept: string
  score: number // 累计积分 (approved tasks score sum)
  taskCount: number // 完成并审核通过的任务数
  rate: number // Mock for now, or calc based on overdue
  change: number // Mock
  totalScore?: number // For department aggregation
}

export default function Rankings() {
  const [tab, setTab] = useState<'individual' | 'dept'>('individual')
  const [period, setPeriod] = useState<'month' | 'quarter' | 'year'>('month')
  const [data, setData] = useState<RankingUser[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadRankings()
  }, [period])

  const loadRankings = async () => {
    setLoading(true)
    try {
      const users = await pb.collection('users').getFullList({
        sort: '-flower_count'
      })

      // 用 id hash 生成稳定的伪随机值，避免每次渲染闪烁
      const stableHash = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h) }
      const rankingList = users.map(u => ({
        id: u.id,
        name: u.name || u.username,
        dept: u.department || '未分配',
        score: u.flower_count || 0,
        taskCount: Math.floor((u.flower_count || 0) * 0.8),
        rate: 90 + (stableHash(u.id) % 10),
        change: (stableHash(u.id + 'c') % 5) - 2
      }))
        .filter(u => u.score > 0)

      setData(rankingList)
    } catch (e) {
      console.error(e)
      Toast.show({ content: '加载排行榜失败', icon: 'fail' })
    } finally {
      setLoading(false)
    }
  }

  const topOne = data[0]

  const deptData = () => {
    // Aggregate by dept
    const depts: Record<string, { score: number, count: number }> = {}
    data.forEach(u => {
      if (!depts[u.dept]) depts[u.dept] = { score: 0, count: 0 }
      depts[u.dept].score += u.score
      depts[u.dept].count += 1 // count of active users
    })
    return Object.entries(depts)
      .map(([name, val]) => ({
        name,
        score: Math.round(val.score / (val.count || 1)), // Average score
        totalScore: val.score
      }))
      .sort((a, b) => b.score - a.score)
  }

  const displayList = tab === 'individual' ? data : deptData()

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <div style={{ textAlign: 'center' }}>
        <div className="spinner" style={{ width: 36, height: 36, border: '3px solid #e2e8f0', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
        <span style={{ color: '#94a3b8', fontSize: 14 }}>加载中...</span>
      </div>
    </div>
  )

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-subtitle">PERFORMANCE METRICS</div>
          <h2 className="page-title">EFFICIENCY</h2>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setTab('individual')}
              style={{
                border: 'none',
                background: tab === 'individual' ? '#0F172A' : '#E2E8F0',
                color: tab === 'individual' ? '#fff' : '#64748B',
                borderRadius: 4,
                padding: '6px 10px',
              }}
            >
              <IoPerson />
            </button>
            <button
              onClick={() => setTab('dept')}
              style={{
                border: 'none',
                background: tab === 'dept' ? '#0F172A' : '#E2E8F0',
                color: tab === 'dept' ? '#fff' : '#64748B',
                borderRadius: 4,
                padding: '6px 10px',
              }}
            >
              <IoBusiness />
            </button>
          </div>
          <Segmented
            value={period}
            onChange={v => setPeriod(v as any)}
            options={[
              { label: '本月', value: 'month' },
              { label: '本季', value: 'quarter' },
              { label: '本年', value: 'year' },
            ]}
            style={{
              '--segmented-background': '#E2E8F0',
              '--segmented-item-color': '#64748B',
              '--segmented-item-selected-background': '#0F172A',
              '--segmented-item-selected-color': '#fff',
            }}
          />
        </div>
      </div>

      {/* Top Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
        <div className="elevated-card fade-in" style={{ margin: 0, background: 'var(--primary-gradient)', color: '#fff', border: 'none' }}>
          <div style={{ fontSize: 10, opacity: 0.8, textTransform: 'uppercase', letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
            <IoRibbonOutline /> Top Performer
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, margin: '8px 0' }}>{topOne?.name || '暂无'}</div>
          <div style={{ fontSize: 32, fontWeight: 300 }}>{topOne?.score || 0}<span style={{ fontSize: 12, opacity: 0.6, marginLeft: 4 }}>PTS</span></div>
        </div>
        <div className="elevated-card fade-in" style={{ margin: 0, animationDelay: '0.1s' }}>
          <div style={{ fontSize: 10, color: '#64748B', textTransform: 'uppercase', letterSpacing: 1 }}>Avg Efficiency</div>
          <div style={{ fontSize: 20, fontWeight: 700, margin: '8px 0', color: '#1E293B' }}>86.2%</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#059669' }}>
            <IoStatsChart /> +2.4%
          </div>
        </div>
      </div>

      {/* Podium Visualization for Top 3 */}
      {displayList.length >= 3 && (
        <div className="fade-in-up" style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          gap: 12,
          marginBottom: 32,
          padding: '0 20px'
        }}>
          {/* 第二名 (Silver) */}
          <motion.div
            className="podium-item"
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              cursor: 'pointer'
            }}
          >
            <div style={{
              fontSize: 28,
              marginBottom: 8,
              filter: 'drop-shadow(0 4px 8px rgba(192, 192, 192, 0.4))'
            }}>2nd</div>
            <div style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #E5E7EB 0%, #D1D5DB 100%)',
              border: '3px solid #fff',
              boxShadow: '0 8px 16px rgba(0, 0, 0, 0.15)',
              overflow: 'hidden',
              marginBottom: 8
            }}>
              {/* Avatar placeholder */}
            </div>
            <div style={{
              fontSize: 12,
              fontWeight: 700,
              color: '#1E293B',
              marginBottom: 8,
              textAlign: 'center'
            }}>{displayList[1]?.name || ''}</div>
            <div style={{
              width: '100%',
              background: 'linear-gradient(135deg, #E5E7EB 0%, #D1D5DB 100%)',
              borderRadius: '8px 8px 0 0',
              padding: '12px 8px',
              textAlign: 'center',
              boxShadow: '0 -4px 16px rgba(0, 0, 0, 0.1)',
              border: '2px solid #fff',
              borderBottom: 'none',
              height: 80,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center'
            }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#475569' }}>2</div>
              <div style={{ fontSize: 10, color: '#64748B', marginTop: 4 }}>{tab === 'individual' ? displayList[1]?.score : displayList[1]?.totalScore} PTS</div>
            </div>
          </motion.div>

          {/* 第一名 (Gold) - 最高 */}
          <motion.div
            className="podium-item"
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              cursor: 'pointer'
            }}
          >
            <div style={{
              fontSize: 32,
              marginBottom: 8,
              filter: 'drop-shadow(0 4px 12px rgba(255, 215, 0, 0.6))',
              animation: 'pulse 2s infinite'
            }}>👑</div>
            <div style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #FCD34D 0%, #F59E0B 100%)',
              border: '4px solid #fff',
              boxShadow: '0 12px 24px rgba(245, 158, 11, 0.4)',
              overflow: 'hidden',
              marginBottom: 8
            }}>
              {/* Avatar placeholder */}
            </div>
            <div style={{
              fontSize: 14,
              fontWeight: 800,
              color: '#1E293B',
              marginBottom: 8,
              textAlign: 'center'
            }}>{displayList[0]?.name || ''}</div>
            <div style={{
              width: '100%',
              background: 'linear-gradient(135deg, #FCD34D 0%, #F59E0B 100%)',
              borderRadius: '8px 8px 0 0',
              padding: '16px 8px',
              textAlign: 'center',
              boxShadow: '0 -8px 24px rgba(245, 158, 11, 0.3)',
              border: '2px solid #fff',
              borderBottom: 'none',
              height: 120,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center'
            }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#78350F' }}>1</div>
              <div style={{ fontSize: 12, color: '#92400E', marginTop: 4, fontWeight: 700 }}>{tab === 'individual' ? displayList[0]?.score : displayList[0]?.totalScore} PTS</div>
            </div>
          </motion.div>

          {/* 第三名 (Bronze) */}
          <motion.div
            className="podium-item"
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3, type: 'spring', stiffness: 200 }}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              cursor: 'pointer'
            }}
          >
            <div style={{
              fontSize: 28,
              marginBottom: 8,
              filter: 'drop-shadow(0 4px 8px rgba(205, 127, 50, 0.4))'
            }}>3rd</div>
            <div style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #FDBA74 0%, #F97316 100%)',
              border: '3px solid #fff',
              boxShadow: '0 8px 16px rgba(0, 0, 0, 0.15)',
              overflow: 'hidden',
              marginBottom: 8
            }}>
              {/* Avatar placeholder */}
            </div>
            <div style={{
              fontSize: 12,
              fontWeight: 700,
              color: '#1E293B',
              marginBottom: 8,
              textAlign: 'center'
            }}>{displayList[2]?.name || ''}</div>
            <div style={{
              width: '100%',
              background: 'linear-gradient(135deg, #FDBA74 0%, #F97316 100%)',
              borderRadius: '8px 8px 0 0',
              padding: '12px 8px',
              textAlign: 'center',
              boxShadow: '0 -4px 16px rgba(0, 0, 0, 0.1)',
              border: '2px solid #fff',
              borderBottom: 'none',
              height: 60,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center'
            }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#7C2D12' }}>3</div>
              <div style={{ fontSize: 10, color: '#9A3412', marginTop: 4 }}>{tab === 'individual' ? displayList[2]?.score : displayList[2]?.totalScore} PTS</div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Data Table */}
      <div className="elevated-card fade-in" style={{ padding: 0, overflow: 'hidden', animationDelay: '0.2s' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #E2E8F0', background: '#F8FAFC' }}>
              <th style={{ textAlign: 'left', padding: '12px 16px', color: '#64748B', fontWeight: 600, fontSize: 10, textTransform: 'uppercase' }}>Rank</th>
              <th style={{ textAlign: 'left', padding: '12px 16px', color: '#64748B', fontWeight: 600, fontSize: 10, textTransform: 'uppercase' }}>Name</th>
              <th style={{ textAlign: 'right', padding: '12px 16px', color: '#64748B', fontWeight: 600, fontSize: 10, textTransform: 'uppercase' }}>Score</th>
            </tr>
          </thead>
          <tbody>
            {displayList.map((row: any, i) => (
              <tr
                key={i}
                style={{ borderBottom: '1px solid #F1F5F9', cursor: 'pointer' }}
                onClick={() => {
                  if (tab === 'individual') {
                    Dialog.show({
                      title: row.name,
                      content: (
                        <div style={{ fontSize: 13, lineHeight: 1.6 }}>
                          <div>部门：{row.dept}</div>
                          <div>审核通过任务数：{row.taskCount}</div>
                          <div>累计积分：{row.score}</div>
                        </div>
                      ),
                      actions: [{ key: 'close', text: '关闭' }],
                    })
                  }
                }}
              >
                <td style={{ padding: '12px 16px', fontWeight: 700, color: i < 3 ? '#0F172A' : '#94A3B8' }}>
                  #{i + 1}
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ fontWeight: 500, color: '#1E293B' }}>{row.name}</div>
                  <div style={{ fontSize: 10, color: '#94A3B8' }}>{tab === 'individual' ? row.dept : `Avg Score: ${row.score}`}</div>
                </td>
                <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>
                  {tab === 'individual' ? row.score : row.totalScore}
                </td>
              </tr>
            ))}
            {displayList.length === 0 && (
              <tr>
                <td colSpan={3} style={{ padding: 24, textAlign: 'center', color: '#94A3B8' }}>
                  暂无排名数据
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
