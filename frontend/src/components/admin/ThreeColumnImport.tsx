/**
 * 三列文本框快速导入组件
 * 支持从 Excel 直接粘贴任务列表
 */
import { useState, useEffect } from 'react'
import { Dialog, Form, Input, TextArea, Button, Toast, Tag } from 'antd-mobile'
import { useUsers } from '../../lib/api'
import { parseThreeColumnTasks, formatDate, type ParseResult } from '../../lib/task-parser'

interface ThreeColumnImportProps {
  visible: boolean
  onClose: () => void
  onSubmit: (data: any) => Promise<void>
}

export const ThreeColumnImport: React.FC<ThreeColumnImportProps> = ({ 
  visible, 
  onClose,
  onSubmit 
}) => {
  const [form] = Form.useForm()
  const { data: users = [] } = useUsers()
  
  const [tasksText, setTasksText] = useState('')
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [submitting, setSubmitting] = useState(false)
  
  // 实时解析
  useEffect(() => {
    if (!tasksText.trim()) {
      setParseResult(null)
      return
    }
    
    const projectStartDate = form.getFieldValue('startDate') || 
      new Date().toISOString().split('T')[0]
    
    const result = parseThreeColumnTasks(tasksText, users, projectStartDate)
    setParseResult(result)
  }, [tasksText, users, form])
  
  const handleSubmit = async (values: any) => {
    if (!parseResult || parseResult.validTasks === 0) {
      Toast.show({ icon: 'fail', content: '请输入有效的任务列表' })
      return
    }
    
    setSubmitting(true)
    try {
      // 构建任务数据
      const tasks = parseResult.tasks
        .filter(t => t.isValid)
        .map((t, index) => ({
          stage_name: t.taskName,
          assignees: t.matchedUser ? [t.matchedUser.id] : [values.manager],
          deadline: t.parsedDate ? formatDate(t.parsedDate) : values.deadline,
          priority: 'normal',
          sequence: (index + 1) * 1000
        }))
      
      // 收集所有负责人作为项目成员
      const memberIds = new Set<string>([values.manager])
      tasks.forEach(t => t.assignees.forEach(id => memberIds.add(id)))
      
      await onSubmit({
        projectName: values.projectName,
        projectCode: values.projectCode,
        manager: values.manager,
        startDate: values.startDate,
        deadline: values.deadline,
        tasks,
        members: Array.from(memberIds)
      })
      
      Toast.show({ 
        icon: 'success', 
        content: `项目创建成功！已添加 ${tasks.length} 个任务` 
      })
      onClose()
      form.resetFields()
      setTasksText('')
    } catch (error: any) {
      Toast.show({ icon: 'fail', content: error.message || '创建失败' })
    } finally {
      setSubmitting(false)
    }
  }
  
  return (
    <Dialog
      visible={visible}
      title="🚀 快速创建项目"
      bodyStyle={{ maxHeight: '80vh', overflow: 'auto' }}
      content={
        <Form form={form} onFinish={handleSubmit} layout="vertical">
          {/* 项目信息 */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>
              📋 项目信息
            </div>
            
            <Form.Item 
              name="projectName" 
              label="项目名称"
              rules={[{ required: true, message: '请输入项目名称' }]}
            >
              <Input placeholder="如：凤凰山跨海大桥工程" />
            </Form.Item>
            
            <Form.Item name="projectCode" label="项目编号">
              <Input placeholder="如：ENG-2026-001（可选）" />
            </Form.Item>
            
            <Form.Item 
              name="manager" 
              label="项目经理"
              rules={[{ required: true, message: '请选择项目经理' }]}
            >
              <select style={{ 
                width: '100%', 
                padding: '8px 12px', 
                borderRadius: 8,
                border: '1px solid #E2E8F0',
                fontSize: 14
              }}>
                <option value="">请选择</option>
                {users
                  .filter(u => u.role === 'admin' || u.role === 'manager')
                  .map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
              </select>
            </Form.Item>
            
            <div style={{ display: 'flex', gap: 12 }}>
              <Form.Item 
                name="startDate" 
                label="开始日期" 
                style={{ flex: 1 }}
                rules={[{ required: true, message: '请选择开始日期' }]}
              >
                <Input type="date" />
              </Form.Item>
              
              <Form.Item 
                name="deadline" 
                label="截止日期" 
                style={{ flex: 1 }}
                rules={[{ required: true, message: '请选择截止日期' }]}
              >
                <Input type="date" />
              </Form.Item>
            </div>
          </div>
          
          {/* 任务列表 */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>
              📝 批量导入任务
            </div>
            
            {/* 格式说明 */}
            <div style={{ 
              background: '#F0F9FF', 
              padding: 12, 
              borderRadius: 8,
              marginBottom: 12,
              fontSize: 12,
              lineHeight: 1.6
            }}>
              <div style={{ fontWeight: 600, marginBottom: 4, color: '#0369A1' }}>
                📌 格式说明（每行一个任务，用 Tab 或多个空格分隔）
              </div>
              <div style={{ color: '#64748B' }}>
                • <strong>第1列</strong>: 任务名称（必填）<br/>
                • <strong>第2列</strong>: 负责人（姓名/用户名/邮箱，可选）<br/>
                • <strong>第3列</strong>: 截止日期（可选）
              </div>
              <div style={{ 
                marginTop: 8, 
                padding: 8, 
                background: 'white',
                borderRadius: 4,
                fontFamily: 'monospace',
                fontSize: 11
              }}>
                示例:<br/>
                图纸审核&nbsp;&nbsp;&nbsp;&nbsp;李审计&nbsp;&nbsp;&nbsp;&nbsp;2026-02-20<br/>
                材料送检&nbsp;&nbsp;&nbsp;&nbsp;刘工程师&nbsp;&nbsp;2/25<br/>
                基础施工&nbsp;&nbsp;&nbsp;&nbsp;赵工长&nbsp;&nbsp;&nbsp;&nbsp;+7
              </div>
              <div style={{ marginTop: 8, color: '#64748B' }}>
                <strong>日期格式支持</strong>: 2026-02-20 | 02-20 | 2/20 | +7天 | +2w周 | 2月20日
              </div>
            </div>
            
            {/* 文本框 */}
            <TextArea
              value={tasksText}
              onChange={setTasksText}
              placeholder="图纸审核    李审计    2026-02-20&#10;材料送检    刘工程师  2/25&#10;基础施工    赵工长    +7"
              rows={10}
              style={{ 
                fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                fontSize: 13,
                lineHeight: 1.8,
                letterSpacing: 0.5
              }}
            />
            
            {/* 解析结果 */}
            {parseResult && (
              <div style={{ marginTop: 12 }}>
                {/* 统计信息 */}
                <div style={{ 
                  display: 'flex', 
                  gap: 8, 
                  marginBottom: 8,
                  flexWrap: 'wrap'
                }}>
                  <Tag color="primary">
                    ✓ {parseResult.validTasks} 个有效任务
                  </Tag>
                  {parseResult.errors.length > 0 && (
                    <Tag color="danger">
                      ✗ {parseResult.errors.length} 个错误
                    </Tag>
                  )}
                  {parseResult.warnings.length > 0 && (
                    <Tag color="warning">
                      ⚠ {parseResult.warnings.length} 个警告
                    </Tag>
                  )}
                </div>
                
                {/* 详细信息 */}
                {parseResult.tasks.length > 0 && (
                  <div style={{ 
                    maxHeight: 200, 
                    overflow: 'auto',
                    border: '1px solid #E2E8F0',
                    borderRadius: 8,
                    fontSize: 12
                  }}>
                    {parseResult.tasks.map((task, index) => (
                      <div 
                        key={index}
                        style={{ 
                          padding: '8px 12px',
                          borderBottom: index < parseResult.tasks.length - 1 ? '1px solid #F1F5F9' : 'none',
                          background: task.isValid ? 'white' : '#FEF2F2'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ 
                            color: task.isValid ? '#10B981' : '#EF4444',
                            fontWeight: 600 
                          }}>
                            {task.isValid ? '✓' : '✗'}
                          </span>
                          <span style={{ fontWeight: 600 }}>
                            {task.taskName}
                          </span>
                          {task.matchedUser && (
                            <Tag color="success" style={{ fontSize: 11 }}>
                              {task.matchedUser.name}
                            </Tag>
                          )}
                          {task.parsedDate && (
                            <Tag color="default" style={{ fontSize: 11 }}>
                              {formatDate(task.parsedDate)}
                            </Tag>
                          )}
                        </div>
                        {task.warnings.length > 0 && (
                          <div style={{ color: '#F59E0B', fontSize: 11, marginTop: 4 }}>
                            ⚠ {task.warnings.join(', ')}
                          </div>
                        )}
                        {task.errors.length > 0 && (
                          <div style={{ color: '#EF4444', fontSize: 11, marginTop: 4 }}>
                            ✗ {task.errors.join(', ')}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </Form>
      }
      actions={[
        {
          key: 'cancel',
          text: '取消',
          onClick: onClose
        },
        {
          key: 'submit',
          text: parseResult 
            ? `创建项目 (${parseResult.validTasks}个任务)` 
            : '创建项目',
          bold: true,
          disabled: !parseResult || parseResult.validTasks === 0 || submitting,
          onClick: () => form.submit()
        }
      ]}
    />
  )
}


