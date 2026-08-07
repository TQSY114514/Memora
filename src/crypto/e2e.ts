/**
 * 端到端加密（E2EE）模块
 *
 * 使用 AES-256-GCM 加密 + PBKDF2 密钥派生，实现零知识加密同步。
 * 数据在本地加密后上传，云端无法解密。
 */
import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const SALT_LENGTH = 32
const KEY_LENGTH = 32
const PBKDF2_ITERATIONS = 600_000

/** 加密后的数据包格式 */
export interface EncryptedPackage {
  /** 加密后的数据（Base64） */
  ciphertext: string
  /** IV（Base64） */
  iv: string
  /** 认证标签（Base64） */
  authTag: string
  /** PBKDF2 盐值（Base64） */
  salt: string
  /** 加密时间戳 */
  encryptedAt: string
}

/** 从密码派生加密密钥（iterations 可注入，测试可传小值避免超时；生产走默认 600k） */
export function deriveKey(password: string, salt: Buffer, iterations: number = PBKDF2_ITERATIONS): Buffer {
  return crypto.pbkdf2Sync(password, salt, iterations, KEY_LENGTH, 'sha512')
}

/** 生成随机盐值 */
export function generateSalt(): Buffer {
  return crypto.randomBytes(SALT_LENGTH)
}

/** 加密数据 */
export function encrypt(data: string, password: string, iterations: number = PBKDF2_ITERATIONS): EncryptedPackage {
  const salt = generateSalt()
  const key = deriveKey(password, salt, iterations)
  const iv = crypto.randomBytes(IV_LENGTH)

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    salt: salt.toString('base64'),
    encryptedAt: new Date().toISOString()
  }
}

/** 解密数据（iterations 需与加密时一致，测试传小值避免超时） */
export function decrypt(pkg: EncryptedPackage, password: string, iterations: number = PBKDF2_ITERATIONS): string {
  const salt = Buffer.from(pkg.salt, 'base64')
  const key = deriveKey(password, salt, iterations)
  const iv = Buffer.from(pkg.iv, 'base64')
  const authTag = Buffer.from(pkg.authTag, 'base64')
  const ciphertext = Buffer.from(pkg.ciphertext, 'base64')

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return decrypted.toString('utf8')
}

/** 验证密码是否正确（尝试解密验证） */
export function verifyPassword(pkg: EncryptedPackage, password: string, iterations: number = PBKDF2_ITERATIONS): boolean {
  try {
    decrypt(pkg, password, iterations)
    return true
  } catch {
    return false
  }
}

/** 生成同步用的随机设备 ID */
export function generateDeviceId(): string {
  return crypto.randomBytes(16).toString('hex')
}

/** 计算数据的 SHA-256 哈希（用于增量同步比较） */
export function sha256(data: string): string {
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex')
}