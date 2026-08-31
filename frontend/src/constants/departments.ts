export const DEPARTMENTS = ['工程部', '审计部', '财务部', '设计院', '监理部', '管理层'] as const

export type Department = (typeof DEPARTMENTS)[number]

export const DEPARTMENT_OPTIONS = DEPARTMENTS.map((department) => ({
  label: department,
  value: department,
}))
