import { ApduRequest, ApduRequestInit, ApduResponse } from "@hazae41/apdu"
import { Opaque, Readable, Writable } from "@hazae41/binary"
import { Bytes } from "@hazae41/bytes"
import { HidContainer, HidFrame } from "../hid/index.js"

export const VENDOR_ID = 0x2c97
export const PACKET_SIZE = 64

export class DeviceInterfaceNotFoundError extends Error {
  readonly #class = DeviceInterfaceNotFoundError
  readonly name = this.#class.name

  constructor(options?: ErrorOptions) {
    super(`Could not find device interface`, options)
  }

  static from(cause: unknown) {
    return new DeviceInterfaceNotFoundError({ cause })
  }
}

export class DeviceTransferOutError extends Error {
  readonly #class = DeviceTransferOutError
  readonly name = this.#class.name

  constructor(options?: ErrorOptions) {
    super(`Could not transfer data to device`, options)
  }

  static from(cause: unknown) {
    return new DeviceTransferOutError({ cause })
  }
}

export class DeviceTransferInError extends Error {
  readonly #class = DeviceTransferInError
  readonly name = this.#class.name

  constructor(options?: ErrorOptions) {
    super(`Could not transfer data from device`, options)
  }

  static from(cause: unknown) {
    return new DeviceTransferInError({ cause })
  }
}

export async function getDevicesOrThrow() {
  const devices = await navigator.usb.getDevices()
  return devices.filter(x => x.vendorId === VENDOR_ID)
}

export async function getOrRequestDeviceOrThrow() {
  const devices = await getDevicesOrThrow()
  const device = devices[0]

  if (device != null)
    return device

  return await navigator.usb.requestDevice({ filters: [{ vendorId: VENDOR_ID }] })
}

export async function connectOrThrow(device: USBDevice) {
  await device.open()

  if (device.configuration == null)
    await device.selectConfiguration(1)

  await device.reset()

  const iface = device.configurations[0].interfaces.find(({ alternates }) => alternates.some(x => x.interfaceClass === 255))

  if (iface == null)
    throw new DeviceInterfaceNotFoundError()

  await device.claimInterface(iface.interfaceNumber)

  return new Connector(device, iface)
}

export class Connector {
  readonly #channel = Math.floor(Math.random() * 0xffff)

  constructor(
    readonly device: USBDevice,
    readonly iface: USBInterface
  ) { }

  async #transferOutOrThrow(frame: HidFrame<Opaque>): Promise<void> {
    await this.device.transferOut(3, Writable.writeToBytesOrThrow(frame))
  }

  async #transferInOrThrow(length: number): Promise<HidFrame<Opaque>> {
    const result = await this.device.transferIn(3, length)

    if (result.data == null)
      throw new DeviceTransferInError()

    const bytes = Bytes.fromView(result.data)
    const frame = Readable.readFromBytesOrThrow(HidFrame, bytes)

    return frame
  }

  async #sendOrThrow<T extends Writable>(fragment: T): Promise<void> {
    const container = HidContainer.newOrThrow(fragment)
    const bytes = Writable.writeToBytesOrThrow(container)

    const frames = HidFrame.splitOrThrow(this.#channel, bytes)

    let frame = frames.next()

    for (; !frame.done; frame = frames.next())
      await this.#transferOutOrThrow(frame.value)

    return frame.value
  }

  async *#receiveOrThrow(): AsyncGenerator<HidFrame<Opaque>, never, unknown> {
    while (true)
      yield await this.#transferInOrThrow(64)
  }

  async requestOrThrow<T extends Writable>(init: ApduRequestInit<T>): Promise<ApduResponse<Opaque>> {
    const request = ApduRequest.fromOrThrow(init)
    await this.#sendOrThrow(request)

    const bytes = await HidFrame.unsplitOrThrow(this.#channel, this.#receiveOrThrow())
    const response = Readable.readFromBytesOrThrow(ApduResponse, bytes)

    return response
  }

}