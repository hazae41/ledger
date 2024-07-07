import { Empty, Opaque, Readable, Writable } from "@hazae41/binary";
import type { Uint8Array } from "@hazae41/bytes";
import { Bytes } from "@hazae41/bytes";
import { Rlp, RsvSignature } from "@hazae41/cubane";
import { Cursor } from "@hazae41/cursor";
import { Result } from "@hazae41/result";
import { Connector } from "../apdu/index.js";
import { Paths } from "../binary/paths.js";

export interface AppConfigResult {
  readonly arbitraryDataEnabled: boolean,

  readonly erc20ProvisioningNecessary: boolean,

  readonly starkEnabled: boolean,

  readonly starkv2Supported: boolean,

  readonly version: string
}

export async function tryGetAppConfig(device: Connector): Promise<Result<AppConfigResult, Error>> {
  return await Result.runAndDoubleWrap(() => getAppConfigOrThrow(device))
}

export async function getAppConfigOrThrow(device: Connector): Promise<AppConfigResult> {
  const request = { cla: 0xe0, ins: 0x06, p1: 0x00, p2: 0x00, fragment: new Empty() }
  const response = await device.requestOrThrow(request).then(r => r.unwrap().bytes)

  const arbitraryDataEnabled = Boolean(response[0] & 0x01)
  const erc20ProvisioningNecessary = Boolean(response[0] & 0x02)
  const starkEnabled = Boolean(response[0] & 0x04)
  const starkv2Supported = Boolean(response[0] & 0x08)

  const version = `${response[1]}.${response[2]}.${response[3]}`

  return { arbitraryDataEnabled, erc20ProvisioningNecessary, starkEnabled, starkv2Supported, version }
}

export interface GetAddressResult {
  /**
   * 0x-prefixed hex address
   */
  readonly address: string

  /**
   * Raw uncompressed public key bytes
   */
  readonly uncompressedPublicKey: Uint8Array

  /**
   * Raw chaincode bytes
   */
  readonly chaincode: Uint8Array<32>
}

/**
 * Just get the address
 * @param device 
 * @param path 
 * @returns 
 */
export async function tryGetAddress(device: Connector, path: string): Promise<Result<GetAddressResult, Error>> {
  return await Result.runAndDoubleWrap(() => getAddressOrThrow(device, path))
}

/**
 * Just get the address
 * @param device 
 * @param path 
 * @returns 
 */
export async function getAddressOrThrow(device: Connector, path: string): Promise<GetAddressResult> {
  const paths = Paths.from(path)

  const bytes = Writable.writeToBytesOrThrow(paths)

  const request = { cla: 0xe0, ins: 0x02, p1: 0x00, p2: 0x01, fragment: new Opaque(bytes) }
  const response = await device.requestOrThrow(request).then(r => r.unwrap().bytes)

  const cursor = new Cursor(response)

  const uncompressedPublicKeyLength = cursor.readUint8OrThrow()
  const uncompressedPublicKey = cursor.readAndCopyOrThrow(uncompressedPublicKeyLength)

  const addressLength = cursor.readUint8OrThrow()
  const address = `0x${Bytes.toAscii(cursor.readOrThrow(addressLength))}`

  const chaincode = cursor.readAndCopyOrThrow(32)

  return { uncompressedPublicKey, address, chaincode }
}

/**
 * Ask the user to verify the address and get it
 * @param device 
 * @param path 
 * @returns 
 */
export async function tryVerifyAndGetAddress(device: Connector, path: string): Promise<Result<GetAddressResult, Error>> {
  return await Result.runAndDoubleWrap(() => verifyAndGetAddressOrThrow(device, path))
}

/**
 * Ask the user to verify the address and get it
 * @param device 
 * @param path 
 * @returns 
 */
export async function verifyAndGetAddressOrThrow(device: Connector, path: string): Promise<GetAddressResult> {
  const paths = Paths.from(path)

  const bytes = Writable.writeToBytesOrThrow(paths)

  const request = { cla: 0xe0, ins: 0x02, p1: 0x01, p2: 0x01, fragment: new Opaque(bytes) }
  const response = await device.requestOrThrow(request).then(r => r.unwrap().bytes)

  const cursor = new Cursor(response)

  const uncompressedPublicKeyLength = cursor.readUint8OrThrow()
  const uncompressedPublicKey = cursor.readAndCopyOrThrow(uncompressedPublicKeyLength)

  const addressLength = cursor.readUint8OrThrow()
  const address = `0x${Bytes.toAscii(cursor.readOrThrow(addressLength))}`

  const chaincode = cursor.readAndCopyOrThrow(32)

  return { uncompressedPublicKey, address, chaincode }
}

export async function trySignPersonalMessage(device: Connector, path: string, message: Uint8Array): Promise<Result<RsvSignature, Error>> {
  return await Result.runAndDoubleWrap(() => signPersonalMessageOrThrow(device, path, message))
}

export async function signPersonalMessageOrThrow(device: Connector, path: string, message: Uint8Array): Promise<RsvSignature> {
  const paths = Paths.from(path)

  const reader = new Cursor(message)

  let response: Uint8Array

  {
    const head = paths.sizeOrThrow() + 4
    const body = Math.min(150 - head, reader.remaining)

    const chunk = reader.readOrThrow(body)

    const writer = new Cursor(new Uint8Array(head + body))
    paths.writeOrThrow(writer)
    writer.writeUint32OrThrow(message.length)
    writer.writeOrThrow(chunk)

    const request = { cla: 0xe0, ins: 0x08, p1: 0x00, p2: 0x00, fragment: new Opaque(writer.bytes) }
    response = await device.requestOrThrow(request).then(r => r.unwrap().bytes)
  }

  while (reader.remaining) {
    const body = Math.min(150, reader.remaining)
    const chunk = reader.readOrThrow(body)

    const request = { cla: 0xe0, ins: 0x08, p1: 0x80, p2: 0x00, fragment: new Opaque(chunk) }
    response = await device.requestOrThrow(request).then(r => r.unwrap().bytes)
  }

  const cursor = new Cursor(response)
  const v = cursor.readUint8OrThrow() - 27
  const r = cursor.readAndCopyOrThrow(32)
  const s = cursor.readAndCopyOrThrow(32)

  return RsvSignature.create({ r, s, v })
}

/**
 * Get the unprotected part of a legacy replay-protected transaction
 * @param transaction 
 * @returns 
 */
function readLegacyUnprotectedOrThrow(transaction: Uint8Array) {
  /**
   * This is not a legacy transaction (EIP-2718)
   */
  if (transaction[0] < 0x80)
    return undefined

  /**
   * Decode the bytes as RLP
   */
  const rlp = Readable.readFromBytesOrThrow(Rlp, transaction).intoOrThrow()

  if (!Array.isArray(rlp))
    throw new Error(`Wrong RLP type for transaction`)

  /**
   * This is not a replay-protected transaction (EIP-155)
   */
  if (rlp.length !== 9)
    return undefined

  /**
   * Take only the first 6 parameters instead of the 9
   */
  const [nonce, gasprice, startgas, to, value, data] = rlp

  /**
   * Encode them as RLP
   */
  return Writable.writeToBytesOrThrow(Rlp.fromOrThrow([nonce, gasprice, startgas, to, value, data]))
}

export async function trySignTransaction(device: Connector, path: string, transaction: Uint8Array): Promise<Result<RsvSignature, Error>> {
  return await Result.runAndDoubleWrap(() => signTransactionOrThrow(device, path, transaction))
}

export async function signTransactionOrThrow(device: Connector, path: string, transaction: Uint8Array): Promise<RsvSignature> {
  const paths = Paths.from(path)

  const reader = new Cursor(transaction)

  const unprotected = readLegacyUnprotectedOrThrow(transaction)

  let response: Uint8Array

  {
    const head = paths.sizeOrThrow()

    let body = Math.min(150 - head, reader.remaining)

    /**
     * Make sure that the chunk doesn't end right on the replay protection marker (EIP-155)
     * If it goes further than the unprotected part, then send the (few) remaining bytes of the protection
     */
    if (unprotected != null && reader.offset + body >= unprotected.length)
      body = reader.remaining

    const chunk = reader.readOrThrow(body)

    const writer = new Cursor(new Uint8Array(head + body))
    paths.writeOrThrow(writer)
    writer.writeOrThrow(chunk)

    const request = { cla: 0xe0, ins: 0x04, p1: 0x00, p2: 0x00, fragment: new Opaque(writer.bytes) }
    response = await device.requestOrThrow(request).then(r => r.unwrap().bytes)
  }

  while (reader.remaining) {
    let body = Math.min(150, reader.remaining)

    /**
     * Make sure that the chunk doesn't end right on the replay protection marker (EIP-155)
     * If it goes further than the unprotected part, then send the (few) remaining bytes of the protection
     */
    if (unprotected != null && reader.offset + body >= unprotected.length)
      body = reader.remaining

    const chunk = reader.readOrThrow(body)

    const request = { cla: 0xe0, ins: 0x04, p1: 0x80, p2: 0x00, fragment: new Opaque(chunk) }
    response = await device.requestOrThrow(request).then(r => r.unwrap().bytes)
  }

  const cursor = new Cursor(response)
  const v = cursor.readUint8OrThrow()
  const r = cursor.readAndCopyOrThrow(32)
  const s = cursor.readAndCopyOrThrow(32)

  // if ((((chainId * 2) + 35) + 1) > 255) {
  //   const parity = Math.abs(v0 - (((chainId * 2) + 35) % 256))

  //   if (transaction.type == null)
  //     v = ((chainId * 2) + 35) + parity
  //   else
  //     v = (parity % 2) == 1 ? 0 : 1;
  // }

  return RsvSignature.create({ r, s, v })
}

export async function trySignEIP712HashedMessage(device: Connector, path: string, domain: Uint8Array<32>, message: Uint8Array<32>): Promise<Result<RsvSignature, Error>> {
  return await Result.runAndDoubleWrap(() => signEIP712HashedMessageOrThrow(device, path, domain, message))
}

export async function signEIP712HashedMessageOrThrow(device: Connector, path: string, domain: Uint8Array<32>, message: Uint8Array<32>): Promise<RsvSignature> {
  const paths = Paths.from(path)

  const writer = new Cursor(new Uint8Array(paths.sizeOrThrow() + 32 + 32))
  paths.writeOrThrow(writer)
  writer.writeOrThrow(domain)
  writer.writeOrThrow(message)

  const request = { cla: 0xe0, ins: 0x0c, p1: 0x00, p2: 0x00, fragment: new Opaque(writer.bytes) }
  const response = await device.requestOrThrow(request).then(r => r.unwrap().bytes)

  const reader = new Cursor(response)
  const v = reader.readUint8OrThrow() - 27
  const r = reader.readAndCopyOrThrow(32)
  const s = reader.readAndCopyOrThrow(32)

  return RsvSignature.create({ r, s, v })
}