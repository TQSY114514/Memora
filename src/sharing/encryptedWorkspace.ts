import { encrypt, decrypt, sha256, type EncryptedPackage } from '../crypto/e2e'
import { renderMemoryToMMF } from './mmfExporter'
import { parseMMF, importMMF } from './mmfImporter'
import type { MMFFile } from './mmfExporter'
import type { MMFImportResult } from '@shared/types'

/**
 * 端到端加密的工作区共享
 *
 * 复用 MMF（Memora Memory Format）作为可移植载体，在其外层叠加 E2E 加密，
 * 使共享工作区在传输/落盘时既携带完整记忆数据（偏好、宪法、知识、审计日志），
 * 又保证只有持有正确密码的接收方才能解密还原。
 *
 * 导出流程：渲染 MMF → 加密 → 得到 EncryptedPackage（可安全落盘/传输）
 * 导入流程：解析 EncryptedPackage → 解密 → parseMMF 校验 → 导入目标工作区
 */

/** 共享工作区导出载荷（打包后的 MMF 内容 + 元信息） */
export interface EncryptedSharedWorkspace {
  /** 外层加密包 */
  package: EncryptedPackage
  /** 工作区元信息（明文，便于导入前快速识别） */
  workspace: { id: string; name: string }
  /** 载荷类型标识 */
  format: 'memora-shared-workspace'
  /** 校验和（加密前 MMF 原文的 SHA-256，用于解密后完整性校验） */
  checksum: string
}

/**
 * 端到端加密导出工作区
 *
 * @param data 需要导出的工作区记忆数据
 * @param password 加密密码（接收方需用同一密码解密）
 * @returns 可安全传输/落盘的加密共享工作区载荷
 */
export function encryptSharedWorkspace(
  data: {
    workspace: { id: string; name: string }
    preferences: MMFFile['preferences']
    constitution: MMFFile['constitution']
    knowledge: MMFFile['knowledge']
    auditLogs: MMFFile['auditLogs']
  },
  password: string
): EncryptedSharedWorkspace {
  const mmfJson = renderMemoryToMMF(data)
  const encrypted = encrypt(mmfJson, password)
  return {
    format: 'memora-shared-workspace',
    package: encrypted,
    workspace: data.workspace,
    checksum: sha256(mmfJson)
  }
}

/**
 * 解密并校验共享工作区载荷
 *
 * @param payload 加密共享载荷
 * @param password 解密密码
 * @returns 解密后的 MMF 文件对象
 * @throws 密码错误、格式不合法或校验和不匹配时抛出
 */
export function decryptSharedWorkspace(
  payload: EncryptedSharedWorkspace,
  password: string
): MMFFile {
  if (payload.format !== 'memora-shared-workspace') {
    throw new Error('载荷格式错误：不是 memora-shared-workspace')
  }

  const decrypted = decrypt(payload.package, password)
  if (sha256(decrypted) !== payload.checksum) {
    throw new Error('校验和不匹配：载荷可能在传输中被篡改或损坏')
  }
  return parseMMF(decrypted)
}

/**
 * 解密并导入共享工作区到目标工作区
 *
 * @param payload 加密共享载荷
 * @param password 解密密码
 * @param targetWorkspaceId 目标工作区 ID
 * @returns 导入统计结果
 */
export function importSharedWorkspace(
  payload: EncryptedSharedWorkspace,
  password: string,
  targetWorkspaceId: string
): MMFImportResult {
  const file = decryptSharedWorkspace(payload, password)
  return importMMF(file, targetWorkspaceId)
}