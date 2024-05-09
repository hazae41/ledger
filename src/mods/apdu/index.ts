import { ApduRequestInit, ApduResponse } from "@hazae41/apdu";
import { Opaque, Writable } from "@hazae41/binary";

export interface Connector {
  requestOrThrow<T extends Writable>(init: ApduRequestInit<T>): Promise<ApduResponse<Opaque>>
}