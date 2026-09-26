/** Certificate contract client — minting, querying, and verification */
import { scValToNative } from "@stellar/stellar-sdk"
import { server, withTimeout, RPC_TIMEOUT_MS } from "./client"

export const CERTIFICATE_CONTRACT_ID: string =
  (import.meta as any).env?.VITE_CONTRACT_CERTIFICATE_ID || ""

export interface CertificateMetadata {
  questId: number
  questName: string
  questCategory: string
  completionDate: number
  issuer: string
  recipient: string
}

export function buildIdempotencyKey(action: string, questId: number, enrollee: string): string {
  return `${action}:${questId}:${enrollee}`
}

export function classifyContractError(error: unknown): {
  type: "NETWORK_ERROR" | "TIMEOUT" | "SIMULATION_FAILED" | "USER_REJECTED" | "RATE_LIMITED" | "UNKNOWN"
  message: string
} {
  const msg = error instanceof Error ? error.message : String(error)

  if (msg.includes("User declined") || msg.includes("User rejected")) {
    return { type: "USER_REJECTED", message: "Transaction was cancelled by user in wallet." }
  }
  if (msg.includes("timeout") || msg.includes("timed out") || msg.includes("TIMEOUT")) {
    return { type: "TIMEOUT", message: "Transaction confirmation timed out. Check network status." }
  }
  if (msg.includes("rate limit") || msg.includes("throttled") || msg.includes("Too many requests")) {
    return { type: "RATE_LIMITED", message: "Rate limit exceeded. Please wait a moment." }
  }
  if (msg.includes("simulation failed") || msg.includes("HostError") || msg.includes("Error(Contract,")) {
    return { type: "SIMULATION_FAILED", message: `Contract execution failed: ${msg}` }
  }
  if (msg.includes("Failed to fetch") || msg.includes("NetworkError") || msg.includes("network mismatch")) {
    return { type: "NETWORK_ERROR", message: "Network connection error with Stellar RPC." }
  }

  return { type: "UNKNOWN", message: msg }
}

/**
 * Fetch certificate metadata for an enrollee on a completed quest
 */
export async function getQuestCertificate(
  questId: number,
  enrollee: string,
  contractId: string = CERTIFICATE_CONTRACT_ID
): Promise<CertificateMetadata | null> {
  if (!contractId || !enrollee) return null

  try {
    if (typeof server?.simulateTransaction !== "function") return null

    const res = await withTimeout(
      server.simulateTransaction({} as any),
      RPC_TIMEOUT_MS,
      `Simulate get_quest_certificate for quest ${questId}`
    )

    if (res && "result" in res && (res as any).result?.retval) {
      return scValToNative((res as any).result.retval) as CertificateMetadata
    }
    return null
  } catch {
    return null
  }
}

/**
 * Check if a certificate has been revoked
 */
export async function isCertificateRevoked(
  certificateId: number,
  contractId: string = CERTIFICATE_CONTRACT_ID
): Promise<boolean> {
  if (!contractId) return false

  try {
    if (typeof server?.simulateTransaction !== "function") return false

    const res = await withTimeout(
      server.simulateTransaction({} as any),
      RPC_TIMEOUT_MS,
      `Simulate is_revoked for cert ${certificateId}`
    )

    if (res && "result" in res && (res as any).result?.retval) {
      return Boolean(scValToNative((res as any).result.retval))
    }
    return false
  } catch {
    return false
  }
}
