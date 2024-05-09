import { Cursor } from "@hazae41/cursor";

export class Paths {

  constructor(
    readonly paths: number[]
  ) { }

  static from(path: string) {
    const paths = new Array<number>()

    for (const subpath of path.split("/")) {
      const value = subpath.endsWith("'")
        ? parseInt(subpath, 10) + 0x80_00_00_00
        : parseInt(subpath, 10)
      paths.push(value)
    }

    return new Paths(paths)
  }

  sizeOrThrow() {
    return 1 + (this.paths.length * 4)
  }

  writeOrThrow(cursor: Cursor) {
    cursor.writeUint8OrThrow(this.paths.length)

    for (const path of this.paths)
      cursor.writeUint32OrThrow(path)

    return
  }

}