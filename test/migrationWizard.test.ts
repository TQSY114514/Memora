import { describe, it, expect } from 'vitest'
import {
  getSupportedPlatforms,
  getDefaultMigrationConfig,
  getStepLabel,
  getStepDescription,
  formatDuration
} from '../src/migration/migrationWizard'

describe('migrationWizard', () => {
  describe('getSupportedPlatforms', () => {
    it('returns 7 platforms each with required fields', () => {
      const platforms = getSupportedPlatforms()
      expect(platforms).toHaveLength(7)
      for (const p of platforms) {
        expect(typeof p.id).toBe('string')
        expect(p.id.length).toBeGreaterThan(0)
        expect(typeof p.name).toBe('string')
        expect(p.name.length).toBeGreaterThan(0)
        expect(typeof p.icon).toBe('string')
        expect(p.icon.length).toBeGreaterThan(0)
        expect(Array.isArray(p.formats)).toBe(true)
        expect(typeof p.supportsSync).toBe('boolean')
      }
    })
  })

  describe('getDefaultMigrationConfig', () => {
    it('returns default config with empty selectedPlatforms and syncDirection import', () => {
      const config = getDefaultMigrationConfig()
      expect(config.selectedPlatforms).toEqual([])
      expect(config.syncDirection).toBe('import')
      expect(config.includeArchived).toBe(false)
      expect(config.enableSync).toBe(false)
      expect(config.dateRange).toBeNull()
    })
  })

  describe('getStepLabel', () => {
    it("detect -> '检测平台'", () => {
      expect(getStepLabel('detect')).toBe('检测平台')
    })

    it("select -> '选择数据'", () => {
      expect(getStepLabel('select')).toBe('选择数据')
    })

    it("migrate -> '开始迁移'", () => {
      expect(getStepLabel('migrate')).toBe('开始迁移')
    })
  })

  describe('getStepDescription', () => {
    it('returns a non-empty string for all three steps', () => {
      const detect = getStepDescription('detect')
      const select = getStepDescription('select')
      const migrate = getStepDescription('migrate')
      expect(typeof detect).toBe('string')
      expect(detect.length).toBeGreaterThan(0)
      expect(typeof select).toBe('string')
      expect(select.length).toBeGreaterThan(0)
      expect(typeof migrate).toBe('string')
      expect(migrate.length).toBeGreaterThan(0)
    })
  })

  describe('formatDuration', () => {
    it("returns 'Xms' when ms < 1000", () => {
      expect(formatDuration(0)).toBe('0ms')
      expect(formatDuration(1)).toBe('1ms')
      expect(formatDuration(500)).toBe('500ms')
      expect(formatDuration(999)).toBe('999ms')
    })

    it("returns 'X秒' when ms < 60000", () => {
      expect(formatDuration(1000)).toBe('1秒')
      expect(formatDuration(59000)).toBe('59秒')
      expect(formatDuration(1500)).toBe('1秒')
    })

    it("returns 'X分X秒' when ms >= 60000", () => {
      expect(formatDuration(60000)).toBe('1分0秒')
      expect(formatDuration(65000)).toBe('1分5秒')
      expect(formatDuration(125000)).toBe('2分5秒')
      expect(formatDuration(3600000)).toBe('60分0秒')
    })
  })
})
